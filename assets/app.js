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
  sandbox: { title: 'Sandbox Linux', desc: 'Terminal Alpine Linux réel via WebAssembly.' }
};

/* ============================================================
   STATE & STORAGE
   ============================================================ */
const TOTAL_LESSONS   = 43; // m1=4,m2=5,m3=4,m4=5,m5=5,m6=5,m7=5,m8=10
const TOTAL_EXERCISES = 20; // m1=3,m2=2,m3=2,m4=2,m5=2,m6=2,m7=3,m8=4
const TOTAL_QUIZ      = 8;
const TOTAL_ITEMS     = 43 + 20 + 8; // 71

let state = {
  lessonsDone:     new Set(),
  exercisesDone:   new Set(),
  quizScores:      {}, // { m1: 4, m2: 3, ... }
  unlockedModules: new Set(['m1', 'sandbox'])
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
  } catch(e) { /* état par défaut conservé */ }
}

async function resetState() {
  state.lessonsDone     = new Set();
  state.exercisesDone   = new Set();
  state.quizScores      = {};
  state.unlockedModules = new Set(['m1', 'sandbox']);
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

function getProgress() {
  const done = state.lessonsDone.size + state.exercisesDone.size + Object.keys(state.quizScores).length;
  return { done, total: TOTAL_ITEMS, pct: Math.round(done / TOTAL_ITEMS * 100) };
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

function updateProgressUI() {
  // Badge du groupe "Modules Linux" dans la sidebar
  const modulesBadge = document.getElementById('group-modules-badge');
  if (modulesBadge) {
    const mods = ['m1','m2','m3','m4','m5','m6','m7','m8'];
    let totalDone = 0, totalItems = 0;
    mods.forEach(mod => {
      const counts = MODULE_COUNTS[mod];
      if (!counts) return;
      const modTotal = counts.lessons + counts.exercises + counts.quizzes;
      const modDone = [...state.lessonsDone].filter(id => id.startsWith(mod + '-')).length
        + [...state.exercisesDone].filter(id => id.startsWith(mod + '-')).length
        + Object.keys(state.quizScores).filter(id => id.startsWith(mod + '-')).length;
      totalDone += modDone;
      totalItems += modTotal;
    });
    const pct = totalItems > 0 ? Math.round(totalDone / totalItems * 100) : 0;
    modulesBadge.textContent = pct + '%';
  }
  // Badge du groupe "Réseau & Services" dans la sidebar
  const networkBadge = document.getElementById('group-network-badge');
  if (networkBadge) {
    const netMods = ['m9'];
    let netDone = 0, netTotal = 0;
    netMods.forEach(mod => {
      const counts = MODULE_COUNTS[mod];
      if (!counts) return;
      netTotal += counts.lessons + counts.exercises + counts.quizzes;
      netDone += [...state.lessonsDone].filter(id => id.startsWith(mod + '-')).length
        + [...state.exercisesDone].filter(id => id.startsWith(mod + '-')).length
        + Object.keys(state.quizScores).filter(id => id.startsWith(mod + '-')).length;
    });
    const netPct = netTotal > 0 ? Math.round(netDone / netTotal * 100) : 0;
    networkBadge.textContent = netPct + '%';
  }
  const p = getProgress();
  document.getElementById('sidebar-progress-fill').style.width = p.pct + '%';
  document.getElementById('sidebar-pct').textContent = p.pct + '%';
  document.getElementById('topbar-progress-fill').style.width = p.pct + '%';
  document.getElementById('topbar-progress-label').textContent = p.done + ' / ' + p.total + ' complétés';

  const modules = ['m1','m2','m3','m4','m5','m6','m7','m8','m9'];
  modules.forEach(mod => {
    const mp = getModuleProgress(mod);
    const badge = document.getElementById('nav-badge-' + mod);
    if (badge) {
      badge.textContent = mp.pct + '%';
      badge.classList.toggle('done', mp.pct === 100);
    }
    // Update lesson cards
    LESSONS[mod].forEach(l => {
      const card = document.getElementById('lesson-card-' + l.id);
      if (card) card.classList.toggle('completed', state.lessonsDone.has(l.id));
      const btn = document.getElementById('done-btn-' + l.id);
      if (btn) {
        btn.classList.toggle('done', state.lessonsDone.has(l.id));
        btn.textContent = state.lessonsDone.has(l.id) ? '✓ Leçon terminée' : '✓ Marquer comme terminée';
      }
    });
    // Update exercise cards
    (EXERCISES[mod] || []).forEach(ex => {
      const card = document.getElementById('ex-card-' + ex.id);
      if (card) card.classList.toggle('solved', state.exercisesDone.has(ex.id));
      const badge2 = document.getElementById('ex-badge-' + ex.id);
      if (badge2) {
        badge2.textContent = state.exercisesDone.has(ex.id) ? '✓ Résolu' : 'Exercice';
        badge2.classList.toggle('solved', state.exercisesDone.has(ex.id));
      }
    });
  });

  // Update sidebar lock state
  const modOrder = ['m1','m2','m3','m4','m5','m6','m7','m8','m9'];
  modOrder.forEach(mod => {
    const btn = document.querySelector(`[data-target="${mod}"]`);
    if (btn) {
      btn.classList.toggle('locked', !state.unlockedModules.has(mod));
    }
  });

  // Update overview cards
  renderOverviewCards();
}

/* ============================================================
   NAVIGATION
   ============================================================ */
let currentSection = 'home';

function navigateTo(target) {
  // 'ctf' et 'sandbox' sont toujours accessibles sans condition de module
  const freeTargets = ['home', 'sandbox', 'ctf', 'news', 'cheatsheet', 'glossary', 'roadmap'];
  if (!freeTargets.includes(target) && !state.unlockedModules.has(target)) {
    termPrint('error-line', `⚠ Le module "${target}" est verrouillé. Complétez le quiz du module précédent d'abord.`);
    return;
  }
  document.querySelectorAll('.module-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.module-nav-item').forEach(b => b.classList.remove('active'));
  document.getElementById('section-' + target).classList.add('active');
  const btn = document.querySelector(`[data-target="${target}"]`);
  if (btn) btn.classList.add('active');
  currentSection = target;
  // Ouvrir le groupe accordéon correspondant à la cible
  openGroupForTarget(target);
  updateGroupActiveHeader(target);
  window.scrollTo(0, 0);
  closeSidebar();
  // Update topbar title
  if (target === 'home') {
    document.querySelector('.top-bar-title').innerHTML = '<span>user@linux</span>:~$';
    renderHome();
  } else if (target === 'ctf') {
    document.querySelector('.top-bar-title').innerHTML = '<span>ctf@challenge</span>:~$ <span style="color:var(--text-subtle);font-size:11px">Challenges CTF</span>';
    // Afficher la grille, masquer le détail
    const grid   = document.getElementById('ctf-grid');
    const detail = document.getElementById('ctf-detail');
    if (grid)   grid.style.display   = '';
    if (detail) detail.style.display = 'none';
    renderCTFGrid();
  } else if (target === 'news') {
    document.querySelector('.top-bar-title').innerHTML = '<span>user@linux</span>:~/actualites-cyber$ <span style="color:var(--text-subtle);font-size:11px">Bulletin hebdomadaire</span>';
    // Si les données sont déjà chargées, re-render immédiatement
    // Si elles ne le sont pas encore (fetch en cours ou échoué), relancer loadNews()
    if (_newsData.length > 0) {
      renderNewsGrid(_newsActiveFilter);
    } else {
      loadNews();
    }
  } else if (target === 'roadmap') {
    document.querySelector('.top-bar-title').innerHTML = '<span>user@linux</span>:~/progression$ <span style="color:var(--text-subtle);font-size:11px">Ma progression</span>';
    renderRoadmap();
  } else if (target === 'glossary') {
    document.querySelector('.top-bar-title').innerHTML = '<span>user@linux</span>:~/glossaire$ <span style="color:var(--text-subtle);font-size:11px">Glossaire Linux & Cybersécurité</span>';
    if (_glossaryData.length > 0) {
      renderGlossary();
    } else {
      loadGlossary();
    }
  } else if (target === 'cheatsheet') {
    document.querySelector('.top-bar-title').innerHTML = '<span>user@linux</span>:~/cheatsheet$ <span style="color:var(--text-subtle);font-size:11px">Référence rapide Linux</span>';
    if (_cheatsheetData.length > 0) {
      renderCheatsheet('all');
    } else {
      loadCheatsheet();
    }
  } else {
    const meta = MODULE_META[target];
    document.querySelector('.top-bar-title').innerHTML = `<span>user@linux</span>:~/linux-trainer/${target}$ <span style="color:var(--text-subtle);font-size:11px">${meta.title}</span>`;
  }
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  const hamburger = document.querySelector('.hamburger');
  const isOpen = sidebar.classList.toggle('open');
  overlay.classList.toggle('visible');
  if (hamburger) hamburger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('visible');
  const hamburger = document.querySelector('.hamburger');
  if (hamburger) hamburger.setAttribute('aria-expanded', 'false');
}

/* ─── Accordéons sidebar ──────────────────────────────────────────────────── */

/**
 * Ouvre ou ferme un groupe accordéon de la sidebar.
 * @param {string} groupId — id du .sidebar-group (ex: 'group-modules')
 */
function toggleSidebarGroup(groupId) {
  const group = document.getElementById(groupId);
  if (!group) return;
  const isOpen = group.classList.toggle('open');
  const header = group.querySelector('.sidebar-group-header');
  if (header) header.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
}

/**
 * Ouvre le groupe contenant la cible et ferme les autres.
 * Appelée automatiquement par navigateTo().
 * @param {string} target — section cible (ex: 'm3', 'ctf', 'sandbox', 'news'…)
 */
function openGroupForTarget(target) {
  // Mapping cible → groupe
  const GROUP_MAP = {
    m1: 'group-modules', m2: 'group-modules', m3: 'group-modules',
    m4: 'group-modules', m5: 'group-modules', m6: 'group-modules',
    m7: 'group-modules', m8: 'group-modules',
    m9: 'group-network',
    ctf: 'group-challenges',
    sandbox: 'group-tools',
    news: 'group-resources', cheatsheet: 'group-resources', glossary: 'group-resources',
  };

  const targetGroup = GROUP_MAP[target];
  if (!targetGroup) return; // home, roadmap — pas dans un groupe

  document.querySelectorAll('.sidebar-group').forEach(g => {
    const shouldOpen = g.id === targetGroup;
    g.classList.toggle('open', shouldOpen);
    const header = g.querySelector('.sidebar-group-header');
    if (header) header.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
  });
}

/**
 * Met à jour l'indicateur visuel "has-active" sur le header du groupe actif.
 * @param {string} target
 */
function updateGroupActiveHeader(target) {
  document.querySelectorAll('.sidebar-group-header').forEach(h => h.classList.remove('has-active'));
  const group = document.getElementById(
    target === 'm9' ? 'group-network'
    : target.startsWith('m') && target !== 'ma' ? 'group-modules'
    : target === 'ctf' ? 'group-challenges'
    : target === 'sandbox' ? 'group-tools'
    : ['news','cheatsheet','glossary'].includes(target) ? 'group-resources'
    : null
  );
  if (group) {
    const header = group.querySelector('.sidebar-group-header');
    if (header) header.classList.add('has-active');
  }
}

/* ============================================================
   LESSON RENDERING
   ============================================================ */
function renderLessons() {
  ['m1','m2','m3','m4','m5','m6','m7','m8','m9'].forEach(mod => {
    const container = document.getElementById('lessons-' + mod);
    if (!container) return;
    container.innerHTML = '';
    LESSONS[mod].forEach((lesson, i) => {
      const card = document.createElement('div');
      card.className = 'lesson-card' + (state.lessonsDone.has(lesson.id) ? ' completed' : '');
      card.id = 'lesson-card-' + lesson.id;
      card.innerHTML = `
        <div class="lesson-header" onclick="toggleLesson('${lesson.id}')">
          <span class="lesson-num">${String(i+1).padStart(2,'0')}</span>
          <span class="lesson-title">${lesson.title}</span>
          <span class="lesson-toggle">▼</span>
        </div>
        <div class="lesson-body">
          <div class="lesson-content">${lesson.content}</div>
          <button class="lesson-done-btn ${state.lessonsDone.has(lesson.id) ? 'done' : ''}" id="done-btn-${lesson.id}" onclick="markLessonDone('${lesson.id}')">
            ${state.lessonsDone.has(lesson.id) ? '✓ Leçon terminée' : '✓ Marquer comme terminée'}
          </button>
        </div>
      `;
      container.appendChild(card);
    });
  });
}

function toggleLesson(id) {
  const card = document.getElementById('lesson-card-' + id);
  if (!card) return;
  card.classList.toggle('open');
}

async function markLessonDone(id) {
  if (state.lessonsDone.has(id)) return;
  state.lessonsDone.add(id);
  await saveState();
  updateProgressUI();
  // Flash the card
  const card = document.getElementById('lesson-card-' + id);
  if (card) {
    card.style.transition = 'border-color 0.3s';
    card.style.borderColor = 'var(--accent-green)';
    setTimeout(() => { card.style.borderColor = ''; }, 1500);
  }
}

/* ============================================================
   EXERCISE RENDERING
   ============================================================ */
function renderExercises() {
  ['m1','m2','m3','m4','m5','m6','m7','m8','m9'].forEach(mod => {
    const container = document.getElementById('exercises-' + mod);
    if (!container) return;
    container.innerHTML = '';
    (EXERCISES[mod] || []).forEach((ex, i) => {
      const card = document.createElement('div');
      card.className = 'exercise-card' + (state.exercisesDone.has(ex.id) ? ' solved' : '');
      card.id = 'ex-card-' + ex.id;
      card.innerHTML = `
        <div class="exercise-header">
          <div class="exercise-title">
            <span>${i+1}. ${ex.title}</span>
          </div>
          <span class="exercise-badge ${state.exercisesDone.has(ex.id) ? 'solved' : ''}" id="ex-badge-${ex.id}">
            ${state.exercisesDone.has(ex.id) ? '✓ Résolu' : 'Exercice'}
          </span>
        </div>
        <div class="exercise-desc">${ex.desc}</div>
        <div class="exercise-input-row">
          <span class="exercise-prompt">user@linux:~$</span>
          <input type="text" class="exercise-input" id="ex-input-${ex.id}" 
            placeholder="tapez votre commande..." 
            ${state.exercisesDone.has(ex.id) ? 'disabled' : ''}
            onkeydown="if(event.key==='Enter') checkExercise('${ex.id}', '${mod}')">
          <button class="btn-check" onclick="checkExercise('${ex.id}', '${mod}')" ${state.exercisesDone.has(ex.id) ? 'disabled' : ''}>Vérifier</button>
          <button class="btn-hint" onclick="showHint('${ex.id}')">💡 Indice</button>
        </div>
        <div class="hint-box" id="hint-${ex.id}"></div>
        <div class="exercise-feedback" id="feedback-${ex.id}"></div>
      `;
      container.appendChild(card);
    });
  });
}

const hintLevels = {};

function showHint(exId) {
  const ex = findExercise(exId);
  if (!ex) return;
  const current = hintLevels[exId] || 0;
  const next = Math.min(current + 1, ex.hints.length);
  hintLevels[exId] = next;
  const box = document.getElementById('hint-' + exId);
  if (box) {
    box.classList.add('visible');
    box.innerHTML = `💡 <strong>Indice ${next}/${ex.hints.length} :</strong> ${ex.hints[next-1]}`;
  }
}

function findExercise(id) {
  for (const mod in EXERCISES) {
    const found = EXERCISES[mod].find(e => e.id === id);
    if (found) return found;
  }
  return null;
}

async function checkExercise(exId, mod) {
  const ex = findExercise(exId);
  if (!ex) return;
  if (state.exercisesDone.has(exId)) return;

  const input = document.getElementById('ex-input-' + exId);
  const feedback = document.getElementById('feedback-' + exId);
  if (!input || !feedback) return;

  /**
   * normalizeCmd : prépare une commande pour la comparaison
   *  - met en minuscules
   *  - réduit les espaces multiples en un seul
   *  - supprime les guillemets simples/doubles autour des arguments
   *    (ex: grep -i "error" → grep -i error)
   */
  function normalizeCmd(s) {
    return s
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')                  // espaces multiples → un seul
      .replace(/"([^"]*)"/g, '$1')           // retire les guillemets doubles
      .replace(/'([^']*)'/g, '$1');          // retire les guillemets simples
  }

  /**
   * sortFlags : trie les caractères dans les flags combinés COURTS et purement alphabétiques
   *  (ex: -la → -al, -al → -al)
   * Permet d'accepter 'ls -al' autant que 'ls -la'.
   * Les mots-clés d'options (comme -type, -perm, -name) sont préservés intacts.
   */
  const PRESERVED_FLAGS = new Set([
    'type','perm','name','user','group','exec','mtime','atime','ctime','size',
    'depth','maxdepth','mindepth','noall','answer','ignore','case','nocase',
    'color','colour','print','delete','regex','path','ipath','newer','empty',
    'readable','writable','executable','links','nolinks','mount','follow'
  ]);
  function sortFlags(cmd) {
    return cmd.replace(/(?<!\w)-([a-zA-Z]{2,})/g, (match, flags) => {
      // Préserver les mots-clés et les flags longs (>4 chars) ou mixtes
      if (PRESERVED_FLAGS.has(flags.toLowerCase()) || flags.length > 4 || !/^[a-zA-Z]+$/.test(flags)) {
        return match;
      }
      return '-' + flags.toLowerCase().split('').sort().join('');
    });
  }

  /**
   * normalizeForCompare : normalisation complète pour la comparaison finale
   */
  function normalizeForCompare(s) {
    return sortFlags(normalizeCmd(s));
  }

  const val = normalizeForCompare(input.value);
  const accepted = ex.accepted.map(a => normalizeForCompare(a));

  // Comparaison stricte après normalisation complète
  const isCorrect = accepted.some(a => val === a);

  if (isCorrect) {
    // Correct !
    state.exercisesDone.add(exId);
    await saveState();
    feedback.className = 'exercise-feedback success';
    feedback.textContent = '✓ Bravo ! Commande correcte. Exercice validé.';
    input.disabled = true;
    document.querySelector(`[onclick="checkExercise('${exId}', '${mod}')"]`).disabled = true;
    updateProgressUI();
    // Exécuter aussi dans le terminal pour afficher le résultat
    processTerminalCommand(input.value.trim());
  } else {
    feedback.className = 'exercise-feedback error';
    feedback.textContent = '✗ Commande incorrecte. Vérifiez la syntaxe ou utilisez un indice.';
    input.focus();
    input.select();
  }
}

/* ============================================================
   QUIZ RENDERING
   ============================================================ */
