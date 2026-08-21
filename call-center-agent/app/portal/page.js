'use client';
import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Loader2, Lock, ArrowRight, ArrowLeft, AlertTriangle, Shield, Mail } from 'lucide-react';
import { auth } from '@/lib/firebase/client';
import { signInWithEmailAndPassword } from 'firebase/auth';

// ═══════════════════════════════════════════════════════════════════════════
// CLIENT PORTAL GATEWAY — Firebase Auth (Email/Password)
// ═══════════════════════════════════════════════════════════════════════════
// Replaces the deprecated slug + client_pin flow.
// On successful Firebase Auth, the ID Token is stored and used for all
// subsequent API calls via Authorization: Bearer <idToken>.
// ═══════════════════════════════════════════════════════════════════════════
export default function PortalPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');
        if (!email.trim() || !password.trim()) {
            setError('Email and password are required');
            return;
        }

        setLoading(true);
        try {
            const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
            const user = userCredential.user;

            // Get the Firebase ID Token for API authentication
            const idToken = await user.getIdToken();

            // Store auth state for the session
            sessionStorage.setItem('portal_token', idToken);
            sessionStorage.setItem('portal_uid', user.uid);
            sessionStorage.setItem('portal_email', user.email || '');

            // Fetch the user's business to determine redirect slug
            const res = await fetch('/api/businesses', {
                headers: { 'Authorization': `Bearer ${idToken}` },
            });

            if (res.ok) {
                const businesses = await res.json();
                if (businesses.length > 0) {
                    // Redirect to the first owned business dashboard
                    window.location.href = `/admin/${businesses[0].slug}`;
                } else {
                    setError('No agents are associated with your account. Contact your administrator.');
                }
            } else {
                setError('Failed to load your dashboard. Please try again.');
            }
        } catch (err) {
            // Map Firebase error codes to user-friendly messages
            switch (err.code) {
                case 'auth/invalid-email':
                    setError('Invalid email address');
                    break;
                case 'auth/user-disabled':
                    setError('This account has been disabled');
                    break;
                case 'auth/user-not-found':
                case 'auth/wrong-password':
                case 'auth/invalid-credential':
                    setError('Invalid email or password');
                    break;
                case 'auth/too-many-requests':
                    setError('Too many attempts — please wait before trying again');
                    break;
                default:
                    setError('Authentication failed — please try again');
            }
        }
        setLoading(false);
    };

    return (
        <main className="min-h-screen bg-obsidian text-mercury font-sans flex flex-col items-center justify-center relative">
            {/* Background shimmer */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-archytech-violet/5 rounded-full blur-[120px]" />
                <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-archytech-violet/3 rounded-full blur-[100px]" />
            </div>

            {/* Back Button */}
            <div className="fixed top-6 left-6 z-20">
                <Link href="/" className="back-btn">
                    <ArrowLeft size={16} />
                    Back to Home
                </Link>
            </div>

            <div className="relative w-full max-w-md mx-4">
                {/* Logo & Branding */}
                <div className="text-center mb-8">
                    <Image
                        src="/sovereign-agent-logo.png"
                        alt="Sovereign Agent"
                        width={72}
                        height={72}
                        className="mx-auto mb-6 drop-shadow-[0_0_20px_rgba(139,92,246,0.4)]"
                    />
                    <h1 className="text-2xl font-bold tracking-tight mb-2">Client Portal</h1>
                    <p className="text-sm text-mercury/40">Secure access to your Sovereign Agent dashboard</p>
                </div>

                {/* Login Form */}
                <div className="clinical-panel p-8 space-y-6">
                    <form onSubmit={handleLogin} className="space-y-5">
                        <div>
                            <label className="block text-xs text-mercury/50 mb-1.5 font-medium uppercase tracking-wider">Email</label>
                            <div className="relative">
                                <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-mercury/30" />
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="you@company.com"
                                    autoFocus
                                    autoComplete="email"
                                    className="w-full bg-obsidian border border-border-clinical rounded-lg px-3 py-3 text-sm text-mercury focus:border-archytech-violet/50 focus:outline-none transition-colors placeholder:text-mercury/20 pl-9"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs text-mercury/50 mb-1.5 font-medium uppercase tracking-wider">Password</label>
                            <div className="relative">
                                <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-mercury/30" />
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    autoComplete="current-password"
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
                            disabled={loading || !email.trim() || !password.trim()}
                            className="w-full bg-archytech-violet text-white px-6 py-3 rounded-xl text-sm font-bold hover:bg-archytech-violet/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(139,92,246,0.3)]"
                        >
                            {loading ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                            {loading ? 'Authenticating...' : 'Sign In'}
                        </button>
                    </form>
                </div>

                <div className="flex items-center justify-center gap-2 mt-8">
                    <Image src="/sovereign-agent-logo.png" alt="" width={14} height={14} className="opacity-30" />
                    <p className="text-[10px] text-mercury/20 uppercase tracking-widest">Sovereign Agent Infrastructure™</p>
                </div>
            </div>
        </main>
    );
}
