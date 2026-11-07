const GAME_ID = 'snake';
const BEST_KEY = 'moadbook.games.snake.personalBest.v1';

export function mountGame(root, { onStart = () => null, onCancel = () => {}, onFinish = () => {}, onStatus = () => {}, onProgress = () => {} } = {}) {
  if (!root) throw new TypeError('mountGame requires a root element');
  let state = 'ready';
  let session = null;
  let snake = [];
  let direction = { x: 1, y: 0 };
  let queuedDirection = { x: 1, y: 0 };
  let food = { x: 0, y: 0 };
  let score = 0;
  let foodsEaten = 0;
  let moves = 0;
  let startedAt = 0;
  let timer = 0;
  let raf = 0;
  let destroyed = false;
  let starting = false;
  let startToken = 0;
  let lastStepAt = 0;
  let cell = 20;
  let cols = 24;
  let rows = 18;
  let best = readBest();
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  const shell = document.createElement('section');
  shell.className = 'mg-snake-shell';
  shell.setAttribute('dir', 'rtl');
  shell.setAttribute('aria-label', 'لعبة ثعبان مواد');
  shell.innerHTML = `
    <header class="mg-snake-header">
      <div><p class="mg-snake-kicker">MOADBOOK ARCADE</p><h1 class="mg-snake-title">ثعبان مواد</h1></div>
      <div class="mg-snake-stats" aria-live="polite"><div><span>النقاط</span><strong data-score>0</strong></div><div><span>أفضل نتيجة</span><strong data-best>0</strong></div></div>
    </header>
    <p class="mg-snake-instructions">اجمع الطعام، وابتعد عن الجدار وعن نفسك. التحكّم بالأسهم أو WASD، أو أزرار الاتجاه.</p>
    <div class="mg-snake-board-wrap"><canvas class="mg-snake-canvas" tabindex="0" role="img" aria-label="ساحة لعبة الثعبان"></canvas>
      <div class="mg-snake-overlay" data-overlay><h2 data-heading>جاهز؟</h2><p data-message>ابدأ اللعب واجمع الطعام لتطويل الثعبان.</p><button type="button" class="mg-snake-primary" data-start>ابدأ اللعب</button></div>
    </div>
    <div class="mg-snake-actions"><button type="button" class="mg-snake-secondary" data-pause disabled>إيقاف مؤقت</button><button type="button" class="mg-snake-secondary" data-restart>إعادة اللعب</button></div>
    <div class="mg-snake-pad" aria-label="أزرار التحكم بالاتجاه">
      <button type="button" class="mg-snake-dir mg-snake-up" data-dir="0,-1" aria-label="أعلى">▲</button>
      <button type="button" class="mg-snake-dir mg-snake-left" data-dir="-1,0" aria-label="يسار">◀</button>
      <button type="button" class="mg-snake-dir mg-snake-down" data-dir="0,1" aria-label="أسفل">▼</button>
      <button type="button" class="mg-snake-dir mg-snake-right" data-dir="1,0" aria-label="يمين">▶</button>
    </div>
    <p class="mg-snake-status" data-status aria-live="polite">اضغط «ابدأ اللعب» للبدء.</p>`;
  root.replaceChildren(shell);
  const canvas = shell.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const scoreEl = shell.querySelector('[data-score]');
  const bestEl = shell.querySelector('[data-best]');
  const overlay = shell.querySelector('[data-overlay]');
  const heading = shell.querySelector('[data-heading]');
  const message = shell.querySelector('[data-message]');
  const startButton = shell.querySelector('[data-start]');
  const pauseButton = shell.querySelector('[data-pause]');
  const statusEl = shell.querySelector('[data-status]');
  bestEl.textContent = String(best);

  function readBest() { try { const n = Number(localStorage.getItem(BEST_KEY)); return Number.isSafeInteger(n) && n >= 0 ? n : 0; } catch { return 0; } }
  function status(text, kind = 'info') { statusEl.textContent = text; statusEl.dataset.kind = kind; try { onStatus(text, kind); } catch {} }
  function resize() {
    if (destroyed) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cell = Math.max(12, Math.floor(Math.min(rect.width / 24, rect.height / 18)));
    cols = Math.max(12, Math.floor(rect.width / cell)); rows = Math.max(10, Math.floor(rect.height / cell));
    draw();
  }
  function placeFood() {
    const free = [];
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (!snake.some(p => p.x === x && p.y === y)) free.push({ x, y });
    if (!free.length) { finish(); return; }
    food = free[Math.floor(Math.random() * free.length)];
  }
  function reset() {
    if (session && ['playing', 'paused'].includes(state)) { try { onCancel(session); } catch { /* Best-effort cancellation. */ } }
    startToken++; starting = false; clearTimeout(timer); cancelAnimationFrame(raf); raf = 0;
    state = 'ready'; session = null; score = foodsEaten = moves = 0;
    const mx = Math.floor(cols / 2), my = Math.floor(rows / 2);
    snake = [{ x: mx, y: my }, { x: mx - 1, y: my }, { x: mx - 2, y: my }];
    direction = queuedDirection = { x: 1, y: 0 };
    food = { x: Math.min(cols - 2, mx + 4), y: my };
    scoreEl.textContent = '0'; pauseButton.disabled = true; pauseButton.textContent = 'إيقاف مؤقت';
    overlay.hidden = false; heading.textContent = 'جاهز؟'; message.textContent = 'ابدأ اللعب واجمع الطعام لتطويل الثعبان.';
    startButton.hidden = false; startButton.textContent = 'ابدأ اللعب'; status('اضغط «ابدأ اللعب» للبدء.'); draw();
  }
  function draw() {
    if (!ctx || destroyed) return;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0c1724'; ctx.fillRect(0, 0, w, h);
    const cw = w / cols, ch = h / rows;
    ctx.strokeStyle = 'rgba(146,180,204,.08)'; ctx.lineWidth = 1;
    for (let x = 0; x <= cols; x++) { ctx.beginPath(); ctx.moveTo(x * cw, 0); ctx.lineTo(x * cw, h); ctx.stroke(); }
    for (let y = 0; y <= rows; y++) { ctx.beginPath(); ctx.moveTo(0, y * ch); ctx.lineTo(w, y * ch); ctx.stroke(); }
    ctx.fillStyle = '#ffb84d'; ctx.beginPath(); ctx.arc((food.x + .5) * cw, (food.y + .5) * ch, Math.min(cw, ch) * .34, 0, Math.PI * 2); ctx.fill();
    snake.forEach((p, i) => { ctx.fillStyle = i === 0 ? '#58e0b8' : '#19b98f'; const pad = Math.min(cw, ch) * .09; ctx.beginPath(); ctx.roundRect(p.x * cw + pad, p.y * ch + pad, cw - pad * 2, ch - pad * 2, Math.min(cw, ch) * .23); ctx.fill(); });
  }
  function step() {
    if (state !== 'playing' || destroyed) return;
    direction = queuedDirection;
    const head = { x: snake[0].x + direction.x, y: snake[0].y + direction.y };
    const eating = head.x === food.x && head.y === food.y;
    if (head.x < 0 || head.x >= cols || head.y < 0 || head.y >= rows || snake.slice(0, eating ? undefined : -1).some(p => p.x === head.x && p.y === head.y)) { finish(); return; }
    snake.unshift(head); if (!eating) snake.pop(); else { score += 10; foodsEaten++; scoreEl.textContent = String(score); placeFood(); }
    moves++; draw();
    try { onProgress({ score, foodsEaten, moves }); } catch { /* Host callbacks must not break play. */ }
    timer = window.setTimeout(step, Math.max(65, 155 - foodsEaten * 4));
  }
  async function begin() {
    if (destroyed || state === 'playing' || starting) return;
    starting = true; state = 'starting'; const token = ++startToken; startButton.disabled = true; startButton.textContent = 'جارٍ بدء الجولة…'; status('جارٍ بدء الجولة…');
    let nextSession = null; try { nextSession = await onStart(GAME_ID); } catch { status('تعذر الاتصال؛ ستبدأ جولة محلية غير موثقة.', 'warning'); }
    if (destroyed || token !== startToken) return;
    starting = false; session = nextSession ?? null; state = 'playing'; startedAt = Date.now(); lastStepAt = startedAt;
    overlay.hidden = true; pauseButton.disabled = false; startButton.disabled = false; canvas.focus({ preventScroll: true });
    status(session ? 'بدأت الجولة.' : 'بدأ اللعب محليًا؛ لن تُوثّق هذه النتيجة.');
    timer = window.setTimeout(step, 155);
  }
  function finish() {
    if (state !== 'playing') return;
    state = 'ended'; clearTimeout(timer); cancelAnimationFrame(raf); pauseButton.disabled = true;
    const durationMs = Math.max(0, Date.now() - startedAt);
    if (score > best) { best = score; bestEl.textContent = String(best); try { localStorage.setItem(BEST_KEY, String(best)); } catch {} }
    heading.textContent = 'انتهت الجولة'; message.textContent = `نتيجتك ${score} نقطة — جمعت ${foodsEaten} قطعة طعام.`;
    startButton.hidden = false; startButton.textContent = 'العب مجددًا'; overlay.hidden = false;
    status('انتهت الجولة.', 'complete');
    try { onProgress({ score, foodsEaten, moves }); } catch {}
    try { onFinish(session, { score, durationMs, metrics: { foodsEaten, moves } }); } catch {}
  }
  function setDirection(x, y) { if (state !== 'playing') return; if (x === -direction.x && y === -direction.y) return; queuedDirection = { x, y }; }
  function pause() {
    if (state !== 'playing') return;
    state = 'paused'; clearTimeout(timer); pauseButton.textContent = 'استئناف';
    overlay.hidden = false; heading.textContent = 'متوقفة مؤقتًا'; message.textContent = 'خذ وقتك، ثم استأنف الجولة.'; startButton.hidden = true; status('اللعبة متوقفة مؤقتًا.');
  }
  function resume() {
    if (state !== 'paused') return;
    state = 'playing'; overlay.hidden = true; pauseButton.textContent = 'إيقاف مؤقت';
    status('استؤنفت الجولة.'); timer = window.setTimeout(step, Math.max(65, 155 - foodsEaten * 4));
  }
  function restart() { if (destroyed) return; reset(); }
  function onKey(event) {
    const k = event.key.toLowerCase();
    const dirs = { arrowup: [0, -1], w: [0, -1], arrowdown: [0, 1], s: [0, 1], arrowleft: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0] };
    if (dirs[k]) { event.preventDefault(); setDirection(...dirs[k]); }
    else if (k === ' ' && state === 'playing') { event.preventDefault(); pause(); }
    else if (k === ' ' && state === 'paused') { event.preventDefault(); resume(); }
  }
  function onVisibility() { if (document.hidden && state === 'playing') pause(); }
  let touchStart = null;
  function onTouchStart(e) { const t = e.changedTouches[0]; touchStart = { x: t.clientX, y: t.clientY }; }
  function onTouchEnd(e) { if (!touchStart) return; const t = e.changedTouches[0], dx = t.clientX - touchStart.x, dy = t.clientY - touchStart.y; touchStart = null; if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return; if (Math.abs(dx) > Math.abs(dy)) setDirection(Math.sign(dx), 0); else setDirection(0, Math.sign(dy)); }
  startButton.addEventListener('click', begin);
  shell.querySelector('[data-restart]').addEventListener('click', restart);
  pauseButton.addEventListener('click', () => state === 'paused' ? resume() : pause());
  shell.querySelectorAll('[data-dir]').forEach(button => button.addEventListener('click', () => setDirection(...button.dataset.dir.split(',').map(Number))));
  window.addEventListener('keydown', onKey); document.addEventListener('visibilitychange', onVisibility);
  canvas.addEventListener('touchstart', onTouchStart, { passive: true }); canvas.addEventListener('touchend', onTouchEnd, { passive: true });
  const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  observer?.observe(canvas); window.addEventListener('resize', resize); resize(); reset();
  function destroy() {
    if (destroyed) return; if (session && ['playing', 'paused'].includes(state)) { try { onCancel(session); } catch {} } startToken++; destroyed = true; clearTimeout(timer); cancelAnimationFrame(raf); observer?.disconnect();
    window.removeEventListener('resize', resize); window.removeEventListener('keydown', onKey); document.removeEventListener('visibilitychange', onVisibility);
    canvas.removeEventListener('touchstart', onTouchStart); canvas.removeEventListener('touchend', onTouchEnd);
    root.replaceChildren(); state = 'destroyed';
  }
  return { pause, resume, restart, destroy };
}
