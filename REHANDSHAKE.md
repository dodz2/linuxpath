# REHANDSHAKE.md — Contexte pour un nouvel agent de coding

## Référence principale : le repo GitHub

**Le repo GitHub est la source de vérité, PAS les fichiers locaux.**
Toutes les modifications doivent partir du repo (`origin/main`), être validées par les tests CI, et poussées. Les fichiers locaux peuvent être en retard ou en avance par rapport au repo — toujours vérifier via l'API GitHub.

- **Repo** : `https://github.com/dodz2/linuxpath`
- **Token GitHub** : fourni par l'utilisateur (ne PAS stocker dans des fichiers ou mémoire persistante)
- **URL du site déployé** : `https://dodz2.github.io/linuxpath/`
- **Branche principale** : `main`

## Workflow Git

```bash
# Pour commencer : pull la version la plus récente
git pull origin main --rebase

# Après modification : tester, puis push
git add <fichiers>
git commit -m "message descriptif"
git push origin main
```

**⚠️ TOUJOURS `git pull --rebase` avant de pousser.** Le repo avance fréquemment (CI news auto). Oublier de pull = push rejeté ou merge conflict.

## CI / GitHub Actions

4 checks tournent sur chaque push sur `main` :

1. **build** — Compilation/build du site statique
2. **deploy** — Déploiement GitHub Pages
3. **report-build-status** — Rapport de build
4. **verify-minification** — Vérifie que les fichiers `assets/*.min.js` correspondent bien aux `assets/*.js` sources

**⚠️ Le check `verify-minification` est critique.** Il échoue si les `.min.js` ne sont pas à jour. Après toute modification d'un `.js` dans `assets/`, il faut :

```bash
npx terser assets/<fichier>.js -o assets/<fichier>.min.js --compress --mangle
```

Puis commit le `.min.js` modifié **en même temps** que le `.js` source.

**⚠️ Utiliser `npx terser` PAS `terser`.** Le paquet `node-terser` (installé via apt dans le CI) ne met pas le binaire dans le PATH. `npx` est la méthode fiable.

## Structure du projet

Site web statique vanilla (HTML + CSS + JS, aucun framework).

```
linuxpath/
├── index.html                  ← SPA complète (sidebar, modules, terminal, CTF, news, etc.)
├── assets/
│   ├── ctf.js / ctf.min.js     ← Engine Terminal CTF
│   ├── terminal-core.js        ← Factory createTerminalEngine() — moteur VFS partagé
│   ├── terminal-main.js        ← Instance du terminal principal (charge VFS depuis data/vfs.json)
│   ├── storage.js              ← Persistence IndexedDB/localStorage
│   ├── render.js               ← Rendu leçons, exercices, quiz, news, glossaire, cheatsheet
│   ├── app.js                  ← Orchestrateur principal (navigation, init, sandbox v86)
│   ├── utils.js                ← Utilitaires (escapeHtml)
│   ├── base.css, components.css, responsive.css, terminal.css
│   └── *.min.js                ← Versions minifiées (générées par terser via CI)
├── data/
│   ├── lessons.json            ← ~58 leçons (14 modules)
│   ├── exercises.json          ← ~26 exercices
│   ├── quizzes.json            ← 18 quiz (5 QCM chacun)
│   ├── ctf.json                ← 10 challenges CTF avec VFS intégré
│   ├── vfs.json                ← VFS pour le terminal principal (chargé via fetch)
│   ├── cheatsheet.json         ← 118 commandes en 10 catégories
│   ├── glossary.json           ← 74 termes en 7 catégories
│   └── news.json               ← Actualités cyber (auto-générées, max 30 articles)
├── v86/                        ← Sandbox WebAssembly Alpine Linux (wasm, iso, bios)
├── .github/workflows/
│   ├── update-news.yml         ← Cron 2x/jour, parse RSS, génère data/news.json
│   └── verify-minification.yml ← Vérifie .min.js à jour sur chaque push
├── minify.sh                   ← Script de minification locale (utilise npx terser)
├── sw.js                       ← Service Worker (offline-first)
└── manifest.json               ← PWA
```