function renderQuizzes() {
  ['m1','m2','m3','m4','m5','m6','m7','m8','m9'].forEach(mod => {
    const container = document.getElementById('quiz-' + mod);
    if (!container) return;
    const quiz = QUIZZES[mod];
    const prevScore = state.quizScores[mod];

    container.innerHTML = '';
    const card = document.createElement('div');
    card.className = 'quiz-card';
    card.id = 'quiz-card-' + mod;

    if (prevScore !== undefined) {
      const pass = prevScore >= 3;
      card.innerHTML = `
        <div class="quiz-start">
          <h3>${quiz.title}</h3>
          <p>Score précédent : <strong>${prevScore}/5</strong> ${pass ? '— Réussi ✓' : '— À recommencer'}</p>
          <button class="btn-start-quiz" onclick="startQuiz('${mod}')">Recommencer le quiz</button>
        </div>
        <div class="quiz-body" id="quiz-body-${mod}"></div>
        <div class="quiz-result" id="quiz-result-${mod}"></div>
      `;
    } else {
      card.innerHTML = `
        <div class="quiz-start">
          <h3>${quiz.title}</h3>
          <p>5 questions à choix multiples. Score minimum : 3/5 pour déverrouiller le module suivant.</p>
          <button class="btn-start-quiz" onclick="startQuiz('${mod}')">▶ Commencer le quiz</button>
        </div>
        <div class="quiz-body" id="quiz-body-${mod}"></div>
        <div class="quiz-result" id="quiz-result-${mod}"></div>
      `;
    }
    container.appendChild(card);
  });
}

const quizState = {}; // { m1: { currentQ: 0, score: 0, answered: [] } }

function startQuiz(mod) {
  const quiz = QUIZZES[mod];
  quizState[mod] = { currentQ: 0, score: 0, answered: [] };
  const card = document.getElementById('quiz-card-' + mod);
  card.querySelector('.quiz-start').style.display = 'none';
  const result = document.getElementById('quiz-result-' + mod);
  result.classList.remove('visible');
  showQuestion(mod);
}

function showQuestion(mod) {
  const quiz = QUIZZES[mod];
  const qs = quizState[mod];
  const q = quiz.questions[qs.currentQ];
  const body = document.getElementById('quiz-body-' + mod);
  if (!body) return;
  body.classList.add('visible');

  const letters = ['A','B','C','D'];
  const pct = Math.round((qs.currentQ / quiz.questions.length) * 100);

  body.innerHTML = `
    <div class="quiz-progress-row">
      <span class="quiz-q-num">Q${qs.currentQ+1}/${quiz.questions.length}</span>
      <div class="quiz-progress-bar-wrap">
        <div class="quiz-progress-bar-fill" style="width:${pct}%"></div>
      </div>
      <span>${qs.score} pts</span>
    </div>
    <div class="quiz-question">${q.q}</div>
    <div class="quiz-options" id="quiz-opts-${mod}">
      ${q.options.map((opt, i) => `
        <div class="quiz-option" id="quiz-opt-${mod}-${i}" onclick="selectOption('${mod}', ${i})">
          <span class="quiz-option-letter">${letters[i]}</span>
          <span>${opt}</span>
        </div>
      `).join('')}
    </div>
    <div class="quiz-explanation" id="quiz-expl-${mod}">${q.expl}</div>
    <button class="btn-next-q" id="quiz-next-${mod}" onclick="nextQuestion('${mod}')">
      ${qs.currentQ < quiz.questions.length - 1 ? 'Question suivante →' : 'Voir les résultats →'}
    </button>
  `;
}

function selectOption(mod, idx) {
  const quiz = QUIZZES[mod];
  const qs = quizState[mod];
  if (!qs || qs.answered[qs.currentQ] !== undefined) return;

  qs.answered[qs.currentQ] = idx;
  const correct = quiz.questions[qs.currentQ].correct;
  const isCorrect = idx === correct;
  if (isCorrect) qs.score++;

  quiz.questions[qs.currentQ].options.forEach((_, i) => {
    const opt = document.getElementById('quiz-opt-' + mod + '-' + i);
    if (!opt) return;
    opt.classList.add('disabled');
    if (i === correct) opt.classList.add('correct');
    else if (i === idx && !isCorrect) opt.classList.add('wrong');
  });

  const expl = document.getElementById('quiz-expl-' + mod);
  if (expl) {
    expl.classList.add('visible');
    expl.innerHTML = '<span style="color:' + (isCorrect ? 'var(--accent-green)' : 'var(--accent-red)') + ';">' + (isCorrect ? '✓ Correct !' : '✗ Incorrect.') + '</span> ' + quiz.questions[qs.currentQ].expl;
  }

  const nextBtn = document.getElementById('quiz-next-' + mod);
  if (nextBtn) nextBtn.style.display = 'inline-flex';
}

function nextQuestion(mod) {
  const quiz = QUIZZES[mod];
  const qs = quizState[mod];
  qs.currentQ++;
  if (qs.currentQ >= quiz.questions.length) {
    showQuizResult(mod);
  } else {
    showQuestion(mod);
  }
}

async function showQuizResult(mod) {
  const qs = quizState[mod];
  const score = qs.score;
  const pass = score >= 3;

  state.quizScores[mod] = score;
  if (pass) {
    const modules = ['m1','m2','m3','m4','m5','m6','m7','m8','m9'];
    const idx = modules.indexOf(mod);
    if (idx < modules.length - 1) state.unlockedModules.add(modules[idx + 1]);
    state.unlockedModules.add(mod);
  }
  await saveState();
  updateProgressUI();

  const body = document.getElementById('quiz-body-' + mod);
  if (body) { body.classList.remove('visible'); body.innerHTML = ''; }

  const result = document.getElementById('quiz-result-' + mod);
  if (!result) return;
  result.classList.add('visible');

  const stars = score >= 5 ? '⭐⭐⭐' : score >= 3 ? '⭐⭐' : '⭐';
  const msgs = ['Relisez les leçons et réessayez.', 'Continuez à réviser, vous pouvez le faire !', 'Pas mal, mais retentez pour valider.', 'Bien joué ! Module déverrouillé.', 'Excellent ! Presque parfait.', 'Parfait ! Vous maîtrisez ce module.'];
  const nextMod = getNextMod(mod);

  result.innerHTML = '<div class="quiz-result-inner ' + (pass ? 'pass' : 'fail') + '">'
    + '<div class="quiz-result-stars">' + stars + '</div>'
    + '<div class="quiz-result-score">' + score + '<span>/5</span></div>'
    + '<div class="quiz-result-msg">' + (msgs[score] || '') + '</div>'
    + (pass ? '<div class="quiz-unlock-msg">🔓 Module suivant déverrouillé !</div>' : '')
    + '<div class="quiz-result-actions">'
    + '<button class="btn-start-quiz" onclick="startQuiz(\'' + mod + '\')">Recommencer</button>'
    + (pass && mod !== 'm8' ? '<button class="btn-start-quiz" style="background:var(--accent-blue-dim);margin-left:8px" onclick="navigateTo(\'' + nextMod + '\')">Module suivant →</button>' : '')
    + '</div></div>';
}

function getNextMod(mod) {
  const mods = ['m1','m2','m3','m4','m5','m6','m7','m8','m9'];
  const idx = mods.indexOf(mod);
  return idx < mods.length - 1 ? mods[idx + 1] : mod;
}

/* ============================================================
   OVERVIEW CARDS
   ============================================================ */
function renderOverviewCards() {
  const grid = document.getElementById('modules-overview-grid');
  if (!grid) return;
  const mods = ['m1','m2','m3','m4','m5','m6','m7','m8','m9'];
  const icons = ['🐧','🔒','👤','🌐','📜','⚙️','🔍','🐙'];
  const nums = ['01','02','03','04','05','06','07','08'];
  grid.innerHTML = '';
  mods.forEach(function(mod, i) {
    const meta = MODULE_META[mod];
    const unlocked = state.unlockedModules.has(mod);
    const mp = getModuleProgress(mod);
    const pct = mp.pct;
    const card = document.createElement('div');
    card.className = 'module-overview-card' + (!unlocked ? ' locked' : '');
    card.innerHTML = '<div class="mod-card-num">' + nums[i] + '</div>'
      + '<div class="mod-card-icon">' + icons[i] + '</div>'
      + '<h3 class="mod-card-title">' + meta.title + '</h3>'
      + '<p class="mod-card-desc">' + meta.desc + '</p>'
      + '<div class="mod-card-progress"><div class="mod-card-progress-bar"><div class="mod-card-progress-fill" style="width:' + pct + '%"></div></div><span class="mod-card-pct">' + pct + '%</span></div>'
      + (unlocked
        ? '<button class="mod-card-btn" onclick="navigateTo(\'' + mod + '\')">Commencer <span class="arrow">→</span></button>'
        : '<div class="mod-card-locked-msg">🔒 Réussissez le quiz précédent pour débloquer</div>');
    grid.appendChild(card);
  });
}

/* ============================================================
   TERMINAL SIMULATOR
   ============================================================ */
const vfs = {
  '/': { type: 'dir', children: ['home', 'bin', 'etc', 'var', 'tmp', 'usr'] },
  '/home': { type: 'dir', children: ['user'] },
  '/home/user': { type: 'dir', children: ['documents', 'scripts', 'projets', '.bashrc', '.profile', 'readme.txt'] },
  '/home/user/documents': { type: 'dir', children: ['notes.txt', 'cours.md'] },
  '/home/user/scripts': { type: 'dir', children: ['script.sh', 'backup.sh'] },
  '/home/user/projets': { type: 'dir', children: [] },
  '/home/user/.bashrc': { type: 'file', content: '# ~/.bashrc\nexport PATH="$HOME/.local/bin:$PATH"\nalias ll="ls -la"\nalias gs="git status"' },
  '/home/user/.profile': { type: 'file', content: '# ~/.profile\n# Set environment for login shells' },
  '/home/user/readme.txt': { type: 'file', content: 'Bienvenue dans Linux Trainer !\nExplorez les modules pour apprendre Linux.' },
  '/home/user/documents/notes.txt': { type: 'file', content: 'Mes notes de cours Linux :\n- ls : lister les fichiers\n- cd : changer de répertoire\n- pwd : afficher le répertoire courant' },
  '/home/user/documents/cours.md': { type: 'file', content: '# Cours Linux\n\n## Module 1 : Les bases\nLe terminal est votre meilleur ami.' },
  '/home/user/scripts/script.sh': { type: 'file', content: '#!/bin/bash\necho "Hello, World!"\n', perms: '-rw-r--r--' },
  '/home/user/scripts/backup.sh': { type: 'file', content: '#!/bin/bash\nrsync -avz ~/documents/ /backup/', perms: '-rwxr-xr-x' },
  '/bin': { type: 'dir', children: ['bash', 'ls', 'cat', 'echo', 'rm', 'cp', 'mv', 'mkdir', 'chmod', 'chown'] },
  '/etc': { type: 'dir', children: ['hosts', 'resolv.conf', 'passwd', 'shadow', 'fstab'] },
  '/etc/hosts': { type: 'file', content: '127.0.0.1\tlocalhost\n::1\t\tlocalhost\n127.0.1.1\tuser-pc' },
  '/etc/resolv.conf': { type: 'file', content: 'nameserver 8.8.8.8\nnameserver 8.8.4.4\nsearch home.lan' },
  '/var': { type: 'dir', children: ['log', 'tmp', 'cache'] },
  '/var/log': { type: 'dir', children: ['syslog', 'auth.log', 'kern.log'] },
  '/var/log/syslog': { type: 'file', content: 'Dec 15 10:23:01 user-pc systemd[1]: Started Session.\nDec 15 10:23:05 user-pc kernel: Linux version 5.15.0-91-generic' },
  '/var/log/auth.log': { type: 'file', content: 'Dec 15 10:20:01 user-pc sshd[1234]: Accepted publickey for user from 192.168.1.2\nDec 15 10:22:15 user-pc sudo: user : TTY=pts/0 ; COMMAND=/bin/apt update' },
  '/tmp': { type: 'dir', children: [] },
  '/usr': { type: 'dir', children: ['bin', 'lib', 'share', 'local'] }
};

let currentDir = '/home/user';
const cmdHistory = [];
let historyIdx = -1;
let prevDir = null;

function resolvePath(path) {
  if (!path || path === '~') return '/home/user';
  if (path === '-') return prevDir || currentDir;
  if (path.startsWith('~/')) return '/home/user' + path.slice(1);
  if (!path.startsWith('/')) {
    const base = currentDir === '/' ? '' : currentDir;
    path = base + '/' + path;
  }
  let parts = path.split('/').filter(Boolean);
  const resolved = [];
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === '..') resolved.pop();
    else if (parts[i] !== '.') resolved.push(parts[i]);
  }
  return '/' + resolved.join('/');
}

function promptStr() {
  let display = currentDir.replace('/home/user', '~');
  return '<span class="t-user">user@linux</span><span class="t-sep">:</span><span class="t-dir">' + display + '</span><span class="t-dollar">$</span>';
}

function toggleFaq(btn) {
  const item = btn.closest('.lp-faq-item');
  const wasOpen = item.classList.contains('open');
  // Fermer tous les items ouverts
  document.querySelectorAll('.lp-faq-item.open').forEach(function(el) {
    el.classList.remove('open');
    const q = el.querySelector('.lp-faq-q');
    if (q) q.setAttribute('aria-expanded', 'false');
  });
  if (!wasOpen) {
    item.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');
  }
}

function toggleTerminal() {
  let sec  = document.getElementById('terminal-section');
  let icon = document.getElementById('term-toggle-icon');
  const isMin = sec.classList.toggle('minimized');
  icon.textContent = isMin ? '▲' : '▼';
}

function focusTerminal() {
  const sec  = document.getElementById('terminal-section');
  const icon = document.getElementById('term-toggle-icon');
  sec.classList.remove('minimized');
  icon.textContent = '▼';
  const inp = document.getElementById('terminal-input');
  if (inp) inp.focus();
  closeSidebar();
}

function termPrint(html, cls) {
  let out = document.getElementById('terminal-output');
  if (!out) return;
  let line = document.createElement('div');
  line.className = 'term-line' + (cls ? ' ' + cls : '');
  line.innerHTML = html;
  out.appendChild(line);
  out.scrollTop = out.scrollHeight;
}

