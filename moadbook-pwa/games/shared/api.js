const SESSION_KEY = 'moadbook-web-session-v2';
const LEGACY_SESSION_KEY = 'moadbook-web-session-v1';
const REFRESH_URL = 'https://securetoken.googleapis.com/v1/token';
const PUBLIC_ACTIONS = new Set(['catalog']);

function parseStored(value) {
  if (!value || typeof value !== 'string') return null;
  try { return JSON.parse(value); } catch { return null; }
}

function readSession() {
  try {
    const secureValue = window.MoadbookSecureStore?.load?.();
    const secure = parseStored(typeof secureValue === 'string' ? secureValue : '');
    if (secure?.idToken && secure?.user?.id) return secure;
  } catch { /* optional Android secure storage */ }
  try {
    const current = parseStored(localStorage.getItem(SESSION_KEY));
    if (current?.idToken && current?.user?.id) return current;
    const legacy = parseStored(sessionStorage.getItem(LEGACY_SESSION_KEY));
    return legacy?.idToken && legacy?.user?.id ? legacy : null;
  } catch { return null; }
}

function saveSession(session) {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch { /* private browsing */ }
  try { window.MoadbookSecureStore?.save?.(JSON.stringify(session)); } catch { /* optional Android secure storage */ }
}

export async function getMoadbookSession({ refresh = true } = {}) {
  const session = readSession();
  if (!session) return null;
  if (Number(session.expiresAt || 0) > Date.now() + 60_000) return session;
  if (!refresh || !session.refreshToken) return null;
  const apiKey = window.MOADBOOK_FIREBASE?.apiKey;
  if (!apiKey) return null;
  try {
    const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: session.refreshToken });
    const response = await fetch(`${REFRESH_URL}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString(),
    });
    const result = await response.json();
    if (!response.ok || !result.id_token || !result.user_id) return null;
    const refreshed = {
      ...session,
      idToken: result.id_token,
      refreshToken: result.refresh_token || session.refreshToken,
      expiresAt: Date.now() + Number(result.expires_in || 3600) * 1000,
      user: { ...(session.user || {}), id: result.user_id },
    };
    saveSession(refreshed);
    return refreshed;
  } catch { return null; }
}


function toWirePayload(action, payload) {
  switch (action) {
    case 'start_session': return { game_id: payload.gameId, options: payload.options || {} };
    case 'cancel_session': return { session_id: payload.sessionId, session_token: payload.sessionToken };
    case 'answer_question': return { session_id: payload.sessionId, session_token: payload.sessionToken, question_id: payload.questionId, choice_index: payload.choiceIndex, elapsed_ms: payload.elapsedMs };
    case 'finish_session': return { session_id: payload.sessionId, session_token: payload.sessionToken, client_score: payload.clientScore, duration_ms: payload.durationMs, metrics: payload.metrics || {} };
    case 'leaderboard': return { game_id: payload.gameId === 'overall' ? null : payload.gameId, period: payload.period, limit: payload.limit };
    case 'admin_save_game': {
      const patch = { ...(payload.patch || {}) };
      if (payload.name !== undefined) patch.title = payload.name;
      if (payload.description !== undefined) patch.description = payload.description;
      if (payload.enabled !== undefined) patch.enabled = payload.enabled;
      if (payload.featured !== undefined) patch.featured = payload.featured;
      return { game_id: payload.gameId, patch };
    }
    case 'admin_save_achievement': return { id: payload.id, points: payload.points, enabled: payload.enabled };
    case 'admin_review_score': return { score_id: payload.scoreId, decision: payload.decision };
    case 'admin_save_question': return { question: {
      id: payload.id || null, game_id: 'quiz', category_id: payload.categoryId, category: payload.category,
      prompt: payload.prompt, choices: payload.options, answer_index: payload.correctIndex,
      difficulty: payload.difficulty, explanation: payload.explanation, enabled: true,
      source_url: payload.sourceUrl, source_title: payload.sourceTitle, evidence: payload.sourceEvidence,
    } };
    case 'admin_toggle_question': return { question_id: payload.questionId, enabled: payload.enabled };
    case 'admin_save_challenge': return { game_id: payload.gameId, metric: payload.metric, target: payload.target, reward_points: payload.rewardPoints, title: payload.title };
    case 'admin_save_setting': return { key: payload.key, value: payload.value };
    default: return payload;
  }
}

export async function gamesApi(action, payload = {}, requestOptions = {}) {
  const isPublic = PUBLIC_ACTIONS.has(action);
  const session = await getMoadbookSession({ refresh: !isPublic });
  if (!isPublic && !session?.idToken) {
    const error = new Error('سجّل الدخول إلى Moadbook للمتابعة.');
    error.code = 'AUTH_REQUIRED';
    throw error;
  }
  const config = window.MOADBOOK_SUPABASE || {};
  if (!config.url || !config.publishableKey) {
    const error = new Error('خدمة الألعاب غير مهيأة.');
    error.code = 'GAMES_API_NOT_CONFIGURED';
    throw error;
  }
  const headers = { 'Content-Type': 'application/json', 'apikey': config.publishableKey };
  if (session?.idToken) headers.Authorization = `Bearer ${session.idToken}`;
  const response = await fetch(`${config.url.replace(/\/$/, '')}/functions/v1/moadbook-games-api`, {
    method: 'POST', headers,
    body: JSON.stringify({ ...toWirePayload(action, payload), action }),
    keepalive: requestOptions.keepalive === true,
  });
  let data;
  try { data = await response.json(); } catch { data = null; }
  if (!response.ok) {
    const error = new Error(String(data?.message || data?.error || `GAMES_API_${response.status}`));
    error.code = String(data?.code || data?.error || `GAMES_API_${response.status}`);
    throw error;
  }
  return data?.data ?? data ?? {};
}

export async function startGameSession(gameId, options = {}) {
  const result = await gamesApi('start_session', { gameId, options });
  return result.session || null;
}

export async function cancelGameSession(session) {
  if (!session?.id) return { cancelled: false };
  return gamesApi('cancel_session', { sessionId: session.id, sessionToken: session.sessionToken }, { keepalive: true });
}

export async function answerGameQuestion(session, answer) {
  if (!session?.id) throw new Error('QUIZ_SESSION_REQUIRED');
  return gamesApi('answer_question', { sessionId: session.id, sessionToken: session.sessionToken, ...answer });
}

export async function finishGameSession(session, result) {
  if (!session?.id) return { accepted: false, status: 'local' };
  return gamesApi('finish_session', {
    sessionId: session.id,
    sessionToken: session.sessionToken,
    clientScore: Number(result?.score || 0),
    durationMs: Number(result?.durationMs || 0),
    metrics: result?.metrics && typeof result.metrics === 'object' ? result.metrics : {},
  });
}

export function getRecentGames() {
  try {
    const value = JSON.parse(localStorage.getItem('moadbook.games.recent.v1') || '[]');
    return Array.isArray(value) ? value.filter(item => typeof item === 'string').slice(0, 5) : [];
  } catch { return []; }
}

export function saveRecentGame(slug) {
  const current = getRecentGames().filter(item => item !== slug);
  current.unshift(slug);
  try { localStorage.setItem('moadbook.games.recent.v1', JSON.stringify(current.slice(0, 5))); } catch { /* optional */ }
}
