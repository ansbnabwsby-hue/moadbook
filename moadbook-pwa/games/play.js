import { GAME_DEFS, GAME_IDS } from './shared/catalog.js';
import { answerGameQuestion, cancelGameSession, finishGameSession, gamesApi, getMoadbookSession, startGameSession } from './shared/api.js';
import { isGameSoundEnabled, playGameSound, setGameSoundEnabled } from './shared/sound.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const gameId = params.get('game') || '';
const game = GAME_DEFS.find(item => item.id === gameId);
const title = $('mgPlayTitle');
const description = $('mgPlayDescription');
const root = $('mgGameRoot');
const stage = $('mgGameStage');
const statusNode = $('mgPlayStatus');
const finishNode = $('mgFinishBanner');
const pauseButton = $('mgPause');
const resumeButton = $('mgResume');
const restartButton = $('mgRestart');
const scoreNode = $('mgPlayScore');
const bestNode = $('mgPlayBest');
const fullscreenButtons = [$('mgFullscreen'), $('mgPlayFullscreen')].filter(Boolean);
const soundToggle = $('mgSoundToggle');
let instance = null;
let activeSession = null;
let sessionReady = false;
let user = null;
let paused = false;
let finished = false;
let destroyed = false;

function showStatus(message, kind = 'info') {
  statusNode.textContent = String(message || '');
  statusNode.dataset.kind = kind;
  statusNode.classList.toggle('error', kind === 'error');
  statusNode.classList.toggle('success', kind === 'success');
  statusNode.hidden = !message;
}

function showFinish(message, kind = 'success') {
  finishNode.textContent = String(message || '');
  finishNode.dataset.kind = kind;
  finishNode.hidden = !message;
}

function setPaused(value) {
  paused = Boolean(value);
  pauseButton.hidden = paused;
  resumeButton.hidden = !paused;
}

function loginGate(message) {
  const card = document.createElement('section');
  card.className = 'mg-auth-card';
  const heading = document.createElement('h2');
  heading.textContent = 'سجّل الدخول للعب الموثّق';
  const copy = document.createElement('p');
  copy.textContent = message || 'سجّل الدخول إلى حساب Moadbook حتى تُحفظ نتائجك وإنجازاتك وتظهر في ترتيب اللاعبين.';
  const link = document.createElement('a');
  link.className = 'mg-button';
  link.href = '../index.html';
  link.textContent = 'فتح Moadbook';
  const back = document.createElement('a');
  back.className = 'mg-inline-link';
  back.href = './';
  back.textContent = 'العودة إلى مركز الألعاب';
  card.append(heading, copy, link, back);
  root.replaceChildren(card);
}

function setGameControls(enabled) {
  pauseButton.disabled = !enabled;
  restartButton.disabled = !user;
  if (!enabled) setPaused(false);
}

async function enterFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (stage.requestFullscreen) await stage.requestFullscreen({ navigationUI: 'hide' });
    else stage.classList.add('mg-fullscreen-fallback');
  } catch {
    stage.classList.add('mg-fullscreen-fallback');
    showStatus('تعذر تفعيل وضع الشاشة الكاملة؛ تم توسيع مساحة اللعب بدلًا منه.', 'warning');
  }
}

for (const button of fullscreenButtons) button.addEventListener('click', enterFullscreen);
$('mgExit')?.addEventListener('click', () => { instance?.destroy?.(); });
$('mgRestart')?.addEventListener('click', () => {
  if (!instance || destroyed) return;
  finished = false;
  activeSession = null;
  sessionReady = false;
  showFinish('');
  scoreNode.textContent = '0';
  showStatus('أعيد ضبط الجولة. ابدأ من داخل اللعبة لتسجيل جلسة جديدة.');
  setPaused(false);
  instance.restart?.();
});
$('mgPause')?.addEventListener('click', () => {
  instance?.pause?.();
  if (!pauseButton.disabled) setPaused(true);
});
$('mgResume')?.addEventListener('click', () => {
  instance?.resume?.();
  setPaused(false);
});

document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement) stage.classList.remove('mg-fullscreen-fallback');
});

