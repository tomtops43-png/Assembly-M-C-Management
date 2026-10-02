/**
 * Config.gs — ค่าเฉพาะไลน์ Assembly M/C (แก้ที่ไฟล์นี้ไฟล์เดียว)
 *
 * ช่องที่มี  // TODO(ข้อมูลไลน์)  = รอข้อมูลจริงจากผู้ใช้ ดูรายการทั้งหมดใน LINE_DATA_REQUEST.md
 */
var LINE_CONFIG = {
  LINE_NAME: 'Assembly M/C',
  LINE_CODE: 'AMC',

  // ฐานข้อมูล: ใช้ Spreadsheet นี้ "เท่านั้น" (ห้ามชี้ไปไฟล์ของไลน์อื่น)
  SPREADSHEET_ID: '1tz5Unlu2W5Zz5AUCfD1vBTdyj-FPLzOpEaUibOyhcfM',

  // โฟลเดอร์เก็บรูปใน Google Drive (สร้างอัตโนมัติ)
  DRIVE_FOLDER: 'Assembly_MC_Photos',

  // ---- เวลา / กะ ----
  WORKDAY_START_HOUR: 8,   // วันทำงานตัดรอบ 08:00
  DAY_SHIFT_START: 8,      // Day = 08:00-19:59
  NIGHT_SHIFT_START: 20,   // Night = 20:00-07:59
  NET_HOURS_PER_SHIFT: 10.5,            // TODO(ข้อมูลไลน์) ชั่วโมงสุทธิ/กะ (ใช้คิด OEE)
  OT_HOURS: { Day: [18, 19], Night: [6, 7] }, // TODO(ข้อมูลไลน์) ชั่วโมงที่นับเป็น OT
  OT_HOURS_PER_DAY: 2.5,

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
  SORTING_PROCESSES: ['FG', 'ไลน์ผลิต', 'QC'], // TODO(ข้อมูลไลน์) กระบวนการที่พบ
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

  // ---- Daily Check ----
  DAILY_CHECK: {
    TITLE: 'Daily Check',  // TODO(ข้อมูลไลน์) ชื่อเอกสาร
    SAMPLE_QTY: 0,         // TODO(ข้อมูลไลน์) จำนวนสุ่ม/เครื่อง/ชั่วโมง
    ITEMS: []              // TODO(ข้อมูลไลน์) [{ th:'...', en:'...' }, ...]
  },

  INBOX_AM_CHECKSHEET: false, // TODO(ข้อมูลไลน์) ต้องการข้อความ AM Check Sheet ทุกวันไหม

  // โมดูลที่เปิดใช้ (ปิดได้)  — cost/labor เปิดในเฟส 2
  MODULES: {
    production: true, dailycheck: true, inbox: true, maintenance: true, joborders: true,
    rawmaterial: true, sorting: true, waste: true, alarm: true, machines: true,
    dashboard: true, cost: false, labor: false, admin: true
  },

  // ---- Seed (initializeSystem) — ว่างไว้ก่อน กรอกผ่านหน้า "จัดการ" ได้ ----
  SEED: {
    machines: [],        // TODO(ข้อมูลไลน์) [{ id:'AM-01', name:'Assembly 1', capacity:0 }]
    products: [],        // TODO(ข้อมูลไลน์) [{ code:'', name:'', defaultQty:0, unitPrice:0 }]
    bom: [],             // TODO(ข้อมูลไลน์) [{ productCode:'', componentCode:'', componentName:'', qtyPerUnit:1, supplier:'' }]
    materialAliases: [], // TODO(ข้อมูลไลน์) [{ alias:'', canonical:'' }]
    wasteTypes: [],      // TODO(ข้อมูลไลน์)
    alarmTypes: []       // TODO(ข้อมูลไลน์)
  }
};

