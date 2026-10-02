/**
 * Code.gs — API Router (doGet/doPost) + initializeSystem + seed
 */
function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function ok(data) { return { success: true, data: data }; }

function parseParam(v, def) { return safeJson(v, v === undefined ? def : v); }

// ---------- READ actions: (p = e.parameter) ----------
var READ_ACTIONS = {
  getLineConfig: function () { return ok(getPublicLineConfig()); },
  getMachines: function () { return ok(getMachines()); },
  getMachineProducts: function (p) { return ok(getMachineProducts(p.machineId)); },
  getMasterDataVersion: function () { return { success: true, version: getMasterDataVersion() }; },
  getMachineWithStats: function (p) { return getMachineWithStats(p.token, p.machineId); },
  getProducts: function (p) { return ok(getProducts(p.includeInactive === 'true')); },
  getProductBOM: function (p) { return ok(getProductBOM(p.productCode)); },
  getAllProductsWithBOM: function (p) { return ok(getAllProductsWithBOM(p.includeInactive === 'true')); },
  getMaterialAliases: function (p) { requireLogin(p.token); return ok(getMaterialAliases()); },
  getOpenTickets: function (p) { return getOpenTickets(p.token); },
  getMaintenanceHistory: function (p) { return getMaintenanceHistory(p.token, parseParam(p.filters, {})); },
  getMaintenanceSymptoms: function (p) { return getMaintenanceSymptoms(p.token); },
  getProductionHistory: function (p) { return getProductionHistory(p.token, parseParam(p.filters, {})); },
  getTodayProductionByEmployee: function (p) { return getTodayProductionByEmployee(p.token); },
  getRecentProductionByEmployee: function (p) { return getRecentProductionByEmployee(p.token, p.days); },
  getProductionFormData: function (p) { return getProductionFormData(p.token, parseParam(p.filters, {}), p.include); },
  getEditableProductionEntries: function (p) { return getEditableProductionEntries(p.token, parseParam(p.filters, {})); },
  getJobOrderOptions: function (p) { return getJobOrderOptions(p.token, parseParam(p.filters, {})); },
  getMachineJobOrderProgress: function (p) { return getMachineJobOrderProgress(p.token); },
  getJobOrderProgress: function (p) { return getJobOrderProgress(p.token, p.jobOrderId); },
  getJobOrders: function (p) { return getJobOrders(p.token, parseParam(p.filters, {})); },
  getInbox: function (p) { return getInbox(p.token); },
  getActionLogs: function (p) { return getActionLogs(p.token, p.limit); },
  getDashboardData: function (p) { return getDashboardData(p.token, p.dateRange, p.shiftAB, p.shiftDN, p.productCode, p.jobOrderId); },
  getSortedProductionData: function (p) { return getSortedProductionData(p.token, p.sortField, p.sortOrder, p.filters); },
  exportProductionCSV: function (p) { return exportProductionCSV(p.token, p.dateFrom, p.dateTo); },
  exportQCDefectCSV: function (p) { return exportQCDefectCSV(p.token, p.dateFrom, p.dateTo, p.dateMode, p.timeFrom, p.timeTo); },
  getAllUsers: function (p) { return getAllUsers(p.token); },
  validateSession: function (p) { return validateSession(p.token); },
  getTodayRawMaterials: function (p) { return getTodayRawMaterials(p.token); },
  getRawMaterialHistory: function (p) { return getRawMaterialHistory(p.token, parseParam(p.filters, {})); },
  validateRawMaterial: function (p) { return validateRawMaterial(p.machineId, p.partCode, p.partName); },
  getWasteTypes: function (p) { return getWasteTypes(p.token); },
  getTodayWaste: function (p) { return getTodayWaste(p.token); },
  getWasteHistory: function (p) { return getWasteHistory(p.token, parseParam(p.filters, {})); },
  getTodaySortingJobs: function (p) { return getTodaySortingJobs(p.token); },
  getSortingJobs: function (p) { return getSortingJobs(p.token, parseParam(p.filters, {})); },
  getSortingDashboard: function (p) { return getSortingDashboard(p.token, parseParam(p.filters, {})); },
  getAlarmTypes: function (p) { return getAlarmTypes(p.token); },
  getTodayAlarms: function (p) { return getTodayAlarms(p.token); },
  getAlarmHistory: function (p) { return getAlarmHistory(p.token, parseParam(p.filters, {})); },
  getAlarmStats: function (p) { return getAlarmStats(p.token, parseParam(p.filters, {})); },
  getDailyChecks: function (p) { return getDailyChecks(p.token, p.date); },
  getDailyCheckSummary: function (p) { return getDailyCheckSummary(p.token, p.dateFrom, p.dateTo); },
  getCostPL: function (p) { return getCostPL(p.token); },
  getCostDashboard: function (p) { return getCostDashboard(p.token); },
  getPositions: function (p) { return getPositions(p.token); },
  getLaborEmployees: function (p) { return getLaborEmployees(p.token); },
  getLaborMonthlyReport: function (p) { return getLaborMonthlyReport(p.token); }
};

