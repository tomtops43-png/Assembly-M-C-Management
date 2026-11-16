/**
 * FiberUsageService.gs — เบิกไฟเบอร์ (ใบ "ยอดการใช้ไฟเบอร์ Cut Chamber ประจำวัน")
 * 1 รายการ = ไฟเบอร์ 1 ชุดที่เบิกไปใช้ที่เครื่อง: จำนวนม้วน (ตามเครื่อง) + น้ำหนักที่ชั่ง (หรือ "เศษ") + จำนวนงานที่ผลิตได้
 * จำนวนงานที่ผลิตได้ = พนักงานกรอกเอง (ลงหลายยอดได้ เช่น 8,000 + 1,500) — ระบบส่งยอดผลิตจาก ProductionLog ไปเป็นตัวช่วยเทียบ
 */
function fiberUsageConfig() { return LINE_CONFIG.FIBER_USAGE; }

function fiberUsageMachine(machineId) {
  var list = fiberUsageConfig().MACHINES || [];
  for (var i = 0; i < list.length; i++) if (list[i].id === String(machineId)) return list[i];
  return null;
}

function fiberUsageToObj(r) {
  return {
    usageId: String(r.UsageID), timestamp: r.Timestamp, date: r.Date, shiftDN: r.ShiftDN, machineId: String(r.MachineID),
    rolls: toNumber(r.Rolls), weight: r.Weight === '' || r.Weight === null ? null : toNumber(r.Weight), scrap: String(r.Scrap) === 'Y',
    qtys: safeJson(r.Qtys, []), totalQty: toNumber(r.TotalQty), remark: r.Remark || '',
    recordedBy: String(r.RecordedBy), recorderName: r.RecorderName || '', status: r.Status || 'active',
    updatedAt: r.UpdatedAt || '', updatedBy: r.UpdatedBy || ''
  };
}

function readFiberUsage(dateFrom, dateTo) {
  return getRowsSince('FiberUsage', 'Timestamp', addDays(dateFrom, -2)).map(fiberUsageToObj)
    .filter(function (x) { return x.status === 'active' && x.date >= dateFrom && x.date <= dateTo; });
}

/** ทั้งเดือนของวันที่เลือก + ยอดผลิตต่อ วัน|เครื่อง|กะ (ตัวช่วยเทียบตอนกรอก) */
function getFiberUsage(token, date) {
  requireLogin(token);
  date = isValidDateStr(date) ? date : getWorkDate();
  var from = getMonthStart(date);
  var to = addDays(getMonthStart(addDays(from, 32)), -1);
  var cfg = fiberUsageConfig();
  var ids = (cfg.MACHINES || []).map(function (m) { return m.id; });
  var produced = {};
  readProductionRange(from, to).forEach(function (r) {
    if (r.status === 'cancelled' || r.status === 'sort-adjust' || ids.indexOf(r.machineId) < 0) return;
    var k = r.date + '|' + r.machineId + '|' + r.shiftDN;
    produced[k] = (produced[k] || 0) + r.actualQty;
  });
  var names = {};
  getMachines().forEach(function (m) { names[m.machineId] = m.machineName; });
  return {
    success: true,
    data: {
      date: date, monthFrom: from, monthTo: to, title: cfg.TITLE, rowsPerPage: cfg.ROWS_PER_PAGE || 33,
      machines: (cfg.MACHINES || []).map(function (m) { return { machineId: m.id, label: m.label, rolls: m.rolls, machineName: names[m.id] || m.id }; }),
      rows: readFiberUsage(from, to), produced: produced
    }
  };
}

/** บันทึก / แก้ไข (มี usageId = แก้ไข) */
function saveFiberUsage(token, data) {
  var u = requirePermission(token, 'fiber');
  data = data || {};
  var date = data.date || getWorkDate();
  if (!isValidDateStr(date) || date > getWorkDate()) throw new Error('วันที่ไม่ถูกต้อง');
  var shiftDN = data.shiftDN;
  if (DC_SHIFTS.indexOf(shiftDN) < 0) throw new Error('กรุณาเลือกกะ');
  if (date === getWorkDate() && shiftDN === 'Night' && detectShift() === 'Day') throw new Error('ยังไม่ถึงกะดึก');
  var mc = fiberUsageMachine(data.machineId);
  if (!mc) throw new Error('เครื่องนี้ไม่ได้ลงเบิกไฟเบอร์');
  var rolls = toNumber(data.rolls, mc.rolls);
  if (!(rolls > 0)) throw new Error('จำนวนม้วนไม่ถูกต้อง');
  var scrap = !!data.scrap;
  var weight = scrap ? '' : toNumber(data.weight);
  if (!scrap && !(weight > 0)) throw new Error('กรุณากรอกน้ำหนัก (หรือเลือก "เศษ")');
  var qtys = (data.qtys || []).map(function (q) { return Math.round(toNumber(q)); }).filter(function (q) { return q > 0; });
  if (!qtys.length) throw new Error('กรุณากรอกจำนวนงานที่ผลิตได้');
  var total = qtys.reduce(function (a, b) { return a + b; }, 0);
  var fields = {
    Date: date, ShiftDN: shiftDN, MachineID: mc.id, Rolls: rolls, Weight: weight, Scrap: scrap ? 'Y' : '',
    Qtys: JSON.stringify(qtys), TotalQty: total, Remark: String(data.remark || '').trim()
  };

  if (data.usageId) {
    var cur = findRow('FiberUsage', 'UsageID', data.usageId);
    if (!cur || String(cur.Status || 'active') !== 'active') throw new Error('ไม่พบรายการ');
    if (String(cur.RecordedBy) !== u.employeeId && roleLevel(u.role) < roleLevel('supervisor')) throw new Error('แก้ไขได้เฉพาะผู้บันทึกหรือหัวหน้า');
    fields.UpdatedAt = formatDate(); fields.UpdatedBy = u.name;
    updateRow('FiberUsage', 'UsageID', data.usageId, fields);
    return { success: true, updated: true, usageId: String(data.usageId) };
  }
  if (data.clientRequestId) {
    var dup = getRowsSince('FiberUsage', 'Timestamp', addDays(getWorkDate(), -2)).filter(function (r) { return String(r.ClientRequestID) === String(data.clientRequestId); })[0];
    if (dup) return { success: true, duplicate: true, usageId: String(dup.UsageID) };
  }
  var id = makeId('FU', date);
  fields.UsageID = id; fields.Timestamp = formatDate(); fields.RecordedBy = u.employeeId; fields.RecorderName = u.name;
  fields.Status = 'active'; fields.ClientRequestID = data.clientRequestId || ''; fields.UpdatedAt = ''; fields.UpdatedBy = '';
  appendRow('FiberUsage', fields);
  return { success: true, usageId: id };
}

function cancelFiberUsage(token, usageId) {
  var u = requirePermission(token, 'fiber');
  var cur = findRow('FiberUsage', 'UsageID', usageId);
  if (!cur || String(cur.Status || 'active') !== 'active') throw new Error('ไม่พบรายการ');
  if (String(cur.RecordedBy) !== u.employeeId && roleLevel(u.role) < roleLevel('supervisor')) throw new Error('ลบได้เฉพาะผู้บันทึกหรือหัวหน้า');
  updateRow('FiberUsage', 'UsageID', usageId, { Status: 'cancelled', UpdatedAt: formatDate(), UpdatedBy: u.name });
  logAction(u, 'cancelFiberUsage', { usageId: usageId });
  return { success: true };
}
