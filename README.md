# LinuxPath — Autoformation Linux & cybersécurité

LinuxPath est une plateforme statique d’autoformation en français pour apprendre Linux, la ligne de commande et les bases de la cybersécurité. Elle combine un parcours progressif, des exercices, des quiz, un terminal simulé, une sandbox Linux exécutée en WebAssembly et des challenges CTF.

## Fonctionnalités

- 19 modules publiés répartis en quatre parcours : Fondamentaux Linux (M1–M8), Réseau & services (M9–M11), Sécurité, Pentest & DFIR (CS1 + M12–M14) et Lab & Tinker (HW1–HW4 — matériel).
- 99 leçons, 49 exercices, 97 questions de quiz et un quiz par module.
- 10 challenges CTF avec système de hints et validation par hash.
- Progression persistante dans localStorage.
- PWA et fonctionnement hors ligne via le service worker.
- Actualités cyber collectées automatiquement deux fois par jour.

## Structure

- `index.html` : structure de l’application, SEO, navigation et sections.
- `assets/` : styles, logique JavaScript, terminal, icônes et correctifs runtime.
- `data/` : leçons, exercices, quiz, VFS, CTF, glossaire, cheatsheet et actualités.
- `v86/` : émulateur WebAssembly, BIOS et image Linux de démonstration.
- `.github/workflows/` : qualification complète (unitaires, Python, navigateurs, build) et déploiement GitHub Pages.

## Lancer localement

Depuis la racine du dépôt, lancer un serveur HTTP :

    python3 -m http.server 8080

Puis ouvrir `http://localhost:8080`.

La sandbox WebAssembly et le service worker nécessitent un serveur HTTP ; ouvrir `index.html` directement depuis un gestionnaire de fichiers ne suffit pas.

## Déploiement GitHub Pages

Le workflow `.github/workflows/deploy-pages.yml` déploie automatiquement la branche `main` avec GitHub Actions. Dans GitHub, sélectionner Settings → Pages → Source : GitHub Actions si Pages n’est pas encore activé.

URL cible : `https://dodz2.github.io/linuxpath/`.

## Développement

- Modifier les fichiers JavaScript sources (non minifiés) dans `assets/`.
- `npm run build` valide les bundles suivis puis génère `dist/` sans modifier les sources ; utilisez `npm run generate:assets` explicitement après qualification d’une source JavaScript.
- Après `npm ci`, lancez une fois `npm run install:browsers` pour les tests e2e ; le CI effectue cette installation avant `npm run verify`.
- `npm run verify` reproduit la batterie complète du CI : validation, tests unitaires et e2e.
- Ne modifiez jamais `assets/*.min.js` manuellement. `npm run generate:assets` est l’unique générateur qualifié ; `npm run build` refuse les bundles périmés.

## Contribuer et sécurité

- [Contribuer](CONTRIBUTING.md) : environnement, TDD, bundles et qualification des pull requests.
- [Politique de sécurité](SECURITY.md) : versions prises en charge et canal de signalement privé.

## Limites de la sandbox

La sandbox Linux utilise l’émulateur v86 dans le navigateur et reste indépendante du terminal simulé utilisé dans les exercices. Les deux environnements sont isolés côté navigateur et ne donnent pas accès au système de fichiers de la machine de l’utilisateur.

## Licence

- **Code** : `LICENSE` — MIT.
- **Contenu pédagogique** : `CONTENT_LICENSE` — CC BY-SA 4.0.
- **Composants tiers** : `THIRD_PARTY_NOTICES.md` — provenance, versions et hash des binaires embarqués (`v86/`, données, polices).
- **Sandbox v86** : voir `v86/README.md` pour la provenance complète et la procédure de reconstruction.
