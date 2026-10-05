/**
 * DashboardService.gs — Analytics + CSV export
 */
function resolveDateRange(dateRange) {
  var today = getWorkDate();
  var r = safeJson(dateRange, dateRange);
  if (r && typeof r === 'object') return { from: r.from || today, to: r.to || today };
  switch (r) {
    case 'week': return { from: getWeekStart(today), to: today };
    case 'month': return { from: getMonthStart(today), to: today };
    case 'all': return { from: '', to: '' };
    default: return { from: today, to: today };
  }
}

function round1(n) { return Math.round(n * 10) / 10; }

function pct(a, b) { return b > 0 ? round1(a / b * 100) : 0; }

/** จัดชิ้นส่วนเข้ากลุ่ม NG ตาม keyword ใน LINE_CONFIG.DEFECT_PART_GROUPS */
function classifyDefectComponent(code, name) {
  var s = (String(code) + ' ' + String(name || '')).toLowerCase();
  var groups = LINE_CONFIG.DEFECT_PART_GROUPS || [];
  for (var i = 0; i < groups.length; i++) {
    var g = groups[i];
    if (String(code).toUpperCase() === String(g.code).toUpperCase()) return g.code;
    if ((g.keywords || []).some(function (k) { return s.indexOf(String(k).toLowerCase()) >= 0; })) return g.code;
  }
  return 'OTHER';
}

function ngReasonOf(remark) {
  var r = String(remark || '').trim();
  if (!r) return 'ไม่ระบุอาการ';
  if (r.indexOf(LINE_CONFIG.SORTING_ADJUST_NG_REASON) === 0) return LINE_CONFIG.SORTING_ADJUST_NG_REASON;
  return r;
}

/** key 'เครื่อง|วันที่' ที่วัตถุดิบหมด */
function getStockoutKeys(from, to) {
  var re = new RegExp(LINE_CONFIG.STOCKOUT_REGEX, 'i');
  var keys = {};
  var rows = from ? getRowsSince('MaintenanceLog', 'Timestamp', addDays(from, -2)) : getAllRows('MaintenanceLog');
  rows.forEach(function (t) {
    if ((from && t.Date < from) || (to && t.Date > to)) return;
    if (t.IssueType === 'material' || t.IssueType === 'stockout' || re.test(String(t.Description || ''))) {
      keys[String(t.MachineID) + '|' + t.Date] = true;
    }
  });
  return keys;
}

