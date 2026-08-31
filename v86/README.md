# v86 — Provenance et reconstruction de la sandbox

## Contenu du répertoire

| Fichier | Rôle | Provenance |
|---|---|---|
| `libv86.js` | Emulateur v86 (build release) | https://github.com/copy/v86 |
| `v86.wasm` | Module WebAssembly v86 | https://github.com/copy/v86 |
| `seabios.bin` | BIOS SeaBIOS (build v86) | https://www.seabios.org |
| `vgabios.bin` | VGABIOS Bochs (build v86) | https://github.com/bochs-emu/Bochs |
| `linux.iso` | Image de démonstration Linux (isolinux, noyau + initramfs) | https://github.com/copy/v86/tree/master/images |

## Vérification d'intégrité

```bash
sha256sum -c checksums.sha256
```

Checksums (voir aussi `THIRD_PARTY_NOTICES.md`) :

```text
95e690ad38821073d2304a1d9da7c6580270688d7ad80fbe48f94eda85186047  libv86.js
effc27d2da888631201bc1c9307361134f71af945f678c25a037f9959a4d1b88  v86.wasm
73e3f359102e3a9982c35fce98eb7cd08f18303ac7f1ba6ebfbe6cdc1c244d98  seabios.bin
a4bc0d80cc3ca028c73dafa8fee396b8d054ce87ebd8abfbd31b06b437607880  vgabios.bin
ff21a908573cdf2cf0cd00fe30eab8646b2f64874afbb34ff6de5a915eaebcdf  linux.iso
```

## Reconstruction / remplacement

1. **libv86.js + v86.wasm** : télécharger la release officielle depuis
   https://github.com/copy/v86/releases (bundle `release/`) et vérifier les
   hash ci-dessus avant remplacement. Si les hash diffèrent volontairement,
   mettre à jour `THIRD_PARTY_NOTICES.md`.
2. **seabios.bin / vgabios.bin** : builds officiels v86 (dossier `bios/` du
   dépôt v86). Les hash ne changent que si l'on change de version de v86.
3. **linux.iso** : image de démonstration **non maintenue** (2013). Pour la
   remplacer par une image maintenue compatible v86 (noyau récent + initramfs,
   boot isolinux), utiliser `scripts/build-sandbox-image.sh` puis vérifier le
   boot dans Chromium (`uname -a` doit répondre).

## Affichage honnête

L'interface affiche « Linux réel (image de démonstration v86) » — jamais
« Alpine Linux » — tant que l'image n'est pas remplacée par une distribution
maintenue.
