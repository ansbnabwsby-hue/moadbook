(() => {
  'use strict';

  const ADMIN_EMAIL = 'moad33@accounts.example.com';
  const app = window.MoadbookApp;
  const documentRef = document;
  if (!app) return;

  const adminPage = documentRef.createElement('section');
  adminPage.id = 'page-admin';
  adminPage.className = 'page admin-page';
  adminPage.innerHTML = `
    <div class="admin-heading">
      <div>
        <span class="admin-kicker">MOADBOOK · ADMIN</span>
        <h1>لوحة الإدارة</h1>
        <p class="section-subtitle">إحصاءات وإشراف للمجتمع. صلاحيات الحذف والتوثيق يحميها Firebase.</p>
      </div>
      <button id="adminBackProfile" class="btn light" type="button">حسابي</button>
    </div>
    <div id="adminStats" class="admin-stats-grid" aria-live="polite"></div>
    <div class="admin-live-line"><span class="admin-live-dot"></span><span id="adminRefreshStamp">تتحدث الإحصاءات كل 30 ثانية أثناء فتح اللوحة</span><button id="adminRefreshButton" class="inline-btn" type="button">تحديث الآن</button></div>
    <div class="card admin-card">
      <div class="admin-section-head"><div><h2>الحسابات</h2><p class="muted">آخر 100 حساب، مع إمكانية البحث والتوثيق.</p></div></div>
      <input id="adminUserSearch" class="field" type="search" maxlength="80" placeholder="ابحث بالاسم أو اسم المستخدم…" aria-label="بحث الحسابات">
      <div id="adminUsersList" class="admin-list"></div>
    </div>
    <div class="card admin-card">
      <div class="admin-section-head"><div><h2>المنشورات</h2><p class="muted">أحدث 50 منشورًا. الحذف يزيل المنشور ومرفقاته وتعليقاته وتفاعلاته.</p></div></div>
      <div id="adminPostsList" class="admin-list"></div>
    </div>
    <div class="card admin-card">
      <div class="admin-section-head"><div><h2>البلاغات</h2><p class="muted">راجع البلاغات وحدّث حالتها؛ لا يؤدي ذلك تلقائيًا لحذف محتوى.</p></div></div>
      <div id="adminReportsList" class="admin-list"></div>
    </div>
    <div class="card admin-card admin-tool-card">
      <div class="admin-section-head"><div><span class="admin-tool-icon" aria-hidden="true">◉</span><h2>إشعار للمشتركين</h2><p class="muted">يظهر للمستخدمين الذين فعّلوا إشعارات التطبيق فقط. يصل داخل التطبيق، ويظهر كتنبيه نظام عند فتحه ومنح الإذن.</p></div></div>
      <label class="label" for="adminBroadcastTitle">عنوان الإشعار</label>
      <input id="adminBroadcastTitle" class="field" type="text" maxlength="70" placeholder="مثال: تحديث جديد في moadbook">
      <label class="label" for="adminBroadcastText">نص الإشعار</label>
      <textarea id="adminBroadcastText" class="field" maxlength="320" rows="3" placeholder="اكتب رسالة قصيرة وواضحة للمشتركين…"></textarea>
      <div class="admin-form-footer"><small id="adminBroadcastCount" class="muted">0/320</small><button id="adminBroadcastSend" class="btn primary" type="button">إرسال للمشتركين</button></div>
      <div id="adminBroadcastStatus" class="status" aria-live="polite"></div>
    </div>
    <div class="card admin-card admin-tool-card">
      <div class="admin-section-head"><div><span class="admin-tool-icon admin-ad-icon" aria-hidden="true">Aa</span><h2>إعلان متحرك في ميلز</h2><p class="muted">يظهر كشريط نصي أسفل رأس ميلز وقبل الفيديوهات. يسمح بالنص فقط ولا يدعم إدخال HTML.</p></div></div>
      <label class="label" for="adminMillsAnnouncement">نص الإعلان</label>
      <textarea id="adminMillsAnnouncement" class="field" maxlength="180" rows="2" placeholder="اكتب إعلانًا مختصرًا يظهر في ميلز…"></textarea>
      <div class="admin-mills-custom-grid">
        <label class="admin-mills-custom-control">لون الشريط<select id="adminMillsAnnouncementTheme" class="field"><option value="black">أسود أنيق</option><option value="violet">بنفسجي موحّد</option><option value="gold">ذهبي واضح</option></select></label>
        <label class="admin-mills-custom-control">سرعة الحركة<select id="adminMillsAnnouncementSpeed" class="field"><option value="slow">هادئة</option><option value="normal">متوسطة</option><option value="fast">سريعة</option></select></label>
        <label class="admin-mills-custom-control">حجم الخط<select id="adminMillsAnnouncementSize" class="field"><option value="small">صغير</option><option value="medium">متوسط</option><option value="large">كبير</option></select></label>
      </div>
      <div class="admin-mills-preview-shell">
        <div class="admin-mills-preview-heading"><strong>معاينة مباشرة</strong><small id="adminMillsAnnouncementPreviewHint">اكتب النص لترى شكله قبل الحفظ.</small></div>
        <div id="adminMillsAnnouncementPreview" class="mills-announcement admin-mills-announcement-preview is-disabled" aria-label="معاينة شريط إعلان ميلز">
          <div class="mills-announcement-clip"><span id="adminMillsAnnouncementPreviewText" lang="ar" dir="rtl"></span></div>
        </div>
      </div>
      <label class="admin-switch"><input id="adminMillsAnnouncementEnabled" type="checkbox"><span>تفعيل عرض الإعلان</span></label>
      <div class="admin-form-footer"><small class="muted">حد أقصى 180 حرفًا</small><button id="adminMillsAnnouncementSave" class="btn primary" type="button">حفظ الإعلان</button></div>
      <div id="adminMillsAnnouncementStatus" class="status" aria-live="polite"></div>
    </div>
    <div id="adminStatus" class="status" role="status" aria-live="polite"></div>
  `;

  const mainWrap = documentRef.querySelector('.main-wrap');
  const bottomNav = documentRef.querySelector('.bottom-nav');
  if (!mainWrap || !bottomNav) return;
  mainWrap.append(adminPage);

  const adminNav = documentRef.createElement('button');
  adminNav.id = 'adminNavButton';
  adminNav.type = 'button';
  adminNav.className = 'nav-btn hidden admin-nav-button';
  adminNav.dataset.page = 'admin';
  adminNav.setAttribute('aria-label', 'لوحة الإدارة');
  adminNav.innerHTML = '<span class="admin-nav-icon" aria-hidden="true">✓</span>الإدارة';
  bottomNav.append(adminNav);

  const adminAccess = documentRef.createElement('div');
  adminAccess.id = 'adminProfileAccess';
  adminAccess.className = 'card admin-profile-access hidden';
  adminAccess.innerHTML = '<div><strong>أدوات المطوّر</strong><span>الإحصاءات ومراجعة المجتمع</span></div><button id="adminProfileOpen" class="btn primary" type="button">فتح لوحة الإدارة</button>';
  const profilePage = documentRef.getElementById('page-profile');
  profilePage?.prepend(adminAccess);

  const state = { profiles: {}, posts: {}, groups: {}, reports: {}, postTotal: 0, groupTotal: 0, profilesAvailable: false, postsAvailable: false, groupsAvailable: false, reportsAvailable: false, refreshing: false, timer: null };
  const verifiedCache = new Map();
  const verifiedPending = new Map();
  const status = (message, kind = '') => {
    const node = documentRef.getElementById('adminStatus');
    if (node) {
      node.textContent = message;
      node.className = `status${kind ? ` ${kind}` : ''}`;
    }
  };
  const isAdmin = () => {
    const email = String(app.getSession()?.user?.email || '').trim().toLowerCase();
    return email === ADMIN_EMAIL;
  };
  const formatCount = (number) => new Intl.NumberFormat('ar').format(Number(number) || 0);
  const adminDate = (value) => {
    const date = new Date(Number(value || 0));
    return Number.isNaN(date.getTime()) || !Number(value) ? '—' : date.toLocaleString('ar', { dateStyle: 'medium', timeStyle: 'short' });
  };
  const makeBadge = () => {
    const badge = documentRef.createElement('span');
    badge.className = 'verified-badge';
    badge.setAttribute('role', 'img');
    badge.setAttribute('aria-label', 'حساب موثق');
    badge.title = 'حساب موثق';
    badge.textContent = '✓';
    return badge;
  };
  const decorateVerified = (uid, node) => {
    if (!uid || !node) return;
    const cached = verifiedCache.get(String(uid));
    if (cached && Date.now() - cached.at < 60_000) {
      if (cached.value && !node.querySelector('.verified-badge')) node.append(makeBadge());
      return;
    }
    if (verifiedPending.has(String(uid))) {
      verifiedPending.get(String(uid)).then((value) => {
        if (value && node.isConnected && !node.querySelector('.verified-badge')) node.append(makeBadge());
      });
      return;
    }
    const pending = app.dbGet(`/profiles/${encodeURIComponent(uid)}`)
      .then((profile) => {
        const value = profile?.verified === true;
        verifiedCache.set(String(uid), { value, at: Date.now() });
        return value;
      })
      .catch(() => false)
      .finally(() => verifiedPending.delete(String(uid)));
    verifiedPending.set(String(uid), pending);
    pending.then((value) => {
      if (value && node.isConnected && !node.querySelector('.verified-badge')) node.append(makeBadge());
    });
  };

  window.MoadbookAdmin = Object.freeze({ decorateVerified, refresh: () => loadDashboard(true) });

  const setAdminVisible = () => {
    const visible = isAdmin();
    adminNav.classList.toggle('hidden', !visible);
    adminAccess.classList.toggle('hidden', !visible);
    if (!visible) {
      clearInterval(state.timer);
      state.timer = null;
      state.profiles = {};
      state.posts = {};
      state.groups = {};
      state.reports = {};
      state.postTotal = 0;
      state.groupTotal = 0;
      state.reportsAvailable = false;
      state.profilesAvailable = state.postsAvailable = state.groupsAvailable = false;
      for (const id of ['adminStats', 'adminUsersList', 'adminPostsList', 'adminReportsList']) {
        documentRef.getElementById(id)?.replaceChildren();
      }
      if (app.currentPage?.() === 'admin') app.navigate('home');
    }
  };
  const statCard = (label, value, note = '') => {
    const card = documentRef.createElement('div');
    card.className = 'admin-stat-card';
    const number = documentRef.createElement('strong');
    number.textContent = value === null || value === undefined ? '—' : formatCount(value);
    const title = documentRef.createElement('span');
    title.textContent = label;
    card.append(number, title);
    if (note) {
      const details = documentRef.createElement('small');
      details.textContent = note;
      card.append(details);
    }
    return card;
  };

  function renderStats() {
    const box = documentRef.getElementById('adminStats');
    if (!box) return;
    const profiles = Object.values(state.profiles || {});
    const reports = Object.values(state.reports || {}).flatMap((byUser) => Object.values(byUser || {}));
    const newReports = reports.filter((item) => item?.status === 'new').length;
    const verified = profiles.filter((item) => item?.verified === true).length;
    box.replaceChildren(
      statCard('الأعضاء', state.profilesAvailable ? profiles.length : null, state.profilesAvailable ? 'حسابات المجتمع' : 'تعذر قراءة الحسابات'),
      statCard('المنشورات', state.postsAvailable ? state.postTotal : null, state.postsAvailable ? 'إجمالي المنشورات' : 'تعذر قراءة المنشورات'),
      statCard('المجموعات', state.groupsAvailable ? state.groupTotal : null, state.groupsAvailable ? 'مساحات المجتمع' : 'تعذر قراءة المجموعات'),
      statCard('الحسابات الموثقة', state.profilesAvailable ? verified : null),
      statCard('بلاغات جديدة', state.reportsAvailable ? newReports : null, state.reportsAvailable ? 'بانتظار المراجعة' : 'تعذر قراءة البلاغات'),
    );
  }

  function renderUsers() {
    const box = documentRef.getElementById('adminUsersList');
    if (!box) return;
    if (!state.profilesAvailable) { box.replaceChildren(app.emptyCard('تعذر تحميل الحسابات', 'جرّب تحديث اللوحة أو راجع صلاحيات قراءة /profiles.')); return; }
    const query = String(documentRef.getElementById('adminUserSearch').value || '').trim().toLowerCase();
    const rows = Object.entries(state.profiles || {})
      .map(([id, profile]) => ({ id, ...(profile || {}) }))
      .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
      .filter((item) => !query || `${item.username || ''} ${item.displayName || ''}`.toLowerCase().includes(query))
      .slice(0, 100);
    box.replaceChildren();
    if (!rows.length) {
      box.append(app.emptyCard(query ? 'لا توجد نتائج مطابقة' : 'لا توجد حسابات لعرضها'));
      return;
    }
    for (const user of rows) {
      const row = documentRef.createElement('article');
      row.className = 'admin-row';
      const identity = documentRef.createElement('div');
      identity.className = 'admin-row-main';
      const name = documentRef.createElement('strong');
      name.textContent = user.displayName || user.username || 'عضو';
      if (user.verified === true) name.append(makeBadge());
      const handle = documentRef.createElement('span');
      handle.className = 'muted';
      handle.textContent = `@${user.username || user.id} · انضم ${adminDate(user.createdAt)}`;
      identity.append(name, handle);
      const action = documentRef.createElement('button');
      action.type = 'button';
      action.className = `btn ${user.verified === true ? 'light' : 'primary'} admin-row-action`;
      action.textContent = user.verified === true ? 'إلغاء التوثيق' : 'توثيق';
      action.onclick = () => toggleVerification(user);
      row.append(identity, action);
      box.append(row);
    }
  }

  function renderPosts() {
    const box = documentRef.getElementById('adminPostsList');
    if (!box) return;
    if (!state.postsAvailable) { box.replaceChildren(app.emptyCard('تعذر تحميل المنشورات', 'بقية الإحصاءات ستظل ظاهرة بصورة مستقلة.')); return; }
    const rows = Object.entries(state.posts || {})
      .map(([id, post]) => ({ id, ...(post || {}) }))
      .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
      .slice(0, 50);
    box.replaceChildren();
    if (!rows.length) {
      box.append(app.emptyCard('لا توجد منشورات'));
      return;
    }
    for (const post of rows) {
      const row = documentRef.createElement('article');
      row.className = 'admin-row admin-post-row';
      const body = documentRef.createElement('div');
      body.className = 'admin-row-main';
      const title = documentRef.createElement('strong');
      title.textContent = `${post.authorName || 'عضو'} · @${post.authorId || '—'}`;
      const text = documentRef.createElement('span');
      text.className = 'admin-post-snippet';
      text.textContent = String(post.body || (post.hasMedia ? 'منشور وسائط' : 'منشور فارغ')).slice(0, 220);
      const date = documentRef.createElement('small');
      date.className = 'muted';
      date.textContent = adminDate(post.createdAt);
      body.append(title, text, date);
      const action = documentRef.createElement('button');
      action.type = 'button';
      action.className = 'btn light danger admin-row-action';
      action.textContent = 'حذف';
      action.onclick = () => deletePost(post);
      row.append(body, action);
      box.append(row);
    }
  }

  function renderReports() {
    const box = documentRef.getElementById('adminReportsList');
    if (!state.reportsAvailable) {
      box.replaceChildren(app.emptyCard('تعذر تحميل أدوات الإشراف الآن', 'تحقق من اتصال الإنترنت ثم حاول مجددًا.'));
      return;
    }
    const rows = Object.entries(state.reports || {}).flatMap(([reporterId, reports]) =>
      Object.entries(reports || {}).map(([id, report]) => ({ id, reporterId, ...(report || {}) })),
    ).sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0)).slice(0, 100);
    box.replaceChildren();
    if (!rows.length) {
      box.append(app.emptyCard('لا توجد بلاغات'));
      return;
    }
    for (const report of rows) {
      const row = documentRef.createElement('article');
      row.className = 'admin-row admin-report-row';
      const main = documentRef.createElement('div');
      main.className = 'admin-row-main';
      const title = documentRef.createElement('strong');
      title.textContent = `${report.targetType === 'user' ? 'بلاغ حساب' : 'بلاغ منشور'} · ${report.status || 'new'}`;
      const details = documentRef.createElement('span');
      details.className = 'admin-post-snippet';
      details.textContent = `${report.reason || '—'} · الهدف: ${report.targetId || '—'}`;
      const date = documentRef.createElement('small');
      date.className = 'muted';
      date.textContent = `من @${report.reporterId} · ${adminDate(report.createdAt)}`;
      main.append(title, details, date);
      const actions = documentRef.createElement('div');
      actions.className = 'admin-report-actions';
      for (const [value, label] of [['reviewed', 'قيد المراجعة'], ['resolved', 'تمت المعالجة'], ['dismissed', 'إغلاق']]) {
        const button = documentRef.createElement('button');
        button.type = 'button';
        button.className = 'inline-btn';
        button.textContent = label;
        button.disabled = report.status === value;
        button.onclick = () => setReportStatus(report, value);
        actions.append(button);
      }
      row.append(main, actions);
      box.append(row);
    }
  }

  async function loadDashboard(showMessage = false) {
    if (!isAdmin()) {
      status('هذه الصفحة مخصصة لحساب المطوّر.', 'error');
      return;
    }
    if (state.refreshing) return;
    state.refreshing = true;
    const refreshButton = documentRef.getElementById('adminRefreshButton');
    if (refreshButton) refreshButton.disabled = true;
    try {
      const results = await Promise.allSettled([
        app.dbGet('/profiles'),
        app.dbGet('/posts', { shallow: 'true' }),
        app.dbGet('/posts', { orderBy: '"createdAt"', limitToLast: '50' }),
        app.dbGet('/groups', { shallow: 'true' }),
        app.dbGet('/reports'),
      ]);
      if (!isAdmin()) return;
      const value = (index) => results[index].status === 'fulfilled' ? results[index].value : null;
      state.profilesAvailable = results[0].status === 'fulfilled';
      state.postsAvailable = results[1].status === 'fulfilled' && results[2].status === 'fulfilled';
      state.groupsAvailable = results[3].status === 'fulfilled';
      state.reportsAvailable = results[4].status === 'fulfilled';
      state.profiles = value(0) || {};
      state.posts = value(2) || {};
      state.postTotal = Object.keys(value(1) || {}).length;
      state.groups = value(3) || {};
      state.groupTotal = Object.keys(state.groups).length;
      state.reports = value(4) || {};
      for (const [uid, user] of Object.entries(state.profiles)) {
        verifiedCache.set(uid, { value: user?.verified === true, at: Date.now() });
      }
      renderStats();
      renderUsers();
      renderPosts();
      renderReports();
      const stamp = documentRef.getElementById('adminRefreshStamp');
      if (stamp) stamp.textContent = `آخر تحديث: ${new Date().toLocaleTimeString('ar')}${showMessage ? ' · تم التحديث' : ''}`;
      const failures = results.filter((item) => item.status === 'rejected').length;
      status(failures ? `اكتمل التحديث مع تعذر قراءة ${formatCount(failures)} من مصادر البيانات؛ عُرضت بقية النتائج.` : '', failures ? 'error' : '');
      if (failures) console.warn('admin dashboard partial data failure', results.map((item, i) => item.status === 'rejected' ? i : null).filter((i) => i !== null));
    } catch (error) {
      console.warn('admin dashboard', error?.firebaseCode || error?.message);
      status('تعذر تحديث لوحة الإدارة الآن. تحقق من الاتصال ثم حاول مجددًا.', 'error');
    } finally {
      state.refreshing = false;
      if (refreshButton) refreshButton.disabled = false;
    }
  }

  async function toggleVerification(user) {
    if (!isAdmin()) return;
    const nextValue = user.verified !== true;
    const label = user.displayName || user.username || 'هذا الحساب';
    if (!window.confirm(`${nextValue ? 'توثيق' : 'إلغاء توثيق'} ${label}؟`)) return;
    try {
      await app.dbPut(`/profiles/${encodeURIComponent(user.id)}/verified`, nextValue);
      user.verified = nextValue;
      verifiedCache.set(user.id, { value: nextValue, at: Date.now() });
      renderUsers();
      renderStats();
      status(nextValue ? 'تم توثيق الحساب بالعلامة الزرقاء.' : 'تم إلغاء توثيق الحساب.', 'ok');
    } catch (error) {
      console.warn('verify user', error?.firebaseCode || error?.message);
      status('تعذر تنفيذ التوثيق الآن. تحقق من صلاحيات الحساب ثم حاول مجددًا.', 'error');
    }
  }

  async function deletePost(post) {
    if (!isAdmin()) return;
    const content = String(post.body || 'منشور وسائط').replace(/\s+/g, ' ').slice(0, 100);
    if (!window.confirm(`حذف منشور ${post.authorName || 'عضو'} نهائيًا؟\n\n${content}\n\nسيُحذف المنشور ومرفقاته وتعليقاته وتفاعلاته.`)) return;
    try {
      const id = post.id;
      for (const path of [`/postMedia/${id}`, `/likes/${id}`, `/comments/${id}`, `/commentLikes/${id}`, `/polls/${id}`, `/pollVotes/${id}`]) {
        await app.dbDelete(path);
      }
      await app.dbDelete(`/posts/${id}`);
      delete state.posts[post.id];
      state.postTotal = Math.max(0, state.postTotal - 1);
      renderStats();
      renderPosts();
      status('حُذف المنشور وبياناته المرتبطة.', 'ok');
    } catch (error) {
      console.warn('admin delete post', error?.firebaseCode || error?.message);
      status('تعذر إكمال الحذف الآن. حاول مجددًا بعد لحظات.', 'error');
      void loadDashboard();
    }
  }

  async function setReportStatus(report, value) {
    if (!isAdmin()) return;
    try {
      await app.dbPut(`/reports/${report.reporterId}/${report.id}/status`, value);
      report.status = value;
      renderReports();
      renderStats();
      status('تم تحديث حالة البلاغ.', 'ok');
    } catch (error) {
      console.warn('admin report status', error?.firebaseCode || error?.message);
      status('تعذر تحديث البلاغ. تأكد من نشر قواعد الإدارة المحدّثة.', 'error');
    }
  }

  async function sendAdminBroadcast() {
    if (!isAdmin()) return;
    const title = String(documentRef.getElementById('adminBroadcastTitle')?.value || '').trim();
    const text = String(documentRef.getElementById('adminBroadcastText')?.value || '').trim();
    const button = documentRef.getElementById('adminBroadcastSend');
    const feedback = documentRef.getElementById('adminBroadcastStatus');
    if (text.length < 4) { if (feedback) { feedback.textContent = 'اكتب نصًا من 4 أحرف على الأقل.'; feedback.className = 'status error'; } return; }
    if (!window.confirm('إرسال هذا الإشعار إلى مشتركي الإشعارات؟')) return;
    if (button) button.disabled = true;
    try {
      const uid = app.getSession()?.user?.id;
      const id = `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
      await app.dbPut(`/adminBroadcasts/${id}`, { title: (title || 'إشعار من إدارة moadbook').slice(0, 70), text: text.slice(0, 320), actorId: uid, actorName: 'إدارة moadbook', createdAt: Date.now() });
      documentRef.getElementById('adminBroadcastTitle').value = '';
      documentRef.getElementById('adminBroadcastText').value = '';
      documentRef.getElementById('adminBroadcastCount').textContent = '0/320';
      if (feedback) { feedback.textContent = 'تم حفظ البث. سيظهر للمشتركين عند استخدام التطبيق؛ تنبيهات الخلفية تحتاج خادم Web Push/FCM موثوقًا.'; feedback.className = 'status ok'; }
    } catch (error) {
      console.warn('admin broadcast', error?.firebaseCode || error?.message);
      if (feedback) { feedback.textContent = 'تعذر حفظ الإشعار. تأكد من تطبيق قاعدة /adminBroadcasts المحدّثة.'; feedback.className = 'status error'; }
    } finally { if (button) button.disabled = false; }
  }

  function updateMillsAnnouncementPreview() {
    const input = documentRef.getElementById('adminMillsAnnouncement');
    const toggle = documentRef.getElementById('adminMillsAnnouncementEnabled');
    const preview = documentRef.getElementById('adminMillsAnnouncementPreview');
    const label = documentRef.getElementById('adminMillsAnnouncementPreviewText');
    const hint = documentRef.getElementById('adminMillsAnnouncementPreviewHint');
    const themeSelect = documentRef.getElementById('adminMillsAnnouncementTheme');
    const speedSelect = documentRef.getElementById('adminMillsAnnouncementSpeed');
    const sizeSelect = documentRef.getElementById('adminMillsAnnouncementSize');
    if (!preview || !label) return;
    const text = String(input?.value || '').trim();
    const enabled = toggle?.checked === true;
    const hasText = text.length > 0;
    const theme = ['black', 'violet', 'gold'].includes(themeSelect?.value) ? themeSelect.value : 'black';
    const speed = ['slow', 'normal', 'fast'].includes(speedSelect?.value) ? speedSelect.value : 'normal';
    const size = ['small', 'medium', 'large'].includes(sizeSelect?.value) ? sizeSelect.value : 'small';
    const fontSizes = { small: '10px', medium: '12px', large: '14px' };
    preview.dataset.theme = theme;
    preview.dataset.speed = speed;
    preview.dataset.size = size;
    preview.style.setProperty('--mills-announcement-font-size', fontSizes[size]);
    label.textContent = text || 'سيظهر نص إعلانك المتحرك هنا…';
    preview.classList.toggle('is-disabled', !enabled || !hasText);
    label.style.animation = enabled && hasText ? '' : 'none';
    if (hint) hint.textContent = enabled ? (hasText ? 'هكذا سيظهر في ميلز بعد الحفظ.' : 'اكتب النص أولًا لمعاينة الحركة.') : 'معاينة فقط؛ فعّل الإعلان ليظهر للمستخدمين.';
    if (enabled && hasText) {
      requestAnimationFrame(() => {
        const clip = preview.querySelector('.mills-announcement-clip');
        const width = clip?.clientWidth || preview.clientWidth || 320;
        const pixelsPerSecond = { slow: 28, normal: 45, fast: 68 }[speed];
        label.style.animationDuration = `${Math.max(10, (width + label.scrollWidth) / pixelsPerSecond)}s`;
      });
    }
  }

  async function saveMillsAnnouncement() {
    if (!isAdmin()) return;
    const text = String(documentRef.getElementById('adminMillsAnnouncement')?.value || '').trim();
    const enabled = documentRef.getElementById('adminMillsAnnouncementEnabled')?.checked === true;
    const theme = ['black', 'violet', 'gold'].includes(documentRef.getElementById('adminMillsAnnouncementTheme')?.value) ? documentRef.getElementById('adminMillsAnnouncementTheme').value : 'black';
    const speed = ['slow', 'normal', 'fast'].includes(documentRef.getElementById('adminMillsAnnouncementSpeed')?.value) ? documentRef.getElementById('adminMillsAnnouncementSpeed').value : 'normal';
    const size = ['small', 'medium', 'large'].includes(documentRef.getElementById('adminMillsAnnouncementSize')?.value) ? documentRef.getElementById('adminMillsAnnouncementSize').value : 'small';
    const button = documentRef.getElementById('adminMillsAnnouncementSave');
    const feedback = documentRef.getElementById('adminMillsAnnouncementStatus');
    if (enabled && text.length < 4) { if (feedback) { feedback.textContent = 'اكتب إعلانًا قصيرًا قبل التفعيل.'; feedback.className = 'status error'; } return; }
    if (button) button.disabled = true;
    try {
      await app.dbPut('/millsAnnouncement', { text: text.slice(0, 180), active: enabled, style: { theme, speed, size }, updatedAt: Date.now(), updatedBy: app.getSession()?.user?.id || '' });
      const saved = await app.dbGet('/millsAnnouncement');
      const verified = saved && saved.active === enabled && String(saved.text || '') === text.slice(0, 180) && saved.style?.theme === theme && saved.style?.speed === speed && saved.style?.size === size;
      if (!verified) { if (feedback) { feedback.textContent = 'تم إرسال الحفظ لكن لم أستطع التحقق من قراءة الإعلان. راجع قواعد القراءة لمسار /millsAnnouncement.'; feedback.className = 'status error'; } return; }
      const displayed = enabled ? await app.reloadMillsAnnouncement() : (await app.reloadMillsAnnouncement(), false);
      if (feedback) { feedback.textContent = enabled ? (displayed ? 'تم حفظ الإعلان وقراءته وتحديث شريط ميلز.' : 'حُفظت البيانات، لكن ميلز لا يقرأ إعلانًا نشطًا. راجع التشخيص داخل ميلز.') : 'تم حفظ الإعداد والتحقق من إيقاف الإعلان.'; feedback.className = enabled && !displayed ? 'status error' : 'status ok'; }
      updateMillsAnnouncementPreview();
    } catch (error) {
      console.warn('admin mills announcement', error?.firebaseCode || error?.message);
      if (feedback) { feedback.textContent = 'تعذر حفظ الإعلان أو قراءته بعد الحفظ. تحقق من قواعد القراءة والكتابة لمسار /millsAnnouncement.'; feedback.className = 'status error'; }
    } finally { if (button) button.disabled = false; }
  }

  async function loadMillsAnnouncementForm() {
    const feedback = documentRef.getElementById('adminMillsAnnouncementStatus');
    try {
      const value = await app.dbGet('/millsAnnouncement');
      const input = documentRef.getElementById('adminMillsAnnouncement');
      const toggle = documentRef.getElementById('adminMillsAnnouncementEnabled');
      if (input) input.value = String(value?.text || '');
      if (toggle) toggle.checked = value?.active === true;
      const style = value?.style || {};
      const themeSelect = documentRef.getElementById('adminMillsAnnouncementTheme');
      const speedSelect = documentRef.getElementById('adminMillsAnnouncementSpeed');
      const sizeSelect = documentRef.getElementById('adminMillsAnnouncementSize');
      if (themeSelect) themeSelect.value = ['black', 'violet', 'gold'].includes(style.theme) ? style.theme : 'black';
      if (speedSelect) speedSelect.value = ['slow', 'normal', 'fast'].includes(style.speed) ? style.speed : 'normal';
      if (sizeSelect) sizeSelect.value = ['small', 'medium', 'large'].includes(style.size) ? style.size : 'small';
      updateMillsAnnouncementPreview();
      if (feedback) { feedback.textContent = ''; feedback.className = 'status'; }
    } catch (error) {
      console.warn('admin mills announcement read', error?.firebaseCode || error?.message);
      if (feedback) { feedback.textContent = 'تعذر قراءة الإعلان. تأكد من حفظ قواعد /millsAnnouncement في Firebase ثم أعد المحاولة.'; feedback.className = 'status error'; }
    }
  }

  const setRefreshTimer = () => {
    clearInterval(state.timer);
    state.timer = null;
    if (adminPage.classList.contains('active') && isAdmin()) {
      state.timer = setInterval(() => loadDashboard(), 30_000);
    }
  };
  adminNav.onclick = () => {
    if (!isAdmin()) return;
    app.navigate('admin');
    setRefreshTimer();
    void loadDashboard();
  };
  documentRef.getElementById('adminProfileOpen').onclick = adminNav.onclick;
  documentRef.getElementById('adminBackProfile').onclick = () => app.navigate('profile');
  documentRef.getElementById('adminRefreshButton').onclick = () => loadDashboard(true);
  documentRef.getElementById('adminUserSearch').addEventListener('input', renderUsers);
  documentRef.getElementById('adminBroadcastSend').addEventListener('click', sendAdminBroadcast);
  documentRef.getElementById('adminBroadcastText').addEventListener('input', (event) => { documentRef.getElementById('adminBroadcastCount').textContent = `${event.target.value.length}/320`; });
  documentRef.getElementById('adminMillsAnnouncementSave').addEventListener('click', saveMillsAnnouncement);
  documentRef.getElementById('adminMillsAnnouncement').addEventListener('input', updateMillsAnnouncementPreview);
  documentRef.getElementById('adminMillsAnnouncementEnabled').addEventListener('change', updateMillsAnnouncementPreview);
  ['adminMillsAnnouncementTheme', 'adminMillsAnnouncementSpeed', 'adminMillsAnnouncementSize'].forEach((id) => documentRef.getElementById(id).addEventListener('change', updateMillsAnnouncementPreview));
  updateMillsAnnouncementPreview();
  adminNav.addEventListener('click', () => { void loadMillsAnnouncementForm(); });
  documentRef.getElementById('adminProfileOpen').addEventListener('click', () => { void loadMillsAnnouncementForm(); });

  const authShell = documentRef.getElementById('appShell');
  if (authShell && 'MutationObserver' in window) {
    new MutationObserver(() => {
      setAdminVisible();
      setRefreshTimer();
    }).observe(authShell, { attributes: true, attributeFilter: ['class'] });
  }
  new MutationObserver(() => {
    if (adminPage.classList.contains('active')) {
      if (!isAdmin()) {
        app.navigate('home');
        return;
      }
      setRefreshTimer();
      void loadDashboard();
    } else {
      setRefreshTimer();
    }
  }).observe(adminPage, { attributes: true, attributeFilter: ['class'] });
  setAdminVisible();
  setRefreshTimer();
})();
