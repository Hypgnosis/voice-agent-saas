/* ═══════════════════════════════════════════════════════════
   Voice Agent · Real-time Frontend
   Uses Web Speech API for instant recognition +
   Flask backend for Gemini + Edge TTS
   ═══════════════════════════════════════════════════════════ */

const API = '';  // Same origin

class Agent {
    constructor() {
        this.active = false;
        this.recognition = null;
        this.sessionId = crypto.randomUUID();
        this.msgCount = 0;
        this.startTime = null;

        // Get business slug from URL: ?business=sunshine-pets
        this.slug = new URLSearchParams(window.location.search).get('business') || null;
        this.timer = null;
        this.stream = null;
        this.audioCtx = null;
        this.analyser = null;
        this.rafId = null;

        // DOM
        this.$ = id => document.getElementById(id);
        this.micBtn = this.$('micBtn');
        this.micSvg = this.$('micSvg');
        this.stopSvg = this.$('stopSvg');
        this.micWrap = this.$('micWrap');
        this.label = this.$('stageLabel');
        this.eq = this.$('eq');
        this.chip = this.$('statusChip');
        this.chatMsgs = this.$('chatMessages');
        this.chatEmpty = this.$('chatEmpty');
        this.waveform = this.$('waveform');
        this.waveCtx = this.waveform.getContext('2d');
        this.kpiTime = this.$('kpiTime');
        this.kpiMsgs = this.$('kpiMsgs');
        this.clock = this.$('clock');

        this.init();
    }

    init() {
        this.micBtn.addEventListener('click', () => this.toggle());
        this.tick();
        this.drawIdle();
        setInterval(() => this.tick(), 1000);

        // Load business info if slug is provided
        if (this.slug) this.loadBusinessInfo();
    }

    async loadBusinessInfo() {
        try {
            const res = await fetch(`${API}/api/agent/${this.slug}/info`);
            if (!res.ok) return;
            const info = await res.json();
            // Update brand name in header
            const brandEl = document.querySelector('.brand-name');
            if (brandEl) brandEl.textContent = info.name;
            // Update voice selects
            if (info.voice_en) this.$('voiceEn').value = info.voice_en;
            if (info.voice_es) this.$('voiceEs').value = info.voice_es;
            // Auto-set speech recognition language based on business content
            if (info.primary_lang) {
                this.primaryLang = info.primary_lang;
                this.$('langSelect').value = info.primary_lang;
                console.log(`Business language auto-set to: ${info.primary_lang}`);
            }
        } catch (e) { console.warn('Could not load business info:', e); }
    }

    /* ── Toggle ────────────────────────────────────────── */

    async toggle() {
        this.active ? this.stop() : await this.start();
    }

    async start() {
        // Check for Speech Recognition support
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) {
            alert('Your browser does not support Speech Recognition. Please use Chrome or Edge.');
            return;
        }

        try {
            this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch {
            this.setLabel('Microphone access denied');
            return;
        }

        // Audio context for visualizer
        this.audioCtx = new AudioContext();
        const src = this.audioCtx.createMediaStreamSource(this.stream);
        this.analyser = this.audioCtx.createAnalyser();
        this.analyser.fftSize = 256;
        src.connect(this.analyser);

        this.active = true;
        this.sessionId = crypto.randomUUID();
        this.msgCount = 0;
        this.kpiMsgs.textContent = '0';
        this.startTime = Date.now();
        this.timer = setInterval(() => this.updateDuration(), 1000);

        // UI
        this.micBtn.classList.add('active');
        this.micSvg.classList.add('hidden');
        this.stopSvg.classList.remove('hidden');
        this.micWrap.classList.add('active');
        this.waveform.classList.add('active');
        this.setChip('active', 'Active');

        // Clear chat
        if (this.chatEmpty) { this.chatEmpty.remove(); this.chatEmpty = null; }
        this.chatMsgs.innerHTML = '';

        // Play greeting
        this.setLabel('Starting...');
        await this.playGreeting();

        // Start visualizer
        this.drawViz();

        // Start listening loop
        this.listen();
    }

