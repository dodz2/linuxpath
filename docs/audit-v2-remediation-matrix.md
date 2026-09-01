# Matrice de remédiation de l’audit LinuxPath V2

Cette matrice trace les **18 constats confirmés** de l’audit V2 vers leur lot, leurs tests de non-régression cibles et leur critère de clôture. Elle ne constitue pas une déclaration de correction : une ligne n’est close qu’après observation d’un RED pertinent, passage au GREEN et exécution du gate du lot concerné.

## Référence reproductible

- Révision auditée : `60ece228bc02e9c87d9597c2eeeaf5fcff5f0bb0`.
- Baseline qualifiée avant correction : `npm ci`, puis `PLAYWRIGHT_BROWSERS_PATH=/opt/data/.pw-browsers npm run verify`.
- Résultat historique de la baseline : 13 phases sur 13 vertes. Ce résultat prouve seulement l’état du harnais existant ; il ne couvre pas encore les défauts listés ci-dessous.
- Les rapports JSON, traces, captures et vidéos de baseline sont des artefacts CI. Ils ne sont pas versionnés dans le dépôt.

## Traçabilité

| ID | Constat | Lot et tâches | Tests cibles | Critère de clôture |
|---|---|---|---|---|
| E-01 | Le terminal réel fausse l’évaluation des exercices. | B-01 à B-04 | `tests/e2e/exercises.spec.js`, `tests/unit/exercises.test.mjs`, `tests/unit/terminal.test.mjs`, `tests/unit/parity.test.mjs` | 164 réponses de base sur 164 et 24 variantes sur 24 acceptées ; 0 sonde adversariale sur 10 acceptée ; toute erreur a un code non nul. |
| E-02 | Le quiz M12 à sept questions casse notation et import. | C-01 et C-02 | `tests/unit/progression.test.mjs`, `tests/unit/storage.test.mjs`, `tests/e2e/progression.spec.js`, `tests/e2e/resume.spec.js` | Score M12 affiché sur 7, seuil explicite et round-trip valide pour chaque score de 0 à 7. |
| E-03 | Les protections GitHub ne rendent pas la CI obligatoire. | E-01 à E-03 | `tests/unit/deploy.test.mjs` et vérifications API GitHub de qualification | Ruleset actif, revue et check CI exigés, permissions minimales, PR bot dotée d’un check exécuté. |
| M-01 | Catalogue, parcours et durées se contredisent. | C-09 | `tests/unit/content.test.mjs`, `tests/unit/tracks.test.mjs`, `tests/e2e/module-meta.spec.js` | Les 19 modules et toutes les durées sont dérivés des données, y compris en mode sans JavaScript. |
| M-02 | Des fonctions importantes restent inaccessibles au clavier. | D-01 et D-02 | `tests/e2e/accessibility.spec.js`, `tests/e2e/layout.spec.js` | Contrôles natifs au clavier et absence des violations ciblées sur les 52 scans Axe. |
| M-03 | Le classificateur d’actualités neutralise plusieurs acronymes. | C-10 | `tests/python/test_fetch_news.py` | Tous les acronymes documentés sont reconnus après normalisation et les tests Python ainsi que Ruff sont verts. |
| M-04 | Le harnais de release possède plusieurs voies de faux positif. | A-02 à A-05 | `tests/unit/audit-cleanup.test.mjs`, `tests/unit/parity.test.mjs`, `tests/unit/deploy.test.mjs`, `tests/e2e/sandbox.spec.js` | Bundle divergent bloqué avant écriture, E2E source avant build, rapport infra conservé, boot réel exigé et manifeste live lié au SHA. |
| M-05 | Deux commandes OpenSSL sont mutilées par le rendu HTML. | C-05 | `tests/unit/content-safety.test.mjs`, `tests/e2e/module-meta.spec.js` | Le texte DOM et la copie correspondent octet pour octet aux commandes source, redirections incluses. |
| M-06 | Les mutations VFS créent des états impossibles. | B-06 | `tests/unit/vfs.test.mjs`, `tests/unit/terminal.test.mjs`, `tests/e2e/exercises.spec.js` | Aucun nœud orphelin après `touch`, `rm`, `cp` ou `mv` et graphe parent-enfant fermé. |
| M-07 | Le DOM des pipelines diverge du résultat calculé. | B-05 | `tests/unit/terminal.test.mjs`, `tests/e2e/exercises.spec.js`, `tests/e2e/ctf.spec.js` | DOM identique au stdout final, aucune ligne dupliquée et solution CTF-06 exécutable par les commandes annoncées. |
| M-08 | Le stockage peut annoncer une sauvegarde inexistante. | C-03 et C-04 | `tests/unit/storage.test.mjs`, `tests/e2e/import-security.spec.js` | Fallback mémoire relu en priorité, corruption isolée par clé et récupération visible sans perte silencieuse. |
| M-09 | La majorité des leçons n’expose aucune référence consultable. | C-08 | `tests/unit/content.test.mjs`, `tests/unit/content-safety.test.mjs`, `tests/e2e/module-meta.spec.js` | 99 leçons sur 99 exposent une source consultable ou une référence man précise ; aucune source opaque. |
| M-10 | Les stratégies du service worker confondent réseau et écriture cache. | D-05 | `tests/unit/pwa.test.mjs`, `tests/e2e/offline.spec.js` | Cas 200, 206, 404, 503, échec de `cache.put` et revalidation SWR couverts sans convertir une réponse réseau valide en panne. |
| M-11 | Plusieurs métadonnées et explications pédagogiques se contredisent. | C-06 et C-07 | `tests/unit/content.test.mjs`, `tests/unit/tracks.test.mjs` | Sémantique de `chmod`, merge Git et politique M9 cohérentes dans données, rendu et progression. |
| L-01 | Six CTF déclarent des enfants VFS inexistants. | B-07 | `tests/unit/ctf.test.mjs`, `tests/e2e/ctf.spec.js` | Zéro référence VFS pendante dans les dix challenges et toute entrée affichée est accessible. |
| L-02 | Étiquetage et feedback secondaires sont incomplets. | D-03 et D-04 | `tests/e2e/accessibility.spec.js`, `tests/e2e/ctf.spec.js`, `tests/unit/content-safety.test.mjs` | Labels, annonces ARIA, copie honnête et erreur de chargement CTF sont observables et testés. |
| L-03 | La défense en profondeur est incomplète. | D-07 et D-08 | `tests/unit/content-safety.test.mjs`, `tests/unit/deploy.test.mjs`, tests de sécurité versionnés | CSP compatible v86 active, données `dig` échappées et contrôles de sécurité présents dans le dépôt. |
| L-04 | Cache, outillage et documentation manquent de précision. | A-02, D-06 et D-09 | `tests/unit/audit-cleanup.test.mjs`, `tests/unit/pwa.test.mjs`, `tests/unit/deploy.test.mjs` | Bundles contrôlés, caches applicatif et v86 séparés, versions d’outils imposées et documentation alignée sur le pipeline réel. |

## Corpus adversarial

Le contrat des dix sondes reproduites pendant l’audit se trouve dans `tests/fixtures/audit-v2-adversarial-commands.json`. Les valeurs décrivent le verdict **attendu après remédiation**, pas un résultat prétendument déjà obtenu. Le fixture ne contient ni secret, ni donnée personnelle, ni sortie d’audit archivée.
