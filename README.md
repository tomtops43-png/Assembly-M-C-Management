# Assembly M/C — Production Management System

ระบบจัดการไลน์ผลิต Assembly M/C (โครงสร้างเดียวกับระบบ H1 Lug&Screw แต่ข้อมูลและฐานข้อมูลแยกกันทั้งหมด)

| ชั้น | เทคโนโลยี |
|---|---|
| หน้าบ้าน | HTML + CSS + Vanilla JS บน GitHub Pages (`docs/`) |
| หลังบ้าน | Google Apps Script Web App (`src/`) |
| ฐานข้อมูล | Google Sheet [Assembly-M-C-Management](https://docs.google.com/spreadsheets/d/1tz5Unlu2W5Zz5AUCfD1vBTdyj-FPLzOpEaUibOyhcfM) **ไฟล์เดียวเท่านั้น** |
| รูป/ไฟล์ | Google Drive โฟลเดอร์ `Assembly_MC_Photos` |

- วิธีติดตั้ง: [`DEPLOYMENT.md`](DEPLOYMENT.md)
- ข้อมูลที่ยังรอจากไลน์: [`LINE_DATA_REQUEST.md`](LINE_DATA_REQUEST.md)
- ค่าเฉพาะไลน์ทั้งหมดอยู่ที่ `src/Config.gs` (หลังบ้าน) และ `docs/js/config.js` (หน้าบ้าน)

## โครงสร้าง
```
docs/                      หน้าเว็บ (GitHub Pages)
  index.html               Login
  js/config.js api.js auth.js ui.js
  css/style.css
  pages/                   production, dailycheck, inbox, maintenance, joborders, rawmaterial,
                           sorting, waste, alarm, machines, dashboard, cost*, labor*, admin  (* เฟส 2)
src/                       Apps Script
  Config.gs                ค่าเฉพาะไลน์ + โครงสร้างทุกชีท
  Code.gs                  Router doGet/doPost + initializeSystem
  Auth.gs SheetHelper.gs Utils.gs DriveService.gs
  *Service.gs              Production, Machine, Product, JobOrder, Maintenance, DailyCheck,
                           Sorting, RawMaterial, Waste, Alarm, Dashboard, Phase2 (cost/labor)
```

## สถานะ
- ✅ โครงสร้างครบ: login/สิทธิ์ 5 ระดับ, กรอกยอด, Job Order, แจ้งซ่อม (รูป Drive), Daily Check, Inbox, เครื่องจักร, คัดแยก, รับวัตถุดิบ (ตรวจ BOM), ขยะ, Alarm, Dashboard (OEE/NG/กราฟ/CSV), จัดการ (ผู้ใช้/เครื่อง/สินค้า/BOM/alias/log)
- ⏳ รอข้อมูลไลน์: เครื่องจักร, สินค้า, BOM, อาการ NG, หัวข้อ Daily Check ฯลฯ
- ⏳ เฟส 2: OCR ฉลาก/HMI แบบกรอกอัตโนมัติ, Scrap List PDF, PDF Dashboard, ต้นทุน P&L, ค่าแรง