function termCommand(cmd) {
  let out = document.getElementById('terminal-output');
  if (!out) return;
  const line = document.createElement('div');
  line.className = 'term-line term-cmd-echo';
  line.innerHTML = promptStr() + ' <span class="t-input">' + escHtml(cmd) + '</span>';
  out.appendChild(line);
  out.scrollTop = out.scrollHeight;
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function updatePromptLabel() {
  const label = document.getElementById('terminal-prompt-label');
  if (label) {
    const display = currentDir.replace('/home/user', '~');
    label.innerHTML = '<span class="t-user">user@linux</span><span class="t-sep">:</span><span class="t-dir">' + display + '</span><span class="t-dollar">$</span>';
  }
}

function processTerminalCommand(rawCmd) {
  if (!rawCmd || !rawCmd.trim()) return;
  const trimmed = rawCmd.trim();
  if (cmdHistory[cmdHistory.length - 1] !== trimmed) cmdHistory.push(trimmed);
  historyIdx = cmdHistory.length;
  termCommand(trimmed);

  const parts = trimmed.split(/\s+/);
  const cmd = parts[0];
  const args = parts.slice(1);

  switch(cmd) {
    case 'clear': {
      const out = document.getElementById('terminal-output');
      if (out) out.innerHTML = '';
      break;
    }
    case 'pwd': {
      termPrint(escHtml(currentDir), 'term-output');
      break;
    }
    case 'ls': {
      handleLs(args);
      break;
    }
    case 'cd': {
      handleCd(args);
      break;
    }
    case 'mkdir': {
      const opts = args.filter(function(a){return a.startsWith('-');});
      const dirs = args.filter(function(a){return !a.startsWith('-');});
      if (!dirs[0]) { termPrint('<span class="t-err">mkdir : nom de répertoire manquant</span>'); break; }
      let target = resolvePath(dirs[0]);
      if (vfs[target]) { termPrint('<span class="t-err">mkdir : impossible de créer le répertoire « ' + escHtml(dirs[0]) + ' » : Le fichier existe</span>'); break; }
      let parentPath = target.lastIndexOf('/') > 0 ? target.substring(0, target.lastIndexOf('/')) : '/';
      const dirName = target.split('/').pop();
      if (!vfs[parentPath] && !opts.includes('-p')) { termPrint('<span class="t-err">mkdir : impossible de créer le répertoire : chemin parent inexistant (utilisez -p)</span>'); break; }
      if (opts.includes('-p') && !vfs[parentPath]) vfs[parentPath] = { type: 'dir', children: [] };
      vfs[target] = { type: 'dir', children: [] };
      if (vfs[parentPath] && !vfs[parentPath].children.includes(dirName)) vfs[parentPath].children.push(dirName);
      break;
    }
    case 'touch': {
      if (!args[0]) { termPrint('<span class="t-err">touch : nom de fichier manquant</span>'); break; }
      let target = resolvePath(args[0]);
      if (!vfs[target]) {
        const parentPath = target.lastIndexOf('/') > 0 ? target.substring(0, target.lastIndexOf('/')) : '/';
        const fname = target.split('/').pop();
        vfs[target] = { type: 'file', content: '' };
        if (vfs[parentPath] && !vfs[parentPath].children.includes(fname)) vfs[parentPath].children.push(fname);
      }
      break;
    }
    case 'cat': {
      if (!args[0]) { termPrint('<span class="t-err">cat : aucun fichier spécifié</span>'); break; }
      let target = resolvePath(args[0]);
      if (!vfs[target]) { termPrint('<span class="t-err">cat : ' + escHtml(args[0]) + ' : Aucun fichier ou dossier de ce type</span>'); break; }
      if (vfs[target].type === 'dir') { termPrint('<span class="t-err">cat : ' + escHtml(args[0]) + ' : est un répertoire</span>'); break; }
      const lines = (vfs[target].content || '').split('\n');
      lines.forEach(function(l){ termPrint(escHtml(l), 'term-output'); });
      break;
    }
    case 'echo': {
      let text = args.join(' ');
      text = text.replace(/\$HOME/g,'/home/user').replace(/\$USER/g,'user').replace(/\$PWD/g,currentDir).replace(/\$SHELL/g,'/bin/bash').replace(/\$PATH/g,'/usr/local/sbin:/usr/local/bin:/usr/bin:/bin');
      termPrint(escHtml(text), 'term-output');
      break;
    }
    case 'rm': {
      const recursive = args.some(function(a){return a==='-r'||a==='-rf'||a==='-fr'||a==='-r';});
      const fileArgs = args.filter(function(a){return !a.startsWith('-');});
      if (!fileArgs[0]) { termPrint('<span class="t-err">rm : aucun fichier spécifié</span>'); break; }
      let target = resolvePath(fileArgs[0]);
      if (!vfs[target]) { termPrint('<span class="t-err">rm : impossible de supprimer « ' + escHtml(fileArgs[0]) + ' » : Aucun fichier ou dossier de ce type</span>'); break; }
      if (vfs[target].type === 'dir' && !recursive) { termPrint('<span class="t-err">rm : impossible de supprimer « ' + escHtml(fileArgs[0]) + ' » : est un répertoire (utilisez -r)</span>'); break; }
      const parentPath2 = target.lastIndexOf('/') > 0 ? target.substring(0, target.lastIndexOf('/')) : '/';
      const name = target.split('/').pop();
      if (vfs[parentPath2]) vfs[parentPath2].children = vfs[parentPath2].children.filter(function(c){return c!==name;});
      delete vfs[target];
      break;
    }
    case 'cp': {
      const fileArgs2 = args.filter(function(a){return !a.startsWith('-');});
      if (fileArgs2.length < 2) { termPrint('<span class="t-err">cp : opérandes de fichier manquantes</span>'); break; }
      let src = resolvePath(fileArgs2[0]);
      let dest = resolvePath(fileArgs2[1]);
      if (!vfs[src]) { termPrint('<span class="t-err">cp : ' + escHtml(fileArgs2[0]) + ' : Aucun fichier de ce type</span>'); break; }
      const destName = fileArgs2[1].split('/').pop();
      vfs[dest] = Object.assign({}, vfs[src]);
      let destParent = dest.lastIndexOf('/') > 0 ? dest.substring(0, dest.lastIndexOf('/')) : '/';
      if (vfs[destParent] && !vfs[destParent].children.includes(destName)) vfs[destParent].children.push(destName);
      break;
    }
    case 'mv': {
      if (args.length < 2) { termPrint('<span class="t-err">mv : opérandes de fichier manquantes</span>'); break; }
      const src = resolvePath(args[0]);
      const dest = resolvePath(args[1]);
      if (!vfs[src]) { termPrint('<span class="t-err">mv : ' + escHtml(args[0]) + ' : Aucun fichier de ce type</span>'); break; }
      vfs[dest] = Object.assign({}, vfs[src]);
      const destParent = dest.lastIndexOf('/') > 0 ? dest.substring(0, dest.lastIndexOf('/')) : '/';
      const destName2 = dest.split('/').pop();
      if (vfs[destParent] && !vfs[destParent].children.includes(destName2)) vfs[destParent].children.push(destName2);
      const srcParent = src.lastIndexOf('/') > 0 ? src.substring(0, src.lastIndexOf('/')) : '/';
      const srcName = src.split('/').pop();
      if (vfs[srcParent]) vfs[srcParent].children = vfs[srcParent].children.filter(function(c){return c!==srcName;});
      delete vfs[src];
      break;
    }
    case 'whoami': termPrint('user', 'term-output'); break;
    case 'hostname': termPrint('user-pc', 'term-output'); break;
    case 'date': termPrint(new Date().toString(), 'term-output'); break;
    case 'uname': {
      if (args.includes('-a')) termPrint('Linux user-pc 5.15.0-91-generic #101-Ubuntu SMP Tue Nov 14 13:30:08 UTC 2023 x86_64 x86_64 x86_64 GNU/Linux', 'term-output');
      else termPrint('Linux', 'term-output');
      break;
    }
    case 'ps': {
      if (args.includes('aux') || args.includes('-aux') || args.includes('-ef')) {
        termPrint('<span class="t-muted">USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND</span>', 'term-output');
        termPrint('root           1  0.0  0.1 168380 13008 ?        Ss   10:00   0:02 /sbin/init', 'term-output');
        termPrint('root         891  0.0  0.0  72300  5612 ?        Ss   10:00   0:00 /usr/sbin/sshd -D', 'term-output');
        termPrint('user        1023  0.1  0.0  10596  5120 pts/0    Ss   10:02   0:00 bash', 'term-output');
        termPrint('user        1847  0.0  0.0  12940  3712 pts/0    R+   10:15   0:00 ps aux', 'term-output');
      } else {
        termPrint('<span class="t-muted">  PID TTY          TIME CMD</span>', 'term-output');
        termPrint(' 1023 pts/0    00:00:00 bash', 'term-output');
        termPrint(' 1847 pts/0    00:00:00 ps', 'term-output');
      }
      break;
    }
    case 'ping': {
      const host = args.filter(function(a){return !a.startsWith('-');})[0];
      if (!host) { termPrint('<span class="t-err">ping : hôte manquant</span>'); break; }
      let count = 4;
      if (args.includes('-c')) count = parseInt(args[args.indexOf('-c')+1]) || 4;
      termPrint('PING ' + escHtml(host) + ' (142.250.74.46) 56(84) bytes of data.', 'term-output');
      for (let i=1; i<=count; i++) {
        termPrint('64 bytes from ' + escHtml(host) + ' (142.250.74.46): icmp_seq=' + i + ' ttl=119 time=' + (20+Math.random()*15).toFixed(3) + ' ms', 'term-output');
      }
      termPrint('--- ' + escHtml(host) + ' ping statistics ---', 'term-output');
      termPrint(count + ' packets transmitted, ' + count + ' received, 0% packet loss', 'term-output');
      break;
    }
    case 'ip': {
      if (args[0]==='addr'||args[0]==='a') {
        termPrint('1: <span class="t-cmd-name">lo</span>: &lt;LOOPBACK,UP&gt; mtu 65536', 'term-output');
        termPrint('    inet <span class="t-green">127.0.0.1/8</span> scope host lo', 'term-output');
        termPrint('2: <span class="t-cmd-name">eth0</span>: &lt;BROADCAST,MULTICAST,UP&gt; mtu 1500', 'term-output');
        termPrint('    inet <span class="t-green">192.168.1.42/24</span> brd 192.168.1.255 scope global eth0', 'term-output');
      } else { termPrint('<span class="t-err">ip : objet "' + escHtml(args[0]||'') + '" inconnu</span>'); }
      break;
    }
    case 'ifconfig': {
      termPrint('<span class="t-cmd-name">eth0</span>: flags=4163&lt;UP,BROADCAST,RUNNING,MULTICAST&gt;  mtu 1500', 'term-output');
      termPrint('        inet <span class="t-green">192.168.1.42</span>  netmask 255.255.255.0  broadcast 192.168.1.255', 'term-output');
      termPrint('<span class="t-cmd-name">lo</span>: flags=73&lt;UP,LOOPBACK,RUNNING&gt;  mtu 65536', 'term-output');
      termPrint('        inet <span class="t-green">127.0.0.1</span>  netmask 255.0.0.0', 'term-output');
      break;
    }
    case 'ss': {
      termPrint('<span class="t-muted">Netid  State   Recv-Q  Send-Q  Local Address:Port    Peer Address:Port</span>', 'term-output');
      termPrint('tcp    LISTEN  0       128     0.0.0.0:22           0.0.0.0:*', 'term-output');
      termPrint('tcp    LISTEN  0       511     0.0.0.0:80           0.0.0.0:*', 'term-output');
      termPrint('tcp    LISTEN  0       511     0.0.0.0:443          0.0.0.0:*', 'term-output');
      break;
    }
    case 'netstat': {
      termPrint('<span class="t-muted">Proto  Recv-Q  Send-Q  Local Address     Foreign Address     State</span>', 'term-output');
      termPrint('tcp        0       0  0.0.0.0:22        0.0.0.0:*           LISTEN', 'term-output');
      break;
    }
    case 'curl': {
      let url = args.filter(function(a){return !a.startsWith('-');})[0];
      if (!url) { termPrint('<span class="t-err">curl : URL manquante</span>'); break; }
      termPrint('<span class="t-muted">  % Total    % Received % Xferd  Average Speed</span>', 'term-output');
      termPrint('100  1024  100  1024    0     0  12345      0', 'term-output');
      termPrint('<span class="t-green">&lt;!DOCTYPE html&gt;&lt;html&gt;&lt;head&gt;&lt;title&gt;Response&lt;/title&gt;...', 'term-output');
      break;
    }
    case 'wget': {
      const url = args.filter(function(a){return !a.startsWith('-');})[0];
      if (!url) { termPrint('<span class="t-err">wget : URL manquante</span>'); break; }
      const fname = url.split('/').pop() || 'index.html';
      termPrint('Résolution de ' + escHtml(url.split('/')[2]||url) + '... 142.250.74.46', 'term-output');
      termPrint('Connexion... 200 OK', 'term-output');
      termPrint('<span class="t-green">« ' + escHtml(fname) + ' » sauvegardé [4096/4096]</span>', 'term-output');
      break;
    }
    case 'chmod': {
      if (args.length < 2) { termPrint('<span class="t-err">chmod : opérandes manquantes</span>'); break; }
      const fileArg = args[args.length-1];
      let target = resolvePath(fileArg);
      if (!vfs[target]) { termPrint('<span class="t-err">chmod : impossible d\'accéder à « ' + escHtml(fileArg) + ' » : Aucun fichier ou dossier de ce type</span>'); break; }
      const perm = args[0];
      const permMap = {'+x':'rwxr-xr-x','a+x':'rwxr-xr-x','u+x':'rwxr-xr-x','755':'rwxr-xr-x','644':'rw-r--r--','600':'rw-------','777':'rwxrwxrwx','700':'rwx------','400':'r--------'};
      if (permMap[perm]) vfs[target].perms = '-' + permMap[perm];
      break;
    }
    case 'chown': {
      if (args.length < 2) { termPrint('<span class="t-err">chown : opérandes manquantes</span>'); break; }
      break; // silent success
    }
    case 'man': {
      const manPages = {
        ls: '<strong>LS(1)</strong> — Liste le contenu d\'un répertoire<br>OPTIONS: -l format long, -a tout afficher, -h tailles lisibles, -r ordre inverse',
        cd: '<strong>CD(1)</strong> — Changer de répertoire<br>~ = home, - = répertoire précédent, .. = parent',
        pwd: '<strong>PWD(1)</strong> — Afficher le répertoire courant',
        mkdir: '<strong>MKDIR(1)</strong> — Créer des répertoires<br>OPTIONS: -p créer les parents, -v verbose',
        rm: '<strong>RM(1)</strong> — Supprimer des fichiers<br>OPTIONS: -r récursif, -f forcer, -i interactif',
        chmod: '<strong>CHMOD(1)</strong> — Modifier les permissions<br>MODES: +x exécutable, 755 rwxr-xr-x, 644 rw-r--r--',
        chown: '<strong>CHOWN(1)</strong> — Changer le propriétaire<br>SYNTAXE: chown [user][:group] fichier',
        grep: '<strong>GREP(1)</strong> — Rechercher dans des fichiers<br>OPTIONS: -r récursif, -i insensible casse, -n numéros ligne',
        ssh: '<strong>SSH(1)</strong> — Client SSH sécurisé<br>OPTIONS: -p port, -i clé, -v verbose',
        systemctl: '<strong>SYSTEMCTL(1)</strong> — Contrôle systemd<br>COMMANDES: start, stop, restart, enable, disable, status',
        apt: '<strong>APT(8)</strong> — Gestionnaire de paquets Debian<br>COMMANDES: update, upgrade, install, remove, search',
        find: '<strong>FIND(1)</strong> — Rechercher des fichiers<br>OPTIONS: -name motif, -type f|d, -mtime jours',
        cat: '<strong>CAT(1)</strong> — Afficher le contenu d\'un fichier<br>OPTIONS: -n numéroter les lignes, -A afficher tout',
        echo: '<strong>ECHO(1)</strong> — Afficher du texte<br>OPTIONS: -n sans newline, -e interpréter les séquences'
      };
      const topic = args[0];
      if (!topic) { termPrint('<span class="t-err">man : quel manuel voulez-vous ?</span>'); break; }
      if (manPages[topic]) termPrint('<div class="man-page">' + manPages[topic] + '</div>', 'term-output');
      else termPrint('<span class="t-err">Aucune entrée de manuel pour ' + escHtml(topic) + '</span>');
      break;
    }
    case 'history': {
      cmdHistory.forEach(function(c, i){ termPrint('  ' + String(i+1).padStart(3) + '  ' + escHtml(c), 'term-output'); });
      break;
    }
    case 'systemctl': {
      const action = args[0]; const service = args[1] || 'ssh';
      if (action==='status') {
        const sn = service.replace(/\.service$/,'');
        termPrint('● <span class="t-green">' + escHtml(sn) + '.service</span>', 'term-output');
        termPrint('   Loaded: loaded (/lib/systemd/system/' + escHtml(sn) + '.service; enabled)', 'term-output');
        termPrint('   Active: <span class="t-green">active (running)</span> since Thu 2023-12-14 10:00:01 UTC; 1h ago', 'term-output');
        termPrint(' Main PID: 891 (' + escHtml(sn) + ')', 'term-output');
      } else if (['start','stop','restart','enable','disable'].includes(action)) {
        if (action==='enable') termPrint('<span class="t-green">Synchronizing state of ' + escHtml(service) + ' with SysV service script...</span>', 'term-output');
      } else { termPrint('<span class="t-err">systemctl : commande inconnue : ' + escHtml(action||'') + '</span>'); }
      break;
    }
    case 'journalctl': {
      termPrint('<span class="t-muted">-- Journal begins at Thu 2023-12-14 10:00:00 UTC --</span>', 'term-output');
      termPrint('Dec 14 10:00:01 user-pc systemd[1]: Starting System...', 'term-output');
      termPrint('Dec 14 10:00:03 user-pc kernel: Linux version 5.15.0-91-generic', 'term-output');
      termPrint('Dec 14 10:00:15 user-pc sshd[891]: Server listening on 0.0.0.0 port 22', 'term-output');
      break;
    }
    case 'crontab': {
      if (args.includes('-l')) {
        termPrint('<span class="t-muted"># m h  dom mon dow   command</span>', 'term-output');
        termPrint('0 2 * * * /home/user/scripts/backup.sh', 'term-output');
        termPrint('*/5 * * * * /usr/bin/check_health.sh', 'term-output');
      } else if (args.includes('-e')) {
        termPrint('<span class="t-yellow">Ouverture de l\'éditeur crontab... (simulation)</span>', 'term-output');
      } else { termPrint('<span class="t-err">crontab : utilisez -l (lister) ou -e (éditer)</span>'); }
      break;
    }
    case 'apt': {
      const aptCmd = args[0];
      if (aptCmd==='update') {
        termPrint('Réception de :1 http://archive.ubuntu.com/ubuntu jammy InRelease [270 kB]', 'term-output');
        termPrint('<span class="t-green">Lecture des listes de paquets... Fait</span>', 'term-output');
      } else if (aptCmd==='upgrade') {
        termPrint('<span class="t-green">0 mis à jour, 0 nouvellement installés, 0 à enlever et 0 non mis à jour.</span>', 'term-output');
      } else if (aptCmd==='install') {
        const pkg = args[1] || 'paquet';
        termPrint('Lecture des listes de paquets... Fait', 'term-output');
        termPrint('<span class="t-green">0 mis à jour, 1 nouvellement installés. Terminé.</span>', 'term-output');
      } else if (aptCmd==='remove') {
        termPrint('<span class="t-green">Paquet retiré.</span>', 'term-output');
      } else { termPrint('<span class="t-err">apt : commande inconnue : ' + escHtml(aptCmd||'') + '</span>'); }
      break;
    }
    case 'sudo': {
      if (!args[0]) { termPrint('<span class="t-err">sudo : aucune commande spécifiée</span>'); break; }
      processTerminalCommand(args.join(' '));
      break;
    }
    case 'ssh': {
      const hostArg = args.filter(function(a){return !a.startsWith('-');})[0];
      if (!hostArg) { termPrint('<span class="t-err">ssh : hôte manquant</span>'); break; }
      termPrint('<span class="t-yellow">ssh : connexion à ' + escHtml(hostArg) + ' (simulation, non connecté)</span>', 'term-output');
      break;
    }
    case 'dig': {
      let domain = args.filter(function(a){return !a.startsWith('-')&&!a.startsWith('@');})[0] || 'example.com';
      termPrint('; &lt;&lt;&gt;&gt; DiG 9.18.12 &lt;&lt;&gt;&gt; ' + escHtml(domain), 'term-output');
      termPrint(';; ANSWER SECTION:\n' + escHtml(domain) + '.   300  IN  A  93.184.216.34', 'term-output');
      break;
    }
    case 'nslookup': {
      const domain = args[0] || 'example.com';
      termPrint('Server:\t\t8.8.8.8\nAddress:\t8.8.8.8#53\n\nName:\t' + escHtml(domain) + '\nAddress: 93.184.216.34', 'term-output');
      break;
    }
    case 'find': {
      const searchDir = args.filter(function(a){return !a.startsWith('-');})[0] || '.';
      const resolved2 = resolvePath(searchDir);
      termPrint(escHtml(searchDir), 'term-output');
      if (vfs[resolved2] && vfs[resolved2].children) {
        vfs[resolved2].children.forEach(function(c){ termPrint(escHtml(searchDir) + '/' + escHtml(c), 'term-output'); });
      }
      break;
    }
    case 'grep': {
      const nonFlag = args.filter(function(a){return !a.startsWith('-');});
      if (nonFlag.length < 2) { termPrint('<span class="t-muted">(grep : spécifiez un motif et un fichier)</span>'); break; }
      const pattern = nonFlag[0]; const file = nonFlag[1];
      const target = resolvePath(file);
      if (!vfs[target]||!vfs[target].content) { termPrint('<span class="t-err">grep : ' + escHtml(file) + ' : Aucun fichier de ce type</span>'); break; }
      const lines2 = vfs[target].content.split('\n').filter(function(l){return l.toLowerCase().includes(pattern.toLowerCase());});
      if (!lines2.length) break;
      lines2.forEach(function(l){ termPrint(escHtml(l).replace(new RegExp(escHtml(pattern),'gi'), function(m){return '<span class="t-green">'+m+'</span>';}), 'term-output'); });
      break;
    }
    case 'tail': {
      const fileArg2 = args.filter(function(a){return !a.startsWith('-');})[0];
      if (!fileArg2) { termPrint('<span class="t-err">tail : fichier manquant</span>'); break; }
      const t = resolvePath(fileArg2);
      if (!vfs[t]) { termPrint('<span class="t-err">tail : ' + escHtml(fileArg2) + ' : Aucun fichier</span>'); break; }
      (vfs[t].content||'').split('\n').slice(-10).forEach(function(l){termPrint(escHtml(l),'term-output');});
      break;
    }
    case 'head': {
      const fileArg3 = args.filter(function(a){return !a.startsWith('-');})[0];
      if (!fileArg3) { termPrint('<span class="t-err">head : fichier manquant</span>'); break; }
      const t2 = resolvePath(fileArg3);
      if (!vfs[t2]) { termPrint('<span class="t-err">head : ' + escHtml(fileArg3) + ' : Aucun fichier</span>'); break; }
      (vfs[t2].content||'').split('\n').slice(0,10).forEach(function(l){termPrint(escHtml(l),'term-output');});
      break;
    }
    case 'which': {
      const prog = args[0];
      if (!prog) break;
      const known = {bash:'/bin/bash',ls:'/bin/ls',cat:'/bin/cat',echo:'/bin/echo',grep:'/bin/grep',python3:'/usr/bin/python3',node:'/usr/bin/node',git:'/usr/bin/git',docker:'/usr/bin/docker',chmod:'/bin/chmod',chown:'/bin/chown'};
      if (known[prog]) termPrint(known[prog], 'term-output');
      else termPrint('<span class="t-err">' + escHtml(prog) + ' : introuvable</span>');
      break;
    }
    case 'adduser': case 'useradd': {
      const uname = args.filter(function(a){return !a.startsWith('-');})[0];
      if (!uname) { termPrint('<span class="t-err">' + escHtml(cmd) + ' : nom d\'utilisateur manquant</span>'); break; }
      termPrint('Ajout de l\'utilisateur « ' + escHtml(uname) + ' »... <span class="t-green">Terminé.</span>', 'term-output');
      break;
    }
    case 'passwd': {
      termPrint('<span class="t-yellow">Entrez le nouveau mot de passe UNIX :</span>', 'term-output');
      termPrint('<span class="t-green">passwd : mot de passe mis à jour avec succès</span>', 'term-output');
      break;
    }
    case 'groups': termPrint('user : user adm cdrom sudo dip plugdev lxd', 'term-output'); break;
    case 'id': termPrint('uid=1000(user) gid=1000(user) groupes=1000(user),4(adm),27(sudo)', 'term-output'); break;
    case 'top': {
      termPrint('<span class="t-muted">top - ' + new Date().toTimeString().slice(0,8) + ' up 2:14, 1 user, load average: 0.12, 0.08, 0.05</span>', 'term-output');
      termPrint('<span class="t-muted">Tasks: 142 total, 1 running, 141 sleeping</span>', 'term-output');
      termPrint('<span class="t-muted">%Cpu(s): 2.1 us, 0.5 sy, 97.1 id</span>', 'term-output');
      termPrint('<span class="t-muted">  PID USER  PR NI    VIRT    RES    SHR S  %CPU  %MEM COMMAND</span>', 'term-output');
      termPrint('  891 root  20  0   72300   5612   4128 S   0.0   0.3 sshd', 'term-output');
      termPrint(' 1023 user  20  0   10596   5120   4096 S   0.3   0.3 bash', 'term-output');
      termPrint('<span class="t-yellow">(Ctrl+C pour quitter top — simulation)</span>', 'term-output');
      break;
    }
    case 'htop': { termPrint('<span class="t-yellow">htop non disponible en simulation. Utilisez top.</span>', 'term-output'); break; }
    case 'kill': {
      const pid = args.filter(function(a){return !a.startsWith('-');})[0];
      if (!pid) { termPrint('<span class="t-err">kill : PID manquant</span>'); break; }
      termPrint('<span class="t-green">Signal envoyé au processus ' + escHtml(pid) + '.</span>', 'term-output');
      break;
    }
    case 'killall': case 'pkill': {
      const procName = args.filter(function(a){return !a.startsWith('-');})[0];
      if (!procName) { termPrint('<span class="t-err">' + escHtml(cmd) + ' : nom de processus manquant</span>'); break; }
      termPrint('<span class="t-green">Signal envoyé aux processus "' + escHtml(procName) + '".</span>', 'term-output');
      break;
    }
    case 'pgrep': {
      const pname = args.filter(function(a){return !a.startsWith('-');})[0] || '';
      termPrint('891  # ' + escHtml(pname), 'term-output');
      break;
    }
    case 'df': {
      termPrint('<span class="t-muted">Filesystem      1K-blocks    Used Available Use% Mounted on</span>', 'term-output');
      termPrint('/dev/sda1        20971520 8388608  12582912  40% /', 'term-output');
      termPrint('tmpfs             1018976       0   1018976   0% /dev/shm', 'term-output');
      break;
    }
    case 'du': {
      termPrint('4\t./documents', 'term-output'); termPrint('8\t./scripts', 'term-output'); termPrint('0\t./projets', 'term-output'); termPrint('12\t.', 'term-output');
      break;
    }
    case 'free': {
      termPrint('<span class="t-muted">               total        used        free      shared  buff/cache   available</span>', 'term-output');
      termPrint('Mem:         2034804      821044      759880       26504      453880     1040984', 'term-output');
      termPrint('Swap:        2097148           0     2097148', 'term-output');
      break;
    }
    case 'uptime': termPrint(' ' + new Date().toTimeString().slice(0,8) + ' up 2:14, 1 user, load average: 0.12, 0.08, 0.05', 'term-output'); break;
    case 'env': {
      termPrint('USER=user', 'term-output'); termPrint('HOME=/home/user', 'term-output'); termPrint('SHELL=/bin/bash', 'term-output');
      termPrint('PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', 'term-output');
      termPrint('LANG=fr_FR.UTF-8', 'term-output'); termPrint('PWD=' + escHtml(currentDir), 'term-output');
      break;
    }
    case 'jobs': termPrint('<span class="t-muted">(aucun job en arrière-plan)</span>', 'term-output'); break;
    case 'bg': termPrint('<span class="t-muted">Aucun job à mettre en arrière-plan.</span>', 'term-output'); break;
    case 'fg': termPrint('<span class="t-muted">Aucun job à ramener au premier plan.</span>', 'term-output'); break;
    case 'nohup': {
      if (args[0]) { termPrint('nohup: ignoring input and appending output to nohup.out', 'term-output'); processTerminalCommand(args.join(' ')); }
      break;
    }
    case 'traceroute': case 'mtr': {
      const host2 = args.filter(function(a){return !a.startsWith('-');})[0] || 'example.com';
      termPrint('traceroute to ' + escHtml(host2) + ' (93.184.216.34), 30 hops max, 60 byte packets', 'term-output');
      termPrint(' 1  192.168.1.1 (192.168.1.1)  1.234 ms  1.145 ms  1.087 ms', 'term-output');
      termPrint(' 2  10.0.0.1 (10.0.0.1)  8.432 ms  8.312 ms  8.201 ms', 'term-output');
      termPrint(' 3  ' + escHtml(host2) + ' (93.184.216.34)  22.543 ms  21.987 ms  22.123 ms', 'term-output');
      break;
    }
    case 'lsof': {
      termPrint('<span class="t-muted">COMMAND   PID   USER   FD   TYPE  DEVICE SIZE/OFF NODE NAME</span>', 'term-output');
      termPrint('sshd      891   root   3u  IPv4   12345      0t0  TCP *:ssh (LISTEN)', 'term-output');
      termPrint('bash     1023   user  cwd    DIR     8,1     4096    2 ' + escHtml(currentDir), 'term-output');
      break;
    }
    case 'ssh-keygen': {
      termPrint('Generating public/private ed25519 key pair.', 'term-output');
      termPrint('Enter file in which to save the key (/home/user/.ssh/id_ed25519):', 'term-output');
      termPrint('Your identification has been saved in /home/user/.ssh/id_ed25519', 'term-output');
      termPrint('Your public key has been saved in /home/user/.ssh/id_ed25519.pub', 'term-output');
      termPrint('<span class="t-green">Clé SSH générée avec succès (simulation).</span>', 'term-output');
      break;
    }
    case 'scp': { termPrint('<span class="t-yellow">scp : transfert simulé. (non connecté au réseau réel)</span>', 'term-output'); break; }
    case 'nano': case 'vim': case 'vi': case 'emacs': {
      termPrint('<span class="t-yellow">' + escHtml(cmd) + ' n\'est pas disponible dans ce terminal simulé. Utilisez touch pour créer des fichiers.</span>', 'term-output');
      break;
    }
    case 'wc': termPrint('<span class="t-muted">wc : spécifiez un fichier (ex: wc -l fichier.txt)</span>', 'term-output'); break;
    case 'sort': termPrint('<span class="t-muted">sort : spécifiez un fichier à trier</span>', 'term-output'); break;
    case 'uniq': termPrint('<span class="t-muted">uniq : supprime les doublons consécutifs</span>', 'term-output'); break;
    case 'source': case '.': { termPrint('<span class="t-yellow">Sourcing ' + escHtml(args[0]||'') + '... (simulation)</span>', 'term-output'); break; }
    case 'export': { termPrint('<span class="t-muted">Variable exportée (simulation).</span>', 'term-output'); break; }
    case 'alias': { termPrint('<span class="t-muted">alias ll=\'ls -la\'\nalias gs=\'git status\'</span>', 'term-output'); break; }
    case 'git': {
      const gitSub = args[0];
      const gitArgs = args.slice(1);
      if (!gitSub) { termPrint('<span class="t-err">git : sous-commande manquante. Essayez : git init, git status, git add, git commit, git log, git branch, git push, git pull</span>'); break; }
      if (gitSub === 'init') {
        vfs[currentDir + '/.git'] = { type: 'dir', children: [] };
        termPrint('<span class="t-green">Dépôt Git vide initialisé dans ' + escHtml(currentDir) + '/.git/</span>', 'term-output');
      } else if (gitSub === 'status') {
        termPrint('<span class="t-green">Sur la branche main</span>', 'term-output');
        termPrint('', 'term-output');
        termPrint('<span class="t-muted">Rien à valider, la copie de travail est propre.</span>', 'term-output');
      } else if (gitSub === 'add') {
        const addArg = gitArgs[0] || '.';
        termPrint('<span class="t-muted">git add ' + escHtml(addArg) + ' — fichiers ajoutés à l\'index (simulation)</span>', 'term-output');
      } else if (gitSub === 'commit') {
        const msgIdx = gitArgs.indexOf('-m');
        const commitMsg = msgIdx >= 0 && gitArgs[msgIdx+1] ? gitArgs[msgIdx+1] : 'commit';
        termPrint('[main ' + Math.random().toString(16).slice(2,9) + '] ' + escHtml(commitMsg), 'term-output');
        termPrint(' 1 file changed, 1 insertion(+)', 'term-output');
      } else if (gitSub === 'log') {
        termPrint('<span class="t-yellow">commit 3a7f2c1b8e9d4f5a6c7b8e9d (HEAD -&gt; main)</span>', 'term-output');
        termPrint('Author: User &lt;user@example.com&gt;', 'term-output');
        termPrint('Date:   ' + new Date().toDateString(), 'term-output');
        termPrint('', 'term-output');
        termPrint('    feat: initial commit', 'term-output');
      } else if (gitSub === 'branch') {
        if (gitArgs[0] && !gitArgs[0].startsWith('-')) {
          termPrint('<span class="t-green">Branche « ' + escHtml(gitArgs[0]) + ' » créée.</span>', 'term-output');
        } else {
          termPrint('* <span class="t-green">main</span>', 'term-output');
          termPrint('  develop', 'term-output');
        }
      } else if (gitSub === 'checkout') {
        if (gitArgs.includes('-b') || gitArgs.includes('-B')) {
          const bname = gitArgs.filter(function(a){return !a.startsWith('-');})[0] || 'nouvelle-branche';
          termPrint('Basculement sur la nouvelle branche « ' + escHtml(bname) + ' »', 'term-output');
        } else {
          const bname2 = gitArgs[0] || 'main';
          termPrint('Basculement sur la branche « ' + escHtml(bname2) + ' »', 'term-output');
        }
      } else if (gitSub === 'switch') {
        const switchBranch = gitArgs.filter(function(a){return !a.startsWith('-');})[0] || 'main';
        const isCreate = gitArgs.includes('-c') || gitArgs.includes('-C');
        if (isCreate) termPrint('Basculement sur la nouvelle branche « ' + escHtml(switchBranch) + ' »', 'term-output');
        else termPrint('Basculement sur la branche « ' + escHtml(switchBranch) + ' »', 'term-output');
      } else if (gitSub === 'merge') {
        const mergeBranch = gitArgs[0] || 'feature';
        termPrint('Merge made by the \'ort\' strategy.', 'term-output');
        termPrint('<span class="t-green"> 1 file changed, 5 insertions(+)</span>', 'term-output');
      } else if (gitSub === 'remote') {
        if (gitArgs[0] === 'add') {
          termPrint('<span class="t-green">Remote « ' + escHtml(gitArgs[1]||'origin') + ' » ajouté.</span>', 'term-output');
        } else if (gitArgs[0] === '-v' || gitArgs[0] === 'show') {
          termPrint('origin  https://github.com/user/repo.git (fetch)', 'term-output');
          termPrint('origin  https://github.com/user/repo.git (push)', 'term-output');
        }
      } else if (gitSub === 'push') {
        termPrint('Décompte des objets: 3, fait.', 'term-output');
        termPrint('<span class="t-green">To https://github.com/user/repo.git</span>', 'term-output');
        termPrint('   3a7f2c1..9b4e8f2  main -&gt; main', 'term-output');
      } else if (gitSub === 'pull') {
        termPrint('Already up to date.', 'term-output');
      } else if (gitSub === 'fetch') {
        termPrint('<span class="t-muted">Récupération de origin...</span>', 'term-output');
      } else if (gitSub === 'stash') {
        if (gitArgs[0] === 'pop') termPrint('<span class="t-green">Modifications restaurées depuis le stash.</span>', 'term-output');
        else if (gitArgs[0] === 'list') termPrint('stash@{0}: WIP on main: 3a7f2c1 feat: initial commit', 'term-output');
        else termPrint('<span class="t-green">Modifications remisées dans le stash.</span>', 'term-output');
      } else if (gitSub === 'diff') {
        termPrint('<span class="t-muted">diff --git a/fichier.txt b/fichier.txt</span>', 'term-output');
        termPrint('<span class="t-green">+++ b/fichier.txt</span>', 'term-output');
        termPrint('<span class="t-green">+nouvelle ligne ajoutée</span>', 'term-output');
      } else if (gitSub === 'rebase') {
        termPrint('<span class="t-green">Rebase effectué avec succès (simulation).</span>', 'term-output');
      } else if (gitSub === 'reset') {
        termPrint('<span class="t-yellow">Reset effectué (simulation).</span>', 'term-output');
      } else if (gitSub === 'tag') {
        const tagName = gitArgs.filter(function(a){return !a.startsWith('-');})[0] || 'v1.0.0';
        termPrint('<span class="t-green">Tag « ' + escHtml(tagName) + ' » créé.</span>', 'term-output');
      } else if (gitSub === 'clone') {
        const cloneUrl = gitArgs[0] || 'https://github.com/user/repo.git';
        const repoName = cloneUrl.split('/').pop().replace('.git','') || 'repo';
        termPrint('Clonage dans « ' + escHtml(repoName) + ' »...', 'term-output');
        termPrint('<span class="t-green">Dépôt cloné avec succès.</span>', 'term-output');
      } else if (gitSub === 'config') {
        termPrint('<span class="t-muted">Configuration Git mise à jour (simulation).</span>', 'term-output');
      } else {
        termPrint('<span class="t-err">git: « ' + escHtml(gitSub) + ' » n\'est pas une commande git connue</span>');
      }
      break;
    }
    case 'docker': {
      const dockerSub = args[0];
      const dockerArgs = args.slice(1);
      if (!dockerSub) { termPrint('<span class="t-err">docker : sous-commande manquante. Essayez : docker ps, docker images, docker pull, docker run, docker stop, docker rm</span>'); break; }
      if (dockerSub === 'version') {
        termPrint('Client: Docker Engine - Community', 'term-output');
        termPrint(' Version:           24.0.5', 'term-output');
        termPrint('Server: Docker Engine - Community', 'term-output');
        termPrint(' Engine: Version:   24.0.5', 'term-output');
      } else if (dockerSub === 'info') {
        termPrint('Containers: 2', 'term-output');
        termPrint(' Running: 1', 'term-output');
        termPrint(' Stopped: 1', 'term-output');
        termPrint('Images: 5', 'term-output');
        termPrint('Server Version: 24.0.5', 'term-output');
        termPrint('Storage Driver: overlay2', 'term-output');
      } else if (dockerSub === 'ps') {
        if (dockerArgs.includes('-a')) {
          termPrint('<span class="t-muted">CONTAINER ID   IMAGE     COMMAND   CREATED       STATUS                   NAMES</span>', 'term-output');
          termPrint('a1b2c3d4e5f6   nginx     "nginx"   5 min ago     Up 5 minutes             webserver', 'term-output');
          termPrint('b2c3d4e5f6a7   ubuntu    "bash"    10 min ago    Exited (0) 8 minutes ago  stoppe', 'term-output');
        } else {
          termPrint('<span class="t-muted">CONTAINER ID   IMAGE   COMMAND   CREATED      STATUS       PORTS     NAMES</span>', 'term-output');
          termPrint('a1b2c3d4e5f6   nginx   "nginx"   5 min ago    Up 5 min     80/tcp    webserver', 'term-output');
        }
      } else if (dockerSub === 'images') {
        termPrint('<span class="t-muted">REPOSITORY   TAG       IMAGE ID       CREATED        SIZE</span>', 'term-output');
        termPrint('ubuntu       22.04     174c8c134b2a   2 weeks ago    77.9MB', 'term-output');
        termPrint('nginx        latest    a6bd71f48f68   3 weeks ago    187MB', 'term-output');
        termPrint('python       3.11      8c4f3b2e9a1d   1 month ago    920MB', 'term-output');
      } else if (dockerSub === 'pull') {
        const pullImg = dockerArgs[0] || 'ubuntu';
        termPrint('Pulling from library/' + escHtml(pullImg.split(':')[0]), 'term-output');
        termPrint('<span class="t-green">Status: Downloaded newer image for ' + escHtml(pullImg) + '</span>', 'term-output');
      } else if (dockerSub === 'run') {
        const runImg = dockerArgs.filter(function(a){return !a.startsWith('-');})[0] || 'ubuntu';
        const runCmd = dockerArgs.filter(function(a){return !a.startsWith('-');}).slice(1).join(' ');
        if (dockerArgs.includes('-d')) {
          termPrint('<span class="t-green">a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0</span>', 'term-output');
        } else if (dockerArgs.includes('-it') || (dockerArgs.includes('-i') && dockerArgs.includes('-t'))) {
          termPrint('<span class="t-yellow">Conteneur ' + escHtml(runImg) + ' démarré en mode interactif (simulation).</span>', 'term-output');
          termPrint('<span class="t-muted">root@a1b2c3d4:/#</span> exit', 'term-output');
        } else if (runCmd) {
          termPrint(escHtml(runCmd), 'term-output');
        } else {
          termPrint('<span class="t-green">Conteneur démarré depuis l\'image ' + escHtml(runImg) + '.</span>', 'term-output');
        }
      } else if (dockerSub === 'stop') {
        const stopId = dockerArgs[0] || 'container_id';
        termPrint(escHtml(stopId), 'term-output');
      } else if (dockerSub === 'rm') {
        const rmId = dockerArgs[0] || 'container_id';
        termPrint(escHtml(rmId), 'term-output');
      } else if (dockerSub === 'rmi') {
        const rmiImg = dockerArgs[0] || 'image_id';
        termPrint('<span class="t-green">Image ' + escHtml(rmiImg) + ' supprimée.</span>', 'term-output');
      } else if (dockerSub === 'build') {
        termPrint('Step 1/4 : FROM ubuntu:22.04', 'term-output');
        termPrint('Step 2/4 : RUN apt-get update', 'term-output');
        termPrint('Step 3/4 : COPY . .', 'term-output');
        termPrint('Step 4/4 : CMD ["/bin/bash"]', 'term-output');
        termPrint('<span class="t-green">Successfully built 9f8e7d6c5b4a</span>', 'term-output');
        const tagArg = dockerArgs.filter(function(a){return !a.startsWith('-');}).find(function(a){return !a.startsWith('.');});
        if (tagArg) termPrint('<span class="t-green">Successfully tagged ' + escHtml(tagArg) + '</span>', 'term-output');
      } else if (dockerSub === 'tag') {
        termPrint('<span class="t-green">Image taguée avec succès.</span>', 'term-output');
      } else if (dockerSub === 'logs') {
        const logsId = dockerArgs.filter(function(a){return !a.startsWith('-');})[0] || 'container_id';
        termPrint('<span class="t-muted">Logs du conteneur ' + escHtml(logsId) + ' :</span>', 'term-output');
        termPrint('2024-01-15 10:00:01 INFO  Démarrage du serveur...', 'term-output');
        termPrint('2024-01-15 10:00:02 INFO  Écoute sur le port 80', 'term-output');
      } else if (dockerSub === 'exec') {
        termPrint('<span class="t-yellow">docker exec : exécution dans le conteneur (simulation).</span>', 'term-output');
      } else if (dockerSub === 'volume') {
        if (dockerArgs[0] === 'create') termPrint('<span class="t-green">Volume créé : ' + escHtml(dockerArgs[1]||'myvolume') + '</span>', 'term-output');
        else if (dockerArgs[0] === 'ls') {
          termPrint('<span class="t-muted">DRIVER    VOLUME NAME</span>', 'term-output');
          termPrint('local     mydata', 'term-output');
        } else termPrint('<span class="t-muted">docker volume : utilisez create ou ls</span>', 'term-output');
      } else if (dockerSub === 'network') {
        if (dockerArgs[0] === 'ls') {
          termPrint('<span class="t-muted">NETWORK ID     NAME      DRIVER    SCOPE</span>', 'term-output');
          termPrint('abc123456789   bridge    bridge    local', 'term-output');
          termPrint('def456789012   host      host      local', 'term-output');
          termPrint('ghi789012345   none      null      local', 'term-output');
        } else if (dockerArgs[0] === 'create') {
          termPrint('<span class="t-green">Réseau créé : ' + escHtml(dockerArgs[1]||'monreseau') + '</span>', 'term-output');
        } else termPrint('<span class="t-muted">docker network : utilisez ls ou create</span>', 'term-output');
      } else if (dockerSub === 'compose') {
        const composeSub = dockerArgs[0];
        if (composeSub === 'up') {
          termPrint('Creating network "app_default" with the default driver', 'term-output');
          termPrint('<span class="t-green">Creating app_db_1  ... done</span>', 'term-output');
          termPrint('<span class="t-green">Creating app_web_1 ... done</span>', 'term-output');
        } else if (composeSub === 'down') {
          termPrint('<span class="t-green">Stopping app_web_1 ... done</span>', 'term-output');
          termPrint('<span class="t-green">Stopping app_db_1  ... done</span>', 'term-output');
          termPrint('<span class="t-green">Removing network app_default</span>', 'term-output');
        } else if (composeSub === 'logs') {
          termPrint('<span class="t-muted">Attaching to app_web_1, app_db_1</span>', 'term-output');
          termPrint('web_1  | 2024-01-15 10:00:01 INFO Server started', 'term-output');
          termPrint('db_1   | 2024-01-15 10:00:00 INFO PostgreSQL 15 ready', 'term-output');
        } else if (composeSub === 'ps') {
          termPrint('<span class="t-muted">NAME        SERVICE   STATUS    PORTS</span>', 'term-output');
          termPrint('app_web_1   web       running   0.0.0.0:8080->5000/tcp', 'term-output');
          termPrint('app_db_1    db        running   5432/tcp', 'term-output');
        } else {
          termPrint('<span class="t-muted">docker compose : up, down, logs, ps, exec</span>', 'term-output');
        }
      } else {
        termPrint('<span class="t-err">docker: « ' + escHtml(dockerSub) + ' » n\'est pas une commande Docker connue</span>');
      }
      break;
    }
    case 'help': {
      termPrint('<div class="help-grid">'
        + '<div class="help-section"><strong>Navigation</strong><br>'
        + '<span class="t-blue">pwd</span> — répertoire courant<br>'
        + '<span class="t-blue">ls [-la]</span> — lister fichiers<br>'
        + '<span class="t-blue">cd [dir]</span> — changer répertoire</div>'
        + '<div class="help-section"><strong>Fichiers</strong><br>'
        + '<span class="t-blue">touch [f]</span> — créer fichier<br>'
        + '<span class="t-blue">mkdir [d]</span> — créer dossier<br>'
        + '<span class="t-blue">cat [f]</span> — afficher contenu<br>'
        + '<span class="t-blue">rm [-r] [f]</span> — supprimer<br>'
        + '<span class="t-blue">cp/mv src dst</span> — copier/déplacer</div>'
        + '<div class="help-section"><strong>Système</strong><br>'
        + '<span class="t-blue">whoami</span> — utilisateur<br>'
        + '<span class="t-blue">uname -a</span> — infos système<br>'
        + '<span class="t-blue">ps [aux]</span> — processus<br>'
        + '<span class="t-blue">top</span> — moniteur système<br>'
        + '<span class="t-blue">kill [pid]</span> — tuer processus</div>'
        + '<div class="help-section"><strong>Réseau</strong><br>'
        + '<span class="t-blue">ping [host]</span> — tester connectivité<br>'
        + '<span class="t-blue">ip addr</span> — interfaces réseau<br>'
        + '<span class="t-blue">curl/wget [url]</span> — télécharger<br>'
        + '<span class="t-blue">ss</span> — ports ouverts</div>'
        + '<div class="help-section"><strong>Permissions</strong><br>'
        + '<span class="t-blue">chmod [mode] [f]</span> — permissions<br>'
        + '<span class="t-blue">chown user [f]</span> — propriétaire</div>'
        + '<div class="help-section"><strong>Divers</strong><br>'
        + '<span class="t-blue">echo [texte]</span> — afficher texte<br>'
        + '<span class="t-blue">date</span> — date/heure<br>'
        + '<span class="t-blue">history</span> — historique<br>'
        + '<span class="t-blue">man [cmd]</span> — aide commande<br>'
        + '<span class="t-blue">clear</span> — vider terminal</div>'
        + '</div>', 'term-output');
      break;
    }
    default: {
      termPrint('<span class="t-err">bash: ' + escHtml(cmd) + ': commande introuvable</span>');
      break;
    }
  }
  updatePromptLabel();
}

function handleLs(args) {
  const longFormat = args.some(function(a){ return a.match(/^-[a-zA-Z]*l/); });
  const showHidden = args.some(function(a){ return a.match(/^-[a-zA-Z]*a/); });
  const fileArg = args.filter(function(a){ return !a.startsWith('-'); })[0];
  const targetDir = fileArg ? resolvePath(fileArg) : currentDir;
  const singleFile = fileArg && vfs[targetDir] && vfs[targetDir].type === 'file';

  if (!vfs[targetDir]) {
    termPrint('<span class="t-err">ls : impossible d\'accéder à \'' + escHtml(fileArg) + '\': Aucun fichier ou dossier de ce type</span>');
    return;
  }

  let items = [];
  if (singleFile) {
    items = [{ name: fileArg.split('/').pop(), node: vfs[targetDir] }];
  } else {
    const children = (vfs[targetDir].children || []);
    items = children.map(function(name) {
      const nodePath = (targetDir === '/' ? '' : targetDir) + '/' + name;
      return { name: name, node: vfs[nodePath] || { type: 'file' } };
    });
    if (showHidden) {
      items = [{ name: '.', node: { type: 'dir' } }, { name: '..', node: { type: 'dir' } }].concat(items);
    } else {
      items = items.filter(function(it){ return !it.name.startsWith('.'); });
    }
  }

  if (longFormat) {
    termPrint('<span class="t-muted">total ' + (items.length * 4) + '</span>', 'term-output');
    items.forEach(function(item) {
      let isDir = item.node && item.node.type === 'dir';
      const perm = item.node && item.node.perms ? item.node.perms : (isDir ? 'drwxr-xr-x' : '-rw-r--r--');
      const size = isDir ? '  4096' : String((item.node && item.node.content ? item.node.content.length : 0) + 128).padStart(6);
      const nameHtml = isDir ? '<span class="ls-dir">' + escHtml(item.name) + '/</span>'
        : item.name.endsWith('.sh') ? '<span class="ls-exec">' + escHtml(item.name) + '</span>'
        : item.name.startsWith('.') ? '<span class="ls-hidden">' + escHtml(item.name) + '</span>'
        : '<span class="ls-file">' + escHtml(item.name) + '</span>';
      termPrint(escHtml(perm) + ' 1 user user ' + size + ' Dec 15 10:23 ' + nameHtml, 'term-output ls-line');
    });
  } else {
    const parts2 = items.map(function(item) {
      const isDir = item.node && item.node.type === 'dir';
      if (isDir) return '<span class="ls-dir">' + escHtml(item.name) + '</span>';
      if (item.name.endsWith('.sh')) return '<span class="ls-exec">' + escHtml(item.name) + '</span>';
      if (item.name.startsWith('.')) return '<span class="ls-hidden">' + escHtml(item.name) + '</span>';
      return '<span class="ls-file">' + escHtml(item.name) + '</span>';
    });
    termPrint(parts2.join('  '), 'term-output');
  }
}

function handleCd(args) {
  const target = args[0];
  if (!target || target === '~' || target === '') {
    prevDir = currentDir; currentDir = '/home/user'; return;
  }
  if (target === '-') {
    if (prevDir) { const tmp = currentDir; currentDir = prevDir; prevDir = tmp; termPrint(escHtml(currentDir), 'term-output'); }
    return;
  }
  const resolved = resolvePath(target);
  if (!vfs[resolved]) { termPrint('<span class="t-err">bash: cd: ' + escHtml(target) + ': Aucun fichier ou dossier de ce type</span>'); return; }
  if (vfs[resolved].type !== 'dir') { termPrint('<span class="t-err">bash: cd: ' + escHtml(target) + ': N\'est pas un répertoire</span>'); return; }
  prevDir = currentDir;
  currentDir = resolved;
}

/* ============================================================
   INIT
   ============================================================ */
function initTerminal() {
  const input = document.getElementById('terminal-input');
  if (!input) return;

  // Sur mobile : terminal minimisé par défaut avec icône ▲
  if (window.innerWidth <= 700) {
    const sec = document.getElementById('terminal-section');
    const icon = document.getElementById('term-toggle-icon');
    if (sec) sec.classList.add('minimized');
    if (icon) icon.textContent = '▲';
  }

  termPrint('<span class="t-green">Linux Trainer Terminal v1.0 — Tapez <strong>help</strong> pour la liste des commandes.</span>', 'term-output');
  termPrint('<span class="t-muted">Répertoire courant : ' + escHtml(currentDir) + '</span>', 'term-output');

  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      const val = input.value.trim();
      if (val) { processTerminalCommand(val); input.value = ''; historyIdx = cmdHistory.length; }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (historyIdx > 0) { historyIdx--; input.value = cmdHistory[historyIdx] || ''; }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIdx < cmdHistory.length - 1) { historyIdx++; input.value = cmdHistory[historyIdx] || ''; }
      else { historyIdx = cmdHistory.length; input.value = ''; }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const val2 = input.value;
      const parts = val2.split(/\s+/);
      if (parts.length >= 2) {
        const partial = parts[parts.length-1];
        const node = vfs[currentDir];
        if (node && node.children) {
          const matches = node.children.filter(function(c){ return c.startsWith(partial); });
          if (matches.length === 1) { parts[parts.length-1] = matches[0]; input.value = parts.join(' ') + ' '; }
          else if (matches.length > 1) { termCommand(val2); termPrint(matches.join('  '), 'term-output'); }
        }
      }
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault();
      const out2 = document.getElementById('terminal-output');
      if (out2) out2.innerHTML = '';
    }
  });

  const termSection2 = document.getElementById('terminal-section');
  if (termSection2) {
    termSection2.addEventListener('click', function(e) {
      if (!e.target.closest('.terminal-titlebar')) input.focus();
    });
  }
}

