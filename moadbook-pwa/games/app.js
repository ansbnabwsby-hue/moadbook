import { gamesApi, getMoadbookSession, getRecentGames, saveRecentGame } from './shared/api.js';
import { GAME_DEFS } from './shared/catalog.js';

const $ = (id) => document.getElementById(id);
const ADMIN_EMAIL = 'moad33@accounts.example.com';
const ICONS = { runner: '↗', memory: '◇', quiz: '؟', 'block-puzzle': '▦', snake: '⌁', 'tic-tac-toe': '×' };
const nodes = {
  identity: $('mgIdentity'), notice: $('mgNotice'), featured: $('mgFeaturedGames'), all: $('mgAllGames'),
  count: $('mgGameCount'), quickStats: $('mgQuickStats'), challenges: $('mgDailyChallenges'),
  achievements: $('mgAchievementPreview'), leaderboardPreview: $('mgLeaderboardPreview'), recent: $('mgRecentGames'),
  profile: $('mgProfile'), recentScores: $('mgRecentScores'), leaderboard: $('mgLeaderboard'),
  adminTab: $('mgAdminTab'), adminStatus: $('mgAdminStatus'), adminStats: $('mgAdminStats'), adminGames: $('mgAdminGames'),
  adminAchievements: $('mgAdminAchievements'), suspicious: $('mgSuspiciousScores'),
};
let session = null;
let user = null;
let isAdmin = false;
let catalog = GAME_DEFS.map(game => ({ ...game, enabled: true }));
let dashboard = null;
let adminOverview = null;
let activeView = 'discover';
let discoverFilter = 'all';

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}
function clear(node) { node.replaceChildren(); }
function empty(text) { return element('div', 'mg-empty', text); }
function number(value) { return new Intl.NumberFormat('ar').format(Math.max(0, Number(value) || 0)); }
function slugName(id) { return catalog.find(item => item.id === id)?.name || GAME_DEFS.find(item => item.id === id)?.name || id; }
function gameIcon(game) {
  const icon = element('div', 'mg-game-icon');
  const fallback = String(game.icon || ICONS[game.id] || '✦').slice(0, 8);
  if (typeof game.imageUrl === 'string' && /^https:\/\//i.test(game.imageUrl)) {
    const image = document.createElement('img');
    image.src = game.imageUrl; image.alt = ''; image.loading = 'lazy'; image.referrerPolicy = 'no-referrer';
    image.addEventListener('error', () => { icon.replaceChildren(); icon.textContent = fallback; }, { once: true });
    icon.append(image);
  } else icon.textContent = fallback;
  return icon;
}
function notify(message, kind = 'info') {
  nodes.notice.textContent = String(message || '');
  nodes.notice.className = `mg-notice${kind === 'error' ? ' error' : kind === 'success' ? ' success' : ''}`;
  nodes.notice.hidden = !message;
}
function adminNotify(message, kind = 'info') {
  if (!nodes.adminStatus) return;
  nodes.adminStatus.textContent = String(message || '');
  nodes.adminStatus.className = `mg-notice${kind === 'error' ? ' error' : kind === 'success' ? ' success' : ''}`;
}

function makeGameCard(game, featured = false) {
  const card = element('article', 'mg-game-card');
  card.dataset.game = game.id;
  card.dataset.accent = ['mint', 'gold', 'blue', 'green', 'violet'].includes(game.accent) ? game.accent : 'violet';
  if (!game.enabled) card.classList.add('mg-disabled-card');
  const top = element('div', 'mg-game-card-top');
  top.append(gameIcon(game));
  top.append(element('span', 'mg-game-badge', game.featured ? 'اختيار مميز' : 'جولة قصيرة'));
  const title = element('h3', 'mg-game-title', game.name || game.id);
  const desc = element('p', 'mg-game-desc', game.description || 'لعبة Moadbook.');
  const bottom = element('div', 'mg-game-card-bottom');
  const play = element('a', 'mg-play-link', game.enabled ? 'العب الآن ←' : 'متوقفة مؤقتًا');
  play.href = game.enabled ? `./${encodeURIComponent(game.id)}/` : '#';
  if (game.enabled) play.addEventListener('click', () => saveRecentGame(game.id));
  else { play.setAttribute('aria-disabled', 'true'); play.addEventListener('click', event => event.preventDefault()); }
  bottom.append(play);
  card.append(top, title, desc, bottom);
  if (featured) card.classList.add('is-featured');
  return card;
}

