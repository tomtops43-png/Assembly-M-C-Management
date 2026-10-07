/**
 * ProductService.gs — สินค้า + BOM + Material alias + ราคาต่อหน่วย
 */
function productToObj(p) {
  return {
    productCode: String(p.ProductCode), productName: p.ProductName,
    defaultQty: toNumber(p.DefaultQty, LINE_CONFIG.DEFAULT_QTY), active: isActiveValue(p.Active),
    unitPrice: toNumber(p.UnitPrice), capacity: toNumber(p.Capacity)
  };
}

function bomToObj(b) {
  return {
    productCode: String(b.ProductCode), componentCode: String(b.ComponentCode),
    componentName: b.ComponentName, qtyPerUnit: toNumber(b.QtyPerUnit, 1), supplier: b.Supplier || ''
  };
}

function getProducts(includeInactive) {
  return getMasterData().products.map(productToObj).filter(function (p) { return includeInactive || p.active; });
}

function getProductBOM(productCode) {
  return getMasterData().bom.map(bomToObj).filter(function (b) { return b.productCode === String(productCode); });
}

function getAllProductsWithBOM(includeInactive) {
  var bom = getMasterData().bom.map(bomToObj);
  return getProducts(includeInactive).map(function (p) {
    p.bom = bom.filter(function (b) { return b.productCode === p.productCode; });
    return p;
  });
}

function saveProduct(token, d) {
  var u = requireRole(token, 'admin');
  var code = String(d.productCode || '').trim();
  if (!code || !d.productName) throw new Error('กรุณากรอกรหัสและชื่อสินค้า');
  var exists = findRow('Products', 'ProductCode', code);
  var row = {
    ProductName: d.productName, DefaultQty: toNumber(d.defaultQty, LINE_CONFIG.DEFAULT_QTY),
    Capacity: toNumber(d.capacity), Active: d.active !== false
  };
  if (exists) updateRow('Products', 'ProductCode', code, row);
  else { row.ProductCode = code; row.UnitPrice = toNumber(d.unitPrice); appendRow('Products', row); }
  logAction(u, exists ? 'updateProduct' : 'addProduct', { productCode: code });
  return { success: true };
}

/** แทนที่ BOM ทั้งชุดของสินค้า */
function saveProductBOM(token, productCode, components) {
  var u = requireRole(token, 'admin');
  if (!findRow('Products', 'ProductCode', productCode)) throw new Error('ไม่พบสินค้า');
  deleteRows('BOM', function (r) { return String(r.ProductCode) === String(productCode); });
  (components || []).forEach(function (c) {
    if (!c.componentCode) return;
    appendRow('BOM', {
      ProductCode: productCode, ComponentCode: String(c.componentCode).trim(), ComponentName: c.componentName || '',
      QtyPerUnit: toNumber(c.qtyPerUnit, 1), Supplier: c.supplier || ''
    });
  });
  logAction(u, 'saveProductBOM', { productCode: productCode, count: (components || []).length });
  return { success: true };
}

/**
 * ลบสินค้า + BOM ของสินค้านั้น + เอาออกจาก "สินค้าที่ผลิตได้" ของทุกเครื่อง
 * ประวัติการผลิต/Job Order เก่ายังอยู่ — ห้ามลบถ้ายังมี Job Order ที่ยังไม่ปิดใช้สินค้านี้
 */
function deleteProduct(token, productCode) {
  var u = requireRole(token, 'admin');
  var code = String(productCode || '').trim();
  if (!findRow('Products', 'ProductCode', code)) throw new Error('ไม่พบสินค้า');
  var openJo = getAllRows('JobOrders').filter(function (r) {
    return String(r.ProductCode) === code && r.Status !== 'completed' && r.Status !== 'cancelled';
  });
  if (openJo.length) {
    throw new Error('ยังมี Job Order ที่ยังไม่ปิดใช้สินค้านี้ (' + openJo.map(function (r) { return r.JobOrderID; }).slice(0, 3).join(', ') +
      (openJo.length > 3 ? ' ...' : '') + ') — ปิด/ยกเลิก Job Order ก่อน หรือแก้สถานะสินค้าเป็น "ปิด" แทน');
  }
  getMachines().forEach(function (m) {
    if (m.assignedProducts.indexOf(code) < 0 && m.currentProduct !== code) return;
    var upd = { AssignedProducts: m.assignedProducts.filter(function (p) { return p !== code; }).join(', ') };
    if (m.currentProduct === code) { upd.CurrentProduct = ''; upd.CurrentJobOrder = ''; }
    updateRow('Machines', 'MachineID', m.machineId, upd);
  });
  deleteRows('BOM', function (r) { return String(r.ProductCode) === code; });
  deleteRow('Products', 'ProductCode', code);
  logAction(u, 'deleteProduct', { productCode: code });
  return { success: true };
}

