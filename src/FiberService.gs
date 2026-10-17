/**
 * FiberService.gs — แท็กม้วนไฟเบอร์ + ระยะเวลาอบไล่ความชื้น
 *
 * วงจรของม้วน (FiberRolls.Status):
 *   drying   = อยู่ในตู้อบ (เข้าอบเมื่อ DryStart) → นำออกได้เมื่อครบ MIN_DRY_HOURS (ReadyAt)
 *   in_use   = นำออกไปใช้ที่เครื่องแล้ว — ใช้ได้ถึง ExpireAt (OutAt + MAX_OUT_HOURS) ; เลยเวลา = ต้องกลับไปอบใหม่
 *   finished = ใช้หมดม้วน
 * ม้วนที่ใช้ไม่หมด → "คืนเข้าอบ" = เริ่มนับเวลาอบใหม่ (Cycle + 1)
 */
function fiberConfig() { return LINE_CONFIG.FIBER_DRYING; }

function fiberMachineIds() { return fiberConfig().MACHINES || []; }

function fiberRollView(r, now) {
  now = now || Date.now();
  var readyAt = parseDate(r.ReadyAt), expireAt = parseDate(r.ExpireAt);
  var status = String(r.Status);
  var state = status;
  if (status === 'drying') state = readyAt && readyAt.getTime() <= now ? 'ready' : 'drying';
  if (status === 'in_use' && expireAt && expireAt.getTime() <= now) state = 'expired';
  return {
    rollId: String(r.RollID), partCode: String(r.PartCode || ''), lotNumber: String(r.LotNumber || ''), oven: String(r.Oven || ''),
    status: status, state: state, cycle: toNumber(r.Cycle, 1), machineId: String(r.MachineID || ''),
    dryStart: r.DryStart, readyAt: r.ReadyAt, outAt: r.OutAt, expireAt: r.ExpireAt, moisture: r.Moisture,
    readyAtMs: readyAt ? readyAt.getTime() : 0, expireAtMs: expireAt ? expireAt.getTime() : 0,
    createdAt: r.CreatedAt, updatedAt: r.UpdatedAt, updatedByName: r.UpdatedByName || '', remark: r.Remark || ''
  };
}

function getFiberRoll(rollId) {
  var id = String(rollId || '').trim().toUpperCase();
  if (!id) throw new Error('กรุณาระบุเลขแท็กม้วน');
  var r = findRow('FiberRolls', 'RollID', id);
  if (!r) throw new Error('ไม่พบแท็ก ' + id);
  return r;
}

function logFiber(u, rollId, action, cycle, extra) {
  extra = extra || {};
  appendRow('FiberLog', {
    LogID: makeId('FL'), Timestamp: formatDate(), RollID: rollId, Action: action, Cycle: cycle,
    MachineID: extra.machineId || '', Moisture: extra.moisture === undefined ? '' : extra.moisture,
    ByID: u.employeeId, ByName: u.name, Remark: extra.remark || ''
  });
}

function hoursFrom(d, h) { return formatDate(new Date(d.getTime() + h * 3600000)); }

/** ม้วนที่ยังไม่หมด (drying / in_use) + ม้วนที่จบใน 3 วันล่าสุด */
function getFiberRolls(token) {
  requireLogin(token);
  var now = Date.now();
  var cutoff = formatDate(new Date(now - 3 * 86400000));
  var list = getAllRows('FiberRolls').filter(function (r) {
    return r.Status !== 'finished' || String(r.UpdatedAt || '') >= cutoff;
  }).map(function (r) { return fiberRollView(r, now); });
  var c = fiberConfig();
  return {
    success: true, serverNow: now, data: list,
    config: { minDryHours: c.MIN_DRY_HOURS, maxOutHours: c.MAX_OUT_HOURS, maxMoisturePct: c.MAX_MOISTURE_PCT, machines: fiberMachineIds(), ovens: c.OVENS || [], blockProduction: !!c.BLOCK_PRODUCTION }
  };
}

