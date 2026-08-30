function ok(stdout, extra = {}) {
  return { exitCode: 0, stdout: Array.isArray(stdout) ? stdout : [stdout], stderr: [], stateChanges: [], ...extra };
}

function childPath(parent, name) {
  return parent === '/' ? `/${name}` : `${parent.replace(/\/$/, '')}/${name}`;
}

export const pedagogicalCommands = {
  ps: () => ok([
    'USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND',
    'root           1  0.0  0.1 168380 13008 ?        Ss   10:00   0:02 /sbin/init',
    'user        1023  0.1  0.0  10596  5120 pts/0    Ss   10:02   0:00 bash',
  ]),
  ping: (args) => {
    const host = args.filter((a) => !a.startsWith('-'))[0] || 'host';
    return ok([`PING ${host} (142.250.74.46) 56(84) bytes of data.`, `64 bytes from ${host}: icmp_seq=1 ttl=119 time=21 ms`]);
  },
  ip: () => ok(['1: lo: <LOOPBACK,UP> mtu 65536', '2: eth0: <BROADCAST,UP> inet 192.168.1.10/24']),
  ifconfig: () => ok(['eth0: flags=4163<UP,BROADCAST,RUNNING>', 'inet 192.168.1.10']),
  systemctl: (args) => ok([`● ${args[1] || 'ssh'}.service - OpenBSD Secure Shell server`, '     Active: active (running)']),
  service: (args) => ok([`${args[0] || 'ssh'} is running.`]),
  crontab: () => ok(['0 2 * * * /usr/local/bin/backup.sh']),
  dig: (args) => ok([`; <<>> DiG 9.18.1 <<>> ${args[0] || 'example.com'}`, `${args[0] || 'example.com'}. 300 IN A 93.184.216.34`]),
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
  ss: () => ok(['State  Recv-Q Send-Q Local Address:Port', 'LISTEN 0      128        0.0.0.0:22']),
  lynis: () => ok(['[ Lynis 3.0 ]', 'Hardening index : 66', 'Warning: SSH permit root login']),
  auditctl: () => ok(['auditctl: watch installed on /etc/passwd']),
  nmap: (args) => ok([`Starting Nmap 7.94 ( https://nmap.org )`, `Nmap scan report for ${args[args.length - 1]}`, '22/tcp open ssh']),
  msfconsole: () => ok(['Metasploit Framework', 'msf6 >']),
  gobuster: () => ok(['===============================================================', '/admin                (Status: 301)']),
  strings: (args, ctx, stdin) => {
    const file = args.find((a) => !a.startsWith('-'));
    if (file && ctx.vfs[file]) return ok(String(ctx.vfs[file].content || '').split('\n'));
    const resolved = file ? `${ctx.cwd}/${file}`.replace(/\/+/g, '/') : null;
    if (resolved && ctx.vfs[resolved]) return ok(String(ctx.vfs[resolved].content || '').split('\n'));
    return ok(stdin);
  },
  binwalk: (args, ctx) => {
    const file = args.find((a) => !a.startsWith('-')) || 'firmware.bin';
    const outDir = `${ctx.cwd}/_${file}.extracted`.replace(/\/+/g, '/');
    ctx.vfs[outDir] = { type: 'dir', children: [] };
    const parent = ctx.vfs[ctx.cwd];
    const name = outDir.split('/').pop();
    if (parent && !(parent.children || []).includes(name)) parent.children.push(name);
    return ok(['DECIMAL  HEX  DESCRIPTION', `0        0x0  extracted to ${outDir}`]);
  },
  dd: (args, ctx) => {
    const of = (args.find((a) => a.startsWith('of=')) || 'of=/mnt/evidence/disk.img').slice(3);
    ctx.vfs[of] = { type: 'file', content: 'DISKIMAGE' };
    const parent = of.slice(0, of.lastIndexOf('/')) || '/';
    const name = of.split('/').pop();
    if (ctx.vfs[parent] && !(ctx.vfs[parent].children || []).includes(name)) ctx.vfs[parent].children.push(name);
    return ok(['123+0 records in', '123+0 records out']);
  },
};