async function init() {
  // Load data files and state concurrently
  let dataOk = true;
  try {
    const [lessonsResp, exercisesResp, quizzesResp] = await Promise.all([
      fetch('data/lessons.json'),
      fetch('data/exercises.json'),
      fetch('data/quizzes.json')
    ]);
    if (!lessonsResp.ok || !exercisesResp.ok || !quizzesResp.ok) throw new Error('Fetch failed');
    LESSONS   = await lessonsResp.json();
    EXERCISES = await exercisesResp.json();
    QUIZZES   = await quizzesResp.json();
    // CTF chargé séparément — ne bloque pas l'appli si absent
    try {
      const ctfResp = await fetch('data/ctf.json');
      if (ctfResp.ok) {
        const ctfData = await ctfResp.json();
        CTF_CHALLENGES = ctfData.challenges || [];
      }
    } catch(e) { /* ctf.json absent ou invalide — la section CTF restera vide */ }
  } catch (err) {
    dataOk = false;
    showAppError(
      'Impossible de charger les données du cours',
      'Les fichiers data/*.json sont inaccessibles. Servez le site via un serveur HTTP (pas en ouvrant le fichier directement).',
      () => location.reload()
    );
  }
  if (!dataOk) return;

  await loadState();
  await loadCTFState();
  updateCTFBadge();
  renderLessons();
  renderExercises();
  renderQuizzes();
  renderOverviewCards();
  updateProgressUI();
  renderHome();
  initTerminal();
  // News chargées indépendamment — ne bloque pas l'appli si absent
  loadNews();
}

