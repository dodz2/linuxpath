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
      + '<span class="ctf-card-title">' + escapeHtml(ch.title) + '</span>'
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
  // Rafraîchir la grille (statuts résolus)
  renderCTFGrid();
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

	// Initialiser l'input (initInput clone l'élément pour supprimer les anciens listeners)
	ctfTerminal.initInput();
}


/* --- Terminal CTF isolé (utilise createTerminalEngine) --- */
var ctfVfs         = {};

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
    base64: function(args) {
      if (args[0] === '-d' && args[1]) {
        try {
          var decoded = atob(args[1]);
          ctfTerminal.print(escapeHtml(decoded), 'term-output');
        } catch(e) {
          ctfTerminal.print('<span class="t-err">base64 : données invalides</span>');
        }
      } else if (args[0]) {
        var t = ctfTerminal.resolvePath(args[0]);
        var v = ctfTerminal.getVfs();
        if (v[t] && v[t].content) {
          ctfTerminal.print(escapeHtml(btoa(v[t].content)), 'term-output');
        } else {
          ctfTerminal.print('<span class="t-err">base64 : ' + escapeHtml(args[0]) + ' : Aucun fichier</span>');
        }
      } else {
        ctfTerminal.print('<span class="t-muted">Usage : base64 -d &lt;chaine_base64&gt;</span>');
      }
    },
    ps: function(args) {
      if (args.includes('aux') || args.includes('-aux') || args.includes('-ef')) {
        ctfTerminal.print('<span class="t-muted">USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND</span>', 'term-output');
        ctfTerminal.print('root           1  0.0  0.1 168380 13008 ?        Ss   10:00   0:02 /sbin/init', 'term-output');
        ctfTerminal.print('root         891  0.0  0.0  72300  5612 ?        Ss   10:00   0:00 /usr/sbin/sshd -D', 'term-output');
        ctfTerminal.print('ctf         1023  0.0  0.0  10596  5120 pts/0    Ss   10:02   0:00 bash', 'term-output');
        ctfTerminal.print('root        9342  0.3  0.1  18240  7680 ?        S    14:32   0:01 /usr/local/bin/beacon --token flag{process_arguments_exposed} --interval 30', 'term-output');
        ctfTerminal.print('ctf         9999  0.0  0.0  12940  3712 pts/0    R+   14:35   0:00 ps aux', 'term-output');
      } else {
        ctfTerminal.print('<span class="t-muted">  PID TTY          TIME CMD</span>', 'term-output');
        ctfTerminal.print(' 1023 pts/0    00:00:00 bash', 'term-output');
        ctfTerminal.print(' 9999 pts/0    00:00:00 ps', 'term-output');
      }
    },
    awk: function() {
      ctfTerminal.print('<span class="t-muted">(awk : commande disponible — utilise grep d\'abord pour isoler les lignes)</span>', 'term-output');
    },
    cut: function() {
      ctfTerminal.print('<span class="t-muted">(cut : commande disponible — utilise grep d\'abord pour isoler les lignes)</span>', 'term-output');
    },
    dig: function(args) {
      // Simulated dig command — reads _dns from current challenge
      var ch = CTF_CHALLENGES.find(function(c){ return c.id === ctfCurrentId; });
      var dns = ch && ch._dns;
      if (!dns) {
        ctfTerminal.print('<span class="t-err">dig : serveur DNS non disponible dans ce challenge</span>');
        return;
      }
      if (!args[0]) {
        ctfTerminal.print('<span class="t-muted">Usage : dig &lt;domaine&gt; [A|CNAME|TXT]</span>');
        return;
      }
      var domain = args[0];
      var qtype = (args[1] || '').toUpperCase();
      var record = dns[domain];
      if (!record) {
        ctfTerminal.print('<span class="t-muted">;; QUESTION SECTION:</span>', 'term-output');
        ctfTerminal.print(';; ' + domain + ' IN ' + (qtype || 'A'), 'term-output');
        ctfTerminal.print('', 'term-output');
        ctfTerminal.print('<span class="t-muted">;; ANSWER SECTION:</span>', 'term-output');
        ctfTerminal.print('<span class="t-err">;; NXDOMAIN — domaine introuvable</span>', 'term-output');
        return;
      }
      ctfTerminal.print('<span class="t-muted">; &lt;&lt;&gt;&gt; DiG 9.18.1 &lt;&lt;&gt;&gt; ' + domain + ' ' + (qtype || 'A') + '</span>', 'term-output');
      ctfTerminal.print('<span class="t-muted">;; QUESTION SECTION:</span>', 'term-output');
      ctfTerminal.print(';; ' + domain + '\t\tIN\t' + (qtype || 'A'), 'term-output');
      ctfTerminal.print('', 'term-output');
      ctfTerminal.print('<span class="t-muted">;; ANSWER SECTION:</span>', 'term-output');
      if (qtype === 'TXT' && record.txt) {
        ctfTerminal.print(domain + '\t300\tIN\tTXT\t"' + record.txt + '"', 'term-output');
      } else if (record.type === 'CNAME') {
        ctfTerminal.print(domain + '\t300\tIN\tCNAME\t' + record.value, 'term-output');
      } else if (record.type === 'A') {
        ctfTerminal.print(domain + '\t300\tIN\tA\t' + record.value, 'term-output');
        if (!qtype && record.txt) {
          ctfTerminal.print('<span class="t-muted">;; TXT record also available — try: dig ' + domain + ' TXT</span>', 'term-output');
        }
      }
      ctfTerminal.print('', 'term-output');
      ctfTerminal.print('<span class="t-muted">;; Query time: 12 msec</span>', 'term-output');
      ctfTerminal.print('<span class="t-muted">;; SERVER: 10.0.0.53#53</span>', 'term-output');
    },
    tcpdump: function(args) {
      // Simulated tcpdump — reads capture file from VFS
      if (args[0] === '-r' && args[1]) {
        var path = ctfTerminal.resolvePath(args[1]);
        var vfs = ctfTerminal.getVfs();
        if (vfs[path] && vfs[path].content) {
          var lines = vfs[path].content.split('\n');
          lines.forEach(function(line) {
            if (line.trim()) ctfTerminal.print(escapeHtml(line), 'term-output');
          });
        } else {
          ctfTerminal.print('<span class="t-err">tcpdump : ' + escapeHtml(args[1]) + ' : Fichier introuvable</span>');
        }
      } else {
        ctfTerminal.print('<span class="t-muted">Usage : tcpdump -r &lt;fichier.pcap&gt;</span>');
      }
    },
    ss: function(args) {
      // Simulated ss command — reads _ss from current challenge
      var ch = CTF_CHALLENGES.find(function(c){ return c.id === ctfCurrentId; });
      var ssData = ch && ch._ss;
      if (!ssData) {
        ctfTerminal.print('<span class="t-err">ss : données non disponibles dans ce challenge</span>');
        return;
      }
      if (args.join('').match(/t.*l.*n.*p|tlnp|-tlnp/)) {
        var lines = ssData.split('\n');
        lines.forEach(function(line) {
          if (line.trim()) ctfTerminal.print(escapeHtml(line), 'term-output');
        });
      } else {
        ctfTerminal.print('<span class="t-muted">Usage : ss -tlnp  (TCP listen, numeric, process)</span>');
      }
    },
    nft: function(args) {
      // Simulated nft command — reads _nft from current challenge
      var ch = CTF_CHALLENGES.find(function(c){ return c.id === ctfCurrentId; });
      var nftData = ch && ch._nft;
      if (!nftData) {
        ctfTerminal.print('<span class="t-err">nft : données non disponibles dans ce challenge</span>');
        return;
      }
      if (args.join(' ').match(/list\s+ruleset/)) {
        var lines = nftData.split('\n');
        lines.forEach(function(line) {
          ctfTerminal.print(escapeHtml(line), 'term-output');
        });
      } else {
        ctfTerminal.print('<span class="t-muted">Usage : nft list ruleset</span>');
      }
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
