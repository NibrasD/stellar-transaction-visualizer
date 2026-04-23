import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Send, Bot, User, Brain, Search, Lightbulb, Rocket, X, ExternalLink, Github, Globe } from 'lucide-react';

import handbookData from './scf_handbook.json';
import brainData from './ecosystem_brain.json';

interface Project {
  title: string;
  description?: string;
  category?: string;
  website?: string;
  github?: string;
  thumbnail?: { url: string };
  amountAwarded?: string;
  Round?: string;
  productsAndServices?: string;
}

// API key is securely managed by the backend (server.ts)

async function callGemini(prompt: string): Promise<string> {
  try {
    const res = await fetch("/api/vertex", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt })
    });

    if (!res.ok) {
      if (res.status === 429) throw new Error("Our AI is currently taking a breather! Try again in a moment.");
      throw new Error(`AI service offline (Status: ${res.status}).`);
    }

    const data = await res.json();
    if (data.text) {
      return data.text;
    }
    
    throw new Error("Received empty response from neural link.");
  } catch (e: any) {
    throw new Error(e.message || "Neural link failed. Please check your connectivity.");
  }
}

// Intent mapping for semantic search
const INTENT_MAP: Record<string, string[]> = {
  'tipping': ['tip', 'reward', 'micropayment', 'monetize', 'social', 'content', 'pay', 'fan'],
  'reward': ['incentive', 'loyalty', 'earn', 'yield', 'cashback'],
  'content': ['media', 'publishing', 'blog', 'social', 'creator', 'article', 'news', 'video', 'music', 'podcast'],
  'defi': ['yield', 'lending', 'borrow', 'liquidity', 'amm', 'dex', 'swap', 'finance'],
  'social': ['community', 'network', 'chat', 'profile', 'forum', 'dao', 'governance', 'creator'],
  'payment': ['pay', 'checkout', 'remittance', 'fiat', 'stablecoin', 'wallet', 'transfer'],
  'escrow': ['secure', 'guarantee', 'trade', 'trust', 'marketplace', 'contract', 'agreement'],
  'rwa': ['real world asset', 'tokenization', 'property', 'gold', 'commodity']
};

const ARABIC_MAP: Record<string, string> = {
  'محتوى': 'content', 'منصة': 'platform', 'بناء': 'build', 'تمويل': 'funding', 'مشروع': 'project',
  'دفع': 'payment', 'ألعاب': 'gaming', 'عملات': 'crypto', 'اجتماعي': 'social', 'مالي': 'finance',
  'ضمان': 'escrow', 'أمان': 'security', 'وسيط': 'escrow'
};

const serializeDatabase = (projects: Project[]) => {
  return projects.map(p => {
    const funding = p.amountAwarded ? ` | Awarded: ${p.amountAwarded}` : '';
    const round = p.Round ? ` | Round: ${p.Round}` : '';
    const desc = (p.description || '').substring(0, 500);
    return `PROJECT: ${p.title} (${p.category})${funding}${round}\nSUMMARY: ${desc}`;
  }).join('\n---\n');
};

