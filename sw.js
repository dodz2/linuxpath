/* ============================================================
   Service Worker — LinuxPath
   Version applicative : linuxpath-app-v67

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
const SW_VERSION = 'linuxpath-app-v67';
const APP_CACHE = SW_VERSION;
const V86_CACHE_PREFIX = 'linuxpath-v86-';
// SHA-256 du manifeste formé par les cinq checksums documentés dans v86/README.md.
const V86_MANIFEST_REVISION = 'bd0709747d908d7c485e22c8d0b7f2ec6c28c888bf8cda28998549d70c1243a9';
const V86_CACHE = `${V86_CACHE_PREFIX}${V86_MANIFEST_REVISION}`;
// Cache applicatif de la release immédiatement antérieure à la séparation.
// Cette migration est volontairement bornée à la révision qui partage ces octets.
const LEGACY_V86_MIGRATION_REVISION = 'bd0709747d908d7c485e22c8d0b7f2ec6c28c888bf8cda28998549d70c1243a9';
const LEGACY_V86_CACHES = ['linuxpath-v64'];
function legacyV86MigrationEnabled() {
  return V86_MANIFEST_REVISION === LEGACY_V86_MIGRATION_REVISION;
}

/* ---- Ressources pré-cachées à l'installation -------------- */
// On ne pre-cache plus libv86/linux.iso (chargés en lazy ou à la demande)
const PRECACHE_URLS = [
  './index.html',
  './assets/base.css',
  './assets/terminal.css',
  './assets/components.css',
  './assets/responsive.css',
  './assets/utils.min.js',
  './assets/storage.min.js',
  './assets/exercise-variants.min.js',
  './assets/terminal-core.min.js',
  './assets/pedagogical-commands.min.js',
  './assets/terminal-main.min.js',
  './assets/ctf.min.js',
  './assets/exercise-validators.min.js',
  './assets/render.min.js',
  './assets/app.min.js',
  './assets/sw-register.min.js',
  './assets/favicon.svg',
  './manifest.json',
  './data/lessons.json',
  './data/exercises.json',
  './data/exercise-variants.json',
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
   Activation — migration v64 puis nettoyage des anciens caches
   ============================================================ */
async function migrateLegacyV86Caches(keys) {
  const migrated = new Set();
  if (!legacyV86MigrationEnabled()) return migrated;
  const target = await caches.open(V86_CACHE);
  for (const name of LEGACY_V86_CACHES) {
    if (!keys.includes(name)) continue;
    try {
      const source = await caches.open(name);
      const requests = await source.keys();
      for (const request of requests) {
        const url = new URL(request.url);
        if (url.origin !== self.location.origin || !V86_PATTERN.test(url.pathname)) continue;
        const response = await source.match(request);
        if (response && response.ok) await target.put(request, response.clone());
      }
      migrated.add(name);
    } catch (error) {
      console.warn('Migration du cache v86 différée.', { cache: name, reason: error && error.name || 'cache-error' });
    }
  }
  return migrated;
}

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    const migratedLegacyCaches = await migrateLegacyV86Caches(keys);
    await Promise.all(
      keys
        .filter((k) => (
          k.startsWith(CACHE_PREFIX)
          && k !== APP_CACHE
          && k !== V86_CACHE
          && (
            !LEGACY_V86_CACHES.includes(k)
            || !legacyV86MigrationEnabled()
            || migratedLegacyCaches.has(k)
          )
        ))
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
  const shellRequest = pathname.endsWith('/') || pathname.endsWith('index.html');
  if (
    ASSET_PATTERN.test(pathname) ||
    pathname.endsWith('.html') ||
    shellRequest
  ) {
    event.respondWith(staleWhileRevalidate(shellRequest ? canonicalShellRequest(request) : request, event));
    return;
  }

  // 4. Tout le reste → stale-while-revalidate par défaut
  event.respondWith(staleWhileRevalidate(request, event));
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

function canonicalShellRequest(request) {
  return new Request(new URL('index.html', self.registration.scope), {
    method: 'GET',
    headers: request.headers,
    credentials: request.credentials,
    cache: request.cache,
    redirect: request.redirect,
  });
}

async function networkFirst(request) {
  const cache = await caches.open(SW_VERSION);
  try {
    const response = await fetch(request.clone());
    if (response.ok) {
      try {
        await cache.put(request, response.clone());
      } catch (_) {
        // La mise en cache reste best-effort : ne jamais dégrader une réponse réseau valide.
      }
    } else if (response.status >= 500) {
      const cached = await cache.match(request);
      if (cached) return cached;
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

async function staleWhileRevalidate(request, event) {
  const cache = await caches.open(SW_VERSION);
  const cached = await cache.match(request);
  const network = fetch(request.clone()).then(async (response) => {
    if (response.ok) {
      try {
        await cache.put(request, response.clone());
      } catch (_) {
        // La revalidation ne doit pas masquer une réponse réseau exploitable.
      }
    }
    return response;
  }).catch(() => null);
  if (cached) {
    event.waitUntil(network);
    return cached;
  }
  return (await network) || new Response('Ressource non disponible.', { status: 503 });
}

async function matchLegacyV86(request, targetCache) {
  if (!legacyV86MigrationEnabled()) return null;
  if (typeof caches.keys !== 'function') return null;
  const names = await caches.keys();
  for (const name of LEGACY_V86_CACHES) {
    if (!names.includes(name)) continue;
    const legacy = await caches.open(name);
    const response = await legacy.match(request);
    if (!response) continue;
    try {
      await targetCache.put(request, response.clone());
    } catch (_) {
      // Le cache historique reste conservé et continue de servir hors-ligne.
    }
    return response;
  }
  return null;
}

async function fetchRangeFromNetwork(request) {
  try {
    const response = await fetch(request.clone());
    if (response.status === 200) {
      return new Response('Réponse partielle non disponible.', { status: 502 });
    }
    return response;
  } catch (_) {
    return new Response('Ressource non disponible hors-ligne.', { status: 503 });
  }
}

async function cacheFirst(request) {
  // Une réponse complète en cache ne satisfait jamais une requête d'octets.
  // Le bypass doit précéder aussi bien le cache courant que la migration v64.
  if (request.headers.has('range')) return fetchRangeFromNetwork(request);
  const cache = await caches.open(V86_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const legacy = await matchLegacyV86(request, cache);
  if (legacy) return legacy;
  try {
    const response = await fetch(request.clone());
    if (response.ok && response.status !== 206) {
      try {
        await cache.put(request, response.clone());
      } catch (_) {
        // Le cache v86 est une optimisation : la réponse réseau reste prioritaire.
      }
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

