/**
 * JobOrderService.gs — วางแผนการผลิต (Job Order) + progress + คิว
 */
var JO_PRIORITY_RANK = { urgent: 0, high: 1, normal: 2, low: 3 };
var JO_ACTIVE = ['open', 'in-progress'];
var JO_TEMP_PREFIX = 'TMO-'; // JO ชั่วคราว (Manual) ระหว่างรอเลข MO จริง — TMO-yyyyMMdd-NNN

/** MachineID ของ JO: 'ALL' หรือหลายเครื่องคั่นด้วย , (เช่น AC-06,AC-07) */
function joMachineList(v) {
  return String(v || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
}
function joAllowsMachine(joMachineId, machineId) {
  var ids = joMachineList(joMachineId);
  return !ids.length || ids.indexOf('ALL') >= 0 || ids.indexOf(String(machineId)) >= 0;
}
/** รับ string / array → ค่าที่เก็บในชีต ('ALL' หรือ 'A,B,C') ; ตรวจว่าเครื่องมีจริง */
function normalizeJoMachines(v) {
  var ids = Array.isArray(v) ? v.map(String) : joMachineList(v);
  ids = ids.map(function (x) { return x.trim(); }).filter(function (x, i, a) { return x && a.indexOf(x) === i; });
  if (!ids.length) throw new Error('กรุณาเลือกเครื่องจักร');
  if (ids.indexOf('ALL') >= 0) return 'ALL';
  ids.forEach(function (id) { if (!getMachine(id)) throw new Error('ไม่พบเครื่องจักร ' + id); });
  return ids.join(',');
}

function isTempJobOrderId(id) { return String(id || '').indexOf(JO_TEMP_PREFIX) === 0; }

/** TMO-yyyyMMdd-NNN (เลขวิ่งต่อวัน) */
function nextTempJobOrderId(workDate) {
  var base = JO_TEMP_PREFIX + String(workDate).replace(/-/g, '') + '-';
  var max = 0;
  getAllRows('JobOrders').forEach(function (r) {
    var id = String(r.JobOrderID);
    if (id.indexOf(base) === 0) max = Math.max(max, toNumber(id.substring(base.length)));
  });
  return base + ('00' + (max + 1)).slice(-3);
}

function jobOrderToObj(r) {
  return {
    jobOrderId: String(r.JobOrderID), createdAt: r.CreatedAt, createdBy: r.CreatedBy, createdByName: r.CreatedByName,
    workDate: r.WorkDate, dueDate: r.DueDate, machineId: String(r.MachineID), machineIds: joMachineList(r.MachineID), productCode: String(r.ProductCode),
    shift: r.Shift || 'ALL', plannedQty: toNumber(r.PlannedQty), priority: r.Priority || 'normal',
    status: r.Status || 'open', remark: r.Remark || '', isTemp: isTempJobOrderId(r.JobOrderID)
  };
}

/** ลำดับคิวแยกตามสินค้า: priority → due date → work date → สร้างก่อน */
function assignQueueNumbers(list) {
  var active = list.filter(function (j) { return JO_ACTIVE.indexOf(j.status) >= 0; });
  active.sort(function (a, b) {
    return (JO_PRIORITY_RANK[a.priority] - JO_PRIORITY_RANK[b.priority]) ||
      String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999')) ||
      String(a.workDate).localeCompare(String(b.workDate)) ||
      String(a.createdAt).localeCompare(String(b.createdAt));
  });
  var counters = {};
  active.forEach(function (j) { counters[j.productCode] = (counters[j.productCode] || 0) + 1; j.queueNo = counters[j.productCode]; });
  return list;
}

/** progress รวม ProductionLog (ไม่นับ cancelled) + SortingLog */
function computeJobOrderProgress(list) {
  if (!list.length) return list;
  var ids = {};
  list.forEach(function (j) { ids[j.jobOrderId] = { actual: 0, defect: 0, sortedGood: 0, sortedDefect: 0 }; });
  getAllRows('ProductionLog').forEach(function (r) {
    var p = ids[String(r.JobOrderID)];
    if (!p || r.Status === 'cancelled') return;
    p.actual += toNumber(r.ActualQty); p.defect += toNumber(r.DefectQty);
  });
  getAllRows('SortingLog').forEach(function (r) {
    var p = ids[String(r.JobOrderID)];
    if (!p) return;
    p.sortedGood += toNumber(r.GoodQty); p.sortedDefect += toNumber(r.DefectQty);
  });
  list.forEach(function (j) {
    var p = ids[j.jobOrderId];
    j.actualQty = p.actual; j.defectQty = p.defect; j.sortedGood = p.sortedGood; j.sortedDefect = p.sortedDefect;
    j.remaining = Math.max(0, j.plannedQty - p.actual);
    j.over = Math.max(0, p.actual - j.plannedQty);
    j.completionRate = j.plannedQty > 0 ? Math.round(p.actual / j.plannedQty * 1000) / 10 : 0;
  });
  return list;
}

function getJobOrders(token, filters) {
  requireRole(token, 'supervisor');
  var f = filters || {};
  var list = getAllRows('JobOrders').map(jobOrderToObj);
  assignQueueNumbers(list);
  list = list.filter(function (j) {
    if (f.status && f.status !== 'all' && j.status !== f.status) return false;
    if (f.machineId && !joAllowsMachine(j.machineId, f.machineId)) return false;
    if (f.productCode && j.productCode !== f.productCode) return false;
    if (f.dateFrom && j.workDate < f.dateFrom) return false;
    if (f.dateTo && j.workDate > f.dateTo) return false;
    return true;
  });
  computeJobOrderProgress(list);
  list.sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; });
  return { success: true, data: list };
}