function getDashboardData(token, dateRange, shiftAB, shiftDN, productCode, jobOrderId) {
  requireLogin(token);
  var range = resolveDateRange(dateRange);
  var rows = queryProduction({
    dateFrom: range.from, dateTo: range.to, shiftDN: shiftDN || '', // ไลน์นี้ไม่มีกะ A/B — มีแค่กะเช้า/ดึก (shiftAB ไม่ใช้แล้ว)
    productCode: productCode || '', jobOrderId: jobOrderId || ''
  });
  var machines = getMachines();
  var mMap = {};
  machines.forEach(function (m) { mMap[m.machineId] = m; });
  var caps = productCapacityMap();
  var netHours = shiftDN ? LINE_CONFIG.NET_HOURS_PER_SHIFT : LINE_CONFIG.NET_HOURS_PER_SHIFT * 2;
  var stockout = getStockoutKeys(range.from, range.to);

  var totals = { actual: 0, defect: 0, plan: 0, entries: rows.length };
  var byMachine = {}, byProduct = {}, byShift = {}, daily = {}, ngByReason = {}, ngByPart = {};
  var ngDaily = {}; // date → { อาการ: qty } (กราฟ NG ตามอาการรายวันในรายงาน PDF)
  var oeeAgg = {}; // machine → {days:{}, hours:{}, actual}

  rows.forEach(function (r) {
    var m = mMap[r.machineId] || { capacity: 0, assignedProducts: [] };
    var rowCap = machineCapacity(m, r.productCode, caps); // ชิ้น/ชม. ของสินค้าที่ผลิตในแถวนี้
    var plan = r.status === 'sort-adjust' ? 0 : (rowCap || r.plannedQty);
    totals.actual += r.actualQty; totals.defect += r.defectQty; totals.plan += plan;

    var bm = byMachine[r.machineId] = byMachine[r.machineId] || { machineId: r.machineId, machineName: m.machineName || r.machineId, actual: 0, defect: 0, plan: 0 };
    bm.actual += r.actualQty; bm.defect += r.defectQty; bm.plan += plan;
    if (rowCap > 0) bm.capacity = rowCap; // ชิ้น/ชม. (ใช้ในรายงาน)
    var bp = byProduct[r.productCode] = byProduct[r.productCode] || { productCode: r.productCode, actual: 0, defect: 0, plan: 0 };
    bp.actual += r.actualQty; bp.defect += r.defectQty; bp.plan += plan;
    var bs = byShift[r.shiftDN || '-'] = byShift[r.shiftDN || '-'] || { actual: 0, defect: 0 };
    bs.actual += r.actualQty; bs.defect += r.defectQty;
    var dd = daily[r.date] = daily[r.date] || { date: r.date, actual: 0, defect: 0 };
    dd.actual += r.actualQty; dd.defect += r.defectQty;

    if (r.defectQty > 0) {
      var reason = ngReasonOf(r.remark);
      ngByReason[reason] = (ngByReason[reason] || 0) + r.defectQty;
      var nd = ngDaily[r.date] = ngDaily[r.date] || {};
      nd[reason] = (nd[reason] || 0) + r.defectQty;
      var det = r.defectDetails || {};
      var keys = Object.keys(det);
      var counted = 0;
      keys.forEach(function (code) {
        var g = classifyDefectComponent(code, det[code].componentName);
        ngByPart[g] = (ngByPart[g] || 0) + toNumber(det[code].qty);
        counted += toNumber(det[code].qty);
      });
      if (!keys.length) ngByPart.OTHER = (ngByPart.OTHER || 0) + r.defectQty;
    }

    // OEE: นับเฉพาะ (เครื่อง,วัน) ที่มียอด > 0 และไม่ใช่วันวัตถุดิบหมด
    if (!stockout[r.machineId + '|' + r.date]) {
      var o = oeeAgg[r.machineId] = oeeAgg[r.machineId] || { days: {}, hours: {}, actual: 0 };
      o.actual += r.actualQty;
      if (r.status !== 'sort-adjust' && rowCap > 0) o.hours[r.date + '|' + r.timePeriod] = rowCap;
      o.days[r.date] = (o.days[r.date] || 0) + r.actualQty;
    }
  });

  var oeeActualSum = 0, oeeCapSum = 0;
  Object.keys(byMachine).forEach(function (id) {
    var bm = byMachine[id];
    bm.defectRate = pct(bm.defect, bm.actual + bm.defect);
    var o = oeeAgg[id];
    // capacity เฉลี่ยของชั่วโมงที่บันทึก (เครื่องที่ผลิตหลายรุ่น เช่น GV.2)
    var hourCaps = o ? Object.keys(o.hours).map(function (k) { return o.hours[k]; }) : [];
    var cap = hourCaps.length ? hourCaps.reduce(function (a, b) { return a + b; }, 0) / hourCaps.length
      : machineCapacity(mMap[id] || { capacity: 0, assignedProducts: [] }, '', caps);
    bm.oee = null;
    // รายวัน (กราฟยอด/OEE รายวันตามเครื่องในรายงาน PDF)
    bm.daily = o ? Object.keys(o.days).sort().map(function (d) {
      var hrs = Object.keys(o.hours).filter(function (h) { return h.indexOf(d + '|') === 0; }).length;
      var capDay = cap * Math.max(netHours, hrs);
      return { date: d, actual: o.days[d], oee: capDay > 0 && o.days[d] > 0 ? pct(o.days[d], capDay) : null };
    }) : [];
    if (o && cap > 0) {
      var countedDays = Object.keys(o.days).filter(function (d) { return o.days[d] > 0; }).length;
      var scheduled = countedDays * netHours;
      var logged = Object.keys(o.hours).length;
      var working = scheduled + Math.max(0, logged - scheduled);
      var capTotal = cap * working;
      if (capTotal > 0) {
        bm.oee = pct(o.actual, capTotal);
        oeeActualSum += o.actual; oeeCapSum += capTotal;
      }
    }
  });

  var installedPlanPerDay = machines.filter(function (m) { return m.installed; })
    .reduce(function (s, m) { return s + m.effectiveCapacity * netHours; }, 0);
  var trend = Object.keys(daily).sort().map(function (d) {
    var x = daily[d];
    x.plan = installedPlanPerDay; x.defectRate = pct(x.defect, x.actual + x.defect);
    x.oee = installedPlanPerDay > 0 ? pct(x.actual, installedPlanPerDay) : null;
    return x;
  });

  // Maintenance summary
  var tickets = getAllRows('MaintenanceLog').map(ticketToObj);
  var maint = { total: 0, open: 0, resolved: 0, carriedOver: 0, downtime: 0, byMachine: {}, byType: {}, unclosedList: [], completedList: [] };
  tickets.forEach(function (t) {
    var refDate = t.resolvedAt ? getWorkDate(parseDate(t.resolvedAt)) : t.date;
    var inRange = (!range.from || refDate >= range.from) && (!range.to || refDate <= range.to);
    var isOpen = t.status === 'open' || t.status === 'in-progress';
    var carried = isOpen && range.from && t.date < range.from;
    if (!inRange && !carried) return;
    maint.total++;
    if (isOpen) maint.open++; else maint.resolved++;
    if (carried) maint.carriedOver++;
    maint.downtime += t.downtimeMinutes;
    var brief = { ticketId: t.ticketId, machineId: t.machineId, status: t.status, issueType: t.issueType, description: String(t.description || '').substring(0, 120),
      date: t.date, resolvedAt: t.resolvedAt, downtimeMinutes: t.downtimeMinutes, carried: !!carried };
    if (isOpen) maint.unclosedList.push(brief); else maint.completedList.push(brief);
    var bm = maint.byMachine[t.machineId] = maint.byMachine[t.machineId] || { tickets: 0, downtime: 0 };
    bm.tickets++; bm.downtime += t.downtimeMinutes;
    var bt = maint.byType[t.issueType] = maint.byType[t.issueType] || { tickets: 0, downtime: 0 };
    bt.tickets++; bt.downtime += t.downtimeMinutes;
  });

  maint.completedList.sort(function (a, b) { return String(b.resolvedAt).localeCompare(String(a.resolvedAt)); });
  maint.completedList = maint.completedList.slice(0, 30);
  maint.unclosedList = maint.unclosedList.slice(0, 30);

  // Job Order progress (JO ที่อยู่ในช่วง)
  var joIds = {};
  rows.forEach(function (r) { joIds[r.jobOrderId || '__unassigned__'] = (joIds[r.jobOrderId || '__unassigned__'] || 0) + r.actualQty; });
  var joList = computeJobOrderProgress(getAllRows('JobOrders').map(jobOrderToObj).filter(function (j) { return joIds[j.jobOrderId] !== undefined; }));
  if (joIds.__unassigned__ !== undefined) joList.push({ jobOrderId: '__unassigned__', productCode: '-', plannedQty: 0, actualQty: joIds.__unassigned__ });

  var dailyCheck = range.from ? buildDailyCheckSummary(range.from, range.to, rows) : null;

  return {
    success: true,
    data: {
      range: range,
      kpi: {
        actual: totals.actual, defect: totals.defect, plan: totals.plan, entries: totals.entries,
        defectRate: pct(totals.defect, totals.actual + totals.defect),
        oee: oeeCapSum > 0 ? pct(oeeActualSum, oeeCapSum) : null,
        openTickets: maint.open,
        machineUtilization: machines.length ? pct(machines.filter(function (m) { return m.status === 'running'; }).length, machines.length) : 0
      },
      byMachine: Object.keys(byMachine).sort().map(function (k) { return byMachine[k]; }),
      byProduct: Object.keys(byProduct).map(function (k) { var p = byProduct[k]; p.defectRate = pct(p.defect, p.actual + p.defect); p.yield = pct(p.actual, p.actual + p.defect); return p; }),
      byShift: byShift, trend: trend, ngByReason: ngByReason, ngByPart: ngByPart, ngDaily: ngDaily,
      defectPartGroups: LINE_CONFIG.DEFECT_PART_GROUPS, maintenance: maint, jobOrders: joList, dailyCheck: dailyCheck
    }
  };
}

