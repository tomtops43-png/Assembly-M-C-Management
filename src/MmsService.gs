/**
 * MmsService.gs — เชื่อมกับ "ระบบซ่อมส่วนกลาง" (Maintenance-Management-System, MMS)
 * - แจ้งซ่อมในเว็บนี้ → ส่งต่อเป็นใบ BM ใน MMS (action createBM, พื้นที่ LINE_CONFIG.MMS.AREA)
 * - ดึงสถานะจาก MMS กลับมา (getBMJobs): รับงาน/กำลังซ่อม/รออะไหล่ → in-progress, ปิดงาน → resolved
 * MMS เป็น Web App แยก (Apps Script คนละโปรเจกต์) — เรียกด้วย UrlFetchApp แบบเดียวกับหน้าเว็บของ MMS
 */
var MMS_ST_DONE = 'ปิดงาน';
var MMS_ST_ACTIVE = ['รับงานแล้ว', 'กำลังซ่อม', 'รออะไหล่'];
var MMS_SYNC_CACHE_KEY = 'amc_mms_sync_v1';

function mmsEnabled() {
  var c = LINE_CONFIG.MMS;
  return !!(c && c.ENABLED && c.URL);
}

function mmsCall(action, payload) {
  var res = UrlFetchApp.fetch(LINE_CONFIG.MMS.URL, {
    method: 'post', contentType: 'text/plain;charset=utf-8', followRedirects: true, muteHttpExceptions: true,
    payload: JSON.stringify({ action: action, payload: payload || {}, user: {} })
  });
  var json;
  try { json = JSON.parse(res.getContentText()); } catch (e) { throw new Error('ระบบซ่อมกลางตอบกลับไม่ถูกต้อง (HTTP ' + res.getResponseCode() + ')'); }
  if (!json.success) throw new Error(json.error || 'ระบบซ่อมกลางแจ้งข้อผิดพลาด');
  return json.data;
}

