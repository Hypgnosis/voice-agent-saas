'use client';
import { useState } from 'react';
import Link from "next/link";
import Image from "next/image";
import { Terminal, Globe, ChevronRight, X, MessageCircle, Shield, Users, Zap, Calendar, Bot, Phone } from "lucide-react";

export default function Home() {
  const [showAgent, setShowAgent] = useState(false);

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
