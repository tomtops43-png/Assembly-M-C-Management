/**
 * ProductionService.gs — ยอดผลิต, Inbox, Action log
 */
var NG_OTHER = 'อื่นๆ';

// ---------- helpers ----------
function isValidDateStr(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')); }

function hasNgReason(remark) {
  var r = String(remark || '').trim();
  return !!r && r !== NG_OTHER && r !== NG_OTHER + ':' && r !== NG_OTHER + ' ()';
}

/** {code:{componentName, qty}} → {details, defectQty} */
function normalizeDefects(defectByComponent, fallbackQty) {
  var details = {};
  var qtys = [];
  Object.keys(defectByComponent || {}).forEach(function (code) {
    var v = defectByComponent[code] || {};
    var q = Math.max(0, toNumber(v.qty));
    if (q > 0) { details[code] = { componentName: v.componentName || '', qty: q }; qtys.push(q); }
  });
  var total;
  if (!qtys.length) total = Math.max(0, toNumber(fallbackQty));
  else if (LINE_CONFIG.DEFECT_AGGREGATE === 'sum') total = qtys.reduce(function (a, b) { return a + b; }, 0);
  else total = Math.max.apply(null, qtys);
  return { details: details, defectQty: total };
}

function productionRowToObj(r) {
  return {
    logId: String(r.LogID), timestamp: r.Timestamp, date: r.Date, shift: r.Shift, timePeriod: r.TimePeriod,
    shiftDN: shiftFromPeriod(r.TimePeriod), employeeId: String(r.EmployeeID), employeeName: r.EmployeeName,
    machineId: String(r.MachineID), productCode: String(r.ProductCode), plannedQty: toNumber(r.PlannedQty),
    actualQty: toNumber(r.ActualQty), defectQty: toNumber(r.DefectQty), defectDetails: safeJson(r.DefectDetails, {}),
    remark: r.Remark || '', status: r.Status || 'completed', jobOrderId: String(r.JobOrderID || '')
  };
}

/** อ่าน ProductionLog ตามช่วง work date (tail read + grace 2 วัน) */
function readProductionRange(dateFrom, dateTo) {
  var rows = dateFrom ? getRowsSince('ProductionLog', 'Timestamp', addDays(dateFrom, -2)) : getAllRows('ProductionLog');
  return rows.filter(function (r) {
    return (!dateFrom || r.Date >= dateFrom) && (!dateTo || r.Date <= dateTo);
  }).map(productionRowToObj);
}

function queryProduction(f) {
  f = f || {};
  var from = f.date || f.dateFrom || '', to = f.date || f.dateTo || '';
  var rows = readProductionRange(from, to).filter(function (r) {
    if (f.machineId && r.machineId !== String(f.machineId)) return false;
    if (f.employeeId && r.employeeId !== String(f.employeeId)) return false;
    if (f.productCode && r.productCode !== String(f.productCode)) return false;
    if (f.jobOrderId) {
      if (f.jobOrderId === '__unassigned__') { if (r.jobOrderId) return false; }
      else if (r.jobOrderId !== String(f.jobOrderId)) return false;
    }
    if (f.shift && r.shift !== f.shift) return false;
    if (f.shiftDN && r.shiftDN !== f.shiftDN) return false;
    if (f.status) { if (r.status !== f.status) return false; }
    else if (!f.includeCancelled && r.status === 'cancelled') return false;
    return true;
  });
  rows.sort(function (a, b) { return a.timestamp < b.timestamp ? 1 : -1; });
  if (f.limit) rows = rows.slice(0, toNumber(f.limit));
  return rows;
}

function canEditEntry(u, row) {
  if (row.status === 'cancelled' || row.status === 'sort-adjust') return false;
  if (u.role === 'admin') return true;
  return row.employeeId === u.employeeId && row.date >= addDays(getWorkDate(), -1);
}

// ---------- reads ----------
function getProductionHistory(token, filters) {
  requireLogin(token);
  return { success: true, data: queryProduction(filters) };
}

function getTodayProductionByEmployee(token) {
  var u = requireLogin(token);
  return { success: true, data: queryProduction({ date: getWorkDate(), employeeId: u.employeeId, limit: 10 }) };
}

function getRecentProductionByEmployee(token, days) {
  var u = requireLogin(token);
  days = Math.min(7, Math.max(1, toNumber(days, 2)));
  var today = getWorkDate();
  var rows = queryProduction({ dateFrom: addDays(today, -(days - 1)), dateTo: today, employeeId: u.employeeId });
  rows.forEach(function (r) { r.canEdit = canEditEntry(u, r); });
  return { success: true, data: rows };
}

function getEditableProductionEntries(token, filters) {
  var u = requireLogin(token);
  if (u.role !== 'admin') return getRecentProductionByEmployee(token, 2);
  var f = filters || {};
  if (!f.dateFrom && !f.date) { f.dateFrom = addDays(getWorkDate(), -1); f.dateTo = getWorkDate(); }
  var rows = queryProduction(f);
  rows.forEach(function (r) { r.canEdit = canEditEntry(u, r); });
  return { success: true, data: rows };
}

/** bootstrap หน้า กรอกยอด ใน 1 request */
function getProductionFormData(token, filters, include) {
  var u = requireLogin(token);
  var out = { version: getMasterDataVersion(), workDate: getWorkDate(), timePeriods: getTimePeriods() };
  if (String(include || '').indexOf('masters') >= 0) {
    out.machines = getMachines();
    out.machineProducts = {};
    out.machines.forEach(function (m) { out.machineProducts[m.machineId] = getMachineProducts(m.machineId); });
    out.bom = {};
    getAllProductsWithBOM().forEach(function (p) { out.bom[p.productCode] = p.bom; });
  }
  out.entries = getEditableProductionEntries(token, filters).data;
  out.user = u;
  return { success: true, data: out };
}

// ---------- writes ----------
function submitProduction(token, data) {
  var u = requirePermission(token, 'production');
  data = data || {};
  var m = getMachine(data.machineId);
  if (!m) throw new Error('ไม่พบเครื่องจักร');
  if (!m.currentProduct) throw new Error('เครื่องนี้ยังไม่ได้ตั้งสินค้า — แจ้งหัวหน้าให้ตั้งที่เมนูเครื่องจักร');
  if (String(data.productCode || '') !== m.currentProduct || String(data.jobOrderId || '') !== m.currentJobOrder) {
    return { success: false, settingsChanged: true, message: 'การตั้งค่าสินค้า/Job Order ของเครื่องเปลี่ยนแล้ว — โหลดข้อมูลใหม่ให้แล้ว กรุณาตรวจสอบแล้วบันทึกอีกครั้ง' };
  }
  var workDate = data.workDate || getWorkDate();
  if (!isValidDateStr(workDate) || workDate > getWorkDate()) throw new Error('วันที่งานไม่ถูกต้อง');
  var timePeriod = data.timePeriod || detectTimePeriod();
  if (getTimePeriods().indexOf(timePeriod) < 0) throw new Error('ช่วงเวลาไม่ถูกต้อง');

  var now = new Date();
  var recent = getRowsSince('ProductionLog', 'Timestamp', formatDate(new Date(now.getTime() - 86400000)));
  if (data.clientRequestId) {
    for (var i = 0; i < recent.length; i++) {
      if (String(recent[i].ClientRequestID) === String(data.clientRequestId)) return { success: true, duplicate: true, logId: recent[i].LogID };
    }
  }

  var ng = normalizeDefects(data.defectByComponent, data.defectQty);
  var actual = toNumber(data.actualQty);
  if (ng.defectQty > 0 && !hasNgReason(data.remark)) throw new Error('กรุณาระบุอาการ NG');
  if (LINE_CONFIG.NG_ROW_SEPARATE && ng.defectQty > 0 && actual >= 0) actual = 0;

  // กันบันทึกซ้ำจากเนื้อหาเหมือนกันภายใน 2 นาที
  var twoMin = formatDate(new Date(now.getTime() - 120000));
  for (var j = recent.length - 1; j >= 0; j--) {
    var r = recent[j];
    if (r.Timestamp < twoMin) break;
    if (String(r.EmployeeID) === u.employeeId && String(r.MachineID) === m.machineId && r.Date === workDate &&
        r.TimePeriod === timePeriod && toNumber(r.ActualQty) === actual && toNumber(r.DefectQty) === ng.defectQty &&
        r.Status !== 'cancelled') {
      return { success: true, duplicate: true, logId: r.LogID };
    }
  }

  var logId = generateUUID();
  appendRow('ProductionLog', {
    LogID: logId, Timestamp: formatDate(now), Date: workDate, Shift: u.shift || '', TimePeriod: timePeriod,
    EmployeeID: u.employeeId, EmployeeName: u.name, MachineID: m.machineId, ProductCode: m.currentProduct,
    PlannedQty: toNumber(data.plannedQty, m.capacity), ActualQty: actual, DefectQty: ng.defectQty,
    DefectDetails: Object.keys(ng.details).length ? JSON.stringify(ng.details) : '', Remark: data.remark || '',
    Status: 'completed', ClientRequestID: data.clientRequestId || '', JobOrderID: m.currentJobOrder
  });
  if (m.currentJobOrder) {
    var jo = findRow('JobOrders', 'JobOrderID', m.currentJobOrder);
    if (jo && jo.Status === 'open') updateRow('JobOrders', 'JobOrderID', m.currentJobOrder, { Status: 'in-progress' });
  }
  return { success: true, logId: logId };
}

function getProductionRow(logId) {
  var r = findRow('ProductionLog', 'LogID', logId);
  if (!r) throw new Error('ไม่พบรายการ');
  return productionRowToObj(r);
}

function updateProductionEntry(token, logId, updates) {
  var u = requireLogin(token);
  var row = getProductionRow(logId);
  if (!canEditEntry(u, row)) throw new Error('แก้ไขไม่ได้ (เกิน 2 วัน หรือไม่ใช่รายการของคุณ)');
  updates = updates || {};
  var upd = {};
  var ng = updates.defectByComponent !== undefined || updates.defectQty !== undefined
    ? normalizeDefects(updates.defectByComponent, updates.defectQty) : null;
  var remark = updates.remark !== undefined ? updates.remark : row.remark;
  var actual = updates.actualQty !== undefined ? toNumber(updates.actualQty) : row.actualQty;
  if (ng) {
    if (ng.defectQty > 0 && !hasNgReason(remark)) throw new Error('กรุณาระบุอาการ NG');
    if (LINE_CONFIG.NG_ROW_SEPARATE && ng.defectQty > 0 && actual >= 0) actual = 0;
    upd.DefectQty = ng.defectQty;
    upd.DefectDetails = Object.keys(ng.details).length ? JSON.stringify(ng.details) : '';
  }
  upd.ActualQty = actual;
  if (updates.remark !== undefined) upd.Remark = updates.remark;
  if (updates.plannedQty !== undefined) upd.PlannedQty = toNumber(updates.plannedQty);
  if (updates.timePeriod) {
    if (getTimePeriods().indexOf(updates.timePeriod) < 0) throw new Error('ช่วงเวลาไม่ถูกต้อง');
    upd.TimePeriod = updates.timePeriod;
  }
  if (updates.jobOrderId !== undefined) upd.JobOrderID = updates.jobOrderId;
  updateRow('ProductionLog', 'LogID', logId, upd);
  logAction(u, 'updateProductionEntry', { logId: logId, before: row, updates: upd });
  return { success: true };
}

function cancelProduction(token, logId) {
  var u = requireLogin(token);
  var row = getProductionRow(logId);
  if (row.employeeId !== u.employeeId && roleLevel(u.role) < roleLevel('supervisor')) throw new Error('ไม่มีสิทธิ์ยกเลิก');
  updateRow('ProductionLog', 'LogID', logId, { Status: 'cancelled' });
  logAction(u, 'cancelProduction', { logId: logId, snapshot: row });
  return { success: true };
}

/** ลบ = เปลี่ยนสถานะเป็น cancelled ทันที (ใส่เหตุผล) */
function requestDeleteProduction(token, logId, reason) {
  var u = requireLogin(token);
  if (!String(reason || '').trim()) throw new Error('กรุณาระบุเหตุผล');
  var row = getProductionRow(logId);
  if (!canEditEntry(u, row)) throw new Error('ลบไม่ได้ (เกิน 2 วัน หรือไม่ใช่รายการของคุณ)');
  updateRow('ProductionLog', 'LogID', logId, { Status: 'cancelled' });
  logAction(u, 'deleteProduction', { logId: logId, reason: reason, snapshot: row });
  return { success: true };
}

// ---------- Inbox ----------
function addInbox(employeeId, type, title, message, refId, createdBy) {
  appendRow('Inbox', {
    InboxID: generateUUID(), EmployeeID: employeeId, Type: type, Title: title, Message: message,
    RefID: refId || '', Status: 'unread', CreatedAt: formatDate(), CreatedBy: createdBy || 'system'
  });
}

function getInbox(token) {
  var u = requireLogin(token);
  if (LINE_CONFIG.INBOX_AM_CHECKSHEET && u.role === 'operator') {
    var ref = 'AM-' + getWorkDate();
    var has = getRowsSince('Inbox', 'CreatedAt', addDays(getWorkDate(), -1)).some(function (r) {
      return String(r.EmployeeID) === u.employeeId && r.RefID === ref;
    });
    if (!has) addInbox(u.employeeId, 'am_checksheet', 'AM Check Sheet ประจำวัน', 'กรุณาตรวจเช็คเครื่องจักรก่อนเริ่มงาน', ref);
  }
  var rows = getAllRows('Inbox').filter(function (r) { return String(r.EmployeeID) === u.employeeId; })
    .sort(function (a, b) { return a.CreatedAt < b.CreatedAt ? 1 : -1; }).slice(0, 100)
    .map(function (r) {
      return { inboxId: r.InboxID, type: r.Type, title: r.Title, message: r.Message, refId: r.RefID, status: r.Status, createdAt: r.CreatedAt, createdBy: r.CreatedBy };
    });
  return { success: true, data: rows };
}

function markInboxRead(token, inboxId) {
  var u = requireLogin(token);
  var r = findRow('Inbox', 'InboxID', inboxId);
  if (!r || String(r.EmployeeID) !== u.employeeId) throw new Error('ไม่พบข้อความ');
  updateRow('Inbox', 'InboxID', inboxId, { Status: 'read' });
  return { success: true };
}

// ---------- Action log ----------
function logAction(user, action, payload) {
  try {
    appendRow('ActionLog', {
      ActionID: generateUUID(), Timestamp: formatDate(), EmployeeID: user ? user.employeeId : '',
      EmployeeName: user ? user.name : '', Action: action, Payload: JSON.stringify(payload || {})
    });
  } catch (e) { console.error('logAction failed: ' + e); }
}

function getActionLogs(token, limit) {
  var u = requireLogin(token);
  limit = Math.min(1000, toNumber(limit, 200));
  var rows = getRowsSince('ActionLog', 'Timestamp', formatDate(new Date(Date.now() - 90 * 86400000)))
    .filter(function (r) { return u.role === 'admin' || String(r.EmployeeID) === u.employeeId; })
    .reverse().slice(0, limit)
    .map(function (r) { return { timestamp: r.Timestamp, employeeId: r.EmployeeID, employeeName: r.EmployeeName, action: r.Action, payload: r.Payload }; });
  return { success: true, data: rows };
}