/** โครงสร้างทุกชีท (แถว 1 = header) */
var SHEET_SCHEMAS = {
  Users: ['EmployeeID', 'Name', 'PIN', 'Role', 'Shift', 'Active', 'CreatedAt', 'Permissions'],
  Products: ['ProductCode', 'ProductName', 'DefaultQty', 'Active', 'UnitPrice'],
  BOM: ['ProductCode', 'ComponentCode', 'ComponentName', 'QtyPerUnit', 'Supplier'],
  MaterialAlias: ['AliasCode', 'CanonicalCode', 'Note', 'Active'],
  Machines: ['MachineID', 'MachineName', 'Line', 'Status', 'AssignedProducts', 'CurrentProduct', 'Capacity', 'CurrentJobOrder', 'Installed'],
  JobOrders: ['JobOrderID', 'CreatedAt', 'CreatedBy', 'CreatedByName', 'WorkDate', 'DueDate', 'MachineID', 'ProductCode', 'Shift', 'PlannedQty', 'Priority', 'Status', 'Remark'],
  WasteTypes: ['TypeID', 'TypeName', 'Active', 'CreatedAt', 'CreatedBy'],
  AlarmTypes: ['TypeID', 'TypeName', 'Active', 'CreatedAt', 'CreatedBy'],
  Positions: ['PositionID', 'PositionName', 'Category', 'Active', 'CreatedAt', 'CreatedBy'],

  ProductionLog: ['LogID', 'Timestamp', 'Date', 'Shift', 'TimePeriod', 'EmployeeID', 'EmployeeName', 'MachineID', 'ProductCode', 'PlannedQty', 'ActualQty', 'DefectQty', 'DefectDetails', 'Remark', 'Status', 'ClientRequestID', 'JobOrderID'],
  Inbox: ['InboxID', 'EmployeeID', 'Type', 'Title', 'Message', 'RefID', 'Status', 'CreatedAt', 'CreatedBy'],
  ActionLog: ['ActionID', 'Timestamp', 'EmployeeID', 'EmployeeName', 'Action', 'Payload'],
  MaintenanceLog: ['TicketID', 'Timestamp', 'Date', 'ShiftAB', 'ShiftDN', 'ReportedBy', 'ReporterName', 'MachineID', 'IssueType', 'Description', 'Priority', 'Status', 'AssignedTo', 'ResolvedAt', 'DowntimeMinutes', 'Resolution', 'Photos', 'ResolutionPhotos', 'ClientRequestID'],
  RawMaterialLog: ['ReceiveID', 'Timestamp', 'Date', 'ReceivedBy', 'ReceiverName', 'MachineID', 'PartCode', 'SupplierCode', 'PartName', 'Specification', 'Quantity', 'Unit', 'LotNumber', 'Inspector', 'Customer', 'NetWeight', 'GrossWeight', 'CartonNo', 'PackingDate', 'RefNo', 'Remark', 'Photos', 'Status'],
  SortingLog: ['JobID', 'Timestamp', 'Date', 'Shift', 'ShiftDN', 'MachineID', 'ProductCode', 'FoundProcess', 'TotalQty', 'GoodQty', 'DefectQty', 'DefectDetails', 'Status', 'RegisteredBy', 'RegisteredByName', 'SortedBy', 'SortedByName', 'PulledAt', 'CompletedAt', 'Remark', 'JobOrderID'],
  WasteLog: ['WasteID', 'Timestamp', 'Date', 'RecordedBy', 'RecorderName', 'WasteType', 'WeightKg', 'Remark'],
  AlarmLog: ['AlarmID', 'Timestamp', 'Date', 'Shift', 'MachineID', 'AlarmType', 'Count', 'DurationMinutes', 'RecordedBy', 'RecorderName', 'Remark'],
  DailyCheckLog: ['CheckID', 'Timestamp', 'Date', 'Shift', 'ShiftDN', 'TimePeriod', 'MachineID', 'Results', 'Decision', 'Remark', 'RecordedBy', 'RecorderName', 'Status', 'ClientRequestID', 'UpdatedAt', 'UpdatedBy'],

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
    issueTypes: c.ISSUE_TYPES, dailyCheck: c.DAILY_CHECK, modules: c.MODULES,
    netHoursPerShift: c.NET_HOURS_PER_SHIFT
  };
}
