/* ============================================================
   Service Worker — LinuxPath
   Version : linuxpath-v60

   Stratégies par type de ressource :
   ┌─────────────────────────────┬──────────────────────────────┐
   │ Ressource                   │ Stratégie                    │
   ├─────────────────────────────┼──────────────────────────────┤
   │ data/*.json                 │ Network-first (contenu MAJ)  │
   │ index.html, assets/css, js  │ Stale-while-revalidate       │
   │ v86/*.wasm, *.iso, *.bin    │ Cache-first (fichiers lourds)│
   │ v86/libv86.js               │ Cache-first (chargé en lazy) │
   │ manifest.json, favicon      │ Stale-while-revalidate       │
   └─────────────────────────────┴──────────────────────────────┘

   Avantages :
   - Les données (news, lessons…) se rafraîchissent automatiquement
   - Plus besoin de bumper la version manuellement à chaque déploiement
   - Les gros fichiers v86 restent en cache (pas de re-téléchargement)
   - Mise à jour transparente : le SW s'active sans fermer l'onglet
   ============================================================ */

const CACHE_PREFIX = 'linuxpath-';
const SW_VERSION = 'linuxpath-v60';

/* ---- Ressources pré-cachées à l'installation -------------- */
// On ne pre-cache plus libv86/linux.iso (chargés en lazy ou à la demande)
const PRECACHE_URLS = [
  './',
  './index.html',
  './assets/base.css',
  './assets/terminal.css',
  './assets/components.css',
  './assets/responsive.css',
  './assets/utils.min.js',
  './assets/storage.min.js',
  './assets/terminal-core.min.js',
  './assets/terminal-main.min.js',
  './assets/ctf.min.js',
  './assets/exercise-validators.min.js',
  './assets/render.min.js',
  './assets/app.min.js',
  './assets/favicon.svg',
  './manifest.json',
  './data/lessons.json',
  './data/exercises.json',
  './data/quizzes.json',
  './data/modules.json',
  './data/ctf.json',
  './data/news.json',
  './data/cheatsheet.json',
  './data/glossary.json',
  './data/vfs.json'
];

/* ---- Patterns de routing ---------------------------------- */
const DATA_PATTERN   = /\/data\/.*\.json(\?.*)?$/;       // Network-first
const V86_PATTERN    = /\/v86\//;                         // Cache-first
const ASSET_PATTERN  = /\/(assets|manifest\.json|sitemap|robots|favicon)/; // SWR

/* ============================================================
   Installation — pré-cache des ressources essentielles
   ============================================================ */
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SW_VERSION);
    await Promise.all(PRECACHE_URLS.map((url) => cache.add(url)));
    await self.skipWaiting();
  })());
});

/* ============================================================
   Activation — nettoyage des anciens caches
   ============================================================ */
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => k.startsWith(CACHE_PREFIX) && k !== SW_VERSION)
        .map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

/* ============================================================
   Interception des requêtes — routing par stratégie
   ============================================================ */
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Ignorer les méthodes non-GET et les origines externes (CDN, fonts…)
  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  const pathname = url.pathname;

  // 1. Données JSON → network-first (toujours fraîches si réseau dispo)
  if (DATA_PATTERN.test(pathname)) {
    event.respondWith(networkFirst(request));
    return;
  }

  // 2. Fichiers v86 (lourds, stables) → cache-first
  if (V86_PATTERN.test(pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // 3. Assets applicatifs (CSS, JS, HTML, manifest…) → stale-while-revalidate
  if (
    ASSET_PATTERN.test(pathname) ||
    pathname.endsWith('.html') ||
    pathname.endsWith('/') ||
    pathname.endsWith('index.html')
  ) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // 4. Tout le reste → stale-while-revalidate par défaut
  event.respondWith(staleWhileRevalidate(request));
});

/* ============================================================
   Stratégie : Network-First
   Tente le réseau, fallback cache si hors-ligne.
   Utilisé pour : data/*.json (news, lessons, etc.)
   ============================================================ */
async function matchOwn(request) {
  const cache = await caches.open(SW_VERSION);
  return cache.match(request);
}

async function networkFirst(request) {
  const cache = await caches.open(SW_VERSION);
  try {
    const response = await fetch(request.clone());
    if (response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch (_) {
    const cached = await cache.match(request);
    if (cached) return cached;
    return new Response(
      JSON.stringify({ error: 'Contenu non disponible hors-ligne.' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(SW_VERSION);
  const cached = await cache.match(request);
  const network = fetch(request.clone()).then(async (response) => {
    if (response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  }).catch(() => null);
  if (cached) {
    network;
    return cached;
  }
  return (await network) || new Response('Ressource non disponible.', { status: 503 });
}

async function cacheFirst(request) {
  const cache = await caches.open(SW_VERSION);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request.clone());
    if (response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch (_) {
    return new Response('Ressource non disponible hors-ligne.', { status: 503 });
  }
}

/* ============================================================
   Message handler — permet de forcer un refresh depuis l'app
   Usage : navigator.serviceWorker.controller.postMessage({type:'SKIP_WAITING'})
   ============================================================ */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

