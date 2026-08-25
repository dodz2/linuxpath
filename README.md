# LinuxPath — Autoformation Linux & cybersécurité

LinuxPath est une plateforme statique d’autoformation en français pour apprendre Linux, la ligne de commande et les bases de la cybersécurité. Elle combine un parcours progressif, des exercices, des quiz, un terminal simulé, une sandbox Alpine Linux exécutée en WebAssembly et des challenges CTF.

## Fonctionnalités

- 14 modules répartis en trois parcours : Linux (M1–M8), Réseau & Services (M9–M11) et Sécurité offensive (M12–M14).
- 59 leçons, 32 exercices et un quiz par module.
- 10 challenges CTF avec système de hints et validation par hash.
- Progression persistante dans IndexedDB, avec fallback localStorage.
- PWA et fonctionnement hors ligne via le service worker.
- Actualités cyber collectées automatiquement deux fois par jour.

## Structure

- `index.html` : structure de l’application, SEO, navigation et sections.
- `assets/` : styles, logique JavaScript, terminal, icônes et correctifs runtime.
- `data/` : leçons, exercices, quiz, VFS, CTF, glossaire, cheatsheet et actualités.
- `v86/` : émulateur WebAssembly, BIOS et image Alpine Linux.
- `.github/workflows/` : validation de minification et déploiement GitHub Pages.

## Lancer localement

Depuis la racine du dépôt, lancer un serveur HTTP :

    python3 -m http.server 8080

Puis ouvrir `http://localhost:8080`.

La sandbox WebAssembly et le service worker nécessitent un serveur HTTP ; ouvrir `index.html` directement depuis un gestionnaire de fichiers ne suffit pas.

## Déploiement GitHub Pages

Le workflow `.github/workflows/deploy-pages.yml` déploie automatiquement la branche `main` avec GitHub Actions. Dans GitHub, sélectionner Settings → Pages → Source : GitHub Actions si Pages n’est pas encore activé.

URL cible : `https://dodz2.github.io/linuxpath/`.

## Développement

- Modifier les fichiers JavaScript sources non minifiés.
- Exécuter `bash minify.sh` après toute modification d’un fichier JavaScript listé dans le script.
- Ne pas modifier manuellement les fichiers `.min.js`.
- Tester les fichiers JSON et lancer un serveur local avant chaque push.

## Limites de la sandbox

La sandbox Alpine utilise l’émulateur v86 dans le navigateur et reste indépendante du terminal simulé utilisé dans les exercices. Les deux environnements sont isolés côté navigateur et ne donnent pas accès au système de fichiers de la machine de l’utilisateur.

## Licence

Projet personnel open-source. Ajouter une licence explicite avant toute redistribution externe.
