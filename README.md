# Board Arena Online — Lobby Update

## โครงสร้าง
- `public/index.html` — เกมเดิมพร้อมหน้า Online Lobby
- `server.js` — Express + Socket.IO room server
- `package.json` — dependencies และคำสั่ง start

## Deploy บน Render
- Runtime: Node
- Root Directory: เว้นว่าง
- Build Command: `npm install`
- Start Command: `npm start`

ถ้าเชื่อม GitHub กับ Render และเปิด Auto-Deploy ไว้ การ Commit จะเริ่ม Deploy เวอร์ชันใหม่โดยอัตโนมัติ

## สถานะของเวอร์ชันนี้
เวอร์ชันนี้เพิ่มระบบสร้างห้อง เข้าห้องด้วยรหัส 6 ตัว แสดงสถานะผู้เล่น และกดพร้อมผ่าน Socket.IO ได้จริง
**การซิงก์การเล่นบนกระดาน (การเลือก/วางตัวละคร/เดิน/สกิล/เทิร์น) ยังไม่ได้เชื่อม** และเป็นงานพัฒนาขั้นถัดไป เกมเดิมยังไม่ใช่ PvP ที่เล่นแข่งกันได้ครบถ้วน
ห้องเก็บในหน่วยความจำของเซิร์ฟเวอร์ จึงหายเมื่อเซิร์ฟเวอร์รีสตาร์ต