const renderMarkdownText = (text: string, allProjects?: Project[], onOpenProject?: (p: any) => void) => {
  const lines = text.split('\n');
  return lines.map((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) return <div key={i} className="h-2"></div>;

    // 1. Feature Headers (Special formatting for Vertex Brain)
    if (trimmed.startsWith('🛰️') || trimmed.startsWith('🚀') || trimmed.startsWith('🧠')) {
      return (
        <div key={i} className="flex items-center gap-2 mb-4 mt-2">
          <span className="text-xl">{trimmed.substring(0, 2)}</span>
          <h2 className="text-xs font-black uppercase tracking-[0.2em] text-blue-500/80 dark:text-blue-400/80 bg-blue-500/5 px-3 py-1.5 rounded-full border border-blue-500/10">
            {trimmed.substring(2).replace(/\*\*/g, '').trim()}
          </h2>
        </div>
      );
    }

    // 1.5 SubHeaders
    if (trimmed.startsWith('**') && trimmed.endsWith('**') && trimmed.length < 60) {
      return (
        <h3 key={i} className="text-[10px] font-black uppercase tracking-[0.25em] text-gray-500 dark:text-gray-400 mb-3 mt-6 ml-1 flex items-center gap-2">
          <div className="w-1 h-3 bg-blue-500/40 rounded-full" />
          {trimmed.replace(/\*\*/g, '')}
        </h3>
      );
    }

    // 1. Headings (###)
    if (trimmed.startsWith('### ')) {
      return (
        <h3 key={i} className="text-lg font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300 mt-6 mb-3 tracking-tight flex items-center gap-2">
          <div className="w-1.5 h-6 bg-blue-500 rounded-full"></div>
          {renderLineContent(trimmed.replace('### ', ''), allProjects, onOpenProject)}
        </h3>
      );
    }

    // 2. Bolded Titles as Headers (**Title**)
    if (trimmed.startsWith('**') && trimmed.endsWith('**') && !trimmed.slice(2, -2).includes('**')) {
      return (
        <h4 key={i} className="text-md font-black text-blue-500 dark:text-blue-400 mt-6 mb-3 flex items-center gap-2">
          <Sparkles className="w-4 h-4" />
          {trimmed.slice(2, -2)}
        </h4>
      );
    }

    // 3. Numbered Lists (1. )
    if (/^\d+\.\s/.test(trimmed)) {
      const content = trimmed.replace(/^\d+\.\s+/, '');
      return (
        <div key={i} className="flex gap-3 mb-3 ml-2">
          <span className="font-black text-blue-500 min-w-[20px]">{trimmed.match(/^\d+/)![0]}.</span>
          <span className="text-gray-700 dark:text-gray-300 leading-relaxed">
            {renderLineContent(content, allProjects, onOpenProject)}
          </span>
        </div>
      );
    }

    // 4. Bullet Points (* or -)
    if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
      const content = trimmed.replace(/^[\*\-]\s+/, '');
      return (
        <div key={i} className="flex gap-3 mb-2 ml-4">
          <div className="mt-2 w-1.5 h-1.5 rounded-full bg-blue-500/50 shadow-[0_0_5px_rgba(37,99,235,0.8)] flex-shrink-0"></div>
          <span className="text-gray-700 dark:text-gray-300 leading-relaxed">
            {renderLineContent(content, allProjects, onOpenProject)}
          </span>
        </div>
      );
    }

    // 5. Normal Paragraphs
    return (
      <p key={i} className="text-gray-700 dark:text-gray-300 leading-relaxed mb-3">
        {renderLineContent(line, allProjects, onOpenProject)}
      </p>
    );
  });
};

const renderLineContent = (line: string, allProjects?: Project[], onOpenProject?: (p: any) => void) => {
  const parts = line.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, j) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      const inner = part.slice(2, -2);
      // Check if this bold text matches a project name
      if (allProjects && onOpenProject) {
        const matchedProject = allProjects.find(p =>
          p.title.toLowerCase() === inner.toLowerCase() ||
          p.title.toLowerCase().includes(inner.toLowerCase()) ||
          inner.toLowerCase().includes(p.title.toLowerCase())
        );
        if (matchedProject) {
          return (
            <button
              key={j}
              onClick={() => onOpenProject(matchedProject)}
              className="font-black text-blue-500 dark:text-cyan-400 underline decoration-blue-500/30 underline-offset-2 hover:text-blue-400 hover:decoration-blue-400 transition-all cursor-pointer"
            >
              {inner} →
            </button>
          );
        }
      }
      return <strong key={j} className="font-black text-blue-600 dark:text-blue-300">{inner}</strong>;
    }
    return part;
  });
};

