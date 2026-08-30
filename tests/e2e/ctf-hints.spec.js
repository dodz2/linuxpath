import { test, expect } from '@playwright/test';
import { openApp } from './helpers.js';

const HINT_PATHS = [
  { id: 'ctf-01', commands: ['ls -la /home/user/', 'cat /home/user/.secret'], flag: 'flag{hidden_in_plain_sight}' },
  { id: 'ctf-02', commands: ['find / -name "*flag*"', 'cat /var/backups/flag.bak'], flag: 'flag{world_readable_mistake}' },
  { id: 'ctf-03', commands: ["grep 'DATA' /var/log/auth.log", "echo 'ZmxhZ3tiYXNlNjRfaXNfbm90X2VuY3J5cHRpb259' | base64 -d"], flag: 'flag{base64_is_not_encryption}' },
  { id: 'ctf-04', commands: ["grep '#' /opt/maintenance/cleanup.sh"], flag: 'flag{environment_variable_leak}' },
  { id: 'ctf-05', commands: ['ps aux'], flag: 'flag{process_arguments_exposed}' },
  { id: 'ctf-06', commands: ["grep '203.0.113.99' /var/log/syslog"], flag: 'flag{network_exfiltration_trace}' },
  { id: 'ctf-07', commands: ['dig start.target.local', 'dig chain.target.local', 'dig flag.target.local TXT'], flag: 'flag{dns_chain_resolved}' },
  { id: 'ctf-08', commands: ['tcpdump -r /var/log/capture.pcap', 'grep flag /var/log/capture.pcap'], flag: 'flag{cleartext_credentials_leaked}' },
  { id: 'ctf-09', commands: ['cat /etc/nftables.conf', 'ss -tlnp', 'cat /opt/.backdoor/flag.txt'], flag: 'flag{port_4444_open_backdoor}' },
  { id: 'ctf-10', commands: ['find / -name "id_*"', 'cat /backup/.old/message.b64', 'base64 -d ZmxhZ3tzc2hfa2V5X2hpZGRlbl9pbl9iYWNrdXB9'], flag: 'flag{ssh_key_hidden_in_backup}' },
];

test('official last-hint commands of all 10 CTFs produce their flags without terminal errors', async ({ page }, testInfo) => {
  await openApp(page);
  const results = await page.evaluate((paths) => {
    const rows = [];
    for (const path of paths) {
      loadCTFChallenge(path.id);
      const output = document.querySelector('#ctf-terminal-output');
      output.innerHTML = '';
      for (const command of path.commands) ctfTerminal.exec(command);
      rows.push({
        id: path.id,
        flag: path.flag,
        output: [...output.childNodes].map((node) => node.textContent || '').join('\n').trim(),
        errors: [...output.querySelectorAll('.t-err')].map((element) => element.textContent.trim()),
      });
    }
    return rows;
  }, HINT_PATHS);

  await testInfo.attach('ctf-hint-matrix', { body: JSON.stringify(results, null, 2), contentType: 'application/json' });
  expect(results).toHaveLength(10);
  const broken = results.filter((row) => {
    if (row.errors.length > 0) return true;
    if (row.output.includes(row.flag)) return false;
    const fragments = [...row.output.matchAll(/DATA=([^\s<]+)/g)].map((match) => match[1]);
    return fragments.join('') !== row.flag;
  });
  expect(broken, JSON.stringify(broken, null, 2)).toEqual([]);
});
