'use client';
import { useState, useEffect, useRef } from 'react';
import { Mic, Square, Volume2, VolumeX, MessageSquare } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

export default function VoiceAgent({ slug = 'yo-te-cuido', parentInstructions = '' }) {
    const [active, setActive] = useState(false);
    const [muted, setMuted] = useState(true);
    const [status, setStatus] = useState('Ready');
    const [messages, setMessages] = useState([]);
    const [duration, setDuration] = useState(0);
    const [config, setConfig] = useState(null);

    // Refs for holding mutable audio contexts and WebSockets without triggering re-renders
    const audioCtxRef = useRef(null);
    const outputAudioCtxRef = useRef(null);
    const wsRef = useRef(null);
    const streamRef = useRef(null);
    const processorRef = useRef(null);
    const nextAudioTimeRef = useRef(0);
    const timerRef = useRef(null);
    
    // Waveform visualization refs
    const canvasRef = useRef(null);
    const analyserRef = useRef(null);
    const rafRef = useRef(null);

    useEffect(() => {
        // Fetch config once on mount
        const fetchConfig = async () => {
            try {
                const res = await fetch(`/api/agent/${slug}/config`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ mode: 'customer', parent_app_instructions: parentInstructions })
                });
                const data = await res.json();
                setConfig(data);
            } catch (e) {
                console.error("Failed to load agent config", e);
            }
        };
        fetchConfig();

        return () => stopAgent();
    }, [slug, parentInstructions]);

    const addMessage = (role, text) => {
        setMessages(prev => [...prev, { id: uuidv4(), role, text, time: new Date() }]);
    };

    const toggleAgent = async () => {
        if (active) {
            stopAgent();
            return;
        }

        if (!config || config.error) {
            setStatus('Config Error');
            return;
        }

        // Initialize Audio Contexts immediately on user gesture
        if (!outputAudioCtxRef.current) {
            outputAudioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
        }
        if (!audioCtxRef.current) {
            audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
        }
        
        await outputAudioCtxRef.current.resume();
        await audioCtxRef.current.resume();
        setMuted(false);

        try {
            streamRef.current = await navigator.mediaDevices.getUserMedia({
                audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true }
            });
        } catch {
            setStatus('Mic Access Denied');
            return;
        }

        const src = audioCtxRef.current.createMediaStreamSource(streamRef.current);
        analyserRef.current = audioCtxRef.current.createAnalyser();
        analyserRef.current.fftSize = 256;
        src.connect(analyserRef.current);

        processorRef.current = audioCtxRef.current.createScriptProcessor(4096, 1, 1);
        src.connect(processorRef.current);
        processorRef.current.connect(audioCtxRef.current.destination);

        setStatus('Connecting...');
        
        const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${config.gemini_api_key}`;
        console.log('[SovereignAgent] Connecting WebSocket...');
        wsRef.current = new WebSocket(wsUrl);

        wsRef.current.onopen = () => {
            setStatus('Listening');
            setActive(true);
            setMessages([]);
            setDuration(0);
            
            timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
            drawViz();

            const setupMsg = {
                setup: {
                    model: 'models/gemini-live-2.5-flash-native-audio',
                    generationConfig: {
                        responseModalities: ['AUDIO'],
                        speechConfig: {
                            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } }
                        }
                    },
                    systemInstruction: { parts: [{ text: config.system_prompt }] }
                }
            };
            console.log('[SovereignAgent] Sending setup message...');
            wsRef.current.send(JSON.stringify(setupMsg));

            processorRef.current.onaudioprocess = (e) => {
                if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
                const inputData = e.inputBuffer.getChannelData(0);
                
                const pcm16 = new Int16Array(inputData.length);
                for (let i = 0; i < inputData.length; i++) {
                    let s = Math.max(-1, Math.min(1, inputData[i]));
                    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                }
                
                const buffer = new Uint8Array(pcm16.buffer);
                let binary = '';
                for (let i = 0; i < buffer.byteLength; i++) {
                    binary += String.fromCharCode(buffer[i]);
                }
                
                wsRef.current.send(JSON.stringify({
                    realtimeInput: { mediaChunks: [{ mimeType: 'audio/pcm;rate=16000', data: btoa(binary) }] }
                }));
            };

            // Initial kickoff
            wsRef.current.send(JSON.stringify({
                clientContent: { turns: [{ role: "user", parts: [{ text: "Hello! Begin." }] }], turnComplete: true }
            }));
        };

        wsRef.current.onmessage = async (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.serverContent?.modelTurn?.parts) {
                    let textBuffer = "";
                    for (const part of data.serverContent.modelTurn.parts) {
                        if (part.text) textBuffer += part.text;
                        if (part.inlineData?.data) {
                            const binaryString = atob(part.inlineData.data);
                            const bytes = new Uint8Array(binaryString.length);
                            for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
                            
                            try {
                                const audioBuffer = await outputAudioCtxRef.current.decodeAudioData(bytes.buffer);
                                const source = outputAudioCtxRef.current.createBufferSource();
                                source.buffer = audioBuffer;
                                source.connect(outputAudioCtxRef.current.destination);
                                
                                const currentTime = outputAudioCtxRef.current.currentTime;
                                if (nextAudioTimeRef.current < currentTime) {
                                    nextAudioTimeRef.current = currentTime;
                                }
                                source.start(nextAudioTimeRef.current);
                                nextAudioTimeRef.current += audioBuffer.duration;
                            } catch (e) {
                                console.error("Audio decode error:", e);
                            }
                        }
                    }
                    if (textBuffer.trim()) {
                        addMessage('agent', textBuffer.trim());
                        
                        // Parse intent
                        const bookMatch = textBuffer.match(/\[BOOK\]\s*(\{.*?\})/s);
                        if (bookMatch) {
                            try {
                                let book_data = JSON.parse(bookMatch[1]);
                                if (window.parent !== window) {
                                    window.parent.postMessage({ type: 'BOOK_APPOINTMENT', payload: book_data }, '*');
                                }
                            } catch(e) {}
                        }
                    }
                }
            } catch (e) { console.error("Message error:", e); }
        };

        wsRef.current.onerror = (err) => {
            console.error('[SovereignAgent] WebSocket error:', err);
            setStatus('Connection Error');
        };
        wsRef.current.onclose = (event) => {
            console.log('[SovereignAgent] WebSocket closed:', event.code, event.reason);
            if (active) stopAgent();
        };
    };

    const stopAgent = () => {
        setActive(false);
        setStatus('Ready');
        if (wsRef.current) wsRef.current.close();
        if (processorRef.current) processorRef.current.disconnect();
        if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
        if (timerRef.current) clearInterval(timerRef.current);
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        
        wsRef.current = null;
        processorRef.current = null;
        streamRef.current = null;
        timerRef.current = null;
        nextAudioTimeRef.current = 0;

        drawIdle();
    };

    const toggleSound = async () => {
        if (!outputAudioCtxRef.current) {
            outputAudioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
        }
        if (muted) {
            await outputAudioCtxRef.current.resume();
            setMuted(false);
        } else {
            await outputAudioCtxRef.current.suspend();
            setMuted(true);
        }
    };

    // --- Visualization Canvas Drawing ---
    const drawViz = () => {
        if (!analyserRef.current || !canvasRef.current || !active) return;
        const c = canvasRef.current;
        const ctx = c.getContext('2d');
        const w = c.width = c.offsetWidth * 2;
        const h = c.height = c.offsetHeight * 2;
        const len = analyserRef.current.frequencyBinCount;
        const data = new Uint8Array(len);

        const draw = () => {
            if (!active) return;
            rafRef.current = requestAnimationFrame(draw);
            analyserRef.current.getByteFrequencyData(data);
            ctx.clearRect(0, 0, w, h);
            const bw = (w / len) * 2.5;
            let x = 0;
            for (let i = 0; i < len; i++) {
                const v = data[i] / 255;
                const bh = v * h * 0.7;
                ctx.fillStyle = `rgba(139,92,246,${.2 + v * .8})`;
                ctx.beginPath();
                ctx.roundRect(x, (h - bh) / 2, bw - 2, bh || 2, 2);
                ctx.fill();
                x += bw;
            }
        };
        draw();
    };

    const drawIdle = () => {
        if (!canvasRef.current) return;
        const c = canvasRef.current;
        const ctx = c.getContext('2d');
        const w = c.width = c.offsetWidth * 2;
        const h = c.height = c.offsetHeight * 2;
        ctx.clearRect(0, 0, w, h);
        const n = 50, bw = w / n;
        for (let i = 0; i < n; i++) {
            ctx.fillStyle = 'rgba(139,92,246,.08)';
            ctx.beginPath();
            ctx.roundRect(i * bw + 1, (h - 2) / 2, bw - 3, 2, 1);
            ctx.fill();
        }
    };

    useEffect(() => {
        drawIdle();
    }, []);

    const formatTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

    return (
        <div className="flex flex-col h-screen text-mercury bg-obsidian font-sans p-6 overflow-hidden relative">
            {/* Ambient Background Orbs */}
            <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-violet-600/20 rounded-full blur-[120px] pointer-events-none" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none" />
            
            {/* Topbar */}
            <header className="flex justify-between items-center z-10 w-full max-w-5xl mx-auto clinical-panel p-4">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-violet-500/20 text-archytech-violet rounded-lg">
                        <Mic size={20} />
                    </div>
                    <div>
                        <h1 className="text-sm font-semibold tracking-wide">Sovereign Agent</h1>
                        <span className="text-xs text-archytech-violet/80 uppercase tracking-widest">Autonomous Interface</span>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <button onClick={toggleSound} className="text-gray-400 hover:text-white transition-colors">
                        {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                    </button>
                    <div className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-full border border-white/5">
                        <div className={`w-2 h-2 rounded-full ${active ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`} />
                        <span className="text-xs text-gray-300 uppercase tracking-wider font-medium">{status}</span>
                    </div>
                </div>
            </header>

            {/* Main Stage */}
            <main className="flex-1 flex w-full max-w-5xl mx-auto gap-6 mt-6 z-10 min-h-0">
                
                {/* Visualizer & Controls */}
                <section className="flex-1 clinical-panel flex flex-col items-center justify-center p-8 relative overflow-hidden">
                    <canvas ref={canvasRef} className="absolute inset-x-0 top-1/2 -translate-y-1/2 w-[120%] h-32 opacity-80" />
                    
                    <button 
                        onClick={toggleAgent}
                        className={`relative z-10 w-24 h-24 rounded-full flex items-center justify-center transition-panel
                            ${active 
                                ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30 ring-1 ring-red-500/50' 
                                : 'bg-archytech-violet text-mercury hover:scale-105 shadow-[0_0_40px_rgba(139,92,246,0.5)]'
                            }
                        `}
                    >
                        {active ? <Square fill="currentColor" size={32} /> : <Mic size={36} />}
                        {active && <div className="absolute inset-0 rounded-full border border-red-500/50 animate-ping opacity-50" />}
                    </button>

                    <p className="mt-8 text-gray-400 font-medium tracking-wide relative z-10">
                        {active ? 'Protocol Active' : 'Tap to Initiate Protocol'}
                    </p>
                    {active && (
                        <div className="absolute top-6 left-6 right-6 flex justify-between text-xs text-gray-500 tracking-widest uppercase items-center">
                            <span className="flex gap-2">Protocol Uptime: <span className="text-mercury font-mono">{formatTime(duration)}</span></span>
                            <span>{messages.length} Data Blocks</span>
                        </div>
                    )}
                </section>

                {/* Transcript */}
                <section className="w-80 clinical-panel flex flex-col overflow-hidden">
                    <div className="p-5 border-b border-white/5 flex items-center gap-2">
                        <MessageSquare size={16} className="text-gray-400" />
                        <span className="text-xs font-semibold uppercase tracking-widest text-gray-300">Live Transcript</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-5 pb-8 space-y-6 flex flex-col">
                        {messages.length === 0 ? (
                            <div className="m-auto text-center opacity-30">
                                <MessageSquare size={32} className="mx-auto mb-2" />
                                <p className="text-sm">Initiate protocol to begin</p>
                            </div>
                        ) : (
                            messages.map((m) => (
                                <div key={m.id} className={`flex flex-col max-w-[85%] ${m.role === 'customer' || m.role === 'user' ? 'self-end items-end' : 'self-start items-start'}`}>
                                    <span className="text-[10px] text-gray-500 uppercase tracking-widest mb-1 ml-1">
                                        {m.role === 'agent' ? 'AI' : 'Client'}
                                    </span>
                                    <div className={`p-3 rounded-2xl text-sm leading-relaxed ${
                                        m.role === 'agent' 
                                        ? 'bg-white/10 text-mercury rounded-tl-sm' 
                                        : 'bg-archytech-violet rounded-tr-sm text-mercury'
                                    }`}>
                                        {m.text}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </section>
            </main>
        </div>
    );
}