/* ============================================================
   SANDBOX — Avertissement mobile
   ============================================================ */

/**
 * Affiche ou masque l'avertissement sandbox selon la taille d'écran.
 * Seuil : 768px (breakpoint tablette/desktop standard).
 */
function updateSandboxMobileWarning() {
  const el = document.getElementById('sandbox-mobile-warning');
  if (!el) return;
  const isMobile = window.innerWidth < 768;
  el.style.display = isMobile ? '' : 'none';
}

// Affichage initial + mise à jour au redimensionnement
document.addEventListener('DOMContentLoaded', updateSandboxMobileWarning);
window.addEventListener('resize', updateSandboxMobileWarning);


/* ============================================================
   CTF CHALLENGES
   ============================================================ */

let CTF_CHALLENGES = [];   // chargé depuis data/ctf.json
let ctfCurrentId   = null; // id du challenge ouvert

/* --- State CTF --- */
// Clés IndexedDB / localStorage
const CTF_STORAGE_KEYS = {
  solved: 'lt_ctf_solved',  // Set des ids résolus
  hints:  'lt_ctf_hints'    // { id: nbIndicesAffichés }
};

let ctfState = {
  solved: new Set(),
  hints:  {}
};

async function saveCTFState() {
  await Promise.all([
    storage.set(CTF_STORAGE_KEYS.solved, JSON.stringify([...ctfState.solved])),
    storage.set(CTF_STORAGE_KEYS.hints,  JSON.stringify(ctfState.hints))
  ]);
}

async function loadCTFState() {
  try {
    const [sv, hi] = await Promise.all([
      storage.get(CTF_STORAGE_KEYS.solved),
      storage.get(CTF_STORAGE_KEYS.hints)
    ]);
    if (sv) ctfState.solved = new Set(JSON.parse(sv));
    if (hi) ctfState.hints  = JSON.parse(hi);
  } catch(e) { /* état par défaut */ }
}

/* --- SHA-256 via Web Crypto API --- */
async function sha256hex(str) {
  const buf  = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

/* --- Normalisation du flag soumis --- */
function normalizeFlag(raw) {
  return raw.trim().toLowerCase();
}

/* --- Mise à jour du badge sidebar CTF --- */
function updateCTFBadge() {
  const badge = document.getElementById('nav-badge-ctf');
  if (badge) badge.textContent = ctfState.solved.size + '/6';
}

/* --- Rendu de la grille des cards --- */
function renderCTFGrid() {
  const grid = document.getElementById('ctf-grid');
  if (!grid || !CTF_CHALLENGES.length) return;
  grid.innerHTML = '';

  const diffLabels = { easy: 'Facile', medium: 'Moyen', hard: 'Difficile' };
  const diffClasses = { easy: 'ctf-diff-easy', medium: 'ctf-diff-medium', hard: 'ctf-diff-hard' };

  CTF_CHALLENGES.forEach(function(ch) {
    const solved = ctfState.solved.has(ch.id);
    const card = document.createElement('div');
    card.className = 'ctf-card' + (solved ? ' solved' : '');
    card.id = 'ctf-card-' + ch.id;
    card.innerHTML =
      '<div class="ctf-card-top">'
      + '<span class="ctf-card-title">' + escHtml(ch.title) + '</span>'
      + '<span class="ctf-difficulty-badge ' + diffClasses[ch.difficulty] + '">' + (diffLabels[ch.difficulty] || ch.difficulty) + '</span>'
      + '</div>'
      + '<p class="ctf-card-desc">' + ch.context.replace(/<[^>]+>/g, '').slice(0, 100) + '…</p>'
      + '<div class="ctf-card-footer">'
      + '<span class="ctf-status-badge' + (solved ? ' solved' : '') + '">'
      + (solved ? '✓ Résolu' : '○ Non résolu')
      + '</span>'
      + '<button class="ctf-card-btn" onclick="openCTFChallenge(\'' + ch.id + '\')">'
      + (solved ? '↺ Rejouer' : '▶ Relever le défi')
      + '</button>'
      + '</div>';
    grid.appendChild(card);
  });
}

/* --- Ouvrir un challenge --- */
function openCTFChallenge(id) {
  const ch = CTF_CHALLENGES.find(function(c){ return c.id === id; });
  if (!ch) return;
  ctfCurrentId = id;

  // Masquer la grille, afficher le détail
  document.getElementById('ctf-grid').style.display  = 'none';
  document.getElementById('ctf-detail').style.display = '';

  // Remplir l'en-tête
  const diffLabels  = { easy: 'Facile', medium: 'Moyen', hard: 'Difficile' };
  const diffClasses = { easy: 'ctf-diff-easy', medium: 'ctf-diff-medium', hard: 'ctf-diff-hard' };
  document.getElementById('ctf-detail-title').textContent = ch.title;
  const diffBadge = document.getElementById('ctf-detail-diff');
  diffBadge.textContent  = diffLabels[ch.difficulty] || ch.difficulty;
  diffBadge.className    = 'ctf-difficulty-badge ' + (diffClasses[ch.difficulty] || '');

  document.getElementById('ctf-context-box').innerHTML   = ch.context;
  document.getElementById('ctf-objective-box').innerHTML = '<strong>Objectif :</strong> ' + ch.objective;

  // Champ flag et feedback
  const flagInput    = document.getElementById('ctf-flag-input');
  const flagFeedback = document.getElementById('ctf-flag-feedback');
  flagInput.value    = '';
  flagInput.disabled = false;
  flagFeedback.className   = 'ctf-flag-feedback';
  flagFeedback.textContent = '';

  if (ctfState.solved.has(id)) {
    flagInput.value    = '✓ Challenge résolu !';
    flagInput.disabled = true;
    flagFeedback.className   = 'ctf-flag-feedback success';
    flagFeedback.textContent = '🎉 Tu as déjà résolu ce challenge. Bravo !';
  }

  // Indices
  renderCTFHints(ch);

  // Initialiser le terminal CTF
  loadCTFChallenge(id);
}

/* --- Fermer le détail, retourner à la grille --- */
function closeCTFDetail() {
  document.getElementById('ctf-detail').style.display = 'none';
  document.getElementById('ctf-grid').style.display   = '';
  ctfCurrentId = null;
  // Rafraîchir la grille (statuts résolus)
  renderCTFGrid();
}

/* --- Terminal CTF isolé --- */
let ctfVfs         = {};
let ctfCurrentDir  = '/home/user';
let ctfPrevDir     = null;
let ctfCmdHistory  = [];
let ctfHistoryIdx  = -1;
let ctfTermInited  = false;

function ctfTermOutput(html, cls) {
  const out = document.getElementById('ctf-terminal-output');
  if (!out) return;
  const line = document.createElement('div');
  line.className = 'term-line' + (cls ? ' ' + cls : '');
  line.innerHTML = html;
  out.appendChild(line);
  out.scrollTop = out.scrollHeight;
}

function ctfTermCmdEcho(cmd) {
  const out = document.getElementById('ctf-terminal-output');
  if (!out) return;
  const line = document.createElement('div');
  line.className = 'term-line term-cmd-echo';
  line.innerHTML = ctfPromptStr() + ' <span class="t-input">' + escHtml(cmd) + '</span>';
  out.appendChild(line);
  out.scrollTop = out.scrollHeight;
}

function ctfPromptStr() {
  const display = ctfCurrentDir.replace('/home/user', '~');
  return '<span style="color:var(--accent-red)">ctf@challenge</span><span class="t-sep">:</span><span class="t-dir">' + display + '</span><span class="t-dollar">$</span>';
}

function updateCTFPromptLabel() {
  const label = document.getElementById('ctf-terminal-prompt');
  if (!label) return;
  const display = ctfCurrentDir.replace('/home/user', '~');
  label.innerHTML = '<span style="color:var(--accent-red)">ctf@challenge</span><span class="t-sep">:</span><span class="t-dir">' + display + '</span><span class="t-dollar">$</span>';
}

function ctfResolvePath(path) {
  if (!path || path === '~') return '/home/user';
  if (path === '-') return ctfPrevDir || ctfCurrentDir;
  if (path.startsWith('~/')) return '/home/user' + path.slice(1);
  if (!path.startsWith('/')) {
    const base = ctfCurrentDir === '/' ? '' : ctfCurrentDir;
    path = base + '/' + path;
  }
  const parts = path.split('/').filter(Boolean);
  const resolved = [];
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === '..') resolved.pop();
    else if (parts[i] !== '.') resolved.push(parts[i]);
  }
  return '/' + resolved.join('/');
}

