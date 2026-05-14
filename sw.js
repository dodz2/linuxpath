/* ============================================================
   Service Worker — linuxpath
   Stratégie :
     - v86/* et data/* : cache-first (fichiers statiques immuables)
     - index.html      : network-first, fallback cache
     - assets/*        : cache-first (CSS/JS applicatif)
   ============================================================ */

const CACHE_NAME = 'linuxpath-v4';

// Ressources pré-cachées à l'installation
const PRECACHE_URLS = [
  './',
  './index.html',
  './assets/style.css',
  './assets/app.js',
  './data/lessons.json',
  './data/exercises.json',
  './data/quizzes.json',
  './data/ctf.json',
  './data/news.json',
  './v86/libv86.js',
  './v86/linux.iso',
  './v86/seabios.bin',
  './v86/v86.wasm',
  './v86/vgabios.bin'
];

/* ---- Installation : pré-cache de toutes les ressources ---- */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  // Prend le contrôle immédiatement sans attendre l'onglet suivant
  self.skipWaiting();
});

/* ---- Activation : nettoyage des anciens caches ------------- */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) =>
      Promise.all(
        keyList
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  // Contrôle immédiat des clients déjà ouverts
  self.clients.claim();
});

/* ---- Interception des requêtes ----------------------------- */
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const pathname = url.pathname;

  // Ignorer les requêtes non-GET et les origines externes (Google Fonts, etc.)
  if (event.request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  // v86/*, data/* et assets/* → cache-first
  if (
    pathname.includes('/v86/') ||
    pathname.includes('/data/') ||
    pathname.includes('/assets/')
  ) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // index.html (et racine "/") → network-first, fallback cache
  if (pathname.endsWith('/') || pathname.endsWith('index.html')) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // Tout le reste → cache-first par défaut
  event.respondWith(cacheFirst(event.request));
});

/* ---- Stratégie cache-first --------------------------------- */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    // Mettre en cache la réponse fraîche
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (_) {
    // Hors-ligne et non en cache : réponse vide
    return new Response('Ressource non disponible hors-ligne.', { status: 503 });
  }
}

/* ---- Stratégie network-first (pour index.html) ------------- */
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      // Mettre à jour le cache avec la version réseau la plus récente
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (_) {
    // Hors-ligne : servir depuis le cache
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response('Site non disponible hors-ligne.', { status: 503 });
  }
}