function renderCatalog() {
  const enabled = catalog.filter(game => game.enabled !== false);
  const query = String($('mgGameSearch')?.value || '').trim().toLocaleLowerCase('ar');
  const gameFilter = $('mgLeaderboardGame');
  if (gameFilter) {
    const previous = gameFilter.value || 'overall';
    const options = [new Option('عام — نقاط الإنجازات', 'overall'), ...enabled.map(game => new Option(game.name, game.id))];
    gameFilter.replaceChildren(...options);
    gameFilter.value = options.some(option => option.value === previous) ? previous : 'overall';
  }
  const featured = enabled.filter(game => game.featured).slice(0, 3);
  const visibleGames = enabled.filter(game => {
    if (discoverFilter === 'featured' && !game.featured) return false;
    if (!query) return true;
    return [game.name, game.title, game.description, game.id].some(value => String(value || '').toLocaleLowerCase('ar').includes(query));
  });
  nodes.featured.replaceChildren(...(featured.length ? featured.map(game => makeGameCard(game, true)) : [empty('لا توجد ألعاب مميزة حاليًا.') ]));
  const showFeatured = !query && discoverFilter === 'all' && featured.length > 0;
  nodes.featured.hidden = !showFeatured;
  if (nodes.featured.previousElementSibling) nodes.featured.previousElementSibling.hidden = !showFeatured;
  nodes.all.replaceChildren(...(visibleGames.length ? visibleGames.map(game => makeGameCard(game)) : [empty(query || discoverFilter === 'featured' ? 'لا توجد ألعاب تطابق هذا البحث أو الفلتر.' : 'لا توجد ألعاب متاحة حاليًا.') ]));
  nodes.count.textContent = query || discoverFilter === 'featured' ? `${number(visibleGames.length)} نتيجة` : `${number(enabled.length)} ألعاب`;
  const recent = getRecentGames().map(id => catalog.find(game => game.id === id)).filter(game => game && game.enabled !== false).slice(0, 5);
  nodes.recent.replaceChildren(...(recent.length ? recent.map(game => {
    const card = element('a', 'mg-recent-card');
    card.href = `./${encodeURIComponent(game.id)}/`;
    card.addEventListener('click', () => saveRecentGame(game.id));
    card.append(gameIcon(game), element('span', '', game.name));
    return card;
  }) : [empty('ستظهر هنا الألعاب التي فتحتها على هذا الجهاز.') ]));
}

function renderRankRow(row, index, viewerId = null) {
  const item = element('div', 'mg-rank-row');
  if (viewerId && row.userId === viewerId) item.classList.add('viewer');
  item.append(element('span', 'mg-rank-number', number(row.rank || index + 1)));
  const person = element('div', 'mg-rank-person');
  const avatar = element('span', 'mg-avatar', String(row.displayName || 'م').trim().slice(0, 1));
  const copy = element('div');
  copy.append(element('div', 'mg-rank-name', row.displayName || 'لاعب Moadbook'), element('div', 'mg-rank-sub', row.gameName || 'Moadbook Games'));
  person.append(avatar, copy);
  item.append(person, element('strong', 'mg-rank-score', `${number(row.score ?? row.totalPoints)} نقطة`));
  return item;
}

