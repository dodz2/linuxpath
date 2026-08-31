function normalizeToken(token) {
  return String(token).replace(/^["']|["']$/g, '');
}

function getStages(ctx) {
  if (Array.isArray(ctx.stages) && ctx.stages.length) {
    return ctx.stages
      .filter((stage) => Array.isArray(stage) && stage.length)
      .map((stage) => stage.map(normalizeToken));
  }

  const raw = String(ctx.raw || '').trim();
  if (raw) {
    return raw.split('|')
      .map((stage, index) => {
        const tokens = stage.trim().split(/\s+/).filter(Boolean).map(normalizeToken);
        return index === 0 && tokens[0] === 'sudo' ? tokens.slice(1) : tokens;
      })
      .filter((stage) => stage.length);
  }

  const names = Array.isArray(ctx.commands) && ctx.commands.length
    ? ctx.commands
    : [ctx.command];
  return names.filter(Boolean).map((name) => [normalizeToken(name)]);
}

function getStageArgs(ctx, stageIndex) {
  const stage = getStages(ctx)[stageIndex];
  return stage ? stage.slice(1) : [];
}

export function evaluateValidator(validator, ctx) {
  if (!validator || typeof validator !== 'object' || !validator.type) {
    return { ok: false, reason: 'Validateur manquant.' };
  }
  const vfs = ctx.vfs || {};
  const stdout = (ctx.stdout || []).join('\n');
  switch (validator.type) {
    case 'exit_zero':
      return ctx.exitCode === 0
        ? { ok: true }
        : { ok: false, reason: ctx.stderr?.[0] || 'La commande a échoué (code de sortie non nul).' };
    case 'command': {
      const names = validator.names || [validator.name];
      const stages = getStages(ctx);
      const seen = stages.map((stage) => stage[0]);
      const matches = validator.single
        ? stages.length === 1 && names.includes(seen[0])
        : names.some((name) => seen.includes(name));
      return matches
        ? { ok: true }
        : { ok: false, reason: `La commande attendue n'est pas ${names.join(' ou ')}.` };
    }
    case 'path_exists': {
      const node = vfs[validator.path];
      if (!node) return { ok: false, reason: `Le chemin ${validator.path} n'existe pas encore.` };
      if (validator.kind === 'directory' && node.type !== 'dir') {
        return { ok: false, reason: `${validator.path} n'est pas un répertoire.` };
      }
      if (validator.kind === 'file' && node.type !== 'file') {
        return { ok: false, reason: `${validator.path} n'est pas un fichier.` };
      }
      return { ok: true };
    }
    case 'perm_includes': {
      const node = vfs[validator.path];
      if (!node) return { ok: false, reason: `Le fichier ${validator.path} est introuvable.` };
      const perms = node.perms || '';
      return perms.includes(validator.needle)
        ? { ok: true }
        : { ok: false, reason: `Les permissions de ${validator.path} ne correspondent pas.` };
    }
    case 'cwd':
      return ctx.cwd === validator.path
        ? { ok: true }
        : { ok: false, reason: `Vous n'êtes pas dans ${validator.path}.` };
    case 'stdout_includes':
      return stdout.toLowerCase().includes(String(validator.text).toLowerCase())
        ? { ok: true }
        : { ok: false, reason: 'La sortie ne contient pas le résultat attendu.' };
    case 'args_include': {
      const raw = String(ctx.raw || '');
      const normalize = (token) => token.replace(/^["']|["']$/g, '');
      const tokens = Number.isInteger(validator.stage)
        ? getStageArgs(ctx, validator.stage)
        : (raw.trim() ? raw.trim().split(/\s+/).map(normalize) : []);
      const needed = (validator.tokens || []).map(normalize);
      const missing = needed.filter((token) => !tokens.includes(token));
      return missing.length === 0
        ? { ok: true }
        : { ok: false, reason: 'La commande n\'utilise pas les arguments attendus.' };
    }
    case 'args_exact': {
      const stage = Number.isInteger(validator.stage) ? validator.stage : 0;
      const actual = getStageArgs(ctx, stage);
      const expected = (validator.tokens || []).map(normalizeToken);
      const matches = actual.length === expected.length
        && expected.every((token, index) => actual[index] === token);
      return matches
        ? { ok: true }
        : { ok: false, reason: 'La commande doit utiliser exactement les arguments attendus.' };
    }
    case 'pipeline': {
      const expected = Array.isArray(validator.commands) ? validator.commands : [];
      const stages = getStages(ctx);
      const matches = expected.length > 0 && stages.length === expected.length
        && expected.every((name, index) => stages[index][0] === name);
      return matches
        ? { ok: true }
        : { ok: false, reason: 'La commande doit utiliser la pipeline attendue.' };
    }
    case 'all': {
      for (const child of validator.of || []) {
        const result = evaluateValidator(child, ctx);
        if (!result.ok) return result;
      }
      return { ok: true };
    }
    case 'any': {
      const failures = [];
      for (const child of validator.of || []) {
        const result = evaluateValidator(child, ctx);
        if (result.ok) return result;
        failures.push(result.reason);
      }
      return { ok: false, reason: failures[0] || 'Aucune condition alternative n\'est remplie.' };
    }
    default:
      return { ok: false, reason: `Validateur inconnu : ${validator.type}` };
  }
}
