/* ============================================================
   TERMINAL PRINCIPAL — Instance du moteur unifié
   ============================================================ */
let VFS = null; // Chargé depuis data/vfs.json
let BASE_VFS = null;
let ACTIVE_SCENARIO_ID = 'base';
let mainTerminal = null;
const artifactChecksums = {
  'LAB_SAMPLE_ONLY\nhttps://c2.training.invalid/callback\n': '0e1a4734f609146ce91de2f680e0f6bfe5f539f7596895820674232c25f37ad2',
  'LINUXPATH_TRAINING_EVIDENCE_IMAGE\n': 'e517bf22cfe911ce831a192e9525560715f62da8a151a14848e10b91c5b1df5d'
};

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
    chown: function(args) {
      if (args.length < 2) { mainTerminal.print('<span class="t-err">chown : opérandes manquantes</span>'); return; }
    },
    cp: function(args) {
      var fileArgs2 = args.filter(function(a){return !a.startsWith('-');});
      if (fileArgs2.length < 2) { mainTerminal.print('<span class="t-err">cp : opérandes de fichier manquants</span>'); return; }
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
      if (args.length < 2) { mainTerminal.print('<span class="t-err">mv : opérandes de fichier manquants</span>'); return; }
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
    ping: function(args) {
      var host = null;
      for (var i = 0; i < args.length; i++) {
        if (args[i].charAt(0) === '-') continue;
        if (i > 0 && args[i - 1] === '-c') continue;
        host = args[i];
        break;
      }
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
    ss: function(args) {
      mainTerminal.print('<span class="t-muted">Netid  State   Recv-Q  Send-Q  Local Address:Port    Peer Address:Port</span>', 'term-output');
      var listeners = (args || []).some(function (arg) { return arg.charAt(0) === '-' && arg.indexOf('l') >= 0; });
      if (listeners) {
        mainTerminal.print('tcp    LISTEN  0       128     0.0.0.0:22           0.0.0.0:*', 'term-output');
        mainTerminal.print('tcp    LISTEN  0       511     0.0.0.0:80           0.0.0.0:*', 'term-output');
        mainTerminal.print('tcp    LISTEN  0       511     0.0.0.0:443          0.0.0.0:*', 'term-output');
      } else {
        mainTerminal.print('tcp    ESTAB   0       0       192.0.2.10:443       198.51.100.25:52644', 'term-output');
      }
    },
    journalctl: function(args) {
      if ((args || []).indexOf('-u') >= 0 && (args || []).indexOf('ssh.service') >= 0) {
        mainTerminal.print('Aug 31 10:02:11 linuxpath sshd[821]: Accepted publickey for user from 198.51.100.25', 'term-output');
        mainTerminal.print('Aug 31 10:04:02 linuxpath sshd[834]: Failed password for invalid user lab from 198.51.100.25', 'term-output');
        return;
      }
      if ((args || []).indexOf('_UID=0') >= 0) {
        mainTerminal.print('Aug 31 09:58:31 linuxpath systemd[1]: Started OpenSSH server daemon.', 'term-output');
        mainTerminal.print('Aug 31 10:00:00 linuxpath CRON[710]: (root) CMD (test -x /usr/sbin/anacron)', 'term-output');
        return;
      }
      return { exitCode: 1, stdout: [], stderr: ['journalctl : filtre de démonstration non pris en charge'], stateChanges: [] };
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
      mainTerminal.print('<span class="t-green">&lt;!DOCTYPE html&gt;&lt;html&gt;&lt;head&gt;&lt;title&gt;Response&lt;/title&gt;...</span>', 'term-output');
    },
    wget: function(args) {
      var url = args.filter(function(a){return !a.startsWith('-');})[0];
      if (!url) { mainTerminal.print('<span class="t-err">wget : URL manquante</span>'); return; }
      var fname = url.split('/').pop() || 'index.html';
      mainTerminal.print('Résolution de ' + escapeHtml(url.split('/')[2]||url) + '... 142.250.74.46', 'term-output');
      mainTerminal.print('Connexion... 200 OK', 'term-output');
      mainTerminal.print('<span class="t-green">« ' + escapeHtml(fname) + ' » sauvegardé [4096/4096]</span>', 'term-output');
    },
    tail: function(args, engine, stdin) {
      var count = 10;
      for (var tailIndex = 0; tailIndex < args.length; tailIndex++) {
        if (args[tailIndex] === '-n' && /^\d+$/.test(args[tailIndex + 1] || '')) {
          count = Number(args[++tailIndex]);
        } else if (/^-\d+$/.test(args[tailIndex])) {
          count = Number(args[tailIndex].slice(1));
        }
      }
      var fileArg = args.filter(function(a){return !a.startsWith('-');})[0];
      if (!fileArg) {
        if (Array.isArray(stdin) && stdin.length) {
          return { exitCode: 0, stdout: stdin.slice(-count), stderr: [], stateChanges: [] };
        }
        return { exitCode: 1, stdout: [], stderr: ['tail : fichier manquant'], stateChanges: [] };
      }
      var t = mainTerminal.resolvePath(fileArg);
      var _vfs = mainTerminal.getVfs();
      if (!_vfs[t]) { return { exitCode: 1, stdout: [], stderr: ['tail : ' + fileArg + ' : Aucun fichier'], stateChanges: [] }; }
      (_vfs[t].content||'').split('\n').slice(-count).forEach(function(l){mainTerminal.print(escapeHtml(l),'term-output');});
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
      var types = { a:1, aaaa:1, mx:1, ns:1, txt:1, cname:1, soa:1, ptr:1, any:1, type255:1 };
      var domain = args.filter(function(a){
        return !a.startsWith('-') && !a.startsWith('+') && !a.startsWith('@') && !types[a.toLowerCase()];
      })[0] || 'example.com';
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
        mainTerminal.print('<span class="t-green">0 mis à jour, 1 nouvellement installé. Terminé.</span>', 'term-output');
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
        var _vfs = mainTerminal.getVfs();
        _vfs[mainTerminal.getCurrentDir() + '/.git'] = { type: 'dir', children: [] };
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
          mainTerminal.print('b2c3d4e5f6a7   ubuntu    "bash"    10 min ago    Exited (0) 8 minutes ago  stopped', 'term-output');
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
    },
    'ssh-keygen': function(args) {
      var vfs = mainTerminal.getVfs();
      var keyDir = '/home/user/.ssh';
      vfs[keyDir] = vfs[keyDir] || { type: 'dir', children: [] };
      vfs[keyDir + '/id_ed25519'] = { type: 'file', content: '-----BEGIN OPENSSH PRIVATE KEY-----\nsim\n' };
      vfs[keyDir + '/id_ed25519.pub'] = { type: 'file', content: 'ssh-ed25519 AAAAC3Nza sim' };
      ['id_ed25519', 'id_ed25519.pub'].forEach(function (name) {
        if (vfs[keyDir].children.indexOf(name) < 0) vfs[keyDir].children.push(name);
      });
      var parent = vfs['/home/user'];
      if (parent && parent.children.indexOf('.ssh') < 0) parent.children.push('.ssh');
      mainTerminal.print('Generating public/private ed25519 key pair.', 'term-output');
      mainTerminal.print('Your identification has been saved in /home/user/.ssh/id_ed25519', 'term-output');
    },
    rsync: function() {
      mainTerminal.print('sending incremental file list', 'term-output');
      mainTerminal.print('projet/', 'term-output');
      mainTerminal.print('sent 1,234 bytes  received 42 bytes', 'term-output');
    },
    certbot: function() {
      mainTerminal.print('Requesting a certificate for monsite.com', 'term-output');
      mainTerminal.print('Successfully received certificate.', 'term-output');
    },
    openssl: function(args) {
      if (args[0] === 's_client') {
        mainTerminal.print('-----BEGIN CERTIFICATE-----', 'term-output');
        mainTerminal.print('MIIFsim', 'term-output');
        mainTerminal.print('-----END CERTIFICATE-----', 'term-output');
        return { exitCode: 0, stdout: ['-----BEGIN CERTIFICATE-----', 'MIIFsim', '-----END CERTIFICATE-----'], stderr: [], stateChanges: [] };
      }
      if (args[0] === 'x509') {
        var lines = ['notBefore=Jan  1 00:00:00 2026 GMT', 'notAfter=Jan  1 00:00:00 2027 GMT'];
        return { exitCode: 0, stdout: lines, stderr: [], stateChanges: [] };
      }
      return { exitCode: 0, stdout: [], stderr: [], stateChanges: [] };
    },
    nft: function(args) {
      if (args[0] === 'list') {
        mainTerminal.print('table inet filter {', 'term-output');
        mainTerminal.print('  chain input { type filter hook input priority 0; }', 'term-output');
        mainTerminal.print('}', 'term-output');
      } else if (args[0] === 'add') {
        var vfs = mainTerminal.getVfs();
        vfs['/etc/nftables.applied'] = { type: 'file', content: args.join(' ') };
        var etc = vfs['/etc'];
        if (etc && etc.children.indexOf('nftables.applied') < 0) etc.children.push('nftables.applied');
        mainTerminal.print('nft: règle ajoutée (simulation)', 'term-output');
      }
    },
    lynis: function(args) {
      var required = ['audit', 'system', '--quick'];
      if (!required.every(function (token) { return (args || []).indexOf(token) >= 0; })) {
        return { exitCode: 1, stdout: [], stderr: ['lynis : utilisez audit system --quick dans ce lab'], stateChanges: [] };
      }
      var audit = getMainScenario().audit || { index: 66, lines: ['Warning: SSH PermitRootLogin is enabled [SSH-7412]', 'Suggestion: review unused filesystems before remediation'] };
      mainTerminal.print('[ Lynis 3.0 — simulation LinuxPath ]', 'term-output');
      mainTerminal.print('Hardening index : ' + audit.index, 'term-output');
      (audit.lines || []).forEach(function (line) { mainTerminal.print(escapeHtml(line), 'term-output'); });
    },
    auditctl: function(args) {
      var audit = getMainScenario().audit || { path: '/etc/passwd', key: 'identity' };
      if ((args || []).length === 1 && args[0] === '-l') {
        mainTerminal.print('-a always,exit -F arch=b64 -F path=' + audit.path + ' -F perm=wa -k ' + audit.key, 'term-output');
        return;
      }
      var required = ['-a', 'always,exit', '-F', 'arch=b64', 'path=' + audit.path, 'perm=wa', '-k', audit.key];
      if (!required.every(function (token) { return (args || []).indexOf(token) >= 0; })) {
        return { exitCode: 1, stdout: [], stderr: ['auditctl : utilisez une règle syscall explicite dans ce lab'], stateChanges: [] };
      }
      mainTerminal.print('auditctl: règle syscall installée pour ' + audit.path + ' (clé : ' + audit.key + ')', 'term-output');
    },
    ausearch: function(args) {
      if ((args || []).indexOf('-k') >= 0 && (args || []).indexOf('identity') >= 0) {
        mainTerminal.print('type=PATH msg=audit(1725098400.321:7412): item=0 name="/etc/passwd" key="identity"', 'term-output');
        return;
      }
      return { exitCode: 1, stdout: [], stderr: ['ausearch : utilisez -k identity dans ce lab'], stateChanges: [] };
    },
    nmap: function(args) {
      var config = getMainScenario().nmap || { host: 'lab.linuxpath.test', port: '80', service: 'http', title: 'LinuxPath training application' };
      var host = args[args.length - 1] || 'host';
      if (host !== config.host) {
        return { exitCode: 1, stdout: [], stderr: ['LinuxPath : la simulation Nmap accepte uniquement la cible autorisée du dossier'], stateChanges: [] };
      }
      var required = ['-sV', '-p', config.port, '--script=http-title'];
      if (!required.every(function (token) { return (args || []).indexOf(token) >= 0; })) {
        return { exitCode: 1, stdout: [], stderr: ['LinuxPath : respectez exactement le port et le script autorisés dans le périmètre'], stateChanges: [] };
      }
      mainTerminal.print('LinuxPath : simulation — aucun paquet envoyé.', 'term-output');
      mainTerminal.print('Starting Nmap 7.91 ( Ubuntu 22.04 lab profile )', 'term-output');
      mainTerminal.print('Nmap scan report for ' + host, 'term-output');
      mainTerminal.print('PORT   STATE SERVICE VERSION', 'term-output');
      mainTerminal.print(config.port + '/tcp open  ' + config.service + '    LinuxPath simulated service', 'term-output');
      mainTerminal.print('| http-title: ' + config.title, 'term-output');
    },
    msfconsole: function() {
      mainTerminal.print('Metasploit Framework', 'term-output');
      mainTerminal.print('msf6 >', 'term-output');
    },
    gobuster: function(args) {
      var urlIndex = (args || []).indexOf('-u');
      var target = urlIndex >= 0 ? args[urlIndex + 1] : '';
      var required = ['dir', '-u', 'http://webapp.lab.linuxpath.test', '-w', '/home/user/wordlists/lab-small.txt', '-t', '1'];
      if (!required.every(function (token) { return (args || []).indexOf(token) >= 0; }) || target !== 'http://webapp.lab.linuxpath.test') {
        return { exitCode: 1, stdout: [], stderr: ['LinuxPath : utilisez gobuster dir avec la wordlist du lab et -t 1'], stateChanges: [] };
      }
      mainTerminal.print('LinuxPath : simulation — aucun paquet envoyé.', 'term-output');
      mainTerminal.print('===============================================================', 'term-output');
      mainTerminal.print('/admin                (Status: 301)', 'term-output');
    },
    strings: function(args, engine, stdin) {
      var file = (args || []).filter(function (a) { return a.charAt(0) !== '-'; })[0];
      var vfs = mainTerminal.getVfs();
      var target = file ? mainTerminal.resolvePath(file) : null;
      if (target && vfs[target]) return { exitCode: 0, stdout: String(vfs[target].content || '').split('\n'), stderr: [], stateChanges: [], renderOutput: true };
      if (file) return { exitCode: 1, stdout: [], stderr: ['strings : ' + file + ' : Aucun fichier de ce type'], stateChanges: [] };
      return { exitCode: 0, stdout: stdin || [], stderr: [], stateChanges: [] };
    },
    sha256sum: function(args) {
      var file = (args || []).find(function (arg) { return arg.charAt(0) !== '-'; });
      var vfs = mainTerminal.getVfs();
      var source = file ? mainTerminal.resolvePath(file) : null;
      var content = source && vfs[source] && vfs[source].type === 'file' ? String(vfs[source].content || '') : null;
      var hash = content === null ? null : artifactChecksums[content];
      if (!file || !hash) return { exitCode: 1, stdout: [], stderr: ['sha256sum : artefact de démonstration introuvable'], stateChanges: [] };
      mainTerminal.print(hash + '  ' + file, 'term-output');
    },
    file: function(args) {
      var file = (args || []).find(function (arg) { return arg.charAt(0) !== '-'; });
      var vfs = mainTerminal.getVfs();
      var source = file ? mainTerminal.resolvePath(file) : null;
      var content = source && vfs[source] && vfs[source].type === 'file' ? String(vfs[source].content || '') : null;
      if (!file || content === null) return { exitCode: 1, stdout: [], stderr: ['file : artefact de démonstration introuvable'], stateChanges: [] };
      var kind = content.indexOf('LAB_SAMPLE_ONLY') === 0
        ? 'LinuxPath inert training artifact, ASCII text'
        : 'LinuxPath training evidence image, ASCII text';
      mainTerminal.print(file + ': ' + kind, 'term-output');
    },
    binwalk: function(args) {
      var file = (args || []).filter(function (a) { return a.charAt(0) !== '-'; })[0] || 'firmware.bin';
      var vfs = mainTerminal.getVfs();
      var source = mainTerminal.resolvePath(file);
      var config = getMainScenario().firmware || { file: 'firmware.bin', description: 'UBI image header' };
      if (!vfs[source] || vfs[source].type !== 'file') {
        return { exitCode: 1, stdout: [], stderr: ['binwalk : ' + file + ' : Aucun fichier de ce type'], stateChanges: [] };
      }
      if (source !== '/home/user/' + config.file) {
        return { exitCode: 1, stdout: [], stderr: ['LinuxPath : analysez uniquement le firmware attribué à ce dossier'], stateChanges: [] };
      }
      mainTerminal.print('DECIMAL  HEX  DESCRIPTION', 'term-output');
      mainTerminal.print('0        0x0  ' + config.description + ' (LinuxPath simulated marker)', 'term-output');
      if ((args || []).indexOf('-e') >= 0) {
        var parentPath = source.slice(0, source.lastIndexOf('/')) || '/';
        var outDir = parentPath + '/_' + source.split('/').pop() + '.extracted';
        vfs[outDir] = { type: 'dir', children: [] };
        var parent = vfs[parentPath];
        var name = outDir.split('/').pop();
        if (parent && parent.children.indexOf(name) < 0) parent.children.push(name);
        mainTerminal.print('extracted to ' + outDir, 'term-output');
      }
    },
    dd: function(args) {
      var sources = (args || []).filter(function (a) { return a.indexOf('if=') === 0; });
      var destinations = (args || []).filter(function (a) { return a.indexOf('of=') === 0; });
      if (sources.length !== 1 || destinations.length !== 1) return { exitCode: 1, stdout: [], stderr: ['dd : indiquez une seule source if= et une seule destination of='], stateChanges: [] };
      var from = sources[0];
      var destination = destinations[0];
      var source = from.slice(3);
      var of = destination.slice(3);
      var vfs = mainTerminal.getVfs();
      if (!vfs[source] || vfs[source].type !== 'file') return { exitCode: 1, stdout: [], stderr: ['dd : source introuvable dans le lab'], stateChanges: [] };
      var parent = of.slice(0, of.lastIndexOf('/')) || '/';
      if (!vfs[parent] || vfs[parent].type !== 'dir') return { exitCode: 1, stdout: [], stderr: ['dd : répertoire de destination introuvable'], stateChanges: [] };
      var content = String(vfs[source].content || '');
      vfs[of] = { type: 'file', content: content };
      var name = of.split('/').pop();
      if (vfs[parent] && vfs[parent].children.indexOf(name) < 0) vfs[parent].children.push(name);
      mainTerminal.print('0+1 records in', 'term-output');
      mainTerminal.print('0+1 records out', 'term-output');
      mainTerminal.print(content.length + ' bytes copied (simulation)', 'term-output');
    },
    rapport: function(args) {
      var values = {};
      var duplicate = false;
      for (var i = 0; i < (args || []).length; i += 2) {
        if (String(args[i]).indexOf('--') === 0 && args[i + 1]) {
          var key = args[i].slice(2);
          if (values[key] !== undefined) duplicate = true;
          values[key] = args[i + 1];
        }
      }
      var required = ['target', 'finding', 'impact', 'evidence', 'scope', 'observed-at', 'tool', 'confidence', 'remediation', 'retest'];
      if (duplicate || values.target !== 'lab.linuxpath.test' || !required.every(function (field) { return values[field]; }) || (args || []).length !== required.length * 2) {
        return { exitCode: 1, stdout: [], stderr: ['rapport : précisez cible, constat, impact, preuve, périmètre, date, outil, confiance, remédiation et test de suivi'], stateChanges: [] };
      }
      var reportPath = '/home/user/documents/rapport-m13.txt';
      var reportVfs = mainTerminal.getVfs();
      reportVfs[reportPath] = { type: 'file', content: 'Cible : ' + values.target + '\nPérimètre : ' + values.scope + '\nObservé le : ' + values['observed-at'] + '\nOutil : ' + values.tool + '\nConstat : ' + values.finding + '\nConfiance : ' + values.confidence + '\nImpact : ' + values.impact + '\nPreuve : ' + values.evidence + '\nRemédiation : ' + values.remediation + '\nTest de suivi : ' + values.retest + '\n' };
      var documents = reportVfs['/home/user/documents'];
      if (documents && documents.children.indexOf('rapport-m13.txt') < 0) documents.children.push('rapport-m13.txt');
      mainTerminal.print('rapport : constat pédagogique enregistré dans ' + reportPath, 'term-output');
    }
   }
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
  if (!sec) return;
  sec.classList.toggle('minimized', !!minimized);
  if (icon) icon.textContent = minimized ? '▲' : '▼';
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
