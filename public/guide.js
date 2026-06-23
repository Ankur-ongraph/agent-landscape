"use strict";

const el = (id) => document.getElementById(id);
const esc = (s) => (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (n) => (n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, "") + "k" : String(n));

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

  // top projects per category (by stars), from the live data
  const topByCat = {};
  for (const p of data.projects) {
    (topByCat[p.category] ||= []).push(p);
  }
  // curated (correctly-placed chef's picks) first, then by stars — keeps the
  // "notable projects" credible even where auto-categorization is noisy
  for (const k in topByCat) topByCat[k].sort((a, b) => (b.curated ? 1 : 0) - (a.curated ? 1 : 0) || b.stars - a.stars);

  const cats = data.categories.filter((c) => c.count > 0);

  // ---- Index ----
  el("guideIndex").innerHTML =
    `<a class="gi-link gi-intro" href="#intro">Introduction</a>` +
    cats.map((c) => `<a class="gi-link" href="#g-${c.id}"><span class="gi-name">${esc(c.name)}</span><span class="gi-count">${c.count}</span></a>`).join("");

  // ---- Intro ----
  const totalStars = fmt(data.totals.stars);
  const intro = `
    <section class="guide-intro" id="intro">
      <h2>The agent landscape, one aisle at a time</h2>
      <p>Building an AI agent means choosing from a sprawling, fast-moving ecosystem. This guide breaks it into
      ${cats.length} categories — the "aisles" of the pantry — and explains each one the same way: <b>what it is</b>,
      <b>the problem it addresses</b>, <b>how it helps</b>, and a <b>technical 101</b> for engineers getting started.
      Right now the landscape tracks <b>${fmt(data.totals.projects)}</b> projects with a combined <b>${totalStars}★</b>.</p>
      <div class="legend">
        <span class="lg"><span class="lg-box featured"></span> <b>Featured</b> — hand-picked "chef's pick" entries</span>
        <span class="lg"><span class="lg-box oss"></span> <b>Open source</b> — has a detected OSS license</span>
        <span class="lg"><span class="lg-box prop"></span> <b>Proprietary</b> — no detected open-source license</span>
      </div>
      <p class="muted">Things move fast — new projects are scanned from GitHub daily, so always treat the live landscape as the source of truth.</p>
    </section>`;

  // ---- Chapters ----
  const chapters = cats.map((c) => {
    const g = guide[c.id] || {};
    const tops = (topByCat[c.id] || []).slice(0, 6);
    const examples = tops.map((p) =>
      `<a class="g-ex" href="${p.url}" target="_blank" rel="noopener" title="${esc(p.repo)}">${esc(p.name)} <span>★${fmt(p.stars)}</span></a>`).join("");
    const sect = (label, body) => body ? `<div class="g-section"><h4>${label}</h4><p>${esc(body)}</p></div>` : "";
    return `
      <section class="guide-chapter" id="g-${c.id}">
        <div class="g-head">
          <h2>${esc(c.name)}</h2>
          <span class="count">${c.count}</span>
          <a class="g-explore" href="./#cat-${c.id}">Explore the aisle →</a>
        </div>
        ${c.when ? `<p class="cat-when"><span class="tag">When to use</span>${esc(c.when)}</p>` : ""}
        ${sect("What it is", g.whatItIs)}
        ${sect("The problem it addresses", g.problem)}
        ${sect("How it helps", g.howItHelps)}
        ${sect("Technical 101", g.technical101)}
        ${examples ? `<div class="g-examples"><span class="g-ex-label">Notable projects</span>${examples}</div>` : ""}
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
