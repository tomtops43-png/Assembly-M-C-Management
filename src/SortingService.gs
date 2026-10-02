/**
 * SortingService.gs — คัดแยกงาน (ชนิดเสียแยกตาม LINE_CONFIG.DEFECT_PART_GROUPS)
 */
function sortingToObj(r) {
  return {
    jobId: String(r.JobID), timestamp: r.Timestamp, date: r.Date, shift: r.Shift, shiftDN: r.ShiftDN,
    machineId: String(r.MachineID), productCode: String(r.ProductCode), foundProcess: r.FoundProcess,
    totalQty: toNumber(r.TotalQty), goodQty: toNumber(r.GoodQty), defectQty: toNumber(r.DefectQty),
    defectDetails: safeJson(r.DefectDetails, {}), status: r.Status || 'pending', registeredBy: r.RegisteredBy,
    registeredByName: r.RegisteredByName, sortedBy: r.SortedBy || '', sortedByName: r.SortedByName || '',
    pulledAt: r.PulledAt || '', completedAt: r.CompletedAt || '', remark: r.Remark || '', jobOrderId: String(r.JobOrderID || '')
  };
}

function getSortingJob(jobId) {
  var r = findRow('SortingLog', 'JobID', jobId);
  if (!r) throw new Error('ไม่พบงานคัดแยก');
  return sortingToObj(r);
}

function submitSortingJob(token, d) {
  var u = requirePermission(token, 'sorting');
  d = d || {};
  var date = d.date || getWorkDate();
  if (!isValidDateStr(date) || date > getWorkDate()) throw new Error('วันที่ไม่ถูกต้อง');
  if (!getMachine(d.machineId)) throw new Error('ไม่พบเครื่องจักร');
  if (!d.productCode) throw new Error('กรุณาเลือกสินค้า');
  if (LINE_CONFIG.SORTING_PROCESSES.indexOf(d.foundProcess) < 0) throw new Error('กรุณาเลือกกระบวนการที่พบ');
  if (toNumber(d.totalQty) <= 0) throw new Error('กรุณากรอกจำนวนที่ต้อง Sort');
  if (!hasNgReason(d.remark)) throw new Error('กรุณาระบุหมายเหตุ');
  var id = makeId('ST', date);
  appendRow('SortingLog', {
    JobID: id, Timestamp: formatDate(), Date: date, Shift: d.shift || u.shift || '', ShiftDN: detectShift(),
    MachineID: d.machineId, ProductCode: d.productCode, FoundProcess: d.foundProcess, TotalQty: toNumber(d.totalQty),
    GoodQty: 0, DefectQty: 0, DefectDetails: '', Status: 'pending', RegisteredBy: u.employeeId, RegisteredByName: u.name,
    SortedBy: '', SortedByName: '', PulledAt: '', CompletedAt: '', Remark: d.remark, JobOrderID: d.jobOrderId || ''
  });
  return { success: true, jobId: id };
}

function updateSortingJob(token, jobId, updates) {
  var u = requirePermission(token, 'sorting');
  var j = getSortingJob(jobId);
  if (j.status !== 'pending') throw new Error('แก้ไขได้เฉพาะงานที่ยังไม่ถูกดึง');
  if (j.registeredBy !== u.employeeId && roleLevel(u.role) < roleLevel('supervisor')) throw new Error('ไม่มีสิทธิ์แก้ไข');
  var upd = {};
  updates = updates || {};
  if (updates.totalQty !== undefined) upd.TotalQty = toNumber(updates.totalQty);
  if (updates.remark !== undefined) upd.Remark = updates.remark;
  if (updates.foundProcess) upd.FoundProcess = updates.foundProcess;
  if (updates.jobOrderId !== undefined) upd.JobOrderID = updates.jobOrderId;
  updateRow('SortingLog', 'JobID', jobId, upd);
  return { success: true };
}

function pullSortingJob(token, jobId) {
  var u = requirePermission(token, 'sorting');
  var j = getSortingJob(jobId);
  if (j.status !== 'pending') throw new Error('งานนี้ถูกดึงไปแล้ว');
  updateRow('SortingLog', 'JobID', jobId, { Status: 'in-progress', SortedBy: u.employeeId, SortedByName: u.name, PulledAt: formatDate() });
  return { success: true };
}

function returnSortingJob(token, jobId) {
  requirePermission(token, 'sorting');
  var j = getSortingJob(jobId);
  if (j.status !== 'in-progress') throw new Error('งานนี้ไม่ได้อยู่ระหว่างคัดแยก');
  if (j.goodQty + j.defectQty > 0) throw new Error('บันทึกผลไปแล้ว คืนงานไม่ได้');
  updateRow('SortingLog', 'JobID', jobId, { Status: 'pending', SortedBy: '', SortedByName: '', PulledAt: '' });
  return { success: true };
}

