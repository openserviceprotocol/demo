# OSP Demo Agent — Specification v3

## Purpose

An interactive demo agent that shows how an AI agent uses OSP files to discover, evaluate, and compare service providers. Runs on Cloudflare Workers AI with Llama 4 Scout — deliberately not on Claude, to demonstrate that OSP is model-agnostic.

---

## Architecture

### Stack

- **Frontend:** React chat interface
- **Backend:** Cloudflare Worker (or Node.js calling Cloudflare Workers AI REST API)
- **Model:** `@cf/meta/llama-4-scout-17b-16e-instruct` on Cloudflare Workers AI
- **Fallback:** Pre-computed responses for the three starter prompts (served without API call)
- **Cost:** Free tier (10,000 Neurons/day, approximately 25-50 interactions)

### Why Cloudflare Workers AI, not Claude

1. Proves OSP is model-agnostic — the standard works because the format is good, not because the model is smart
2. Zero cost on the free tier
3. Runs on Cloudflare's edge network — aligns with the OSP ecosystem narrative (Cloudflare Markdown for Agents, MCP, Content Signals)
4. Open-source model (Meta Llama 4) — no vendor lock-in at any layer

### Data Flow

```
User input
    ↓
Backend receives message
    ↓
Is it a starter prompt? ──yes──→ Return pre-computed response (no API call)
    ↓ no
Load cached OSP files into system prompt
    ↓
Send to Cloudflare Workers AI (Llama 4 Scout)
    ↓
Stream response to frontend
```

---

## Cloudflare Workers AI Integration

### API Call

```javascript
const response = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/meta/llama-4-scout-17b-16e-instruct`,
  {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${CLOUDFLARE_API_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messages: [
        { role: "system", content: systemPromptWithOSPData },
        ...chatHistory,
        { role: "user", content: userMessage }
      ],
      max_tokens: 2048,
      stream: true
    })
  }
);
```

### Environment Variables

```
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_API_TOKEN=your-api-token
```

### .env.example

```
CLOUDFLARE_ACCOUNT_ID=your-account-id-here
CLOUDFLARE_API_TOKEN=your-api-token-here
```

---

## Fallback: Pre-computed Starter Responses

The three starter prompts and their responses are pre-generated and stored as static JSON. When a user clicks a starter prompt, the response is served instantly without an API call. This:

- Guarantees a perfect first impression (no model variability)
- Costs zero Neurons
- Works even if Cloudflare Workers AI is slow or unavailable
- Covers 80%+ of demo usage (most visitors click a starter prompt)

The pre-computed responses are stored in `/data/fallback/`:

```
/data/fallback/
  logistics-starter.json
  consulting-starter.json
  it-starter.json
```

Each file contains:

```json
{
  "prompt": "8 pallets of pharmaceutical products, temperature-controlled at 5°C, from Basel to Rotterdam, within 3 days",
  "response": "... pre-computed full response ..."
}
```

These responses should be generated once by running the actual prompts through the model (or through Claude for highest quality), then saved as static files.

Only free-form user messages that don't match a starter prompt trigger a live API call.

---

## Three Scenarios with Comparable Providers

### Scenario 1: Logistics

| Provider | Strength | Limitation |
|---|---|---|
| **TransLogistics** | GDP-certified, pharma-grade temp control, Europe-wide | Expensive, minimum 5 pallets |
| **RapidCargo** | Fast, affordable, fully automated | No temperature control, no pharma |
| **AlpinaCold Logistics** | Highest temp precision, Swissmedic-compliant | Switzerland only, max 10 pallets |

### Scenario 2: Strategy Consulting

| Provider | Strength | Limitation |
|---|---|---|
| **StrategyWorks** | Deep US/APAC expertise, senior partner-led | Expensive, no EU focus |
| **EuroGrowth Partners** | Data-driven, 18 EU countries, fast | No US, no Asia |
| **Kestrel Advisory** | Broad growth strategy, pragmatic | Market entry not core specialty |

### Scenario 3: IT Infrastructure

| Provider | Strength | Limitation |
|---|---|---|
| **CloudOps** | Enterprise 24/7, AWS+Azure, ISO 27001 + SOC 2 | Expensive, no GCP, min CHF 2k/mo |
| **NimbleCloud** | Affordable, fast setup, SME-optimized | AWS only, business hours, no Windows |
| **KubeForce Systems** | Multi-cloud incl. GCP, K8s specialist, GPU | No VMs, no managed DBs, min 3 nodes |

---

## Starter Prompts

```
Welcome to the OSP Demo Agent. I compare service providers
using their OSP manifests — structured, transparent, and in
seconds.

I have 9 providers across 3 industries loaded. Tell me what
you need:

[truck icon] "8 pallets of pharmaceutical products, temperature-
     controlled at 5°C, from Basel to Rotterdam, within 3 days"

