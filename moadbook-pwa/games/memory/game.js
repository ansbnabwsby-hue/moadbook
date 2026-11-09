const GAME_ID = 'memory';
const LEVELS = [
  { name: 'سهل', pairs: 4, columns: 4 },
  { name: 'متوسط', pairs: 6, columns: 4 },
  { name: 'صعب', pairs: 8, columns: 4 },
];
const SYMBOLS = ['●', '◆', '▲', '✦', '⬟', '✿', '☀', '⬢', '♥', '☂', '♫', '✚'];
const BEST_KEY = 'moadbook-memory-best-v1';

export function mountGame(root, { onStart = () => null, onCancel = () => {}, onFinish = () => {}, onStatus = () => {}, onProgress = () => {} } = {}) {
  if (!root) throw new TypeError('Memory Challenge requires a root element');
  let session = null;
  let levelIndex = 0;
  let deck = [];
  let opened = [];
  let matched = new Set();
  let moves = 0;
  let totalMatches = 0;
  let startedAt = 0;
  let roundStartedAt = 0;
  let elapsedBeforePause = 0;
  let tickId = 0;
  let lockId = 0;
  let locked = false;
  let paused = false;
  let started = false;
  let ended = false;
  let destroyed = false;
  let roundToken = 0;
  let best = readBest();

  const shell = document.createElement('section');
  shell.className = 'mg-memory';
  shell.dir = 'rtl';
  shell.setAttribute('aria-label', 'تحدي الذاكرة');
  root.replaceChildren(shell);

  function make(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }
  function readBest() {
    try { const n = Number(localStorage.getItem(BEST_KEY)); return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null; }
    catch { return null; }
  }
  function say(text, kind = 'info') { if (!destroyed) onStatus(text, kind); }
  function clearTimers() { clearInterval(tickId); clearTimeout(lockId); tickId = 0; lockId = 0; }
  function elapsed() { return elapsedBeforePause + (started && !paused && !ended ? Date.now() - startedAt : 0); }
  function roundElapsed() { return roundStartedAt ? Math.max(0, Date.now() - roundStartedAt) : elapsed(); }
  function formatTime(ms) { const seconds = Math.floor(ms / 1000); return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`; }
  function updateStats() {
    const time = shell.querySelector('[data-time]');
    const movesNode = shell.querySelector('[data-moves]');
    const levelNode = shell.querySelector('[data-level]');
    const bestNode = shell.querySelector('[data-best]');
    if (time) time.textContent = formatTime(elapsed());
    if (movesNode) movesNode.textContent = String(moves);
    if (levelNode) levelNode.textContent = `${levelIndex + 1} / ${LEVELS.length} · ${LEVELS[levelIndex].name}`;
    if (bestNode) bestNode.textContent = best === null ? '—' : String(best);
    const liveScore = Math.max(0, Math.floor((totalMatches * 1000) / Math.max(1, moves) + Math.max(0, 300 - elapsed() / 1000)));
    try { onProgress({ score: liveScore, moves, matches: totalMatches, levelsCompleted: levelIndex, elapsedMs: Math.floor(elapsed()) }); } catch { /* Host callbacks must not break play. */ }
  }
  function buildBase() {
    shell.replaceChildren();
    const header = make('header', 'mg-memory-header');
    header.append(make('p', 'mg-memory-eyebrow', 'تحدٍّ ذهني'), make('h1', 'mg-memory-title', 'تحدي الذاكرة'));
    const intro = make('p', 'mg-memory-instructions', 'اكشف بطاقتين في كل مرة، وابحث عن الأزواج المتطابقة بأقل عدد من الحركات.');
    const stats = make('div', 'mg-memory-stats');
    for (const [label, key, value] of [['الوقت', 'time', '00:00'], ['الحركات', 'moves', '0'], ['المستوى', 'level', ''], ['أفضل نتيجة', 'best', '']]) {
      const item = make('div', 'mg-memory-stat');
      const valueNode = make('strong', 'mg-memory-stat-value', value);
      valueNode.dataset[key] = '';
      item.append(make('span', 'mg-memory-stat-label', label), valueNode);
      stats.append(item);
    }
    const controls = make('div', 'mg-memory-controls');
    const pauseButton = make('button', 'mg-memory-button mg-memory-button-secondary', 'إيقاف مؤقت'); pauseButton.type = 'button'; pauseButton.dataset.action = 'pause'; pauseButton.disabled = true;
    const restartButton = make('button', 'mg-memory-button mg-memory-button-secondary', 'إعادة اللعب'); restartButton.type = 'button'; restartButton.dataset.action = 'restart';
    controls.append(pauseButton, restartButton);
    const board = make('div', 'mg-memory-board'); board.setAttribute('role', 'group'); board.setAttribute('aria-label', 'بطاقات الذاكرة'); board.dataset.board = '';
    const message = make('div', 'mg-memory-message'); message.dataset.message = ''; message.setAttribute('role', 'status'); message.setAttribute('aria-live', 'polite');
    shell.append(header, intro, stats, controls, board, message);
    return { board, message, pauseButton };
  }
  let ui = buildBase();
  function showLanding(note = 'اختر ابدأ لتبدأ جولة جديدة. استخدم Tab ثم Enter أو Space للتنقل.') {
    ui.board.replaceChildren();
    ui.board.className = 'mg-memory-board mg-memory-board-empty';
    const panel = make('div', 'mg-memory-panel');
    panel.append(make('h2', 'mg-memory-panel-title', 'هل ذاكرتك جاهزة؟'), make('p', 'mg-memory-panel-copy', note));
    const startButton = make('button', 'mg-memory-button mg-memory-button-primary', 'ابدأ التحدي');
    startButton.type = 'button'; startButton.dataset.action = 'start';
    panel.append(startButton); ui.board.append(panel);
    ui.message.textContent = 'المستوى الأول: سهل · ٤ أزواج';
    ui.pauseButton.disabled = true;
    updateStats();
  }
  function shuffle(items) {
    for (let i = items.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [items[i], items[j]] = [items[j], items[i]]; }
    return items;
  }
  function startRound() {
    if (destroyed || started && !ended) return;
    const token = ++roundToken;
    clearTimers();
    let returned;
    try { returned = onStart(GAME_ID); } catch { returned = null; }
    const acceptSession = (value) => {
      if (destroyed || token !== roundToken) return;
      session = value || null;
      started = true; ended = false; paused = false; locked = false;
      moves = 0; totalMatches = 0; matched = new Set(); opened = [];
      elapsedBeforePause = 0; startedAt = Date.now(); roundStartedAt = startedAt;
      makeDeck(); ui.pauseButton.disabled = false; ui.pauseButton.textContent = 'إيقاف مؤقت';
      tickId = setInterval(updateStats, 250); updateStats();
      say(session ? 'بدأت الجولة.' : 'تلعب الآن محليًا؛ هذه النتيجة غير موثّقة.', session ? 'info' : 'local');
    };
    if (returned && typeof returned.then === 'function') returned.then(acceptSession, () => acceptSession(null));
    else acceptSession(returned);
  }
  function makeDeck() {
    const level = LEVELS[levelIndex];
    const cards = shuffle(SYMBOLS.slice(0, level.pairs).flatMap((symbol, pair) => [
      { symbol, pair, key: `${pair}-a` }, { symbol, pair, key: `${pair}-b` },
    ]));
    deck = cards; ui.board.replaceChildren(); ui.board.className = `mg-memory-board mg-memory-grid-${level.columns}`;
    cards.forEach((card, index) => {
      const button = make('button', 'mg-memory-card', '؟');
      button.type = 'button'; button.dataset.index = String(index); button.dataset.key = card.key;
      button.setAttribute('aria-label', `بطاقة مخفية ${index + 1}`); button.setAttribute('aria-pressed', 'false');
      ui.board.append(button);
    });
    ui.message.textContent = `المستوى ${levelIndex + 1}: ${level.name} · ${level.pairs} أزواج`;
  }
  function reveal(index) {
    if (!started || paused || ended || locked || matched.has(index) || opened.includes(index)) return;
    const card = deck[index]; if (!card) return;
    opened.push(index); drawCard(index, true);
    if (opened.length < 2) return;
    moves++; updateStats();
    const [a, b] = opened;
    if (deck[a].pair === deck[b].pair) {
      matched.add(a); matched.add(b); totalMatches++;
      drawCard(a, true, true); drawCard(b, true, true); opened = [];
      say('تطابق صحيح. أحسنت!');
      if (matched.size === deck.length) setTimeout(finishLevel, 450);
    } else {
      locked = true;
      lockId = setTimeout(() => { if (!destroyed && !paused) { drawCard(a, false); drawCard(b, false); opened = []; locked = false; } }, 750);
    }
  }
  function drawCard(index, faceUp, isMatched = false) {
    const button = ui.board.querySelector(`[data-index="${index}"]`); if (!button) return;
    button.textContent = faceUp ? deck[index].symbol : '؟';
    button.classList.toggle('mg-memory-card-open', faceUp);
    button.classList.toggle('mg-memory-card-matched', isMatched);
    button.setAttribute('aria-pressed', String(faceUp));
    button.setAttribute('aria-label', isMatched ? `بطاقة مطابقة: ${deck[index].symbol}` : faceUp ? `بطاقة مكشوفة: ${deck[index].symbol}` : `بطاقة مخفية ${index + 1}`);
    button.disabled = isMatched || paused;
  }
  function finishLevel() {
    if (ended || destroyed) return;
    if (levelIndex + 1 < LEVELS.length) {
      levelIndex++; opened = []; matched = new Set(); locked = false;
      ui.message.textContent = `رائع! انتقلت تلقائيًا إلى المستوى ${levelIndex + 1}: ${LEVELS[levelIndex].name}.`;
      makeDeck(); updateStats(); say('اكتمل المستوى؛ يبدأ المستوى التالي الآن.');
    } else finishGame();
  }
  function finishGame() {
    if (ended) return;
    const durationMs = Math.max(0, Math.floor(roundElapsed()));
    ended = true; started = false; clearTimers();
    const score = Math.max(0, Math.floor((totalMatches * 1000) / Math.max(1, moves) + Math.max(0, 300 - durationMs / 1000)));
    if (best === null || score > best) { best = score; try { localStorage.setItem(BEST_KEY, String(best)); } catch { /* storage may be unavailable */ } }
    updateStats(); ui.pauseButton.disabled = true;
    ui.board.replaceChildren(); ui.board.className = 'mg-memory-board mg-memory-board-empty';
    const panel = make('div', 'mg-memory-panel mg-memory-complete');
    panel.append(make('h2', 'mg-memory-panel-title', 'اكتمل التحدي!'), make('p', 'mg-memory-panel-copy', `نتيجتك ${score} نقطة · ${moves} حركة · ${formatTime(durationMs)}`));
    const replay = make('button', 'mg-memory-button mg-memory-button-primary', 'العب مجددًا'); replay.type = 'button'; replay.dataset.action = 'start'; panel.append(replay); ui.board.append(panel);
    ui.message.textContent = session ? 'انتهت الجولة.' : 'انتهت الجولة المحلية؛ لم يتم توثيق النتيجة.';
    say(session ? 'اكتمل التحدي.' : 'اكتمل التحدي محليًا دون توثيق.', session ? 'success' : 'local');
    try { onFinish(session, { score, durationMs, metrics: { moves, matches: totalMatches, levelsCompleted: LEVELS.length } }); } catch { /* host callback errors must not break cleanup */ }
  }
  function togglePause() {
    if (!started || ended) return;
    if (!paused) pause(); else resume();
  }
  function pause() {
    if (destroyed || !started || ended || paused) return;
    elapsedBeforePause += Date.now() - startedAt; paused = true; clearInterval(tickId); tickId = 0;
    if (lockId) { clearTimeout(lockId); lockId = 0; locked = false; opened.forEach((i) => drawCard(i, false)); opened = []; }
    ui.board.classList.add('mg-memory-board-paused');
    ui.board.querySelectorAll('button[data-index]').forEach((button) => { button.disabled = true; });
    ui.pauseButton.textContent = 'متابعة'; ui.message.textContent = 'اللعبة متوقفة مؤقتًا.'; updateStats();
  }
  function resume() {
    if (destroyed || !started || ended || !paused) return;
    paused = false; startedAt = Date.now(); tickId = setInterval(updateStats, 250);
    ui.board.classList.remove('mg-memory-board-paused');
    ui.board.querySelectorAll('button[data-index]').forEach((button) => { button.disabled = button.classList.contains('mg-memory-card-matched'); });
    ui.pauseButton.textContent = 'إيقاف مؤقت'; ui.message.textContent = 'تابع كشف الأزواج.';
  }
  function restart() {
    if (destroyed) return;
    if (session && started && !ended) { try { onCancel(session); } catch { /* Best-effort cancellation. */ } }
    roundToken++; clearTimers(); session = null; levelIndex = 0; moves = 0; totalMatches = 0; started = false; ended = false; paused = false; locked = false; elapsedBeforePause = 0; roundStartedAt = 0;
    ui = buildBase(); showLanding('اضغط زر إعادة اللعب لبدء جولة جديدة.');
  }
  function onClick(event) {
    const button = event.target.closest('button'); if (!button || !shell.contains(button)) return;
    const action = button.dataset.action;
    if (action === 'start') startRound(); else if (action === 'restart') restart(); else if (action === 'pause') togglePause();
    else if (button.dataset.index !== undefined) reveal(Number(button.dataset.index));
  }
  function onKeydown(event) {
    if (event.key === 'Escape' && started) { event.preventDefault(); togglePause(); }
  }
  function onVisibility() { if (document.hidden) pause(); }
  shell.addEventListener('click', onClick);
  shell.addEventListener('keydown', onKeydown);
  document.addEventListener('visibilitychange', onVisibility);
  showLanding();

  return {
    pause,
    resume,
    restart,
    destroy() {
      if (destroyed) return;
      if (session && started && !ended) { try { onCancel(session); } catch { /* Best-effort cancellation. */ } }
      roundToken++; destroyed = true; clearTimers(); shell.removeEventListener('click', onClick); shell.removeEventListener('keydown', onKeydown);
      document.removeEventListener('visibilitychange', onVisibility); root.replaceChildren(); session = null; deck = []; opened = []; matched.clear();
    },
  };
}
