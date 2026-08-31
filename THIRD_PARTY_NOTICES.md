# Third-Party Notices — LinuxPath

Ce fichier documente la provenance, la source et la licence de chaque
composant tiers embarqué dans le dépôt. Les hash SHA-256 correspondent aux
fichiers présents dans ce dépôt à la date de la phase 15.

## Vérification des hash

```bash
sha256sum v86/*
```

## v86 (émulateur x86 en WebAssembly)

| Fichier | SHA-256 | Source | Licence |
|---|---|---|---|
| `v86/libv86.js` | `95e690ad38821073d2304a1d9da7c6580270688d7ad80fbe48f94eda85186047` | https://github.com/copy/v86 | BSD 2-Clause |
| `v86/v86.wasm` | `effc27d2da888631201bc1c9307361134f71af945f678c25a037f9959a4d1b88` | https://github.com/copy/v86 | BSD 2-Clause |

v86 est © 2011-2023 Fabian Hemmer et contributeurs, distribué sous licence
BSD 2-Clause. Les fichiers ci-dessus sont les build officiels du projet v86
(sortie `release`), embarqués tels quels.

## SeaBIOS

| Fichier | SHA-256 | Source | Licence |
|---|---|---|---|
| `v86/seabios.bin` | `73e3f359102e3a9982c35fce98eb7cd08f18303ac7f1ba6ebfbe6cdc1c244d98` | https://www.seabios.org / build v86 | LGPL-3.0 |

SeaBIOS est distribué sous GNU Lesser General Public License v3.0
(https://www.gnu.org/licenses/lgpl-3.0.html). Le binaire est le build standard
utilisé par v86 (`bios.bin`).

## VGABIOS

| Fichier | SHA-256 | Source | Licence |
|---|---|---|---|
| `v86/vgabios.bin` | `a4bc0d80cc3ca028c73dafa8fee396b8d054ce87ebd8abfbd31b06b437607880` | Bochs VGABIOS (v86 build) | LGPL-2.0+ |

VGABIOS dérive du BIOS graphique Bochs, distribué sous licence LGPL
(https://www.gnu.org/licenses/lgpl-2.1.html).

## Image de démonstration Linux (cdrom de boot)

| Fichier | SHA-256 | Source | Licence |
|---|---|---|---|
| `v86/linux.iso` | `ff21a908573cdf2cf0cd00fe30eab8646b2f64874afbb34ff6de5a915eaebcdf` | https://github.com/copy/v86/tree/master/images | noyau GPL-2.0, outils GPL-2.0 |

`linux.iso` est l'image de démonstration historique du projet v86 : un CD de
boot isolinux (isolinux 5.10, construit le 29/11/2013 par MKIsofs) contenant un
noyau Linux et une mini-initramfs rootfs.

**Statut — honnêteté juridique :** cette image est une démonstration
**non maintenue** (2013). Elle ne correspond **pas** à une distribution Alpine
moderne : l'UI dit « Linux réel (image de démonstration v86) », jamais
« Alpine ». La procédure de remplacement contrôlé par une image maintenue est
documentée dans `v86/README.md` et `scripts/build-sandbox-image.sh`.

## Autres dépendances notables

| Composant | Source | Licence |
|---|---|---|
| Polices système (aucune police tierce embarquée) | — | — |
| Icônes SVG internes | maison | MIT (cf. LICENSE) |

## Contact

Pour signaler une erreur de provenance ou une licence manquante : ouvrir une
issue sur https://github.com/dodz2/linuxpath.