function updateProductUnitPrice(token, productCode, unitPrice) {
  var u = requireLogin(token);
  if (['admin', 'supervisor'].indexOf(u.role) < 0) throw new Error('ไม่มีสิทธิ์ทำรายการนี้');
  updateRow('Products', 'ProductCode', productCode, { UnitPrice: toNumber(unitPrice) });
  return { success: true };
}

function getMaterialAliases() {
  return getMasterData().aliases.filter(function (a) { return a.Active === '' || isActiveValue(a.Active); })
    .map(function (a) { return { alias: String(a.AliasCode), canonical: String(a.CanonicalCode), note: a.Note || '' }; });
}

function saveMaterialAlias(token, d) {
  requireRole(token, 'admin');
  var alias = String(d.alias || '').trim().toUpperCase();
  if (!alias || !d.canonical) throw new Error('กรุณากรอกรหัสบนฉลากและรหัส BOM');
  if (findRow('MaterialAlias', 'AliasCode', alias)) {
    updateRow('MaterialAlias', 'AliasCode', alias, { CanonicalCode: d.canonical, Note: d.note || '', Active: true });
  } else {
    appendRow('MaterialAlias', { AliasCode: alias, CanonicalCode: d.canonical, Note: d.note || '', Active: true });
  }
  return { success: true };
}

function deleteMaterialAlias(token, alias) {
  requireRole(token, 'admin');
  deleteRow('MaterialAlias', 'AliasCode', alias);
  return { success: true };
}

// ---------- Migration: รหัสสินค้าชั่วคราว → รหัส FG จริง ----------
var PRODUCT_CODE_MIGRATION_KEY = 'MIGRATION_PRODUCT_CODES_V1';

/** เรียกทุก request (ถูกมาก: อ่าน property ตัวเดียว) — รัน migration ครั้งเดียวหลัง deploy */
function ensureDataMigrations() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty(PRODUCT_CODE_MIGRATION_KEY)) return;
  try {
    var result = migrateProductCodes();
    props.setProperty(PRODUCT_CODE_MIGRATION_KEY, formatDate());
    console.log('migrateProductCodes: ' + JSON.stringify(result));
  } catch (err) {
    console.warn('migrateProductCodes: ' + (err && err.message || err)); // ลองใหม่ request ถัดไป
  }
}

/**
 * เปลี่ยนรหัสสินค้าตาม LINE_CONFIG.PRODUCT_CODE_MIGRATION ในทุกชีทที่อ้างถึงสินค้า
 * (Products, Machines, BOM, ProductionLog, JobOrders, SortingLog, CostPLConfig)
 * รหัสเก่าหลายตัวที่ map ไปรหัสเดียวกันจะถูกรวมเป็นแถวเดียว — รันซ้ำได้ (idempotent)
 */
