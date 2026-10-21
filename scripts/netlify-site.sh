#!/bin/sh
# Copies only what the game needs into site/ for publishing.
set -e
rm -rf site
mkdir -p site
cp index.html style.css manifest.webmanifest icon.svg og.png site/
cp physics.js ai.js pens.js pen-stats.js render3d.js ads.js profile.js profile-ui.js viewer.js game.js site/
cp -r assets vendor site/
