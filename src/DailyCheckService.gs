/**
 * DailyCheckService.gs — ใบตรวจประจำกะ (Daily Check เครื่องจักร + Check Witness) ตรวจกะละครั้ง: กะเช้า / กะดึก
 * แบบฟอร์ม: LINE_CONFIG.DAILY_CHECK.FORMS (1 เครื่องมีได้หลายใบ) ; ผลแต่ละหัวข้อ OK (√) / NG (X)
 */
var DC_SHIFTS = ['Day', 'Night'];

/** ทุกฟอร์มของเครื่อง (ตามลำดับใน Config) */
function dailyCheckFormsFor(machineId) {
  return (LINE_CONFIG.DAILY_CHECK.FORMS || []).filter(function (f) { return f.machines.indexOf(String(machineId)) >= 0; });
}

/** ฟอร์มแรกของเครื่อง (ใช้กับแถวเก่าที่ยังไม่มี FormID) */
function dailyCheckFormFor(machineId) {
  return dailyCheckFormsFor(machineId)[0] || null;
}

function dailyCheckFormById(machineId, formId) {
  var forms = dailyCheckFormsFor(machineId);
  if (!formId) return forms[0] || null;
  for (var i = 0; i < forms.length; i++) if (forms[i].id === String(formId)) return forms[i];
  return null;
}

/** ฟอร์มที่ต้องตรวจเมื่อผลิตรุ่นนี้ (form.products ว่าง = ทุกรุ่น) */
function dailyCheckFormsForProduct(machineId, productCode) {
  return dailyCheckFormsFor(machineId).filter(function (f) {
    return !f.products || !f.products.length || f.products.indexOf(String(productCode)) >= 0;
  });
}

function dailyCheckToObj(r) {
  return {
    checkId: String(r.CheckID), timestamp: r.Timestamp, date: r.Date, shift: r.Shift,
    shiftDN: r.ShiftDN || shiftFromPeriod(r.TimePeriod), machineId: String(r.MachineID),
    formId: String(r.FormID || '') || ((dailyCheckFormFor(r.MachineID) || {}).id || ''),
    results: safeJson(r.Results, []), decision: r.Decision, remark: r.Remark || '',
    recordedBy: String(r.RecordedBy), recorderName: r.RecorderName, status: r.Status || 'active',
    updatedAt: r.UpdatedAt || '', updatedBy: r.UpdatedBy || '', verifiedBy: r.VerifiedBy || '', verifiedAt: r.VerifiedAt || ''
  };
}

function readDailyChecks(dateFrom, dateTo) {
  return getRowsSince('DailyCheckLog', 'Timestamp', addDays(dateFrom, -2)).map(dailyCheckToObj)
    .filter(function (c) { return c.status === 'active' && c.date >= dateFrom && c.date <= dateTo; });
}

/** ข้อมูลทั้งเดือนของวันที่เลือก (ใช้แสดงใบแบบกระดาษ 1–31) */
function getDailyChecks(token, date) {
  requireLogin(token);
  date = isValidDateStr(date) ? date : getWorkDate();
  var from = getMonthStart(date);
  var to = addDays(getMonthStart(addDays(from, 32)), -1);
  var dc = LINE_CONFIG.DAILY_CHECK;
  return {
    success: true,
    data: {
      date: date, monthFrom: from, monthTo: to, title: dc.TITLE, forms: dc.FORMS || [], shifts: DC_SHIFTS,
      checks: readDailyChecks(from, to), machines: getMachines().filter(function (m) { return m.installed; })
    }
  };
}

