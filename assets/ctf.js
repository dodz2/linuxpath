/* ============================================================
   CTF CHALLENGES
   ============================================================ */

let CTF_CHALLENGES = [];   // chargé depuis data/ctf.json
let CTF_CATALOGUE_STATUS = 'idle'; // idle | loading | ready | empty | error
let ctfCurrentId   = null; // id du challenge ouvert

function isCTFRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeCTFText(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized || null;
}

function isValidCTFVfs(vfs) {
  if (!isCTFRecord(vfs) || !isCTFRecord(vfs['/']) || vfs['/'].type !== 'dir') return false;
  const paths = Object.keys(vfs);
  if (!paths.length) return false;

  return paths.every(function(path) {
    const node = vfs[path];
    if (typeof path !== 'string' || path.trim() !== path || path.charAt(0) !== '/' || !isCTFRecord(node)) return false;
    if (node.type === 'file') {
      return typeof node.content === 'string'
        && (node.perms === undefined || typeof node.perms === 'string');
    }
    if (node.type !== 'dir' || !Array.isArray(node.children)) return false;
    const uniqueChildren = new Set(node.children);
    return uniqueChildren.size === node.children.length && node.children.every(function(child) {
      if (typeof child !== 'string' || !child || child.trim() !== child || child.indexOf('/') !== -1) return false;
      const childPath = path === '/' ? '/' + child : path + '/' + child;
      return Object.prototype.hasOwnProperty.call(vfs, childPath);
    });
  });
}

function isValidCTFDns(value) {
  if (!isCTFRecord(value)) return false;
  return Object.keys(value).every(function(domain) {
    const record = value[domain];
    return Boolean(normalizeCTFText(domain))
      && isCTFRecord(record)
      && (record.type === 'A' || record.type === 'CNAME')
      && Boolean(normalizeCTFText(record.value))
      && (record.txt === undefined || typeof record.txt === 'string');
  });
}

function normalizeCTFChallenge(raw) {
  if (!isCTFRecord(raw)) return null;
  const id = normalizeCTFText(raw.id);
  const title = normalizeCTFText(raw.title);
  const difficulty = typeof raw.difficulty === 'string' ? raw.difficulty.trim().toLowerCase() : '';
  const context = normalizeCTFText(raw.context);
  const objective = normalizeCTFText(raw.objective);
  const normalizedFlagHash = normalizeCTFText(raw.flagHash);
  const flagHash = normalizedFlagHash ? normalizedFlagHash.toLowerCase() : '';
  const hints = Array.isArray(raw.hints) ? raw.hints.map(normalizeCTFText) : null;

  if (!id || !title || !context || !objective
    || ['easy', 'medium', 'hard'].indexOf(difficulty) === -1
    || !/^[0-9a-f]{64}$/.test(flagHash)
    || !hints || hints.some(function(hint) { return !hint; })
    || !isValidCTFVfs(raw.vfs)
    || (raw._dns !== undefined && !isValidCTFDns(raw._dns))
    || (raw._ss !== undefined && typeof raw._ss !== 'string')
    || (raw._nft !== undefined && typeof raw._nft !== 'string')) {
    return null;
  }

  return Object.assign({}, raw, {
    id: id,
    title: title,
    difficulty: difficulty,
    context: context,
    objective: objective,
    hints: hints,
    flagHash: flagHash
  });
}

function normalizeCTFCatalogue(raw) {
  if (!isCTFRecord(raw) || !Array.isArray(raw.challenges)) return null;
  const challenges = raw.challenges.map(normalizeCTFChallenge);
  if (challenges.some(function(challenge) { return !challenge; })) return null;
  const ids = new Set(challenges.map(function(challenge) { return challenge.id; }));
  return ids.size === challenges.length ? challenges : null;
}

async function loadCTFCatalogue() {
  CTF_CATALOGUE_STATUS = 'loading';
  try {
    renderCTFGrid();
    const response = await fetch('data/ctf.json');
    if (!response.ok) throw new Error('catalogue unavailable');
    const challenges = normalizeCTFCatalogue(await response.json());
    if (!challenges) throw new Error('invalid catalogue');
    CTF_CHALLENGES = challenges;
    CTF_CATALOGUE_STATUS = CTF_CHALLENGES.length ? 'ready' : 'empty';
    updateCTFBadge();
    renderCTFGrid();
    return true;
  } catch (_) {
    CTF_CHALLENGES = [];
    CTF_CATALOGUE_STATUS = 'error';
    try { updateCTFBadge(); } catch (_) { /* affichage best-effort */ }
    try { renderCTFGrid(); } catch (_) { /* ne jamais bloquer l'initialisation */ }
    return false;
  }
}

