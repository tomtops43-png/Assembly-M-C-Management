/**
 * NgIssueService.gs — ทะเบียนปัญหา NG (ทุกสาเหตุ: Man / Machine / Material / Method / Measurement / Environment)
 * NgIssues   = 1 แถวต่อ "ปัญหา" (หัวข้อ + สาเหตุ + การแก้ไข + สถานะ)
 * NgIssueLog = 1 แถวต่อ "การพบแต่ละครั้ง" (วันเวลา, เครื่อง, จำนวน NG, รายละเอียด, รูปหลักฐาน)
 * → นับได้ว่าปัญหานี้เกิดกี่ครั้ง วันไหนบ้าง
 */
var NG_ISSUE_STATUSES = ['open', 'monitoring', 'closed'];

function ngCategoryKeys() { return LINE_CONFIG.NG_ISSUE_CATEGORIES.map(function (c) { return c.key; }); }

function ngIssueToObj(r) {
  return {
    issueId: r.IssueID, title: r.Title || '', category: r.Category || 'other', machineId: String(r.MachineID || ''),
    productCode: String(r.ProductCode || ''), description: r.Description || '', rootCause: r.RootCause || '',
    countermeasure: r.Countermeasure || '', status: r.Status || 'open', createdAt: r.CreatedAt, createdBy: r.CreatedBy,
    creatorName: r.CreatorName || '', updatedAt: r.UpdatedAt || '', updatedBy: r.UpdatedBy || '',
    closedAt: r.ClosedAt || '', closedBy: r.ClosedBy || ''
  };
}

function ngOccurrenceToObj(r) {
  return {
    occurrenceId: r.OccurrenceID, issueId: r.IssueID, timestamp: r.Timestamp, date: r.Date, shift: r.Shift,
    machineId: String(r.MachineID || ''), productCode: String(r.ProductCode || ''), ngQty: toNumber(r.NgQty),
    detail: r.Detail || '', photos: splitList(r.Photos), recordedBy: r.RecordedBy, recorderName: r.RecorderName || ''
  };
}

function cleanNgCategory(c) { return ngCategoryKeys().indexOf(c) >= 0 ? c : 'other'; }

/** การพบ 1 ครั้ง (บันทึกรูปลง Drive: ปัญหา NG/<yyyy-MM>/<วันที่>/<IssueID>) */
function buildNgOccurrence(u, issueId, d) {
  if (d.machineId && !getMachine(d.machineId)) throw new Error('ไม่พบเครื่องจักร');
  var at = parseDate(d.occurredAt) || new Date();
  if (at.getTime() > Date.now() + 5 * 60000) throw new Error('วันเวลาที่พบอยู่ในอนาคต');
  var date = getWorkDate(at);
  var occId = makeId('NGO', date);
  var photos = savePhotos(d.photos, occId, { category: 'ngissue', date: date, sub: issueId });
  return {
    OccurrenceID: occId, IssueID: issueId, Timestamp: formatDate(at), Date: date, Shift: detectShift(at),
    MachineID: d.machineId || '', ProductCode: d.productCode || '', NgQty: Math.max(0, toNumber(d.ngQty)),
    Detail: String(d.detail || '').trim(), Photos: photos.join(', '), RecordedBy: u.employeeId, RecorderName: u.name,
    ClientRequestID: d.clientRequestId || ''
  };
}

/** แจ้งปัญหาใหม่ + บันทึกการพบครั้งแรก */
function createNgIssue(token, data) {
  var u = requirePermission(token, 'ngissue');
  data = data || {};
  var title = String(data.title || '').trim();
  if (!title) throw new Error('กรุณากรอกหัวข้อปัญหา');
  var issueId = makeId('NGI');
  var occ = buildNgOccurrence(u, issueId, data);
  appendRow('NgIssues', {
    IssueID: issueId, Title: title.substring(0, 200), Category: cleanNgCategory(data.category), MachineID: data.machineId || '',
    ProductCode: data.productCode || '', Description: String(data.description || '').trim(), RootCause: '', Countermeasure: '',
    Status: 'open', CreatedAt: formatDate(), CreatedBy: u.employeeId, CreatorName: u.name, UpdatedAt: '', UpdatedBy: '', ClosedAt: '', ClosedBy: ''
  });
  appendRow('NgIssueLog', occ);
  return { success: true, issueId: issueId, occurrenceId: occ.OccurrenceID };
}

