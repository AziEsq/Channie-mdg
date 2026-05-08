# Network of Healing — Project Guide

A custom visualization of 50 Eden Senior Care facilities across IL, IN, MN, OH, PA, WI. Built as a Mother's Day gift, May 2026. The piece exists in three forms — animated HTML for a cinematic video capture, an 8K still PNG for prints, and a 1080p PNG for wallpapers — all rendered from one shared design.

## Files

| File | Purpose |
|---|---|
| `network_of_healing.html` | Animated, full-window. Open in a browser, F11 for fullscreen, Space to play. The source for the cinematic video (screen-record this). Pulls d3/topojson/us-atlas from CDN — needs internet on first load. |
| `network_of_healing_print_8k.png` | 7680×4320 static. Print master. At 300dpi this is ~25.6"×14.4"; can scale up to ~36"×20" before noticeable softness. |
| `network_of_healing_wallpaper_1080p.png` | 1920×1080 static. Drop into Zoom backgrounds, desktop wallpaper, etc. |
| `render_static.js` | Node script that generates both PNGs from `facilities_with_state.json` + the constants in the script. |
| `facilities_with_state.json` | Clean source data. Each facility has `name`, `lat`, `lng`, `state`. |
| `CLAUDE.md` | This file. |

## The visual design

**Palette (Eden Senior Care brand):**
- `#061629` — canvas (deep midnight navy, slightly darker than the logo navy so states "lift" off)
- `#0d2842` — state fill (the logo's navy circle color)
- `#2a5689` — state stroke + ambient particles
- `#c19a5e` — outer halo (the logo's tan-gold leaves)
- `#d4b885` — mid glow + connection threads
- `#f0dab0` — bright cream-gold core of each light

**Composition:**
- Each facility is rendered as **three concentric circles** (aura r=28, mid r=14, core r=4.5) — a flat-fill fake glow. No SVG filters, no blur, no gradients. This is intentional: it stays sharp at any zoom and renders fast in the browser.
- Co-located facilities (two buildings sharing one address) are **nudged into a small ring** in screen-space so each shows up. Affects: Edenbrook St. Cloud + Natures Point; Whispering Pines + Wolverton Glen.
- 120 dim background "stars" (deterministic seed = 42, so every render is identical).
- Title text in lower-left: italic Georgia "A Network of Healing", letter-spaced sans-serif "FIFTY PLACES OF CARE · SIX STATES".

**Animation (HTML version only):**
1. **0–0.2s:** state outlines fade in over deep navy.
2. **0.25s onward:** dots light up by state in fixed order — **MN → WI → PA → IL → IN → OH** — random within each state. Each dot animates from `opacity 0, scale 0.5` to `opacity 1, scale 1` with a slight overshoot (cubic-bezier `0.34, 1.56, 0.64, 1`). 95ms between dots within a state, 280ms pause between states. Total: ~6.5s.
3. **After all dots are lit:** connection lines fade in over 1.6s, then the heartbeat begins (synchronized lub-dub at ~70 BPM, infinite loop).
4. Title fades in last.
5. Press Space again to replay (re-shuffles within each state).

## The data model

`facilities_with_state.json` is the canonical source. The HTML embeds the same data inline (synced manually); `render_static.js` reads from the JSON file. **If you edit one, sync the other** — or refactor to import the JSON in both places.

```json
{ "name": "Eden Vista Madison", "lat": 43.147036, "lng": -89.36721, "state": "WI" }
```

State codes: `IL`, `IN`, `MN`, `OH`, `PA`, `WI`. Adding a new state means updating both `STATE_ORDER` (in HTML) and `TARGET_NAMES` (in HTML and `render_static.js`).

## Network logic — connections between dots

Connections are computed in **screen-space**, not geographic distance, so the visual neighborhoods drive the lines.

1. **k=2 nearest neighbors:** every facility links to its 2 closest peers in projected pixel-space. With 50 nodes this gives ~75 unique edges.
2. **Manual bridges (forced edges):** four connections that wouldn't happen naturally because they cross between regional clusters. Defined in both files as `BRIDGES` / `bridges`:
   - Sugar Grove Senior Living (IN) ↔ Eden Vista Stow (OH)
   - Sugar Grove Senior Living (IN) ↔ Maple Ridge (OH)
   - Edenbrook Rochester (MN) ↔ Edenbrook Platteville (WI)
   - Edenbrook Rochester (MN) ↔ Edenbrook Wisconsin Rapids (WI)

To add another bridge, just append `['Facility A name', 'Facility B name']` to the bridges list. To remove one, delete the line. Names must match `facilities_with_state.json` exactly.

## Critical gotchas (read before refactoring)

### 1. Map projection (Albers)
Raw lat/lng plotted linearly onto a US map will not align — US SVG basemaps use conic projections. We use `d3.geoAlbers().fitExtent(...)` and project facilities through **the same projection instance** that draws the states. If you swap basemaps, you must re-project facilities through the new one.

### 2. CSS transform vs SVG transform attribute
This bit us once and it's invisible until it isn't. **CSS `transform` overrides SVG's `transform` attribute** in modern browsers. So if you put `translate(x,y)` on a `<g>` via d3 and ALSO have `.facility-group { transform: scale(...) }` in CSS, the dots all collapse to (0,0).

The fix is the wrapper-group pattern:
```html
<g transform="translate(x,y)">          <!-- positioning, set by d3 -->
  <g class="facility-group">             <!-- CSS animations live here -->
    <circle .../> <circle .../> ...
  </g>
</g>
```
Don't move the `transform` attribute back to the same element as the `class`.

### 3. CDN dependency
The animated HTML pulls three things at runtime:
- `d3@7.8.5` from cdnjs
- `topojson@3.0.2` from cdnjs
- `us-atlas/states-10m.json` from jsdelivr

This works in any normal browser with internet. It does **NOT** work in restricted environments like the Claude.ai HTML preview (CSP blocks the scripts) or offline. To make a fully self-contained version, inline all three (the topology JSON is ~115KB; the libraries together are ~600KB). Easiest route: read the files from `node_modules` and string-replace the script tags + the `d3.json(...)` call with the inlined content.

## Most likely future edits

### Adding facility opening dates → chronological light-up

The current order is `STATE_ORDER` followed by random within state. If you get the dates each facility came online, you can swap to chronological:

1. Add an `opened` field (ISO date string) to each entry in `facilities_with_state.json` and the inline `FACILITIES` array in the HTML.
2. In the HTML, replace the `STATE_ORDER.forEach(...)` block in `play()` with:
   ```javascript
   const sorted = [...projected].sort((a, b) => new Date(a.opened) - new Date(b.opened));
   sorted.forEach(f => {
     setTimeout(() => {
       const el = document.querySelector(`.facility-group[data-name="${CSS.escape(f.name)}"]`);
       if (el) el.classList.add('lit');
     }, t);
     t += dotDelay;
   });
   ```
That's the entire change. Static PNG renderer doesn't need updating — it shows everything fully lit anyway.

### Adding a new facility

1. Add to `facilities_with_state.json`.
2. Add the same record to the `FACILITIES` array in the HTML (keep the two in sync).
3. If it's in a new state, add the state code to `STATE_ORDER` and the state name to `TARGET_NAMES` in both files.
4. Re-run `node render_static.js`.

### Tweaking the look

All palette values live in the `C` object (in both files — keep them in sync). Heartbeat timing is in the `@keyframes heartbeat` rule in the HTML. Tempo is `animation: heartbeat 1.4s ...` — drop to `1.2s` for ~83 BPM, raise to `1.7s` for ~58 BPM.

Connection density: change the `for (let k = 0; k < 2; k++)` to k=1 (sparser) or k=3 (denser) in both files.

### Re-rendering PNGs at different sizes

In `render_static.js`, the bottom loop renders at scale 4 (8K) and scale 1 (1080p). Add another entry like `[8, 'network_of_healing_16k.png']` for a 15360×8640 monster. For different aspect ratios, change `W` and `H` at the top — the projection's `fitExtent` will re-pack the states automatically.

### Different aspect ratio (e.g. portrait phone wallpaper)

Set `W = 1080, H = 1920` (or whatever). Adjust the title position (`y="1010"` and `y="1042"` in the SVG text) since they're hardcoded for 1080-tall canvas. The `fitExtent` padding `[[80, 80], [W - 80, H - 140]]` may also need tuning to leave room for the title.

## Render pipeline

`render_static.js` does everything server-side:
1. Reads facilities + topology from disk
2. Computes projection, applies it to every facility
3. Nudges co-located facilities into a small ring
4. Builds the k=2 edges + manual bridges
5. Generates a static SVG string with all elements positioned
6. Wraps it in a minimal HTML shell
7. Uses Playwright (headless Chromium) to rasterize at two resolutions
8. Cleans up the temp HTML

Setup (one-time, in this folder):
```
npm install d3 topojson-client us-atlas playwright
npx playwright install chromium
```

Run:
```
node render_static.js
```

The script is deterministic — same data + same constants → byte-identical output.

## Original conversation context

Built collaboratively with Claude over a single session, May 7-8 2026. Started from a CSV of facility addresses + a US SVG that had a projection mismatch. Decided against Blender (would have been gorgeous but too steep a learning curve for the deadline) in favor of a web-stack approach matching the existing skill set (Next.js / React / D3). Eden Senior Care brand colors were applied after the initial palette was rejected for being too generic. The MN→WI and IN→OH bridges were added manually after seeing the auto-generated network leave those clusters disconnected.