function loadCTFChallenge(id) {
  const ch = CTF_CHALLENGES.find(function(c){ return c.id === id; });
  if (!ch) return;

  // Cloner le vfs du challenge (isolation totale)
  ctfVfs        = JSON.parse(JSON.stringify(ch.vfs));
  ctfCurrentDir = '/home/user';
  ctfPrevDir    = null;
  ctfCmdHistory = [];
  ctfHistoryIdx = -1;

  // Vider et réinitialiser le terminal
  const out = document.getElementById('ctf-terminal-output');
  if (out) out.innerHTML = '';
  updateCTFPromptLabel();

  const titleEl = document.getElementById('ctf-terminal-title');
  if (titleEl) titleEl.textContent = 'ctf@challenge:~$ — ' + ch.title;

  ctfTermOutput('<span style="color:var(--accent-red)">CTF Challenge : ' + escHtml(ch.title) + '</span>', 'term-output');
  ctfTermOutput('<span class="t-muted">Tape <strong>help</strong> pour les commandes disponibles. Bonne chance !</span>', 'term-output');
  ctfTermOutput('', 'term-output');

  // Attacher l'écouteur une seule fois
  if (!ctfTermInited) {
    initCTFTerminalInput();
    ctfTermInited = true;
  }

  const input = document.getElementById('ctf-terminal-input');
  if (input) { input.value = ''; input.focus(); }
}

function resetCTFTerminal() {
  if (ctfCurrentId) {
    ctfTermInited = false; // forcer re-init propre
    loadCTFChallenge(ctfCurrentId);
  }
}

function initCTFTerminalInput() {
  const input = document.getElementById('ctf-terminal-input');
  if (!input) return;

  // Supprimer les anciens listeners en clonant le nœud
  const fresh = input.cloneNode(true);
  input.parentNode.replaceChild(fresh, input);

  fresh.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      const val = fresh.value.trim();
      if (val) { processCTFCommand(val); fresh.value = ''; ctfHistoryIdx = ctfCmdHistory.length; }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (ctfHistoryIdx > 0) { ctfHistoryIdx--; fresh.value = ctfCmdHistory[ctfHistoryIdx] || ''; }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (ctfHistoryIdx < ctfCmdHistory.length - 1) { ctfHistoryIdx++; fresh.value = ctfCmdHistory[ctfHistoryIdx] || ''; }
      else { ctfHistoryIdx = ctfCmdHistory.length; fresh.value = ''; }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const val2  = fresh.value;
      const parts = val2.split(/\s+/);
      if (parts.length >= 2) {
        const partial = parts[parts.length - 1];
        const node    = ctfVfs[ctfCurrentDir];
        if (node && node.children) {
          const matches = node.children.filter(function(c){ return c.startsWith(partial); });
          if (matches.length === 1) { parts[parts.length - 1] = matches[0]; fresh.value = parts.join(' ') + ' '; }
          else if (matches.length > 1) { ctfTermCmdEcho(val2); ctfTermOutput(matches.join('  '), 'term-output'); }
        }
      }
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault();
      const out = document.getElementById('ctf-terminal-output');
      if (out) out.innerHTML = '';
    }
  });

  // Clic sur le terminal → focus input
  const wrap = document.querySelector('.ctf-terminal-wrap');
  if (wrap) {
    wrap.addEventListener('click', function(e) {
      if (!e.target.closest('.ctf-terminal-titlebar')) fresh.focus();
    });
  }
}

/* --- Traitement des commandes CTF --- */
function processCTFCommand(rawCmd) {
  const trimmed = rawCmd.trim();
  if (ctfCmdHistory[ctfCmdHistory.length - 1] !== trimmed) ctfCmdHistory.push(trimmed);
  ctfHistoryIdx = ctfCmdHistory.length;
  ctfTermCmdEcho(trimmed);

  const parts = trimmed.split(/\s+/);
  const cmd   = parts[0];
  const args  = parts.slice(1);

  switch(cmd) {
    case 'clear': {
      const out = document.getElementById('ctf-terminal-output');
      if (out) out.innerHTML = '';
      break;
    }
    case 'pwd': ctfTermOutput(escHtml(ctfCurrentDir), 'term-output'); break;
    case 'whoami': ctfTermOutput('ctf', 'term-output'); break;
    case 'id': ctfTermOutput('uid=1337(ctf) gid=1337(ctf) groupes=1337(ctf)', 'term-output'); break;
    case 'hostname': ctfTermOutput('challenge-box', 'term-output'); break;
    case 'ls': ctfHandleLs(args); break;
    case 'cd': ctfHandleCd(args); break;
    case 'cat': {
      if (!args[0]) { ctfTermOutput('<span class="t-err">cat : aucun fichier spécifié</span>'); break; }
      const t = ctfResolvePath(args[0]);
      if (!ctfVfs[t]) { ctfTermOutput('<span class="t-err">cat : ' + escHtml(args[0]) + ' : Aucun fichier ou dossier de ce type</span>'); break; }
      if (ctfVfs[t].type === 'dir') { ctfTermOutput('<span class="t-err">cat : ' + escHtml(args[0]) + ' : est un répertoire</span>'); break; }
      if (ctfVfs[t].perms && ctfVfs[t].perms.startsWith('-r--------')) {
        ctfTermOutput('<span class="t-err">cat : ' + escHtml(args[0]) + ' : Permission non accordée</span>'); break;
      }
      const lines = (ctfVfs[t].content || '').split('\n');
      lines.forEach(function(l){ ctfTermOutput(escHtml(l), 'term-output'); });
      break;
    }
    case 'echo': {
      ctfTermOutput(escHtml(args.join(' ')), 'term-output');
      break;
    }
    case 'find': {
      // find [dir] [-name pattern]
      const nonFlags = args.filter(function(a){ return !a.startsWith('-'); });
      const searchRoot = ctfResolvePath(nonFlags[0] || '.');
      const nameIdx = args.indexOf('-name');
      const namePattern = nameIdx >= 0 ? args[nameIdx + 1] : null;
      const results = [];
      function ctfFindRecur(dirPath) {
        const node = ctfVfs[dirPath];
        if (!node) return;
        if (!namePattern || dirPath.split('/').pop().includes(namePattern.replace(/\*/g,''))) {
          results.push(dirPath);
        }
        if (node.type === 'dir' && node.children) {
          node.children.forEach(function(child) {
            ctfFindRecur((dirPath === '/' ? '' : dirPath) + '/' + child);
          });
        }
      }
      // Only add root if it matches or no pattern
      if (!namePattern) results.push(searchRoot);
      const rootNode = ctfVfs[searchRoot];
      if (rootNode && rootNode.children) {
        rootNode.children.forEach(function(child) {
          ctfFindRecur((searchRoot === '/' ? '' : searchRoot) + '/' + child);
        });
      }
      results.forEach(function(r){ ctfTermOutput(escHtml(r), 'term-output'); });
      if (!results.length) ctfTermOutput('<span class="t-muted">(aucun résultat)</span>');
      break;
    }
    case 'grep': {
      const flags   = args.filter(function(a){ return a.startsWith('-'); });
      const nonFlag = args.filter(function(a){ return !a.startsWith('-'); });
      if (nonFlag.length < 2) { ctfTermOutput('<span class="t-muted">(grep : spécifiez un motif et un fichier)</span>'); break; }
      const pattern = nonFlag[0];
      const file    = nonFlag[1];
      const t       = ctfResolvePath(file);
      if (!ctfVfs[t] || !ctfVfs[t].content) { ctfTermOutput('<span class="t-err">grep : ' + escHtml(file) + ' : Aucun fichier de ce type</span>'); break; }
      const ci = flags.includes('-i');
      const lines2 = ctfVfs[t].content.split('\n').filter(function(l){
        return ci ? l.toLowerCase().includes(pattern.toLowerCase()) : l.includes(pattern);
      });
      if (!lines2.length) { ctfTermOutput('<span class="t-muted">(aucune correspondance)</span>'); break; }
      lines2.forEach(function(l){
        const re = new RegExp(escHtml(pattern).replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), ci ? 'gi' : 'g');
        ctfTermOutput(escHtml(l).replace(re, function(m){ return '<span class="t-green">'+m+'</span>'; }), 'term-output');
      });
      break;
    }
    case 'base64': {
      // Simule : echo 'xxx' | base64 -d  → on accepte la syntaxe simplifiée
      // Usage direct : base64 -d <<< 'chaine'  ou base64 fichier
      if (args[0] === '-d' && args[1]) {
        try {
          const decoded = atob(args[1]);
          ctfTermOutput(escHtml(decoded), 'term-output');
        } catch(e) {
          ctfTermOutput('<span class="t-err">base64 : données invalides</span>');
        }
      } else if (args[0]) {
        const t = ctfResolvePath(args[0]);
        if (ctfVfs[t] && ctfVfs[t].content) {
          ctfTermOutput(escHtml(btoa(ctfVfs[t].content)), 'term-output');
        } else {
          ctfTermOutput('<span class="t-err">base64 : ' + escHtml(args[0]) + ' : Aucun fichier</span>');
        }
      } else {
        ctfTermOutput('<span class="t-muted">Usage : base64 -d &lt;chaine_base64&gt;</span>');
      }
      break;
    }
    case 'ps': {
      // Pour ctf-05 : afficher le processus fantôme avec le flag dans ses args
      if (args.includes('aux') || args.includes('-aux') || args.includes('-ef')) {
        ctfTermOutput('<span class="t-muted">USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND</span>', 'term-output');
        ctfTermOutput('root           1  0.0  0.1 168380 13008 ?        Ss   10:00   0:02 /sbin/init', 'term-output');
        ctfTermOutput('root         891  0.0  0.0  72300  5612 ?        Ss   10:00   0:00 /usr/sbin/sshd -D', 'term-output');
        ctfTermOutput('ctf         1023  0.0  0.0  10596  5120 pts/0    Ss   10:02   0:00 bash', 'term-output');
        ctfTermOutput('root        9342  0.3  0.1  18240  7680 ?        S    14:32   0:01 /usr/local/bin/beacon --token flag{process_arguments_exposed} --interval 30', 'term-output');
        ctfTermOutput('ctf         9999  0.0  0.0  12940  3712 pts/0    R+   14:35   0:00 ps aux', 'term-output');
      } else {
        ctfTermOutput('<span class="t-muted">  PID TTY          TIME CMD</span>', 'term-output');
        ctfTermOutput(' 1023 pts/0    00:00:00 bash', 'term-output');
        ctfTermOutput(' 9999 pts/0    00:00:00 ps', 'term-output');
      }
      break;
    }
    case 'awk':
    case 'cut': {
      ctfTermOutput('<span class="t-muted">(' + escHtml(cmd) + ' : commande disponible — utilise grep d\'abord pour isoler les lignes)</span>', 'term-output');
      break;
    }
    case 'man': {
      const manShort = {
        ls:     'ls [-la] [dir] — lister les fichiers. -l format long, -a afficher les cachés',
        cat:    'cat [fichier] — afficher le contenu d\'un fichier',
        find:   'find [dir] [-name motif] — rechercher des fichiers',
        grep:   'grep [motif] [fichier] — filtrer les lignes contenant un motif',
        base64: 'base64 -d &lt;chaine&gt; — décoder du base64',
        ps:     'ps aux — afficher tous les processus avec leurs arguments',
        cut:    'cut -d [sep] -f [n] [fichier] — extraire un champ',
        awk:    'awk \'{print $n}\' [fichier] — extraire une colonne'
      };
      const topic = args[0];
      if (!topic) { ctfTermOutput('<span class="t-err">man : quel manuel ?</span>'); break; }
      if (manShort[topic]) ctfTermOutput('<div class="man-page"><strong>' + escHtml(topic.toUpperCase()) + '(1)</strong> — ' + manShort[topic] + '</div>', 'term-output');
      else ctfTermOutput('<span class="t-err">Aucune entrée de manuel pour ' + escHtml(topic) + '</span>');
      break;
    }
    case 'history': {
      ctfCmdHistory.forEach(function(c, i){ ctfTermOutput('  ' + String(i+1).padStart(3) + '  ' + escHtml(c), 'term-output'); });
      break;
    }
    case 'help': {
      ctfTermOutput('<div class="help-grid">'
        + '<div class="help-section"><strong>Navigation</strong><br>'
        + '<span class="t-blue">pwd</span> — répertoire courant<br>'
        + '<span class="t-blue">ls [-la]</span> — lister fichiers<br>'
        + '<span class="t-blue">cd [dir]</span> — changer répertoire</div>'
        + '<div class="help-section"><strong>Fichiers</strong><br>'
        + '<span class="t-blue">cat [f]</span> — afficher contenu<br>'
        + '<span class="t-blue">find [dir] [-name]</span> — rechercher<br>'
        + '<span class="t-blue">grep [motif] [f]</span> — filtrer</div>'
        + '<div class="help-section"><strong>Outils CTF</strong><br>'
        + '<span class="t-blue">base64 -d &lt;str&gt;</span> — décoder base64<br>'
        + '<span class="t-blue">ps aux</span> — processus actifs<br>'
        + '<span class="t-blue">man [cmd]</span> — aide</div>'
        + '</div>', 'term-output');
      break;
    }
    default:
      ctfTermOutput('<span class="t-err">bash: ' + escHtml(cmd) + ': commande introuvable</span>');
  }
  updateCTFPromptLabel();
}

function ctfHandleLs(args) {
  const longFormat = args.some(function(a){ return a.match(/^-[a-zA-Z]*l/); });
  const showHidden = args.some(function(a){ return a.match(/^-[a-zA-Z]*a/); });
  const fileArg    = args.filter(function(a){ return !a.startsWith('-'); })[0];
  const targetDir  = fileArg ? ctfResolvePath(fileArg) : ctfCurrentDir;

  if (!ctfVfs[targetDir]) {
    ctfTermOutput('<span class="t-err">ls : impossible d\'accéder à \'' + escHtml(fileArg) + '\': Aucun fichier ou dossier de ce type</span>');
    return;
  }

  let items = [];
  if (ctfVfs[targetDir].type === 'file') {
    items = [{ name: (fileArg || '').split('/').pop(), node: ctfVfs[targetDir] }];
  } else {
    const children = ctfVfs[targetDir].children || [];
    items = children.map(function(name) {
      const nodePath = (targetDir === '/' ? '' : targetDir) + '/' + name;
      return { name: name, node: ctfVfs[nodePath] || { type: 'file' } };
    });
    if (showHidden) {
      items = [{ name: '.', node: { type: 'dir' } }, { name: '..', node: { type: 'dir' } }].concat(items);
    } else {
      items = items.filter(function(it){ return !it.name.startsWith('.'); });
    }
  }

  if (longFormat) {
    ctfTermOutput('<span class="t-muted">total ' + (items.length * 4) + '</span>', 'term-output');
    items.forEach(function(item) {
      const isDir  = item.node && item.node.type === 'dir';
      const perm   = item.node && item.node.perms ? item.node.perms : (isDir ? 'drwxr-xr-x' : '-rw-r--r--');
      const size   = isDir ? '  4096' : String((item.node && item.node.content ? item.node.content.length : 0) + 128).padStart(6);
      const nameHtml = isDir
        ? '<span class="ls-dir">' + escHtml(item.name) + '/</span>'
        : item.name.endsWith('.sh')
          ? '<span class="ls-exec">' + escHtml(item.name) + '</span>'
          : item.name.startsWith('.')
            ? '<span class="ls-hidden">' + escHtml(item.name) + '</span>'
            : '<span class="ls-file">' + escHtml(item.name) + '</span>';
      ctfTermOutput(escHtml(perm) + ' 1 ctf ctf ' + size + ' Mar 15 10:23 ' + nameHtml, 'term-output ls-line');
    });
  } else {
    const parts2 = items.map(function(item) {
      const isDir = item.node && item.node.type === 'dir';
      if (isDir)                     return '<span class="ls-dir">' + escHtml(item.name) + '</span>';
      if (item.name.endsWith('.sh')) return '<span class="ls-exec">' + escHtml(item.name) + '</span>';
      if (item.name.startsWith('.')) return '<span class="ls-hidden">' + escHtml(item.name) + '</span>';
      return '<span class="ls-file">' + escHtml(item.name) + '</span>';
    });
    ctfTermOutput(parts2.join('  '), 'term-output');
  }
}

