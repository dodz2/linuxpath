#!/bin/bash
# Minify source assets with the lockfile Terser (npm ci first).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
TERSER="$ROOT/node_modules/.bin/terser"
ASSETS_DIR="$ROOT/assets"

if [ ! -x "$TERSER" ]; then
  echo "❌ Terser local introuvable. Lancez npm ci." >&2
  exit 1
fi

echo "🔍 Minification des fichiers JS avec $TERSER"

SOURCES=(
  "utils.js"
  "storage.js"
  "terminal-core.js"
  "terminal-main.js"
  "ctf.js"
  "exercise-validators.js"
  "render.js"
  "app.js"
)

for src in "${SOURCES[@]}"; do
  src_path="$ASSETS_DIR/$src"
  min_path="$ASSETS_DIR/${src%.js}.min.js"
  if [ -f "$src_path" ]; then
    echo "  ⚙️  $src → ${src%.js}.min.js"
    "$TERSER" "$src_path" --compress --mangle --output "$min_path"
  else
    echo "  ⚠️  $src non trouvé, ignoré"
  fi
done

echo "✅ Minification terminée"