// ---------- WRITE actions: (b = body) ----------
var WRITE_ACTIONS = {
  login: function (b) { return login(b.employeeId, b.pin); },
  logout: function (b) { return logout(b.token); },
  submitProduction: function (b) { return submitProduction(b.token, b.data); },
  cancelProduction: function (b) { return cancelProduction(b.token, b.logId); },
  updateProductionEntry: function (b) { return updateProductionEntry(b.token, b.logId, b.updates); },
  requestDeleteProduction: function (b) { return requestDeleteProduction(b.token, b.logId, b.reason); },
  markInboxRead: function (b) { return markInboxRead(b.token, b.inboxId); },
  submitMaintenanceTicket: function (b) { return submitMaintenanceTicket(b.token, b.data); },
  updateMaintenanceTicket: function (b) { return updateMaintenanceTicket(b.token, b.ticketId, b.updates); },
  deleteMaintenanceTicket: function (b) { return deleteMaintenanceTicket(b.token, b.ticketId); },
  updateTicketStatus: function (b) { return updateTicketStatus(b.token, b.ticketId, b.status, b.resolution, b.photos, b.resolveTime); },
  backfillMaintenanceShiftAB: function (b) { return backfillMaintenanceShiftAB(b.token); },
  updateMachineStatus: function (b) { return updateMachineStatus(b.token, b.machineId, b.status); },
  updateMachineCapacity: function (b) { return updateMachineCapacity(b.token, b.machineId, b.capacity); },
  updateMachineInstalled: function (b) { return updateMachineInstalled(b.token, b.machineId, b.installed); },
  saveMachine: function (b) { return saveMachine(b.token, b.data); },
  deleteMachine: function (b) { return deleteMachine(b.token, b.machineId); },
  addUser: function (b) { return addUser(b.token, b.userData); },
  updateUser: function (b) { return updateUser(b.token, b.employeeId, b.updates); },
  assignProductToMachine: function (b) { return assignProductToMachine(b.token, b.machineId, b.productCode); },
  removeProductFromMachine: function (b) { return removeProductFromMachine(b.token, b.machineId, b.productCode); },
  setCurrentProduct: function (b) { return setCurrentProduct(b.token, b.machineId, b.productCode); },
  setCurrentJobOrder: function (b) { return setCurrentJobOrder(b.token, b.machineId, b.jobOrderId); },
  saveProduct: function (b) { return saveProduct(b.token, b.data); },
  saveProductBOM: function (b) { return saveProductBOM(b.token, b.productCode, b.components); },
  saveMaterialAlias: function (b) { return saveMaterialAlias(b.token, b.data); },
  deleteMaterialAlias: function (b) { return deleteMaterialAlias(b.token, b.alias); },
  createJobOrder: function (b) { return createJobOrder(b.token, b.data); },
  updateJobOrder: function (b) { return updateJobOrder(b.token, b.jobOrderId, b.updates); },
  submitRawMaterial: function (b) { return submitRawMaterial(b.token, b.data); },
  ocrWithDrive: function (b) { return ocrWithDrive(b.token, b.data); },
  updateProductUnitPrice: function (b) { return updateProductUnitPrice(b.token, b.productCode, b.unitPrice); },
  submitWaste: function (b) { return submitWaste(b.token, b.data); },
  addWasteType: function (b) { return addWasteType(b.token, b.typeName); },
  deleteWasteType: function (b) { return deleteWasteType(b.token, b.typeId); },
  submitSortingJob: function (b) { return submitSortingJob(b.token, b.data); },
  updateSortingJob: function (b) { return updateSortingJob(b.token, b.jobId, b.updates); },
  recordSortingResult: function (b) { return recordSortingResult(b.token, b.jobId, b.result); },
  pullSortingJob: function (b) { return pullSortingJob(b.token, b.jobId); },
  returnSortingJob: function (b) { return returnSortingJob(b.token, b.jobId); },
  submitAlarm: function (b) { return submitAlarm(b.token, b.data); },
  submitAlarmBatch: function (b) { return submitAlarmBatch(b.token, b.items); },
  addAlarmType: function (b) { return addAlarmType(b.token, b.typeName); },
  deleteAlarmType: function (b) { return deleteAlarmType(b.token, b.typeId); },
  submitDailyCheck: function (b) { return submitDailyCheck(b.token, b.data); },
  cancelDailyCheck: function (b) { return cancelDailyCheck(b.token, b.checkId); },
  saveCostPL: function (b) { return saveCostPL(b.token); }
};

