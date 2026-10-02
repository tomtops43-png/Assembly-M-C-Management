/**
 * RawMaterialService.gs — รับวัตถุดิบ + ตรวจ BOM + รูป
 * OCR ฉลาก (extractOCRData) จะทำหลังได้ตัวอย่างฉลากจริงของไลน์นี้
 */
function normalizePartCode(code) {
  return String(code || '').toUpperCase().replace(/\(?(BOI|NON)\)?$/, '').replace(/[^A-Z0-9]/g, '');
}

function resolveAlias(code) {
  var up = String(code || '').trim().toUpperCase();
  var list = getMaterialAliases();
  for (var i = 0; i < list.length; i++) {
    if (list[i].alias.toUpperCase() === up || normalizePartCode(list[i].alias) === normalizePartCode(up)) return list[i].canonical;
  }
  return code;
}

/** ตรวจว่าวัตถุดิบตรงกับ BOM ของสินค้าที่ assign ให้เครื่อง */
function validateRawMaterialForMachine(machineId, partCode, partName) {
  var m = getMachine(machineId);
  if (!m) return { valid: false, message: 'ไม่พบเครื่องจักร' };
  var comps = [];
  m.assignedProducts.forEach(function (p) { comps = comps.concat(getProductBOM(p)); });
  if (!comps.length) return { valid: false, allComponents: [], message: 'เครื่องนี้ยังไม่มี BOM (ตั้งสินค้า/BOM ก่อน)' };
  var raw = String(partCode || '').trim().toUpperCase();
  var aliased = String(resolveAlias(raw)).toUpperCase();
  var exact = comps.filter(function (c) { var cc = c.componentCode.toUpperCase(); return cc === raw || cc === aliased; });
  var matched = exact.length ? exact : comps.filter(function (c) {
    var n = normalizePartCode(c.componentCode);
    return n === normalizePartCode(raw) || n === normalizePartCode(aliased);
  });
  if (!matched.length) return { valid: false, allComponents: comps, message: 'รหัส ' + partCode + ' ไม่อยู่ใน BOM ของเครื่องนี้' };
  var warning = '';
  if (partName && !matched.some(function (c) {
    return String(c.componentName || '').toUpperCase().indexOf(String(partName).toUpperCase().trim()) >= 0 ||
      String(partName).toUpperCase().indexOf(String(c.componentName || '').toUpperCase()) >= 0;
  })) warning = 'รหัสตรง แต่ชื่อไม่ตรงกับ BOM — กรุณาตรวจสอบ';
  return { valid: true, matchedComponents: matched, allComponents: comps, warning: warning, message: 'ตรงกับ BOM' };
}

function validateRawMaterial(machineId, partCode, partName) {
  return { success: true, data: validateRawMaterialForMachine(machineId, partCode, partName) };
}

function submitRawMaterial(token, d) {
  var u = requirePermission(token, 'rawmaterial');
  d = d || {};
  if (!d.partCode) throw new Error('กรุณากรอก Part Code');
  if (toNumber(d.quantity) <= 0) throw new Error('กรุณากรอกจำนวน');
  var v = validateRawMaterialForMachine(d.machineId, d.partCode, d.partName);
  if (!v.valid) throw new Error(v.message);
  var id = makeId('RM');
  var photos = savePhotos(d.photos, id + '_' + (d.machineId || '') + '_' + String(d.partCode).replace(/[\\/:*?"<>|]/g, '-'), { category: 'rawmaterial', date: getWorkDate() });
  appendRow('RawMaterialLog', {
    ReceiveID: id, Timestamp: formatDate(), Date: getWorkDate(), ReceivedBy: u.employeeId, ReceiverName: u.name,
    MachineID: d.machineId, PartCode: v.matchedComponents[0].componentCode, SupplierCode: d.partCode,
    PartName: d.partName || v.matchedComponents[0].componentName, Specification: d.specification || '',
    Quantity: toNumber(d.quantity), Unit: d.unit || 'PCS', LotNumber: d.lotNumber || '', Inspector: d.inspector || '',
    Customer: d.customer || '', NetWeight: d.netWeight || '', GrossWeight: d.grossWeight || '', CartonNo: d.cartonNo || '',
    PackingDate: d.packingDate || '', RefNo: d.refNo || '', Remark: d.remark || '', Photos: photos.join(', '), Status: 'received'
  });
  return { success: true, receiveId: id, warning: v.warning };
}

function getRawMaterialHistory(token, filters) {
  requireLogin(token);
  var f = filters || {};
  var from = f.dateFrom || getWorkDate(), to = f.dateTo || getWorkDate();
  var list = getRowsSince('RawMaterialLog', 'Timestamp', addDays(from, -2)).filter(function (r) {
    return r.Date >= from && r.Date <= to && (!f.partCode || String(r.PartCode) === f.partCode);
  }).reverse().map(function (r) {
    return {
      receiveId: r.ReceiveID, timestamp: r.Timestamp, date: r.Date, receiverName: r.ReceiverName, machineId: String(r.MachineID),
      partCode: String(r.PartCode), supplierCode: String(r.SupplierCode), partName: r.PartName, quantity: toNumber(r.Quantity),
      unit: r.Unit, lotNumber: r.LotNumber, remark: r.Remark, photos: splitList(r.Photos)
    };
  });
  return { success: true, data: list };
}

function getTodayRawMaterials(token) {
  return getRawMaterialHistory(token, {});
}
