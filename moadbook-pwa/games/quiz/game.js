const GAME_ID = 'quiz';
const QUESTION_MS = 20000;
const LOCAL_QUESTIONS = [
  { id: 'local-math-1', category: 'رياضيات ومنطق', difficulty: 'سهل', prompt: 'ما ناتج 7 + 5؟', choices: ['10', '11', '12', '13'], answer: 2 },
  { id: 'local-logic-1', category: 'رياضيات ومنطق', difficulty: 'سهل', prompt: 'أكمل النمط: 2، 4، 6، ؟', choices: ['7', '8', '9', '10'], answer: 1 },
  { id: 'local-math-2', category: 'رياضيات ومنطق', difficulty: 'متوسط', prompt: 'كم يساوي 6 × 4؟', choices: ['20', '22', '24', '26'], answer: 2 },
  { id: 'local-logic-2', category: 'رياضيات ومنطق', difficulty: 'متوسط', prompt: 'إذا كان اليوم الثلاثاء، فما اليوم بعد يومين؟', choices: ['الأربعاء', 'الخميس', 'الجمعة', 'السبت'], answer: 1 },
  { id: 'local-math-3', category: 'رياضيات ومنطق', difficulty: 'صعب', prompt: 'ما العدد الذي إذا ضُرب في 3 ثم أضيف إليه 2 أصبح 20؟', choices: ['5', '6', '7', '8'], answer: 2 },
  { id: 'local-logic-3', category: 'رياضيات ومنطق', difficulty: 'صعب', prompt: 'لدى سارة 3 صناديق، في كل صندوق 4 كرات. أخرجت كرة من كل صندوق؛ كم بقي؟', choices: ['7', '8', '9', '10'], answer: 2 }
];
const DIFFICULTIES = ['الكل', 'سهل', 'متوسط', 'صعب'];

