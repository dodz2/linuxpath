function evaluateValidator(validator, ctx) {
  if (!validator || typeof validator !== 'object' || !validator.type) {
    return { ok: false, reason: 'Validateur manquant.' };
  }
  var vfs = ctx.vfs || {};
  var stdout = (ctx.stdout || []).join('\n');
  switch (validator.type) {
    case 'exit_zero':
      return ctx.exitCode === 0
        ? { ok: true }
        : { ok: false, reason: (ctx.stderr && ctx.stderr[0]) || 'La commande a échoué (code de sortie non nul).' };
    case 'command': {
      var names = validator.names || [validator.name];
      var seen = Array.isArray(ctx.commands) && ctx.commands.length ? ctx.commands : [ctx.command];
      return names.some(function (name) { return seen.indexOf(name) >= 0; })
        ? { ok: true }
        : { ok: false, reason: "La commande attendue n'est pas " + names.join(' ou ') + '.' };
    }
    case 'path_exists': {
      var node = vfs[validator.path];
      if (!node) return { ok: false, reason: 'Le chemin ' + validator.path + " n'existe pas encore." };
      if (validator.kind === 'directory' && node.type !== 'dir') return { ok: false, reason: validator.path + " n'est pas un répertoire." };
      if (validator.kind === 'file' && node.type !== 'file') return { ok: false, reason: validator.path + " n'est pas un fichier." };
      return { ok: true };
    }
    case 'perm_includes': {
      var pnode = vfs[validator.path];
      if (!pnode) return { ok: false, reason: 'Le fichier ' + validator.path + ' est introuvable.' };
      return String(pnode.perms || '').indexOf(validator.needle) >= 0
        ? { ok: true }
        : { ok: false, reason: 'Les permissions de ' + validator.path + ' ne correspondent pas.' };
    }
    case 'cwd':
      return ctx.cwd === validator.path
        ? { ok: true }
        : { ok: false, reason: "Vous n'êtes pas dans " + validator.path + '.' };
    case 'stdout_includes':
      return stdout.toLowerCase().indexOf(String(validator.text).toLowerCase()) >= 0
        ? { ok: true }
        : { ok: false, reason: 'La sortie ne contient pas le résultat attendu.' };
    case 'all': {
      for (var i = 0; i < (validator.of || []).length; i++) {
        var child = evaluateValidator(validator.of[i], ctx);
        if (!child.ok) return child;
      }
      return { ok: true };
    }
    case 'any': {
      for (var j = 0; j < (validator.of || []).length; j++) {
        var alt = evaluateValidator(validator.of[j], ctx);
        if (alt.ok) return alt;
      }
      return { ok: false, reason: "Aucune condition alternative n'est remplie." };
    }
    default:
      return { ok: false, reason: 'Validateur inconnu : ' + validator.type };
  }
}
