

/**
 * createTerminalEngine(config) — Factory pour créer une instance de terminal.
 *
 * @param {Object} config
 * @param {Object} config.vfs            — Virtual filesystem
 * @param {string} config.outputElId     — ID de l'élément de sortie
 * @param {string} config.inputElId      — ID de l'input
 * @param {string} config.promptLabelElId— ID du label prompt
 * @param {Function} config.promptFn     — (currentDir) => HTML du prompt
 * @param {Object} config.userInfo       — { user, hostname, uid, gid, groups }
 * @param {Object} config.extraCommands  — { name: function(args, engine) }
 * @param {Object} config.manPages       — { cmd: 'HTML description' }
 * @param {string} config.helpHtml       — HTML pour la commande help
 * @param {boolean} config.permCheck     — Activer la vérification de permissions sur cat (CTF)
 * @param {boolean} config.recursiveFind — Utiliser find récursif (CTF)
 */
function createTerminalEngine(config) {
  let vfs        = config.vfs;
  let currentDir = '/home/user';
  let prevDir    = null;
  let cmdHistory = [];
  let historyIdx = -1;

  const userInfo   = config.userInfo || { user: 'user', hostname: 'user-pc', uid: '1000', gid: '1000', groups: 'user : user adm cdrom sudo dip plugdev lxd' };
  const promptFn   = config.promptFn;
  const extraCmds  = config.extraCommands || {};
  const manPages   = config.manPages || {};
  const helpHtml   = config.helpHtml || '';
  const permCheck  = config.permCheck || false;
  const recursiveFind = config.recursiveFind || false;

  /* --- Output helpers --- */
  function print(html, cls) {
    const out = document.getElementById(config.outputElId);
    if (!out) return;
    const line = document.createElement('div');
    line.className = 'term-line' + (cls ? ' ' + cls : '');
    line.innerHTML = html;
    out.appendChild(line);
    out.scrollTop = out.scrollHeight;
  }

  function cmdEcho(cmd) {
    const out = document.getElementById(config.outputElId);
    if (!out) return;
    const line = document.createElement('div');
    line.className = 'term-line term-cmd-echo';
    line.innerHTML = promptFn(currentDir) + ' <span class="t-input">' + escapeHtml(cmd) + '</span>';
    out.appendChild(line);
    out.scrollTop = out.scrollHeight;
  }

  function updatePromptLabel() {
    const label = document.getElementById(config.promptLabelElId);
    if (label) label.innerHTML = promptFn(currentDir);
  }

  /* --- Path resolution --- */
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

  /* --- Core commands --- */
  function handleLs(args) {
    const longFormat = args.some(function(a){ return a.match(/^-[a-zA-Z]*l/); });
    const showHidden = args.some(function(a){ return a.match(/^-[a-zA-Z]*a/); });
    const fileArg = args.filter(function(a){ return !a.startsWith('-'); })[0];
    const targetDir = fileArg ? resolvePath(fileArg) : currentDir;
    const singleFile = fileArg && vfs[targetDir] && vfs[targetDir].type === 'file';

    if (!vfs[targetDir]) {
      print('<span class="t-err">ls : impossible d\'accéder à \'' + escapeHtml(fileArg) + '\': Aucun fichier ou dossier de ce type</span>');
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
      print('<span class="t-muted">total ' + (items.length * 4) + '</span>', 'term-output');
      items.forEach(function(item) {
        let isDir = item.node && item.node.type === 'dir';
        const perm = item.node && item.node.perms ? item.node.perms : (isDir ? 'drwxr-xr-x' : '-rw-r--r--');
        const size = isDir ? '  4096' : String((item.node && item.node.content ? item.node.content.length : 0) + 128).padStart(6);
        const nameHtml = isDir ? '<span class="ls-dir">' + escapeHtml(item.name) + '/</span>'
          : item.name.endsWith('.sh') ? '<span class="ls-exec">' + escapeHtml(item.name) + '</span>'
          : item.name.startsWith('.') ? '<span class="ls-hidden">' + escapeHtml(item.name) + '</span>'
          : '<span class="ls-file">' + escapeHtml(item.name) + '</span>';
        print(escapeHtml(perm) + ' 1 ' + userInfo.user + ' ' + userInfo.user + ' ' + size + ' Dec 15 10:23 ' + nameHtml, 'term-output ls-line');
      });
    } else {
      const parts2 = items.map(function(item) {
        const isDir = item.node && item.node.type === 'dir';
        if (isDir) return '<span class="ls-dir">' + escapeHtml(item.name) + '</span>';
        if (item.name.endsWith('.sh')) return '<span class="ls-exec">' + escapeHtml(item.name) + '</span>';
        if (item.name.startsWith('.')) return '<span class="ls-hidden">' + escapeHtml(item.name) + '</span>';
        return '<span class="ls-file">' + escapeHtml(item.name) + '</span>';
      });
      print(parts2.join('  '), 'term-output');
    }
  }

  function handleCd(args) {
    const target = args[0];
    if (!target || target === '~' || target === '') {
      prevDir = currentDir; currentDir = '/home/user'; return;
    }
    if (target === '-') {
      if (prevDir) { var tmp = currentDir; currentDir = prevDir; prevDir = tmp; print(escapeHtml(currentDir), 'term-output'); }
      return;
    }
    const resolved = resolvePath(target);
    if (!vfs[resolved]) { print('<span class="t-err">bash: cd: ' + escapeHtml(target) + ': Aucun fichier ou dossier de ce type</span>'); return; }
    if (vfs[resolved].type !== 'dir') { print('<span class="t-err">bash: cd: ' + escapeHtml(target) + ': N\'est pas un répertoire</span>'); return; }
    prevDir = currentDir;
    currentDir = resolved;
  }

  /* --- Built-in commands shared by all terminals --- */
  const builtinCommands = {
    clear: function() {
      const out = document.getElementById(config.outputElId);
      if (out) out.innerHTML = '';
    },
    pwd: function() { print(escapeHtml(currentDir), 'term-output'); },
    whoami: function() { print(userInfo.user, 'term-output'); },
    hostname: function() { print(userInfo.hostname, 'term-output'); },
    id: function() { print('uid=' + userInfo.uid + '(' + userInfo.user + ') gid=' + userInfo.gid + '(' + userInfo.user + ') groupes=' + userInfo.gid + '(' + userInfo.user + ')' + (userInfo.extraGroups || ''), 'term-output'); },
    ls: function(args) { handleLs(args); },
    cd: function(args) { handleCd(args); },
    cat: function(args) {
      if (!args[0]) { print('<span class="t-err">cat : aucun fichier spécifié</span>'); return; }
      var t = resolvePath(args[0]);
      if (!vfs[t]) { print('<span class="t-err">cat : ' + escapeHtml(args[0]) + ' : Aucun fichier ou dossier de ce type</span>'); return; }
      if (vfs[t].type === 'dir') { print('<span class="t-err">cat : ' + escapeHtml(args[0]) + ' : est un répertoire</span>'); return; }
      if (permCheck && vfs[t].perms && vfs[t].perms.startsWith('-r--------')) {
        print('<span class="t-err">cat : ' + escapeHtml(args[0]) + ' : Permission non accordée</span>'); return;
      }
      var lines = (vfs[t].content || '').split('\n');
      lines.forEach(function(l){ print(escapeHtml(l), 'term-output'); });
    },
    echo: function(args) {
      var text = args.join(' ');
      if (!permCheck) { // main terminal: expand variables
        text = text.replace(/\$HOME/g,'/home/user').replace(/\$USER/g,userInfo.user).replace(/\$PWD/g,currentDir).replace(/\$SHELL/g,'/bin/bash').replace(/\$PATH/g,'/usr/local/sbin:/usr/local/bin:/usr/bin:/bin');
      }
      print(escapeHtml(text), 'term-output');
    },
    find: function(args) {
      if (recursiveFind) {
        // Recursive find (CTF style)
        var nonFlags = args.filter(function(a){ return !a.startsWith('-'); });
        var searchRoot = resolvePath(nonFlags[0] || '.');
        var nameIdx = args.indexOf('-name');
        var namePattern = nameIdx >= 0 ? args[nameIdx + 1] : null;
        var results = [];
        function findRecur(dirPath) {
          var node = vfs[dirPath];
          if (!node) return;
          if (!namePattern || dirPath.split('/').pop().includes(namePattern.replace(/\*/g,''))) {
            results.push(dirPath);
          }
          if (node.type === 'dir' && node.children) {
            node.children.forEach(function(child) {
              findRecur((dirPath === '/' ? '' : dirPath) + '/' + child);
            });
          }
        }
        if (!namePattern) results.push(searchRoot);
        var rootNode = vfs[searchRoot];
        if (rootNode && rootNode.children) {
          rootNode.children.forEach(function(child) {
            findRecur((searchRoot === '/' ? '' : searchRoot) + '/' + child);
          });
        }
        results.forEach(function(r){ print(escapeHtml(r), 'term-output'); });
        if (!results.length) print('<span class="t-muted">(aucun résultat)</span>');
      } else {
        // Simple find (main terminal)
        var searchDir = args.filter(function(a){return !a.startsWith('-');})[0] || '.';
        var resolved2 = resolvePath(searchDir);
        print(escapeHtml(searchDir), 'term-output');
        if (vfs[resolved2] && vfs[resolved2].children) {
          vfs[resolved2].children.forEach(function(c){ print(escapeHtml(searchDir) + '/' + escapeHtml(c), 'term-output'); });
        }
      }
    },
    grep: function(args) {
      var flags   = args.filter(function(a){ return a.startsWith('-'); });
      var nonFlag = args.filter(function(a){ return !a.startsWith('-'); });
      if (nonFlag.length < 2) { print('<span class="t-muted">(grep : spécifiez un motif et un fichier)</span>'); return; }
      var pattern = nonFlag[0];
      var file    = nonFlag[1];
      var t       = resolvePath(file);
      if (!vfs[t] || !vfs[t].content) { print('<span class="t-err">grep : ' + escapeHtml(file) + ' : Aucun fichier de ce type</span>'); return; }
      var ci = flags.includes('-i');
      var lines2 = vfs[t].content.split('\n').filter(function(l){
        return ci ? l.toLowerCase().includes(pattern.toLowerCase()) : l.toLowerCase().includes(pattern.toLowerCase());
      });
      if (!lines2.length) { if (permCheck) print('<span class="t-muted">(aucune correspondance)</span>'); return; }
      lines2.forEach(function(l){
        var re = new RegExp(escapeHtml(pattern).replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), ci ? 'gi' : 'gi');
        print(escapeHtml(l).replace(re, function(m){ return '<span class="t-green">'+m+'</span>'; }), 'term-output');
      });
    },
    history: function() {
      cmdHistory.forEach(function(c, i){ print('  ' + String(i+1).padStart(3) + '  ' + escapeHtml(c), 'term-output'); });
    },
    man: function(args) {
      var topic = args[0];
      if (!topic) { print('<span class="t-err">man : quel manuel voulez-vous ?</span>'); return; }
      if (manPages[topic]) print('<div class="man-page">' + manPages[topic] + '</div>', 'term-output');
      else print('<span class="t-err">Aucune entrée de manuel pour ' + escapeHtml(topic) + '</span>');
    },
    help: function() { print(helpHtml, 'term-output'); }
  };

  /* --- Command dispatcher --- */
  function exec(rawCmd) {
    if (!rawCmd || !rawCmd.trim()) return;
    var trimmed = rawCmd.trim();
    if (cmdHistory[cmdHistory.length - 1] !== trimmed) cmdHistory.push(trimmed);
    historyIdx = cmdHistory.length;
    cmdEcho(trimmed);

    var parts = trimmed.split(/\s+/);
    var cmd   = parts[0];
    var args  = parts.slice(1);

    // Extra commands have priority (allows overriding builtins like ps)
    if (extraCmds[cmd]) {
      extraCmds[cmd](args, engine);
      updatePromptLabel();
      return;
    }

    if (builtinCommands[cmd]) {
      builtinCommands[cmd](args);
      updatePromptLabel();
      return;
    }

    // Unknown command
    print('<span class="t-err">bash: ' + escapeHtml(cmd) + ': commande introuvable</span>');
    updatePromptLabel();
  }

  /* --- Input listener --- */
  function initInput() {
    var input = document.getElementById(config.inputElId);
    if (!input) return;

    // Clone to remove old listeners
    var fresh = input.cloneNode(true);
    input.parentNode.replaceChild(fresh, input);

    fresh.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        var val = fresh.value.trim();
        if (val) { exec(val); fresh.value = ''; historyIdx = cmdHistory.length; }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (historyIdx > 0) { historyIdx--; fresh.value = cmdHistory[historyIdx] || ''; }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (historyIdx < cmdHistory.length - 1) { historyIdx++; fresh.value = cmdHistory[historyIdx] || ''; }
        else { historyIdx = cmdHistory.length; fresh.value = ''; }
      } else if (e.key === 'Tab') {
        e.preventDefault();
        var val2 = fresh.value;
        var tparts = val2.split(/\s+/);
        if (tparts.length >= 2) {
          var partial = tparts[tparts.length - 1];
          var node = vfs[currentDir];
          if (node && node.children) {
            var matches = node.children.filter(function(c){ return c.startsWith(partial); });
            if (matches.length === 1) { tparts[tparts.length - 1] = matches[0]; fresh.value = tparts.join(' ') + ' '; }
            else if (matches.length > 1) { cmdEcho(val2); print(matches.join('  '), 'term-output'); }
          }
        }
      } else if (e.key === 'l' && e.ctrlKey) {
        e.preventDefault();
        var out = document.getElementById(config.outputElId);
        if (out) out.innerHTML = '';
      }
    });

    return fresh;
  }

  /* --- Public API --- */
  var engine = {
    exec: exec,
    print: print,
    cmdEcho: cmdEcho,
    updatePromptLabel: updatePromptLabel,
    getVfs: function() { return vfs; },
    setVfs: function(newVfs) { vfs = newVfs; },
    getCurrentDir: function() { return currentDir; },
    setCurrentDir: function(d) { currentDir = d; },
    resolvePath: resolvePath,
    handleLs: handleLs,
    handleCd: handleCd,
    initInput: initInput,
    escapeHtml: escapeHtml
  };

  return engine;
}