export default function NexusVertex({ allProjects, onOpenProject }: { allProjects: Project[], onOpenProject: (p: any) => void }) {
  const [messages, setMessages] = useState<{ role: 'bot' | 'user'; content: string; projects?: Project[] }[]>([
    { role: 'bot', content: "📡 Ask me about any project, round, or technical rule." }
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const handleSend = async () => {
    if (!input.trim() || isTyping) return;

    const userQuery = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: 'user', content: userQuery }]);
    setIsTyping(true);

    try {
      const queryLower = userQuery.toLowerCase();
      let responseText = "";
      let success = false;

      // Handle generic greetings
      const greetings = ["hi", "hello", "hey", "مرحباً", "اهلا", "سلام"];
      if (greetings.some(g => queryLower === g || queryLower.startsWith(g + " "))) {
        setMessages(prev => [...prev, { role: 'bot', content: "Hello! I am VertexAi. How can I help you navigate the Stellar ecosystem today?" }]);
        return;
      }

      // Handle SCF specific guideline queries
      const ruleKeywords = ["apply", "submit", "rule", "handbook", "guide", "eligibility", "condition", "track", "تقديم", "كيف اقدم", "كيف أقدم", "شروط", "قواعد", "خطوات"];
      if (ruleKeywords.some(k => queryLower.includes(k))) {
        const prompt = `The user is asking a question about the Stellar Community Fund (SCF) rules, tracks, or application process.
Question: "${userQuery}"

Here is the official SCF Handbook data:
${JSON.stringify(handbookData.sections, null, 2)}

Instructions:
- Answer the user's question directly and accurately using ONLY the handbook data provided above.
- Explain the steps clearly. Mention that they can find more details at https://stellar.gitbook.io/
- If the handbook doesn't contain the exact answer, say so, but provide the closest relevant information.
- Provide lists or bullet points for readability.
- If the user writes in Arabic, respond in Arabic. If in English, respond in English.`;

        const aiResponse = await callGemini(prompt);

        // Smart Project Matching from database
        const suggestedProjects: Project[] = [];
        const lowerResponse = aiResponse.toLowerCase();
        
        // Scan all projects to find mentions or relevance
        if (allProjects) {
            allProjects.forEach(p => {
                if (suggestedProjects.length >= 4) return;
                const pTitle = p.title.toLowerCase();
                // Match if title is mentioned or if it's a very highly relevant keyword
                if (lowerResponse.includes(pTitle) || 
                   (p.category && p.category.toLowerCase().includes(input.toLowerCase()) && suggestedProjects.length < 2)) {
                    if (!suggestedProjects.find(sp => sp.title === p.title)) {
                        suggestedProjects.push(p);
                    }
                }
            });
        }

        setMessages(prev => [...prev, { role: 'bot', content: aiResponse, projects: suggestedProjects }]);
        return;
      }

      // Search and rank projects locally
      const fillerWords = new Set(["i", "want", "to", "build", "on", "the", "a", "an", "is", "for", "with", "my", "project", "app", "platform", "how", "what", "does", "can", "rule", "guideline", "so", "not", "yes", "no", "do", "you", "think", "make"]);
      const rawTokens = queryLower.replace(/[^a-z0-9\u0600-\u06FF\s]/g, "").split(/\s+/);
      const keywords = rawTokens.map(t => ARABIC_MAP[t] || t).filter(k => k.length > 2 && !fillerWords.has(k));

      const expandedKeywords = [...new Set(keywords.flatMap(k => [k, ...(INTENT_MAP[k] || [])]))];

      const rankedSubset = allProjects.map(p => {
        let score = 0;
        const titleText = p.title.toLowerCase();
        const bodyText = ((p.description || "") + " " + (p.productsAndServices || "") + " " + (p.category || "")).toLowerCase();

        expandedKeywords.forEach(k => {
          if (titleText.includes(k)) score += 50;
          if (bodyText.includes(k)) score += 10;
          if ((p.category || "").toLowerCase().includes(k)) score += 30;
        });
        return { p, score };
      }).filter(item => item.score > 0).sort((a, b) => b.score - a.score).slice(0, 20).map(item => item.p);

      const displayProjects = rankedSubset.slice(0, 8);

      // Format prompt data for the AI
      const projectList = rankedSubset.map((p, i) =>
        `${i + 1}. ${p.title} (${p.category}) — ${p.amountAwarded || 'N/A'}\n   ${(p.description || 'No description.').substring(0, 300)}`
      ).join('\n\n');

      if (userQuery.length > 0) {
        try {
          const prompt = `The user said: "${userQuery}"

Here are the ${rankedSubset.length} most relevant projects from the Stellar Community Fund database that match their request:

${projectList}

---
Instructions:
- The list above is SORTED BY RELEVANCE. Projects near the top are the BEST matches. Prioritize them.
- Pick 5-7 projects from the list that BEST match what the user wants to build.
- For each project, explain in 1-2 sentences what it does and WHY it is relevant to the user's idea.
- If a project description says it does NOT do what the user wants (e.g., "no escrow"), skip it.
- Do NOT give a generic overview of the Stellar ecosystem. Only talk about the specific projects listed above.
- If the user writes in Arabic, respond in Arabic. If in English, respond in English.
- Keep your response short and focused.`;

          responseText = await callGemini(prompt);
          success = true;
        } catch (e) {
          // API unreachable fallback
        }
      }

      // Handle offline or fallback state
      if (!success) {
        if (rankedSubset.length > 0) {
          responseText = `Here are the most relevant projects I found for **"${userQuery}"**:\n\n${rankedSubset.slice(0, 5).map((p: any) => `- **${p.title}** (${p.category}) — ${p.amountAwarded || 'N/A'}`).join('\n')}\n\n_I'm in offline mode. Connect to the internet for detailed AI analysis._`;
        } else {
          responseText = "I couldn't find projects matching your query. Try asking about specific topics like 'escrow', 'content', 'payments', or 'DeFi'.";
        }
      }

      setMessages(prev => [...prev, {
        role: 'bot',
        content: responseText,
        projects: success ? [] : displayProjects
      }]);
    } catch (error: any) {
      setMessages(prev => [...prev, { role: 'bot', content: "Neural link disrupted. " + (error.message || "Unknown anomaly.") }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="flex flex-col h-[750px] bg-white/95 border-gray-100 dark:bg-gray-950/20 backdrop-blur-3xl rounded-3xl border border-gray-200 dark:border-white/5 overflow-hidden shadow-2xl relative">

      {/* Header Area */}
      <div className="p-6 border-b border-gray-200 dark:border-white/5 bg-[#F9F8F6] dark:bg-white/[0.02] backdrop-blur-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="relative">
              <motion.div
                className="w-12 h-12 rounded-xl bg-gradient-to-tr from-blue-600 to-cyan-400 flex items-center justify-center shadow-[0_0_20px_rgba(6,182,212,0.4)]"
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              >
                <Bot className="w-6 h-6 text-gray-900 dark:text-white" />
              </motion.div>
              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 border-2 border-white dark:border-gray-950 rounded-full animate-pulse"></div>
            </div>
            <div>
              <h2 className="text-xl font-black text-gray-900 dark:text-white tracking-tight">VertexAi</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest">Powered by Gemini</span>
              </div>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-3">
            <div className="flex -space-x-2">
              <div className="w-8 h-8 rounded-full bg-blue-500/10 border border-gray-200 dark:border-white/10 flex items-center justify-center backdrop-blur-sm"><Brain className="w-4 h-4 text-blue-400" /></div>
              <div className="w-8 h-8 rounded-full bg-purple-500/10 border border-gray-200 dark:border-white/10 flex items-center justify-center backdrop-blur-sm"><Sparkles className="w-4 h-4 text-purple-400" /></div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Messages Area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar scroll-smooth"
      >
        <AnimatePresence initial={false}>
          {messages.map((m, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.4 }}
              className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`flex gap-4 max-w-[90%] ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center relative ${m.role === 'user' ? 'bg-blue-600 shadow-lg shadow-blue-500/20' : 'bg-blue-600/10 border border-blue-500/20 shadow-[0_0_15px_rgba(37,99,235,0.1)]'
                  }`}>
                  {m.role === 'user' ? <User className="w-5 h-5 text-white" /> : <Bot className="w-6 h-6 text-blue-400" />}
                  {m.role === 'bot' && <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-[#010309] animate-pulse"></div>}
                </div>

                <div className={`space-y-4 flex-1 ${m.role === 'user' ? 'text-right' : ''}`}>
                  <div className={`p-5 rounded-3xl relative overflow-hidden transition-all ${m.role === 'user'
                    ? 'bg-blue-600 text-white shadow-xl rounded-tr-none'
                    : 'bg-white/90 dark:bg-gray-900/50 backdrop-blur-xl border border-gray-200 dark:border-white/10 shadow-2xl rounded-tl-none'
                    }`}>
                    {/* AI Glow Effect */}
                    {m.role === 'bot' && (
                      <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 blur-[40px] -mr-16 -mt-16 pointer-events-none"></div>
                    )}

                    <div className="relative z-10 text-sm leading-relaxed">
                      {renderMarkdownText(m.content, allProjects, onOpenProject)}
                    </div>
                  </div>

                  {/* Project Suggestion Cards */}
                  {m.projects && m.projects.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
                      {m.projects.map((p, pIdx) => (
                        <motion.div
                          key={pIdx}
                          whileHover={{ y: -5, scale: 1.02 }}
                          onClick={() => onOpenProject(p)}
                          className="bg-white/50 dark:bg-white/5 border border-indigo-100 dark:border-white/10 rounded-2xl p-4 flex gap-4 cursor-pointer hover:border-blue-500/50 hover:bg-blue-500/5 transition-all group shadow-sm"
                        >
                          {p.thumbnail?.url ? (
                            <img src={p.thumbnail.url} className="w-12 h-12 rounded-xl object-cover shadow-sm" alt="" />
                          ) : (
                            <div className="w-12 h-12 rounded-xl bg-gray-200 dark:bg-gray-800 flex items-center justify-center text-sm font-black text-gray-500">
                              {p.title.charAt(0)}
                            </div>
                          )}
                          <div className="min-w-0 flex flex-col justify-center">
                            <h4 className="text-gray-900 dark:text-white text-xs font-black truncate group-hover:text-blue-500 transition-colors uppercase tracking-tight">{p.title}</h4>
                            <p className="text-[10px] text-blue-600 dark:text-blue-400 font-bold uppercase tracking-widest mt-0.5">{p.category || 'Ecosystem'}</p>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {isTyping && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-4"
          >
            <div className="w-8 h-8 rounded-lg bg-[#F7F6F3] dark:bg-white/5 border border-gray-300 dark:border-white/10 flex items-center justify-center">
              <Bot className="w-4 h-4 text-blue-400 animate-pulse" />
            </div>
            <div className="flex gap-1.5">
              <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1 }} className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="w-1.5 h-1.5 rounded-full bg-blue-500" />
            </div>
          </motion.div>
        )}
      </div>

      {/* 3. Input Area */}
      <div className="p-6 bg-[#F9F8F6] dark:bg-white/[0.02] border-t border-gray-200 dark:border-white/5">
        <div className="max-w-3xl mx-auto relative group">
          <input
            type="text"
            placeholder="Describe your vision (e.g., 'I want to build a decentralized escrow app'...)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            className="w-full bg-[#F7F6F3] dark:bg-white/5 border border-gray-300 dark:border-white/10 rounded-2xl pl-5 pr-14 py-4 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500/50 shadow-inner group-focus-within:ring-4 group-focus-within:ring-blue-500/10 transition-all"
          />
          <button
            onClick={handleSend}
            disabled={isTyping || !input.trim()}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-blue-600 hover:bg-blue-500 text-gray-900 dark:text-white rounded-xl flex items-center justify-center transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>

        <div className="flex justify-center gap-4 mt-4">
          {[
            { label: "Content Platform", icon: <Lightbulb className="w-3 h-3" /> },
            { label: "DeFi Protocol", icon: <Rocket className="w-3 h-3" /> },
            { label: "AI & Oracles", icon: <Brain className="w-3 h-3" /> }
          ].map((tag, i) => (
            <button
              key={i}
              onClick={() => setInput(`I want to build a ${tag.label.toLowerCase()}`)}
              className="text-[10px] font-bold text-gray-400 dark:text-gray-500 hover:text-blue-400 bg-[#F7F6F3] dark:bg-white/5 hover:bg-white/10 border border-gray-200 dark:border-white/5 px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 uppercase tracking-wider"
            >
              {tag.icon} {tag.label}
            </button>
          ))}
        </div>
      </div>

      {/* Background Ambience Particles */}
      <div className="absolute inset-0 pointer-events-none opacity-10">
        <div className="absolute top-1/4 left-1/4 w-32 h-32 bg-blue-500 blur-[80px]" />
        <div className="absolute bottom-1/4 right-1/4 w-32 h-32 bg-purple-500 blur-[80px]" />
      </div>

    </div>
  );
}
