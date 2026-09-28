# Handoff: replace "Current reads" with the Harmonique "Builds" tile

For the theavidobserver.com build. Three files come with this note:
- `tile-snippet.html`: the new grid tile (markup, CSS, JS)
- `harmonique-page.html`: the full-screen instrument page (one self-contained file)
- `tile-preview.png`: how the tile should look

## What to change

1. **Replace the Current reads tile.** In the home page grid, replace the whole
   `<button class="tile visual visual--b shelf" id="shelf-tile" …>…</button>` with the `<button id="harmonique-tile" …>` from `tile-snippet.html`.
   Keep it in the same grid position. It spans 2 columns (`tile--w2`), the same size as the shelf tile.
   - Remove (or leave unused) the shelf modal and any JS bound to `#shelf-tile`, so nothing errors.
   - The book spine images in `/assets/books/` are no longer used on the home page.

2. **Add the CSS** from `tile-snippet.html` (the `<style>` block, plus the Righteous font link) to the site's stylesheet/head.
   It only adds `.harmonique-tile` / `.hq-*` rules and relies on the existing `.tile`, `.visual`, `.act` styles.

3. **Add the JS** from `tile-snippet.html`: clicking the tile goes to `/side-quests/harmonique/`.
   If the site has a shared click/expand handler for tiles, route `#harmonique-tile` to that URL the same way.

4. **Add the page.** Save `harmonique-page.html` as `/side-quests/harmonique/index.html`. Don't edit it: it's a build output.
   - It opens with a how-to panel (designed & built by Diego; play with A–K keys, REC/STOP, IDEAS, etc.).
   - Its round × in the top-right returns to `/` (the grid).

## Keep as is
- Label: `Side quest · Builds`. Tooltip (`data-tip`): `Harmonique|A chord instrument I designed and built. Open it and play`.
- `data-cat="side"` so it shows under the **Side Quests** filter.
- The tile's inner line reads "A CHORD INSTRUMENT · DESIGNED & BUILT BY DIEGO".

## Check before publishing
- Home: the tile sits where Current reads was, same size, with the hover expand icon; the line sweeps (static with reduced motion).
- Side Quests filter shows it.
- Click → `/side-quests/harmonique/` loads; keys A S D F G H J K play chords; × returns to the grid.
- Works in light theme too (the tile is always dark, by design: it's a screen).
