# OSP Demo Agent

An interactive demo that shows how AI agents use the [Open Service Protocol](https://github.com/openserviceprotocol/osp) to discover, evaluate, and compare service providers.

**Try it live:** [demo.openserviceprotocol.org](https://demo.openserviceprotocol.org)

## What This Does

Describe what you need in plain language. The agent reads structured OSP service manifests from 9 providers across 3 industries and gives you a ranked comparison — with specific numbers, not vague assessments.

The agent runs on **Meta's Llama 4 Scout** via **Cloudflare Workers AI**. OSP is model-agnostic — it works because the format is structured, not because any particular model is used.

## Sample Scenarios

**Logistics:** "8 pallets of pharmaceutical products, temperature-controlled at 5°C, from Basel to Rotterdam, within 3 days"

**Consulting:** "We're a CHF 120M industrial company and want to expand into the US market"

**IT Infrastructure:** "We need managed hosting for our web app, 10 containers on GCP, with 24/7 monitoring"

## Run Locally

```bash
git clone https://github.com/openserviceprotocol/demo.git
cd demo
npm install
cp .env.example .env
# Edit .env with your Cloudflare credentials
npm run dev
```

You need a free [Cloudflare account](https://dash.cloudflare.com) with Workers AI enabled. See [Setup](#setup) below.

## Setup

1. Create a free Cloudflare account at `dash.cloudflare.com`
2. Go to **AI** → **Workers AI** (available on the free plan)
3. Go to **My Profile** → **API Tokens** → **Create Token** with Workers AI permission
4. Copy your Account ID (found under **Workers & Pages** → right sidebar)
5. Add both to your `.env` file

The free tier gives you 10,000 Neurons/day — enough for 25-50 demo interactions.

## How It Works

Each provider publishes two files:

- **osp.md** — a compact summary of what they offer and don't offer (< 500 tokens)
- **service manifest** — detailed YAML with pricing, SLAs, certifications, capacity, and more

The agent loads all provider files on startup, receives your request, and matches it against the structured data. Because the format is standardized, the comparison is systematic — not a guess based on marketing copy.

## Project Structure

```
/data
  /scenario-logistics     — 3 transport providers (osp.md + manifests)
  /scenario-consulting    — 3 strategy firms (osp.md + manifests)
  /scenario-it            — 3 hosting providers (osp.md + manifests)
  /fallback               — pre-computed responses for starter prompts
  /prompts                — system prompt template
/src
  /frontend               — React chat interface
  /backend                — API server calling Cloudflare Workers AI
```

## Learn More

- **Open Service Protocol:** [openserviceprotocol.org](https://openserviceprotocol.org)
- **OSP Specification:** [github.com/openserviceprotocol/osp](https://github.com/openserviceprotocol/osp)
- **Professional support:** [distll.io](https://distll.io)

## License

Apache 2.0
