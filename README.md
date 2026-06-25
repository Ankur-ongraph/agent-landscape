<div align="center">

# 🧺 The Agent Pantry

### A live landscape of AI agent frameworks & tools — organized by what each one does.

**[→ theagentpantry.com](https://theagentpantry.com)**

[![live](https://img.shields.io/badge/status-live-5753d8)](https://theagentpantry.com)
[![updated daily](https://img.shields.io/badge/data-updated%20daily-2da44e)](https://theagentpantry.com/data.json)
[![llms.txt](https://img.shields.io/badge/llms.txt-agent--readable-e0a000)](https://theagentpantry.com/llms-full.txt)

[![The Agent Pantry](https://theagentpantry.com/og.png)](https://theagentpantry.com)

</div>

Building an AI agent means choosing from a sprawling, fast-moving ecosystem. The Agent Pantry is a
[CNCF-Landscape](https://landscape.cncf.io)-style map of that ecosystem — **330+ frameworks, tools and open
models across 15 "aisles"**, each labeled by the role it plays in your stack. It re-scans **GitHub, Hacker News
and Hugging Face every day**, so it's a live map, not a dead awesome-list.

## What's inside

- **15 aisles**, each with a plain-language **"when to use"** — Agent Frameworks, Orchestration, Coding Agents,
  Skills & Recipes, Sandboxes & MicroVMs, Memory & RAG, Tools & MCP, Observability, Open Models, and more.
- **Three sources, three signals:** GitHub **stars**, Hacker News **discussion** (a hard-to-game traction
  check), and Hugging Face **likes/downloads** for the actual open models.
- **CNCF-style tiers:** 🧑‍🍳 **Featured** (hand-picked), open-source, and proprietary — plus a 🌶️ **Hot** marker
  for projects gaining stars fast.
- **A [Pantry Guide](https://theagentpantry.com/guide.html)** — *what it is / the problem it addresses / how it
  helps / a technical 101* for every aisle.
- **Agent-readable.** Point Claude, Codex, Cursor, or any LLM at the machine-readable index:
  - [`/llms.txt`](https://theagentpantry.com/llms.txt) — concise overview + links
  - [`/llms-full.txt`](https://theagentpantry.com/llms-full.txt) — full guide text + every tool
  - [`/data.json`](https://theagentpantry.com/data.json) — the raw dataset

> **Try it:** paste into any agent — *"Read https://theagentpantry.com/llms-full.txt and recommend tools for what I'm building."*

## Add or fix a project

Open an **[Add a project issue](https://github.com/Ankur-ongraph/agent-landscape/issues/new?template=add-a-project.yml)**,
or edit [`data/seed.json`](data/seed.json) and send a PR:

```jsonc
{ "repo": "owner/name", "category": "frameworks" }
```

Aisle ids: `frameworks`, `orchestration`, `autonomous`, `coding`, `skills`, `computer-use`, `memory-rag`,
`data`, `protocols`, `sandboxes`, `observability`, `runtimes`, `voice`, `serving`, `models`.

## How it works

```
data/seed.json ──┐
GitHub topics ───┤
GitHub keyword ──┤→ scripts/scan.mjs → enrich (HN + Hugging Face) → cap 25/aisle →
search           │   public/{data.json, llms.txt, llms-full.txt, sitemap.xml}
                 ┘
public/* (static site, no framework) renders it · GitHub Actions runs it daily and deploys to Pages
```

Discovery blends a hand-curated seed with GitHub topic + keyword search (so big repos that don't tag themselves
— like `openclaw/openclaw` — still get found), a non-tool filter to drop awesome-lists/courses, the HN signal,
and the current generation of open models from the Hugging Face Hub. Each aisle is capped at the top 25.

## Run it locally

```bash
GITHUB_TOKEN=$(gh auth token) npm run scan   # regenerate the data
npm run dev                                   # serve public/ at localhost:8080
```

## Credits

Structure and the per-category breakdown are adapted from the excellent
[CNCF Landscape Guide](https://landscape.cncf.io/guide). Signals from
[GitHub](https://github.com), the [Hacker News Algolia API](https://hn.algolia.com/api),
and the [Hugging Face Hub](https://huggingface.co).
