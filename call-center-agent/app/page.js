import Link from "next/link";
import { Mic, Terminal, Globe, ChevronRight } from "lucide-react";

export default function Home() {
  return (
    <main className="min-h-screen bg-obsidian text-mercury flex flex-col font-sans relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-archytech-violet/10 rounded-full blur-[160px] pointer-events-none" />
      
      {/* Navbar */}
      <nav className="flex justify-between items-center z-10 w-full max-w-7xl mx-auto p-6 md:p-10">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-archytech-violet/10 text-archytech-violet rounded-xl border border-archytech-violet/20">
            <Mic size={24} strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">Sovereign Agent</h1>
            <span className="text-[10px] text-mercury/60 uppercase tracking-[0.2em] font-medium block mt-0.5">Intelligence Infrastructure</span>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <Link href="/admin" className="text-sm font-semibold tracking-wide text-mercury/80 hover:text-archytech-violet transition-colors">
            Command Center
          </Link>
          <Link href="/agent/aethos" className="bg-mercury text-obsidian px-6 py-2.5 rounded-full text-sm font-bold shadow-[0_0_20px_rgba(229,231,235,0.1)] hover:shadow-[0_0_30px_rgba(229,231,235,0.3)] transition-all hover:scale-105 active:scale-95 flex items-center gap-2">
            Initiate Protocol <ChevronRight size={16} />
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="flex-1 flex flex-col items-center justify-center text-center p-6 mt-[-40px] z-10">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full clinical-panel mb-8">
          <span className="w-2 h-2 rounded-full bg-archytech-violet animate-pulse" />
          <span className="text-xs tracking-widest uppercase font-semibold text-archytech-violet">Autonomous Client-Interface System</span>
        </div>
        
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-[-0.04em] max-w-5xl leading-[1.05] mb-8 text-transparent bg-clip-text bg-gradient-to-br from-mercury to-mercury/40">
          Own the Air.<br />
          Eliminate the Middleware.
        </h1>
        
        <p className="text-lg md:text-xl text-mercury/70 max-w-3xl leading-relaxed mb-12">
          Architecting unmediated customer experiences through Autonomous Voice Infrastructure. 
          Convert inquiries into assets with <strong className="text-mercury font-semibold">0ms human latency.</strong>
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl w-full">
          {/* Feature 1 */}
          <div className="clinical-panel p-8 text-left group hover:border-archytech-violet/50 transition-colors">
            <div className="w-12 h-12 rounded-2xl bg-archytech-violet/10 flex items-center justify-center text-archytech-violet mb-6 group-hover:scale-110 transition-transform">
              <Terminal size={24} />
            </div>
            <h3 className="text-lg font-bold mb-3 tracking-tight">Clinical Precision</h3>
            <p className="text-sm text-mercury/60 leading-relaxed">
              Sovereign Agent is not a chatbot. It is a generative extension of your business intelligence, trained to act with absolute certainty.
            </p>
          </div>
          
          {/* Feature 2 */}
          <div className="clinical-panel p-8 text-left group hover:border-archytech-violet/50 transition-colors">
            <div className="w-12 h-12 rounded-2xl bg-archytech-violet/10 flex items-center justify-center text-archytech-violet mb-6 group-hover:scale-110 transition-transform">
              <Globe size={24} />
            </div>
            <h3 className="text-lg font-bold mb-3 tracking-tight">Native Multilingual</h3>
            <p className="text-sm text-mercury/60 leading-relaxed">
              Bilingual capabilities seamlessly bridging English and Spanish audiences. Dueño de cada interacción.
            </p>
          </div>

          {/* Feature 3 */}
          <div className="clinical-panel p-8 text-left group hover:border-archytech-violet/50 transition-colors">
            <div className="w-12 h-12 rounded-2xl bg-archytech-violet/10 flex items-center justify-center text-archytech-violet mb-6 group-hover:scale-110 transition-transform">
              <Mic size={24} />
            </div>
            <h3 className="text-lg font-bold mb-3 tracking-tight">Sovereignty Protocol</h3>
            <p className="text-sm text-mercury/60 leading-relaxed">
              Zero dependency on third-party receptionists. Own your scheduling and intelligence loop entirely in-house.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
