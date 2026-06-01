#!/bin/bash
# Script de minification JS avec terser
# Usage: bash minify.sh (ou via pre-commit hook)

set -e

ASSETS_DIR="$(dirname "$0")/assets"

echo "🔍 Minification des fichiers JS..."

# Liste des fichiers sources (ajouter au besoin)
SOURCES=(
  "utils.js"
  "storage.js"
  "terminal-core.js"
  "terminal-main.js"
  "ctf.js"
  "render.js"
  "app.js"
)

for src in "${SOURCES[@]}"; do
  src_path="$ASSETS_DIR/$src"
  min_path="$ASSETS_DIR/${src%.js}.min.js"
  
  if [ -f "$src_path" ]; then
    echo "  ⚙️  $src → ${src%.js}.min.js"
    npx terser "$src_path" -o "$min_path" --compress --mangle 2>/dev/null
    if [ $? -eq 0 ]; then
      echo "  ✅ $(basename $min_path) mis à jour"
    else
      echo "  ❌ Erreur lors de la minification de $src"
      exit 1
    fi
  else
    echo "  ⚠️  $src non trouvé, ignoré"
  fi
done

echo "✅ Minification terminée"
