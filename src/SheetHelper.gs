/**
 * SheetHelper.gs — ชั้นฐานข้อมูล (Google Sheets)
 * ทุกชีทอยู่ใน Spreadsheet เดียว: LINE_CONFIG.SPREADSHEET_ID
 */
var _ss = null;
var _headerCache = {};
var MASTER_CACHE_KEY = 'amc_masters_v1';
var MASTER_SHEETS = ['Machines', 'Products', 'BOM', 'MaterialAlias'];

// คอลัมน์ที่บังคับเป็นข้อความ (กันรหัส 0012 → 12, วันที่ถูกแปลงเป็น Date)
var TEXT_COLUMN_RE = /(ID|Code|^PIN|Date|^Timestamp|^TimePeriod|At$|LotNumber|RefNo|CartonNo|YearMonth|Shift)$/;

function getSpreadsheet() {
  if (!_ss) _ss = SpreadsheetApp.openById(LINE_CONFIG.SPREADSHEET_ID);
  return _ss;
}

function getSheet(name) { return getSpreadsheet().getSheetByName(name); }

function withLock(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function columnLetter(n) {
  var s = '';
  while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function applyTextFormat(sh, headers, startCol) {
  headers.forEach(function (h, i) {
    if (TEXT_COLUMN_RE.test(h)) {
      var col = columnLetter((startCol || 1) + i);
      sh.getRange(col + ':' + col).setNumberFormat('@');
    }
  });
}

/** สร้างชีทถ้ายังไม่มี + เติมคอลัมน์ที่ขาด (self-heal) */
function ensureSheetExists(name, headers) {
  headers = headers || SHEET_SCHEMAS[name];
  var sh = getSheet(name);
  if (!sh) {
    withLock(function () {
      sh = getSheet(name);
      if (sh) return;
      sh = getSpreadsheet().insertSheet(name);
      sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
      sh.setFrozenRows(1);
      applyTextFormat(sh, headers, 1);
    });
    delete _headerCache[name];
    return sh;
  }
  var existing = getHeaders(name);
  headers.forEach(function (h) { if (existing.indexOf(h) < 0) ensureColumnExists(name, h); });
  return sh;
}

function getHeaders(name) {
  if (_headerCache[name]) return _headerCache[name];
  var sh = getSheet(name);
  if (!sh || sh.getLastColumn() === 0) return [];
  var h = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  _headerCache[name] = h;
  return h;
}

function ensureColumnExists(name, col) {
  if (getHeaders(name).indexOf(col) >= 0) return;
  withLock(function () {
    delete _headerCache[name];
    var headers = getHeaders(name);
    if (headers.indexOf(col) >= 0) return;
    var sh = getSheet(name);
    var c = headers.length + 1;
    sh.getRange(1, c).setValue(col).setFontWeight('bold');
    applyTextFormat(sh, [col], c);
  });
  delete _headerCache[name];
}

/** Date object → string (ไม่เรียก formatDate ทุกเซลล์: +7 ชม. แล้วอ่าน UTC) */
function normalizeCell(v) {
  if (v instanceof Date) {
    var d = new Date(v.getTime() + 7 * 3600000);
    var p = function (n) { return ('0' + n).slice(-2); };
    var date = d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate());
    if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0) return date;
    return date + ' ' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()) + ':' + p(d.getUTCSeconds());
  }
  return v;
}

function rowsToObjects(headers, values, startRow) {
  return values.map(function (row, i) {
    var o = {};
    for (var c = 0; c < headers.length; c++) o[headers[c]] = normalizeCell(row[c]);
    o._row = startRow + i;
    return o;
  });
}

function getAllRows(name) {
  var sh = getSheet(name);
  if (!sh) return [];
  var last = sh.getLastRow();
  if (last < 2) return [];
  var headers = getHeaders(name);
  return rowsToObjects(headers, sh.getRange(2, 1, last - 1, headers.length).getValues(), 2);
}

