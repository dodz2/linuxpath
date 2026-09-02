/* ============================================================
   LESSON RENDERING
   ============================================================ */
function escapeLessonText(value) {
  return String(value || '').replace(/[&<>"']/g, function (char) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
  });
}

function exerciseControlLabel(exercise, fieldLabel, optionLabel) {
  let label = 'Exercice ' + exercise.id + ' — ' + exercise.title;
  if (fieldLabel) label += ' — ' + fieldLabel;
  if (optionLabel) label += ' — ' + optionLabel;
  return label;
}

function renderStorageStatus(status) {
  const existing = document.getElementById('storage-status-banner');
  if (!status || status.persistent) {
    if (existing) existing.remove();
    return;
  }
  const banner = existing || document.createElement('div');
  banner.id = 'storage-status-banner';
  banner.className = 'storage-status-banner';
  banner.setAttribute('role', 'status');
  banner.setAttribute('aria-live', 'polite');
  banner.textContent = 'Session non persistante : vos changements sont conservés uniquement dans cet onglet et seront perdus au rechargement.';
  if (!existing) {
    const content = document.querySelector('.content-area');
    if (content && content.parentNode) content.parentNode.insertBefore(banner, content);
  }
}

function renderStorageRecovery(status) {
  const existing = document.getElementById('storage-recovery-panel');
  if (!status || status.state !== 'recovered') {
    if (existing) existing.remove();
    return;
  }

  const panel = existing || document.createElement('section');
  panel.id = 'storage-recovery-panel';
  panel.className = 'storage-recovery-panel';
  panel.setAttribute('role', 'alert');
  panel.setAttribute('aria-live', 'polite');
  panel.dataset.recoveryState = 'recovered';
  panel.replaceChildren();

  const title = document.createElement('strong');
  title.textContent = 'Données locales à récupérer';
  panel.appendChild(title);
  const explanation = document.createElement('p');
  explanation.textContent = 'Une valeur illisible a été isolée. Les autres données valides restent chargées.';
  panel.appendChild(explanation);

  status.entries.forEach(function (entry) {
    const item = document.createElement('div');
    item.className = 'storage-recovery-entry';
    item.dataset.recoveryKey = entry.key;
    const label = document.createElement('strong');
    label.textContent = entry.scope + ' · ' + entry.key;
    item.appendChild(label);
    const raw = document.createElement('pre');
    raw.className = 'storage-recovery-raw';
    raw.textContent = entry.raw;
    item.appendChild(raw);
    const actions = document.createElement('div');
    actions.className = 'storage-recovery-actions';
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'storage-recovery-copy';
    copy.textContent = 'Copier la valeur brute';
    copy.addEventListener('click', async function () {
      await navigator.clipboard.writeText(entry.raw);
      copy.textContent = 'Valeur copiée';
    });
    actions.appendChild(copy);
    const exportButton = document.createElement('button');
    exportButton.type = 'button';
    exportButton.className = 'storage-recovery-export';
    exportButton.textContent = 'Exporter une copie';
    exportButton.addEventListener('click', function () {
      const blob = new Blob([entry.raw], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'linuxpath-recovery-' + entry.key.replace(/[^a-zA-Z0-9_-]/g, '_') + '.txt';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    });
    actions.appendChild(exportButton);
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'storage-recovery-reset';
    reset.textContent = 'Réinitialiser cette valeur';
    reset.addEventListener('click', function () {
      resetStorageRecovery(entry.key);
    });
    actions.appendChild(reset);
    item.appendChild(actions);
    panel.appendChild(item);
  });

  if (!existing) {
    const content = document.querySelector('.content-area');
    if (content && content.parentNode) content.parentNode.insertBefore(panel, content);
  }
}

function renderLessonSources(sources) {
  if (!Array.isArray(sources)) return '';
  const entries = sources.map(function (source) {
    if (!source || typeof source !== 'object') return null;
    try {
      const url = new URL(source.url);
      if (url.protocol !== 'https:' || !source.title || !source.checkedAt || !source.scope) return null;
      return {
        title: escapeLessonText(source.title),
        url: escapeLessonText(url.href),
        checkedAt: escapeLessonText(source.checkedAt),
        scope: escapeLessonText(source.scope)
      };
    } catch (_) {
      return null;
    }
  }).filter(Boolean);
  if (!entries.length) return '';
  return '<aside class="info-box info lesson-sources" aria-label="Références vérifiées">'
    + '<strong>Références vérifiées :</strong><ul>'
    + entries.map(function (entry) {
      return '<li><a href="' + entry.url + '" target="_blank" rel="noopener noreferrer">'
        + entry.title + '</a> — ' + entry.scope + ' <span class="text-muted">(vérifié le ' + entry.checkedAt + ')</span></li>';
    }).join('')
    + '</ul></aside>';
}

function renderLessons(mod) {
  const ids = mod ? [mod] : getPublishedModuleIds();
  ids.forEach(mod => {
    const container = document.getElementById('lessons-' + mod);
    if (!container) return;
    container.innerHTML = '';
    const chapters = (MODULE_META[mod] && MODULE_META[mod].chapters) || [];
    const chapterStart = {};
    chapters.forEach(function (chapter) {
      if (chapter.lessons && chapter.lessons[0]) chapterStart[chapter.lessons[0]] = chapter.title;
    });
    LESSONS[mod].forEach((lesson, i) => {
      if (chapterStart[lesson.id]) {
        const heading = document.createElement('h3');
        heading.className = 'chapter-heading';
        heading.textContent = chapterStart[lesson.id];
        container.appendChild(heading);
      }
      const card = document.createElement('div');
      card.className = 'lesson-card' + (state.lessonsDone.has(lesson.id) ? ' completed' : '');
      card.id = 'lesson-card-' + lesson.id;
      card.innerHTML = `
        <button type="button" class="lesson-header" data-action="toggle-lesson" data-lesson-id="${escapeHtml(lesson.id)}" aria-expanded="false" aria-controls="lesson-body-${escapeHtml(lesson.id)}">
          <span class="lesson-num">${String(i+1).padStart(2,'0')}</span>
          <span class="lesson-title">${lesson.title}</span>
          <span class="lesson-toggle" aria-hidden="true">▼</span>
        </button>
        <div class="lesson-body" id="lesson-body-${lesson.id}">
          <div class="lesson-content">${lesson.content.length > 3500 ? lesson.content.replace('</h3>', '</h3><p class="lesson-checkpoint">Point de reprise — vous pouvez revenir ici plus tard.</p>') : lesson.content}${renderLessonSources(lesson.sources)}</div>
          <div class="lesson-actions">
            <button class="lesson-done-btn ${state.lessonsDone.has(lesson.id) ? 'done' : ''}" id="done-btn-${escapeHtml(lesson.id)}" data-action="mark-lesson-done" data-lesson-id="${escapeHtml(lesson.id)}">
              ${state.lessonsDone.has(lesson.id) ? '✓ Leçon terminée' : '✓ Marquer comme terminée'}
            </button>
            ${i < LESSONS[mod].length - 1
              ? `<button class="lesson-next-btn" data-action="scroll-to-lesson" data-lesson-id="${escapeHtml(LESSONS[mod][i+1].id)}">Leçon suivante →</button>`
              : `<button class="lesson-next-btn" data-action="scroll-to-exercises" data-module="${escapeHtml(mod)}">Exercices du module →</button>`
            }
          </div>
        </div>
      `;
      container.appendChild(card);
    });
  });
}

function toggleLesson(id) {
  const card = document.getElementById('lesson-card-' + id);
  if (!card) return;
  card.classList.toggle('open');
  const header = card.querySelector('.lesson-header');
  if (header) {
    const isOpen = card.classList.contains('open');
    header.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  }
}

async function markLessonDone(id) {
  if (state.lessonsDone.has(id)) state.lessonsDone.delete(id);
  else state.lessonsDone.add(id);
  await saveState();
  updateProgressUI();
  // Flash the card
  const card = document.getElementById('lesson-card-' + id);
  if (card) {
    card.style.transition = 'border-color 0.3s';
    card.style.borderColor = 'var(--accent-green)';
    setTimeout(() => { card.style.borderColor = ''; }, 1500);
  }
}

/**
 * Fait défiler la page vers une leçon et l'ouvre.
 * Utilisée par le bouton "Leçon suivante" et le routage hash (#m3-l2).
 * @param {string} lessonId — ex: 'm3-l2'
 */
function scrollToLesson(lessonId) {
  const moduleId = String(lessonId).match(/^(m\d+)/);
  if (moduleId) ensureModuleRendered(moduleId[1]);
  const card = document.getElementById('lesson-card-' + lessonId);
  if (!card) return;
  // Ouvrir la leçon si elle ne l'est pas déjà
  if (!card.classList.contains('open')) {
    toggleLesson(lessonId);
  }
  // Petit délai pour laisser l'animation d'ouverture se lancer
  setTimeout(() => {
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
}

/* ============================================================
   EXERCISE RENDERING
   ============================================================ */
function renderExercises(mod) {
  const ids = mod ? [mod] : getPublishedModuleIds();
  ids.forEach(mod => {
    const container = document.getElementById('exercises-' + mod);
    if (!container) return;
    container.innerHTML = '';
    const group = typeof getVariantGroupByModule === 'function' ? getVariantGroupByModule(mod) : null;
    const variant = group ? activateVariantForModule(mod) : null;
    if (!group && typeof activateMainTerminalScenario === 'function') activateMainTerminalScenario({}, 'base');
    if (group && variant) container.appendChild(renderDossierPanel(group, variant));
    (EXERCISES[mod] || []).forEach((baseExercise, i) => {
      const ex = variant ? getEffectiveExercise(baseExercise, mod) : baseExercise;
      const variantSolved = variant && state.variantResults && state.variantResults[ex.id]
        ? state.variantResults[ex.id].solvedVariants.indexOf(variant.id) >= 0
        : false;
      const solved = variant ? variantSolved : state.exercisesDone.has(ex.id);
      const legacyComplete = variant && state.exercisesDone.has(ex.id) && !variantSolved;
      const card = document.createElement('div');
      card.className = 'exercise-card' + (solved ? ' solved' : '');
      card.id = 'ex-card-' + ex.id;
      const controls = ex.mode === 'investigation' ? renderReportFields(ex) : `
        <div class="exercise-input-row">
          <span class="exercise-prompt">user@linux:~$</span>
          <input type="text" class="exercise-input" id="ex-input-${ex.id}"
            aria-label="${escapeHtml(exerciseControlLabel(ex))}"
            placeholder="tapez votre commande..."
            ${solved ? 'disabled' : ''}
            data-action="check-exercise" data-exercise-id="${escapeHtml(ex.id)}" data-module="${escapeHtml(mod)}">
          <button class="btn-check" data-check-exercise="${escapeHtml(ex.id)}" data-action="check-exercise" data-exercise-id="${escapeHtml(ex.id)}" data-module="${escapeHtml(mod)}" ${solved ? 'disabled' : ''}>Vérifier</button>
          <button class="btn-hint" data-action="show-hint" data-exercise-id="${escapeHtml(ex.id)}" data-module="${escapeHtml(mod)}">💡 Indice</button>
        </div>`;
      card.innerHTML = `
        <div class="exercise-header">
          <div class="exercise-title">
            <span>${i+1}. ${ex.title}</span>
          </div>
          <span class="exercise-badge ${solved ? 'solved' : ''}" id="ex-badge-${ex.id}">
            ${solved ? '✓ Validé pour ce dossier' : (legacyComplete ? '✓ Acquis · dossier à pratiquer' : 'Exercice')}
          </span>
        </div>
        <div class="exercise-desc">${ex.desc}</div>
        ${controls}
        <div class="hint-box" id="hint-${ex.id}"></div>
        <div class="exercise-feedback" id="feedback-${ex.id}" role="status" aria-live="polite"></div>
      `;
      container.appendChild(card);
    });
  });
}

function renderDossierPanel(group, variant) {
  const panel = document.createElement('div');
  panel.className = 'dossier-panel';
  panel.id = 'dossier-panel-' + group.moduleId;
  const complete = dossierIsComplete(group, variant.id, state.variantResults || {});
  const mastered = masteredDossierCount(group, state.variantResults || {});
  panel.innerHTML = `<div class="dossier-copy"><span class="dossier-kicker">Dossier actif · ${escapeHtml(variant.id)}</span><strong>${escapeHtml(variant.title)}</strong><p>${escapeHtml(variant.brief)}</p></div>
    <div class="dossier-actions"><span class="dossier-progress">${mastered}/4 dossiers maîtrisés</span><button class="btn-new-dossier" data-action="switch-variant" data-module="${escapeHtml(group.moduleId)}" ${complete ? '' : 'disabled'}>Nouveau dossier</button><small>${complete ? 'Entraînement optionnel disponible.' : 'Réussissez les 3 exercices pour changer.'}</small></div>`;
  return panel;
}

function renderReportFields(ex) {
  const fields = (ex.reportFields || []).map(field => {
    const id = `report-${ex.id}-${field.id}`;
    const fieldAriaLabel = escapeHtml(exerciseControlLabel(ex, field.label));
    if (field.type === 'select') {
      const options = (field.options || []).map(option => `<option value="${escapeHtml(option[0])}">${escapeHtml(option[1])}</option>`).join('');
      return `<label class="report-field" for="${id}"><span>${escapeHtml(field.label)}</span><select id="${id}" data-report-field="${field.id}" aria-label="${fieldAriaLabel}">${options}</select></label>`;
    }
    if (field.type === 'checkboxes') {
      const options = (field.options || []).map(option => `<label class="report-check"><input type="checkbox" value="${escapeHtml(option[0])}" data-report-field="${field.id}" aria-label="${escapeHtml(exerciseControlLabel(ex, field.label, option[1]))}"> <span>${escapeHtml(option[1])}</span></label>`).join('');
      return `<fieldset class="report-field report-evidence"><legend>${escapeHtml(field.label)}</legend>${options}</fieldset>`;
    }
    if (field.type === 'textarea') return `<label class="report-field report-wide" for="${id}"><span>${escapeHtml(field.label)}</span><textarea id="${id}" data-report-field="${field.id}" aria-label="${fieldAriaLabel}" rows="3" placeholder="Expliquez votre raisonnement à partir des preuves…"></textarea></label>`;
    return `<label class="report-field" for="${id}"><span>${escapeHtml(field.label)}</span><input id="${id}" data-report-field="${field.id}" aria-label="${fieldAriaLabel}" type="text" autocomplete="off"></label>`;
  }).join('');
  const moduleId = ex.id.split('-')[0];
  return `<div class="investigation-form" data-investigation="${escapeHtml(ex.id)}">${fields}<div class="report-actions"><button class="btn-check" data-check-exercise="${escapeHtml(ex.id)}" data-action="check-exercise" data-exercise-id="${escapeHtml(ex.id)}" data-module="${escapeHtml(moduleId)}">Vérifier l’analyse</button><button class="btn-hint" data-action="show-hint" data-exercise-id="${escapeHtml(ex.id)}" data-module="${escapeHtml(moduleId)}">💡 Indice</button></div></div>`;
}

const hintLevels = {};

function showHint(exId, mod) {
  const base = findExercise(exId);
  const ex = base && mod ? getEffectiveExercise(base, mod) : base;
  if (!ex) return;
  const variant = mod ? getActiveVariant(mod) : null;
  const hintKey = exId + ':' + (variant ? variant.id : 'base');
  const current = hintLevels[hintKey] || 0;
  const next = Math.min(current + 1, ex.hints.length);
  hintLevels[hintKey] = next;
  if (!state.exercisesHow) state.exercisesHow = {};
  state.exercisesHow[exId] = 'helped';
  const box = document.getElementById('hint-' + exId);
  if (box) {
    box.classList.add('visible');
    box.innerHTML = `💡 <strong>Indice ${next}/${ex.hints.length} :</strong> ${ex.hints[next-1]}`;
  }
}

function findExercise(id) {
  for (const mod in EXERCISES) {
    const found = EXERCISES[mod].find(e => e.id === id);
    if (found) return found;
  }
  return null;
}

async function checkExercise(exId, mod) {
  const base = findExercise(exId);
  const variant = getActiveVariant(mod);
  const ex = base && variant ? getEffectiveExercise(base, mod) : base;
  if (!ex) return;
  const feedback = document.getElementById('feedback-' + exId);
  if (!feedback) return;
  if (variant && state.variantResults && state.variantResults[exId] && state.variantResults[exId].solvedVariants.indexOf(variant.id) >= 0) return;
  if (!variant && state.exercisesDone.has(exId)) return;
  if (variant) activateVariantForModule(mod);

  let passed = false;
  let reason = '';
  let input = null;
  if (ex.mode === 'investigation') {
    const report = {};
    (ex.reportFields || []).forEach(field => {
      const nodes = Array.from(document.querySelectorAll(`[data-investigation="${exId}"] [data-report-field="${field.id}"]`));
      report[field.id] = field.type === 'checkboxes' ? nodes.filter(node => node.checked).map(node => node.value) : (nodes[0] ? nodes[0].value.trim() : '');
    });
    const reportVerdict = evaluateReport(ex.reportFields, ex.answer, report);
    passed = reportVerdict.ok;
    if (!passed) {
      const labels = reportVerdict.incorrectFields.map(id => (ex.reportFields.find(field => field.id === id) || { label: id }).label);
      reason = 'Champs à revoir : ' + labels.join(', ') + '.';
    }
  } else {
    input = document.getElementById('ex-input-' + exId);
    if (!input) return;
    const command = input.value.trim();
    if (!command) {
      feedback.className = 'exercise-feedback error';
      feedback.textContent = '✗ Entrez une commande.';
      return;
    }
    const result = mainTerminal.exec(command);
    const commandVerdict = evaluateValidator(ex.validator, { ...result, vfs: mainTerminal.getVfs(), cwd: mainTerminal.getCurrentDir(), raw: command });
    passed = result.exitCode === 0 && commandVerdict.ok;
    reason = commandVerdict.reason || (result.stderr && result.stderr[0]) || 'La commande ne produit pas l’effet attendu.';
  }

  const attempt = variant ? recordVariantAttempt(exId, variant.id) : 1;
  if (passed) {
    if (variant) recordVariantSolved(exId, variant.id);
    state.exercisesDone.add(exId);
    if (!state.exercisesHow) state.exercisesHow = {};
    if (!state.exercisesHow[exId]) state.exercisesHow[exId] = (hintLevels[exId] ? 'helped' : 'autonomous');
    await saveState();
    feedback.className = 'exercise-feedback success';
    feedback.textContent = '✓ Objectif atteint. ' + (ex.correction || variant && variant.correction || 'Exercice validé.');
    if (input) input.disabled = true;
    document.querySelectorAll(`[data-investigation="${exId}"] input, [data-investigation="${exId}"] select, [data-investigation="${exId}"] textarea`).forEach(node => { node.disabled = true; });
    const button = document.querySelector(`[data-check-exercise="${exId}"]`);
    if (button) button.disabled = true;
    const badge = document.getElementById('ex-badge-' + exId);
    if (badge) { badge.className = 'exercise-badge solved'; badge.textContent = '✓ Validé pour ce dossier'; }
    const card = document.getElementById('ex-card-' + exId);
    if (card) card.classList.add('solved');
    if (variant) {
      const group = getVariantGroupByModule(mod);
      const oldPanel = document.getElementById('dossier-panel-' + mod);
      if (oldPanel) oldPanel.replaceWith(renderDossierPanel(group, variant));
    }
    updateProgressUI();
  } else {
    feedback.className = 'exercise-feedback error';
    feedback.textContent = '✗ ' + reason + (attempt >= 3 && (ex.correction || variant && variant.correction) ? ' Correction : ' + (ex.correction || variant.correction) : '');
    if (input) { input.focus(); input.select(); }
  }
  await saveState();
}

/* ============================================================
   QUIZ RENDERING
   ============================================================ */
function renderQuizzes(mod) {
  const ids = mod ? [mod] : getPublishedModuleIds();
  ids.forEach(mod => {
    const container = document.getElementById('quiz-' + mod);
    if (!container) return;
    const quiz = QUIZZES[mod];
    const questionCount = quiz.questions.length;
    const record = getQuizRecord(mod);
    const prevScore = record ? record.lastScore : undefined;

    container.innerHTML = '';
    const card = document.createElement('div');
    card.className = 'quiz-card';
    card.id = 'quiz-card-' + mod;

    if (prevScore !== undefined) {
      const pass = record.passed;
      card.innerHTML = `
        <div class="quiz-start">
          <h3>${quiz.title}</h3>
          <p>Score précédent : <strong>${prevScore}/${questionCount}</strong> ${pass ? '— Réussi ✓' : '— À recommencer'}${record.bestScore !== prevScore ? ' (meilleur : ' + record.bestScore + '/' + questionCount + ')' : ''}</p>
          <button class="btn-start-quiz" data-action="start-quiz" data-module="${escapeHtml(mod)}">Recommencer le quiz</button>
        </div>
        <div class="quiz-body" id="quiz-body-${mod}"></div>
        <div class="quiz-result" id="quiz-result-${mod}" role="status" aria-live="polite"></div>
      `;
    } else {
      card.innerHTML = `
        <div class="quiz-start">
          <h3>${quiz.title}</h3>
          <p>${quiz.questions.length} questions à choix multiples. Score minimum : ${getQuizPolicy(mod).passScore}/${quiz.questions.length} ; terminez aussi les leçons et exercices pour déverrouiller le module suivant.</p>
          <button class="btn-start-quiz" data-action="start-quiz" data-module="${escapeHtml(mod)}">▶ Commencer le quiz</button>
        </div>
        <div class="quiz-body" id="quiz-body-${mod}"></div>
        <div class="quiz-result" id="quiz-result-${mod}" role="status" aria-live="polite"></div>
      `;
    }
    container.appendChild(card);
  });
}

function getQuizFeedback(score, maxScore, passScore) {
  if (score <= 0) return 'Relisez les leçons et réessayez.';
  if (score < passScore) {
    return score + 1 < passScore
      ? 'Continuez à réviser, vous pouvez le faire !'
      : 'Pas mal, mais retentez pour valider.';
  }
  if (score >= maxScore) return 'Parfait ! Vous maîtrisez ce module.';
  return score / maxScore >= 0.8
    ? 'Excellent ! Presque parfait.'
    : 'Bien joué ! Module déverrouillé.';
}

const quizState = {}; // { m1: { currentQ: 0, score: 0, answered: [], questions: [] } }

const renderedModules = new Set();

function renderModuleMeta(mod) {
  const header = document.querySelector('#section-' + mod + ' .module-header .module-meta');
  if (!header) return;
  const counts = getModuleCounts(mod);
  const questions = counts.questions;
  const items = header.querySelectorAll('.module-meta-item');
  if (items[0]) items[0].textContent = '📚 ' + counts.lessons + ' leçon' + (counts.lessons > 1 ? 's' : '');
  if (items[1]) items[1].textContent = '⚡ ' + counts.exercises + ' exercice' + (counts.exercises > 1 ? 's' : '');
  if (items[2]) items[2].textContent = '❓ Quiz ' + questions + ' question' + (questions > 1 ? 's' : '');
}

function ensureModuleRendered(mod) {
  if (!mod) return;
  if (!LESSONS[mod] && !EXERCISES[mod] && !QUIZZES[mod]) return;
  if (!renderedModules.has(mod)) {
    renderLessons(mod);
    renderExercises(mod);
    renderQuizzes(mod);
    renderedModules.add(mod);
  }
  renderModuleMeta(mod);
}

function shuffleQuestion(question, rng) {
  const random = rng || Math.random;
  const indexes = question.options.map((_, index) => index);
  for (let i = indexes.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [indexes[i], indexes[j]] = [indexes[j], indexes[i]];
  }
  return {
    ...question,
    options: indexes.map((index) => question.options[index]),
    correct: indexes.indexOf(question.correct),
  };
}

function startQuiz(mod) {
  if (typeof ensureModuleRendered === 'function') ensureModuleRendered(mod);
  const quiz = QUIZZES[mod];
  quizState[mod] = {
    currentQ: 0,
    score: 0,
    answered: [],
    questions: quiz.questions.map((question) => shuffleQuestion(question)),
  };
  const card = document.getElementById('quiz-card-' + mod);
  card.querySelector('.quiz-start').style.display = 'none';
  const result = document.getElementById('quiz-result-' + mod);
  result.classList.remove('visible');
  showQuestion(mod);
}

function showQuestion(mod) {
  const quiz = QUIZZES[mod];
  const qs = quizState[mod];
  const q = qs.questions[qs.currentQ];
  const body = document.getElementById('quiz-body-' + mod);
  if (!body) return;
  body.classList.add('visible');

  const letters = ['A','B','C','D'];
  const pct = Math.round((qs.currentQ / quiz.questions.length) * 100);

  body.innerHTML = `
    <div class="quiz-progress-row">
      <span class="quiz-q-num">Q${qs.currentQ+1}/${quiz.questions.length}</span>
      <div class="quiz-progress-bar-wrap">
        <div class="quiz-progress-bar-fill" style="width:${pct}%"></div>
      </div>
      <span>${qs.score} pts</span>
    </div>
    <div class="quiz-question" id="quiz-q-${mod}">${q.q}</div>
    <fieldset class="quiz-options" id="quiz-opts-${mod}">
      <legend class="visually-hidden">Choix de réponse</legend>
      ${q.options.map((opt, i) => `
        <button type="button" class="quiz-option" id="quiz-opt-${escapeHtml(mod)}-${i}" data-action="select-quiz-option" data-module="${escapeHtml(mod)}" data-option-index="${i}">
          <span class="quiz-option-letter">${letters[i]}</span>
          <span>${opt}</span>
        </button>
      `).join('')}
    </fieldset>
    <div class="quiz-explanation" id="quiz-expl-${mod}">${q.expl}</div>
    <button class="btn-next-q" id="quiz-next-${escapeHtml(mod)}" data-action="next-question" data-module="${escapeHtml(mod)}">
      ${qs.currentQ < quiz.questions.length - 1 ? 'Question suivante →' : 'Voir les résultats →'}
    </button>
  `;
}

function selectOption(mod, idx) {
  const quiz = QUIZZES[mod];
  const qs = quizState[mod];
  if (!qs || qs.answered[qs.currentQ] !== undefined) return;

  qs.answered[qs.currentQ] = idx;
  const correct = qs.questions[qs.currentQ].correct;
  const isCorrect = idx === correct;
  if (isCorrect) qs.score++;

  qs.questions[qs.currentQ].options.forEach((_, i) => {
    const opt = document.getElementById('quiz-opt-' + mod + '-' + i);
    if (!opt) return;
    opt.classList.add('disabled');
    if (i === correct) opt.classList.add('correct');
    else if (i === idx && !isCorrect) opt.classList.add('wrong');
  });

  const expl = document.getElementById('quiz-expl-' + mod);
  if (expl) {
    expl.classList.add('visible');
    expl.innerHTML = '<span style="color:' + (isCorrect ? 'var(--accent-green)' : 'var(--accent-red)') + ';">' + (isCorrect ? '✓ Correct !' : '✗ Incorrect.') + '</span> ' + qs.questions[qs.currentQ].expl;
  }

  const nextBtn = document.getElementById('quiz-next-' + mod);
  if (nextBtn) nextBtn.style.display = 'inline-flex';
}

function nextQuestion(mod) {
  const quiz = QUIZZES[mod];
  const qs = quizState[mod];
  qs.currentQ++;
  if (qs.currentQ >= quiz.questions.length) {
    showQuizResult(mod);
  } else {
    showQuestion(mod);
  }
}

async function showQuizResult(mod) {
  const qs = quizState[mod];
  const score = qs.score;
  const policy = getQuizPolicy(mod);
  const questionCount = policy.maxScore;
  const pass = score >= policy.passScore;

  state.quizScores[mod] = recordQuizAttempt(state.quizScores[mod], score, policy.passScore);
  await saveState();
  updateProgressUI();

  const body = document.getElementById('quiz-body-' + mod);
  if (body) { body.classList.remove('visible'); body.innerHTML = ''; }

  const result = document.getElementById('quiz-result-' + mod);
  if (!result) return;
  result.classList.add('visible');

  const withHelp = Object.keys(hintLevels).some((id) => id.startsWith(mod + '-') && hintLevels[id] > 0);
  const mastery = !pass ? 'À retravailler' : (score >= QUIZZES[mod].questions.length && !withHelp ? 'Maîtrisé' : (withHelp ? 'Réussi avec aide' : 'Réussi autonome'));
  const feedback = getQuizFeedback(score, questionCount, policy.passScore);
  const nextMod = getNextMod(mod);
  const reviewItems = qs.questions.map((question, index) => {
    if (qs.answered[index] === question.correct) return '';
    const lesson = (LESSONS[mod] || [])[Math.min(index, (LESSONS[mod] || []).length - 1)];
    return '<li>' + question.q + (lesson ? ' — revoir : ' + lesson.title : '') + '</li>';
  }).join('');

  const moduleComplete = isModuleComplete(mod);
  const nextUnlocked = moduleComplete && nextMod && state.unlockedModules.has(nextMod);
  const completionNeeded = pass && !moduleComplete;
  result.innerHTML = '<div class="quiz-result-inner ' + (pass ? 'pass' : 'fail') + '">'
    + '<div class="quiz-result-stars">' + mastery + '</div>'
    + '<div class="quiz-result-score">' + score + '<span>/' + questionCount + '</span></div>'
    + '<div class="quiz-result-msg">' + feedback + '</div>'
    + (reviewItems ? '<ul class="quiz-review">' + reviewItems + '</ul>' : '')
    + (pass && nextUnlocked ? '<div class="quiz-unlock-msg">🔓 Module suivant déverrouillé !</div>' : (pass && moduleComplete && !nextMod ? '<div class="quiz-unlock-msg">🏁 Parcours terminé.</div>' : (completionNeeded ? '<div class="quiz-unlock-msg">Terminez les leçons et exercices du module pour déverrouiller la suite.</div>' : '')))
    + '<div class="quiz-result-actions">'
    + '<button class="btn-start-quiz" data-action="start-quiz" data-module="' + escapeHtml(mod) + '">Recommencer</button>'
    + (pass && nextUnlocked ? '<button class="btn-start-quiz" style="background:var(--accent-blue-dim);margin-left:8px" data-action="navigate" data-target="' + escapeHtml(nextMod) + '">Module suivant →</button>' : '')
    + '</div></div>';
}

function getNextMod(mod) {
  return nextModuleId(mod);
}

/* ============================================================
   OVERVIEW CARDS
   ============================================================ */
function renderOverviewCards() {
  const grid = document.getElementById('modules-overview-grid');
  if (!grid) return;
  const mods = getPublishedModuleIds();
  grid.innerHTML = '';
  mods.forEach(function(mod) {
    const meta = MODULE_META[mod] || { title: mod, desc: '', icon: '' };
    const unlocked = state.unlockedModules.has(mod);
    const mp = getModuleProgress(mod);
    const pct = mp.pct;
    const card = document.createElement('div');
    card.className = 'module-overview-card' + (!unlocked ? ' locked' : '');
    const num = String(meta.displayOrder || 0).padStart(2, '0');
    card.innerHTML = '<div class="mod-card-num">' + num + '</div>'
      + '<div class="mod-card-icon">' + (meta.icon || '') + '</div>'
      + '<h3 class="mod-card-title">' + meta.title + '</h3>'
      + '<p class="mod-card-desc">' + meta.desc + '</p>'
      + '<div class="mod-card-progress"><div class="mod-card-progress-bar"><div class="mod-card-progress-fill" style="width:' + pct + '%"></div></div><span class="mod-card-pct">' + pct + '%</span></div>'
      + (unlocked
        ? '<button class="mod-card-btn" data-action="navigate" data-target="' + escapeHtml(mod) + '">Commencer <span class="arrow">→</span></button>'
        : '<button type="button" class="mod-card-btn" disabled aria-disabled="true">Verrouillé — réussissez le quiz précédent</button>');
    grid.appendChild(card);
  });
}

function renderModuleOutcomes(mod) {
  const header = document.querySelector('#section-' + mod + ' .module-header');
  if (!header) return;
  const meta = MODULE_META[mod];
  if (!meta || !meta.objectives || !meta.objectives.length) return;
  let box = header.querySelector('.module-outcomes');
  if (!box) {
    box = document.createElement('div');
    box.className = 'module-outcomes';
    header.appendChild(box);
  }
  box.innerHTML = '<p class="module-outcomes-time">' + meta.estimatedMinutes + ' min · Objectifs</p>'
    + '<ul>' + meta.objectives.map(function (item) { return '<li>' + item + '</li>'; }).join('') + '</ul>'
    + '<p class="module-outcomes-success">Critère de réussite : ' + meta.successCriteria + '</p>';
}

function enterTrack(trackId) {
  const track = (typeof TRACKS !== 'undefined' ? TRACKS : []).find(function (entry) { return entry.id === trackId; });
  if (!track || !track.entryModule) return;
  state.unlockedModules.add(track.entryModule);
  navigateTo(track.entryModule);
}


/* ============================================================
   TERMINAL ENGINE (moteur unifié)
   ============================================================ */
/* ============================================================
   TERMINAL ENGINE — Moteur unifié pour terminal principal & CTF
   ============================================================ */

/* ============================================================
   ACTUALITÉS CYBER — NEWS
   ============================================================ */

/* ============================================================
   ACTUALITÉS CYBER — NEWS
   ============================================================ */
let _newsData = [];
let _newsActiveFilter = 'all';

function cvssClass(score) {
  if (!score) return '';
  if (score >= 9.0) return 'cvss-critical';
  if (score >= 7.0) return 'cvss-high';
  return 'cvss-medium';
}

function sevLabel(sev) {
  const map = { critical: 'Critique', high: 'Élevé', medium: 'Moyen', info: 'Info', unevaluated: 'Non évaluée' };
  return map[sev] || sev;
}

function formatNewsDate(dateStr) {
  try {
    if (!dateStr) return 'Date inconnue';
    const d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch(e) { return dateStr || 'Date inconnue'; }
}

function renderNewsGrid(filter) {
  _newsActiveFilter = filter || _newsActiveFilter;
  const grid = document.getElementById('news-grid');
  if (!grid) return;

  let items = [..._newsData].sort((a, b) => b.date.localeCompare(a.date));

  if (_newsActiveFilter !== 'all') {
    if (_newsActiveFilter.startsWith('tag:')) {
      const tag = _newsActiveFilter.slice(4);
      items = items.filter(n => n.tags && n.tags.includes(tag));
    } else {
      items = items.filter(n => n.severity === _newsActiveFilter);
    }
  }

  if (items.length === 0) {
    grid.innerHTML = '<div class="news-empty">Aucune actualité pour ce filtre.</div>';
    return;
  }

  grid.innerHTML = items.map(n => {
    const cvssHtml = n.cvss
      ? `<span class="news-cvss ${cvssClass(n.cvss)}" title="Score CVSS">CVSS ${n.cvss.toFixed(1)}</span>`
      : '';
    const cveHtml = n.cve
      ? `<span class="news-tag" style="color:var(--accent-orange);border-color:rgba(255,166,87,0.3)">${escapeHtml(n.cve)}</span>`
      : '';
    const tagsHtml = n.tags
      ? n.tags.map(t => `<span class="news-tag">${escapeHtml(t)}</span>`).join('')
      : '';
    return `
      <div class="news-card" data-severity="${escapeHtml(n.severity)}" data-id="${escapeHtml(n.id)}">
        <div class="news-card-top">
          <div class="news-card-title">${escapeHtml(n.title)}</div>
          <div class="news-card-badges">
            <span class="news-sev-badge ${escapeHtml(n.severity)}">${sevLabel(n.severity)}</span>
            ${cvssHtml}
          </div>
        </div>
        <div class="news-card-meta">
          <span class="news-card-date">📅 ${formatNewsDate(n.date)}</span>
          <span class="news-card-source">⌂ ${escapeHtml(n.source_label)}</span>
        </div>
        <div class="news-tags">${cveHtml}${tagsHtml}</div>
        <div class="news-card-summary">${escapeHtml(n.summary)}</div>
        <div class="news-card-context">
          <span class="news-context-text">${escapeHtml(n.context)}</span>
          ${(n.related_modules && n.related_modules.length) ? '<div class="news-modules">' + n.related_modules.map(function(m) {
            var meta = typeof MODULE_META !== 'undefined' && MODULE_META[m];
            var label = meta ? meta.title : m.toUpperCase();
            return '<a href="#' + escapeHtml(m) + '" class="news-module-link" data-action="navigate" data-target="' + escapeHtml(m) + '">→ ' + escapeHtml(label) + '</a>';
          }).join('') + '</div>' : ''}
        </div>
        <div class="news-card-footer">
          <a href="${escapeHtml(n.source_url)}" target="_blank" rel="noopener noreferrer" class="news-source-link">
            Lire la source →
          </a>
        </div>
      </div>
    `;
  }).join('');
}

function filterNews(filter, btn) {
  document.querySelectorAll('#news-filters .news-filter-btn').forEach(b => {
    b.classList.remove('active', 'active-critical', 'active-high', 'active-medium', 'active-info');
    b.setAttribute('aria-pressed', 'false');
  });
  if (btn) {
    if (filter === 'all') btn.classList.add('active');
    else if (filter === 'critical') btn.classList.add('active-critical');
    else if (filter === 'high') btn.classList.add('active-high');
    else if (filter === 'medium') btn.classList.add('active-medium');
    else if (filter === 'info') btn.classList.add('active-info');
    else btn.classList.add('active');
    btn.setAttribute('aria-pressed', 'true');
  }
  renderNewsGrid(filter);
}

async function loadNews() {
  try {
    const resp = await fetch('data/news.json');
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();
    _newsData = data.news || [];
    const el = document.getElementById('news-last-updated');
    if (el && data.last_updated) {
      el.textContent = 'Dernière mise à jour : ' + formatNewsDate(data.last_updated)
        + (data.edition ? ' — ' + data.edition : '');
    }
    // Sync le bouton filtre actif visuellement
    const allBtn = document.querySelector('#news-filters .news-filter-btn[data-filter="all"]');
    if (allBtn) filterNews('all', allBtn);
    else renderNewsGrid('all');
  } catch(e) {
    console.warn('[LinuxPath] Chargement news.json échoué :', e);
    const grid = document.getElementById('news-grid');
    if (grid) grid.innerHTML = `
      <div class="lp-error-state" role="alert">
        <div class="lp-error-icon">⚠️</div>
        <p class="lp-error-msg">Impossible de charger les actualités.</p>
        <button class="lp-error-retry" data-action="load-news">↺ Réessayer</button>
      </div>`;
  }
}

/* ============================================================
   CHEATSHEET LINUX
   ============================================================ */

/* ============================================================
   CHEATSHEET LINUX
   ============================================================ */

let _cheatsheetData = [];
let _cheatsheetActiveFilter = 'all';

async function loadCheatsheet() {
  try {
    const res = await fetch('./data/cheatsheet.json');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    _cheatsheetData = json.categories || [];
    buildCheatsheetFilters();
    renderCheatsheet('all');
  } catch (err) {
    console.error('[LinuxPath] Cheatsheet load error:', err);
    const grid = document.getElementById('cheatsheet-grid');
    if (grid) grid.innerHTML = `
      <div class="lp-error-state" role="alert">
        <div class="lp-error-icon">⚠️</div>
        <p class="lp-error-msg">Impossible de charger la cheatsheet.</p>
        <button class="lp-error-retry" data-action="load-cheatsheet">↺ Réessayer</button>
      </div>`;
  }
}

function buildCheatsheetFilters() {
  const container = document.getElementById('cheatsheet-filters');
  if (!container) return;

  // Keep the "Tout" button, add one per category
  let html = '<button class="cheatsheet-filter-btn active" data-cat="all" data-action="filter-cheatsheet-category">Tout</button>';
  _cheatsheetData.forEach(cat => {
    html += `<button class="cheatsheet-filter-btn" data-cat="${escapeHtml(cat.id)}" data-action="filter-cheatsheet-category">${escapeHtml(cat.icon)} ${escapeHtml(cat.label)}</button>`;
  });
  container.innerHTML = html;
}

function renderCheatsheet(filterCat) {
  _cheatsheetActiveFilter = filterCat;
  const search = (document.getElementById('cheatsheet-search')?.value || '').toLowerCase().trim();
  const grid = document.getElementById('cheatsheet-grid');
  if (!grid) return;

  const toRender = filterCat === 'all'
    ? _cheatsheetData
    : _cheatsheetData.filter(c => c.id === filterCat);

  let html = '';
  let totalVisible = 0;

  toRender.forEach(cat => {
    const matchedCmds = cat.commands.filter(cmd => {
      if (!search) return true;
      return cmd.cmd.toLowerCase().includes(search)
          || cmd.desc.toLowerCase().includes(search)
          || cmd.example.toLowerCase().includes(search);
    });

    if (matchedCmds.length === 0) return;
    totalVisible += matchedCmds.length;

    html += `
      <div class="cheatsheet-category">
        <div class="cheatsheet-cat-header">
          <span class="cheatsheet-cat-icon">${cat.icon}</span>
          <span class="cheatsheet-cat-label">${cat.label}</span>
          <span class="cheatsheet-cat-count">${matchedCmds.length} commande${matchedCmds.length > 1 ? 's' : ''}</span>
        </div>
        <div class="cheatsheet-cmd-list">
          ${matchedCmds.map(cmd => `
            <div class="cheatsheet-cmd-card" data-action="copy-command" data-command="${escapeHtml(cmd.example)}" title="Cliquer pour copier">
              <div class="cheatsheet-cmd-top">
                <code class="cheatsheet-cmd">${escapeHtml(cmd.cmd)}</code>
                <button class="cheatsheet-copy-btn" aria-label="Copier">
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
                    <rect x="5" y="5" width="9" height="9" rx="1.5"/>
                    <path d="M11 5V3.5A1.5 1.5 0 009.5 2h-6A1.5 1.5 0 002 3.5v6A1.5 1.5 0 003.5 11H5"/>
                  </svg>
                </button>
              </div>
              <div class="cheatsheet-cmd-desc">${escapeHtml(cmd.desc)}</div>
              <code class="cheatsheet-cmd-example">${escapeHtml(cmd.example)}</code>
            </div>
          `).join('')}
        </div>
      </div>`;
  });

  if (totalVisible === 0) {
    html = `<div class="news-empty">Aucune commande trouvée pour "<strong>${escapeHtml(search)}</strong>"</div>`;
  }

  grid.innerHTML = html;
}

function filterCheatsheetCat(cat, btn) {
  _cheatsheetActiveFilter = cat;
  document.querySelectorAll('.cheatsheet-filter-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  // Reset search
  const searchEl = document.getElementById('cheatsheet-search');
  if (searchEl) searchEl.value = '';
  renderCheatsheet(cat);
}

function filterCheatsheet() {
  renderCheatsheet(_cheatsheetActiveFilter);
}

async function copyCmd(text) {
  let copied = false;
  try {
    if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
      throw new Error('clipboard unavailable');
    }
    await navigator.clipboard.writeText(text);
    copied = true;
  } catch (_) {
    let el = null;
    try {
      el = document.createElement('textarea');
      el.value = text;
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      copied = document.execCommand('copy') === true;
    } catch (_) {
      copied = false;
    } finally {
      if (el && el.parentNode) el.parentNode.removeChild(el);
    }
  }
  showCheatsheetToast(copied);
  return copied;
}

function showCheatsheetToast(copied) {
  const toast = document.getElementById('cheatsheet-toast');
  if (!toast) return;
  toast.textContent = copied
    ? '✓ Copié dans le presse-papier'
    : 'Échec de la copie — sélectionnez la commande manuellement.';
  toast.classList.add('visible');
  setTimeout(() => toast.classList.remove('visible'), 2000);
}



function escapeAttr(str) {
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '&quot;');
}

/* ============================================================
   GLOSSAIRE LINUX & CYBERSÉCURITÉ
   ============================================================ */

/* ============================================================
   GLOSSAIRE LINUX & CYBERSÉCURITÉ
   ============================================================ */

let _glossaryData = [];
let _glossaryActiveFilter = 'all';
let _glossaryActiveLetter = 'all';

const GLOSSARY_CAT_LABELS = {
  securite: '🛡️ Sécurité',
  systeme: '🖥️ Système',
  shell: '📝 Shell',
  reseau: '🌐 Réseau',
  permissions: '🔐 Permissions',
  developpement: '⚙️ Dev',
  virtualisation: '📦 Virtualisation'
};

async function loadGlossary() {
  try {
    const res = await fetch('./data/glossary.json');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    _glossaryData = json.terms || [];
    buildGlossaryAlphaNav();
    renderGlossary();
  } catch (err) {
    console.error('[LinuxPath] Glossary load error:', err);
    const grid = document.getElementById('glossary-grid');
    if (grid) grid.innerHTML = `
      <div class="lp-error-state" role="alert">
        <div class="lp-error-icon">⚠️</div>
        <p class="lp-error-msg">Impossible de charger le glossaire.</p>
        <button class="lp-error-retry" data-action="load-glossary">↺ Réessayer</button>
      </div>`;
  }
}

function buildGlossaryAlphaNav() {
  const nav = document.getElementById('glossary-alpha-nav');
  if (!nav) return;
  const letters = [...new Set(_glossaryData.map(t => t.letter))].sort();
  let html = '<button class="glossary-alpha-btn active" data-letter="all" data-action="filter-glossary-letter">Tout</button>';
  letters.forEach(l => {
    html += `<button class="glossary-alpha-btn" data-letter="${escapeHtml(l)}" data-action="filter-glossary-letter">${escapeHtml(l)}</button>`;
  });
  nav.innerHTML = html;
}

function renderGlossary() {
  const search = (document.getElementById('glossary-search')?.value || '').toLowerCase().trim();
  const grid = document.getElementById('glossary-grid');
  if (!grid) return;

  // Filter terms
  let filtered = _glossaryData.filter(t => {
    const catOk = _glossaryActiveFilter === 'all' || t.category === _glossaryActiveFilter;
    const letterOk = _glossaryActiveLetter === 'all' || t.letter === _glossaryActiveLetter;
    const searchOk = !search || 
      t.term.toLowerCase().includes(search) ||
      t.definition.toLowerCase().includes(search) ||
      (t.full && t.full.toLowerCase().includes(search));
    return catOk && letterOk && searchOk;
  });

  // Sort alphabetically
  filtered.sort((a, b) => a.term.localeCompare(b.term, 'fr'));

  if (filtered.length === 0) {
    grid.innerHTML = `<div class="news-empty">Aucun terme trouvé${search ? ` pour "<strong>${escapeHtml(search)}</strong>"` : ''}.</div>`;
    return;
  }

  // Group by first letter
  const groups = {};
  filtered.forEach(t => {
    const l = t.term[0].toUpperCase();
    if (!groups[l]) groups[l] = [];
    groups[l].push(t);
  });

  let html = '';
  Object.keys(groups).sort().forEach(letter => {
    html += `<div class="glossary-letter-group">
      <div class="glossary-letter-header">${letter}</div>
      <div class="glossary-terms-grid">
        ${groups[letter].map(t => `
          <div class="glossary-term-card">
            <div class="glossary-term-top">
              <div class="glossary-term-name">${escapeHtml(t.term)}</div>
              <span class="glossary-cat-badge glossary-cat-${t.category}">${GLOSSARY_CAT_LABELS[t.category] || t.category}</span>
            </div>
            ${t.full ? `<div class="glossary-term-full">${escapeHtml(t.full)}</div>` : ''}
            <div class="glossary-term-def">${escapeHtml(t.definition)}</div>
            <code class="glossary-term-example">${escapeHtml(t.example)}</code>
            ${t.related && t.related.length ? `
              <div class="glossary-related">
                ${t.related.map(r => `<span class="glossary-related-tag">${escapeHtml(r)}</span>`).join('')}
              </div>` : ''}
          </div>
        `).join('')}
      </div>
    </div>`;
  });

  grid.innerHTML = html;
}

function filterGlossaryCat(cat, btn) {
  _glossaryActiveFilter = cat;
  _glossaryActiveLetter = 'all';
  // Reset letter nav
  document.querySelectorAll('.glossary-alpha-btn').forEach(b => b.classList.remove('active'));
  const allLetterBtn = document.querySelector('.glossary-alpha-btn[data-letter="all"]');
  if (allLetterBtn) allLetterBtn.classList.add('active');
  // Update cat buttons
  document.querySelectorAll('#glossary-cat-filters .cheatsheet-filter-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  // Reset search
  const searchEl = document.getElementById('glossary-search');
  if (searchEl) searchEl.value = '';
  renderGlossary();
}

function filterGlossaryLetter(letter, btn) {
  _glossaryActiveLetter = letter;
  document.querySelectorAll('.glossary-alpha-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderGlossary();
}

function filterGlossary() {
  // Reset letter and cat filters when searching
  _glossaryActiveLetter = 'all';
  _glossaryActiveFilter = 'all';
  document.querySelectorAll('.glossary-alpha-btn').forEach(b => b.classList.remove('active'));
  const allLetterBtn = document.querySelector('.glossary-alpha-btn[data-letter="all"]');
  if (allLetterBtn) allLetterBtn.classList.add('active');
  document.querySelectorAll('#glossary-cat-filters .cheatsheet-filter-btn').forEach(b => b.classList.remove('active'));
  const allCatBtn = document.querySelector('#glossary-cat-filters .cheatsheet-filter-btn[data-cat="all"]');
  if (allCatBtn) allCatBtn.classList.add('active');
  renderGlossary();
}

/* ============================================================
   ROADMAP / PROGRESSION
   ============================================================ */

/* ============================================================
   ROADMAP / PROGRESSION
   ============================================================ */

const MODULE_ICONS = {
  m1: '🐧', m2: '📁', m3: '👤',
  m4: '🌐', m5: '📝', m6: '⚙️',
  m7: '🛡️', m8: '🐳', m9: '🔑', m10: '🌐', m11: '🛡️',
  m12: '🕵', m13: '⚔️', m14: '🧬', cs1: '🧭'
};

function bonusSections() {
  const stats = getCurriculumStats();
  return [
    { target: 'sandbox',    icon: '💻', label: 'Sandbox Linux',      desc: 'Terminal Linux réel (démo v86) via WebAssembly' },
    { target: 'ctf',        icon: '🚩', label: 'Challenges CTF',     desc: stats.challenges + ' challenges d\'investigation' },
    { target: 'cheatsheet', icon: '📋', label: 'Cheatsheet',         desc: 'Référence rapide des commandes Linux' },
    { target: 'glossary',   icon: '📖', label: 'Glossaire',          desc: 'Termes expliqués en français' },
    { target: 'news',       icon: '📰', label: 'Actualités Cyber',   desc: 'Veille cybersécurité — mise à jour quotidienne' }
  ];
}

function renderRoadmap() {
  renderRoadmapSummary();
  renderRoadmapTimeline();
  renderRoadmapBonus();
}

function renderRoadmapSummary() {
  const el = document.getElementById('roadmap-summary');
  if (!el) return;

  const mods = getPublishedModuleIds();

  // Compute totals
  let totalLessons = 0, doneLessons = 0;
  let totalExercises = 0, doneExercises = 0;
  let totalQuizzes = 0, doneQuizzes = 0;
  let completedModules = 0;

  mods.forEach(m => {
    const counts = getModuleCounts(m);
    totalLessons   += counts.lessons;
    totalExercises += counts.exercises;
    totalQuizzes   += counts.quizzes;

    // Count done items for this module
    const lessonsDone = countOwned(state.lessonsDone, m);
    const exDone      = countOwned(state.exercisesDone, m);
    const quizDone    = isQuizPassed(m);

    doneLessons   += Math.min(lessonsDone, counts.lessons);
    doneExercises += Math.min(exDone, counts.exercises);
    doneQuizzes   += quizDone;

    // Module fully completed = all lessons + all exercises + quiz done
    if (
      lessonsDone >= counts.lessons &&
      exDone      >= counts.exercises &&
      quizDone
    ) completedModules++;
  });

  const totalItems = totalLessons + totalExercises + totalQuizzes;
  const doneItems  = doneLessons + doneExercises + doneQuizzes;
  const pct = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0;

  el.innerHTML = `
    <div class="roadmap-stat-card">
      <div class="roadmap-stat-number" style="color:var(--accent-green)">${pct}%</div>
      <div class="roadmap-stat-label">Progression globale</div>
      <div class="roadmap-stat-bar">
        <div class="roadmap-stat-fill" style="width:${pct}%;background:var(--accent-green)"></div>
      </div>
    </div>
    <div class="roadmap-stat-card">
      <div class="roadmap-stat-number" style="color:var(--accent-blue)">${completedModules}<span style="font-size:16px;color:var(--text-subtle)">/${mods.length}</span></div>
      <div class="roadmap-stat-label">Modules complétés</div>
    </div>
    <div class="roadmap-stat-card">
      <div class="roadmap-stat-number" style="color:var(--accent-purple)">${doneLessons}<span style="font-size:16px;color:var(--text-subtle)">/${totalLessons}</span></div>
      <div class="roadmap-stat-label">Leçons terminées</div>
    </div>
    <div class="roadmap-stat-card">
      <div class="roadmap-stat-number" style="color:#ffa600">${doneExercises}<span style="font-size:16px;color:var(--text-subtle)">/${totalExercises}</span></div>
      <div class="roadmap-stat-label">Exercices résolus</div>
    </div>
  `;
}

function renderRoadmapTimeline() {
  const el = document.getElementById('roadmap-timeline');
  if (!el) return;

  const linuxMods = getTrackModuleIds('linux');
  const networkMods = getTrackModuleIds('network');
  const offsecMods = getTrackModuleIds('offsec');
  let html = '';

  html += '<div class="roadmap-section-label">Modules Linux</div>';

  function renderNode(m, globalIdx, modsArr, localIdx) {
    const meta   = MODULE_META[m];
    const counts = getModuleCounts(m);
    const icon   = MODULE_ICONS[m];
    const num    = String(globalIdx + 1).padStart(2, '0');
    const isLastInSection = localIdx === modsArr.length - 1;

    const lessonsDone = countOwned(state.lessonsDone, m);
    const exDone      = countOwned(state.exercisesDone, m);
    const quizDone    = isQuizPassed(m);

    const totalItems = counts.lessons + counts.exercises + counts.quizzes;
    const doneItems  = Math.min(lessonsDone, counts.lessons)
                     + Math.min(exDone, counts.exercises)
                     + (quizDone ? counts.quizzes : 0);
    const pct = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0;

    const isUnlocked   = state.unlockedModules.has(m);
    const isCompleted  = lessonsDone >= counts.lessons && exDone >= counts.exercises && quizDone;
    const isActive     = isUnlocked && !isCompleted && doneItems > 0;
    const isStartable  = isUnlocked && doneItems === 0;
    const isLocked     = !isUnlocked;

    let nodeClass = 'roadmap-node';
    let statusLabel = '';
    let statusClass = '';
    if (isCompleted) {
      nodeClass += ' completed';
      statusLabel = '✅ Complété';
      statusClass = 'roadmap-status-completed';
    } else if (isActive) {
      nodeClass += ' active';
      statusLabel = '🔵 En cours';
      statusClass = 'roadmap-status-active';
    } else if (isStartable) {
      nodeClass += ' startable';
      statusLabel = '▶ Déverrouillé';
      statusClass = 'roadmap-status-startable';
    } else {
      nodeClass += ' locked';
      statusLabel = '🔒 Verrouillé';
      statusClass = 'roadmap-status-locked';
    }

    const btnDisabled = isLocked ? 'disabled' : '';
    const btnLabel    = isCompleted ? 'Revoir' : (isLocked ? 'Verrouillé' : (doneItems > 0 ? 'Continuer →' : 'Commencer →'));

    html += `
      <div class="${nodeClass}">
        <div class="roadmap-node-connector">
          <div class="roadmap-dot ${isCompleted ? 'dot-completed' : isActive ? 'dot-active' : isStartable ? 'dot-startable' : 'dot-locked'}">
            ${isCompleted ? '✓' : isLocked ? '🔒' : icon}
          </div>
          ${!isLastInSection ? '<div class="roadmap-line ' + (isCompleted ? 'line-done' : '') + '"></div>' : ''}
        </div>
        <div class="roadmap-node-content">
          <div class="roadmap-node-header">
            <span class="roadmap-node-num">${num}</span>
            <span class="roadmap-node-title">${escapeHtml(meta.title)}</span>
            <span class="roadmap-node-status ${statusClass}">${statusLabel}</span>
          </div>
          <p class="roadmap-node-desc">${escapeHtml(meta.desc)}</p>
          ${!isLocked ? `
          <div class="roadmap-node-progress">
            <div class="roadmap-progress-items">
              <span class="${lessonsDone >= counts.lessons ? 'roadmap-item-done' : ''}">📚 ${Math.min(lessonsDone, counts.lessons)}/${counts.lessons} leçons</span>
              <span class="${exDone >= counts.exercises ? 'roadmap-item-done' : ''}">⌨️ ${Math.min(exDone, counts.exercises)}/${counts.exercises} exercices</span>
              <span class="${quizDone ? 'roadmap-item-done' : ''}">✅ ${quizDone ? counts.quizzes : 0}/${counts.quizzes} quiz</span>
            </div>
            <div class="roadmap-pct-bar">
              <div class="roadmap-pct-fill ${isCompleted ? 'fill-completed' : 'fill-active'}" style="width:${pct}%"></div>
            </div>
            <span class="roadmap-pct-label">${pct}%</span>
          </div>` : ''}
          <button class="roadmap-node-btn ${isLocked ? 'btn-locked' : ''}" ${btnDisabled} data-action="navigate" data-target="${escapeHtml(m)}">${btnLabel}</button>
        </div>
      </div>`;
  }

  linuxMods.forEach((m, i) => renderNode(m, i, linuxMods, i));

  html += '<div class="roadmap-section-label" style="margin-top:2.5rem;">Réseau & Services</div>';

  networkMods.forEach((m, i) => renderNode(m, i + 8, networkMods, i));

  html += '<div class="roadmap-section-label" style="margin-top:2.5rem;">Sécurité, Pentest & DFIR</div>';

  offsecMods.forEach((m, i) => renderNode(m, i + 11, offsecMods, i));

  el.innerHTML = html;
}

function renderRoadmapBonus() {
  const el = document.getElementById('roadmap-bonus-grid');
  if (!el) return;

  el.innerHTML = bonusSections().map(s => `
    <button type="button" class="roadmap-bonus-card" data-action="navigate" data-target="${escapeHtml(s.target)}">
      <span class="roadmap-bonus-icon" aria-hidden="true">${s.icon}</span>
      <span class="roadmap-bonus-label">${escapeHtml(s.label)}</span>
      <span class="roadmap-bonus-desc">${escapeHtml(s.desc)}</span>
    </button>
  `).join('');
}

/* ============================================================
   HOME — Hero dynamique (retour vs nouveau)
   ============================================================ */

/* ============================================================
   HOME — Hero dynamique (retour vs nouveau)
   ============================================================ */

/* ============================================================
   HERO TERMINAL — démonstration interactive de la page d'accueil
   ============================================================ */
const HERO_TYPING_MS = 78;
const HERO_PAUSE_MS = 1000;
const HERO_BATCH_MS = 1600;

const HERO_SCRIPT = [
  { cmd: 'whoami', out: ['visiteur'] },
  { cmd: 'pwd', out: ['/home/visiteur'] },
  { cmd: 'ls', out: ['README.md   motivation.txt   parcours/   quiz/'] },
  { cmd: 'cat motivation.txt', out: ['"Le terminal, ça se dompte pas en vidéo."', 'signé LinuxPath'] },
];

let heroTimers = [];
let heroInteractive = false;

function heroSchedule(fn, ms) {
  const id = setTimeout(fn, ms);
  heroTimers.push(id);
  return id;
}

function cleanHeroTimers() {
  heroTimers.forEach(function (id) { clearTimeout(id); });
  heroTimers = [];
}

function renderHeroTerminal() {
  const host = document.querySelector('[data-hero-terminal-host]');
  if (!host) return;
  const input = host.querySelector('[data-hero-input]');
  if (!host.dataset.heroBuilt) {
    host.dataset.heroBuilt = 'true';
    host.innerHTML = `
      <div class="hero-terminal" data-hero-terminal role="group" aria-label="Terminal de démonstration LinuxPath">
        <div class="hero-terminal-bar">
          <span class="hero-terminal-dot hero-terminal-dot-red"></span>
          <span class="hero-terminal-dot hero-terminal-dot-yellow"></span>
          <span class="hero-terminal-dot hero-terminal-dot-green"></span>
          <span class="hero-terminal-title">visiteur@linuxpath: ~</span>
          <span class="hero-terminal-badge">démo</span>
        </div>
        <div class="hero-terminal-screen" data-hero-screen aria-hidden="true"></div>
        <div class="hero-terminal-inputrow">
          <span class="hero-terminal-prompt" data-hero-prompt>visiteur@linuxpath:~$</span>
          <input class="hero-terminal-input" data-hero-input aria-label="Taper une commande de démonstration" autocomplete="off" spellcheck="false" />
        </div>
      </div>`;
    const inputEl = host.querySelector('[data-hero-input]');
    const term = host.querySelector('[data-hero-terminal]');
    if (inputEl) {
      inputEl.addEventListener('keydown', function (e) {
        if (!heroInteractive) heroSwitchToInteractive();
        if (e.key === 'Enter') {
          const cmd = inputEl.value;
          inputEl.value = '';
          heroRunCommand(cmd);
        }
      });
    }
    if (term) {
      term.addEventListener('click', function (e) {
        const inputEl = host.querySelector('[data-hero-input]');
        if (inputEl && e.target !== inputEl) inputEl.focus();
      });
    }
  } else if (input) {
    input.value = '';
  }
  heroInteractive = false;
  const screen = host.querySelector('[data-hero-screen]');
  if (screen) {
    screen.setAttribute('aria-hidden', 'true');
    screen.removeAttribute('aria-live');
  }
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    heroRenderInstant();
  } else {
    startHeroDemo();
  }
}

function heroAppendLine(html) {
  const screen = document.querySelector('[data-hero-screen]');
  if (!screen) return;
  const line = document.createElement('div');
  line.className = 'hero-term-line';
  line.innerHTML = html;
  screen.appendChild(line);
  screen.scrollTop = screen.scrollHeight;
}

function heroAppendOut(lines) {
  const screen = document.querySelector('[data-hero-screen]');
  if (!screen) return;
  lines.forEach(function (line) {
    const out = document.createElement('div');
    out.className = 'hero-term-line hero-term-out';
    out.textContent = line;
    screen.appendChild(out);
  });
  screen.scrollTop = screen.scrollHeight;
}

function heroTypeText(text, onDone) {
  const screen = document.querySelector('[data-hero-screen]');
  if (!screen) return;
  const lineEl = document.createElement('div');
  lineEl.className = 'hero-term-line';
  lineEl.innerHTML = '<span class="hero-term-prompt">visiteur@linuxpath:~$</span><span class="hero-term-cmd"></span><span class="hero-term-cursor">&nbsp;</span>';
  screen.appendChild(lineEl);
  const cmdEl = lineEl.querySelector('.hero-term-cmd');
  const cursorEl = lineEl.querySelector('.hero-term-cursor');
  let i = 0;
  function tick() {
    if (heroInteractive) { if (onDone) onDone(); return; }
    if (i < text.length) {
      cmdEl.textContent += text[i];
      i += 1;
      heroSchedule(tick, HERO_TYPING_MS);
    } else {
      if (cursorEl && cursorEl.parentNode) cursorEl.parentNode.removeChild(cursorEl);
      if (onDone) onDone();
    }
  }
  tick();
}

function heroRenderInstant() {
  cleanHeroTimers();
  const screen = document.querySelector('[data-hero-screen]');
  if (!screen) return;
  screen.innerHTML = '';
  HERO_SCRIPT.forEach(function (entry) {
    const line = document.createElement('div');
    line.className = 'hero-term-line';
    line.innerHTML = '<span class="hero-term-prompt">visiteur@linuxpath:~$</span><span class="hero-term-cmd">' + escapeHtml(entry.cmd) + '</span>';
    screen.appendChild(line);
    entry.out.forEach(function (outText) {
      const out = document.createElement('div');
      out.className = 'hero-term-line hero-term-out';
      out.textContent = outText;
      screen.appendChild(out);
    });
  });
  screen.scrollTop = screen.scrollHeight;
}

function startHeroDemo() {
  cleanHeroTimers();
  const screen = document.querySelector('[data-hero-screen]');
  if (!screen) return;
  screen.innerHTML = '';
  let index = 0;
  function nextCommand() {
    if (heroInteractive) return;
    const entry = HERO_SCRIPT[index % HERO_SCRIPT.length];
    index += 1;
    heroTypeText(entry.cmd, function () {
      heroAppendOut(entry.out);
      heroSchedule(function () {
        if (heroInteractive) return;
        heroSchedule(nextCommand, HERO_BATCH_MS);
      }, HERO_PAUSE_MS);
    });
  }
  nextCommand();
}

function heroSwitchToInteractive() {
  heroInteractive = true;
  cleanHeroTimers();
  const screen = document.querySelector('[data-hero-screen]');
  if (screen) {
    screen.setAttribute('aria-hidden', 'false');
    screen.setAttribute('aria-live', 'polite');
    heroAppendLine('<span class="hero-term-cmd hero-term-note">Mode interactif — commandes démo : echo, whoami, help. Le vrai terminal vous attend dans les modules.</span>');
  }
}

function heroRunCommand(rawCmd) {
  const screen = document.querySelector('[data-hero-screen]');
  if (!screen) return;
  const cmd = (rawCmd || '').trim();
  heroAppendLine('<span class="hero-term-prompt">visiteur@linuxpath:~$</span><span class="hero-term-cmd">' + escapeHtml(cmd) + '</span>');
  if (!cmd) return;
  const base = cmd.split(/\s+/)[0];
  if (base === 'echo') {
    heroAppendOut([cmd.slice(4).trim()]);
  } else if (base === 'whoami') {
    heroAppendOut(['visiteur']);
  } else if (base === 'help') {
    heroAppendOut(['Commandes démo : echo, whoami, help.', 'Le vrai terminal s\'utilise dans les modules.']);
  } else if (base === 'clear') {
    screen.innerHTML = '';
  } else {
    heroAppendOut(['Commande "' + base + '" indisponible en démo — essayez : help.']);
  }
}

function formatTrackModuleRange(moduleIds) {
  const ids = Array.isArray(moduleIds) ? moduleIds.filter(Boolean) : [];
  if (!ids.length) return '';
  function label(id) {
    return String(id).toUpperCase();
  }
  if (ids.length === 1) return label(ids[0]);
  const allM = ids.every(function (id) { return /^m\d+$/i.test(id); });
  const allHw = ids.every(function (id) { return /^hw\d+$/i.test(id); });
  if (allM || allHw) return label(ids[0]) + ' à ' + label(ids[ids.length - 1]);
  if (/^cs\d+$/i.test(ids[0])) {
    const rest = ids.slice(1);
    if (rest.length >= 2 && rest.every(function (id) { return /^m\d+$/i.test(id); })) {
      return label(ids[0]) + ' + ' + label(rest[0]) + ' à ' + label(rest[rest.length - 1]);
    }
    return ids.map(label).join(' + ');
  }
  return ids.map(label).join(', ');
}

function getHomeProgressSnapshot() {
  const mods = getPublishedModuleIds();
  let totalItems = 0;
  let doneItems = 0;
  let completedMods = 0;
  let inProgress = null;
  let available = null;

  mods.forEach(function (mod) {
    const progress = getModuleProgress(mod);
    totalItems += progress.total;
    doneItems += progress.done;
    if (progress.state === 'passed' || progress.state === 'mastered') completedMods += 1;
    if (!state.unlockedModules.has(mod)) return;
    if (progress.state === 'in_progress' && !inProgress) inProgress = mod;
    if ((progress.state === 'available' || progress.state === 'in_progress') && !available) available = mod;
  });

  const pct = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0;
  const isReturning = doneItems > 0;
  const isComplete = isReturning
    && (
      (mods.length > 0 && completedMods === mods.length)
      || (totalItems > 0 && doneItems >= totalItems)
    )
    && !inProgress
    && !available;
  const resumeTarget = isComplete ? null : (inProgress || available || 'm1');
  const resumeLabel = resumeTarget && MODULE_META[resumeTarget] && MODULE_META[resumeTarget].title
    ? MODULE_META[resumeTarget].title
    : 'Module suivant';
  const resumeStatus = inProgress ? 'in_progress' : (available ? 'available' : (isComplete ? 'complete' : 'available'));

  return {
    mods: mods,
    totalItems: totalItems,
    doneItems: doneItems,
    completedMods: completedMods,
    pct: pct,
    isReturning: isReturning,
    isComplete: isComplete,
    resumeTarget: resumeTarget,
    resumeLabel: resumeLabel,
    resumeStatus: resumeStatus
  };
}

function getTrackResumeTarget(trackId) {
  const moduleIds = getTrackModuleIds(trackId);
  let inProgress = null;
  let available = null;
  moduleIds.forEach(function (mod) {
    if (!state.unlockedModules.has(mod)) return;
    const progress = getModuleProgress(mod);
    if (progress.state === 'in_progress' && !inProgress) inProgress = mod;
    if ((progress.state === 'available' || progress.state === 'in_progress') && !available) available = mod;
  });
  if (inProgress || available) return inProgress || available;
  const track = (typeof TRACKS !== 'undefined' ? TRACKS : []).find(function (entry) { return entry.id === trackId; });
  return (track && track.entryModule) || moduleIds[0] || null;
}

function renderHomeStatsRow(stats) {
  return ''
    + '<div class="lp-hero-stats" role="list" aria-label="Statistiques du parcours">'
    +   '<div role="listitem"><div class="lp-stat-num">' + stats.modules + '</div><div class="lp-stat-label">Modules</div></div>'
    +   '<div role="listitem"><div class="lp-stat-num">' + stats.lessons + '</div><div class="lp-stat-label">Leçons</div></div>'
    +   '<div role="listitem"><div class="lp-stat-num">' + stats.exercises + '</div><div class="lp-stat-label">Exercices</div></div>'
    +   '<div role="listitem"><div class="lp-stat-num">' + stats.questions + '</div><div class="lp-stat-label">Questions QCM</div></div>'
    +   '<div role="listitem"><div class="lp-stat-num" id="home-stat-challenges">' + stats.challenges + '</div><div class="lp-stat-label">Challenges CTF</div></div>'
    + '</div>';
}

function renderHomeNextActionCard(snapshot) {
  if (snapshot.isComplete) {
    return ''
      + '<section class="lp-home-next-card lp-home-next-card-complete" aria-label="Parcours terminé">'
      +   '<p class="lp-home-next-kicker">Parcours terminé</p>'
      +   '<h2 class="lp-home-next-title">Vous avez validé l’ensemble du programme publié</h2>'
      +   '<p class="lp-home-next-copy">Continuez avec la roadmap, la sandbox Linux ou les challenges CTF.</p>'
      +   '<div class="lp-home-next-actions">'
      +     '<button type="button" class="lp-cta-primary" data-action="navigate" data-target="roadmap">Ouvrir la roadmap</button>'
      +     '<button type="button" class="lp-cta-secondary" data-action="navigate" data-target="sandbox">Sandbox Linux</button>'
      +     '<button type="button" class="lp-cta-secondary" data-action="navigate" data-target="ctf">Challenges CTF</button>'
      +   '</div>'
      + '</section>';
  }

  const isInProgress = snapshot.resumeStatus === 'in_progress';
  const statusLabel = isInProgress ? 'Module en cours' : 'Prochaine étape';
  const buttonLabel = isInProgress
    ? 'Reprendre — ' + snapshot.resumeLabel
    : 'Commencer — ' + snapshot.resumeLabel;
  const copy = isInProgress
    ? 'Reprenez exactement là où votre progression s’est arrêtée.'
    : 'Passez au module suivant disponible de votre progression.';

  return ''
    + '<section class="lp-home-next-card" aria-label="Prochaine action">'
    +   '<p class="lp-home-next-kicker">' + escapeHtml(statusLabel) + '</p>'
    +   '<h2 class="lp-home-next-title">' + escapeHtml(snapshot.resumeLabel) + '</h2>'
    +   '<p class="lp-home-next-copy">' + escapeHtml(copy) + '</p>'
    +   '<div class="lp-home-next-actions">'
    +     '<button type="button" class="lp-cta-primary" data-action="navigate" data-target="' + escapeHtml(snapshot.resumeTarget) + '">' + escapeHtml(buttonLabel) + '</button>'
    +     '<button type="button" class="lp-cta-roadmap" data-action="navigate" data-target="roadmap">Roadmap</button>'
    +   '</div>'
    + '</section>';
}

function renderHomeDashboard(snapshot, stats) {
  if (!snapshot.isReturning) {
    return ''
      + '<div class="lp-hero lp-home-dashboard">'
      +   '<div class="lp-hero-main">'
      +     '<p class="lp-home-kicker">Formation Linux · open source · 100% français</p>'
      +     '<h1 class="lp-headline">Apprenez Linux de zéro à l’administration</h1>'
      +     '<p class="lp-sub">Un parcours progressif avec leçons, exercices, quiz et terminal intégré. Choisissez un chemin, avancez à votre rythme, sans rien installer.</p>'
      +     '<div class="lp-cta-row">'
      +       '<button type="button" class="lp-cta-primary" data-action="scroll-to" data-scroll-target="track-picker">Choisir mon parcours</button>'
      +       '<button type="button" class="lp-cta-secondary" data-action="scroll-to" data-scroll-target="lp-modules">Voir les modules</button>'
      +     '</div>'
      +     renderHomeStatsRow(stats)
      +   '</div>'
      +   '<aside class="hero-terminal-host lp-hero-terminal-secondary" data-hero-terminal-host aria-label="Démonstration du terminal"></aside>'
      + '</div>';
  }

  const title = snapshot.isComplete
    ? 'Parcours terminé'
    : 'Continuez votre progression';
  const lead = snapshot.isComplete
    ? 'Vous avez complété les modules publiés. Explorez la suite ou révisez via la roadmap.'
    : 'Voici où vous en êtes et la prochaine action utile.';

  return ''
    + '<div class="lp-hero lp-hero-returning lp-home-dashboard">'
    +   '<div class="lp-hero-main">'
    +     '<p class="lp-home-kicker">Votre parcours</p>'
    +     '<h1 class="lp-headline">' + title + '</h1>'
    +     '<p class="lp-sub">' + lead + '</p>'
    +     '<div class="lp-home-summary" role="group" aria-label="Résumé de progression">'
    +       '<div class="lp-home-summary-item">'
    +         '<div class="lp-home-summary-value">' + snapshot.pct + '%</div>'
    +         '<div class="lp-home-summary-label">Progression globale</div>'
    +       '</div>'
    +       '<div class="lp-home-summary-item">'
    +         '<div class="lp-home-summary-value">' + snapshot.completedMods + '/' + snapshot.mods.length + '</div>'
    +         '<div class="lp-home-summary-label">Modules terminés</div>'
    +       '</div>'
    +       '<div class="lp-home-summary-item">'
    +         '<div class="lp-home-summary-value">' + snapshot.doneItems + '/' + snapshot.totalItems + '</div>'
    +         '<div class="lp-home-summary-label">Éléments réalisés</div>'
    +       '</div>'
    +     '</div>'
    +     '<div class="lp-return-progress-wrap">'
    +       '<div class="lp-return-progress-bar" aria-hidden="true"><div class="lp-return-progress-fill" style="width:' + snapshot.pct + '%"></div></div>'
    +       '<span class="lp-return-progress-label">' + snapshot.pct + '%</span>'
    +     '</div>'
    +     renderHomeNextActionCard(snapshot)
    +     '<div class="lp-cta-row lp-home-secondary-actions">'
    +       '<button type="button" class="lp-cta-secondary" data-action="scroll-to" data-scroll-target="track-picker">Voir les parcours</button>'
    +       '<button type="button" class="lp-cta-secondary" data-action="scroll-to" data-scroll-target="lp-modules">Voir les modules</button>'
    +     '</div>'
    +   '</div>'
    +   '<aside class="hero-terminal-host lp-hero-terminal-secondary" data-hero-terminal-host aria-label="Démonstration du terminal"></aside>'
    + '</div>';
}

function renderTrackPicker(snapshot, stats) {
  const grid = document.querySelector('#track-picker .track-grid');
  if (!grid || !Array.isArray(TRACKS) || !TRACKS.length) {
    document.querySelectorAll('.track-card[data-track]').forEach(function (card) {
      const trackStats = stats.tracks && stats.tracks[card.dataset.track];
      const meta = card.querySelector('[data-track-meta]') || card.querySelector('h3 + p');
      if (!trackStats || !meta) return;
      meta.textContent = meta.textContent.replace(/~\d+\s*h/, '~' + trackStats.estimatedHours + ' h');
    });
    return;
  }

  const sectionLabel = document.querySelector('#track-picker .lp-section-label');
  const sectionTitle = document.querySelector('#track-picker .lp-section-title');
  if (sectionLabel) sectionLabel.textContent = 'Parcours';
  if (sectionTitle) {
    sectionTitle.textContent = snapshot.isReturning
      ? 'Progression par parcours'
      : 'Quatre parcours pour démarrer';
  }

  grid.innerHTML = TRACKS.map(function (track) {
    const trackStats = stats.tracks && stats.tracks[track.id] ? stats.tracks[track.id] : { estimatedHours: track.estimatedHours || 0, moduleCount: (track.modules || []).length };
    const progress = typeof getTrackProgress === 'function' ? getTrackProgress(track.id) : { done: 0, total: 0, pct: 0 };
    const moduleIds = Array.isArray(track.modules) ? track.modules : getTrackModuleIds(track.id);
    const completedOnTrack = moduleIds.filter(function (mod) {
      const stateName = getModuleProgress(mod).state;
      return stateName === 'passed' || stateName === 'mastered';
    }).length;
    const range = formatTrackModuleRange(moduleIds);
    const objective = Array.isArray(track.objectives) && track.objectives.length ? track.objectives[0] : '';
    const hours = trackStats.estimatedHours;
    const resumeTarget = getTrackResumeTarget(track.id);
    const hasStarted = progress.done > 0;
    const trackComplete = progress.total > 0 && progress.done >= progress.total;
    let actionHtml = '';

    if (trackComplete) {
      actionHtml = '<button type="button" class="lp-cta-secondary" id="track-' + escapeHtml(track.id) + '-enter" data-action="navigate" data-target="' + escapeHtml(resumeTarget || track.entryModule || '') + '">Revoir le parcours</button>';
    } else if (hasStarted && resumeTarget) {
      const label = 'Reprendre';
      actionHtml = '<button type="button" class="lp-cta-primary" id="track-' + escapeHtml(track.id) + '-enter" data-action="navigate" data-target="' + escapeHtml(resumeTarget) + '">' + label + '</button>';
    } else {
      const startLabel = track.id === 'linux' ? 'Commencer ici' : 'Entrer dans ce parcours';
      actionHtml = '<button type="button" class="' + (track.id === 'linux' ? 'lp-cta-primary' : 'lp-cta-secondary') + '" id="track-' + escapeHtml(track.id) + '-enter" data-action="enter-track" data-track="' + escapeHtml(track.id) + '">' + startLabel + '</button>';
    }

    return ''
      + '<article class="track-card' + (hasStarted ? ' track-card-active' : '') + (trackComplete ? ' track-card-complete' : '') + '" data-track="' + escapeHtml(track.id) + '">'
      +   '<div class="track-card-top">'
      +     '<div class="track-level">' + escapeHtml(track.level || '') + '</div>'
      +     (hasStarted ? '<div class="track-progress-badge" aria-label="Progression du parcours : ' + progress.pct + ' %">' + progress.pct + '%</div>' : '')
      +   '</div>'
      +   '<h3>' + escapeHtml(track.title || track.id) + '</h3>'
      +   '<p class="track-meta" data-track-meta">' + escapeHtml(range) + ' · ~' + hours + ' h · ' + moduleIds.length + ' module' + (moduleIds.length > 1 ? 's' : '') + '</p>'
      +   (hasStarted
        ? '<div class="track-progress-wrap"><div class="track-progress-bar" aria-hidden="true"><div class="track-progress-fill" style="width:' + progress.pct + '%"></div></div><p class="track-progress-copy">' + completedOnTrack + '/' + moduleIds.length + ' modules terminés · ' + progress.done + '/' + progress.total + ' éléments</p></div>'
        : (objective
          ? '<p class="track-objective">' + escapeHtml(objective) + '</p>'
            + (Array.isArray(track.objectives) && track.objectives.length > 1
              ? '<ul class="track-objectives">' + track.objectives.slice(1, 3).map(function (item) { return '<li>' + escapeHtml(item) + '</li>'; }).join('') + '</ul>'
              : '')
          : ''))
      +   actionHtml
      + '</article>';
  }).join('');
}

function renderHome() {
  const el = document.getElementById('home-hero');
  if (!el) return;

  const stats = getCurriculumStats();
  const snapshot = getHomeProgressSnapshot();
  const homeModulesTitle = document.getElementById('home-modules-title');
  if (homeModulesTitle) homeModulesTitle.textContent = 'Les ' + snapshot.mods.length + ' modules';

  el.innerHTML = renderHomeDashboard(snapshot, stats);
  renderTrackPicker(snapshot, stats);
  renderHeroTerminal();
}
