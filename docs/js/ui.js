/**
 * ui.js — toast, loading, nav, modal, วันที่/กะ, helper ทั่วไป
 */
const UI = (() => {
  const C = window.APP_CONFIG;
  const DESKTOP_MIN = 768;
  const LINE_CFG_KEY = C.STORAGE_PREFIX + 'line_config_v1';

  function isDesktop() { return window.innerWidth >= DESKTOP_MIN; }

  function applyDeviceClass() {
    document.body.classList.toggle('is-desktop', isDesktop());
    document.body.classList.toggle('is-mobile', !isDesktop());
  }

  // เปลี่ยนข้าม 768px → reload เพื่อสลับ layout
  let lastDesktop = null;
  window.addEventListener('resize', () => {
    const d = isDesktop();
    if (lastDesktop !== null && d !== lastDesktop && document.body.dataset.page) location.reload();
    lastDesktop = d;
  });

  function esc(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ---------- toast / loading ----------
  function showToast(msg, type = 'info') {
    let wrap = document.getElementById('toastWrap');
    if (!wrap) { wrap = document.createElement('div'); wrap.id = 'toastWrap'; wrap.className = 'toast-wrap'; document.body.appendChild(wrap); }
    const icons = { success: 'bi-check-circle-fill', error: 'bi-x-circle-fill', warning: 'bi-exclamation-triangle-fill', info: 'bi-info-circle-fill' };
    const el = document.createElement('div');
    el.className = 'toast toast-' + type;
    el.innerHTML = `<i class="bi ${icons[type] || icons.info}"></i><span>${esc(msg)}</span>`;
    wrap.appendChild(el);
    setTimeout(() => { el.classList.add('hide'); setTimeout(() => el.remove(), 300); }, 4000);
  }

  function showLoading(text) {
    let el = document.getElementById('loadingOverlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'loadingOverlay';
      el.className = 'loading-overlay';
      el.innerHTML = '<div class="spinner"></div><div class="loading-text"></div>';
      document.body.appendChild(el);
    }
    el.querySelector('.loading-text').textContent = text || 'กำลังโหลด...';
    el.classList.add('show');
  }

  function hideLoading() {
    const el = document.getElementById('loadingOverlay');
    if (el) el.classList.remove('show');
  }

  // ---------- nav ----------
  function visiblePages() {
    return C.PAGES.filter((p) => Auth.hasPermission(p.key));
  }

  // หมวดเมนูใน sidebar
  const NAV_SECTIONS = [
    { label: 'งานประจำวัน', keys: ['production', 'dailycheck', 'maintenance', 'sorting', 'rawmaterial', 'waste', 'alarm', 'inbox'] },
    { label: 'วางแผน & วิเคราะห์', keys: ['joborders', 'machines', 'dashboard', 'cost', 'labor'] },
    { label: 'ระบบ', keys: ['admin'] }
  ];

  function initials(name) {
    const parts = String(name || '?').trim().split(/\s+/);
    return (parts[0].charAt(0) + (parts[1] ? parts[1].charAt(0) : '')).toUpperCase();
  }

  // ไอคอน Arc chute (แผ่น splitter เหล็กระหว่างผนังฉนวนสีแดง)
  const BRAND_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#fff"/><rect x="9" y="11" width="7" height="42" rx="2" fill="#C8102E"/><rect x="48" y="11" width="7" height="42" rx="2" fill="#C8102E"/><rect x="17.5" y="15" width="3.2" height="35" rx="1" fill="#7C818B"/><rect x="22" y="15" width="3.2" height="35" rx="1" fill="#7C818B"/><rect x="26.5" y="15" width="3.2" height="35" rx="1" fill="#7C818B"/><rect x="31" y="15" width="3.2" height="35" rx="1" fill="#7C818B"/><rect x="35.5" y="15" width="3.2" height="35" rx="1" fill="#7C818B"/><rect x="40" y="15" width="3.2" height="35" rx="1" fill="#7C818B"/><rect x="44.5" y="15" width="3.2" height="35" rx="1" fill="#7C818B"/><rect x="18.4" y="15" width="1" height="35" fill="#C9CDD4"/><rect x="22.9" y="15" width="1" height="35" fill="#C9CDD4"/><rect x="27.4" y="15" width="1" height="35" fill="#C9CDD4"/><rect x="31.9" y="15" width="1" height="35" fill="#C9CDD4"/><rect x="36.4" y="15" width="1" height="35" fill="#C9CDD4"/><rect x="40.9" y="15" width="1" height="35" fill="#C9CDD4"/><rect x="45.4" y="15" width="1" height="35" fill="#C9CDD4"/><rect x="15" y="21.5" width="34" height="4" rx="1" fill="#C8102E"/><circle cx="19.1" cy="23.5" r="1.1" fill="#7A0A1C"/><circle cx="23.6" cy="23.5" r="1.1" fill="#7A0A1C"/><circle cx="28.1" cy="23.5" r="1.1" fill="#7A0A1C"/><circle cx="32.6" cy="23.5" r="1.1" fill="#7A0A1C"/><circle cx="37.1" cy="23.5" r="1.1" fill="#7A0A1C"/><circle cx="41.6" cy="23.5" r="1.1" fill="#7A0A1C"/><circle cx="46.1" cy="23.5" r="1.1" fill="#7A0A1C"/><path d="M21 51 L32 31 L43 51 Z" fill="#fff"/></svg>';

  function renderTopNav(title, icon) {
    const u = Auth.getUser() || {};
    const header = document.createElement('header');
    header.className = 'top-nav';
    header.innerHTML = `
      <div class="top-nav-title">
        <div class="top-nav-icon"><i class="bi ${esc(icon)}"></i></div>
        <div class="top-nav-text"><div class="top-nav-crumb">${esc(C.LINE_NAME)}</div><div class="top-nav-name-page">${esc(title)}</div></div>
      </div>
      <div class="top-nav-user">
        <div class="top-clock" id="topClock"></div>
        <span class="avatar mobile-only" title="${esc(u.name || '')}">${esc(initials(u.name))}</span>
        <button class="btn-icon mobile-only" id="topLogout" title="ออกจากระบบ"><i class="bi bi-box-arrow-right"></i></button>
      </div>`;
    const main = document.querySelector('.main') || document.body;
    main.prepend(header);
    const b = header.querySelector('#topLogout');
    if (b) b.onclick = confirmLogout;
    const tick = () => {
      const s = getShiftInfo();
      const d = bkkNow();
      const hhmm = pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes());
      const el = document.getElementById('topClock');
      if (el) el.innerHTML = `<span class="shift-dot ${s.shiftDN === 'Night' ? 'night' : ''}"></span>${s.shiftDN}${s.shiftAB ? ' · กะ ' + esc(s.shiftAB) : ''}<span class="mono">${hhmm}</span>`;
    };
    tick();
    setInterval(tick, 30000);
    document.title = title + ' · ' + C.LINE_NAME;
  }

  function confirmLogout() { if (confirm('ออกจากระบบ?')) Auth.logout(); }

  function renderNav(activeKey) {
    const pages = visiblePages();
    if (isDesktop()) {
      const u = Auth.getUser() || {};
      const byKey = {};
      pages.forEach((p) => { byKey[p.key] = p; });
      const used = {};
      const groups = NAV_SECTIONS.map((sec) => ({ label: sec.label, items: sec.keys.filter((k) => byKey[k]).map((k) => { used[k] = 1; return byKey[k]; }) }))
        .filter((g) => g.items.length);
      const rest = pages.filter((p) => !used[p.key]);
      if (rest.length) groups.push({ label: 'อื่นๆ', items: rest });
      const link = (p) => `<a href="${p.file}" class="tm-item ${p.key === activeKey ? 'active' : ''}"><i class="bi ${p.icon}"></i><span>${esc(p.label)}</span></a>`;
      const groupHtml = (g) => {
        const isActive = g.items.some((p) => p.key === activeKey);
        if (g.items.length === 1) {
          const p = g.items[0];
          return `<a href="${p.file}" class="tm-btn ${isActive ? 'active' : ''}"><i class="bi ${p.icon}"></i>${esc(p.label)}</a>`;
        }
        return `<div class="tm-group">
          <button class="tm-btn ${isActive ? 'active' : ''}" type="button">${esc(g.label)}<i class="bi bi-chevron-down tm-caret"></i></button>
          <div class="tm-panel">${g.items.map(link).join('')}</div></div>`;
      };
      const bar = document.createElement('nav');
      bar.className = 'topmenu';
      bar.innerHTML = `
        <a class="tm-brand" href="${(byKey.dashboard || byKey.production || pages[0] || { file: '#' }).file}">
          <span class="brand-mark">${BRAND_SVG}</span>
          <span><span class="tm-brand-title">${esc(C.LINE_NAME)}</span><span class="tm-brand-sub">Production System</span></span>
        </a>
        <div class="tm-groups">${groups.map(groupHtml).join('')}</div>
        <div class="tm-group tm-user">
          <button class="tm-btn" type="button"><span class="avatar">${esc(initials(u.name))}</span><span class="tm-user-name">${esc(u.name || '')}</span><i class="bi bi-chevron-down tm-caret"></i></button>
          <div class="tm-panel tm-panel-right">
            <div class="tm-user-info"><div class="fw-bold">${esc(u.name || '')}</div><div class="small text-gray">${esc(u.employeeId || '')} · ${esc(Auth.ROLE_LABELS[u.role] || u.role || '')}${u.shift ? ' · กะ ' + esc(u.shift) : ''}</div></div>
            <button class="tm-item tm-logout" id="sideLogout" type="button"><i class="bi bi-box-arrow-right"></i><span>ออกจากระบบ</span></button>
          </div>
        </div>`;
      document.body.prepend(bar);
      bar.querySelector('#sideLogout').onclick = confirmLogout;
      // คลิกเปิด/ปิด dropdown (รองรับจอสัมผัส) — hover ก็เปิดได้
      bar.querySelectorAll('.tm-group > .tm-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const g = btn.parentElement;
          const open = g.classList.contains('open');
          bar.querySelectorAll('.tm-group.open').forEach((x) => x.classList.remove('open'));
          if (!open) g.classList.add('open');
        });
      });
      document.addEventListener('click', () => bar.querySelectorAll('.tm-group.open').forEach((x) => x.classList.remove('open')));
      return;
    }
    const first = pages.slice(0, 4);
    const rest = pages.slice(4);
    const nav = document.createElement('nav');
    nav.className = 'bottom-nav';
    nav.innerHTML = first.map((p) => `
      <a href="${p.file}" class="bottom-nav-item ${p.key === activeKey ? 'active' : ''}"><i class="bi ${p.icon}"></i><span>${esc(p.label)}</span></a>`).join('') +
      (rest.length ? `<button class="bottom-nav-item ${rest.some((p) => p.key === activeKey) ? 'active' : ''}" id="moreBtn"><i class="bi bi-grid-3x3-gap"></i><span>เพิ่มเติม</span></button>` : '');
    document.body.appendChild(nav);
    if (!rest.length) return;
    const drawer = document.createElement('div');
    drawer.className = 'more-menu-overlay';
    drawer.innerHTML = `<div class="more-menu">
      <div class="more-menu-grid">${rest.map((p) => `
        <a href="${p.file}" class="more-menu-item ${p.key === activeKey ? 'active' : ''}"><i class="bi ${p.icon}"></i><span>${esc(p.label)}</span></a>`).join('')}
        <button class="more-menu-item" id="moreLogout"><i class="bi bi-box-arrow-right"></i><span>ออกจากระบบ</span></button>
      </div></div>`;
    document.body.appendChild(drawer);
    nav.querySelector('#moreBtn').onclick = () => drawer.classList.add('show');
    drawer.onclick = (e) => { if (e.target === drawer) drawer.classList.remove('show'); };
    drawer.querySelector('#moreLogout').onclick = confirmLogout;
  }

  /** เรียกต้นทุกหน้า: ตรวจสิทธิ์ + วาด nav  → คืน false ถ้าไม่มีสิทธิ์ */
  function initPage(key, title, icon) {
    applyDeviceClass();
    lastDesktop = isDesktop();
    document.body.dataset.page = key;
    if (!Auth.requirePermission(key)) return false;
    renderTopNav(title, icon);
    renderNav(key);
    return true;
  }

  // ---------- modal ----------
  function openModal(id) { const m = document.getElementById(id); if (m) m.classList.add('show'); }
  function closeModal(id) { const m = document.getElementById(id); if (m) m.classList.remove('show'); }
  document.addEventListener('click', (e) => {
    const close = e.target.closest('[data-close-modal]');
    if (close) close.closest('.modal-overlay').classList.remove('show');
    else if (e.target.classList && e.target.classList.contains('modal-overlay')) e.target.classList.remove('show');
  });

  // ---------- เวลา / วันที่ (Asia/Bangkok, คำนวณ UTC+7 เอง) ----------
  function bkkNow() { return new Date(Date.now() + 7 * 3600000); } // อ่านด้วย getUTC*
  function getBkkHour() { return bkkNow().getUTCHours(); }
  function pad(n) { return String(n).padStart(2, '0'); }
  function ymd(d) { return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }

  /** วันทำงาน (ตัดรอบ 08:00) */
  function getToday() {
    const d = bkkNow();
    if (d.getUTCHours() < 8) d.setUTCDate(d.getUTCDate() - 1);
    return ymd(d);
  }

  function addDays(dateStr, n) {
    const d = new Date(dateStr + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return ymd(d);
  }

  function nowLocalInput() { const d = bkkNow(); return ymd(d) + 'T' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()); }

  function hourToPeriod(h) { return pad(h) + ':00-' + pad(h) + ':59'; }
  function getTimePeriods() { const out = []; for (let i = 0; i < 24; i++) out.push(hourToPeriod((8 + i) % 24)); return out; }
  function currentPeriod() { return hourToPeriod(getBkkHour()); }
  function isDayHour(h) { return h >= 8 && h < 20; }

  function getShiftInfo() {
    const h = getBkkHour();
    const u = (typeof Auth !== 'undefined' && Auth.getUser()) || {};
    return { shiftDN: isDayHour(h) ? 'Day' : 'Night', shiftAB: u.shift || '', timePeriod: hourToPeriod(h) };
  }

  function formatNumber(n, digits = 0) {
    const v = Number(n);
    if (!isFinite(v)) return '-';
    return v.toLocaleString('th-TH', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }

  function formatDate(s, withTime) {
    if (!s) return '-';
    const str = String(s);
    const d = new Date(str.replace(' ', 'T') + (str.length <= 10 ? 'T00:00:00' : '') + '+07:00');
    if (isNaN(d)) return str;
    const opt = { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: '2-digit' };
    if (withTime) { opt.hour = '2-digit'; opt.minute = '2-digit'; }
    return d.toLocaleString('th-TH', opt);
  }

  function timeAgo(ts) {
    const d = new Date(String(ts).replace(' ', 'T') + '+07:00');
    const mins = Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
    if (mins < 60) return mins + ' นาที';
    if (mins < 1440) return Math.floor(mins / 60) + ' ชม. ' + (mins % 60) + ' นาที';
    return Math.floor(mins / 1440) + ' วัน';
  }

  // ---------- Line config (จาก backend, cache 1 ชม.) ----------
  async function getLineConfig(force) {
    if (!force) {
      try {
        const c = JSON.parse(localStorage.getItem(LINE_CFG_KEY) || 'null');
        if (c && Date.now() - c.at < 3600000) return c.data;
      } catch (e) {}
    }
    const res = await API.get('getLineConfig');
    if (res.success) {
      try { localStorage.setItem(LINE_CFG_KEY, JSON.stringify({ at: Date.now(), data: res.data })); } catch (e) {}
      return res.data;
    }
    throw new Error(res.message || 'โหลดค่าตั้งต้นไม่ได้');
  }

  // ---------- กลุ่มเครื่องจักร (ไลน์ย่อย) — server เรียงตามกลุ่มให้แล้ว ----------
  function groupMachines(list) {
    const out = [];
    (list || []).forEach((m) => {
      const g = m.group || 'อื่นๆ';
      let e = out.find((x) => x.group === g);
      if (!e) { e = { group: g, machines: [] }; out.push(e); }
      e.machines.push(m);
    });
    return out;
  }

  /** ปุ่มเครื่องแยกตามกลุ่ม: btnFn(machine) → html ของปุ่ม */
  function machineGridHtml(list, btnFn) {
    return groupMachines(list).map((g) => `<div class="machine-group"><div class="machine-group-title">${esc(g.group)}</div>
      <div class="machine-grid">${g.machines.map(btnFn).join('')}</div></div>`).join('');
  }

  /** <option> แยกตามกลุ่ม (optgroup) */
  function machineOptions(list) {
    return groupMachines(list).map((g) => `<optgroup label="${esc(g.group)}">${g.machines.map((m) =>
      `<option value="${esc(m.machineId)}">${esc(m.machineName)}</option>`).join('')}</optgroup>`).join('');
  }

  /** placeholder ตอนยังไม่มีข้อมูล master */
  function emptyState(icon, text) {
    return `<div class="empty-state"><i class="bi ${icon}"></i><div>${text}</div></div>`;
  }

  function statusLabel(s) {
    return ({
      running: 'ทำงาน', maintenance: 'ซ่อมบำรุง', down: 'หยุดทำงาน', open: 'รอรับงาน', 'in-progress': 'กำลังดำเนินการ',
      resolved: 'ซ่อมเสร็จ', closed: 'ปิดงาน', completed: 'เสร็จ', cancelled: 'ยกเลิก', pending: 'รอ Sort'
    })[s] || s;
  }

  function downloadText(filename, text, mime = 'text/csv;charset=utf-8') {
    const blob = new Blob([text], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  // ---------- อาการ NG: ค่าตั้งต้น (config) + ที่ผู้ใช้เพิ่มเอง (ชีต NgReasons, แยกตามกลุ่มเครื่อง) ----------
  const NG_OTHER = 'อื่นๆ';
  let ngCache = null;
  async function loadNgReasons(force) {
    if (!ngCache || force) {
      const r = await API.get('getNgReasons');
      ngCache = r.success ? r.data : (ngCache || []);
    }
    return ngCache;
  }
  /** รายชื่ออาการของกลุ่มเครื่อง (group ว่าง = ทุกกลุ่ม) — "อื่นๆ" อยู่ท้ายเสมอ */
  function ngReasonList(cfg, group) {
    const names = [];
    const push = (n) => { if (n && n !== NG_OTHER && !names.includes(n)) names.push(n); };
    ((cfg && cfg.ngReasons) || []).forEach(push);
    (ngCache || []).filter((r) => !group || !r.machineGroup || r.machineGroup === group).forEach((r) => push(r.reasonName));
    return names.concat([NG_OTHER]);
  }
  /** เติม <select> อาการ NG — คงค่าเดิมไว้ถ้ายังอยู่ในรายการ */
  function fillNgSelect(sel, cfg, group, placeholder = '— เลือกอาการ —') {
    const cur = sel.value;
    const list = ngReasonList(cfg, group);
    sel.innerHTML = `<option value="">${esc(placeholder)}</option>` + list.map((r) => `<option>${esc(r)}</option>`).join('');
    if (list.includes(cur)) sel.value = cur;
  }
  /** ปุ่ม "+ เพิ่มอาการ": ถามชื่อ → บันทึกลงชีต → คืนชื่อที่เพิ่ม (null = ยกเลิก/ผิดพลาด) */
  async function addNgReasonPrompt(group) {
    const name = (prompt('เพิ่มอาการ NG ใหม่' + (group ? ' (เครื่องกลุ่ม ' + group + ')' : '')) || '').trim();
    if (!name) return null;
    if (name === NG_OTHER) { showToast('มี "' + NG_OTHER + '" อยู่แล้ว', 'warning'); return null; }
    const r = await API.post('addNgReason', { reasonName: name, machineGroup: group || '' });
    if (!r.success) { showToast(r.message, 'error'); return null; }
    await loadNgReasons(true);
    showToast(r.duplicate ? 'มีอาการนี้อยู่แล้ว — เลือกให้แล้ว' : 'เพิ่มอาการ NG แล้ว', 'success');
    return name;
  }
  /** ลบอาการที่ผู้ใช้เพิ่ม (หัวหน้าขึ้นไป) — ค่าตั้งต้นใน config ลบจากหน้าเว็บไม่ได้ */
  async function deleteNgReasonByName(name, group) {
    const hit = (ngCache || []).find((r) => r.reasonName === name && (!group || !r.machineGroup || r.machineGroup === group));
    if (!hit) { showToast('อาการนี้เป็นค่าตั้งต้นของระบบ ลบจากหน้าเว็บไม่ได้', 'warning'); return false; }
    if (!confirm('ลบอาการ NG "' + name + '" ออกจากรายการ?\n(รายการที่บันทึกไปแล้วไม่เปลี่ยน)')) return false;
    const r = await API.post('deleteNgReason', { reasonId: hit.reasonId });
    if (!r.success) { showToast(r.message, 'error'); return false; }
    await loadNgReasons(true);
    showToast('ลบอาการ NG แล้ว', 'success');
    return true;
  }

  /** ผูกปุ่ม เพิ่ม/ลบ อาการ NG กับ select — getGroup() คืนกลุ่มเครื่องที่เลือกอยู่; ปุ่มลบแสดงเฉพาะหัวหน้าขึ้นไป */
  function bindNgControls({ sel, other, addBtn, delBtn, getCfg, getGroup }) {
    const sync = () => { if (other) other.classList.toggle('hidden', sel.value !== NG_OTHER); };
    if (delBtn && !(typeof Auth !== 'undefined' && Auth.hasRole('supervisor'))) delBtn.remove();
    addBtn.onclick = async () => {
      if (addBtn.disabled) return;
      const g = getGroup();
      addBtn.disabled = true;
      try {
        const name = await addNgReasonPrompt(g);
        if (!name) return;
        fillNgSelect(sel, getCfg(), g);
        sel.value = name; sync();
      } finally { addBtn.disabled = false; }
    };
    if (delBtn && delBtn.isConnected) delBtn.onclick = async () => {
      const v = sel.value;
      if (!v || v === NG_OTHER) return showToast('เลือกอาการที่จะลบก่อน', 'warning');
      if (await deleteNgReasonByName(v, getGroup())) { sel.value = ''; fillNgSelect(sel, getCfg(), getGroup()); sync(); }
    };
  }

  /** ป้องกันกดซ้ำ: ปุ่ม disabled + spinner ระหว่างรอ */
  async function withButton(btn, fn) {
    if (!btn || btn.dataset.busy === '1') return;
    btn.dataset.busy = '1';
    const html = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-sm"></span> กำลังบันทึก...';
    try { return await fn(); } finally { btn.dataset.busy = ''; btn.disabled = false; btn.innerHTML = html; }
  }

  return {
    isDesktop, applyDeviceClass, esc, showToast, showLoading, hideLoading, renderTopNav, renderNav, initPage,
    openModal, closeModal, getBkkHour, getToday, addDays, nowLocalInput, hourToPeriod, getTimePeriods, currentPeriod,
    isDayHour, getShiftInfo, formatNumber, formatDate, timeAgo, getLineConfig, groupMachines, machineGridHtml, machineOptions, emptyState, statusLabel, downloadText, withButton,
    NG_OTHER, loadNgReasons, ngReasonList, fillNgSelect, addNgReasonPrompt, deleteNgReasonByName, bindNgControls
  };
})();
