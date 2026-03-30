'use client';
import { useState } from 'react';
import { Mic, Loader2, Lock, ArrowRight, AlertTriangle, Shield } from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════
// CLIENT PORTAL GATEWAY — Login with slug + client_pin
// ═══════════════════════════════════════════════════════════════════════════
export default function PortalPage() {
    const [slug, setSlug] = useState('');
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');
        if (!slug.trim() || !pin.trim()) {
            setError('Both fields are required');
            return;
        }

        setLoading(true);
        try {
            const res = await fetch('/api/auth/verify-client', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ slug: slug.trim().toLowerCase(), pin: pin.trim() }),
            });
            const data = await res.json();
            if (res.ok) {
                // Store auth token in session and redirect
                sessionStorage.setItem('portal_slug', data.slug);
                sessionStorage.setItem('portal_token', data.token);
                window.location.href = `/admin/${data.slug}`;
            } else {
                setError(data.error || 'Access denied');
            }
        } catch {
            setError('Network error — try again');
        }
        setLoading(false);
    };

    return (
        <main className="min-h-screen bg-obsidian text-mercury font-sans flex items-center justify-center">
            {/* Background shimmer */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-archytech-violet/5 rounded-full blur-[120px]" />
                <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-archytech-violet/3 rounded-full blur-[100px]" />
            </div>

            <div className="relative w-full max-w-md mx-4">
                {/* Logo & Branding */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center p-4 bg-archytech-violet/10 rounded-2xl border border-archytech-violet/20 mb-6">
                        <Mic size={32} strokeWidth={1.5} className="text-archytech-violet" />
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight mb-2">Client Portal</h1>
                    <p className="text-sm text-mercury/40">Access your Sovereign Agent dashboard</p>
                </div>

                {/* Login Form */}
                <div className="clinical-panel p-8 space-y-6">
                    <form onSubmit={handleLogin} className="space-y-5">
                        <div>
                            <label className="block text-xs text-mercury/50 mb-1.5 font-medium uppercase tracking-wider">Agent Identifier</label>
                            <div className="relative">
                                <Shield size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-mercury/30" />
                                <input
                                    type="text"
                                    value={slug}
                                    onChange={(e) => setSlug(e.target.value)}
                                    placeholder="your-business-slug"
                                    autoFocus
                                    className="w-full bg-obsidian border border-border-clinical rounded-lg px-3 py-3 text-sm text-mercury focus:border-archytech-violet/50 focus:outline-none transition-colors placeholder:text-mercury/20 pl-9 font-mono"
                                />
                            </div>
                            <p className="text-[10px] text-mercury/30 mt-1">The unique identifier provided by your account manager</p>
                        </div>

                        <div>
                            <label className="block text-xs text-mercury/50 mb-1.5 font-medium uppercase tracking-wider">Access PIN</label>
                            <div className="relative">
                                <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-mercury/30" />
                                <input
                                    type="password"
                                    value={pin}
                                    onChange={(e) => setPin(e.target.value)}
                                    placeholder="••••"
                                    className="w-full bg-obsidian border border-border-clinical rounded-lg px-3 py-3 text-sm text-mercury focus:border-archytech-violet/50 focus:outline-none transition-colors placeholder:text-mercury/20 pl-9 font-mono tracking-widest"
                                />
                            </div>
                        </div>

                        {error && (
                            <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                                <AlertTriangle size={14} />
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading || !slug.trim() || !pin.trim()}
                            className="w-full bg-archytech-violet text-white px-6 py-3 rounded-xl text-sm font-bold hover:bg-archytech-violet/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(139,92,246,0.3)]"
                        >
                            {loading ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                            {loading ? 'Authenticating...' : 'Initiate Protocol'}
                        </button>
                    </form>
                </div>

                <p className="text-center text-[10px] text-mercury/20 mt-8 uppercase tracking-widest">Sovereign Agent Infrastructure™</p>
            </div>
        </main>
    );
}