/** อ่านจากท้ายชีทขึ้นไปทีละ chunk จนเลย cutoff (log ที่ append-only) */
function getRowsSince(name, tsCol, cutoff, chunk) {
  chunk = chunk || 500;
  var sh = getSheet(name);
  if (!sh) return [];
  var last = sh.getLastRow();
  if (last < 2) return [];
  var headers = getHeaders(name);
  var idx = headers.indexOf(tsCol);
  var out = [];
  var end = last;
  while (end >= 2) {
    var start = Math.max(2, end - chunk + 1);
    var rows = rowsToObjects(headers, sh.getRange(start, 1, end - start + 1, headers.length).getValues(), start);
    var stop = false;
    for (var i = rows.length - 1; i >= 0; i--) {
      var ts = String(rows[i][tsCol] || '');
      if (idx >= 0 && ts && ts < cutoff) { stop = true; continue; }
      out.push(rows[i]);
    }
    if (stop) break;
    end = start - 1;
  }
  return out.reverse();
}

function appendRow(name, obj) {
  ensureSheetExists(name);
  var headers = getHeaders(name);
  var row = headers.map(function (h) {
    var v = obj[h];
    if (v === undefined || v === null) return '';
    if (typeof v === 'object') return JSON.stringify(v);
    return v;
  });
  withLock(function () { getSheet(name).appendRow(row); });
  afterWrite(name);
  return obj;
}

function updateRow(name, matchCol, matchVal, updates) {
  var ok = withLock(function () {
    var sh = getSheet(name);
    if (!sh || sh.getLastRow() < 2) return false;
    var headers = getHeaders(name);
    var ci = headers.indexOf(matchCol);
    if (ci < 0) return false;
    var col = sh.getRange(2, ci + 1, sh.getLastRow() - 1, 1).getValues();
    for (var i = 0; i < col.length; i++) {
      if (String(col[i][0]) === String(matchVal)) {
        Object.keys(updates).forEach(function (k) {
          var c = headers.indexOf(k);
          if (c < 0) return;
          var v = updates[k];
          if (v !== null && typeof v === 'object') v = JSON.stringify(v);
          sh.getRange(i + 2, c + 1).setValue(v === undefined || v === null ? '' : v);
        });
        return true;
      }
    }
    return false;
  });
  if (ok) afterWrite(name);
  return ok;
}

function deleteRows(name, predicate) {
  var n = withLock(function () {
    var rows = getAllRows(name).filter(predicate);
    var sh = getSheet(name);
    rows.sort(function (a, b) { return b._row - a._row; }).forEach(function (r) { sh.deleteRow(r._row); });
    return rows.length;
  });
  if (n) afterWrite(name);
  return n;
}

function deleteRow(name, matchCol, matchVal) {
  return deleteRows(name, function (r) { return String(r[matchCol]) === String(matchVal); }) > 0;
}

function findRows(name, pred) { return getAllRows(name).filter(pred); }

function findRow(name, col, val) {
  var rows = getAllRows(name);
  for (var i = 0; i < rows.length; i++) if (String(rows[i][col]) === String(val)) return rows[i];
  return null;
}

function countRows(name, pred) { return findRows(name, pred).length; }

function isActiveValue(v) {
  var s = String(v).toLowerCase().trim();
  return v === true || v === 1 || s === 'true' || s === '1' || s === 'yes';
}

// ---------- Master data cache + version stamp ----------
function afterWrite(name) {
  if (MASTER_SHEETS.indexOf(name) < 0) return;
  SpreadsheetApp.flush();
  CacheService.getScriptCache().remove(MASTER_CACHE_KEY);
  PropertiesService.getScriptProperties().setProperty('MASTER_DATA_VERSION', String(Date.now()));
}

function getMasterDataVersion() {
  return PropertiesService.getScriptProperties().getProperty('MASTER_DATA_VERSION') || '0';
}

function getMasterData() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get(MASTER_CACHE_KEY);
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }
  var data = {
    machines: getAllRows('Machines'),
    products: getAllRows('Products'),
    bom: getAllRows('BOM'),
    aliases: getAllRows('MaterialAlias')
  };
  var json = JSON.stringify(data);
  if (json.length < 90000) cache.put(MASTER_CACHE_KEY, json, 21600);
  return data;
}
