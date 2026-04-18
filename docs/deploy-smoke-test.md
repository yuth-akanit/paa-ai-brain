# Deploy Smoke Test

เอกสารนี้ใช้สำหรับเตรียม deploy และทดสอบระบบ PAA AI Brain หลังขึ้นระบบจริง

## Pre-Deploy Checklist

เช็ก `.env.local` หรือ environment บนเซิร์ฟเวอร์ให้มีอย่างน้อย:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `LINE_CHANNEL_SECRET`
- `LINE_CHANNEL_ACCESS_TOKEN`
- `LINE_ADMIN_NOTIFY_TARGETS`
- `LINE_ADMIN_BOOKING_WEBHOOK_URL`
- `ADMIN_BASIC_AUTH_USER`
- `ADMIN_BASIC_AUTH_PASS`
- `AI_GATEWAY_INTERNAL_KEY`
- `CRON_SECRET`

เช็กเพิ่มก่อน deploy:

- LINE webhook ชี้มาที่ `/api/webhooks/line`
- admin booking webhook ปลายทางรับ `POST` ได้
- target สำหรับแจ้งเตือนแอดมินใน LINE ใช้งานได้จริง
- VPS มี `cron` / `crontab` พร้อมทำงาน

## Deploy

ตัวอย่าง:

```bash
DEPLOY_HOST=203.0.113.10 \
DEPLOY_USER=root \
DEPLOY_PATH=/root/paa-ai-brain \
DEPLOY_BRANCH=main \
DEPLOY_SSH_OPTS="-i ~/.ssh/id_rsa" \
./deploy.sh
```

หลัง deploy ให้เช็ก:

- container ขึ้นปกติ
- หน้า `/admin/cases` เข้าได้
- cron ถูกติดตั้งแล้ว
- route `/api/admin/auto-release-stale` เรียกได้จาก cron script

## Smoke Test Flow

## 1. FAQ ราคา

เป้าหมาย:
- bot ตอบจาก KB/rule
- ไม่ handoff

ข้อความทดสอบ:

```text
ล้างแอร์ติดผนังราคาเท่าไหร่
```

คาดหวัง:

- ตอบราคาตาม rule
- ไม่มั่วคิว
- ไม่ยิง booking webhook

## 2. FAQ พื้นที่บริการ

ข้อความทดสอบ:

```text
รับล้างแอร์แถวบางนาไหม
```

คาดหวัง:

- ตอบพื้นที่จาก KB
- ไม่ handoff

## 3. เริ่มเก็บข้อมูลเคสล้างแอร์

เป้าหมาย:
- bot ถามข้อมูลทีละข้อจนกว่าจะครบ

ข้อความทดสอบเป็น flow:

```text
ลูกค้า: อยากล้างแอร์
ลูกค้า: ชื่ออารีย์
ลูกค้า: 0891234567
ลูกค้า: บ้านเลขที่ 88/9 หมู่บ้านสุขุมวิทวิลล์ บางนา
ลูกค้า: วันจันทร์
ลูกค้า: ช่วงบ่าย
ลูกค้า: ล้างแอร์
ลูกค้า: 3 เครื่อง
```

คาดหวัง:

- bot ถาม field ที่ยังขาดทีละข้อ
- เก็บ `customer_name`
- เก็บ `phone`
- เก็บ `address`
- เก็บ `preferred_date`
- เก็บ `preferred_time`
- เก็บ `service_type`
- เก็บ `machine_count`
- เมื่อครบแล้ว ยิง booking webhook 1 ครั้ง

## 4. ซ่อมแอร์พร้อมอาการ

ข้อความทดสอบ:

```text
ลูกค้า: แอร์ไม่เย็นครับ
ลูกค้า: ชื่อสมชาย
ลูกค้า: 0812345678
ลูกค้า: อยู่ลาดพร้าว 71
ลูกค้า: พรุ่งนี้
ลูกค้า: 10 โมง
ลูกค้า: ซ่อมแอร์
ลูกค้า: 1 เครื่อง
ลูกค้า: มีน้ำหยดด้วย
```

คาดหวัง:

- bot เก็บข้อมูลขั้นต่ำจอง
- เก็บ `symptoms` ได้
- ยิง booking webhook เมื่อ field จองครบ

## 5. ถามคิวจองตรงๆ

ข้อความทดสอบ:

```text
ลูกค้า: จะจองล้างแอร์ครับ
ลูกค้า: ชื่อบี
ลูกค้า: 0823456789
ลูกค้า: 99/1 ซอยแบริ่ง 12
ลูกค้า: วันเสาร์
ลูกค้า: ช่วงเช้า
ลูกค้า: ล้างแอร์
ลูกค้า: 2 เครื่อง
```

คาดหวัง:

- bot เดิน flow เก็บข้อมูลให้ครบ
- เมื่อครบแล้วส่งเข้าระบบ booking webhook
- ถ้ามี scheduling handoff/notify ก็ยังทำงานได้

## 6. ขอคุยแอดมิน

ข้อความทดสอบ:

```text
ขอคุยกับแอดมินหน่อยครับ
```

คาดหวัง:

- สร้าง handoff
- แจ้งเตือนแอดมิน
- thread ถูก lock เป็น `handed_off`

## 7. Manual Takeover

ขั้นตอน:

1. เปิดหน้าเคสใน admin
2. กด `รับช่วงจาก AI`
3. ให้ลูกค้าส่งข้อความใหม่

คาดหวัง:

- AI ไม่ตอบกลับข้อความใหม่
- ข้อความลูกค้าถูกบันทึก
- แอดมินเห็นว่า thread อยู่ในสถานะ handoff

## 8. Release To AI

ขั้นตอน:

1. เปิดเคสที่ handoff อยู่
2. กด `คืนให้ AI ดูแลต่อ`
3. ให้ลูกค้าส่งข้อความใหม่

คาดหวัง:

- AI กลับมาตอบได้
- thread เปลี่ยนกลับเป็น `open`

## 9. Auto Release

ขั้นตอน:

1. ปล่อย thread ให้อยู่ `handed_off`
2. ไม่ให้มี admin activity เกิน 30 นาที
3. เช็ก cron log

คาดหวัง:

- thread ถูกปล่อยกลับ AI อัตโนมัติ
- handoff ถูก resolve

## Webhook Validation

เมื่อข้อมูลจองครบ ปลายทาง `LINE_ADMIN_BOOKING_WEBHOOK_URL` ควรได้รับ payload ลักษณะนี้:

```json
{
  "source": "paa-ai-brain",
  "case_id": "uuid",
  "thread_id": "uuid",
  "customer_id": "uuid",
  "customer_name": "อารีย์",
  "phone": "0891234567",
  "address": "88/9 หมู่บ้านสุขุมวิทวิลล์ บางนา",
  "date": "วันจันทร์",
  "time": "ช่วงบ่าย",
  "service_type": "cleaning",
  "machine_count": 3,
  "area": "บางนา",
  "symptoms": null,
  "line_user_id": "Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
}
```

## Quick Pass Criteria

ถือว่าผ่าน smoke test ถ้า:

- bot ตอบ FAQ ได้ตรง KB/rule
- bot ถามเก็บข้อมูลจองทีละข้อ
- booking webhook ถูกยิงเมื่อข้อมูลครบ
- handoff แจ้งแอดมินได้
- manual takeover หยุด AI ได้
- release to AI ใช้งานได้
- auto-release ทำงานตามเวลา
