/* ============================================================
   DATA — chargées via fetch() depuis data/*.json
   ============================================================ */
let LESSONS   = {};
let EXERCISES = {};
let QUIZZES   = {};


/* ============================================================
   MODULE META
   ============================================================ */
const MODULE_META = {
  m1: { title: 'Les bases de Linux', desc: 'Histoire, distributions, terminal et commandes fondamentales.' },
  m2: { title: 'Fichiers & permissions', desc: 'Permissions Unix, chmod, chown, redirections et wildcards.' },
  m3: { title: 'Utilisateurs & processus', desc: 'sudo, gestion des utilisateurs, ps, kill, jobs.' },
  m4: { title: 'Réseau de base', desc: 'Interfaces réseau, ping, curl, ports ouverts et DNS.' },
  m5: { title: 'Scripting Bash', desc: 'Variables, conditions, boucles, fonctions et scripts.' },
  m6: { title: 'Administration intermédiaire', desc: 'apt, systemctl, cron jobs, logs et SSH.' },
  m7: { title: 'Sécurité &amp; OSINT', desc: 'nmap, netcat, grep forensique, SUID/SGID et reconnaissance.' },
  m8: { title: 'Git &amp; Docker', desc: 'Gestion de versions avec Git et conteneurisation avec Docker.' },
  m9: { title: 'SSH &amp; accès distant', desc: 'Clés SSH, tunnels, SCP/SFTP/rsync et VPN WireGuard.' },
  m10: { title: 'Serveurs web &amp; DNS', desc: 'Nginx, DNS avec dig/nslookup et HTTPS Let\'s Encrypt.' },
  m11: { title: 'Sécurité réseau', desc: 'Pare-feu nftables et monitoring réseau (tcpdump, ss).' },
  m12: { title: 'Audit & Durcissement', desc: 'Lynis, OpenSCAP, auditd et renforcement système.' },
  m13: { title: 'Pentest & Outils', desc: 'Metasploit, Burp Suite, Nmap avancé et outils hacker.' },
  m14: { title: 'Forensic & Malwares', desc: 'Analyse de malwares, investigation numérique et réponse à incident.' },
  sandbox: { title: 'Sandbox Linux', desc: 'Terminal Alpine Linux réel via WebAssembly.' }
};

/* ============================================================
   STATE & STORAGE
   ============================================================ */


let state = {
  lessonsDone:     new Set(),
  exercisesDone:   new Set(),
  quizScores:      {}, // { m1: 4, m2: 3, ... }
  unlockedModules: new Set(['m1', 'sandbox', 'm9', 'm12'])
};

/* ============================================================
   STORAGE — IndexedDB avec fallback localStorage
   ============================================================ */

// Clés de stockage (identiques à l'ancienne implémentation localStorage)
const STORAGE_KEYS = {
  lessonsDone:     'lt_lessonsDone',
  exercisesDone:   'lt_exercisesDone',
  quizScores:      'lt_quizScores',
  unlockedModules: 'lt_unlockedModules'
};

// --- Abstraction storage : get(key) et set(key, value) retournent des Promises ---

let _db = null; // handle IndexedDB, null si indisponible

/**
 * Ouvre (ou crée) la base IndexedDB "linuxpath-db".
 * Résout avec l'objet IDBDatabase, ou null si IndexedDB est indisponible.
 */
