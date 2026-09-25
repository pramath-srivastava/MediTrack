(() => {
  'use strict';
  const STORAGE_KEY = 'meditrack_demo_v1';
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const today = new Date();
  const localKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const isoDate = localKey(today);
  const dateOffset = (amount) => { const date = new Date(); date.setDate(date.getDate() + amount); return localKey(date); };
  const escapeHTML = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const makeId = () => (globalThis.crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const seed = () => {
    const meds = [
      { id: 'med-a', name: 'Vitamin D', dosage: '1 capsule', frequency: 'WEEKLY', times: ['09:00'], weekdays: [0], startDate: dateOffset(-45), endDate: '', instructions: 'After breakfast', isActive: true },
      { id: 'med-b', name: 'Daily medication', dosage: '1 tablet', frequency: 'DAILY', times: ['08:00', '20:00'], weekdays: [], startDate: dateOffset(-30), endDate: '', instructions: 'Follow your prescription label', isActive: true },
      { id: 'med-c', name: 'Evening supplement', dosage: '1 tablet', frequency: 'DAILY', times: ['19:30'], weekdays: [], startDate: dateOffset(-18), endDate: '', instructions: '', isActive: true }
    ];
    const events = [];
    for (let offset = -6; offset <= 0; offset += 1) {
      const date = dateOffset(offset);
      const weekday = new Date(`${date}T12:00:00`).getDay();
      meds.forEach((med, index) => {
        if (med.frequency === 'WEEKLY' && !med.weekdays.includes(weekday)) return;
        med.times.forEach((time, timeIndex) => {
          if (date === isoDate && time > new Date().toTimeString().slice(0, 5)) return;
          let status = (offset + index + timeIndex) % 7 === 0 ? 'SKIPPED' : 'TAKEN';
          if (date === isoDate && time === '20:00') status = 'PENDING';
          events.push({ id: `${med.id}-${date}-${time}`, medicationId: med.id, date, time, status, takenAt: status === 'TAKEN' ? `${date}T${time}:00` : null });
        });
      });
    }
    return { mode: 'demo', user: { name: 'Alex Morgan', email: 'patient@example.com', role: 'PATIENT', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata' }, medications: meds, events, connections: [], invited: [], notificationPermission: 'default' };
  };
  function loadData() {
    // Demo data is loaded only when the user is explicitly in the browser demo. It is never an API fallback.
    try { const stored = localStorage.getItem(STORAGE_KEY); if (stored) return JSON.parse(stored); } catch { /* Invalid local demo state is reset below. */ }
    const initial = seed(); saveData(initial); return initial;
  }
  let state = loadData();
  let chart = null;
  function saveData(next = state) { state = next; try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { toast('This browser could not save demo data.', true); } }
  function toast(message, error = false) { const item = document.createElement('div'); item.className = `toast${error ? ' error' : ''}`; item.textContent = message; $('#toast-region').append(item); window.setTimeout(() => item.remove(), 3500); }
  function dateLabel(key, options = { month: 'short', day: 'numeric' }) { return new Date(`${key}T12:00:00`).toLocaleDateString(undefined, options); }
  function timeLabel(time) { const [hour, minute] = time.split(':').map(Number); const date = new Date(); date.setHours(hour, minute, 0, 0); return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
  function medication(id) { return state.medications.find((item) => item.id === id); }
  function occurrenceFor(med, date, time) { return state.events.find((event) => event.medicationId === med.id && event.date === date && event.time === time); }
  function matchesDate(med, date) {
    if (!med.isActive || date < med.startDate || (med.endDate && date > med.endDate)) return false;
    const day = new Date(`${date}T12:00:00`).getDay();
    if (med.frequency === 'WEEKDAYS' && (day === 0 || day === 6)) return false;
    if ((med.frequency === 'WEEKLY' || med.frequency === 'CUSTOM') && !med.weekdays.includes(day)) return false;
    return true;
  }
  function ensureOccurrences(date) {
    let changed = false;
    state.medications.forEach((med) => {
      if (!matchesDate(med, date)) return;
      med.times.forEach((time) => {
        if (occurrenceFor(med, date, time)) return;
        let status = 'PENDING';
        if (date < isoDate || (date === isoDate && time < new Date().toTimeString().slice(0, 5))) status = 'MISSED';
        state.events.push({ id: `${med.id}-${date}-${time}`, medicationId: med.id, date, time, status, takenAt: null }); changed = true;
      });
    });
    if (changed) saveData();
  }
  function getTodayEvents() { ensureOccurrences(isoDate); return state.events.filter((item) => item.date === isoDate && medication(item.medicationId)).sort((a, b) => a.time.localeCompare(b.time)); }
  function weekEvents() { const from = dateOffset(-6); return state.events.filter((event) => event.date >= from && event.date <= isoDate && medication(event.medicationId)); }
  function percent(events) { const due = events.filter((event) => event.status !== 'PENDING'); return due.length ? Math.round(due.filter((event) => event.status === 'TAKEN').length / due.length * 100) : null; }
  function renderHeader() {
    const hour = new Date().getHours();
    $('#greeting').textContent = `${hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'}, ${state.user.name.split(' ')[0]}`;
    $('#today-label').textContent = today.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase();
    $('#avatar')?.setAttribute('aria-label', `Profile for ${state.user.name}`);
    $('#profile-shortcut').textContent = state.user.name.trim().charAt(0).toUpperCase() || 'A';
    $('#profile-name').value = state.user.name;
    $('#profile-email').value = state.user.email;
    $('#profile-role').value = state.user.role === 'PATIENT' ? 'Patient' : 'Caregiver';
    $('#timezone').value = state.user.timezone;
    const permission = 'Notification' in window ? Notification.permission : 'unavailable';
    $('#notification-status').textContent = `Permission status: ${permission === 'granted' ? 'enabled' : permission === 'denied' ? 'blocked in browser settings' : permission === 'default' ? 'not requested' : 'unavailable'}`;
    $('#mode-label').textContent = state.mode === 'demo' ? 'Demo mode' : 'Live account';
    $('#demo-banner').hidden = state.mode !== 'demo';
  }
  function statusMarkup(status) { const names = { TAKEN: 'Taken', SKIPPED: 'Skipped', MISSED: 'Missed', PENDING: 'Pending' }; return `<span class="status-badge status-${status.toLowerCase()}">${names[status] || status}</span>`; }
  function renderDashboard() {
    const events = getTodayEvents();
    $('#today-count').textContent = events.length;
    $('#taken-count').textContent = events.filter((event) => event.status === 'TAKEN').length;
    const score = percent(weekEvents()); $('#weekly-score').textContent = score === null ? '—' : `${score}%`;
    const container = $('#today-list');
    if (!events.length) { container.innerHTML = `<div class="empty-note">No medicines scheduled today. Add your first medicine when you're ready.</div>`; }
    else container.innerHTML = events.map((event) => {
      const med = medication(event.medicationId); const actionable = event.status === 'PENDING';
      return `<article class="dose-item"><time class="dose-time">${timeLabel(event.time)}</time><div class="dose-details"><strong>${escapeHTML(med.name)}</strong><span>${escapeHTML(med.dosage)}${med.instructions ? ` · ${escapeHTML(med.instructions)}` : ''}</span></div>${actionable ? `<div class="dose-actions"><button class="button primary" data-dose="${escapeHTML(event.id)}" data-status="TAKEN">Taken</button><button class="button secondary" data-dose="${escapeHTML(event.id)}" data-status="SKIPPED">Skip</button></div>` : statusMarkup(event.status)}</article>`;
    }).join('');
    const next = events.find((event) => event.status === 'PENDING');
    $('#next-dose').innerHTML = next ? `<div class="reminder-card"><strong>${escapeHTML(medication(next.medicationId).name)}</strong><span>${timeLabel(next.time)} · ${escapeHTML(medication(next.medicationId).dosage)}</span></div><p class="small muted">${next.time <= new Date().toTimeString().slice(0, 5) ? 'This dose is due now.' : `Scheduled for ${timeLabel(next.time)}.`}</p>` : '<p class="muted">You’re all caught up.</p>';
    const permission = 'Notification' in window ? Notification.permission : 'unavailable';
    $('#notification-btn').textContent = permission === 'granted' ? 'Browser notifications enabled' : permission === 'denied' ? 'Notifications blocked in browser settings' : 'Enable browser notifications';
    $('#notification-btn').disabled = permission === 'granted' || permission === 'denied' || permission === 'unavailable';
  }
  function renderMedicines() {
    const list = $('#medicine-list'); const meds = state.medications;
    if (!meds.length) { list.innerHTML = '<div class="empty-note">No medicines added yet. Add your first medicine to build your schedule.</div>'; return; }
    list.innerHTML = meds.map((med) => {
      const days = med.frequency === 'DAILY' ? 'Every day' : med.frequency === 'WEEKDAYS' ? 'Weekdays' : med.weekdays.map((day) => DAY_NAMES[day]).join(', ');
      return `<article class="medicine-item"><div class="dose-details"><strong>${escapeHTML(med.name)} ${!med.isActive ? '<span class="status-badge status-pending">Inactive</span>' : ''}</strong><span class="subline">${escapeHTML(med.dosage)} · ${escapeHTML(days)} · ${med.times.map(timeLabel).join(', ')}</span>${med.instructions ? `<span class="subline">${escapeHTML(med.instructions)}</span>` : ''}<span class="subline">Starts ${dateLabel(med.startDate)}${med.endDate ? ` · Ends ${dateLabel(med.endDate)}` : ''}</span></div><div class="dose-actions"><button class="button secondary" data-edit="${escapeHTML(med.id)}">Edit</button><button class="button secondary" data-toggle="${escapeHTML(med.id)}">${med.isActive ? 'Pause' : 'Resume'}</button><button class="button secondary" data-delete="${escapeHTML(med.id)}" aria-label="Delete ${escapeHTML(med.name)}">Delete</button></div></article>`;
    }).join('');
  }
  function renderHistory() {
    const status = $('#status-filter').value; const date = $('#date-filter').value;
    const events = [...state.events].filter((event) => medication(event.medicationId) && (!date || event.date === date) && (status === 'ALL' || event.status === status)).sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`));
    $('#history-rows').innerHTML = events.length ? events.map((event) => `<tr><td>${dateLabel(event.date, { month: 'short', day: 'numeric', year: 'numeric' })}</td><td>${escapeHTML(medication(event.medicationId).name)}</td><td>${timeLabel(event.time)}</td><td>${statusMarkup(event.status)}</td></tr>`).join('') : '<tr><td class="empty-row" colspan="4">No activity for this date.</td></tr>';
  }
  function renderAnalytics() {
    const events = weekEvents(); const score = percent(events); const taken = events.filter((event) => event.status === 'TAKEN').length;
    $('#analytics-score').textContent = score === null ? '—' : `${score}%`; $('#analytics-taken').textContent = taken;
    $('#analytics-other').textContent = events.filter((event) => ['MISSED', 'SKIPPED'].includes(event.status)).length;
    const labels = []; const values = [];
    for (let offset = -6; offset <= 0; offset += 1) { const key = dateOffset(offset); const daily = events.filter((event) => event.date === key); labels.push(new Date(`${key}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' })); values.push(percent(daily)); }
    $('#chart-empty').hidden = events.length > 0;
    if (!window.Chart) return;
    const context = $('#adherence-chart').getContext('2d');
    if (chart) chart.destroy();
    chart = new Chart(context, { type: 'bar', data: { labels, datasets: [{ label: 'Adherence', data: values, backgroundColor: '#176b5b', borderRadius: 5, maxBarThickness: 34 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (context) => context.raw === null ? 'No completed doses' : `${context.raw}%` } } }, scales: { y: { beginAtZero: true, max: 100, ticks: { stepSize: 25, callback: (value) => `${value}%` }, grid: { color: '#edf0ed' }, border: { display: false } }, x: { grid: { display: false }, border: { display: false } } } } });
  }
  function renderCaregiver() {
    const rows = [...state.connections.map((item) => ({ ...item, state: 'Connected' })), ...state.invited.map((item) => ({ ...item, state: 'Invitation created' }))];
    $('#connection-list').innerHTML = rows.length ? rows.map((item) => `<div class="connection-card"><div class="connection-main"><strong>${escapeHTML(item.email)}</strong><span class="subline">${item.state}</span></div><button class="text-button danger-text" data-revoke="${escapeHTML(item.id)}" data-kind="${item.state === 'Connected' ? 'connection' : 'invitation'}">${item.state === 'Connected' ? 'Revoke' : 'Cancel'}</button></div>`).join('') : '<p class="muted">No caregiver connected yet.</p>';
  }
  function render() { renderHeader(); renderDashboard(); renderMedicines(); renderHistory(); renderAnalytics(); renderCaregiver(); }
  function showView(name) {
    const target = $(`#view-${name}`); if (!target) return;
    $$('.view').forEach((view) => view.classList.toggle('active', view === target));
    $$('[data-view]').forEach((link) => link.classList.toggle('active', link.dataset.view === name));
    const titles = { home: 'Overview', medicines: 'Medicines', history: 'History', analytics: 'Analytics', caregiver: 'Caregiver', profile: 'Profile & settings' };
    $('#page-title').textContent = titles[name] || 'Overview'; $('#more-menu').hidden = true; $('#more-btn').setAttribute('aria-expanded', 'false');
    if (name === 'analytics') renderAnalytics();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function routeFromHash() { const view = location.hash.slice(1); showView(['home', 'medicines', 'history', 'analytics', 'caregiver', 'profile'].includes(view) ? view : 'home'); }
  function initWeekdays(selected = []) { $('#weekday-picker').innerHTML = DAYS.map((day, index) => `<label class="day-chip"><input type="checkbox" value="${index}" ${selected.includes(index) ? 'checked' : ''} aria-label="${DAY_NAMES[index]}"><span>${day[0]}</span></label>`).join(''); }
  const dialog = $('#medicine-dialog');
  function openMedicineForm(med = null) {
    $('#medicine-form').reset(); $('#form-error').textContent = ''; $('#dialog-title').textContent = med ? 'Edit medicine' : 'Add medicine'; $('#medicine-id').value = med?.id || '';
    $('#med-name').value = med?.name || ''; $('#med-dose').value = med?.dosage || ''; $('#med-frequency').value = med?.frequency || 'DAILY'; $('#med-times').value = med?.times?.join(', ') || '';
    $('#med-start').value = med?.startDate || isoDate; $('#med-end').value = med?.endDate || ''; $('#med-instructions').value = med?.instructions || ''; initWeekdays(med?.weekdays || []);
    dialog.showModal(); $('#med-name').focus();
  }
  function saveMedication(event) {
    event.preventDefault(); const form = event.currentTarget; if (!form.reportValidity()) return;
    const frequency = $('#med-frequency').value; const times = $('#med-times').value.split(',').map((time) => time.trim()); const days = $$('#weekday-picker input:checked').map((input) => Number(input.value));
    if (['WEEKLY', 'CUSTOM'].includes(frequency) && !days.length) { $('#form-error').textContent = 'Choose at least one day for this schedule.'; return; }
    if ($('#med-end').value && $('#med-end').value < $('#med-start').value) { $('#form-error').textContent = 'End date must be on or after the start date.'; return; }
    if (times.some((time) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) || new Set(times).size !== times.length) { $('#form-error').textContent = 'Enter unique times in 24-hour format, such as 08:00, 20:00.'; return; }
    const id = $('#medicine-id').value; const existing = id ? medication(id) : null;
    const next = { id: id || makeId(), name: $('#med-name').value.trim(), dosage: $('#med-dose').value.trim(), frequency, times, weekdays: frequency === 'WEEKLY' || frequency === 'CUSTOM' ? days : [], startDate: $('#med-start').value, endDate: $('#med-end').value, instructions: $('#med-instructions').value.trim(), isActive: existing?.isActive ?? true };
    if (existing) state.medications = state.medications.map((item) => item.id === id ? next : item); else state.medications.push(next);
    saveData(); dialog.close(); render(); toast(existing ? 'Your changes have been saved.' : 'Medicine added to your schedule.');
  }
  async function changeDose(id, status) {
    const event = state.events.find((item) => item.id === id); if (!event || event.status !== 'PENDING') return;
    event.status = status; event.takenAt = status === 'TAKEN' ? new Date().toISOString() : null; saveData(); render(); toast(status === 'TAKEN' ? 'Dose marked as taken.' : 'Dose marked as skipped.');
  }
  async function enableNotifications() {
    if (!('Notification' in window)) { toast('Browser notifications are not available here.', true); return; }
    const permission = await Notification.requestPermission(); state.notificationPermission = permission; saveData(); render();
    if (permission === 'granted') toast('Browser notifications enabled. Keep MediTrack open for reminders.');
    else if (permission === 'denied') toast('Notifications are blocked. You can change this in browser settings.', true);
  }
  function checkReminders() {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const now = new Date(); const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    getTodayEvents().filter((event) => event.status === 'PENDING' && event.time === time).forEach((event) => {
      const sentKey = `meditrack_notice_${event.id}`; if (sessionStorage.getItem(sentKey)) return;
      const med = medication(event.medicationId); new Notification('Time for your scheduled medicine', { body: `${med.name} · ${med.dosage}`, tag: event.id }); sessionStorage.setItem(sentKey, '1');
      toast(`Time for your scheduled medicine: ${med.name}.`);
    });
  }
  function resetDemo() { const fresh = seed(); saveData(fresh); render(); toast('Demo data has been reset.'); }
  function bindEvents() {
    document.addEventListener('click', (event) => {
      const nav = event.target.closest('[data-view]'); if (nav) { event.preventDefault(); const name = nav.dataset.view; if (location.hash !== `#${name}`) location.hash = name; else showView(name); }
      if (event.target.closest('[data-open-med-form]')) openMedicineForm();
      const closer = event.target.closest('[data-close-dialog]'); if (closer) dialog.close();
      const dose = event.target.closest('[data-dose]'); if (dose) changeDose(dose.dataset.dose, dose.dataset.status);
      const edit = event.target.closest('[data-edit]'); if (edit) openMedicineForm(medication(edit.dataset.edit));
      const toggle = event.target.closest('[data-toggle]'); if (toggle) { const med = medication(toggle.dataset.toggle); med.isActive = !med.isActive; saveData(); render(); toast(med.isActive ? 'Medicine schedule resumed.' : 'Medicine schedule paused.'); }
      const remove = event.target.closest('[data-delete]'); if (remove) { const med = medication(remove.dataset.delete); $('#confirm-dialog').showModal(); $('#confirm-dialog').returnValue = ''; $('#confirm-dialog').dataset.deleteId = med.id; }
      const revoke = event.target.closest('[data-revoke]'); if (revoke) { const kind = revoke.dataset.kind; state[kind === 'connection' ? 'connections' : 'invited'] = state[kind === 'connection' ? 'connections' : 'invited'].filter((item) => item.id !== revoke.dataset.revoke); saveData(); renderCaregiver(); toast(kind === 'connection' ? 'Caregiver access revoked.' : 'Invitation cancelled.'); }
    });
    $('#medicine-form').addEventListener('submit', saveMedication);
    $('#confirm-dialog').addEventListener('close', (event) => { const confirm = event.currentTarget.returnValue === 'confirm'; const id = event.currentTarget.dataset.deleteId; if (confirm && id) { const med = medication(id); if (med) med.isActive = false; saveData(); render(); toast('Medicine deleted from your active schedule. Previous history is retained.'); } });
    $('#status-filter').addEventListener('change', renderHistory); $('#date-filter').addEventListener('change', renderHistory);
    $('#notification-btn').addEventListener('click', enableNotifications); $('#notification-settings').addEventListener('click', enableNotifications);
    $('#profile-form').addEventListener('submit', (event) => { event.preventDefault(); state.user.name = $('#profile-name').value.trim(); state.user.timezone = $('#timezone').value; saveData(); render(); toast('Your changes have been saved.'); });
    $('#invite-form').addEventListener('submit', (event) => { event.preventDefault(); const email = $('#invite-email').value.trim().toLowerCase(); if (email === state.user.email.toLowerCase()) { toast('Use a different email address for your caregiver.', true); return; } if (state.invited.some((item) => item.email === email) || state.connections.some((item) => item.email === email)) { toast('An invitation or connection already exists for this email.', true); return; } state.invited.push({ id: makeId(), email, createdAt: new Date().toISOString() }); saveData(); renderCaregiver(); $('#invite-result').textContent = state.mode === 'demo' ? 'Demo invitation created locally. No email was sent.' : 'Invitation created.'; $('#invite-form').reset(); });
    $('#reset-demo').addEventListener('click', resetDemo); $('#reset-demo-profile').addEventListener('click', resetDemo);
    $('#profile-shortcut').addEventListener('click', () => { location.hash = 'profile'; });
    $('#logout-btn').addEventListener('click', () => toast('This educational demo has no sign-in session to end.'));
    $('#mobile-signout').addEventListener('click', () => { $('#more-menu').hidden = true; toast('This educational demo has no sign-in session to end.'); });
    $('#menu-btn').addEventListener('click', () => { const open = $('#more-menu').hidden; $('#more-menu').hidden = !open; $('#menu-btn').setAttribute('aria-expanded', String(open)); });
    $('#more-btn').addEventListener('click', () => { const open = $('#more-menu').hidden; $('#more-menu').hidden = !open; $('#more-btn').setAttribute('aria-expanded', String(open)); });
    window.addEventListener('hashchange', routeFromHash);
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') { $('#more-menu').hidden = true; $('#menu-btn').setAttribute('aria-expanded', 'false'); $('#more-btn').setAttribute('aria-expanded', 'false'); } });
  }
  render(); bindEvents(); initWeekdays(); routeFromHash(); window.setInterval(checkReminders, 15000); checkReminders();
})();
