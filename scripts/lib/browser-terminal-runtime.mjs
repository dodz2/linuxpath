import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const [utilsSource, coreSource, pedagogicalSource] = await Promise.all([
  readFile(new URL('../../assets/utils.js', import.meta.url), 'utf8'),
  readFile(new URL('../../assets/terminal-core.js', import.meta.url), 'utf8'),
  readFile(new URL('../../assets/pedagogical-commands.js', import.meta.url), 'utf8'),
]);

const sandbox = {
  atob,
  btoa,
  console,
  document: { getElementById: () => null },
};
vm.createContext(sandbox);
vm.runInContext(utilsSource, sandbox, { filename: 'assets/utils.js' });
vm.runInContext(coreSource, sandbox, { filename: 'assets/terminal-core.js' });
vm.runInContext(pedagogicalSource, sandbox, { filename: 'assets/pedagogical-commands.js' });

function cloneResult(value) {
  return structuredClone(value);
}

function createEngine({ vfs = {}, cwd = '/home/user', extraCommands, userInfo, permCheck = false, recursiveFind = true } = {}) {
  const engine = sandbox.createTerminalEngine({
    vfs,
    outputElId: 'terminal-output',
    inputElId: 'terminal-input',
    promptLabelElId: 'terminal-prompt-label',
    promptFn: () => '$',
    userInfo: userInfo || { user: 'user', hostname: 'user-pc', uid: '1000', gid: '1000', extraGroups: ',4(adm),27(sudo)' },
    permCheck,
    recursiveFind,
    extraCommands: extraCommands || sandbox.createPedagogicalCommands(),
  });
  engine.setCurrentDir(cwd);
  return engine;
}

export function createBrowserPedagogicalCommands() {
  return sandbox.createPedagogicalCommands();
}

export function tokenizeBrowserCommand(input) {
  const engine = createEngine();
  return cloneResult(engine.tokenize(input));
}

export function parseBrowserCommandLine(input) {
  const engine = createEngine();
  return cloneResult(engine.parseCommandLine(input));
}

export function resolveBrowserPath(cwd, candidate) {
  const engine = createEngine({ cwd });
  return engine.resolvePath(candidate);
}

export function runBrowserShell(options = {}) {
  const engine = createEngine(options);
  return cloneResult(engine.runStructured(options.command || ''));
}
