export function tokenize(input) {
  const tokens = [];
  let current = '';
  let quote = null;
  const text = String(input || '');
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\' && quote === '"' && i + 1 < text.length) {
        current += text[i + 1];
        i += 1;
        continue;
      }
      if (ch === quote) quote = null;
      else current += ch;
      continue;
    }
    if (ch === '\\' && i + 1 < text.length) {
      current += text[i + 1];
      i += 1;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    if (ch === '|') {
      if (current) {
        tokens.push(current);
        current = '';
      }
      tokens.push('|');
      continue;
    }
    if (/\s/.test(ch)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    current += ch;
  }
  if (quote) return { error: 'unclosed-quote', tokens: [] };
  if (current) tokens.push(current);
  return tokens;
}

export function parseCommandLine(input) {
  const trimmed = String(input || '').trim()
    .replace(/\s+2>\s*\/dev\/null/g, '')
    .replace(/\s*<\/dev\/null/g, '');
  if (!trimmed) return { ok: true, stages: [], exitCode: 0, stderr: [] };
  if (/(&&|\|\||;|`|\$\(|<\(|>>|>|<)/.test(trimmed)) {
    return {
      ok: false,
      stages: [],
      exitCode: 2,
      stderr: ['bash: syntaxe non supportée'],
      errorCode: 'unsupported-syntax',
    };
  }
  const tokens = tokenize(trimmed);
  if (tokens.error) {
    return { ok: false, stages: [], exitCode: 2, stderr: ['bash: guillemet non fermé'], errorCode: tokens.error };
  }
  const stages = [];
  let stage = [];
  for (const token of tokens) {
    if (token === '|') {
      stages.push(stage);
      stage = [];
    } else stage.push(token);
  }
  stages.push(stage);
  if (stages.some((parts) => parts.length === 0)) {
    return { ok: false, stages: [], exitCode: 2, stderr: ['bash: pipeline vide'], errorCode: 'empty-pipeline' };
  }
  if (stages[0][0] === 'sudo') {
    stages[0] = stages[0].slice(1);
    if (!stages[0].length) {
      return { ok: false, stages: [], exitCode: 1, stderr: ['sudo : aucune commande spécifiée'], errorCode: 'usage' };
    }
  }
  return { ok: true, stages, exitCode: 0, stderr: [] };
}

function childPath(parent, name) {
  return parent === '/' ? `/${name}` : `${parent.replace(/\/$/, '')}/${name}`;
}

export function resolvePath(cwd, path, prevDir) {
  if (!path || path === '~') return '/home/user';
  if (path === '-') return prevDir || cwd;
  if (path.startsWith('~/')) return `/home/user${path.slice(1)}`;
  if (!path.startsWith('/')) path = `${cwd === '/' ? '' : cwd}/${path}`;
  const resolved = [];
  for (const part of path.split('/').filter(Boolean)) {
    if (part === '..') resolved.pop();
    else if (part !== '.') resolved.push(part);
  }
  return `/${resolved.join('/')}`;
}

function fail(message, errorCode, exitCode = 1) {
  return { exitCode, stdout: [], stderr: [message], errorCode, stateChanges: [] };
}

function globToIncludes(pattern) {
  return String(pattern || '').replace(/\*/g, '');
}

function runCommand(ctx, name, args, stdin) {
  const { vfs, userInfo } = ctx;
  const changes = [];

  if (name === 'pwd') return { exitCode: 0, stdout: [ctx.cwd], stderr: [], stateChanges: [] };
  if (name === 'echo') {
    const text = args.join(' ')
      .replace(/\$\{HOME\}/g, '/home/user')
      .replace(/\$HOME/g, '/home/user')
      .replace(/\$\{USER\}/g, userInfo.user)
      .replace(/\$USER/g, userInfo.user)
      .replace(/\$\{PWD\}/g, ctx.cwd)
      .replace(/\$PWD/g, ctx.cwd);
    return { exitCode: 0, stdout: [text], stderr: [], stateChanges: [] };
  }
  if (name === 'whoami') return { exitCode: 0, stdout: [userInfo.user], stderr: [], stateChanges: [] };
  if (name === 'hostname') return { exitCode: 0, stdout: [userInfo.hostname], stderr: [], stateChanges: [] };

  if (name === 'cd') {
    const target = args[0];
    if (!target || target === '~' || target === '~/') {
      ctx.prevDir = ctx.cwd;
      ctx.cwd = '/home/user';
      return { exitCode: 0, stdout: [], stderr: [], stateChanges: [] };
    }
    const resolved = resolvePath(ctx.cwd, target, ctx.prevDir);
    if (!vfs[resolved]) return fail(`bash: cd: ${target}: Aucun fichier ou dossier de ce type`, 'enoent');
    if (vfs[resolved].type !== 'dir') return fail(`bash: cd: ${target}: N'est pas un répertoire`, 'not-a-directory');
    ctx.prevDir = ctx.cwd;
    ctx.cwd = resolved;
    return { exitCode: 0, stdout: [], stderr: [], stateChanges: [] };
  }

  if (name === 'ls') {
    const fileArg = args.filter((a) => !a.startsWith('-'))[0];
    const showHidden = args.some((a) => /^-[a-zA-Z]*a/.test(a));
    const longFormat = args.some((a) => /^-[a-zA-Z]*l/.test(a));
    const target = fileArg ? resolvePath(ctx.cwd, fileArg, ctx.prevDir) : ctx.cwd;
    if (!vfs[target]) return fail(`ls : impossible d'accéder à '${fileArg}': Aucun fichier ou dossier de ce type`, 'enoent');
    const user = userInfo.user || 'user';
    const formatLong = (entryName, node) => {
      const isDir = node && node.type === 'dir';
      const perm = node && node.perms ? node.perms : (isDir ? 'drwxr-xr-x' : '-rw-r--r--');
      const size = isDir ? 4096 : ((node && node.content) ? String(node.content).length : 0);
      return perm + ' 1 ' + user + ' ' + user + ' ' + String(size).padStart(6) + ' Dec 15 10:23 ' + entryName;
    };
    if (vfs[target].type === 'file') {
      const entryName = target.split('/').pop();
      return { exitCode: 0, stdout: longFormat ? [formatLong(entryName, vfs[target])] : [entryName], stderr: [], stateChanges: [] };
    }
    const names = (vfs[target].children || []).filter((item) => showHidden || !item.startsWith('.'));
    if (!longFormat) return { exitCode: 0, stdout: names, stderr: [], stateChanges: [] };
    const lines = ['total ' + (names.length * 4)];
    names.forEach((entryName) => {
      const child = target === '/' ? '/' + entryName : target + '/' + entryName;
      lines.push(formatLong(entryName, vfs[child] || { type: 'file' }));
    });
    return { exitCode: 0, stdout: lines, stderr: [], stateChanges: [] };
  }

  if (name === 'cat') {
    if (args[0]) {
      const target = resolvePath(ctx.cwd, args[0], ctx.prevDir);
      if (!vfs[target]) return fail(`cat : ${args[0]} : Aucun fichier ou dossier de ce type`, 'enoent');
      if (vfs[target].type === 'dir') return fail(`cat : ${args[0]} : est un répertoire`, 'eisdir');
      if (ctx.permCheck && vfs[target].perms && vfs[target].perms.startsWith('-r--------')) {
        return fail(`cat : ${args[0]} : Permission non accordée`, 'eacces');
      }
      return { exitCode: 0, stdout: String(vfs[target].content || '').split('\n'), stderr: [], stateChanges: [] };
    }
    return { exitCode: 0, stdout: stdin.slice(), stderr: [], stateChanges: [] };
  }

  if (name === 'grep') {
    const flags = args.filter((a) => a.startsWith('-'));
    const nonFlag = args.filter((a) => !a.startsWith('-'));
    const pattern = nonFlag[0];
    const files = nonFlag.slice(1);
    if (!pattern) return fail('grep : spécifiez un motif', 'usage', 2);
    let lines = stdin.slice();
    if (files.length) {
      lines = [];
      for (const file of files) {
        const target = resolvePath(ctx.cwd, file, ctx.prevDir);
        if (!vfs[target] || vfs[target].type !== 'file') return fail(`grep : ${file} : Aucun fichier de ce type`, 'enoent');
        const fileLines = String(vfs[target].content || '').split('\n');
        lines.push(...fileLines.map((line) => files.length > 1 ? `${file}:${line}` : line));
      }
    }
    const ci = flags.some((flag) => flag === '--ignore-case' || /^-[^-]*i/.test(flag));
    const extended = flags.some((flag) => flag === '--extended-regexp' || /^-[^-]*E/.test(flag));
    let matched;
    if (extended) {
      let expression;
      try {
        expression = new RegExp(pattern, ci ? 'i' : '');
      } catch {
        return fail('grep : expression régulière invalide', 'invalid-regex', 2);
      }
      matched = lines.filter((line) => expression.test(line));
    } else {
      matched = lines.filter((line) => (ci ? line.toLowerCase().includes(pattern.toLowerCase()) : line.includes(pattern)));
    }
    return { exitCode: matched.length ? 0 : 1, stdout: matched, stderr: [], stateChanges: [], errorCode: matched.length ? undefined : 'no-match' };
  }

  if (name === 'tail') {
    let count = 10;
    for (let index = 0; index < args.length; index += 1) {
      const arg = args[index];
      if (arg === '-n' && /^\d+$/.test(args[index + 1] || '')) {
        count = Number(args[index + 1]);
        index += 1;
      } else if (/^-\d+$/.test(arg)) {
        count = Number(arg.slice(1));
      }
    }
    return { exitCode: 0, stdout: stdin.slice(-count), stderr: [], stateChanges: [] };
  }

  if (name === 'cut') {
    let delimiter = '\t';
    let field = 1;
    for (let i = 0; i < args.length; i += 1) {
      if (args[i] === '-d' && args[i + 1] !== undefined) {
        delimiter = args[i + 1];
        i += 1;
      } else if (args[i].startsWith('-d') && args[i].length > 2) delimiter = args[i].slice(2);
      else if (args[i] === '-f' && args[i + 1] !== undefined) {
        field = Number(args[i + 1]) || 1;
        i += 1;
      } else if (args[i].startsWith('-f') && args[i].length > 2) field = Number(args[i].slice(2)) || 1;
    }
    const stdout = stdin.map((line) => {
      const parts = line.split(delimiter);
      return parts[field - 1] ?? '';
    });
    return { exitCode: 0, stdout, stderr: [], stateChanges: [] };
  }

  if (name === 'awk') {
    const program = args[0] || '';
    const fieldMatch = program.match(/\{print\s+\$(\d+|NF)\}/);
    const stdout = stdin.map((line) => {
      const parts = line.trim().split(/\s+/);
      if (!fieldMatch) return line;
      if (fieldMatch[1] === 'NF') return parts[parts.length - 1] || '';
      return parts[Number(fieldMatch[1]) - 1] || '';
    });
    return { exitCode: 0, stdout, stderr: [], stateChanges: [] };
  }

  if (name === 'base64') {
    const decode = args.includes('-d');
    const payload = args.filter((a) => a !== '-d')[0] ?? stdin.join('');
    try {
      const stdout = decode
        ? [Buffer.from(payload, 'base64').toString('utf8')]
        : [Buffer.from(payload, 'utf8').toString('base64')];
      return { exitCode: 0, stdout, stderr: [], stateChanges: [] };
    } catch {
      return fail('base64 : données invalides', 'invalid-base64');
    }
  }

  if (name === 'find') {
  const nonFlags = args.filter((a) => !a.startsWith('-'));
  const nameIdx = args.indexOf('-name');
  const permIdx = args.indexOf('-perm');
  const pattern = nameIdx >= 0 ? args[nameIdx + 1] : null;
  const perm = permIdx >= 0 ? args[permIdx + 1] : null;
  const needle = globToIncludes(pattern);
  const root = resolvePath(ctx.cwd, nonFlags[0] || '.', ctx.prevDir);
  const results = [];
  const visit = (dirPath) => {
    const node = vfs[dirPath];
    if (!node) return;
    const nameOk = !pattern || dirPath.split('/').pop().includes(needle);
    const permOk = !perm || (node.perms || '').includes('s') || (node.perms || '').includes('4000');
    if (nameOk && permOk) results.push(dirPath);
    if (node.type === 'dir') (node.children || []).forEach((child) => visit(childPath(dirPath, child)));
  };
  visit(root);
  return { exitCode: 0, stdout: results, stderr: [], stateChanges: [] };
  }

  if (name === 'mkdir') {
    const opts = args.filter((a) => a.startsWith('-'));
    const dirs = args.filter((a) => !a.startsWith('-'));
    if (!dirs[0]) return fail('mkdir : nom de répertoire manquant', 'usage', 1);
    const verbose = opts.some((a) => a.includes('v'));
    const parents = opts.some((a) => a.includes('p'));
    const target = resolvePath(ctx.cwd, dirs[0], ctx.prevDir);
    if (vfs[target]) return fail(`mkdir : impossible de créer le répertoire « ${dirs[0]} » : Le fichier existe`, 'eexist');
    const parentPath = target.lastIndexOf('/') > 0 ? target.slice(0, target.lastIndexOf('/')) : '/';
    const dirName = target.split('/').pop();
    if (!vfs[parentPath] && !parents) return fail('mkdir : impossible de créer le répertoire : chemin parent inexistant (utilisez -p)', 'enoent');
    if (parents && !vfs[parentPath]) vfs[parentPath] = { type: 'dir', children: [] };
    vfs[target] = { type: 'dir', children: [] };
    if (vfs[parentPath] && !(vfs[parentPath].children || []).includes(dirName)) vfs[parentPath].children.push(dirName);
    changes.push({ op: 'mkdir', path: target });
    return {
      exitCode: 0,
      stdout: verbose ? [`mkdir: répertoire « ${dirs[0]} » créé`] : [],
      stderr: [],
      stateChanges: changes,
    };
  }

  if (name === 'chmod') {
    if (args.length < 2) return fail('chmod : opérandes manquantes', 'usage');
    const fileArg = args[args.length - 1];
    const target = resolvePath(ctx.cwd, fileArg, ctx.prevDir);
    if (!vfs[target]) return fail(`chmod : impossible d'accéder à « ${fileArg} » : Aucun fichier ou dossier de ce type`, 'enoent');
    const perm = args[0];
    const permMap = {
      '+x': 'rwxr-xr-x', 'a+x': 'rwxr-xr-x', 'u+x': 'rwxr-xr-x',
      755: 'rwxr-xr-x', '0755': 'rwxr-xr-x', 644: 'rw-r--r--', 600: 'rw-------',
    };
    if (permMap[perm]) vfs[target].perms = `-${permMap[perm]}`;
    changes.push({ op: 'chmod', path: target, perms: vfs[target].perms });
    return { exitCode: 0, stdout: [], stderr: [], stateChanges: changes };
  }

  if (name === 'touch') {
    if (!args[0]) return fail('touch : nom de fichier manquant', 'usage');
    const target = resolvePath(ctx.cwd, args[0], ctx.prevDir);
    if (!vfs[target]) {
      const parentPath = target.lastIndexOf('/') > 0 ? target.slice(0, target.lastIndexOf('/')) : '/';
      const fname = target.split('/').pop();
      vfs[target] = { type: 'file', content: '' };
      if (vfs[parentPath] && !(vfs[parentPath].children || []).includes(fname)) vfs[parentPath].children.push(fname);
    }
    changes.push({ op: 'touch', path: target });
    return { exitCode: 0, stdout: [], stderr: [], stateChanges: changes };
  }

  return fail(`bash: ${name}: commande introuvable`, 'enoent', 127);
}

export function runShell({
  vfs,
  cwd = '/home/user',
  command,
  permCheck = false,
  recursiveFind = true,
  userInfo = { user: 'user', hostname: 'user-pc' },
  extraCommands = {},
} = {}) {
  const parsed = parseCommandLine(command);
  if (!parsed.ok) {
    return {
      exitCode: parsed.exitCode,
      stdout: [],
      stderr: parsed.stderr,
      cwd,
      stateChanges: [],
      errorCode: parsed.errorCode,
      command: null,
      commands: [],
      stages: [],
    };
  }
  if (!parsed.stages.length) {
    return { exitCode: 0, stdout: [], stderr: [], cwd, stateChanges: [], command: null, commands: [], stages: [] };
  }
  const ctx = { vfs, cwd, prevDir: null, permCheck, recursiveFind, userInfo };
  let stdin = [];
  let last = { exitCode: 0, stdout: [], stderr: [], stateChanges: [] };
  const stateChanges = [];
  for (const stage of parsed.stages) {
    const [name, ...args] = stage;
    if (extraCommands[name]) {
      last = extraCommands[name](args, ctx, stdin) || { exitCode: 0, stdout: [], stderr: [], stateChanges: [] };
    } else {
      last = runCommand(ctx, name, args, stdin);
    }
    stateChanges.push(...(last.stateChanges || []));
    stdin = last.stdout || [];
    if (last.exitCode === 127) break;
  }
  return {
    exitCode: last.exitCode,
    stdout: last.stdout,
    stderr: last.stderr,
    cwd: ctx.cwd,
    stateChanges,
    errorCode: last.errorCode,
    command: parsed.stages[0][0],
    commands: parsed.stages.map((stage) => stage[0]),
    stages: parsed.stages.map((stage) => stage.slice()),
  };
}