/* --- State CTF --- */
// Clés IndexedDB / localStorage
const CTF_STORAGE_KEYS = {
  solved: 'lt_ctf_solved',  // Set des ids résolus
  hints:  'lt_ctf_hints',   // { id: nbIndicesAffichés }
  how:    'lt_ctf_how'      // { id: 'autonomous' | 'with_help' }
};

let ctfState = {
  solved: new Set(),
  hints:  {},
  how:    {}
};

async function saveCTFState() {
  await Promise.all([
    storage.set(CTF_STORAGE_KEYS.solved, JSON.stringify([...ctfState.solved])),
    storage.set(CTF_STORAGE_KEYS.hints,  JSON.stringify(ctfState.hints)),
    storage.set(CTF_STORAGE_KEYS.how,    JSON.stringify(ctfState.how || {}))
  ]);
}

async function loadCTFState() {
  const isStringArray = function(value) {
    return Array.isArray(value) && value.every(function(entry) { return typeof entry === 'string'; });
  };
  const isHintRecord = function(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
      && Object.values(value).every(function(count) { return Number.isInteger(count) && count >= 0; });
  };
  const isHowRecord = function(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
      && Object.values(value).every(function(mode) { return mode === 'autonomous' || mode === 'with_help'; });
  };
  const [solved, hints, how] = await Promise.all([
    readStoredJson(CTF_STORAGE_KEYS.solved, [], isStringArray, 'ctf'),
    readStoredJson(CTF_STORAGE_KEYS.hints, {}, isHintRecord, 'ctf'),
    readStoredJson(CTF_STORAGE_KEYS.how, {}, isHowRecord, 'ctf')
  ]);
  ctfState.solved = new Set(solved);
  ctfState.hints = hints;
  ctfState.how = how;
  updateCTFBadge();
}



/* --- Normalisation du flag soumis --- */
function normalizeFlag(raw) {
  return raw.trim().toLowerCase();
}

/* --- Mise à jour du badge sidebar CTF --- */
function updateCTFBadge() {
  const badge = document.getElementById('nav-badge-ctf');
  if (badge) badge.textContent = ctfState.solved.size + '/' + (CTF_CHALLENGES.length || 0);
  const homeStat = document.getElementById('home-stat-challenges');
  if (homeStat) homeStat.textContent = String(CTF_CHALLENGES.length || 0);
}

/* --- Rendu des états du catalogue sans exposer les erreurs brutes --- */
function renderCTFCatalogueMessage(grid, status) {
  const message = document.createElement('div');
  message.className = 'ctf-catalogue-message';

  const text = document.createElement('p');
  if (status === 'error') {
    message.classList.add('ctf-catalogue-error');
    message.setAttribute('role', 'alert');
    text.textContent = 'Impossible de charger le catalogue CTF. Vérifiez votre connexion puis réessayez.';
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'ctf-catalogue-retry';
    retry.textContent = 'Réessayer';
    retry.dataset.action = 'load-ctf-catalogue';
    message.append(text, retry);
  } else {
    message.setAttribute('role', 'status');
    message.setAttribute('aria-live', 'polite');
    text.textContent = status === 'empty'
      ? 'Le catalogue CTF est disponible, mais ne contient aucun challenge pour le moment.'
      : 'Chargement du catalogue CTF…';
    message.appendChild(text);
  }
  grid.replaceChildren(message);
}

