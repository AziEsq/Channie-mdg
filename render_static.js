// Static PNG renderer for the Network of Healing piece.
//
// Setup (one-time, in this folder):
//   npm install d3 topojson-client us-atlas playwright
//   npx playwright install chromium
//
// Run:
//   node render_static.js
//
// Outputs:
//   ./network_of_healing_print_8k.png       (7680×4320, for prints up to ~36"×20")
//   ./network_of_healing_wallpaper_1080p.png (1920×1080, for wallpaper / Zoom)
//
// To re-render after editing facilities_with_state.json or any of the
// constants below, just rerun this script.

const fs = require('fs');
const path = require('path');
const d3 = require('d3');
const topojson = require('topojson-client');
const { chromium } = require('playwright');

// ---- Inputs ----
const FACILITIES = JSON.parse(fs.readFileSync(path.join(__dirname, 'facilities_with_state.json'), 'utf8'));
const TARGET_NAMES = new Set(["Illinois","Indiana","Minnesota","Ohio","Pennsylvania","Wisconsin"]);

// ---- Manually-curated bridge edges between geographic clusters ----
// These connect facilities that wouldn't naturally link via k=2 nearest-neighbor
// (because they're in separate regional clusters), preserving the "one network" feel.
const BRIDGES = [
  ['Sugar Grove Senior Living', 'Eden Vista Stow'],          // IN -> OH
  ['Sugar Grove Senior Living', 'Maple Ridge'],               // IN -> OH
  ['Edenbrook Rochester', 'Edenbrook Platteville'],           // MN -> WI (SW)
  ['Edenbrook Rochester', 'Edenbrook Wisconsin Rapids'],      // MN -> WI (central)
  ['Eden Vista Barrington', 'Woods of Caledonia'],            // IL -> WI (SE)
  ['Eden Vista Barrington', 'Eden Vista Greendale'],          // IL -> WI (SE)
  ['Charleston House MC', 'Mission Creek'],                   // WI local
  ['The Heights at Evansville Manor', 'Eden Vista Hoffman Estates'] // WI -> IL
];

// ---- Canvas + palette ----
const W = 1920, H = 1080;
const C = {
  bg: '#061629',          // deep midnight navy (canvas)
  stateFill: '#0d2842',   // Eden Senior Care logo navy
  stateStroke: '#2a5689', // medium navy outline
  ambient: '#3d6298',     // dim blue background particles
  conn: 'rgba(196, 161, 107, 0.42)', // tan-gold connection threads
  goldAura: '#c19a5e',    // outer halo (Eden logo tan)
  goldMid: '#d4b885',     // mid glow (lighter tan)
  goldCore: '#f0dab0'     // bright cream-gold core
};

// ---- Geographic projection ----
const us = JSON.parse(fs.readFileSync(path.join(__dirname, 'node_modules/us-atlas/states-10m.json'), 'utf8'));
const all = topojson.feature(us, us.objects.states).features;
const targets = all.filter(f => TARGET_NAMES.has(f.properties.name));
const projection = d3.geoAlbers().fitExtent(
  [[80, 80], [W - 80, H - 140]],
  { type: 'FeatureCollection', features: targets }
);
const pathGen = d3.geoPath(projection);

// ---- Project each facility, then nudge co-located ones into a small ring ----
const projected = FACILITIES.map(f => ({ ...f, p: projection([f.lng, f.lat]) }));
const groupsByPos = {};
projected.forEach(f => {
  const k = Math.round(f.p[0] * 10) + ',' + Math.round(f.p[1] * 10);
  (groupsByPos[k] = groupsByPos[k] || []).push(f);
});
Object.values(groupsByPos).forEach(group => {
  if (group.length > 1) {
    const r = 14;
    group.forEach((f, i) => {
      const angle = (2 * Math.PI * i) / group.length - Math.PI / 2;
      f.p = [f.p[0] + Math.cos(angle) * r, f.p[1] + Math.sin(angle) * r];
    });
  }
});

