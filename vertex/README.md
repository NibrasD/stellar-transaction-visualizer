
<h1 align="center"> Vertex </h1>

<p align="center">
  <b>Explore. Analyze. Build Smarter.</b><br/>
</p>
---

## 🌟 What is Vertex?

**Vertex** is an intelligence dashboard and AI-powered exploration platform that maps the entire Stellar Community Fund ecosystem — **625+ funded projects**, **$58M+ in deployed capital**, across **41+ funding rounds** (And counting!)

It transforms raw SCF data into an interactive, searchable, and visually stunning experience that helps builders, investors, and community members understand the Stellar ecosystem at a glance.

------

## 🚀 Key Features

### 📊 Orbital Board — The Project Database
- Browse all **625+ SCF-funded projects** in a beautiful card-based interface
- **Smart Weighted Search**: Finds projects by title, description, category, or keywords with intelligent relevance ranking
- **Advanced Filters**: Filter by category (DeFi, Developer Tooling, Applications, etc.), funding round, and award amount
- **Project Deep Dive**: Click any project to see full details — description, funding history, GitHub status, social links, and products & services
- **Pagination & Responsive Layout**: Seamlessly browse through hundreds of projects

### 📈 Insights — Analytics Dashboard
- **Category Distribution**: See which sectors receive the most funding (Financial Protocols, Developer Tooling, Applications, etc.)
- **Funding Velocity per Round**: Track how SCF capital allocation has evolved over 30+ rounds
- **Cumulative Funding Growth**: Visualize the total capital deployed over time
- **ROI Scatter Matrix**: Compare project density vs. funding across categories
- **Soroban Adoption Radar**: Analyze smart contract adoption across the ecosystem
- **Interactive Charts**: Built with Recharts — hover, filter, and explore data visually

### 🤖 Vertex AI — AI-Powered Ecosystem Advisor
- **Intent-Aware Search**: Understands what you want to build and finds the most relevant reference projects
- **Clickable Project Links**: Every project mentioned by the AI is a clickable link that opens its full details
- **Semantic Expansion**: Asking about "content" automatically searches for "publishing", "social", "creator", "podcast", etc.
- And more to come -God Willing-

### 🌌 Galaxy View — 3D Ecosystem Visualization
- **Interactive Force-Directed Graph**: Visualize the entire SCF ecosystem as an interconnected galaxy
- **D3-Powered**: Smooth animations and physics-based layout

### 🎨 Premium Design
- **Glassmorphism UI**: Modern frosted-glass aesthetics with subtle blur effects
- **Dark/Light Mode**: Full theme support with seamless toggle
- **Micro-Animations**: Smooth transitions powered by Framer Motion
- **Responsive**: Works beautifully on desktop, tablet, and mobile

---

## 🎯 Who Is This For?

| Audience | How StellarViz Helps |
|---|---|
| **🏗️ Builders & Developers** | Find reference projects for your idea. Ask the AI: "I want to build an escrow platform" → instantly discover Trustless Work, Eascrow, and similar funded projects. |
| **💰 SCF Applicants** | Research the competitive landscape before applying. Understand which categories are oversaturated and where gaps exist. |
| **📊 Analysts & Researchers** | Dive into funding trends, category distributions, and Soroban adoption metrics with interactive charts. |
| **🏛️ SCF Reviewers & Judges** | Quickly cross-reference new applications against the existing 625-project database to identify overlaps or novel ideas. |
| **🌍 Community Members** | Explore the Stellar ecosystem visually and understand where the community's $58M+ has been invested. |

---

## ⚡ Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/NibrasD/stellar-transaction-visualizer.git
cd stellar-transaction-visualizer/vertex

# 2. Install dependencies
npm install

# 3. Set up your Ai API key (determine your model)
# Create a .env file and add:
# API_KEY=your_api_key_here

# 4. Start the development server
npm run dev

# 5. Open in your browser
# → http://localhost:3000
```

---

## 📁 Project Structure

```
stellar-transaction-visualizer/vertex/
├── src/
│   ├── App.tsx                  # Main application (Orbital Board + Insights)
│   ├── NexusVertex.tsx          # AI-powered chatbot (Vertex AI)
│   ├── StellarGalaxy.tsx        # 3D galaxy visualization
│   ├── StellarMindMap.tsx       # Mind map component
│   ├── projects_enriched.json   # 625 enriched project records
│   ├── ecosystem_brain.json     # Semantic knowledge base
│   └── scf_handbook.json        # SCF guidelines reference
├── server.ts                    # Express backend (API proxy)
├── package.json
└── README.md
```

---

## 🌐 Live Features Breakdown

### Orbital Board
> The command center for exploring every SCF-funded project.

- 🔍 **Smart Search** — Type any keyword and get relevance-ranked results
- 🏷️ **Category Filter** — Financial Protocols, Developer Tooling, Applications, Education & Community, Infrastructure & Services, End-User Application
- 🔢 **Round Filter** — Filter by any of the 30+ funding rounds
- 💵 **Amount Filter** — $10k–$50k, $50k–$150k, or >$150k
- 📋 **Project Modal** — Full project details with GitHub, Twitter (X) links.

### Insights
> Data-driven analytics that reveal ecosystem patterns.

- 📊 Category distribution charts
- 📈 Funding velocity over time
- 🛸 Soroban adoption radar
- 📉 Cumulative growth curves

### Vertex AI
> Your personal Stellar ecosystem architect.

- 💬 Natural language queries
- 🎯 Precision project recommendations (not random results)
- 🔗 Clickable project references in every response
- 🧠 Semantic understanding of builder intent

---

## 📄 License

MIT License — Built for the Stellar community, by the Stellar community.

---

<p align="center">
  <b>Built with 💙 for the Stellar Ecosystem</b><br/>
  <i>Vertex — Where Data Meets Vision</i>
</p>