/* --- Rendu de la grille des cards --- */
function renderCTFGrid() {
  const grid = document.getElementById('ctf-grid');
  if (!grid) return;
  if (CTF_CATALOGUE_STATUS === 'error' || CTF_CATALOGUE_STATUS === 'empty' || CTF_CATALOGUE_STATUS === 'loading') {
    renderCTFCatalogueMessage(grid, CTF_CATALOGUE_STATUS);
    return;
  }
  if (!CTF_CHALLENGES.length) return;
  grid.innerHTML = '';

  const stats = getCurriculumStats();
  const ctfItems = document.querySelectorAll('#section-ctf .module-meta-item');
  if (ctfItems.length >= 4) {
    ctfItems[0].textContent = '🚩 ' + stats.challenges + ' challenges';
    ctfItems[1].textContent = '🟢 ' + stats.difficulty.easy + ' faciles';
    ctfItems[2].textContent = '🟡 ' + stats.difficulty.medium + ' moyens';
    ctfItems[3].textContent = '🔴 ' + stats.difficulty.hard + ' difficiles';
  }

  const diffLabels = { easy: 'Facile', medium: 'Moyen', hard: 'Difficile' };
  const diffClasses = { easy: 'ctf-diff-easy', medium: 'ctf-diff-medium', hard: 'ctf-diff-hard' };

  CTF_CHALLENGES.forEach(function(ch) {
    const solved = ctfState.solved.has(ch.id);
    const card = document.createElement('div');
    card.className = 'ctf-card' + (solved ? ' solved' : '');
    card.id = 'ctf-card-' + ch.id;
    card.innerHTML =
      '<div class="ctf-card-top">'
      + '<span class="ctf-card-title">' + escapeHtml(ch.title) + '</span>'
      + '<span class="ctf-difficulty-badge ' + diffClasses[ch.difficulty] + '">' + (diffLabels[ch.difficulty] || ch.difficulty) + '</span>'
      + '</div>'
      + '<p class="ctf-card-desc">' + ch.context.replace(/<[^>]+>/g, '').slice(0, 100) + '…</p>'
      + '<div class="ctf-card-footer">'
      + '<span class="ctf-status-badge' + (solved ? ' solved' : '') + '">'
      + (solved ? '✓ Résolu' : '○ Non résolu')
      + '</span>'
      + '<button class="ctf-card-btn" data-action="open-ctf-challenge" data-challenge-id="' + escapeHtml(ch.id) + '">'
      + (solved ? '↺ Rejouer' : '▶ Relever le défi')
      + '</button>'
      + '</div>';
    grid.appendChild(card);
  });
}

/* --- Hints CTF --- */
var ctfCurrentHints = [];
var ctfHintIndex    = 0;

function renderCTFHints(ch) {
  ctfCurrentHints = ch.hints || [];
  ctfHintIndex    = (ctfState.hints[ch.id] != null) ? ctfState.hints[ch.id] : 0;

  var list = document.getElementById('ctf-hints-list');
  var btn  = document.getElementById('ctf-hint-btn');
  if (list) list.innerHTML = '';

  for (var i = 0; i < ctfHintIndex && i < ctfCurrentHints.length; i++) {
    var div = document.createElement('div');
    div.className = 'ctf-hint-item';
    div.innerHTML = '<span class="ctf-hint-num">Indice ' + (i + 1) + ' :</span> ' + ctfCurrentHints[i];
    if (list) list.appendChild(div);
  }

  if (btn) {
    if (ctfCurrentHints.length === 0) {
      btn.style.display = 'none';
    } else if (ctfHintIndex >= ctfCurrentHints.length) {
      btn.style.display = '';
      btn.textContent   = 'Tous les indices affichés';
      btn.disabled      = true;
    } else {
      btn.style.display = '';
      btn.disabled      = false;
      var remaining = ctfCurrentHints.length - ctfHintIndex;
      btn.textContent = 'Afficher un indice (' + remaining + ' restant' + (remaining > 1 ? 's' : '') + ')';
    }
  }
}

function showNextCTFHint() {
  if (ctfHintIndex >= ctfCurrentHints.length) return;

  var list = document.getElementById('ctf-hints-list');
  var div  = document.createElement('div');
  div.className = 'ctf-hint-item';
  div.innerHTML = '<span class="ctf-hint-num">Indice ' + (ctfHintIndex + 1) + ' :</span> ' + ctfCurrentHints[ctfHintIndex];
  if (list) list.appendChild(div);

  ctfHintIndex++;
  if (ctfCurrentId) {
    ctfState.hints[ctfCurrentId] = ctfHintIndex;
    saveCTFState();
  }

  var btn = document.getElementById('ctf-hint-btn');
  if (btn) {
    if (ctfHintIndex >= ctfCurrentHints.length) {
      btn.textContent = 'Tous les indices affichés';
      btn.disabled    = true;
    } else {
      var remaining = ctfCurrentHints.length - ctfHintIndex;
      btn.textContent = 'Afficher un indice (' + remaining + ' restant' + (remaining > 1 ? 's' : '') + ')';
    }
  }
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
  renderCTFGrid();
}