function submitDailyCheck(token, data) {
  var u = requirePermission(token, 'dailycheck');
  data = data || {};
  var date = data.date || getWorkDate();
  if (!isValidDateStr(date) || date > getWorkDate()) throw new Error('วันที่ไม่ถูกต้อง');
  if (!getMachine(data.machineId)) throw new Error('ไม่พบเครื่องจักร');
  var form = dailyCheckFormById(data.machineId, data.formId);
  if (!form) throw new Error(data.formId ? 'ไม่พบแบบฟอร์มของเครื่องนี้' : 'เครื่องนี้ยังไม่มีหัวข้อ Daily Check');
  var shiftDN = data.shiftDN;
  if (DC_SHIFTS.indexOf(shiftDN) < 0) throw new Error('กรุณาเลือกกะ');
  if (date === getWorkDate() && shiftDN === 'Night' && detectShift() === 'Day') throw new Error('ยังไม่ถึงกะดึก');
  var results = (data.results || []).map(function (r) { return r === 'NG' ? 'NG' : (r === 'OK' ? 'OK' : ''); });
  if (results.length !== form.items.length || results.indexOf('') >= 0) throw new Error('กรุณาตรวจให้ครบทุกหัวข้อ');
  var decision = results.indexOf('NG') >= 0 ? 'Reject' : 'Accept';
  if (decision === 'Reject' && !String(data.remark || '').trim()) throw new Error('มีข้อที่ไม่ผ่าน ต้องระบุหมายเหตุ');

  var existing = readDailyChecks(date, date).filter(function (c) {
    return c.machineId === String(data.machineId) && c.shiftDN === shiftDN && c.formId === form.id;
  })[0];
  if (data.clientRequestId && existing && existing.checkId) {
    var raw = findRow('DailyCheckLog', 'CheckID', existing.checkId);
    if (raw && String(raw.ClientRequestID) === String(data.clientRequestId)) return { success: true, duplicate: true };
  }
  if (existing) {
    if (existing.recordedBy !== u.employeeId && roleLevel(u.role) < roleLevel('supervisor')) {
      throw new Error('กะนี้มีคนบันทึกแล้ว — แก้ไขได้เฉพาะผู้บันทึกหรือหัวหน้า');
    }
    updateRow('DailyCheckLog', 'CheckID', existing.checkId, {
      Results: JSON.stringify(results), Decision: decision, Remark: data.remark || '', FormID: form.id,
      UpdatedAt: formatDate(), UpdatedBy: u.name, ClientRequestID: data.clientRequestId || '',
      VerifiedBy: '', VerifiedAt: '' // แก้ผลแล้วต้องยืนยันใหม่
    });
    return { success: true, updated: true, checkId: existing.checkId };
  }
  var id = makeId('DC');
  appendRow('DailyCheckLog', {
    CheckID: id, Timestamp: formatDate(), Date: date, Shift: shiftDN,
    ShiftDN: shiftDN, TimePeriod: shiftDN, MachineID: data.machineId, FormID: form.id,
    Results: JSON.stringify(results), Decision: decision, Remark: data.remark || '', RecordedBy: u.employeeId,
    RecorderName: u.name, Status: 'active', ClientRequestID: data.clientRequestId || '', UpdatedAt: '', UpdatedBy: ''
  });
  return { success: true, checkId: id };
}

/** หัวหน้ายืนยันการตรวจสอบ (แถว "ยืนยันการตรวจสอบ" ในใบกระดาษ) */
function verifyDailyCheck(token, checkId) {
  var u = requireRole(token, 'supervisor');
  if (!updateRow('DailyCheckLog', 'CheckID', checkId, { VerifiedBy: u.name, VerifiedAt: formatDate() })) throw new Error('ไม่พบรายการ');
  return { success: true };
}

function cancelDailyCheck(token, checkId) {
  var u = requireRole(token, 'supervisor');
  updateRow('DailyCheckLog', 'CheckID', checkId, { Status: 'cancelled', UpdatedAt: formatDate(), UpdatedBy: u.name });
  logAction(u, 'cancelDailyCheck', { checkId: checkId });
  return { success: true };
}

/** compliance = ใบที่ตรวจ / ใบที่ควรตรวจ (มี ProductionLog ในกะนั้น × ฟอร์มที่ใช้กับเครื่อง/รุ่นนั้น) */
function buildDailyCheckSummary(dateFrom, dateTo, productionRows) {
  var expected = {};
  (productionRows || readProductionRange(dateFrom, dateTo)).forEach(function (r) {
    if (r.status === 'cancelled' || r.status === 'sort-adjust') return;
    dailyCheckFormsForProduct(r.machineId, r.productCode).forEach(function (f) {
      expected[r.date + '|' + r.machineId + '|' + r.shiftDN + '|' + f.id] = r;
    });
  });
  var checks = readDailyChecks(dateFrom, dateTo);
  var checked = {};
  var byMachine = {}, byShift = {}, byDate = {};
  var accept = 0, reject = 0;
  checks.forEach(function (c) {
    checked[c.date + '|' + c.machineId + '|' + c.shiftDN + '|' + c.formId] = c;
    if (c.decision === 'Accept') accept++; else reject++;
    [[byMachine, c.machineId], [byShift, c.shiftDN || '-'], [byDate, c.date]].forEach(function (p) {
      var o = p[0][p[1]] = p[0][p[1]] || { accept: 0, reject: 0 };
      if (c.decision === 'Accept') o.accept++; else o.reject++;
    });
  });
  var keys = Object.keys(expected);
  var done = keys.filter(function (k) { return checked[k]; }).length;
  var missing = keys.filter(function (k) { return !checked[k]; }).slice(0, 100).map(function (k) {
    var p = k.split('|'), f = dailyCheckFormById(p[1], p[3]) || {};
    return { date: p[0], machineId: p[1], shiftDN: p[2], formId: p[3], formTab: f.tab || '' };
  });
  return {
    expected: keys.length, checked: done, compliance: keys.length ? Math.round(done / keys.length * 1000) / 10 : null,
    accept: accept, reject: reject, byMachine: byMachine, byShift: byShift, byDate: byDate,
    rejects: checks.filter(function (c) { return c.decision === 'Reject'; }).slice(-50), missing: missing
  };
}

function getDailyCheckSummary(token, dateFrom, dateTo) {
  requireLogin(token);
  dateFrom = dateFrom || getWorkDate(); dateTo = dateTo || dateFrom;
  return { success: true, data: buildDailyCheckSummary(dateFrom, dateTo) };
}
