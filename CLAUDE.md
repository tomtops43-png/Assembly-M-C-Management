# CLAUDE.md — Assembly M/C

- Backend = Google Apps Script (`src/*.gs`, V8, global functions — no modules). Frontend = static `docs/` (no build step, vanilla JS).
- Database = ONLY the spreadsheet in `LINE_CONFIG.SPREADSHEET_ID` (`src/Config.gs`). Never point to another line's sheet, script, or `/exec` URL.
- All line-specific values live in `src/Config.gs` (`LINE_CONFIG`, `SHEET_SCHEMAS`) and `docs/js/config.js`. Placeholders are marked `TODO(ข้อมูลไลน์)`; see `LINE_DATA_REQUEST.md`.
- Permission defaults must match in `src/Auth.gs` (`ROLE_DEFAULT_PERMISSIONS`) and `docs/js/auth.js` (`_roleDefaults`).
- Reads: GET `?action=`. Writes: GET `?payload=<json>` (no CORS preflight); images use `API.postLarge` (POST text/plain).
- New API action → add to `READ_ACTIONS` / `WRITE_ACTIONS` in `src/Code.gs`. New sheet/column → `SHEET_SCHEMAS` (self-heals via `ensureSheetExists`).
- Writes to Machines/Products/BOM/MaterialAlias bump `MASTER_DATA_VERSION` automatically (`afterWrite`).
- localStorage keys use prefix `amc_` (`APP_CONFIG.STORAGE_PREFIX`) — never `h1_`.
- UI text is Thai; time zone Asia/Bangkok; work date rolls over at 08:00.

## Workflow — Auto merge (กำหนดโดยเจ้าของ repo)
- ทุกครั้งที่แก้ไขเว็บ/โค้ด: commit → push → เปิด PR เข้า `main` → รอ CI ผ่าน → **merge เข้า `main` ทันทีโดยไม่ต้องถามก่อน** (merge method: `merge`)
- ถ้า CI fail หรือมี merge conflict: แก้ให้ผ่านก่อน แล้วค่อย merge — ห้าม merge ตอนที่ CI แดง
- หลัง merge: ถ้าจะแก้ต่อ ให้เริ่ม branch ใหม่จาก `origin/main` ล่าสุด (ไม่ต่อบน branch ที่ merge ไปแล้ว)
- ข้อยกเว้นเดียว: ถ้าผู้ใช้สั่งว่า "ยังไม่ต้อง merge" ในงานนั้น
