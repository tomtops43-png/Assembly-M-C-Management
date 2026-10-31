/**
 * SortingService.gs — คัดแยกงาน: งานดี / งานรอแยกส่วน (เดิม = งานเสีย; แยกตาม LINE_CONFIG.DEFECT_PART_GROUPS)
 * ยอดรอแยกส่วนจะถูกส่งเข้า DisassemblyLog อัตโนมัติ (ดู DisassemblyService.gs)
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
  var tq = toNumber(d.totalQty);
  if (tq <= 0 || Math.floor(tq) !== tq) throw new Error('จำนวนที่ต้อง Sort ต้องเป็นจำนวนเต็มมากกว่า 0');
  if (!hasNgReason(d.remark)) throw new Error('กรุณาระบุหมายเหตุ');
  checkSortQtyAvailable(d.foundProcess, d.jobOrderId, tq, '');
  var id = makeId('ST', date);
  appendRow('SortingLog', {
    JobID: id, Timestamp: formatDate(), Date: date, Shift: d.shift === 'Day' || d.shift === 'Night' ? d.shift : detectShift(), ShiftDN: detectShift(),
    MachineID: d.machineId, ProductCode: d.productCode, FoundProcess: d.foundProcess, TotalQty: toNumber(d.totalQty),
    GoodQty: 0, DefectQty: 0, DefectDetails: '', Status: 'pending', RegisteredBy: u.employeeId, RegisteredByName: u.name,
    SortedBy: '', SortedByName: '', PulledAt: '', CompletedAt: '', Remark: d.remark, JobOrderID: d.jobOrderId || ''
  });
  return { success: true, jobId: id };
}

/**
 * Interlock: งานที่พบที่ FG (กรอกยอดไปแล้ว) + ระบุ Job Order → จำนวนที่ต้อง Sort ห้ามเกินยอด FG ของ JO นั้น
 * ที่ยังไม่ได้อยู่ในงานคัดแยก FG อื่นที่ยังค้าง (ไลน์ผลิต = ยังไม่ลงยอด จึงตรวจกับยอดไม่ได้)
 */
function checkSortQtyAvailable(foundProcess, jobOrderId, qty, excludeJobId) {
  if (LINE_CONFIG.SORTING_FG_PROCESSES.indexOf(foundProcess) < 0) return;
  if (!jobOrderId) throw new Error('งานที่พบที่ ' + foundProcess + ' ต้องเลือก Job Order (ใช้ตรวจยอด FG)');
  var jo = findRow('JobOrders', 'JobOrderID', jobOrderId);
  if (!jo) throw new Error('ไม่พบ Job Order ' + jobOrderId);
  var fg = computeJobOrderProgress([jobOrderToObj(jo)])[0].actualQty;
  var inSort = 0;
  getAllRows('SortingLog').map(sortingToObj).forEach(function (s) {
    if (s.jobId === excludeJobId || s.jobOrderId !== String(jobOrderId) || s.status === 'completed') return;
    if (LINE_CONFIG.SORTING_FG_PROCESSES.indexOf(s.foundProcess) < 0) return;
    inSort += Math.max(0, s.totalQty - s.goodQty - s.defectQty);
  });
  var avail = Math.max(0, fg - inSort);
  if (qty > avail) throw new Error('จำนวนที่ต้อง Sort (' + qty + ') เกินยอด FG ของ ' + jobOrderId + ' ที่ยังไม่ได้ส่งคัด (' + avail + ' ชิ้น — FG ' + fg + ', อยู่ระหว่างคัด ' + inSort + ')');
}

function updateSortingJob(token, jobId, updates) {
  var u = requirePermission(token, 'sorting');
  var j = getSortingJob(jobId);
  if (j.status !== 'pending') throw new Error('แก้ไขได้เฉพาะงานที่ยังไม่ถูกดึง');
  if (j.registeredBy !== u.employeeId && roleLevel(u.role) < roleLevel('supervisor')) throw new Error('ไม่มีสิทธิ์แก้ไข');
  var upd = {};
  updates = updates || {};
  var tq = updates.totalQty !== undefined ? toNumber(updates.totalQty) : j.totalQty;
  if (tq <= 0 || Math.floor(tq) !== tq) throw new Error('จำนวนที่ต้อง Sort ต้องเป็นจำนวนเต็มมากกว่า 0');
  if (updates.totalQty !== undefined || updates.foundProcess || updates.jobOrderId !== undefined) {
    checkSortQtyAvailable(updates.foundProcess || j.foundProcess, updates.jobOrderId !== undefined ? updates.jobOrderId : j.jobOrderId, tq, jobId);
  }
  if (updates.totalQty !== undefined) upd.TotalQty = tq;
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
  var good = toNumber(result.goodQty);
  if (good < 0 || Math.floor(good) !== good) throw new Error('จำนวนงานดีต้องเป็นจำนวนเต็ม ไม่ติดลบ');
  var parts = {};
  var defect = 0;
  Object.keys(result.defectByPart || {}).forEach(function (k) {
    var q = toNumber(result.defectByPart[k]);
    if (q < 0 || Math.floor(q) !== q) throw new Error('จำนวนรอแยกส่วนต้องเป็นจำนวนเต็ม ไม่ติดลบ');
    if (q > 0) { parts[k] = q; defect += q; }
  });
  if (good + defect <= 0) throw new Error('กรุณากรอกจำนวน');
  var left = j.totalQty - j.goodQty - j.defectQty;
  if (good + defect > left) throw new Error('งานดี ' + good + ' + รอแยกส่วน ' + defect + ' = ' + (good + defect) + ' เกินที่คงเหลือ ' + left + ' ชิ้น');

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
  // ยอด "รอแยกส่วน" (เดิม = งานเสีย) → เข้าคิวรอแยกส่วน อ้างเลขงานคัดแยกเดิม (FIFO ตามวันที่งานคัดแยก)
  var dsJobId = addDisassemblyFromSorting(u, j, defect);
  return { success: true, completed: done, disassemblyJobId: dsJobId };
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