function renderStats() {
  const profile = dashboard?.profile || {};
  const stats = [
    { value: profile.totalPoints, label: 'نقاط اللعب' },
    { value: profile.completedRounds, label: 'جولات مكتملة' },
    { value: profile.currentStreak, label: 'أيام متتالية' },
    { value: Object.keys(profile.bestScores || {}).length, label: 'ألعاب لها سجل' },
  ];
  nodes.quickStats.replaceChildren(...stats.map(item => {
    const stat = element('div', 'mg-stat');
    stat.append(element('strong', '', number(item.value)), element('span', '', item.label));
    return stat;
  }));
  const challenges = dashboard?.dailyChallenges || [];
  nodes.challenges.replaceChildren(...(challenges.length ? challenges.map(challenge => {
    const wrap = element('div', 'mg-challenge');
    const title = element('div', 'mg-challenge-title');
    title.append(element('span', '', challenge.title || 'تحدي اليوم'), element('span', '', `+${number(challenge.rewardPoints)} نقطة`));
    wrap.append(title, element('p', '', `${slugName(challenge.gameId)} · ${number(challenge.progress)} / ${number(challenge.target)}`));
    const bar = element('div', 'mg-progress');
    const fill = element('i');
    fill.style.width = `${Math.min(100, Math.max(0, (Number(challenge.progress) || 0) / Math.max(1, Number(challenge.target) || 1) * 100))}%`;
    bar.append(fill); wrap.append(bar);
    return wrap;
  }) : [empty(user ? 'لا يوجد تحدٍ يومي منشور الآن.' : 'سجّل الدخول لتظهر تحدياتك اليومية.') ]));
  const achievements = (dashboard?.achievements || []).filter(item => item.earned).slice(0, 6);
  nodes.achievements.replaceChildren(...(achievements.length ? achievements.map(item => {
    const chip = element('div', 'mg-achievement-chip');
    chip.append(element('span', '', item.icon || '✦'));
    const label = element('span'); label.append(element('strong', '', item.name), element('small', '', `+${number(item.points)} نقطة`)); chip.append(label);
    return chip;
  }) : [empty(user ? 'العب جولة موثقة لتحصل على أول شارة.' : 'سجّل الدخول لرؤية إنجازاتك.') ]));
}

function renderProfile() {
  const profile = dashboard?.profile || {};
  const cards = [];
  const identity = element('section', 'mg-profile-card');
  identity.append(element('h3', '', profile.displayName || user?.displayName || 'لاعب Moadbook'));
  identity.append(element('p', '', `${number(profile.totalPoints)} نقطة لعب غير نقدية`));
  identity.append(element('div', 'mg-profile-score', `الجولات المكتملة · ${number(profile.completedRounds)}`));
  identity.append(element('div', 'mg-profile-score', `أيام اللعب المتتالية · ${number(profile.currentStreak)}`));
  cards.push(identity);
  const bests = element('section', 'mg-profile-card'); bests.append(element('h3', '', 'أفضل النتائج الموثقة'));
  const bestScores = profile.bestScores || {};
  const pairs = Object.entries(bestScores);
  if (!pairs.length) bests.append(empty('ستظهر أفضل نتيجة لكل لعبة بعد جولة موثقة.'));
  else pairs.forEach(([id, score]) => bests.append(element('div', 'mg-profile-score', `${slugName(id)} · ${number(score)}`)));
  cards.push(bests);
  const achievements = element('section', 'mg-profile-card'); achievements.append(element('h3', '', 'الشارات والإنجازات'));
  const earned = (dashboard?.achievements || []).filter(item => item.earned);
  if (!earned.length) achievements.append(empty('لم تجمع شارات بعد. أكمل جولة موثقة لبدء رحلتك.'));
  else earned.forEach(item => achievements.append(element('div', 'mg-profile-score', `${item.icon || '✦'} ${item.name} · +${number(item.points)}`)));
  cards.push(achievements);
  nodes.profile.replaceChildren(...cards);
  const scores = dashboard?.recentScores || [];
  nodes.recentScores.replaceChildren(...(scores.length ? scores.map(score => {
    const row = element('div', 'mg-recent-score');
    row.append(element('span', '', `${slugName(score.gameId)} · ${new Date(score.createdAt).toLocaleDateString('ar')}`));
    row.append(element('strong', '', `${number(score.score)} نقطة`));
    return row;
  }) : [empty('لا توجد جولات موثقة بعد.') ]));
}

