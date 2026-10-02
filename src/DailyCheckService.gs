/**
 * DailyCheckService.gs — ตรวจรายชั่วโมง (หัวข้อมาจาก LINE_CONFIG.DAILY_CHECK.ITEMS)
 */
function dailyCheckToObj(r) {
  return {
    checkId: String(r.CheckID), timestamp: r.Timestamp, date: r.Date, shift: r.Shift, shiftDN: r.ShiftDN,
    timePeriod: r.TimePeriod, machineId: String(r.MachineID), results: safeJson(r.Results, []),
    decision: r.Decision, remark: r.Remark || '', recordedBy: String(r.RecordedBy), recorderName: r.RecorderName,
    status: r.Status || 'active', updatedAt: r.UpdatedAt || '', updatedBy: r.UpdatedBy || ''
  };
}

function readDailyChecks(dateFrom, dateTo) {
  return getRowsSince('DailyCheckLog', 'Timestamp', addDays(dateFrom, -2)).map(dailyCheckToObj)
    .filter(function (c) { return c.status === 'active' && c.date >= dateFrom && c.date <= dateTo; });
}

function getDailyChecks(token, date) {
  requireLogin(token);
  date = date || getWorkDate();
  var dc = LINE_CONFIG.DAILY_CHECK;
  return {
    success: true,
    data: {
      date: date, title: dc.TITLE, sampleQty: dc.SAMPLE_QTY, items: dc.ITEMS, timePeriods: getTimePeriods(),
      checks: readDailyChecks(date, date), machines: getMachines().filter(function (m) { return m.installed; })
    }
  };
}

function submitDailyCheck(token, data) {
  var u = requirePermission(token, 'dailycheck');
  data = data || {};
  var items = LINE_CONFIG.DAILY_CHECK.ITEMS;
  if (!items.length) throw new Error('ยังไม่ได้ตั้งหัวข้อ Daily Check (Config.gs)');
  var date = data.date || getWorkDate();
  if (!isValidDateStr(date) || date > getWorkDate()) throw new Error('วันที่ไม่ถูกต้อง');
  if (!getMachine(data.machineId)) throw new Error('ไม่พบเครื่องจักร');
  if (getTimePeriods().indexOf(data.timePeriod) < 0) throw new Error('ช่วงเวลาไม่ถูกต้อง');
  var results = (data.results || []).map(function (r) { return r === 'NG' ? 'NG' : (r === 'OK' ? 'OK' : ''); });
  if (results.length !== items.length || results.indexOf('') >= 0) throw new Error('กรุณาตรวจให้ครบทุกหัวข้อ');
  var decision = results.indexOf('NG') >= 0 ? 'Reject' : 'Accept';
  if (decision === 'Reject' && !String(data.remark || '').trim()) throw new Error('Reject ต้องระบุหมายเหตุ');

  var existing = readDailyChecks(date, date).filter(function (c) {
    return c.machineId === String(data.machineId) && c.timePeriod === data.timePeriod;
  })[0];
  if (data.clientRequestId && existing && existing.checkId) {
    var raw = findRow('DailyCheckLog', 'CheckID', existing.checkId);
    if (raw && String(raw.ClientRequestID) === String(data.clientRequestId)) return { success: true, duplicate: true };
  }
  if (existing) {
    if (existing.recordedBy !== u.employeeId && roleLevel(u.role) < roleLevel('supervisor')) {
      throw new Error('ช่องนี้มีคนบันทึกแล้ว — แก้ไขได้เฉพาะผู้บันทึกหรือหัวหน้า');
    }
    updateRow('DailyCheckLog', 'CheckID', existing.checkId, {
      Results: JSON.stringify(results), Decision: decision, Remark: data.remark || '',
      UpdatedAt: formatDate(), UpdatedBy: u.name, ClientRequestID: data.clientRequestId || ''
    });
    return { success: true, updated: true, checkId: existing.checkId };
  }
  var id = makeId('DC');
  appendRow('DailyCheckLog', {
    CheckID: id, Timestamp: formatDate(), Date: date, Shift: data.shift || u.shift || '',
    ShiftDN: shiftFromPeriod(data.timePeriod), TimePeriod: data.timePeriod, MachineID: data.machineId,
    Results: JSON.stringify(results), Decision: decision, Remark: data.remark || '', RecordedBy: u.employeeId,
    RecorderName: u.name, Status: 'active', ClientRequestID: data.clientRequestId || '', UpdatedAt: '', UpdatedBy: ''
  });
  return { success: true, checkId: id };
}

function cancelDailyCheck(token, checkId) {
  var u = requireRole(token, 'supervisor');
  updateRow('DailyCheckLog', 'CheckID', checkId, { Status: 'cancelled', UpdatedAt: formatDate(), UpdatedBy: u.name });
  logAction(u, 'cancelDailyCheck', { checkId: checkId });
  return { success: true };
}

/** compliance = ช่องที่ตรวจ / ช่องที่ควรตรวจ (มี ProductionLog) */
function buildDailyCheckSummary(dateFrom, dateTo, productionRows) {
  var expected = {};
  (productionRows || readProductionRange(dateFrom, dateTo)).forEach(function (r) {
    if (r.status === 'cancelled' || r.status === 'sort-adjust') return;
    expected[r.date + '|' + r.machineId + '|' + r.timePeriod] = r;
  });
  var checks = readDailyChecks(dateFrom, dateTo);
  var checked = {};
  var byMachine = {}, byShift = {}, byDate = {};
  var accept = 0, reject = 0;
  checks.forEach(function (c) {
    checked[c.date + '|' + c.machineId + '|' + c.timePeriod] = c;
    if (c.decision === 'Accept') accept++; else reject++;
    [[byMachine, c.machineId], [byShift, c.shift || '-'], [byDate, c.date]].forEach(function (p) {
      var o = p[0][p[1]] = p[0][p[1]] || { accept: 0, reject: 0 };
      if (c.decision === 'Accept') o.accept++; else o.reject++;
    });
  });
  var keys = Object.keys(expected);
  var done = keys.filter(function (k) { return checked[k]; }).length;
  var missing = keys.filter(function (k) { return !checked[k]; }).slice(0, 100).map(function (k) {
    var p = k.split('|'); return { date: p[0], machineId: p[1], timePeriod: p[2] };
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
