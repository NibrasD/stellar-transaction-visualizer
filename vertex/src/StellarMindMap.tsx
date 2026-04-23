import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Globe, Github, DollarSign, Folder, Clock, Activity, ExternalLink, Network, Sparkles, X } from 'lucide-react';

export default function StellarMindMap({ project, onClose }: { project: any, onClose: () => void }) {
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Initial Background Layout
  const starsArray = Array.from({ length: 120 }).map((_, i) => ({
    id: i,
    top: `${Math.random() * 100}%`,
    left: `${Math.random() * 100}%`,
    size: Math.random() * 2 + 0.5,
    delay: Math.random() * 5,
    opacity: Math.random() * 0.7 + 0.1
  }));

  // Orbiting Node Configurations
  const branches = [
    { id: 'funding', angle: -54, label: 'Funding', icon: <DollarSign className="w-6 h-6"/>, value: project.amountAwarded || "Undisclosed", color: 'from-[#00E1A7] to-[#019875]', glow: 'rgba(0,225,167,0.5)' },
    { id: 'category', angle: 18, label: 'Category', icon: <Folder className="w-6 h-6"/>, value: project.category || "Unknown", color: 'from-[#9B51E0] to-[#561BB3]', glow: 'rgba(155,81,224,0.5)' },
    { id: 'round', angle: 90, label: 'Round', icon: <Clock className="w-6 h-6"/>, value: `Round ${project.lastAwardedRound || project.Round || '?' }`, color: 'from-[#F2994A] to-[#F2C94C]', glow: 'rgba(242,153,74,0.5)' },
    { id: 'status', angle: 162, label: 'Status', icon: <Activity className="w-6 h-6"/>, value: project.repoStatus || 'Pending', color: 'from-[#2D9CDB] to-[#2F80ED]', glow: 'rgba(45,156,219,0.5)' },
    { id: 'links', angle: 234, label: 'Network', icon: <Network className="w-6 h-6"/>, value: 'View Connections', color: 'from-[#EB5757] to-[#E63946]', glow: 'rgba(235,87,87,0.5)' },
  ];

  const centerX = 350;
  const centerY = 350;
  const orbitRadius = 240;

  return (
    <div className="fixed inset-0 z-[100] flex justify-center items-center bg-[#010309] overflow-hidden font-sans">
      
      {/* Background Gradients */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-50 dark:from-blue-900/20 via-[#010309] to-[#010309] opacity-70 pointer-events-none" />
      <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-purple-900/10 rounded-full blur-[120px] pointer-events-none transform translate-x-1/3 -translate-y-1/3" />
      <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-cyan-900/10 rounded-full blur-[100px] pointer-events-none transform -translate-x-1/3 translate-y-1/3" />

      {/* Particle Animation Elements */}
      {starsArray.map(star => (
         <motion.div 
           key={star.id}
           className="absolute rounded-full bg-white"
           style={{ top: star.top, left: star.left, width: star.size, height: star.size }}
           animate={{ opacity: [star.opacity * 0.2, star.opacity, star.opacity * 0.2] }}
           transition={{ duration: 3 + star.delay, repeat: Infinity, ease: "easeInOut" }}
         />
      ))}
      
      {/* Close Button */}
      <button 
        onClick={onClose} 
        className="absolute top-6 right-6 flex items-center gap-2 text-blue-200/50 hover:text-white border border-blue-500/20 hover:border-blue-400 bg-blue-950/30 hover:bg-blue-900/50 px-5 py-2.5 rounded-full transition-all z-20 backdrop-blur-md shadow-[0_0_15px_rgba(30,58,138,0.5)] group"
      >
        <span className="font-semibold tracking-wide text-sm">Return to Orbit</span>
        <X className="w-4 h-4 group-hover:rotate-90 transition-transform" />
      </button>

      {/* Brand Title */}
      <div className="absolute top-8 left-8 z-20 flex items-center gap-3">
         <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-400 flex items-center justify-center shadow-[0_0_20px_rgba(6,182,212,0.5)]">
            <Sparkles className="w-5 h-5 text-gray-900 dark:text-white" />
         </div>
         <div>
             <h2 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-blue-400 to-purple-400 tracking-tight">Vertex</h2>
             <p className="text-blue-300/60 text-xs font-mono tracking-widest uppercase">By StellarViz — Project Topology</p>
         </div>
      </div>

      {/* Main Interactive Canvas */}
      <div className="relative w-[700px] h-[700px] flex justify-center items-center">
        
        {/* Orbital Rings */}
        <motion.div 
            className="absolute inset-0 border border-white/[0.03] rounded-full pointer-events-none"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1, rotate: 360 }}
            transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
        />
        <motion.div 
            className="absolute inset-8 border border-blue-500/[0.05] rounded-full border-dashed pointer-events-none"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1, rotate: -360 }}
            transition={{ duration: 80, repeat: Infinity, ease: "linear" }}
        />

        {/* Dynamic Data Flow Lines (SVG) */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none z-0 overflow-visible">
          {branches.map((branch, i) => {
            const rad = branch.angle * (Math.PI / 180);
            const r1 = 80; // Start slightly outside center
            const x1 = centerX + Math.cos(rad) * r1;
            const y1 = centerY + Math.sin(rad) * r1;
            const x2 = centerX + Math.cos(rad) * orbitRadius;
            const y2 = centerY + Math.sin(rad) * orbitRadius;

            // Curved layout calculations
            const pathData = `M ${x1} ${y1} Q ${centerX + Math.cos(rad) * (orbitRadius/2)} ${centerY + Math.sin(rad) * (orbitRadius/2) + 30} ${x2} ${y2}`;

            return (
              <g key={branch.id}>
                {/* Base Faint Line */}
                <motion.path 
                  d={pathData}
                  fill="none"
                  stroke="rgba(255,255,255,0.08)" 
                  strokeWidth="2"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 1.5, delay: 0.5 + i * 0.1 }}
                />
                
                {/* Animated Dash Effects */}
                {mounted && (
                    <motion.path 
                    d={pathData}
                    fill="none"
                    stroke={branch.color.split(' ')[0].replace('from-[', '').replace(']', '')} 
                    strokeWidth="3"
                    strokeDasharray="10 40"
                    initial={{ strokeDashoffset: 100, opacity: 0 }}
                    animate={{ strokeDashoffset: 0, opacity: [0, 1, 0] }}
                    transition={{ duration: 2.5, repeat: Infinity, ease: "linear", delay: i * 0.4 }}
                    style={{ filter: `drop-shadow(0 0 8px ${branch.glow})` }}
                    />
                )}
              </g>
            );
          })}
        </svg>

        {/* Central Core: The Project */}
        <motion.div 
          className="absolute z-30 flex flex-col justify-center items-center cursor-pointer group"
          initial={{ scale: 0, rotate: -45 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 80, damping: 12, delay: 0.2 }}
          onMouseEnter={() => setHoveredNode('center')}
          onMouseLeave={() => setHoveredNode(null)}
          style={{ x: 0, y: 0 }}
        >
           {/* Core Glow Pulse */}
           <motion.div 
             className="absolute w-40 h-40 rounded-full bg-cyan-500/20 blur-2xl"
             animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0.8, 0.5] }}
             transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
           />

           {/* Central Holographic Sphere */}
           <div className="w-28 h-28 rounded-full bg-gradient-to-br from-gray-900 via-blue-900 to-black shadow-[0_0_50px_rgba(6,182,212,0.6)] flex items-center justify-center relative overflow-hidden border-[3px] border-cyan-400/50 backdrop-blur-xl group-hover:scale-105 transition-transform duration-300 group-hover:border-white z-10">
              {/* Inner tech pattern */}
              <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_center,_rgba(255,255,255,0.8)_1px,_transparent_1px)] bg-[length:8px_8px]" />
              
              {project.thumbnail?.url ? (
                 <img src={project.thumbnail.url} alt="project logo" className="w-16 h-16 object-contain drop-shadow-[0_0_15px_rgba(255,255,255,0.8)] z-10" />
              ) : (
                 <span className="text-5xl text-gray-900 dark:text-white font-black drop-shadow-[0_0_20px_rgba(255,255,255,0.8)] z-10">{(project.title || "P").charAt(0)}</span>
              )}
           </div>
           
           {/* Floating Title below core */}
           <motion.div 
             className="absolute -bottom-14 left-1/2 -translate-x-1/2 w-max max-w-[250px]"
             animate={{ y: [0, 5, 0] }}
             transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
           >
              <h3 className="font-extrabold text-gray-900 dark:text-white text-xl text-center bg-black/40 backdrop-blur-sm px-4 py-1.5 rounded-full border border-gray-300 dark:border-white/10 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
                 {project.title}
              </h3>
           </motion.div>

           {/* Central Hover Details Card (Glassmorphism) */}
           <AnimatePresence>
             {hoveredNode === 'center' && (
               <motion.div 
                 initial={{ opacity: 0, y: 20, scale: 0.9, rotateX: -10 }}
                 animate={{ opacity: 1, y: 0, scale: 1, rotateX: 0 }}
                 exit={{ opacity: 0, y: 20, scale: 0.9, rotateX: -10 }}
                 className="absolute top-44 bg-gray-900/10 dark:bg-gray-950/80 backdrop-blur-2xl border border-gray-300 dark:border-white/10 rounded-2xl p-6 shadow-[0_20px_50px_rgba(0,0,0,0.8)] w-[360px] pointer-events-none z-50 overflow-hidden"
               >
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500" />
                  <p className="text-white/80 text-sm leading-relaxed line-clamp-5">{project.description || "No description provided."}</p>
               </motion.div>
             )}
           </AnimatePresence>
        </motion.div>

        {/* Orbit Node Branches */}
        {branches.map((branch, i) => {
           const rad = branch.angle * (Math.PI / 180);
           const x = Math.cos(rad) * orbitRadius;
           const y = Math.sin(rad) * orbitRadius;

           return (
             <motion.div
               key={branch.id}
               className="absolute z-20 flex flex-col justify-center items-center cursor-pointer group"
               style={{ left: centerX + x, top: centerY + y, x: '-50%', y: '-50%' }}
               initial={{ opacity: 0, scale: 0 }}
               animate={{ opacity: 1, scale: 1 }}
               transition={{ duration: 0.8, delay: 0.8 + i*0.15, type: "spring", bounce: 0.4 }}
               onMouseEnter={() => setHoveredNode(branch.id)}
               onMouseLeave={() => setHoveredNode(null)}
             >
                {/* Node Floating Animation */}
                <motion.div
                  animate={{ y: [-4, 4, -4] }}
                  transition={{ duration: 3 + i*0.5, repeat: Infinity, ease: "easeInOut" }}
                  className="relative flex flex-col items-center"
                >
                    {/* Node Orb */}
                    <div 
                      className={`w-16 h-16 rounded-2xl rotate-45 bg-gradient-to-br ${branch.color} flex justify-center items-center transition-all duration-300 group-hover:rotate-0 group-hover:scale-110 z-10`}
                      style={{ boxShadow: `0 0 25px ${branch.glow}, inset 0 0 15px rgba(255,255,255,0.4)` }}
                    >
                        <div className="text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)] -rotate-45 group-hover:rotate-0 transition-transform duration-300">
                            {branch.icon}
                        </div>
                    </div>
                    
                    {/* Label */}
                    <div className="mt-4 bg-black/40 backdrop-blur-md px-3 py-1 rounded-lg border border-gray-200 dark:border-white/5">
                        <p className="text-white/70 text-[10px] font-black uppercase tracking-[0.2em]">{branch.label}</p>
                    </div>

                    {/* Popout Info Card */}
                    <AnimatePresence>
                        {hoveredNode === branch.id && (
                            <motion.div 
                                initial={{ opacity: 0, y: -20, scale: 0.8 }} 
                                animate={{ opacity: 1, y: 0, scale: 1 }} 
                                exit={{ opacity: 0, y: -10, scale: 0.8 }}
                                className="absolute left-1/2 -translate-x-1/2 bottom-24 bg-gray-900/90 backdrop-blur-xl border border-gray-300 dark:border-white/10 p-4 rounded-xl w-max min-w-[160px] shadow-[0_10px_30px_rgba(0,0,0,0.8)] outline outline-1 outline-white/5 z-50"
                            >
                                {branch.id === 'links' ? (
                                    <div className="flex flex-col gap-3 pointer-events-auto">
                                        <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">External Nodes</p>
                                        {project.website && <a href={project.website} target="_blank" rel="noreferrer" className="text-cyan-400 hover:text-cyan-300 hover:translate-x-1 transition-all flex items-center gap-2 text-sm font-medium"><Globe className="w-4 h-4"/> Official Web</a>}
                                        {project.github && <a href={project.github} target="_blank" rel="noreferrer" className="text-white hover:text-gray-600 dark:text-gray-300 hover:translate-x-1 transition-all flex items-center gap-2 text-sm font-medium"><Github className="w-4 h-4"/> Repository</a>}
                                        {project.x && <a href={project.x} target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300 hover:translate-x-1 transition-all flex items-center gap-2 text-sm font-medium"><svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.008 5.925H5.022z"/></svg> Twitter / X</a>}
                                        {!project.website && !project.github && !project.x && <span className="text-gray-400 dark:text-gray-500 text-sm italic">Isolated Node</span>}
                                    </div>
                                ) : (
                                    <div className="text-center">
                                        <p className="text-[10px] text-gray-400 dark:text-gray-500 dark:text-gray-400 font-bold uppercase tracking-widest mb-1">{branch.label}</p>
                                        <p className={`font-mono font-bold text-lg text-transparent bg-clip-text bg-gradient-to-r ${branch.color}`}>
                                            {branch.value}
                                        </p>
                                    </div>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </motion.div>
             </motion.div>
           );
        })}

      </div>
    </div>
  );
}
