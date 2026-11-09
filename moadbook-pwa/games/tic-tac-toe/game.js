const GAME_ID = 'tic-tac-toe';
const BOT_DELAY_MS = 320;
const WIN_LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];

export function mountGame(root, { onStart = () => null, onCancel = () => {}, onFinish = () => {}, onStatus = () => {}, onProgress = () => {} } = {}) {
  if (!root) throw new TypeError('Tic-Tac-Toe requires a root element');
  let board = Array(9).fill('');
  let playerMoves = [];
  let session = null;
  let active = false;
  let starting = false;
  let paused = false;
  let ended = false;
  let destroyed = false;
  let startedAt = 0;
  let elapsedBeforePause = 0;
  let timer = 0;
  let botTimer = 0;
  let generation = 0;

  const shell = document.createElement('section');
  shell.className = 'mg-tic-tac-toe';
  shell.dir = 'rtl';
  shell.setAttribute('aria-label', 'لعبة إكس أو');
  root.replaceChildren(shell);

  const make = (tag, className, text) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  };
  const announce = (message, kind = 'info') => { if (!destroyed) { ui.message.textContent = message; try { onStatus(message, kind); } catch { /* Host callbacks must not interrupt play. */ } } };
  const elapsed = () => elapsedBeforePause + (active && !paused ? Date.now() - startedAt : 0);
  const formatTime = (ms) => { const s = Math.floor(ms / 1000); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
  const ui = {};

  function build() {
    const header = make('header', 'mg-xo-header');
    header.append(make('p', 'mg-xo-eyebrow', 'تحدٍّ ذهني'), make('h2', 'mg-xo-title', 'إكس أو'));
    const intro = make('p', 'mg-xo-intro', 'أنت X. كوّن صفًا من ثلاث خانات قبل الروبوت O. اختر الخانة باللمس أو بلوحة المفاتيح.');
    const stats = make('div', 'mg-xo-stats');
    const timeBox = make('div', 'mg-xo-stat'); timeBox.append(make('span', '', 'الوقت'), ui.time = make('strong', '', '00:00'));
    const turnBox = make('div', 'mg-xo-stat'); turnBox.append(make('span', '', 'الدور'), ui.turn = make('strong', '', 'X'));
    stats.append(timeBox, turnBox);
    const boardEl = make('div', 'mg-xo-board');
    boardEl.setAttribute('role', 'group'); boardEl.setAttribute('aria-label', 'لوحة إكس أو، تسع خانات');
    ui.cells = [];
    for (let i = 0; i < 9; i++) {
      const cell = make('button', 'mg-xo-cell', ''); cell.type = 'button'; cell.dataset.index = String(i);
      cell.setAttribute('aria-label', `الخانة ${i + 1}، فارغة`); cell.disabled = true;
      boardEl.append(cell); ui.cells.push(cell);
    }
    const controls = make('div', 'mg-xo-controls');
    ui.pauseButton = make('button', 'mg-xo-button mg-xo-secondary', 'إيقاف مؤقت'); ui.pauseButton.type = 'button'; ui.pauseButton.dataset.action = 'pause'; ui.pauseButton.disabled = true;
    ui.restartButton = make('button', 'mg-xo-button mg-xo-secondary', 'إعادة اللعب'); ui.restartButton.type = 'button'; ui.restartButton.dataset.action = 'restart';
    controls.append(ui.pauseButton, ui.restartButton);
    ui.message = make('p', 'mg-xo-message', 'ابدأ جولة جديدة عندما تكون مستعدًا.'); ui.message.setAttribute('role', 'status'); ui.message.setAttribute('aria-live', 'polite');
    ui.startButton = make('button', 'mg-xo-button mg-xo-primary', 'ابدأ الجولة'); ui.startButton.type = 'button'; ui.startButton.dataset.action = 'start';
    shell.replaceChildren(header, intro, stats, controls, boardEl, ui.message, ui.startButton);
  }

  function reportProgress() {
    const xCount = board.filter((v) => v === 'X').length;
    const oCount = board.filter((v) => v === 'O').length;
    try { onProgress({ playerMoves: playerMoves.slice(), humanMoves: xCount, botMoves: oCount, occupied: xCount + oCount, elapsedMs: Math.floor(elapsed()) }); } catch { /* Display-only callback. */ }
  }
  function updateBoard() {
    ui.cells.forEach((cell, i) => {
      cell.textContent = board[i];
      cell.classList.toggle('mg-xo-x', board[i] === 'X'); cell.classList.toggle('mg-xo-o', board[i] === 'O');
      cell.setAttribute('aria-label', board[i] ? `الخانة ${i + 1}، ${board[i]}` : `الخانة ${i + 1}، فارغة`);
      const botThinking = board.filter((mark) => mark === 'X').length > board.filter((mark) => mark === 'O').length;
      cell.disabled = !active || paused || ended || botThinking || board[i] !== '';
    });
    ui.turn.textContent = ended ? '—' : paused ? 'متوقف' : (board.filter(Boolean).length % 2 === 0 ? 'X' : 'O');
    reportProgress();
  }
  function winner(mark, cells = board) { return WIN_LINES.find((line) => line.every((i) => cells[i] === mark)) || null; }
  function chooseBotMove() {
    const free = (i) => board[i] === '';
    for (let i = 0; i < 9; i++) if (free(i)) { const copy = board.slice(); copy[i] = 'O'; if (winner('O', copy)) return i; }
    for (let i = 0; i < 9; i++) if (free(i)) { const copy = board.slice(); copy[i] = 'X'; if (winner('X', copy)) return i; }
    if (free(4)) return 4;
    for (const i of [0, 2, 6, 8]) if (free(i)) return i;
    for (const i of [1, 3, 5, 7]) if (free(i)) return i;
    return -1;
  }
  function clearTimers() { clearInterval(timer); clearTimeout(botTimer); timer = 0; botTimer = 0; }
  function finish(result) {
    if (ended || destroyed) return;
    ended = true; active = false; clearTimers();
    const score = result === 'win' ? 100 : result === 'draw' ? 50 : 10;
    const durationMs = Math.max(0, Math.floor(elapsedBeforePause + (paused ? 0 : Date.now() - startedAt)));
    updateBoard(); ui.pauseButton.disabled = true; ui.startButton.hidden = false; ui.startButton.textContent = 'العب مجددًا';
    const message = result === 'win' ? 'فزت! أحسنت.' : result === 'draw' ? 'تعادل جميل.' : 'فاز الروبوت هذه المرة.';
    announce(`${message} النتيجة: ${score}.`, result === 'win' ? 'success' : 'info');
    try { onFinish(session, { score, durationMs, metrics: { playerMoves: playerMoves.slice() } }); } catch { /* Finish is already recorded locally; do not interrupt cleanup. */ }
  }
  function afterMove(mark) {
    const line = winner(mark);
    if (line) { line.forEach((i) => ui.cells[i].classList.add('mg-xo-winning')); finish(mark === 'X' ? 'win' : 'loss'); return true; }
    if (board.every(Boolean)) { finish('draw'); return true; }
    updateBoard(); return false;
  }
  function botTurn() {
    botTimer = 0;
    if (!active || paused || ended || destroyed) return;
    const index = chooseBotMove();
    if (index < 0) { finish('draw'); return; }
    board[index] = 'O'; updateBoard();
    if (!afterMove('O')) announce('دورك الآن، اختر خانة لـ X.');
  }
  function playerTurn(index) {
    if (!active || paused || ended || board[index] !== '' || board.filter((mark) => mark === 'X').length !== board.filter((mark) => mark === 'O').length) return;
    board[index] = 'X'; playerMoves.push(index); updateBoard();
    if (afterMove('X')) return;
    announce('يفكر الروبوت…'); botTimer = setTimeout(botTurn, BOT_DELAY_MS);
  }
  function start() {
    if (destroyed || starting || active) return;
    const token = ++generation; starting = true; ui.startButton.disabled = true; announce('جارٍ بدء الجولة…');
    let result;
    try { result = onStart(GAME_ID); } catch { result = null; }
    const accept = (value) => {
      if (destroyed || token !== generation) return;
      starting = false; ui.startButton.disabled = false; session = value || null;
      board = Array(9).fill(''); playerMoves = []; active = true; paused = false; ended = false;
      startedAt = Date.now(); elapsedBeforePause = 0; clearTimers(); timer = setInterval(() => { ui.time.textContent = formatTime(elapsed()); reportProgress(); }, 500);
      ui.pauseButton.disabled = false; ui.pauseButton.textContent = 'إيقاف مؤقت'; ui.startButton.hidden = true;
      updateBoard(); announce(session ? 'بدأت الجولة. أنت X، ابدأ باختيار خانة.' : 'تلعب محليًا؛ تعذر بدء جلسة موثقة.', session ? 'info' : 'local');
    };
    if (result && typeof result.then === 'function') result.then(accept, () => accept(null)); else accept(result);
  }
  function pause() {
    if (!active || paused || ended || destroyed) return;
    elapsedBeforePause += Date.now() - startedAt; paused = true; clearTimers(); ui.pauseButton.textContent = 'متابعة'; updateBoard(); announce('اللعبة متوقفة مؤقتًا.');
  }
  function resume() {
    if (!active || !paused || ended || destroyed) return;
    paused = false; startedAt = Date.now(); ui.pauseButton.textContent = 'إيقاف مؤقت';
    timer = setInterval(() => { ui.time.textContent = formatTime(elapsed()); reportProgress(); }, 500); updateBoard(); announce('تابع اللعب، دورك عندما تظهر X.');
    if (board.filter((v) => v === 'X').length > board.filter((v) => v === 'O').length) botTimer = setTimeout(botTurn, BOT_DELAY_MS);
  }
  function cancelActive() {
    if (session && active && !ended) { try { Promise.resolve(onCancel(session)).catch(() => {}); } catch { /* Best-effort cancellation. */ } }
    session = null;
  }
  function restart() {
    if (destroyed) return;
    cancelActive(); generation++; clearTimers(); active = false; starting = false; paused = false; ended = false; board = Array(9).fill(''); playerMoves = []; elapsedBeforePause = 0;
    ui.time.textContent = '00:00'; ui.pauseButton.disabled = true; ui.startButton.hidden = false; ui.startButton.disabled = false; ui.startButton.textContent = 'ابدأ الجولة';
    updateBoard(); announce('ابدأ جولة جديدة عندما تكون مستعدًا.');
  }
  function click(event) {
    const button = event.target.closest('button'); if (!button || !shell.contains(button)) return;
    if (button.dataset.action === 'start') start();
    else if (button.dataset.action === 'restart') restart();
    else if (button.dataset.action === 'pause') paused ? resume() : pause();
    else if (button.dataset.index !== undefined) playerTurn(Number(button.dataset.index));
  }
  function keydown(event) { if (event.key === 'Escape' && active) { event.preventDefault(); paused ? resume() : pause(); } }
  function visibility() { if (document.hidden && active && !paused) pause(); }
  build(); shell.addEventListener('click', click); shell.addEventListener('keydown', keydown); document.addEventListener('visibilitychange', visibility);

  return {
    pause, resume, restart,
    destroy() {
      if (destroyed) return;
      cancelActive(); generation++; destroyed = true; clearTimers(); shell.removeEventListener('click', click); shell.removeEventListener('keydown', keydown); document.removeEventListener('visibilitychange', visibility); root.replaceChildren();
    },
  };
}