// ---- Build edges: k=2 nearest neighbors + the manual bridges ----
const edges = new Set();
projected.forEach((f, i) => {
  const dists = projected.map((g, j) => ({
    j, d: i === j ? Infinity : Math.hypot(f.p[0] - g.p[0], f.p[1] - g.p[1])
  }));
  dists.sort((a, b) => a.d - b.d);
  for (let k = 0; k < 2; k++) {
    const j = dists[k].j;
    edges.add(i < j ? `${i}-${j}` : `${j}-${i}`);
  }
});
BRIDGES.forEach(([a, b]) => {
  const i = projected.findIndex(p => p.name === a);
  const j = projected.findIndex(p => p.name === b);
  if (i >= 0 && j >= 0) edges.add(i < j ? `${i}-${j}` : `${j}-${i}`);
});
const edgeList = [...edges].map(s => s.split('-').map(Number)).map(([i, j]) => [projected[i], projected[j]]);

// ---- Deterministic ambient-particle scatter (seeded so renders are reproducible) ----
let seed = 42;
const rand = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const ambient = [];
for (let i = 0; i < 120; i++) ambient.push({ x: rand()*W, y: rand()*H, r: 0.6 + rand()*1.4, o: 0.08 + rand()*0.22 });

// ---- Build static SVG (no animations, all dots fully lit) ----
let svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
<rect width="${W}" height="${H}" fill="${C.bg}"/>`;
ambient.forEach(a => svg += `<circle cx="${a.x.toFixed(1)}" cy="${a.y.toFixed(1)}" r="${a.r.toFixed(2)}" fill="${C.ambient}" opacity="${a.o.toFixed(2)}"/>`);
targets.forEach(t => svg += `<path d="${pathGen(t)}" fill="${C.stateFill}" stroke="${C.stateStroke}" stroke-width="1.4" opacity="0.95"/>`);
edgeList.forEach(([a, b]) => svg += `<line x1="${a.p[0].toFixed(1)}" y1="${a.p[1].toFixed(1)}" x2="${b.p[0].toFixed(1)}" y2="${b.p[1].toFixed(1)}" stroke="${C.conn}" stroke-width="2.5" stroke-linecap="round"/>`);
projected.forEach(f => {
  const [x, y] = f.p.map(v => v.toFixed(1));
  svg += `<g transform="translate(${x},${y})">
    <circle r="28" fill="${C.goldAura}" opacity="0.10"/>
    <circle r="14" fill="${C.goldMid}" opacity="0.40"/>
    <circle r="4.5" fill="${C.goldCore}"/>
  </g>`;
});
svg += `<text x="80" y="1010" font-family="Georgia, serif" font-style="italic" font-size="34" fill="#d4b885" opacity="0.75">A Network of Healing</text>
<text x="80" y="1042" font-family="sans-serif" font-size="14" fill="#3d6298" opacity="0.6" letter-spacing="3">FIFTY PLACES OF CARE · SIX STATES</text>
</svg>`;

const wrapHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
body, html { margin: 0; padding: 0; background: ${C.bg}; }
svg { display: block; width: 100vw; height: 100vh; }
</style></head><body>${svg}</body></html>`;
fs.writeFileSync(path.join(__dirname, '_static.html'), wrapHtml);

// ---- Use headless Chromium to rasterize at two resolutions ----
(async () => {
  const browser = await chromium.launch();
  const url = 'file://' + path.join(__dirname, '_static.html');

  for (const [scale, outName] of [[4, 'network_of_healing_print_8k.png'], [1, 'network_of_healing_wallpaper_1080p.png']]) {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: scale });
    const page = await ctx.newPage();
    await page.goto(url);
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(__dirname, outName) });
    console.log(outName + ' saved (' + (W*scale) + '×' + (H*scale) + ').');
    await ctx.close();
  }
  await browser.close();
  fs.unlinkSync(path.join(__dirname, '_static.html'));
})();