function getJobOrderOptions(token, filters) {
  requireLogin(token);
  var f = filters || {};
  var list = getAllRows('JobOrders').map(jobOrderToObj);
  assignQueueNumbers(list);
  list = list.filter(function (j) {
    if (!f.includeAll && JO_ACTIVE.indexOf(j.status) < 0) return false;
    if (f.machineId && !joAllowsMachine(j.machineId, f.machineId)) return false;
    if (f.productCode && j.productCode !== String(f.productCode)) return false;
    if (f.shift && j.shift !== 'ALL' && j.shift !== f.shift) return false;
    return true;
  });
  list.sort(function (a, b) { return (a.queueNo || 999) - (b.queueNo || 999); });
  return { success: true, data: list };
}

function getJobOrderProgress(token, jobOrderId) {
  requireLogin(token);
  var r = findRow('JobOrders', 'JobOrderID', jobOrderId);
  if (!r) throw new Error('ไม่พบ Job Order');
  return { success: true, data: computeJobOrderProgress([jobOrderToObj(r)])[0] };
}

function getMachineJobOrderProgress(token) {
  requireLogin(token);
  var ids = {};
  getMachines().forEach(function (m) { if (m.currentJobOrder) ids[m.currentJobOrder] = true; });
  var list = getAllRows('JobOrders').map(jobOrderToObj).filter(function (j) { return ids[j.jobOrderId]; });
  computeJobOrderProgress(list);
  var out = {};
  list.forEach(function (j) { out[j.jobOrderId] = j; });
  return { success: true, data: out };
}

function createJobOrder(token, d) {
  var u = requireRole(token, 'supervisor');
  d = d || {};
  var workDate = d.workDate || getWorkDate();
  if (!isValidDateStr(workDate)) throw new Error('วันที่แผนไม่ถูกต้อง');
  if (!d.productCode) throw new Error('กรุณาเลือกรุ่นสินค้า');
  if (toNumber(d.plannedQty) <= 0) throw new Error('กรุณากรอกจำนวนเป้าหมาย');
  var machineIds = normalizeJoMachines(d.machineIds || d.machineId);
  if (d.dueDate && d.dueDate < workDate) throw new Error('กำหนดส่งต้องไม่ก่อนวันที่แผน');
  var id = String(d.jobOrderId || '').trim().toUpperCase();
  if (id) {
    validateRealJobOrderId(id);
  } else {
    id = nextTempJobOrderId(workDate); // ไม่กรอกเลข = JO ชั่วคราว (Manual)
  }
  appendRow('JobOrders', {
    JobOrderID: id, CreatedAt: formatDate(), CreatedBy: u.employeeId, CreatedByName: u.name, WorkDate: workDate,
    DueDate: d.dueDate || '', MachineID: machineIds, ProductCode: d.productCode, Shift: d.shift || 'ALL',
    PlannedQty: toNumber(d.plannedQty), Priority: JO_PRIORITY_RANK[d.priority] !== undefined ? d.priority : 'normal',
    Status: 'open', Remark: d.remark || ''
  });
  logAction(u, 'createJobOrder', { jobOrderId: id });
  return { success: true, jobOrderId: id };
}

