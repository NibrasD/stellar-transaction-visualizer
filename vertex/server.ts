import express from "express";
import { createServer as createViteServer } from "vite";
import * as cheerio from "cheerio";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load environment variables securely on the backend
dotenv.config({ path: path.resolve(__dirname, '../.env') });

let projectsData: any[] = [];

async function loadProjectsData() {
  try {
    const dataPath = path.join(__dirname, "src", "projects_enriched.json");
    const fileData = await fs.readFile(dataPath, "utf-8");
    projectsData = JSON.parse(fileData);
    console.log(`Loaded ${projectsData.length} projects successfully into memory.`);
  } catch (error) {
    console.error("Failed to load local projects data:", error);
  }
}

async function startServer() {
  await loadProjectsData();
  
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '1mb' }));

  // AI Security Route: Proxy to Gemini 1.5 Flash (v1)
  app.post("/api/ai", async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "Server AI configuration missing." });
      }

      let { prompt } = req.body;
      if (!prompt || typeof prompt !== "string") {
        return res.status(400).json({ error: "Invalid prompt format." });
      }

      // Basic Sanitization to prevent XSS injection in prompt logging/processing
      prompt = prompt.replace(/<[^>]*>?/gm, '');

      const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });

      if (!response.ok) {
        if (response.status === 429) {
          return res.status(429).json({ error: "AI Rate limit exceeded, please try again later." });
        }
        return res.status(response.status).json({ error: "AI service is currently unavailable." });
      }

      const data = await response.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      res.json({ text });
    } catch (err) {
      console.error("API AI Error:", err);
      res.status(500).json({ error: "Internal AI connection error." });
    }
  });

  // Projects API: Return lightweight version to avoid 2.2MB frontend bundle
  app.get("/api/projects", (req, res) => {
    // We strip heavy markdown descriptions and products text for the initial load
    // The client only needs basic metadata for charts and limited text for semantic search.
    const lightweightProjects = projectsData.map(p => ({
      ...p,
      description: p.description ? p.description.substring(0, 400) : (p.productsAndServices ? p.productsAndServices.substring(0, 400) : ""),
      productsAndServices: undefined
    }));
    res.json(lightweightProjects);
  });

  // Analytics Stats API: Calculate heavy metrics on server to satisfy professional review
  app.get("/api/projects/stats", (req, res) => {
    const getAmountNum = (amountStr: string) => {
      if (!amountStr || amountStr === 'Not publicly specified') return 0;
      const clean = amountStr.replace(/[$, ]/g, '');
      const num = parseFloat(clean);
      return isNaN(num) ? 0 : num;
    };

    const catMap: Record<string, number> = {};
    const amountCatMap: Record<string, number> = {};
    const roundMap: Record<number, number> = {};
    const amountRoundMap: Record<number, number> = {};
    const statusMap: Record<string, number> = { 'Mainnet': 0, 'Development': 0 };
    const sorobanCounts = { Yes: 0, No: 0 };
    
    let totalFunded = 0;

    projectsData.forEach(p => {
      // Category
      const c = p.category || 'Unknown';
      catMap[c] = (catMap[c] || 0) + 1;
      
      const amt = getAmountNum(p.amountAwarded);
      if (amt > 0) {
        amountCatMap[c] = (amountCatMap[c] || 0) + amt;
        totalFunded += amt;
      }

      // Rounds
      const r = p.lastAwardedRound || p.Round;
      if (r) {
         const num = parseInt(r);
         if (!isNaN(num) && num < 100) {
            roundMap[num] = (roundMap[num] || 0) + 1;
            if (amt > 0) amountRoundMap[num] = (amountRoundMap[num] || 0) + amt;
         }
      }

      // Maturity
      let s = p.integrationStatus || 'Development';
      if (s === 'Live (on Mainnet)' || s === 'Expansion' || s === 'Completed') s = 'Mainnet';
      else s = 'Development';
      statusMap[s]++;

      // Soroban
      sorobanCounts[p.usesSoroban ? 'Yes' : 'No']++;
    });

    const catChartData = Object.keys(catMap).map(k => ({ 
      name: k, 
      count: catMap[k], 
      amount: amountCatMap[k] || 0 
    })).sort((a, b) => b.count - a.count).slice(0, 8);

    const roundChartData = Object.keys(roundMap)
      .map(k => {
        const knum = parseInt(k);
        return { name: `R${k}`, count: roundMap[knum], amount: amountRoundMap[knum] || 0, raw: knum };
      })
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
    const maxActive = Math.max(1, ...topRadarCats.map(c => projectsData.filter(p => p.category === c && p.repoStatus === 'Active').length));

    const radarData = topRadarCats.map(cat => {
       const projects = catMap[cat];
       const funding = amountCatMap[cat] || 0;
       const active = projectsData.filter(p => p.category === cat && p.repoStatus === 'Active').length;
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

    res.json({
      catChartData,
      cumulativeRoundData,
      roiScatterData,
      radarData,
      maturityData: Object.entries(statusMap).map(([name, value]) => ({ name, value })),
      sorobanData: [
        { name: 'Soroban Native', value: sorobanCounts.Yes, color: '#3b82f6' },
        { name: 'Stellar Classic', value: sorobanCounts.No, color: '#94a3b8' }
      ],
      totalFunded
    });
  });

  // Single Project API Route to fetch rich project details on demand
  app.get("/api/project/:slug", async (req, res) => {
    try {
      const { slug } = req.params;
      
      // 1. Try to find the rich description locally first
      const localProject = projectsData.find(p => p.slug === slug || p.id === slug);
      
      const response = await fetch(`https://communityfund.stellar.org/projects/${slug}`);
      if (!response.ok) {
          // Fallback to local data completely if external API fails
          if (localProject) {
              return res.json({
                  slug,
                  description: localProject.description || localProject.productsAndServices || "No detailed description available.",
                  website: localProject.website || "",
                  github: localProject.github || "",
                  amountAwarded: localProject.amountAwarded || "Not publicly specified",
                  date: "Unknown"
              });
          }
          return res.status(response.status).json({ error: "External fetch failed" });
      }
      const html = await response.text();

      let description = localProject?.description || "";
      let website = localProject?.website || "";
      let github = localProject?.github || "";
      let amount = localProject?.amountAwarded || "";
      let date = "";

      // Try to extract from the embedded next cache
      const encodedSlug = encodeURIComponent(slug);
      let parts = html.split('{"slug":"' + slug + '"');
      if (parts.length === 1) {
          parts = html.split('{"slug":"' + encodedSlug + '"');
      }
      
      if (parts.length > 1) {
          const sub = parts[1].substring(0, 8000); // look at next 8000 chars
          
          if (!description) {
            let descMatch = sub.match(/"description":"((?:[^"\\]|\\.)*?)"/);
            if (!descMatch) {
               const fallbackMatch = sub.match(/"description":\{[^{}]*"en":"((?:[^"\\]|\\.)*?)"/);
               if (fallbackMatch) descMatch = fallbackMatch;
            }
            if (descMatch) {
                // basic unescape
                description = descMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
            }
          }
          
          if (!website) {
            const webMatch = sub.match(/"website":"([^"]*?)"/);
            if (webMatch) website = webMatch[1];
          }
          
          if (!github) {
            const ghMatch = sub.match(/"github":"([^"]*?)"/);
            if (ghMatch) github = ghMatch[1];
          }
          
          if (!amount) {
            const totalAwarded = sub.match(/"totalAwarded":(\d+)/);
            if (totalAwarded && parseInt(totalAwarded[1]) > 0) {
                amount = "$" + parseInt(totalAwarded[1]).toLocaleString() + " XLM/USD";
            }
          }
          
          const createdDate = sub.match(/"createdAt":"([^"]*?)"/);
          if (createdDate) date = createdDate[1].split('T')[0];
      }

      // Fallbacks via cheerio if embedded JSON matching fails or is incomplete
      const $ = cheerio.load(html);
      
      if (!description) {
          description = $('meta[name="description"]').attr('content') || "";
          if (description.includes("Discover the groundbreaking projects") || !description) {
              // Try to find the first real paragraph
              const pTexts = [];
              $('p').each((i, el) => { pTexts.push($(el).text()); });
              const goodP = pTexts.find(t => t.length > 50 && !t.includes("Discover the groundbreaking projects"));
              if (goodP) description = goodP;
          }
      }

      const links = [];
      $('a').each((i, el) => {
          const href = $(el).attr('href');
          if (href) links.push(href);
      });
      
      if (!github) {
          const gh = links.find(l => l.includes('github.com/'));
          if (gh) github = gh;
      }
      if (!website) {
          const webs = links.find(l => l.startsWith('http') && !l.includes('stellar.org') && !l.includes('github.com') && !l.includes('twitter.com') && !l.includes('discord.'));
          if (webs) website = webs;
      }

      res.json({
          slug,
          description: description || "No detailed description available.",
          website: website || "",
          github: github || "",
          amountAwarded: amount || "Not publicly specified",
          date: date || "Unknown"
      });

    } catch (err) {
      console.error("API error mapping project:", err);
      res.status(500).json({ error: "Failed to fetch project details" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
