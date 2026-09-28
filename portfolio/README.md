# Harmonique on theavidobserver.com

Two pieces, matching how the site already works (grid tile → full-screen page with a round ×):

1. **The page:** upload `dist/portfolio/side-quests/harmonique/index.html` to the site as
   `/side-quests/harmonique/index.html`. One self-contained file. Its round × (top right) goes back to `/`.
2. **The tile:** paste the three parts of `portfolio/tile-snippet.html` into the home page
   (button into `.grid`, styles into the stylesheet, script after the grid). It uses the site's own
   `.tile`, `.visual`, `.act` and `data-cat="side"` so it filters under Side Quests.

Rebuild the page after changes with `npm run build`.
