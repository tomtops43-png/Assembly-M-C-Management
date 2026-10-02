/**
 * MachineService.gs — เครื่องจักร
 */
var MACHINE_STATUSES = ['running', 'maintenance', 'down'];

function splitList(s) {
  return String(s || '').split(',').map(function (x) { return x.trim(); }).filter(String);
}

function machineToObj(m) {
  return {
    machineId: String(m.MachineID), machineName: m.MachineName, line: m.Line, status: m.Status || 'running',
    assignedProducts: splitList(m.AssignedProducts), currentProduct: String(m.CurrentProduct || ''),
    currentJobOrder: String(m.CurrentJobOrder || ''), capacity: toNumber(m.Capacity),
    installed: m.Installed === '' || m.Installed === undefined ? true : isActiveValue(m.Installed)
  };
}

function getMachines() {
  return getMasterData().machines.map(machineToObj)
    .sort(function (a, b) { return a.machineId.localeCompare(b.machineId, undefined, { numeric: true }); });
}

function getMachine(machineId) {
  var list = getMachines();
  for (var i = 0; i < list.length; i++) if (list[i].machineId === String(machineId)) return list[i];
  return null;
}

function getMachineProducts(machineId) {
  var m = getMachine(machineId);
  if (!m) return [];
  var products = getProducts();
  return products.filter(function (p) { return m.assignedProducts.indexOf(p.productCode) >= 0; });
}

function getMachineWithStats(token, machineId) {
  requireLogin(token);
  var m = getMachine(machineId);
  if (!m) throw new Error('ไม่พบเครื่องจักร');
  var today = getWorkDate();
  var logs = getRowsSince('ProductionLog', 'Timestamp', addDays(today, -1)).filter(function (r) {
    return String(r.MachineID) === m.machineId && r.Date === today && r.Status !== 'cancelled';
  });
  var tickets = getAllRows('MaintenanceLog').filter(function (t) {
    return String(t.MachineID) === m.machineId && (t.Status === 'open' || t.Status === 'in-progress');
  });
  m.todayActual = logs.reduce(function (s, r) { return s + toNumber(r.ActualQty); }, 0);
  m.todayDefect = logs.reduce(function (s, r) { return s + toNumber(r.DefectQty); }, 0);
  m.todayEntries = logs.length;
  m.openTickets = tickets.length;
  return { success: true, data: m };
}

function updateMachineStatus(token, machineId, status) {
  requireLogin(token);
  if (MACHINE_STATUSES.indexOf(status) < 0) throw new Error('สถานะไม่ถูกต้อง');
  if (!updateRow('Machines', 'MachineID', machineId, { Status: status })) throw new Error('ไม่พบเครื่องจักร');
  return { success: true };
}

function updateMachineCapacity(token, machineId, capacity) {
  requireRole(token, 'admin');
  updateRow('Machines', 'MachineID', machineId, { Capacity: toNumber(capacity) });
  return { success: true };
}

function updateMachineInstalled(token, machineId, installed) {
  requireRole(token, 'admin');
  updateRow('Machines', 'MachineID', machineId, { Installed: !!installed });
  return { success: true };
}

/** admin: เพิ่ม/แก้ไขเครื่อง (ไลน์ใหม่ยังไม่มี seed จึงเพิ่มผ่านหน้า จัดการ ได้) */
function saveMachine(token, d) {
  var u = requireRole(token, 'admin');
  var id = String(d.machineId || '').trim().toUpperCase();
  if (!id || !d.machineName) throw new Error('กรุณากรอกรหัสและชื่อเครื่อง');
  var exists = findRow('Machines', 'MachineID', id);
  if (exists) {
    updateRow('Machines', 'MachineID', id, {
      MachineName: d.machineName, Capacity: toNumber(d.capacity), Installed: d.installed !== false
    });
  } else {
    appendRow('Machines', {
      MachineID: id, MachineName: d.machineName, Line: LINE_CONFIG.LINE_CODE, Status: 'running',
      AssignedProducts: '', CurrentProduct: '', Capacity: toNumber(d.capacity), CurrentJobOrder: '',
      Installed: d.installed !== false
    });
  }
  logAction(u, exists ? 'updateMachine' : 'addMachine', { machineId: id });
  return { success: true };
}

