function ok(stdout, extra = {}) {
  return { exitCode: 0, stdout: Array.isArray(stdout) ? stdout : [stdout], stderr: [], stateChanges: [], ...extra };
}

function childPath(parent, name) {
  return parent === '/' ? `/${name}` : `${parent.replace(/\/$/, '')}/${name}`;
}

function resolveLabPath(ctx, candidate) {
  if (!candidate) return null;
  return candidate.startsWith('/')
    ? candidate
    : `${ctx.cwd}/${candidate}`.replace(/\/+/g, '/');
}

function scenario(ctx) {
  try {
    const node = ctx.vfs['/etc/linuxpath-scenario.json'];
    return node?.type === 'file' ? JSON.parse(node.content) : {};
  } catch { return {}; }
}

const artifactChecksums = {
  'LAB_SAMPLE_ONLY\nhttps://c2.training.invalid/callback\n': '0e1a4734f609146ce91de2f680e0f6bfe5f539f7596895820674232c25f37ad2',
  'LINUXPATH_TRAINING_EVIDENCE_IMAGE\n': 'e517bf22cfe911ce831a192e9525560715f62da8a151a14848e10b91c5b1df5d',
};

export const pedagogicalCommands = {
  ps: () => ok([
    'USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND',
    'root           1  0.0  0.1 168380 13008 ?        Ss   10:00   0:02 /sbin/init',
    'user        1023  0.1  0.0  10596  5120 pts/0    Ss   10:02   0:00 bash',
  ]),
  ping: (args) => {
    const host = args.find((a, i) => {
      if (a.startsWith('-')) return false;
      if (i > 0 && args[i - 1] === '-c') return false;
      return true;
    }) || 'host';
    return ok([`PING ${host} (142.250.74.46) 56(84) bytes of data.`, `64 bytes from ${host}: icmp_seq=1 ttl=119 time=21 ms`]);
  },
  ip: () => ok(['1: lo: <LOOPBACK,UP> mtu 65536', '2: eth0: <BROADCAST,UP> inet 192.168.1.10/24']),
  ifconfig: () => ok(['eth0: flags=4163<UP,BROADCAST,RUNNING>', 'inet 192.168.1.10']),
  systemctl: (args) => ok([`● ${args[1] || 'ssh'}.service - OpenBSD Secure Shell server`, '     Active: active (running)']),
  service: (args) => ok([`${args[0] || 'ssh'} is running.`]),
  crontab: () => ok(['0 2 * * * /usr/local/bin/backup.sh']),
  dig: (args) => {
    const types = new Set(['a', 'aaaa', 'mx', 'ns', 'txt', 'cname', 'soa', 'ptr', 'any', 'type255']);
    const host = args.find((a) => !a.startsWith('+') && !types.has(a.toLowerCase())) || 'example.com';
    return ok([`; <<>> DiG 9.18.1 <<>> ${host}`, `${host}. 300 IN A 93.184.216.34`]);
  },
  git: (args, ctx) => {
    if (args[0] === 'init') {
      const gitDir = childPath(ctx.cwd, '.git');
      ctx.vfs[gitDir] = { type: 'dir', children: [] };
      const parent = ctx.vfs[ctx.cwd];
      if (parent && !(parent.children || []).includes('.git')) parent.children.push('.git');
      return ok([`Dépôt Git vide initialisé dans ${gitDir}/`]);
    }
    if (args[0] === 'add') return ok([`git add ${args[1] || '.'} — fichiers ajoutés à l'index (simulation)`]);
    return ok(['git: simulation']);
  },
  docker: (args) => {
    if (args[0] === 'pull') return ok([`Using default tag: latest`, `${args[1] || 'ubuntu'}: Pull complete`]);
    if (args[0] === 'run') return ok(['Conteneur ubuntu démarré en mode interactif (simulation).', 'root@container:/#']);
    return ok(['docker: simulation']);
  },
  'ssh-keygen': (args, ctx) => {
    const key = childPath(ctx.cwd, '.ssh');
    if (!ctx.vfs[key]) {
      ctx.vfs[key] = { type: 'dir', children: ['id_ed25519', 'id_ed25519.pub'] };
      const parent = ctx.vfs[ctx.cwd];
      if (parent && !(parent.children || []).includes('.ssh')) parent.children.push('.ssh');
    }
    ctx.vfs[childPath(key, 'id_ed25519')] = { type: 'file', content: '-----BEGIN OPENSSH PRIVATE KEY-----\nsim\n' };
    ctx.vfs[childPath(key, 'id_ed25519.pub')] = { type: 'file', content: 'ssh-ed25519 AAAAC3Nza sim' };
    return ok([`Generating public/private ${args.includes('-t') ? 'ed25519' : 'rsa'} key pair.`, `Your identification has been saved in ${key}/id_ed25519`]);
  },
  rsync: () => ok(['sending incremental file list', 'projet/', 'sent 1,234 bytes  received 42 bytes']),
  ssh: (args) => ok([`ssh : connexion à ${args.filter((a) => !a.startsWith('-'))[0] || 'host'} (simulation)`]),
  certbot: () => ok(['Requesting a certificate for monsite.com', 'Successfully received certificate.']),
  openssl: (args, ctx, stdin) => {
    if (args[0] === 's_client') return ok(['-----BEGIN CERTIFICATE-----', 'MIIFsim', '-----END CERTIFICATE-----']);
    if (args[0] === 'x509') return ok(['notBefore=Jan  1 00:00:00 2026 GMT', 'notAfter=Jan  1 00:00:00 2027 GMT']);
    return ok(stdin);
  },
  nft: (args, ctx) => {
    if (args[0] === 'list') return ok(['table inet filter {', '  chain input { type filter hook input priority 0; }', '}']);
    if (args[0] === 'add') {
      ctx.vfs['/etc/nftables.applied'] = { type: 'file', content: args.join(' ') };
      return ok(['nft: règle ajoutée (simulation)']);
    }
    return ok(['nft: simulation']);
  },
  ss: (args) => {
    const listeners = args.some((arg) => arg.startsWith('-') && arg.includes('l'));
    return listeners
      ? ok(['State  Recv-Q Send-Q Local Address:Port', 'LISTEN 0      128        0.0.0.0:22'])
      : ok(['State Recv-Q Send-Q Local Address:Port Peer Address:Port', 'ESTAB 0      0      192.0.2.10:443   198.51.100.25:52644']);
  },
  journalctl: (args) => {
    if (args.includes('-u') && args.includes('ssh.service')) {
      return ok(['Aug 31 10:02:11 linuxpath sshd[821]: Accepted publickey for user from 198.51.100.25', 'Aug 31 10:04:02 linuxpath sshd[834]: Failed password for invalid user lab from 198.51.100.25']);
    }
    if (args.some((arg) => arg === '_UID=0')) {
      return ok(['Aug 31 09:58:31 linuxpath systemd[1]: Started OpenSSH server daemon.', 'Aug 31 10:00:00 linuxpath CRON[710]: (root) CMD (test -x /usr/sbin/anacron)']);
    }
    return { exitCode: 1, stdout: [], stderr: ['journalctl : filtre de démonstration non pris en charge'], stateChanges: [] };
  },
  lynis: (args, ctx) => {
    const required = ['audit', 'system', '--quick'];
    if (!required.every((token) => args.includes(token))) {
      return { exitCode: 1, stdout: [], stderr: ['lynis : utilisez audit system --quick dans ce lab'], stateChanges: [] };
    }
    const audit = scenario(ctx).audit || { index: 66, lines: ['Warning: SSH PermitRootLogin is enabled [SSH-7412]', 'Suggestion: review unused filesystems before remediation'] };
    return ok(['[ Lynis 3.0 — simulation LinuxPath ]', `Hardening index : ${audit.index}`, ...(audit.lines || [])]);
  },
  auditctl: (args, ctx) => {
    const audit = scenario(ctx).audit || { path: '/etc/passwd', key: 'identity' };
    if (args.length === 1 && args[0] === '-l') {
      return ok([`-a always,exit -F arch=b64 -F path=${audit.path} -F perm=wa -k ${audit.key}`]);
    }
    const required = ['-a', 'always,exit', '-F', 'arch=b64', `path=${audit.path}`, 'perm=wa', '-k', audit.key];
    if (!required.every((token) => args.includes(token))) {
      return { exitCode: 1, stdout: [], stderr: ['auditctl : utilisez une règle syscall explicite dans ce lab'], stateChanges: [] };
    }
    return ok([`auditctl: règle syscall installée pour ${audit.path} (clé : ${audit.key})`]);
  },
  ausearch: (args) => {
    if (args.includes('-k') && args.includes('identity')) {
      return ok(['type=PATH msg=audit(1725098400.321:7412): item=0 name="/etc/passwd" key="identity"']);
    }
    return { exitCode: 1, stdout: [], stderr: ['ausearch : utilisez -k identity dans ce lab'], stateChanges: [] };
  },
  nmap: (args, ctx) => {
    const config = scenario(ctx).nmap || { host: 'lab.linuxpath.test', port: '80', service: 'http', title: 'LinuxPath training application' };
    const host = args[args.length - 1] || 'host';
    if (host !== config.host) return { exitCode: 1, stdout: [], stderr: ['LinuxPath : la simulation Nmap accepte uniquement la cible autorisée du dossier'], stateChanges: [] };
    const required = ['-sV', '-p', config.port, '--script=http-title'];
    if (!required.every((token) => args.includes(token))) {
      return { exitCode: 1, stdout: [], stderr: ['LinuxPath : respectez exactement le port et le script autorisés dans le périmètre'], stateChanges: [] };
    }
    return ok(['LinuxPath : simulation — aucun paquet envoyé.', 'Starting Nmap 7.91 ( Ubuntu 22.04 lab profile )', `Nmap scan report for ${host}`, 'PORT   STATE SERVICE VERSION', `${config.port}/tcp open  ${config.service}    LinuxPath simulated service`, `| http-title: ${config.title}`]);
  },
  msfconsole: () => ok(['Metasploit Framework', 'msf6 >']),
  gobuster: (args) => {
    const urlIndex = args.indexOf('-u');
    const target = urlIndex >= 0 ? args[urlIndex + 1] : '';
    const required = ['dir', '-u', 'http://webapp.lab.linuxpath.test', '-w', '/home/user/wordlists/lab-small.txt', '-t', '1'];
    if (!required.every((token) => args.includes(token)) || target !== 'http://webapp.lab.linuxpath.test') {
      return { exitCode: 1, stdout: [], stderr: ['LinuxPath : utilisez gobuster dir avec la wordlist du lab et -t 1'], stateChanges: [] };
    }
    return ok(['LinuxPath : simulation — aucun paquet envoyé.', '===============================================================', '/admin                (Status: 301)']);
  },
  strings: (args, ctx, stdin) => {
    const file = args.find((a) => !a.startsWith('-'));
    if (file && ctx.vfs[file]) return ok(String(ctx.vfs[file].content || '').split('\n'));
    const resolved = resolveLabPath(ctx, file);
    if (resolved && ctx.vfs[resolved]) return ok(String(ctx.vfs[resolved].content || '').split('\n'));
    if (file) return { exitCode: 1, stdout: [], stderr: [`strings : ${file} : Aucun fichier de ce type`], stateChanges: [] };
    return ok(stdin);
  },
  sha256sum: (args, ctx) => {
    const file = args.find((arg) => !arg.startsWith('-'));
    const source = resolveLabPath(ctx, file);
    const content = source && ctx.vfs[source]?.type === 'file' ? String(ctx.vfs[source].content || '') : null;
    const hash = content === null ? null : artifactChecksums[content];
    if (!file || !hash) return { exitCode: 1, stdout: [], stderr: ['sha256sum : artefact de démonstration introuvable'], stateChanges: [] };
    return ok([`${hash}  ${file}`]);
  },
  file: (args, ctx) => {
    const file = args.find((arg) => !arg.startsWith('-'));
    const source = resolveLabPath(ctx, file);
    const content = source && ctx.vfs[source]?.type === 'file' ? String(ctx.vfs[source].content || '') : null;
    if (!file || content === null) return { exitCode: 1, stdout: [], stderr: ['file : artefact de démonstration introuvable'], stateChanges: [] };
    const kind = content.startsWith('LAB_SAMPLE_ONLY')
      ? 'LinuxPath inert training artifact, ASCII text'
      : 'LinuxPath training evidence image, ASCII text';
    return ok([`${file}: ${kind}`]);
  },
  binwalk: (args, ctx) => {
    const file = args.find((a) => !a.startsWith('-')) || 'firmware.bin';
    const source = resolveLabPath(ctx, file);
    const config = scenario(ctx).firmware || { file: 'firmware.bin', description: 'UBI image header' };
    if (!source || !ctx.vfs[source] || ctx.vfs[source].type !== 'file') {
      return { exitCode: 1, stdout: [], stderr: [`binwalk : ${file} : Aucun fichier de ce type`], stateChanges: [] };
    }
    if (source !== `/home/user/${config.file}`) {
      return { exitCode: 1, stdout: [], stderr: ['LinuxPath : analysez uniquement le firmware attribué à ce dossier'], stateChanges: [] };
    }
    const lines = ['DECIMAL  HEX  DESCRIPTION', `0        0x0  ${config.description} (LinuxPath simulated marker)`];
    if (args.includes('-e')) {
      const parentPath = source.slice(0, source.lastIndexOf('/')) || '/';
      const outDir = `${parentPath}/_${source.split('/').pop()}.extracted`;
      ctx.vfs[outDir] = { type: 'dir', children: [] };
      const parent = ctx.vfs[parentPath];
      const name = outDir.split('/').pop();
      if (parent && !(parent.children || []).includes(name)) parent.children.push(name);
      lines.push(`extracted to ${outDir}`);
    }
    return ok(lines);
  },
  dd: (args, ctx) => {
    const sourceArgs = args.filter((a) => a.startsWith('if='));
    const destinationArgs = args.filter((a) => a.startsWith('of='));
    if (sourceArgs.length !== 1 || destinationArgs.length !== 1) return { exitCode: 1, stdout: [], stderr: ['dd : indiquez une seule source if= et une seule destination of='], stateChanges: [] };
    const sourceArg = sourceArgs[0];
    const destinationArg = destinationArgs[0];
    const source = sourceArg.slice(3);
    const of = destinationArg.slice(3);
    if (!ctx.vfs[source] || ctx.vfs[source].type !== 'file') return { exitCode: 1, stdout: [], stderr: ['dd : source introuvable dans le lab'], stateChanges: [] };
    const parent = of.slice(0, of.lastIndexOf('/')) || '/';
    if (!ctx.vfs[parent] || ctx.vfs[parent].type !== 'dir') return { exitCode: 1, stdout: [], stderr: ['dd : répertoire de destination introuvable'], stateChanges: [] };
    const content = String(ctx.vfs[source].content || '');
    ctx.vfs[of] = { type: 'file', content };
    const name = of.split('/').pop();
    if (ctx.vfs[parent] && !(ctx.vfs[parent].children || []).includes(name)) ctx.vfs[parent].children.push(name);
    return ok(['0+1 records in', '0+1 records out', `${Buffer.byteLength(content)} bytes copied (simulation)`]);
  },
  rapport: (args, ctx) => {
    const values = {};
    let duplicate = false;
    for (let index = 0; index < args.length; index += 2) {
      if (args[index].startsWith('--') && args[index + 1]) {
        const key = args[index].slice(2);
        if (values[key] !== undefined) duplicate = true;
        values[key] = args[index + 1];
      }
    }
    const required = ['target', 'finding', 'impact', 'evidence', 'scope', 'observed-at', 'tool', 'confidence', 'remediation', 'retest'];
    if (duplicate || values.target !== 'lab.linuxpath.test' || !required.every((field) => values[field]) || args.length !== required.length * 2) {
      return { exitCode: 1, stdout: [], stderr: ['rapport : précisez cible, constat, impact, preuve, périmètre, date, outil, confiance, remédiation et test de suivi'], stateChanges: [] };
    }
    const reportPath = '/home/user/documents/rapport-m13.txt';
    ctx.vfs[reportPath] = { type: 'file', content: `Cible : ${values.target}\nPérimètre : ${values.scope}\nObservé le : ${values['observed-at']}\nOutil : ${values.tool}\nConstat : ${values.finding}\nConfiance : ${values.confidence}\nImpact : ${values.impact}\nPreuve : ${values.evidence}\nRemédiation : ${values.remediation}\nTest de suivi : ${values.retest}\n` };
    const documents = ctx.vfs['/home/user/documents'];
    if (documents && !(documents.children || []).includes('rapport-m13.txt')) documents.children.push('rapport-m13.txt');
    return ok([`rapport : constat pédagogique enregistré dans ${reportPath}`]);
  },
};
