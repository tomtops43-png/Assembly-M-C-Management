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

// ---------- วิเคราะห์ NG (ใช้ยอดผลิตจาก ProductionLog เป็นตัวหาร) ----------
var NG_TARGET_KEY = 'NG_TARGET_PCT';

function getNgTarget() {
  var v = Number(PropertiesService.getScriptProperties().getProperty(NG_TARGET_KEY));
  return v > 0 ? v : toNumber(LINE_CONFIG.NG_TARGET_PCT, 0.5);
}

/** ตั้งเป้า NG% (หัวหน้าขึ้นไป) */
function setNgTarget(token, pctValue) {
  var u = requireRole(token, 'supervisor');
  var v = Number(pctValue);
  if (!(v > 0 && v <= 100)) throw new Error('เป้า NG% ต้องมากกว่า 0 และไม่เกิน 100');
  PropertiesService.getScriptProperties().setProperty(NG_TARGET_KEY, String(v));
  logAction(u, 'setNgTarget', { pct: v });
  return { success: true, target: v };
}

function round2(n) { return Math.round(n * 100) / 100; }
function ngPctOf(ng, total) { return total > 0 ? round2(ng / total * 100) : 0; }

function daysBetween(from, to) {
  return Math.round((parseDate(to + ' 12:00:00') - parseDate(from + ' 12:00:00')) / 86400000);
}

/** รวมยอดผลิต: ok = FG, ng = NG, total = FG + NG */
function sumProduction(rows) {
  var t = { ok: 0, ng: 0 };
  rows.forEach(function (r) { t.ok += r.actualQty; t.ng += r.defectQty; });
  t.total = t.ok + t.ng; t.ngPct = ngPctOf(t.ng, t.total); t.ppm = t.total > 0 ? Math.round(t.ng / t.total * 1e6) : 0;
  return t;
}

/**
 * filters: { dateFrom, dateTo, machineId, productCode, shift (Day|Night) }
 * คืน: KPI + ช่วงก่อนหน้า, รายวัน, แยกเครื่อง/กะ/รุ่น, Pareto ปัญหา + อาการ NG จากหน้ากรอกยอด, ตารางวัน×ปัญหา, การพบในช่วงนั้น
 */