    stop() {
        this.active = false;

        if (this.recognition) {
            try { this.recognition.abort(); } catch { }
            this.recognition = null;
        }
        if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; }
        if (this.audioCtx) { this.audioCtx.close(); this.audioCtx = null; }
        if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = null; }
        if (this.timer) { clearInterval(this.timer); this.timer = null; }

        this.micBtn.classList.remove('active');
        this.micSvg.classList.remove('hidden');
        this.stopSvg.classList.add('hidden');
        this.micWrap.classList.remove('active');
        this.waveform.classList.remove('active');
        this.setChip('ready', 'Ready');
        this.setLabel('Tap to start');
        this.showEQ(false);
        this.drawIdle();
    }

    /* ── Speech Recognition ──────────────────────────── */

    listen() {
        if (!this.active || this.processing) return;

        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.recognition = new SR();
        this.recognition.continuous = false;
        this.recognition.interimResults = true;  // Show interim results for feedback
        this.recognition.maxAlternatives = 1;

        // Determine language for speech recognition
        const langSel = this.$('langSelect').value;
        if (langSel === 'auto') {
            // Use business primary language if available, else English
            this.recognition.lang = this.primaryLang || 'en-US';
        } else {
            this.recognition.lang = langSel;
        }
        console.log(`Speech recognition language: ${this.recognition.lang}`);

        this.processing = false;
        this.setLabel('🎤 Listening — speak now');
        this.setChip('listening', 'Listening');
        this.showEQ(true);

        this.recognition.onresult = async (e) => {
            const result = e.results[e.results.length - 1];

            // Show interim text as preview
            if (!result.isFinal) {
                this.setLabel(`🎤 "${result[0].transcript}..."`);
                return;
            }

            // Final result — process it
            const text = result[0].transcript.trim();
            if (!text) return;

            this.processing = true;
            this.showEQ(false);
            this.addBubble('caller', text);

            // Check for exit phrases
            const exits = ['goodbye', 'hang up', 'adiós', 'colgar', 'hasta luego'];
            if (exits.some(w => text.toLowerCase().includes(w))) {
                this.addBubble('agent', 'Goodbye! Have a great day. 👋');
                this.stop();
                return;
            }

            await this.getResponse(text);
            this.processing = false;

            // Continue listening after response
            if (this.active) this.listen();
        };

        this.recognition.onerror = (e) => {
            console.log('SR event:', e.error);
            if (e.error === 'no-speech' || e.error === 'aborted') {
                // Normal timeout — will be restarted by onend
                return;
            }
            console.warn('SR error:', e.error);
        };

        this.recognition.onend = () => {
            // CRITICAL: Always restart listening if agent is active
            // This fires when Chrome's speech recognizer times out (no speech),
            // or after a result is processed, or on any error.
            if (this.active && !this.processing) {
                setTimeout(() => this.listen(), 300);
            }
        };

        try {
            this.recognition.start();
            console.log('🎤 Recognition started');
        } catch (e) {
            console.warn('SR start error:', e);
            if (this.active) setTimeout(() => this.listen(), 1000);
        }
    }

    /* ── API Calls ───────────────────────────────────── */

    async playGreeting() {
        try {
            const url = this.slug
                ? `${API}/api/agent/${this.slug}/greeting`
                : `${API}/api/tts/greeting`;
            const voice = this.$('voiceEn').value;
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ voice })
            });
            const data = await res.json();
            if (data.audio_url) {
                this.addBubble('agent', data.text);
                await this.playAudio(data.audio_url);
            }
        } catch (e) {
            console.error('Greeting error:', e);
            this.addBubble('agent', 'Hello! How can I assist you today?');
        }
    }

    async getResponse(text) {
        this.setLabel('✨ Thinking...');
        this.setChip('thinking', 'Processing');

        try {
            const url = this.slug
                ? `${API}/api/agent/${this.slug}/chat`
                : `${API}/api/chat`;
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text,
                    session_id: this.sessionId,
                    mode: this.$('agentMode') ? this.$('agentMode').value : 'customer',
                    voice_en: this.$('voiceEn').value,
                    voice_es: this.$('voiceEs').value,
                })
            });

            const data = await res.json();

            if (data.error) {
                this.addBubble('agent', 'Sorry, I had trouble processing that. Could you try again?');
                return;
            }

            this.addBubble('agent', data.text);

            if (data.audio_url) {
                this.setLabel('🔊 Speaking...');
                this.setChip('active', 'Speaking');
                await this.playAudio(data.audio_url);
            }
        } catch (e) {
            console.error('Chat error:', e);
            this.addBubble('agent', 'I\'m having connection issues. Please try again.');
        }
    }

    playAudio(url) {
        return new Promise((resolve) => {
            const audio = new Audio(url);
            audio.onended = resolve;
            audio.onerror = () => { console.error('Audio playback error'); resolve(); };
            audio.play().catch(() => resolve());
        });
    }

    /* ── Chat Bubbles ────────────────────────────────── */

    addBubble(type, text) {
        const t = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const who = type === 'caller' ? 'You' : 'AI Agent';

        const el = document.createElement('div');
        el.className = `bubble ${type}`;
        el.innerHTML = `
            <div class="bubble__who"><span class="bubble__dot"></span>${who}</div>
            <div class="bubble__text">${text}</div>
            <span class="bubble__time">${t}</span>
        `;
        this.chatMsgs.appendChild(el);
        this.chatMsgs.scrollTop = this.chatMsgs.scrollHeight;
        this.msgCount++;
        this.kpiMsgs.textContent = this.msgCount;
    }

    /* ── UI ───────────────────────────────────────────── */

    setChip(cls, txt) {
        this.chip.className = `chip ${cls}`;
        this.chip.querySelector('.chip__label').textContent = txt;
    }

    setLabel(txt) {
        this.label.textContent = txt;
        this.label.classList.toggle('active', this.active);
    }

    showEQ(show) { this.eq.classList.toggle('hidden', !show); }

    updateDuration() {
        if (!this.startTime) return;
        const s = Math.floor((Date.now() - this.startTime) / 1000);
        this.kpiTime.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }

    tick() {
        this.clock.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    /* ── Waveform ────────────────────────────────────── */

    drawViz() {
        if (!this.analyser || !this.active) return;
        const c = this.waveform;
        const ctx = this.waveCtx;
        const w = c.width = c.offsetWidth * 2;
        const h = c.height = c.offsetHeight * 2;
        const len = this.analyser.frequencyBinCount;
        const data = new Uint8Array(len);

        const draw = () => {
            this.rafId = requestAnimationFrame(draw);
            this.analyser.getByteFrequencyData(data);
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
    }

    drawIdle() {
        const c = this.waveform;
        const ctx = this.waveCtx;
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
    }
}

document.addEventListener('DOMContentLoaded', () => { window.agent = new Agent(); });
