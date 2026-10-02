/**
 * Phase2Service.gs — โมดูลเฟส 2 (ต้นทุน P&L / ค่าแรง)
 * ชีท CostPLConfig, LaborEmployees, Positions ถูกสร้างไว้แล้วตอน initializeSystem
 * จะเปิดใช้เมื่อ LINE_CONFIG.MODULES.cost / labor = true และได้รับข้อมูลโครงสร้างต้นทุน/ค่าแรงของไลน์นี้
 */
function phase2NotReady(moduleKey) {
  return { success: false, notReady: true, message: 'โมดูล ' + moduleKey + ' ยังไม่เปิดใช้งาน (รอข้อมูลเฟส 2)' };
}

function getCostPL(token) { requireLogin(token); return phase2NotReady('ต้นทุน'); }
function getCostDashboard(token) { requireLogin(token); return phase2NotReady('ต้นทุน'); }
function saveCostPL(token) { requireLogin(token); return phase2NotReady('ต้นทุน'); }
function getLaborMonthlyReport(token) { requireLogin(token); return phase2NotReady('ค่าแรง'); }
function getLaborEmployees(token) { requireLogin(token); return phase2NotReady('ค่าแรง'); }
function getPositions(token) { requireLogin(token); return phase2NotReady('ค่าแรง'); }