function getFiberLog(token, rollId) {
  requireLogin(token);
  var id = String(rollId || '').trim().toUpperCase();
  return { success: true, data: getAllRows('FiberLog').filter(function (r) { return String(r.RollID) === id; }).map(function (r) {
    return { timestamp: r.Timestamp, action: r.Action, cycle: toNumber(r.Cycle, 1), machineId: String(r.MachineID || ''), moisture: r.Moisture, byName: r.ByName, remark: r.Remark };
  }) };
}

/** ลงทะเบียนม้วนใหม่ + เข้าตู้อบทันที → ได้เลขแท็ก */
function registerFiberRoll(token, d) {
  var u = requirePermission(token, 'fiber');
  d = d || {};
  var now = new Date();
  var id = makeId('FB');
  var start = d.dryStart ? parseDate(d.dryStart) : now;
  if (!start || start.getTime() > now.getTime() + 60000) throw new Error('เวลาเข้าอบไม่ถูกต้อง');
  appendRow('FiberRolls', {
    RollID: id, CreatedAt: formatDate(now), CreatedBy: u.employeeId, PartCode: String(d.partCode || '').trim(), LotNumber: String(d.lotNumber || '').trim(),
    Oven: String(d.oven || '').trim(), Status: 'drying', Cycle: 1, DryStart: formatDate(start), ReadyAt: hoursFrom(start, fiberConfig().MIN_DRY_HOURS),
    OutAt: '', ExpireAt: '', MachineID: '', Moisture: '', UpdatedAt: formatDate(now), UpdatedBy: u.employeeId, UpdatedByName: u.name, Remark: String(d.remark || '').trim()
  });
  logFiber(u, id, 'register', 1, { remark: d.remark });
  return { success: true, roll: fiberRollView(getFiberRoll(id)) };
}

/** นำออกจากตู้อบไปใช้ที่เครื่อง — ต้องอบครบเวลา (และความชื้นผ่าน ถ้ากำหนด) */
function issueFiberRoll(token, rollId, machineId, moisture) {
  var u = requirePermission(token, 'fiber');
  var r = getFiberRoll(rollId);
  var c = fiberConfig();
  if (r.Status !== 'drying') throw new Error('แท็ก ' + r.RollID + ' ไม่ได้อยู่ในตู้อบ (สถานะ: ' + fiberStatusLabel(r.Status) + ')');
  var now = new Date();
  var readyAt = parseDate(r.ReadyAt);
  if (!readyAt || readyAt.getTime() > now.getTime()) {
    var mins = readyAt ? Math.ceil((readyAt.getTime() - now.getTime()) / 60000) : 0;
    throw new Error('ยังอบไม่ครบเวลา — ห้ามนำไปผลิต (เหลืออีก ' + Math.floor(mins / 60) + ' ชม. ' + (mins % 60) + ' นาที)');
  }
  if (!getMachine(machineId)) throw new Error('กรุณาเลือกเครื่องจักร');
  var mo = String(moisture === undefined || moisture === null ? '' : moisture).trim();
  if (c.MAX_MOISTURE_PCT !== null && c.MAX_MOISTURE_PCT !== undefined) {
    if (mo === '') throw new Error('กรุณากรอกค่าความชื้นที่วัดได้');
    if (toNumber(mo) > c.MAX_MOISTURE_PCT) throw new Error('ความชื้น ' + mo + '% เกินเกณฑ์ ' + c.MAX_MOISTURE_PCT + '% — นำกลับเข้าอบต่อ');
  }
  updateRow('FiberRolls', 'RollID', r.RollID, {
    Status: 'in_use', OutAt: formatDate(now), ExpireAt: hoursFrom(now, c.MAX_OUT_HOURS), MachineID: machineId, Moisture: mo,
    UpdatedAt: formatDate(now), UpdatedBy: u.employeeId, UpdatedByName: u.name
  });
  logFiber(u, r.RollID, 'issue', toNumber(r.Cycle, 1), { machineId: machineId, moisture: mo });
  return { success: true, roll: fiberRollView(getFiberRoll(r.RollID)) };
}

