(() => {
  'use strict';

  const app = window.MoadbookApp;
  if (!app) return;

  const $ = id => document.getElementById(id);
  const CATEGORIES = ['عام', 'ألعاب', 'تقنية', 'أنمي ورسوم', 'صناع محتوى', 'تعليم', 'تصوير وتصميم', 'ترفيه'];
  const THEMES = {
    violet: { label: 'بنفسجي هادئ', accent: '#6656d9', soft: '#f1efff' },
    ocean: { label: 'أزرق المحيط', accent: '#2877c7', soft: '#eaf5ff' },
    rose: { label: 'وردي دافئ', accent: '#ce4d88', soft: '#fff0f6' },
    mint: { label: 'أخضر نعناعي', accent: '#238a74', soft: '#e9f8f2' },
    amber: { label: 'ذهبي رملي', accent: '#b67a21', soft: '#fff6e7' }
  };

  let groups = [];
  let memberships = {};
  let activeGroupId = '';
  let groupLoadRequestId = 0;
  let groupAvatarCache = {};
  let editingEventId = '';

  const session = () => app.getSession();
  const currentUid = () => session()?.user?.id || '';
  const roleFor = (group, members, uid = currentUid()) => members?.[uid] || (group?.ownerId === uid ? 'owner' : '');
  const isManagerRole = role => role === 'owner' || role === 'admin';
  const make = (tag, className = '', text = '') => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== '') element.textContent = String(text);
    return element;
  };
  const button = (text, className, onClick, type = 'button') => {
    const element = make('button', className, text);
    element.type = type;
    if (onClick) element.addEventListener('click', onClick);
    return element;
  };
  const field = (labelText, input) => {
    const wrapper = make('label', 'group-field');
    wrapper.append(make('span', 'group-field-label', labelText), input);
    return wrapper;
  };
  const textInput = (value, maxLength, placeholder = '') => {
    const input = make('input', 'field');
    input.type = 'text';
    input.maxLength = maxLength;
    input.value = value || '';
    input.placeholder = placeholder;
    return input;
  };
  const roleName = role => ({ owner: 'المالك', admin: 'مشرف', member: 'عضو' }[role] || 'عضو');
  const formatDate = value => {
    const date = new Date(Number(value) || 0);
    if (!Number.isFinite(date.getTime()) || date.getTime() <= 0) return 'وقت غير محدد';
    return new Intl.DateTimeFormat('ar-LY', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  };
  const localDateTimeValue = timestamp => {
    const date = new Date(Number(timestamp) || Date.now());
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 16);
  };

  async function groupMedia(groupId) {
    if (Object.prototype.hasOwnProperty.call(groupAvatarCache, groupId)) return groupAvatarCache[groupId];
    try {
      const row = await app.safeGet(`/groupMedia/${groupId}`, null);
      const dataUrl = typeof row?.dataUrl === 'string' && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(row.dataUrl)
        ? row.dataUrl
        : '';
      groupAvatarCache[groupId] = dataUrl;
      return dataUrl;
    } catch {
      groupAvatarCache[groupId] = '';
      return '';
    }
  }

  function paintGroupAvatar(node, group) {
    if (!node) return;
    const initial = Array.from(group?.name || 'م')[0] || 'م';
    node.replaceChildren();
    node.textContent = initial;
    node.classList.remove('has-image');
    const load = () => groupMedia(group.id).then(dataUrl => {
      if (!dataUrl || !node.isConnected) return;
      const image = make('img');
      image.src = dataUrl;
      image.alt = `صورة ${group.name || 'المجموعة'}`;
      image.loading = 'lazy';
      node.replaceChildren(image);
      node.classList.add('has-image');
    });
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(entries => {
        if (!entries.some(entry => entry.isIntersecting)) return;
        observer.disconnect();
        void load();
      }, { rootMargin: '80px' });
      observer.observe(node);
    } else void load();
  }

  function setDirectoryVisible(visible) {
    document.querySelector('#page-groups .community-create')?.classList.toggle('hidden', !visible);
    document.querySelector('#page-groups .community-filters')?.classList.toggle('hidden', !visible);
    $('communitySummary')?.classList.toggle('hidden', !visible);
    $('groupsList')?.classList.toggle('hidden', !visible);
    $('groupDetailView')?.classList.toggle('hidden', visible);
  }

  async function loadGroups() {
    const box = $('groupsList');
    if (!box) return;
    if (activeGroupId) return loadGroupDetail(activeGroupId);
    if (!session()) {
      box.replaceChildren(app.emptyCard('سجّل الدخول لاستكشاف المجتمعات'));
      return;
    }
    if (!box.childElementCount) box.replaceChildren(app.emptyCard('جارٍ تحميل المجتمعات…'));
    try {
      const [groupsData, membersData] = await Promise.all([
        app.dbGet('/groups'),
        app.dbGet('/groupMembers')
      ]);
      groups = app.mapRows(groupsData).map(group => ({ ...group, category: group.category || 'عام' }));
      memberships = membersData || {};
      renderCommunityDirectory();
    } catch (error) {
      box.replaceChildren(app.emptyCard('تعذر تحميل المجتمعات', 'تحقق من اتصال Firebase وقواعد RTDB ثم حاول مجددًا.'));
      console.warn('groups directory', error.firebaseCode || error.message);
    }
  }

  function renderCommunityDirectory() {
    const box = $('groupsList');
    if (!box || activeGroupId) return;
    const query = ($('communitySearch')?.value || '').trim().toLocaleLowerCase('ar');
    const category = $('communityCategoryFilter')?.value || 'all';
    const uid = currentUid();
    const rows = groups.map(group => {
      const groupMembers = memberships[group.id] || {};
      const role = roleFor(group, groupMembers, uid);
      return {
        ...group,
        role,
        joined: !!role,
        memberCount: Object.keys(groupMembers).length || (group.ownerId ? 1 : 0)
      };
    }).filter(group => (category === 'all' || group.category === category) &&
      (!query || `${group.name} ${group.description} ${group.category}`.toLocaleLowerCase('ar').includes(query)))
      .sort((a, b) => b.memberCount - a.memberCount || Number(b.createdAt || 0) - Number(a.createdAt || 0));

    const joined = groups.filter(group => !!roleFor(group, memberships[group.id], uid)).length;
    $('communitySummary').textContent = `${groups.length} مجتمع · أنت عضو في ${joined} · المجموعات عامة`;
    box.replaceChildren();
    if (!rows.length) {
      box.append(app.emptyCard(query || category !== 'all' ? 'لا توجد نتائج مطابقة' : 'لا توجد مجتمعات بعد', 'أنشئ مجتمعًا عامًا وابدأ بمشاركة المنشورات والفعاليات.'));
      return;
    }

    for (const group of rows) {
      const theme = THEMES[group.themeId] || THEMES.violet;
      const card = make('article', 'community-card');
      card.style.setProperty('--group-accent', theme.accent);
      card.style.setProperty('--group-soft', theme.soft);
      const head = make('div', 'community-card-head');
      const avatar = make('div', 'community-avatar');
      paintGroupAvatar(avatar, group);
      const main = make('div', 'community-card-main');
      const title = button(group.name || 'مجتمع', 'community-card-title group-title-button', () => openGroup(group.id));
      const desc = make('div', 'community-card-desc', group.description || 'مساحة عامة للنقاش وتبادل المعرفة.');
      main.append(title, desc);
      head.append(avatar, main);
      const meta = make('div', 'community-meta');
      for (const value of [`${group.memberCount} عضو`, group.category || 'عام', group.role ? roleName(group.role) : 'مجموعة عامة']) {
        meta.append(make('span', 'community-pill', value));
      }
      card.append(head, meta);
      const actions = make('div', 'community-actions');
      actions.append(button('فتح المجموعة', 'btn light', () => openGroup(group.id)));
      const join = button(group.role === 'owner' ? 'أنت المالك' : group.joined ? 'مغادرة' : 'انضمام', group.joined ? 'btn light' : 'btn primary');
      join.disabled = group.role === 'owner';
      join.addEventListener('click', async () => {
        join.disabled = true;
        try {
          if (group.joined) await app.dbDelete(`/groupMembers/${group.id}/${uid}`);
          else await app.dbPut(`/groupMembers/${group.id}/${uid}`, 'member');
          app.toast(group.joined ? 'غادرت المجموعة' : 'انضممت إلى المجموعة');
          await loadGroups();
        } catch (error) {
          app.toast('تعذر تحديث العضوية. طبّق قواعد RTDB المحدّثة ثم حاول مجددًا.');
          console.warn('group join/leave', error.firebaseCode || error.message);
        } finally {
          join.disabled = false;
        }
      });
      actions.append(join);
      card.append(actions);
      box.append(card);
    }
  }

  async function createGroup() {
    const name = $('groupName').value.trim();
    const description = $('groupDescription').value.trim();
    const category = $('groupCategory')?.value || 'عام';
    if (name.length < 2) {
      app.status('groupStatus', 'اسم المجتمع يجب أن يكون حرفين على الأقل.', 'error');
      return;
    }
    if (!session()) return;
    const createButton = $('createGroupButton');
    createButton.disabled = true;
    app.status('groupStatus', 'جارٍ إنشاء المجموعة…');
    let groupId = '';
    try {
      const existing = app.mapRows(await app.dbGet('/groups'));
      if (existing.some(row => String(row.name || '').trim().toLocaleLowerCase('ar') === name.toLocaleLowerCase('ar'))) {
        app.status('groupStatus', 'يوجد مجتمع بهذا الاسم بالفعل. اختر اسمًا مختلفًا.', 'error');
        return;
      }
      const result = await app.dbPost('/groups', {
        name,
        description: description.slice(0, 240),
        ownerId: currentUid(),
        createdAt: Date.now(),
        category,
        themeId: 'violet'
      });
      groupId = result?.name || '';
      if (!groupId) throw new Error('GROUP_ID_MISSING');
      await app.dbPut(`/groupMembers/${groupId}/${currentUid()}`, 'owner');
      $('groupName').value = '';
      $('groupDescription').value = '';
      app.status('groupStatus', 'تم إنشاء المجموعة العامة. يمكنك الآن إضافة صورة وثيم وبدء النشر.', 'ok');
      await loadGroups();
      await openGroup(groupId);
    } catch (error) {
      app.status('groupStatus', 'تعذر إنشاء المجموعة أو تثبيت عضوية المالك. تأكد من تطبيق ملف قواعد RTDB المحدّث ثم حاول مجددًا.', 'error');
      console.warn('create group', error.firebaseCode || error.message);
      if (groupId) await app.dbDelete(`/groups/${groupId}`).catch(() => {});
    } finally {
      createButton.disabled = false;
    }
  }

  function groupName(groupId) {
    return groups.find(group => group.id === groupId)?.name || 'مجموعة عامة';
  }

  function openGroup(groupId) {
    if (!groupId || !session()) return;
    if (app.currentPage() !== 'groups') app.navigate('groups');
    activeGroupId = groupId;
    editingEventId = '';
    setDirectoryVisible(false);
    const view = $('groupDetailView');
    view.replaceChildren(app.emptyCard('جارٍ تحميل المجموعة…'));
    return loadGroupDetail(groupId);
  }

  async function loadGroupDetail(groupId) {
    const requestId = ++groupLoadRequestId;
    const view = $('groupDetailView');
    try {
      const query = { orderBy: '"groupId"', equalTo: JSON.stringify(groupId), limitToLast: '30' };
      const [group, members, posts, events, rsvps, media, profiles] = await Promise.all([
        app.dbGet(`/groups/${groupId}`),
        app.dbGet(`/groupMembers/${groupId}`),
        app.dbGet('/posts', query),
        app.safeGet(`/groupEvents/${groupId}`, {}),
        app.safeGet(`/groupEventRsvps/${groupId}`, {}),
        app.safeGet(`/groupMedia/${groupId}`, null),
        app.safeGet('/profiles', {})
      ]);
      if (activeGroupId !== groupId || requestId !== groupLoadRequestId || app.currentPage() !== 'groups') return;
      if (!group) {
        app.toast('لم نعثر على المجموعة. ربما حُذفت.');
        return backToDirectory();
      }
      const cachedIndex = groups.findIndex(item => item.id === groupId);
      const refreshedGroup = { ...group, id: groupId, category: group.category || 'عام' };
      if (cachedIndex >= 0) groups[cachedIndex] = refreshedGroup;
      else groups.push(refreshedGroup);
      memberships[groupId] = members || {};
      if (media?.dataUrl && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(media.dataUrl)) groupAvatarCache[groupId] = media.dataUrl;
      const rows = app.mapRows(posts).sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
        .map(row => app.postFromFirebase(row.id, row));
      const liked = new Set(rows.filter(row => app.getFeedLikes()?.[row.id]?.[currentUid()]).map(row => row.id));
      renderGroupDetail(groupId, group, members || {}, rows, events || {}, rsvps || {}, profiles || {}, media, liked);
    } catch (error) {
      if (activeGroupId !== groupId || requestId !== groupLoadRequestId || app.currentPage() !== 'groups') return;
      view.replaceChildren(app.emptyCard('تعذر فتح المجموعة', 'تأكد من اتصالك ومن تطبيق قواعد RTDB المحدّثة.'));
      console.warn('group detail', error.firebaseCode || error.message);
    }
  }

  function backToDirectory() {
    activeGroupId = '';
    groupLoadRequestId++;
    editingEventId = '';
    setDirectoryVisible(true);
    return loadGroups();
  }

  function renderGroupDetail(groupId, group, members, posts, events, rsvps, profiles, media, liked) {
    const view = $('groupDetailView');
    const uid = currentUid();
    const role = roleFor(group, members, uid);
    const joined = !!role;
    const manager = isManagerRole(role);
    const theme = THEMES[group.themeId] || THEMES.violet;
    view.replaceChildren();

    const back = button('‹ كل المجموعات', 'group-back btn light', backToDirectory);
    const hero = make('section', 'card group-detail-hero');
    hero.style.setProperty('--group-accent', theme.accent);
    hero.style.setProperty('--group-soft', theme.soft);
    const avatar = make('div', 'community-avatar group-avatar-large');
    paintGroupAvatar(avatar, group);
    const identity = make('div', 'group-detail-identity');
    identity.append(make('span', 'community-kicker', group.category || 'مجموعة عامة'), make('h2', 'group-detail-title', group.name || 'مجموعة'));
    identity.append(make('p', 'group-detail-description', group.description || 'مساحة عامة للنقاش وتبادل المعرفة.'));
    const head = make('div', 'group-detail-head');
    head.append(avatar, identity);
    const actions = make('div', 'group-detail-actions');
    if (!joined) {
      actions.append(button('انضم للمجموعة', 'btn primary', async event => {
        const target = event.currentTarget;
        target.disabled = true;
        try { await app.dbPut(`/groupMembers/${groupId}/${uid}`, 'member'); app.toast('انضممت إلى المجموعة'); await loadGroupDetail(groupId); }
        catch (error) { app.toast('تعذر الانضمام؛ طبّق قواعد RTDB المحدّثة أولًا.'); console.warn('group join', error.firebaseCode || error.message); }
        finally { target.disabled = false; }
      }));
    } else if (role !== 'owner') {
      actions.append(button('مغادرة المجموعة', 'btn light', async () => {
        if (!window.confirm('مغادرة هذه المجموعة؟')) return;
        try { await app.dbDelete(`/groupMembers/${groupId}/${uid}`); app.toast('غادرت المجموعة'); await loadGroupDetail(groupId); }
        catch (error) { app.toast('تعذر مغادرة المجموعة. تحقق من قواعد RTDB.'); console.warn('group leave', error.firebaseCode || error.message); }
      }));
    } else {
      actions.append(make('span', 'group-owner-badge', 'أنت مالك المجموعة'));
    }
    if (joined) {
      actions.append(button('اكتب منشورًا للمجموعة', 'btn primary', () => {
        app.setComposeGroupContext(groupId, group.name || 'مجموعة');
        app.navigate('home');
        $('postInput')?.focus({ preventScroll: true });
        app.toast('منشورك سيظهر في الموجز العام وصفحة هذه المجموعة.');
      }));
    }
    hero.append(head, actions);

    const summary = make('div', 'group-detail-stats');
    summary.append(make('span', 'community-pill', `${Object.keys(members).length || 1} عضو`));
    summary.append(make('span', 'community-pill', `${posts.length} منشور`));
    summary.append(make('span', 'community-pill', `${Object.keys(events).length} فعالية`));
    if (role) summary.append(make('span', 'community-pill role-pill', roleName(role)));
    view.append(back, hero, summary);

    if (manager) view.append(buildSettings(groupId, group));
    view.append(buildGroupPosts(group, posts, liked));
    view.append(buildEvents(groupId, events, rsvps, members, manager, joined));
    view.append(buildMembers(groupId, group, members, profiles, role));
  }

  function buildSettings(groupId, group) {
    const card = make('section', 'card group-settings-card');
    const heading = make('button', 'group-section-toggle');
    heading.type = 'button';
    heading.setAttribute('aria-expanded', 'false');
    heading.append(make('strong', '', 'إدارة المجموعة'), make('span', 'muted', 'الاسم والوصف والصورة والمظهر والأعضاء'));
    const body = make('div', 'group-settings-body hidden');
    heading.addEventListener('click', () => {
      const open = body.classList.toggle('hidden') === false;
      heading.setAttribute('aria-expanded', String(open));
    });

    const name = textInput(group.name, 60, 'اسم المجموعة');
    const description = make('textarea', 'field');
    description.maxLength = 240;
    description.rows = 3;
    description.value = group.description || '';
    const category = make('select', 'field');
    for (const value of CATEGORIES) {
      const option = make('option', '', value);
      option.value = value;
      category.append(option);
    }
    category.value = group.category || 'عام';
    const theme = make('select', 'field');
    for (const [id, value] of Object.entries(THEMES)) {
      const option = make('option', '', value.label);
      option.value = id;
      theme.append(option);
    }
    theme.value = THEMES[group.themeId] ? group.themeId : 'violet';

    const fields = make('div', 'group-settings-fields');
    fields.append(field('اسم المجموعة', name), field('الوصف', description), field('التصنيف', category), field('لون المجموعة', theme));
    const save = button('حفظ الإعدادات', 'btn primary', async event => {
      if (name.value.trim().length < 2) { app.toast('اسم المجموعة يجب أن يكون حرفين على الأقل.'); return; }
      const target = event.currentTarget;
      target.disabled = true;
      try {
        await app.dbPatch(`/groups/${groupId}`, {
          name: name.value.trim().slice(0, 60),
          description: description.value.trim().slice(0, 240),
          category: CATEGORIES.includes(category.value) ? category.value : 'عام',
          themeId: THEMES[theme.value] ? theme.value : 'violet'
        });
        app.toast('تم تحديث إعدادات المجموعة');
        await loadGroupDetail(groupId);
      } catch (error) {
        app.toast('تعذر الحفظ. طبّق ملف قواعد RTDB المحدث ثم أعد المحاولة.');
        console.warn('group settings', error.firebaseCode || error.message);
      } finally { target.disabled = false; }
    });
    fields.append(save);

    const mediaTools = make('div', 'group-media-tools');
    const fileInput = make('input', 'sr-only');
    fileInput.type = 'file';
    fileInput.accept = 'image/jpeg,image/png,image/webp';
    fileInput.setAttribute('aria-label', 'اختيار صورة للمجموعة');
    const choose = button('اختيار صورة للمجموعة', 'btn light', () => fileInput.click());
    const remove = button('إزالة الصورة', 'btn light', async event => {
      const target = event.currentTarget;
      target.disabled = true;
      try {
        await app.dbDelete(`/groupMedia/${groupId}`);
        delete groupAvatarCache[groupId];
        app.toast('تمت إزالة صورة المجموعة');
        await loadGroupDetail(groupId);
      } catch (error) {
        app.toast('تعذر إزالة الصورة. تحقق من صلاحيات المالك/المشرف.');
        console.warn('group media delete', error.firebaseCode || error.message);
      } finally { target.disabled = false; }
    });
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      fileInput.value = '';
      if (!file) return;
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { app.toast('اختر صورة JPEG أو PNG أو WebP.'); return; }
      choose.disabled = true;
      try {
        const dataUrl = await app.compressImage(file, 320, 95000);
        if (!dataUrl.startsWith('data:image/jpeg;base64,')) throw new Error('IMAGE_COMPRESSION_FAILED');
        await app.dbPut(`/groupMedia/${groupId}`, { dataUrl, updatedAt: Date.now() });
        groupAvatarCache[groupId] = dataUrl;
        app.toast('تم تحديث صورة المجموعة');
        await loadGroupDetail(groupId);
      } catch (error) {
        app.toast(error.firebaseCode?.includes('PERMISSION_DENIED') ? 'تحتاج القواعد المحدّثة لحفظ صورة المجموعة.' : 'تعذر ضغط الصورة أو رفعها. جرّب صورة أصغر.');
        console.warn('group media upload', error.firebaseCode || error.message);
      } finally { choose.disabled = false; }
    });
    mediaTools.append(choose, remove, fileInput);
    const mediaNote = make('p', 'muted', 'تُضغط الصورة إلى JPEG قبل الحفظ؛ الحد الأقصى يقارب 95 كيلوبايت.');
    body.append(fields, mediaTools, mediaNote);
    card.append(heading, body);
    return card;
  }

  function buildGroupPosts(group, posts, liked) {
    const section = make('section', 'group-content-section');
    const header = make('div', 'group-section-heading');
    header.append(make('h3', '', 'منشورات المجموعة'), make('span', 'muted', 'تظهر أيضًا في الموجز العام'));
    const list = make('div', 'group-post-list');
    if (posts.length) app.renderFeed(posts, list, liked);
    else list.append(app.emptyCard('لا توجد منشورات بعد', 'ابدأ أول نقاش في المجموعة.'));
    section.append(header, list);
    return section;
  }

  function buildEventForm(groupId, eventRow = null) {
    const isEdit = !!eventRow;
    const form = make('form', 'group-event-form');
    const title = textInput(eventRow?.title || '', 80, 'مثال: لقاء مجتمع التقنية');
    const description = make('textarea', 'field');
    description.maxLength = 500;
    description.rows = 3;
    description.placeholder = 'تفاصيل الفعالية';
    description.value = eventRow?.description || '';
    const startsAt = make('input', 'field');
    startsAt.type = 'datetime-local';
    startsAt.required = true;
    startsAt.value = eventRow?.startsAt ? localDateTimeValue(eventRow.startsAt) : '';
    const location = textInput(eventRow?.location || '', 120, 'المكان (اختياري)');
    const controls = make('div', 'group-form-actions');
    const submit = button(isEdit ? 'حفظ التعديل' : 'إنشاء الفعالية', 'btn primary', null, 'submit');
    controls.append(submit);
    if (isEdit) controls.append(button('إلغاء التعديل', 'btn light', async () => loadGroupDetail(groupId)));
    form.append(field('عنوان الفعالية', title), field('الوصف', description), field('التاريخ والوقت المحلي', startsAt), field('المكان', location), controls);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const cleanTitle = title.value.trim();
      const timestamp = new Date(startsAt.value).getTime();
      if (cleanTitle.length < 2 || !Number.isFinite(timestamp)) {
        app.toast('أدخل عنوانًا ووقتًا صحيحين للفعالية.');
        return;
      }
      submit.disabled = true;
      const now = Date.now();
      const row = {
        title: cleanTitle.slice(0, 80),
        description: description.value.trim().slice(0, 500),
        startsAt: timestamp,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        location: location.value.trim().slice(0, 120),
        creatorId: eventRow?.creatorId || currentUid(),
        createdAt: eventRow?.createdAt || now,
        updatedAt: now,
        status: eventRow?.status || 'scheduled'
      };
      try {
        if (eventRow) await app.dbPut(`/groupEvents/${groupId}/${eventRow.id}`, row);
        else await app.dbPost(`/groupEvents/${groupId}`, row);
        app.toast(isEdit ? 'تم تحديث الفعالية' : 'تم إنشاء الفعالية');
        editingEventId = '';
        await loadGroupDetail(groupId);
      } catch (error) {
        app.toast('تعذر حفظ الفعالية. طبّق قواعد RTDB المحدّثة ثم حاول.');
        console.warn('group event save', error.firebaseCode || error.message);
      } finally { submit.disabled = false; }
    });
    return form;
  }

  function buildEvents(groupId, events, rsvps, members, manager, joined) {
    const section = make('section', 'group-content-section');
    const header = make('div', 'group-section-heading');
    header.append(make('h3', '', 'فعاليات المجموعة'), make('span', 'muted', 'نظّموا لقاءاتكم وتابعوا الحضور'));
    section.append(header);
    if (manager) {
      const eventToEdit = editingEventId ? { id: editingEventId, ...events[editingEventId] } : null;
      section.append(buildEventForm(groupId, eventToEdit));
    }
    const list = make('div', 'group-events-list');
    const rows = Object.entries(events || {}).map(([id, value]) => ({ id, ...(value || {}) }))
      .sort((a, b) => Number(a.startsAt || 0) - Number(b.startsAt || 0));
    if (!rows.length) list.append(app.emptyCard('لا توجد فعاليات معلنة', 'يمكن للمالك أو المشرف إضافة أول فعالية.'));
    for (const row of rows) {
      const card = make('article', 'card group-event-card');
      const title = make('h4', 'group-event-title', row.title || 'فعالية');
      const time = make('div', 'group-event-time', `◷ ${formatDate(row.startsAt)}`);
      const location = row.location ? make('div', 'group-event-location', `⌖ ${row.location}`) : null;
      const description = make('p', 'group-event-description', row.description || '');
      const status = make('span', `group-event-status${row.status === 'cancelled' ? ' cancelled' : ''}`, row.status === 'cancelled' ? 'أُلغيت' : 'معلنة');
      card.append(title, time);
      if (location) card.append(location);
      if (row.description) card.append(description);
      card.append(status);

      if (manager && row.status !== 'cancelled') {
        const manage = make('div', 'group-form-actions');
        manage.append(button('تعديل', 'inline-btn', () => {
          editingEventId = row.id;
          loadGroupDetail(groupId);
        }));
        manage.append(button('إلغاء الفعالية', 'inline-btn danger', async () => {
          if (!window.confirm('إلغاء هذه الفعالية؟ ستبقى ظاهرة مع علامة الإلغاء.')) return;
          try {
            const { id: eventId, ...eventData } = row;
            await app.dbPut(`/groupEvents/${groupId}/${eventId}`, { ...eventData, status: 'cancelled', updatedAt: Date.now() });
            app.toast('تم إلغاء الفعالية');
            await loadGroupDetail(groupId);
          } catch (error) {
            app.toast('تعذر إلغاء الفعالية. تحقق من قواعد RTDB.');
            console.warn('group event cancel', error.firebaseCode || error.message);
          }
        }));
        card.append(manage);
      }

      const eventRsvps = rsvps?.[row.id] || {};
      const counts = { going: 0, maybe: 0, notGoing: 0 };
      for (const item of Object.values(eventRsvps)) {
        if (item?.status === 'going') counts.going++;
        else if (item?.status === 'maybe') counts.maybe++;
        else if (item?.status === 'notGoing') counts.notGoing++;
      }
      const rsvpRow = make('div', 'group-rsvp-row');
      rsvpRow.append(make('span', 'muted group-rsvp-count', `حضور ${counts.going} · ربما ${counts.maybe}`));
      if (joined && row.status !== 'cancelled') {
        const mine = eventRsvps[currentUid()]?.status || '';
        for (const [value, label] of [['going', 'سأحضر'], ['maybe', 'ربما'], ['notGoing', 'لن أحضر']]) {
          const rsvp = button(label, `rsvp-button${mine === value ? ' selected' : ''}`, async event => {
            const target = event.currentTarget;
            target.disabled = true;
            try {
              await app.dbPut(`/groupEventRsvps/${groupId}/${row.id}/${currentUid()}`, { status: value, updatedAt: Date.now() });
              await loadGroupDetail(groupId);
            } catch (error) {
              app.toast('تعذر تسجيل الحضور. طبّق قواعد RTDB المحدّثة أولًا.');
              console.warn('group RSVP', error.firebaseCode || error.message);
            } finally { target.disabled = false; }
          });
          rsvp.setAttribute('aria-pressed', String(mine === value));
          rsvpRow.append(rsvp);
        }
      } else if (row.status === 'cancelled') {
        rsvpRow.append(make('span', 'muted', 'أُلغيت هذه الفعالية؛ لا يمكن تحديث الحضور.'));
      } else {
        rsvpRow.append(make('span', 'muted', 'انضم للمجموعة لتأكيد حضورك.'));
      }
      card.append(rsvpRow);
      list.append(card);
    }
    section.append(list);
    return section;
  }

  function buildMembers(groupId, group, members, profiles, currentRole) {
    const section = make('section', 'group-content-section');
    const header = make('div', 'group-section-heading');
    header.append(make('h3', '', 'أعضاء المجموعة'), make('span', 'muted', `${Object.keys(members).length || 1} عضو`));
    section.append(header);
    const list = make('div', 'group-members-list');
    const memberEntries = Object.entries(members || {});
    if (!memberEntries.some(([uid]) => uid === group.ownerId)) memberEntries.unshift([group.ownerId, 'owner']);
    memberEntries.sort((a, b) => (a[1] === 'owner' ? -1 : b[1] === 'owner' ? 1 : 0));
    const manager = isManagerRole(currentRole);
    for (const [uid, rawRole] of memberEntries) {
      const role = uid === group.ownerId ? 'owner' : rawRole;
      const person = profiles?.[uid] || {};
      const row = make('div', 'group-member-row');
      const avatar = make('div', 'avatar');
      const initial = Array.from(person.displayName || person.username || 'م')[0] || 'م';
      avatar.textContent = initial;
      const info = make('div', 'group-member-info');
      info.append(make('strong', '', person.displayName || person.username || 'عضو'), make('span', 'muted', roleName(role)));
      row.append(avatar, info);
      const controls = make('div', 'group-member-controls');
      if (currentRole === 'owner' && uid !== group.ownerId) {
        controls.append(button(role === 'admin' ? 'إزالة الإشراف' : 'تعيين مشرف', 'inline-btn', async () => {
          try {
            await app.dbPut(`/groupMembers/${groupId}/${uid}`, role === 'admin' ? 'member' : 'admin');
            app.toast(role === 'admin' ? 'تمت إزالة دور المشرف' : 'تم تعيين مشرف للمجموعة');
            await loadGroupDetail(groupId);
          } catch (error) {
            app.toast('تعذر تحديث الدور. طبّق قواعد RTDB المحدّثة.');
            console.warn('group role update', error.firebaseCode || error.message);
          }
        }));
      }
      const mayRemove = manager && uid !== group.ownerId && uid !== currentUid() && (currentRole === 'owner' || role === 'member');
      if (mayRemove) {
        controls.append(button('إزالة', 'inline-btn danger', async () => {
          if (!window.confirm(`إزالة ${person.displayName || person.username || 'هذا العضو'} من المجموعة؟ لن تُحذف منشوراته أو حسابه.`)) return;
          try {
            await app.dbDelete(`/groupMembers/${groupId}/${uid}`);
            app.toast('تمت إزالة العضو من المجموعة');
            await loadGroupDetail(groupId);
          } catch (error) {
            app.toast('تعذر إزالة العضو. تحقق من صلاحيات المالك/المشرف.');
            console.warn('group member remove', error.firebaseCode || error.message);
          }
        }));
      }
      if (controls.childElementCount) row.append(controls);
      list.append(row);
    }
    if (manager && !memberEntries.length) list.append(app.emptyCard('لا توجد عضويات لعرضها بعد'));
    section.append(list);
    return section;
  }

  window.MoadbookGroups = Object.freeze({
    loadGroups,
    renderCommunityDirectory,
    createGroup,
    openGroup,
    groupName,
    resetSession: () => {
      activeGroupId = '';
      groupLoadRequestId++;
      editingEventId = '';
      groups = [];
      memberships = {};
      groupAvatarCache = {};
      setDirectoryVisible(true);
      $('groupDetailView')?.replaceChildren();
    }
  });
})();