function validateRealJobOrderId(id) {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{2,39}$/.test(id)) throw new Error('รูปแบบเลข Job Order ไม่ถูกต้อง');
  if (isTempJobOrderId(id)) throw new Error('เลขขึ้นต้น ' + JO_TEMP_PREFIX + ' สงวนไว้สำหรับ JO ชั่วคราว');
  if (findRow('JobOrders', 'JobOrderID', id)) throw new Error('เลข Job Order นี้มีอยู่แล้ว');
}

/** แทนค่าในคอลัมน์ทั้งคอลัมน์ (อ่าน-เขียนครั้งเดียว) → จำนวนแถวที่เปลี่ยน */
function replaceColumnValue(name, col, oldVal, newVal) {
  var n = withLock(function () {
    var sh = getSheet(name);
    if (!sh || sh.getLastRow() < 2) return 0;
    var ci = getHeaders(name).indexOf(col);
    if (ci < 0) return 0;
    var rng = sh.getRange(2, ci + 1, sh.getLastRow() - 1, 1);
    var vals = rng.getValues(), count = 0;
    vals.forEach(function (v) { if (String(v[0]) === String(oldVal)) { v[0] = newVal; count++; } });
    if (count) rng.setValues(vals);
    return count;
  });
  if (n) afterWrite(name);
  return n;
}

/** เปลี่ยน JO ชั่วคราว (TMO-) เป็นเลข MO จริง — ย้ายยอดผลิต/คัดแยก/เครื่องที่ผูกอยู่ไปเลขใหม่ */
function renameJobOrder(token, jobOrderId, newJobOrderId) {
  var u = requireRole(token, 'supervisor');
  var oldId = String(jobOrderId || '');
  var newId = String(newJobOrderId || '').trim().toUpperCase();
  if (!findRow('JobOrders', 'JobOrderID', oldId)) throw new Error('ไม่พบ Job Order');
  if (!isTempJobOrderId(oldId)) throw new Error('เปลี่ยนเลขได้เฉพาะ JO ชั่วคราว (' + JO_TEMP_PREFIX + ')');
  validateRealJobOrderId(newId);
  var moved = {
    jobOrders: replaceColumnValue('JobOrders', 'JobOrderID', oldId, newId),
    production: replaceColumnValue('ProductionLog', 'JobOrderID', oldId, newId),
    sorting: replaceColumnValue('SortingLog', 'JobOrderID', oldId, newId),
    machines: replaceColumnValue('Machines', 'CurrentJobOrder', oldId, newId)
  };
  logAction(u, 'renameJobOrder', { from: oldId, to: newId, moved: moved });
  return { success: true, jobOrderId: newId, moved: moved };
}

function updateJobOrder(token, jobOrderId, updates) {
  var u = requireRole(token, 'supervisor');
  var upd = {};
  updates = updates || {};
  if (updates.status) {
    if (['open', 'in-progress', 'completed', 'cancelled'].indexOf(updates.status) < 0) throw new Error('สถานะไม่ถูกต้อง');
    upd.Status = updates.status;
  }
  if (updates.dueDate !== undefined) upd.DueDate = updates.dueDate;
  if (updates.priority) upd.Priority = updates.priority;
  if (updates.remark !== undefined) upd.Remark = updates.remark;
  if (updates.plannedQty !== undefined) upd.PlannedQty = toNumber(updates.plannedQty);
  if (updates.machineIds !== undefined) upd.MachineID = normalizeJoMachines(updates.machineIds);
  if (!updateRow('JobOrders', 'JobOrderID', jobOrderId, upd)) throw new Error('ไม่พบ Job Order');
  // JO ที่ปิด/ยกเลิก → ล้างออกจากเครื่อง ; เอาเครื่องออกจาก JO → ล้างจากเครื่องนั้น
  var closed = upd.Status === 'completed' || upd.Status === 'cancelled';
  if (closed || upd.MachineID) {
    getMachines().forEach(function (m) {
      if (m.currentJobOrder !== jobOrderId) return;
      if (closed || !joAllowsMachine(upd.MachineID, m.machineId)) updateRow('Machines', 'MachineID', m.machineId, { CurrentJobOrder: '' });
    });
  }
  logAction(u, 'updateJobOrder', { jobOrderId: jobOrderId, updates: upd });
  return { success: true };
}