/* ============================================================
   TERMINAL PRINCIPAL (utilise createTerminalEngine)
   ============================================================ */

/* ============================================================
   TERMINAL PRINCIPAL — Instance du moteur unifié
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

const mainTerminal = createTerminalEngine({
  vfs: vfs,
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
  extraCommands: {
    date: function() { mainTerminal.print(new Date().toString(), 'term-output'); },
    uname: function(args) {
      if (args.includes('-a')) mainTerminal.print('Linux user-pc 5.15.0-91-generic #101-Ubuntu SMP Tue Nov 14 13:30:08 UTC 2023 x86_64 x86_64 x86_64 GNU/Linux', 'term-output');
      else mainTerminal.print('Linux', 'term-output');
    },
    ps: function(args) {
      if (args.includes('aux') || args.includes('-aux') || args.includes('-ef')) {
        mainTerminal.print('<span class="t-muted">USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND</span>', 'term-output');
        mainTerminal.print('root           1  0.0  0.1 168380 13008 ?        Ss   10:00   0:02 /sbin/init', 'term-output');
        mainTerminal.print('root         891  0.0  0.0  72300  5612 ?        Ss   10:00   0:00 /usr/sbin/sshd -D', 'term-output');
        mainTerminal.print('user        1023  0.1  0.0  10596  5120 pts/0    Ss   10:02   0:00 bash', 'term-output');
        mainTerminal.print('user        1847  0.0  0.0  12940  3712 pts/0    R+   10:15   0:00 ps aux', 'term-output');
      } else {
        mainTerminal.print('<span class="t-muted">  PID TTY          TIME CMD</span>', 'term-output');
        mainTerminal.print(' 1023 pts/0    00:00:00 bash', 'term-output');
        mainTerminal.print(' 1847 pts/0    00:00:00 ps', 'term-output');
      }
    },
    mkdir: function(args) {
      var opts = args.filter(function(a){return a.startsWith('-');});
      var dirs = args.filter(function(a){return !a.startsWith('-');});
      if (!dirs[0]) { mainTerminal.print('<span class="t-err">mkdir : nom de répertoire manquant</span>'); return; }
      var target = mainTerminal.resolvePath(dirs[0]);
      var _vfs = mainTerminal.getVfs();
      if (_vfs[target]) { mainTerminal.print('<span class="t-err">mkdir : impossible de créer le répertoire « ' + escapeHtml(dirs[0]) + ' » : Le fichier existe</span>'); return; }
      var parentPath = target.lastIndexOf('/') > 0 ? target.substring(0, target.lastIndexOf('/')) : '/';
      var dirName = target.split('/').pop();
      if (!_vfs[parentPath] && !opts.includes('-p')) { mainTerminal.print('<span class="t-err">mkdir : impossible de créer le répertoire : chemin parent inexistant (utilisez -p)</span>'); return; }
      if (opts.includes('-p') && !_vfs[parentPath]) _vfs[parentPath] = { type: 'dir', children: [] };
      _vfs[target] = { type: 'dir', children: [] };
      if (_vfs[parentPath] && !_vfs[parentPath].children.includes(dirName)) _vfs[parentPath].children.push(dirName);
    },
    touch: function(args) {
      if (!args[0]) { mainTerminal.print('<span class="t-err">touch : nom de fichier manquant</span>'); return; }
      var target = mainTerminal.resolvePath(args[0]);
      var _vfs = mainTerminal.getVfs();
      if (!_vfs[target]) {
        var parentPath = target.lastIndexOf('/') > 0 ? target.substring(0, target.lastIndexOf('/')) : '/';
        var fname = target.split('/').pop();
        _vfs[target] = { type: 'file', content: '' };
        if (_vfs[parentPath] && !_vfs[parentPath].children.includes(fname)) _vfs[parentPath].children.push(fname);
      }
    },
    rm: function(args) {
      var recursive = args.some(function(a){return a==='-r'||a==='-rf'||a==='-fr';});
      var fileArgs = args.filter(function(a){return !a.startsWith('-');});
      if (!fileArgs[0]) { mainTerminal.print('<span class="t-err">rm : aucun fichier spécifié</span>'); return; }
      var target = mainTerminal.resolvePath(fileArgs[0]);
      var _vfs = mainTerminal.getVfs();
      if (!_vfs[target]) { mainTerminal.print('<span class="t-err">rm : impossible de supprimer « ' + escapeHtml(fileArgs[0]) + ' » : Aucun fichier ou dossier de ce type</span>'); return; }
      if (_vfs[target].type === 'dir' && !recursive) { mainTerminal.print('<span class="t-err">rm : impossible de supprimer « ' + escapeHtml(fileArgs[0]) + ' » : est un répertoire (utilisez -r)</span>'); return; }
      var parentPath2 = target.lastIndexOf('/') > 0 ? target.substring(0, target.lastIndexOf('/')) : '/';
      var name = target.split('/').pop();
      if (_vfs[parentPath2]) _vfs[parentPath2].children = _vfs[parentPath2].children.filter(function(c){return c!==name;});
      delete _vfs[target];
    },
    cp: function(args) {
      var fileArgs2 = args.filter(function(a){return !a.startsWith('-');});
      if (fileArgs2.length < 2) { mainTerminal.print('<span class="t-err">cp : opérandes de fichier manquantes</span>'); return; }
      var src = mainTerminal.resolvePath(fileArgs2[0]);
      var dest = mainTerminal.resolvePath(fileArgs2[1]);
      var _vfs = mainTerminal.getVfs();
      if (!_vfs[src]) { mainTerminal.print('<span class="t-err">cp : ' + escapeHtml(fileArgs2[0]) + ' : Aucun fichier de ce type</span>'); return; }
      var destName = fileArgs2[1].split('/').pop();
      _vfs[dest] = Object.assign({}, _vfs[src]);
      var destParent = dest.lastIndexOf('/') > 0 ? dest.substring(0, dest.lastIndexOf('/')) : '/';
      if (_vfs[destParent] && !_vfs[destParent].children.includes(destName)) _vfs[destParent].children.push(destName);
    },
    mv: function(args) {
      if (args.length < 2) { mainTerminal.print('<span class="t-err">mv : opérandes de fichier manquantes</span>'); return; }
      var src = mainTerminal.resolvePath(args[0]);
      var dest = mainTerminal.resolvePath(args[1]);
      var _vfs = mainTerminal.getVfs();
      if (!_vfs[src]) { mainTerminal.print('<span class="t-err">mv : ' + escapeHtml(args[0]) + ' : Aucun fichier de ce type</span>'); return; }
      _vfs[dest] = Object.assign({}, _vfs[src]);
      var destParent = dest.lastIndexOf('/') > 0 ? dest.substring(0, dest.lastIndexOf('/')) : '/';
      var destName2 = dest.split('/').pop();
      if (_vfs[destParent] && !_vfs[destParent].children.includes(destName2)) _vfs[destParent].children.push(destName2);
      var srcParent = src.lastIndexOf('/') > 0 ? src.substring(0, src.lastIndexOf('/')) : '/';
      var srcName = src.split('/').pop();
      if (_vfs[srcParent]) _vfs[srcParent].children = _vfs[srcParent].children.filter(function(c){return c!==srcName;});
      delete _vfs[src];
    },
    chmod: function(args) {
      if (args.length < 2) { mainTerminal.print('<span class="t-err">chmod : opérandes manquantes</span>'); return; }
      var fileArg = args[args.length-1];
      var target = mainTerminal.resolvePath(fileArg);
      var _vfs = mainTerminal.getVfs();
      if (!_vfs[target]) { mainTerminal.print('<span class="t-err">chmod : impossible d\'accéder à « ' + escapeHtml(fileArg) + ' » : Aucun fichier ou dossier de ce type</span>'); return; }
      var perm = args[0];
      var permMap = {'+x':'rwxr-xr-x','a+x':'rwxr-xr-x','u+x':'rwxr-xr-x','755':'rwxr-xr-x','644':'rw-r--r--','600':'rw-------','777':'rwxrwxrwx','700':'rwx------','400':'r--------'};
      if (permMap[perm]) _vfs[target].perms = '-' + permMap[perm];
    },
    chown: function(args) {
      if (args.length < 2) { mainTerminal.print('<span class="t-err">chown : opérandes manquantes</span>'); return; }
    },
    ping: function(args) {
      var host = args.filter(function(a){return !a.startsWith('-');})[0];
      if (!host) { mainTerminal.print('<span class="t-err">ping : hôte manquant</span>'); return; }
      var count = 4;
      if (args.includes('-c')) count = parseInt(args[args.indexOf('-c')+1]) || 4;
      mainTerminal.print('PING ' + escapeHtml(host) + ' (142.250.74.46) 56(84) bytes of data.', 'term-output');
      for (var i=1; i<=count; i++) {
        mainTerminal.print('64 bytes from ' + escapeHtml(host) + ' (142.250.74.46): icmp_seq=' + i + ' ttl=119 time=' + (20+Math.random()*15).toFixed(3) + ' ms', 'term-output');
      }
      mainTerminal.print('--- ' + escapeHtml(host) + ' ping statistics ---', 'term-output');
      mainTerminal.print(count + ' packets transmitted, ' + count + ' received, 0% packet loss', 'term-output');
    },
    ip: function(args) {
      if (args[0]==='addr'||args[0]==='a') {
        mainTerminal.print('1: <span class="t-cmd-name">lo</span>: &lt;LOOPBACK,UP&gt; mtu 65536', 'term-output');
        mainTerminal.print('    inet <span class="t-green">127.0.0.1/8</span> scope host lo', 'term-output');
        mainTerminal.print('2: <span class="t-cmd-name">eth0</span>: &lt;BROADCAST,MULTICAST,UP&gt; mtu 1500', 'term-output');
        mainTerminal.print('    inet <span class="t-green">192.168.1.42/24</span> brd 192.168.1.255 scope global eth0', 'term-output');
      } else { mainTerminal.print('<span class="t-err">ip : objet "' + escapeHtml(args[0]||'') + '" inconnu</span>'); }
    },
    ifconfig: function() {
      mainTerminal.print('<span class="t-cmd-name">eth0</span>: flags=4163&lt;UP,BROADCAST,RUNNING,MULTICAST&gt;  mtu 1500', 'term-output');
      mainTerminal.print('        inet <span class="t-green">192.168.1.42</span>  netmask 255.255.255.0  broadcast 192.168.1.255', 'term-output');
      mainTerminal.print('<span class="t-cmd-name">lo</span>: flags=73&lt;UP,LOOPBACK,RUNNING&gt;  mtu 65536', 'term-output');
      mainTerminal.print('        inet <span class="t-green">127.0.0.1</span>  netmask 255.0.0.0', 'term-output');
    },
    ss: function() {
      mainTerminal.print('<span class="t-muted">Netid  State   Recv-Q  Send-Q  Local Address:Port    Peer Address:Port</span>', 'term-output');
      mainTerminal.print('tcp    LISTEN  0       128     0.0.0.0:22           0.0.0.0:*', 'term-output');
      mainTerminal.print('tcp    LISTEN  0       511     0.0.0.0:80           0.0.0.0:*', 'term-output');
      mainTerminal.print('tcp    LISTEN  0       511     0.0.0.0:443          0.0.0.0:*', 'term-output');
    },
    netstat: function() {
      mainTerminal.print('<span class="t-muted">Proto  Recv-Q  Send-Q  Local Address     Foreign Address     State</span>', 'term-output');
      mainTerminal.print('tcp        0       0  0.0.0.0:22        0.0.0.0:*           LISTEN', 'term-output');
    },
    curl: function(args) {
      var url = args.filter(function(a){return !a.startsWith('-');})[0];
      if (!url) { mainTerminal.print('<span class="t-err">curl : URL manquante</span>'); return; }
      mainTerminal.print('<span class="t-muted">  % Total    % Received % Xferd  Average Speed</span>', 'term-output');
      mainTerminal.print('100  1024  100  1024    0     0  12345      0', 'term-output');
      mainTerminal.print('<span class="t-green">&lt;!DOCTYPE html&gt;&lt;html&gt;&lt;head&gt;&lt;title&gt;Response&lt;/title&gt;...', 'term-output');
    },
    wget: function(args) {
      var url = args.filter(function(a){return !a.startsWith('-');})[0];
      if (!url) { mainTerminal.print('<span class="t-err">wget : URL manquante</span>'); return; }
      var fname = url.split('/').pop() || 'index.html';
      mainTerminal.print('Résolution de ' + escapeHtml(url.split('/')[2]||url) + '... 142.250.74.46', 'term-output');
      mainTerminal.print('Connexion... 200 OK', 'term-output');
      mainTerminal.print('<span class="t-green">« ' + escapeHtml(fname) + ' » sauvegardé [4096/4096]</span>', 'term-output');
    },
    tail: function(args) {
      var fileArg = args.filter(function(a){return !a.startsWith('-');})[0];
      if (!fileArg) { mainTerminal.print('<span class="t-err">tail : fichier manquant</span>'); return; }
      var t = mainTerminal.resolvePath(fileArg);
      var _vfs = mainTerminal.getVfs();
      if (!_vfs[t]) { mainTerminal.print('<span class="t-err">tail : ' + escapeHtml(fileArg) + ' : Aucun fichier</span>'); return; }
      (_vfs[t].content||'').split('\n').slice(-10).forEach(function(l){mainTerminal.print(escapeHtml(l),'term-output');});
    },
    head: function(args) {
      var fileArg = args.filter(function(a){return !a.startsWith('-');})[0];
      if (!fileArg) { mainTerminal.print('<span class="t-err">head : fichier manquant</span>'); return; }
      var t = mainTerminal.resolvePath(fileArg);
      var _vfs = mainTerminal.getVfs();
      if (!_vfs[t]) { mainTerminal.print('<span class="t-err">head : ' + escapeHtml(fileArg) + ' : Aucun fichier</span>'); return; }
      (_vfs[t].content||'').split('\n').slice(0,10).forEach(function(l){mainTerminal.print(escapeHtml(l),'term-output');});
    },
    which: function(args) {
      var prog = args[0]; if (!prog) return;
      var known = {bash:'/bin/bash',ls:'/bin/ls',cat:'/bin/cat',echo:'/bin/echo',grep:'/bin/grep',python3:'/usr/bin/python3',node:'/usr/bin/node',git:'/usr/bin/git',docker:'/usr/bin/docker',chmod:'/bin/chmod',chown:'/bin/chown'};
      if (known[prog]) mainTerminal.print(known[prog], 'term-output');
      else mainTerminal.print('<span class="t-err">' + escapeHtml(prog) + ' : introuvable</span>');
    },
    adduser: function(args) {
      var uname = args.filter(function(a){return !a.startsWith('-');})[0];
      if (!uname) { mainTerminal.print('<span class="t-err">adduser : nom d\'utilisateur manquant</span>'); return; }
      mainTerminal.print('Ajout de l\'utilisateur « ' + escapeHtml(uname) + ' »... <span class="t-green">Terminé.</span>', 'term-output');
    },
    useradd: function(args) {
      var uname = args.filter(function(a){return !a.startsWith('-');})[0];
      if (!uname) { mainTerminal.print('<span class="t-err">useradd : nom d\'utilisateur manquant</span>'); return; }
      mainTerminal.print('Ajout de l\'utilisateur « ' + escapeHtml(uname) + ' »... <span class="t-green">Terminé.</span>', 'term-output');
    },
    passwd: function() {
      mainTerminal.print('<span class="t-yellow">Entrez le nouveau mot de passe UNIX :</span>', 'term-output');
      mainTerminal.print('<span class="t-green">passwd : mot de passe mis à jour avec succès</span>', 'term-output');
    },
    groups: function() { mainTerminal.print('user : user adm cdrom sudo dip plugdev lxd', 'term-output'); },
    top: function() {
      mainTerminal.print('<span class="t-muted">top - ' + new Date().toTimeString().slice(0,8) + ' up 2:14, 1 user, load average: 0.12, 0.08, 0.05</span>', 'term-output');
      mainTerminal.print('<span class="t-muted">Tasks: 142 total, 1 running, 141 sleeping</span>', 'term-output');
      mainTerminal.print('<span class="t-muted">%Cpu(s): 2.1 us, 0.5 sy, 97.1 id</span>', 'term-output');
      mainTerminal.print('<span class="t-muted">  PID USER  PR NI    VIRT    RES    SHR S  %CPU  %MEM COMMAND</span>', 'term-output');
      mainTerminal.print('  891 root  20  0   72300   5612   4128 S   0.0   0.3 sshd', 'term-output');
      mainTerminal.print(' 1023 user  20  0   10596   5120   4096 S   0.3   0.3 bash', 'term-output');
      mainTerminal.print('<span class="t-yellow">(Ctrl+C pour quitter top — simulation)</span>', 'term-output');
    },
    htop: function() { mainTerminal.print('<span class="t-yellow">htop non disponible en simulation. Utilisez top.</span>', 'term-output'); },
    kill: function(args) {
      var pid = args.filter(function(a){return !a.startsWith('-');})[0];
      if (!pid) { mainTerminal.print('<span class="t-err">kill : PID manquant</span>'); return; }
      mainTerminal.print('<span class="t-green">Signal envoyé au processus ' + escapeHtml(pid) + '.</span>', 'term-output');
    },
    killall: function(args) {
      var procName = args.filter(function(a){return !a.startsWith('-');})[0];
      if (!procName) { mainTerminal.print('<span class="t-err">killall : nom de processus manquant</span>'); return; }
      mainTerminal.print('<span class="t-green">Signal envoyé aux processus "' + escapeHtml(procName) + '".</span>', 'term-output');
    },
    pkill: function(args) {
      var procName = args.filter(function(a){return !a.startsWith('-');})[0];
      if (!procName) { mainTerminal.print('<span class="t-err">pkill : nom de processus manquant</span>'); return; }
      mainTerminal.print('<span class="t-green">Signal envoyé aux processus "' + escapeHtml(procName) + '".</span>', 'term-output');
    },
    pgrep: function(args) {
      var pname = args.filter(function(a){return !a.startsWith('-');})[0] || '';
      mainTerminal.print('891  # ' + escapeHtml(pname), 'term-output');
    },
    df: function() {
      mainTerminal.print('<span class="t-muted">Filesystem      1K-blocks    Used Available Use% Mounted on</span>', 'term-output');
      mainTerminal.print('/dev/sda1        20971520 8388608  12582912  40% /', 'term-output');
      mainTerminal.print('tmpfs             1018976       0   1018976   0% /dev/shm', 'term-output');
    },
    du: function() {
      mainTerminal.print('4\t./documents', 'term-output'); mainTerminal.print('8\t./scripts', 'term-output'); mainTerminal.print('0\t./projets', 'term-output'); mainTerminal.print('12\t.', 'term-output');
    },
    free: function() {
      mainTerminal.print('<span class="t-muted">               total        used        free      shared  buff/cache   available</span>', 'term-output');
      mainTerminal.print('Mem:         2034804      821044      759880       26504      453880     1040984', 'term-output');
      mainTerminal.print('Swap:        2097148           0     2097148', 'term-output');
    },
    uptime: function() { mainTerminal.print(' ' + new Date().toTimeString().slice(0,8) + ' up 2:14, 1 user, load average: 0.12, 0.08, 0.05', 'term-output'); },
    env: function() {
      mainTerminal.print('USER=user', 'term-output'); mainTerminal.print('HOME=/home/user', 'term-output'); mainTerminal.print('SHELL=/bin/bash', 'term-output');
      mainTerminal.print('PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', 'term-output');
      mainTerminal.print('LANG=fr_FR.UTF-8', 'term-output'); mainTerminal.print('PWD=' + escapeHtml(mainTerminal.getCurrentDir()), 'term-output');
    },
    jobs: function() { mainTerminal.print('<span class="t-muted">(aucun job en arrière-plan)</span>', 'term-output'); },
    bg: function() { mainTerminal.print('<span class="t-muted">Aucun job à mettre en arrière-plan.</span>', 'term-output'); },
    fg: function() { mainTerminal.print('<span class="t-muted">Aucun job à ramener au premier plan.</span>', 'term-output'); },
    nohup: function(args) {
      if (args[0]) { mainTerminal.print('nohup: ignoring input and appending output to nohup.out', 'term-output'); mainTerminal.exec(args.join(' ')); }
    },
    traceroute: function(args) {
      var host2 = args.filter(function(a){return !a.startsWith('-');})[0] || 'example.com';
      mainTerminal.print('traceroute to ' + escapeHtml(host2) + ' (93.184.216.34), 30 hops max, 60 byte packets', 'term-output');
      mainTerminal.print(' 1  192.168.1.1 (192.168.1.1)  1.234 ms  1.145 ms  1.087 ms', 'term-output');
      mainTerminal.print(' 2  10.0.0.1 (10.0.0.1)  8.432 ms  8.312 ms  8.201 ms', 'term-output');
      mainTerminal.print(' 3  ' + escapeHtml(host2) + ' (93.184.216.34)  22.543 ms  21.987 ms  22.123 ms', 'term-output');
    },
    mtr: function(args) {
      var host2 = args.filter(function(a){return !a.startsWith('-');})[0] || 'example.com';
      mainTerminal.print('traceroute to ' + escapeHtml(host2) + ' (93.184.216.34), 30 hops max, 60 byte packets', 'term-output');
      mainTerminal.print(' 1  192.168.1.1 (192.168.1.1)  1.234 ms  1.145 ms  1.087 ms', 'term-output');
      mainTerminal.print(' 2  10.0.0.1 (10.0.0.1)  8.432 ms  8.312 ms  8.201 ms', 'term-output');
      mainTerminal.print(' 3  ' + escapeHtml(host2) + ' (93.184.216.34)  22.543 ms  21.987 ms  22.123 ms', 'term-output');
    },
    lsof: function() {
      mainTerminal.print('<span class="t-muted">COMMAND   PID   USER   FD   TYPE  DEVICE SIZE/OFF NODE NAME</span>', 'term-output');
      mainTerminal.print('sshd      891   root   3u  IPv4   12345      0t0  TCP *:ssh (LISTEN)', 'term-output');
      mainTerminal.print('bash     1023   user  cwd    DIR     8,1     4096    2 ' + escapeHtml(mainTerminal.getCurrentDir()), 'term-output');
    },
    'ssh-keygen': function() {
      mainTerminal.print('Generating public/private ed25519 key pair.', 'term-output');
      mainTerminal.print('Enter file in which to save the key (/home/user/.ssh/id_ed25519):', 'term-output');
      mainTerminal.print('Your identification has been saved in /home/user/.ssh/id_ed25519', 'term-output');
      mainTerminal.print('Your public key has been saved in /home/user/.ssh/id_ed25519.pub', 'term-output');
      mainTerminal.print('<span class="t-green">Clé SSH générée avec succès (simulation).</span>', 'term-output');
    },
    scp: function() { mainTerminal.print('<span class="t-yellow">scp : transfert simulé. (non connecté au réseau réel)</span>', 'term-output'); },
    nano: function() { mainTerminal.print('<span class="t-yellow">nano n\'est pas disponible dans ce terminal simulé. Utilisez touch pour créer des fichiers.</span>', 'term-output'); },
    vim: function() { mainTerminal.print('<span class="t-yellow">vim n\'est pas disponible dans ce terminal simulé. Utilisez touch pour créer des fichiers.</span>', 'term-output'); },
    vi: function() { mainTerminal.print('<span class="t-yellow">vi n\'est pas disponible dans ce terminal simulé. Utilisez touch pour créer des fichiers.</span>', 'term-output'); },
    emacs: function() { mainTerminal.print('<span class="t-yellow">emacs n\'est pas disponible dans ce terminal simulé. Utilisez touch pour créer des fichiers.</span>', 'term-output'); },
    wc: function() { mainTerminal.print('<span class="t-muted">wc : spécifiez un fichier (ex: wc -l fichier.txt)</span>', 'term-output'); },
    sort: function() { mainTerminal.print('<span class="t-muted">sort : spécifiez un fichier à trier</span>', 'term-output'); },
    uniq: function() { mainTerminal.print('<span class="t-muted">uniq : supprime les doublons consécutifs</span>', 'term-output'); },
    source: function(args) { mainTerminal.print('<span class="t-yellow">Sourcing ' + escapeHtml(args[0]||'') + '... (simulation)</span>', 'term-output'); },
    '.': function(args) { mainTerminal.print('<span class="t-yellow">Sourcing ' + escapeHtml(args[0]||'') + '... (simulation)</span>', 'term-output'); },
    'export': function() { mainTerminal.print('<span class="t-muted">Variable exportée (simulation).</span>', 'term-output'); },
    alias: function() { mainTerminal.print('<span class="t-muted">alias ll=\'ls -la\'\nalias gs=\'git status\'</span>', 'term-output'); },
    dig: function(args) {
      var domain = args.filter(function(a){return !a.startsWith('-')&&!a.startsWith('@');})[0] || 'example.com';
      mainTerminal.print('; &lt;&lt;&gt;&gt; DiG 9.18.12 &lt;&lt;&gt;&gt; ' + escapeHtml(domain), 'term-output');
      mainTerminal.print(';; ANSWER SECTION:\n' + escapeHtml(domain) + '.   300  IN  A  93.184.216.34', 'term-output');
    },
    nslookup: function(args) {
      var domain = args[0] || 'example.com';
      mainTerminal.print('Server:\t\t8.8.8.8\nAddress:\t8.8.8.8#53\n\nName:\t' + escapeHtml(domain) + '\nAddress: 93.184.216.34', 'term-output');
    },
    systemctl: function(args) {
      var action = args[0]; var service = args[1] || 'ssh';
      if (action==='status') {
        var sn = service.replace(/\.service$/,'');
        mainTerminal.print('● <span class="t-green">' + escapeHtml(sn) + '.service</span>', 'term-output');
        mainTerminal.print('   Loaded: loaded (/lib/systemd/system/' + escapeHtml(sn) + '.service; enabled)', 'term-output');
        mainTerminal.print('   Active: <span class="t-green">active (running)</span> since Thu 2023-12-14 10:00:01 UTC; 1h ago', 'term-output');
        mainTerminal.print(' Main PID: 891 (' + escapeHtml(sn) + ')', 'term-output');
      } else if (['start','stop','restart','enable','disable'].includes(action)) {
        if (action==='enable') mainTerminal.print('<span class="t-green">Synchronizing state of ' + escapeHtml(service) + ' with SysV service script...</span>', 'term-output');
      } else { mainTerminal.print('<span class="t-err">systemctl : commande inconnue : ' + escapeHtml(action||'') + '</span>'); }
    },
    journalctl: function() {
      mainTerminal.print('<span class="t-muted">-- Journal begins at Thu 2023-12-14 10:00:00 UTC --</span>', 'term-output');
      mainTerminal.print('Dec 14 10:00:01 user-pc systemd[1]: Starting System...', 'term-output');
      mainTerminal.print('Dec 14 10:00:03 user-pc kernel: Linux version 5.15.0-91-generic', 'term-output');
      mainTerminal.print('Dec 14 10:00:15 user-pc sshd[891]: Server listening on 0.0.0.0 port 22', 'term-output');
    },
    crontab: function(args) {
      if (args.includes('-l')) {
        mainTerminal.print('<span class="t-muted"># m h  dom mon dow   command</span>', 'term-output');
        mainTerminal.print('0 2 * * * /home/user/scripts/backup.sh', 'term-output');
        mainTerminal.print('*/5 * * * * /usr/bin/check_health.sh', 'term-output');
      } else if (args.includes('-e')) {
        mainTerminal.print('<span class="t-yellow">Ouverture de l\'éditeur crontab... (simulation)</span>', 'term-output');
      } else { mainTerminal.print('<span class="t-err">crontab : utilisez -l (lister) ou -e (éditer)</span>'); }
    },
    apt: function(args) {
      var aptCmd = args[0];
      if (aptCmd==='update') {
        mainTerminal.print('Réception de :1 http://archive.ubuntu.com/ubuntu jammy InRelease [270 kB]', 'term-output');
        mainTerminal.print('<span class="t-green">Lecture des listes de paquets... Fait</span>', 'term-output');
      } else if (aptCmd==='upgrade') {
        mainTerminal.print('<span class="t-green">0 mis à jour, 0 nouvellement installés, 0 à enlever et 0 non mis à jour.</span>', 'term-output');
      } else if (aptCmd==='install') {
        mainTerminal.print('Lecture des listes de paquets... Fait', 'term-output');
        mainTerminal.print('<span class="t-green">0 mis à jour, 1 nouvellement installés. Terminé.</span>', 'term-output');
      } else if (aptCmd==='remove') {
        mainTerminal.print('<span class="t-green">Paquet retiré.</span>', 'term-output');
      } else { mainTerminal.print('<span class="t-err">apt : commande inconnue : ' + escapeHtml(aptCmd||'') + '</span>'); }
    },
    sudo: function(args) {
      if (!args[0]) { mainTerminal.print('<span class="t-err">sudo : aucune commande spécifiée</span>'); return; }
      mainTerminal.exec(args.join(' '));
    },
    ssh: function(args) {
      var hostArg = args.filter(function(a){return !a.startsWith('-');})[0];
      if (!hostArg) { mainTerminal.print('<span class="t-err">ssh : hôte manquant</span>'); return; }
      mainTerminal.print('<span class="t-yellow">ssh : connexion à ' + escapeHtml(hostArg) + ' (simulation, non connecté)</span>', 'term-output');
    },
    git: function(args) {
      var gitSub = args[0];
      var gitArgs = args.slice(1);
      if (!gitSub) { mainTerminal.print('<span class="t-err">git : sous-commande manquante. Essayez : git init, git status, git add, git commit, git log, git branch, git push, git pull</span>'); return; }
      if (gitSub === 'init') {
        vfs[mainTerminal.getCurrentDir() + '/.git'] = { type: 'dir', children: [] };
        mainTerminal.print('<span class="t-green">Dépôt Git vide initialisé dans ' + escapeHtml(mainTerminal.getCurrentDir()) + '/.git/</span>', 'term-output');
      } else if (gitSub === 'status') {
        mainTerminal.print('<span class="t-green">Sur la branche main</span>', 'term-output');
        mainTerminal.print('', 'term-output');
        mainTerminal.print('<span class="t-muted">Rien à valider, la copie de travail est propre.</span>', 'term-output');
      } else if (gitSub === 'add') {
        var addArg = gitArgs[0] || '.';
        mainTerminal.print('<span class="t-muted">git add ' + escapeHtml(addArg) + ' — fichiers ajoutés à l\'index (simulation)</span>', 'term-output');
      } else if (gitSub === 'commit') {
        var msgIdx = gitArgs.indexOf('-m');
        var commitMsg = msgIdx >= 0 && gitArgs[msgIdx+1] ? gitArgs[msgIdx+1] : 'commit';
        mainTerminal.print('[main ' + Math.random().toString(16).slice(2,9) + '] ' + escapeHtml(commitMsg), 'term-output');
        mainTerminal.print(' 1 file changed, 1 insertion(+)', 'term-output');
      } else if (gitSub === 'log') {
        mainTerminal.print('<span class="t-yellow">commit 3a7f2c1b8e9d4f5a6c7b8e9d (HEAD -&gt; main)</span>', 'term-output');
        mainTerminal.print('Author: User &lt;user@example.com&gt;', 'term-output');
        mainTerminal.print('Date:   ' + new Date().toDateString(), 'term-output');
        mainTerminal.print('', 'term-output');
        mainTerminal.print('    feat: initial commit', 'term-output');
      } else if (gitSub === 'branch') {
        if (gitArgs[0] && !gitArgs[0].startsWith('-')) {
          mainTerminal.print('<span class="t-green">Branche « ' + escapeHtml(gitArgs[0]) + ' » créée.</span>', 'term-output');
        } else {
          mainTerminal.print('* <span class="t-green">main</span>', 'term-output');
          mainTerminal.print('  develop', 'term-output');
        }
      } else if (gitSub === 'checkout') {
        if (gitArgs.includes('-b') || gitArgs.includes('-B')) {
          var bname = gitArgs.filter(function(a){return !a.startsWith('-');})[0] || 'nouvelle-branche';
          mainTerminal.print('Basculement sur la nouvelle branche « ' + escapeHtml(bname) + ' »', 'term-output');
        } else {
          var bname2 = gitArgs[0] || 'main';
          mainTerminal.print('Basculement sur la branche « ' + escapeHtml(bname2) + ' »', 'term-output');
        }
      } else if (gitSub === 'switch') {
        var switchBranch = gitArgs.filter(function(a){return !a.startsWith('-');})[0] || 'main';
        var isCreate = gitArgs.includes('-c') || gitArgs.includes('-C');
        if (isCreate) mainTerminal.print('Basculement sur la nouvelle branche « ' + escapeHtml(switchBranch) + ' »', 'term-output');
        else mainTerminal.print('Basculement sur la branche « ' + escapeHtml(switchBranch) + ' »', 'term-output');
      } else if (gitSub === 'merge') {
        mainTerminal.print('Merge made by the \'ort\' strategy.', 'term-output');
        mainTerminal.print('<span class="t-green"> 1 file changed, 5 insertions(+)</span>', 'term-output');
      } else if (gitSub === 'remote') {
        if (gitArgs[0] === 'add') {
          mainTerminal.print('<span class="t-green">Remote « ' + escapeHtml(gitArgs[1]||'origin') + ' » ajouté.</span>', 'term-output');
        } else if (gitArgs[0] === '-v' || gitArgs[0] === 'show') {
          mainTerminal.print('origin  https://github.com/user/repo.git (fetch)', 'term-output');
          mainTerminal.print('origin  https://github.com/user/repo.git (push)', 'term-output');
        }
      } else if (gitSub === 'push') {
        mainTerminal.print('Décompte des objets: 3, fait.', 'term-output');
        mainTerminal.print('<span class="t-green">To https://github.com/user/repo.git</span>', 'term-output');
        mainTerminal.print('   3a7f2c1..9b4e8f2  main -&gt; main', 'term-output');
      } else if (gitSub === 'pull') {
        mainTerminal.print('Already up to date.', 'term-output');
      } else if (gitSub === 'fetch') {
        mainTerminal.print('<span class="t-muted">Récupération de origin...</span>', 'term-output');
      } else if (gitSub === 'stash') {
        if (gitArgs[0] === 'pop') mainTerminal.print('<span class="t-green">Modifications restaurées depuis le stash.</span>', 'term-output');
        else if (gitArgs[0] === 'list') mainTerminal.print('stash@{0}: WIP on main: 3a7f2c1 feat: initial commit', 'term-output');
        else mainTerminal.print('<span class="t-green">Modifications remisées dans le stash.</span>', 'term-output');
      } else if (gitSub === 'diff') {
        mainTerminal.print('<span class="t-muted">diff --git a/fichier.txt b/fichier.txt</span>', 'term-output');
        mainTerminal.print('<span class="t-green">+++ b/fichier.txt</span>', 'term-output');
        mainTerminal.print('<span class="t-green">+nouvelle ligne ajoutée</span>', 'term-output');
      } else if (gitSub === 'rebase') {
        mainTerminal.print('<span class="t-green">Rebase effectué avec succès (simulation).</span>', 'term-output');
      } else if (gitSub === 'reset') {
        mainTerminal.print('<span class="t-yellow">Reset effectué (simulation).</span>', 'term-output');
      } else if (gitSub === 'tag') {
        var tagName = gitArgs.filter(function(a){return !a.startsWith('-');})[0] || 'v1.0.0';
        mainTerminal.print('<span class="t-green">Tag « ' + escapeHtml(tagName) + ' » créé.</span>', 'term-output');
      } else if (gitSub === 'clone') {
        var cloneUrl = gitArgs[0] || 'https://github.com/user/repo.git';
        var repoName = cloneUrl.split('/').pop().replace('.git','') || 'repo';
        mainTerminal.print('Clonage dans « ' + escapeHtml(repoName) + ' »...', 'term-output');
        mainTerminal.print('<span class="t-green">Dépôt cloné avec succès.</span>', 'term-output');
      } else if (gitSub === 'config') {
        mainTerminal.print('<span class="t-muted">Configuration Git mise à jour (simulation).</span>', 'term-output');
      } else {
        mainTerminal.print('<span class="t-err">git: « ' + escapeHtml(gitSub) + ' » n\'est pas une commande git connue</span>');
      }
    },
    docker: function(args) {
      var dockerSub = args[0];
      var dockerArgs = args.slice(1);
      if (!dockerSub) { mainTerminal.print('<span class="t-err">docker : sous-commande manquante. Essayez : docker ps, docker images, docker pull, docker run, docker stop, docker rm</span>'); return; }
      if (dockerSub === 'version') {
        mainTerminal.print('Client: Docker Engine - Community', 'term-output');
        mainTerminal.print(' Version:           24.0.5', 'term-output');
        mainTerminal.print('Server: Docker Engine - Community', 'term-output');
        mainTerminal.print(' Engine: Version:   24.0.5', 'term-output');
      } else if (dockerSub === 'info') {
        mainTerminal.print('Containers: 2', 'term-output');
        mainTerminal.print(' Running: 1', 'term-output');
        mainTerminal.print(' Stopped: 1', 'term-output');
        mainTerminal.print('Images: 5', 'term-output');
        mainTerminal.print('Server Version: 24.0.5', 'term-output');
        mainTerminal.print('Storage Driver: overlay2', 'term-output');
      } else if (dockerSub === 'ps') {
        if (dockerArgs.includes('-a')) {
          mainTerminal.print('<span class="t-muted">CONTAINER ID   IMAGE     COMMAND   CREATED       STATUS                   NAMES</span>', 'term-output');
          mainTerminal.print('a1b2c3d4e5f6   nginx     "nginx"   5 min ago     Up 5 minutes             webserver', 'term-output');
          mainTerminal.print('b2c3d4e5f6a7   ubuntu    "bash"    10 min ago    Exited (0) 8 minutes ago  stoppe', 'term-output');
        } else {
          mainTerminal.print('<span class="t-muted">CONTAINER ID   IMAGE   COMMAND   CREATED      STATUS       PORTS     NAMES</span>', 'term-output');
          mainTerminal.print('a1b2c3d4e5f6   nginx   "nginx"   5 min ago    Up 5 min     80/tcp    webserver', 'term-output');
        }
      } else if (dockerSub === 'images') {
        mainTerminal.print('<span class="t-muted">REPOSITORY   TAG       IMAGE ID       CREATED        SIZE</span>', 'term-output');
        mainTerminal.print('ubuntu       22.04     174c8c134b2a   2 weeks ago    77.9MB', 'term-output');
        mainTerminal.print('nginx        latest    a6bd71f48f68   3 weeks ago    187MB', 'term-output');
        mainTerminal.print('python       3.11      8c4f3b2e9a1d   1 month ago    920MB', 'term-output');
      } else if (dockerSub === 'pull') {
        var pullImg = dockerArgs[0] || 'ubuntu';
        mainTerminal.print('Pulling from library/' + escapeHtml(pullImg.split(':')[0]), 'term-output');
        mainTerminal.print('<span class="t-green">Status: Downloaded newer image for ' + escapeHtml(pullImg) + '</span>', 'term-output');
      } else if (dockerSub === 'run') {
        var runImg = dockerArgs.filter(function(a){return !a.startsWith('-');})[0] || 'ubuntu';
        var runCmd = dockerArgs.filter(function(a){return !a.startsWith('-');}).slice(1).join(' ');
        if (dockerArgs.includes('-d')) {
          mainTerminal.print('<span class="t-green">a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0</span>', 'term-output');
        } else if (dockerArgs.includes('-it') || (dockerArgs.includes('-i') && dockerArgs.includes('-t'))) {
          mainTerminal.print('<span class="t-yellow">Conteneur ' + escapeHtml(runImg) + ' démarré en mode interactif (simulation).</span>', 'term-output');
          mainTerminal.print('<span class="t-muted">root@a1b2c3d4:/#</span> exit', 'term-output');
        } else if (runCmd) {
          mainTerminal.print(escapeHtml(runCmd), 'term-output');
        } else {
          mainTerminal.print('<span class="t-green">Conteneur démarré depuis l\'image ' + escapeHtml(runImg) + '.</span>', 'term-output');
        }
      } else if (dockerSub === 'stop') {
        var stopId = dockerArgs[0] || 'container_id';
        mainTerminal.print(escapeHtml(stopId), 'term-output');
      } else if (dockerSub === 'rm') {
        var rmId = dockerArgs[0] || 'container_id';
        mainTerminal.print(escapeHtml(rmId), 'term-output');
      } else if (dockerSub === 'rmi') {
        var rmiImg = dockerArgs[0] || 'image_id';
        mainTerminal.print('<span class="t-green">Image ' + escapeHtml(rmiImg) + ' supprimée.</span>', 'term-output');
      } else if (dockerSub === 'build') {
        mainTerminal.print('Step 1/4 : FROM ubuntu:22.04', 'term-output');
        mainTerminal.print('Step 2/4 : RUN apt-get update', 'term-output');
        mainTerminal.print('Step 3/4 : COPY . .', 'term-output');
        mainTerminal.print('Step 4/4 : CMD ["/bin/bash"]', 'term-output');
        mainTerminal.print('<span class="t-green">Successfully built 9f8e7d6c5b4a</span>', 'term-output');
        var tagArg = dockerArgs.filter(function(a){return !a.startsWith('-');}).find(function(a){return !a.startsWith('.');});
        if (tagArg) mainTerminal.print('<span class="t-green">Successfully tagged ' + escapeHtml(tagArg) + '</span>', 'term-output');
      } else if (dockerSub === 'tag') {
        mainTerminal.print('<span class="t-green">Image taguée avec succès.</span>', 'term-output');
      } else if (dockerSub === 'logs') {
        var logsId = dockerArgs.filter(function(a){return !a.startsWith('-');})[0] || 'container_id';
        mainTerminal.print('<span class="t-muted">Logs du conteneur ' + escapeHtml(logsId) + ' :</span>', 'term-output');
        mainTerminal.print('2024-01-15 10:00:01 INFO  Démarrage du serveur...', 'term-output');
        mainTerminal.print('2024-01-15 10:00:02 INFO  Écoute sur le port 80', 'term-output');
      } else if (dockerSub === 'exec') {
        mainTerminal.print('<span class="t-yellow">docker exec : exécution dans le conteneur (simulation).</span>', 'term-output');
      } else if (dockerSub === 'volume') {
        if (dockerArgs[0] === 'create') mainTerminal.print('<span class="t-green">Volume créé : ' + escapeHtml(dockerArgs[1]||'myvolume') + '</span>', 'term-output');
        else if (dockerArgs[0] === 'ls') {
          mainTerminal.print('<span class="t-muted">DRIVER    VOLUME NAME</span>', 'term-output');
          mainTerminal.print('local     mydata', 'term-output');
        } else mainTerminal.print('<span class="t-muted">docker volume : utilisez create ou ls</span>', 'term-output');
      } else if (dockerSub === 'network') {
        if (dockerArgs[0] === 'ls') {
          mainTerminal.print('<span class="t-muted">NETWORK ID     NAME      DRIVER    SCOPE</span>', 'term-output');
          mainTerminal.print('abc123456789   bridge    bridge    local', 'term-output');
          mainTerminal.print('def456789012   host      host      local', 'term-output');
          mainTerminal.print('ghi789012345   none      null      local', 'term-output');
        } else if (dockerArgs[0] === 'create') {
          mainTerminal.print('<span class="t-green">Réseau créé : ' + escapeHtml(dockerArgs[1]||'monreseau') + '</span>', 'term-output');
        } else mainTerminal.print('<span class="t-muted">docker network : utilisez ls ou create</span>', 'term-output');
      } else if (dockerSub === 'compose') {
        var composeSub = dockerArgs[0];
        if (composeSub === 'up') {
          mainTerminal.print('Creating network "app_default" with the default driver', 'term-output');
          mainTerminal.print('<span class="t-green">Creating app_db_1  ... done</span>', 'term-output');
          mainTerminal.print('<span class="t-green">Creating app_web_1 ... done</span>', 'term-output');
        } else if (composeSub === 'down') {
          mainTerminal.print('<span class="t-green">Stopping app_web_1 ... done</span>', 'term-output');
          mainTerminal.print('<span class="t-green">Stopping app_db_1  ... done</span>', 'term-output');
          mainTerminal.print('<span class="t-green">Removing network app_default</span>', 'term-output');
        } else if (composeSub === 'logs') {
          mainTerminal.print('<span class="t-muted">Attaching to app_web_1, app_db_1</span>', 'term-output');
          mainTerminal.print('web_1  | 2024-01-15 10:00:01 INFO Server started', 'term-output');
          mainTerminal.print('db_1   | 2024-01-15 10:00:00 INFO PostgreSQL 15 ready', 'term-output');
        } else if (composeSub === 'ps') {
          mainTerminal.print('<span class="t-muted">NAME        SERVICE   STATUS    PORTS</span>', 'term-output');
          mainTerminal.print('app_web_1   web       running   0.0.0.0:8080->5000/tcp', 'term-output');
          mainTerminal.print('app_db_1    db        running   5432/tcp', 'term-output');
        } else {
          mainTerminal.print('<span class="t-muted">docker compose : up, down, logs, ps, exec</span>', 'term-output');
        }
      } else {
        mainTerminal.print('<span class="t-err">docker: « ' + escapeHtml(dockerSub) + ' » n\'est pas une commande Docker connue</span>');
      }
    }
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
  manPages: {
    ls:'Lister le contenu d\'un répertoire.\nUsage : ls [-l] [-a] [chemin]\n  -l  format long\n  -a  afficher fichiers cachés',
    cd:'Changer de répertoire.\nUsage : cd [répertoire]\n  cd ~   aller dans le home\n  cd ..  répertoire parent\n  cd -   répertoire précédent',
    cat:'Afficher le contenu d\'un fichier.\nUsage : cat <fichier>',
    mkdir:'Créer un répertoire.\nUsage : mkdir [-p] <nom>',
    touch:'Créer un fichier vide.\nUsage : touch <nom>',
    rm:'Supprimer des fichiers ou répertoires.\nUsage : rm [-r] [-f] <cible>',
    cp:'Copier des fichiers.\nUsage : cp <source> <destination>',
    mv:'Déplacer ou renommer.\nUsage : mv <source> <destination>',
    chmod:'Modifier les permissions.\nUsage : chmod <mode> <fichier>\nExemple : chmod 755 script.sh',
    chown:'Changer le propriétaire.\nUsage : chown <user> <fichier>',
    pwd:'Afficher le répertoire courant.\nUsage : pwd',
    whoami:'Afficher le nom de l\'utilisateur courant.\nUsage : whoami',
    echo:'Afficher un texte.\nUsage : echo <texte>',
    find:'Rechercher des fichiers.\nUsage : find [chemin] -name <motif>',
    grep:'Rechercher dans les fichiers.\nUsage : grep <motif> <fichier>',
    history:'Afficher l\'historique des commandes.\nUsage : history',
    man:'Afficher le manuel d\'une commande.\nUsage : man <commande>',
    uname:'Afficher les informations système.\nUsage : uname [-a]',
    ps:'Afficher les processus.\nUsage : ps [aux]',
    ping:'Tester la connectivité réseau.\nUsage : ping <hôte>',
    ip:'Afficher les interfaces réseau.\nUsage : ip addr',
    clear:'Vider le terminal.\nUsage : clear',
    date:'Afficher la date et l\'heure.\nUsage : date',
    git:'Gestionnaire de versions.\nUsage : git <commande>\nCommandes : init, status, add, commit, log, branch, checkout, push, pull, merge, diff, stash, rebase, reset, tag, clone, config',
    docker:'Gestion de conteneurs.\nUsage : docker <commande>\nCommandes : ps, images, pull, run, stop, rm, rmi, build, tag, logs, exec, volume, network, compose'
  }
});

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

function toggleTerminal() {
  var sec = document.getElementById('terminal-section');
  var icon = document.getElementById('term-toggle-icon');
  if (!sec) return;
  var isMin = sec.classList.toggle('minimized');
  if (icon) icon.textContent = isMin ? '▲' : '▼';
}

function focusTerminal() {
  var sec = document.getElementById('terminal-section');
  var icon = document.getElementById('term-toggle-icon');
  if (sec) sec.classList.remove('minimized');
  if (icon) icon.textContent = '▼';
  var inp = document.getElementById('terminal-input');
  if (inp) inp.focus();
  closeSidebar();
}

function initTerminal() {
  var input = document.getElementById('terminal-input');
  if (!input) return;

  // Sur mobile : terminal minimisé par défaut avec icône
  if (window.innerWidth <= 700) {
    var sec = document.getElementById('terminal-section');
    var icon = document.getElementById('term-toggle-icon');
    if (sec) sec.classList.add('minimized');
    if (icon) icon.textContent = '▲';
  }

  mainTerminal.initInput();
  mainTerminal.print('<span class="t-green">Linux Trainer Terminal v1.0 — Tapez <strong>help</strong> pour la liste des commandes.</span>', 'term-output');
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
