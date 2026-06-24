"use strict";

const el = (id) => document.getElementById(id);
const esc = (s) => (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (n) => (n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, "") + "k" : String(n));
const avatar = (p) => `https://github.com/${p.owner}.png?size=48`;

// One accent per aisle so chapters read as distinct, colorful cards.
const CAT_COLORS = {
  serving: "#e0822e", frameworks: "#5b8cff", orchestration: "#c79234", autonomous: "#e0574a",
  coding: "#3fb950", skills: "#b07cff", sandboxes: "#ff7a45", "computer-use": "#1fb6a8",
  "memory-rag": "#d6a02e", data: "#2ea0d6", protocols: "#8b7cff", observability: "#4f9cff",
  runtimes: "#cf9540", voice: "#e05a8a",
};
// The four guide facets, with an icon each.
const FACETS = [
  ["whatItIs", "What it is", "📦"],
  ["problem", "The problem it addresses", "⚠️"],
  ["howItHelps", "How it helps", "✅"],
  ["technical101", "Technical 101", "🛠️"],
];

async function load() {
  let data, guide;
  try {
    [data, guide] = await Promise.all([
      fetch("data.json", { cache: "no-cache" }).then((r) => r.json()),
      fetch("guide.json", { cache: "no-cache" }).then((r) => r.json()),
    ]);
  } catch (e) {
    el("guideMain").innerHTML = `<div class="no-results">Could not load the guide (${e.message}).</div>`;
    return;
  }

  const topByCat = {};
  for (const p of data.projects) (topByCat[p.category] ||= []).push(p);
  // curated (correctly-placed) first, then by stars — keeps examples credible
  for (const k in topByCat) topByCat[k].sort((a, b) => (b.curated ? 1 : 0) - (a.curated ? 1 : 0) || b.stars - a.stars);

  const cats = data.categories.filter((c) => c.count > 0);
  const color = (id) => CAT_COLORS[id] || "var(--accent)";

  // ---- Index ----
  el("guideIndex").innerHTML =
    `<a class="gi-link gi-intro" href="#intro">Introduction</a>` +
    cats.map((c) => `<a class="gi-link" href="#g-${c.id}" style="--cat:${color(c.id)}"><span class="gi-dot"></span><span class="gi-name">${c.icon ? c.icon + " " : ""}${esc(c.name)}</span><span class="gi-count">${c.count}</span></a>`).join("");

  // ---- Intro ----
  const intro = `
    <section class="guide-intro" id="intro">
      <h2>The agent landscape, one aisle at a time</h2>
      <p>Building an AI agent means choosing from a sprawling, fast-moving ecosystem. This guide breaks it into
      ${cats.length} categories — the "aisles" of the pantry — and explains each one the same way:
      <b>what it is</b>, <b>the problem it addresses</b>, <b>how it helps</b>, and a <b>technical 101</b>.
      Right now the landscape tracks <b>${fmt(data.totals.projects)}</b> projects with a combined <b>${fmt(data.totals.stars)}★</b>.</p>
      <div class="g-attribution">
        <span class="g-attr-icon">📚</span>
        <div>The format of this guide — <em>What it is · The problem it addresses · How it helps · Technical 101</em> —
        is adapted from the excellent <a href="https://landscape.cncf.io/guide" target="_blank" rel="noopener">CNCF Landscape Guide</a>,
        applied here to the AI agent ecosystem. Thanks to the CNCF for the model.</div>
      </div>
      <div class="legend">
        <span class="lg"><span class="lg-box featured"></span> <b>Featured</b> — top chef's picks</span>
        <span class="lg"><span class="lg-box oss"></span> <b>Open source</b></span>
        <span class="lg"><span class="lg-box prop"></span> <b>Proprietary</b> / no OSS license</span>
      </div>
      <p class="muted">New projects are scanned from GitHub daily — always treat the live landscape as the source of truth.</p>
    </section>`;

  // ---- Chapters ----
  const chapters = cats.map((c) => {
    const g = guide[c.id] || {};
    const facetCards = FACETS.filter(([k]) => g[k]).map(([k, label, icon]) =>
      `<div class="g-facet ${k === "technical101" ? "tech" : ""}">
         <div class="g-facet-head"><span class="g-facet-icon">${icon}</span>${label}</div>
         <p>${esc(g[k])}</p>
       </div>`).join("");
    const examples = (topByCat[c.id] || []).slice(0, 6).map((p) =>
      `<a class="g-ex" href="${p.url}" target="_blank" rel="noopener" title="${esc(p.repo)}">
         <img loading="lazy" src="${avatar(p)}" alt="" onerror="this.style.display='none'" />
         <span class="g-ex-name">${esc(p.name)}</span><span class="g-ex-star">★${fmt(p.stars)}</span>
       </a>`).join("");
    return `
      <section class="guide-chapter" id="g-${c.id}" style="--cat:${color(c.id)}">
        <div class="g-head">
          <span class="g-icon">${c.icon || "📁"}</span>
          <div class="g-head-text"><h2>${esc(c.name)}</h2><span class="count">${c.count} projects</span></div>
          <a class="g-explore" href="./#cat-${c.id}">Explore the aisle →</a>
        </div>
        ${c.when ? `<p class="cat-when"><span class="tag">When to use</span>${esc(c.when)}</p>` : ""}
        <div class="g-facets">${facetCards}</div>
        ${examples ? `<div class="g-examples"><span class="g-ex-label">Notable projects</span><div class="g-ex-list">${examples}</div></div>` : ""}
      </section>`;
  }).join("");

  el("guideMain").innerHTML = intro + chapters;

  // active-section highlight in the index
  const links = [...document.querySelectorAll(".gi-link")];
  const byId = Object.fromEntries(links.map((l) => [l.getAttribute("href").slice(1), l]));
  const obs = new IntersectionObserver((ents) => {
    for (const e of ents) {
      if (e.isIntersecting) {
        links.forEach((l) => l.classList.remove("active"));
        byId[e.target.id]?.classList.add("active");
      }
    }
  }, { rootMargin: "-20% 0px -70% 0px" });
  document.querySelectorAll("section[id]").forEach((s) => obs.observe(s));
}

load();