/** ใช้ไม่หมดม้วน → คืนเข้าตู้อบ เริ่มนับเวลาอบใหม่ */
function returnFiberToOven(token, rollId, remark) {
  var u = requirePermission(token, 'fiber');
  var r = getFiberRoll(rollId);
  if (r.Status !== 'in_use') throw new Error('แท็ก ' + r.RollID + ' ไม่ได้อยู่ที่เครื่อง (สถานะ: ' + fiberStatusLabel(r.Status) + ')');
  var now = new Date();
  var cycle = toNumber(r.Cycle, 1) + 1;
  updateRow('FiberRolls', 'RollID', r.RollID, {
    Status: 'drying', Cycle: cycle, DryStart: formatDate(now), ReadyAt: hoursFrom(now, fiberConfig().MIN_DRY_HOURS),
    OutAt: '', ExpireAt: '', MachineID: '', Moisture: '', UpdatedAt: formatDate(now), UpdatedBy: u.employeeId, UpdatedByName: u.name
  });
  logFiber(u, r.RollID, 'return', cycle, { machineId: r.MachineID, remark: remark });
  return { success: true, roll: fiberRollView(getFiberRoll(r.RollID)) };
}

/** ใช้หมดม้วน */
function finishFiberRoll(token, rollId) {
  var u = requirePermission(token, 'fiber');
  var r = getFiberRoll(rollId);
  if (r.Status !== 'in_use') throw new Error('แท็ก ' + r.RollID + ' ไม่ได้อยู่ที่เครื่อง (สถานะ: ' + fiberStatusLabel(r.Status) + ')');
  updateRow('FiberRolls', 'RollID', r.RollID, { Status: 'finished', UpdatedAt: formatDate(), UpdatedBy: u.employeeId, UpdatedByName: u.name });
  logFiber(u, r.RollID, 'finish', toNumber(r.Cycle, 1), { machineId: r.MachineID });
  return { success: true };
}

function fiberStatusLabel(s) {
  return ({ drying: 'กำลังอบ', ready: 'อบครบแล้ว', in_use: 'ใช้งานที่เครื่อง', expired: 'เกินเวลา ต้องอบใหม่', finished: 'ใช้หมดแล้ว' })[s] || s;
}

/**
 * ใช้ตอนลงยอดผลิต: เครื่องที่ใช้ไฟเบอร์ต้องมีม้วนที่อบครบและยังไม่เกินเวลาอยู่ที่เครื่อง
 * (เปิดด้วย FIBER_DRYING.BLOCK_PRODUCTION) — throw ถ้าไม่ผ่าน
 */
function assertFiberReadyForProduction(machineId) {
  var c = fiberConfig();
  if (!c.BLOCK_PRODUCTION || fiberMachineIds().indexOf(String(machineId)) < 0) return;
  var now = Date.now();
  var rolls = getAllRows('FiberRolls').filter(function (r) { return r.Status === 'in_use' && String(r.MachineID) === String(machineId); })
    .map(function (r) { return fiberRollView(r, now); });
  if (rolls.some(function (r) { return r.state === 'in_use'; })) return;
  if (rolls.length) throw new Error('ไฟเบอร์ที่เครื่องนี้ (' + rolls.map(function (r) { return r.rollId; }).join(', ') + ') อยู่นอกตู้อบเกิน ' + c.MAX_OUT_HOURS + ' ชม. — ต้องนำกลับไปอบใหม่ก่อนผลิต (เมนู วัตถุดิบ > อบไฟเบอร์)');
  throw new Error('เครื่องนี้ยังไม่มีไฟเบอร์ที่อบครบเวลา — เบิกม้วนจากตู้อบก่อนผลิต (เมนู วัตถุดิบ > อบไฟเบอร์)');
}
