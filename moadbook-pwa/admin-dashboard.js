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

  const state = { profiles: {}, posts: {}, groups: {}, reports: {}, postTotal: 0, groupTotal: 0, reportsAvailable: false, refreshing: false, timer: null };
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
    number.textContent = formatCount(value);
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
    const profiles = Object.values(state.profiles || {});
    const reports = Object.values(state.reports || {}).flatMap((byUser) => Object.values(byUser || {}));
    const newReports = reports.filter((item) => item?.status === 'new').length;
    const verified = profiles.filter((item) => item?.verified === true).length;
    box.replaceChildren(
      statCard('الأعضاء', profiles.length),
      statCard('المنشورات', state.postTotal),
      statCard('المجموعات', state.groupTotal),
      statCard('الحسابات الموثقة', verified),
      statCard('بلاغات جديدة', newReports),
    );
  }

  function renderUsers() {
    const box = documentRef.getElementById('adminUsersList');
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
      box.replaceChildren(app.emptyCard('فعّل قواعد الإشراف أولًا', 'راجع ملفات قواعد Firebase المرفقة؛ تبقى القاعدة بدون تغيير حتى تطبقها يدويًا.'));
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
    refreshButton.disabled = true;
    try {
      const [profiles, postKeys, posts, groupKeys, reportsResult] = await Promise.all([
        app.dbGet('/profiles'),
        app.dbGet('/posts', { shallow: 'true' }),
        app.dbGet('/posts', { orderBy: '"createdAt"', limitToLast: '50' }),
        app.dbGet('/groups', { shallow: 'true' }),
        app.dbGet('/reports').then((value) => ({ value })).catch((error) => ({ error })),
      ]);
      if (!isAdmin()) return;
      state.profiles = profiles || {};
      state.posts = posts || {};
      state.postTotal = Object.keys(postKeys || {}).length;
      state.groups = groupKeys || {};
      state.groupTotal = Object.keys(groupKeys || {}).length;
      state.reportsAvailable = reportsResult.value !== undefined;
      state.reports = reportsResult.value || {};
      for (const [uid, user] of Object.entries(state.profiles)) {
        verifiedCache.set(uid, { value: user?.verified === true, at: Date.now() });
      }
      renderStats();
      renderUsers();
      renderPosts();
      renderReports();
      documentRef.getElementById('adminRefreshStamp').textContent = `آخر تحديث: ${new Date().toLocaleTimeString('ar')}${showMessage ? ' · تم التحديث' : ''}`;
      status(state.reportsAvailable ? '' : 'الإحصاءات جاهزة؛ لتفعيل الحذف والتوثيق ومراجعة البلاغات حدّث قواعد Firebase يدويًا بالملف المرفق.', state.reportsAvailable ? '' : '');
    } catch (error) {
      console.warn('admin dashboard', error?.firebaseCode || error?.message);
      status('تعذر تحميل لوحة الإدارة. حدّث قواعد Firebase باستخدام ملف القواعد المرفق، ثم سجّل الخروج والدخول.', 'error');
    } finally {
      state.refreshing = false;
      refreshButton.disabled = false;
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
      status('رفضت قواعد Firebase التوثيق. تأكد من نشر ملف القواعد المرفق يدويًا.', 'error');
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
      status('تعذر إكمال الحذف. تحقّق من قواعد Firebase؛ إذا فشل الحذف جزئيًا، أعد المحاولة بعد تحديث القواعد.', 'error');
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
