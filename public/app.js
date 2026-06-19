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

function sortProjects(list) {
  const s = state.sort;
  const cmp = {
    stars: (a, b) => b.stars - a.stars,
    updated: (a, b) => new Date(b.pushedAt || 0) - new Date(a.pushedAt || 0),
    created: (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0),
    name: (a, b) => a.name.localeCompare(b.name),
  }[s];
  return [...list].sort(cmp);
}

function cardHtml(p) {
  const lang = p.language
    ? `<span class="dot" style="background:${LANG_COLORS[p.language] || "#888"}"></span>${p.language}`
    : "";
  return `
    <div class="card" data-repo="${p.repo}">
      ${p.curated ? '<span class="badge-curated">curated</span>' : ""}
      <img class="avatar" loading="lazy" src="${avatarUrl(p)}" alt="" onerror="this.style.visibility='hidden'" />
      <div class="body">
        <div class="name" title="${p.repo}">${p.name}</div>
        <div class="owner">${p.owner}</div>
        <div class="desc">${escapeHtml(p.description) || "<em>No description</em>"}</div>
        <div class="meta">
          <span class="star">★ ${fmt(p.stars)}</span>
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
    const cards = sortProjects(items).map(cardHtml).join("");
    sections.push(`
      <section class="category" id="cat-${cat.id}">
        <div class="cat-head">
          <h2>${cat.name}</h2>
          <span class="count">${items.length}</span>
          <span class="desc">${cat.description}</span>
        </div>
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
  const topics = p.topics.slice(0, 8).map((t) => `<span class="chip" style="cursor:default">${t}</span>`).join(" ");
  el("detail").innerHTML = `
    <button class="close" aria-label="Close">×</button>
    <div class="detail-head">
      <img src="${avatarUrl(p)}" alt="" onerror="this.style.visibility='hidden'" />
      <div>
        <h3>${p.name}</h3>
        <div class="sub">${p.repo} · ${cat ? cat.name : ""}</div>
      </div>
    </div>
    <p class="detail-desc">${escapeHtml(p.description) || "No description provided."}</p>
    <div class="detail-grid">
      <div class="kv"><div class="k">Stars</div><div class="v">★ ${p.stars.toLocaleString()}</div></div>
      <div class="kv"><div class="k">Forks</div><div class="v">${p.forks.toLocaleString()}</div></div>
      <div class="kv"><div class="k">Language</div><div class="v">${p.language || "—"}</div></div>
      <div class="kv"><div class="k">License</div><div class="v">${p.license || "—"}</div></div>
      <div class="kv"><div class="k">Last push</div><div class="v">${timeAgo(p.pushedAt)}</div></div>
      <div class="kv"><div class="k">Open issues</div><div class="v">${fmt(p.openIssues)}</div></div>
    </div>
    ${topics ? `<div class="chips-inner" style="padding:0 0 12px">${topics}</div>` : ""}
    <div class="detail-actions">
      <a class="btn primary" href="${p.url}" target="_blank" rel="noopener">Open on GitHub →</a>
      ${p.homepage ? `<a class="btn" href="${p.homepage}" target="_blank" rel="noopener">Website</a>` : ""}
    </div>`;
  el("detail").querySelector(".close").addEventListener("click", closeDetail);
  el("backdrop").hidden = false;
}

function closeDetail() { el("backdrop").hidden = true; }

function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

load();
