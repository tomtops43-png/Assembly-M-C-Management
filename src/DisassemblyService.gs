/**
 * DisassemblyService.gs — รอแยกส่วน (รื้อ FG ที่เป็น NG กลับเป็น MAT ตาม BOM)
 *
 * ที่มาของงาน (SourceType):
 *  - sorting  : ยอด "รอแยกส่วน" จากผลคัดแยก — อ้างเลขงานคัดแยก (ST-...) และใช้วันที่ของงานคัดแยก (FIFO)
 *  - joborder : งานที่ปั๊มออกมาแต่ยังไม่ลงยอด — ดึงจาก Job Order ตรงๆ (ไม่นับเป็น FG / ไม่นับยอด MO)
 * ผลการแยก: จำนวน FG ที่แยกแล้ว + MAT ที่ได้คืน (ดี) / MAT เสีย ต่อรหัส MAT
 */
var DISASSEMBLY_SOURCES = ['sorting', 'joborder'];

function disassemblyToObj(r) {
  return {
    jobId: String(r.JobID), timestamp: r.Timestamp, date: r.Date, shift: r.Shift,
    machineId: String(r.MachineID || ''), productCode: String(r.ProductCode || ''),
    sourceType: r.SourceType || '', sourceRef: String(r.SourceRef || ''), jobOrderId: String(r.JobOrderID || ''),
    totalQty: toNumber(r.TotalQty), doneQty: toNumber(r.DoneQty), matDetails: safeJson(r.MatDetails, {}),
    status: r.Status || 'pending', registeredBy: r.RegisteredBy, registeredByName: r.RegisteredByName,
    workedBy: r.WorkedBy || '', workedByName: r.WorkedByName || '', pulledAt: r.PulledAt || '',
    completedAt: r.CompletedAt || '', remark: r.Remark || ''
  };
}

function getDisassemblyJob(jobId) {
  var r = findRow('DisassemblyLog', 'JobID', jobId);
  if (!r) throw new Error('ไม่พบงานรอแยกส่วน');
  return disassemblyToObj(r);
}

/**
 * เรียกจาก recordSortingResult — เพิ่มยอดรอแยกส่วนเข้างานที่อ้างเลขงานคัดแยกเดิม (1 งานคัดแยก = 1 งานรอแยกส่วน)
 */
function addDisassemblyFromSorting(u, sortJob, qty) {
  qty = toNumber(qty);
  if (qty <= 0) return '';
  var ex = getAllRows('DisassemblyLog').filter(function (r) {
    return r.SourceType === 'sorting' && String(r.SourceRef) === sortJob.jobId;
  })[0];
  if (ex) {
    var j = disassemblyToObj(ex);
    var total = j.totalQty + qty;
    var upd = { TotalQty: total };
    if (j.status === 'completed') { upd.Status = j.doneQty > 0 ? 'in-progress' : 'pending'; upd.CompletedAt = ''; }
    updateRow('DisassemblyLog', 'JobID', j.jobId, upd);
    return j.jobId;
  }
  var id = makeId('DS', sortJob.date);
  appendRow('DisassemblyLog', {
    JobID: id, Timestamp: formatDate(), Date: sortJob.date, Shift: sortJob.shift, MachineID: sortJob.machineId,
    ProductCode: sortJob.productCode, SourceType: 'sorting', SourceRef: sortJob.jobId, JobOrderID: sortJob.jobOrderId || '',
    TotalQty: qty, DoneQty: 0, MatDetails: '', Status: 'pending', RegisteredBy: u.employeeId, RegisteredByName: u.name,
    WorkedBy: '', WorkedByName: '', PulledAt: '', CompletedAt: '', Remark: sortJob.remark || ''
  });
  return id;
}

/** ลงงานรอแยกส่วนจาก Job Order (งานปั๊มที่ยังไม่ลงยอด — ไม่นับเป็น FG และไม่นับยอด MO) */
function submitDisassemblyJob(token, d) {
  var u = requirePermission(token, 'disassembly');
  d = d || {};
  var date = d.date || getWorkDate();
  if (!isValidDateStr(date) || date > getWorkDate()) throw new Error('วันที่ไม่ถูกต้อง');
  var jo = findRow('JobOrders', 'JobOrderID', d.jobOrderId);
  if (!jo) throw new Error('กรุณาเลือก Job Order');
  var machineId = String(d.machineId || '');
  if (!getMachine(machineId)) throw new Error('กรุณาเลือกเครื่อง');
  if (!joAllowsMachine(jo.MachineID, machineId)) throw new Error('เครื่องนี้ไม่ได้อยู่ใน Job Order ' + jo.JobOrderID);
  if (toNumber(d.totalQty) <= 0) throw new Error('กรุณากรอกจำนวนที่รอแยกส่วน');
  var id = makeId('DS', date);
  appendRow('DisassemblyLog', {
    JobID: id, Timestamp: formatDate(), Date: date, Shift: d.shift === 'Day' || d.shift === 'Night' ? d.shift : detectShift(),
    MachineID: machineId, ProductCode: String(jo.ProductCode), SourceType: 'joborder', SourceRef: String(jo.JobOrderID),
    JobOrderID: String(jo.JobOrderID), TotalQty: toNumber(d.totalQty), DoneQty: 0, MatDetails: '', Status: 'pending',
    RegisteredBy: u.employeeId, RegisteredByName: u.name, WorkedBy: '', WorkedByName: '', PulledAt: '', CompletedAt: '',
    Remark: String(d.remark || '')
  });
  return { success: true, jobId: id };
}

