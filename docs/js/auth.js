/**
 * auth.js — session + สิทธิ์ (ค่า default ต้องตรงกับ src/Auth.gs)
 */
const Auth = (() => {
  const C = window.APP_CONFIG;
  const KEY_TOKEN = C.STORAGE_PREFIX + 'token';
  const KEY_USER = C.STORAGE_PREFIX + 'user';
  const ROLE_LEVELS = { viewer: 0, operator: 1, maintenance: 2, supervisor: 3, admin: 4 };
  const ROLE_LABELS = { viewer: 'ผู้ชม', operator: 'พนักงาน', maintenance: 'ช่างซ่อม', supervisor: 'หัวหน้า', admin: 'ผู้ดูแลระบบ' };

  const _roleDefaults = {
    viewer:      ['inbox', 'dashboard'],
    operator:    ['production', 'inbox', 'maintenance', 'machines', 'waste', 'sorting', 'alarm', 'ngissue', 'dailycheck'],
    maintenance: ['production', 'inbox', 'maintenance', 'rawmaterial', 'machines', 'waste', 'sorting', 'alarm', 'ngissue', 'dailycheck'],
    supervisor:  ['production', 'inbox', 'maintenance', 'rawmaterial', 'machines', 'dashboard', 'joborders', 'cost', 'waste', 'sorting', 'alarm', 'ngissue', 'dailycheck', 'ngExport'],
    admin:       ['production', 'inbox', 'maintenance', 'rawmaterial', 'machines', 'dashboard', 'admin', 'joborders', 'cost', 'waste', 'sorting', 'alarm', 'ngissue', 'dailycheck', 'ngExport']
  };
  const PERMISSION_KEYS = ['production', 'inbox', 'maintenance', 'rawmaterial', 'machines', 'dashboard', 'admin',
    'joborders', 'cost', 'labor', 'waste', 'sorting', 'alarm', 'ngissue', 'dailycheck', 'ngExport'];
  const PERMISSION_LABELS = {
    production: 'กรอกยอด', inbox: 'Inbox', maintenance: 'แจ้งซ่อม', rawmaterial: 'รับวัตถุดิบ', machines: 'เครื่องจักร',
    dashboard: 'Dashboard', admin: 'จัดการ', joborders: 'วางแผนการผลิต', cost: 'ต้นทุน', labor: 'ค่าแรง',
    waste: 'ทิ้งขยะ', sorting: 'คัดแยก', alarm: 'Alarm', ngissue: 'ปัญหา NG', dailycheck: 'Daily Check', ngExport: 'ส่งออก NG (QC)'
  };

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} }
  };

  function getToken() { return store.get(KEY_TOKEN) || ''; }
  function setToken(t) { store.set(KEY_TOKEN, t); }
  function getUser() { try { return JSON.parse(store.get(KEY_USER) || 'null'); } catch (e) { return null; } }
  function setUser(u) { store.set(KEY_USER, JSON.stringify(u)); }
  function isLoggedIn() { return !!getToken() && !!getUser(); }

  function hasRole(minRole) {
    const u = getUser();
    return !!u && (ROLE_LEVELS[u.role] || 0) >= ROLE_LEVELS[minRole];
  }

  function defaultPermissions(role) {
    const out = {};
    PERMISSION_KEYS.forEach((k) => { out[k] = (_roleDefaults[role] || []).includes(k); });
    out.inbox = true;
    return out;
  }

  function hasPermission(page) {
    const u = getUser();
    if (!u) return false;
    if (page === 'inbox') return true;
    if (C.DISABLED_MODULES.includes(page)) return false;
    const perms = u.permissions || defaultPermissions(u.role);
    // สิทธิ์ที่เพิ่มใหม่หลัง login (session เก่ายังไม่มี key นี้) → ใช้ค่า default ของ role — backend ตรวจซ้ำทุก request
    if (perms[page] === undefined) return !!defaultPermissions(u.role)[page];
    return !!perms[page];
  }

  function pageUrl(key) {
    const p = C.PAGES.find((x) => x.key === key);
    const inPages = location.pathname.includes('/pages/');
    return (inPages ? '' : 'pages/') + (p ? p.file : 'inbox.html');
  }

  function getHomePage() {
    const key = C.HOME_ORDER.find((k) => hasPermission(k)) || 'inbox';
    return pageUrl(key);
  }

  function loginUrl() { return location.pathname.includes('/pages/') ? '../index.html' : 'index.html'; }

  async function logout(expired) {
    const token = getToken();
    store.del(KEY_TOKEN);
    store.del(KEY_USER);
    if (token && !expired) { try { API.post('logout', { token }); } catch (e) {} }
    location.href = loginUrl() + (expired ? '?expired=1' : '');
  }

  function requireAuth() {
    if (!isLoggedIn()) { location.href = loginUrl(); return false; }
    return true;
  }

  function requirePermission(page) {
    if (!requireAuth()) return false;
    if (!hasPermission(page)) {
      if (typeof UI !== 'undefined') UI.showToast('คุณไม่มีสิทธิ์เข้าหน้านี้', 'error');
      setTimeout(() => { location.href = getHomePage(); }, 1500);
      return false;
    }
    return true;
  }

  return {
    getToken, setToken, getUser, setUser, isLoggedIn, hasRole, hasPermission, defaultPermissions, getHomePage,
    pageUrl, logout, requireAuth, requirePermission, ROLE_LEVELS, ROLE_LABELS, PERMISSION_KEYS, PERMISSION_LABELS
  };
})();
