import { createHash } from 'node:crypto';

export function normalizeFlag(raw) {
  return String(raw || '').trim().toLowerCase();
}

export function sha256Hex(text) {
  return createHash('sha256').update(String(text), 'utf8').digest('hex');
}

export function tokenizeCtfCommand(input) {
  const tokens = [];
  let current = '';
  let quote = null;
  for (const ch of String(input || '')) {
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
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
  if (current) tokens.push(current);
  return tokens;
}

export function rewriteCtfCommand(input) {
  const tokens = tokenizeCtfCommand(input);
  if (!tokens.length) return '';
  const stages = [];
  let stage = [];
  for (const token of tokens) {
    if (token === '|') {
      stages.push(stage);
      stage = [];
    } else stage.push(token);
  }
  stages.push(stage);
  if (stages.length === 2 && stages[0][0] === 'echo' && stages[1][0] === 'base64' && stages[1].includes('-d')) {
    return ['base64', '-d', ...stages[0].slice(1)].join(' ');
  }
  return stages.map((parts) => parts.join(' ')).join(' | ');
}

export function solveKind(hintsUsed) {
  return Number(hintsUsed) > 0 ? 'with_help' : 'autonomous';
}
