const GAME_ID = 'runner';
const BEST_KEY = 'moadbook.runner.personalBest.v1';

export function mountGame(root, { onStart = () => null, onCancel = () => {}, onFinish = () => {}, onStatus = () => {}, onProgress = () => {} } = {}) {
  if (!root) throw new TypeError('A root element is required.');
  let destroyed = false;
  let raf = 0;
  let state = 'ready';
  let session = null;
  let startedAt = 0;
  let lastFrame = 0;
  let distance = 0;
  let coins = 0;
  let dodged = 0;
  let speed = 250;
  let spawnIn = 1.05;
  let entities = [];
  let jump = 0;
  let jumpVelocity = 0;
  let finishSent = false;
  let startToken = 0;
  let lastProgressAt = 0;
  let best = readBest();
  let width = 720;
  let height = 360;
  let dpr = 1;
  let reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  const shell = document.createElement('section');
  shell.className = 'mg-runner-shell';
  shell.dir = 'rtl';
  shell.setAttribute('aria-label', 'لعبة موآد رانر');
  shell.innerHTML = `<header class="mg-runner-header"><div><p class="mg-runner-eyebrow">تحدّي الجري</p><h1 class="mg-runner-title">موآد رانر</h1></div><div class="mg-runner-stats" aria-live="polite"><span>المسافة <b data-distance>0</b> م</span><span>العملات <b data-coins>0</b></span><span>أفضل نتيجة <b data-best>0</b> م</span></div></header>
  <div class="mg-runner-stage"><canvas class="mg-runner-canvas" aria-label="مسار اللعبة؛ انقر أو اضغط للقفز" role="img"></canvas>
  <div class="mg-runner-overlay" data-overlay aria-live="polite"><div class="mg-runner-card"><h2 data-heading>جاهز للانطلاق؟</h2><p data-message>اقفز فوق العوائق واجمع العملات. المسافة هي نتيجتك.</p><button class="mg-runner-primary" data-main>ابدأ اللعب</button></div></div>
  <div class="mg-runner-paused" data-paused hidden><p>اللعبة متوقفة</p><button class="mg-runner-primary" data-resume>متابعة</button></div></div>
  <div class="mg-runner-controls"><p class="mg-runner-help">القفز: المس الشاشة أو اضغط Space أو ↑ أو W</p><div class="mg-runner-actions"><button class="mg-runner-secondary" data-pause disabled>إيقاف مؤقت</button><button class="mg-runner-jump" data-jump aria-label="اقفز">اقفز</button></div></div>
  <p class="mg-runner-status" data-status role="status" aria-live="polite"></p></section>`;
  root.replaceChildren(shell);
  const canvas = shell.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const overlay = shell.querySelector('[data-overlay]');
  const pausedPanel = shell.querySelector('[data-paused]');
  const primary = shell.querySelector('[data-main]');
  const pauseButton = shell.querySelector('[data-pause]');
  const status = shell.querySelector('[data-status]');
  const distanceEl = shell.querySelector('[data-distance]');
  const coinsEl = shell.querySelector('[data-coins]');
  const bestEl = shell.querySelector('[data-best]');
  bestEl.textContent = String(best);

  function report(text, kind = 'info') {
    status.textContent = text;
    try { onStatus(text, kind); } catch { /* Host status callbacks must not break play. */ }
  }
  function readBest() {
    try { return Math.max(0, Number.parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0); } catch { return 0; }
  }
  function saveBest(value) {
    best = Math.max(best, value);
    try { localStorage.setItem(BEST_KEY, String(best)); } catch { /* Private browsing may disable storage. */ }
    bestEl.textContent = String(best);
  }
  function resize() {
    if (destroyed) return;
    const rect = canvas.getBoundingClientRect();
    width = Math.max(320, rect.width);
    height = Math.max(240, rect.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }
  function groundY() { return height - 40; }
  function draw() {
    if (!ctx || destroyed) return;
    const ground = groundY();
    ctx.clearRect(0, 0, width, height);
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, '#10264a'); sky.addColorStop(1, '#17465b');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(133,205,212,.14)';
    for (let i = 0; i < 5; i++) {
      const x = ((i * 183 - distance * (reduced ? 0.12 : 0.26)) % (width + 130) + width + 130) % (width + 130) - 70;
      ctx.beginPath(); ctx.ellipse(x, ground - 35 - (i % 2) * 14, 48, 13, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#162c3f'; ctx.fillRect(0, ground, width, height - ground);
    ctx.fillStyle = '#f4c76b'; ctx.fillRect(0, ground, width, 3);
    ctx.strokeStyle = 'rgba(244,199,107,.45)'; ctx.lineWidth = 2;
    for (let i = 0; i < 12; i++) {
      const x = ((i * 78 - distance * 1.2) % (width + 78) + width + 78) % (width + 78) - 40;
      ctx.beginPath(); ctx.moveTo(x, ground + 20); ctx.lineTo(x + 24, ground + 20); ctx.stroke();
    }
    const px = Math.max(62, width * 0.17), py = ground - 34 - jump;
    // Original geometric runner, animated without external assets.
    ctx.fillStyle = '#f4c76b'; ctx.beginPath(); ctx.arc(px + 17, py + 8, 11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#54d5c0'; ctx.fillRect(px + 3, py + 18, 28, 17);
    ctx.fillStyle = '#eaf8f4'; ctx.fillRect(px + 22, py + 4, 3, 3);
    const legSwing = state === 'playing' && !reduced ? Math.sin(distance * .09) * 5 : 0;
    ctx.strokeStyle = '#f4c76b'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(px + 10, py + 32); ctx.lineTo(px + 8 + legSwing, py + 40); ctx.moveTo(px + 25, py + 32); ctx.lineTo(px + 27 - legSwing, py + 40); ctx.stroke();
    for (const e of entities) {
      if (e.type === 'coin') {
        ctx.fillStyle = '#ffd76a'; ctx.beginPath(); ctx.arc(e.x, e.y, 9, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#fff2bd'; ctx.lineWidth = 2; ctx.stroke();
      } else {
        ctx.fillStyle = '#ef7768'; ctx.beginPath(); ctx.roundRect(e.x, ground - e.h, e.w, e.h, 4); ctx.fill();
        ctx.fillStyle = '#ffb5a6'; ctx.fillRect(e.x + 5, ground - e.h + 7, 5, 4);
      }
    }
  }
  function notifyProgress() {
    try { onProgress({ score: Math.max(0, Math.floor(distance)), distanceMeters: Math.max(0, Math.floor(distance)), coins, obstaclesDodged: dodged }); } catch { /* Host callbacks must not break play. */ }
  }
  function resetRound() {
    if (session && !finishSent) { try { onCancel(session); } catch { /* Best-effort cancellation. */ } }
    startToken++; session = null; distance = 0; coins = 0; dodged = 0; speed = 250; spawnIn = 1.05;
    entities = []; jump = 0; jumpVelocity = 0; finishSent = false;
    distanceEl.textContent = '0'; coinsEl.textContent = '0';
  }
  async function begin() {
    if (destroyed || state === 'playing' || state === 'starting') return;
    resetRound(); const token = ++startToken; state = 'starting'; primary.disabled = true;
    let newSession = null;
    try { newSession = await onStart(GAME_ID); } catch { report('تعذر الاتصال بالخادم؛ ستلعب محليًا.', 'warning'); }
    if (destroyed || token !== startToken || state !== 'starting') return;
    session = newSession ?? null;
    startedAt = performance.now(); lastFrame = startedAt; state = 'playing';
    overlay.hidden = true; pausedPanel.hidden = true; pauseButton.disabled = false; primary.disabled = false;
    report(session ? 'بدأت الجولة.' : 'بدأت جولة محلية؛ قد لا تُسجّل نتيجتها.', session ? 'success' : 'info');
    raf = requestAnimationFrame(tick);
  }
  function endGame() {
    if (state !== 'playing' || finishSent) return;
    state = 'over'; finishSent = true; cancelAnimationFrame(raf); raf = 0;
    const finalScore = Math.max(0, Math.floor(distance));
    const durationMs = Math.max(0, Math.floor(performance.now() - startedAt));
    saveBest(finalScore);
    shell.querySelector('[data-heading]').textContent = 'انتهت الجولة';
    shell.querySelector('[data-message]').textContent = `قطعت ${finalScore} مترًا وجمعت ${coins} عملة. أفضل نتيجة: ${best} م.`;
    primary.textContent = 'العب مجددًا'; primary.disabled = false; overlay.hidden = false;
    pauseButton.disabled = true; draw();
    report('انتهت الجولة. يمكنك بدء جولة جديدة.', 'info');
    notifyProgress();
    try { onFinish(session, { score: finalScore, durationMs, metrics: { distanceMeters: finalScore, coins, obstaclesDodged: dodged } }); } catch { report('تعذر إرسال نتيجة الجولة.', 'warning'); }
  }
  function tick(now) {
    if (destroyed || state !== 'playing') return;
    const dt = Math.min(.04, Math.max(0, (now - lastFrame) / 1000)); lastFrame = now;
    distance += speed * dt / 10;
    speed = Math.min(510, 250 + distance * .22);
    spawnIn -= dt;
    if (spawnIn <= 0) {
      const obstacle = Math.random() < .67;
      entities.push(obstacle ? { type: 'obstacle', x: width + 18, w: 24 + Math.random() * 15, h: 26 + Math.random() * 27 } : { type: 'coin', x: width + 18, y: groundY() - 60 - Math.random() * 40 });
      spawnIn = Math.max(.65, 1.35 - distance / 800) + Math.random() * .65;
    }
    if (jump > 0 || jumpVelocity > 0) {
      jump += jumpVelocity * dt; jumpVelocity -= 1250 * dt;
      if (jump <= 0) { jump = 0; jumpVelocity = 0; }
    }
    const playerX = Math.max(62, width * .17) + 3;
    for (const e of entities) {
      e.x -= speed * dt;
      if (e.type === 'obstacle' && !e.counted && e.x + e.w < playerX) { e.counted = true; dodged++; }
      if (e.type === 'coin' && !e.collected && e.x > playerX - 13 && e.x < playerX + 40 && Math.abs(e.y - (groundY() - 34 - jump + 20)) < 29) { e.collected = true; coins++; coinsEl.textContent = String(coins); }
      if (e.type === 'obstacle' && e.x < playerX + 29 && e.x + e.w > playerX + 4 && jump < e.h - 7) { draw(); endGame(); return; }
    }
    entities = entities.filter(e => e.x > -50 && !e.collected);
    distanceEl.textContent = String(Math.floor(distance));
    if (now - lastProgressAt >= 250) { lastProgressAt = now; notifyProgress(); }
    draw(); raf = requestAnimationFrame(tick);
  }
  function doJump() {
    if (state === 'ready' || state === 'over') { begin(); return; }
    if (state === 'playing' && jump === 0) { jumpVelocity = reduced ? 540 : 610; }
  }
  function pause() {
    if (destroyed || state !== 'playing') return;
    state = 'paused'; cancelAnimationFrame(raf); raf = 0; pausedPanel.hidden = false; pauseButton.textContent = 'متابعة'; report('اللعبة متوقفة مؤقتًا.', 'info');
  }
  function resume() {
    if (destroyed || state !== 'paused') return;
    state = 'playing'; pausedPanel.hidden = true; pauseButton.textContent = 'إيقاف مؤقت'; lastFrame = performance.now(); raf = requestAnimationFrame(tick); report('استؤنفت الجولة.', 'info');
  }
  function restart() {
    if (destroyed) return;
    cancelAnimationFrame(raf); raf = 0; resetRound(); state = 'ready';
    overlay.hidden = false; pausedPanel.hidden = true; pauseButton.disabled = true; pauseButton.textContent = 'إيقاف مؤقت';
    shell.querySelector('[data-heading]').textContent = 'جاهز للانطلاق؟';
    shell.querySelector('[data-message]').textContent = 'اقفز فوق العوائق واجمع العملات. المسافة هي نتيجتك.';
    primary.textContent = 'ابدأ اللعب'; primary.disabled = false; report('جاهز لجولة جديدة.', 'info'); draw();
  }
  function keydown(event) {
    if (['Space', 'ArrowUp', 'KeyW'].includes(event.code)) { event.preventDefault(); doJump(); }
    else if (event.code === 'Escape' || event.code === 'KeyP') { event.preventDefault(); state === 'paused' ? resume() : pause(); }
  }
  const onVisibility = () => { if (document.hidden) pause(); };
  primary.addEventListener('click', begin);
  shell.querySelector('[data-jump]').addEventListener('click', doJump);
  shell.querySelector('[data-resume]').addEventListener('click', resume);
  pauseButton.addEventListener('click', () => state === 'paused' ? resume() : pause());
  canvas.addEventListener('pointerdown', doJump);
  window.addEventListener('keydown', keydown);
  document.addEventListener('visibilitychange', onVisibility);
  const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  observer?.observe(canvas);
  resize(); report('اضغط ابدأ للانطلاق.', 'info');
  return {
    pause, resume, restart,
    destroy() {
      if (destroyed) return;
      if (session && !finishSent) { try { onCancel(session); } catch { /* Best-effort cancellation. */ } }
      startToken++; destroyed = true; state = 'destroyed'; cancelAnimationFrame(raf); raf = 0;
      observer?.disconnect(); window.removeEventListener('keydown', keydown); document.removeEventListener('visibilitychange', onVisibility);
      primary.removeEventListener('click', begin); canvas.removeEventListener('pointerdown', doJump);
      shell.querySelector('[data-jump]').removeEventListener('click', doJump);
      shell.querySelector('[data-resume]').removeEventListener('click', resume);
      pauseButton.replaceWith(pauseButton.cloneNode(true));
      shell.remove();
    }
  };
}
