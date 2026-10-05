/**
 * api.js — ชั้นสื่อสาร API (Apps Script Web App)
 * อ่าน = GET ?action= ; เขียน = GET ?payload=<JSON> (เลี่ยง CORS preflight) ; ข้อมูลใหญ่ = POST text/plain
 */
const API = (() => {
  const C = window.APP_CONFIG;
  const KEY_URL = C.STORAGE_PREFIX + 'api_url';
  const READ_TIMEOUT_MS = 20000;
  const LONG_READ_TIMEOUT_MS = 90000;
  const WRITE_TIMEOUT_MS = 30000;
  const NET_ERROR_MSG = 'เน็ตช้า/ไม่ตอบกลับ — กดบันทึกซ้ำได้ ระบบจะไม่บันทึกเบิ้ล';

  let baseUrl = '';

  function init() {
    let stored = '';
    try { stored = localStorage.getItem(KEY_URL) || ''; } catch (e) {}
    baseUrl = C.API_URL || stored;
  }

  function getUrl() { return baseUrl; }

  function setUrl(url) {
    baseUrl = String(url || '').trim();
    try { localStorage.setItem(KEY_URL, baseUrl); } catch (e) {}
  }

  function newRequestId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function fetchJson(url, opts, timeoutMs, outerSignal) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort('timeout'), timeoutMs);
    const onAbort = () => ctrl.abort('cancelled');
    if (outerSignal) outerSignal.addEventListener('abort', onAbort);
    try {
      const res = await fetch(url, Object.assign({ credentials: 'omit', redirect: 'follow', signal: ctrl.signal }, opts));
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (err) {
      if (outerSignal && outerSignal.aborted) { const e = new Error('cancelled'); e.cancelled = true; throw e; }
      if (ctrl.signal.aborted) { const e = new Error('timeout'); e.timeout = true; throw e; }
      throw err;
    } finally {
      clearTimeout(timer);
      if (outerSignal) outerSignal.removeEventListener('abort', onAbort);
    }
  }

  function handleSessionExpiry(json) {
    if (json && json.success === false && json.message === 'กรุณาเข้าสู่ระบบใหม่' && typeof Auth !== 'undefined') {
      Auth.logout(true);
    }
    return json;
  }

  function ensureUrl() {
    if (!baseUrl) throw new Error('ยังไม่ได้ตั้งค่า API URL (แตะโลโก้หน้า Login 5 ครั้ง หรือแก้ docs/js/config.js)');
  }

  const OFFLINE_RESULT = () => ({ success: false, message: 'ไม่มีสัญญาณอินเทอร์เน็ต — ตรวจสอบ Wi-Fi/เน็ตมือถือ แล้วลองใหม่', network: true });
  const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

  /** GET read — retry 3 ครั้ง (backoff + jitter), timeout แล้ว retry ได้ 1 ครั้ง */
  async function getRaw(action, params, opts) {
    ensureUrl();
    if (isOffline()) return OFFLINE_RESULT();
    const retries = opts.retries === undefined ? 3 : opts.retries;
    const timeoutMs = opts.timeoutMs || (opts.long ? LONG_READ_TIMEOUT_MS : READ_TIMEOUT_MS);
    const q = new URLSearchParams({ action, token: (typeof Auth !== 'undefined' && Auth.getToken()) || '', _ts: Date.now() });
    Object.keys(params).forEach((k) => {
      const v = params[k];
      if (v === undefined || v === null) return;
      q.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
    });
    let timeouts = 0;
    for (let n = 0; ; n++) {
      try {
        const url = baseUrl + '?' + q.toString() + (n ? '&_retry=' + n : '');
        return handleSessionExpiry(await fetchJson(url, { method: 'GET' }, timeoutMs, opts.signal));
      } catch (err) {
        if (err.cancelled) throw err;
        if (err.timeout) timeouts++;
        if (n >= retries || timeouts > 1) {
          return { success: false, message: err.timeout ? 'ระบบตอบช้า กรุณาลองใหม่' : 'เชื่อมต่อไม่ได้: ' + err.message, network: true };
        }
        await sleep(500 * Math.pow(2, n) + Math.random() * 300);
      }
    }
  }

  /** เขียนผ่าน GET ?payload= — ไม่ retry โดย default (ใช้ clientRequestId กันเบิ้ล) */
  async function postRaw(action, data, opts) {
    ensureUrl();
    if (isOffline()) return OFFLINE_RESULT();
    const body = Object.assign({ action, token: (typeof Auth !== 'undefined' && Auth.getToken()) || '', _ts: Date.now() }, data);
    const retries = opts.retries || 0;
    for (let n = 0; ; n++) {
      try {
        const url = baseUrl + '?payload=' + encodeURIComponent(JSON.stringify(body));
        return handleSessionExpiry(await fetchJson(url, { method: 'GET' }, opts.timeoutMs || WRITE_TIMEOUT_MS));
      } catch (err) {
        if (n >= retries) return { success: false, message: NET_ERROR_MSG, network: true };
        await sleep(800 * Math.pow(2, n));
      }
    }
  }

  /** ข้อมูลใหญ่ (รูป base64): POST text/plain (ไม่มี preflight) → fallback post() */
  async function postLargeRaw(action, data, opts) {
    ensureUrl();
    if (isOffline()) return OFFLINE_RESULT();
    const body = Object.assign({ action, token: (typeof Auth !== 'undefined' && Auth.getToken()) || '', _ts: Date.now() }, data);
    try {
      return handleSessionExpiry(await fetchJson(baseUrl, {
        method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body)
      }, opts.timeoutMs || 120000));
    } catch (err) {
      if (JSON.stringify(body).length < 6000) return postRaw(action, data, opts);
      return { success: false, message: NET_ERROR_MSG, network: true };
    }
  }

  // นับ request ที่กำลังรอ → ui.js แสดงตัวโหลด (opts.silent = ไม่แสดง เช่น polling เบื้องหลัง)
  let pending = 0;
  function track(delta) {
    pending = Math.max(0, pending + delta);
    try { window.dispatchEvent(new CustomEvent('amc:net', { detail: { pending } })); } catch (e) {}
  }
  async function tracked(silent, fn) {
    if (silent) return fn();
    track(1);
    try { return await fn(); } finally { track(-1); }
  }
  const get = (action, params = {}, opts = {}) => tracked(opts.silent, () => getRaw(action, params, opts));
  const post = (action, data = {}, opts = {}) => tracked(opts.silent, () => postRaw(action, data, opts));
  const postLarge = (action, data = {}, opts = {}) => tracked(opts.silent, () => postLargeRaw(action, data, opts));
  const pendingCount = () => pending;

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  /** ย่อรูปเป็น JPEG dataURL (ไฟล์ที่ไม่ใช่รูปคืน dataURL เดิม) */
  async function compressImage(file, maxW = 800, maxH = 800, quality = 0.6) {
    const dataUrl = await readFileAsDataUrl(file);
    if (!/^image\//.test(file.type) || file.type === 'image/gif') return { dataUrl, name: file.name };
    const img = await loadImage(dataUrl);
    const scale = Math.min(1, maxW / img.width, maxH / img.height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return { dataUrl: canvas.toDataURL('image/jpeg', quality), name: file.name };
  }

  /** เตรียมรูปสำหรับ OCR: ย่อ ≤1600px + grayscale + contrast */
  async function prepareOcrImage(file, maxSide = 1600, quality = 0.92) {
    const img = await loadImage(await readFileAsDataUrl(file));
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext('2d');
    ctx.filter = 'grayscale(1) contrast(1.25)';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', quality);
  }

  init();
  return { init, get, post, postLarge, pendingCount, getUrl, setUrl, newRequestId, compressImage, prepareOcrImage, NET_ERROR_MSG };
})();
