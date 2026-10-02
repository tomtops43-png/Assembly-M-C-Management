/**
 * JobOrderService.gs — วางแผนการผลิต (Job Order) + progress + คิว
 */
var JO_PRIORITY_RANK = { urgent: 0, high: 1, normal: 2, low: 3 };
var JO_ACTIVE = ['open', 'in-progress'];

function jobOrderToObj(r) {
  return {
    jobOrderId: String(r.JobOrderID), createdAt: r.CreatedAt, createdBy: r.CreatedBy, createdByName: r.CreatedByName,
    workDate: r.WorkDate, dueDate: r.DueDate, machineId: String(r.MachineID), productCode: String(r.ProductCode),
    shift: r.Shift || 'ALL', plannedQty: toNumber(r.PlannedQty), priority: r.Priority || 'normal',
    status: r.Status || 'open', remark: r.Remark || ''
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
    if (f.machineId && j.machineId !== f.machineId && j.machineId !== 'ALL') return false;
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
    if (f.machineId && j.machineId !== 'ALL' && j.machineId !== String(f.machineId)) return false;
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
  if (!d.machineId) throw new Error('กรุณาเลือกเครื่องจักร');
  if (d.dueDate && d.dueDate < workDate) throw new Error('กำหนดส่งต้องไม่ก่อนวันที่แผน');
  var id = String(d.jobOrderId || '').trim();
  if (id) {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{2,39}$/.test(id)) throw new Error('รูปแบบเลข Job Order ไม่ถูกต้อง');
    if (findRow('JobOrders', 'JobOrderID', id)) throw new Error('เลข Job Order นี้มีอยู่แล้ว');
  } else {
    id = makeId('JO', workDate);
  }
  appendRow('JobOrders', {
    JobOrderID: id, CreatedAt: formatDate(), CreatedBy: u.employeeId, CreatedByName: u.name, WorkDate: workDate,
    DueDate: d.dueDate || '', MachineID: d.machineId, ProductCode: d.productCode, Shift: d.shift || 'ALL',
    PlannedQty: toNumber(d.plannedQty), Priority: JO_PRIORITY_RANK[d.priority] !== undefined ? d.priority : 'normal',
    Status: 'open', Remark: d.remark || ''
  });
  logAction(u, 'createJobOrder', { jobOrderId: id });
  return { success: true, jobOrderId: id };
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
  if (!updateRow('JobOrders', 'JobOrderID', jobOrderId, upd)) throw new Error('ไม่พบ Job Order');
  // JO ที่ปิด/ยกเลิก → ล้างออกจากเครื่อง
  if (upd.Status === 'completed' || upd.Status === 'cancelled') {
    getMachines().forEach(function (m) {
      if (m.currentJobOrder === jobOrderId) updateRow('Machines', 'MachineID', m.machineId, { CurrentJobOrder: '' });
    });
  }
  logAction(u, 'updateJobOrder', { jobOrderId: jobOrderId, updates: upd });
  return { success: true };
}