/** บันทึกผล (บวกสะสม) + ปรับยอดผลิตอัตโนมัติ (แถว sort-adjust) */
function recordSortingResult(token, jobId, result) {
  var u = requirePermission(token, 'sorting');
  var j = getSortingJob(jobId);
  if (j.status === 'completed') throw new Error('งานนี้เสร็จแล้ว');
  result = result || {};
  var good = Math.max(0, toNumber(result.goodQty));
  var parts = {};
  var defect = 0;
  Object.keys(result.defectByPart || {}).forEach(function (k) {
    var q = Math.max(0, toNumber(result.defectByPart[k]));
    if (q > 0) { parts[k] = q; defect += q; }
  });
  if (good + defect <= 0) throw new Error('กรุณากรอกจำนวน');
  if (j.goodQty + j.defectQty + good + defect > j.totalQty) throw new Error('จำนวนรวมเกินจำนวนที่ต้อง Sort');

  var details = j.defectDetails || {};
  Object.keys(parts).forEach(function (k) { details[k] = toNumber(details[k]) + parts[k]; });
  var newGood = j.goodQty + good, newDefect = j.defectQty + defect;
  var done = newGood + newDefect >= j.totalQty;
  updateRow('SortingLog', 'JobID', jobId, {
    GoodQty: newGood, DefectQty: newDefect, DefectDetails: JSON.stringify(details),
    Status: done ? 'completed' : 'in-progress', CompletedAt: done ? formatDate() : '',
    SortedBy: j.sortedBy || u.employeeId, SortedByName: j.sortedByName || u.name
  });

  var isFg = LINE_CONFIG.SORTING_FG_PROCESSES.indexOf(j.foundProcess) >= 0;
  var adjDetails = {};
  Object.keys(parts).forEach(function (k) { adjDetails[k] = { componentName: k, qty: parts[k] }; });
  appendRow('ProductionLog', {
    LogID: makeId('STADJ'), Timestamp: formatDate(), Date: j.date, Shift: j.shift, TimePeriod: detectTimePeriod(),
    EmployeeID: u.employeeId, EmployeeName: u.name, MachineID: j.machineId, ProductCode: j.productCode, PlannedQty: 0,
    ActualQty: isFg ? -defect : good, DefectQty: defect, DefectDetails: JSON.stringify(adjDetails),
    Remark: LINE_CONFIG.SORTING_ADJUST_NG_REASON + ' ' + jobId + ' (' + j.foundProcess + ')', Status: 'sort-adjust',
    ClientRequestID: '', JobOrderID: j.jobOrderId
  });
  return { success: true, completed: done };
}

function querySortingJobs(f) {
  f = f || {};
  var rows = getAllRows('SortingLog').map(sortingToObj);
  return rows.filter(function (j) {
    if (f.status && f.status !== 'all' && j.status !== f.status) return false;
    if (f.date && j.date !== f.date) return false;
    if (f.dateFrom && j.date < f.dateFrom) return false;
    if (f.dateTo && j.date > f.dateTo) return false;
    if (f.machineId && j.machineId !== f.machineId) return false;
    if (f.jobOrderId && j.jobOrderId !== f.jobOrderId) return false;
    return true;
  }).reverse();
}

function getSortingJobs(token, filters) {
  requireLogin(token);
  return { success: true, data: querySortingJobs(filters) };
}

function getTodaySortingJobs(token) {
  requireLogin(token);
  var today = getWorkDate();
  var list = querySortingJobs({}).filter(function (j) { return j.status !== 'completed' || j.date === today; });
  return { success: true, data: list };
}

function getSortingDashboard(token, filters) {
  requireLogin(token);
  var list = querySortingJobs(filters);
  var s = { total: list.length, pending: 0, inProgress: 0, completed: 0, totalQty: 0, goodQty: 0, defectQty: 0, defectByPart: {} };
  var byMachine = {}, byProcess = {}, byJobOrder = {};
  list.forEach(function (j) {
    if (j.status === 'pending') s.pending++; else if (j.status === 'in-progress') s.inProgress++; else s.completed++;
    s.totalQty += j.totalQty; s.goodQty += j.goodQty; s.defectQty += j.defectQty;
    Object.keys(j.defectDetails).forEach(function (k) { s.defectByPart[k] = (s.defectByPart[k] || 0) + toNumber(j.defectDetails[k]); });
    [[byMachine, j.machineId], [byProcess, j.foundProcess], [byJobOrder, j.jobOrderId || '-']].forEach(function (p) {
      var o = p[0][p[1]] = p[0][p[1]] || { jobs: 0, totalQty: 0, goodQty: 0, defectQty: 0 };
      o.jobs++; o.totalQty += j.totalQty; o.goodQty += j.goodQty; o.defectQty += j.defectQty;
    });
  });
  return { success: true, data: { summary: s, byMachine: byMachine, byProcess: byProcess, byJobOrder: byJobOrder } };
}