export function mountGame(root, { onStart = () => null, onAnswer = async () => null, onCancel = () => {}, onFinish = () => {}, onStatus = () => {}, onProgress = () => {} } = {}) {
  if (!root) throw new TypeError('يتطلب Moad Quiz عنصر root صالحًا');
  let state = 'ready';
  let destroyed = false;
  let session = null;
  let questions = [];
  let index = 0;
  let score = 0;
  let answers = [];
  let tickHandle = null;
  let remainingMs = QUESTION_MS;
  let questionStartedAt = 0;
  let category = 'الكل';
  let difficulty = 'الكل';
  let localMode = false;
  let finishSent = false;
  let starting = false;
  let startToken = 0;
  let pausedDuringFeedback = false;
  let best = readBest();
  const listeners = [];
  const reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = `mg-quiz-${cls}`;
    if (text != null) node.textContent = text;
    return node;
  }
  function listen(node, name, fn, options) {
    node.addEventListener(name, fn, options);
    listeners.push(() => node.removeEventListener(name, fn, options));
  }
  const shell = el('section', 'shell');
  shell.setAttribute('dir', 'rtl');
  shell.setAttribute('aria-label', 'لعبة مواد كويز');
  const header = el('header', 'header');
  const title = el('h1', 'title', 'موّاد كويز');
  const bestView = el('div', 'best', `أفضل نتيجة محلية: ${best}`);
  header.append(title, bestView);
  const live = el('div', 'live', '', '');
  live.setAttribute('role', 'status');
  live.setAttribute('aria-live', 'polite');
  const content = el('main', 'content');
  shell.append(header, live, content);
  root.replaceChildren(shell);

  function status(text, kind = 'info') {
    if (destroyed) return;
    live.textContent = text;
    live.dataset.kind = kind;
    if (typeof onStatus === 'function') onStatus(text, kind);
  }
  function setContent(node) { content.replaceChildren(node); }
  function readBest() {
    try { const v = Number(localStorage.getItem('mg-quiz-best')); return Number.isInteger(v) && v >= 0 ? v : 0; }
    catch { return 0; }
  }
  function saveBest(value) {
    if (value > best) {
      best = value;
      bestView.textContent = `أفضل نتيجة محلية: ${best}`;
      try { localStorage.setItem('mg-quiz-best', String(best)); } catch { /* التخزين المحلي اختياري */ }
    }
  }
  function makeSelect(label, choices, initial, handler) {
    const wrap = el('label', 'field');
    wrap.append(el('span', 'field-label', label));
    const select = el('select', 'select');
    for (const item of choices) {
      const option = document.createElement('option');
      option.value = item;
      option.textContent = item;
      select.append(option);
    }
    select.value = initial;
    listen(select, 'change', () => handler(select.value));
    wrap.append(select);
    return wrap;
  }
  function renderReady() {
    state = 'ready';
    const panel = el('div', 'panel');
    panel.append(el('p', 'eyebrow', 'تحدٍّ سريع، خطوة بخطوة'), el('h2', 'heading', 'اختبر معلوماتك'),
      el('p', 'copy', 'اختر الفئة ومستوى الصعوبة، ثم أجب عن كل سؤال قبل انتهاء الوقت. استخدم الأرقام 1–4 أو مفاتيح الأسهم للاختيار.'),
      el('p', 'copy muted', 'عند غياب أسئلة الجلسة، ستلعب مسائل حساب ومنطق محلية غير موثقة.'),
      makeSelect('الفئة', ['الكل', 'رياضيات ومنطق', 'علوم', 'تاريخ', 'جغرافيا', 'تقنية', 'ثقافة وفنون'], category, v => { category = v; }),
      makeSelect('مستوى الصعوبة', DIFFICULTIES, difficulty, v => { difficulty = v; }));
    const start = el('button', 'button primary', 'ابدأ اللعب');
    start.type = 'button';
    listen(start, 'click', begin);
    panel.append(start);
    setContent(panel);
    status('جاهز للبدء.');
  }
  function cleanString(value, fallback = '') { return typeof value === 'string' ? value : fallback; }
  function normalizeQuestion(q, i) {
    if (!q || typeof q !== 'object') return null;
    const prompt = cleanString(q.question ?? q.prompt ?? q.text);
    const rawChoices = Array.isArray(q.options) ? q.options : Array.isArray(q.choices) ? q.choices : null;
    if (!prompt || !rawChoices || rawChoices.length < 2 || rawChoices.length > 8) return null;
    const choices = rawChoices.map(x => cleanString(x)).filter(Boolean);
    if (choices.length !== rawChoices.length) return null;
    const difficultyLabels = { easy: 'سهل', medium: 'متوسط', hard: 'صعب' };
    return { id: q.questionId ?? q.id ?? `question-${i + 1}`, prompt, choices,
      category: cleanString(q.category, 'عام'), difficulty: difficultyLabels[q.difficulty] || cleanString(q.difficulty, 'غير محدد'), server: true };
  }
  function chooseQuestions(list) {
    const parsed = list.map(normalizeQuestion).filter(Boolean);
    return parsed.filter(q => (category === 'الكل' || q.category === category) && (difficulty === 'الكل' || q.difficulty === difficulty));
  }
  async function begin() {
    if (destroyed || starting || state === 'playing') return;
    starting = true;
    const token = ++startToken;
    status('جارٍ بدء الجولة…');
    let nextSession = null;
    try { if (typeof onStart === 'function') nextSession = await onStart(GAME_ID, { category, difficulty, count: 6 }); }
    catch { nextSession = null; }
    if (destroyed || token !== startToken) { starting = false; return; }
    session = nextSession || null;
    const serverList = session && session.data && Array.isArray(session.data.questions) ? session.data.questions : [];
    let selected = chooseQuestions(serverList);
    localMode = !session || selected.length === 0;
    if (localMode) {
      selected = LOCAL_QUESTIONS.filter(q => (difficulty === 'الكل' || q.difficulty === difficulty));
      if (category !== 'الكل' && category !== 'رياضيات ومنطق') selected = [];
      selected = selected.map(q => ({ ...q, server: false }));
      session = null;
      if (!selected.length) { starting = false; state = 'ready'; status('لا تتوفر أسئلة محلية لهذه الفئة الآن. اتصل بالخادم أو اختر الرياضيات والمنطق.', 'warning'); return; }
    }
    questions = selected;
    index = 0; score = 0; answers = []; finishSent = false; starting = false;
    state = 'playing';
    if (localMode) status('وضع محلي: النتيجة غير موثقة ولا تدخل في ترتيب.', 'info');
    else status('بدأت الجولة. بالتوفيق!');
    showQuestion();
  }
  function stopTimer() { if (tickHandle !== null) { clearInterval(tickHandle); tickHandle = null; } }
  function showQuestion() {
    if (destroyed || state !== 'playing') return;
    if (index >= questions.length) { finish(); return; }
    stopTimer();
    const q = questions[index];
    remainingMs = QUESTION_MS;
    questionStartedAt = Date.now();
    state = 'playing';
    const panel = el('div', 'panel question-panel');
    const meta = el('div', 'meta');
    meta.append(el('span', 'pill', `السؤال ${index + 1} من ${questions.length}`), el('span', 'pill', q.category));
    const progress = el('div', 'progress-track');
    progress.setAttribute('role', 'progressbar'); progress.setAttribute('aria-valuemin', '0');
    progress.setAttribute('aria-valuemax', String(questions.length)); progress.setAttribute('aria-valuenow', String(index));
    const fill = el('div', 'progress-fill');
    fill.style.width = `${index / questions.length * 100}%`; progress.append(fill);
    const timerRow = el('div', 'timer-row');
    timerRow.append(el('span', 'timer-label', 'الوقت المتبقي'), el('strong', 'timer', '20.0 ثانية'));
    const prompt = el('h2', 'question-text', q.prompt);
    const options = el('div', 'options');
    q.choices.forEach((choice, choiceIndex) => {
      const btn = el('button', 'option'); btn.type = 'button'; btn.dataset.choice = String(choiceIndex);
      const key = el('span', 'option-key', String(choiceIndex + 1));
      const label = el('span', 'option-label', choice);
      btn.append(key, label);
      listen(btn, 'click', () => answer(choiceIndex));
      options.append(btn);
    });
    const feedback = el('p', 'feedback'); feedback.setAttribute('aria-live', 'polite');
    panel.append(meta, progress, timerRow, prompt, options, feedback);
    setContent(panel);
    tickHandle = setInterval(() => {
      if (state !== 'playing') return;
      remainingMs = Math.max(0, remainingMs - 100);
      const seconds = remainingMs / 1000;
      timerRow.querySelector('.mg-quiz-timer').textContent = `${seconds.toFixed(1)} ثانية`;
      timerRow.querySelector('.mg-quiz-timer').classList.toggle('mg-quiz-urgent', seconds <= 5);
      if (remainingMs <= 0) answer(null);
    }, 100);
  }
  async function answer(choiceIndex) {
    if (destroyed || state !== 'playing') return;
    const q = questions[index];
    if (!q) return;
    stopTimer();
    const elapsedMs = Math.max(0, Math.min(QUESTION_MS, Date.now() - questionStartedAt));
    const recorded = { questionId: q.id, choiceIndex: Number.isInteger(choiceIndex) ? choiceIndex : -1, elapsedMs };
    answers.push(recorded);
    const feedback = content.querySelector('.mg-quiz-feedback');
    const buttons = content.querySelectorAll('.mg-quiz-option'); buttons.forEach(b => { b.disabled = true; });
    state = 'verifying';
    let verified = false;
    let correct = false;
    let explanation = '';
    if (q.server) {
      if (feedback) feedback.textContent = 'جارٍ التحقق من الإجابة…';
      status('جارٍ التحقق من الإجابة مع الخادم…');
      try {
        const result = await onAnswer(session, recorded);
        if (destroyed || state !== 'verifying') return;
        if (!result || typeof result.correct !== 'boolean') throw new Error('ANSWER_VERIFICATION_FAILED');
        verified = true; correct = result.correct;
        explanation = typeof result.explanation === 'string' ? result.explanation : '';
      } catch {
        if (destroyed || state !== 'verifying') return;
        if (feedback) { feedback.textContent = 'تعذر التحقق من هذه الإجابة؛ لن تُحتسب ضمن النقاط الرسمية.'; feedback.dataset.kind = 'wrong'; }
        status('تعذر الاتصال للتحقق من الإجابة. ستُحتسب فقط الإجابات التي حفظها الخادم.', 'warning');
      }
    } else {
      verified = true; correct = recorded.choiceIndex >= 0 && recorded.choiceIndex === q.answer;
    }
    if (destroyed || state !== 'verifying') return;
    if (verified && correct) score += 1;
    if (feedback && verified) {
      if (recorded.choiceIndex < 0) { feedback.textContent = 'انتهى الوقت؛ لم تُسجّل إجابة.'; feedback.dataset.kind = 'wrong'; }
      else if (correct) { feedback.textContent = explanation ? `إجابة صحيحة. ${explanation}` : 'إجابة صحيحة.'; feedback.dataset.kind = 'correct'; }
      else { feedback.textContent = explanation ? `إجابة غير صحيحة. ${explanation}` : 'إجابة غير صحيحة.'; feedback.dataset.kind = 'wrong'; }
    }
    try { onProgress({ score, questionIndex: index + 1, totalQuestions: questions.length, correctAnswers: score }); } catch { /* Host callbacks must not break play. */ }
    state = 'feedback';
    window.setTimeout(() => {
      if (destroyed || state !== 'feedback') return;
      index += 1; state = 'playing'; showQuestion();
    }, reducedMotion ? 250 : 750);
  }
  function finish() {
    if (destroyed || finishSent) return;
    finishSent = true; state = 'ended'; stopTimer(); saveBest(score);
    const panel = el('div', 'panel result-panel');
    panel.append(el('p', 'eyebrow', 'انتهت الجولة'), el('h2', 'heading', 'نتيجتك'), el('div', 'score', String(score)),
      el('p', 'copy', `أجبت عن ${answers.filter(a => a.choiceIndex >= 0).length} من ${questions.length} سؤالًا.`),
      el('p', 'copy muted', localMode ? 'هذه نتيجة محلية غير موثقة.' : 'تم إرسال بيانات الإجابات للتحقق من الخادم.'));
    const restartButton = el('button', 'button primary', 'العب مرة أخرى'); restartButton.type = 'button'; listen(restartButton, 'click', begin);
    panel.append(restartButton); setContent(panel);
    status(localMode ? 'انتهت الجولة المحلية؛ النتيجة غير موثقة.' : 'انتهت الجولة.', 'success');
    if (typeof onFinish === 'function') {
      try { onFinish(session, { score: Math.max(0, Math.floor(score)), durationMs: answers.reduce((sum, a) => sum + a.elapsedMs, 0), metrics: { answers: answers.map(a => ({ ...a })) } }); }
      catch { status('تعذر إرسال نتيجة الجولة.', 'error'); }
    }
  }
  function pause() {
    if (destroyed || (state !== 'playing' && state !== 'feedback')) return;
    pausedDuringFeedback = state === 'feedback';
    if (state === 'playing') stopTimer();
    state = 'paused';
    const panel = el('div', 'panel pause-panel');
    panel.append(el('h2', 'heading', 'اللعبة متوقفة'), el('p', 'copy', 'استأنف عندما تكون مستعدًا.'));
    const resumeButton = el('button', 'button primary', 'استئناف'); resumeButton.type = 'button'; listen(resumeButton, 'click', resume);
    panel.append(resumeButton); setContent(panel); status('اللعبة متوقفة مؤقتًا.');
  }
  function resume() {
    if (destroyed || state !== 'paused') return;
    if (pausedDuringFeedback) {
      pausedDuringFeedback = false;
      index += 1;
      state = 'playing';
      showQuestion();
      status('استؤنفت اللعبة.');
      return;
    }
    state = 'playing';
    // إعادة عرض السؤال لا تعيد ضبط الزمن: نعيد المؤقت من الزمن المتبقي المحفوظ.
    const q = questions[index];
    if (!q) { finish(); return; }
    const panel = el('div', 'panel question-panel');
    panel.append(el('div', 'meta', `السؤال ${index + 1} من ${questions.length}`));
    const timerRow = el('div', 'timer-row'); timerRow.append(el('span', 'timer-label', 'الوقت المتبقي'), el('strong', 'timer', `${(remainingMs / 1000).toFixed(1)} ثانية`));
    const prompt = el('h2', 'question-text', q.prompt); const options = el('div', 'options');
    q.choices.forEach((choice, choiceIndex) => { const b = el('button', 'option'); b.type='button'; b.append(el('span','option-key',String(choiceIndex+1)),el('span','option-label',choice)); listen(b,'click',()=>answer(choiceIndex)); options.append(b); });
    panel.append(timerRow, prompt, options); setContent(panel); questionStartedAt = Date.now() - (QUESTION_MS - remainingMs);
    tickHandle = setInterval(() => { if (state !== 'playing') return; remainingMs=Math.max(0,remainingMs-100); timerRow.querySelector('.mg-quiz-timer').textContent=`${(remainingMs/1000).toFixed(1)} ثانية`; if(remainingMs<=0) answer(null); },100);
    status('استؤنفت اللعبة.');
  }
  function restart() {
    if (destroyed) return;
    if (session && !finishSent && ['playing', 'verifying', 'feedback', 'paused'].includes(state)) { try { onCancel(session); } catch { /* Best-effort cancellation. */ } }
    startToken++; stopTimer(); state = 'ready'; session = null; questions = []; answers = []; index = 0; score = 0; finishSent = false; starting = false;
    renderReady();
  }
  function keyHandler(event) {
    if (destroyed) return;
    if (event.key === 'Escape' && (state === 'playing' || state === 'feedback')) { event.preventDefault(); pause(); return; }
    if (state !== 'playing') return;
    const n = Number(event.key);
    if (n >= 1 && n <= (questions[index]?.choices.length || 0)) { event.preventDefault(); answer(n - 1); }
    else if (event.key === 'ArrowDown' || event.key === 'ArrowRight') { event.preventDefault(); const buttons=[...content.querySelectorAll('.mg-quiz-option:not(:disabled)')]; const i=buttons.indexOf(document.activeElement); buttons[(i+1+buttons.length)%buttons.length]?.focus(); }
    else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') { event.preventDefault(); const buttons=[...content.querySelectorAll('.mg-quiz-option:not(:disabled)')]; const i=buttons.indexOf(document.activeElement); buttons[(i-1+buttons.length)%buttons.length]?.focus(); }
  }
  listen(root, 'keydown', keyHandler);
  function visibility() { if (document.hidden && state === 'playing') pause(); }
  listen(document, 'visibilitychange', visibility);
  renderReady();
  return {
    pause,
    resume,
    restart,
    destroy() {
      if (destroyed) return;
      if (session && !finishSent && ['playing', 'verifying', 'feedback', 'paused'].includes(state)) { try { onCancel(session); } catch { /* Best-effort cancellation. */ } }
      startToken++; destroyed = true; stopTimer(); listeners.splice(0).forEach(remove => remove());
      root.replaceChildren(); state = 'destroyed';
    }
  };
}
