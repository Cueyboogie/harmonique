# Handoff: replace "Current reads" with the Harmonique "Builds" tile

For the theavidobserver.com build.

> **Already added the tile?** Then only replace `/side-quests/harmonique/index.html` with the attached
> `harmonique-page.html` (latest build: steadier timing, loops close cleanly, lower latency, and a tip in the
> how-to panel that wireless headphones add delay). Nothing else changes. Everything needed is in this note, plus ONE attached file:
**`harmonique-page.html`** (the full-screen instrument page, self-contained; don't edit it).

## What to do

1. **Replace the Current reads tile.** In the home page grid, replace the whole
   `<button class="tile visual visual--b shelf" id="shelf-tile" …>…</button>` with the `<button id="harmonique-tile" …>`
   from the code below, in the same grid position (it spans 2 columns via `tile--w2`, same size as the shelf tile).
   Remove the shelf modal and any JS bound to `#shelf-tile` so nothing errors.
2. **Add the CSS** (the `<link>` and `<style>` below) to the site's head/stylesheet. It only adds `.harmonique-tile` / `.hq-*`
   rules and relies on the existing `.tile`, `.visual`, `.act` styles.
3. **Add the JS** below: clicking the tile goes to `/side-quests/harmonique/`. If the site has a shared tile click handler,
   route `#harmonique-tile` through it instead.
4. **Add the page:** save the attached `harmonique-page.html` as `/side-quests/harmonique/index.html`.
   It opens with a how-to panel, and its round × (top right) returns to `/`.

## Keep as is
- Label `Side quest · Builds`; tooltip `Harmonique|A chord instrument I designed and built. Open it and play`.
- `data-cat="side"` (shows under the Side Quests filter).
- The tile is always dark (it's a screen): amber outlined HARMONIQUE, a sweeping heartbeat line, and
  "A CHORD INSTRUMENT · DESIGNED & BUILT BY ME" under it. The label sits top-left like the other tiles.

## Check before publishing
- The tile sits where Current reads was, same size, hover expand icon shows; the line sweeps (static with reduced motion).
- Side Quests filter shows it. Works in the light theme too.
- Click → `/side-quests/harmonique/` loads; keys A S D F G H J K play chords; × returns to the grid.

## The tile code

```html
<!-- 1) the tile -->
<button class="tile tile--w2 visual harmonique-tile" id="harmonique-tile" data-cat="side"
        data-tip="Harmonique|A chord instrument I designed and built. Open it and play" aria-label="Side quest · Builds. Harmonique, a chord instrument I designed and built. Open it and play">
  <span>Side quest · Builds</span>
  <div class="hq-screen" aria-hidden="true">
    <svg class="hq-svg" viewBox="0 0 320 110">
      <text class="hq-word" x="160" y="44" text-anchor="middle">HARMONIQUE</text>
      <path class="hq-base" d="M8 82 H312"/>
      <text class="hq-by" x="160" y="104" text-anchor="middle">A CHORD INSTRUMENT · DESIGNED &amp; BUILT BY ME</text>
      <path class="hq-trace" pathLength="100" d="M8 82 H40 L46 82 L50 88 L56 58 L62 92 L68 82 H112 L118 82 L122 88 L128 58 L134 92 L140 82 H184 L190 82 L194 88 L200 58 L206 92 L212 82 H256 L262 82 L266 88 L272 58 L278 92 L284 82 H312"/>
    </svg>
  </div>
  <i class="act" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6"></path><path d="M20 4l-7.5 7.5"></path><path d="M10 20H4v-6"></path><path d="M4 20l7.5-7.5"></path></svg></i>
</button>

<!-- 2) styles -->
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Righteous&display=swap">
<style>
  /* the whole tile is the screen: black glass, scanlines, vignette; the label sits on top */
  .harmonique-tile { background: radial-gradient(ellipse at 50% 55%, #1C0D04 0%, #0A0502 70%, #050302 100%); }
  .harmonique-tile .hq-screen {
    position: absolute; inset: 0; display: grid; place-items: center; padding-top: 18px;
    transition: transform .6s cubic-bezier(.2,.7,.2,1);
  }
  .harmonique-tile .hq-screen::after { /* scanlines + vignette */
    content: ""; position: absolute; inset: 0; pointer-events: none;
    background: repeating-linear-gradient(0deg, rgba(0,0,0,.28) 0 1px, transparent 1px 3px),
                radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,.6) 100%);
  }
  .harmonique-tile > span { z-index: 2; color: color-mix(in srgb, #FF9E2C 70%, var(--ink-2, #A0A5B0)); }
  .harmonique-tile .hq-svg { width: 78%; height: auto; overflow: visible;
    filter: drop-shadow(0 0 3px #FF9E2C) drop-shadow(0 0 8px rgba(255,158,44,.45)); }
  .harmonique-tile .hq-word { font: 400 30px/1 'Righteous', system-ui, sans-serif; letter-spacing: .06em;
    fill: none; stroke: #FF9E2C; stroke-width: 1.1; transform: skewX(-10deg); transform-origin: 160px 44px; }
  .harmonique-tile .hq-by { font: 500 7.5px/1 'JetBrains Mono', ui-monospace, monospace; letter-spacing: .14em; fill: #FF9E2C; fill-opacity: .8; }
  .harmonique-tile .hq-base { stroke: #FF9E2C; stroke-opacity: .25; stroke-width: 1.2; fill: none; }
  .harmonique-tile .hq-trace { stroke: #FF9E2C; stroke-width: 1.6; fill: none; stroke-linejoin: round;
    stroke-dasharray: 22 78; animation: hq-sweep 2.6s linear infinite; }
  @keyframes hq-sweep { from { stroke-dashoffset: 100; } to { stroke-dashoffset: 0; } }
  .harmonique-tile:hover .hq-screen, .harmonique-tile:focus-visible .hq-screen { transform: scale(1.03); }
  @media (prefers-reduced-motion: reduce) { .harmonique-tile .hq-trace { animation: none; stroke-dasharray: none; } }
</style>

<!-- 3) behaviour: open the instrument (its round × brings people back to the grid) -->
<script>
  document.getElementById('harmonique-tile')?.addEventListener('click', () => {
    window.location.href = '/side-quests/harmonique/';
  });
</script>
```
