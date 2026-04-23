import React, { useState, useMemo, useEffect } from 'react';
import StellarMindMap from './StellarMindMap';
import NexusVertex from './NexusVertex';
import StellarGalaxy from './StellarGalaxy';
import PGPView from './PGPView';
import { Search, Folder, ChevronLeft, ChevronRight, LayoutGrid, Hash, Clock, Globe, Github, Twitter, BarChart3, Database, Filter, ExternalLink, Linkedin, MessageSquare, X, Activity, Code, Share2, Package, ListChecks, Bot, Orbit, ShieldCheck } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, CartesianGrid, Cell, PieChart, Pie, Legend, LineChart, Line, AreaChart, Area, ScatterChart, Scatter, ZAxis, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from 'recharts';

export default function App() {
   const [projectsData, setProjectsData] = useState<any[]>([]);
   const [isDataLoaded, setIsDataLoaded] = useState(false);
   const [theme, setTheme] = useState<'dark' | 'light'>('dark');

   const getInitialView = () => {
      const path = window.location.pathname.split('/').filter(Boolean).pop() || 'database';
      if (['database', 'analytics', 'vertexai', 'galaxy', 'pgpview'].includes(path)) return path as any;
      return 'database';
   };
   const [view, setView] = useState<'database' | 'analytics' | 'vertexai' | 'galaxy' | 'pgpview'>(getInitialView());

   useEffect(() => {
      fetch("/vertex/data/projects.json")
         .then(res => res.json())
         .then(data => {
            if (Array.isArray(data)) {
               setProjectsData(data);
               setIsDataLoaded(true);
            } else {
               throw new Error(data.error || "Malformed data received");
            }
         })
         .catch(err => {
            console.error("Failed to fetch lightweight projects manifest", err);
            // Fallback to empty to prevent infinite loading if API is truly broken, 
            // but log it clearly.
            setProjectsData([]);
            setIsDataLoaded(true);
         });
   }, []);

   useEffect(() => {
      const handlePopState = () => {
         const path = window.location.pathname.split('/').filter(Boolean).pop() || 'database';
         if (['database', 'analytics', 'vertexai', 'galaxy', 'pgpview'].includes(path)) setView(path as any);
         else setView('database');
      };
      window.addEventListener('popstate', handlePopState);
      return () => window.removeEventListener('popstate', handlePopState);
   }, []);

   const changeView = (newView: string) => {
      setView(newView as any);
      // Construct path relative to /vertex
      const base = '/vertex';
      window.history.pushState({}, '', base + '/' + newView);
   };

   // Search & Filters
   const [search, setSearch] = useState('');
   const [categoryFilter, setCategoryFilter] = useState('All');
   const [roundFilter, setRoundFilter] = useState('All');
   const [amountFilter, setAmountFilter] = useState('All');

   const [currentPage, setCurrentPage] = useState(1);
   const itemsPerPage = 24;

   const [selectedProject, setSelectedProject] = useState<any>(null);
   const [showStellarMap, setShowStellarMap] = useState<boolean>(false);

   // Derive filter options dynamically
   const categories = useMemo(() => ['All', ...new Set(projectsData.map(p => p.category).filter(Boolean))].sort(), [projectsData]);

   const rounds = useMemo(() => ['All', ...new Set(projectsData.flatMap(p => p.rounds || []))].sort((a, b) => {
      if (a === 'All') return -1;
      if (b === 'All') return 1;
      return parseInt(a as string) - parseInt(b as string);
   }).map(r => r === 'All' ? r : `Round ${r}`), [projectsData]);

   const amountOptions = [
      'All',
      '$10k - $50k',
      '$50k - $150k',
      '> $150k'
   ];

   // Helper to parse amount strings like "$1,200,000" into raw numbers
   const getAmountNum = (amountStr: string, project?: any) => {
      if (project && typeof project.amountValue === 'number') return project.amountValue;
      if (!amountStr || amountStr === 'Not publicly specified') return -1;
      const clean = amountStr.replace(/[$, ]/g, '');
      const num = parseFloat(clean);
      return isNaN(num) ? -1 : num;
   };

   // --- Internal Smart Search Engine & Filtering ---
   const filteredProjects = useMemo(() => {
      let result = projectsData.filter(p => {
         // 1. Basic Filters first (Category, Round, Amount)
         const matchesCat = categoryFilter === 'All' || p.category === categoryFilter;

         let matchesRound = roundFilter === 'All';
         if (roundFilter !== 'All') {
            const numericFilter = parseInt(roundFilter.replace('Round ', ''));
            if (p.rounds && p.rounds.length > 0) {
               matchesRound = p.rounds.includes(numericFilter);
            } else {
               const r = p.lastAwardedRound || p.Round;
               matchesRound = r && parseInt(r) === numericFilter;
            }
         }

         let matchesAmount = true;
         const amt = getAmountNum(p.amountAwarded, p);
         if (amountFilter === 'Funded Only') matchesAmount = amt > 0;
         else if (amountFilter === 'Undisclosed') matchesAmount = amt === -1;
         else if (amountFilter === '< $10k') matchesAmount = amt >= 0 && amt < 10000;
         else if (amountFilter === '$10k - $50k') matchesAmount = amt >= 10000 && amt <= 50000;
         else if (amountFilter === '$50k - $150k') matchesAmount = amt > 50000 && amt <= 150000;
         else if (amountFilter === '> $150k') matchesAmount = amt > 150000;

         return matchesCat && matchesRound && matchesAmount;
      });

      // 2. Smart Weighted Search
      if (search.trim()) {
         const q = search.toLowerCase();
         const keywords = q.split(/\s+/).filter(k => k.length > 1);

         const scored = result.map(p => {
            let score = 0;
            const title = (p.title || '').toLowerCase();
            const desc = (p.description || '').toLowerCase();
            const products = (p.productsAndServices || '').toLowerCase();

            // Exact match boosts
            if (title === q) score += 1000;
            if (title.startsWith(q)) score += 500;

            // Match per keyword
            keywords.forEach(k => {
               if (title.includes(k)) score += 100;
               if (products.includes(k)) score += 60;
               if (desc.includes(k)) score += 30;
               if (p.category?.toLowerCase().includes(k)) score += 10;
            });

            return { ...p, _score: score };
         });

         // Filter out those with 0 score and sort by relevance
         return scored.filter(p => p._score > 0).sort((a, b) => b._score - a._score);
      }

      return result;
   }, [search, categoryFilter, roundFilter, amountFilter, projectsData]);

   // Reset pagination on filter change
   useEffect(() => { setCurrentPage(1); }, [filteredProjects.length]);

   const totalPages = Math.max(1, Math.ceil(filteredProjects.length / itemsPerPage));
   const currentData = filteredProjects.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

   // --- Analytics Data Prep (computed client-side from loaded data) ---
   const validForAnalytics = filteredProjects.length > 0 ? filteredProjects : [];

   const catMap: Record<string, number> = {};
   const amountCatMap: Record<string, number> = {};
   validForAnalytics.forEach(p => {
      const c = p.category || 'Unknown';
      catMap[c] = (catMap[c] || 0) + 1;
      const amt = getAmountNum(p.amountAwarded, p);
      if (amt > 0) amountCatMap[c] = (amountCatMap[c] || 0) + amt;
   });
   const catChartData = Object.keys(catMap).map(k => ({ name: k, count: catMap[k], amount: amountCatMap[k] || 0 })).sort((a, b) => b.count - a.count).slice(0, 8);

   const roundMap: Record<string, number> = {};
   const amountRoundMap: Record<string, number> = {};
   validForAnalytics.forEach(p => {
      const r = p.lastAwardedRound || p.Round;
      if (r) {
         const num = parseInt(r);
         if (!isNaN(num) && num < 100) {
            roundMap[num] = (roundMap[num] || 0) + 1;
            const amt = getAmountNum(p.amountAwarded, p);
            if (amt > 0) amountRoundMap[num] = (amountRoundMap[num] || 0) + amt;
         }
      }
   });
   const roundChartData = Object.keys(roundMap)
      .map(k => ({ name: `R${k}`, count: roundMap[k], amount: amountRoundMap[parseInt(k)] || 0, raw: parseInt(k) }))
      .sort((a, b) => a.raw - b.raw);

   let cumulative = 0;
   const cumulativeRoundData = roundChartData.map(d => {
      cumulative += d.amount;
      return { ...d, cumulativeFunding: cumulative };
   });

   const roiScatterData = Object.keys(catMap).map(k => ({
      name: k,
      projectsCount: catMap[k],
      totalFunding: amountCatMap[k] || 0,
      averageFunding: (amountCatMap[k] || 0) / (catMap[k] || 1)
   })).filter(d => d.totalFunding > 0);

   const topRadarCats = Object.keys(catMap).sort((a, b) => catMap[b] - catMap[a]).slice(0, 5);
   const maxProjects = Math.max(1, ...topRadarCats.map(c => catMap[c]));
   const maxFunding = Math.max(1, ...topRadarCats.map(c => amountCatMap[c] || 0));
   const maxActive = Math.max(1, ...topRadarCats.map(c => validForAnalytics.filter(p => p.category === c && p.repoStatus === 'Active').length));

   const radarData = topRadarCats.map(cat => {
      const projects = catMap[cat];
      const funding = amountCatMap[cat] || 0;
      const active = validForAnalytics.filter(p => p.category === cat && p.repoStatus === 'Active').length;
      return {
         subject: cat.replace(' Protocols', '').replace(' Application', '').replace(' Tooling', '').replace(' Infrastructure', ' Infra'),
         'Project Volume': (projects / maxProjects) * 100,
         'Funding Magnitude': (funding / maxFunding) * 100,
         'Active Repos': (active / maxActive) * 100,
         rawProjects: projects,
         rawFunding: funding,
         rawActive: active
      };
   });

   const totalFunded = validForAnalytics.reduce((acc, p) => acc + (getAmountNum(p.amountAwarded, p) > 0 ? getAmountNum(p.amountAwarded, p) : 0), 0);

   const maturityData = useMemo(() => {
      const statusMap: Record<string, number> = {};
      validForAnalytics.forEach(p => {
         let s = p.integrationStatus || 'Development';
         if (s === 'Live (on Mainnet)' || s === 'Expansion' || s === 'Completed') s = 'Mainnet';
         if (s === 'Unknown' || s === 'Abandoned') s = 'Development';
         statusMap[s] = (statusMap[s] || 0) + 1;
      });
      return Object.entries(statusMap).map(([name, value]) => ({ name, value }));
   }, [validForAnalytics]);

   const sorobanData = useMemo(() => {
      const counts = { Yes: 0, No: 0 };
      validForAnalytics.forEach(p => {
         counts[p.usesSoroban ? 'Yes' : 'No']++;
      });
      return [
         { name: 'Soroban Native', value: counts.Yes, color: '#3b82f6' },
         { name: 'Stellar Classic', value: counts.No, color: '#94a3b8' }
      ];
   }, [validForAnalytics]);

   const COLORS = ['#2563eb', '#16a34a', '#9333ea', '#ea580c', '#dc2626', '#db2777', '#0891b2', '#ca8a04'];

   const CustomChartTooltip = ({ active, payload, label }: any) => {
      if (active && payload && payload.length) {
         return (
            <div className="bg-white border border-gray-200 p-3 rounded shadow-lg text-gray-900 text-sm">
               <p className="font-semibold text-gray-700 mb-1">{label || payload[0].name}</p>
               {payload.map((entry: any, index: number) => (
                  <p key={index} className="font-medium" style={{ color: entry.color }}>
                     {entry.name === 'amount' || entry.name === 'Amount' ? `$${entry.value.toLocaleString()}` : `${entry.value} Projects`}
                  </p>
               ))}
            </div>
         );
      }
      return null;
   };

   if (!isDataLoaded) {
      return (
         <div className="min-h-screen bg-[#050B18] flex items-center justify-center text-white font-mono flex-col gap-4">
            <Orbit className="w-12 h-12 text-blue-500 animate-spin" />
            <p className="animate-pulse">Initializing Vertex Core...</p>
         </div>
      );
   }

   return (
      <div className={`min-h-screen bg-gray-50 dark:bg-[#050B18] flex font-sans text-gray-900 dark:text-gray-100 selection:bg-blue-500/30 relative overflow-hidden ${theme}`}>

         {/* Background Elements */}
         <div className="fixed inset-0 pointer-events-none z-0 hidden dark:block">
            <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-blue-600/5 rounded-full blur-[120px] transform translate-x-1/2 -translate-y-1/2" />
            <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-purple-600/5 rounded-full blur-[100px] transform -translate-x-1/4 translate-y-1/4" />
            {/* Subtle Stars */}
            <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(255,255,255,0.15) 1px, transparent 0)', backgroundSize: '40px 40px' }} />
         </div>

         {/* Sidebar */}
         <aside className="w-64 border-r border-gray-200 dark:border-white/5 bg-white/60 dark:bg-gray-900/40 backdrop-blur-xl flex-shrink-0 hidden md:flex flex-col h-screen sticky top-0 z-10">
            {/* Workspace Brand */}
            <div className="p-5 flex items-center gap-3 border-b border-gray-200 dark:border-white/5 mb-2 hover:bg-indigo-50/50 dark:bg-white/5 cursor-pointer transition-colors group">
               <div className="w-8 h-8 rounded-lg bg-indigo-600 dark:bg-gradient-to-br dark:from-blue-600 dark:to-cyan-400 text-white flex items-center justify-center font-black text-sm shadow-[0_0_15px_rgba(0,0,0,0.1)] dark:shadow-[0_0_15px_rgba(37,99,235,0.4)] group-hover:scale-110 transition-transform">S</div>
               <div className="flex flex-col">
                  <span className="font-bold text-base tracking-tight text-gray-900 dark:text-white leading-none mb-1">Vertex</span>
                  <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium leading-none">By StellarViz</span>
               </div>
            </div>

            <div className="px-3 flex-1 overflow-y-auto custom-scrollbar">

               {/* Deep Search Engine Input */}
               <div className="mb-8 mt-4">
                  <div className="relative group">
                     <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500 group-focus-within:text-blue-400 transition-colors" />
                     <input
                        type="text"
                        placeholder="Search Universe..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-9 pr-3 py-2.5 bg-indigo-50/50 dark:bg-white/5 border border-indigo-100 dark:border-white/10 rounded-xl text-sm focus:outline-none focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 shadow-inner transition-all placeholder-gray-500 text-gray-900 dark:text-white"
                     />
                  </div>
               </div>

               <div className="text-[10px] font-black text-blue-600/40 dark:text-blue-400/40 mb-3 px-3 uppercase tracking-[0.2em]">Navigation</div>
               <div className="space-y-1 mb-8">
                  <button
                     onClick={() => changeView('database')}
                     className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${view === 'database' ? 'bg-blue-600/20 text-blue-700 dark:text-blue-400 border border-blue-500/20' : 'text-gray-700 dark:text-gray-400 hover:bg-indigo-50/50 dark:hover:bg-white/5 hover:text-indigo-900 dark:hover:text-white'}`}
                  >
                     <Database className="w-4 h-4" /> Orbital Board
                  </button>
                  <button
                     onClick={() => changeView('analytics')}
                     className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${view === 'analytics' ? 'bg-blue-600/20 text-blue-700 dark:text-blue-400 border border-blue-500/20' : 'text-gray-700 dark:text-gray-400 hover:bg-indigo-50/50 dark:hover:bg-white/5 hover:text-indigo-900 dark:hover:text-white'}`}
                  >
                     <BarChart3 className="w-4 h-4" /> Insights
                  </button>
                  <button
                     onClick={() => changeView('vertexai')}
                     className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${view === 'vertexai' ? 'bg-blue-600/20 text-blue-700 dark:text-blue-400 border border-blue-500/20' : 'text-gray-700 dark:text-gray-400 hover:bg-indigo-50/50 dark:hover:bg-white/5 hover:text-indigo-900 dark:hover:text-white'}`}
                  >
                     <Bot className="w-4 h-4" /> VertexAi
                  </button>
                  <button
                     onClick={() => changeView('galaxy')}
                     className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${view === 'galaxy' ? 'bg-blue-600/20 text-blue-700 dark:text-blue-400 border border-blue-500/20' : 'text-gray-700 dark:text-gray-400 hover:bg-indigo-50/50 dark:hover:bg-white/5 hover:text-indigo-900 dark:hover:text-white'}`}
                  >
                     <Orbit className="w-4 h-4" /> Galaxy View
                  </button>
                  <button
                     onClick={() => changeView('pgpview')}
                     className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${view === 'pgpview' ? 'bg-blue-600/20 text-blue-700 dark:text-blue-400 border border-blue-500/20' : 'text-gray-700 dark:text-gray-400 hover:bg-indigo-50/50 dark:hover:bg-white/5 hover:text-indigo-900 dark:hover:text-white'}`}
                  >
                     <ShieldCheck className="w-4 h-4 text-blue-500" /> PGP
                  </button>
               </div>

               <div className="text-[10px] font-black text-blue-600/40 dark:text-blue-400/40 mb-3 px-3 uppercase tracking-[0.2em] flex items-center justify-between">
                  <span>Theme Toggle</span>
               </div>
               <div className="px-3 mb-8">
                  <button
                     onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                     className="w-full flex items-center justify-between px-3 py-2.5 bg-indigo-50/50 dark:bg-white/5 border border-indigo-100 dark:border-white/10 rounded-xl text-sm font-bold text-gray-700 dark:text-gray-300 hover:bg-indigo-100 dark:hover:bg-white/10 transition-all shadow-sm"
                  >
                     {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                     <div className={`w-3 h-3 rounded-full ${theme === 'dark' ? 'bg-white shadow-[0_0_10px_white]' : 'bg-gray-800'}`}></div>
                  </button>
               </div>

               <div className="text-[10px] font-black text-blue-600/40 dark:text-blue-400/40 mb-3 px-3 uppercase tracking-[0.2em]">Community</div>
               <div className="px-3">
                  <a
                     href="https://x.com/Stellar_Viz"
                     target="_blank"
                     rel="noreferrer"
                     className="w-full flex items-center justify-between px-3 py-2.5 bg-indigo-50/50 dark:bg-white/5 border border-indigo-100 dark:border-white/10 rounded-xl text-sm font-bold text-gray-700 dark:text-gray-300 hover:bg-indigo-100 dark:hover:bg-white/10 transition-all shadow-sm"
                  >
                     Support us on X
                     <Twitter className="w-4 h-4 text-blue-400" />
                  </a>
               </div>
            </div>
         </aside>

         {/* Main Content Area */}
         <main className="flex-1 h-screen overflow-y-auto custom-scrollbar relative z-10">
            <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-10">

               {/* Main Title / View Selector */}
               <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
                  <div>
                     <h1 className="text-4xl font-black tracking-tight text-gray-900 dark:text-white mb-2">
                        Vertex
                     </h1>
                     <p className="text-gray-500 dark:text-gray-500 text-sm font-medium">The Intelligence Layer for the SCF projects</p>
                     <div className="mt-4 p-4 bg-blue-600/10 border border-blue-500/20 rounded-2xl backdrop-blur-md">
                        <a href="https://www.stellarviz.xyz/" className="text-blue-600 dark:text-blue-400 font-bold hover:underline flex items-center gap-2">
                           <ExternalLink className="w-4 h-4" />
                           Try Our Transaction Visualizer and Contract simulator now!
                        </a>
                     </div>
                  </div>

                  <div className="flex items-center bg-[#F7F6F3] dark:bg-white/5 border border-gray-300 dark:border-white/10 p-1 rounded-xl shadow-sm dark:shadow-xl backdrop-blur-md">
                     <button
                        onClick={() => changeView('database')}
                        className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all ${view === 'database' ? 'bg-white dark:bg-blue-600 shadow-sm border border-gray-200 dark:border-transparent text-gray-900 dark:text-white' : 'text-gray-500 hover:text-gray-900 dark:hover:text-gray-200'}`}
                     >
                        <LayoutGrid className="w-4 h-4" /> Board
                     </button>
                     <button
                        onClick={() => changeView('analytics')}
                        className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all ${view === 'analytics' ? 'bg-white dark:bg-blue-600 shadow-sm border border-gray-200 dark:border-transparent text-gray-900 dark:text-white' : 'text-gray-500 hover:text-gray-900 dark:hover:text-gray-200'}`}
                     >
                        <BarChart3 className="w-4 h-4" /> Insights
                     </button>
                     <button
                        onClick={() => changeView('vertexai')}
                        className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all ${view === 'vertexai' ? 'bg-white dark:bg-blue-600 shadow-sm border border-gray-200 dark:border-transparent text-gray-900 dark:text-white' : 'text-gray-500 hover:text-gray-900 dark:hover:text-gray-200'}`}
                     >
                        <Bot className="w-4 h-4" /> VertexAi
                     </button>
                     <button
                        onClick={() => changeView('galaxy')}
                        className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all ${view === 'galaxy' ? 'bg-white dark:bg-blue-600 shadow-sm border border-gray-200 dark:border-transparent text-gray-900 dark:text-white' : 'text-gray-500 hover:text-gray-900 dark:hover:text-gray-200'}`}
                     >
                        <Orbit className="w-4 h-4" /> Galaxy
                     </button>
                     <button
                        onClick={() => changeView('pgpview')}
                        className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all ${view === 'pgpview' ? 'bg-white dark:bg-blue-600 shadow-sm border border-gray-200 dark:border-transparent text-gray-900 dark:text-white' : 'text-gray-500 hover:text-gray-900 dark:hover:text-gray-200'}`}
                     >
                        <ShieldCheck className="w-4 h-4" /> PGP
                     </button>
                  </div>
               </div>

               {view === 'galaxy' && (
                  <div className="mb-12">
                     <StellarGalaxy projects={projectsData} />
                  </div>
               )}

               {view === 'vertexai' && (
                  <div className="mb-12">
                     <NexusVertex allProjects={projectsData} onOpenProject={(p) => setSelectedProject(p)} />
                  </div>
               )}

               {view === 'pgpview' && (
                  <div className="mb-12">
                     <PGPView />
                  </div>
               )}

               {view === 'analytics' && (
                  <div className="flex flex-col gap-8 mb-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
                     {/* Horizontal Action Bar / Filters replicated in Insights */}
                     <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-6 bg-white shadow-sm dark:bg-gray-900/40 border border-gray-200 dark:border-white/5 rounded-3xl backdrop-blur-xl shadow-2xl mb-4">
                        <div className="flex flex-col gap-2">
                           <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-400 ml-2">Project Sector</label>
                           <div className="relative group">
                              <Folder className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-orange-400" />
                              <select
                                 value={categoryFilter}
                                 onChange={(e) => setCategoryFilter(e.target.value)}
                                 className="w-full pl-11 pr-4 py-3 bg-[#F7F6F3] dark:bg-white/5 border border-gray-300 dark:border-white/10 rounded-2xl text-sm font-bold text-gray-900 dark:text-white focus:outline-none focus:border-blue-500/50 transition-all appearance-none cursor-pointer"
                              >
                                 {categories.map(c => <option key={c} value={c} className="bg-gray-900">{c}</option>)}
                              </select>
                           </div>
                        </div>

                        <div className="flex flex-col gap-2">
                           <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-400 ml-2">Round</label>
                           <div className="relative group">
                              <Clock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400" />
                              <select
                                 value={roundFilter}
                                 onChange={(e) => setRoundFilter(e.target.value)}
                                 className="w-full pl-11 pr-4 py-3 bg-[#F7F6F3] dark:bg-white/5 border border-gray-300 dark:border-white/10 rounded-2xl text-sm font-bold text-gray-900 dark:text-white focus:outline-none focus:border-blue-500/50 transition-all appearance-none cursor-pointer"
                              >
                                 {rounds.map(r => <option key={r} value={r} className="bg-gray-900">{r === 'All' ? 'All Rounds' : `Round ${r}`}</option>)}
                              </select>
                           </div>
                        </div>

                        <div className="flex flex-col gap-2">
                           <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-400 ml-2">Funding Magnitude</label>
                           <div className="relative group">
                              <Activity className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-green-400" />
                              <select
                                 value={amountFilter}
                                 onChange={(e) => setAmountFilter(e.target.value)}
                                 className="w-full pl-11 pr-4 py-3 bg-[#F7F6F3] dark:bg-white/5 border border-gray-300 dark:border-white/10 rounded-2xl text-sm font-bold text-gray-900 dark:text-white focus:outline-none focus:border-blue-500/50 transition-all appearance-none cursor-pointer"
                              >
                                 {amountOptions.map(a => <option key={a} value={a} className="bg-gray-900">{a}</option>)}
                              </select>
                           </div>
                        </div>
                     </div>
                     {/* Stats Summary overview cards */}
                     <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        {[
                           { label: 'Total Verified Projects', value: validForAnalytics.length, icon: Package, color: 'text-blue-500', bg: 'bg-blue-500/10' },
                           { label: 'Total Capital Allocated', value: `$${(totalFunded / 1000000).toFixed(2)}M`, icon: Activity, color: 'text-green-500', bg: 'bg-green-500/10' },
                           { label: 'Avg Award Amount', value: `$${(totalFunded / (validForAnalytics.filter(p => getAmountNum(p.amountAwarded, p) > 0).length || 1) / 1000).toFixed(1)}k`, icon: Hash, color: 'text-purple-500', bg: 'bg-purple-500/10' },
                           { label: 'Network Vitality', value: `${((validForAnalytics.filter(p => p.integrationStatus === 'Mainnet' || p.integrationStatus === 'Live (on Mainnet)').length / validForAnalytics.length) * 100).toFixed(1)}%`, icon: Orbit, color: 'text-orange-500', bg: 'bg-orange-500/10' },
                        ].map((stat, i) => (
                           <div key={i} className="border border-gray-200 dark:border-white/5 rounded-2xl p-4 bg-white dark:bg-gray-900/30 shadow-sm backdrop-blur-xl">
                              <div className="flex items-center gap-3 mb-2">
                                 <div className={`${stat.bg} p-2 rounded-lg`}>
                                    <stat.icon className={`w-4 h-4 ${stat.color}`} />
                                 </div>
                                 <span className="text-[10px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">{stat.label}</span>
                              </div>
                              <div className="text-xl font-black text-gray-900 dark:text-white tabular-nums">{stat.value}</div>
                           </div>
                        ))}
                     </div>

                     <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">

                        {/* Ecosystem Maturity & Soroban Usage */}
                        <div className="border border-gray-200 dark:border-white/5 rounded-2xl p-6 bg-white shadow-sm dark:bg-gray-900/40 backdrop-blur-xl shadow-2xl relative overflow-hidden group">
                           <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                              <Orbit className="w-32 h-32" />
                           </div>
                           <div className="flex items-center justify-between mb-8 relative z-10">
                              <div>
                                 <h3 className="text-sm font-black text-gray-900 dark:text-white flex items-center gap-2">
                                    <ListChecks className="w-4 h-4 text-orange-400" /> Infrastructure & Soroban Maturity
                                 </h3>
                                 <p className="text-[10px] text-gray-500 uppercase font-bold mt-1">Ecosystem adoption & tech stack distribution</p>
                              </div>
                              <div className="flex gap-2">
                                 <span className="text-[10px] bg-blue-500/10 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-full font-bold uppercase">Deployment Phase</span>
                                 <span className="text-[10px] bg-orange-500/10 text-orange-600 dark:text-orange-400 px-2 py-0.5 rounded-full font-bold uppercase">Soroban SDK</span>
                              </div>
                           </div>

                           <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-[300px]">
                              <div className="relative">
                                 <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                       <Pie
                                          data={maturityData}
                                          innerRadius={60}
                                          outerRadius={80}
                                          paddingAngle={5}
                                          dataKey="value"
                                       >
                                          {maturityData.map((entry, index) => (
                                             <Cell key={`cell-${index}`} fill={['#3b82f6', '#22c55e', '#f59e0b', '#ef4444'][index % 4]} stroke="none" />
                                          ))}
                                       </Pie>
                                       <RechartsTooltip content={({ active, payload }: any) => {
                                          if (active && payload && payload.length) {
                                             return (
                                                <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-white/10 p-3 rounded-lg shadow-xl">
                                                   <p className="text-xs font-black text-gray-900 dark:text-white mb-1 uppercase tracking-tighter">{payload[0].name}</p>
                                                   <p className="text-lg font-black text-blue-500">{payload[0].value} <span className="text-[10px] text-gray-400 ml-1">Projects</span></p>
                                                </div>
                                             );
                                          }
                                          return null;
                                       }} />
                                       <Legend verticalAlign="bottom" align="center" iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', paddingTop: '20px' }} />
                                    </PieChart>
                                 </ResponsiveContainer>
                                 <div className="absolute inset-0 flex items-center justify-center pointer-events-none mb-10">
                                    <div className="text-center">
                                       <span className="block text-[10px] text-gray-400 font-bold uppercase tracking-widest">Status</span>
                                       <span className="block text-lg font-black text-gray-900 dark:text-white">Stages</span>
                                    </div>
                                 </div>
                              </div>

                              <div className="relative">
                                 <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                       <Pie
                                          data={sorobanData}
                                          innerRadius={60}
                                          outerRadius={80}
                                          paddingAngle={5}
                                          dataKey="value"
                                       >
                                          {sorobanData.map((entry, index) => (
                                             <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                                          ))}
                                       </Pie>
                                       <RechartsTooltip content={({ active, payload }: any) => {
                                          if (active && payload && payload.length) {
                                             return (
                                                <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-white/10 p-3 rounded-lg shadow-xl">
                                                   <p className="text-xs font-black text-gray-900 dark:text-white mb-1 uppercase tracking-tighter">{payload[0].name}</p>
                                                   <p className="text-lg font-black text-orange-400">{payload[0].value} <span className="text-[10px] text-gray-400 ml-1">Projects</span></p>
                                                </div>
                                             );
                                          }
                                          return null;
                                       }} />
                                       <Legend verticalAlign="bottom" align="center" iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', paddingTop: '20px' }} />
                                    </PieChart>
                                 </ResponsiveContainer>
                                 <div className="absolute inset-0 flex items-center justify-center pointer-events-none mb-10">
                                    <div className="text-center">
                                       <span className="block text-[10px] text-gray-400 font-bold uppercase tracking-widest">Soroban</span>
                                       <span className="block text-lg font-black text-gray-900 dark:text-white">Usage</span>
                                    </div>
                                 </div>
                              </div>
                           </div>
                        </div>

                        {/* 1. ROI Scatter Matrix */}
                        <div className="border border-gray-200 dark:border-white/5 rounded-2xl p-6 bg-white shadow-sm dark:bg-gray-900/30 backdrop-blur-xl shadow-2xl">
                           <div className="flex items-center justify-between mb-6">
                              <h3 className="text-sm font-black text-gray-900 dark:text-white flex items-center gap-2">
                                 <Activity className="w-4 h-4 text-orange-400" /> ROI Scatter Matrix: Funding vs Volume
                              </h3>
                              <span className="text-[10px] bg-orange-500/10 text-orange-600 dark:text-orange-400 px-2 py-0.5 rounded-full font-bold uppercase">Dynamic Market Gap</span>
                           </div>
                           <div className="h-[350px]">
                              <ResponsiveContainer width="100%" height="100%">
                                 <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'} />
                                    <XAxis type="number" dataKey="projectsCount" name="Projects" unit="" label={{ value: 'Project Volume', position: 'insideBottom', offset: -10, fontSize: 10, fill: '#94a3b8' }} tick={{ fontSize: 10 }} />
                                    <YAxis type="number" dataKey="totalFunding" name="Funding" unit="$" tickFormatter={(v) => `$${v / 1000000}M`} label={{ value: 'Total Funding', angle: -90, position: 'insideLeft', fontSize: 10, fill: '#94a3b8' }} tick={{ fontSize: 10 }} />
                                    <ZAxis type="number" dataKey="averageFunding" range={[100, 2000]} name="Avg Funding" />
                                    <RechartsTooltip cursor={{ strokeDasharray: '3 3' }} content={({ active, payload }: any) => {
                                       if (active && payload && payload.length) {
                                          const data = payload[0].payload;
                                          return (
                                             <div className="bg-white dark:bg-[#0B1121] border border-gray-200 dark:border-white/10 p-4 rounded-xl shadow-2xl">
                                                <p className="font-black text-gray-900 dark:text-white mb-2">{data.name}</p>
                                                <div className="space-y-1 text-xs">
                                                   <p className="text-gray-500">Volume: <span className="text-gray-900 dark:text-blue-400 font-bold">{data.projectsCount} Projects</span></p>
                                                   <p className="text-gray-500">Funding: <span className="text-gray-900 dark:text-green-400 font-bold">${data.totalFunding.toLocaleString()}</span></p>
                                                   <p className="text-gray-500">Avg/Project: <span className="text-gray-900 dark:text-purple-400 font-bold">${Math.round(data.averageFunding).toLocaleString()}</span></p>
                                                </div>
                                             </div>
                                          );
                                       }
                                       return null;
                                    }} />
                                    <Scatter name="Categories" data={roiScatterData} fill="#3b82f6">
                                       {roiScatterData.map((entry: any, index: number) => (
                                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} fillOpacity={0.6} stroke={COLORS[index % COLORS.length]} strokeWidth={2} />
                                       ))}
                                    </Scatter>
                                 </ScatterChart>
                              </ResponsiveContainer>
                           </div>
                        </div>

                        {/* 2. Tech Activity Radar */}
                        <div className="border border-gray-200 dark:border-white/5 rounded-2xl p-6 bg-white shadow-sm dark:bg-gray-900/30 backdrop-blur-xl shadow-2xl">
                           <div className="flex items-center justify-between mb-6">
                              <h3 className="text-sm font-black text-gray-900 dark:text-white flex items-center gap-2">
                                 <Code className="w-4 h-4 text-purple-400" /> Sector Vitality Radar
                              </h3>
                              <span className="text-[10px] bg-purple-500/10 text-purple-600 dark:text-purple-400 px-2 py-0.5 rounded-full font-bold uppercase">Technical Depth</span>
                           </div>
                           <div className="h-[350px]">
                              <ResponsiveContainer width="100%" height="100%">
                                 <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
                                    <PolarGrid stroke={theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'} />
                                    <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 'bold' }} />
                                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                                    <Radar name="Project Volume" dataKey="Project Volume" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} />
                                    <Radar name="Funding Magnitude" dataKey="Funding Magnitude" stroke="#22c55e" fill="#22c55e" fillOpacity={0.2} />
                                    <Radar name="Active Repos" dataKey="Active Repos" stroke="#e11d48" fill="#e11d48" fillOpacity={0.2} />
                                    <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', paddingTop: '20px' }} />
                                    <RechartsTooltip content={({ active, payload }: any) => {
                                       if (active && payload && payload.length) {
                                          const data = payload[0].payload;
                                          return (
                                             <div className="bg-white dark:bg-[#0B1121] border border-gray-200 dark:border-white/10 p-4 rounded-xl shadow-2xl">
                                                <p className="font-black text-gray-900 dark:text-white mb-2">{data.subject}</p>
                                                <div className="space-y-1 text-xs">
                                                   <p className="text-blue-500 font-bold">Projects: {data.rawProjects}</p>
                                                   <p className="text-green-500 font-bold">Funding: ${(data.rawFunding / 1000).toFixed(0)}k</p>
                                                   <p className="text-red-500 font-bold">Active Repos: {data.rawActive}</p>
                                                </div>
                                             </div>
                                          );
                                       }
                                       return null;
                                    }} />
                                 </RadarChart>
                              </ResponsiveContainer>
                           </div>
                        </div>

                        {/* 3. Cumulative Velocity Area Chart */}
                        <div className="border border-gray-200 dark:border-white/5 rounded-2xl p-6 bg-white shadow-sm dark:bg-gray-900/30 backdrop-blur-xl shadow-2xl xl:col-span-2">
                           <div className="flex items-center justify-between mb-6">
                              <h3 className="text-sm font-black text-gray-900 dark:text-white flex items-center gap-2">
                                 <Share2 className="w-4 h-4 text-blue-400" /> Cumulative Ecosystem Velocity
                              </h3>
                              <span className="text-[10px] bg-blue-500/10 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-full font-bold uppercase">Funding Momentum</span>
                           </div>
                           <div className="h-[350px]">
                              <ResponsiveContainer width="100%" height="100%">
                                 <AreaChart data={cumulativeRoundData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} dy={10} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={(val) => `$${(val / 1000000).toFixed(1)}M`} />
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'} />
                                    <RechartsTooltip content={({ active, payload }: any) => {
                                       if (active && payload && payload.length) {
                                          return (
                                             <div className="bg-white dark:bg-[#0B1121] border border-gray-200 dark:border-white/10 p-4 rounded-xl shadow-2xl">
                                                <p className="font-black text-gray-900 dark:text-white mb-1">{payload[0].payload.name}</p>
                                                <p className="text-blue-500 font-bold text-lg">${(payload[0].value / 1000000).toFixed(2)}M</p>
                                                <p className="text-[10px] text-gray-500 uppercase font-black">Cumulative Total</p>
                                             </div>
                                          );
                                       }
                                       return null;
                                    }} />
                                    <Area type="monotone" dataKey="cumulativeFunding" stroke="#3b82f6" strokeWidth={3} fillOpacity={0.4} fill="#3b82f6" />
                                 </AreaChart>
                              </ResponsiveContainer>
                           </div>
                        </div>
                     </div>
                  </div>
               )}

               {view === 'database' && (
                  <>
                     {/* Horizontal Action Bar / Filters */}
                     <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8 p-6 bg-white shadow-sm dark:bg-gray-900/40 border border-gray-200 dark:border-white/5 rounded-3xl backdrop-blur-xl shadow-2xl animate-in fade-in slide-in-from-top-4 duration-500">
                        <div className="flex flex-col gap-2">
                           <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-400 ml-2">Project Sector</label>
                           <div className="relative group">
                              <Folder className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-orange-400" />
                              <select
                                 value={categoryFilter}
                                 onChange={(e) => setCategoryFilter(e.target.value)}
                                 className="w-full pl-11 pr-4 py-3 bg-[#F7F6F3] dark:bg-white/5 border border-gray-300 dark:border-white/10 rounded-2xl text-sm font-bold text-gray-900 dark:text-white focus:outline-none focus:border-blue-500/50 transition-all appearance-none cursor-pointer"
                              >
                                 {categories.map(c => <option key={c} value={c} className="bg-gray-900">{c}</option>)}
                              </select>
                           </div>
                        </div>

                        <div className="flex flex-col gap-2">
                           <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-400 ml-2">Round</label>
                           <div className="relative group">
                              <Clock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400" />
                              <select
                                 value={roundFilter}
                                 onChange={(e) => setRoundFilter(e.target.value)}
                                 className="w-full pl-11 pr-4 py-3 bg-[#F7F6F3] dark:bg-white/5 border border-gray-300 dark:border-white/10 rounded-2xl text-sm font-bold text-gray-900 dark:text-white focus:outline-none focus:border-blue-500/50 transition-all appearance-none cursor-pointer"
                              >
                                 {rounds.map(r => <option key={r} value={r} className="bg-gray-900">{r === 'All' ? 'All Rounds' : `Round ${r}`}</option>)}
                              </select>
                           </div>
                        </div>

                        <div className="flex flex-col gap-2">
                           <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-400 ml-2">Funding Magnitude</label>
                           <div className="relative group">
                              <Activity className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-green-400" />
                              <select
                                 value={amountFilter}
                                 onChange={(e) => setAmountFilter(e.target.value)}
                                 className="w-full pl-11 pr-4 py-3 bg-[#F7F6F3] dark:bg-white/5 border border-gray-300 dark:border-white/10 rounded-2xl text-sm font-bold text-gray-900 dark:text-white focus:outline-none focus:border-blue-500/50 transition-all appearance-none cursor-pointer"
                              >
                                 {amountOptions.map(a => <option key={a} value={a} className="bg-gray-900">{a}</option>)}
                              </select>
                           </div>
                        </div>
                     </div>

                     {/* Table View Component */}
                     <div className="border border-gray-200 dark:border-white/5 rounded-3xl overflow-hidden bg-white/90 shadow-sm dark:bg-gray-900/40 shadow-2xl backdrop-blur-xl mb-8">
                        <div className="overflow-x-auto">
                           <table className="w-full text-left text-sm whitespace-nowrap">
                              <thead>
                                 <tr className="bg-indigo-50/30 dark:bg-white/5 border-b border-gray-200 dark:border-white/5 text-gray-400 dark:text-blue-300/60 uppercase tracking-[0.1em] text-[10px] font-black">
                                    <th className="px-6 py-4 font-black flex items-center gap-2 border-r border-gray-200 dark:border-white/5">Name</th>
                                    <th className="px-6 py-4 font-black border-r border-gray-200 dark:border-white/5 text-center">Amount</th>
                                    <th className="px-6 py-4 font-black border-r border-gray-200 dark:border-white/5 text-center">Category</th>
                                    <th className="px-4 py-4 font-black border-r border-gray-200 dark:border-white/5 text-center">Round</th>
                                    <th className="hidden px-6 py-4 font-black border-r border-gray-200 dark:border-white/5 text-center">Status</th>
                                    <th className="px-6 py-4 font-black text-center">Links</th>
                                 </tr>
                              </thead>
                              <tbody className="divide-y divide-white/5">
                                 {currentData.length > 0 ? (
                                    currentData.map((project: any) => (
                                       <tr
                                          key={project.id || project.slug}
                                          onClick={() => setSelectedProject(project)}
                                          className="hover:bg-indigo-100/50 dark:hover:bg-blue-500/10 cursor-pointer group transition-all"
                                       >
                                          <td className="px-6 py-4 font-bold text-gray-900 dark:text-white flex items-center gap-4 border-r border-gray-100 dark:border-white/5 group-hover:bg-blue-500/5 transition-colors">
                                             {project.thumbnail?.url ? (
                                                <img src={project.thumbnail.url} className="w-8 h-8 rounded-lg object-cover border border-gray-200 dark:border-white/10 shadow-lg" alt="" referrerPolicy="no-referrer" />
                                             ) : (
                                                <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-white/5 border border-indigo-100 dark:border-white/10 text-gray-400 dark:text-gray-500 flex items-center justify-center text-xs font-black">
                                                   {(project.title || "P").charAt(0)}
                                                </div>
                                             )}
                                             <div className="flex flex-col gap-0.5">
                                                <div className="flex items-center gap-2">
                                                   <span className="group-hover:text-blue-700 dark:group-hover:text-blue-400 transition-colors font-bold whitespace-normal">{project.title}</span>
                                                </div>
                                             </div>
                                          </td>
                                          <td className="px-6 py-4 text-gray-600 dark:text-gray-400 border-r border-gray-100 dark:border-white/5 text-center group-hover:bg-blue-500/5 transition-colors">
                                             {project.amountAwarded && project.amountAwarded !== '' ? (
                                                <span className="px-2.5 py-1 bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/20 rounded-lg text-xs font-mono font-bold">{project.amountAwarded}</span>
                                             ) : (
                                                <span className="text-gray-400 dark:text-gray-600 italic text-xs">Undisclosed</span>
                                             )}
                                          </td>
                                          <td className="px-6 py-4 border-r border-gray-100 dark:border-white/5 text-center group-hover:bg-blue-500/5 transition-colors">
                                             <span className={`px-2.5 py-1 rounded-lg text-xs font-black ${project.category ? 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700'}`}>{project.category || 'Unknown'}</span>
                                          </td>
                                          <td className="px-6 py-4 text-gray-500 font-mono text-xs border-r border-gray-100 dark:border-white/5 text-center group-hover:bg-blue-500/5 transition-colors">
                                             {(() => {
                                                const r = (project.lastAwardedRound || project.Round || '').toString().replace(/Round\s+/i, '');
                                                if (r) {
                                                   const num = parseInt(r);
                                                   if (!isNaN(num)) return <span className="bg-indigo-50 dark:bg-white/5 px-2 py-1 rounded border border-indigo-100 dark:border-white/5 text-blue-600 dark:text-blue-400 font-black">R{num}</span>;
                                                   return <span className="bg-gray-100 dark:bg-white/5 px-2 py-1 rounded border border-gray-200 dark:border-white/5">{r}</span>;
                                                }
                                                return <span className="text-gray-300 dark:text-gray-600">--</span>;
                                             })()}
                                          </td>
                                          <td className="hidden px-6 py-4 border-r border-gray-100 dark:border-white/5 text-center group-hover:bg-blue-500/5 transition-colors">
                                             {project.repoStatus && (
                                                <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${project.repoStatus === 'Active' ? 'bg-cyan-500 text-white shadow-[0_0_15px_rgba(6,182,212,0.3)]' :
                                                   project.repoStatus === '404 Error' ? 'bg-red-500 text-white' :
                                                      project.repoStatus === 'Archived' ? 'bg-orange-500 text-white' :
                                                         'bg-gray-800 text-gray-400'
                                                   }`}>
                                                   {project.repoStatus}
                                                </span>
                                             )}
                                          </td>
                                          <td className="px-6 py-4 text-center group-hover:bg-blue-500/5 transition-colors">
                                             <div className="flex gap-2 justify-center">
                                                {project.website && <button onClick={(e) => { e.stopPropagation(); window.open(project.website, '_blank'); }} className="p-2 text-gray-400 dark:text-gray-500 hover:text-cyan-500 dark:hover:text-cyan-400 hover:bg-cyan-400/10 rounded-xl transition-all"><Globe className="w-4 h-4" /></button>}
                                                {project.github && <button onClick={(e) => { e.stopPropagation(); window.open(project.github, '_blank'); }} className="p-2 text-gray-400 dark:text-gray-500 hover:text-indigo-900 dark:hover:text-white hover:bg-white/10 rounded-xl transition-all"><Github className="w-4 h-4" /></button>}
                                             </div>
                                          </td>
                                       </tr>
                                    ))
                                 ) : (
                                    <tr>
                                       <td colSpan={6} className="px-4 py-16 text-center text-gray-500">
                                          <Search className="w-8 h-8 mx-auto text-gray-700 mb-3" />
                                          <p>No records match your exact criteria.</p>
                                          <button onClick={() => { setSearch(''); setCategoryFilter('All'); setRoundFilter('All'); setAmountFilter('All'); }} className="mt-2 text-sm text-blue-400 hover:underline">Clear all filters</button>
                                       </td>
                                    </tr>
                                 )}
                              </tbody>
                           </table>
                        </div>
                     </div>

                     {/* Pagination System */}
                     {totalPages > 1 && (
                        <div className="flex justify-between items-center text-sm text-gray-500 border-t border-white/5 pt-4">
                           <span>Showing {(currentPage - 1) * itemsPerPage + 1}-{Math.min(currentPage * itemsPerPage, filteredProjects.length)}</span>
                           <div className="flex gap-2">
                              <button
                                 onClick={() => setCurrentPage((p: number) => Math.max(1, p - 1))}
                                 disabled={currentPage === 1}
                                 className="flex items-center gap-1 px-3 py-1.5 rounded hover:bg-white/5 disabled:opacity-30 transition-colors"
                              >
                                 <ChevronLeft className="w-4 h-4" /> Prev
                              </button>
                              <button
                                 onClick={() => setCurrentPage((p: number) => Math.min(totalPages, p - -1))}
                                 disabled={currentPage === totalPages}
                                 className="flex items-center gap-1 px-3 py-1.5 rounded hover:bg-white/5 disabled:opacity-30 transition-colors"
                              >
                                 Next <ChevronRight className="w-4 h-4" />
                              </button>
                           </div>
                        </div>
                     )}
                  </>
               )}

               {/* Footer */}
               <footer className="mt-20 py-10 border-t border-gray-200 dark:border-white/5 text-center">
                  <p className="text-sm text-gray-500 dark:text-gray-400 flex flex-col items-center gap-2">
                     <span>Built with precision for the Stellar Ecosystem</span>
                     <a
                        href="https://github.com/NibrasD/stellar-transaction-visualizer/tree/main/vertex"
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 font-bold hover:underline"
                     >
                        <Github className="w-4 h-4" /> View on GitHub
                     </a>
                  </p>
               </footer>
            </div>
         </main>

         {/* Notion-style Page Peek Modal */}
         {selectedProject && (
            <div className="fixed inset-0 z-50 flex justify-center items-center bg-gray-900/10 dark:bg-gray-950/80 backdrop-blur-md p-4 md:p-8" onClick={() => setSelectedProject(null)}>
               <div
                  className="bg-white dark:bg-[#0B1121] rounded-xl shadow-[0_0_50px_rgba(0,0,0,0.5)] border border-gray-200 dark:border-white/10 w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden relative cursor-auto"
                  onClick={(e) => e.stopPropagation()}
               >
                  <button onClick={() => setSelectedProject(null)} className="absolute top-4 right-4 p-1.5 hover:bg-gray-100 dark:hover:bg-white/10 rounded-md text-gray-400 dark:text-gray-500 hover:text-gray-900 dark:hover:text-white z-10 transition-colors">
                     <X className="w-5 h-5" />
                  </button>

                  <div className="overflow-y-auto w-full flex-1 custom-scrollbar">

                     {/* Cover / Header Area */}
                     <div className="h-24 bg-indigo-50 dark:bg-gradient-to-r dark:from-blue-900/30 dark:to-indigo-900/30 border-b border-gray-200 dark:border-white/10 w-full relative"></div>

                     <div className="px-8 pb-10">
                        {/* Icon Overlay */}
                        <div className="w-20 h-20 bg-white dark:bg-[#131B2F] rounded-lg border border-gray-200 dark:border-white/10 shadow-lg flex items-center justify-center -mt-10 mb-6 relative overflow-hidden z-10">
                           {selectedProject.thumbnail?.url ? (
                              <img src={selectedProject.thumbnail.url} className="w-full h-full object-cover" alt="" referrerPolicy="no-referrer" />
                           ) : (
                              <span className="text-3xl font-bold text-gray-600">{(selectedProject.title || "PR").charAt(0)}</span>
                           )}
                        </div>

                        <div className="flex items-center justify-between mb-6">
                           <div className="flex flex-col gap-2">
                              <div className="flex items-center gap-3">
                                 <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">{selectedProject.title}</h1>
                                 {selectedProject.repoStatus && (
                                    <span className={`px-2.5 py-1 text-xs font-bold rounded-full border ${selectedProject.repoStatus === 'Active' ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' :
                                       selectedProject.repoStatus === '404 Error' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                                          selectedProject.repoStatus === 'Archived' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' :
                                             'bg-white/5 text-gray-400 border-white/10'
                                       }`}>
                                       {selectedProject.repoStatus}
                                    </span>
                                 )}
                              </div>
                           </div>
                           <button
                              onClick={() => setShowStellarMap(true)}
                              className="flex items-center gap-2 px-5 py-2.5 bg-[#5D5FEF] hover:bg-[#4A4CBE] text-white rounded-xl shadow-[0_4px_14px_0_rgba(93,95,239,0.39)] transition-all transform hover:-translate-y-0.5 font-semibold text-sm"
                           >
                              <Globe className="w-4 h-4" /> View as Stellar Map
                           </button>
                        </div>

                        {/* Properties Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6 mb-8 pb-8 border-b border-white/10">

                           <div className="flex items-center gap-4">
                              <div className="w-32 text-sm text-gray-400 flex items-center gap-2"><Folder className="w-4 h-4" /> Category</div>
                              <div className="text-sm font-medium text-white"><span className="px-3 py-1 bg-white/5 border border-white/10 rounded-lg text-gray-300">{selectedProject.category || 'N/A'}</span></div>
                           </div>

                           {(selectedProject.website || selectedProject.github || selectedProject.x || selectedProject.linkedin || selectedProject.discord) && (
                              <div className="flex items-center gap-4">
                                 <div className="w-32 text-sm text-gray-400 flex shrink-0 items-center gap-2"><Globe className="w-4 h-4" /> Links</div>
                                 <div className="text-sm font-medium flex flex-wrap gap-2.5">
                                    {selectedProject.website && <a href={selectedProject.website} target="_blank" rel="noreferrer" className="px-3 py-1.5 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 rounded-lg flex items-center gap-1.5 transition-colors border border-blue-500/20"><ExternalLink className="w-3.5 h-3.5" /> Web</a>}
                                    {selectedProject.github && <a href={selectedProject.github} target="_blank" rel="noreferrer" className="px-3 py-1.5 bg-indigo-50/50 dark:bg-white/5 text-gray-600 dark:text-gray-300 hover:bg-white/10 rounded-lg flex items-center gap-1.5 transition-colors border border-indigo-100 dark:border-white/10"><Github className="w-3.5 h-3.5" /> Repo</a>}
                                    {selectedProject.x && <a href={selectedProject.x} target="_blank" rel="noreferrer" className="px-3 py-1.5 bg-sky-500/10 text-sky-400 hover:bg-sky-500/20 rounded-lg flex items-center gap-1.5 transition-colors border border-sky-500/20"><Twitter className="w-3.5 h-3.5" /> X</a>}
                                    {selectedProject.linkedin && <a href={selectedProject.linkedin} target="_blank" rel="noreferrer" className="px-3 py-1.5 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 rounded-lg flex items-center gap-1.5 transition-colors border border-blue-500/20"><Linkedin className="w-3.5 h-3.5" /> LinkedIn</a>}
                                    {selectedProject.discord && <a href={selectedProject.discord} target="_blank" rel="noreferrer" className="px-3 py-1.5 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 rounded-lg flex items-center gap-1.5 transition-colors border border-indigo-500/20"><MessageSquare className="w-3.5 h-3.5" /> Discord</a>}
                                 </div>
                              </div>
                           )}

                           <div className="flex items-start gap-4 md:col-span-2 pt-2">
                              <div className="w-32 text-sm text-gray-400 dark:text-gray-500 dark:text-gray-400 flex flex-shrink-0 items-center gap-2 mt-2"><Clock className="w-4 h-4" /> Awards</div>
                              <div className="flex-1 space-y-3">
                                 {selectedProject.awards && selectedProject.awards.length > 0 ? (
                                    selectedProject.awards.sort((a: any, b: any) => b.round - a.round).map((award: any, idx: number) => (
                                       <div key={idx} className="bg-[#F7F6F3] dark:bg-white/5 border border-gray-300 dark:border-white/10 shadow-sm rounded-xl p-4 transition-all hover:border-blue-500/50 hover:shadow-[0_0_15px_rgba(59,130,246,0.1)]">
                                          <div className="flex justify-between items-center mb-3 border-b border-gray-200 dark:border-white/5 pb-2">
                                             <div className="flex items-center gap-2">
                                                <span className="text-xs font-bold bg-gray-100 dark:bg-blue-600 text-gray-700 dark:text-white px-2.5 py-1 rounded-md border border-gray-200 dark:border-transparent shadow-sm">Round {award.round}</span>
                                                <span className="text-xs font-medium text-gray-600 dark:text-gray-300 bg-white/10 border border-gray-200 dark:border-white/5 px-2 py-1.5 rounded-md">{award.awardType}</span>
                                             </div>
                                          </div>
                                          <div className="grid grid-cols-3 gap-4">
                                             <div>
                                                <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase font-bold tracking-wider mb-1">Awarded</p>
                                                <p className="text-[15px] font-mono font-bold text-green-400">{award.awarded}</p>
                                             </div>
                                             <div>
                                                <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase font-bold tracking-wider mb-1">Paid</p>
                                                <p className="text-[15px] font-mono font-bold text-cyan-400">{award.paid}</p>
                                             </div>
                                             <div>
                                                <div className="flex justify-between items-end mb-1">
                                                   <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase font-bold tracking-wider">Progress</p>
                                                   <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 dark:text-gray-400">{award.completion || '0%'}</span>
                                                </div>
                                                <div className="w-full bg-[#F7F6F3] dark:bg-white/5 rounded-full h-2 mt-1 shadow-inner overflow-hidden border border-gray-200 dark:border-white/5">
                                                   <div
                                                      className="bg-gradient-to-r from-blue-500 to-cyan-400 h-2 rounded-full transition-all duration-1000 shadow-[0_0_10px_rgba(34,211,238,0.5)]"
                                                      style={{
                                                         width: (() => {
                                                            if (!award.completion) return '0%';
                                                            const cleanComp = award.completion.replace('%', '');
                                                            const val = parseFloat(cleanComp);
                                                            if (!isNaN(val)) return `${Math.min(100, Math.max(0, val))}%`;

                                                            const awarded = parseFloat(award.awarded.replace(/[^0-9.]/g, ''));
                                                            const paid = parseFloat(award.paid.replace(/[^0-9.]/g, ''));
                                                            if (awarded > 0) return `${Math.min(100, (paid / awarded) * 100)}%`;
                                                            return '0%';
                                                         })()
                                                      }}
                                                   ></div>
                                                </div>
                                             </div>
                                          </div>
                                       </div>
                                    ))
                                 ) : (
                                    <div className="px-4 py-3 bg-[#F7F6F3] dark:bg-white/5 rounded-lg border border-gray-300 dark:border-white/10">
                                       <span className="text-sm text-gray-400 dark:text-gray-500 dark:text-gray-400 italic">No awarded rounds found. (Project might have only applied)</span>
                                    </div>
                                 )}
                              </div>
                           </div>
                        </div>

                        {/* Project Vitality Section */}
                        <div className="mb-8 p-4 bg-[#F9F8F6] dark:bg-white/[0.02] rounded-xl border border-gray-200 dark:border-white/5 flex flex-col md:flex-row gap-6">
                           <div className="flex-1">
                              <div className="flex items-center gap-2 text-xs font-bold text-gray-400 dark:text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                                 <Activity className="w-3.5 h-3.5 text-blue-400" /> Project Vitality
                              </div>

                              {(selectedProject.firstCommit || selectedProject.lastCommitDate || selectedProject.lastXPostDate || selectedProject.twitterFollowers) ? (
                                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {selectedProject.firstCommit && (
                                       <div className="flex items-start gap-3">
                                          <div className="p-2 bg-white shadow-sm dark:bg-[#131B2F] rounded-lg shadow-sm border border-gray-300 dark:border-white/10">
                                             <Code className="w-4 h-4 text-purple-400" />
                                          </div>
                                          <div>
                                             <p className="text-[10px] text-gray-400 dark:text-gray-500 font-bold uppercase">First Commit</p>
                                             <p className="text-xs font-bold text-gray-900 dark:text-white">{selectedProject.firstCommit.split('T')[0]}</p>
                                          </div>
                                       </div>
                                    )}
                                    {selectedProject.lastCommitDate && (
                                       <div className="flex items-start gap-3">
                                          <div className="p-2 bg-white shadow-sm dark:bg-[#131B2F] rounded-lg shadow-sm border border-gray-300 dark:border-white/10">
                                             <Code className="w-4 h-4 text-purple-400" />
                                          </div>
                                          <div>
                                             <p className="text-[10px] text-gray-400 dark:text-gray-500 font-bold uppercase">Latest Commit</p>
                                             <p className="text-xs font-bold text-gray-900 dark:text-white">{selectedProject.lastCommitDate.split('T')[0]}</p>
                                          </div>
                                       </div>
                                    )}
                                    {selectedProject.lastXPostDate && (
                                       <div className="flex items-start gap-3">
                                          <div className="p-2 bg-white shadow-sm dark:bg-[#131B2F] rounded-lg shadow-sm border border-gray-300 dark:border-white/10">
                                             <Twitter className="w-4 h-4 text-blue-400" />
                                          </div>
                                          <div>
                                             <p className="text-[10px] text-gray-400 dark:text-gray-500 dark:text-gray-400 font-bold uppercase">Latest X Activity</p>
                                             <div className="text-xs font-bold text-gray-900 dark:text-white">{selectedProject.lastXPostDate.split('T')[0]}</div>
                                          </div>
                                       </div>
                                    )}

                                    {selectedProject.twitterFollowers && (
                                       <div className="flex items-start gap-3 sm:col-span-1">
                                          <div className="p-2 bg-white shadow-sm dark:bg-[#131B2F] rounded-lg shadow-sm border border-gray-300 dark:border-white/10">
                                             <Share2 className="w-4 h-4 text-pink-500" />
                                          </div>
                                          <div>
                                             <p className="text-[10px] text-gray-400 dark:text-gray-500 dark:text-gray-400 font-bold uppercase">Community Size</p>
                                             <p className="text-xs font-bold text-gray-900 dark:text-white">{parseFloat(selectedProject.twitterFollowers).toLocaleString()} Followers</p>
                                          </div>
                                       </div>
                                    )}
                                 </div>
                              ) : (
                                 <div className="py-4 text-center">
                                    <p className="text-xs text-gray-400 dark:text-gray-500 italic">No activity logs processed yet for this project. Check back soon.</p>
                                 </div>
                              )}
                           </div>
                        </div>

                        {/* Description Section */}
                        <div className="mb-10">
                           <div className="flex items-center gap-2 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-4 border-b border-gray-300 dark:border-white/10 pb-2">
                              <ListChecks className="w-3.5 h-3.5 text-blue-400" /> Project Description
                           </div>
                           <div className="bg-indigo-50/20 dark:bg-white/5 border border-indigo-100/30 dark:border-white/10 rounded-xl p-6 shadow-sm overflow-hidden">
                              <div className="whitespace-pre-wrap break-words">
                                 {(selectedProject.description || "No detailed description exists for this project block.").split('\n').map((line: string, i: number) => {
                                    const trimmed = line.trim();
                                    if (!trimmed) return <div key={i} className="h-3" />;
                                    const isBullet = trimmed.startsWith('- ') || trimmed.startsWith('* ') || trimmed.startsWith('• ');
                                    const displayLine = isBullet ? trimmed.substring(2) : trimmed;
                                    const combinedRegex = /(\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*)/g;
                                    let lastIndex = 0;
                                    const elements = [];
                                    let match;
                                    while ((match = combinedRegex.exec(displayLine)) !== null) {
                                       elements.push(displayLine.substring(lastIndex, match.index));
                                       if (match[1].startsWith('[')) {
                                          elements.push(<a key={match.index} href={match[3]} target="_blank" rel="noreferrer" className="text-cyan-400 hover:text-cyan-300 hover:underline font-semibold decoration-cyan-400/50 underline-offset-2 transition-colors">{match[2]}</a>);
                                       } else {
                                          elements.push(<strong key={match.index} className="text-white font-bold tracking-tight">{match[4]}</strong>);
                                       }
                                       lastIndex = combinedRegex.lastIndex;
                                    }
                                    elements.push(displayLine.substring(lastIndex));
                                    return (
                                       <div key={i} className={`${isBullet ? 'pl-5 relative' : ''} ${trimmed.startsWith('**') && trimmed.endsWith('**') ? 'mt-5 mb-2.5 text-[15px]' : 'mb-1'} last:mb-0 leading-[1.6] text-[14px] text-gray-600 dark:text-gray-300`}>
                                          {isBullet && <span className="absolute left-1 top-2 w-1.5 h-1.5 rounded-full bg-cyan-400" />}
                                          {elements}
                                       </div>
                                    );
                                 })}
                              </div>
                           </div>
                        </div>

                        {/* Products & Services Section - RESTORED & PROMOTED */}
                        {selectedProject.productsAndServices && (
                           <div className="mb-10 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100">
                              <div className="flex items-center gap-2 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-4 border-b border-indigo-100 dark:border-white/10 pb-2">
                                 <Package className="w-3.5 h-3.5 text-blue-400" /> Products & Services
                              </div>
                              <div className="bg-indigo-50/30 dark:bg-white/5 border border-indigo-100/50 dark:border-white/10 rounded-2xl p-6 shadow-sm overflow-hidden text-[14px] leading-[1.6] text-gray-600 dark:text-gray-300">
                                 <div className="whitespace-pre-wrap break-words">
                                    {(selectedProject.productsAndServices || "").split('\n').map((line: string, i: number) => {
                                       const trimmed = line.trim();
                                       if (!trimmed) return <div key={i} className="h-3" />;
                                       const isBullet = trimmed.startsWith('- ') || trimmed.startsWith('* ') || trimmed.startsWith('• ');
                                       const displayLine = isBullet ? trimmed.substring(2) : trimmed;
                                       const combinedRegex = /(\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*)/g;
                                       let lastIndex = 0;
                                       const elements = [];
                                       let match;
                                       while ((match = combinedRegex.exec(displayLine)) !== null) {
                                          elements.push(displayLine.substring(lastIndex, match.index));
                                          if (match[1].startsWith('[')) {
                                             elements.push(<a key={match.index} href={match[3]} target="_blank" rel="noreferrer" className="text-cyan-400 hover:text-cyan-300 hover:underline font-semibold decoration-cyan-400/50 underline-offset-2 transition-colors">{match[2]}</a>);
                                          } else {
                                             elements.push(<strong key={match.index} className="text-white font-bold tracking-tight">{match[4]}</strong>);
                                          }
                                          lastIndex = combinedRegex.lastIndex;
                                       }
                                       elements.push(displayLine.substring(lastIndex));
                                       return (
                                          <div key={i} className={`${isBullet ? 'pl-5 relative' : ''} ${trimmed.startsWith('**') && trimmed.endsWith('**') ? 'mt-5 mb-2.5 text-[15px]' : 'mb-1'} last:mb-0 leading-[1.6] text-[14px]`}>
                                             {isBullet && <span className="absolute left-1 top-2 w-1.5 h-1.5 rounded-full bg-cyan-400/50 shadow-[0_0_8px_rgba(34,211,238,0.4)]" />}
                                             {elements}
                                          </div>
                                       );
                                    })}
                                 </div>
                              </div>
                           </div>
                        )}
                     </div>
                  </div>
               </div>
            </div>
         )}

         {/* Stellar Mind Map Override */}
         {showStellarMap && selectedProject && (
            <StellarMindMap
               project={selectedProject}
               onClose={() => setShowStellarMap(false)}
            />
         )}

         {/* Global Scrollbar Styles */}
         <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 14px; height: 14px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(59, 130, 246, 0.2); border-radius: 20px; border: 4px solid transparent; background-clip: content-box; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(59, 130, 246, 0.5); border: 4px solid transparent; background-clip: content-box; }
        
        @keyframes stellarPulse {
          0% { box-shadow: 0 0 5px rgba(6, 182, 212, 0.2); }
          50% { box-shadow: 0 0 20px rgba(6, 182, 212, 0.5); }
          100% { box-shadow: 0 0 5px rgba(6, 182, 212, 0.2); }
        }
      `}</style>
      </div>
   );
}