function runAction(table, name, arg) {
  var fn = table[name];
  if (!fn) return { success: false, message: 'Unknown action: ' + name };
  try {
    return fn(arg);
  } catch (err) {
    console.warn(name + ': ' + (err && err.message || err));
    return { success: false, message: String(err && err.message || err) };
  }
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.payload) {
    var body;
    try { body = JSON.parse(p.payload); } catch (err) { return jsonOut({ success: false, message: 'payload ไม่ถูกต้อง' }); }
    return jsonOut(handlePostAction(body));
  }
  if (!p.action) return jsonOut({ success: true, message: LINE_CONFIG.LINE_NAME + ' API' });
  return jsonOut(runAction(READ_ACTIONS, p.action, p));
}

function doPost(e) {
  var body;
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
  catch (err) { return jsonOut({ success: false, message: 'body ไม่ถูกต้อง' }); }
  return jsonOut(handlePostAction(body));
}

function handlePostAction(body) {
  return runAction(WRITE_ACTIONS, body && body.action, body || {});
}

// ---------- Setup ----------
/** รันครั้งเดียวจาก Apps Script editor: สร้างทุกชีท + seed */
function initializeSystem() {
  Object.keys(SHEET_SCHEMAS).forEach(function (name) { ensureSheetExists(name, SHEET_SCHEMAS[name]); });
  seedInitialData();
  // ลบชีทว่างตั้งต้น (ชีต1 / Sheet1) ถ้าไม่มีข้อมูล
  ['ชีต1', 'Sheet1'].forEach(function (n) {
    var sh = getSheet(n);
    if (sh && sh.getLastRow() === 0 && getSpreadsheet().getSheets().length > 1) getSpreadsheet().deleteSheet(sh);
  });
  afterWrite('Machines');
  return 'initializeSystem: OK';
}

function seedInitialData() {
  var seed = LINE_CONFIG.SEED;
  var now = formatDate();
  if (getAllRows('Machines').length === 0) {
    seed.machines.forEach(function (m) {
      appendRow('Machines', { MachineID: m.id, MachineName: m.name, Line: LINE_CONFIG.LINE_CODE, Status: 'running',
        AssignedProducts: seed.products.map(function (p) { return p.code; }).join(', '), CurrentProduct: '',
        Capacity: m.capacity || 0, CurrentJobOrder: '', Installed: true });
    });
  }
  if (getAllRows('Products').length === 0) {
    seed.products.forEach(function (p) {
      appendRow('Products', { ProductCode: p.code, ProductName: p.name, DefaultQty: p.defaultQty || LINE_CONFIG.DEFAULT_QTY, Active: true, UnitPrice: p.unitPrice || 0 });
    });
  }
  if (getAllRows('BOM').length === 0) {
    seed.bom.forEach(function (b) {
      appendRow('BOM', { ProductCode: b.productCode, ComponentCode: b.componentCode, ComponentName: b.componentName, QtyPerUnit: b.qtyPerUnit || 1, Supplier: b.supplier || '' });
    });
  }
  if (getAllRows('MaterialAlias').length === 0) {
    seed.materialAliases.forEach(function (a) { appendRow('MaterialAlias', { AliasCode: a.alias, CanonicalCode: a.canonical, Note: '', Active: true }); });
  }
  if (getAllRows('WasteTypes').length === 0) {
    seed.wasteTypes.forEach(function (t) { appendRow('WasteTypes', { TypeID: makeTypeId('WT'), TypeName: t, Active: true, CreatedAt: now, CreatedBy: 'system' }); });
  }
  if (getAllRows('AlarmTypes').length === 0) {
    seed.alarmTypes.forEach(function (t) { appendRow('AlarmTypes', { TypeID: makeTypeId('AT'), TypeName: t, Active: true, CreatedAt: now, CreatedBy: 'system' }); });
  }
  // admin คนแรกจาก Script Properties
  var props = PropertiesService.getScriptProperties();
  var adminId = String(props.getProperty('INITIAL_ADMIN_EMPLOYEE_ID') || '').trim().toUpperCase();
  var adminPin = String(props.getProperty('INITIAL_ADMIN_PIN') || '').trim();
  if (adminId && /^\d{4}$/.test(adminPin) && !findRow('Users', 'EmployeeID', adminId)) {
    appendRow('Users', { EmployeeID: adminId, Name: 'Administrator', PIN: hashPin(adminId, adminPin), Role: 'admin',
      Shift: '', Active: true, CreatedAt: now, Permissions: '' });
  } else if (!adminId) {
    console.warn('ยังไม่ได้ตั้ง INITIAL_ADMIN_EMPLOYEE_ID / INITIAL_ADMIN_PIN ใน Script Properties');
  }
}
