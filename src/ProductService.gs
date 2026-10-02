/**
 * ProductService.gs — สินค้า + BOM + Material alias + ราคาต่อหน่วย
 */
function productToObj(p) {
  return {
    productCode: String(p.ProductCode), productName: p.ProductName,
    defaultQty: toNumber(p.DefaultQty, LINE_CONFIG.DEFAULT_QTY), active: isActiveValue(p.Active),
    unitPrice: toNumber(p.UnitPrice)
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
    Active: d.active !== false
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
