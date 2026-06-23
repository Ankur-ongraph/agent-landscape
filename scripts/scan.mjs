#!/usr/bin/env node
// Scans GitHub for AI agent frameworks/tools and writes public/data.json.
// Combines a curated seed (data/seed.json) with topic-based auto-discovery.
//
// Auth: set GITHUB_TOKEN (in CI it's provided automatically; locally run
//   GITHUB_TOKEN=$(gh auth token) node scripts/scan.mjs

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
const API = "https://api.github.com";

const headers = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "agent-landscape-scanner",
  ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
};

let apiCalls = 0;

async function gh(path) {
  apiCalls++;
  const url = path.startsWith("http") ? path : `${API}${path}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers });
    if (res.status === 403 || res.status === 429) {
      const reset = Number(res.headers.get("x-ratelimit-reset")) * 1000;
      const wait = Math.max(1000, reset - Date.now());
      if (wait < 90_000 && attempt < 3) {
        console.warn(`Rate limited; waiting ${Math.round(wait / 1000)}s...`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`GitHub ${res.status} for ${url}: ${body.slice(0, 200)}`);
    }
    return res.json();
  }
  throw new Error(`Exhausted retries for ${url}`);
}

function normalizeRepo(r) {
  return {
    repo: r.full_name,
    name: r.name,
    owner: r.owner?.login ?? r.full_name.split("/")[0],
    description: r.description ?? "",
    url: r.html_url,
    homepage: r.homepage || "",
    stars: r.stargazers_count ?? 0,
    forks: r.forks_count ?? 0,
    openIssues: r.open_issues_count ?? 0,
    language: r.language ?? "",
    license: r.license?.spdx_id && r.license.spdx_id !== "NOASSERTION" ? r.license.spdx_id : "",
    topics: r.topics ?? [],
    pushedAt: r.pushed_at ?? null,
    createdAt: r.created_at ?? null,
    archived: !!r.archived,
  };
}

async function fetchRepo(fullName) {
  try {
    const r = await gh(`/repos/${fullName}`);
    return normalizeRepo(r);
  } catch (e) {
    console.warn(`  skip ${fullName}: ${e.message}`);
    return null;
  }
}

async function discoverByTopic(topic, minStars, perTopic) {
  // GitHub search: repos with the topic, sorted by stars.
  const q = encodeURIComponent(`topic:${topic} stars:>=${minStars}`);
  const per = Math.min(perTopic, 100);
  try {
    const data = await gh(`/search/repositories?q=${q}&sort=stars&order=desc&per_page=${per}`);
    return (data.items ?? []).map(normalizeRepo);
  } catch (e) {
    console.warn(`  topic ${topic} failed: ${e.message}`);
    return [];
  }
}

async function discoverByQuery(query, minStars, perQuery) {
  // Free-text search sorted by stars — catches big repos that don't use our
  // exact topic tags (e.g. openclaw/openclaw, tagged only "ai"/"assistant").
  const q = encodeURIComponent(`${query} stars:>=${minStars}`);
  const per = Math.min(perQuery, 100);
  try {
    const data = await gh(`/search/repositories?q=${q}&sort=stars&order=desc&per_page=${per}`);
    return (data.items ?? []).map(normalizeRepo);
  } catch (e) {
    console.warn(`  query "${query}" failed: ${e.message}`);
    return [];
  }
}

// HackerNews (Algolia) signal — free, no key. Returns top story points and
// the number of stories that linked this repo. A reliable, hard-to-game source.
async function fetchHN(repo) {
  const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent("github.com/" + repo)}&restrictSearchableAttributes=url&hitsPerPage=30`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "agent-landscape-scanner" } });
    if (!res.ok) return null;
    const j = await res.json();
    const needle = `github.com/${repo}`.toLowerCase();
    const hits = (j.hits || []).filter((h) => (h.url || "").toLowerCase().includes(needle));
    if (!hits.length) return { points: 0, stories: 0, url: "" };
    let points = 0, top = null;
    for (const h of hits) {
      if ((h.points || 0) > points) { points = h.points || 0; top = h; }
    }
    return { points, stories: hits.length, url: top ? `https://news.ycombinator.com/item?id=${top.objectID}` : "" };
  } catch {
    return null;
  }
}

