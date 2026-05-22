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
