/**
 * FiberUsageService.gs — เบิกไฟเบอร์ (ใบ "ยอดการใช้ไฟเบอร์ Cut Chamber ประจำวัน")
 * 1 รายการ = ไฟเบอร์ 1 ชุดที่เบิกไปใช้ที่เครื่อง: จำนวนม้วน (ตามเครื่อง) + น้ำหนักที่ชั่ง (0.01–9.99 กก.) + จำนวนงานที่ผลิตได้
 * ขั้นตอน: ลงเบิกก่อน (ยังไม่มียอด = กำลังใช้) → ใช้หมดชุดแล้วค่อยมาลงจำนวนงานที่ผลิตได้
 * FIFO: ชุดของเครื่องเดียวกันต้องลงยอดตามลำดับที่เบิก (ชุดที่เบิกก่อนต้องลงยอดก่อน)
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
    productCode: String(r.ProductCode || ''), rolls: toNumber(r.Rolls), weight: r.Weight === '' || r.Weight === null ? null : toNumber(r.Weight), scrap: String(r.Scrap) === 'Y',
    qtys: safeJson(r.Qtys, []), totalQty: toNumber(r.TotalQty), remark: r.Remark || '',
    recordedBy: String(r.RecordedBy), recorderName: r.RecorderName || '', status: r.Status || 'active',
    updatedAt: r.UpdatedAt || '', updatedBy: r.UpdatedBy || ''
  };
}

/** ชุดที่ยังไม่ลงยอด (กำลังใช้) ย้อนหลัง 60 วัน เรียงตามลำดับที่เบิก (FIFO) */
function readPendingFiberUsage() {
  return getRowsSince('FiberUsage', 'Timestamp', addDays(getWorkDate(), -60)).map(fiberUsageToObj)
    .filter(function (x) { return x.status === 'active' && !x.totalQty; })
    .sort(function (a, b) { return String(a.timestamp) < String(b.timestamp) ? -1 : 1; });
}

/** ชุดที่เบิกก่อนหน้า (เครื่องเดียวกัน) ที่ยังไม่ลงยอด — ใช้บังคับ FIFO */
function olderPendingFiberUsage(machineId, timestamp, exceptId) {
  return readPendingFiberUsage().filter(function (x) {
    return x.machineId === String(machineId) && x.usageId !== String(exceptId || '') && (!timestamp || String(x.timestamp) < String(timestamp));
  })[0] || null;
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
    produced[k + '|' + r.productCode] = (produced[k + '|' + r.productCode] || 0) + r.actualQty; // แยกรุ่น (GV2 6/9 Plate)
  });
  var names = {}, cur = {};
  getMachines().forEach(function (m) { names[m.machineId] = m.machineName; cur[m.machineId] = m.currentProduct; });
  return {
    success: true,
    data: {
      date: date, monthFrom: from, monthTo: to, title: cfg.TITLE, rowsPerPage: cfg.ROWS_PER_PAGE || 33,
      machines: (cfg.MACHINES || []).map(function (m) { return { machineId: m.id, label: m.label, rolls: m.rolls, machineName: names[m.id] || m.id, variants: m.variants || [], currentProduct: cur[m.id] || '' }; }),
      rows: readFiberUsage(from, to), pending: readPendingFiberUsage(), produced: produced
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
  var productCode = String(data.productCode || '').trim();
  if (mc.variants && mc.variants.length) {
    if (!mc.variants.some(function (v) { return v.product === productCode; })) throw new Error('กรุณาเลือกรุ่น (' + mc.variants.map(function (v) { return v.name; }).join(' / ') + ')');
  } else productCode = '';
  var rolls = toNumber(data.rolls, mc.rolls);
  if (!(rolls > 0)) throw new Error('จำนวนม้วนไม่ถูกต้อง');
  var weight = Math.round(toNumber(data.weight) * 100) / 100;
  if (!(weight > 0 && weight < 10)) throw new Error('น้ำหนักต้องอยู่ระหว่าง 0.01–9.99 กก.');
  // จำนวนงานที่ผลิตได้ ใส่ทีหลังได้ (ว่าง = กำลังใช้)
  var qtys = (data.qtys || []).map(function (q) { return Math.round(toNumber(q)); }).filter(function (q) { return q > 0; });
  var total = qtys.reduce(function (a, b) { return a + b; }, 0);
  var fields = {
    Date: date, ShiftDN: shiftDN, MachineID: mc.id, ProductCode: productCode, Rolls: rolls, Weight: weight.toFixed(2), Scrap: '',
    Qtys: JSON.stringify(qtys), TotalQty: total, Remark: String(data.remark || '').trim()
  };

  if (data.usageId) {
    var cur = findRow('FiberUsage', 'UsageID', data.usageId);
    if (!cur || String(cur.Status || 'active') !== 'active') throw new Error('ไม่พบรายการ');
    if (String(cur.RecordedBy) !== u.employeeId && roleLevel(u.role) < roleLevel('supervisor')) throw new Error('แก้ไขได้เฉพาะผู้บันทึกหรือหัวหน้า');
    if (total && !toNumber(cur.TotalQty)) {
      var older = olderPendingFiberUsage(mc.id, cur.Timestamp, data.usageId);
      if (older) throw new Error('FIFO: ต้องลงยอดชุดที่เบิกก่อน (' + older.date + ' · ' + older.recorderName + ') ให้เสร็จก่อน');
    }
    fields.UpdatedAt = formatDate(); fields.UpdatedBy = u.name;
    updateRow('FiberUsage', 'UsageID', data.usageId, fields);
    return { success: true, updated: true, usageId: String(data.usageId) };
  }
  if (data.clientRequestId) {
    var dup = getRowsSince('FiberUsage', 'Timestamp', addDays(getWorkDate(), -2)).filter(function (r) { return String(r.ClientRequestID) === String(data.clientRequestId); })[0];
    if (dup) return { success: true, duplicate: true, usageId: String(dup.UsageID) };
  }
  if (total) {
    var older2 = olderPendingFiberUsage(mc.id, '', '');
    if (older2) throw new Error('FIFO: เครื่องนี้มีชุดที่เบิกก่อนยังไม่ลงยอด (' + older2.date + ' · ' + older2.recorderName + ') — ลงยอดชุดนั้นก่อน');
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
