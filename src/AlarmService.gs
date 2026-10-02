/**
 * AlarmService.gs — สถิติ Alarm
 */
function getAlarmTypes(token) {
  requireLogin(token);
  var list = getAllRows('AlarmTypes').filter(function (t) { return isActiveValue(t.Active); })
    .map(function (t) { return { typeId: t.TypeID, typeName: t.TypeName }; });
  return { success: true, data: list };
}

function addAlarmType(token, typeName) {
  var u = requireLogin(token);
  typeName = String(typeName || '').trim();
  if (!typeName) throw new Error('กรุณากรอกชื่อชนิด Alarm');
  var dup = getAllRows('AlarmTypes').filter(function (t) { return t.TypeName === typeName && isActiveValue(t.Active); });
  if (dup.length) throw new Error('มีชนิดนี้แล้ว');
  appendRow('AlarmTypes', { TypeID: makeTypeId('AT'), TypeName: typeName, Active: true, CreatedAt: formatDate(), CreatedBy: u.name });
  return { success: true };
}

function deleteAlarmType(token, typeId) {
  requireLogin(token);
  updateRow('AlarmTypes', 'TypeID', typeId, { Active: false });
  return { success: true };
}

function alarmToObj(r) {
  return {
    alarmId: r.AlarmID, timestamp: r.Timestamp, date: r.Date, shift: r.Shift, machineId: String(r.MachineID),
    alarmType: r.AlarmType, count: toNumber(r.Count, 1), durationMinutes: toNumber(r.DurationMinutes),
    recordedBy: r.RecordedBy, recorderName: r.RecorderName, remark: r.Remark || ''
  };
}

function buildAlarmRow(u, d) {
  if (!getMachine(d.machineId)) throw new Error('ไม่พบเครื่องจักร');
  if (!d.alarmType) throw new Error('กรุณาเลือกชนิด Alarm');
  var at = parseDate(d.recordedAt) || new Date();
  return {
    AlarmID: makeId('AL'), Timestamp: formatDate(at), Date: getWorkDate(at), Shift: detectShift(at),
    MachineID: d.machineId, AlarmType: d.alarmType, Count: Math.max(1, toNumber(d.count, 1)),
    DurationMinutes: toNumber(d.durationMinutes), RecordedBy: u.employeeId, RecorderName: u.name, Remark: d.remark || ''
  };
}

function submitAlarm(token, data) {
  var u = requirePermission(token, 'alarm');
  appendRow('AlarmLog', buildAlarmRow(u, data || {}));
  return { success: true };
}

function submitAlarmBatch(token, items) {
  var u = requirePermission(token, 'alarm');
  var rows = (items || []).map(function (d) { return buildAlarmRow(u, d); });
  rows.forEach(function (r) { appendRow('AlarmLog', r); });
  return { success: true, count: rows.length };
}

function queryAlarms(f) {
  f = f || {};
  var from = f.dateFrom || addDays(getWorkDate(), -7), to = f.dateTo || getWorkDate();
  return getRowsSince('AlarmLog', 'Timestamp', addDays(from, -2)).map(alarmToObj).filter(function (r) {
    if (r.date < from || r.date > to) return false;
    if (f.machineId && r.machineId !== f.machineId) return false;
    if (f.alarmType && r.alarmType !== f.alarmType) return false;
    if (f.shift && r.shift !== f.shift) return false;
    return true;
  });
}

function getAlarmHistory(token, filters) {
  requireLogin(token);
  return { success: true, data: queryAlarms(filters).reverse() };
}

function getTodayAlarms(token) {
  var d = getWorkDate();
  return getAlarmHistory(token, { dateFrom: d, dateTo: d });
}

function getAlarmStats(token, filters) {
  requireLogin(token);
  var rows = queryAlarms(filters);
  var total = 0, downtime = 0, byType = {}, byMachine = {}, byDate = {}, byShift = {};
  rows.forEach(function (r) {
    total += r.count; downtime += r.durationMinutes;
    [[byType, r.alarmType], [byMachine, r.machineId], [byDate, r.date], [byShift, r.shift]].forEach(function (p) {
      var o = p[0][p[1]] = p[0][p[1]] || { count: 0, downtime: 0 };
      o.count += r.count; o.downtime += r.durationMinutes;
    });
  });
  var types = Object.keys(byType).map(function (k) {
    return { alarmType: k, count: byType[k].count, downtime: byType[k].downtime, pct: total ? Math.round(byType[k].count / total * 1000) / 10 : 0 };
  }).sort(function (a, b) { return b.count - a.count; });
  return { success: true, data: { totalAlarms: total, totalDowntime: downtime, byType: types, byMachine: byMachine, byDate: byDate, byShift: byShift } };
}
