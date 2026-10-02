/**
 * DriveService.gs — เก็บรูปใน Google Drive + OCR (Drive API v3 Advanced Service)
 */
var _photoRoot = null;

function getPhotoRootFolder() {
  if (_photoRoot) return _photoRoot;
  if (LINE_CONFIG.DRIVE_FOLDER_ID) {
    try { _photoRoot = DriveApp.getFolderById(LINE_CONFIG.DRIVE_FOLDER_ID); return _photoRoot; }
    catch (e) { console.warn('เปิดโฟลเดอร์รูป (DRIVE_FOLDER_ID) ไม่ได้: ' + (e && e.message || e)); }
  }
  var it = DriveApp.getFoldersByName(LINE_CONFIG.DRIVE_FOLDER);
  _photoRoot = it.hasNext() ? it.next() : DriveApp.createFolder(LINE_CONFIG.DRIVE_FOLDER);
  return _photoRoot;
}

function getSubFolder(parent, name) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

/**
 * โฟลเดอร์ปลายทาง: <ราก>/<หัวข้อ>/<yyyy-MM>/<yyyy-MM-dd>[/<sub>]
 * เช่น แจ้งซ่อม/2026-10/2026-10-02/MT-xxx_AC-06
 */
function getPhotoFolder(category, date, sub) {
  date = isValidDateStr(date) ? date : getWorkDate();
  var folder = getSubFolder(getPhotoRootFolder(), LINE_CONFIG.PHOTO_CATEGORIES[category] || category || 'อื่นๆ');
  folder = getSubFolder(getSubFolder(folder, date.substring(0, 7)), date);
  return sub ? getSubFolder(folder, sub) : folder;
}

/** photo = dataUrl หรือ {dataUrl, name} → URL */
function savePhotoToDrive(photo, fileName, folder) {
  var dataUrl = typeof photo === 'string' ? photo : photo.dataUrl;
  var m = /^data:([^;]+);base64,(.*)$/.exec(String(dataUrl || ''));
  if (!m) throw new Error('รูปแบบไฟล์ไม่ถูกต้อง');
  var mime = m[1];
  var allowed = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'application/pdf': 'pdf', 'text/plain': 'txt' };
  if (!allowed[mime]) throw new Error('ไม่รองรับไฟล์ชนิด ' + mime);
  var blob = Utilities.newBlob(Utilities.base64Decode(m[2]), mime, fileName + '.' + allowed[mime]);
  var file = (folder || getPhotoRootFolder()).createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return mime.indexOf('image/') === 0
    ? 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w1200'
    : 'https://drive.google.com/file/d/' + file.getId() + '/view';
}

/** opts = { category: 'maintenance' | 'rawmaterial', date: 'yyyy-MM-dd', sub: โฟลเดอร์ย่อย (ไม่บังคับ) } */
function savePhotos(photos, prefix, opts) {
  photos = (photos || []).slice(0, 5);
  if (!photos.length) return [];
  opts = opts || {};
  var folder = getPhotoFolder(opts.category, opts.date, opts.sub);
  return photos.map(function (p, i) { return savePhotoToDrive(p, prefix + '_' + (i + 1), folder); });
}

/** OCR: รูป → Google Doc (ocr) → อ่านข้อความ → ลบไฟล์ temp */
function ocrWithDrive(token, data) {
  requireLogin(token);
  var m = /^data:([^;]+);base64,(.*)$/.exec(String((data && data.image) || ''));
  if (!m) throw new Error('ไม่พบรูปภาพ');
  var blob = Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], 'ocr.jpg');
  var file = Drive.Files.create({ name: 'OCR_Temp_' + Date.now(), mimeType: 'application/vnd.google-apps.document' },
    blob, { ocr: true, ocrLanguage: 'en' });
  try {
    return { success: true, text: DocumentApp.openById(file.id).getBody().getText() };
  } finally {
    try { DriveApp.getFileById(file.id).setTrashed(true); } catch (e) {}
  }
}
