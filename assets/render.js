/* ============================================================
   LESSON RENDERING
   ============================================================ */
function renderLessons() {
  ['m1','m2','m3','m4','m5','m6','m7','m8','m9','m10','m11','m12','m13','m14'].forEach(mod => {
    const container = document.getElementById('lessons-' + mod);
    if (!container) return;
    container.innerHTML = '';
    LESSONS[mod].forEach((lesson, i) => {
      const card = document.createElement('div');
      card.className = 'lesson-card' + (state.lessonsDone.has(lesson.id) ? ' completed' : '');
      card.id = 'lesson-card-' + lesson.id;
      card.innerHTML = `
        <div class="lesson-header" onclick="toggleLesson('${lesson.id}')">
          <span class="lesson-num">${String(i+1).padStart(2,'0')}</span>
          <span class="lesson-title">${lesson.title}</span>
          <span class="lesson-toggle">▼</span>
        </div>
        <div class="lesson-body">
          <div class="lesson-content">${lesson.content}</div>
          <button class="lesson-done-btn ${state.lessonsDone.has(lesson.id) ? 'done' : ''}" id="done-btn-${lesson.id}" onclick="markLessonDone('${lesson.id}')">
            ${state.lessonsDone.has(lesson.id) ? '✓ Leçon terminée' : '✓ Marquer comme terminée'}
          </button>
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
}

async function markLessonDone(id) {
  if (state.lessonsDone.has(id)) return;
  state.lessonsDone.add(id);
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

/* ============================================================
   EXERCISE RENDERING
   ============================================================ */
function renderExercises() {
  ['m1','m2','m3','m4','m5','m6','m7','m8','m9','m10','m11','m12','m13','m14'].forEach(mod => {
    const container = document.getElementById('exercises-' + mod);
    if (!container) return;
    container.innerHTML = '';
    (EXERCISES[mod] || []).forEach((ex, i) => {
      const card = document.createElement('div');
      card.className = 'exercise-card' + (state.exercisesDone.has(ex.id) ? ' solved' : '');
      card.id = 'ex-card-' + ex.id;
      card.innerHTML = `
        <div class="exercise-header">
          <div class="exercise-title">
            <span>${i+1}. ${ex.title}</span>
          </div>
          <span class="exercise-badge ${state.exercisesDone.has(ex.id) ? 'solved' : ''}" id="ex-badge-${ex.id}">
            ${state.exercisesDone.has(ex.id) ? '✓ Résolu' : 'Exercice'}
          </span>
        </div>
        <div class="exercise-desc">${ex.desc}</div>
        <div class="exercise-input-row">
          <span class="exercise-prompt">user@linux:~$</span>
          <input type="text" class="exercise-input" id="ex-input-${ex.id}" 
            placeholder="tapez votre commande..." 
            ${state.exercisesDone.has(ex.id) ? 'disabled' : ''}
            onkeydown="if(event.key==='Enter') checkExercise('${ex.id}', '${mod}')">
          <button class="btn-check" onclick="checkExercise('${ex.id}', '${mod}')" ${state.exercisesDone.has(ex.id) ? 'disabled' : ''}>Vérifier</button>
          <button class="btn-hint" onclick="showHint('${ex.id}')">💡 Indice</button>
        </div>
        <div class="hint-box" id="hint-${ex.id}"></div>
        <div class="exercise-feedback" id="feedback-${ex.id}"></div>
      `;
      container.appendChild(card);
    });
  });
}

const hintLevels = {};

function showHint(exId) {
  const ex = findExercise(exId);
  if (!ex) return;
  const current = hintLevels[exId] || 0;
  const next = Math.min(current + 1, ex.hints.length);
  hintLevels[exId] = next;
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
  const ex = findExercise(exId);
  if (!ex) return;
  if (state.exercisesDone.has(exId)) return;

  const input = document.getElementById('ex-input-' + exId);
  const feedback = document.getElementById('feedback-' + exId);
  if (!input || !feedback) return;

  /**
   * normalizeCmd : prépare une commande pour la comparaison
   *  - met en minuscules
   *  - réduit les espaces multiples en un seul
   *  - supprime les guillemets simples/doubles autour des arguments
   *    (ex: grep -i "error" → grep -i error)
   */
  function normalizeCmd(s) {
    return s
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')                  // espaces multiples → un seul
      .replace(/"([^"]*)"/g, '$1')           // retire les guillemets doubles
      .replace(/'([^']*)'/g, '$1');          // retire les guillemets simples
  }

  /**
   * sortFlags : trie les caractères dans les flags combinés COURTS et purement alphabétiques
   *  (ex: -la → -al, -al → -al)
   * Permet d'accepter 'ls -al' autant que 'ls -la'.
   * Les mots-clés d'options (comme -type, -perm, -name) sont préservés intacts.
   */
  const PRESERVED_FLAGS = new Set([
    'type','perm','name','user','group','exec','mtime','atime','ctime','size',
    'depth','maxdepth','mindepth','noall','answer','ignore','case','nocase',
    'color','colour','print','delete','regex','path','ipath','newer','empty',
    'readable','writable','executable','links','nolinks','mount','follow'
  ]);
  function sortFlags(cmd) {
    return cmd.replace(/(?<!\w)-([a-zA-Z]{2,})/g, (match, flags) => {
      // Préserver les mots-clés et les flags longs (>4 chars) ou mixtes
      if (PRESERVED_FLAGS.has(flags.toLowerCase()) || flags.length > 4 || !/^[a-zA-Z]+$/.test(flags)) {
        return match;
      }
      return '-' + flags.toLowerCase().split('').sort().join('');
    });
  }

  /**
   * normalizeForCompare : normalisation complète pour la comparaison finale
   */
  function normalizeForCompare(s) {
    return sortFlags(normalizeCmd(s));
  }

  const val = normalizeForCompare(input.value);
  const accepted = ex.accepted.map(a => normalizeForCompare(a));

  // Comparaison stricte après normalisation complète
  const isCorrect = accepted.some(a => val === a);

  if (isCorrect) {
    // Correct !
    state.exercisesDone.add(exId);
    await saveState();
    feedback.className = 'exercise-feedback success';
    feedback.textContent = '✓ Bravo ! Commande correcte. Exercice validé.';
    input.disabled = true;
    document.querySelector(`[onclick="checkExercise('${exId}', '${mod}')"]`).disabled = true;
    updateProgressUI();
    // Exécuter aussi dans le terminal pour afficher le résultat
    processTerminalCommand(input.value.trim());
  } else {
    feedback.className = 'exercise-feedback error';
    feedback.textContent = '✗ Commande incorrecte. Vérifiez la syntaxe ou utilisez un indice.';
    input.focus();
    input.select();
  }
}

/* ============================================================
   QUIZ RENDERING
   ============================================================ */
function renderQuizzes() {
  ['m1','m2','m3','m4','m5','m6','m7','m8','m9','m10','m11','m12','m13','m14'].forEach(mod => {
    const container = document.getElementById('quiz-' + mod);
    if (!container) return;
    const quiz = QUIZZES[mod];
    const prevScore = state.quizScores[mod];

    container.innerHTML = '';
    const card = document.createElement('div');
    card.className = 'quiz-card';
    card.id = 'quiz-card-' + mod;

    if (prevScore !== undefined) {
      const pass = prevScore >= 3;
      card.innerHTML = `
        <div class="quiz-start">
          <h3>${quiz.title}</h3>
          <p>Score précédent : <strong>${prevScore}/5</strong> ${pass ? '— Réussi ✓' : '— À recommencer'}</p>
          <button class="btn-start-quiz" onclick="startQuiz('${mod}')">Recommencer le quiz</button>
        </div>
        <div class="quiz-body" id="quiz-body-${mod}"></div>
        <div class="quiz-result" id="quiz-result-${mod}"></div>
      `;
    } else {
      card.innerHTML = `
        <div class="quiz-start">
          <h3>${quiz.title}</h3>
          <p>5 questions à choix multiples. Score minimum : 3/5 pour déverrouiller le module suivant.</p>
          <button class="btn-start-quiz" onclick="startQuiz('${mod}')">▶ Commencer le quiz</button>
        </div>
        <div class="quiz-body" id="quiz-body-${mod}"></div>
        <div class="quiz-result" id="quiz-result-${mod}"></div>
      `;
    }
    container.appendChild(card);
  });
}

const quizState = {}; // { m1: { currentQ: 0, score: 0, answered: [] } }

function startQuiz(mod) {
  const quiz = QUIZZES[mod];
  quizState[mod] = { currentQ: 0, score: 0, answered: [] };
  const card = document.getElementById('quiz-card-' + mod);
  card.querySelector('.quiz-start').style.display = 'none';
  const result = document.getElementById('quiz-result-' + mod);
  result.classList.remove('visible');
  showQuestion(mod);
}

function showQuestion(mod) {
  const quiz = QUIZZES[mod];
  const qs = quizState[mod];
  const q = quiz.questions[qs.currentQ];
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
    <div class="quiz-question">${q.q}</div>
    <div class="quiz-options" id="quiz-opts-${mod}">
      ${q.options.map((opt, i) => `
        <div class="quiz-option" id="quiz-opt-${mod}-${i}" onclick="selectOption('${mod}', ${i})">
          <span class="quiz-option-letter">${letters[i]}</span>
          <span>${opt}</span>
        </div>
      `).join('')}
    </div>
    <div class="quiz-explanation" id="quiz-expl-${mod}">${q.expl}</div>
    <button class="btn-next-q" id="quiz-next-${mod}" onclick="nextQuestion('${mod}')">
      ${qs.currentQ < quiz.questions.length - 1 ? 'Question suivante →' : 'Voir les résultats →'}
    </button>
  `;
}

function selectOption(mod, idx) {
  const quiz = QUIZZES[mod];
  const qs = quizState[mod];
  if (!qs || qs.answered[qs.currentQ] !== undefined) return;

  qs.answered[qs.currentQ] = idx;
  const correct = quiz.questions[qs.currentQ].correct;
  const isCorrect = idx === correct;
  if (isCorrect) qs.score++;

  quiz.questions[qs.currentQ].options.forEach((_, i) => {
    const opt = document.getElementById('quiz-opt-' + mod + '-' + i);
    if (!opt) return;
    opt.classList.add('disabled');
    if (i === correct) opt.classList.add('correct');
    else if (i === idx && !isCorrect) opt.classList.add('wrong');
  });

  const expl = document.getElementById('quiz-expl-' + mod);
  if (expl) {
    expl.classList.add('visible');
    expl.innerHTML = '<span style="color:' + (isCorrect ? 'var(--accent-green)' : 'var(--accent-red)') + ';">' + (isCorrect ? '✓ Correct !' : '✗ Incorrect.') + '</span> ' + quiz.questions[qs.currentQ].expl;
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
  const pass = score >= 3;

  state.quizScores[mod] = score;
  if (pass) {
    const modules = ['m1','m2','m3','m4','m5','m6','m7','m8','m9','m10','m11','m12','m13','m14'];
    const idx = modules.indexOf(mod);
    if (idx < modules.length - 1) state.unlockedModules.add(modules[idx + 1]);
    state.unlockedModules.add(mod);
  }
  await saveState();
  updateProgressUI();

  const body = document.getElementById('quiz-body-' + mod);
  if (body) { body.classList.remove('visible'); body.innerHTML = ''; }

  const result = document.getElementById('quiz-result-' + mod);
  if (!result) return;
  result.classList.add('visible');

  const stars = score >= 5 ? '⭐⭐⭐' : score >= 3 ? '⭐⭐' : '⭐';
  const msgs = ['Relisez les leçons et réessayez.', 'Continuez à réviser, vous pouvez le faire !', 'Pas mal, mais retentez pour valider.', 'Bien joué ! Module déverrouillé.', 'Excellent ! Presque parfait.', 'Parfait ! Vous maîtrisez ce module.'];
  const nextMod = getNextMod(mod);

  result.innerHTML = '<div class="quiz-result-inner ' + (pass ? 'pass' : 'fail') + '">'
    + '<div class="quiz-result-stars">' + stars + '</div>'
    + '<div class="quiz-result-score">' + score + '<span>/5</span></div>'
    + '<div class="quiz-result-msg">' + (msgs[score] || '') + '</div>'
    + (pass ? '<div class="quiz-unlock-msg">🔓 Module suivant déverrouillé !</div>' : '')
    + '<div class="quiz-result-actions">'
    + '<button class="btn-start-quiz" onclick="startQuiz(\'' + mod + '\')">Recommencer</button>'
    + (pass && mod !== 'm8' ? '<button class="btn-start-quiz" style="background:var(--accent-blue-dim);margin-left:8px" onclick="navigateTo(\'' + nextMod + '\')">Module suivant →</button>' : '')
    + '</div></div>';
}

function getNextMod(mod) {
  const mods = ['m1','m2','m3','m4','m5','m6','m7','m8','m9','m10','m11','m12','m13','m14'];
  const idx = mods.indexOf(mod);
  return idx < mods.length - 1 ? mods[idx + 1] : mod;
}

/* ============================================================
   OVERVIEW CARDS
   ============================================================ */
function renderOverviewCards() {
  const grid = document.getElementById('modules-overview-grid');
  if (!grid) return;
  const mods = ['m1','m2','m3','m4','m5','m6','m7','m8'];
  const icons = ['🐧','🔒','👤','🌐','📜','⚙️','🔍','🐙'];
  const nums = ['01','02','03','04','05','06','07','08'];
  // M9 affiché séparément dans la section réseau (pas dans la grid Linux)
  grid.innerHTML = '';
  mods.forEach(function(mod, i) {
    const meta = MODULE_META[mod];
    const unlocked = state.unlockedModules.has(mod);
    const mp = getModuleProgress(mod);
    const pct = mp.pct;
    const card = document.createElement('div');
    card.className = 'module-overview-card' + (!unlocked ? ' locked' : '');
    card.innerHTML = '<div class="mod-card-num">' + nums[i] + '</div>'
      + '<div class="mod-card-icon">' + icons[i] + '</div>'
      + '<h3 class="mod-card-title">' + meta.title + '</h3>'
      + '<p class="mod-card-desc">' + meta.desc + '</p>'
      + '<div class="mod-card-progress"><div class="mod-card-progress-bar"><div class="mod-card-progress-fill" style="width:' + pct + '%"></div></div><span class="mod-card-pct">' + pct + '%</span></div>'
      + (unlocked
        ? '<button class="mod-card-btn" onclick="navigateTo(\'' + mod + '\')">Commencer <span class="arrow">→</span></button>'
        : '<div class="mod-card-locked-msg">🔒 Réussissez le quiz précédent pour débloquer</div>');
    grid.appendChild(card);
  });
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
  const map = { critical: 'Critique', high: 'Élevé', medium: 'Moyen', info: 'Info' };
  return map[sev] || sev;
}

function formatNewsDate(dateStr) {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch(e) { return dateStr; }
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
      ? `<span class="news-tag" style="color:var(--accent-orange);border-color:rgba(255,166,87,0.3)">${n.cve}</span>`
      : '';
    const tagsHtml = n.tags
      ? n.tags.map(t => `<span class="news-tag">${t}</span>`).join('')
      : '';
    return `
      <div class="news-card" data-severity="${n.severity}" data-id="${n.id}">
        <div class="news-card-top">
          <div class="news-card-title">${n.title}</div>
          <div class="news-card-badges">
            <span class="news-sev-badge ${n.severity}">${sevLabel(n.severity)}</span>
            ${cvssHtml}
          </div>
        </div>
        <div class="news-card-meta">
          <span class="news-card-date">📅 ${formatNewsDate(n.date)}</span>
          <span class="news-card-source">⌂ ${n.source_label}</span>
        </div>
        <div class="news-tags">${cveHtml}${tagsHtml}</div>
        <div class="news-card-summary">${n.summary}</div>
        <div class="news-card-context">${n.context}</div>
        <div class="news-card-footer">
          <a href="${n.source_url}" target="_blank" rel="noopener noreferrer" class="news-source-link">
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
  });
  if (btn) {
    if (filter === 'all') btn.classList.add('active');
    else if (filter === 'critical') btn.classList.add('active-critical');
    else if (filter === 'high') btn.classList.add('active-high');
    else if (filter === 'medium') btn.classList.add('active-medium');
    else if (filter === 'info') btn.classList.add('active-info');
    else btn.classList.add('active');
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
        <button class="lp-error-retry" onclick="loadNews()">↺ Réessayer</button>
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
        <button class="lp-error-retry" onclick="loadCheatsheet()">↺ Réessayer</button>
      </div>`;
  }
}

function buildCheatsheetFilters() {
  const container = document.getElementById('cheatsheet-filters');
  if (!container) return;

  // Keep the "Tout" button, add one per category
  let html = '<button class="cheatsheet-filter-btn active" data-cat="all" onclick="filterCheatsheetCat(\'all\', this)">Tout</button>';
  _cheatsheetData.forEach(cat => {
    html += `<button class="cheatsheet-filter-btn" data-cat="${cat.id}" onclick="filterCheatsheetCat('${cat.id}', this)">${cat.icon} ${cat.label}</button>`;
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
            <div class="cheatsheet-cmd-card" onclick="copyCmd('${escapeAttr(cmd.example)}')" title="Cliquer pour copier">
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

function copyCmd(text) {
  navigator.clipboard.writeText(text).then(() => {
    showCheatsheetToast();
  }).catch(() => {
    // Fallback for older browsers
    const el = document.createElement('textarea');
    el.value = text;
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    showCheatsheetToast();
  });
}

function showCheatsheetToast() {
  const toast = document.getElementById('cheatsheet-toast');
  if (!toast) return;
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
        <button class="lp-error-retry" onclick="loadGlossary()">↺ Réessayer</button>
      </div>`;
  }
}

function buildGlossaryAlphaNav() {
  const nav = document.getElementById('glossary-alpha-nav');
  if (!nav) return;
  const letters = [...new Set(_glossaryData.map(t => t.letter))].sort();
  let html = '<button class="glossary-alpha-btn active" data-letter="all" onclick="filterGlossaryLetter(\'all\', this)">Tout</button>';
  letters.forEach(l => {
    html += `<button class="glossary-alpha-btn" data-letter="${l}" onclick="filterGlossaryLetter('${l}', this)">${l}</button>`;
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

// Counts per module (matches data/lessons.json, exercises.json, quizzes.json)
const MODULE_COUNTS = {
  m1: { lessons: 4,  exercises: 3, quizzes: 2 },
  m2: { lessons: 5,  exercises: 2, quizzes: 2 },
  m3: { lessons: 4,  exercises: 2, quizzes: 2 },
  m4: { lessons: 5,  exercises: 2, quizzes: 2 },
  m5: { lessons: 5,  exercises: 2, quizzes: 2 },
  m6: { lessons: 5,  exercises: 2, quizzes: 2 },
  m7: { lessons: 5,  exercises: 3, quizzes: 2 },
  m8: { lessons: 10, exercises: 4, quizzes: 2 },
  m9: { lessons: 3,  exercises: 2, quizzes: 1 },
  m10: { lessons: 3,  exercises: 2, quizzes: 1 },
  m11: { lessons: 2,  exercises: 2, quizzes: 1 },
  m12: { lessons: 3,  exercises: 2, quizzes: 1 },
  m13: { lessons: 3,  exercises: 2, quizzes: 1 },
  m14: { lessons: 2,  exercises: 2, quizzes: 1 }
};

const MODULE_ICONS = {
  m1: '🐧', m2: '📁', m3: '👤',
  m4: '🌐', m5: '📝', m6: '⚙️',
  m7: '🛡️', m8: '🐳', m9: '🔑', m10: '🌐', m11: '🛡️',
  m12: '🕵', m13: '⚔️', m14: '🧬'
};

const BONUS_SECTIONS = [
  { target: 'sandbox',    icon: '💻', label: 'Sandbox Linux',      desc: 'Terminal Alpine réel via WebAssembly' },
  { target: 'ctf',        icon: '🚩', label: 'Challenges CTF',     desc: '6 challenges d\'investigation' },
  { target: 'cheatsheet', icon: '📋', label: 'Cheatsheet',         desc: '118 commandes de référence' },
  { target: 'glossary',   icon: '📖', label: 'Glossaire',          desc: '74 termes expliqués en français' },
  { target: 'news',       icon: '📰', label: 'Actualités Cyber',   desc: 'Veille cybersécurité — mai 2026' }
];

function renderRoadmap() {
  renderRoadmapSummary();
  renderRoadmapTimeline();
  renderRoadmapBonus();
}

function renderRoadmapSummary() {
  const el = document.getElementById('roadmap-summary');
  if (!el) return;

  const mods = ['m1','m2','m3','m4','m5','m6','m7','m8','m9','m10','m11','m12','m13','m14'];

  // Compute totals
  let totalLessons = 0, doneLessons = 0;
  let totalExercises = 0, doneExercises = 0;
  let totalQuizzes = 0, doneQuizzes = 0;
  let completedModules = 0;

  mods.forEach(m => {
    const counts = MODULE_COUNTS[m];
    totalLessons   += counts.lessons;
    totalExercises += counts.exercises;
    totalQuizzes   += counts.quizzes;

    // Count done items for this module
    const lessonsDone = [...state.lessonsDone].filter(id => id.startsWith(m + '-')).length;
    const exDone      = [...state.exercisesDone].filter(id => id.startsWith(m + '-')).length;
    const quizDone    = state.quizScores[m] !== undefined ? counts.quizzes : 0;

    doneLessons   += Math.min(lessonsDone, counts.lessons);
    doneExercises += Math.min(exDone, counts.exercises);
    doneQuizzes   += quizDone;

    // Module fully completed = all lessons + all exercises + quiz done
    if (
      lessonsDone >= counts.lessons &&
      exDone      >= counts.exercises &&
      state.quizScores[m] !== undefined
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

  const linuxMods = ['m1','m2','m3','m4','m5','m6','m7','m8'];
  const networkMods = ['m9','m10','m11'];
  const offsecMods = ['m12','m13','m14'];
  let html = '';

  html += '<div class="roadmap-section-label">Modules Linux</div>';

  function renderNode(m, globalIdx, modsArr, localIdx) {
    const meta   = MODULE_META[m];
    const counts = MODULE_COUNTS[m];
    const icon   = MODULE_ICONS[m];
    const num    = String(globalIdx + 1).padStart(2, '0');
    const isLastInSection = localIdx === modsArr.length - 1;

    const lessonsDone = [...state.lessonsDone].filter(id => id.startsWith(m + '-')).length;
    const exDone      = [...state.exercisesDone].filter(id => id.startsWith(m + '-')).length;
    const quizDone    = state.quizScores[m] !== undefined;

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
          <button class="roadmap-node-btn ${isLocked ? 'btn-locked' : ''}" ${btnDisabled} onclick="navigateTo('${m}')">${btnLabel}</button>
        </div>
      </div>`;
  }

  linuxMods.forEach((m, i) => renderNode(m, i, linuxMods, i));

  html += '<div class="roadmap-section-label" style="margin-top:2.5rem;">Réseau & Services</div>';

  networkMods.forEach((m, i) => renderNode(m, i + 8, networkMods, i));

  html += '<div class="roadmap-section-label" style="margin-top:2.5rem;">Sécurité offensive</div>';

  offsecMods.forEach((m, i) => renderNode(m, i + 11, offsecMods, i));

  el.innerHTML = html;
}

function renderRoadmapBonus() {
  const el = document.getElementById('roadmap-bonus-grid');
  if (!el) return;

  el.innerHTML = BONUS_SECTIONS.map(s => `
    <div class="roadmap-bonus-card" onclick="navigateTo('${s.target}')">
      <div class="roadmap-bonus-icon">${s.icon}</div>
      <div class="roadmap-bonus-label">${escapeHtml(s.label)}</div>
      <div class="roadmap-bonus-desc">${escapeHtml(s.desc)}</div>
    </div>
  `).join('');
}

/* ============================================================
   HOME — Hero dynamique (retour vs nouveau)
   ============================================================ */

/* ============================================================
   HOME — Hero dynamique (retour vs nouveau)
   ============================================================ */

function renderHome() {
  const el = document.getElementById('home-hero');
  if (!el) return;

  // Compute global progress (modules Linux m1-m8 uniquement pour le hero)
  const mods = ['m1','m2','m3','m4','m5','m6','m7','m8'];
  let totalItems = 0, doneItems = 0, completedMods = 0;

  mods.forEach(m => {
    const c = MODULE_COUNTS[m];
    totalItems += c.lessons + c.exercises + c.quizzes;
    const ld = [...state.lessonsDone].filter(id => id.startsWith(m + '-')).length;
    const ed = [...state.exercisesDone].filter(id => id.startsWith(m + '-')).length;
    const qd = state.quizScores[m] !== undefined ? c.quizzes : 0;
    doneItems += Math.min(ld, c.lessons) + Math.min(ed, c.exercises) + qd;
    if (ld >= c.lessons && ed >= c.exercises && state.quizScores[m] !== undefined) completedMods++;
  });

  const pct = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0;
  const isReturning = doneItems > 0;

  // Find next unlocked module in progress
  let resumeTarget = 'm1';
  for (const m of mods) {
    if (state.unlockedModules.has(m)) {
      const c = MODULE_COUNTS[m];
      const ld = [...state.lessonsDone].filter(id => id.startsWith(m + '-')).length;
      const ed = [...state.exercisesDone].filter(id => id.startsWith(m + '-')).length;
      if (ld < c.lessons || ed < c.exercises || state.quizScores[m] === undefined) {
        resumeTarget = m;
        break;
      }
    }
  }
  const resumeLabel = (MODULE_META[resumeTarget] && MODULE_META[resumeTarget].title)
    ? MODULE_META[resumeTarget].title
    : 'Module suivant';

  if (isReturning) {
    // ---- RETURNING USER ----
    el.innerHTML = `
      <div class="lp-hero lp-hero-returning">
        <div class="lp-hero-returning-top">
          <div class="lp-return-badge">
            <span class="lp-return-dot"></span>
            Bon retour sur LinuxPath
          </div>
          <div class="lp-return-stats">
            <div class="lp-return-stat">
              <div class="lp-return-stat-num" style="color:var(--accent-green)">${pct}%</div>
              <div class="lp-return-stat-label">Accompli</div>
            </div>
            <div class="lp-return-stat">
              <div class="lp-return-stat-num" style="color:var(--accent-blue)">${completedMods}/${mods.length}</div>
              <div class="lp-return-stat-label">Modules</div>
            </div>
            <div class="lp-return-stat">
              <div class="lp-return-stat-num" style="color:var(--accent-purple)">${doneItems}</div>
              <div class="lp-return-stat-label">Éléments faits</div>
            </div>
          </div>
        </div>

        <div class="lp-return-progress-wrap">
          <div class="lp-return-progress-bar">
            <div class="lp-return-progress-fill" style="width:${pct}%"></div>
          </div>
          <span class="lp-return-progress-label">${pct}% du parcours complété</span>
        </div>

        <h1 class="lp-headline" style="margin-top:28px">
          ${pct === 100
            ? 'Félicitations, parcours <em>terminé</em> !'
            : pct >= 50
              ? 'Tu es à <em>mi-chemin</em>. Continue !'
              : 'Tu progresses bien.<br>La suite t\'attend.'}
        </h1>

        <div class="lp-cta-row" style="margin-top:24px">
          <button class="lp-cta-primary" onclick="navigateTo('${resumeTarget}')">
            ▶ Reprendre — ${escapeHtml(resumeLabel)}
          </button>
          <button class="lp-cta-roadmap" onclick="navigateTo('roadmap')">🗺️ Ma progression</button>
          <button class="lp-cta-secondary" onclick="document.getElementById('lp-modules').scrollIntoView({behavior:'smooth'})">Voir les modules</button>
        </div>
      </div>`;
  } else {
    // ---- NEW USER ----
    el.innerHTML = `
      <div class="lp-hero">
        <div class="lp-badge">$ open-source · gratuit · 100% français</div>
        <h1 class="lp-headline">Apprenez <em>Linux</em><br>de zéro à l'administration.</h1>
        <p class="lp-sub">9 modules, exercices pratiques, quiz de validation et un vrai terminal Linux dans votre navigateur — sans rien installer.</p>
        <div class="lp-cta-row">
          <button class="lp-cta-primary" onclick="navigateTo('m1')">▶ Commencer gratuitement</button>
          <button class="lp-cta-secondary" onclick="document.getElementById('lp-modules').scrollIntoView({behavior:'smooth'})">Voir les modules</button>
        </div>
        <div class="lp-hero-stats">
          <div><div class="lp-stat-num">9</div><div class="lp-stat-label">Modules</div></div>
          <div><div class="lp-stat-num">48</div><div class="lp-stat-label">Leçons</div></div>
          <div><div class="lp-stat-num">23</div><div class="lp-stat-label">Exercices</div></div>
          <div><div class="lp-stat-num">45</div><div class="lp-stat-label">Questions QCM</div></div>
          <div><div class="lp-stat-num">6</div><div class="lp-stat-label">Challenges CTF</div></div>
        </div>
      </div>`;
  }
}
