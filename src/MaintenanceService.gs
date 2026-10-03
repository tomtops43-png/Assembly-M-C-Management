/**
 * MaintenanceService.gs — แจ้งซ่อม
 */
var PRIORITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 };

function ticketToObj(t) {
  return {
    ticketId: String(t.TicketID), timestamp: t.Timestamp, date: t.Date, shiftAB: t.ShiftAB, shiftDN: t.ShiftDN,
    reportedBy: String(t.ReportedBy), reporterName: t.ReporterName, machineId: String(t.MachineID),
    issueType: t.IssueType, description: t.Description, priority: t.Priority, status: t.Status,
    assignedTo: t.AssignedTo || '', resolvedAt: t.ResolvedAt || '', downtimeMinutes: toNumber(t.DowntimeMinutes),
    resolution: t.Resolution || '', photos: splitList(t.Photos), resolutionPhotos: splitList(t.ResolutionPhotos),
    mmsJobNo: String(t.MmsJobNo || ''), mmsStatus: String(t.MmsStatus || ''), mmsError: String(t.MmsError || '')
  };
}

function getOpenTickets(token) {
  syncMmsStatuses(false);
  var list = getAllRows('MaintenanceLog').map(ticketToObj)
    .filter(function (t) { return t.status === 'open' || t.status === 'in-progress'; });
  list.sort(function (a, b) {
    return (PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]) || (a.timestamp < b.timestamp ? 1 : -1);
  });
  return { success: true, data: list };
}

function getMaintenanceHistory(token, filters) {
  requireLogin(token);
  var f = filters || {};
  var from = f.dateFrom || addDays(getWorkDate(), -7);
  var list = getRowsSince('MaintenanceLog', 'Timestamp', addDays(from, -2)).map(ticketToObj).filter(function (t) {
    if (t.date < from || (f.dateTo && t.date > f.dateTo)) return false;
    if (f.machineId && t.machineId !== f.machineId) return false;
    if (f.status && t.status !== f.status) return false;
    return true;
  }).reverse();
  return { success: true, data: list };
}

function getMaintenanceSymptoms(token) {
  requireLogin(token);
  var count = {};
  getAllRows('MaintenanceLog').forEach(function (t) {
    String(t.Description || '').split('|').forEach(function (s) {
      s = s.trim();
      if (s) count[s] = (count[s] || 0) + 1;
    });
  });
  var list = Object.keys(count).sort(function (a, b) { return count[b] - count[a]; }).slice(0, 30);
  return { success: true, data: list };
}

function submitMaintenanceTicket(token, data) {
  var u = requirePermission(token, 'maintenance');
  data = data || {};
  if (!getMachine(data.machineId)) throw new Error('ไม่พบเครื่องจักร');
  if (!String(data.description || '').trim()) throw new Error('กรุณากรอกรายละเอียด');
  var issueKeys = LINE_CONFIG.ISSUE_TYPES.map(function (i) { return i.key; });
  if (issueKeys.indexOf(data.issueType) < 0) throw new Error('ประเภทปัญหาไม่ถูกต้อง');
  var priority = PRIORITY_RANK[data.priority] !== undefined ? data.priority : 'medium';

  if (data.clientRequestId) {
    var dup = getRowsSince('MaintenanceLog', 'Timestamp', formatDate(new Date(Date.now() - 86400000)))
      .filter(function (t) { return String(t.ClientRequestID) === String(data.clientRequestId); })[0];
    if (dup) return { success: true, duplicate: true, ticketId: dup.TicketID };
  }

  var reportTime = parseDate(data.reportTime) || new Date();
  var ticketId = makeId('MT');
  var photos = savePhotos(data.photos, ticketId + '_แจ้ง', { category: 'maintenance', date: getWorkDate(reportTime), sub: ticketId + '_' + data.machineId });
  appendRow('MaintenanceLog', {
    TicketID: ticketId, Timestamp: formatDate(reportTime), Date: getWorkDate(reportTime), ShiftAB: u.shift || '',
    ShiftDN: detectShift(reportTime), ReportedBy: u.employeeId, ReporterName: u.name, MachineID: data.machineId,
    IssueType: data.issueType, Description: data.description, Priority: priority, Status: 'open', AssignedTo: '',
    ResolvedAt: '', DowntimeMinutes: '', Resolution: '', Photos: photos.join(', '), ResolutionPhotos: '',
    ClientRequestID: data.clientRequestId || ''
  });
  updateRow('Machines', 'MachineID', data.machineId, { Status: (priority === 'high' || priority === 'critical') ? 'down' : 'maintenance' });
  var mmsJobNo = forwardTicketToMms(ticketId, (data.photos || [])[0]);
  return { success: true, ticketId: ticketId, mmsJobNo: mmsJobNo, mmsEnabled: mmsEnabled() };
}

