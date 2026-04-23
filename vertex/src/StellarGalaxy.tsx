import React, { useMemo, useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { Sparkles, Rocket, ArrowRight, Maximize, Minimize } from 'lucide-react';

interface Project {
  title: string;
  amountAwarded?: string;
}

export default function StellarGalaxy({ projects }: { projects: Project[] }) {
  // Parse amount for sizing
  const getProjectSize = (amount?: string) => {
    if (!amount) return 6; // Base size in px
    const num = parseInt(amount.replace(/[^0-9]/g, ''), 10) || 0;
    const minSize = 6;
    const maxSize = 28;
    const maxFunding = 150000; 
    const size = minSize + (Math.min(num, maxFunding) / maxFunding) * (maxSize - minSize);
    return size;
  };

  // We'll use a subset for performance and visual clarity in the orbit
  // But we'll scatter the rest as smaller background stars
  const mainStars = useMemo(() => projects.slice(0, 60), [projects]);
  const backgroundStars = useMemo(() => projects.slice(60), [projects]);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(err => {
        // Fullscreen error
      });
    } else {
      document.exitFullscreen();
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  return (
    <div 
      ref={containerRef}
      className={`relative w-full bg-[#050B18] overflow-hidden flex items-center justify-center transition-all ${isFullscreen ? 'h-screen rounded-none' : 'h-[800px] rounded-3xl border border-gray-200 dark:border-white/5 shadow-2xl'}`}
    >
      
      {/* 1. Deep Space Background parallax */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_center,rgba(6,182,212,0.1)_0%,transparent_70%)]" />
        <motion.div 
            animate={{ opacity: [0.3, 0.6, 0.3] }}
            transition={{ duration: 4, repeat: Infinity }}
            className="absolute top-1/4 left-1/3 w-64 h-64 bg-blue-600/10 blur-[120px] rounded-full" 
        />
        <motion.div 
            animate={{ opacity: [0.2, 0.4, 0.2] }}
            transition={{ duration: 6, repeat: Infinity, delay: 1 }}
            className="absolute bottom-1/4 right-1/3 w-80 h-80 bg-purple-600/10 blur-[150px] rounded-full" 
        />
        
        {/* Massive Stellar Watermark */}
        <div className="absolute inset-0 flex items-center justify-center opacity-[0.03] select-none text-center pointer-events-none">
           <h1 className="text-[12vw] font-black tracking-[0.3em] ml-[0.3em] text-gray-900 dark:text-white whitespace-nowrap">STELLAR</h1>
        </div>
      </div>

      {/* 2. Background Minor Stars (Optimized: No heavy animations) */}
      <div className="absolute inset-0">
        {backgroundStars.map((p, i) => (
          <div
            key={i}
            className="absolute bg-white rounded-full opacity-30"
            style={{
              left: `calc(50% + ${Math.random() * 1400 - 700}px)`,
              top: `calc(50% + ${Math.random() * 800 - 400}px)`,
              width: `${Math.random() * 3 + 1}px`,
              height: `${Math.random() * 3 + 1}px`,
            }}
          />
        ))}
      </div>

      {/* 3. Orbiting Project Nodes */}
      <div className="relative w-full h-full flex items-center justify-center">
        {mainStars.map((p, i) => {
          const orbitRadius = 100 + (i * 6); 
          const duration = 80 + (i * 2.5) + (Math.random() * 30);
          const startAngle = Math.random() * 360; 

          return (
            <motion.div
              key={i}
              className="absolute pointer-events-none"
              animate={{
                rotate: [startAngle, startAngle + 360],
              }}
              transition={{
                duration: duration,
                repeat: Infinity,
                ease: "linear",
              }}
              style={{
                width: orbitRadius * 2,
                height: orbitRadius * 2,
              }}
            >
              <div 
                className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2"
              >
                {/* Counter-rotate child to keep text upright */}
                <motion.div 
                  animate={{ rotate: [-startAngle, -startAngle - 360] }}
                  transition={{ duration: duration, repeat: Infinity, ease: "linear" }}
                  whileHover={{ scale: 1.5 }}
                  className="relative flex flex-col items-center group pointer-events-auto cursor-pointer z-10 hover:z-50"
                >
                  <div 
                    className="bg-cyan-400 rounded-full shadow-[0_0_15px_#22d3ee] group-hover:shadow-[0_0_30px_#22d3ee] group-hover:bg-blue-400 transition-all border border-cyan-300/50 group-hover:border-white" 
                    style={{ width: getProjectSize(p.amountAwarded), height: getProjectSize(p.amountAwarded) }}
                  />
                  {/* Tooltip renders absolutely below the dot */}
                  <div className="absolute top-full mt-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gray-900/90 backdrop-blur-xl px-3 py-2 rounded-xl text-center border border-white/20 shadow-2xl whitespace-nowrap pointer-events-none">
                    <p className="text-xs font-black text-gray-900 dark:text-white tracking-tight drop-shadow-md">{p.title}</p>
                    <p className="text-[10px] font-mono font-bold text-cyan-400 mt-0.5">{p.amountAwarded || 'Ecosystem Support'}</p>
                  </div>
                </motion.div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Centerpiece Core (Just a visual anchor now) */}
      <div className="absolute z-0 w-32 h-32 bg-cyan-600/20 blur-[60px] rounded-full pointer-events-none" />

      {/* Fullscreen Toggle Button */}
      <button 
        onClick={toggleFullscreen}
        className="absolute top-6 right-6 z-50 p-3 bg-[#F7F6F3] dark:bg-white/5 hover:bg-white/10 border border-gray-300 dark:border-white/10 rounded-xl text-gray-400 dark:text-gray-500 dark:text-gray-400 hover:text-white backdrop-blur-md transition-all shadow-xl group"
        title="Toggle Fullscreen"
      >
        {isFullscreen ? <Minimize className="w-5 h-5 group-hover:scale-90 transition-transform" /> : <Maximize className="w-5 h-5 group-hover:scale-110 transition-transform" />}
      </button>

      {/* 5. Floating Particle Overlay */}
      <div className="absolute inset-0 pointer-events-none">
        {[...Array(20)].map((_, i) => (
          <motion.div 
            key={i}
            animate={{ 
              y: [0, -100, 0],
              x: [0, Math.random() * 50 - 25, 0],
              opacity: [0, 0.4, 0]
            }}
            transition={{ 
                duration: 5 + Math.random() * 5, 
                repeat: Infinity,
                delay: Math.random() * 5
            }}
            className="absolute w-1 h-1 bg-cyan-400 rounded-full"
            style={{ 
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`
            }}
          />
        ))}
      </div>

    </div>
  );
}
