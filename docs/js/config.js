/**
 * config.js — ค่าหน้าเว็บของไลน์ Assembly M/C
 * ค่า business (อาการ NG, หัวข้อ Daily Check ฯลฯ) มาจาก backend (Config.gs → getLineConfig)
 */
window.APP_CONFIG = {
  LINE_NAME: 'Assembly M/C',
  SYSTEM_TITLE: 'Assembly M/C Production Management System',

  // URL /exec ของ Apps Script Web App ของไลน์นี้ (ห้ามใช้ URL ของไลน์อื่น)
  // TODO(ข้อมูลไลน์): ใส่หลัง Deploy ครั้งแรก
  API_URL: '',

  // prefix ของ localStorage — ห้ามซ้ำกับไลน์อื่น (GitHub Pages ของ user เดียวกันใช้ origin เดียวกัน)
  STORAGE_PREFIX: 'amc_',

  // ลำดับเมนู
  PAGES: [
    { key: 'production', label: 'กรอกยอด', icon: 'bi-clipboard-data', file: 'production.html' },
    { key: 'dailycheck', label: 'Daily Check', icon: 'bi-clipboard-check', file: 'dailycheck.html' },
    { key: 'inbox', label: 'Inbox', icon: 'bi-inbox', file: 'inbox.html' },
    { key: 'maintenance', label: 'แจ้งซ่อม', icon: 'bi-wrench', file: 'maintenance.html' },
    { key: 'joborders', label: 'วางแผนการผลิต', icon: 'bi-calendar2-week', file: 'joborders.html' },
    { key: 'rawmaterial', label: 'รับวัตถุดิบ', icon: 'bi-box-seam', file: 'rawmaterial.html' },
    { key: 'sorting', label: 'คัดแยก', icon: 'bi-funnel', file: 'sorting.html' },
    { key: 'waste', label: 'ทิ้งขยะ', icon: 'bi-trash3', file: 'waste.html' },
    { key: 'alarm', label: 'Alarm', icon: 'bi-bell', file: 'alarm.html' },
    { key: 'machines', label: 'เครื่องจักร', icon: 'bi-gear', file: 'machines.html' },
    { key: 'dashboard', label: 'Dashboard', icon: 'bi-graph-up', file: 'dashboard.html' },
    { key: 'cost', label: 'ต้นทุน', icon: 'bi-cash-stack', file: 'cost.html' },
    { key: 'labor', label: 'ค่าแรง', icon: 'bi-people', file: 'labor.html' },
    { key: 'admin', label: 'จัดการ', icon: 'bi-person-gear', file: 'admin.html' }
  ],

  // หน้าแรกหลัง login (หน้าแรกที่มีสิทธิ์)
  HOME_ORDER: ['dashboard', 'production', 'joborders', 'maintenance', 'rawmaterial', 'machines', 'admin', 'inbox'],

  // โมดูลที่ยังไม่เปิด (ซ่อนจากเมนู) — ตรงกับ LINE_CONFIG.MODULES ใน Config.gs
  DISABLED_MODULES: ['cost', 'labor']
};