## Architecture JavaScript (ordre de chargement)

Les scripts sont chargés via `<script defer>` dans cet ordre exact :

1. `utils.js` → `storage.js` → `terminal-core.js` → `terminal-main.js` → `ctf.js` → `render.js` → `app.js`

**Chaque fichier déclare des globales** — les suivants s'appuient dessus. Ne PAS réordonner.

### Terminal (pattern Factory)

- `terminal-core.js` déclare `createTerminalEngine(config)` qui retourne un objet `{ exec, print, getVfs, setVfs, getCurrentDir, setCurrentDir, initInput, ... }`
- `terminal-main.js` crée l'instance principale avec le VFS depuis `data/vfs.json`
- `ctf.js` crée l'instance CTF avec le VFS par challenge depuis `data/ctf.json`
- **`initInput()`** attache les listeners clavier (Enter, Tab, flèches, Ctrl+L). Elle clone l'élément DOM à chaque appel → ne l'appeler **qu'une seule fois** par instance.

### State

Géré dans `storage.js` via IndexedDB (fallback localStorage) :
- `state.lessonsDone` — Set des IDs de leçons terminées
- `state.exercisesDone` — Set des IDs d'exercices résolus
- `state.quizScores` — `{ m1: 4, m2: 3, ... }`
- `state.unlockedModules` — Set des modules débloqués (déblocage par quiz ≥ 3/5)

## Ce qui a été corrigé (Session du 2026-06-01)

### Bug terminal CTF — terminal inutilisable

**Symptôme** : Dans l'onglet CTF, quand on ouvre un challenge, le terminal ne répondait pas — impossible d'écrire ou envoyer des commandes.

**Cause racine** : La fonction `loadCTFChallenge(id)` était appelée dans `openCTFChallenge()` (ligne 123 de `ctf.js`) mais **n'était définie nulle part**. La `ReferenceError` interrompait l'exécution avant l'initialisation du terminal. Conséquences :
- Le VFS du challenge n'était jamais chargé
- `ctfTerminal.initInput()` n'était jamais appelé (pas de listener clavier)
- L'utilisateur ne pouvait rien taper ni envoyer

**Corrections** (commits `0d21f44` → `108e03e`) :

1. **`assets/ctf.js`** — Ajout de `loadCTFChallenge(id)` (26 lignes) entre `closeCTFDetail()` et la déclaration de `ctfTerminal` :
   - Charge le VFS du challenge : `ctfTerminal.setVfs(ch.vfs || {})`
   - Reset le répertoire : `ctfTerminal.setCurrentDir('/')`
   - Vide et réinitialise le terminal avec message de bienvenue
   - Guard `ctfTermInited` pour n'appeler `initInput()` qu'une seule fois

2. **`assets/ctf.min.js`** — Régénération du minifié correspondant

3. **`minify.sh`** — Remplacement de `terser` par `npx terser` (le paquet apt `node-terser` Ubuntu Noble ne crée pas de binaire dans le PATH, causant exit code 127 dans le CI)

4. **`.github/workflows/verify-minification.yml`** — Restauration de la step "Run minification"

5. **`assets/*.min.js` (5 fichiers)** — Régénération complète avec `npx terser` pour correspondre à la version utilisée dans le CI

**Statut** : ✅ Les 4 checks CI passent (build, deploy, report-build-status, verify-minification).

## Ce qu'il reste à faire

Rien d'immédiat. La correction du terminal CTF est complète et déployée. Le site est fonctionnel avec tous les checks CI au vert.

Les fichiers locaux peuvent différer du repo (le repo est plus à jour sur certains fichiers comme `terminal-main.js` et `app.js` qui utilisent `initMainTerminal(vfsData)` avec chargement VFS async depuis `data/vfs.json`). Toujours pull depuis le repo avant de travailler.
