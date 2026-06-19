# 🤖 Agent Landscape

A **live, auto-updating landscape** of the AI agent framework & tooling ecosystem — inspired by the [CNCF Landscape](https://landscape.cncf.io). Projects are scanned from **GitHub** (stars, forks, language, license, last activity) and refreshed **daily** via GitHub Actions.

> **Live site:** _enabled after the first GitHub Pages deploy — see below._

## How it works

```
data/seed.json   →  curated, hand-categorized list of known agent projects
        +
GitHub topics    →  auto-discovery of new projects (hybrid mode)
        ↓
scripts/scan.mjs →  enriches every repo via the GitHub REST API
        ↓
public/data.json →  generated dataset
        ↓
public/*         →  static site (no framework, no build step) renders the landscape
```

- **Hybrid discovery** — a curated seed gives authoritative categories; topic search (`ai-agents`, `llm-agent`, `agent-framework`, `mcp-server`, …) pulls in new high-star projects automatically. Curated entries win on conflicts and get a `curated` badge.
- **No exposed tokens** — the scan runs server-side in CI using the Actions-provided `GITHUB_TOKEN`, so there are no client-side rate limits.

## Categories

Agent Frameworks · Multi-Agent Orchestration · Autonomous Agents · Coding Agents · Browser & Computer Use · Protocols & Interop · Memory & RAG · Observability & Eval · Runtimes & Platforms · Voice Agents

## Develop locally

```bash
# Generate the dataset (needs a GitHub token for full results)
GITHUB_TOKEN=$(gh auth token) npm run scan

# Serve the static site at http://localhost:8080
npm run dev
```

## Add or fix a project

Edit [`data/seed.json`](data/seed.json):

```jsonc
{ "repo": "owner/name", "category": "frameworks" }
```

Category ids: `frameworks`, `orchestration`, `autonomous`, `coding`, `computer-use`, `protocols`, `memory-rag`, `observability`, `runtimes`, `voice`. Open a PR and the next scan picks it up.

## Deployment

GitHub Actions ([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)) runs on every push to `main`, on a daily `cron`, and on manual dispatch. It re-scans GitHub, regenerates `public/data.json`, and deploys `public/` to GitHub Pages.

To enable: **Settings → Pages → Build and deployment → Source: GitHub Actions.**
