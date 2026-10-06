# การติดตั้ง / Deploy — Assembly M/C

ฐานข้อมูลของไลน์นี้คือ Google Sheet นี้ **เท่านั้น**:
https://docs.google.com/spreadsheets/d/1tz5Unlu2W5Zz5AUCfD1vBTdyj-FPLzOpEaUibOyhcfM
(กำหนดไว้ใน `src/Config.gs` → `LINE_CONFIG.SPREADSHEET_ID` — ไม่อ่านจากที่อื่น)

## 1. Google Apps Script (หลังบ้าน)
1. เปิด https://script.google.com → **New project** (สร้างใหม่ ห้ามใช้ project ของไลน์อื่น) ตั้งชื่อ `Assembly M/C API`
2. คัดลอกไฟล์ทั้งหมดใน `src/*.gs` ไปสร้างเป็นไฟล์ชื่อเดียวกัน และแทนที่ `appsscript.json` ด้วยไฟล์ในรากของ repo
   (Project Settings → ติ๊ก "Show appsscript.json manifest file in editor")
   — หรือใช้ `clasp push` / GitHub Actions (ข้อ 4)
3. **Project Settings → Script Properties**
   | Key | ค่า |
   |---|---|
   | `INITIAL_ADMIN_EMPLOYEE_ID` | รหัส admin คนแรก เช่น `ADMIN` |
   | `INITIAL_ADMIN_PIN` | PIN 4 หลัก |
4. **Services → Drive API (v3)** ต้องเปิด (manifest ประกาศไว้แล้ว)
5. เลือกฟังก์ชัน `initializeSystem` → **Run** (ครั้งแรกจะขออนุญาตสิทธิ์ Sheets/Drive/Docs) → สร้างทุกชีท + admin คนแรก
6. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
   - คัดลอก URL ที่ลงท้าย `/exec`

> ⚠️ ต้องเป็น *Anyone* (ANYONE_ANONYMOUS) ไม่งั้นเบราว์เซอร์จะเจอ CORS error

## 2. หน้าเว็บ (GitHub Pages)
1. ใส่ URL `/exec` ใน `docs/js/config.js` → `API_URL`
   (หรือแตะโลโก้หน้า Login 5 ครั้งเพื่อตั้งชั่วคราวบนเครื่องนั้น)
2. GitHub → Settings → Pages → Deploy from a branch → `main` / `/docs`
3. เปิด `https://<user>.github.io/Assembly-M-C-Management/` → login ด้วย admin

## 3. หลัง login ครั้งแรก (เมนู "จัดการ")
1. แท็บ **เครื่องจักร** → เพิ่มเครื่อง + Capacity
2. แท็บ **สินค้า / BOM** → เพิ่มสินค้า และกด BOM เพื่อใส่ชิ้นส่วน
3. เมนู **เครื่องจักร** → คลิกเครื่อง → เพิ่มสินค้าที่เครื่องผลิตได้ → เลือกสินค้าปัจจุบัน
4. แท็บ **พนักงาน** → เพิ่มผู้ใช้
5. แก้ค่าเฉพาะไลน์ใน `src/Config.gs` (อาการ NG, Daily Check ฯลฯ) ตาม `LINE_DATA_REQUEST.md`

## 4. (ทางเลือก) Auto deploy ด้วย GitHub Actions
ไฟล์ `.github/workflows/deploy-appsscript.yml`:
- push ไป `claude/**` → ตรวจ syntax ของ `src/*.gs` อย่างเดียว (ไม่ขึ้นระบบจริง)
- push / merge เข้า `main` → ตรวจ syntax แล้ว `clasp push` + อัปเดต deployment เดิม (URL `/exec` ไม่เปลี่ยน)
- สั่งเองได้ที่ Actions → Deploy Apps Script → Run workflow (เลือก `main`)
1. เปิด https://script.google.com/home/usersettings → Google Apps Script API = **ON**
2. บนเครื่องตัวเอง: `npm i -g @google/clasp@3 && clasp login` → คัดลอกเนื้อหา `~/.clasprc.json`
3. GitHub → Settings → Secrets and variables → Actions
   | Secret | ค่า |
   |---|---|
   | `CLASPRC_JSON` | เนื้อหา `~/.clasprc.json` |
   | `SCRIPT_ID` | Script ID (Project Settings) |
   | `DEPLOYMENT_ID` | (แนะนำ) ID ของ Web app deployment — เพื่อให้ URL `/exec` คงเดิม |

ถ้ายังไม่ตั้ง secrets workflow จะข้ามการ deploy (ไม่ fail)
