#!/bin/bash
# Double-click to start Harmonic with MIDI. Close this window to stop it.
cd "$(dirname "$0")"
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js isn't installed, so opening Harmonic.html directly in Chrome instead."
  open -a "Google Chrome" "Harmonic.html"
  exit 0
fi
(sleep 1; open -a "Google Chrome" "http://localhost:5173") &
node scripts/serve.mjs