[briefcase icon] "We're a CHF 120M industrial company based in 
     Switzerland and want to expand into the US market"

[cloud icon] "We need managed hosting for our web app, 
     10 containers on GCP, with 24/7 monitoring"
```

---

## Test Scenarios

### Logistics

**L1: International pharma → TransLogistics wins**
"8 pallets of pharmaceutical products from Basel to Rotterdam, temperature-controlled at 5°C, GDP documentation required, budget CHF 4,000."

Expected: TransLogistics ✅ (GDP, temperature, international). AlpinaCold ❌ (Switzerland only). RapidCargo ❌ (no temperature control).

**L2: Fast industrial freight → RapidCargo wins**
"6 pallets of machine parts from Munich to Prague, as fast and cheap as possible, no special requirements."

Expected: RapidCargo ✅ (fast, affordable, route covered). TransLogistics ⚠️ (can do it, but overpriced). AlpinaCold ❌ (Switzerland only).

**L3: Pharma within Switzerland → AlpinaCold wins**
"3 pallets of diagnostic reagents from Zurich to Geneva, temperature-controlled 2-8°C, must be Swissmedic-compliant, delivered tomorrow."

Expected: AlpinaCold ✅ (Swissmedic, same-day, 1 pallet minimum). TransLogistics ⚠️ (minimum 5 pallets). RapidCargo ❌ (no temperature control).

**L4: No match**
"Air freight from Zurich to New York, 2 pallets."

Expected: No match. All three are road transport within Europe.

### Consulting

**C1: US market entry → StrategyWorks wins**
"We're a Swiss machine manufacturer with CHF 150M revenue and want to enter the US market. FDA approval is a key concern."

Expected: StrategyWorks ✅ (US expertise, FDA). EuroGrowth ❌ (no US). Kestrel ⚠️ (no proprietary US expertise).

**C2: EU expansion Eastern Europe → EuroGrowth wins**
"We want to expand our industrial products into Poland and Czech Republic. Budget around CHF 50,000, results within 4 weeks."

Expected: EuroGrowth ✅ (Eastern Europe, fits budget, 3-5 weeks). StrategyWorks ⚠️ (too expensive). Kestrel ⚠️ (less specialized).

**C3: Open strategic question → Kestrel wins**
"We don't know yet whether to expand geographically, launch a new product, or acquire a competitor. We need someone to evaluate all options."

Expected: Kestrel ✅ (broad growth strategy). StrategyWorks ⚠️ (market entry only). EuroGrowth ⚠️ (EU market entry only).

### IT Infrastructure

**I1: Enterprise AWS+Azure → CloudOps wins**
"We need managed hosting for 30 VMs on AWS and Azure, 24/7 support, ISO 27001 required."

Expected: CloudOps ✅ (AWS+Azure, 24/7, ISO 27001). NimbleCloud ❌ (AWS only, business hours). KubeForce ❌ (no VMs).

**I2: Budget startup on AWS → NimbleCloud wins**
"We're a startup with a web app, 5 Linux containers on AWS, budget max CHF 1,000/month."

Expected: NimbleCloud ✅ (AWS, affordable). CloudOps ❌ (minimum CHF 2,000). KubeForce ⚠️ (possible but more expensive).

**I3: GCP Kubernetes with GPU → KubeForce wins**
"We train ML models and need managed Kubernetes on GCP with GPU support, 10 nodes."

Expected: KubeForce ✅ (GCP, K8s, GPU). CloudOps ❌ (no GCP). NimbleCloud ❌ (no GCP).

**I4: Partial match**
"We need managed hosting on GCP with a PostgreSQL database and 24/7 support."

Expected: No perfect match. KubeForce ⚠️ (GCP + 24/7, no managed DBs). CloudOps ⚠️ (managed DBs + 24/7, no GCP). NimbleCloud ❌ (no GCP).

---

## Frontend Specification

### Layout

```
┌──────────────────────────────────────────┐
│  OSP Demo Agent                    [?]   │
│  Powered by Llama 4 Scout on Cloudflare  │
│  ─────────────────────────────────────── │
│                                          │
│  [Chat history]                          │
│                                          │
│                                          │
│  ─────────────────────────────────────── │
│  [Input field]                   [Send]  │
│                                          │
│  openserviceprotocol.org · Model-agnostic│
└──────────────────────────────────────────┘
```

### Design

- Dark background
- Clean sans-serif for chat messages
- User messages right-aligned, agent messages left-aligned
- Syntax highlighting for YAML snippets in responses
- Small OSP logo, no avatar
- Subtle "Powered by Llama 4 Scout on Cloudflare Workers AI" in header — reinforces model-agnosticism

### Info Button [?]

Opens an overlay:

```
What is this?

This agent demonstrates the Open Service Protocol (OSP) — an
open standard that enables AI agents to discover, evaluate, and
order services.

The agent runs on Meta's Llama 4 Scout via Cloudflare Workers AI.
OSP is model-agnostic — it works because the format is structured,
not because any particular AI model is used.

