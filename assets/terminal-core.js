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

  function tokenizeCmd(input) {
    var tokens = [];
    var current = '';
    var quote = null;
    var text = String(input || '');
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (quote) {
        if (ch === '\\' && quote === '"' && i + 1 < text.length) { current += text[++i]; continue; }
        if (ch === quote) quote = null;
        else current += ch;
        continue;
      }
      if (ch === '\\' && i + 1 < text.length) { current += text[++i]; continue; }
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
    if (quote) return { error: 'unclosed-quote' };
    if (current) tokens.push(current);
    return tokens;
  }

  function parseLine(input) {
    var trimmed = String(input || '').trim().replace(/\s+2>\s*\/dev\/null/g, '').replace(/\s*<\/dev\/null/g, '');
    if (!trimmed) return { ok: true, stages: [] };
    if (/(&&|\|\||;|`|\$\(|<\(|>>|>|<)/.test(trimmed)) {
      return { ok: false, exitCode: 2, stderr: ['bash: syntaxe non supportée'], errorCode: 'unsupported-syntax' };
    }
    var tokens = tokenizeCmd(trimmed);
    if (tokens.error) return { ok: false, exitCode: 2, stderr: ['bash: guillemet non fermé'], errorCode: tokens.error };
    var stages = [];
    var stage = [];
    tokens.forEach(function (token) {
      if (token === '|') { stages.push(stage); stage = []; }
      else stage.push(token);
    });
    stages.push(stage);
    if (stages.some(function (parts) { return parts.length === 0; })) {
      return { ok: false, exitCode: 2, stderr: ['bash: pipeline vide'], errorCode: 'empty-pipeline' };
    }
    if (stages[0][0] === 'sudo') {
      stages[0] = stages[0].slice(1);
      if (!stages[0].length) return { ok: false, exitCode: 1, stderr: ['sudo : aucune commande spécifiée'], errorCode: 'usage' };
    }
    return { ok: true, stages: stages };
  }

  function childPath(parent, name) {
    return parent === '/' ? '/' + name : parent.replace(/\/$/, '') + '/' + name;
  }

  function failResult(message, errorCode, exitCode) {
    return { exitCode: exitCode || 1, stdout: [], stderr: [message], errorCode: errorCode, stateChanges: [] };
  }

  function runOne(name, args, stdin, ctx) {
    if (name === 'pwd') return { exitCode: 0, stdout: [ctx.cwd], stderr: [], stateChanges: [] };
    if (name === 'echo') {
      var text = args.join(' ')
        .replace(/\$\{HOME\}/g, '/home/user')
        .replace(/\$HOME/g, '/home/user')
        .replace(/\$\{USER\}/g, userInfo.user)
        .replace(/\$USER/g, userInfo.user)
        .replace(/\$\{PWD\}/g, ctx.cwd)
        .replace(/\$PWD/g, ctx.cwd);
      return { exitCode: 0, stdout: [text], stderr: [], stateChanges: [] };
    }
    if (name === 'whoami') return { exitCode: 0, stdout: [userInfo.user], stderr: [], stateChanges: [] };
    if (name === 'hostname') return { exitCode: 0, stdout: [userInfo.hostname || 'user-pc'], stderr: [], stateChanges: [] };
    if (name === 'cd') {
      var target = args[0];
      if (!target || target === '~' || target === '~/') { prevDir = currentDir; currentDir = '/home/user'; ctx.cwd = currentDir; return { exitCode: 0, stdout: [], stderr: [], stateChanges: [] }; }
      var resolved = resolvePath(target);
      if (!vfs[resolved]) return failResult('bash: cd: ' + target + ': Aucun fichier ou dossier de ce type', 'enoent');
      if (vfs[resolved].type !== 'dir') return failResult('bash: cd: ' + target + ': N\'est pas un répertoire', 'not-a-directory');
      prevDir = currentDir;
      currentDir = resolved;
      ctx.cwd = currentDir;
      return { exitCode: 0, stdout: [], stderr: [], stateChanges: [] };
    }
    if (name === 'ls') {
      var fileArg = args.filter(function (a) { return !a.startsWith('-'); })[0];
      var showHidden = args.some(function (a) { return /^-[a-zA-Z]*a/.test(a); });
      var longFormat = args.some(function (a) { return /^-[a-zA-Z]*l/.test(a); });
      var targetLs = fileArg ? resolvePath(fileArg) : currentDir;
      if (!vfs[targetLs]) return failResult('ls : impossible d\'accéder à \'' + fileArg + '\': Aucun fichier ou dossier de ce type', 'enoent');
      var lsUser = (userInfo && userInfo.user) ? userInfo.user : 'user';
      function formatLong(entryName, node) {
        var isDir = node && node.type === 'dir';
        var perm = node && node.perms ? node.perms : (isDir ? 'drwxr-xr-x' : '-rw-r--r--');
        var size = isDir ? 4096 : ((node && node.content) ? String(node.content).length : 0);
        return perm + ' 1 ' + lsUser + ' ' + lsUser + ' ' + String(size).padStart(6) + ' Dec 15 10:23 ' + entryName;
      }
      if (vfs[targetLs].type === 'file') {
        var fileName = targetLs.split('/').pop();
        return { exitCode: 0, stdout: longFormat ? [formatLong(fileName, vfs[targetLs])] : [fileName], stderr: [], stateChanges: [] };
      }
      var names = (vfs[targetLs].children || []).filter(function (item) { return showHidden || item.charAt(0) !== '.'; });
      if (!longFormat) return { exitCode: 0, stdout: names, stderr: [], stateChanges: [] };
      var lines = ['total ' + (names.length * 4)];
      names.forEach(function (entryName) {
        var child = targetLs === '/' ? '/' + entryName : targetLs + '/' + entryName;
        lines.push(formatLong(entryName, vfs[child] || { type: 'file' }));
      });
      return { exitCode: 0, stdout: lines, stderr: [], stateChanges: [] };
    }
    if (name === 'cat') {
      if (args[0]) {
        var t = resolvePath(args[0]);
        if (!vfs[t]) return failResult('cat : ' + args[0] + ' : Aucun fichier ou dossier de ce type', 'enoent');
        if (vfs[t].type === 'dir') return failResult('cat : ' + args[0] + ' : est un répertoire', 'eisdir');
        if (permCheck && vfs[t].perms && vfs[t].perms.indexOf('-r--------') === 0) return failResult('cat : ' + args[0] + ' : Permission non accordée', 'eacces');
        return { exitCode: 0, stdout: String(vfs[t].content || '').split('\n'), stderr: [], stateChanges: [] };
      }
      return { exitCode: 0, stdout: stdin.slice(), stderr: [], stateChanges: [] };
    }
    if (name === 'grep') {
      var flags = args.filter(function (a) { return a.charAt(0) === '-'; });
      var nonFlag = args.filter(function (a) { return a.charAt(0) !== '-'; });
      var pattern = nonFlag[0];
      var file = nonFlag[1];
      if (!pattern) return failResult('grep : spécifiez un motif', 'usage', 2);
      var lines = stdin.slice();
      if (file) {
        var gt = resolvePath(file);
        if (!vfs[gt] || vfs[gt].type !== 'file') return failResult('grep : ' + file + ' : Aucun fichier de ce type', 'enoent');
        lines = String(vfs[gt].content || '').split('\n');
      }
      var ci = flags.some(function (flag) { return flag === '--ignore-case' || /^-[^-]*i/.test(flag); });
      var extended = flags.some(function (flag) { return flag === '--extended-regexp' || /^-[^-]*E/.test(flag); });
      var matched;
      if (extended) {
        var expression;
        try {
          expression = new RegExp(pattern, ci ? 'i' : '');
        } catch (err) {
          return failResult('grep : expression régulière invalide', 'invalid-regex', 2);
        }
        matched = lines.filter(function (line) { return expression.test(line); });
      } else {
        matched = lines.filter(function (line) {
          return ci ? line.toLowerCase().indexOf(pattern.toLowerCase()) >= 0 : line.indexOf(pattern) >= 0;
        });
      }
      return { exitCode: matched.length ? 0 : 1, stdout: matched, stderr: [], stateChanges: [], errorCode: matched.length ? undefined : 'no-match' };
    }
    if (name === 'tail') {
      var countTail = 10;
      for (var tailIndex = 0; tailIndex < args.length; tailIndex++) {
        var tailArg = args[tailIndex];
        if (tailArg === '-n' && /^\d+$/.test(args[tailIndex + 1] || '')) {
          countTail = Number(args[++tailIndex]);
        } else if (/^-\d+$/.test(tailArg)) {
          countTail = Number(tailArg.slice(1));
        }
      }
      return { exitCode: 0, stdout: stdin.slice(-countTail), stderr: [], stateChanges: [] };
    }
    if (name === 'cut') {
      var delimiter = '\t';
      var field = 1;
      for (var ci2 = 0; ci2 < args.length; ci2++) {
        if (args[ci2] === '-d' && args[ci2 + 1] !== undefined) { delimiter = args[++ci2]; }
        else if (args[ci2] === '-f' && args[ci2 + 1] !== undefined) { field = Number(args[++ci2]) || 1; }
      }
      return { exitCode: 0, stdout: stdin.map(function (line) { var parts = line.split(delimiter); return parts[field - 1] || ''; }), stderr: [], stateChanges: [] };
    }
    if (name === 'awk') {
      var program = args[0] || '';
      var fieldMatch = program.match(/\{print\s+\$(\d+|NF)\}/);
      return {
        exitCode: 0,
        stdout: stdin.map(function (line) {
          var parts = line.trim().split(/\s+/);
          if (!fieldMatch) return line;
          if (fieldMatch[1] === 'NF') return parts[parts.length - 1] || '';
          return parts[Number(fieldMatch[1]) - 1] || '';
        }),
        stderr: [],
        stateChanges: []
      };
    }
    if (name === 'base64') {
      var decode = args.indexOf('-d') >= 0;
      var payload = args.filter(function (a) { return a !== '-d'; })[0];
      if (payload === undefined) payload = stdin.join('');
      try {
        var out = decode ? atob(payload) : btoa(payload);
        return { exitCode: 0, stdout: [out], stderr: [], stateChanges: [] };
      } catch (err) {
        return failResult('base64 : données invalides', 'invalid-base64');
      }
    }
    if (name === 'find') {
      var nonFlags = args.filter(function (a) { return a.charAt(0) !== '-'; });
      var nameIdx = args.indexOf('-name');
      var permIdx = args.indexOf('-perm');
      var patternFind = nameIdx >= 0 ? args[nameIdx + 1] : null;
      var permFind = permIdx >= 0 ? args[permIdx + 1] : null;
      var needle = String(patternFind || '').replace(/\*/g, '');
      var root = resolvePath(nonFlags[0] || '.');
      var results = [];
      function visit(dirPath) {
        var node = vfs[dirPath];
        if (!node) return;
        var nameOk = !patternFind || dirPath.split('/').pop().indexOf(needle) >= 0;
        var permOk = !permFind || (node.perms || '').indexOf('s') >= 0 || (node.perms || '').indexOf('4000') >= 0;
        if (nameOk && permOk) results.push(dirPath);
        if (node.type === 'dir') (node.children || []).forEach(function (child) { visit(childPath(dirPath, child)); });
      }
      visit(root);
      return { exitCode: 0, stdout: results, stderr: [], stateChanges: [] };
    }
    if (name === 'mkdir') {
      var opts = args.filter(function (a) { return a.charAt(0) === '-'; });
      var dirs = args.filter(function (a) { return a.charAt(0) !== '-'; });
      if (!dirs[0]) return failResult('mkdir : nom de répertoire manquant', 'usage');
      var verbose = opts.some(function (a) { return a.indexOf('v') >= 0; });
      var parents = opts.some(function (a) { return a.indexOf('p') >= 0; });
      var targetMk = resolvePath(dirs[0]);
      if (vfs[targetMk]) return failResult('mkdir : impossible de créer le répertoire « ' + dirs[0] + ' » : Le fichier existe', 'eexist');
      var parentPath = targetMk.lastIndexOf('/') > 0 ? targetMk.substring(0, targetMk.lastIndexOf('/')) : '/';
      var dirName = targetMk.split('/').pop();
      if (!vfs[parentPath] && !parents) return failResult('mkdir : impossible de créer le répertoire : chemin parent inexistant (utilisez -p)', 'enoent');
      if (parents && !vfs[parentPath]) vfs[parentPath] = { type: 'dir', children: [] };
      vfs[targetMk] = { type: 'dir', children: [] };
      if (vfs[parentPath] && vfs[parentPath].children.indexOf(dirName) < 0) vfs[parentPath].children.push(dirName);
      return { exitCode: 0, stdout: verbose ? ['mkdir: répertoire « ' + dirs[0] + ' » créé'] : [], stderr: [], stateChanges: [{ op: 'mkdir', path: targetMk }] };
    }
    if (name === 'chmod') {
      if (args.length < 2) return failResult('chmod : opérandes manquantes', 'usage');
      var fileArg = args[args.length - 1];
      var targetCh = resolvePath(fileArg);
      if (!vfs[targetCh]) return failResult('chmod : impossible d\'accéder à « ' + fileArg + ' » : Aucun fichier ou dossier de ce type', 'enoent');
      var perm = args[0];
      var permMap = { '+x': 'rwxr-xr-x', 'a+x': 'rwxr-xr-x', 'u+x': 'rwxr-xr-x', '755': 'rwxr-xr-x', '0755': 'rwxr-xr-x', '644': 'rw-r--r--', '600': 'rw-------' };
      if (permMap[perm]) vfs[targetCh].perms = '-' + permMap[perm];
      return { exitCode: 0, stdout: [], stderr: [], stateChanges: [{ op: 'chmod', path: targetCh }] };
    }
    if (name === 'touch') {
      if (!args[0]) return failResult('touch : nom de fichier manquant', 'usage');
      var targetTo = resolvePath(args[0]);
      if (!vfs[targetTo]) {
        var parentTo = targetTo.lastIndexOf('/') > 0 ? targetTo.substring(0, targetTo.lastIndexOf('/')) : '/';
        var fname = targetTo.split('/').pop();
        vfs[targetTo] = { type: 'file', content: '' };
        if (vfs[parentTo] && vfs[parentTo].children.indexOf(fname) < 0) vfs[parentTo].children.push(fname);
      }
      return { exitCode: 0, stdout: [], stderr: [], stateChanges: [{ op: 'touch', path: targetTo }] };
    }
    if (name === 'rm') {
      var recursive = args.some(function (a) { return a === '-r' || a === '-rf' || a === '-fr'; });
      var fileArgs = args.filter(function (a) { return a.charAt(0) !== '-'; });
      if (!fileArgs[0]) return failResult('rm : aucun fichier spécifié', 'usage');
      var targetRm = resolvePath(fileArgs[0]);
      if (!vfs[targetRm]) return failResult('rm : impossible de supprimer « ' + fileArgs[0] + ' » : Aucun fichier ou dossier de ce type', 'enoent');
      if (vfs[targetRm].type === 'dir' && !recursive) return failResult('rm : impossible de supprimer « ' + fileArgs[0] + ' » : est un répertoire (utilisez -r)', 'eisdir');
      var parentRm = targetRm.lastIndexOf('/') > 0 ? targetRm.substring(0, targetRm.lastIndexOf('/')) : '/';
      var nameRm = targetRm.split('/').pop();
      if (vfs[parentRm]) vfs[parentRm].children = vfs[parentRm].children.filter(function (c) { return c !== nameRm; });
      delete vfs[targetRm];
      return { exitCode: 0, stdout: [], stderr: [], stateChanges: [{ op: 'rm', path: targetRm }] };
    }
    if (name === 'clear') {
      var out = document.getElementById(config.outputElId);
      if (out) out.innerHTML = '';
      return { exitCode: 0, stdout: [], stderr: [], stateChanges: [], silent: true };
    }
    if (name === 'help') return { exitCode: 0, stdout: [], stderr: [], stateChanges: [], html: helpHtml };
    if (name === 'man') {
      if (!args[0]) return failResult('man : quel manuel voulez-vous ?', 'usage');
      if (manPages[args[0]]) return { exitCode: 0, stdout: [], stderr: [], stateChanges: [], html: '<div class="man-page">' + manPages[args[0]] + '</div>' };
      return failResult('Aucune entrée de manuel pour ' + args[0], 'enoent');
    }
    if (name === 'history') {
      return { exitCode: 0, stdout: cmdHistory.map(function (c, i) { return '  ' + String(i + 1).padStart(3) + '  ' + c; }), stderr: [], stateChanges: [] };
    }
    if (name === 'id') {
      return { exitCode: 0, stdout: ['uid=' + userInfo.uid + '(' + userInfo.user + ') gid=' + userInfo.gid + '(' + userInfo.user + ') groupes=' + userInfo.gid + '(' + userInfo.user + ')' + (userInfo.extraGroups || '')], stderr: [], stateChanges: [] };
    }
    return failResult('bash: ' + name + ': commande introuvable', 'enoent', 127);
  }

  function harvestFrom(fromCount) {
    var out = document.getElementById(config.outputElId);
    if (!out) return [];
    return [].slice.call(out.children, fromCount).map(function (node) { return node.textContent; });
  }

  function runExtra(name, args, stdin) {
    var out = document.getElementById(config.outputElId);
    var from = out ? out.childElementCount : 0;
    var ret = extraCmds[name](args, engine, stdin);
    if (ret && typeof ret.exitCode === 'number') return ret;
    return { exitCode: 0, stdout: harvestFrom(from), stderr: [], stateChanges: [] };
  }

  function runStructured(rawCmd) {
    var parsed = parseLine(rawCmd);
    if (!parsed.ok) {
      return { exitCode: parsed.exitCode, stdout: [], stderr: parsed.stderr, cwd: currentDir, stateChanges: [], errorCode: parsed.errorCode, command: null, commands: [], stages: [] };
    }
    if (!parsed.stages.length) return { exitCode: 0, stdout: [], stderr: [], cwd: currentDir, stateChanges: [], command: null, commands: [], stages: [] };
    var ctx = { cwd: currentDir };
    var stdin = [];
    var last = { exitCode: 0, stdout: [], stderr: [], stateChanges: [] };
    var stateChanges = [];
    for (var s = 0; s < parsed.stages.length; s++) {
      var parts = parsed.stages[s];
      if (extraCmds[parts[0]]) last = runExtra(parts[0], parts.slice(1), stdin);
      else last = runOne(parts[0], parts.slice(1), stdin, ctx);
      stateChanges = stateChanges.concat(last.stateChanges || []);
      stdin = last.stdout || [];
      if (last.exitCode === 127) break;
    }
    return {
      exitCode: last.exitCode,
      stdout: last.stdout || [],
      stderr: last.stderr || [],
      cwd: currentDir,
      stateChanges: stateChanges,
      errorCode: last.errorCode,
      html: last.html,
      silent: last.silent,
      renderOutput: last.renderOutput,
      command: parsed.stages[0][0],
      commands: parsed.stages.map(function (stage) { return stage[0]; }),
      stages: parsed.stages.map(function (stage) { return stage.slice(); })
    };
  }

  /* --- Command dispatcher --- */
  function exec(rawCmd) {
    if (!rawCmd || !rawCmd.trim()) return { exitCode: 0, stdout: [], stderr: [], cwd: currentDir, stateChanges: [], command: null, commands: [], stages: [] };
    var trimmed = rawCmd.trim();
    if (cmdHistory[cmdHistory.length - 1] !== trimmed) cmdHistory.push(trimmed);
    historyIdx = cmdHistory.length;
    cmdEcho(trimmed);

    var result = runStructured(trimmed);
    if (!result.silent) {
      if (result.html) print(result.html, 'term-output');
      if (!result.commands || !result.commands.some(function (name) { return extraCmds[name]; }) || result.renderOutput) {
        (result.stdout || []).forEach(function (line) { print(escapeHtml(line), 'term-output'); });
      } else if (result.commands.length > 1) {
        (result.stdout || []).forEach(function (line) { print(escapeHtml(line), 'term-output'); });
      }
      (result.stderr || []).forEach(function (line) { print('<span class="t-err">' + escapeHtml(line) + '</span>'); });
    }
    updatePromptLabel();
    return result;
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
