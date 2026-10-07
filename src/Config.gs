/**
 * Config.gs — ค่าเฉพาะไลน์ Assembly M/C (แก้ที่ไฟล์นี้ไฟล์เดียว)
 *
 * ช่องที่มี  // TODO(ข้อมูลไลน์)  = รอข้อมูลจริงจากผู้ใช้ ดูรายการทั้งหมดใน LINE_DATA_REQUEST.md
 */
/** หัวข้อ Fixture 1..n (ใบ Check Witness) */
function fixtureItems(n) {
  var out = [];
  for (var i = 1; i <= n; i++) out.push({ th: 'Fixture ' + i });
  return out;
}

var LINE_CONFIG = {
  LINE_NAME: 'Assembly M/C',
  LINE_CODE: 'AMC',

  // ฐานข้อมูล: ใช้ Spreadsheet นี้ "เท่านั้น" (ห้ามชี้ไปไฟล์ของไลน์อื่น)
  SPREADSHEET_ID: '1tz5Unlu2W5Zz5AUCfD1vBTdyj-FPLzOpEaUibOyhcfM',

  // โฟลเดอร์เก็บรูปใน Google Drive — แยกเป็น หัวข้อ / เดือน / วัน อัตโนมัติ (ดู DriveService.gs)
  // https://drive.google.com/drive/folders/1dMBIj2vMWPtc46d0ijKoDfTaaddYEN4B
  DRIVE_FOLDER_ID: '1dMBIj2vMWPtc46d0ijKoDfTaaddYEN4B',
  DRIVE_FOLDER: 'Assembly_MC_Photos', // ใช้เมื่อเปิดโฟลเดอร์ตาม ID ไม่ได้ (สร้างใหม่ตามชื่อ)
  PHOTO_CATEGORIES: { maintenance: 'แจ้งซ่อม', rawmaterial: 'รับวัตถุดิบ', ngissue: 'ปัญหา NG' },

  // ประเภทของเสีย (ตรงกับช่องติ๊กในใบนำส่งขยะ Scrap List) — หน้า "ทิ้งขยะ"
  WASTE_CATEGORIES: [
    { key: 'hazardous', label: 'ขยะอันตราย' },
    { key: 'recycle', label: 'ขยะรีไซเคิล' },
    { key: 'industrial', label: 'ขยะอุตสาหกรรมที่ไม่เป็นอันตราย (เศษเหลือใช้จากการผลิต)' },
    { key: 'other', label: 'อื่น ๆ' }
  ],

  NG_TARGET_PCT: 0.5, // เป้า NG% เริ่มต้น (แก้ได้จากหน้า ปัญหา NG > วิเคราะห์ — เก็บใน Script Properties)

  // หมวดสาเหตุปัญหา NG (6M) — หน้า "ปัญหา NG"
  NG_ISSUE_CATEGORIES: [
    { key: 'machine', label: 'เครื่องจักร (Machine)' },
    { key: 'material', label: 'วัตถุดิบ (Material)' },
    { key: 'man', label: 'คน (Man)' },
    { key: 'method', label: 'วิธีการ (Method)' },
    { key: 'measurement', label: 'การวัด/ตรวจสอบ (Measurement)' },
    { key: 'environment', label: 'สภาพแวดล้อม (Environment)' },
    { key: 'other', label: 'อื่นๆ' }
  ],

  // ---- ระบบซ่อมส่วนกลาง (Maintenance-Management-System) ----
  // แจ้งซ่อมที่นี่ → ส่งต่อเป็นใบ BM ใน MMS (พื้นที่ "Assembly M/C") และดึงสถานะกลับมา (ปิดงานที่ MMS = ปิดงานที่นี่)
  MMS: {
    ENABLED: true,
    URL: 'https://script.google.com/macros/s/AKfycbwvqSh_1_VU_YLMI0fBWPa-B6IFXDDId1KIr6VYJAtsh0wUn6Jtln5ryJYR0luxqLc-Ew/exec',
    WEB_URL: 'https://tomtops43-png.github.io/Maintenance-Management-System/jobs.html',
    AREA: 'Assembly M/C',                                   // ไลน์หลักใน MMS
    LINE_BY_GROUP: { 'Arc chute': 'Arc chute', 'GV.2': 'GV.2', 'Arc Stack': 'Arc Stack' }, // กลุ่มเครื่อง → ไลน์/เครื่องหลักใน MMS
    MC_BY_MACHINE: {},                                      // MachineID → M/C No. ใน MMS (ไม่ใส่ = ใช้ชื่อเครื่อง)
    PRIORITY_MAP: { critical: 'ด่วนมาก (เครื่องหยุด)', high: 'ด่วน', medium: 'ปกติ', low: 'ปกติ' },
    SYNC_SECONDS: 120                                        // ดึงสถานะจาก MMS ได้ไม่ถี่กว่านี้
  },

  // ---- เวลา / กะ ----
  WORKDAY_START_HOUR: 8,   // วันทำงานตัดรอบ 08:00
  DAY_SHIFT_START: 8,      // Day = 08:00-19:59
  NIGHT_SHIFT_START: 20,   // Night = 20:00-07:59
  NET_HOURS_PER_SHIFT: 10.5,            // ยืนยันจากป้ายเป้าหมาย JRTL-EI-030 (1 คน/10.5 ชม.) = ชม.ปกติ + OT
  NORMAL_HOURS_PER_SHIFT: 8,            // ชม.ทำงานปกติต่อกะ (ไม่มี OT) — ยืนยันจากไลน์
  OT_HOURS_PER_SHIFT: 2.5,              // OT ต่อกะ: เช้า 17:30-20:00, ดึก 05:30-08:00
  // ช่วงเวลา (ชั่วโมง) ที่ถือว่าเป็น OT — มีการลงยอดในช่วงนี้ = กะนั้นมี OT (17:00-17:59 / 05:00-05:59 ยังเป็นเวลาปกติส่วนใหญ่)
  OT_HOURS: { Day: [18, 19], Night: [6, 7] },

  SESSION_HOURS: 12,

  // ---- ยอดผลิต ----
  DEFAULT_QTY: 0,                 // TODO(ข้อมูลไลน์) ยอดเริ่มต้นต่อชั่วโมง/ต่อรายการ
  DEFECT_AGGREGATE: 'max',        // 'max' = NG = ค่าสูงสุดของ component (แบบ H1) | 'sum' = บวกรวม
  NG_ROW_SEPARATE: true,          // true = ถ้ามี NG ให้ ActualQty = 0 (แถว NG แยกจากแถว FG แบบ H1)

  // อาการ NG (dropdown หน้า กรอกยอด/คัดแยก) — "อื่นๆ" ต้องอยู่ท้ายเสมอ
  NG_REASONS: ['อื่นๆ'],          // TODO(ข้อมูลไลน์)

  // กลุ่มชิ้นส่วนที่ใช้แยก NG (แทน Lug/Screw ของ H1) — keyword จับจากชื่อ component
  // ตัวอย่าง: [{ code:'PARTA', label:'Part A', keywords:['parta'] }, ...]
  DEFECT_PART_GROUPS: [],         // TODO(ข้อมูลไลน์)

  // ---- คัดแยก (Sorting) ----
  SORTING_PROCESSES: ['FG', 'ไลน์ผลิต'],       // กระบวนการที่พบ (ยืนยันแล้ว — ตัด QC ออก)
  SORTING_FG_PROCESSES: ['FG'],                 // กระบวนการที่ถือว่านับเป็น FG ไปแล้ว
  SORTING_ADJUST_NG_REASON: 'ปรับยอดจากการคัดแยก',

  // ---- แจ้งซ่อม ----
  ISSUE_TYPES: [
    { key: 'breakdown', label: 'เครื่องเสีย', icon: 'bi-exclamation-octagon' },
    { key: 'preventive', label: 'บำรุงรักษา', icon: 'bi-tools' },
    { key: 'quality', label: 'คุณภาพ', icon: 'bi-patch-exclamation' },
    { key: 'material', label: 'วัตถุดิบหมด', icon: 'bi-box' }, // TODO(ข้อมูลไลน์) ชื่อปุ่ม
    { key: 'other', label: 'อื่นๆ', icon: 'bi-three-dots' }
  ],
  STOCKOUT_REGEX: 'วัตถุดิบหมด|รอวัตถุดิบ|ของหมด|out of stock|no material',

  // ---- Daily Check + Check Witness (ตรวจกะละครั้ง: กะเช้า / กะดึก, √ / X) ----
  // FORMS = แบบฟอร์มแยกตามเครื่อง (1 เครื่องมีได้หลายใบ เช่น Daily + Witness) ; เครื่องที่ไม่มีฟอร์มจะขึ้นว่า "ยังไม่มีหัวข้อ"
  //   type: 'daily' | 'witness' ; tab = ชื่อแท็บในหน้าเว็บ ; products = ใช้เฉพาะตอนผลิตรุ่นนี้ (ไม่ใส่ = ทุกรุ่น)
  DAILY_CHECK: {
    TITLE: 'รายการตรวจสอบเครื่องจักรประจำวัน',
    FORMS: [
      {
        id: 'ARC-CHUTE', type: 'daily', tab: 'Daily Check', name: 'เครื่อง Arc Chute', docNo: 'JRTLQR713/714-13-1',
        machines: ['AC-06', 'AC-07', 'AC-08'], // ไฟล์ Arc5678.xlsx
        items: [
          { th: 'ตรวจเช็คปุ่มกด หยุดฉุกเฉิน (Emergency Stop) อยู่ในสภาพสมบูรณ์ พร้อมใช้งาน ไม่แตกชำรุดและต้องคลายออก' },
          { th: 'ตรวจเช็ค Die อยู่ในสภาพสมบูรณ์ เป่าทำความสะอาด DIE ก่อนเริ่มงานและหลังเลิกงาน' },
          { th: 'ตรวจเช็คระบบลม 0.6-0.8 MPa อยู่ในค่าที่กำหนด' },
          { th: 'ตรวจเช็คหน้าจอดิสเพลย์ ไม่โชว์ Alarm แสดงตัวอักษรปกติ' },
          { th: 'ผลการทดสอบ Witness ผ่านครบ 10 Fixture' },
          { th: 'ตรวจเช็คกระบอกลม V1-V14 อยู่ในสภาพสมบูรณ์ พร้อมใช้งาน' },
          { th: 'ตรวจเช็ค Safety Door อยู่ในสภาพสมบูรณ์ พร้อมใช้งาน' },
          { th: 'ตรวจเช็คจุกต่อสายลม ว่ามีจุดแตกหรือเสียงดัง' },
          { th: 'ตรวจเช็คเสียงผิดปกติรอบเครื่องจักร' },
          { th: 'ตรวจเช็ค 5ส ในพื้นที่การทำงาน' }
        ]
      },
      {
        id: 'ARC-CHUTE-BETA', type: 'daily', tab: 'Daily Check', name: 'เครื่อง Arc Chute Beta (เครื่อง 3)', docNo: 'JRTLQR713/714-13-1',
        machines: ['AC-BETA'], // ไฟล์ Arc3.xlsx (กะดึกใช้หัวข้อเดียวกับกะเช้า — ยืนยันแล้ว)
        items: [
          { th: 'ตรวจเช็คปุ่มกด หยุดฉุกเฉิน (Emergency Stop) อยู่ในสภาพสมบูรณ์ พร้อมใช้งาน ไม่แตกชำรุดและต้องคลายออก' },
          { th: 'ตรวจเช็ค Die อยู่ในสภาพสมบูรณ์ เป่าทำความสะอาด DIE ก่อนเริ่มงานและหลังเลิกงาน' },
          { th: 'ตรวจเช็คระบบลม 0.6-0.8 MPa อยู่ในค่าที่กำหนด' },
          { th: 'ตรวจเช็คหน้าจอดิสเพลย์ ไม่โชว์ Alarm แสดงตัวอักษรปกติ' },
          { th: 'ผลการทดสอบ Witness ผ่านครบ 12 Fixture' },
          { th: 'ตรวจเช็คกระบอกลมทุกตัว อยู่ในสภาพสมบูรณ์ พร้อมใช้งาน' },
          { th: 'ตรวจเช็ค Safety Door อยู่ในสภาพสมบูรณ์ พร้อมใช้งาน' },
          { th: 'ตรวจเช็คจุกต่อสายลม ว่ามีจุดแตกหรือเสียงดัง' },
          { th: 'ตรวจเช็คเสียงผิดปกติรอบเครื่องจักร' },
          { th: 'ตรวจเช็ค 5ส ในพื้นที่การทำงาน' }
        ]
      },
      {
        id: 'GV2', type: 'daily', tab: 'Daily Check', name: 'เครื่อง GV.2 (เครื่อง 4)', docNo: 'JRTLQR713/714-13-1',
        machines: ['GV-2'], // ไฟล์ GV.2.xlsx
        items: [
          { th: 'ตรวจเช็คปุ่มกด หยุดฉุกเฉิน (Emergency Stop) อยู่ในสภาพสมบูรณ์ พร้อมใช้งาน ไม่แตกชำรุดและต้องคลายออก' },
          { th: 'ตรวจเช็ค Die อยู่ในสภาพสมบูรณ์ เป่าทำความสะอาด DIE ก่อนเริ่มงานและหลังเลิกงาน' },
          { th: 'ตรวจเช็คระบบลม 0.5-0.8 MPa อยู่ในค่าที่กำหนด' },
          { th: 'ตรวจเช็คหน้าจอดิสเพลย์ ไม่โชว์ Alarm แสดงตัวอักษรปกติ' },
          { th: 'ผลการทดสอบ Witness ผ่านครบ 6 Fixture, 9 Fixture' },
          { th: 'ตรวจเช็คกระบอกลม V1-V17 อยู่ในสภาพสมบูรณ์ พร้อมใช้งาน' },
          { th: 'ตรวจเช็ค Safety Door อยู่ในสภาพสมบูรณ์ พร้อมใช้งาน' },
          { th: 'ตรวจเช็คจุกต่อสายลม ว่ามีจุดแตกหรือเสียงดัง' },
          { th: 'ตรวจเช็คเสียงผิดปกติรอบเครื่องจักร' },
          { th: 'ตรวจเช็ค 5ส ในพื้นที่การทำงาน และสถานะตู้อบ Fiber' }
        ]
      },
      {
        id: 'ARC-STACK', type: 'daily', tab: 'Daily Check', name: 'เครื่อง Arc Stack', docNo: 'JRTLQR713/714-13-1',
        machines: ['AS-MED', 'AS-HIGH'], // ไฟล์ Arc_Stack.xlsx (กะเช้า/กะดึกหัวข้อเดียวกัน)
        items: [
          { th: 'ยืนยันว่าสายพานไม่ได้รับความเสียหายและเป็นระเบียบเรียบร้อยดี' },
          { th: 'หลังเสร็จสิ้นการผลิต โต๊ะเครื่อง ถังเหล็กแผ่น และชิ้นงานที่หล่นพื้นจะถูกเก็บและทำความสะอาดทุกกะ' },
          { th: 'รูดูดของหัวแรงดัน เครื่องกรองผงกระดาษ ทำความสะอาดวันละ 1 ครั้ง' },
          { th: 'เซ็นเซอร์ตรวจจับไฟเบอร์ (Fiber) ทำงานปกติ' },
          { th: 'แรงดันปั๊มน้ำมัน 5.5 - 6.5 MPa' },
          { th: 'บารอมิเตอร์ (Barometer) 0.5 - 0.6 MPa' },
          { th: 'ตรวจสอบเซ็นเซอร์กระบอกสูบ (ทุกตัว) ทำงานปกติ' },
          { th: 'ยืนยันว่าเครื่องป้อนไฟเบอร์ (Fiber) ไม่มีสายติดหมุนและทำงานปกติ' },
          { th: 'ปุ่มกด เปิด - ปิด เสถียรและใช้งานได้ปกติ หน้าจอแสดงผลแสดงผลตามปกติ และตัวนับชิ้นงานจะถูกรีเซ็ตเป็นค่าเริ่มต้นหลังเปลี่ยนกะทุกครั้ง' },
          { th: 'เซ็นเซอร์ตรวจจับเหล็กแผ่น ARC PLATE ทำงานปกติ' },
          { th: 'การทำงานของเซ็นเซอร์ตรวจจับรางเหล็กทำงานปกติ' },
          { th: 'ตรวจหมุดย้ำงานให้อยู่ในสภาพพร้อมใช้งาน' }
        ]
      },
      // ---- Check Witness (เช็ค Master) — JRTL-AI-003_Form_Check_Witness.xlsx ----
      // Arc Stack: medium = 9 Fixture, high = 10 Fixture
      {
        id: 'WITNESS-10', type: 'witness', tab: 'Witness', name: 'Form Check Witness Arc Stack High / Arc Chute (10 Fixture)', docNo: 'JRTL-AI-003',
        okLabel: 'ยอมรับ', ngLabel: 'ไม่ยอมรับ', machines: ['AC-06', 'AC-07', 'AC-08', 'AS-HIGH'], items: fixtureItems(10)
      },
      {
        id: 'WITNESS-9', type: 'witness', tab: 'Witness', name: 'Form Check Witness Arc Stack Medium (9 Fixture)', docNo: 'JRTL-AI-003',
        okLabel: 'ยอมรับ', ngLabel: 'ไม่ยอมรับ', machines: ['AS-MED'], items: fixtureItems(9)
      },
      {
        id: 'WITNESS-12', type: 'witness', tab: 'Witness', name: 'Form Check Witness Arc Chute Beta (12 Fixture)', docNo: 'JRTL-AI-003',
        okLabel: 'ยอมรับ', ngLabel: 'ไม่ยอมรับ', machines: ['AC-BETA'], items: fixtureItems(12)
      },
      // GV.2: ในไฟล์รวม 6/9 Plate ไว้ชีทเดียว → แยกตามรุ่นที่ผลิต
      {
        id: 'WITNESS-GV2-6P', type: 'witness', tab: 'Witness 6 Plate', name: 'Form Check Witness GV2 6 Plate (6 Fixture)', docNo: 'JRTL-AI-003',
        okLabel: 'ยอมรับ', ngLabel: 'ไม่ยอมรับ', machines: ['GV-2'], products: ['W813890060190-JR'], items: fixtureItems(6)
      },
      {
        id: 'WITNESS-GV2-9P', type: 'witness', tab: 'Witness 9 Plate', name: 'Form Check Witness GV2 9 Plate (9 Fixture)', docNo: 'JRTL-AI-003',
        okLabel: 'ยอมรับ', ngLabel: 'ไม่ยอมรับ', machines: ['GV-2'], products: ['W813890890211-JR'], items: fixtureItems(9)
      }
    ]
  },

  INBOX_AM_CHECKSHEET: false, // TODO(ข้อมูลไลน์) ต้องการข้อความ AM Check Sheet ทุกวันไหม

  // กลุ่มเครื่องจักร (ไลน์ย่อย) — ใช้จัดลำดับการแสดงผล ; กลุ่มที่ไม่อยู่ในรายการจะต่อท้าย
  MACHINE_GROUPS: ['Arc chute', 'GV.2', 'Arc Stack'],

  // รหัสสินค้าชั่วคราว → รหัส FG จริง (migrateProductCodes ใน ProductService.gs เปลี่ยนให้ทุกชีทอัตโนมัติครั้งเดียว)
  // Cut chamber #5–#8 ใช้รหัส FG เดียวกัน → รวมเป็นสินค้าเดียว
  PRODUCT_CODE_MIGRATION: {
    'AS-MEDIUM': 'S1A23976-D', 'AS-HIGH': 'S1A23969-D',
    'GV2-6P': 'W813890060190-JR', 'GV2-9P': 'W813890890211-JR',
    'CC-5': '51207116JR', 'CC-6': '51207116JR', 'CC-7': '51207116JR', 'CC-8': '51207116JR'
  },

  // โมดูลที่เปิดใช้ (ปิดได้)  — cost/labor เปิดในเฟส 2
  MODULES: {
    production: true, dailycheck: true, inbox: true, maintenance: true, joborders: true,
    rawmaterial: true, sorting: true, waste: true, alarm: true, ngissue: true, machines: true,
    dashboard: true, cost: false, labor: false, admin: true
  },

  // ---- Seed (initializeSystem) — ว่างไว้ก่อน กรอกผ่านหน้า "จัดการ" ได้ ----
  SEED: {
    // กลุ่ม (ไลน์ย่อย) → เครื่อง → สินค้าที่ผลิตได้
    // capacity เครื่อง = 0 → ใช้ capacity ของสินค้าที่กำลังผลิต
    // Arc chute 06/07/08/Beta = Cut chamber #6/#7/#8/#5 (ยืนยันแล้ว)
    machines: [
      // Arc chute 4 เครื่องผลิตรหัส FG เดียวกัน (51207116JR) → capacity ตั้งที่เครื่อง (สินค้า capacity = 0)
      { id: 'AC-06', name: 'Arc chute 06', group: 'Arc chute', capacity: 2000, products: ['51207116JR'] },
      { id: 'AC-07', name: 'Arc chute 07', group: 'Arc chute', capacity: 2375, products: ['51207116JR'] },
      { id: 'AC-08', name: 'Arc chute 08', group: 'Arc chute', capacity: 2375, products: ['51207116JR'] },
      { id: 'AC-BETA', name: 'Arc chute Beta', group: 'Arc chute', capacity: 2375, products: ['51207116JR'] },
      { id: 'GV-2', name: 'GV.2', group: 'GV.2', capacity: 0, products: ['W813890060190-JR', 'W813890890211-JR'] },
      { id: 'AS-MED', name: 'Arc Stack medium', group: 'Arc Stack', capacity: 0, products: ['S1A23976-D'] },
      { id: 'AS-HIGH', name: 'Arc Stack High', group: 'Arc Stack', capacity: 0, products: ['S1A23969-D'] }
    ],
    // เป้าหมายประจำวัน (JRTL-EI-030 A/0, 26.08.2024): capacity = ชิ้น / คน / ชม. (คิด 1 เครื่อง = 1 คน) ; defaultQty = ยอดเริ่มต้นต่อชั่วโมง
    // รหัส FG + ราคาต่อหน่วย ยืนยันจากไลน์แล้ว (Assembly_MC_FG_Code.xlsx)
    products: [
      { code: 'S1A23976-D', name: 'Arc stack Medium', capacity: 750, defaultQty: 750, unitPrice: 9.48094852941176 },
      { code: 'S1A23969-D', name: 'Arc stack High', capacity: 875, defaultQty: 875, unitPrice: 13.3794933712121 },
      { code: 'W813890060190-JR', name: 'GV2 6 Plate', capacity: 2285, defaultQty: 2285, unitPrice: 1.54497305194805 },
      { code: 'W813890890211-JR', name: 'GV2 9 Plate', capacity: 1875, defaultQty: 1875, unitPrice: 1.54497305194805 },
      { code: '51207116JR', name: 'Cut chamber', capacity: 0, defaultQty: 2375, unitPrice: 1.15955914285714 }
    ],
    bom: [],             // TODO(ข้อมูลไลน์) [{ productCode:'', componentCode:'', componentName:'', qtyPerUnit:1, supplier:'' }]
    materialAliases: [], // TODO(ข้อมูลไลน์) [{ alias:'', canonical:'' }]
    wasteTypes: [],      // TODO(ข้อมูลไลน์)
    alarmTypes: []       // TODO(ข้อมูลไลน์)
  }
};

