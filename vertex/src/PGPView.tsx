import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, ShieldAlert, ShieldCheck, Code, FileText, AlertTriangle, Search, Filter, ExternalLink, ChevronDown, Activity, Lock, Cpu } from 'lucide-react';
import pgpData from './data/pgp_data.json';

export default function PGPView() {
  const [search, setSearch] = useState('');
  const [selectedProject, setSelectedProject] = useState<any>(null);

  const filteredProjects = pgpData.filter(p => 
    p.Project.toLowerCase().includes(search.toLowerCase())
  );

  const getScoreColor = (score: number | null) => {
    if (score === null) return 'text-gray-400 border-gray-400/20 bg-gray-400/5';
    if (score >= 5) return 'text-emerald-500 border-emerald-500/20 bg-emerald-500/5';
    if (score >= 3) return 'text-orange-500 border-orange-500/20 bg-orange-500/5';
    return 'text-red-500 border-red-500/20 bg-red-500/5';
  };

  const getScoreBadge = (score: number | null) => {
    if (score === null) return <Shield className="w-4 h-4" />;
    if (score >= 5) return <ShieldCheck className="w-4 h-4" />;
    if (score >= 3) return <Shield className="w-4 h-4" />;
    return <ShieldAlert className="w-4 h-4" />;
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header Section */}
      <div className="mb-12">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-blue-600/10 rounded-lg border border-blue-600/20">
            <ShieldCheck className="w-6 h-6 text-blue-500" />
          </div>
          <h1 className="text-3xl font-black text-gray-900 dark:text-white uppercase tracking-tighter">
            PGP <span className="text-blue-600">Security Watch</span>
          </h1>
        </div>
        <p className="text-gray-500 dark:text-gray-400 text-sm max-w-2xl font-medium leading-relaxed">
          The Public Good Projects (PGP) Security Watch monitors the health of critical Stellar ecosystem infrastructure. 
          Use this panel to analyze security scores, code coverage, and technical defects across all PGP-funded initiatives.
        </p>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-4 mb-8">
        <div className="relative flex-1 group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
          <input 
            type="text" 
            placeholder="Search security audits (e.g., 'SDK', 'Compiler')..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-2xl pl-12 pr-4 py-3.5 text-sm focus:outline-none focus:border-blue-500/50 shadow-sm transition-all"
          />
        </div>
        <button className="flex items-center gap-2 px-6 py-3.5 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg active:scale-95">
          <Filter className="w-4 h-4" /> Filter Metrics
        </button>
      </div>

      {/* Project Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredProjects.map((project, idx) => (
          <motion.div
            key={project.Project}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05 }}
            onClick={() => setSelectedProject(project)}
            className="group relative bg-white dark:bg-gray-900/50 backdrop-blur-xl border border-gray-200 dark:border-white/5 rounded-3xl p-6 cursor-pointer hover:border-blue-500/50 transition-all shadow-sm hover:shadow-2xl overflow-hidden"
          >
            {/* Background Glow */}
            <div className={`absolute -top-24 -right-24 w-48 h-48 blur-[80px] opacity-0 group-hover:opacity-20 transition-opacity ${getScoreColor(project.SecurityScore)}`} />

            <div className="flex justify-between items-start mb-6">
              <div>
                <span className="inline-block px-2 py-1 bg-gray-100 dark:bg-white/10 rounded-md text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-2">
                  {project.Category}
                </span>
                <h3 className="text-xl font-black text-gray-900 dark:text-white group-hover:text-blue-500 transition-colors tracking-tight">
                  {project.Project}
                </h3>
              </div>
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-black uppercase tracking-wider ${getScoreColor(project.SecurityScore)}`}>
                {getScoreBadge(project.SecurityScore)} {project.SecurityScore || 'N/A'}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-gray-50 dark:bg-white/5 p-3 rounded-2xl border border-gray-100 dark:border-white/5">
                <div className="flex items-center gap-2 mb-1">
                  <FileText className="w-3 h-3 text-blue-500" />
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Docs</span>
                </div>
                <div className="text-sm font-black text-gray-900 dark:text-white uppercase">
                  {project.DocCoverage}
                </div>
              </div>
              <div className="bg-gray-50 dark:bg-white/5 p-3 rounded-2xl border border-gray-100 dark:border-white/5">
                <div className="flex items-center gap-2 mb-1">
                  <Code className="w-3 h-3 text-purple-500" />
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Code</span>
                </div>
                <div className="text-sm font-black text-gray-900 dark:text-white">
                  {project.TotalCode.toLocaleString()} <span className="text-[10px] text-gray-500">LI</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className={`w-3 h-3 ${project.Defects.length > 5 ? 'text-red-500' : 'text-orange-400'}`} />
                <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
                  {project.Defects.length} Issues Found
                </span>
              </div>
              <ChevronDown className="w-4 h-4 text-gray-400 group-hover:text-blue-500 transition-colors" />
            </div>
          </motion.div>
        ))}
      </div>

      {/* Audit Detail Modal */}
      <AnimatePresence>
        {selectedProject && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedProject(null)}
              className="absolute inset-0 bg-gray-950/80 backdrop-blur-md"
            />
            <motion.div
              layoutId={selectedProject.Project}
              className="relative w-full max-w-3xl bg-white dark:bg-gray-900 rounded-[32px] overflow-hidden shadow-2xl border border-white/10"
            >
              <div className="p-10">
                <div className="flex justify-between items-start mb-10">
                  <div className="flex items-center gap-6">
                    <div className={`p-4 rounded-3xl border shadow-xl ${getScoreColor(selectedProject.SecurityScore)}`}>
                      <Cpu className="w-10 h-10" />
                    </div>
                    <div>
                      <span className="text-xs font-black text-blue-500 uppercase tracking-[0.3em] block mb-2 px-1">Detailed Audit Report</span>
                      <h2 className="text-4xl font-black text-gray-900 dark:text-white tracking-tighter uppercase">{selectedProject.Project}</h2>
                    </div>
                  </div>
                  <button 
                    onClick={() => setSelectedProject(null)}
                    className="p-3 bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 rounded-2xl transition-all"
                  >
                    <ChevronDown className="w-6 h-6 rotate-180" />
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-6 mb-12">
                  {[
                    { label: 'Overall Security', val: selectedProject.SecurityScore || 'Audit Pending', sub: 'Based on Scorecard V5', icon: <Lock className="w-4 h-4" color="#3B82F6"/> },
                    { label: 'Documentation', val: selectedProject.DocCoverage, sub: 'Coverage Metric', icon: <FileText className="w-4 h-4" color="#FACC15"/> },
                    { label: 'Codebase Size', val: `${selectedProject.TotalCode.toLocaleString()} lines`, sub: 'Total Volume', icon: <Activity className="w-4 h-4" color="#10B981"/> }
                  ].map((stat, i) => (
                    <div key={i} className="bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/10 p-6 rounded-3xl">
                      <div className="flex items-center gap-2 mb-3">
                         {stat.icon}
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{stat.label}</span>
                      </div>
                      <div className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">{stat.val}</div>
                      <div className="text-[10px] font-bold text-blue-500/60 mt-1 uppercase tracking-wider">{stat.sub}</div>
                    </div>
                  ))}
                </div>

                <div>
                  <h4 className="flex items-center gap-2 text-xs font-black text-gray-900 dark:text-white uppercase tracking-[0.2em] mb-6 pl-1">
                    <ShieldAlert className="w-4 h-4 text-red-500" />
                    Technical Vulnerabilities & Defects
                  </h4>
                  <div className="space-y-3 max-h-[300px] overflow-y-auto pr-4 custom-scrollbar">
                    {selectedProject.Defects.map((defect: string, i: number) => (
                      <div 
                        key={i} 
                        className="group flex gap-4 p-4 bg-red-500/5 hover:bg-red-500/10 border border-red-500/10 hover:border-red-500/30 rounded-2xl transition-all"
                      >
                        <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                        <span className="text-sm font-medium text-gray-600 dark:text-gray-300 leading-relaxed group-hover:text-red-500 dark:group-hover:text-red-400 transition-colors">
                          {defect}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-12 flex justify-between items-center bg-blue-600/5 p-6 rounded-3xl border border-blue-600/10">
                   <div className="text-sm font-bold text-blue-500/80">Strategy: {selectedProject.Project} should prioritize addressing the missing CI checks and SAST automation.</div>
                   <button className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest">
                     View Source <ExternalLink className="w-3 h-3" />
                   </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
