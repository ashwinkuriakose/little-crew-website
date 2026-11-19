(() => {
  'use strict';

  const cfg = window.CMS_CONFIG || {};
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const SCREENS = ['loadingScreen', 'setupScreen', 'loginScreen', 'deniedScreen', 'app'];
  const BUCKET = 'site-images';

  function show(id) {
    SCREENS.forEach(s => $('#' + s).classList.toggle('hidden', s !== id));
  }

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  let toastTimer;
  function toast(message, isError = false) {
    const el = $('#toast');
    el.textContent = message;
    el.classList.toggle('error', isError);
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), isError ? 6000 : 2500);
  }

  function fail(error, prefix = 'Something went wrong') {
    console.error(error);
    toast(`${prefix}: ${error?.message || error}`, true);
  }

  function formatDate(iso, withTime = true) {
    const d = new Date(iso);
    return d.toLocaleString('en-GB', withTime
      ? { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }
      : { day: '2-digit', month: 'short', year: 'numeric' });
  }

  const FORM_LABELS = { contact: 'Contact', booking: 'Event enquiry', waitlist: 'Waitlist' };
  const formLabel = form => FORM_LABELS[form] || form;
  const subjectOf = s => (s.form === 'contact' ? s.subject : s.event_title || s.subject) || '';

  function siteUrl(url) {
    if (!url) return '';
    return /^(https?:)?\/\//i.test(url) || url.startsWith('data:') ? url : '../' + url.replace(/^\.?\//, '');
  }

  // ===================================================================
  // Startup & auth
  // ===================================================================
  if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || !window.supabase) {
    show('setupScreen');
    return;
  }

  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  let appStarted = false;

  async function handleSession(session) {
    if (!session) { show('loginScreen'); return; }
    const { data: isAdmin, error } = await sb.rpc('is_admin');
    if (error || !isAdmin) {
      if (error) console.error(error);
      $('#deniedEmail').textContent = session.user.email;
      show('deniedScreen');
      return;
    }
    show('app');
    if (!appStarted) { appStarted = true; startApp(); }
  }

  sb.auth.getSession().then(({ data }) => handleSession(data.session));
  sb.auth.onAuthStateChange(event => {
    if (event === 'SIGNED_OUT') window.location.reload();
  });

  $('#loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = $('#loginBtn');
    btn.disabled = true;
    btn.textContent = 'Signing in…';
    $('#loginError').textContent = '';
    const { data, error } = await sb.auth.signInWithPassword({
      email: $('#loginEmail').value.trim(),
      password: $('#loginPassword').value
    });
    btn.disabled = false;
    btn.textContent = 'Sign in';
    if (error) { $('#loginError').textContent = error.message; return; }
    handleSession(data.session);
  });

  document.addEventListener('click', e => {
    if (e.target.closest('[data-action="sign-out"]')) {
      if (contentDirty() && !confirm('You have unsaved text changes. Sign out anyway?')) return;
      sb.auth.signOut();
    }
    const closer = e.target.closest('[data-close]');
    if (closer) closeDrawer(closer.dataset.close);
    if (e.target.classList.contains('drawer-backdrop')) closeDrawer(e.target.id);
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') $$('.drawer-backdrop:not(.hidden)').forEach(d => closeDrawer(d.id));
  });

  function openDrawer(id) { $('#' + id).classList.remove('hidden'); document.body.style.overflow = 'hidden'; }
  function closeDrawer(id) { $('#' + id).classList.add('hidden'); document.body.style.overflow = ''; }

  // ===================================================================
  // Tabs
  // ===================================================================
  const loaded = {};
  function switchTab(name) {
    $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    $$('.panel').forEach(p => p.classList.toggle('hidden', p.id !== 'tab-' + name));
    if (!loaded[name]) {
      loaded[name] = true;
      if (name === 'events') loadEvents();
      if (name === 'content') loadContent();
    }
  }

  function startApp() {
    $$('.tab').forEach(t => t.addEventListener('click', () => switchTab(t.dataset.tab)));
    loaded.submissions = true;
    initSubmissions();
    initEvents();
    initContent();
  }

  // ===================================================================
  // SUBMISSIONS
  // ===================================================================
  let subs = [];
  let filtered = [];
  const selected = new Set();
  let sort = { key: 'created_at', dir: 'desc' };
  let page = 0;
  const PAGE_SIZE = 50;

  function initSubmissions() {
    // Default view: everything that isn't archived
    const statusSel = $('#subStatus');
    statusSel.innerHTML = `
      <option value="inbox">Inbox (not archived)</option>
      <option value="new">New only</option>
      <option value="read">Read</option>
      <option value="archived">Archived</option>
      <option value="">Everything</option>`;

    ['#subSearch', '#subForm', '#subEvent', '#subStatus', '#subFrom', '#subTo'].forEach(sel => {
      $(sel).addEventListener('input', () => { page = 0; applySubFilters(); });
    });
    $('#subRefresh').addEventListener('click', loadSubs);
    $('#subExport').addEventListener('click', () => downloadCsv(filtered, 'all'));
    $('#subCheckAll').addEventListener('change', e => {
      pageRows().forEach(r => e.target.checked ? selected.add(r.id) : selected.delete(r.id));
      renderSubs();
    });
    $$('.data-table th[data-sort]').forEach(th => th.addEventListener('click', () => {
      const key = th.dataset.sort;
      sort = { key, dir: sort.key === key && sort.dir === 'asc' ? 'desc' : 'asc' };
      if (sort.key !== key) sort.dir = key === 'created_at' ? 'desc' : 'asc';
      applySubFilters();
    }));
    $('#subBody').addEventListener('click', e => {
      if (e.target.closest('input[type="checkbox"]')) return;
      const tr = e.target.closest('tr[data-id]');
      if (tr) openSubmission(tr.dataset.id);
    });
    $('#subBody').addEventListener('change', e => {
      const box = e.target.closest('input[data-id]');
      if (!box) return;
      box.checked ? selected.add(box.dataset.id) : selected.delete(box.dataset.id);
      renderSubs();
    });
    $('#bulkBar').addEventListener('click', e => {
      const btn = e.target.closest('[data-bulk]');
      if (btn) bulkAction(btn.dataset.bulk);
    });
    loadSubs();
  }

  async function loadSubs() {
    $('#subSummary').textContent = 'Loading…';
    try {
      let rows = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await sb.from('submissions').select('*')
          .order('created_at', { ascending: false }).range(from, from + 999);
        if (error) throw error;
        rows = rows.concat(data);
        if (data.length < 1000) break;
      }
      subs = rows;
      fillEventFilter();
      const ids = new Set(subs.map(s => s.id));
      [...selected].forEach(id => { if (!ids.has(id)) selected.delete(id); });
      applySubFilters();
    } catch (err) {
      $('#subSummary').textContent = 'Could not load submissions.';
      fail(err, 'Could not load submissions');
    }
  }

  function fillEventFilter() {
    const sel = $('#subEvent');
    const current = sel.value;
    const titles = [...new Set(subs.map(s => s.event_title).filter(Boolean))].sort();
    sel.innerHTML = '<option value="">All events</option>' +
      titles.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
    if (titles.includes(current)) sel.value = current;
  }

  function applySubFilters() {
    const q = $('#subSearch').value.trim().toLowerCase();
    const form = $('#subForm').value;
    const eventTitle = $('#subEvent').value;
    const status = $('#subStatus').value;
    const from = $('#subFrom').value ? new Date($('#subFrom').value + 'T00:00:00') : null;
    const to = $('#subTo').value ? new Date($('#subTo').value + 'T23:59:59.999') : null;

    filtered = subs.filter(s => {
      if (form && s.form !== form) return false;
      if (eventTitle && s.event_title !== eventTitle) return false;
      if (status === 'inbox' && s.status === 'archived') return false;
      if (status && status !== 'inbox' && s.status !== status) return false;
      const created = new Date(s.created_at);
      if (from && created < from) return false;
      if (to && created > to) return false;
      if (q) {
        const hay = [s.name, s.email, s.phone, s.postcode, s.preferred_location, s.subject, s.message, s.event_title].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const { key, dir } = sort;
    filtered.sort((a, b) => {
      const av = String(a[key] ?? '').toLowerCase();
      const bv = String(b[key] ?? '').toLowerCase();
      return (av < bv ? -1 : av > bv ? 1 : 0) * (dir === 'asc' ? 1 : -1);
    });

    $$('.data-table th[data-sort]').forEach(th => {
      th.classList.toggle('sorted-asc', th.dataset.sort === key && dir === 'asc');
      th.classList.toggle('sorted-desc', th.dataset.sort === key && dir === 'desc');
    });

    const maxPage = Math.max(0, Math.ceil(filtered.length / PAGE_SIZE) - 1);
    if (page > maxPage) page = maxPage;
    renderSubs();
  }

  function pageRows() {
    return filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  }

  function renderSubs() {
    const rows = pageRows();
    $('#subBody').innerHTML = rows.map(s => `
      <tr data-id="${esc(s.id)}" class="${s.status === 'new' ? 'is-new' : ''}">
        <td class="col-check"><input type="checkbox" data-id="${esc(s.id)}" ${selected.has(s.id) ? 'checked' : ''} aria-label="Select"></td>
        <td class="cell-nowrap" data-label="Date">${esc(formatDate(s.created_at))}</td>
        <td data-label="Form"><span class="tag tag-${esc(s.form)}">${esc(formLabel(s.form))}</span></td>
        <td class="cell-name">${esc(s.name)}</td>
        <td data-label="Email">${esc(s.email)}</td>
        <td class="cell-nowrap" data-label="Phone">${esc(s.phone || '')}</td>
        <td class="cell-nowrap" data-label="Postcode">${esc(s.postcode || '')}</td>
        <td class="cell-nowrap" data-label="Location">${esc(s.preferred_location || '')}</td>
        <td data-label="${s.form === 'contact' ? 'Subject' : 'Event'}">${esc(subjectOf(s))}</td>
        <td data-label="Message"><div class="cell-msg">${esc(s.message || '')}</div></td>
        <td data-label="Status"><span class="tag tag-${esc(s.status)}">${esc(s.status)}</span></td>
      </tr>`).join('');

    $('#subEmpty').classList.toggle('hidden', rows.length > 0);
    $('#subCheckAll').checked = rows.length > 0 && rows.every(r => selected.has(r.id));

    const newCount = subs.filter(s => s.status === 'new').length;
    const pill = $('#newCount');
    pill.hidden = newCount === 0;
    pill.textContent = newCount;
    $('#subSummary').textContent =
      `${subs.length} total · ${newCount} new · showing ${filtered.length}`;

    $('#bulkBar').classList.toggle('hidden', selected.size === 0);
    $('#bulkCount').textContent = `${selected.size} selected`;

    const pages = Math.ceil(filtered.length / PAGE_SIZE);
    $('#subPager').innerHTML = pages > 1 ? `
      <button class="btn btn-ghost btn-sm" data-page="${page - 1}" ${page === 0 ? 'disabled' : ''}>← Prev</button>
      <span>Page ${page + 1} of ${pages}</span>
      <button class="btn btn-ghost btn-sm" data-page="${page + 1}" ${page >= pages - 1 ? 'disabled' : ''}>Next →</button>` : '';
    $$('#subPager [data-page]').forEach(b => b.addEventListener('click', () => {
      page = +b.dataset.page;
      renderSubs();
      $('.table-wrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
  }

  async function setStatus(ids, status) {
    const { error } = await sb.from('submissions').update({ status }).in('id', ids);
    if (error) { fail(error, 'Could not update'); return false; }
    subs.forEach(s => { if (ids.includes(s.id)) s.status = status; });
    applySubFilters();
    return true;
  }

  async function deleteSubs(ids) {
    const { error } = await sb.from('submissions').delete().in('id', ids);
    if (error) { fail(error, 'Could not delete'); return false; }
    subs = subs.filter(s => !ids.includes(s.id));
    ids.forEach(id => selected.delete(id));
    applySubFilters();
    return true;
  }

  async function bulkAction(action) {
    const ids = [...selected];
    if (!ids.length) return;
    if (action === 'export') {
      downloadCsv(subs.filter(s => selected.has(s.id)), 'selected');
      return;
    }
    if (action === 'delete') {
      if (!confirm(`Permanently delete ${ids.length} submission(s)? This can't be undone.`)) return;
      if (await deleteSubs(ids)) toast(`Deleted ${ids.length}`);
      return;
    }
    if (await setStatus(ids, action)) {
      selected.clear();
      renderSubs();
      toast('Updated');
    }
  }

  function openSubmission(id) {
    const s = subs.find(x => x.id === id);
    if (!s) return;
    const replySubject = encodeURIComponent(`Re: ${subjectOf(s) || 'Your message'}`);
    $('#subDetail').innerHTML = `
      <div class="detail-head">
        <span class="tag tag-${esc(s.form)}">${esc(formLabel(s.form))}</span>
        <h2>${esc(s.name)}</h2>
        <p class="muted">${esc(formatDate(s.created_at))}</p>
      </div>
      <dl class="detail-list">
        <dt>Email</dt><dd><a href="mailto:${esc(s.email)}">${esc(s.email)}</a></dd>
        <dt>Phone</dt><dd>${s.phone ? `<a href="tel:${esc(s.phone.replace(/[^\d+]/g, ''))}">${esc(s.phone)}</a>` : '<span class="muted">—</span>'}</dd>
        ${s.postcode ? `<dt>Postcode</dt><dd>${esc(s.postcode)}</dd>` : ''}
        ${s.preferred_location ? `<dt>Location</dt><dd>${esc(s.preferred_location)}</dd>` : ''}
        ${s.event_title ? `<dt>Event</dt><dd>${esc(s.event_title)}</dd>` : ''}
        <dt>Subject</dt><dd>${esc(s.subject || '—')}</dd>
        <dt>Status</dt><dd>
          <select id="detailStatus" style="width:auto">
            ${['new', 'read', 'archived'].map(v => `<option value="${v}" ${s.status === v ? 'selected' : ''}>${v}</option>`).join('')}
          </select>
        </dd>
      </dl>
      ${s.message ? `<h3 style="font-size:0.9rem;margin-bottom:0.5rem" class="muted">Message</h3><div class="detail-message">${esc(s.message)}</div>` : ''}
      <div class="detail-actions">
        <a class="btn btn-primary btn-sm" href="mailto:${esc(s.email)}?subject=${replySubject}">Reply by email</a>
        <button class="btn btn-danger btn-sm" id="detailDelete">Delete</button>
      </div>`;

    $('#detailStatus').addEventListener('change', e => setStatus([s.id], e.target.value).then(ok => ok && toast('Status updated')));
    $('#detailDelete').addEventListener('click', async () => {
      if (!confirm('Permanently delete this submission?')) return;
      if (await deleteSubs([s.id])) { closeDrawer('subDrawer'); toast('Deleted'); }
    });
    openDrawer('subDrawer');

    if (s.status === 'new') setStatus([s.id], 'read');
  }

  function csvCell(value) {
    let v = String(value ?? '');
    if (/^\+[\d\s()-]+$/.test(v)) v = `="${v}"`;              // phone numbers: keep as text in Excel
    else if (/^[=+\-@\t\r]/.test(v)) v = "'" + v;              // stop spreadsheet formulas
    return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  }

  function downloadCsv(rows, label) {
    if (!rows.length) { toast('Nothing to download', true); return; }
    const header = ['Date', 'Time', 'Form', 'Name', 'Email', 'Phone', 'Postcode', 'Preferred location', 'Subject', 'Event', 'Message', 'Status'];
    const lines = rows.map(s => {
      const d = new Date(s.created_at);
      return [
        d.toLocaleDateString('en-GB'),
        d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
        formLabel(s.form),
        s.name, s.email, s.phone, s.postcode, s.preferred_location, s.subject, s.event_title, s.message, s.status
      ].map(csvCell).join(',');
    });
    const csv = '﻿' + [header.join(','), ...lines].join('\r\n'); // BOM so Excel reads emojis/accents
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `littlecrew-submissions-${label}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast(`Downloaded ${rows.length} row(s)`);
  }

  // ===================================================================
  // EVENTS
  // ===================================================================
  let events = [];
  let editingId = null;

  const EVENT_FIELDS = ['title', 'category', 'image_url', 'banner_image_url', 'date_day', 'date_month', 'date_year', 'status_pill',
    'pill_style', 'time_label', 'location', 'tagline', 'summary', 'booking_mode', 'booking_url', 'phone',
    'details_title', 'details_time', 'details_location', 'artist', 'description', 'cta_text'];

  function initEvents() {
    $('#eventAdd').addEventListener('click', () => openEventForm(null));
    $('#eventForm').addEventListener('submit', saveEvent);
    $('#eventForm').booking_mode.addEventListener('change', syncBookingFields);
    IMAGE_PICKERS.forEach(picker => {
      $('#eventForm')[picker.field].addEventListener('input', e => updatePreview(picker, e.target.value));
      $(picker.file).addEventListener('change', e => uploadImage(e, picker));
    });
    $('#bannerImageClear').addEventListener('click', () => {
      const picker = IMAGE_PICKERS[1];
      $('#eventForm')[picker.field].value = '';
      updatePreview(picker, '');
    });
    $('#eventList').addEventListener('click', onEventListClick);
    $('#eventList').addEventListener('change', async e => {
      const toggle = e.target.closest('input[data-publish], input[data-feature]');
      if (!toggle) return;
      const field = toggle.dataset.publish ? 'published' : 'featured';
      const ev = events.find(x => x.id === (toggle.dataset.publish || toggle.dataset.feature));
      const { error } = await sb.from('events').update({ [field]: toggle.checked, updated_at: new Date().toISOString() }).eq('id', ev.id);
      if (error) { toggle.checked = !toggle.checked; fail(error, 'Could not update'); return; }
      ev[field] = toggle.checked;
      renderEvents();
      if (field === 'published') toast(toggle.checked ? 'Now visible on the website' : 'Hidden from the website');
      else toast(toggle.checked ? 'Added to the top banner' : 'Removed from the top banner');
    });
  }

  async function loadEvents() {
    $('#eventList').innerHTML = '<div class="empty">Loading…</div>';
    const { data, error } = await sb.from('events').select('*')
      .order('sort_order', { ascending: true }).order('created_at', { ascending: true });
    if (error) { $('#eventList').innerHTML = ''; fail(error, 'Could not load events'); return; }
    events = data;
    renderEvents();
  }

  function eventRow(ev, indexInGroup, groupSize) {
    return `
      <div class="event-row ${ev.published ? '' : 'is-hidden'}">
        <div class="event-order">
          <button class="btn btn-ghost" data-move="up" data-id="${esc(ev.id)}" ${indexInGroup === 0 ? 'disabled' : ''} title="Move up">▲</button>
          <button class="btn btn-ghost" data-move="down" data-id="${esc(ev.id)}" ${indexInGroup === groupSize - 1 ? 'disabled' : ''} title="Move down">▼</button>
        </div>
        ${ev.image_url ? `<img class="event-thumb" src="${esc(siteUrl(ev.image_url))}" alt="">` : '<div class="event-thumb"></div>'}
        <div class="event-main">
          <h3>${esc(ev.title)}</h3>
          <div class="meta">
            ${[ev.date_day, ev.date_month, ev.date_year].filter(Boolean).length ? `<span>${esc([ev.date_day, ev.date_month, ev.date_year].filter(Boolean).join(' '))}</span>` : ''}
            ${ev.location ? `<span>${esc(ev.location)}</span>` : ''}
            <span>${{ tickets: '🎟️ Tickets on sale', waitlist: '📝 Waitlist open', enquiry: '✉️ Enquiry form' }[modeOf(ev)]}</span>
          </div>
        </div>
        <div class="event-actions-row">
          <label class="switch" title="Show on website">
            <input type="checkbox" data-publish="${esc(ev.id)}" ${ev.published ? 'checked' : ''}>
            <span class="track"></span> ${ev.published ? 'Visible' : 'Hidden'}
          </label>
          <label class="switch" title="Show as an ad in the top banner slider">
            <input type="checkbox" data-feature="${esc(ev.id)}" ${ev.featured ? 'checked' : ''}>
            <span class="track"></span> Banner
          </label>
          <button class="btn btn-ghost btn-sm" data-edit="${esc(ev.id)}">Edit</button>
          <button class="btn btn-ghost btn-sm" data-duplicate="${esc(ev.id)}">Duplicate</button>
          <button class="btn btn-danger btn-sm" data-delete="${esc(ev.id)}">Delete</button>
        </div>
      </div>`;
  }

  function modeOf(ev) {
    return ev.booking_mode || (ev.booking_url ? 'tickets' : 'enquiry');
  }

  function syncBookingFields() {
    const form = $('#eventForm');
    const tickets = form.booking_mode.value === 'tickets';
    // Always visible, so a link can be added early while the event is still on waitlist
    form.booking_url.required = tickets;
    const waitlist = form.booking_mode.value === 'waitlist';
    $('#waitlistOptionsField').classList.toggle('hidden', !waitlist);
    $('#waitlistOptionsHint').classList.toggle('hidden', !waitlist);
    $('#bookingUrlLabel').textContent = tickets
      ? 'Ticket link for this event *'
      : 'Ticket link for this event (used once you switch to “Tickets on sale”)';
  }

  function renderEvents() {
    const groups = [
      ['Upcoming', events.filter(e => e.category !== 'past')],
      ['Past', events.filter(e => e.category === 'past')]
    ];
    $('#eventList').innerHTML = events.length
      ? groups.map(([label, list]) => `
          <h3 class="section-label">${label} (${list.length})</h3>
          ${list.length ? list.map((ev, i) => eventRow(ev, i, list.length)).join('') : '<p class="muted">None</p>'}`).join('')
      : '<div class="empty">No events yet. Click “Add event” to create one.</div>';
  }

  async function onEventListClick(e) {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.edit) openEventForm(t.dataset.edit);
    if (t.dataset.delete) {
      const ev = events.find(x => x.id === t.dataset.delete);
      if (!confirm(`Delete “${ev.title}”? This can't be undone.`)) return;
      const { error } = await sb.from('events').delete().eq('id', ev.id);
      if (error) { fail(error, 'Could not delete'); return; }
      events = events.filter(x => x.id !== ev.id);
      renderEvents();
      toast('Event deleted');
    }
    if (t.dataset.duplicate) {
      const src = events.find(x => x.id === t.dataset.duplicate);
      const copy = { ...src };
      delete copy.id; delete copy.created_at; delete copy.updated_at;
      copy.title = `${src.title} (copy)`;
      copy.published = false;
      copy.featured = false;
      copy.sort_order = Math.max(0, ...events.map(x => x.sort_order)) + 1;
      const { data, error } = await sb.from('events').insert(copy).select().single();
      if (error) { fail(error, 'Could not duplicate'); return; }
      events.push(data);
      renderEvents();
      toast('Copy created (hidden until you turn it on)');
    }
    if (t.dataset.move) moveEvent(t.dataset.id, t.dataset.move === 'up' ? -1 : 1);
  }

  async function moveEvent(id, delta) {
    const ev = events.find(x => x.id === id);
    const isPast = ev.category === 'past';
    const group = events.filter(x => (x.category === 'past') === isPast);
    const i = group.indexOf(ev);
    const j = i + delta;
    if (j < 0 || j >= group.length) return;
    [group[i], group[j]] = [group[j], group[i]];

    // Renumber everything: upcoming first, then past
    const upcoming = isPast ? events.filter(x => x.category !== 'past') : group;
    const past = isPast ? group : events.filter(x => x.category === 'past');
    events = [...upcoming, ...past];
    const changes = [];
    events.forEach((x, idx) => {
      if (x.sort_order !== idx + 1) { x.sort_order = idx + 1; changes.push(x); }
    });
    renderEvents();

    const results = await Promise.all(changes.map(x =>
      sb.from('events').update({ sort_order: x.sort_order }).eq('id', x.id)));
    const err = results.find(r => r.error);
    if (err) { fail(err.error, 'Could not save order'); loadEvents(); }
  }

  const IMAGE_PICKERS = [
    { field: 'image_url', file: '#eventImageFile', preview: '#eventImagePreview', status: '#eventImageStatus', name: 'poster', empty: 'No image' },
    { field: 'banner_image_url', file: '#bannerImageFile', preview: '#bannerImagePreview', status: '#bannerImageStatus', name: 'banner', empty: 'No banner image — the poster is used instead', checkSize: true }
  ];

  function updatePreview(picker, url) {
    const box = $(picker.preview);
    if (!url) {
      box.innerHTML = `<span class="muted">${esc(picker.empty)}</span>`;
      if (picker.checkSize) $(picker.status).textContent = '';
      return;
    }
    box.innerHTML = `<img src="${esc(siteUrl(url))}" alt="Preview">`;
    if (picker.checkSize) {
      const img = box.querySelector('img');
      img.addEventListener('load', () => {
        const w = img.naturalWidth, h = img.naturalHeight;
        const ratio = w / h;
        const status = $(picker.status);
        const prefix = picker.justUploaded ? 'Uploaded ✓ (remember to save the event) · ' : '';
        picker.justUploaded = false;
        const notes = [];
        if (Math.abs(ratio - 3 / 4) > 0.06) notes.push('not 3:4 portrait, so it will be cropped');
        if (w < 900) notes.push('a bit small, so it may look blurry');
        status.textContent = prefix + `${w} × ${h} px` + (notes.length ? ` — ${notes.join('; ')}.` : ' ✓ good size');
        status.classList.toggle('warn', notes.length > 0);
      }, { once: true });
    }
  }

  async function uploadImage(e, picker) {
    const file = e.target.files[0];
    if (!file) return;
    const status = $(picker.status);
    if (file.size > 8 * 1024 * 1024) { status.textContent = 'Image is too large (max 8 MB).'; return; }
    status.textContent = 'Uploading…';
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
    const base = file.name.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) || picker.name;
    const path = `events/${Date.now()}-${base}.${ext}`;
    const { error } = await sb.storage.from(BUCKET).upload(path, file, { cacheControl: '31536000', upsert: false, contentType: file.type });
    e.target.value = '';
    if (error) { status.textContent = ''; fail(error, 'Upload failed'); return; }
    const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
    $('#eventForm')[picker.field].value = data.publicUrl;
    status.textContent = 'Uploaded ✓ — remember to save the event.';
    picker.justUploaded = true;
    updatePreview(picker, data.publicUrl);
  }


  function openEventForm(id) {
    editingId = id;
    const form = $('#eventForm');
    form.reset();
    $('#eventError').textContent = '';
    $('#eventImageStatus').textContent = '';
    const ev = id ? events.find(x => x.id === id) : { category: 'upcoming', pill_style: 'upcoming', published: true, badges: [] };
    $('#eventFormTitle').textContent = id ? `Edit: ${ev.title}` : 'New event';
    EVENT_FIELDS.forEach(f => { if (form[f]) form[f].value = ev[f] ?? ''; });
    if (!id) { form.category.value = 'upcoming'; form.pill_style.value = 'upcoming'; }
    form.booking_mode.value = id ? modeOf(ev) : 'enquiry';
    syncBookingFields();
    form.published.checked = !!ev.published;
    form.featured.checked = !!ev.featured;
    form.badges.value = (ev.badges || []).join('\n');
    form.waitlist_options.value = (ev.waitlist_options || []).join('\n');
    IMAGE_PICKERS.forEach(picker => { $(picker.status).textContent = ''; updatePreview(picker, ev[picker.field]); });
    openDrawer('eventDrawer');
    form.title.focus();
  }

  async function saveEvent(e) {
    e.preventDefault();
    const form = e.target;
    const btn = $('#eventSaveBtn');
    const record = {};
    EVENT_FIELDS.forEach(f => {
      const v = form[f].value.trim();
      record[f] = v === '' ? null : v;
    });
    record.category = form.category.value;
    record.pill_style = form.pill_style.value;
    record.published = form.published.checked;
    record.featured = form.featured.checked;
    record.badges = form.badges.value.split('\n').map(s => s.trim()).filter(Boolean);
    record.waitlist_options = form.waitlist_options.value.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 30);
    record.updated_at = new Date().toISOString();

    btn.disabled = true;
    btn.textContent = 'Saving…';
    let result;
    if (editingId) {
      result = await sb.from('events').update(record).eq('id', editingId).select().single();
    } else {
      record.sort_order = Math.max(0, ...events.map(x => x.sort_order)) + 1;
      result = await sb.from('events').insert(record).select().single();
    }
    btn.disabled = false;
    btn.textContent = 'Save event';

    if (result.error) { $('#eventError').textContent = result.error.message; return; }
    if (editingId) events = events.map(x => x.id === editingId ? result.data : x);
    else events.push(result.data);
    renderEvents();
    closeDrawer('eventDrawer');
    toast('Event saved — live on the website');
  }

  // ===================================================================
  // WEBSITE TEXT
  // ===================================================================
  const SECTION_NAMES = {
    header: 'Header',
    hero: 'Top banner',
    about: 'About',
    approach: 'Why choose us & Our approach',
    services: 'Services',
    events: 'Events section headings',
    contact: 'Contact details',
    footer: 'Footer'
  };
  let contentFields = []; // { key, label, rich, attr, def, saved (db value or undefined) }

  function initContent() {
    $('#contentSave').addEventListener('click', saveContent);
    $('#contentSections').addEventListener('input', e => {
      const input = e.target.closest('[data-key]');
      if (input) markChanged(input);
    });
    $('#contentSections').addEventListener('click', e => {
      const btn = e.target.closest('[data-reset]');
      if (!btn) return;
      const field = contentFields.find(f => f.key === btn.dataset.reset);
      const input = $(`[data-key="${CSS.escape(field.key)}"]`);
      input.value = field.def;
      markChanged(input);
    });
    window.addEventListener('beforeunload', e => {
      if (contentDirty()) { e.preventDefault(); e.returnValue = ''; }
    });
  }

  function defaultValue(el) {
    if (el.dataset.cmsAttr) return el.getAttribute(el.dataset.cmsAttr) || '';
    if (!el.dataset.cmsRich) return el.textContent.replace(/\s+/g, ' ').trim();

    // Rich text: highlighted spans → *stars*, <br> → new line.
    // Line breaks in the HTML source are only spacing, so flatten them first.
    const copy = el.cloneNode(true);
    const walker = copy.ownerDocument.createTreeWalker(copy, NodeFilter.SHOW_TEXT);
    const texts = [];
    while (walker.nextNode()) texts.push(walker.currentNode);
    texts.forEach(t => { t.nodeValue = t.nodeValue.replace(/\s+/g, ' '); });
    copy.querySelectorAll('.' + el.dataset.cmsRich).forEach(span => span.replaceWith(`*${span.textContent.trim()}*`));
    copy.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
    return copy.textContent.split('\n').map(line => line.replace(/ +/g, ' ').trim()).filter(Boolean).join('\n');
  }

  async function loadContent() {
    const box = $('#contentSections');
    box.innerHTML = '<div class="empty">Loading…</div>';
    try {
      const [html, { data: rows, error }] = await Promise.all([
        fetch('../index.html', { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error('Could not read index.html'); return r.text(); }),
        sb.from('site_content').select('key,value')
      ]);
      if (error) throw error;
      const saved = Object.fromEntries((rows || []).map(r => [r.key, r.value]));
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const seen = new Set();
      contentFields = $$('[data-cms]', doc).filter(el => !seen.has(el.dataset.cms) && seen.add(el.dataset.cms)).map(el => ({
        key: el.dataset.cms,
        label: el.dataset.cmsLabel || el.dataset.cms,
        rich: !!el.dataset.cmsRich,
        attr: el.dataset.cmsAttr,
        def: defaultValue(el),
        saved: saved[el.dataset.cms]
      }));
      renderContent();
    } catch (err) {
      box.innerHTML = '';
      fail(err, 'Could not load website text');
    }
  }

  function renderContent() {
    const groups = {};
    contentFields.forEach(f => {
      const section = f.key.split('.')[0];
      (groups[section] = groups[section] || []).push(f);
    });

    $('#contentSections').innerHTML = Object.entries(groups).map(([section, fields], idx) => `
      <details class="content-card" ${idx === 0 ? 'open' : ''}>
        <summary>${esc(SECTION_NAMES[section] || section)} <span class="muted small" style="margin-left:auto;margin-right:0.75rem">${fields.length} fields</span></summary>
        <div class="content-fields">
          ${fields.map(fieldHtml).join('')}
        </div>
      </details>`).join('');
    updateSaveButton();
  }

  function fieldHtml(f) {
    const value = f.saved ?? f.def;
    const long = f.rich || value.length > 70;
    const id = 'cf-' + f.key.replace(/\W/g, '-');
    const input = f.attr
      ? `<input id="${id}" type="number" data-key="${esc(f.key)}" value="${esc(value)}">`
      : long
        ? `<textarea id="${id}" data-key="${esc(f.key)}" rows="${Math.min(8, Math.max(2, Math.ceil(value.length / 70) + (value.split('\n').length - 1)))}">${esc(value)}</textarea>`
        : `<input id="${id}" type="text" data-key="${esc(f.key)}" value="${esc(value)}">`;
    return `
      <div class="field content-field ${value.length > 140 ? 'wide' : ''}">
        <div class="field-top">
          <label for="${id}"><span>${esc(f.label)}${f.saved !== undefined ? '<em class="badge-custom">edited</em>' : ''}</span></label>
          ${f.saved !== undefined && f.saved !== f.def ? `<button type="button" class="link-btn" data-reset="${esc(f.key)}">Reset to original</button>` : ''}
        </div>
        ${input}
        ${f.rich ? '<p class="hint">Put *stars* around words to highlight them. Press Enter for a new line.</p>' : ''}
      </div>`;
  }

  function markChanged(input) {
    const f = contentFields.find(x => x.key === input.dataset.key);
    input.closest('.content-field').classList.toggle('changed', input.value !== (f.saved ?? f.def));
    updateSaveButton();
  }

  function changedFields() {
    return contentFields.filter(f => {
      const input = $(`[data-key="${CSS.escape(f.key)}"]`);
      return input && input.value !== (f.saved ?? f.def);
    });
  }

  function contentDirty() {
    return contentFields.length > 0 && changedFields().length > 0;
  }

  function updateSaveButton() {
    const n = changedFields().length;
    const btn = $('#contentSave');
    btn.disabled = n === 0;
    btn.textContent = n ? `Save ${n} change${n > 1 ? 's' : ''}` : 'Save changes';
  }

  async function saveContent() {
    const changes = changedFields();
    if (!changes.length) return;
    const btn = $('#contentSave');
    btn.disabled = true;
    btn.textContent = 'Saving…';

    const upserts = [];
    const deletes = [];
    changes.forEach(f => {
      const value = $(`[data-key="${CSS.escape(f.key)}"]`).value;
      if (value === f.def) deletes.push(f.key);            // back to original → remove override
      else upserts.push({ key: f.key, value, updated_at: new Date().toISOString() });
    });

    try {
      if (upserts.length) {
        const { error } = await sb.from('site_content').upsert(upserts);
        if (error) throw error;
      }
      if (deletes.length) {
        const { error } = await sb.from('site_content').delete().in('key', deletes);
        if (error) throw error;
      }
      upserts.forEach(u => { contentFields.find(f => f.key === u.key).saved = u.value; });
      deletes.forEach(k => { contentFields.find(f => f.key === k).saved = undefined; });
      renderContent();
      toast('Saved — live on the website');
    } catch (err) {
      fail(err, 'Could not save');
      updateSaveButton();
    }
  }
})();
