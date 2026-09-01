(function (root) {
  'use strict';

  function ok(stdout, extra) {
    var lines = stdout == null ? [] : (Array.isArray(stdout) ? stdout : [stdout]);
    return Object.assign({ exitCode: 0, stdout: lines, stderr: [], stateChanges: [] }, extra || {});
  }

  function fail(message, errorCode, exitCode) {
    return { exitCode: exitCode || 1, stdout: [], stderr: [message], errorCode: errorCode || 'usage', stateChanges: [] };
  }

  function childPath(parent, name) {
    return parent === '/' ? '/' + name : parent.replace(/\/$/, '') + '/' + name;
  }

  function resolve(ctx, candidate) {
    return ctx.resolvePath(candidate);
  }

  function addChild(vfs, parentPath, name) {
    var parent = vfs[parentPath];
    if (parent && parent.type === 'dir' && parent.children.indexOf(name) < 0) parent.children.push(name);
  }

  function scenario(ctx) {
    try {
      var node = ctx.vfs['/etc/linuxpath-scenario.json'];
      return node && node.type === 'file' ? JSON.parse(node.content) : {};
    } catch (_) {
      return {};
    }
  }

  function hasShortFlag(args, letter) {
    return args.some(function (arg) {
      return arg.charAt(0) === '-' && arg.charAt(1) !== '-' && arg.slice(1).indexOf(letter) >= 0;
    });
  }

  function optionValue(args, option) {
    var index = args.indexOf(option);
    return index >= 0 ? args[index + 1] : null;
  }

  var artifactChecksums = {
    'LAB_SAMPLE_ONLY\nhttps://c2.training.invalid/callback\n': '0e1a4734f609146ce91de2f680e0f6bfe5f539f7596895820674232c25f37ad2',
    'LINUXPATH_TRAINING_EVIDENCE_IMAGE\n': 'e517bf22cfe911ce831a192e9525560715f62da8a151a14848e10b91c5b1df5d'
  };

  function createPedagogicalCommands() {
    var commands = {
      date: function () { return ok([new Date().toString()]); },
      uname: function (args) {
        return ok([args.indexOf('-a') >= 0
          ? 'Linux user-pc 5.15.0-91-generic #101-Ubuntu SMP x86_64 GNU/Linux'
          : 'Linux']);
      },
      ps: function (args) {
        var complete = args.length > 0;
        return ok(complete ? [
          'USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND',
          'root           1  0.0  0.1 168380 13008 ?        Ss   10:00   0:02 /sbin/init',
          'root         891  0.0  0.0  72300  5612 ?        Ss   10:00   0:00 /usr/sbin/sshd -D',
          'user        1023  0.1  0.0  10596  5120 pts/0    Ss   10:02   0:00 bash'
        ] : ['  PID TTY          TIME CMD', ' 1023 pts/0    00:00:00 bash']);
      },
      chown: function (args, ctx) {
        if (args.length < 2) return fail('chown : opérandes manquantes', 'usage');
        var target = resolve(ctx, args[args.length - 1]);
        if (!ctx.vfs[target]) return fail('chown : cible introuvable', 'enoent');
        ctx.vfs[target].owner = args[0];
        return ok([], { stateChanges: [{ op: 'chown', path: target, owner: args[0] }] });
      },
      cp: function (args, ctx) {
        var operands = args.filter(function (arg) { return arg.charAt(0) !== '-'; });
        if (operands.length < 2) return fail('cp : opérandes de fichier manquants', 'usage');
        var source = resolve(ctx, operands[0]);
        var destination = resolve(ctx, operands[1]);
        var recursive = hasShortFlag(args, 'r') || args.indexOf('--recursive') >= 0;
        var copied = ctx.vfsApi.copy(source, destination, recursive);
        if (!copied.ok) return fail(copied.message, copied.errorCode);
        return ok([], { stateChanges: [{ op: 'cp', from: source, path: destination }] });
      },
      mv: function (args, ctx) {
        if (args.length < 2) return fail('mv : opérandes de fichier manquants', 'usage');
        var source = resolve(ctx, args[0]);
        var destination = resolve(ctx, args[1]);
        var moved = ctx.vfsApi.move(source, destination);
        if (!moved.ok) return fail(moved.message, moved.errorCode);
        return ok([], { stateChanges: [{ op: 'mv', from: source, path: destination }] });
      },
      ping: function (args) {
        var host = null;
        for (var index = 0; index < args.length; index += 1) {
          if (args[index].charAt(0) === '-') continue;
          if (index > 0 && args[index - 1] === '-c') continue;
          host = args[index];
          break;
        }
        if (!host) return fail('ping : hôte manquant', 'usage');
        return ok(['PING ' + host + ' (142.250.74.46) 56(84) bytes of data.', '64 bytes from ' + host + ': icmp_seq=1 ttl=119 time=21 ms']);
      },
      ip: function (args) {
        var object = args[0];
        if (object === 'addr' || object === 'a' || object === 'address') {
          if (args[1] && args[1] !== 'show') return fail('ip : argument non pris en charge : ' + args[1], 'usage');
          return ok(['1: lo: <LOOPBACK,UP> mtu 65536', '    inet 127.0.0.1/8 scope host lo', '2: eth0: <BROADCAST,MULTICAST,UP> mtu 1500', '    inet 192.168.1.42/24 scope global eth0']);
        }
        return fail('ip : objet "' + (object || '') + '" inconnu', 'usage');
      },
      ifconfig: function () { return ok(['eth0: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>', '        inet 192.168.1.42', 'lo: flags=73<UP,LOOPBACK,RUNNING>', '        inet 127.0.0.1']); },
      ss: function (args) {
        var listeners = hasShortFlag(args, 'l');
        return listeners
          ? ok(['Netid State  Local Address:Port', 'tcp   LISTEN 0.0.0.0:22', 'tcp   LISTEN 0.0.0.0:80'])
          : ok(['Netid State Local Address:Port Peer Address:Port', 'tcp   ESTAB 192.0.2.10:443 198.51.100.25:52644']);
      },
      journalctl: function (args) {
        if (args.indexOf('-u') >= 0 && args.indexOf('ssh.service') >= 0) return ok(['Aug 31 10:02:11 linuxpath sshd[821]: Accepted publickey for user from 198.51.100.25', 'Aug 31 10:04:02 linuxpath sshd[834]: Failed password for invalid user lab from 198.51.100.25']);
        if (args.indexOf('_UID=0') >= 0) return ok(['Aug 31 09:58:31 linuxpath systemd[1]: Started OpenSSH server daemon.', 'Aug 31 10:00:00 linuxpath CRON[710]: (root) CMD (test -x /usr/sbin/anacron)']);
        return fail('journalctl : filtre de démonstration non pris en charge', 'usage');
      },
      netstat: function () { return ok(['Proto Local Address State', 'tcp 0.0.0.0:22 LISTEN']); },
      curl: function (args) {
        var url = args.filter(function (arg) { return arg.charAt(0) !== '-'; })[0];
        return url ? ok(['100 1024 100 1024', '<!DOCTYPE html><html><title>Response</title>...']) : fail('curl : URL manquante', 'usage');
      },
      wget: function (args) {
        var url = args.filter(function (arg) { return arg.charAt(0) !== '-'; })[0];
        return url ? ok(['Connexion... 200 OK', '« ' + (url.split('/').pop() || 'index.html') + ' » sauvegardé [4096/4096]']) : fail('wget : URL manquante', 'usage');
      },
      tail: function (args, ctx, stdin) {
        var count = 10;
        for (var index = 0; index < args.length; index += 1) {
          if (args[index] === '-n' && /^\d+$/.test(args[index + 1] || '')) count = Number(args[++index]);
          else if (/^-\d+$/.test(args[index])) count = Number(args[index].slice(1));
        }
        var file = args.filter(function (arg) { return arg.charAt(0) !== '-'; })[0];
        if (!file) return stdin && stdin.length ? ok(stdin.slice(-count)) : fail('tail : fichier manquant', 'usage');
        var target = resolve(ctx, file);
        return ctx.vfs[target] && ctx.vfs[target].type === 'file'
          ? ok(String(ctx.vfs[target].content || '').split('\n').slice(-count))
          : fail('tail : ' + file + ' : Aucun fichier', 'enoent');
      },
      head: function (args, ctx, stdin) {
        var file = args.filter(function (arg) { return arg.charAt(0) !== '-'; })[0];
        if (!file) return stdin && stdin.length ? ok(stdin.slice(0, 10)) : fail('head : fichier manquant', 'usage');
        var target = resolve(ctx, file);
        return ctx.vfs[target] && ctx.vfs[target].type === 'file'
          ? ok(String(ctx.vfs[target].content || '').split('\n').slice(0, 10))
          : fail('head : ' + file + ' : Aucun fichier', 'enoent');
      },
      which: function (args) {
        var known = { bash: '/bin/bash', ls: '/bin/ls', cat: '/bin/cat', echo: '/bin/echo', grep: '/bin/grep', python3: '/usr/bin/python3', node: '/usr/bin/node', git: '/usr/bin/git', docker: '/usr/bin/docker', chmod: '/bin/chmod', chown: '/bin/chown' };
        if (!args[0]) return fail('which : opérande manquant', 'usage');
        return known[args[0]] ? ok([known[args[0]]]) : fail(args[0] + ' : introuvable', 'enoent');
      },
      adduser: function (args) { var name = args.filter(function (arg) { return arg.charAt(0) !== '-'; })[0]; return name ? ok(['Ajout de l’utilisateur « ' + name + ' »... Terminé.']) : fail('adduser : nom d’utilisateur manquant', 'usage'); },
      useradd: function (args) { var name = args.filter(function (arg) { return arg.charAt(0) !== '-'; })[0]; return name ? ok(['Ajout de l’utilisateur « ' + name + ' »... Terminé.']) : fail('useradd : nom d’utilisateur manquant', 'usage'); },
      passwd: function () { return ok(['Entrez le nouveau mot de passe UNIX :', 'passwd : mot de passe mis à jour avec succès']); },
      groups: function () { return ok(['user : user adm cdrom sudo dip plugdev lxd']); },
      top: function () { return ok(['top - up 2:14, 1 user, load average: 0.12, 0.08, 0.05', 'PID USER %CPU %MEM COMMAND', '891 root 0.0 0.3 sshd']); },
      htop: function () { return ok(['htop non disponible en simulation. Utilisez top.']); },
      kill: function (args) { var pid = args.filter(function (arg) { return arg.charAt(0) !== '-'; })[0]; return pid ? ok(['Signal envoyé au processus ' + pid + '.']) : fail('kill : PID manquant', 'usage'); },
      killall: function (args) { return args[0] ? ok(['Signal envoyé aux processus "' + args[0] + '".']) : fail('killall : nom de processus manquant', 'usage'); },
      pkill: function (args) { return args[0] ? ok(['Signal envoyé aux processus "' + args[0] + '".']) : fail('pkill : nom de processus manquant', 'usage'); },
      pgrep: function (args) { return args[0] ? ok(['891  # ' + args[0]]) : fail('pgrep : nom de processus manquant', 'usage'); },
      df: function () { return ok(['Filesystem 1K-blocks Used Available Use% Mounted on', '/dev/sda1 20971520 8388608 12582912 40% /']); },
      du: function () { return ok(['4\t./documents', '8\t./scripts', '12\t.']); },
      free: function () { return ok(['total used free', 'Mem: 2034804 821044 759880', 'Swap: 2097148 0 2097148']); },
      uptime: function () { return ok(['up 2:14, 1 user, load average: 0.12, 0.08, 0.05']); },
      env: function (args, ctx) { return ok(['USER=user', 'HOME=/home/user', 'SHELL=/bin/bash', 'PATH=/usr/local/sbin:/usr/local/bin:/usr/bin:/bin', 'PWD=' + ctx.cwd]); },
      jobs: function () { return ok(['(aucun job en arrière-plan)']); },
      bg: function () { return fail('Aucun job à mettre en arrière-plan.', 'no-job'); },
      fg: function () { return fail('Aucun job à ramener au premier plan.', 'no-job'); },
      nohup: function (args) { return args[0] ? ok(['nohup: ignoring input and appending output to nohup.out']) : fail('nohup : commande manquante', 'usage'); },
      traceroute: function (args) { var host = args.filter(function (arg) { return arg.charAt(0) !== '-'; })[0]; return host ? ok(['traceroute to ' + host, '1 192.168.1.1', '2 ' + host]) : fail('traceroute : hôte manquant', 'usage'); },
      mtr: function (args) { return commands.traceroute(args); },
      lsof: function (args, ctx) { return ok(['COMMAND PID USER NAME', 'sshd 891 root *:ssh (LISTEN)', 'bash 1023 user ' + ctx.cwd]); },
      scp: function (args) { return args.length >= 2 ? ok(['scp : transfert simulé.']) : fail('scp : source et destination requises', 'usage'); },
      nano: function () { return ok(['nano n’est pas disponible dans ce terminal simulé.']); },
      vim: function () { return ok(['vim n’est pas disponible dans ce terminal simulé.']); },
      vi: function () { return ok(['vi n’est pas disponible dans ce terminal simulé.']); },
      emacs: function () { return ok(['emacs n’est pas disponible dans ce terminal simulé.']); },
      wc: function () { return fail('wc : spécifiez un fichier', 'usage'); },
      sort: function () { return fail('sort : spécifiez un fichier à trier', 'usage'); },
      uniq: function () { return fail('uniq : spécifiez une entrée', 'usage'); },
      source: function (args) { return args[0] ? ok(['Sourcing ' + args[0] + '... (simulation)']) : fail('source : fichier manquant', 'usage'); },
      '.': function (args) { return commands.source(args); },
      export: function (args) { return args[0] ? ok(['Variable exportée (simulation).']) : fail('export : variable manquante', 'usage'); },
      alias: function () { return ok(["alias ll='ls -la'", "alias gs='git status'"]); },
      dig: function (args) {
        var types = { a: 1, aaaa: 1, mx: 1, ns: 1, txt: 1, cname: 1, soa: 1, ptr: 1, any: 1, type255: 1 };
        var domain = args.filter(function (arg) { return arg.charAt(0) !== '+' && arg.charAt(0) !== '@' && !types[arg.toLowerCase()]; })[0];
        if (!domain) return fail('dig : domaine manquant', 'usage');
        var qtype = args.find(function (arg) { return types[arg.toLowerCase()]; }) || 'A';
        return ok(['; <<>> DiG 9.18.12 <<>> ' + domain + ' ' + qtype, domain + '. 300 IN ' + qtype.toUpperCase() + ' 93.184.216.34']);
      },
      nslookup: function (args) { return args[0] ? ok(['Server: 8.8.8.8', 'Name: ' + args[0], 'Address: 93.184.216.34']) : fail('nslookup : domaine manquant', 'usage'); },
      systemctl: function (args) {
        var action = args[0]; var service = args[1];
        if ((action !== 'status' && action !== 'is-active' && ['start', 'stop', 'restart', 'enable', 'disable'].indexOf(action) < 0) || !service) return fail('systemctl : sous-commande et service valides requis', 'usage');
        if (action === 'is-active') return ok(['active', service + '.service']);
        if (action === 'status') return ok(['● ' + service.replace(/\.service$/, '') + '.service - OpenBSD Secure Shell server', 'Active: active (running)']);
        return ok([service + '.service: ' + action + ' (simulation)']);
      },
      service: function (args) {
        var service = args[0]; var action = args[1];
        if (!service || action !== 'status') return fail('service : utilisez service <nom> status', 'usage');
        return ok([service + ' is running.']);
      },
      crontab: function (args) {
        var listing = hasShortFlag(args, 'l') || args.indexOf('--list') >= 0;
        if (listing) return ok(['# m h dom mon dow command', '0 2 * * * /home/user/scripts/backup.sh', '*/5 * * * * /usr/bin/check_health.sh']);
        if (hasShortFlag(args, 'e')) return ok(['Ouverture de l’éditeur crontab... (simulation)']);
        return fail('crontab : utilisez -l (lister) ou -e (éditer)', 'usage');
      },
      apt: function (args) {
        var sub = args[0];
        if (['update', 'upgrade', 'install', 'remove', 'search'].indexOf(sub) < 0) return fail('apt : sous-commande inconnue', 'usage');
        return ok(['apt ' + sub + ' : opération simulée terminée.']);
      },
      ssh: function (args) {
        var host = args.filter(function (arg, index) { return arg.charAt(0) !== '-' && !(index > 0 && args[index - 1] === '-L'); }).slice(-1)[0];
        return host ? ok(['ssh : connexion à ' + host + ' (simulation)']) : fail('ssh : hôte manquant', 'usage');
      },
      git: function (args, ctx) {
        var sub = args[0]; var rest = args.slice(1);
        if (!sub) return fail('git : sous-commande manquante', 'usage');
        if (sub === 'init') {
          var gitDir = childPath(ctx.cwd, '.git');
          ctx.vfs[gitDir] = { type: 'dir', children: [] };
          addChild(ctx.vfs, ctx.cwd, '.git');
          return ok(['Dépôt Git vide initialisé dans ' + gitDir + '/'], { stateChanges: [{ op: 'mkdir', path: gitDir }] });
        }
        if (sub === 'add') {
          if (!rest.length) return fail('git add : chemin ou fichier manquant', 'usage');
          return ok(['git add ' + rest.join(' ') + ' — fichiers ajoutés à l’index (simulation)']);
        }
        if (sub === 'status') return ok(['Sur la branche main', 'Rien à valider, la copie de travail est propre.']);
        if (sub === 'commit') return ok(['[main 3a7f2c1] commit', '1 file changed, 1 insertion(+)']);
        if (sub === 'log') return ok(['commit 3a7f2c1 (HEAD -> main)', 'feat: initial commit']);
        if (['branch', 'checkout', 'switch', 'merge', 'remote', 'push', 'pull', 'fetch', 'stash', 'diff', 'rebase', 'reset', 'tag', 'clone', 'config'].indexOf(sub) >= 0) return ok(['git ' + sub + ' : simulation']);
        return fail('git: « ' + sub + ' » n’est pas une commande git connue', 'usage');
      },
      docker: function (args) {
        var sub = args[0]; var rest = args.slice(1);
        if (!sub) return fail('docker : sous-commande manquante', 'usage');
        if (sub === 'pull') return rest[0] ? ok(['Using default tag: latest', rest[0] + ': Pull complete']) : fail('docker pull : image manquante', 'usage');
        if (sub === 'run') {
          var positional = rest.filter(function (arg) { return arg.charAt(0) !== '-'; });
          var image = positional[0]; var shell = positional[1];
          if (!image) return fail('docker run : image manquante', 'usage');
          var interactive = rest.indexOf('-it') >= 0 || rest.indexOf('-ti') >= 0 || (rest.indexOf('-i') >= 0 && rest.indexOf('-t') >= 0);
          if (interactive) return ok(['Conteneur ' + image + ' démarré en mode interactif (simulation).', 'root@container:/# ' + (shell || '')]);
          return ok(['Conteneur démarré depuis l’image ' + image + '.']);
        }
        if (['version', 'info', 'ps', 'images', 'stop', 'rm', 'rmi', 'build', 'tag', 'logs', 'exec', 'volume', 'network', 'compose'].indexOf(sub) >= 0) return ok(['docker ' + sub + ' : simulation']);
        return fail('docker: « ' + sub + ' » n’est pas une commande Docker connue', 'usage');
      },
      'ssh-keygen': function (args, ctx) {
        var algorithm = optionValue(args, '-t') || 'rsa';
        var keyDir = '/home/user/.ssh';
        var keyName = algorithm === 'ed25519' ? 'id_ed25519' : 'id_rsa';
        if (!ctx.vfs[keyDir]) ctx.vfs[keyDir] = { type: 'dir', children: [] };
        addChild(ctx.vfs, '/home/user', '.ssh');
        ctx.vfs[childPath(keyDir, keyName)] = { type: 'file', content: '-----BEGIN OPENSSH PRIVATE KEY-----\nsim\n' };
        ctx.vfs[childPath(keyDir, keyName + '.pub')] = { type: 'file', content: 'ssh-' + algorithm + ' AAAAC3Nza sim' };
        addChild(ctx.vfs, keyDir, keyName); addChild(ctx.vfs, keyDir, keyName + '.pub');
        return ok(['Generating public/private ' + algorithm + ' key pair.', 'Your identification has been saved in ' + keyDir + '/' + keyName], { stateChanges: [{ op: 'keygen', path: childPath(keyDir, keyName) }] });
      },
      rsync: function (args) { return args.length >= 3 ? ok(['sending incremental file list', 'projet/', 'sent 1,234 bytes received 42 bytes']) : fail('rsync : source et destination requises', 'usage'); },
      certbot: function (args) { return args.length ? ok(['Requesting a certificate for monsite.com', 'Successfully received certificate.']) : fail('certbot : arguments manquants', 'usage'); },
      openssl: function (args, ctx, stdin) {
        if (args[0] === 's_client') return ok(['-----BEGIN CERTIFICATE-----', 'MIIFsim', '-----END CERTIFICATE-----']);
        if (args[0] === 'x509') return ok(['notBefore=Jan 1 00:00:00 2026 GMT', 'notAfter=Jan 1 00:00:00 2027 GMT']);
        return stdin && stdin.length ? ok(stdin) : fail('openssl : sous-commande manquante', 'usage');
      },
      nft: function (args, ctx) {
        if (args[0] === 'list') return ok(['table inet filter {', 'chain input { type filter hook input priority 0; }', '}']);
        var expected = ['add', 'rule', 'inet', 'filter', 'input', 'ip', 'saddr', '203.0.113.42', 'drop'];
        if (args.length === expected.length && expected.every(function (token, index) { return args[index] === token; })) {
          ctx.vfs['/etc/nftables.applied'] = { type: 'file', content: args.join(' ') };
          addChild(ctx.vfs, '/etc', 'nftables.applied');
          return ok(['nft: règle ajoutée (simulation)'], { stateChanges: [{ op: 'nft-add', path: '/etc/nftables.applied' }] });
        }
        return fail('nft : règle incomplète ou invalide', 'usage');
      },
      lynis: function (args, ctx) {
        var required = ['audit', 'system', '--quick'];
        if (!required.every(function (token) { return args.indexOf(token) >= 0; })) return fail('lynis : utilisez audit system --quick dans ce lab', 'usage');
        var audit = scenario(ctx).audit || { index: 66, lines: ['Warning: SSH PermitRootLogin is enabled [SSH-7412]', 'Suggestion: review unused filesystems before remediation'] };
        return ok(['[ Lynis 3.0 — simulation LinuxPath ]', 'Hardening index : ' + audit.index].concat(audit.lines || []));
      },
      auditctl: function (args, ctx) {
        var audit = scenario(ctx).audit || { path: '/etc/passwd', key: 'identity' };
        if (args.length === 1 && args[0] === '-l') return ok(['-a always,exit -F arch=b64 -F path=' + audit.path + ' -F perm=wa -k ' + audit.key]);
        var required = ['-a', 'always,exit', '-F', 'arch=b64', 'path=' + audit.path, 'perm=wa', '-k', audit.key];
        return required.every(function (token) { return args.indexOf(token) >= 0; })
          ? ok(['auditctl: règle syscall installée pour ' + audit.path + ' (clé : ' + audit.key + ')'])
          : fail('auditctl : utilisez une règle syscall explicite dans ce lab', 'usage');
      },
      ausearch: function (args) { return args.indexOf('-k') >= 0 && args.indexOf('identity') >= 0 ? ok(['type=PATH name="/etc/passwd" key="identity"']) : fail('ausearch : utilisez -k identity dans ce lab', 'usage'); },
      nmap: function (args, ctx) {
        var config = scenario(ctx).nmap || { host: 'lab.linuxpath.test', port: '80', service: 'http', title: 'LinuxPath training application' };
        var host = args[args.length - 1] || '';
        if (host !== config.host) return fail('LinuxPath : la simulation Nmap accepte uniquement la cible autorisée du dossier', 'scope');
        var required = ['-sV', '-p', config.port, '--script=http-title'];
        if (!required.every(function (token) { return args.indexOf(token) >= 0; })) return fail('LinuxPath : respectez exactement le port et le script autorisés dans le périmètre', 'scope');
        return ok(['LinuxPath : simulation — aucun paquet envoyé.', 'Nmap scan report for ' + host, config.port + '/tcp open ' + config.service, '| http-title: ' + config.title]);
      },
      msfconsole: function () { return ok(['Metasploit Framework', 'msf6 >']); },
      gobuster: function (args) {
        var required = ['dir', '-u', 'http://webapp.lab.linuxpath.test', '-w', '/home/user/wordlists/lab-small.txt', '-t', '1'];
        return required.every(function (token) { return args.indexOf(token) >= 0; }) ? ok(['LinuxPath : simulation — aucun paquet envoyé.', '/admin (Status: 301)']) : fail('LinuxPath : utilisez gobuster dir avec la wordlist du lab et -t 1', 'scope');
      },
      strings: function (args, ctx, stdin) {
        var file = args.filter(function (arg) { return arg.charAt(0) !== '-'; })[0];
        var target = file ? resolve(ctx, file) : null;
        if (target && ctx.vfs[target]) return ok(String(ctx.vfs[target].content || '').split('\n'));
        return file ? fail('strings : ' + file + ' : Aucun fichier de ce type', 'enoent') : ok(stdin || []);
      },
      sha256sum: function (args, ctx) {
        var file = args.find(function (arg) { return arg.charAt(0) !== '-'; });
        var target = file ? resolve(ctx, file) : null;
        var content = target && ctx.vfs[target] && ctx.vfs[target].type === 'file' ? String(ctx.vfs[target].content || '') : null;
        var hash = content === null ? null : artifactChecksums[content];
        return file && hash ? ok([hash + '  ' + file]) : fail('sha256sum : artefact de démonstration introuvable', 'enoent');
      },
      file: function (args, ctx) {
        var file = args.find(function (arg) { return arg.charAt(0) !== '-'; });
        var target = file ? resolve(ctx, file) : null;
        var content = target && ctx.vfs[target] && ctx.vfs[target].type === 'file' ? String(ctx.vfs[target].content || '') : null;
        if (content === null) return fail('file : artefact de démonstration introuvable', 'enoent');
        return ok([file + ': ' + (content.indexOf('LAB_SAMPLE_ONLY') === 0 ? 'LinuxPath inert training artifact, ASCII text' : 'LinuxPath training evidence image, ASCII text')]);
      },
      binwalk: function (args, ctx) {
        var file = args.filter(function (arg) { return arg.charAt(0) !== '-'; })[0] || 'firmware.bin';
        var target = resolve(ctx, file);
        var config = scenario(ctx).firmware || { file: 'firmware.bin', description: 'UBI image header' };
        if (!ctx.vfs[target] || ctx.vfs[target].type !== 'file') return fail('binwalk : ' + file + ' : Aucun fichier de ce type', 'enoent');
        if (target !== '/home/user/' + config.file) return fail('LinuxPath : analysez uniquement le firmware attribué à ce dossier', 'scope');
        var lines = ['DECIMAL HEX DESCRIPTION', '0 0x0 ' + config.description + ' (LinuxPath simulated marker)'];
        if (args.indexOf('-e') >= 0) {
          var parent = target.slice(0, target.lastIndexOf('/')) || '/';
          var output = parent + '/_' + target.split('/').pop() + '.extracted';
          ctx.vfs[output] = { type: 'dir', children: [] };
          addChild(ctx.vfs, parent, output.split('/').pop());
          lines.push('extracted to ' + output);
        }
        return ok(lines);
      },
      dd: function (args, ctx) {
        var sources = args.filter(function (arg) { return arg.indexOf('if=') === 0; });
        var destinations = args.filter(function (arg) { return arg.indexOf('of=') === 0; });
        if (sources.length !== 1 || destinations.length !== 1) return fail('dd : indiquez une seule source if= et une seule destination of=', 'usage');
        var source = sources[0].slice(3); var destination = destinations[0].slice(3);
        if (!ctx.vfs[source] || ctx.vfs[source].type !== 'file') return fail('dd : source introuvable dans le lab', 'enoent');
        var parent = destination.slice(0, destination.lastIndexOf('/')) || '/';
        if (!ctx.vfs[parent] || ctx.vfs[parent].type !== 'dir') return fail('dd : répertoire de destination introuvable', 'enoent');
        var content = String(ctx.vfs[source].content || '');
        ctx.vfs[destination] = { type: 'file', content: content };
        addChild(ctx.vfs, parent, destination.split('/').pop());
        return ok(['0+1 records in', '0+1 records out', content.length + ' bytes copied (simulation)'], { stateChanges: [{ op: 'dd', from: source, path: destination }] });
      },
      rapport: function (args, ctx) {
        var values = {}; var duplicate = false;
        for (var index = 0; index < args.length; index += 2) {
          if (String(args[index]).indexOf('--') === 0 && args[index + 1]) {
            var key = args[index].slice(2); if (values[key] !== undefined) duplicate = true; values[key] = args[index + 1];
          }
        }
        var required = ['target', 'finding', 'impact', 'evidence', 'scope', 'observed-at', 'tool', 'confidence', 'remediation', 'retest'];
        if (duplicate || values.target !== 'lab.linuxpath.test' || !required.every(function (field) { return values[field]; }) || args.length !== required.length * 2) return fail('rapport : précisez cible, constat, impact, preuve, périmètre, date, outil, confiance, remédiation et test de suivi', 'usage');
        var path = '/home/user/documents/rapport-m13.txt';
        ctx.vfs[path] = { type: 'file', content: 'Cible : ' + values.target + '\nConstat : ' + values.finding + '\nImpact : ' + values.impact + '\nPreuve : ' + values.evidence + '\n' };
        addChild(ctx.vfs, '/home/user/documents', 'rapport-m13.txt');
        return ok(['rapport : constat pédagogique enregistré dans ' + path]);
      }
    };
    return commands;
  }

  root.createPedagogicalCommands = createPedagogicalCommands;
}(typeof globalThis !== 'undefined' ? globalThis : this));