async function loadDashboard() {
  if (!user) { dashboard = null; renderStats(); renderProfile(); return; }
  try {
    dashboard = await gamesApi('dashboard');
    renderStats(); renderProfile();
    const preview = await gamesApi('leaderboard', { gameId: 'overall', period: 'all-time', limit: 5 });
    nodes.leaderboardPreview.replaceChildren(...(preview.rows?.length ? preview.rows.slice(0, 5).map((row, i) => renderRankRow(row, i, user.id)) : [empty('لم تُسجّل نتائج موثقة بعد.') ]));
  } catch (error) {
    notify(error?.code === 'AUTH_REQUIRED' ? 'انتهت جلسة Moadbook. سجّل الدخول مجددًا.' : 'تعذر تحميل ملخص الألعاب؛ يمكنك المحاولة مرة أخرى.', 'error');
  }
}

async function loadLeaderboard() {
  const target = $('mgLeaderboard');
  const gameId = $('mgLeaderboardGame').value;
  const period = $('mgLeaderboardPeriod').value;
  target.replaceChildren(empty('جارٍ تحميل الترتيب…'));
  try {
    const result = await gamesApi('leaderboard', { gameId, period, limit: 100 });
    target.replaceChildren(...(result.rows?.length ? result.rows.map((row, i) => renderRankRow(row, i, user?.id)) : [empty('لا توجد نتائج موثقة لهذه الفترة بعد.') ]));
  } catch (error) {
    target.replaceChildren(empty(error?.code === 'AUTH_REQUIRED' ? 'سجّل الدخول لعرض الترتيب.' : 'تعذر تحميل الترتيب الآن.'));
  }
}

function showView(view) {
  activeView = view;
  document.querySelectorAll('[data-view-panel]').forEach(panel => {
    const active = panel.dataset.viewPanel === view;
    panel.hidden = !active;
    panel.classList.toggle('active', active);
  });
  document.querySelectorAll('.mg-tab[data-view]').forEach(tab => tab.classList.toggle('active', tab.dataset.view === view));
  if (view === 'leaderboard' && user) void loadLeaderboard();
  if (view === 'profile' && user) void loadDashboard();
  if (view === 'admin' && isAdmin) void loadAdmin();
  const hash = view === 'discover' ? '' : `#${view}`;
  history.replaceState(null, '', `${location.pathname}${location.search}${hash}`);
}

document.querySelectorAll('.mg-tab[data-view]').forEach(tab => tab.addEventListener('click', () => showView(tab.dataset.view)));
document.querySelectorAll('[data-open-view]').forEach(link => link.addEventListener('click', event => { event.preventDefault(); showView(link.dataset.openView); }));
const gameSearch = $('mgGameSearch');
gameSearch?.addEventListener('input', renderCatalog);
document.querySelectorAll('[data-game-filter]').forEach(button => button.addEventListener('click', () => {
  discoverFilter = button.dataset.gameFilter === 'featured' ? 'featured' : 'all';
  document.querySelectorAll('[data-game-filter]').forEach(item => {
    const active = item === button;
    item.classList.toggle('active', active);
    item.setAttribute('aria-pressed', String(active));
  });
  renderCatalog();
}));
$('mgRefresh')?.addEventListener('click', () => { void refreshAll(); });
$('mgLeaderboardLoad')?.addEventListener('click', () => { void loadLeaderboard(); });
$('mgLeaderboardGame')?.addEventListener('change', () => { if (activeView === 'leaderboard') void loadLeaderboard(); });
$('mgLeaderboardPeriod')?.addEventListener('change', () => { if (activeView === 'leaderboard') void loadLeaderboard(); });

async function loadAdmin() {
  if (!isAdmin) return;
  adminNotify('جارٍ تحميل لوحة الإدارة…');
  try {
    adminOverview = await gamesApi('admin_overview');
    renderAdmin();
    adminNotify('تم تحميل بيانات الإدارة من الخادم.', 'success');
  } catch {
    adminNotify('تعذر تحميل بيانات الإدارة. تحقق من صلاحيات المطوّر ومن اتصال الخادم.', 'error');
  }
}