/** โครงสร้างทุกชีท (แถว 1 = header) */
var SHEET_SCHEMAS = {
  Users: ['EmployeeID', 'Name', 'PIN', 'Role', 'Shift', 'Active', 'CreatedAt', 'Permissions', 'ResignedAt', 'ResignReason'],
  Products: ['ProductCode', 'ProductName', 'DefaultQty', 'Active', 'UnitPrice', 'Capacity'],
  BOM: ['ProductCode', 'ComponentCode', 'ComponentName', 'QtyPerUnit', 'Supplier'],
  MaterialAlias: ['AliasCode', 'CanonicalCode', 'Note', 'Active'],
  Machines: ['MachineID', 'MachineName', 'Line', 'Status', 'AssignedProducts', 'CurrentProduct', 'Capacity', 'CurrentJobOrder', 'Installed', 'MachineGroup'],
  JobOrders: ['JobOrderID', 'CreatedAt', 'CreatedBy', 'CreatedByName', 'WorkDate', 'DueDate', 'MachineID', 'ProductCode', 'Shift', 'PlannedQty', 'Priority', 'Status', 'Remark'],
  NgReasons: ['ReasonID', 'ReasonName', 'MachineGroup', 'Active', 'CreatedAt', 'CreatedBy'],
  WasteTypes: ['TypeID', 'TypeName', 'Active', 'CreatedAt', 'CreatedBy', 'Category'],
  AlarmTypes: ['TypeID', 'TypeName', 'Active', 'CreatedAt', 'CreatedBy'],
  Positions: ['PositionID', 'PositionName', 'Category', 'Active', 'CreatedAt', 'CreatedBy'],

  ProductionLog: ['LogID', 'Timestamp', 'Date', 'Shift', 'TimePeriod', 'EmployeeID', 'EmployeeName', 'MachineID', 'ProductCode', 'PlannedQty', 'ActualQty', 'DefectQty', 'DefectDetails', 'Remark', 'Status', 'ClientRequestID', 'JobOrderID', 'OT'],
  Inbox: ['InboxID', 'EmployeeID', 'Type', 'Title', 'Message', 'RefID', 'Status', 'CreatedAt', 'CreatedBy'],
  ActionLog: ['ActionID', 'Timestamp', 'EmployeeID', 'EmployeeName', 'Action', 'Payload'],
  MaintenanceLog: ['TicketID', 'Timestamp', 'Date', 'ShiftAB', 'ShiftDN', 'ReportedBy', 'ReporterName', 'MachineID', 'IssueType', 'Description', 'Priority', 'Status', 'AssignedTo', 'ResolvedAt', 'DowntimeMinutes', 'Resolution', 'Photos', 'ResolutionPhotos', 'ClientRequestID', 'MmsJobNo', 'MmsStatus', 'MmsError'],
  RawMaterialLog: ['ReceiveID', 'Timestamp', 'Date', 'ReceivedBy', 'ReceiverName', 'MachineID', 'PartCode', 'SupplierCode', 'PartName', 'Specification', 'Quantity', 'Unit', 'LotNumber', 'Inspector', 'Customer', 'NetWeight', 'GrossWeight', 'CartonNo', 'PackingDate', 'RefNo', 'Remark', 'Photos', 'Status'],
  SortingLog: ['JobID', 'Timestamp', 'Date', 'Shift', 'ShiftDN', 'MachineID', 'ProductCode', 'FoundProcess', 'TotalQty', 'GoodQty', 'DefectQty', 'DefectDetails', 'Status', 'RegisteredBy', 'RegisteredByName', 'SortedBy', 'SortedByName', 'PulledAt', 'CompletedAt', 'Remark', 'JobOrderID'],
  WasteLog: ['WasteID', 'Timestamp', 'Date', 'RecordedBy', 'RecorderName', 'WasteType', 'WeightKg', 'Remark', 'Category'],
  NgIssues: ['IssueID', 'Title', 'Category', 'MachineID', 'ProductCode', 'Description', 'RootCause', 'Countermeasure', 'Status', 'CreatedAt', 'CreatedBy', 'CreatorName', 'UpdatedAt', 'UpdatedBy', 'ClosedAt', 'ClosedBy'],
  NgIssueLog: ['OccurrenceID', 'IssueID', 'Timestamp', 'Date', 'Shift', 'MachineID', 'ProductCode', 'NgQty', 'Detail', 'Photos', 'RecordedBy', 'RecorderName', 'ClientRequestID'],
  AlarmLog: ['AlarmID', 'Timestamp', 'Date', 'Shift', 'MachineID', 'AlarmType', 'Count', 'DurationMinutes', 'RecordedBy', 'RecorderName', 'Remark'],
  DailyCheckLog: ['CheckID', 'Timestamp', 'Date', 'Shift', 'ShiftDN', 'TimePeriod', 'MachineID', 'Results', 'Decision', 'Remark', 'RecordedBy', 'RecorderName', 'Status', 'ClientRequestID', 'UpdatedAt', 'UpdatedBy', 'FormID', 'VerifiedBy', 'VerifiedAt'],

  // เดิมอยู่ไฟล์ลับ — ไลน์นี้เก็บในไฟล์เดียวตามที่กำหนด (ใช้ในเฟส 2)
  LaborEmployees: ['EmployeeID', 'EmployeeName', 'PositionID', 'PositionName', 'Category', 'Shift', 'DailyRate', 'OTHourlyRate', 'Active', 'CreatedAt', 'CreatedBy'],
  CostPLConfig: ['ProductCode', 'ItemCode', 'YearMonth', 'Amount', 'UpdatedAt', 'UpdatedBy']
};

