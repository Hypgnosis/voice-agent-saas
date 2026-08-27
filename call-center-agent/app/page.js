'use client';
import { useState } from 'react';
import Link from "next/link";
import Image from "next/image";
import { Terminal, Globe, ChevronRight, X, MessageCircle, Shield, Users, Zap, Calendar, Bot, Phone, Check, Lock, KeyRound, FileCheck, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";

const PRICING_TIERS = [
  {
    name: 'Starter',
    price: '$249',
    period: '/mo',
    tagline: 'Try it with real customers, fast.',
    features: [
      '1 AI agent (voice + WhatsApp)',
      'Platform-managed AI keys',
      'Up to 500 conversations/mo',
      'Cal.com booking integration',
      'Email support',
    ],
    highlight: false,
  },
  {
    name: 'Pro',
    price: '$599',
    period: '/mo',
    tagline: 'For businesses running this for real.',
    features: [
      'Up to 5 AI agents',
      'Bring your own Gemini & WhatsApp keys — no conversation caps',
      'Cal.com booking integration',
      'Custom knowledge base & voice personality',
      'Priority support',
    ],
    highlight: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    tagline: 'Healthcare & regulated industries.',
    features: [
      'Unlimited agents',
      'HIPAA-ready compliance tier (Vertex AI + signed BAA)',
      'Dedicated onboarding & SLA',
      'Dedicated account manager',
      'Custom integrations',
    ],
    highlight: false,
  },
];

const TRUST_POINTS = [
  { icon: Lock, title: 'Zero-Trust Multi-Tenant', desc: 'Every request is authenticated and scoped to its own tenant — no client can ever see another’s data.' },
  { icon: KeyRound, title: 'AES-256 Encrypted Credentials', desc: 'API keys and access tokens are encrypted at rest. Nothing sensitive is ever sent to the browser.' },
  { icon: Shield, title: 'Bring Your Own Keys', desc: 'Run inference and messaging under your own Google and Meta accounts — your usage, your data, your bill.' },
  { icon: FileCheck, title: 'HIPAA-Ready Tier Available', desc: 'A signed-BAA, Vertex AI-backed configuration for healthcare and regulated clients.' },
];

export default function Home() {
  const [showAgent, setShowAgent] = useState(false);
  const [demoForm, setDemoForm] = useState({ name: '', email: '', company: '', message: '' });
  const [demoStatus, setDemoStatus] = useState('idle'); // idle | submitting | success | error
  const [demoError, setDemoError] = useState('');

  const handleDemoChange = (field, value) => setDemoForm(prev => ({ ...prev, [field]: value }));

  const submitDemoRequest = async (e) => {
    e.preventDefault();
    setDemoStatus('submitting');
    setDemoError('');
    try {
      const res = await fetch('/api/demo-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(demoForm),
      });
      const data = await res.json();
      if (res.ok) {
        setDemoStatus('success');
        setDemoForm({ name: '', email: '', company: '', message: '' });
      } else {
        setDemoStatus('error');
        setDemoError(data.error || 'Something went wrong. Please try again.');
      }
    } catch {
      setDemoStatus('error');
      setDemoError('Network error. Please try again.');
    }
  };

  return (
    <main className="min-h-screen bg-obsidian text-mercury flex flex-col font-sans relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-archytech-violet/10 rounded-full blur-[160px] pointer-events-none" />
      <div className="absolute bottom-[-20%] left-[-10%] w-[40%] h-[40%] bg-archytech-violet/5 rounded-full blur-[200px] pointer-events-none" />
      
      {/* Navbar */}
      <nav className="flex justify-between items-center z-10 w-full max-w-7xl mx-auto p-6 md:p-10">
        <Link href="/" className="flex items-center gap-3 group">
          <Image
            src="/sovereign-agent-logo.png"
            alt="Sovereign Agent"
            width={44}
            height={44}
            className="rounded-xl group-hover:scale-105 transition-transform drop-shadow-[0_0_12px_rgba(139,92,246,0.4)]"
          />
          <div>
            <h1 className="text-lg font-bold tracking-tight">Sovereign Agent</h1>
            <span className="text-[10px] text-mercury/60 uppercase tracking-[0.2em] font-medium block mt-0.5">Multi-Tenant Voice AI Infrastructure</span>
          </div>
        </Link>
        <div className="flex items-center gap-4">
          <a
            href="#pricing"
            className="text-sm font-semibold tracking-wide text-mercury/80 hover:text-archytech-violet transition-colors hidden md:block"
          >
            Pricing
          </a>
          <a
            href="#demo"
            className="text-sm font-semibold tracking-wide text-mercury/80 hover:text-archytech-violet transition-colors hidden md:block"
          >
            Book a Demo
          </a>
          <button
            onClick={() => setShowAgent(true)}
            className="text-sm font-semibold tracking-wide text-mercury/80 hover:text-archytech-violet transition-colors flex items-center gap-2"
          >
            <MessageCircle size={16} /> Contact
          </button>
          <Link href="/portal" className="text-sm font-semibold tracking-wide text-mercury/80 hover:text-archytech-violet transition-colors flex items-center gap-2">
            <Users size={16} /> Client Portal
          </Link>
          <Link href="/admin/super" className="bg-mercury text-obsidian px-6 py-2.5 rounded-full text-sm font-bold shadow-[0_0_20px_rgba(229,231,235,0.1)] hover:shadow-[0_0_30px_rgba(229,231,235,0.3)] transition-all hover:scale-105 active:scale-95 flex items-center gap-2">
            <Shield size={16} /> Command Center <ChevronRight size={16} />
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="flex-1 flex flex-col items-center justify-center text-center p-6 mt-[-40px] z-10">
        {/* Hero Logo */}
        <div className="mb-8">
          <Image
            src="/sovereign-agent-logo.png"
            alt="Sovereign Agent Crown"
            width={140}
            height={140}
            className="drop-shadow-[0_0_40px_rgba(139,92,246,0.5)] animate-[float_6s_ease-in-out_infinite]"
            priority
          />
        </div>

        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full clinical-panel mb-8">
          <span className="w-2 h-2 rounded-full bg-archytech-violet animate-pulse" />
          <span className="text-xs tracking-widest uppercase font-semibold text-archytech-violet">Multi-Tenant Autonomous Voice Agent Platform</span>
        </div>
        
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-[-0.04em] max-w-5xl leading-[1.05] mb-8 text-transparent bg-clip-text bg-gradient-to-br from-mercury to-mercury/40">
          Your Business.<br />
          Your AI Agent.<br />
          Your Rules.
        </h1>
        
        <p className="text-lg md:text-xl text-mercury/70 max-w-3xl leading-relaxed mb-12">
          Deploy a fully autonomous voice and text AI agent for any business — trained on their knowledge, connected to their calendar, speaking their language. 
          Each client gets <strong className="text-mercury font-semibold">their own isolated command center.</strong>
        </p>

        <div className="flex gap-4 mb-16">
          <Link href="/portal" className="bg-archytech-violet text-white px-8 py-3.5 rounded-full text-sm font-bold shadow-[0_0_25px_rgba(139,92,246,0.3)] hover:shadow-[0_0_40px_rgba(139,92,246,0.5)] transition-all hover:scale-105 active:scale-95 flex items-center gap-2">
            Access Your Dashboard <ChevronRight size={16} />
          </Link>
          <button
            onClick={() => setShowAgent(true)}
            className="bg-mercury/10 text-mercury px-8 py-3.5 rounded-full text-sm font-bold border border-mercury/20 hover:bg-mercury/20 transition-all hover:scale-105 active:scale-95 flex items-center gap-2"
          >
            <MessageCircle size={16} /> Talk to Our Agent
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl w-full">
          {/* Feature 1 */}
          <div className="clinical-panel p-8 text-left group hover:border-archytech-violet/50 transition-colors">
            <div className="w-12 h-12 rounded-2xl bg-archytech-violet/10 flex items-center justify-center text-archytech-violet mb-6 group-hover:scale-110 transition-transform">
              <Zap size={24} />
            </div>
            <h3 className="text-lg font-bold mb-3 tracking-tight">Instant Deployment</h3>
            <p className="text-sm text-mercury/60 leading-relaxed">
              Onboard any business in minutes. Paste their knowledge base, connect their calendar, and deploy a production-grade voice agent — no code required.
            </p>
          </div>
          
          {/* Feature 2 */}
          <div className="clinical-panel p-8 text-left group hover:border-archytech-violet/50 transition-colors">
            <div className="w-12 h-12 rounded-2xl bg-archytech-violet/10 flex items-center justify-center text-archytech-violet mb-6 group-hover:scale-110 transition-transform">
              <Globe size={24} />
            </div>
            <h3 className="text-lg font-bold mb-3 tracking-tight">Multi-Tenant Isolation</h3>
            <p className="text-sm text-mercury/60 leading-relaxed">
              Every client gets their own secure dashboard, unique embed code, and isolated configuration. One platform, unlimited agents.
            </p>
          </div>

          {/* Feature 3 */}
          <div className="clinical-panel p-8 text-left group hover:border-archytech-violet/50 transition-colors">
            <div className="w-12 h-12 rounded-2xl bg-archytech-violet/10 flex items-center justify-center text-archytech-violet mb-6 group-hover:scale-110 transition-transform">
              <Calendar size={24} />
            </div>
            <h3 className="text-lg font-bold mb-3 tracking-tight">Cal.com + WhatsApp Ready</h3>
            <p className="text-sm text-mercury/60 leading-relaxed">
              Built-in calendar scheduling via Cal.com and WhatsApp Business API integration. The agent books appointments and replies to messages autonomously.
            </p>
          </div>
        </div>

        {/* How It Works */}
        <div className="max-w-5xl w-full mt-20 mb-16">
          <h2 className="text-3xl font-bold tracking-tight mb-12 text-transparent bg-clip-text bg-gradient-to-r from-mercury to-mercury/60">How It Works</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[
              { step: '01', title: 'Create Agent', desc: 'Name it, give it a slug, set its voice personality.', icon: Bot },
              { step: '02', title: 'Train It', desc: 'Paste the business knowledge base — services, prices, FAQs.', icon: Terminal },
              { step: '03', title: 'Connect', desc: 'Add Cal.com API key, WhatsApp Number ID, timezone.', icon: Phone },
              { step: '04', title: 'Deploy', desc: 'Embed on any website with an iframe. Done.', icon: Zap },
            ].map(({ step, title, desc, icon: Icon }) => (
              <div key={step} className="clinical-panel p-6 text-left relative overflow-hidden group hover:border-archytech-violet/30 transition-colors">
                <span className="absolute top-3 right-4 text-4xl font-black text-mercury/5 group-hover:text-archytech-violet/10 transition-colors">{step}</span>
                <div className="w-10 h-10 rounded-xl bg-archytech-violet/10 flex items-center justify-center text-archytech-violet mb-4">
                  <Icon size={20} />
                </div>
                <h4 className="text-sm font-bold mb-1">{title}</h4>
                <p className="text-xs text-mercury/50 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Trust & Security */}
        <div className="max-w-5xl w-full mt-20 mb-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {TRUST_POINTS.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="clinical-panel p-6 text-left">
                <div className="w-10 h-10 rounded-xl bg-archytech-violet/10 flex items-center justify-center text-archytech-violet mb-4">
                  <Icon size={20} />
                </div>
                <h4 className="text-sm font-bold mb-1.5">{title}</h4>
                <p className="text-xs text-mercury/50 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Pricing */}
        <div id="pricing" className="max-w-5xl w-full mt-20 mb-16 scroll-mt-24">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold tracking-tight mb-3 text-transparent bg-clip-text bg-gradient-to-r from-mercury to-mercury/60">Pricing</h2>
            <p className="text-sm text-mercury/50 max-w-lg mx-auto">Every tier can bring its own AI keys — your inference costs scale with your clients, not against your margin.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {PRICING_TIERS.map((tier) => (
              <div
                key={tier.name}
                className={`clinical-panel p-8 text-left relative flex flex-col ${
                  tier.highlight ? 'border-archytech-violet/50 shadow-[0_0_40px_rgba(139,92,246,0.15)]' : ''
                }`}
              >
                {tier.highlight && (
                  <span className="absolute -top-3 left-8 bg-archytech-violet text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full">
                    Most Popular
                  </span>
                )}
                <h3 className="text-lg font-bold tracking-tight mb-1">{tier.name}</h3>
                <p className="text-xs text-mercury/50 mb-6">{tier.tagline}</p>
                <div className="mb-6">
                  <span className="text-4xl font-extrabold tracking-tight">{tier.price}</span>
                  <span className="text-sm text-mercury/50">{tier.period}</span>
                </div>
                <ul className="space-y-3 mb-8 flex-1">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm text-mercury/70">
                      <Check size={16} className="text-archytech-violet shrink-0 mt-0.5" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <a
                  href="#demo"
                  className={`text-center px-6 py-3 rounded-xl text-sm font-bold transition-all hover:scale-105 active:scale-95 ${
                    tier.highlight
                      ? 'bg-archytech-violet text-white shadow-[0_0_25px_rgba(139,92,246,0.3)] hover:shadow-[0_0_40px_rgba(139,92,246,0.5)]'
                      : 'bg-mercury/10 text-mercury border border-mercury/20 hover:bg-mercury/20'
                  }`}
                >
                  {tier.price === 'Custom' ? 'Contact Sales' : 'Book a Demo'}
                </a>
              </div>
            ))}
          </div>
        </div>

        {/* Book a Demo */}
        <div id="demo" className="max-w-2xl w-full mt-4 mb-16 scroll-mt-24">
          <div className="clinical-panel p-8 md:p-10">
            {demoStatus === 'success' ? (
              <div className="text-center py-8">
                <CheckCircle2 size={40} className="mx-auto mb-4 text-green-400" />
                <h3 className="text-xl font-bold mb-2">Request received</h3>
                <p className="text-sm text-mercury/60">We&apos;ll reach out within 24 hours to schedule your demo.</p>
              </div>
            ) : (
              <>
                <div className="text-center mb-8">
                  <h2 className="text-2xl font-bold tracking-tight mb-2">Book a Demo</h2>
                  <p className="text-sm text-mercury/50">Tell us about your business and we&apos;ll reach out to set up a walkthrough.</p>
                </div>
                <form onSubmit={submitDemoRequest} className="space-y-4 text-left">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-mercury/50 mb-1.5 font-medium uppercase tracking-wider">Name *</label>
                      <input
                        type="text"
                        required
                        value={demoForm.name}
                        onChange={(e) => handleDemoChange('name', e.target.value)}
                        className="w-full bg-obsidian border border-border-clinical rounded-lg px-3 py-2.5 text-sm text-mercury focus:border-archytech-violet/50 focus:outline-none transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-mercury/50 mb-1.5 font-medium uppercase tracking-wider">Company *</label>
                      <input
                        type="text"
                        required
                        value={demoForm.company}
                        onChange={(e) => handleDemoChange('company', e.target.value)}
                        className="w-full bg-obsidian border border-border-clinical rounded-lg px-3 py-2.5 text-sm text-mercury focus:border-archytech-violet/50 focus:outline-none transition-colors"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-mercury/50 mb-1.5 font-medium uppercase tracking-wider">Email *</label>
                    <input
                      type="email"
                      required
                      value={demoForm.email}
                      onChange={(e) => handleDemoChange('email', e.target.value)}
                      className="w-full bg-obsidian border border-border-clinical rounded-lg px-3 py-2.5 text-sm text-mercury focus:border-archytech-violet/50 focus:outline-none transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-mercury/50 mb-1.5 font-medium uppercase tracking-wider">What are you looking to automate? (optional)</label>
                    <textarea
                      rows={3}
                      value={demoForm.message}
                      onChange={(e) => handleDemoChange('message', e.target.value)}
                      className="w-full bg-obsidian border border-border-clinical rounded-lg px-3 py-2.5 text-sm text-mercury focus:border-archytech-violet/50 focus:outline-none transition-colors resize-none"
                    />
                  </div>
                  {demoStatus === 'error' && (
                    <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                      <AlertTriangle size={14} />
                      {demoError}
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={demoStatus === 'submitting'}
                    className="w-full bg-archytech-violet text-white px-6 py-3.5 rounded-xl text-sm font-bold shadow-[0_0_25px_rgba(139,92,246,0.3)] hover:shadow-[0_0_40px_rgba(139,92,246,0.5)] transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center gap-2"
                  >
                    {demoStatus === 'submitting' ? <Loader2 size={16} className="animate-spin" /> : <ChevronRight size={16} />}
                    {demoStatus === 'submitting' ? 'Sending...' : 'Request Demo'}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 text-xs text-mercury/30 pb-8">
          <Image src="/sovereign-agent-logo.png" alt="" width={20} height={20} className="opacity-40" />
          Sovereign Agent Infrastructure — Built by <a href="https://high-archy.tech" target="_blank" rel="noopener" className="text-archytech-violet/60 hover:text-archytech-violet transition-colors">High ArchyTech</a>
        </div>
      </section>

      {/* Sovereign Agent Modal */}
      {showAgent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-lg h-[600px] bg-obsidian rounded-2xl border border-border-clinical shadow-2xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border-clinical">
              <div className="flex items-center gap-2">
                <Image src="/sovereign-agent-logo.png" alt="" width={20} height={20} className="drop-shadow-[0_0_6px_rgba(139,92,246,0.4)]" />
                <span className="text-xs font-semibold text-mercury/70 uppercase tracking-wider">Sovereign Agent — Live</span>
              </div>
              <button onClick={() => setShowAgent(false)} className="text-mercury/50 hover:text-mercury transition-colors">
                <X size={18} />
              </button>
            </div>
            <iframe
              src="/embed/sovereign-agent"
              className="flex-1 w-full border-none"
              allow="microphone"
              title="Sovereign Agent"
            />
          </div>
        </div>
      )}
    </main>
  );
}
