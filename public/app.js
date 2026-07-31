"use strict";

const LANG_COLORS = {
  Python: "#3572A5", TypeScript: "#3178c6", JavaScript: "#f1e05a", Go: "#00ADD8",
  Rust: "#dea584", Java: "#b07219", "C++": "#f34b7d", "C#": "#178600",
  Ruby: "#701516", Jupyter: "#DA5B0B", "Jupyter Notebook": "#DA5B0B", HTML: "#e34c26",
  Shell: "#89e051", Kotlin: "#A97BFF", Swift: "#F05138", PHP: "#4F5D95",
};

const state = {
  data: null,
  filter: "all",
  search: "",
  sort: "stars",
  curatedOnly: false,
};

const el = (id) => document.getElementById(id);

function fmt(n) {
  if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, "") + "k";
  return String(n);
}

function fmtBig(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  return fmt(n);
}

function timeAgo(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days < 1) return "today";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function avatarUrl(p) {
  return `https://github.com/${p.owner}.png?size=80`;
}

async function load() {
  try {
    const res = await fetch("data.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(res.status);
    state.data = await res.json();
  } catch (e) {
    el("board").innerHTML = `<div class="no-results">Could not load data.json (${e.message}). Run <code>npm run scan</code> first.</div>`;
    return;
  }
  renderStats();
  renderChips();
  bindControls();
  render();
  // Sections are built here (async), so honor a #cat-… hash now that they exist.
  setTimeout(scrollToHash, 60);
}

function scrollToHash() {
  if (!location.hash) return;
  const id = decodeURIComponent(location.hash.slice(1));
  const target = document.getElementById(id);
  if (!target) return;
  // Instant jump (not smooth) so deep-links land reliably, offset for the sticky toolbar.
  const y = target.getBoundingClientRect().top + window.scrollY - 92;
  window.scrollTo({ top: y, behavior: "instant" });
}

function renderStats() {
  const t = state.data.totals;
  el("stats").innerHTML = [
    ["Projects", fmt(t.projects)],
    ["Total stars", fmt(t.stars)],
    ["Categories", state.data.categories.filter((c) => c.count > 0).length],
    ["Curated", t.curated],
  ].map(([lbl, num]) => `<div class="stat"><div class="num">${num}</div><div class="lbl">${lbl}</div></div>`).join("");

  const gen = new Date(state.data.generatedAt);
  el("generated").textContent = `Last updated ${timeAgo(state.data.generatedAt)} (${gen.toISOString().slice(0, 10)}).`;
}

function renderChips() {
  const cats = state.data.categories;
  const chips = [`<button class="chip ${state.filter === "all" ? "active" : ""}" data-cat="all">All <span class="c">${state.data.totals.projects}</span></button>`];
  for (const c of cats) {
    if (!c.count) continue;
    chips.push(`<button class="chip ${state.filter === c.id ? "active" : ""}" data-cat="${c.id}">${c.name} <span class="c">${c.count}</span></button>`);
  }
  const inner = document.querySelector(".chips-inner");
  inner.innerHTML = chips.join("");
  inner.querySelectorAll(".chip").forEach((b) =>
    b.addEventListener("click", () => {
      state.filter = b.dataset.cat;
      renderChips();
      render();
      if (state.filter !== "all") {
        const sec = document.getElementById(`cat-${state.filter}`);
        if (sec) sec.scrollIntoView({ block: "start" });
      }
    })
  );
}

function bindControls() {
  el("search").addEventListener("input", (e) => { state.search = e.target.value.toLowerCase().trim(); render(); });
  el("sort").addEventListener("change", (e) => { state.sort = e.target.value; render(); });
  el("curatedOnly").addEventListener("change", (e) => { state.curatedOnly = e.target.checked; render(); });
  el("backdrop").addEventListener("click", (e) => { if (e.target === el("backdrop")) closeDetail(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDetail(); });
  window.addEventListener("hashchange", scrollToHash);
  const ub = el("useAgentBtn");
  if (ub) ub.addEventListener("click", openAgentModal);
}

function matches(p) {
  if (state.curatedOnly && !p.curated) return false;
  if (state.filter !== "all" && p.category !== state.filter) return false;
  if (state.search) {
    const hay = `${p.repo} ${p.description} ${p.topics.join(" ")} ${p.language}`.toLowerCase();
    if (!hay.includes(state.search)) return false;
  }
  return true;
}

// HN-weighted star score: discounts stars by lack of HN developer interest.
// 0 HN → 40% weight; 10 HN → ~65%; 50 HN → ~85%; 100+ HN → ~95%+.
function hnScore(p) {
  const hn = p.hnPoints || 0;
  return (p.stars || 0) * (0.4 + 0.6 * (1 - 1 / (1 + hn / 20)));
}

function sortProjects(list) {
  const s = state.sort;
  const cmp = {
    // Default sort: HN-weighted stars, but HF models keep their trending rank
    // (likes are all-time and would re-freeze the aisle on old favourites).
    stars: (a, b) =>
      (a.trendRank != null && b.trendRank != null)
        ? a.trendRank - b.trendRank
        : hnScore(b) - hnScore(a),
    hn: (a, b) => (b.hnPoints || 0) - (a.hnPoints || 0) || b.stars - a.stars,
    updated: (a, b) => new Date(b.pushedAt || 0) - new Date(a.pushedAt || 0),
    created: (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0),
    name: (a, b) => a.name.localeCompare(b.name),
  }[s];
  return [...list].sort(cmp);
}

// CNCF-style tiers: featured (a few marquee chef's picks per aisle) → big
// highlighted box; open source (has an OSS license) → standard box;
// proprietary / no detected OSS license → muted gray box.
const FEATURED_PER_AISLE = 3;
function cardTier(p, featured) {
  if (featured) return "featured";
  if (p.curated || p.source === "huggingface") return "oss"; // vetted / model entries are open even if no SPDX license detected
  return p.license ? "oss" : "proprietary";
}

// Hot = on GitHub Trending at scan time, or gained 200+ stars since the last
// daily scan. Falls back to lifetime velocity (≥6000 stars/month) if neither
// signal is available yet.
function isHot(p) {
  if (p.source === "huggingface") return false;
  if (p.trending) return true;
  if (p.starsDelta != null) return p.starsDelta >= 200;
  if (!p.createdAt) return false;
  const months = (Date.now() - new Date(p.createdAt).getTime()) / (1000 * 60 * 60 * 24 * 30.4);
  if (months < 1 || (p.stars || 0) < 1500) return false;
  return p.stars / months >= 6000;
}

function cardHtml(p, featured) {
  const tier = cardTier(p, featured);
  const lang = p.language
    ? `<span class="dot" style="background:${LANG_COLORS[p.language] || "#888"}"></span>${p.language}`
    : "";
  if (p.source === "huggingface") {
    // Featured models show the chef's-pick badge (the 🤗 identity stays via the
    // avatar); otherwise the corner shows the HF badge.
    const cornerBadge = featured
      ? '<span class="badge-tier featured">🧑‍🍳 Featured</span>'
      : '<span class="badge-tier hf-badge">🤗 HF</span>';
    return `
    <div class="card ${featured ? "featured" : "oss"} hf" data-repo="${p.repo}">
      ${cornerBadge}
      <div class="avatar hf-avatar">🤗</div>
      <div class="body">
        <div class="name" title="${p.repo}">${escapeHtml(p.name)}</div>
        <div class="owner">${escapeHtml(p.owner)}</div>
        <div class="desc">${escapeHtml(p.description) || "<em>No description</em>"}</div>
        <div class="meta">
          <span class="star">♥ ${fmt(p.likes || p.stars)}</span>
          <span class="dl" title="downloads (last month)">⬇ ${fmtBig(p.downloads || 0)}</span>
          ${lang ? `<span>${escapeHtml(p.language)}</span>` : ""}
        </div>
      </div>
    </div>`;
  }
  const badge =
    tier === "featured" ? '<span class="badge-tier featured">🧑‍🍳 Featured</span>'
    : tier === "proprietary" ? '<span class="badge-tier prop">no OSS license</span>'
    : "";
  const hot = isHot(p) ? '<span class="hot" title="Hot — gaining stars fast right now">🌶️</span>' : "";
  return `
    <div class="card ${tier}" data-repo="${p.repo}">
      ${badge}
      <img class="avatar" loading="lazy" src="${avatarUrl(p)}" alt="" onerror="this.style.visibility='hidden'" />
      <div class="body">
        <div class="name" title="${p.repo}">${p.name}</div>
        <div class="owner">${p.owner}</div>
        <div class="desc">${escapeHtml(p.description) || "<em>No description</em>"}</div>
        <div class="meta">
          <span class="star">★ ${fmt(p.stars)}</span>
          ${hot}
          ${p.hnPoints ? `<span class="hn" title="${p.hnStories} HN ${p.hnStories === 1 ? "story" : "stories"}">Y ${fmt(p.hnPoints)}</span>` : ""}
          ${lang ? `<span>${lang}</span>` : ""}
          <span>↻ ${timeAgo(p.pushedAt)}</span>
        </div>
      </div>
    </div>`;
}

function render() {
  const board = el("board");
  const visible = state.data.projects.filter(matches);

  if (!visible.length) {
    board.innerHTML = `<div class="no-results">No projects match your filters.</div>`;
    return;
  }

  // Group by category, preserving category order
  const byCat = new Map();
  for (const p of visible) {
    if (!byCat.has(p.category)) byCat.set(p.category, []);
    byCat.get(p.category).push(p);
  }

  const sections = [];
  for (const cat of state.data.categories) {
    const items = byCat.get(cat.id);
    if (!items || !items.length) continue;
    // Feature top curated picks per aisle — must be active (pushed within 90 days).
    // Models are never curated (they come from HF), so feature the top trending
    // ones instead — keeps visual parity with every other aisle and the marquee
    // rotates with the daily trending refresh.
    const cutoff90 = Date.now() - 90 * 24 * 60 * 60 * 1000;
    const featured = new Set(
      (cat.id === "models"
        ? [...items].sort((a, b) => (a.trendRank ?? 1e9) - (b.trendRank ?? 1e9))
        : items
            .filter((p) => p.curated && p.pushedAt && new Date(p.pushedAt).getTime() >= cutoff90)
            .sort((a, b) => b.stars - a.stars)
      )
        .slice(0, FEATURED_PER_AISLE)
        .map((p) => p.repo)
    );
    const cards = sortProjects(items).map((p) => cardHtml(p, featured.has(p.repo))).join("");
    sections.push(`
      <section class="category" id="cat-${cat.id}">
        <div class="cat-head">
          <h2>${cat.name}</h2>
          <span class="count">${items.length}</span>
        </div>
        ${cat.when ? `<p class="cat-when"><span class="tag">When to use</span>${escapeHtml(cat.when)}</p>` : (cat.description ? `<p class="cat-when">${escapeHtml(cat.description)}</p>` : "")}
        <div class="grid">${cards}</div>
      </section>`);
  }
  board.innerHTML = sections.join("");

  board.querySelectorAll(".card").forEach((c) =>
    c.addEventListener("click", () => openDetail(c.dataset.repo))
  );
}

function openDetail(repo) {
  const p = state.data.projects.find((x) => x.repo === repo);
  if (!p) return;
  const cat = state.data.categories.find((c) => c.id === p.category);
  const topics = p.topics.slice(0, 8).map((t) => `<span class="chip" style="cursor:default">${escapeHtml(t)}</span>`).join(" ");
  const isHF = p.source === "huggingface";
  const head = isHF
    ? `<div class="avatar hf-avatar" style="width:54px;height:54px;font-size:26px;border-radius:12px">🤗</div>`
    : `<img src="${avatarUrl(p)}" alt="" onerror="this.style.visibility='hidden'" />`;
  const grid = isHF
    ? `
      <div class="kv"><div class="k">Likes</div><div class="v">♥ ${(p.likes || 0).toLocaleString()}</div></div>
      <div class="kv"><div class="k">Downloads</div><div class="v">⬇ ${fmtBig(p.downloads || 0)}</div></div>
      <div class="kv"><div class="k">Task</div><div class="v" style="font-size:13px">${escapeHtml(p.language || "—")}</div></div>
      <div class="kv"><div class="k">License</div><div class="v">${escapeHtml(p.license || "—")}</div></div>
      <div class="kv"><div class="k">Updated</div><div class="v">${timeAgo(p.pushedAt)}</div></div>
      <div class="kv"><div class="k">Source</div><div class="v" style="font-size:13px">🤗 Hugging Face</div></div>`
    : `
      <div class="kv"><div class="k">Stars</div><div class="v">★ ${p.stars.toLocaleString()}</div></div>
      <div class="kv"><div class="k">Forks</div><div class="v">${p.forks.toLocaleString()}</div></div>
      <div class="kv"><div class="k">Language</div><div class="v">${p.language || "—"}</div></div>
      <div class="kv"><div class="k">License</div><div class="v">${p.license || "—"}</div></div>
      <div class="kv"><div class="k">Last push</div><div class="v">${timeAgo(p.pushedAt)}</div></div>
      <div class="kv"><div class="k">Hacker News</div><div class="v">${p.hnPoints ? `<span class="hn">Y ${fmt(p.hnPoints)}</span>` : "—"}</div></div>`;
  el("detail").innerHTML = `
    <button class="close" aria-label="Close">×</button>
    <div class="detail-head">
      ${head}
      <div>
        <h3>${escapeHtml(p.name)}</h3>
        <div class="sub">${escapeHtml(p.repo)} · ${cat ? escapeHtml(cat.name) : ""}</div>
      </div>
    </div>
    <p class="detail-desc">${escapeHtml(p.description) || "No description provided."}</p>
    <div class="detail-grid">${grid}</div>
    ${topics ? `<div class="chips-inner" style="padding:0 0 12px">${topics}</div>` : ""}
    <div class="detail-actions">
      <a class="btn primary" href="${safeHref(p.url)}" target="_blank" rel="noopener">${isHF ? "View on Hugging Face →" : "Open on GitHub →"}</a>
      ${p.hnUrl ? `<a class="btn" href="${safeHref(p.hnUrl)}" target="_blank" rel="noopener">Hacker News</a>` : ""}
      ${p.homepage ? `<a class="btn" href="${safeHref(p.homepage)}" target="_blank" rel="noopener">Website</a>` : ""}
    </div>`;
  el("detail").querySelector(".close").addEventListener("click", closeDetail);
  el("backdrop").hidden = false;
}

function openAgentModal() {
  const full = new URL("llms-full.txt", location.href).href;
  const short = new URL("llms.txt", location.href).href;
  const data = new URL("data.json", location.href).href;
  const prompt = `Read ${full} — it's a categorized, up-to-date index of AI agent frameworks & tools. Use it to recommend the right tools for what I'm building.`;
  const map = { full, short, data, prompt };
  const d = el("detail");
  d.style.removeProperty("--cat-color");
  d.innerHTML = `
    <button class="close" aria-label="Close">×</button>
    <h3 style="margin:0 0 8px">🤖 Use this in your agent</h3>
    <p class="detail-desc" style="margin-top:0">Point Claude, Codex, Cursor, or any LLM at this machine-readable index of the whole landscape — it gets the 15 aisles, what each is for, and the top tools per category. Updated daily.</p>
    <div class="use-row"><div><div class="use-label">Full index — everything</div><code class="use-url">${escapeHtml(full)}</code></div><button class="btn copy" data-copy="full">Copy</button></div>
    <div class="use-row"><div><div class="use-label">Short index — overview + links</div><code class="use-url">${escapeHtml(short)}</code></div><button class="btn copy" data-copy="short">Copy</button></div>
    <div class="use-row"><div><div class="use-label">Raw data (JSON)</div><code class="use-url">${escapeHtml(data)}</code></div><button class="btn copy" data-copy="data">Copy</button></div>
    <div class="use-tip"><b>Paste this into your chat:</b>
      <code>${escapeHtml(prompt)}</code>
      <button class="btn copy primary" data-copy="prompt">Copy prompt</button>
    </div>`;
  d.querySelectorAll("[data-copy]").forEach((b) =>
    b.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(map[b.dataset.copy]); } catch { return; }
      const t = b.textContent; b.textContent = "Copied!"; setTimeout(() => (b.textContent = t), 1300);
    })
  );
  d.querySelector(".close").addEventListener("click", closeDetail);
  el("backdrop").hidden = false;
}

function closeDetail() { el("backdrop").hidden = true; }

function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Only allow http(s) links. url/homepage come from scanned GitHub/HF metadata,
// which is owner-controlled — a repo's `homepage` could be a javascript: URL.
// Returns "#" for anything that isn't a plain http(s) link, then escapes it for
// safe interpolation into an href attribute.
function safeHref(u) {
  if (!u) return "#";
  try {
    const parsed = new URL(u, location.href);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "#";
    return escapeHtml(parsed.href);
  } catch {
    return "#";
  }
}

load();
