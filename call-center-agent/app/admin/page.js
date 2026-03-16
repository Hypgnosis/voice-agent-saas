'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Mic, ChevronLeft, Users, Phone, Globe, Plus, Trash2, Save, Loader2 } from 'lucide-react';

export default function AdminPage() {
    const [businesses, setBusinesses] = useState([]);
    const [selected, setSelected] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        fetchBusinesses();
    }, []);

    const fetchBusinesses = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/businesses');
            const data = await res.json();
            setBusinesses(Array.isArray(data) ? data : []);
        } catch (e) {
            console.error('Failed to fetch businesses', e);
        }
        setLoading(false);
    };

    const handleSelect = (biz) => {
        setSelected({ ...biz });
    };

    const handleChange = (field, value) => {
        setSelected(prev => ({ ...prev, [field]: value }));
    };

    return (
        <main className="min-h-screen bg-obsidian text-mercury font-sans">
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
                <aside className="w-80 border-r border-border-clinical p-4 overflow-y-auto">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-xs uppercase tracking-widest text-mercury/50 font-semibold">Registered Agents</h2>
                        <span className="text-xs text-mercury/40">{businesses.length}</span>
                    </div>

                    {loading ? (
                        <div className="flex items-center justify-center py-12 text-mercury/40">
                            <Loader2 size={20} className="animate-spin" />
                        </div>
                    ) : businesses.length === 0 ? (
                        <div className="text-center py-12">
                            <p className="text-sm text-mercury/40 mb-2">No agents configured</p>
                            <p className="text-xs text-mercury/30">Seed data via /api/setup</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {businesses.map(biz => (
                                <button
                                    key={biz.id}
                                    onClick={() => handleSelect(biz)}
                                    className={`w-full text-left p-3 rounded-xl transition-all group ${
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
                </aside>

                {/* Main Content */}
                <section className="flex-1 overflow-y-auto p-8">
                    {!selected ? (
                        <div className="h-full flex flex-col items-center justify-center text-center">
                            <div className="w-16 h-16 rounded-2xl bg-archytech-violet/10 flex items-center justify-center text-archytech-violet mb-6">
                                <Users size={28} />
                            </div>
                            <h2 className="text-xl font-bold mb-2">Select an Agent</h2>
                            <p className="text-sm text-mercury/50 max-w-sm">
                                Choose an agent from the sidebar to view and edit its configuration, knowledge base, and deployment settings.
                            </p>
                        </div>
                    ) : (
                        <div className="max-w-3xl mx-auto space-y-8">
                            {/* Agent Header */}
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="text-2xl font-bold tracking-tight">{selected.name}</h2>
                                    <p className="text-sm text-mercury/50 mt-1">
                                        Agent URL: <code className="text-archytech-violet text-xs">/agent/{selected.slug}</code>
                                    </p>
                                </div>
                                <Link 
                                    href={`/agent/${selected.slug}`}
                                    className="bg-archytech-violet/10 text-archytech-violet px-4 py-2 rounded-lg text-sm font-semibold border border-archytech-violet/20 hover:bg-archytech-violet/20 transition-colors"
                                >
                                    Test Agent →
                                </Link>
                            </div>

                            {/* Basic Info */}
                            <div className="clinical-panel p-6 space-y-4">
                                <h3 className="text-xs uppercase tracking-widest text-mercury/50 font-semibold mb-4">Core Configuration</h3>
                                
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs text-mercury/50 mb-1.5 font-medium">Business Name</label>
                                        <input
                                            type="text"
                                            value={selected.name || ''}
                                            onChange={(e) => handleChange('name', e.target.value)}
                                            className="w-full bg-obsidian border border-border-clinical rounded-lg px-3 py-2 text-sm text-mercury focus:border-archytech-violet/50 focus:outline-none transition-colors"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-mercury/50 mb-1.5 font-medium">Slug (URL Path)</label>
                                        <input
                                            type="text"
                                            value={selected.slug || ''}
                                            onChange={(e) => handleChange('slug', e.target.value)}
                                            className="w-full bg-obsidian border border-border-clinical rounded-lg px-3 py-2 text-sm text-mercury focus:border-archytech-violet/50 focus:outline-none transition-colors"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs text-mercury/50 mb-1.5 font-medium">Description</label>
                                    <textarea
                                        rows={3}
                                        value={selected.description || ''}
                                        onChange={(e) => handleChange('description', e.target.value)}
                                        className="w-full bg-obsidian border border-border-clinical rounded-lg px-3 py-2 text-sm text-mercury focus:border-archytech-violet/50 focus:outline-none transition-colors resize-none"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs text-mercury/50 mb-1.5 font-medium">Greeting Message</label>
                                    <textarea
                                        rows={2}
                                        value={selected.greeting || ''}
                                        onChange={(e) => handleChange('greeting', e.target.value)}
                                        className="w-full bg-obsidian border border-border-clinical rounded-lg px-3 py-2 text-sm text-mercury focus:border-archytech-violet/50 focus:outline-none transition-colors resize-none"
                                    />
                                </div>
                            </div>

                            {/* Knowledge Base */}
                            <div className="clinical-panel p-6">
                                <h3 className="text-xs uppercase tracking-widest text-mercury/50 font-semibold mb-4">Knowledge Base</h3>
                                <textarea
                                    rows={12}
                                    value={selected.knowledge_base || ''}
                                    onChange={(e) => handleChange('knowledge_base', e.target.value)}
                                    className="w-full bg-obsidian border border-border-clinical rounded-lg px-3 py-2 text-sm text-mercury font-mono focus:border-archytech-violet/50 focus:outline-none transition-colors resize-none"
                                    placeholder="Paste your business knowledge base here..."
                                />
                            </div>

                            {/* Language & Voice */}
                            <div className="clinical-panel p-6">
                                <h3 className="text-xs uppercase tracking-widest text-mercury/50 font-semibold mb-4">Voice & Language</h3>
                                <div className="grid grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-xs text-mercury/50 mb-1.5 font-medium">Primary Language</label>
                                        <select
                                            value={selected.language || 'auto'}
                                            onChange={(e) => handleChange('language', e.target.value)}
                                            className="w-full bg-obsidian border border-border-clinical rounded-lg px-3 py-2 text-sm text-mercury focus:border-archytech-violet/50 focus:outline-none transition-colors"
                                        >
                                            <option value="auto">Auto-Detect</option>
                                            <option value="en-US">English (US)</option>
                                            <option value="es-MX">Spanish (MX)</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs text-mercury/50 mb-1.5 font-medium">English Voice</label>
                                        <input
                                            type="text"
                                            value={selected.voice_en || ''}
                                            onChange={(e) => handleChange('voice_en', e.target.value)}
                                            className="w-full bg-obsidian border border-border-clinical rounded-lg px-3 py-2 text-sm text-mercury focus:border-archytech-violet/50 focus:outline-none transition-colors"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-mercury/50 mb-1.5 font-medium">Spanish Voice</label>
                                        <input
                                            type="text"
                                            value={selected.voice_es || ''}
                                            onChange={(e) => handleChange('voice_es', e.target.value)}
                                            className="w-full bg-obsidian border border-border-clinical rounded-lg px-3 py-2 text-sm text-mercury focus:border-archytech-violet/50 focus:outline-none transition-colors"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Status */}
                            <div className="clinical-panel p-6 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className={`w-3 h-3 rounded-full ${selected.active ? 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.4)]' : 'bg-red-400'}`} />
                                    <span className="text-sm font-medium">{selected.active ? 'Active' : 'Inactive'}</span>
                                </div>
                                <div className="text-xs text-mercury/40">
                                    ID: {selected.id}
                                </div>
                            </div>
                        </div>
                    )}
                </section>
            </div>
        </main>
    );
}
