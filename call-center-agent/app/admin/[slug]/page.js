'use client';
import { useState, useEffect, useCallback, use } from 'react';
import Link from 'next/link';
import { Mic, ChevronLeft, Loader2, AlertTriangle, CheckCircle2, X, MessageSquare, Clock, CalendarDays, KeyRound, Hash, Lock, ShieldAlert } from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════
// STYLE CONSTANTS — NO wrapper components, just class strings
// ═══════════════════════════════════════════════════════════════════════════
const IC = "w-full bg-obsidian border border-border-clinical rounded-lg px-3 py-2.5 text-sm text-mercury focus:border-archytech-violet/50 focus:outline-none transition-colors placeholder:text-mercury/20";
const LC = "block text-xs text-mercury/50 mb-1.5 font-medium uppercase tracking-wider";

export default function ClientDashboard({ params }) {
    const { slug } = use(params);
    const [business, setBusiness] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState(null);
    const [accessDenied, setAccessDenied] = useState(false);
    const [logs, setLogs] = useState([]);
    const [logsLoading, setLogsLoading] = useState(false);

    const showToast = useCallback((message, type = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 4000);
    }, []);

    useEffect(() => {
        // Verify session
        const storedSlug = sessionStorage.getItem('portal_slug');
        const token = sessionStorage.getItem('portal_token');
        if (storedSlug !== slug || !token) {
            setAccessDenied(true);
            setLoading(false);
            return;
        }
        fetchBusiness(token);
    }, [slug]);

    const fetchBusiness = async (token) => {
        setLoading(true);
        try {
            const res = await fetch(`/api/portal/${slug}`, {
                headers: { 'x-portal-token': token || sessionStorage.getItem('portal_token') },
            });
            if (res.status === 403 || res.status === 401) {
                setAccessDenied(true);
                setLoading(false);
                return;
            }
            const data = await res.json();
            if (res.ok) {
                setBusiness(data);
                fetchLogs(data.id);
            }
        } catch (e) {
            showToast('Failed to load dashboard', 'error');
        }
        setLoading(false);
    };

    const fetchLogs = async (bizId) => {
        setLogsLoading(true);
        try {
            const res = await fetch(`/api/businesses/${bizId}/logs`);
            const data = await res.json();
            setLogs(Array.isArray(data) ? data : []);
        } catch {
            setLogs([]);
        }
        setLogsLoading(false);
    };

    const handleChange = useCallback((field, value) => {
        setBusiness(prev => ({ ...prev, [field]: value }));
    }, []);

    const handleIntegrationChange = useCallback((field, value) => {
        setBusiness(prev => ({
            ...prev,
            integrations: { ...prev.integrations, [field]: value }
        }));
    }, []);

    const saveChanges = async () => {
        setSaving(true);
        const token = sessionStorage.getItem('portal_token');
        try {
            const res = await fetch(`/api/portal/${slug}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'x-portal-token': token,
                },
                body: JSON.stringify({
                    knowledge_base: business.knowledge_base,
                    greeting: business.greeting,
                    description: business.description,
                    timezone: business.timezone,
                    integrations: {
                        calendar_api_key: business.integrations?.calendar_api_key || '',
                        calendar_id: business.integrations?.calendar_id || '',
                        event_type_id: business.integrations?.event_type_id || '',
                    },
                }),
            });
            if (res.ok) {
                showToast('Configuration saved successfully!');
            } else {
                const data = await res.json();
                showToast(data.error || 'Save failed', 'error');
            }
        } catch {
            showToast('Network error', 'error');
        }
        setSaving(false);
    };

    // ── Access Denied ──────────────────────────────────────────────────────
    if (accessDenied) {
        return (
            <main className="min-h-screen bg-obsidian text-mercury font-sans flex items-center justify-center">
                <div className="text-center space-y-6">
                    <div className="inline-flex items-center justify-center p-4 bg-red-500/10 rounded-2xl border border-red-500/20">
                        <ShieldAlert size={40} strokeWidth={1.5} className="text-red-400" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
                        <p className="text-sm text-mercury/40 max-w-md">Your session has expired or credentials are invalid.</p>
                    </div>
                    <Link href="/portal" className="inline-flex items-center gap-2 bg-archytech-violet/10 text-archytech-violet px-6 py-3 rounded-xl text-sm font-semibold border border-archytech-violet/20 hover:bg-archytech-violet/20 transition-colors">
                        <Lock size={16} /> Return to Portal Login
                    </Link>
                </div>
            </main>
        );
    }

    // ── Loading ────────────────────────────────────────────────────────────
    if (loading) {
        return (
            <main className="min-h-screen bg-obsidian text-mercury font-sans flex items-center justify-center">
                <Loader2 size={24} className="animate-spin text-archytech-violet" />
            </main>
        );
    }

    // ── Main Dashboard ────────────────────────────────────────────────────
    return (
        <main className="min-h-screen bg-obsidian text-mercury font-sans">
            {/* Toast */}
            {toast && (
                <div className={`fixed top-4 right-4 z-50 flex items-center gap-3 px-5 py-3 rounded-xl shadow-2xl border text-sm font-medium animate-[fadeIn_0.3s_ease] ${
                    toast.type === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-300' : 'bg-green-500/10 border-green-500/30 text-green-300'
                }`}>
                    {toast.type === 'error' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
                    {toast.message}
                    <button onClick={() => setToast(null)} className="ml-2 opacity-50 hover:opacity-100"><X size={14} /></button>
                </div>
            )}

            {/* Header */}
            <header className="border-b border-border-clinical px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link href="/portal" className="text-mercury/60 hover:text-mercury transition-colors">
                        <ChevronLeft size={20} />
                    </Link>
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-archytech-violet/10 text-archytech-violet rounded-lg border border-archytech-violet/20">
                            <Mic size={18} strokeWidth={2.5} />
                        </div>
                        <div>
                            <h1 className="text-base font-bold tracking-tight">{business?.name || 'Agent Dashboard'}</h1>
                            <span className="text-[10px] text-mercury/50 uppercase tracking-[0.2em]">Client Configuration Panel</span>
                        </div>
                    </div>
                </div>
                <button
                    onClick={() => {
                        sessionStorage.removeItem('portal_slug');
                        sessionStorage.removeItem('portal_token');
                        window.location.href = '/portal';
                    }}
                    className="text-xs text-mercury/40 hover:text-red-400 transition-colors"
                >
                    Sign Out
                </button>
            </header>

            <div className="max-w-3xl mx-auto p-8 space-y-8">
                {/* Agent Info (read-only) */}
                <div className="clinical-panel p-6">
                    <h3 className="text-xs uppercase tracking-widest text-mercury/50 font-semibold mb-4">Agent Identity</h3>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <p className="text-[10px] text-mercury/40 uppercase tracking-wider mb-1">Agent Name</p>
                            <p className="text-sm font-semibold">{business?.name}</p>
                        </div>
                        <div>
                            <p className="text-[10px] text-mercury/40 uppercase tracking-wider mb-1">Agent Slug</p>
                            <p className="text-sm font-mono text-archytech-violet">/{business?.slug}</p>
                        </div>
                    </div>
                </div>

                {/* Editable: Description & Greeting */}
                <div className="clinical-panel p-6 space-y-4">
                    <h3 className="text-xs uppercase tracking-widest text-mercury/50 font-semibold mb-2">Personality</h3>
                    <div>
                        <label className={LC}>Business Description</label>
                        <textarea rows={3} value={business?.description || ''} onChange={(e) => handleChange('description', e.target.value)} className={IC + " resize-none"} />
                    </div>
                    <div>
                        <label className={LC}>Greeting Message</label>
                        <textarea rows={2} value={business?.greeting || ''} onChange={(e) => handleChange('greeting', e.target.value)} className={IC + " resize-none"} />
                    </div>
                </div>

                {/* Editable: Knowledge Base */}
                <div className="clinical-panel p-6">
                    <h3 className="text-xs uppercase tracking-widest text-mercury/50 font-semibold mb-4">Knowledge Base</h3>
                    <p className="text-xs text-mercury/40 mb-3">This is the brain of your agent. Paste all information: services, prices, hours, FAQs, scripts.</p>
                    <textarea rows={14} value={business?.knowledge_base || ''} onChange={(e) => handleChange('knowledge_base', e.target.value)} className={IC + " resize-none font-mono text-xs"} />
                </div>

                {/* Calendar Integrations */}
                <div className="clinical-panel p-6 space-y-4">
                    <h3 className="text-xs uppercase tracking-widest text-mercury/50 font-semibold mb-4 flex items-center gap-2">
                        <CalendarDays size={14} /> Calendar Integrations
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className={LC}>Timezone</label>
                            <select value={business?.timezone || 'America/Merida'} onChange={(e) => handleChange('timezone', e.target.value)} className={IC}>
                                <option value="America/Merida">America/Merida (CST)</option>
                                <option value="America/Mexico_City">America/Mexico_City</option>
                                <option value="America/New_York">America/New_York (EST)</option>
                                <option value="America/Los_Angeles">America/Los_Angeles (PST)</option>
                                <option value="America/Chicago">America/Chicago (CST)</option>
                                <option value="America/Bogota">America/Bogota (COT)</option>
                            </select>
                        </div>
                        <div>
                            <label className={LC}>Calendar ID / Email</label>
                            <input type="text" value={business?.integrations?.calendar_id || ''} onChange={(e) => handleIntegrationChange('calendar_id', e.target.value)} placeholder="e.g. clinic@gmail.com" className={IC} />
                        </div>
                    </div>
                    <div>
                        <label className={LC}>Booking API Key (Cal.com)</label>
                        <div className="relative">
                            <KeyRound size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-mercury/30" />
                            <input type="password" value={business?.integrations?.calendar_api_key || ''} onChange={(e) => handleIntegrationChange('calendar_api_key', e.target.value)} placeholder="cal_live_xxxxxx" className={IC + " pl-9 font-mono"} />
                        </div>
                        <p className="text-[10px] text-mercury/30 mt-1">Stored securely. Allows the AI agent to read/write to your calendar.</p>
                    </div>
                    <div>
                        <label className={LC}>Event Type ID (Cal.com)</label>
                        <div className="relative">
                            <Hash size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-mercury/30" />
                            <input type="text" value={business?.integrations?.event_type_id || ''} onChange={(e) => handleIntegrationChange('event_type_id', e.target.value)} placeholder="e.g. 123456" className={IC + " pl-9 font-mono"} />
                        </div>
                        <p className="text-[10px] text-mercury/30 mt-1">Required for bookings. Find it in Cal.com → Event Types → ID.</p>
                    </div>
                </div>

                {/* Save Button */}
                <div className="clinical-panel p-6 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${business?.active ? 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.4)]' : 'bg-red-400'}`} />
                        <span className="text-sm font-medium">{business?.active ? 'Agent Active' : 'Agent Inactive'}</span>
                    </div>
                    <button
                        onClick={saveChanges}
                        disabled={saving}
                        className="bg-archytech-violet text-white px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-archytech-violet/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-[0_0_20px_rgba(139,92,246,0.3)]"
                    >
                        {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                        {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>

                {/* Call Logs */}
                <div className="clinical-panel p-6 space-y-4">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xs uppercase tracking-widest text-mercury/50 font-semibold flex items-center gap-2"><MessageSquare size={14} /> Conversation History</h3>
                        {business && (
                            <button onClick={() => fetchLogs(business.id)} disabled={logsLoading} className="text-xs text-archytech-violet hover:text-archytech-violet/80 underline flex items-center gap-1">
                                {logsLoading ? <Loader2 size={12} className="animate-spin" /> : <Clock size={12} />} Refresh
                            </button>
                        )}
                    </div>
                    {logsLoading && logs.length === 0 ? (
                        <div className="flex justify-center py-6 text-mercury/40"><Loader2 size={16} className="animate-spin" /></div>
                    ) : logs.length === 0 ? (
                        <div className="text-center py-8 text-mercury/40 text-sm">No conversations recorded yet.</div>
                    ) : (
                        <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
                            {logs.map((log) => (
                                <div key={log.id} className="bg-white/5 border border-white/5 p-4 rounded-xl space-y-3">
                                    <div className="flex items-center justify-between text-xs text-mercury/40 mb-1 border-b border-white/5 pb-2">
                                        <span>{new Date(log.timestamp).toLocaleString()}</span>
                                        <span className="uppercase tracking-widest text-[9px] bg-white/5 px-2 py-0.5 rounded-full">{log.channel}</span>
                                    </div>
                                    {log.caller_text && <div className="flex flex-col items-end"><span className="text-[10px] uppercase text-mercury/40 mb-1">User</span><span className="text-sm bg-archytech-violet/20 text-archytech-violet px-3 py-2 rounded-xl rounded-tr-sm max-w-[85%]">{log.caller_text}</span></div>}
                                    {log.agent_text && <div className="flex flex-col items-start mt-2"><span className="text-[10px] uppercase text-mercury/40 mb-1">Agent</span><span className="text-sm bg-white/10 text-mercury px-3 py-2 rounded-xl rounded-tl-sm max-w-[85%]">{log.agent_text}</span></div>}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </main>
    );
}
