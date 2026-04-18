# API Contracts

## POST `/api/webhooks/line`
Processes inbound LINE OA text messages.

### Headers
- `x-line-signature`: LINE HMAC signature

### Response
```json
{
  "ok": true
}
```

## POST `/api/ai/respond`
Runs the same AI decision pipeline for an existing thread.

### Request
```json
{
  "channel": "line",
  "channelUserId": "Uxxxxxxxxxxxx",
  "threadId": "uuid-or-null",
  "customerMessage": "แอร์ไม่เย็นครับ",
  "sourceEvent": {
    "replyToken": "reply-token-if-available",
    "messageId": "line-message-id",
    "timestamp": 1763400000000
  },
  "runtime": {
    "requestId": "rt_1763400000000",
    "receivedAt": "2026-04-17T23:21:13.000Z",
    "mode": "line_text_inbound"
  }
}
```

### Response
```json
{
  "ok": true,
  "intent": "repair_request",
  "confidence": 0.82,
  "should_handoff": false,
  "missing_fields": ["area", "preferred_date"],
  "extracted_fields": {
    "service_type": "repair",
    "symptoms": "แอร์ไม่เย็นครับ"
  },
  "customer_reply": "ขอทราบพื้นที่หน้างานก่อนนะครับ",
  "recommended_action": "reply_customer",
  "admin_summary": null,
  "decision_meta": {
    "decision_version": "line-runtime-v2-persistent",
    "policy_version": "runtime-policy-v1",
    "used_fallback": false,
    "error_code": null
  },
  "summary_note": "ข้อมูลภายในเช่น mergedFields/leadStatus/threadStatus ไม่ได้ถูกส่งกลับจาก endpoint นี้"
}
```

## POST `/api/cases/extract`
Extracts structured fields from Thai text.

### Request
```json
{
  "text": "ล้างแอร์ 3 เครื่อง อยู่ลาดพร้าว",
  "currentFields": {
    "customer_name": "สมชาย"
  }
}
```

## POST `/api/cases/handoff`
Creates an admin handoff for a service case.

### Request
```json
{
  "caseId": "uuid",
  "reason": "ลูกค้าถามราคาซ่อมแบบเฉพาะรุ่น",
  "triggerSource": "ai"
}
```

## GET `/api/admin/cases`
Lists cases for dashboard consumption.

### Query Params
- `status`: `all | new | collecting_info | qualified | quoted | handed_off | closed`

## GET `/api/admin/cases/:id`
Returns case detail with joined customer, thread, handoff, and messages.

## PATCH `/api/admin/cases/:id`
Updates admin-facing fields on the case.

### Request
```json
{
  "lead_status": "qualified",
  "admin_summary": "พร้อมโทรกลับเพื่อนัดหมาย",
  "notes": "ลูกค้าต้องการภายในสัปดาห์นี้"
}
```

## GET `/api/admin/knowledge`
Returns all knowledge docs ordered by update time.

## POST `/api/admin/knowledge`
Creates a knowledge record.

### Request
```json
{
  "title": "ค่าบริการล้างแอร์",
  "category": "faq",
  "content": "ล้างแอร์เริ่มต้น 600 บาทต่อเครื่อง",
  "tags": ["ราคา", "ล้างแอร์"],
  "status": "published"
}
```