function getEditableTicket(u, ticketId) {
  var t = findRow('MaintenanceLog', 'TicketID', ticketId);
  if (!t) throw new Error('ไม่พบใบแจ้งซ่อม');
  t = ticketToObj(t);
  var isOwnerOrSup = t.reportedBy === u.employeeId || roleLevel(u.role) >= roleLevel('supervisor');
  if (!isOwnerOrSup) throw new Error('ไม่มีสิทธิ์แก้ไข');
  if (t.status !== 'open') throw new Error('แก้ไขได้เฉพาะใบที่ยังไม่มีคนรับงาน');
  if (u.role !== 'admin' && t.date !== getWorkDate()) throw new Error('แก้ไขได้เฉพาะใบที่แจ้งวันนี้');
  return t;
}

function updateMaintenanceTicket(token, ticketId, updates) {
  var u = requireLogin(token);
  var t = getEditableTicket(u, ticketId);
  var upd = {};
  updates = updates || {};
  if (updates.machineId) upd.MachineID = updates.machineId;
  if (updates.issueType) upd.IssueType = updates.issueType;
  if (updates.priority) upd.Priority = updates.priority;
  if (updates.description !== undefined) upd.Description = updates.description;
  updateRow('MaintenanceLog', 'TicketID', ticketId, upd);
  recomputeMachineStatus(t.machineId);
  if (upd.MachineID && upd.MachineID !== t.machineId) recomputeMachineStatus(upd.MachineID);
  return { success: true };
}

function deleteMaintenanceTicket(token, ticketId) {
  var u = requireLogin(token);
  var t = getEditableTicket(u, ticketId);
  deleteRow('MaintenanceLog', 'TicketID', ticketId);
  recomputeMachineStatus(t.machineId);
  logAction(u, 'deleteMaintenanceTicket', { snapshot: t });
  return { success: true };
}

function updateTicketStatus(token, ticketId, status, resolution, photos, resolveTime) {
  var u = requireRole(token, 'maintenance');
  var raw = findRow('MaintenanceLog', 'TicketID', ticketId);
  if (!raw) throw new Error('ไม่พบใบแจ้งซ่อม');
  var t = ticketToObj(raw);
  var upd = {};
  if (status === 'in-progress') {
    upd.Status = 'in-progress'; upd.AssignedTo = u.name;
  } else if (status === 'returned') {
    upd.Status = 'open'; upd.AssignedTo = '';
    upd.Resolution = (t.resolution ? t.resolution + ' | ' : '') + 'คืนงานโดย ' + u.name + ' ' + formatDate();
  } else if (status === 'resolved' || status === 'closed') {
    if (!String(resolution || '').trim()) throw new Error('กรุณากรอกผลการซ่อม');
    var resolvedAt = parseDate(resolveTime) || new Date();
    upd.Status = status; upd.Resolution = resolution; upd.ResolvedAt = formatDate(resolvedAt);
    upd.DowntimeMinutes = minutesBetween(t.timestamp, resolvedAt);
    if (!t.assignedTo) upd.AssignedTo = u.name;
    var saved = savePhotos(photos, ticketId + '_ซ่อมเสร็จ', { category: 'maintenance', date: t.date, sub: ticketId + '_' + t.machineId });
    if (saved.length) upd.ResolutionPhotos = saved.join(', ');
  } else {
    throw new Error('สถานะไม่ถูกต้อง');
  }
  updateRow('MaintenanceLog', 'TicketID', ticketId, upd);
  recomputeMachineStatus(t.machineId);
  return { success: true };
}

/** admin: เติม ShiftAB ย้อนหลังจากโปรไฟล์ผู้แจ้ง */
function backfillMaintenanceShiftAB(token) {
  requireRole(token, 'admin');
  var users = {};
  getAllRows('Users').forEach(function (r) { users[String(r.EmployeeID)] = r.Shift || ''; });
  var n = 0;
  getAllRows('MaintenanceLog').forEach(function (t) {
    if (!t.ShiftAB && users[String(t.ReportedBy)]) {
      updateRow('MaintenanceLog', 'TicketID', t.TicketID, { ShiftAB: users[String(t.ReportedBy)] });
      n++;
    }
  });
  return { success: true, updated: n };
}
