/**
 * WasteService.gs — ทิ้งขยะ
 */
function getWasteTypes(token) {
  requireLogin(token);
  var list = getAllRows('WasteTypes').filter(function (t) { return isActiveValue(t.Active); })
    .map(function (t) { return { typeId: t.TypeID, typeName: t.TypeName }; });
  return { success: true, data: list };
}

function addWasteType(token, typeName) {
  var u = requireLogin(token);
  typeName = String(typeName || '').trim();
  if (!typeName) throw new Error('กรุณากรอกชื่อชนิดขยะ');
  var dup = getAllRows('WasteTypes').filter(function (t) { return t.TypeName === typeName && isActiveValue(t.Active); });
  if (dup.length) throw new Error('มีชนิดนี้แล้ว');
  appendRow('WasteTypes', { TypeID: makeTypeId('WT'), TypeName: typeName, Active: true, CreatedAt: formatDate(), CreatedBy: u.name });
  return { success: true };
}

function deleteWasteType(token, typeId) {
  requireLogin(token);
  updateRow('WasteTypes', 'TypeID', typeId, { Active: false });
  return { success: true };
}

function wasteToObj(r) {
  return {
    wasteId: r.WasteID, timestamp: r.Timestamp, date: r.Date, recordedBy: r.RecordedBy, recorderName: r.RecorderName,
    wasteType: r.WasteType, weightKg: toNumber(r.WeightKg), remark: r.Remark || ''
  };
}

function submitWaste(token, data) {
  var u = requirePermission(token, 'waste');
  data = data || {};
  if (!data.wasteType) throw new Error('กรุณาเลือกชนิดขยะ');
  var w = toNumber(data.weightKg);
  if (w <= 0) throw new Error('กรุณากรอกน้ำหนัก');
  var at = parseDate(data.recordedAt) || new Date();
  appendRow('WasteLog', {
    WasteID: makeId('WS'), Timestamp: formatDate(at), Date: getWorkDate(at), RecordedBy: u.employeeId,
    RecorderName: u.name, WasteType: data.wasteType, WeightKg: w, Remark: data.remark || ''
  });
  return { success: true };
}

function getWasteHistory(token, filters) {
  requireLogin(token);
  var f = filters || {};
  var from = f.dateFrom || addDays(getWorkDate(), -7), to = f.dateTo || getWorkDate();
  var list = getRowsSince('WasteLog', 'Timestamp', addDays(from, -2)).map(wasteToObj).filter(function (r) {
    return r.date >= from && r.date <= to && (!f.wasteType || r.wasteType === f.wasteType);
  }).reverse();
  return { success: true, data: list };
}

function getTodayWaste(token) {
  var d = getWorkDate();
  return getWasteHistory(token, { dateFrom: d, dateTo: d });
}