function ctfHandleCd(args) {
  const target = args[0];
  if (!target || target === '~' || target === '') {
    ctfPrevDir = ctfCurrentDir; ctfCurrentDir = '/home/user'; return;
  }
  if (target === '-') {
    if (ctfPrevDir) { const tmp = ctfCurrentDir; ctfCurrentDir = ctfPrevDir; ctfPrevDir = tmp; ctfTermOutput(escHtml(ctfCurrentDir), 'term-output'); }
    return;
  }
  const resolved = ctfResolvePath(target);
  if (!ctfVfs[resolved]) { ctfTermOutput('<span class="t-err">bash: cd: ' + escHtml(target) + ': Aucun fichier ou dossier de ce type</span>'); return; }
  if (ctfVfs[resolved].type !== 'dir') { ctfTermOutput('<span class="t-err">bash: cd: ' + escHtml(target) + ': N\'est pas un répertoire</span>'); return; }
  ctfPrevDir = ctfCurrentDir;
  ctfCurrentDir = resolved;
}

/* --- Soumission du flag --- */
async function submitCTFFlag() {
  const input    = document.getElementById('ctf-flag-input');
  const feedback = document.getElementById('ctf-flag-feedback');
  if (!input || !feedback || !ctfCurrentId) return;

  const raw      = input.value;
  const norm     = normalizeFlag(raw);
  if (!norm) return;

  const ch       = CTF_CHALLENGES.find(function(c){ return c.id === ctfCurrentId; });
  if (!ch) return;

  const hash     = await sha256hex(norm);
  const isCorrect = hash === ch.flagHash;

  if (isCorrect) {
    ctfState.solved.add(ctfCurrentId);
    await saveCTFState();
    updateCTFBadge();

    feedback.className   = 'ctf-flag-feedback success';
    feedback.textContent = '🎉 Félicitations ! Flag correct. Challenge validé !';
    input.disabled       = true;

    // Mettre à jour la card
    const card = document.getElementById('ctf-card-' + ctfCurrentId);
    if (card) card.classList.add('solved');
  } else {
    feedback.className   = 'ctf-flag-feedback error';
    feedback.textContent = '✗ Flag incorrect. Continuez à explorer le système !';
    input.select();
  }
}

/* --- Indices débloquables --- */
function renderCTFHints(ch) {
  const list    = document.getElementById('ctf-hints-list');
  const btn     = document.getElementById('ctf-hint-btn');
  if (!list || !btn) return;

  const shown = ctfState.hints[ch.id] || 0;
  list.innerHTML = '';

  for (let i = 0; i < shown; i++) {
    const item = document.createElement('div');
    item.className = 'ctf-hint-item';
    item.innerHTML = '<span class="ctf-hint-num">Indice ' + (i + 1) + '/' + ch.hints.length + '</span>' + ch.hints[i];
    list.appendChild(item);
  }

  if (shown >= ch.hints.length) {
    btn.disabled     = true;
    btn.textContent  = 'Tous les indices affichés';
  } else {
    btn.disabled     = false;
    btn.textContent  = 'Afficher un indice (' + shown + '/' + ch.hints.length + ')';
  }
}

async function showNextCTFHint() {
  const ch = CTF_CHALLENGES.find(function(c){ return c.id === ctfCurrentId; });
  if (!ch) return;

  const shown = ctfState.hints[ch.id] || 0;
  if (shown >= ch.hints.length) return;

  if (!confirm('Afficher l\'indice ' + (shown + 1) + ' sur ' + ch.hints.length + ' ?')) return;

  ctfState.hints[ch.id] = shown + 1;
  await saveCTFState();
  renderCTFHints(ch);
}


/* ============================================================
   ACTUALITÉS CYBER — NEWS
   ============================================================ */
let _newsData = [];
let _newsActiveFilter = 'all';

function cvssClass(score) {
  if (!score) return '';
  if (score >= 9.0) return 'cvss-critical';
  if (score >= 7.0) return 'cvss-high';
  return 'cvss-medium';
}

function sevLabel(sev) {
  const map = { critical: 'Critique', high: 'Élevé', medium: 'Moyen', info: 'Info' };
  return map[sev] || sev;
}

function formatNewsDate(dateStr) {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch(e) { return dateStr; }
}

function renderNewsGrid(filter) {
  _newsActiveFilter = filter || _newsActiveFilter;
  const grid = document.getElementById('news-grid');
  if (!grid) return;

  let items = [..._newsData].sort((a, b) => b.date.localeCompare(a.date));

  if (_newsActiveFilter !== 'all') {
    if (_newsActiveFilter.startsWith('tag:')) {
      const tag = _newsActiveFilter.slice(4);
      items = items.filter(n => n.tags && n.tags.includes(tag));
    } else {
      items = items.filter(n => n.severity === _newsActiveFilter);
    }
  }

  if (items.length === 0) {
    grid.innerHTML = '<div class="news-empty">Aucune actualité pour ce filtre.</div>';
    return;
  }

  grid.innerHTML = items.map(n => {
    const cvssHtml = n.cvss
      ? `<span class="news-cvss ${cvssClass(n.cvss)}" title="Score CVSS">CVSS ${n.cvss.toFixed(1)}</span>`
      : '';
    const cveHtml = n.cve
      ? `<span class="news-tag" style="color:var(--accent-orange);border-color:rgba(255,166,87,0.3)">${n.cve}</span>`
      : '';
    const tagsHtml = n.tags
      ? n.tags.map(t => `<span class="news-tag">${t}</span>`).join('')
      : '';
    return `
      <div class="news-card" data-severity="${n.severity}" data-id="${n.id}">
        <div class="news-card-top">
          <div class="news-card-title">${n.title}</div>
          <div class="news-card-badges">
            <span class="news-sev-badge ${n.severity}">${sevLabel(n.severity)}</span>
            ${cvssHtml}
          </div>
        </div>
        <div class="news-card-meta">
          <span class="news-card-date">📅 ${formatNewsDate(n.date)}</span>
          <span class="news-card-source">⌂ ${n.source_label}</span>
        </div>
        <div class="news-tags">${cveHtml}${tagsHtml}</div>
        <div class="news-card-summary">${n.summary}</div>
        <div class="news-card-context">${n.context}</div>
        <div class="news-card-footer">
          <a href="${n.source_url}" target="_blank" rel="noopener noreferrer" class="news-source-link">
            Lire la source →
          </a>
        </div>
      </div>
    `;
  }).join('');
}

function filterNews(filter, btn) {
  document.querySelectorAll('#news-filters .news-filter-btn').forEach(b => {
    b.classList.remove('active', 'active-critical', 'active-high', 'active-medium', 'active-info');
  });
  if (btn) {
    if (filter === 'all') btn.classList.add('active');
    else if (filter === 'critical') btn.classList.add('active-critical');
    else if (filter === 'high') btn.classList.add('active-high');
    else if (filter === 'medium') btn.classList.add('active-medium');
    else if (filter === 'info') btn.classList.add('active-info');
    else btn.classList.add('active');
  }
  renderNewsGrid(filter);
}

async function loadNews() {
  try {
    const resp = await fetch('data/news.json');
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();
    _newsData = data.news || [];
    const el = document.getElementById('news-last-updated');
    if (el && data.last_updated) {
      el.textContent = 'Dernière mise à jour : ' + formatNewsDate(data.last_updated)
        + (data.edition ? ' — ' + data.edition : '');
    }
    // Sync le bouton filtre actif visuellement
    const allBtn = document.querySelector('#news-filters .news-filter-btn[data-filter="all"]');
    if (allBtn) filterNews('all', allBtn);
    else renderNewsGrid('all');
  } catch(e) {
    console.warn('[LinuxPath] Chargement news.json échoué :', e);
    const grid = document.getElementById('news-grid');
    if (grid) grid.innerHTML = `
      <div class="lp-error-state" role="alert">
        <div class="lp-error-icon">⚠️</div>
        <p class="lp-error-msg">Impossible de charger les actualités.</p>
        <button class="lp-error-retry" onclick="loadNews()">↺ Réessayer</button>
      </div>`;
  }
}

/* navigateTo() gère désormais nativement la cible 'news' — voir la fonction navigateTo() */


/* ============================================================
   showAppError() — Écran d'erreur critique avec retry
   Utilisé quand les données essentielles ne peuvent pas être chargées.
   ============================================================ */
function showAppError(title, message, retryFn) {
  document.body.innerHTML = `
    <div class="lp-app-error" role="alert" aria-live="assertive">
      <div class="lp-app-error-inner">
        <div class="lp-app-error-icon" aria-hidden="true">⚠️</div>
        <h1 class="lp-app-error-title">${title}</h1>
        <p class="lp-app-error-msg">${message}</p>
        <button class="lp-app-error-btn" onclick="location.reload()">↺ Réessayer</button>
      </div>
    </div>`;
}

document.addEventListener('DOMContentLoaded', init);
/* ============================================================
   SANDBOX v86 — Chargement lazy + Démarrage et reset
   ============================================================ */

let _sandboxEmulator = null;
let _v86Loaded = false;
let _v86Loading = false;

/**
 * Charge libv86.js de façon dynamique (une seule fois),
 * puis appelle le callback fourni.
 */
function loadV86Script(callback) {
  if (_v86Loaded) {
    callback();
    return;
  }
  if (_v86Loading) {
    // Déjà en cours : attendre que le script soit prêt
    const wait = setInterval(() => {
      if (_v86Loaded) {
        clearInterval(wait);
        callback();
      }
    }, 100);
    return;
  }
  _v86Loading = true;
  const script = document.createElement('script');
  script.src = 'v86/libv86.js';
  script.onload = () => {
    _v86Loaded = true;
    _v86Loading = false;
    callback();
  };
  script.onerror = () => {
    _v86Loading = false;
    console.error('Impossible de charger libv86.js');
    const statusTxt = document.getElementById('sandbox-status-text');
    if (statusTxt) statusTxt.textContent = 'Erreur : impossible de charger la sandbox. Vérifiez votre connexion.';
    const status = document.getElementById('sandbox-status');
    if (status) status.style.display = '';
  };
  document.head.appendChild(script);
}

function startSandbox() {
  const btnStart = document.getElementById('btn-start-sandbox');
  const btnReset = document.getElementById('btn-reset-sandbox');
  const status   = document.getElementById('sandbox-status');
  const statusTxt = document.getElementById('sandbox-status-text');
  const screenWrap = document.getElementById('sandbox-screen-wrap');
  const screen   = document.getElementById('sandbox-screen');
  const inputRow = document.getElementById('sandbox-input-row');
  const input    = document.getElementById('sandbox-input');
  const promptLbl = document.getElementById('sandbox-prompt-label');

  if (btnStart) btnStart.style.display = 'none';
  if (btnReset) btnReset.style.display = '';
  if (status) status.style.display = '';
  if (statusTxt) statusTxt.textContent = 'Chargement de l\'image Alpine Linux (~8 Mo)…';

  // Chargement lazy de libv86 si pas encore disponible
  if (!window.V86) {
    if (statusTxt) statusTxt.textContent = 'Chargement de la sandbox (~8 Mo)…';
    loadV86Script(() => startSandbox());
    return;
  }

  _sandboxEmulator = new window.V86({
    wasm_path:     'v86/v86.wasm',
    bios:          { url: 'v86/seabios.bin' },
    vga_bios:      { url: 'v86/vgabios.bin' },
    cdrom:         { url: 'v86/linux.iso' },
    screen_container: screen,
    autostart:     true,
    memory_size:   64 * 1024 * 1024,
    vga_memory_size: 8 * 1024 * 1024,
  });

  _sandboxEmulator.add_listener('emulator-started', function() {
    if (statusTxt) statusTxt.textContent = 'Boot en cours… (30–60s)';
  });

  _sandboxEmulator.add_listener('serial0-output-char', function(char) {
    if (status) status.style.display = 'none';
    if (screenWrap) screenWrap.style.display = '';
  });

  // Entrée clavier vers le terminal série
  if (input) {
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        const cmd = input.value;
        input.value = '';
        if (_sandboxEmulator) {
          _sandboxEmulator.serial0_send(cmd + '\n');
        }
      }
    });
    if (inputRow) inputRow.style.display = '';
  }
}

function resetSandbox() {
  if (_sandboxEmulator) {
    _sandboxEmulator.destroy();
    _sandboxEmulator = null;
  }
  const screen = document.getElementById('sandbox-screen');
  if (screen) screen.textContent = '';
  const screenWrap = document.getElementById('sandbox-screen-wrap');
  if (screenWrap) screenWrap.style.display = 'none';
  const status = document.getElementById('sandbox-status');
  if (status) status.style.display = 'none';
  const btnStart = document.getElementById('btn-start-sandbox');
  if (btnStart) btnStart.style.display = '';
  const btnReset = document.getElementById('btn-reset-sandbox');
  if (btnReset) btnReset.style.display = 'none';
  startSandbox();
}

/* ============================================================
   CHEATSHEET LINUX
   ============================================================ */

let _cheatsheetData = [];
let _cheatsheetActiveFilter = 'all';

async function loadCheatsheet() {
  try {
    const res = await fetch('./data/cheatsheet.json');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    _cheatsheetData = json.categories || [];
    buildCheatsheetFilters();
    renderCheatsheet('all');
  } catch (err) {
    console.error('[LinuxPath] Cheatsheet load error:', err);
    const grid = document.getElementById('cheatsheet-grid');
    if (grid) grid.innerHTML = `
      <div class="lp-error-state" role="alert">
        <div class="lp-error-icon">⚠️</div>
        <p class="lp-error-msg">Impossible de charger la cheatsheet.</p>
        <button class="lp-error-retry" onclick="loadCheatsheet()">↺ Réessayer</button>
      </div>`;
  }
}

function buildCheatsheetFilters() {
  const container = document.getElementById('cheatsheet-filters');
  if (!container) return;

  // Keep the "Tout" button, add one per category
  let html = '<button class="cheatsheet-filter-btn active" data-cat="all" onclick="filterCheatsheetCat(\'all\', this)">Tout</button>';
  _cheatsheetData.forEach(cat => {
    html += `<button class="cheatsheet-filter-btn" data-cat="${cat.id}" onclick="filterCheatsheetCat('${cat.id}', this)">${cat.icon} ${cat.label}</button>`;
  });
  container.innerHTML = html;
}

function renderCheatsheet(filterCat) {
  _cheatsheetActiveFilter = filterCat;
  const search = (document.getElementById('cheatsheet-search')?.value || '').toLowerCase().trim();
  const grid = document.getElementById('cheatsheet-grid');
  if (!grid) return;

  const toRender = filterCat === 'all'
    ? _cheatsheetData
    : _cheatsheetData.filter(c => c.id === filterCat);

  let html = '';
  let totalVisible = 0;

  toRender.forEach(cat => {
    const matchedCmds = cat.commands.filter(cmd => {
      if (!search) return true;
      return cmd.cmd.toLowerCase().includes(search)
          || cmd.desc.toLowerCase().includes(search)
          || cmd.example.toLowerCase().includes(search);
    });

    if (matchedCmds.length === 0) return;
    totalVisible += matchedCmds.length;

    html += `
      <div class="cheatsheet-category">
        <div class="cheatsheet-cat-header">
          <span class="cheatsheet-cat-icon">${cat.icon}</span>
          <span class="cheatsheet-cat-label">${cat.label}</span>
          <span class="cheatsheet-cat-count">${matchedCmds.length} commande${matchedCmds.length > 1 ? 's' : ''}</span>
        </div>
        <div class="cheatsheet-cmd-list">
          ${matchedCmds.map(cmd => `
            <div class="cheatsheet-cmd-card" onclick="copyCmd('${escapeAttr(cmd.example)}')" title="Cliquer pour copier">
              <div class="cheatsheet-cmd-top">
                <code class="cheatsheet-cmd">${escapeHtml(cmd.cmd)}</code>
                <button class="cheatsheet-copy-btn" aria-label="Copier">
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
                    <rect x="5" y="5" width="9" height="9" rx="1.5"/>
                    <path d="M11 5V3.5A1.5 1.5 0 009.5 2h-6A1.5 1.5 0 002 3.5v6A1.5 1.5 0 003.5 11H5"/>
                  </svg>
                </button>
              </div>
              <div class="cheatsheet-cmd-desc">${escapeHtml(cmd.desc)}</div>
              <code class="cheatsheet-cmd-example">${escapeHtml(cmd.example)}</code>
            </div>
          `).join('')}
        </div>
      </div>`;
  });

  if (totalVisible === 0) {
    html = `<div class="news-empty">Aucune commande trouvée pour "<strong>${escapeHtml(search)}</strong>"</div>`;
  }

  grid.innerHTML = html;
}

function filterCheatsheetCat(cat, btn) {
  _cheatsheetActiveFilter = cat;
  document.querySelectorAll('.cheatsheet-filter-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  // Reset search
  const searchEl = document.getElementById('cheatsheet-search');
  if (searchEl) searchEl.value = '';
  renderCheatsheet(cat);
}

function filterCheatsheet() {
  renderCheatsheet(_cheatsheetActiveFilter);
}

function copyCmd(text) {
  navigator.clipboard.writeText(text).then(() => {
    showCheatsheetToast();
  }).catch(() => {
    // Fallback for older browsers
    const el = document.createElement('textarea');
    el.value = text;
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    showCheatsheetToast();
  });
}

function showCheatsheetToast() {
  const toast = document.getElementById('cheatsheet-toast');
  if (!toast) return;
  toast.classList.add('visible');
  setTimeout(() => toast.classList.remove('visible'), 2000);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '&quot;');
}

/* ============================================================
   GLOSSAIRE LINUX & CYBERSÉCURITÉ
   ============================================================ */

let _glossaryData = [];
let _glossaryActiveFilter = 'all';
let _glossaryActiveLetter = 'all';

const GLOSSARY_CAT_LABELS = {
  securite: '🛡️ Sécurité',
  systeme: '🖥️ Système',
  shell: '📝 Shell',
  reseau: '🌐 Réseau',
  permissions: '🔐 Permissions',
  developpement: '⚙️ Dev',
  virtualisation: '📦 Virtualisation'
};

async function loadGlossary() {
  try {
    const res = await fetch('./data/glossary.json');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    _glossaryData = json.terms || [];
    buildGlossaryAlphaNav();
    renderGlossary();
  } catch (err) {
    console.error('[LinuxPath] Glossary load error:', err);
    const grid = document.getElementById('glossary-grid');
    if (grid) grid.innerHTML = `
      <div class="lp-error-state" role="alert">
        <div class="lp-error-icon">⚠️</div>
        <p class="lp-error-msg">Impossible de charger le glossaire.</p>
        <button class="lp-error-retry" onclick="loadGlossary()">↺ Réessayer</button>
      </div>`;
  }
}

