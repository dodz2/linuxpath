# Contribuer à LinuxPath

Merci de contribuer sous le pseudo GitHub de votre choix. N’ajoutez pas de secret, de donnée personnelle ni de contenu dont vous ne détenez pas les droits.

## Environnement qualifié

- Node.js conforme à `.node-version` et au champ `engines` de `package.json` ;
- npm **11.19.0** ;
- Python **3.13.5** et `uv`/`uvx` **0.11.6** pour les tests du collecteur d’actualités ;
- Chromium Playwright installé avec `npm run install:browsers`.

Installez les dépendances avec :

```bash
npm ci
```

## Méthode de travail

1. Créez une branche dédiée.
2. Écrivez d’abord un test qui échoue pour la raison attendue.
3. Appliquez le correctif minimal, puis rejouez le test ciblé.
4. Lancez la qualification complète avant toute pull request :

```bash
npm run verify
```

Les sources JavaScript lisibles résident dans `assets/*.js`. Ne modifiez jamais directement les bundles `assets/*.min.js`. Après qualification des sources concernées :

```bash
npm run generate:assets
npm run check:generated-assets
```

Un build ne doit pas réparer silencieusement un bundle périmé.

## Contenu pédagogique

Chaque affirmation technique doit être testable et chaque leçon publiée doit citer une source officielle structurée. Les exemples de cybersécurité doivent rester cantonnés à un laboratoire autorisé et ne doivent contenir ni identifiant réel, ni clé, ni charge offensive prête à l’emploi.

## Pull requests

Décrivez le problème, les preuves RED puis GREEN, les tests exécutés et les limites restantes. Gardez les changements ciblés et attendez la CI et la revue avant fusion.

Pour une vulnérabilité, n’ouvrez pas de pull request publique : suivez `SECURITY.md`.