function createAdminField(labelText, name, value, type = 'text', options = {}) {
  const label = element('label', 'mg-admin-field-label', labelText);
  let field;
  if (options.select) {
    field = document.createElement('select');
    for (const option of options.select) {
      const node = document.createElement('option'); node.value = option.value; node.textContent = option.label;
      if (String(value) === String(option.value)) node.selected = true;
      field.append(node);
    }
  } else if (type === 'textarea') {
    field = document.createElement('textarea'); field.value = value ?? '';
  } else {
    field = document.createElement('input'); field.type = type; field.value = value ?? '';
    if (options.min !== undefined) field.min = String(options.min);
    if (options.max !== undefined) field.max = String(options.max);
  }
  field.name = name; field.className = 'mg-admin-field';
  label.append(field); return { label, field };
}

async function saveGame(game, changes) {
  try { await gamesApi('admin_save_game', { gameId: game.id, patch: changes }); adminNotify(`تم حفظ إعدادات ${game.name}.`, 'success'); await refreshAll(); }
  catch { adminNotify('تعذر حفظ إعداد اللعبة. لم تُقبل القيمة أو تعذر الاتصال.', 'error'); }
}

function renderAdminGames(games) {
  clear(nodes.adminGames);
  for (const game of games) {
    const row = element('div', 'mg-admin-row');
    const content = element('div');
    const title = element('strong', '', game.name);
    const meta = element('small', '', `${game.id} · الإصدار ${game.version || '1.0.0'} · ${game.enabled ? 'مفعّلة' : 'متوقفة'}`);
    content.append(title, meta);
    const actions = element('div', 'mg-admin-actions');
    const enabled = document.createElement('input'); enabled.type = 'checkbox'; enabled.checked = game.enabled !== false; enabled.setAttribute('aria-label', `تفعيل ${game.name}`);
    enabled.addEventListener('change', () => void saveGame(game, { enabled: enabled.checked }));
    const featured = document.createElement('input'); featured.type = 'checkbox'; featured.checked = Boolean(game.featured); featured.setAttribute('aria-label', `تمييز ${game.name}`);
    featured.addEventListener('change', () => void saveGame(game, { featured: featured.checked }));
    actions.append(enabled, featured);
    const name = createAdminField('اسم اللعبة', 'title', game.name).field; name.maxLength = 120;
    const description = createAdminField('الوصف', 'description', game.description || '', 'textarea').field; description.maxLength = 1000;
    const icon = createAdminField('الأيقونة', 'icon', game.icon || ICONS[game.id] || '✦').field; icon.maxLength = 32;
    const version = createAdminField('الإصدار', 'version', game.version || '1.0.0').field; version.maxLength = 40;
    const accent = createAdminField('اللون', 'accent', game.accent || 'violet', 'select', { select: [
      { value: 'mint', label: 'نعناعي' }, { value: 'gold', label: 'ذهبي' }, { value: 'blue', label: 'أزرق' },
      { value: 'green', label: 'أخضر' }, { value: 'violet', label: 'بنفسجي' },
    ] }).field;
    const imageUrl = createAdminField('رابط صورة HTTPS اختياري', 'image_url', game.imageUrl || '', 'url').field; imageUrl.maxLength = 2048;
    const save = element('button', 'mg-control-btn', 'حفظ الإعدادات'); save.type = 'button';
    save.addEventListener('click', () => void saveGame(game, { title: name.value.trim(), description: description.value.trim(), icon: icon.value.trim(), version: version.value.trim(), accent: accent.value, image_url: imageUrl.value.trim() }));
    row.append(content, actions);
    const fields = element('div', 'mg-admin-game-fields');
    fields.append(name.parentElement, description.parentElement, icon.parentElement, version.parentElement, accent.parentElement, imageUrl.parentElement, save); row.append(fields);
    nodes.adminGames.append(row);
  }
}

