/**
 * Auth.gs — Login, session, roles, permissions, users
 */
var ROLE_LEVELS = { viewer: 0, operator: 1, maintenance: 2, supervisor: 3, admin: 4 };
var SESSION_EXPIRED_MSG = 'กรุณาเข้าสู่ระบบใหม่';

// ต้องตรงกับ docs/js/auth.js (_roleDefaults)
var PERMISSION_KEYS = ['production', 'inbox', 'maintenance', 'rawmaterial', 'machines', 'dashboard', 'admin',
  'joborders', 'cost', 'labor', 'waste', 'sorting', 'alarm', 'ngissue', 'dailycheck', 'ngExport'];

var ROLE_DEFAULT_PERMISSIONS = {
  viewer:      ['inbox', 'dashboard'],
  operator:    ['production', 'inbox', 'maintenance', 'machines', 'waste', 'sorting', 'alarm', 'ngissue', 'dailycheck'],
  maintenance: ['production', 'inbox', 'maintenance', 'rawmaterial', 'machines', 'waste', 'sorting', 'alarm', 'ngissue', 'dailycheck'],
  supervisor:  ['production', 'inbox', 'maintenance', 'rawmaterial', 'machines', 'dashboard', 'joborders', 'cost', 'waste', 'sorting', 'alarm', 'ngissue', 'dailycheck', 'ngExport'],
  admin:       ['production', 'inbox', 'maintenance', 'rawmaterial', 'machines', 'dashboard', 'admin', 'joborders', 'cost', 'waste', 'sorting', 'alarm', 'ngissue', 'dailycheck', 'ngExport']
};

function resolvePermissions(role, overrideJson) {
  var base = {};
  var defs = ROLE_DEFAULT_PERMISSIONS[role] || [];
  PERMISSION_KEYS.forEach(function (k) { base[k] = defs.indexOf(k) >= 0; });
  var ov = safeJson(overrideJson, {});
  Object.keys(ov || {}).forEach(function (k) { if (PERMISSION_KEYS.indexOf(k) >= 0) base[k] = !!ov[k]; });
  base.inbox = true;
  return base;
}

function hashPin(employeeId, pin) { return 'sha256:' + sha256(String(employeeId).toUpperCase() + ':' + pin); }

function checkPin(user, pin) {
  var stored = String(user.PIN || '');
  if (stored.indexOf('sha256:') === 0) return stored === hashPin(user.EmployeeID, pin);
  return ('0000' + stored).slice(-4) === String(pin); // รองรับ PIN แบบเดิม (ไม่ได้ hash)
}

function publicUser(u) {
  return {
    employeeId: String(u.EmployeeID), name: u.Name, role: u.Role, shift: u.Shift || '',
    active: isActiveValue(u.Active), permissions: resolvePermissions(u.Role, u.Permissions),
    permissionOverrides: safeJson(u.Permissions, {}), createdAt: u.CreatedAt
  };
}

function login(employeeId, pin) {
  employeeId = String(employeeId || '').trim().toUpperCase();
  pin = String(pin || '').trim();
  if (!employeeId || !/^\d{4}$/.test(pin)) return { success: false, message: 'กรุณากรอกรหัสพนักงานและ PIN 4 หลัก' };
  var u = findRow('Users', 'EmployeeID', employeeId);
  if (!u) return { success: false, message: 'ไม่พบรหัสพนักงาน' };
  if (!isActiveValue(u.Active)) return { success: false, message: 'บัญชีถูกระงับ' };
  if (!checkPin(u, pin)) return { success: false, message: 'PIN ไม่ถูกต้อง' };
  cleanupExpiredSessions();
  var token = generateUUID();
  PropertiesService.getScriptProperties().setProperty('session_' + token, JSON.stringify({
    employeeId: employeeId, expiry: Date.now() + LINE_CONFIG.SESSION_HOURS * 3600000
  }));
  return { success: true, token: token, user: publicUser(u) };
}

function logout(token) {
  if (token) PropertiesService.getScriptProperties().deleteProperty('session_' + token);
  return { success: true };
}

function cleanupExpiredSessions() {
  var props = PropertiesService.getScriptProperties();
  var all = props.getProperties();
  var now = Date.now();
  Object.keys(all).forEach(function (k) {
    if (k.indexOf('session_') !== 0) return;
    var s = safeJson(all[k], null);
    if (!s || s.expiry < now) props.deleteProperty(k);
  });
}