function migrateProductCodes() {
  var map = LINE_CONFIG.PRODUCT_CODE_MIGRATION || {};
  if (!Object.keys(map).length) return {};
  var mapCode = function (c) { c = String(c || '').trim(); return map.hasOwnProperty(c) ? map[c] : c; };
  var seedProducts = {};
  LINE_CONFIG.SEED.products.forEach(function (p) { seedProducts[p.code] = p; });
  var seedMachines = {};
  LINE_CONFIG.SEED.machines.forEach(function (m) { seedMachines[m.id] = m; });
  var out = {};

  withLock(function () {
    // อ่านแถวข้อมูลทั้งหมดของชีท → แปลง → เขียนทับ (rows ที่คืนน้อยลง = ลบแถวเกิน)
    var rewrite = function (name, fn) {
      var sh = getSheet(name);
      if (!sh || sh.getLastRow() < 2) return 0;
      var headers = getHeaders(name);
      var n = sh.getLastRow() - 1;
      var values = sh.getRange(2, 1, n, headers.length).getValues();
      var col = {};
      headers.forEach(function (h, i) { col[h] = i; });
      var res = fn(values, col);
      if (!res.changed) return 0;
      sh.getRange(2, 1, n, headers.length).clearContent();
      if (res.rows.length) sh.getRange(2, 1, res.rows.length, headers.length).setValues(res.rows);
      if (res.rows.length < n) sh.deleteRows(2 + res.rows.length, n - res.rows.length);
      return res.changed;
    };

    out.Products = rewrite('Products', function (rows, c) {
      var seen = {}, kept = [], changed = 0;
      rows.forEach(function (r) {
        var oldCode = String(r[c.ProductCode]).trim();
        var code = mapCode(oldCode);
        if (code !== oldCode) {
          changed++;
          r[c.ProductCode] = code;
          var sp = seedProducts[code];
          if (sp) {
            r[c.ProductName] = sp.name;
            r[c.Capacity] = sp.capacity || 0;
            r[c.DefaultQty] = sp.defaultQty || LINE_CONFIG.DEFAULT_QTY;
            if (!toNumber(r[c.UnitPrice]) && sp.unitPrice) r[c.UnitPrice] = sp.unitPrice;
          }
        }
        if (seen[code]) { changed++; return; }
        seen[code] = true;
        kept.push(r);
      });
      return { rows: kept, changed: changed };
    });

    out.Machines = rewrite('Machines', function (rows, c) {
      var changed = 0;
      rows.forEach(function (r) {
        var before = String(r[c.AssignedProducts]);
        var list = [];
        splitList(before).forEach(function (p) { p = mapCode(p); if (list.indexOf(p) < 0) list.push(p); });
        var cur = mapCode(r[c.CurrentProduct]);
        var touched = list.join(', ') !== before || cur !== String(r[c.CurrentProduct]);
        if (!touched) return;
        changed++;
        r[c.AssignedProducts] = list.join(', ');
        r[c.CurrentProduct] = cur;
        // สินค้าที่รวมรหัสแล้วมี capacity = 0 → ใช้ capacity ของเครื่องตาม seed
        var sm = seedMachines[String(r[c.MachineID])];
        if (sm && sm.capacity && !toNumber(r[c.Capacity])) r[c.Capacity] = sm.capacity;
      });
      return { rows: rows, changed: changed };
    });

    out.BOM = rewrite('BOM', function (rows, c) {
      var seen = {}, kept = [], changed = 0;
      rows.forEach(function (r) {
        var code = mapCode(r[c.ProductCode]);
        if (code !== String(r[c.ProductCode]).trim()) { changed++; r[c.ProductCode] = code; }
        var key = code + '|' + String(r[c.ComponentCode]).trim();
        if (seen[key]) { changed++; return; }
        seen[key] = true;
        kept.push(r);
      });
      return { rows: kept, changed: changed };
    });

    ['ProductionLog', 'JobOrders', 'SortingLog', 'CostPLConfig'].forEach(function (name) {
      var sh = getSheet(name);
      if (!sh || sh.getLastRow() < 2) { out[name] = 0; return; }
      var ci = getHeaders(name).indexOf('ProductCode');
      if (ci < 0) { out[name] = 0; return; }
      var range = sh.getRange(2, ci + 1, sh.getLastRow() - 1, 1);
      var vals = range.getValues();
      var changed = 0;
      vals.forEach(function (v) { var nc = mapCode(v[0]); if (nc !== String(v[0]).trim()) { v[0] = nc; changed++; } });
      if (changed) range.setValues(vals);
      out[name] = changed;
    });
  });

  afterWrite('Products');
  return out;
}