function syncSoundToggle() {
  if (!soundToggle) return;
  const enabled = isGameSoundEnabled();
  soundToggle.setAttribute('aria-pressed', String(enabled));
  soundToggle.setAttribute('aria-label', enabled ? 'إيقاف صوت الألعاب' : 'تشغيل صوت الألعاب');
  soundToggle.title = enabled ? 'الصوت مفعّل' : 'الصوت متوقف';
  soundToggle.classList.toggle('is-muted', !enabled);
  const waves = soundToggle.querySelector('[data-sound-waves]');
  const muted = soundToggle.querySelector('[data-sound-muted]');
  if (waves) waves.hidden = !enabled;
  if (muted) muted.hidden = enabled;
}
soundToggle?.addEventListener('click', () => {
  const enabled = setGameSoundEnabled(!isGameSoundEnabled());
  syncSoundToggle();
  if (enabled) playGameSound('success');
});
syncSoundToggle();

function soundForPointer(event) {
  const target = event.target;
  if (!(target instanceof Element) || target.closest('button:disabled, input, select, textarea')) return;
  if (target.closest('button, canvas, [role="button"]')) playGameSound('tap');
}
function soundForKey(event) {
  if (['Enter', ' ', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd'].includes(event.key)) playGameSound('tap');
}
root.addEventListener('pointerdown', soundForPointer, true);
root.addEventListener('keydown', soundForKey, true);

async function startSession(requestedGameId, options = {}) {
  if (!user || requestedGameId !== gameId) throw new Error('AUTH_REQUIRED');
  finished = false;
  showFinish('');
  scoreNode.textContent = '0';
  try {
    const session = await startGameSession(requestedGameId, options);
    if (!session) throw new Error('SESSION_NOT_CREATED');
    activeSession = session;
    sessionReady = true;
    setGameControls(true);
    showStatus('بدأت جولة موثّقة بحسابك. بالتوفيق!');
    return session;
  } catch (error) {
    activeSession = null;
    sessionReady = false;
    setGameControls(true);
    const text = error?.code === 'AUTH_REQUIRED'
      ? 'انتهت جلسة الدخول؛ سجّل الدخول مجددًا لتوثيق النتيجة.'
      : 'تعذر بدء جلسة موثقة الآن. يمكنك اللعب محليًا، لكن لن تُضاف نقاط أو نتائج رسمية.';
    showStatus(text, 'warning');
    return null;
  }
}

async function cancelSession(session) {
  if (!session?.id) return;
  try { await cancelGameSession(session); } catch { /* Server expires abandoned sessions automatically. */ }
  if (activeSession?.id === session.id) {
    activeSession = null;
    sessionReady = false;
  }
}

async function verifyAnswer(session, answer) {
  return answerGameQuestion(session, answer);
}

async function submitResult(session, result) {
  if (finished) return null;
  finished = true;
  setGameControls(false);
  if (!session?.id || !sessionReady) {
    playGameSound('finish');
    showStatus('اكتملت الجولة المحلية. هذه النتيجة لا تُضاف إلى ترتيب Moadbook.', 'warning');
    showFinish(`نتيجتك على هذا الجهاز: ${Math.max(0, Math.floor(Number(result?.score) || 0))}. اتصل بالخادم وابدأ جولة جديدة لتوثيق النتائج.`, 'local');
    return { accepted: false, status: 'local' };
  }
  try {
    const receipt = await finishGameSession(session, result);
    const officialScore = Number.isFinite(Number(receipt?.verifiedScore)) ? Number(receipt.verifiedScore) : 0;
    playGameSound(receipt?.accepted === true ? 'finish' : 'error');
    scoreNode.textContent = String(officialScore);
    const points = Math.max(0, Number(receipt?.pointsAwarded) || 0);
    if (receipt?.accepted === true) {
      showStatus(`تم التحقق من الجولة. أُضيف ${points} من نقاط اللعب غير النقدية.`, 'success');
      showFinish(`النتيجة الموثّقة: ${officialScore} — +${points} نقطة لعب. ستظهر إنجازاتك ولوحة الترتيب بعد التحديث.`, 'success');
    } else if (receipt?.status === 'review') {
      showStatus('أُرسلت النتيجة للمراجعة ولم تُضف نقاطًا بعد.', 'warning');
      showFinish(`النتيجة قيد المراجعة. النتيجة المقترحة ${officialScore}، وستُحدّث بعد مراجعة الإدارة.`, 'review');
    } else if (receipt?.status === 'partial') {
      showStatus('تم حفظ الإجابات التي وصلت للخادم، لكن الجولة غير مكتملة؛ لم تُمنح نقاط ترتيب.', 'warning');
      showFinish(`الإجابات الصحيحة الموثقة: ${officialScore}. لا توجد نقاط ترتيب لجولة غير مكتملة.`, 'partial');
    } else {
      showStatus('انتهت الجولة، لكن لم تُقبل النتيجة الرسمية. لا تُضاف نقاط لهذا الإرسال.', 'warning');
      showFinish('تعذر اعتماد النتيجة. راجع حالة الاتصال، ثم ابدأ جولة جديدة.', 'rejected');
    }
    return receipt;
  } catch {
    showStatus('تعذر إرسال النتيجة إلى الخادم. لن تُضاف نقاط إلى الترتيب.', 'warning');
    showFinish('تعذر مزامنة الجولة. أعد الاتصال ثم أعد الجولة لتوثيق نتيجة جديدة.', 'rejected');
    return null;
  } finally {
    activeSession = null;
    sessionReady = false;
  }
}

async function boot() {
  if (!game || !GAME_IDS.has(gameId)) {
    title.textContent = 'اللعبة غير موجودة';
    root.textContent = 'هذه اللعبة غير متاحة. عد إلى مركز الألعاب واختر لعبة من الكتالوج.';
    return;
  }
  title.textContent = game.name;
  description.textContent = game.description;
  document.title = `${game.name} — MOADBOOK GAMES`;
  const style = document.createElement('link');
  style.rel = 'stylesheet';
  style.href = `./${gameId}/game.css`;
  document.head.append(style);
  showStatus('جارٍ التحقق من حساب Moadbook…');
  const currentSession = await getMoadbookSession();
  user = currentSession?.user || null;
  if (!currentSession?.idToken || !user?.id) {
    showStatus('يلزم حساب Moadbook لتسجيل نتيجة رسمية.');
    loginGate();
    setGameControls(false);
    return;
  }
  const welcome = user.displayName || user.username || 'لاعب Moadbook';
  showStatus(`أهلًا ${welcome}. ستُوثق الجولات المكتملة من الخادم فقط.`);
  try {
    const summary = await gamesApi('dashboard');
    const best = Number(summary?.profile?.bestScores?.[gameId]);
    bestNode.textContent = Number.isFinite(best) && best >= 0 ? String(best) : '—';
  } catch { bestNode.textContent = '—'; }
  try {
    const module = await import(`./${gameId}/game.js`);
    if (destroyed) return;
    instance = module.mountGame(root, {
      onStart: startSession,
      onCancel: cancelSession,
      onAnswer: verifyAnswer,
      onFinish: submitResult,
      onStatus: (message, kind = 'info') => {
        if (message) showStatus(message, kind);
        const text = String(message || '');
        if (/تطابق صحيح|إجابة صحيحة|ممتاز!|اكتمل التحدي|انتصرت|فزت/.test(text)) playGameSound('success');
        else if (/إجابة غير صحيحة|لا يمكن وضع|اصطدمت|خسرت/.test(text)) playGameSound('error');
        if (/انتهت الجولة|انتهت اللعبة|انتهى الوقت|اكتملت/.test(String(message))) {
          setGameControls(false);
          if (!finished) showFinish('جارٍ التحقق من النتيجة…', 'pending');
        }
      },
      onProgress: (metrics) => {
        const value = Number(metrics?.score);
        if (Number.isFinite(value) && value >= 0) scoreNode.textContent = String(Math.floor(value));
      },
    });
    setGameControls(false);
  } catch (error) {
    root.textContent = 'تعذر تحميل اللعبة. تحقق من الاتصال ثم حدّث الصفحة.';
    showStatus('حدث خطأ أثناء تحميل وحدة اللعبة.', 'error');
    console.error('Moadbook game load failed:', error?.message || error);
  }
}

window.addEventListener('pagehide', () => {
  destroyed = true;
  try { instance?.destroy?.(); } catch { /* Best-effort teardown. */ }
  root.removeEventListener('pointerdown', soundForPointer, true);
  root.removeEventListener('keydown', soundForKey, true);
});

void boot();
