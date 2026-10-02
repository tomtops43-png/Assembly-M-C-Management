/**
 * Utils.gs — UUID, กะ, วันทำงาน, รูปแบบวันที่
 */
var TZ = 'Asia/Bangkok';

function generateUUID() { return Utilities.getUuid(); }

/** PREFIX-yyyyMMdd-XXXXXX */
function makeId(prefix, dateStr) {
  var d = dateStr ? String(dateStr).replace(/-/g, '') : Utilities.formatDate(new Date(), TZ, 'yyyyMMdd');
  return prefix + '-' + d + '-' + Utilities.getUuid().substring(0, 6).toUpperCase();
}

/** PREFIX-XXXXXXXX */
function makeTypeId(prefix) {
  return prefix + '-' + Utilities.getUuid().replace(/-/g, '').substring(0, 8).toUpperCase();
}

function bkkHour(d) { return Number(Utilities.formatDate(d || new Date(), TZ, 'H')); }

function isDayHour(h) { return h >= LINE_CONFIG.DAY_SHIFT_START && h < LINE_CONFIG.NIGHT_SHIFT_START; }

function detectShift(d) { return isDayHour(bkkHour(d)) ? 'Day' : 'Night'; }

function hourToPeriod(h) { var hh = ('0' + h).slice(-2); return hh + ':00-' + hh + ':59'; }

function detectTimePeriod(d) { return hourToPeriod(bkkHour(d)); }

function periodHour(p) { return Number(String(p || '').substring(0, 2)); }

function shiftFromPeriod(p) { return isDayHour(periodHour(p)) ? 'Day' : 'Night'; }

/** ช่วงเวลา 24 ช่อง เรียงแบบโรงงาน 8..23,0..7 */
function getTimePeriods() {
  var out = [];
  for (var i = 0; i < 24; i++) out.push(hourToPeriod((LINE_CONFIG.WORKDAY_START_HOUR + i) % 24));
  return out;
}

function formatDate(d) { return Utilities.formatDate(d || new Date(), TZ, 'yyyy-MM-dd HH:mm:ss'); }

function formatDateOnly(d) { return Utilities.formatDate(d || new Date(), TZ, 'yyyy-MM-dd'); }

/** วันทำงาน: ก่อน 08:00 = วันก่อนหน้า */
function getWorkDate(d) {
  d = d || new Date();
  if (bkkHour(d) < LINE_CONFIG.WORKDAY_START_HOUR) d = new Date(d.getTime() - 86400000);
  return formatDateOnly(d);
}

/** 'yyyy-MM-dd' หรือ 'yyyy-MM-dd HH:mm(:ss)' หรือ 'yyyy-MM-ddTHH:mm' (เวลา Bangkok) → Date */
function parseDate(s) {
  if (!s) return null;
  if (s instanceof Date) return s;
  var str = String(s).trim().replace(' ', 'T');
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) str += 'T00:00:00';
  if (/T\d{2}:\d{2}$/.test(str)) str += ':00';
  var d = new Date(str + '+07:00');
  return isNaN(d.getTime()) ? null : d;
}

function addDays(dateStr, n) {
  var d = parseDate(dateStr);
  return formatDateOnly(new Date(d.getTime() + n * 86400000));
}

/** วันจันทร์ของสัปดาห์ (ของวันทำงาน) */
function getWeekStart(dateStr) {
  var d = parseDate(dateStr || getWorkDate());
  var dow = Number(Utilities.formatDate(d, TZ, 'u')); // 1=จันทร์
  return addDays(formatDateOnly(d), -(dow - 1));
}

function getMonthStart(dateStr) { return String(dateStr || getWorkDate()).substring(0, 8) + '01'; }

function getThaiDate(d) {
  d = d || new Date();
  var y = Number(Utilities.formatDate(d, TZ, 'yyyy')) + 543;
  return Utilities.formatDate(d, TZ, 'dd/MM/') + y;
}

function toNumber(v, def) {
  if (v === '' || v === null || v === undefined) return def === undefined ? 0 : def;
  var n = Number(String(v).replace(/,/g, ''));
  return isNaN(n) ? (def === undefined ? 0 : def) : n;
}

function safeJson(s, def) {
  if (!s) return def;
  if (typeof s === 'object') return s;
  try { return JSON.parse(s); } catch (e) { return def; }
}

function minutesBetween(a, b) {
  var da = parseDate(a), db = parseDate(b);
  if (!da || !db) return 0;
  return Math.max(0, Math.round((db.getTime() - da.getTime()) / 60000));
}

function sha256(s) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}
