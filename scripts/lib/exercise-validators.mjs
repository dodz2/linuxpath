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
      const seen = Array.isArray(ctx.commands) && ctx.commands.length ? ctx.commands : [ctx.command];
      return names.some((name) => seen.includes(name))
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