async function saveAchievement(item, points, enabled) {
  try { await gamesApi('admin_save_achievement', { id: item.id, points, enabled }); adminNotify('تم حفظ إعداد الإنجاز.', 'success'); await loadAdmin(); }
  catch { adminNotify('تعذر حفظ الإنجاز.', 'error'); }
}
function renderAdminAchievements(items) {
  clear(nodes.adminAchievements);
  for (const item of items) {
    const row = element('div', 'mg-admin-row');
    const text = element('div'); text.append(element('strong', '', `${item.icon || '✦'} ${item.name}`), element('small', '', item.description || item.id));
    const actions = element('div', 'mg-admin-actions');
    const points = document.createElement('input'); points.type = 'number'; points.min = '0'; points.max = '500'; points.value = String(item.points || 0); points.setAttribute('aria-label', `نقاط ${item.name}`);
    const enabled = document.createElement('input'); enabled.type = 'checkbox'; enabled.checked = item.enabled !== false; enabled.setAttribute('aria-label', `تفعيل ${item.name}`);
    const save = element('button', 'mg-control-btn', 'حفظ'); save.type = 'button'; save.addEventListener('click', () => void saveAchievement(item, Number(points.value), enabled.checked));
    actions.append(points, enabled, save); row.append(text, actions); nodes.adminAchievements.append(row);
  }
}

function renderAdminScores(scores) {
  clear(nodes.suspicious);
  if (!scores?.length) { nodes.suspicious.append(empty('لا توجد نتائج معلقة للمراجعة.')); return; }
  for (const score of scores) {
    const card = element('article', 'mg-score-review');
    card.append(element('strong', '', `${score.displayName || 'لاعب'} · ${slugName(score.gameId)} · ${number(score.clientScore)} نقطة مقترحة`));
    card.append(element('p', '', `سبب المراجعة: ${score.reviewReason || 'تحقق إضافي'}`));
    const actions = element('div', 'mg-admin-actions');
    for (const [decision, label] of [['approve', 'اعتماد'], ['reject', 'رفض']]) {
      const button = element('button', 'mg-control-btn', label); button.type = 'button';
      button.addEventListener('click', async () => {
        try { await gamesApi('admin_review_score', { scoreId: score.id, decision }); adminNotify('تم حفظ قرار المراجعة.', 'success'); await loadAdmin(); }
        catch { adminNotify('تعذر حفظ قرار المراجعة.', 'error'); }
      }); actions.append(button);
    }
    card.append(actions); nodes.suspicious.append(card);
  }
}

function attachQuestionForm() {
  const form = $('mgQuestionForm');
  if (!form || form.dataset.bound) return;
  form.dataset.bound = 'true';
  const categoryField = form.elements.categoryId;
  const categoryName = form.elements.category;
  const sourceTitle = form.elements.sourceTitle;
  const sourceUrl = form.elements.sourceUrl;
  const sourceEvidence = form.elements.sourceEvidence;
  const categoryNames = { math: 'رياضيات ومنطق', science: 'علوم', geography: 'جغرافيا', history: 'تاريخ', technology: 'تقنية', culture: 'ثقافة وفنون' };
  const syncSources = () => {
    const mathWithoutUrl = categoryField.value === 'math' && !sourceUrl.value.trim();
    sourceTitle.required = !mathWithoutUrl;
    sourceUrl.required = categoryField.value !== 'math';
    sourceEvidence.required = !mathWithoutUrl;
    sourceTitle.placeholder = mathWithoutUrl ? 'يُسجّل التحقق الحسابي تلقائيًا' : '';
    sourceEvidence.placeholder = mathWithoutUrl ? 'اختياري للرياضيات؛ سيُستخدم تفسير الإجابة' : 'اكتب موضع الدليل في المصدر';
  };
  categoryField.addEventListener('change', () => { categoryName.value = categoryNames[categoryField.value] || categoryName.value; syncSources(); });
  sourceUrl.addEventListener('input', syncSources);
  syncSources();
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const values = new FormData(form);
    const payload = {
      id: crypto.randomUUID(),
      categoryId: String(values.get('categoryId') || 'math'),
      category: String(values.get('category') || '').trim(),
      prompt: String(values.get('prompt') || '').trim(),
      options: [0,1,2,3].map(index => String(values.get(`option${index}`) || '').trim()),
      correctIndex: Number(values.get('correctIndex')),
      difficulty: String(values.get('difficulty') || 'medium'),
      explanation: String(values.get('explanation') || '').trim(),
      sourceTitle: String(values.get('sourceTitle') || '').trim(),
      sourceUrl: String(values.get('sourceUrl') || '').trim(),
      sourceEvidence: String(values.get('sourceEvidence') || '').trim(),
    };
    try { await gamesApi('admin_save_question', payload); form.reset(); syncSources(); adminNotify('تم حفظ السؤال. ستُختار الأسئلة من الخادم عشوائيًا.', 'success'); await loadAdmin(); }
    catch { adminNotify('تعذر حفظ السؤال؛ تحقق من المصدر والخيار الصحيح.', 'error'); }
  });
}

