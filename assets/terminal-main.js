/* ============================================================
   TERMINAL PRINCIPAL — Instance du moteur unifié
   ============================================================ */
let VFS = null; // Chargé depuis data/vfs.json
let BASE_VFS = null;
let ACTIVE_SCENARIO_ID = 'base';
let mainTerminal = null;

function initMainTerminal(vfsData) {
  BASE_VFS = JSON.parse(JSON.stringify(vfsData));
  VFS = JSON.parse(JSON.stringify(vfsData));
  mainTerminal = createTerminalEngine({
  vfs: VFS,
  outputElId: 'terminal-output',
  inputElId: 'terminal-input',
  promptLabelElId: 'terminal-prompt-label',
  promptFn: function(dir) {
    var display = dir.replace('/home/user', '~');
    return '<span class="t-user">user@linux</span><span class="t-sep">:</span><span class="t-dir">' + display + '</span><span class="t-dollar">$</span>';
  },
  userInfo: { user: 'user', hostname: 'user-pc', uid: '1000', gid: '1000', extraGroups: ',4(adm),27(sudo)', groups: 'user : user adm cdrom sudo dip plugdev lxd' },
  manPages: {
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
  },
  helpHtml: '<div class="help-grid">'
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
    + '</div>',
  extraCommands: createPedagogicalCommands()
});

}

function activateMainTerminalScenario(overlay, scenarioId) {
  if (!mainTerminal || !BASE_VFS || typeof applyVfsOverlay !== 'function') return;
  scenarioId = scenarioId || 'base';
  if (ACTIVE_SCENARIO_ID === scenarioId) return;
  VFS = applyVfsOverlay(BASE_VFS, overlay || {});
  mainTerminal.setVfs(VFS);
  mainTerminal.setCurrentDir('/home/user');
  ACTIVE_SCENARIO_ID = scenarioId;
}

function getMainScenario() {
  try {
    var node = mainTerminal && mainTerminal.getVfs()['/etc/linuxpath-scenario.json'];
    return node && node.type === 'file' ? JSON.parse(node.content) : {};
  } catch (_) { return {}; }
}

/* Global wrapper functions for backward compatibility */
function termPrint(html, cls) { mainTerminal.print(html, cls); }
function termCommand(html) { mainTerminal.cmdEcho(html); }
function processTerminalCommand(input) { mainTerminal.exec(input); }
function updatePromptLabel() { mainTerminal.updatePromptLabel(); }

function toggleFaq(el) {
  var content = el.nextElementSibling;
  if (!content) return;
  var isOpen = content.style.maxHeight && content.style.maxHeight !== '0px';
  content.style.maxHeight = isOpen ? '0' : content.scrollHeight + 'px';
  el.classList.toggle('active', !isOpen);
}

function setTerminalMinimized(minimized) {
  var sec = document.getElementById('terminal-section');
  var icon = document.getElementById('term-toggle-icon');
  var toggle = document.getElementById('terminal-toggle');
  if (!sec) return;
  sec.classList.toggle('minimized', !!minimized);
  if (icon) icon.textContent = minimized ? '▲' : '▼';
  if (toggle) toggle.setAttribute('aria-expanded', minimized ? 'false' : 'true');
}

function toggleTerminal() {
  var sec = document.getElementById('terminal-section');
  if (!sec) return;
  setTerminalMinimized(!sec.classList.contains('minimized'));
}

function focusTerminal() {
  setTerminalMinimized(false);
  var inp = document.getElementById('terminal-input');
  if (inp) inp.focus();
  closeSidebar();
}

function initTerminal() {
  if (!mainTerminal) {
    console.error('Terminal non initialisé. Appelez initMainTerminal() d\'abord.');
    return;
  }
  var input = document.getElementById('terminal-input');
  if (!input) return;

  setTerminalMinimized(true);

  mainTerminal.initInput();
  mainTerminal.print('<span class="t-green">LinuxPath Terminal v1.0 — Tapez <strong>help</strong> pour la liste des commandes.</span>', 'term-output');
  mainTerminal.print('<span class="t-muted">Répertoire courant : ' + escapeHtml(mainTerminal.getCurrentDir()) + '</span>', 'term-output');
  mainTerminal.updatePromptLabel();

  // Click-to-focus on terminal section
  var termSection2 = document.getElementById('terminal-section');
  if (termSection2) {
    termSection2.addEventListener('click', function(e) {
      if (!e.target.closest('.terminal-titlebar')) {
        var inp = document.getElementById('terminal-input');
        if (inp) inp.focus();
      }
    });
  }
}
