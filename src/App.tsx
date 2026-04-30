import React, { useState, useRef, useEffect } from 'react';
import { Upload, Bug, Terminal, Shield, CheckCircle, ChevronRight, History, Play, AlertTriangle, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { analyzeCodeWithAlliance, parseDebateAndReport } from './services/geminiService';
import { saveBugHuntHistory } from './lib/firebase';

interface Message {
  persona: string;
  text: string;
}

interface Report {
  consensus: string;
  bugs: {
    severity: 'Low' | 'Medium' | 'High' | 'Critical';
    location: string;
    description: string;
    remediation: string;
  }[];
}

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [debateMessages, setDebateMessages] = useState<Message[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [finalReport, setFinalReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const debateEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll for "butter smooth" experience
  useEffect(() => {
    if (debateEndRef.current) {
      debateEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [debateMessages, streamingText]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      if (selected.name.match(/\.(ts|js|py)$/)) {
        setFile(selected);
        setError(null);
      } else {
        setError("Only .ts, .js, or .py files are supported.");
      }
    }
  };

  const startAnalysis = async () => {
    if (!file) return;

    setIsUploading(true);
    setDebateMessages([]);
    setStreamingText("");
    setFinalReport(null);
    setError(null);

    try {
      // 1. Upload to server (which puts it in Vercel Blob)
      const formData = new FormData();
      formData.append('file', file);

      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!uploadRes.ok) throw new Error("Upload failed");
      const blobData = await uploadRes.json();

      setIsUploading(false);
      setIsAnalyzing(true);

      // 2. Read file content to send to Gemini
      const reader = new FileReader();
      const codeContent = await new Promise<string>((resolve) => {
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.readAsText(file);
      });

      // 3. Analyze with Alliance Protocol
      let fullResponse = "";
      await analyzeCodeWithAlliance(codeContent, file.name, (chunk) => {
        setStreamingText(prev => prev + chunk);
        
        // Live parsing of messages to show them in the terminal
        const parsed = parseDebateAndReport(fullResponse + chunk);
        setDebateMessages(parsed.messages);
      });

      const { report, messages } = parseDebateAndReport(fullResponse + streamingText);
      setDebateMessages(messages);
      setFinalReport(report);
      
      // 4. Save to History
      if (report) {
        await saveBugHuntHistory({
          fileName: file.name,
          fileUrl: blobData.url,
          debateLog: messages,
          consensus: report.consensus,
          bugs: report.bugs
        });
      }

    } catch (err: any) {
      console.error(err);
      setError(err.message || "An error occurred during analysis.");
    } finally {
      setIsUploading(false);
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans selection:bg-orange-500/30">
      {/* Background decoration */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-orange-500/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[30%] h-[30%] bg-blue-500/10 rounded-full blur-[120px]" />
      </div>

      <main className="relative max-w-6xl mx-auto px-6 py-12">
        {/* Header */}
        <header className="mb-16 flex items-center justify-between">
          <div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tighter mb-2">
              ALLIANCE <span className="text-orange-500">CONSENSUS</span>
            </h1>
            <p className="text-zinc-500 font-mono text-sm tracking-widest uppercase">
              Multi-Model Vulnerability Audit Protocol v1.4
            </p>
          </div>
          <div className="hidden md:flex items-center gap-4 px-4 py-2 bg-zinc-900/50 border border-zinc-800 rounded-full">
            <span className="flex items-center gap-2 text-xs font-mono text-green-500">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              SYSTEMS ONLINE
            </span>
            <div className="w-px h-4 bg-zinc-800" />
            <span className="text-xs font-mono text-zinc-400">ENCRYPTION: AES-256</span>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Left Column: Input & Status */}
          <section className="space-y-8">
            {/* Upload Zone */}
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-orange-500/50 to-blue-500/50 rounded-2xl blur opacity-20 group-hover:opacity-40 transition" />
              <div className="relative bg-zinc-900/40 backdrop-blur-xl border border-zinc-800 p-8 rounded-2xl flex flex-col items-center justify-center min-h-[300px] text-center">
                <input 
                  type="file" 
                  className="absolute inset-0 opacity-0 cursor-pointer" 
                  onChange={handleFileUpload}
                  accept=".ts,.js,.py"
                />
                {file ? (
                  <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="space-y-4">
                    <div className="w-16 h-16 bg-orange-500/20 rounded-2xl flex items-center justify-center mx-auto border border-orange-500/30">
                      <Bug className="text-orange-500 w-8 h-8" />
                    </div>
                    <div>
                      <p className="font-medium text-lg text-white mb-1">{file.name}</p>
                      <p className="text-xs font-mono text-zinc-500">{(file.size / 1024).toFixed(2)} KB</p>
                    </div>
                    <button 
                      onClick={startAnalysis}
                      disabled={isAnalyzing || isUploading}
                      className="mt-6 px-8 py-3 bg-orange-500 hover:bg-orange-600 disabled:bg-zinc-800 text-black font-bold rounded-xl transition-all flex items-center gap-2 mx-auto"
                    >
                      {isAnalyzing ? <Loader2 className="animate-spin" /> : <Play className="w-4 h-4" />}
                      START AUDIT
                    </button>
                  </motion.div>
                ) : (
                  <>
                    <div className="w-16 h-16 bg-zinc-800/50 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                      <Upload className="text-zinc-400" />
                    </div>
                    <h3 className="text-xl font-medium mb-2">Initialize Payload</h3>
                    <p className="text-zinc-500 text-sm max-w-xs">
                      Drag and drop your source file (.ts, .js, .py) to begin the multi-persona cross-examination.
                    </p>
                  </>
                )}
              </div>
            </div>

            {/* Models Status */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { name: 'DeepSeek', role: 'Hunter', color: 'text-red-400' },
                { name: 'ChatGPT', role: 'Skeptic', color: 'text-blue-400' },
                { name: 'Gemini', role: 'Judge', color: 'text-purple-400' }
              ].map((m) => (
                <div key={m.name} className="p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl">
                  <div className={cn("text-[10px] font-mono mb-1", m.color)}>{m.role.toUpperCase()}</div>
                  <div className="text-sm font-bold">{m.name}</div>
                  <div className="mt-2 h-1 bg-zinc-800 rounded-full overflow-hidden">
                    <motion.div 
                      className={cn("h-full", m.name === 'Gemini' ? 'bg-purple-500' : m.name === 'DeepSeek' ? 'bg-red-500' : 'bg-blue-500')}
                      animate={isAnalyzing ? { x: ["-100%", "100%"] } : { x: 0 }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Error Message */}
            {error && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-3 text-red-500"
              >
                <AlertTriangle className="shrink-0" />
                <p className="text-sm font-medium">{error}</p>
              </motion.div>
            )}

            {/* History Feed */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-zinc-500 mb-2">
                <History className="w-4 h-4" />
                <span className="text-xs font-mono font-bold tracking-widest uppercase">RECENT_AUDITS</span>
              </div>
              <div className="space-y-3">
                {[
                  { name: 'auth_v2.ts', date: '2h ago', status: 'COMPLETED' },
                  { name: 'payment_gateway.py', date: '5h ago', status: 'COMPLETED' },
                ].map((item, i) => (
                  <div key={i} className="group p-4 bg-zinc-900/30 border border-zinc-800/50 rounded-xl hover:border-zinc-700 transition-colors flex items-center justify-between cursor-pointer">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-zinc-800 rounded-lg group-hover:bg-orange-500/10 transition-colors">
                        <Shield className="w-4 h-4 text-zinc-500 group-hover:text-orange-500" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-zinc-300 group-hover:text-white">{item.name}</div>
                        <div className="text-[10px] text-zinc-500 font-mono italic">{item.date}</div>
                      </div>
                    </div>
                    <div className="text-[10px] font-bold text-zinc-600 group-hover:text-orange-500 transition-colors">
                      VIEW_REPORT
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Right Column: Live Debate & Report */}
          <section className="space-y-6">
            {/* Debate Terminal */}
            <div className="bg-black border border-zinc-800 rounded-2xl overflow-hidden flex flex-col h-[500px]">
              <div className="bg-zinc-900/80 px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-orange-500" />
                  <span className="text-xs font-mono font-bold tracking-tight">ALLIANCE_DEBATE_LOG</span>
                </div>
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-zinc-800" />
                  <div className="w-2.5 h-2.5 rounded-full bg-zinc-800" />
                  <div className="w-2.5 h-2.5 rounded-full bg-zinc-800" />
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide">
                <AnimatePresence mode="popLayout">
                  {debateMessages.length === 0 && !isAnalyzing && (
                    <div className="h-full flex items-center justify-center text-zinc-700 font-mono text-sm uppercase italic">
                      Systems idle. Awaiting file initialization...
                    </div>
                  )}
                  {debateMessages.map((msg, i) => (
                    <motion.div 
                      key={i}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="space-y-2"
                    >
                      <div className="flex items-center gap-3">
                        <span className={cn(
                          "px-2 py-0.5 rounded text-[10px] font-mono font-bold",
                          msg.persona === 'DEEPSEEK' ? 'bg-red-500 text-black' :
                          msg.persona === 'CHATGPT' ? 'bg-blue-500 text-black' :
                          'bg-purple-500 text-black'
                        )}>
                          {msg.persona}
                        </span>
                        <div className="h-px flex-1 bg-zinc-900" />
                      </div>
                      <p className="text-zinc-400 font-mono text-xs leading-relaxed whitespace-pre-wrap pl-2 border-l border-zinc-800 ml-1">
                        {msg.text}
                      </p>
                    </motion.div>
                  ))}
                </AnimatePresence>
                {/* Streaming Chunk */}
                {isAnalyzing && (
                  <div className="animate-pulse text-orange-500 font-mono text-xs">
                    [SYSTEM]: INTERPRETING REAL-TIME SIGNALS...
                  </div>
                )}
                <div ref={debateEndRef} />
              </div>
            </div>

            {/* Final Report Card */}
            <AnimatePresence>
              {finalReport && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white text-black p-8 rounded-3xl space-y-6"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Shield className="w-6 h-6 text-green-600" />
                      <h2 className="text-2xl font-bold tracking-tight">CONSENSUS REACHED</h2>
                    </div>
                    <div className="px-3 py-1 bg-black text-white text-[10px] font-mono font-bold rounded-full">
                      REPORT_ID: {Math.random().toString(36).substr(2, 9).toUpperCase()}
                    </div>
                  </div>
                  
                  <div>
                    <p className="text-sm font-medium text-zinc-600 mb-4 leading-relaxed">
                      {finalReport.consensus}
                    </p>
                    
                    <div className="space-y-4">
                      {finalReport.bugs.map((bug, i) => (
                        <div key={i} className="p-4 bg-zinc-100 rounded-2xl border border-zinc-200">
                          <div className="flex items-center gap-2 mb-2">
                            <span className={cn(
                              "text-[10px] px-2 py-0.5 font-bold rounded",
                              bug.severity === 'Critical' ? 'bg-red-600 text-white' :
                              bug.severity === 'High' ? 'bg-orange-500 text-white' :
                              'bg-zinc-800 text-white'
                            )}>
                              {bug.severity.toUpperCase()}
                            </span>
                            <span className="text-xs font-mono text-zinc-500">LOC: {bug.location}</span>
                          </div>
                          <p className="text-sm font-bold mb-1">{bug.description}</p>
                          <p className="text-xs text-zinc-500 italic">Recommendation: {bug.remediation}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div className="pt-4 border-t border-zinc-200 flex items-center justify-between text-[10px] font-mono text-zinc-400">
                    <div className="flex items-center gap-1">
                      <CheckCircle className="w-3 h-3 text-green-500" />
                      CERTIFIED ALLIANCE AUDIT
                    </div>
                    <span>{new Date().toISOString()}</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        </div>
      </main>

      {/* Footer Branding */}
      <footer className="mt-12 text-center py-12 border-t border-zinc-900">
        <p className="text-zinc-600 text-[10px] font-mono tracking-widest uppercase">
          Proprietary Intelligence Core &copy; 2026 AI ALLIANCE
        </p>
      </footer>
    </div>
  );
}
