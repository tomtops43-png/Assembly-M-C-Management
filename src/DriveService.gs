/**
 * DriveService.gs — เก็บรูปใน Google Drive + OCR (Drive API v3 Advanced Service)
 */
function getPhotoRootFolder() {
  var it = DriveApp.getFoldersByName(LINE_CONFIG.DRIVE_FOLDER);
  return it.hasNext() ? it.next() : DriveApp.createFolder(LINE_CONFIG.DRIVE_FOLDER);
}

function getSubFolder(parent, name) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

/** photo = dataUrl หรือ {dataUrl, name} → URL */
function savePhotoToDrive(photo, fileName, subfolder) {
  var dataUrl = typeof photo === 'string' ? photo : photo.dataUrl;
  var m = /^data:([^;]+);base64,(.*)$/.exec(String(dataUrl || ''));
  if (!m) throw new Error('รูปแบบไฟล์ไม่ถูกต้อง');
  var mime = m[1];
  var allowed = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'application/pdf': 'pdf', 'text/plain': 'txt' };
  if (!allowed[mime]) throw new Error('ไม่รองรับไฟล์ชนิด ' + mime);
  var blob = Utilities.newBlob(Utilities.base64Decode(m[2]), mime, fileName + '.' + allowed[mime]);
  var folder = getPhotoRootFolder();
  if (subfolder) folder = getSubFolder(folder, subfolder);
  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return mime.indexOf('image/') === 0
    ? 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w1200'
    : 'https://drive.google.com/file/d/' + file.getId() + '/view';
}

function savePhotos(photos, prefix, subfolder) {
  return (photos || []).slice(0, 5).map(function (p, i) { return savePhotoToDrive(p, prefix + '_' + (i + 1), subfolder); });
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
