# LinuxPath — Autoformation Linux

Site d'autoformation Linux interactif avec sandbox WebAssembly réelle (Alpine Linux).

## Structure des fichiers

```
linuxpath/
├── index.html          ← Page principale (tout-en-un : HTML + CSS + JS)
├── v86/
│   ├── linux.iso       ← Image Alpine Linux (6.3 MB)
│   ├── v86.wasm        ← Émulateur WebAssembly (2 MB)
│   ├── seabios.bin     ← BIOS (128 KB)
│   └── vgabios.bin     ← VGA BIOS (36 KB)
└── README.md
```

## Déploiement

### GitHub Pages
1. Crée un repo sur GitHub
2. Upload tous les fichiers (index.html + dossier v86/)
3. Settings → Pages → Branch: main → Save
4. Ton site est disponible à `https://ton-username.github.io/nom-du-repo`

### Netlify (drag & drop)
1. Va sur [netlify.com](https://netlify.com)
2. Drag & drop le dossier `linuxpath/` dans la zone de dépôt
3. URL générée automatiquement en quelques secondes

### Serveur Apache/Nginx
Copie tous les fichiers dans ton répertoire web (`/var/www/html/linuxpath/`) et accède via `http://ton-serveur/linuxpath/`

### Serveur local rapide (Python)
```bash
cd linuxpath/
python3 -m http.server 8080
# Puis ouvre http://localhost:8080
```

> ⚠️ **Important** : La sandbox v86 nécessite un serveur HTTP (même local). Elle ne fonctionnera pas en ouvrant `index.html` directement depuis le gestionnaire de fichiers.

## Compatibilité

- Chrome / Chromium ✅
- Firefox ✅
- Safari ✅
- Mobile (Android/iOS) ✅