function attachChallengeForm(games, settings = {}) {
  const form = $('mgChallengeForm');
  if (!form) return;
  const rewardField = form.elements.rewardPoints;
  if (!rewardField.dataset.userEdited) rewardField.value = String(settings.daily_challenge_default_points ?? 20);
  if (form.dataset.bound) return;
  const select = form.elements.gameId;
  select.replaceChildren(...games.map(game => { const option = document.createElement('option'); option.value = game.id; option.textContent = game.name; return option; }));
  rewardField.addEventListener('input', () => { rewardField.dataset.userEdited = 'true'; });
  form.dataset.bound = 'true';
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const values = new FormData(form);
    const payload = { gameId: values.get('gameId'), metric: values.get('metric'), target: Number(values.get('target')), rewardPoints: Number(values.get('rewardPoints')), title: String(values.get('title') || '').trim() };
    try { await gamesApi('admin_save_challenge', payload); adminNotify('تم نشر تحدي اليوم.', 'success'); await loadAdmin(); }
    catch { adminNotify('تعذر حفظ التحدي. تحقق من الأهداف ونقاط المكافأة.', 'error'); }
  });
}

function renderAdminQuestions(questions) {
  const list = $('mgAdminQuestions');
  if (!list) return;
  list.replaceChildren();
  const header = element('p', 'mg-empty', `${number(questions.length)} سؤالًا في بنك الأسئلة. الأسئلة غير الرياضية تتطلب رابط مصدر HTTPS.`);
  list.append(header);
  for (const question of questions.slice(0, 40)) {
    const row = element('div', 'mg-admin-row');
    const copy = element('div');
    copy.append(element('strong', '', question.prompt), element('small', '', `${question.category} · ${question.enabled ? 'مفعّل' : 'معطّل'} · ${question.sourceTitle || 'مسألة حسابية'}`));
    const enabled = document.createElement('input'); enabled.type = 'checkbox'; enabled.checked = question.enabled !== false; enabled.setAttribute('aria-label', `تفعيل السؤال ${question.id}`);
    enabled.addEventListener('change', async () => { try { await gamesApi('admin_toggle_question', { questionId: question.id, enabled: enabled.checked }); adminNotify('تم تحديث حالة السؤال.', 'success'); await loadAdmin(); } catch { enabled.checked = !enabled.checked; adminNotify('تعذر تعديل السؤال.', 'error'); } });
    row.append(copy, enabled); list.append(row);
  }
}

