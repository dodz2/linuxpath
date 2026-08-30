#!/usr/bin/env bash
# build-sandbox-image.sh — (Re)construit / vérifie l'image de démonstration
# Linux embarquée dans v86/.
#
# Usage :
#   ./scripts/build-sandbox-image.sh          # vérifie l'intégrité de l'image actuelle
#   ./scripts/build-sandbox-image.sh --fetch  # télécharge l'image de référence v86
#
# La procédure est volontairement EXIGEANTE : tout écart de hash fait échouer
# le script (exit non nul). Ne jamais forcer le passage d'un hash inattendu
# sans mettre à jour THIRD_PARTY_NOTICES.md.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="$ROOT/v86/linux.iso"
# Hash de l'image actuellement embarquée (phase 15) — cf. THIRD_PARTY_NOTICES.md
EXPECTED_SHA256="ff21a908573cdf2cf0cd00fe30eab8646b2f64874afbb34ff6de5a915eaebcdf"
SOURCE_URL="https://github.com/copy/v86/raw/master/images/linux.iso"

compute_sha256() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

if [[ "${1:-}" == "--fetch" ]]; then
  echo "Téléchargement de l'image de référence v86…"
  curl -fL --retry 3 -o "$TARGET.tmp" "$SOURCE_URL"
  mv "$TARGET.tmp" "$TARGET"
fi

if [[ ! -f "$TARGET" ]]; then
  echo "ERREUR : $TARGET introuvable. Lancez ./scripts/build-sandbox-image.sh --fetch" >&2
  exit 1
fi

ACTUAL="$(compute_sha256 "$TARGET")"
echo "Image : $TARGET"
echo "Attendu  : $EXPECTED_SHA256"
echo "Effectif : $ACTUAL"

if [[ "$ACTUAL" != "$EXPECTED_SHA256" ]]; then
  echo "ERREUR : hash non conforme. Mettre à jour THIRD_PARTY_NOTICES.md uniquement si le remplacement est volontaire et documenté." >&2
  exit 1
fi

echo "OK : l'image correspond à la référence documentée."
exit 0