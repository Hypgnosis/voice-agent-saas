'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Mic, ChevronLeft, Users, Plus, Loader2, ExternalLink, AlertTriangle, CheckCircle2, X, MessageSquare, Clock } from 'lucide-react';

const EMPTY_AGENT = {
    name: '',
    slug: '',
    description: '',
    knowledge_base: '',
    greeting: 'Hello, thank you for calling. How can I assist you today?',
    voice_en: 'en-US-AriaNeural',
    voice_es: 'es-MX-DaliaNeural',
    language: 'auto',
};

export default function AdminPage() {
    const [businesses, setBusinesses] = useState([]);
    const [selected, setSelected] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [seeding, setSeeding] = useState(false);
    const [creating, setCreating] = useState(false);
    const [newAgent, setNewAgent] = useState({ ...EMPTY_AGENT });
    const [toast, setToast] = useState(null);
    const [apiError, setApiError] = useState(null);
    const [logs, setLogs] = useState([]);
    const [logsLoading, setLogsLoading] = useState(false);

    useEffect(() => {
        fetchBusinesses();
    }, []);

    const showToast = (message, type = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 4000);
    };

    const fetchBusinesses = async () => {
        setLoading(true);
        setApiError(null);
        try {
            const res = await fetch('/api/businesses');
            const data = await res.json();
            if (res.ok) {
                setBusinesses(Array.isArray(data) ? data : []);
            } else {
                setApiError(data.error || 'Failed to fetch agents');
            }
        } catch (e) {
            setApiError('Network error — cannot reach API');
        }
        setLoading(false);
    };

    const seedDatabase = async () => {
        setSeeding(true);
        try {
            const res = await fetch('/api/setup', { method: 'POST' });
            const data = await res.json();
            if (res.ok) {
                showToast(data.message || 'Database seeded!');
                fetchBusinesses();
            } else {
                showToast(data.error || 'Seed failed', 'error');
            }
        } catch (e) {
            showToast('Network error during seed', 'error');
        }
        setSeeding(false);
    };

    const fetchLogs = async (bizId) => {
        setLogsLoading(true);
        try {
            const res = await fetch(`/api/businesses/${bizId}/logs`);
            const data = await res.json();
            setLogs(Array.isArray(data) ? data : []);
        } catch (e) {
            setLogs([]);
            showToast('Failed to load call logs', 'error');
        }
        setLogsLoading(false);
    };

    const handleSelect = (biz) => {
        setCreating(false);
        setSelected({ ...biz });
        fetchLogs(biz.id);
    };

    const handleChange = (field, value) => {
        setSelected(prev => ({ ...prev, [field]: value }));
    };

    const handleNewAgentChange = (field, value) => {
        setNewAgent(prev => ({ ...prev, [field]: value }));
    };

    const generateSlug = (name) => {
        return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    };

    const createAgent = async () => {
        if (!newAgent.name.trim()) {
            showToast('Agent name is required', 'error');
            return;
        }
        const slug = newAgent.slug.trim() || generateSlug(newAgent.name);
        
        setSaving(true);
        try {
            const res = await fetch('/api/businesses', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...newAgent, slug }),
            });
            const data = await res.json();
            if (res.ok) {
                showToast(`Agent "${newAgent.name}" created successfully!`);
                setCreating(false);
                setNewAgent({ ...EMPTY_AGENT });
                fetchBusinesses();
            } else {
                showToast(data.error || 'Failed to create agent', 'error');
            }
        } catch (e) {
            showToast('Network error', 'error');
        }
        setSaving(false);
    };

    const updateAgent = async () => {
        if (!selected?.name.trim()) {
            showToast('Agent name is required', 'error');
            return;
        }
        setSaving(true);
        try {
            const res = await fetch(`/api/businesses/${selected.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(selected),
            });
            const data = await res.json();
            if (res.ok) {
                showToast(`Agent "${selected.name}" updated successfully!`);
                fetchBusinesses();
            } else {
                showToast(data.error || 'Failed to update agent', 'error');
            }
        } catch (e) {
            showToast('Network error', 'error');
        }
        setSaving(false);
    };

    const openCreateForm = () => {
        setSelected(null);
        setCreating(true);
        setNewAgent({ ...EMPTY_AGENT });
    };

    // Reusable form field component
    const FormField = ({ label, children }) => (
        <div>
            <label className="block text-xs text-mercury/50 mb-1.5 font-medium uppercase tracking-wider">{label}</label>
            {children}
        </div>
    );

    const inputClass = "w-full bg-obsidian border border-border-clinical rounded-lg px-3 py-2.5 text-sm text-mercury focus:border-archytech-violet/50 focus:outline-none transition-colors placeholder:text-mercury/20";

    return (
        <main className="min-h-screen bg-obsidian text-mercury font-sans">
            {/* Toast Notification */}
            {toast && (
                <div className={`fixed top-4 right-4 z-50 flex items-center gap-3 px-5 py-3 rounded-xl shadow-2xl border text-sm font-medium animate-[fadeIn_0.3s_ease] ${
                    toast.type === 'error' 
                        ? 'bg-red-500/10 border-red-500/30 text-red-300' 
                        : 'bg-green-500/10 border-green-500/30 text-green-300'
                }`}>
                    {toast.type === 'error' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
                    {toast.message}
                    <button onClick={() => setToast(null)} className="ml-2 opacity-50 hover:opacity-100"><X size={14} /></button>
                </div>
            )}

            {/* Header */}
            <header className="border-b border-border-clinical px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link href="/" className="text-mercury/60 hover:text-mercury transition-colors">
                        <ChevronLeft size={20} />
                    </Link>
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-archytech-violet/10 text-archytech-violet rounded-lg border border-archytech-violet/20">
                            <Mic size={18} strokeWidth={2.5} />
                        </div>
                        <div>
                            <h1 className="text-base font-bold tracking-tight">Sovereign Command Center</h1>
                            <span className="text-[10px] text-mercury/50 uppercase tracking-[0.2em]">Administration Interface</span>
                        </div>
                    </div>
                </div>
            </header>

            <div className="flex h-[calc(100vh-65px)]">
                {/* Sidebar — Business List */}
                <aside className="w-80 border-r border-border-clinical flex flex-col">
                    <div className="p-4 border-b border-border-clinical">
                        <div className="flex items-center justify-between mb-3">
                            <h2 className="text-xs uppercase tracking-widest text-mercury/50 font-semibold">Registered Agents</h2>
                            <span className="text-xs text-mercury/40">{businesses.length}</span>
                        </div>
                        <button
                            onClick={openCreateForm}
                            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-archytech-violet/10 text-archytech-violet border border-archytech-violet/20 text-sm font-semibold hover:bg-archytech-violet/20 transition-colors"
                        >
                            <Plus size={16} /> Create New Agent
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4">
                        {loading ? (
                            <div className="flex items-center justify-center py-12 text-mercury/40">
                                <Loader2 size={20} className="animate-spin" />
                            </div>
                        ) : apiError ? (
                            <div className="text-center py-8 space-y-4">
                                <AlertTriangle size={24} className="mx-auto text-amber-400/60" />
                                <p className="text-sm text-amber-400/80">{apiError}</p>
                                <button
                                    onClick={seedDatabase}
                                    disabled={seeding}
                                    className="text-xs text-archytech-violet underline hover:no-underline disabled:opacity-50"
                                >
                                    {seeding ? 'Seeding...' : 'Seed Aethos Agent →'}
                                </button>
                            </div>
                        ) : businesses.length === 0 ? (
                            <div className="text-center py-8 space-y-4">
                                <Users size={24} className="mx-auto text-mercury/30" />
                                <p className="text-sm text-mercury/40">No agents yet</p>
                                <button
                                    onClick={seedDatabase}
                                    disabled={seeding}
                                    className="px-4 py-2 rounded-lg bg-archytech-violet/10 text-archytech-violet border border-archytech-violet/20 text-xs font-semibold hover:bg-archytech-violet/20 transition-colors disabled:opacity-50"
                                >
                                    {seeding ? 'Seeding...' : '🚀 Seed Aethos Agent'}
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {businesses.map(biz => (
                                    <button
                                        key={biz.id}
                                        onClick={() => handleSelect(biz)}
                                        className={`w-full text-left p-3 rounded-xl transition-all ${
                                            selected?.id === biz.id 
                                                ? 'bg-archytech-violet/10 border border-archytech-violet/30' 
                                                : 'clinical-panel hover:border-mercury/20'
                                        }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`w-2 h-2 rounded-full ${biz.active ? 'bg-green-400' : 'bg-red-400'}`} />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-semibold truncate">{biz.name}</p>
                                                <p className="text-xs text-mercury/40 truncate">/{biz.slug}</p>
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </aside>

                {/* Main Content */}
                <section className="flex-1 overflow-y-auto p-8">
                    {creating ? (
                        /* ─── CREATE NEW AGENT FORM ─── */
                        <div className="max-w-3xl mx-auto space-y-8">
                            <div>
                                <h2 className="text-2xl font-bold tracking-tight">Deploy New Agent</h2>
                                <p className="text-sm text-mercury/50 mt-1">Configure a new autonomous voice agent from scratch.</p>
                            </div>

                            {/* Identity */}
                            <div className="clinical-panel p-6 space-y-4">
                                <h3 className="text-xs uppercase tracking-widest text-mercury/50 font-semibold mb-2">Identity</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <FormField label="Agent Name *">
                                        <input
                                            type="text"
                                            value={newAgent.name}
                                            onChange={(e) => {
                                                handleNewAgentChange('name', e.target.value);
                                                if (!newAgent.slug) handleNewAgentChange('slug', generateSlug(e.target.value));
                                            }}
                                            placeholder="e.g. Aethos Medical"
                                            className={inputClass}
                                        />
                                    </FormField>
                                    <FormField label="URL Slug *">
                                        <input
                                            type="text"
                                            value={newAgent.slug || generateSlug(newAgent.name)}
                                            onChange={(e) => handleNewAgentChange('slug', e.target.value)}
                                            placeholder="auto-generated"
                                            className={inputClass}
                                        />
                                        <p className="text-[10px] text-mercury/30 mt-1">Agent URL: /agent/{newAgent.slug || generateSlug(newAgent.name) || 'slug'}</p>
                                    </FormField>
                                </div>
                            </div>

                            {/* Description & Greeting */}
                            <div className="clinical-panel p-6 space-y-4">
                                <h3 className="text-xs uppercase tracking-widest text-mercury/50 font-semibold mb-2">Personality</h3>
                                <FormField label="Business Description">
                                    <textarea
                                        rows={4}
                                        value={newAgent.description}
                                        onChange={(e) => handleNewAgentChange('description', e.target.value)}
                                        placeholder="Describe the business this agent represents. What do they do? Who are their customers?"
                                        className={inputClass + " resize-none"}
                                    />
                                </FormField>
                                <FormField label="Greeting Message">
                                    <textarea
                                        rows={2}
                                        value={newAgent.greeting}
                                        onChange={(e) => handleNewAgentChange('greeting', e.target.value)}
                                        placeholder="The first thing the agent says when a caller connects"
                                        className={inputClass + " resize-none"}
                                    />
                                </FormField>
                            </div>

                            {/* Knowledge Base */}
                            <div className="clinical-panel p-6 space-y-4">
                                <h3 className="text-xs uppercase tracking-widest text-mercury/50 font-semibold mb-2">Knowledge Base</h3>
                                <p className="text-xs text-mercury/40 -mt-1 mb-2">This is the brain of your agent. Paste all the information the agent needs: services, prices, hours, FAQs, scripts, objection handling, etc.</p>
                                <textarea
                                    rows={14}
                                    value={newAgent.knowledge_base}
                                    onChange={(e) => handleNewAgentChange('knowledge_base', e.target.value)}
                                    placeholder={`SERVICES & PRICES:\n- Service A: $XX\n- Service B: $XX\n\nHOURS:\n- Mon-Fri: 9am - 5pm\n\nFAQ:\n- Q: Do you accept insurance?\n  A: Yes, we accept...\n\nOBJECTION HANDLING:\n- "Too expensive": Offer payment plans...`}
                                    className={inputClass + " resize-none font-mono text-xs"}
                                />
                            </div>

                            {/* Language & Voice */}
                            <div className="clinical-panel p-6 space-y-4">
                                <h3 className="text-xs uppercase tracking-widest text-mercury/50 font-semibold mb-2">Voice & Language</h3>
                                <div className="grid grid-cols-3 gap-4">
                                    <FormField label="Primary Language">
                                        <select
                                            value={newAgent.language}
                                            onChange={(e) => handleNewAgentChange('language', e.target.value)}
                                            className={inputClass}
                                        >
                                            <option value="auto">Auto-Detect</option>
                                            <option value="en-US">English (US)</option>
                                            <option value="es-MX">Spanish (MX)</option>
                                        </select>
                                    </FormField>
                                    <FormField label="English Voice">
                                        <input
                                            type="text"
                                            value={newAgent.voice_en}
                                            onChange={(e) => handleNewAgentChange('voice_en', e.target.value)}
                                            className={inputClass}
                                        />
                                    </FormField>
                                    <FormField label="Spanish Voice">
                                        <input
                                            type="text"
                                            value={newAgent.voice_es}
                                            onChange={(e) => handleNewAgentChange('voice_es', e.target.value)}
                                            className={inputClass}
                                        />
                                    </FormField>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center justify-between pt-4 pb-12">
                                <button
                                    onClick={() => { setCreating(false); setNewAgent({ ...EMPTY_AGENT }); }}
                                    className="text-sm text-mercury/50 hover:text-mercury transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={createAgent}
                                    disabled={saving || !newAgent.name.trim()}
                                    className="bg-archytech-violet text-white px-8 py-3 rounded-xl text-sm font-bold hover:bg-archytech-violet/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-[0_0_20px_rgba(139,92,246,0.3)]"
                                >
                                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                                    {saving ? 'Deploying...' : 'Deploy Agent'}
                                </button>
                            </div>
                        </div>
                    ) : !selected ? (
                        /* ─── EMPTY STATE ─── */
                        <div className="h-full flex flex-col items-center justify-center text-center">
                            <div className="w-16 h-16 rounded-2xl bg-archytech-violet/10 flex items-center justify-center text-archytech-violet mb-6">
                                <Users size={28} />
                            </div>
                            <h2 className="text-xl font-bold mb-2">Select an Agent</h2>
                            <p className="text-sm text-mercury/50 max-w-sm mb-6">
                                Choose an agent from the sidebar to view its configuration, or create a new one.
                            </p>
                            <button
                                onClick={openCreateForm}
                                className="bg-archytech-violet/10 text-archytech-violet px-5 py-2.5 rounded-lg text-sm font-semibold border border-archytech-violet/20 hover:bg-archytech-violet/20 transition-colors flex items-center gap-2"
                            >
                                <Plus size={16} /> Create New Agent
                            </button>
                        </div>
                    ) : (
                        /* ─── VIEW SELECTED AGENT ─── */
                        <div className="max-w-3xl mx-auto space-y-8">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="text-2xl font-bold tracking-tight">{selected.name}</h2>
                                    <p className="text-sm text-mercury/50 mt-1">
                                        Agent URL: <code className="text-archytech-violet text-xs">/agent/{selected.slug}</code>
                                    </p>
                                </div>
                                <div className="flex gap-2">
                                    <button 
                                        onClick={() => {
                                            navigator.clipboard.writeText(`<iframe src="https://${window.location.host}/embed/${selected.slug}" width="100%" height="600px" style="border:none; border-radius:12px; overflow:hidden;" allow="microphone"></iframe>`);
                                            showToast("Iframe code copied!");
                                        }}
                                        className="bg-mercury/10 text-mercury px-4 py-2 rounded-lg text-sm font-semibold border border-mercury/20 hover:bg-mercury/20 transition-colors flex items-center gap-2"
                                    >
                                        Copy Iframe
                                    </button>
                                    <Link 
                                        href={`/embed/${selected.slug}`}
                                        className="bg-archytech-violet/10 text-archytech-violet px-4 py-2 rounded-lg text-sm font-semibold border border-archytech-violet/20 hover:bg-archytech-violet/20 transition-colors flex items-center gap-2"
                                    >
                                        Test Embed <ExternalLink size={14} />
                                    </Link>
                                    <Link 
                                        href={`/agent/${selected.slug}`}
                                        className="bg-archytech-violet/10 text-archytech-violet px-4 py-2 rounded-lg text-sm font-semibold border border-archytech-violet/20 hover:bg-archytech-violet/20 transition-colors flex items-center gap-2"
                                    >
                                        Test Agent <ExternalLink size={14} />
                                    </Link>
                                </div>
                            </div>

                            <div className="clinical-panel p-6 space-y-4">
                                <h3 className="text-xs uppercase tracking-widest text-mercury/50 font-semibold mb-4">Core Configuration</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <FormField label="Business Name">
                                        <input type="text" value={selected.name || ''} onChange={(e) => handleChange('name', e.target.value)} className={inputClass} />
                                    </FormField>
                                    <FormField label="Slug (URL Path)">
                                        <input type="text" value={selected.slug || ''} onChange={(e) => handleChange('slug', e.target.value)} className={inputClass} />
                                    </FormField>
                                </div>
                                <FormField label="Description">
                                    <textarea rows={3} value={selected.description || ''} onChange={(e) => handleChange('description', e.target.value)} className={inputClass + " resize-none"} />
                                </FormField>
                                <FormField label="Greeting Message">
                                    <textarea rows={2} value={selected.greeting || ''} onChange={(e) => handleChange('greeting', e.target.value)} className={inputClass + " resize-none"} />
                                </FormField>
                            </div>

                            <div className="clinical-panel p-6">
                                <h3 className="text-xs uppercase tracking-widest text-mercury/50 font-semibold mb-4">Knowledge Base</h3>
                                <textarea rows={12} value={selected.knowledge_base || ''} onChange={(e) => handleChange('knowledge_base', e.target.value)} className={inputClass + " resize-none font-mono text-xs"} />
                            </div>

                            <div className="clinical-panel p-6">
                                <h3 className="text-xs uppercase tracking-widest text-mercury/50 font-semibold mb-4">Voice & Language</h3>
                                <div className="grid grid-cols-3 gap-4">
                                    <FormField label="Primary Language">
                                        <select value={selected.language || 'auto'} onChange={(e) => handleChange('language', e.target.value)} className={inputClass}>
                                            <option value="auto">Auto-Detect</option>
                                            <option value="en-US">English (US)</option>
                                            <option value="es-MX">Spanish (MX)</option>
                                        </select>
                                    </FormField>
                                    <FormField label="English Voice">
                                        <input type="text" value={selected.voice_en || ''} onChange={(e) => handleChange('voice_en', e.target.value)} className={inputClass} />
                                    </FormField>
                                    <FormField label="Spanish Voice">
                                        <input type="text" value={selected.voice_es || ''} onChange={(e) => handleChange('voice_es', e.target.value)} className={inputClass} />
                                    </FormField>
                                </div>
                            </div>

                            <div className="clinical-panel p-6 flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-3 h-3 rounded-full ${selected.active ? 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.4)]' : 'bg-red-400'}`} />
                                        <span className="text-sm font-medium">{selected.active ? 'Active' : 'Inactive'}</span>
                                    </div>
                                    <div className="text-xs text-mercury/40 border-l border-mercury/20 pl-4">ID: {selected.id}</div>
                                </div>
                                
                                <button
                                    onClick={updateAgent}
                                    disabled={saving}
                                    className="bg-archytech-violet text-white px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-archytech-violet/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-[0_0_20px_rgba(139,92,246,0.3)]"
                                >
                                    {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                                    {saving ? 'Saving...' : 'Save Changes'}
                                </button>
                            </div>

                            {/* CALL LOGS SECTION */}
                            <div className="clinical-panel p-6 space-y-4">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-xs uppercase tracking-widest text-mercury/50 font-semibold flex items-center gap-2">
                                        <MessageSquare size={14} /> Call Logs & Transcripts
                                    </h3>
                                    <button 
                                        onClick={() => fetchLogs(selected.id)}
                                        disabled={logsLoading}
                                        className="text-xs text-archytech-violet hover:text-archytech-violet/80 underline flex items-center gap-1"
                                    >
                                        {logsLoading ? <Loader2 size={12} className="animate-spin" /> : <Clock size={12} />} Refresh
                                    </button>
                                </div>
                                
                                {logsLoading && logs.length === 0 ? (
                                    <div className="flex justify-center py-6 text-mercury/40">
                                        <Loader2 size={16} className="animate-spin" />
                                    </div>
                                ) : logs.length === 0 ? (
                                    <div className="text-center py-8 text-mercury/40 text-sm">
                                        No conversations recorded yet.
                                    </div>
                                ) : (
                                    <div className="space-y-4 max-h-96 overflow-y-auto pr-2 custom-scrollbar">
                                        {logs.map((log) => (
                                            <div key={log.id} className="bg-white/5 border border-white/5 p-4 rounded-xl space-y-3">
                                                <div className="flex items-center justify-between text-xs text-mercury/40 mb-1 border-b border-white/5 pb-2">
                                                    <span>{new Date(log.timestamp).toLocaleString()}</span>
                                                    <span className="uppercase tracking-widest text-[9px] bg-white/5 px-2 py-0.5 rounded-full">{log.channel}</span>
                                                </div>
                                                
                                                {log.caller_text && (
                                                    <div className="flex flex-col items-end">
                                                        <span className="text-[10px] uppercase text-mercury/40 mb-1">User</span>
                                                        <span className="text-sm bg-archytech-violet/20 text-archytech-violet px-3 py-2 rounded-xl rounded-tr-sm max-w-[85%]">{log.caller_text}</span>
                                                    </div>
                                                )}
                                                
                                                {log.agent_text && (
                                                    <div className="flex flex-col items-start mt-2">
                                                        <span className="text-[10px] uppercase text-mercury/40 mb-1">Agent</span>
                                                        <span className="text-sm bg-white/10 text-mercury px-3 py-2 rounded-xl rounded-tl-sm max-w-[85%]">{log.agent_text}</span>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </section>
            </div>
        </main>
    );
}
