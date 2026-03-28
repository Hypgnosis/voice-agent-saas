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
    const recognitionRef = useRef(null);
    const currentAgentTextRef = useRef('');
    const currentUserTextRef = useRef('');
    const chatEndRef = useRef(null);

    const logConversation = async (role, text) => {
        if (!text?.trim()) return;
        try {
            await fetch(`/api/agent/${slug}/log`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role, text, channel: 'iframe' })
            });
        } catch(e) { console.error("Log failed", e); }
    };

    const cleanTranscript = (text) => {
        if (!text) return '';
        return text
            .replace(/<thought>[\s\S]*?(?:<\/thought>|$)/gi, '')
            .replace(/\b(?:Thought|Thinking):\s*.+?(?=\n|$)/gi, '')
            .replace(/\[(EN|ES|FR|PT)\]/gi, '')
            .replace(/\[BOOK\]\s*(\{.*?\})?/gs, '')
            .trim();
    };

    const updateLastAgentMessage = (textChunk) => {
        currentAgentTextRef.current += textChunk;
        setMessages(prev => {
            const rawText = currentAgentTextRef.current;
            const cleanedText = cleanTranscript(rawText);
            
            if (prev.length === 0 || prev[prev.length - 1].role !== 'agent' || prev[prev.length - 1].status === 'final') {
                 return [...prev, { id: uuidv4(), role: 'agent', text: cleanedText, time: new Date() }];
            }
            const newMessages = [...prev];
            newMessages[newMessages.length - 1] = { ...newMessages[newMessages.length - 1], text: cleanedText };
            return newMessages;
        });
    };

    // Accumulate user input transcription into a single bubble (mirrors agent pattern)
    const updateLastUserMessage = (textChunk) => {
        currentUserTextRef.current += textChunk;
        const cleanedText = currentUserTextRef.current.trim();
        if (!cleanedText) return;
        setMessages(prev => {
            if (prev.length === 0 || prev[prev.length - 1].role !== 'user' || prev[prev.length - 1].status === 'final') {
                return [...prev, { id: uuidv4(), role: 'user', text: cleanedText, time: new Date() }];
            }
            const newMessages = [...prev];
            newMessages[newMessages.length - 1] = { ...newMessages[newMessages.length - 1], text: cleanedText };
            return newMessages;
        });
    };

    const finalizeUserMessage = () => {
        const cleanedText = currentUserTextRef.current.trim();
        if (cleanedText) {
            setMessages(prev => {
                if (prev.length === 0) return prev;
                const last = prev[prev.length - 1];
                if (last.role === 'user' && last.status !== 'final') {
                    const newMessages = [...prev];
                    newMessages[newMessages.length - 1] = { ...last, status: 'final', text: cleanedText };
                    return newMessages;
                }
                return prev;
            });
            logConversation('user', cleanedText);
        }
        currentUserTextRef.current = '';
    };

    const finalizeAgentMessage = () => {
        const rawText = currentAgentTextRef.current;
        const cleanedText = cleanTranscript(rawText);
        
        if (cleanedText) {
             setMessages(prev => {
                 if (prev.length === 0) return prev;
                 const last = prev[prev.length - 1];
                 if (last.role === 'agent' && last.status !== 'final') {
                     const newMessages = [...prev];
                     newMessages[newMessages.length - 1] = { ...last, status: 'final', text: cleanedText };
                     return newMessages;
                 }
                 return prev;
             });
             logConversation('agent', cleanedText);
        }
        currentAgentTextRef.current = ''; // Reset for next turn
    };

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

        // Track whether setup handshake is complete
        const setupCompleteRef = { current: false };

        // Helper: start streaming mic audio + kick off conversation
        const beginSession = () => {
            setStatus('Listening');
            setActive(true);
            setMessages([]);
            setDuration(0);
            
            timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
            drawViz();

            // Start streaming mic audio to Gemini
            processorRef.current.onaudioprocess = (e) => {
                if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || !setupCompleteRef.current) return;
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
                
                // Official API format: realtimeInput.audio (not mediaChunks)
                wsRef.current.send(JSON.stringify({
                    realtimeInput: { audio: { mimeType: 'audio/pcm', data: btoa(binary) } }
                }));
            };

            // Kickoff greeting
            console.log('[SovereignAgent] Session ready — sending kickoff...');
            wsRef.current.send(JSON.stringify({
                clientContent: { turns: [{ role: "user", parts: [{ text: "Hello! Begin." }] }], turnComplete: true }
            }));
        };

        wsRef.current.onopen = () => {
            // Step 1: ONLY send the setup message. Do NOT send audio or client content yet.
            // Native audio model ONLY supports responseModalities: ['AUDIO']
            // Text transcripts come via outputAudioTranscription / inputAudioTranscription
            const setupMsg = {
                setup: {
                    model: 'models/gemini-2.5-flash-native-audio-latest',
                    generationConfig: {
                        responseModalities: ['AUDIO'],
                        speechConfig: {
                            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } }
                        }
                    },
                    systemInstruction: { parts: [{ text: config.system_prompt }] },
                    outputAudioTranscription: {},
                    inputAudioTranscription: {}
                }
            };
            console.log('[SovereignAgent] Sending setup message...');
            wsRef.current.send(JSON.stringify(setupMsg));
        };

        wsRef.current.onmessage = async (event) => {
            try {
                let rawData = event.data;
                if (rawData instanceof Blob) {
                    rawData = await rawData.text();
                } else if (rawData instanceof ArrayBuffer) {
                    rawData = new TextDecoder().decode(rawData);
                }
                
                const data = JSON.parse(rawData);

                // Step 2: Wait for setupComplete before doing anything else
                if (data.setupComplete) {
                    console.log('[SovereignAgent] Setup acknowledged by server ✓');
                    setupCompleteRef.current = true;
                    beginSession();
                    return;
                }

                // Ignore any messages before setup is complete
                if (!setupCompleteRef.current) return;

                const serverContent = data.serverContent;
                if (!serverContent) return;

                // Handle agent audio output (modelTurn.parts with inlineData)
                if (serverContent.modelTurn?.parts) {
                    for (const part of serverContent.modelTurn.parts) {
                        if (part.inlineData?.data) {
                            const binaryString = atob(part.inlineData.data);
                            const bytes = new Uint8Array(binaryString.length);
                            for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
                            
                            try {
                                const sampleRate = 24000;
                                const numSamples = bytes.length / 2;
                                const audioBuffer = outputAudioCtxRef.current.createBuffer(1, numSamples, sampleRate);
                                const channelData = audioBuffer.getChannelData(0);
                                const dataView = new DataView(bytes.buffer);
                                
                                for (let i = 0; i < numSamples; i++) {
                                    const int16 = dataView.getInt16(i * 2, true);
                                    channelData[i] = int16 / 32768.0;
                                }

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
                }

                // Handle OUTPUT transcription (what the agent is saying — as text)
                if (serverContent.outputTranscription?.text) {
                    const transcriptChunk = serverContent.outputTranscription.text;
                    updateLastAgentMessage(transcriptChunk);
                }

                // Handle INPUT transcription (what the user said — accumulate into single bubble)
                if (serverContent.inputTranscription?.text) {
                    const userText = serverContent.inputTranscription.text;
                    if (userText.trim()) {
                        updateLastUserMessage(userText);
                    }
                }

                // Handle interruption (user started talking while agent was speaking)
                if (serverContent.interrupted) {
                    console.log('[SovereignAgent] Agent interrupted by user');
                    // Cancel any queued audio
                    nextAudioTimeRef.current = 0;
                    finalizeAgentMessage();
                    finalizeUserMessage();
                }
                
                // When turn completes, finalize + check for [BOOK] tag in the full accumulated text
                if (serverContent.turnComplete) {
                    const fullText = currentAgentTextRef.current;
                    console.log('[SovereignAgent] Turn complete. Full text:', fullText);
                    
                    // Check for booking intent in the complete turn text
                    const bookMatch = fullText.match(/\[BOOK\]\s*(\{.*?\})/s);
                    if (bookMatch) {
                        try {
                            const book_data = JSON.parse(bookMatch[1]);
                            console.log('[SovereignAgent] BOOK intent detected:', book_data);
                            if (window.parent !== window) {
                                window.parent.postMessage({ type: 'BOOK_APPOINTMENT', payload: book_data }, '*');
                                console.log('[SovereignAgent] Sent BOOK_APPOINTMENT to parent window');
                            }
                        } catch(e) {
                            console.error('[SovereignAgent] Failed to parse BOOK tag:', e);
                        }
                    }
                    
                    // Finalize both user and agent bubbles for this turn
                    finalizeUserMessage();
                    finalizeAgentMessage();
                }

            } catch (e) { console.error("[SovereignAgent] Message parse error:", e, event.data); }
        };

        wsRef.current.onerror = (err) => {
            console.error('[SovereignAgent] WebSocket error:', err);
            setStatus('Connection Error');
        };
        wsRef.current.onclose = (event) => {
            console.log('[SovereignAgent] WebSocket closed:', event.code, event.reason);
            setupCompleteRef.current = false;
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
        
        if (recognitionRef.current) {
            try { recognitionRef.current.stop(); } catch(e) {}
            recognitionRef.current = null;
        }
        
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

    // Auto-scroll chat to bottom when messages update
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    return (
        <div className="flex flex-col h-screen text-mercury bg-obsidian font-sans overflow-hidden relative">
            {/* Ambient Background Orbs */}
            <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-violet-600/20 rounded-full blur-[120px] pointer-events-none" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none" />
            
            {/* Topbar — compact */}
            <header className="flex justify-between items-center z-10 w-full px-4 py-2 border-b border-white/5 bg-obsidian/80 backdrop-blur-md">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-violet-500/20 text-archytech-violet rounded-lg">
                        <Mic size={16} />
                    </div>
                    <div>
                        <h1 className="text-sm font-semibold tracking-wide">Sovereign Agent</h1>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button onClick={toggleSound} className="text-gray-400 hover:text-white transition-colors">
                        {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                    </button>
                    <div className="flex items-center gap-1.5 bg-white/5 px-2.5 py-1 rounded-full border border-white/5">
                        <div className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`} />
                        <span className="text-[10px] text-gray-300 uppercase tracking-wider font-medium">{status}</span>
                        {active && <span className="text-[10px] text-gray-500 font-mono ml-1">{formatTime(duration)}</span>}
                    </div>
                </div>
            </header>

            {/* Chat Window — takes up all available space */}
            <main className="flex-1 z-10 overflow-y-auto px-4 py-4">
                <div className="max-w-2xl mx-auto space-y-4 flex flex-col">
                    {messages.length === 0 ? (
                        <div className="m-auto text-center opacity-30 py-20">
                            <MessageSquare size={40} className="mx-auto mb-3" />
                            <p className="text-sm">Tap the microphone to start a conversation</p>
                        </div>
                    ) : (
                        messages.map((m) => (
                            <div key={m.id} className={`flex flex-col max-w-[80%] ${
                                m.role === 'customer' || m.role === 'user' 
                                    ? 'self-end items-end' 
                                    : 'self-start items-start'
                            }`}>
                                <span className="text-[10px] text-gray-500 uppercase tracking-widest mb-1 px-1">
                                    {m.role === 'agent' ? 'AI' : 'You'}
                                </span>
                                <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                                    m.role === 'agent' 
                                        ? 'bg-white/10 text-mercury rounded-tl-sm' 
                                        : 'bg-archytech-violet rounded-tr-sm text-mercury'
                                }`}>
                                    {m.text}
                                </div>
                            </div>
                        ))
                    )}
                    <div ref={chatEndRef} />
                </div>
            </main>

            {/* Mic Control Strip — compact at bottom, shrinks further when active */}
            <footer className={`z-10 border-t border-white/5 bg-obsidian/80 backdrop-blur-md flex flex-col items-center justify-center relative transition-all duration-300 ${
                active ? 'py-3' : 'py-6'
            }`}>
                {/* Waveform canvas — only visible when active */}
                {active && (
                    <canvas ref={canvasRef} className="absolute inset-x-0 top-0 bottom-0 w-full h-full opacity-40 pointer-events-none" />
                )}
                
                <div className="flex items-center gap-4 relative z-10">
                    <button 
                        onClick={toggleAgent}
                        className={`relative flex items-center justify-center rounded-full transition-all duration-300 ${
                            active 
                                ? 'w-12 h-12 bg-red-500/20 text-red-400 hover:bg-red-500/30 ring-1 ring-red-500/50' 
                                : 'w-16 h-16 bg-archytech-violet text-mercury hover:scale-105 shadow-[0_0_40px_rgba(139,92,246,0.5)]'
                        }`}
                    >
                        {active ? <Square fill="currentColor" size={18} /> : <Mic size={28} />}
                        {active && <div className="absolute inset-0 rounded-full border border-red-500/50 animate-ping opacity-50" />}
                    </button>
                    {!active && (
                        <span className="text-xs text-gray-400 tracking-wide">Tap to start</span>
                    )}
                </div>
            </footer>
        </div>
    );
}
