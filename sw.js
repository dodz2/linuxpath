/* ============================================================
   Service Worker — LinuxPath
   Version : linuxpath-v14

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

const SW_VERSION = 'linuxpath-v23';

/* ---- Ressources pré-cachées à l'installation -------------- */
// On ne pre-cache plus libv86/linux.iso (chargés en lazy ou à la demande)
const PRECACHE_URLS = [
  './',
  './index.html',
  './assets/style.css',
  './assets/app.js',
  './assets/favicon.svg',
  './manifest.json',
  './data/lessons.json',
  './data/exercises.json',
  './data/quizzes.json',
  './data/ctf.json',
  './data/news.json',
  './data/cheatsheet.json',
  './data/glossary.json'
];

/* ---- Patterns de routing ---------------------------------- */
const DATA_PATTERN   = /\/data\/.*\.json(\?.*)?$/;       // Network-first
const V86_PATTERN    = /\/v86\//;                         // Cache-first
const ASSET_PATTERN  = /\/(assets|manifest\.json|sitemap|robots|favicon)/; // SWR

/* ============================================================
   Installation — pré-cache des ressources essentielles
   ============================================================ */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SW_VERSION).then((cache) =>
      cache.addAll(PRECACHE_URLS).catch((err) => {
        // Ne pas bloquer l'install si un fichier optionnel manque
        console.warn('[SW] Pre-cache partiel:', err);
      })
    )
  );
  // Activation immédiate sans attendre la fermeture des onglets
  self.skipWaiting();
});

/* ============================================================
   Activation — nettoyage des anciens caches
   ============================================================ */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== SW_VERSION)
          .map((k) => {
            console.log('[SW] Suppression ancien cache:', k);
            return caches.delete(k);
          })
      )
    )
  );
  // Prise de contrôle immédiate des onglets déjà ouverts
  self.clients.claim();
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
async function networkFirst(request) {
  try {
    const response = await fetch(request.clone());
    if (response.ok) {
      const cache = await caches.open(SW_VERSION);
      cache.put(request, response.clone());
    }
    return response;
  } catch (_) {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(
      JSON.stringify({ error: 'Contenu non disponible hors-ligne.' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/* ============================================================
   Stratégie : Stale-While-Revalidate
   Sert immédiatement depuis le cache, met à jour en arrière-plan.
   L'utilisateur voit toujours une réponse rapide.
   Utilisé pour : HTML, CSS, JS, manifest
   ============================================================ */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(SW_VERSION);
  const cached = await cache.match(request);

  // Mise à jour en arrière-plan (sans bloquer la réponse)
  const fetchPromise = fetch(request.clone()).then((response) => {
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  }).catch(() => null);

  // Retourner le cache immédiatement si disponible, sinon attendre le réseau
  return cached || fetchPromise || new Response('Ressource non disponible.', { status: 503 });
}

/* ============================================================
   Stratégie : Cache-First
   Sert depuis le cache, télécharge uniquement si absent.
   Utilisé pour : fichiers v86 lourds (linux.iso, libv86.js, wasm…)
   ============================================================ */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request.clone());
    if (response.ok) {
      const cache = await caches.open(SW_VERSION);
      cache.put(request, response.clone());
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