/** "เจออีกครั้ง" — เพิ่มการพบให้ปัญหาเดิม (ถ้าปิดไปแล้ว → เปิดใหม่อัตโนมัติ เพราะปัญหากลับมา) */
function addNgOccurrence(token, data) {
  var u = requirePermission(token, 'ngissue');
  data = data || {};
  var issue = findRow('NgIssues', 'IssueID', data.issueId);
  if (!issue) throw new Error('ไม่พบปัญหานี้');
  var occ = buildNgOccurrence(u, issue.IssueID, data);
  appendRow('NgIssueLog', occ);
  var reopened = issue.Status === 'closed';
  if (reopened) updateRow('NgIssues', 'IssueID', issue.IssueID, { Status: 'open', UpdatedAt: formatDate(), UpdatedBy: u.name });
  return { success: true, occurrenceId: occ.OccurrenceID, reopened: reopened };
}

/** แก้หัวข้อ/สาเหตุ/การแก้ไข/สถานะ — ปิดปัญหาได้เฉพาะหัวหน้าขึ้นไป */
function updateNgIssue(token, issueId, updates) {
  var u = requirePermission(token, 'ngissue');
  updates = updates || {};
  var issue = findRow('NgIssues', 'IssueID', issueId);
  if (!issue) throw new Error('ไม่พบปัญหานี้');
  var upd = { UpdatedAt: formatDate(), UpdatedBy: u.name };
  if (updates.title !== undefined) {
    var t = String(updates.title || '').trim();
    if (!t) throw new Error('กรุณากรอกหัวข้อปัญหา');
    upd.Title = t.substring(0, 200);
  }
  if (updates.category !== undefined) upd.Category = cleanNgCategory(updates.category);
  if (updates.machineId !== undefined) {
    if (updates.machineId && !getMachine(updates.machineId)) throw new Error('ไม่พบเครื่องจักร');
    upd.MachineID = updates.machineId || '';
  }
  if (updates.productCode !== undefined) upd.ProductCode = updates.productCode || '';
  ['description:Description', 'rootCause:RootCause', 'countermeasure:Countermeasure'].forEach(function (p) {
    var k = p.split(':');
    if (updates[k[0]] !== undefined) upd[k[1]] = String(updates[k[0]] || '').trim();
  });
  if (updates.status !== undefined && updates.status !== issue.Status) {
    if (NG_ISSUE_STATUSES.indexOf(updates.status) < 0) throw new Error('สถานะไม่ถูกต้อง');
    if (updates.status === 'closed' && roleLevel(u.role) < roleLevel('supervisor')) throw new Error('ปิดปัญหาได้เฉพาะหัวหน้าขึ้นไป');
    upd.Status = updates.status;
    upd.ClosedAt = updates.status === 'closed' ? formatDate() : '';
    upd.ClosedBy = updates.status === 'closed' ? u.name : '';
  }
  updateRow('NgIssues', 'IssueID', issueId, upd);
  return { success: true };
}

/** ลบการพบที่บันทึกผิด (หัวหน้าขึ้นไป) — ต้องเหลืออย่างน้อย 1 ครั้ง */
function deleteNgOccurrence(token, occurrenceId) {
  var u = requireRole(token, 'supervisor');
  var occ = findRow('NgIssueLog', 'OccurrenceID', occurrenceId);
  if (!occ) throw new Error('ไม่พบรายการนี้');
  var left = countRows('NgIssueLog', function (r) { return r.IssueID === occ.IssueID; });
  if (left <= 1) throw new Error('ปัญหาต้องมีการพบอย่างน้อย 1 ครั้ง');
  deleteRow('NgIssueLog', 'OccurrenceID', occurrenceId);
  updateRow('NgIssues', 'IssueID', occ.IssueID, { UpdatedAt: formatDate(), UpdatedBy: u.name });
  return { success: true };
}