function renderAdminSettings(settings) {
  let panel = $('mgAdminScoringPanel');
  if (!panel) {
    panel = element('section', 'mg-panel'); panel.id = 'mgAdminScoringPanel';
    const head = element('div', 'mg-panel-head'); head.append(element('h2', '', 'نظام النقاط الافتراضي'));
    const hint = element('p', '', 'نقاط لعب افتراضية غير مالية. لا يمكن تحويلها أو سحبها أو استخدامها في أي سجل مالي.');
    const form = element('form', 'mg-form'); form.id = 'mgScoringForm';
    const fields = [
      ['نقاط إكمال الجولة الموثقة', 'completion_points', 0, 50],
      ['مكافأة الاختبار الكامل', 'perfect_quiz_points', 0, 200],
      ['المكافأة الافتراضية للتحدي اليومي', 'daily_challenge_default_points', 0, 500],
    ];
    for (const [label, key, min, max] of fields) {
      const { label: fieldLabel, field } = createAdminField(label, key, settings[key] ?? 2, 'number', { min, max });
      form.append(fieldLabel);
    }
    const submit = element('button', 'mg-button', 'حفظ النقاط الافتراضية'); submit.type = 'submit'; form.append(submit);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      try {
        const values = new FormData(form);
        for (const key of ['completion_points', 'perfect_quiz_points', 'daily_challenge_default_points']) await gamesApi('admin_save_setting', { key, value: Number(values.get(key)) });
        adminNotify('تم حفظ سياسة النقاط الافتراضية.', 'success'); await loadAdmin();
      } catch { adminNotify('تعذر حفظ إعدادات النقاط.', 'error'); }
    });
    panel.append(head, hint, form);
  } else {
    const form = $('mgScoringForm');
    for (const key of ['completion_points', 'perfect_quiz_points', 'daily_challenge_default_points']) if (form?.elements[key]) form.elements[key].value = String(settings[key] ?? 2);
  }
  const grid = document.querySelector('.mg-admin-grid');
  if (grid && panel.parentElement !== grid) grid.prepend(panel);
}

function renderAdminStats(stats = {}) {
  if (!nodes.adminStats) return;
  const items = [
    { value: stats.players, label: 'لاعبون مسجلون' },
    { value: stats.completedRounds, label: 'جولات موثقة مكتملة' },
    { value: stats.pointsAwarded, label: 'نقاط ألعاب ممنوحة' },
    { value: stats.reviewQueue, label: 'نتائج قيد المراجعة' },
    { value: stats.sessionsToday, label: 'جلسات اليوم' },
  ];
  nodes.adminStats.replaceChildren(...items.map(item => {
    const stat = element('div', 'mg-stat');
    stat.append(element('strong', '', number(item.value)), element('span', '', item.label));
    return stat;
  }));
}

function renderAdmin() {
  const games = adminOverview?.games || [];
  renderAdminStats(adminOverview?.stats || {});
  renderAdminGames(games);
  renderAdminAchievements(adminOverview?.achievements || []);
  renderAdminScores(adminOverview?.reviewQueue || []);
  renderAdminQuestions(adminOverview?.questions || []);
  renderAdminSettings(adminOverview?.settings || {});
  attachQuestionForm();
  attachChallengeForm(games.filter(game => game.enabled), adminOverview?.settings || {});
}

async function refreshAll() {
  const button = $('mgRefresh'); button.disabled = true;
  try {
    try {
      const result = await gamesApi('catalog');
      if (Array.isArray(result.games) && result.games.length) catalog = result.games;
    } catch { /* bundled catalog remains available */ }
    renderCatalog();
    await loadDashboard();
    if (isAdmin && activeView === 'admin') await loadAdmin();
    notify('تم تحديث مركز الألعاب.', 'success');
  } finally { button.disabled = false; }
}

async function boot() {
  session = await getMoadbookSession();
  user = session?.user || null;
  isAdmin = String(user?.email || '').toLowerCase() === ADMIN_EMAIL;
  nodes.identity.replaceChildren();
  if (user) {
    nodes.identity.textContent = `أهلًا ${user.displayName || user.username || 'بك'}. نتائجك الموثقة ونقاطك خاصة بحسابك.`;
    if (isAdmin) nodes.adminTab.hidden = false;
  } else {
    nodes.identity.append(document.createTextNode('التصفح متاح؛ لتسجيل النتائج والإنجازات '));
    const login = element('a', 'mg-inline-link', 'سجّل الدخول إلى Moadbook'); login.href = '../index.html'; nodes.identity.append(login);
  }
  const requested = location.hash.slice(1);
  if (['leaderboard','profile','admin'].includes(requested) && (requested !== 'admin' || isAdmin)) showView(requested);
  await refreshAll();
}

void boot();