function getNgAnalytics(token, filters) {
  requireLogin(token);
  var f = filters || {};
  var to = isValidDateStr(f.dateTo) ? f.dateTo : getWorkDate();
  var from = isValidDateStr(f.dateFrom) ? f.dateFrom : addDays(to, -29);
  if (from > to) { var tmp = from; from = to; to = tmp; }
  var span = daysBetween(from, to) + 1;
  if (span > 366) throw new Error('เลือกช่วงได้ไม่เกิน 1 ปี');
  var pf = { machineId: f.machineId || '', productCode: f.productCode || '', shiftDN: f.shift || '' };

  // ---- ยอดผลิต ----
  var rows = queryProduction({ dateFrom: from, dateTo: to, machineId: pf.machineId, productCode: pf.productCode, shiftDN: pf.shiftDN });
  var prevTo = addDays(from, -1), prevFrom = addDays(from, -span);
  var prevRows = queryProduction({ dateFrom: prevFrom, dateTo: prevTo, machineId: pf.machineId, productCode: pf.productCode, shiftDN: pf.shiftDN });

  var daily = {}, byMachine = {}, byShift = {}, byProduct = {}, byReason = {};
  for (var d = from; d <= to; d = addDays(d, 1)) daily[d] = { date: d, ok: 0, ng: 0, issueCount: 0, issueNg: 0 };
  var mNames = {};
  getMachines().forEach(function (m) { mNames[m.machineId] = m.machineName; });
  var add = function (map, key, extra) {
    var o = map[key] = map[key] || Object.assign({ key: key, ok: 0, ng: 0 }, extra || {});
    return o;
  };
  rows.forEach(function (r) {
    var dd = daily[r.date]; if (dd) { dd.ok += r.actualQty; dd.ng += r.defectQty; }
    [add(byMachine, r.machineId, { label: mNames[r.machineId] || r.machineId }), add(byShift, r.shiftDN || '-'), add(byProduct, r.productCode)]
      .forEach(function (o) { o.ok += r.actualQty; o.ng += r.defectQty; });
    if (r.defectQty > 0) { var reason = ngReasonOf(r.remark); byReason[reason] = (byReason[reason] || 0) + r.defectQty; }
  });
  var finish = function (map) {
    return Object.keys(map).map(function (k) { var o = map[k]; o.total = o.ok + o.ng; o.ngPct = ngPctOf(o.ng, o.total); return o; })
      .sort(function (a, b) { return b.ngPct - a.ngPct || b.ng - a.ng; });
  };
  var totals = sumProduction(rows), prev = sumProduction(prevRows);

  // ---- ปัญหา NG ที่พบในช่วงนี้ ----
  var issues = {};
  getAllRows('NgIssues').map(ngIssueToObj).forEach(function (i) { issues[i.issueId] = i; });
  var occs = getAllRows('NgIssueLog').map(ngOccurrenceToObj).filter(function (o) {
    var i = issues[o.issueId];
    if (!i || o.date < from || o.date > to) return false;
    if (pf.machineId && (o.machineId || i.machineId) !== pf.machineId) return false;
    if (pf.productCode && (o.productCode || i.productCode) !== pf.productCode) return false;
    if (pf.shiftDN && o.shift !== pf.shiftDN) return false;
    return true;
  });
  var byIssue = {}, byCategory = {}, matrix = {};
  occs.forEach(function (o) {
    var i = issues[o.issueId];
    var bi = byIssue[o.issueId] = byIssue[o.issueId] || { issueId: o.issueId, title: i.title, category: i.category, status: i.status, count: 0, ngQty: 0, days: {} };
    bi.count++; bi.ngQty += o.ngQty; bi.days[o.date] = true;
    var bc = byCategory[i.category] = byCategory[i.category] || { category: i.category, count: 0, ngQty: 0 };
    bc.count++; bc.ngQty += o.ngQty;
    var dd = daily[o.date]; if (dd) { dd.issueCount++; dd.issueNg += o.ngQty; }
    var mx = matrix[o.issueId] = matrix[o.issueId] || {};
    var cell = mx[o.date] = mx[o.date] || { count: 0, ngQty: 0 };
    cell.count++; cell.ngQty += o.ngQty;
  });
  var issueNgTotal = 0;
  var pareto = Object.keys(byIssue).map(function (k) {
    var b = byIssue[k]; b.dayCount = Object.keys(b.days).length; delete b.days; issueNgTotal += b.ngQty; return b;
  }).sort(function (a, b) { return b.ngQty - a.ngQty || b.count - a.count; });
  var cum = 0;
  pareto.forEach(function (b) {
    cum += b.ngQty;
    b.share = issueNgTotal ? round2(b.ngQty / issueNgTotal * 100) : 0;
    b.cumShare = issueNgTotal ? round2(cum / issueNgTotal * 100) : 0;
    b.pctOfProduction = ngPctOf(b.ngQty, totals.total);
  });
  var reasonTotal = 0;
  var reasons = Object.keys(byReason).map(function (k) { reasonTotal += byReason[k]; return { reason: k, ng: byReason[k] }; })
    .sort(function (a, b) { return b.ng - a.ng; });
  cum = 0;
  reasons.forEach(function (r) {
    cum += r.ng; r.share = reasonTotal ? round2(r.ng / reasonTotal * 100) : 0; r.cumShare = reasonTotal ? round2(cum / reasonTotal * 100) : 0;
    r.pctOfProduction = ngPctOf(r.ng, totals.total);
  });

  return {
    success: true,
    data: {
      range: { from: from, to: to, days: span, prevFrom: prevFrom, prevTo: prevTo },
      target: getNgTarget(),
      totals: totals, prev: prev,
      issueSummary: { issues: pareto.length, occurrences: occs.length, ngQty: issueNgTotal,
        open: pareto.filter(function (p) { return p.status !== 'closed'; }).length },
      daily: Object.keys(daily).sort().map(function (k) { var o = daily[k]; o.total = o.ok + o.ng; o.ngPct = ngPctOf(o.ng, o.total); return o; }),
      byMachine: finish(byMachine), byShift: finish(byShift), byProduct: finish(byProduct),
      byCategory: Object.keys(byCategory).map(function (k) { return byCategory[k]; }).sort(function (a, b) { return b.ngQty - a.ngQty || b.count - a.count; }),
      pareto: pareto, reasons: reasons, matrix: matrix,
      occurrences: occs.map(function (o) {
        var i = issues[o.issueId];
        return { date: o.date, timestamp: o.timestamp, shift: o.shift, issueId: o.issueId, title: i.title, category: i.category,
          machineId: o.machineId || i.machineId, productCode: o.productCode || i.productCode, ngQty: o.ngQty, detail: o.detail,
          photo: o.photos[0] || '', recorderName: o.recorderName };
      }).sort(function (a, b) { return a.timestamp < b.timestamp ? 1 : -1; })
    }
  };
}
