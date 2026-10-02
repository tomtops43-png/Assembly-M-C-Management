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

  function brandMark() {
    const words = String(C.LINE_NAME).replace(/[^A-Za-z0-9 ]/g, ' ').trim().split(/\s+/);
    return (words[0].charAt(0) + (words[1] ? words[1].charAt(0) : '')).toUpperCase();
  }

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
      const item = (p) => { used[p.key] = 1; return `
          <a href="${p.file}" class="sidebar-item ${p.key === activeKey ? 'active' : ''}"><i class="bi ${p.icon}"></i><span>${esc(p.label)}</span></a>`; };
      let menu = NAV_SECTIONS.map((sec) => {
        const items = sec.keys.filter((k) => byKey[k]).map((k) => item(byKey[k])).join('');
        return items ? `<div class="sidebar-section">${esc(sec.label)}</div>${items}` : '';
      }).join('');
      const rest = pages.filter((p) => !used[p.key]);
      if (rest.length) menu += `<div class="sidebar-section">อื่นๆ</div>` + rest.map(item).join('');
      const side = document.createElement('aside');
      side.className = 'sidebar';
      side.innerHTML = `
        <div class="sidebar-logo"><div class="brand-mark">${esc(brandMark())}</div><div><div class="sidebar-logo-title">${esc(C.LINE_NAME)}</div><div class="sidebar-logo-sub">Production System</div></div></div>
        <nav class="sidebar-menu">${menu}</nav>
        <div class="sidebar-user">
          <span class="avatar">${esc(initials(u.name))}</span>
          <div style="min-width:0"><div class="sidebar-user-name">${esc(u.name || '')}</div>
            <div class="sidebar-user-role">${esc(Auth.ROLE_LABELS[u.role] || u.role || '')}${u.shift ? ' · กะ ' + esc(u.shift) : ''}</div></div>
          <button class="sidebar-logout" id="sideLogout" title="ออกจากระบบ"><i class="bi bi-box-arrow-right"></i></button>
        </div>`;
      document.body.prepend(side);
      side.querySelector('#sideLogout').onclick = confirmLogout;
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
    isDayHour, getShiftInfo, formatNumber, formatDate, timeAgo, getLineConfig, groupMachines, machineGridHtml, machineOptions, emptyState, statusLabel, downloadText, withButton
  };
})();
