import {
  parseBrowserCommandLine,
  resolveBrowserPath,
  runBrowserShell,
  tokenizeBrowserCommand,
} from './browser-terminal-runtime.mjs';

export function tokenize(input) {
  return tokenizeBrowserCommand(input);
}

export function parseCommandLine(input) {
  return parseBrowserCommandLine(input);
}

export function resolvePath(cwd, candidate) {
  return resolveBrowserPath(cwd, candidate);
}

export function runShell(options) {
  return runBrowserShell(options);
}