function tokenizeCtfCommand(input) {
  var tokens = [];
  var current = '';
  var quote = null;
  var text = String(input || '');
  for (var i = 0; i < text.length; i++) {
    var ch = text[i];
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
      continue;
    }
    if (ch === "'" || ch === '"') { quote = ch; continue; }
    if (ch === '|') {
      if (current) { tokens.push(current); current = ''; }
      tokens.push('|');
      continue;
    }
    if (/\s/.test(ch)) {
      if (current) { tokens.push(current); current = ''; }
      continue;
    }
    current += ch;
  }
  if (current) tokens.push(current);
  return tokens;
}

function rewriteCtfCommand(input) {
  var tokens = tokenizeCtfCommand(input);
  if (!tokens.length) return '';
  var stages = [];
  var stage = [];
  tokens.forEach(function (token) {
    if (token === '|') { stages.push(stage); stage = []; }
    else stage.push(token);
  });
  stages.push(stage);
  if (stages.length === 2 && stages[0][0] === 'echo' && stages[1][0] === 'base64' && stages[1].indexOf('-d') >= 0) {
    return ['base64', '-d'].concat(stages[0].slice(1)).join(' ');
  }
  if (stages.some(function (parts) { return parts[0] === 'awk'; })) return String(input).trim();
  return stages.map(function (parts) { return parts.join(' '); }).join(' | ');
}

async function hashFlag(value) {
  var bytes = new TextEncoder().encode(value);
  var digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map(function (b) {
    return b.toString(16).padStart(2, '0');
  }).join('');
}

function setCtfFlagFeedback(kind, message) {
  var feedback = document.getElementById('ctf-flag-feedback');
  if (!feedback) return;
  feedback.className = 'ctf-flag-feedback' + (kind ? ' ' + kind : '');
  feedback.textContent = message;
}

async function submitCTFFlag() {
  var ch = CTF_CHALLENGES.find(function (c) { return c.id === ctfCurrentId; });
  var input = document.getElementById('ctf-flag-input');
  if (!ch || !input) return;
  var normalized = normalizeFlag(input.value);
  if (!normalized) {
    setCtfFlagFeedback('error', 'Entre un flag au format flag{…}.');
    return;
  }
  var digest = await hashFlag(normalized);
  if (digest !== ch.flagHash) {
    setCtfFlagFeedback('error', 'Flag incorrect. Réessaye.');
    return;
  }
  var hintsUsed = ctfState.hints[ch.id] || 0;
  ctfState.solved.add(ch.id);
  ctfState.how = ctfState.how || {};
  ctfState.how[ch.id] = hintsUsed > 0 ? 'with_help' : 'autonomous';
  await saveCTFState();
  input.value = '✓ Challenge résolu !';
  input.disabled = true;
  setCtfFlagFeedback('success', hintsUsed > 0
    ? 'Bravo ! Challenge résolu avec un peu d’aide.'
    : 'Bravo ! Challenge résolu.');
  updateCTFBadge();
  renderCTFGrid();
}

function resetCtfInput() {
  var input = document.getElementById('ctf-terminal-input');
  if (!input || !input.parentNode) return;
  var fresh = input.cloneNode(true);
  input.parentNode.replaceChild(fresh, input);
  fresh.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      var val = fresh.value.trim();
      if (val) { ctfTerminal.exec(val); fresh.value = ''; }
    }
  });
}

function resetCTFTerminal() {
  if (!ctfCurrentId) return;
  loadCTFChallenge(ctfCurrentId);
}

/* --- Charger un challenge dans le terminal CTF --- */
function loadCTFChallenge(id) {
	const ch = CTF_CHALLENGES.find(function(c){ return c.id === id; });
	if (!ch) return;

	// Charger le VFS du challenge dans le terminal CTF
	ctfVfs = ch.vfs || {};
	ctfTerminal.setVfs(ctfVfs);
	ctfTerminal.setCurrentDir('/');
	ctfCurrentId = id;

	// Vider le terminal et afficher le message de départ
	const out = document.getElementById('ctf-terminal-output');
	if (out) out.innerHTML = '';
	ctfTerminal.print('<span class="t-red">🚩 Challenge : ' + escapeHtml(ch.title) + '</span>', 'term-output');
	ctfTerminal.print('<span class="t-muted">Explore le système de fichiers pour trouver le flag. Tape <strong>help</strong> pour les commandes disponibles.</span>', 'term-output');
	ctfTerminal.updatePromptLabel();
	resetCtfInput();
}