The provider data comes from real osp.md files — the same format
any business can publish on its website.

→ Learn more: openserviceprotocol.org
→ Create your own osp.md: GitHub Repository
→ Professional support: distll.io
```

---

## Data Structure

```
/data
├── scenario-logistics/
│   ├── translogistics.osp.md
│   ├── rapidcargo.osp.md
│   ├── alpinacold.osp.md
│   └── manifests/
│       ├── translogistics-ltl.yaml
│       ├── rapidcargo-express-ltl.yaml
│       └── alpinacold-cool-ltl.yaml
├── scenario-consulting/
│   ├── strategyworks.osp.md
│   ├── eurogrowth.osp.md
│   ├── kestrel.osp.md
│   └── manifests/
│       ├── strategyworks-market-entry.yaml
│       ├── eurogrowth-eu-market-entry.yaml
│       └── kestrel-growth-strategy.yaml
├── scenario-it/
│   ├── cloudops.osp.md
│   ├── nimblecloud.osp.md
│   ├── kubeforce.osp.md
│   └── manifests/
│       ├── cloudops-managed-hosting.yaml
│       ├── nimblecloud-aws-hosting.yaml
│       └── kubeforce-managed-k8s.yaml
├── fallback/
│   ├── logistics-starter.json
│   ├── consulting-starter.json
│   └── it-starter.json
└── prompts/
    └── system-prompt.txt
```

---

## Claude Code Instructions

```
Build a web application for the OSP Demo Agent:

Tech stack:
- Frontend: React chat interface
- Backend: Node.js API that calls Cloudflare Workers AI REST API
- Model: @cf/meta/llama-4-scout-17b-16e-instruct
- No Anthropic API — this demo deliberately runs on an open-source
  model to prove OSP is model-agnostic

Frontend requirements:
- Dark design, clean, professional
- Three clickable starter prompts (logistics, consulting, IT)
- Info button with overlay explaining OSP and the model choice
- Subtle header text: "Powered by Llama 4 Scout on Cloudflare"
- Footer: "openserviceprotocol.org · Model-agnostic by design"
- Responsive (desktop and mobile)

Backend requirements:
- On startup: load all .osp.md and .yaml files from /data
  directories, grouped by scenario
- Build the system prompt by replacing placeholders in
  /data/prompts/system-prompt.txt with loaded file contents
- Fallback mechanism: when a user clicks a starter prompt,
  check /data/fallback/ for a pre-computed response. If found,
  return it immediately without an API call.
- For custom messages: call Cloudflare Workers AI REST API:
  POST https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/@cf/meta/llama-4-scout-17b-16e-instruct
  with Authorization: Bearer {api_token}
  Body: { messages: [...], max_tokens: 2048, stream: true }
- Streaming responses for live API calls
- Rate limiting: 20 requests per IP per hour
- Chat history: maintain conversation context per session
  (send previous messages in the messages array)

Environment variables (see .env.example):
- CLOUDFLARE_ACCOUNT_ID
- CLOUDFLARE_API_TOKEN

Project structure:
/data                    — OSP files, fallback responses, prompt
/data/prompts            — system-prompt.txt
/data/fallback           — pre-computed starter responses (JSON)
/data/scenario-logistics — OSP files for logistics scenario
/data/scenario-consulting — OSP files for consulting scenario
/data/scenario-it        — OSP files for IT scenario
/src/frontend            — React app
/src/backend             — API server
.env.example             — template for environment variables

The system prompt is in /data/prompts/system-prompt.txt.
Placeholders {LOGISTICS_OSP_MD_FILES}, {LOGISTICS_MANIFESTS},
{CONSULTING_OSP_MD_FILES}, {CONSULTING_MANIFESTS},
{IT_OSP_MD_FILES}, {IT_MANIFESTS} are replaced on startup
with the contents of the respective files.

The OSP data files are already in the /data directory.
The fallback JSON files need to be generated after the first
successful API test — run each starter prompt through the model,
verify the response quality, and save as static JSON.
```

---

## Deployment

**Target URL:** `demo.openserviceprotocol.org`

**Option A: Vercel (recommended for simplicity)**
Next.js project with API route. Free tier handles the frontend
and the backend API calls to Cloudflare Workers AI.

**Option B: Cloudflare Pages + Worker**
Frontend on Cloudflare Pages, backend as a Cloudflare Worker
that calls Workers AI directly (no REST API needed, use the
native binding). More tightly integrated with Cloudflare but
more complex to set up.

**Rate limiting:** 20 requests per IP per hour. Returns a friendly
message when exceeded: "The demo has a usage limit. For unlimited
access, set up your own OSP agent — it takes 10 minutes with the
open-source code in our GitHub repository."

**Monitoring:** Simple counter in the backend tracking daily
conversations and API calls. No user tracking, no cookies.