function buildGlossaryAlphaNav() {
  const nav = document.getElementById('glossary-alpha-nav');
  if (!nav) return;
  const letters = [...new Set(_glossaryData.map(t => t.letter))].sort();
  let html = '<button class="glossary-alpha-btn active" data-letter="all" onclick="filterGlossaryLetter(\'all\', this)">Tout</button>';
  letters.forEach(l => {
    html += `<button class="glossary-alpha-btn" data-letter="${l}" onclick="filterGlossaryLetter('${l}', this)">${l}</button>`;
  });
  nav.innerHTML = html;
}

function renderGlossary() {
  const search = (document.getElementById('glossary-search')?.value || '').toLowerCase().trim();
  const grid = document.getElementById('glossary-grid');
  if (!grid) return;

  // Filter terms
  let filtered = _glossaryData.filter(t => {
    const catOk = _glossaryActiveFilter === 'all' || t.category === _glossaryActiveFilter;
    const letterOk = _glossaryActiveLetter === 'all' || t.letter === _glossaryActiveLetter;
    const searchOk = !search || 
      t.term.toLowerCase().includes(search) ||
      t.definition.toLowerCase().includes(search) ||
      (t.full && t.full.toLowerCase().includes(search));
    return catOk && letterOk && searchOk;
  });

  // Sort alphabetically
  filtered.sort((a, b) => a.term.localeCompare(b.term, 'fr'));

  if (filtered.length === 0) {
    grid.innerHTML = `<div class="news-empty">Aucun terme trouvé${search ? ` pour "<strong>${escapeHtml(search)}</strong>"` : ''}.</div>`;
    return;
  }

  // Group by first letter
  const groups = {};
  filtered.forEach(t => {
    const l = t.term[0].toUpperCase();
    if (!groups[l]) groups[l] = [];
    groups[l].push(t);
  });

  let html = '';
  Object.keys(groups).sort().forEach(letter => {
    html += `<div class="glossary-letter-group">
      <div class="glossary-letter-header">${letter}</div>
      <div class="glossary-terms-grid">
        ${groups[letter].map(t => `
          <div class="glossary-term-card">
            <div class="glossary-term-top">
              <div class="glossary-term-name">${escapeHtml(t.term)}</div>
              <span class="glossary-cat-badge glossary-cat-${t.category}">${GLOSSARY_CAT_LABELS[t.category] || t.category}</span>
            </div>
            ${t.full ? `<div class="glossary-term-full">${escapeHtml(t.full)}</div>` : ''}
            <div class="glossary-term-def">${escapeHtml(t.definition)}</div>
            <code class="glossary-term-example">${escapeHtml(t.example)}</code>
            ${t.related && t.related.length ? `
              <div class="glossary-related">
                ${t.related.map(r => `<span class="glossary-related-tag">${escapeHtml(r)}</span>`).join('')}
              </div>` : ''}
          </div>
        `).join('')}
      </div>
    </div>`;
  });

  grid.innerHTML = html;
}

function filterGlossaryCat(cat, btn) {
  _glossaryActiveFilter = cat;
  _glossaryActiveLetter = 'all';
  // Reset letter nav
  document.querySelectorAll('.glossary-alpha-btn').forEach(b => b.classList.remove('active'));
  const allLetterBtn = document.querySelector('.glossary-alpha-btn[data-letter="all"]');
  if (allLetterBtn) allLetterBtn.classList.add('active');
  // Update cat buttons
  document.querySelectorAll('#glossary-cat-filters .cheatsheet-filter-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  // Reset search
  const searchEl = document.getElementById('glossary-search');
  if (searchEl) searchEl.value = '';
  renderGlossary();
}

function filterGlossaryLetter(letter, btn) {
  _glossaryActiveLetter = letter;
  document.querySelectorAll('.glossary-alpha-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderGlossary();
}

function filterGlossary() {
  // Reset letter and cat filters when searching
  _glossaryActiveLetter = 'all';
  _glossaryActiveFilter = 'all';
  document.querySelectorAll('.glossary-alpha-btn').forEach(b => b.classList.remove('active'));
  const allLetterBtn = document.querySelector('.glossary-alpha-btn[data-letter="all"]');
  if (allLetterBtn) allLetterBtn.classList.add('active');
  document.querySelectorAll('#glossary-cat-filters .cheatsheet-filter-btn').forEach(b => b.classList.remove('active'));
  const allCatBtn = document.querySelector('#glossary-cat-filters .cheatsheet-filter-btn[data-cat="all"]');
  if (allCatBtn) allCatBtn.classList.add('active');
  renderGlossary();
}

/* ============================================================
   ROADMAP / PROGRESSION
   ============================================================ */

// Counts per module (matches data/lessons.json, exercises.json, quizzes.json)
const MODULE_COUNTS = {
  m1: { lessons: 4,  exercises: 3, quizzes: 2 },
  m2: { lessons: 5,  exercises: 2, quizzes: 2 },
  m3: { lessons: 4,  exercises: 2, quizzes: 2 },
  m4: { lessons: 5,  exercises: 2, quizzes: 2 },
  m5: { lessons: 5,  exercises: 2, quizzes: 2 },
  m6: { lessons: 5,  exercises: 2, quizzes: 2 },
  m7: { lessons: 5,  exercises: 3, quizzes: 2 },
  m8: { lessons: 10, exercises: 4, quizzes: 2 },
  m9: { lessons: 5,  exercises: 3, quizzes: 1 }
};

const MODULE_ICONS = {
  m1: '🐧', m2: '📁', m3: '👤',
  m4: '🌐', m5: '📝', m6: '⚙️',
  m7: '🛡️', m8: '🐳', m9: '🌐'
};

const BONUS_SECTIONS = [
  { target: 'sandbox',    icon: '💻', label: 'Sandbox Linux',      desc: 'Terminal Alpine réel via WebAssembly' },
  { target: 'ctf',        icon: '🚩', label: 'Challenges CTF',     desc: '6 challenges d\'investigation' },
  { target: 'cheatsheet', icon: '📋', label: 'Cheatsheet',         desc: '118 commandes de référence' },
  { target: 'glossary',   icon: '📖', label: 'Glossaire',          desc: '74 termes expliqués en français' },
  { target: 'news',       icon: '📰', label: 'Actualités Cyber',   desc: 'Veille cybersécurité — mai 2026' }
];

function renderRoadmap() {
  renderRoadmapSummary();
  renderRoadmapTimeline();
  renderRoadmapBonus();
}

function renderRoadmapSummary() {
  const el = document.getElementById('roadmap-summary');
  if (!el) return;

  const mods = ['m1','m2','m3','m4','m5','m6','m7','m8','m9'];

  // Compute totals
  let totalLessons = 0, doneLessons = 0;
  let totalExercises = 0, doneExercises = 0;
  let totalQuizzes = 0, doneQuizzes = 0;
  let completedModules = 0;

  mods.forEach(m => {
    const counts = MODULE_COUNTS[m];
    totalLessons   += counts.lessons;
    totalExercises += counts.exercises;
    totalQuizzes   += counts.quizzes;

    // Count done items for this module
    const lessonsDone = [...state.lessonsDone].filter(id => id.startsWith(m + '-')).length;
    const exDone      = [...state.exercisesDone].filter(id => id.startsWith(m + '-')).length;
    const quizDone    = state.quizScores[m] !== undefined ? counts.quizzes : 0;

    doneLessons   += Math.min(lessonsDone, counts.lessons);
    doneExercises += Math.min(exDone, counts.exercises);
    doneQuizzes   += quizDone;

    // Module fully completed = all lessons + all exercises + quiz done
    if (
      lessonsDone >= counts.lessons &&
      exDone      >= counts.exercises &&
      state.quizScores[m] !== undefined
    ) completedModules++;
  });

  const totalItems = totalLessons + totalExercises + totalQuizzes;
  const doneItems  = doneLessons + doneExercises + doneQuizzes;
  const pct = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0;

  el.innerHTML = `
    <div class="roadmap-stat-card">
      <div class="roadmap-stat-number" style="color:var(--accent-green)">${pct}%</div>
      <div class="roadmap-stat-label">Progression globale</div>
      <div class="roadmap-stat-bar">
        <div class="roadmap-stat-fill" style="width:${pct}%;background:var(--accent-green)"></div>
      </div>
    </div>
    <div class="roadmap-stat-card">
      <div class="roadmap-stat-number" style="color:var(--accent-blue)">${completedModules}<span style="font-size:16px;color:var(--text-subtle)">/8</span></div>
      <div class="roadmap-stat-label">Modules complétés</div>
    </div>
    <div class="roadmap-stat-card">
      <div class="roadmap-stat-number" style="color:var(--accent-purple)">${doneLessons}<span style="font-size:16px;color:var(--text-subtle)">/${totalLessons}</span></div>
      <div class="roadmap-stat-label">Leçons terminées</div>
    </div>
    <div class="roadmap-stat-card">
      <div class="roadmap-stat-number" style="color:#ffa600">${doneExercises}<span style="font-size:16px;color:var(--text-subtle)">/${totalExercises}</span></div>
      <div class="roadmap-stat-label">Exercices résolus</div>
    </div>
  `;
}

function renderRoadmapTimeline() {
  const el = document.getElementById('roadmap-timeline');
  if (!el) return;

  const mods = ['m1','m2','m3','m4','m5','m6','m7','m8','m9'];
  let html = '';

  mods.forEach((m, idx) => {
    const meta   = MODULE_META[m];
    const counts = MODULE_COUNTS[m];
    const icon   = MODULE_ICONS[m];
    const num    = String(idx + 1).padStart(2, '0');

    // Progress for this module
    const lessonsDone = [...state.lessonsDone].filter(id => id.startsWith(m + '-')).length;
    const exDone      = [...state.exercisesDone].filter(id => id.startsWith(m + '-')).length;
    const quizDone    = state.quizScores[m] !== undefined;

    const totalItems = counts.lessons + counts.exercises + counts.quizzes;
    const doneItems  = Math.min(lessonsDone, counts.lessons)
                     + Math.min(exDone, counts.exercises)
                     + (quizDone ? counts.quizzes : 0);
    const pct = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0;

    // Determine state
    const isUnlocked   = state.unlockedModules.has(m);
    const isCompleted  = lessonsDone >= counts.lessons && exDone >= counts.exercises && quizDone;
    const isActive     = isUnlocked && !isCompleted && doneItems > 0;
    const isStartable  = isUnlocked && doneItems === 0;
    const isLocked     = !isUnlocked;

    let nodeClass = 'roadmap-node';
    let statusLabel = '';
    let statusClass = '';
    if (isCompleted) {
      nodeClass += ' completed';
      statusLabel = '✅ Complété';
      statusClass = 'roadmap-status-completed';
    } else if (isActive) {
      nodeClass += ' active';
      statusLabel = '🔵 En cours';
      statusClass = 'roadmap-status-active';
    } else if (isStartable) {
      nodeClass += ' startable';
      statusLabel = '▶ Déverrouillé';
      statusClass = 'roadmap-status-startable';
    } else {
      nodeClass += ' locked';
      statusLabel = '🔒 Verrouillé';
      statusClass = 'roadmap-status-locked';
    }

    const btnDisabled = isLocked ? 'disabled' : '';
    const btnLabel    = isCompleted ? 'Revoir' : (isLocked ? 'Verrouillé' : (doneItems > 0 ? 'Continuer →' : 'Commencer →'));

    html += `
      <div class="${nodeClass}">
        <div class="roadmap-node-connector">
          <div class="roadmap-dot ${isCompleted ? 'dot-completed' : isActive ? 'dot-active' : isStartable ? 'dot-startable' : 'dot-locked'}">
            ${isCompleted ? '✓' : isLocked ? '🔒' : icon}
          </div>
          ${idx < mods.length - 1 ? '<div class="roadmap-line ' + (isCompleted ? 'line-done' : '') + '"></div>' : ''}
        </div>
        <div class="roadmap-node-content">
          <div class="roadmap-node-header">
            <span class="roadmap-node-num">${num}</span>
            <span class="roadmap-node-title">${escapeHtml(meta.title)}</span>
            <span class="roadmap-node-status ${statusClass}">${statusLabel}</span>
          </div>
          <p class="roadmap-node-desc">${escapeHtml(meta.desc)}</p>
          ${!isLocked ? `
          <div class="roadmap-node-progress">
            <div class="roadmap-progress-items">
              <span class="${lessonsDone >= counts.lessons ? 'roadmap-item-done' : ''}">📚 ${Math.min(lessonsDone, counts.lessons)}/${counts.lessons} leçons</span>
              <span class="${exDone >= counts.exercises ? 'roadmap-item-done' : ''}">⌨️ ${Math.min(exDone, counts.exercises)}/${counts.exercises} exercices</span>
              <span class="${quizDone ? 'roadmap-item-done' : ''}">✅ ${quizDone ? counts.quizzes : 0}/${counts.quizzes} quiz</span>
            </div>
            <div class="roadmap-pct-bar">
              <div class="roadmap-pct-fill ${isCompleted ? 'fill-completed' : 'fill-active'}" style="width:${pct}%"></div>
            </div>
            <span class="roadmap-pct-label">${pct}%</span>
          </div>` : ''}
          <button class="roadmap-node-btn ${isLocked ? 'btn-locked' : ''}" ${btnDisabled} onclick="navigateTo('${m}')">${btnLabel}</button>
        </div>
      </div>`;
  });

  el.innerHTML = html;
}

function renderRoadmapBonus() {
  const el = document.getElementById('roadmap-bonus-grid');
  if (!el) return;

  el.innerHTML = BONUS_SECTIONS.map(s => `
    <div class="roadmap-bonus-card" onclick="navigateTo('${s.target}')">
      <div class="roadmap-bonus-icon">${s.icon}</div>
      <div class="roadmap-bonus-label">${escapeHtml(s.label)}</div>
      <div class="roadmap-bonus-desc">${escapeHtml(s.desc)}</div>
    </div>
  `).join('');
}

/* ============================================================
   HOME — Hero dynamique (retour vs nouveau)
   ============================================================ */

function renderHome() {
  const el = document.getElementById('home-hero');
  if (!el) return;

  // Compute global progress
  const mods = ['m1','m2','m3','m4','m5','m6','m7','m8','m9'];
  let totalItems = 0, doneItems = 0, completedMods = 0;

  mods.forEach(m => {
    const c = MODULE_COUNTS[m];
    totalItems += c.lessons + c.exercises + c.quizzes;
    const ld = [...state.lessonsDone].filter(id => id.startsWith(m + '-')).length;
    const ed = [...state.exercisesDone].filter(id => id.startsWith(m + '-')).length;
    const qd = state.quizScores[m] !== undefined ? c.quizzes : 0;
    doneItems += Math.min(ld, c.lessons) + Math.min(ed, c.exercises) + qd;
    if (ld >= c.lessons && ed >= c.exercises && state.quizScores[m] !== undefined) completedMods++;
  });

  const pct = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0;
  const isReturning = doneItems > 0;

  // Find next unlocked module in progress
  let resumeTarget = 'm1';
  for (const m of mods) {
    if (state.unlockedModules.has(m)) {
      const c = MODULE_COUNTS[m];
      const ld = [...state.lessonsDone].filter(id => id.startsWith(m + '-')).length;
      const ed = [...state.exercisesDone].filter(id => id.startsWith(m + '-')).length;
      if (ld < c.lessons || ed < c.exercises || state.quizScores[m] === undefined) {
        resumeTarget = m;
        break;
      }
    }
  }
  const resumeLabel = MODULE_META[resumeTarget]
    ? MODULE_META[resumeTarget].title
    : 'Module suivant';

  if (isReturning) {
    // ---- RETURNING USER ----
    el.innerHTML = `
      <div class="lp-hero lp-hero-returning">
        <div class="lp-hero-returning-top">
          <div class="lp-return-badge">
            <span class="lp-return-dot"></span>
            Bon retour sur LinuxPath
          </div>
          <div class="lp-return-stats">
            <div class="lp-return-stat">
              <div class="lp-return-stat-num" style="color:var(--accent-green)">${pct}%</div>
              <div class="lp-return-stat-label">Accompli</div>
            </div>
            <div class="lp-return-stat">
              <div class="lp-return-stat-num" style="color:var(--accent-blue)">${completedMods}/8</div>
              <div class="lp-return-stat-label">Modules</div>
            </div>
            <div class="lp-return-stat">
              <div class="lp-return-stat-num" style="color:var(--accent-purple)">${doneItems}</div>
              <div class="lp-return-stat-label">Éléments faits</div>
            </div>
          </div>
        </div>

        <div class="lp-return-progress-wrap">
          <div class="lp-return-progress-bar">
            <div class="lp-return-progress-fill" style="width:${pct}%"></div>
          </div>
          <span class="lp-return-progress-label">${pct}% du parcours complété</span>
        </div>

        <h1 class="lp-headline" style="margin-top:28px">
          ${pct === 100
            ? 'Félicitations, parcours <em>terminé</em> !'
            : pct >= 50
              ? 'Tu es à <em>mi-chemin</em>. Continue !'
              : 'Tu progresses bien.<br>La suite t\'attend.'}
        </h1>

        <div class="lp-cta-row" style="margin-top:24px">
          <button class="lp-cta-primary" onclick="navigateTo('${resumeTarget}')">
            ▶ Reprendre — ${escapeHtml(resumeLabel)}
          </button>
          <button class="lp-cta-roadmap" onclick="navigateTo('roadmap')">🗺️ Ma progression</button>
          <button class="lp-cta-secondary" onclick="document.getElementById('lp-modules').scrollIntoView({behavior:'smooth'})">Voir les modules</button>
        </div>
      </div>`;
  } else {
    // ---- NEW USER ----
    el.innerHTML = `
      <div class="lp-hero">
        <div class="lp-badge">$ open-source · gratuit · 100% français</div>
        <h1 class="lp-headline">Apprenez <em>Linux</em><br>de zéro à l'administration.</h1>
        <p class="lp-sub">8 modules progressifs, exercices pratiques, quiz de validation et un vrai terminal Linux dans votre navigateur — sans rien installer.</p>
        <div class="lp-cta-row">
          <button class="lp-cta-primary" onclick="navigateTo('m1')">▶ Commencer gratuitement</button>
          <button class="lp-cta-secondary" onclick="document.getElementById('lp-modules').scrollIntoView({behavior:'smooth'})">Voir les modules</button>
        </div>
        <div class="lp-hero-stats">
          <div><div class="lp-stat-num">8</div><div class="lp-stat-label">Modules</div></div>
          <div><div class="lp-stat-num">43</div><div class="lp-stat-label">Leçons</div></div>
          <div><div class="lp-stat-num">20</div><div class="lp-stat-label">Exercices</div></div>
          <div><div class="lp-stat-num">40</div><div class="lp-stat-label">Questions QCM</div></div>
          <div><div class="lp-stat-num">6</div><div class="lp-stat-label">Challenges CTF</div></div>
        </div>
      </div>`;
  }
}