function getSortedProductionData(token, sortField, sortOrder, filters) {
  requireLogin(token);
  var f = safeJson(filters, {}) || {};
  if (f.dateRange) { var r = resolveDateRange(f.dateRange); f.dateFrom = r.from; f.dateTo = r.to; }
  var rows = queryProduction(f);
  if (sortField) {
    var dir = sortOrder === 'asc' ? 1 : -1;
    rows.sort(function (a, b) { return (a[sortField] > b[sortField] ? 1 : a[sortField] < b[sortField] ? -1 : 0) * dir; });
  }
  return { success: true, data: rows.slice(0, toNumber(f.limit, 500)) };
}

function csvCell(v) {
  var s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function exportProductionCSV(token, dateFrom, dateTo) {
  requireRole(token, 'supervisor');
  var rows = queryProduction({ dateFrom: dateFrom || getWorkDate(), dateTo: dateTo || getWorkDate() });
  rows.sort(function (a, b) { return a.timestamp > b.timestamp ? 1 : -1; });
  var head = ['Date', 'TimePeriod', 'Shift', 'MachineID', 'ProductCode', 'JobOrderID', 'PlannedQty', 'ActualQty', 'DefectQty', 'Remark', 'EmployeeID', 'EmployeeName', 'Status', 'Timestamp'];
  var lines = [head.join(',')].concat(rows.map(function (r) {
    return [r.date, r.timePeriod, r.shift, r.machineId, r.productCode, r.jobOrderId, r.plannedQty, r.actualQty, r.defectQty, r.remark, r.employeeId, r.employeeName, r.status, r.timestamp].map(csvCell).join(',');
  }));
  return { success: true, csv: '﻿' + lines.join('\n'), filename: LINE_CONFIG.LINE_CODE + '_production_' + dateFrom + '_' + dateTo + '.csv' };
}

/** ส่งออก NG แยก component (สำหรับ QC) */
function exportQCDefectCSV(token, dateFrom, dateTo, dateMode, timeFrom, timeTo) {
  requireLogin(token);
  var rows;
  if (dateMode === 'timestamp') {
    var fromTs = dateFrom + ' ' + (timeFrom || '00:00') + ':00', toTs = dateTo + ' ' + (timeTo || '23:59') + ':59';
    rows = queryProduction({ dateFrom: addDays(dateFrom, -1), dateTo: addDays(dateTo, 1) })
      .filter(function (r) { return r.timestamp >= fromTs && r.timestamp <= toTs; });
  } else {
    rows = queryProduction({ dateFrom: dateFrom, dateTo: dateTo });
  }
  var head = ['Date', 'Timestamp', 'MachineID', 'ProductCode', 'JobOrderID', 'ComponentCode', 'ComponentName', 'PartGroup', 'Qty', 'Symptom', 'EmployeeName'];
  var lines = [head.join(',')];
  var totals = {};
  var n = 0;
  rows.filter(function (r) { return r.defectQty > 0; }).forEach(function (r) {
    var det = r.defectDetails || {};
    var keys = Object.keys(det);
    if (!keys.length) det = { '-': { componentName: '', qty: r.defectQty } }, keys = ['-'];
    keys.forEach(function (code) {
      var g = classifyDefectComponent(code, det[code].componentName);
      totals[g] = (totals[g] || 0) + toNumber(det[code].qty);
      lines.push([r.date, r.timestamp, r.machineId, r.productCode, r.jobOrderId, code, det[code].componentName, g, det[code].qty, ngReasonOf(r.remark), r.employeeName].map(csvCell).join(','));
      n++;
    });
  });
  return { success: true, csv: '﻿' + lines.join('\n'), filename: LINE_CONFIG.LINE_CODE + '_NG_' + dateFrom + '_' + dateTo + '.csv', rows: n, totals: totals };
}