function _openDB() {
  return new Promise((resolve) => {
    if (!window.indexedDB) { resolve(null); return; }
    const req = indexedDB.open('linuxpath-db', 1);
    req.onupgradeneeded = (e) => {
      // Crée le store si nécessaire (première ouverture)
      const db = e.target.result;
      if (!db.objectStoreNames.contains('kv')) {
        db.createObjectStore('kv');
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror   = ()  => resolve(null); // fallback si erreur ouverture
  });
}

/**
 * Lit une valeur depuis IndexedDB.
 * Retourne une Promise<string|null>.
 */
function _idbGet(key) {
  return new Promise((resolve) => {
    if (!_db) { resolve(null); return; }
    const tx  = _db.transaction('kv', 'readonly');
    const req = tx.objectStore('kv').get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror   = () => resolve(null);
  });
}

/**
 * Écrit une valeur dans IndexedDB.
 * Retourne une Promise<void>.
 */
function _idbSet(key, value) {
  return new Promise((resolve) => {
    if (!_db) { resolve(); return; }
    const tx  = _db.transaction('kv', 'readwrite');
    const req = tx.objectStore('kv').put(value, key);
    req.onsuccess = () => resolve();
    req.onerror   = () => resolve();
  });
}

// --- Fallback localStorage (si IndexedDB indisponible) ---
const _lsStore  = {}; // fallback mémoire si localStorage aussi indisponible
const _lsRaw    = (() => { try { return window.localStorage; } catch(_) { return null; } })();

function _lsFallbackGet(key) {
  try { return _lsRaw ? _lsRaw.getItem(key) : (_lsStore[key] ?? null); }
  catch(_) { return _lsStore[key] ?? null; }
}
function _lsFallbackSet(key, value) {
  try { if (_lsRaw) _lsRaw.setItem(key, value); else _lsStore[key] = value; }
  catch(_) { _lsStore[key] = value; }
}

// --- API publique : storage.get / storage.set ---
const storage = {
  /** Retourne une Promise<string|null> */
  get(key) {
    if (_db) return _idbGet(key);
    return Promise.resolve(_lsFallbackGet(key));
  },
  /** Retourne une Promise<void> */
  set(key, value) {
    if (_db) return _idbSet(key, value);
    _lsFallbackSet(key, value);
    return Promise.resolve();
  }
};

// --- Migration automatique depuis localStorage vers IndexedDB ---
/**
 * Si des données existent dans localStorage mais pas encore dans IndexedDB,
 * les migre automatiquement. Ne supprime PAS les données localStorage
 * (permettant un retour arrière propre).
 */
async function _migrateFromLocalStorage() {
  for (const key of Object.values(STORAGE_KEYS)) {
    const existing = await _idbGet(key);
    if (existing !== null) continue; // déjà migré
    // Tenter de lire depuis localStorage
    const lsVal = _lsFallbackGet(key);
    if (lsVal !== null) {
      await _idbSet(key, lsVal); // migration sans suppression
    }
  }
}

// --- Initialisation du storage (appelée avant tout le reste dans init()) ---
async function initStorage() {
  _db = await _openDB();
  if (_db) {
    // IndexedDB disponible : migrer les données localStorage existantes
    await _migrateFromLocalStorage();
  }
  // Si _db est null, on utilisera le fallback localStorage/mémoire automatiquement
}

// --- Fonctions de persistance de l'état ---

async function saveState() {
  await Promise.all([
    storage.set(STORAGE_KEYS.lessonsDone,     JSON.stringify([...state.lessonsDone])),
    storage.set(STORAGE_KEYS.exercisesDone,   JSON.stringify([...state.exercisesDone])),
    storage.set(STORAGE_KEYS.quizScores,      JSON.stringify(state.quizScores)),
    storage.set(STORAGE_KEYS.unlockedModules, JSON.stringify([...state.unlockedModules]))
  ]);
}

async function loadState() {
  try {
    const [ld, ed, qs, um] = await Promise.all([
      storage.get(STORAGE_KEYS.lessonsDone),
      storage.get(STORAGE_KEYS.exercisesDone),
      storage.get(STORAGE_KEYS.quizScores),
      storage.get(STORAGE_KEYS.unlockedModules)
    ]);
    if (ld) state.lessonsDone     = new Set(JSON.parse(ld));
    if (ed) state.exercisesDone   = new Set(JSON.parse(ed));
    if (qs) state.quizScores      = JSON.parse(qs);
    if (um) state.unlockedModules = new Set(JSON.parse(um));
    state.unlockedModules.add('sandbox'); // toujours accessible
    state.unlockedModules.add('m9');      // premier module réseau, toujours accessible
    state.unlockedModules.add('m12');     // module Audit & Durcissement, toujours accessible
  } catch(e) { /* état par défaut conservé */ }
}

async function resetState() {
  state.lessonsDone     = new Set();
  state.exercisesDone   = new Set();
  state.quizScores      = {};
  state.unlockedModules = new Set(['m1', 'sandbox', 'm9']);
  await saveState();
  // Réinitialiser aussi la progression CTF
  ctfState.solved = new Set();
  ctfState.hints  = {};
  await saveCTFState();
}

async function confirmReset() {
  if (confirm('Voulez-vous vraiment réinitialiser toute votre progression ? Cette action est irréversible.')) {
    await resetState();
    location.reload();
  }
}



function getModuleProgress(mod) {
  const lessons = LESSONS[mod] || [];
  const exercises = EXERCISES[mod] || [];
  const lessonsDone = lessons.filter(l => state.lessonsDone.has(l.id)).length;
  const exercisesDone = exercises.filter(e => state.exercisesDone.has(e.id)).length;
  const quizDone = state.quizScores[mod] !== undefined ? 1 : 0;
  const total = lessons.length + exercises.length + 1;
  const done = lessonsDone + exercisesDone + quizDone;
  return { done, total, pct: Math.round(done / total * 100) };
}