/** สรุปการพบของแต่ละปัญหา: กี่ครั้ง, วันไหนบ้าง, NG รวม, ครั้งแรก/ล่าสุด, รูปปก */
function summarizeNgOccurrences(occs) {
  var dates = {}, total = 0, first = '', last = '', cover = '', photoCount = 0;
  occs.forEach(function (o) {
    dates[o.date] = (dates[o.date] || 0) + 1;
    total += o.ngQty;
    if (!first || o.timestamp < first) first = o.timestamp;
    if (!last || o.timestamp > last) { last = o.timestamp; }
    photoCount += o.photos.length;
  });
  for (var i = occs.length - 1; i >= 0 && !cover; i--) cover = occs[i].photos[0] || '';
  return {
    count: occs.length, dayCount: Object.keys(dates).length, dates: Object.keys(dates).sort().reverse(),
    totalNgQty: total, firstSeen: first, lastSeen: last, coverPhoto: cover, photoCount: photoCount
  };
}

function groupNgOccurrences() {
  var by = {};
  getAllRows('NgIssueLog').map(ngOccurrenceToObj).forEach(function (o) { (by[o.issueId] = by[o.issueId] || []).push(o); });
  Object.keys(by).forEach(function (k) { by[k].sort(function (a, b) { return a.timestamp < b.timestamp ? -1 : 1; }); });
  return by;
}

/** filters: { status, category, machineId, q, dateFrom, dateTo } — dateFrom/To = มีการพบในช่วงนั้น */
function getNgIssues(token, filters) {
  requireLogin(token);
  var f = filters || {};
  var occBy = groupNgOccurrences();
  var q = String(f.q || '').trim().toLowerCase();
  var list = getAllRows('NgIssues').map(ngIssueToObj).filter(function (i) {
    if (f.status && f.status !== 'active' && i.status !== f.status) return false;
    if (f.status === 'active' && i.status === 'closed') return false;
    if (f.category && i.category !== f.category) return false;
    if (q && (i.title + ' ' + i.description + ' ' + i.issueId).toLowerCase().indexOf(q) < 0) return false;
    return true;
  }).map(function (i) {
    var occs = occBy[i.issueId] || [];
    if (f.machineId) occs = occs.filter(function (o) { return (o.machineId || i.machineId) === f.machineId; });
    if (f.dateFrom) occs = occs.filter(function (o) { return o.date >= f.dateFrom; });
    if (f.dateTo) occs = occs.filter(function (o) { return o.date <= f.dateTo; });
    var s = summarizeNgOccurrences(occs);
    Object.keys(s).forEach(function (k) { i[k] = s[k]; });
    return i;
  }).filter(function (i) { return i.count > 0 || !(f.machineId || f.dateFrom || f.dateTo); });
  list.sort(function (a, b) { return a.lastSeen < b.lastSeen ? 1 : a.lastSeen > b.lastSeen ? -1 : 0; });
  return { success: true, data: list };
}

function getNgIssueDetail(token, issueId) {
  requireLogin(token);
  var r = findRow('NgIssues', 'IssueID', issueId);
  if (!r) throw new Error('ไม่พบปัญหานี้');
  var issue = ngIssueToObj(r);
  var occs = groupNgOccurrences()[issue.issueId] || [];
  var s = summarizeNgOccurrences(occs);
  Object.keys(s).forEach(function (k) { issue[k] = s[k]; });
  issue.occurrences = occs.slice().reverse();
  return { success: true, data: issue };
}