/** ใบแจ้งซ่อมของเรา → payload createBM ของ MMS */
function mmsPayloadForTicket(t, photo) {
  var c = LINE_CONFIG.MMS;
  var m = getMachine(t.machineId) || { machineId: t.machineId, machineName: t.machineId, group: '' };
  var issue = LINE_CONFIG.ISSUE_TYPES.filter(function (i) { return i.key === t.issueType; })[0];
  var stop = t.priority === 'high' || t.priority === 'critical';
  var payload = {
    area: c.AREA,
    line: (c.LINE_BY_GROUP || {})[m.group] || m.group || m.machineName,
    mc: (c.MC_BY_MACHINE || {})[m.machineId] || m.machineName,
    symptom: (issue ? '[' + issue.label + '] ' : '') + t.description + ' (ใบ ' + t.ticketId + ' จาก ' + LINE_CONFIG.LINE_NAME + ')',
    priority: (c.PRIORITY_MAP || {})[t.priority] || 'ปกติ',
    machineStop: stop,
    reporter: t.reporterName
  };
  var dataUrl = photo && (typeof photo === 'string' ? photo : photo.dataUrl);
  if (dataUrl && /^data:image\//.test(dataUrl)) payload.photoBase64 = dataUrl;
  return payload;
}

/** ส่งใบแจ้งซ่อมไป MMS — ไม่ throw (ส่งไม่สำเร็จจะเก็บ error ไว้แล้วลองใหม่ตอน sync) */
function forwardTicketToMms(ticketId, photo) {
  if (!mmsEnabled()) return null;
  var raw = findRow('MaintenanceLog', 'TicketID', ticketId);
  if (!raw || raw.MmsJobNo) return raw ? String(raw.MmsJobNo) : null;
  try {
    var res = mmsCall('createBM', mmsPayloadForTicket(ticketToObj(raw), photo));
    updateRow('MaintenanceLog', 'TicketID', ticketId, { MmsJobNo: res.mtJob, MmsStatus: res.status || 'แจ้งซ่อม', MmsError: '' });
    return res.mtJob;
  } catch (err) {
    console.warn('forwardTicketToMms ' + ticketId + ': ' + (err && err.message || err));
    updateRow('MaintenanceLog', 'TicketID', ticketId, { MmsError: String(err && err.message || err).slice(0, 200) });
    return null;
  }
}

/**
 * ดึงสถานะจาก MMS มาอัปเดตใบที่ยังเปิดอยู่ (เว้นช่วงอย่างน้อย LINE_CONFIG.MMS.SYNC_SECONDS ต่อครั้ง)
 * + ส่งซ้ำใบที่ยังส่งไม่สำเร็จ ; ไม่ throw — MMS ล่มต้องไม่ทำให้หน้าแจ้งซ่อมของเราใช้ไม่ได้
 */
function syncMmsStatuses(force) {
  if (!mmsEnabled()) return { skipped: true };
  var cache = CacheService.getScriptCache();
  if (!force && cache.get(MMS_SYNC_CACHE_KEY)) return { skipped: true };
  cache.put(MMS_SYNC_CACHE_KEY, '1', LINE_CONFIG.MMS.SYNC_SECONDS || 120);
  var out = { resent: 0, updated: 0, closed: 0 };
  try {
    var open = getAllRows('MaintenanceLog').filter(function (r) { return r.Status === 'open' || r.Status === 'in-progress'; });
    // ส่งซ้ำเฉพาะใบที่เคยลองส่งแล้วไม่สำเร็จ (ใบเก่าก่อนเปิดเชื่อม MMS ไม่ส่ง กันซ้ำกับที่แจ้งมือไว้แล้ว)
    open.filter(function (r) { return !r.MmsJobNo && r.MmsError; }).forEach(function (r) {
      if (forwardTicketToMms(String(r.TicketID))) out.resent++;
    });
    var linked = getAllRows('MaintenanceLog').filter(function (r) { return r.MmsJobNo && (r.Status === 'open' || r.Status === 'in-progress'); });
    if (!linked.length) return out;
    var jobs = {};
    mmsCall('getBMJobs', { area: LINE_CONFIG.MMS.AREA }).forEach(function (j) { jobs[j.mtJob] = j; });
    var touched = {};
    linked.forEach(function (r) {
      var j = jobs[String(r.MmsJobNo)];
      if (!j) return;
      var upd = {};
      if (String(r.MmsStatus) !== j.status) upd.MmsStatus = j.status;
      if (j.status === MMS_ST_DONE) {
        var fin = j.finishDt ? new Date(j.finishDt) : new Date();
        upd.Status = 'resolved';
        upd.ResolvedAt = formatDate(fin);
        upd.DowntimeMinutes = minutesBetween(r.Timestamp, fin);
        upd.Resolution = (r.Resolution ? r.Resolution + ' | ' : '') + 'ปิดงานในระบบซ่อมกลาง (' + r.MmsJobNo + ')';
        out.closed++;
      } else if (MMS_ST_ACTIVE.indexOf(j.status) >= 0 && r.Status === 'open') {
        upd.Status = 'in-progress';
        if (!r.AssignedTo) upd.AssignedTo = 'ช่าง (ระบบซ่อมกลาง)';
      }
      if (Object.keys(upd).length) {
        updateRow('MaintenanceLog', 'TicketID', r.TicketID, upd);
        out.updated++;
        if (upd.Status) touched[String(r.MachineID)] = true;
      }
    });
    Object.keys(touched).forEach(function (m) { recomputeMachineStatus(m); });
  } catch (err) {
    console.warn('syncMmsStatuses: ' + (err && err.message || err));
    out.error = String(err && err.message || err);
  }
  return out;
}

/** ปุ่ม "ดึงสถานะจากระบบซ่อมกลาง" (หัวหน้าขึ้นไป) */
function syncMmsNow(token) {
  requireRole(token, 'supervisor');
  return { success: true, data: syncMmsStatuses(true) };
}

/** ตั้ง time-driven trigger ให้ sync ทุก 10 นาที (รันครั้งเดียวจาก Apps Script editor — ไม่บังคับ) */
function installMmsSyncTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'mmsSyncTrigger') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('mmsSyncTrigger').timeBased().everyMinutes(10).create();
  return 'installMmsSyncTrigger: OK';
}

function mmsSyncTrigger() { syncMmsStatuses(true); }
