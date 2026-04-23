import { VercelRequest, VercelResponse } from '@vercel/node';

// Structured Brain from ecosystem_brain.json - SYNCED & ENHANCED
const ECOSYSTEM_BRAIN = {
  "verticals": {
    "SCF_APPLY": {
      "name": "Stellar Community Fund (SCF) & Grants",
      "keywords": ["scf", "apply", "grant", "funding", "how to apply", "application", "rounds", "awards", "تقديم", "دعم", "تمويل", "جائزة"],
      "anchors": ["SCF Handbook", "Stellar Asset Sandbox", "Vibrant"],
      "strategy": "The Stellar Community Fund (SCF) is an open-application award program to support projects built on Stellar and Soroban. Start with a 'Standard Award' ($10k-$150k) for MVP. Focus on community value, technical feasibility, and ecosystem impact."
    },
    "CREATOR_ECONOMY": {
      "name": "Creator Economy & Social Media",
      "keywords": ["content", "media", "social", "tipping", "creator", "influencer", "publishing", "blog", "news", "music", "video", "محتوى", "صناعة", "مبدعين"],
      "anchors": ["Tipper", "QuillTip", "Social & Podcast", "Haciendo Stellar", "Lumen Loop"],
      "strategy": "Focus on micro-payments, decentralized identity (Passkeys), and direct fan involvement."
    },
    "RWA_TOKENIZATION": {
      "name": "Real World Assets (RWA)",
      "keywords": ["asset", "real world", "tokenization", "property", "gold", "commodity", "yield", "investment", "security", "عقارات", "أصول", "ترميز"],
      "anchors": ["Rivool Finance", "Diamond Hand", "Alternun", "Property Tokenization"],
      "strategy": "Prioritize transparency, regulatory compliance, and cross-border liquidity."
    },
    "FINANCE_DEFI": {
      "name": "DeFi & Advanced Trading",
      "keywords": ["defi", "yield", "dex", "amm", "liquidity", "swap", "trading", "finance", "تمويل", "لامركزي", "تداول"],
      "anchors": ["AXIS", "SocketFi", "Lendeasy", "Soroswap", "Allbridge", "Soroban AMM"],
      "strategy": "Emphasize high-performance Soroban smart contracts and low-cost transactions."
    },
    "GLOBAL_PAYMENTS": {
      "name": "Global Payments & Remittances",
      "keywords": ["payment", "remittance", "transfer", "checkout", "fiat", "stablecoin", "wallet", "usdc", "payout", "دفع", "حوالات", "محفظة"],
      "anchors": ["PayZoll", "TransferMole", "Decaf", "Beans", "Stellar Disbursement Platform"],
      "strategy": "Leverage Stellar's core strengths: speed, anchors, and USDC integration."
    },
    "INFRA_DEVTOOLS": {
      "name": "Infrastructure & Developer Tooling",
      "keywords": ["sdk", "api", "infrastructure", "tooling", "developer", "node", "security", "data", "analytics", "أدوات", "برمجة", "بنية"],
      "anchors": ["Token Terminal", "ChainPatrol", "Beamable", "Soroban SDK", "Stellar Architect"],
      "strategy": "Build robust, scalable foundations for the next generation of Stellar apps."
    }
  }
};

function generateSmartFallback(prompt: string): string {
  const p = prompt.toLowerCase();
  let bestMatch: any = null;
  let maxScore = 0;

  // 1. Scoring Logic with Smart Weighting
  for (const [key, vertical] of Object.entries(ECOSYSTEM_BRAIN.verticals)) {
    let score = 0;
    vertical.keywords.forEach(k => {
      const lowerK = k.toLowerCase();
      // Exact match boost
      if (p === lowerK) score += 100;
      // Term occurrence boost
      if (p.includes(lowerK)) {
        score += (lowerK.length > 3) ? 20 : 10;
        // Super boost for critical keywords
        if (["scf", "apply", "grant", "defi", "payment"].includes(lowerK)) score += 50;
      }
    });
    
    if (score > maxScore) {
      maxScore = score;
      bestMatch = { ...vertical, key };
    }
  }

  const header = "🛰️ **[VERTEX STELLAR BRAIN - OFFLINE OPTIMIZED]**\n\n";

  if (!bestMatch || maxScore < 10) {
    return header + "I'm currently in **Structural Intelligence Mode**. I can guide you through the **625+ projects** in the Stellar ecosystem. \n\n**Try asking about:** 'What is SCF?', 'How to tokenize assets', or 'DeFi on Soroban'.";
  }

  const isArabic = /[\u0600-\u06FF]/.test(prompt);

  if (isArabic) {
    return `${header}لقد قمت بتحليل استفسارك ضمن نطاق **${bestMatch.name}**.

**الإستراتيجية والمعلومات:**
${bestMatch.strategy}

**أبرز المشاريع المرجعية (Anchors):**
${bestMatch.anchors.map((a: string) => `• **${a}**`).join('\n')}

**نصيحة Vertex:** شبكة Stellar هي الأفضل لهذا النوع من المشاريع بسبب سرعتها الفائقة وهيكلية الرسوم المنخفضة. ننصحك بالاطلاع على التوثيق الرسمي لـ **Soroban** للبدء برمجياً.`;
  }

  return `${header}I've analyzed your query within the **${bestMatch.name}** landscape.

**Strategic Insights:**
${bestMatch.strategy}

**Top Ecosystem Anchors (Reference Projects):**
${bestMatch.anchors.map((a: string) => `• **${a}**`).join('\n')}

**Architectural Tip:** Stellar excels at sub-second settlement and low fees. For a project in this sector, we recommend leveraging **Soroban Smart Contracts** and audited **SEP standards** to ensure production-grade security.`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: "Method not allowed" });
  const apiKey = process.env.GEMINI_API_KEY;
  const { prompt } = req.body;
  const cleanPrompt = (prompt || "").replace(/<[^>]*>?/gm, '').substring(0, 8000);

  if (apiKey) {
    try {
      const gRes = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: cleanPrompt }] }] })
      });
      const gData = await gRes.json();
      if (gData.error) throw new Error("API Limit");
      const text = gData?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return res.status(200).json({ text });
    } catch (e) {}
  }

  return res.status(200).json({ text: generateSmartFallback(cleanPrompt) });
}