/** ค่าที่ส่งให้หน้าเว็บ (ไม่มีข้อมูลลับ) */
function getPublicLineConfig() {
  var c = LINE_CONFIG;
  return {
    lineName: c.LINE_NAME, lineCode: c.LINE_CODE,
    defaultQty: c.DEFAULT_QTY, defectAggregate: c.DEFECT_AGGREGATE, ngRowSeparate: c.NG_ROW_SEPARATE,
    ngReasons: c.NG_REASONS, defectPartGroups: c.DEFECT_PART_GROUPS,
    sortingProcesses: c.SORTING_PROCESSES, sortingFgProcesses: c.SORTING_FG_PROCESSES,
    issueTypes: c.ISSUE_TYPES, machineGroups: c.MACHINE_GROUPS, dailyCheck: c.DAILY_CHECK, modules: c.MODULES, ngIssueCategories: c.NG_ISSUE_CATEGORIES, wasteCategories: c.WASTE_CATEGORIES,
    netHoursPerShift: c.NET_HOURS_PER_SHIFT, normalHoursPerShift: c.NORMAL_HOURS_PER_SHIFT, otHoursPerShift: c.OT_HOURS_PER_SHIFT,
    mms: c.MMS && c.MMS.ENABLED ? { webUrl: c.MMS.WEB_URL, area: c.MMS.AREA } : null
  };
}