function deleteMachine(token, machineId) {
  var u = requireRole(token, 'admin');
  deleteRow('Machines', 'MachineID', machineId);
  logAction(u, 'deleteMachine', { machineId: machineId });
  return { success: true };
}

function assignProductToMachine(token, machineId, productCode) {
  requireRole(token, 'supervisor');
  var m = getMachine(machineId);
  if (!m) throw new Error('ไม่พบเครื่องจักร');
  if (m.assignedProducts.indexOf(productCode) < 0) m.assignedProducts.push(productCode);
  updateRow('Machines', 'MachineID', machineId, { AssignedProducts: m.assignedProducts.join(', ') });
  return { success: true };
}

function removeProductFromMachine(token, machineId, productCode) {
  requireRole(token, 'supervisor');
  var m = getMachine(machineId);
  if (!m) throw new Error('ไม่พบเครื่องจักร');
  var list = m.assignedProducts.filter(function (p) { return p !== productCode; });
  var upd = { AssignedProducts: list.join(', ') };
  if (m.currentProduct === productCode) { upd.CurrentProduct = ''; upd.CurrentJobOrder = ''; }
  updateRow('Machines', 'MachineID', machineId, upd);
  return { success: true };
}

function setCurrentProduct(token, machineId, productCode) {
  var u = requireLogin(token);
  var m = getMachine(machineId);
  if (!m) throw new Error('ไม่พบเครื่องจักร');
  if (productCode && m.assignedProducts.indexOf(productCode) < 0) throw new Error('สินค้านี้ไม่ได้ assign ให้เครื่องนี้');
  var upd = { CurrentProduct: productCode || '' };
  if (productCode !== m.currentProduct) upd.CurrentJobOrder = ''; // เปลี่ยนสินค้า = ล้าง JO
  updateRow('Machines', 'MachineID', machineId, upd);
  logAction(u, 'setCurrentProduct', { machineId: machineId, productCode: productCode });
  return { success: true };
}

function setCurrentJobOrder(token, machineId, jobOrderId) {
  var u = requireLogin(token);
  var m = getMachine(machineId);
  if (!m) throw new Error('ไม่พบเครื่องจักร');
  if (jobOrderId) {
    if (!m.currentProduct) throw new Error('กรุณาตั้งสินค้าก่อนเลือก Job Order');
    var jo = findRow('JobOrders', 'JobOrderID', jobOrderId);
    if (!jo) throw new Error('ไม่พบ Job Order');
    if (['open', 'in-progress'].indexOf(jo.Status) < 0) throw new Error('Job Order ไม่อยู่ในสถานะใช้งาน');
    if (String(jo.ProductCode) !== m.currentProduct) throw new Error('สินค้าของ Job Order ไม่ตรงกับเครื่อง');
    if (jo.MachineID !== 'ALL' && String(jo.MachineID) !== m.machineId) throw new Error('Job Order นี้ไม่ใช่ของเครื่องนี้');
  }
  updateRow('Machines', 'MachineID', machineId, { CurrentJobOrder: jobOrderId || '' });
  logAction(u, 'setCurrentJobOrder', { machineId: machineId, jobOrderId: jobOrderId });
  return { success: true };
}

/** คำนวณสถานะเครื่องใหม่จาก ticket ที่ยังเปิดอยู่ */
function recomputeMachineStatus(machineId) {
  var open = getAllRows('MaintenanceLog').filter(function (t) {
    return String(t.MachineID) === String(machineId) && (t.Status === 'open' || t.Status === 'in-progress');
  });
  var status = 'running';
  if (open.some(function (t) { return t.Priority === 'high' || t.Priority === 'critical'; })) status = 'down';
  else if (open.length) status = 'maintenance';
  updateRow('Machines', 'MachineID', machineId, { Status: status });
  return status;
}
