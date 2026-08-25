/* LinuxPath runtime consistency layer.
 * Computes visible learning statistics from the loaded data instead of
 * duplicating curriculum totals in HTML and rendering code.
 */
(function () {
  'use strict';

  function objectOrEmpty(value) {
    return value && typeof value === 'object' ? value : {};
  }

  function countArrays(source) {
    return Object.keys(source).reduce(function (total, key) {
      return total + (Array.isArray(source[key]) ? source[key].length : 0);
    }, 0);
  }

  function getStats() {
    var lessons = typeof LESSONS !== 'undefined' ? objectOrEmpty(LESSONS) : {};
    var exercises = typeof EXERCISES !== 'undefined' ? objectOrEmpty(EXERCISES) : {};
    var quizzes = typeof QUIZZES !== 'undefined' ? objectOrEmpty(QUIZZES) : {};
    var challenges = typeof CTF_CHALLENGES !== 'undefined' && Array.isArray(CTF_CHALLENGES)
      ? CTF_CHALLENGES
      : [];
    var questionCount = Object.keys(quizzes).reduce(function (total, moduleId) {
      var quiz = quizzes[moduleId];
      return total + (quiz && Array.isArray(quiz.questions) ? quiz.questions.length : 0);
    }, 0);
    var difficulty = { easy: 0, medium: 0, hard: 0 };
    challenges.forEach(function (challenge) {
      if (Object.prototype.hasOwnProperty.call(difficulty, challenge.difficulty)) {
        difficulty[challenge.difficulty] += 1;
      }
    });
    return {
      modules: Object.keys(lessons).length,
      lessons: countArrays(lessons),
      exercises: countArrays(exercises),
      quizzes: Object.keys(quizzes).length,
      questions: questionCount,
      challenges: challenges.length,
      difficulty: difficulty
    };
  }

  function getCalculatedProgress() {
    var currentState = typeof state !== 'undefined' ? state : null;
    var stats = getStats();
    var done = currentState
      ? currentState.lessonsDone.size +
        currentState.exercisesDone.size +
        Object.keys(currentState.quizScores).length
      : 0;
    var total = stats.lessons + stats.exercises + stats.quizzes;
    return {
      done: done,
      total: total,
      pct: total ? Math.round(done / total * 100) : 0
    };
  }

  function syncProgressDom() {
    var progress = getCalculatedProgress();
    var sidebarFill = document.getElementById('sidebar-progress-fill');
    var sidebarPct = document.getElementById('sidebar-pct');
    var topbarFill = document.getElementById('topbar-progress-fill');
    var topbarLabel = document.getElementById('topbar-progress-label');
    if (sidebarFill) sidebarFill.style.width = progress.pct + '%';
    if (sidebarPct) sidebarPct.textContent = progress.pct + '%';
    if (topbarFill) topbarFill.style.width = progress.pct + '%';
    if (topbarLabel) topbarLabel.textContent = progress.done + ' / ' + progress.total + ' complétés';

    var ctfBadge = document.getElementById('nav-badge-ctf');
    if (ctfBadge) {
      var solved = typeof ctfState !== 'undefined' ? ctfState.solved.size : 0;
      ctfBadge.textContent = solved + '/' + getStats().challenges;
    }
  }

  function syncHomeStats() {
    var stats = getStats();
    var values = {
      modules: stats.modules,
      leçons: stats.lessons,
      exercices: stats.exercises,
      'questions qcm': stats.questions,
      'challenges ctf': stats.challenges
    };
    document.querySelectorAll('.lp-hero-stats .lp-stat-label').forEach(function (label) {
      var key = label.textContent.trim().toLowerCase();
      var value = label.previousElementSibling;
      if (value && Object.prototype.hasOwnProperty.call(values, key)) {
        value.textContent = values[key];
      }
    });

    document.querySelectorAll('.lp-return-stat-label').forEach(function (label) {
      var key = label.textContent.trim().toLowerCase();
      var value = label.previousElementSibling;
      if (value && Object.prototype.hasOwnProperty.call(values, key)) {
        value.textContent = values[key];
      }
    });

    var heroSub = document.querySelector('.lp-hero .lp-sub');
    if (heroSub && stats.modules) {
      heroSub.textContent = stats.modules +
        ' modules, exercices pratiques, quiz de validation et un vrai terminal Linux dans votre navigateur — sans rien installer.';
    }

    var ctfItems = document.querySelectorAll('#section-ctf .module-meta-item');
    if (ctfItems.length >= 4 && stats.challenges) {
      ctfItems[0].textContent = '🚩 ' + stats.challenges + ' challenges';
      ctfItems[1].textContent = '🟢 ' + stats.difficulty.easy + ' faciles';
      ctfItems[2].textContent = '🟡 ' + stats.difficulty.medium + ' moyens';
      ctfItems[3].textContent = '🔴 ' + stats.difficulty.hard + ' difficiles';
    }
  }

  function wrapGlobalFunction(name, after) {
    var original = window[name];
    if (typeof original !== 'function' || original.__linuxPathWrapped) return;
    var wrapped = function () {
      var result = original.apply(this, arguments);
      after();
      return result;
    };
    wrapped.__linuxPathWrapped = true;
    window[name] = wrapped;
    try {
      if (name === 'renderHome') renderHome = wrapped;
      if (name === 'updateProgressUI') updateProgressUI = wrapped;
    } catch (ignore) {}
  }

  function install() {
    var calculatedProgress = function () {
      return getCalculatedProgress();
    };
    try {
      getProgress = calculatedProgress;
    } catch (ignore) {}
    window.getProgress = calculatedProgress;

    wrapGlobalFunction('renderHome', function () {
      syncHomeStats();
      syncProgressDom();
    });
    wrapGlobalFunction('updateProgressUI', function () {
      syncProgressDom();
      syncHomeStats();
    });

    var attempts = 0;
    function syncWhenReady() {
      syncHomeStats();
      syncProgressDom();
      var stats = getStats();
      if ((!stats.modules || !stats.challenges) && attempts < 40) {
        attempts += 1;
        window.setTimeout(syncWhenReady, 250);
      }
    }
    syncWhenReady();
  }

  if (document.readyState === 'complete') {
    install();
  } else {
    window.addEventListener('load', install, { once: true });
  }
}());
