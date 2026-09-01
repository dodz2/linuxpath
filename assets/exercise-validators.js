function normalizeToken(token) {
  return String(token).replace(/^["']|["']$/g, '');
}

function getStages(ctx) {
  if (Array.isArray(ctx.stages) && ctx.stages.length) {
    return ctx.stages
      .filter(function (stage) { return Array.isArray(stage) && stage.length; })
      .map(function (stage) { return stage.map(normalizeToken); });
  }

  var raw = String(ctx.raw || '').trim();
  if (raw) {
    return raw.split('|')
      .map(function (stage, index) {
        var tokens = stage.trim().split(/\s+/).filter(Boolean).map(normalizeToken);
        return index === 0 && tokens[0] === 'sudo' ? tokens.slice(1) : tokens;
      })
      .filter(function (stage) { return stage.length; });
  }

  var names = Array.isArray(ctx.commands) && ctx.commands.length ? ctx.commands : [ctx.command];
  return names.filter(Boolean).map(function (name) { return [normalizeToken(name)]; });
}

function getStageArgs(ctx, stageIndex) {
  var stage = getStages(ctx)[stageIndex];
  return stage ? stage.slice(1) : [];
}

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
      var stages = getStages(ctx);
      var seen = stages.map(function (stage) { return stage[0]; });
      var matches = validator.single
        ? stages.length === 1 && names.indexOf(seen[0]) >= 0
        : names.some(function (name) { return seen.indexOf(name) >= 0; });
      return matches
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
    case 'args_include': {
      var raw = String(ctx.raw || '');
      function normalize(token) { return token.replace(/^["']|["']$/g, ''); }
      var tokens = Number.isInteger(validator.stage)
        ? getStageArgs(ctx, validator.stage)
        : (raw.trim() ? raw.trim().split(/\s+/).map(normalize) : []);
      var needed = (validator.tokens || []).map(normalize);
      var missing = needed.filter(function (token) { return tokens.indexOf(token) < 0; });
      return missing.length === 0
        ? { ok: true }
        : { ok: false, reason: "La commande n'utilise pas les arguments attendus." };
    }
    case 'args_exact': {
      var stage = Number.isInteger(validator.stage) ? validator.stage : 0;
      var actual = getStageArgs(ctx, stage);
      var expectedTokens = (validator.tokens || []).map(normalizeToken);
      var matchesExact = actual.length === expectedTokens.length
        && expectedTokens.every(function (token, index) { return actual[index] === token; });
      return matchesExact
        ? { ok: true }
        : { ok: false, reason: 'La commande doit utiliser exactement les arguments attendus.' };
    }
    case 'pipeline': {
      var expected = Array.isArray(validator.commands) ? validator.commands : [];
      var stages = getStages(ctx);
      var matches = expected.length > 0 && stages.length === expected.length
        && expected.every(function (name, index) { return stages[index][0] === name; });
      return matches
        ? { ok: true }
        : { ok: false, reason: 'La commande doit utiliser la pipeline attendue.' };
    }
    case 'all': {
      for (var i = 0; i < (validator.of || []).length; i++) {
        var child = evaluateValidator(validator.of[i], ctx);
        if (!child.ok) return validator.reason ? { ok: false, reason: validator.reason } : child;
      }
      return { ok: true };
    }
    case 'any': {
      var failures = [];
      for (var j = 0; j < (validator.of || []).length; j++) {
        var alt = evaluateValidator(validator.of[j], ctx);
        if (alt.ok) return alt;
        failures.push(alt.reason);
      }
      return { ok: false, reason: failures[0] || "Aucune condition alternative n'est remplie." };
    }
    default:
      return { ok: false, reason: 'Validateur inconnu : ' + validator.type };
  }
}
