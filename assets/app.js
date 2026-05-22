/* ============================================================
   NAVIGATION & SIDEBAR
   ============================================================ */

/* ============================================================
   NAVIGATION
   ============================================================ */
let currentSection = 'home';

function navigateTo(target) {
  // 'ctf' et 'sandbox' sont toujours accessibles sans condition de module
  const freeTargets = ['home', 'sandbox', 'ctf', 'news', 'cheatsheet', 'glossary', 'roadmap', 'm9'];
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
  // Scroller en haut — cibler content-area ET window pour compatibilité maximale
  const ca = document.getElementById('content-area');
  if (ca) ca.scrollTop = 0;
  window.scrollTo({ top: 0, behavior: 'instant' });
  document.documentElement.scrollTop = 0;
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
    m10: 'group-network',
    m11: 'group-network',
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
    ['m9','m10','m11'].includes(target) ? 'group-network'
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
   INIT — Bootstrap de l'application
   ============================================================ */

/* ============================================================
   INIT
   ============================================================ */
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
   SANDBOX v86 — Chargement lazy + Démarrage et reset
   ============================================================ */

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

  // Clear screen container for v86 canvas injection
  screen.textContent = '';
  screen.style.whiteSpace = '';
  screen.style.padding = '0';

  _sandboxEmulator = new window.V86({
    wasm_path:     'v86/v86.wasm',
    bios:          { url: 'v86/seabios.bin' },
    vga_bios:      { url: 'v86/vgabios.bin' },
    cdrom:         { url: 'v86/linux.iso' },
    screen_container: screen,
    autostart:     true,
    memory_size:   64 * 1024 * 1024,
    vga_memory_size: 8 * 1024 * 1024,
    disable_keyboard: false,
    disable_mouse:    true,
  });

  _sandboxEmulator.add_listener('emulator-started', function() {
    if (statusTxt) statusTxt.textContent = 'Boot en cours… (30–60s)';
    if (screenWrap) screenWrap.style.display = '';
    // Hide spinner after a short delay (text mode won't fire screen-set-size-graphical)
    setTimeout(function() {
      if (status) status.style.display = 'none';
    }, 2000);
  });

  // VGA mode: v86 handles keyboard directly via the canvas it injects.
  // The text input row is a fallback for sending commands via serial.
  if (input) {
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        const cmd = input.value;
        input.value = '';
        if (_sandboxEmulator) {
          _sandboxEmulator.keyboard_send_text(cmd + '\n');
        }
      }
    });
    if (inputRow) inputRow.style.display = '';
    var quickCmds = document.getElementById('sandbox-quick-cmds');
    if (quickCmds) quickCmds.style.display = '';
  }

  // Click on screen to focus the v86 canvas for keyboard input
  if (screen) {
    screen.addEventListener('click', function() {
      var canvas = screen.querySelector('canvas');
      if (canvas) canvas.focus();
    });
  }
}

function sandboxSend(cmd) {
  if (_sandboxEmulator) {
    _sandboxEmulator.keyboard_send_text(cmd + '\n');
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

document.addEventListener('DOMContentLoaded', init);