async function enrichHN(projects, concurrency = 8) {
  let i = 0;
  async function worker() {
    while (i < projects.length) {
      const p = projects[i++];
      const hn = await fetchHN(p.repo);
      if (hn) { p.hnPoints = hn.points; p.hnStories = hn.stories; p.hnUrl = hn.url; }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
}

// Keep auto-discovery credible: a discovered repo must show an agent-ish signal,
// and must not be on the denylist. Curated entries bypass this entirely.
const AGENT_SIGNAL = /\bagent|agentic|autonomous|llm|multi-?agent|crew|\bmcp\b|model context protocol|a2a|gpt|copilot|assistant|orchestrat|rag\b|retrieval-augmented|tool[- ]?use|function[- ]?calling|chatbot|swarm/i;
// Keyword search surfaces lots of reading material, not tools — exclude it.
const NON_TOOL = /awesome[-_]|[-_]?roadmap|tutorial|course|handbook|cheat-?sheet|guide|interview|\bbook\b|notes?\b|study-|learn(ing)?[-_]|100-days|from-scratch|examples?$|bootcamp|curriculum|papers?-?list|reading-list|leetcode|system-design|coding-?interview|build-your-own/i;

function isRelevant(project, denylist) {
  if (denylist.has(project.repo.toLowerCase())) return false;
  const name = project.repo.split("/")[1] || "";
  const text = `${project.repo} ${project.description} ${project.topics.join(" ")}`;
  if (NON_TOOL.test(name) || NON_TOOL.test(project.description)) return false;
  return AGENT_SIGNAL.test(text);
}

function categorize(project, seedCategories) {
  // Heuristic auto-categorization for discovered repos.
  const text = `${project.repo} ${project.description} ${project.topics.join(" ")}`.toLowerCase();
  const rules = [
    ["sandboxes", /sandbox|micro-?vm|firecracker|unikernel|code interpreter|isolated (execution|runtime|environment)|\be2b\b/],
    ["serving", /\bvllm\b|sglang|llama\.?cpp|\bgguf\b|quantiz|inference engine|inference server|model serving|llm serving|serving engine|text-generation-inference|tensorrt|triton inference|lmdeploy|\bollama\b|localai|llm gateway|model gateway|llm proxy|\bnemo\b|megatron/],
    ["voice", /whisper|speech recognition|speech-to-text|text-to-speech|\btts\b|\bstt\b|\basr\b|\bvoice\b|telephony|realtime audio|transcrib/],
    ["skills", /\bskills?\b|skill[- ]pack|skill registry|superpowers|claude code setup|agent harness|opinionated (claude|agent)/],
    ["computer-use", /browser-use|computer use|gui agent|web automation|playwright agent|screen/],
    ["coding", /coding agent|code agent|software engineer|swe|programmer|developer agent|repo/],
    ["data", /markitdown|docling|unstructured|to markdown|document (parsing|conversion|extraction|loader)|\bpdf\b|\bocr\b|\betl\b|data extraction|web scrap|firecrawl|\bcrawl|ingest|chunking/],
    ["protocols", /\bmcp\b|model context protocol|a2a|agent2agent|interop/],
    ["memory-rag", /memory|rag\b|retrieval|vector|embedding|knowledge graph/],
    ["observability", /observ|tracing|eval|monitor|telemetry|llmops/],
    ["orchestration", /multi-?agent|orchestrat|crew|swarm|workflow|graph/],
    ["autonomous", /autonomous|auto-?gpt|babyagi|self-?improv|goal-driven/],
    ["runtimes", /low-?code|no-?code|platform|deploy|hosting|builder|workflow automation/],
  ];
  for (const [cat, re] of rules) {
    if (re.test(text)) return cat;
  }
  return "frameworks";
}

async function main() {
  if (!TOKEN) {
    console.warn("⚠  No GITHUB_TOKEN set — running unauthenticated (60 req/hr). Results may be partial.");
  }
  const seed = JSON.parse(await readFile(join(ROOT, "data", "seed.json"), "utf8"));
  const categoryIds = new Set(seed.categories.map((c) => c.id));

  const byRepo = new Map(); // full_name(lower) -> project

  // 1) Curated seed (authoritative categories)
  console.log(`Enriching ${seed.projects.length} curated projects...`);
  for (const item of seed.projects) {
    const data = await fetchRepo(item.repo);
    if (!data || data.archived) continue;
    const key = data.repo.toLowerCase();
    data.category = categoryIds.has(item.category) ? item.category : "frameworks";
    data.curated = true;
    byRepo.set(key, data);
  }

  // 2) Topic-based auto-discovery (hybrid)
  const disc = seed.discovery || {};
  const topics = disc.topics || [];
  const denylist = new Set((disc.denylist || []).map((s) => s.toLowerCase()));
  let dropped = 0;
  console.log(`Discovering via ${topics.length} GitHub topics...`);
  for (const topic of topics) {
    const found = await discoverByTopic(topic, disc.minStars ?? 1500, disc.maxPerTopic ?? 30);
    for (const data of found) {
      if (data.archived) continue;
      const key = data.repo.toLowerCase();
      if (byRepo.has(key)) continue; // curated wins
      if (!isRelevant(data, denylist)) { dropped++; continue; } // skip off-topic noise
      data.category = categorize(data, categoryIds);
      data.curated = false;
      byRepo.set(key, data);
    }
  }
  if (dropped) console.log(`  filtered out ${dropped} off-topic / denylisted discovered repos`);

  // 3) Keyword search by stars — catches big repos that don't use our topic tags
  const queries = disc.queries || [];
  if (queries.length) {
    console.log(`Discovering via ${queries.length} keyword searches...`);
    let kept = 0;
    for (const query of queries) {
      const found = await discoverByQuery(query, disc.minStars ?? 1500, disc.maxPerQuery ?? 40);
      for (const data of found) {
        if (data.archived) continue;
        const key = data.repo.toLowerCase();
        if (byRepo.has(key)) continue; // curated / topic wins
        if (!isRelevant(data, denylist)) continue;
        data.category = categorize(data, categoryIds);
        data.curated = false;
        byRepo.set(key, data);
        kept++;
      }
    }
    console.log(`  added ${kept} repos from keyword search`);
  }

  const projects = [...byRepo.values()].sort((a, b) => b.stars - a.stars);

  // 4) HackerNews signal — corroborate GitHub stars with real discussion.
  // A repo with huge stars but zero HN presence is a red flag (star-farming).
  console.log(`Enriching ${projects.length} repos with HackerNews signal...`);
  await enrichHN(projects);
  const withHN = projects.filter((p) => p.hnPoints > 0).length;
  console.log(`  ${withHN} repos have HN discussion`);

  // Build per-category counts
  const counts = {};
  for (const p of projects) counts[p.category] = (counts[p.category] || 0) + 1;

  const out = {
    generatedAt: new Date().toISOString(),
    source: "github",
    apiCalls,
    totals: {
      projects: projects.length,
      curated: projects.filter((p) => p.curated).length,
      discovered: projects.filter((p) => !p.curated).length,
      stars: projects.reduce((s, p) => s + p.stars, 0),
    },
    categories: seed.categories.map((c) => ({ ...c, count: counts[c.id] || 0 })),
    projects,
  };

  await mkdir(join(ROOT, "public"), { recursive: true });
  await writeFile(join(ROOT, "public", "data.json"), JSON.stringify(out, null, 2));
  console.log(
    `✓ Wrote public/data.json — ${projects.length} projects ` +
      `(${out.totals.curated} curated, ${out.totals.discovered} discovered), ${apiCalls} API calls.`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