function purgeUserSessions(employeeId) {
  var props = PropertiesService.getScriptProperties();
  var all = props.getProperties();
  Object.keys(all).forEach(function (k) {
    if (k.indexOf('session_') !== 0) return;
    var s = safeJson(all[k], null);
    if (s && String(s.employeeId) === String(employeeId)) props.deleteProperty(k);
  });
}

/** คืน user object (publicUser) หรือ null */
function getSessionUser(token) {
  if (!token) return null;
  var raw = PropertiesService.getScriptProperties().getProperty('session_' + token);
  var s = safeJson(raw, null);
  if (!s || s.expiry < Date.now()) return null;
  var u = findRow('Users', 'EmployeeID', s.employeeId);
  if (!u || !isActiveValue(u.Active)) return null;
  return publicUser(u);
}

function validateSession(token) {
  return { success: true, data: getSessionUser(token) };
}

/** ต้อง login — throw ถ้าไม่ผ่าน */
function requireLogin(token) {
  var u = getSessionUser(token);
  if (!u) throw new Error(SESSION_EXPIRED_MSG);
  return u;
}

function roleLevel(role) { return ROLE_LEVELS[role] === undefined ? -1 : ROLE_LEVELS[role]; }

function hasRole(token, minRole) {
  var u = getSessionUser(token);
  return !!u && roleLevel(u.role) >= roleLevel(minRole);
}

function requireRole(token, minRole) {
  var u = requireLogin(token);
  if (roleLevel(u.role) < roleLevel(minRole)) throw new Error('ไม่มีสิทธิ์ทำรายการนี้');
  return u;
}

function requirePermission(token, key) {
  var u = requireLogin(token);
  if (!u.permissions[key]) throw new Error('ไม่มีสิทธิ์ทำรายการนี้');
  return u;
}

// ---------- Users (admin) ----------
function getAllUsers(token) {
  requireRole(token, 'admin');
  return { success: true, data: getAllRows('Users').map(publicUser) };
}

function addUser(token, d) {
  var admin = requireRole(token, 'admin');
  var id = String(d.employeeId || '').trim().toUpperCase();
  if (!id || !d.name) throw new Error('กรุณากรอกรหัสและชื่อ');
  if (!/^\d{4}$/.test(String(d.pin || ''))) throw new Error('PIN ต้องเป็นตัวเลข 4 หลัก');
  if (ROLE_LEVELS[d.role] === undefined) throw new Error('Role ไม่ถูกต้อง');
  if (findRow('Users', 'EmployeeID', id)) throw new Error('รหัสพนักงานนี้มีอยู่แล้ว');
  appendRow('Users', {
    EmployeeID: id, Name: d.name, PIN: hashPin(id, d.pin), Role: d.role, Shift: d.shift || '',
    Active: true, CreatedAt: formatDate(), Permissions: d.permissions ? JSON.stringify(d.permissions) : ''
  });
  logAction(admin, 'addUser', { employeeId: id, role: d.role });
  return { success: true };
}

function updateUser(token, employeeId, updates) {
  var admin = requireRole(token, 'admin');
  var u = findRow('Users', 'EmployeeID', employeeId);
  if (!u) throw new Error('ไม่พบผู้ใช้');
  var upd = {};
  if (updates.name !== undefined) upd.Name = updates.name;
  if (updates.role !== undefined) {
    if (ROLE_LEVELS[updates.role] === undefined) throw new Error('Role ไม่ถูกต้อง');
    upd.Role = updates.role;
  }
  if (updates.shift !== undefined) upd.Shift = updates.shift;
  if (updates.active !== undefined) upd.Active = !!updates.active;
  if (updates.pin) {
    if (!/^\d{4}$/.test(String(updates.pin))) throw new Error('PIN ต้องเป็นตัวเลข 4 หลัก');
    upd.PIN = hashPin(employeeId, updates.pin);
  }
  if (updates.permissions !== undefined) upd.Permissions = updates.permissions ? JSON.stringify(updates.permissions) : '';
  updateRow('Users', 'EmployeeID', employeeId, upd);
  purgeUserSessions(employeeId);
  logAction(admin, 'updateUser', { employeeId: employeeId, fields: Object.keys(upd).filter(function (k) { return k !== 'PIN'; }) });
  return { success: true };
}