/* --- Terminal CTF isolé (utilise createTerminalEngine) --- */
var ctfVfs         = {};

function ctfCommandSuccess(lines) {
  return {
    exitCode: 0,
    stdout: Array.isArray(lines) ? lines : (lines == null ? [] : [lines]),
    stderr: [],
    stateChanges: []
  };
}

function ctfCommandFailure(message, exitCode) {
  return {
    exitCode: exitCode || 1,
    stdout: [],
    stderr: [message],
    stateChanges: []
  };
}

var ctfTerminal = createTerminalEngine({
  vfs: ctfVfs,
  outputElId: 'ctf-terminal-output',
  inputElId: 'ctf-terminal-input',
  promptLabelElId: 'ctf-terminal-prompt',
  promptFn: function(dir) {
    var display = dir.replace('/home/user', '~');
    return '<span style="color:var(--accent-red)">ctf@challenge</span><span class="t-sep">:</span><span class="t-dir">' + display + '</span><span class="t-dollar">$</span>';
  },
  userInfo: { user: 'ctf', uid: '1337', gid: '1337', hostname: 'challenge-box' },
  permCheck: true,
  recursiveFind: true,
  extraCommands: {
    base64: function(args, ctx, stdin) {
      if (args[0] === '-d') {
        var payload = args[1] != null ? args[1] : (stdin || []).join('');
        if (!payload) return ctfCommandFailure('base64 : données manquantes', 2);
        try {
          return ctfCommandSuccess(atob(payload));
        } catch(e) {
          return ctfCommandFailure('base64 : données invalides');
        }
      }
      if (args[0]) {
        var t = ctx.resolvePath(args[0]);
        if (ctx.vfs[t] && ctx.vfs[t].type === 'file') {
          return ctfCommandSuccess(btoa(ctx.vfs[t].content || ''));
        }
        return ctfCommandFailure('base64 : ' + args[0] + ' : Aucun fichier');
      }
      return ctfCommandFailure('Usage : base64 -d <chaine_base64>', 2);
    },
    ps: function(args) {
      if (args.includes('aux') || args.includes('-aux') || args.includes('-ef')) {
        return ctfCommandSuccess([
          'USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND',
          'root           1  0.0  0.1 168380 13008 ?        Ss   10:00   0:02 /sbin/init',
          'root         891  0.0  0.0  72300  5612 ?        Ss   10:00   0:00 /usr/sbin/sshd -D',
          'ctf         1023  0.0  0.0  10596  5120 pts/0    Ss   10:02   0:00 bash',
          'root        9342  0.3  0.1  18240  7680 ?        S    14:32   0:01 /usr/local/bin/beacon --token flag{process_arguments_exposed} --interval 30',
          'ctf         9999  0.0  0.0  12940  3712 pts/0    R+   14:35   0:00 ps aux'
        ]);
      }
      return ctfCommandSuccess([
        '  PID TTY          TIME CMD',
        ' 1023 pts/0    00:00:00 bash',
        ' 9999 pts/0    00:00:00 ps'
      ]);
    },
    dig: function(args) {
      // Simulated dig command — reads _dns from current challenge
      var ch = CTF_CHALLENGES.find(function(c){ return c.id === ctfCurrentId; });
      var dns = ch && ch._dns;
      if (!dns) return ctfCommandFailure('dig : serveur DNS non disponible dans ce challenge');
      if (!args[0]) return ctfCommandFailure('Usage : dig <domaine> [A|CNAME|TXT]', 2);

      var domain = args[0];
      var qtype = (args[1] || '').toUpperCase();
      var record = dns[domain];
      var lines = [
        '; <<>> DiG 9.18.1 <<>> ' + domain + ' ' + (qtype || 'A'),
        ';; QUESTION SECTION:',
        ';; ' + domain + '\t\tIN\t' + (qtype || 'A'),
        '',
        ';; ANSWER SECTION:'
      ];
      if (!record) {
        return {
          exitCode: 1,
          stdout: lines,
          stderr: [';; NXDOMAIN — domaine introuvable'],
          stateChanges: []
        };
      }
      if (qtype === 'TXT' && record.txt) {
        lines.push(domain + '\t300\tIN\tTXT\t"' + record.txt + '"');
      } else if (record.type === 'CNAME') {
        lines.push(domain + '\t300\tIN\tCNAME\t' + record.value);
      } else if (record.type === 'A') {
        lines.push(domain + '\t300\tIN\tA\t' + record.value);
        if (!qtype && record.txt) lines.push(';; TXT record also available — try: dig ' + domain + ' TXT');
      }
      lines.push('', ';; Query time: 12 msec', ';; SERVER: 10.0.0.53#53');
      return ctfCommandSuccess(lines);
    },
    tcpdump: function(args, ctx) {
      // Simulated tcpdump — reads capture file from VFS
      if (args[0] !== '-r' || !args[1]) return ctfCommandFailure('Usage : tcpdump -r <fichier.pcap>', 2);
      var path = ctx.resolvePath(args[1]);
      if (!ctx.vfs[path] || ctx.vfs[path].type !== 'file') {
        return ctfCommandFailure('tcpdump : ' + args[1] + ' : Fichier introuvable');
      }
      return ctfCommandSuccess(String(ctx.vfs[path].content || '').split('\n').filter(function(line) {
        return line.trim();
      }));
    },
    ss: function(args) {
      // Simulated ss command — reads _ss from current challenge
      var ch = CTF_CHALLENGES.find(function(c){ return c.id === ctfCurrentId; });
      var ssData = ch && ch._ss;
      if (!ssData) return ctfCommandFailure('ss : données non disponibles dans ce challenge');
      if (!args.join('').match(/t.*l.*n.*p|tlnp|-tlnp/)) {
        return ctfCommandFailure('Usage : ss -tlnp  (TCP listen, numeric, process)', 2);
      }
      return ctfCommandSuccess(ssData.split('\n').filter(function(line) {
        return line.trim();
      }));
    },
    nft: function(args) {
      // Simulated nft command — reads _nft from current challenge
      var ch = CTF_CHALLENGES.find(function(c){ return c.id === ctfCurrentId; });
      var nftData = ch && ch._nft;
      if (!nftData) return ctfCommandFailure('nft : données non disponibles dans ce challenge');
      if (!args.join(' ').match(/list\s+ruleset/)) {
        return ctfCommandFailure('Usage : nft list ruleset', 2);
      }
      return ctfCommandSuccess(nftData.split('\n'));
    }
  },
  helpHtml: '<div class="help-grid">'
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
    + '<span class="t-blue">dig &lt;domain&gt; [TXT]</span> — DNS lookup<br>'
    + '<span class="t-blue">tcpdump -r &lt;f&gt;</span> — lire capture<br>'
    + '<span class="t-blue">ss -tlnp</span> — ports en écoute<br>'
    + '<span class="t-blue">nft list ruleset</span> — règles pare-feu<br>'
    + '<span class="t-blue">man [cmd]</span> — aide</div>'
    + '</div>',
  manPages: {
    ls:     'ls [-la] [dir] — lister les fichiers. -l format long, -a afficher les cachés',
    cat:    'cat [fichier] — afficher le contenu d\'un fichier',
    find:   'find [dir] [-name motif] — rechercher des fichiers',
    grep:   'grep [motif] [fichier] — filtrer les lignes contenant un motif',
    base64: 'base64 -d &lt;chaine&gt; — décoder du base64',
    ps:     'ps aux — afficher tous les processus avec leurs arguments',
    cut:    'cut -d [sep] -f [n] [fichier] — extraire un champ',
    awk:    'awk \'{print $n}\' [fichier] — extraire une colonne',
    dig:    'dig &lt;domaine&gt; [A|TXT|CNAME] — interroger un serveur DNS',
    tcpdump:'tcpdump -r &lt;fichier.pcap&gt; — lire et afficher une capture réseau',
    ss:     'ss -tlnp — lister les ports TCP en écoute avec les processus associés',
    nft:    'nft list ruleset — afficher les règles nftables actives'
  }
});

/* Global wrapper functions for backward compatibility */
function ctfTermOutput(html, cls) { ctfTerminal.print(html, cls); }
function ctfTermCmdEcho(cmd) { ctfTerminal.cmdEcho(cmd); }
function processCTFCommand(input) { ctfTerminal.exec(input); }
function updateCTFPromptLabel() { ctfTerminal.updatePromptLabel(); }
function ctfSend(cmd) { ctfTerminal.exec(cmd); }

(function wrapCtfExec() {
  var rawExec = ctfTerminal.exec;
  ctfTerminal.exec = function (rawCmd) {
    if (!rawCmd || !rawCmd.trim()) return;
    rawExec(rewriteCtfCommand(rawCmd.trim()));
  };
}());