function pullDisassemblyJob(token, jobId) {
  var u = requirePermission(token, 'disassembly');
  var j = getDisassemblyJob(jobId);
  if (j.status !== 'pending') throw new Error('งานนี้ถูกดึงไปแล้ว');
  updateRow('DisassemblyLog', 'JobID', jobId, { Status: 'in-progress', WorkedBy: u.employeeId, WorkedByName: u.name, PulledAt: formatDate() });
  return { success: true };
}

function returnDisassemblyJob(token, jobId) {
  requirePermission(token, 'disassembly');
  var j = getDisassemblyJob(jobId);
  if (j.status !== 'in-progress') throw new Error('งานนี้ไม่ได้อยู่ระหว่างแยกส่วน');
  if (j.doneQty > 0) throw new Error('บันทึกผลไปแล้ว คืนงานไม่ได้');
  updateRow('DisassemblyLog', 'JobID', jobId, { Status: 'pending', WorkedBy: '', WorkedByName: '', PulledAt: '' });
  return { success: true };
}

/** ยกเลิกงานที่ลงจาก Job Order (ยังไม่เริ่มแยก) — งานจากคัดแยกยกเลิกไม่ได้ เพราะยอดผูกกับผลคัดแยก */
function cancelDisassemblyJob(token, jobId) {
  var u = requirePermission(token, 'disassembly');
  var j = getDisassemblyJob(jobId);
  if (j.sourceType !== 'joborder') throw new Error('ยกเลิกได้เฉพาะงานที่ลงจาก Job Order');
  if (j.status !== 'pending') throw new Error('ยกเลิกได้เฉพาะงานที่ยังไม่ถูกดึง');
  if (j.registeredBy !== u.employeeId && roleLevel(u.role) < roleLevel('supervisor')) throw new Error('ไม่มีสิทธิ์ยกเลิก');
  updateRow('DisassemblyLog', 'JobID', jobId, { Status: 'cancelled', CompletedAt: formatDate() });
  return { success: true };
}

/**
 * บันทึกผล (บวกสะสม): qty = จำนวน FG ที่แยกรอบนี้
 * mats = { รหัสMAT: { name, good, scrap } } — MAT ได้คืน (ดี) / MAT เสีย
 */
function recordDisassemblyResult(token, jobId, result) {
  var u = requirePermission(token, 'disassembly');
  var j = getDisassemblyJob(jobId);
  if (j.status === 'completed' || j.status === 'cancelled') throw new Error('งานนี้ปิดแล้ว');
  result = result || {};
  var qty = Math.max(0, toNumber(result.qty));
  if (qty <= 0) throw new Error('กรุณากรอกจำนวนที่แยกส่วน');
  if (j.doneQty + qty > j.totalQty) throw new Error('จำนวนรวมเกินจำนวนที่รอแยกส่วน');

  var details = j.matDetails || {};
  Object.keys(result.mats || {}).forEach(function (code) {
    var m = result.mats[code] || {};
    var good = Math.max(0, toNumber(m.good)), scrap = Math.max(0, toNumber(m.scrap));
    if (good + scrap <= 0) return;
    var d = details[code] = details[code] || { name: m.name || '', good: 0, scrap: 0 };
    if (m.name) d.name = m.name;
    d.good = toNumber(d.good) + good; d.scrap = toNumber(d.scrap) + scrap;
  });
  var done = j.doneQty + qty;
  var finished = done >= j.totalQty;
  updateRow('DisassemblyLog', 'JobID', jobId, {
    DoneQty: done, MatDetails: JSON.stringify(details),
    Status: finished ? 'completed' : 'in-progress', CompletedAt: finished ? formatDate() : '',
    WorkedBy: j.workedBy || u.employeeId, WorkedByName: j.workedByName || u.name
  });
  return { success: true, completed: finished };
}

/** FIFO: เก่าสุดก่อน (วันที่งาน แล้วเวลาที่ลง) */
function queryDisassemblyJobs(f) {
  f = f || {};
  var rows = getAllRows('DisassemblyLog').map(disassemblyToObj).filter(function (j) {
    if (f.status && f.status !== 'all' && j.status !== f.status) return false;
    if (f.dateFrom && j.date < f.dateFrom) return false;
    if (f.dateTo && j.date > f.dateTo) return false;
    if (f.machineId && j.machineId !== f.machineId) return false;
    if (f.productCode && j.productCode !== f.productCode) return false;
    return true;
  });
  rows.sort(function (a, b) {
    return String(a.date).localeCompare(String(b.date)) || String(a.timestamp).localeCompare(String(b.timestamp));
  });
  return rows;
}

/** filters.active = true → เฉพาะงานค้าง (รอ / กำลังแยก) + งานที่เสร็จวันนี้ */
function getDisassemblyJobs(token, filters) {
  requireLogin(token);
  filters = filters || {};
  var list = queryDisassemblyJobs(filters);
  if (filters.active) {
    var today = getWorkDate();
    list = list.filter(function (j) {
      return j.status === 'pending' || j.status === 'in-progress' || (j.status === 'completed' && String(j.completedAt).indexOf(today) === 0);
    });
  }
  return { success: true, data: list };
}
