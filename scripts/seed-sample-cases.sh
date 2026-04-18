#!/usr/bin/env bash
set -euo pipefail

echo "Blocked: scripts/seed-sample-cases.sh writes directly to Supabase."
echo "Current local testing policy is mock-only / dry-run only."
echo "Use /api/dev/simulate/* or local fixtures instead."
exit 1

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

set -a
source .env.local
set +a

SUPABASE_REST_URL="${SUPABASE_URL}/rest/v1"
AUTH_HEADER="Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}"
API_KEY_HEADER="apikey: ${SUPABASE_SERVICE_ROLE_KEY}"
JSON_HEADER="Content-Type: application/json"
UPSERT_HEADER="Prefer: resolution=merge-duplicates,return=representation"

postgrest_upsert() {
  local table="$1"
  local payload="$2"

  curl --silent --show-error --fail \
    "${SUPABASE_REST_URL}/${table}?on_conflict=id" \
    -X POST \
    -H "$AUTH_HEADER" \
    -H "$API_KEY_HEADER" \
    -H "$JSON_HEADER" \
    -H "$UPSERT_HEADER" \
    -d "$payload" >/dev/null
}

postgrest_delete_by_metadata() {
  local table="$1"
  curl --silent --show-error \
    "${SUPABASE_REST_URL}/${table}?metadata->>source=eq.sample_seed" \
    -X DELETE \
    -H "$AUTH_HEADER" \
    -H "$API_KEY_HEADER" \
    -H "Prefer: return=minimal" >/dev/null || true
}

postgrest_delete_by_profile() {
  local table="$1"
  local provider="$2"
  local external_user_id="$3"
  curl --silent --show-error \
    "${SUPABASE_REST_URL}/${table}?provider=eq.${provider}&external_user_id=eq.${external_user_id}" \
    -X DELETE \
    -H "$AUTH_HEADER" \
    -H "$API_KEY_HEADER" \
    -H "Prefer: return=minimal" >/dev/null || true
}

postgrest_delete_by_id() {
  local table="$1"
  local id="$2"
  curl --silent --show-error \
    "${SUPABASE_REST_URL}/${table}?id=eq.${id}" \
    -X DELETE \
    -H "$AUTH_HEADER" \
    -H "$API_KEY_HEADER" \
    -H "Prefer: return=minimal" >/dev/null || true
}

# Clean up previous seeded rows so reruns stay deterministic.
postgrest_delete_by_metadata "conversation_messages"
postgrest_delete_by_id "admin_handoffs" "00000000-0000-0000-0000-000000000501"
postgrest_delete_by_id "service_cases" "00000000-0000-0000-0000-000000000101"
postgrest_delete_by_id "service_cases" "00000000-0000-0000-0000-000000000102"
postgrest_delete_by_id "service_cases" "00000000-0000-0000-0000-000000000103"
postgrest_delete_by_id "conversation_threads" "00000000-0000-0000-0000-000000000201"
postgrest_delete_by_id "conversation_threads" "00000000-0000-0000-0000-000000000202"
postgrest_delete_by_id "conversation_threads" "00000000-0000-0000-0000-000000000203"
postgrest_delete_by_profile "customer_channels" "line" "sample-line-user-001"
postgrest_delete_by_profile "customer_channels" "line" "sample-line-user-002"
postgrest_delete_by_profile "customer_channels" "line" "sample-line-user-003"
postgrest_delete_by_id "customers" "00000000-0000-0000-0000-000000000301"
postgrest_delete_by_id "customers" "00000000-0000-0000-0000-000000000302"
postgrest_delete_by_id "customers" "00000000-0000-0000-0000-000000000303"

postgrest_upsert "customers" '[
  {
    "id":"00000000-0000-0000-0000-000000000301",
    "display_name":"คุณสมชาย ทดสอบ",
    "phone":"0891112233",
    "phone_digits":"0891112233",
    "default_area":"ลาดพร้าว",
    "metadata":{"source":"sample_seed"}
  },
  {
    "id":"00000000-0000-0000-0000-000000000302",
    "display_name":"คุณมณี ทดสอบ",
    "phone":"0862223344",
    "phone_digits":"0862223344",
    "default_area":"บางนา",
    "metadata":{"source":"sample_seed"}
  },
  {
    "id":"00000000-0000-0000-0000-000000000303",
    "display_name":"คุณอารีย์ ทดสอบ",
    "phone":"0813334455",
    "phone_digits":"0813334455",
    "default_area":"ชลบุรี",
    "metadata":{"source":"sample_seed"}
  }
]'

postgrest_upsert "customer_channels" '[
  {
    "id":"00000000-0000-0000-0000-000000000401",
    "customer_id":"00000000-0000-0000-0000-000000000301",
    "channel_type":"line",
    "channel_value":"sample-line-user-001",
    "provider":"line",
    "external_user_id":"sample-line-user-001",
    "external_profile":{"displayName":"คุณสมชาย ทดสอบ"}
  },
  {
    "id":"00000000-0000-0000-0000-000000000402",
    "customer_id":"00000000-0000-0000-0000-000000000302",
    "channel_type":"line",
    "channel_value":"sample-line-user-002",
    "provider":"line",
    "external_user_id":"sample-line-user-002",
    "external_profile":{"displayName":"คุณมณี ทดสอบ"}
  },
  {
    "id":"00000000-0000-0000-0000-000000000403",
    "customer_id":"00000000-0000-0000-0000-000000000303",
    "channel_type":"line",
    "channel_value":"sample-line-user-003",
    "provider":"line",
    "external_user_id":"sample-line-user-003",
    "external_profile":{"displayName":"คุณอารีย์ ทดสอบ"}
  }
]'

postgrest_upsert "conversation_threads" '[
  {
    "id":"00000000-0000-0000-0000-000000000201",
    "customer_id":"00000000-0000-0000-0000-000000000301",
    "channel_provider":"line",
    "status":"qualified",
    "summary":"ลูกค้า: คุณสมชาย ทดสอบ | ประเภทงาน: cleaning | พื้นที่: ลาดพร้าว | วันที่สะดวก: 2026-04-20 ช่วงเช้า | ข้อมูลสำคัญครบในระดับพร้อมคัดกรอง",
    "last_customer_message_at":"2026-04-15T09:00:00.000Z",
    "last_assistant_message_at":"2026-04-15T09:02:00.000Z",
    "metadata":{"source":"sample_seed"}
  },
  {
    "id":"00000000-0000-0000-0000-000000000202",
    "customer_id":"00000000-0000-0000-0000-000000000302",
    "channel_provider":"line",
    "status":"waiting_customer",
    "summary":"ลูกค้า: คุณมณี ทดสอบ | ประเภทงาน: repair | พื้นที่: บางนา | อาการ/รายละเอียด: แอร์ไม่เย็นและมีน้ำหยด | ข้อมูลที่ยังขาด: preferred_date",
    "last_customer_message_at":"2026-04-15T09:15:00.000Z",
    "last_assistant_message_at":"2026-04-15T09:17:00.000Z",
    "metadata":{"source":"sample_seed"}
  },
  {
    "id":"00000000-0000-0000-0000-000000000203",
    "customer_id":"00000000-0000-0000-0000-000000000303",
    "channel_provider":"line",
    "status":"handed_off",
    "summary":"ลูกค้า: คุณอารีย์ ทดสอบ | ประเภทงาน: cold_room | พื้นที่: ชลบุรี | อาการ/รายละเอียด: ห้องเย็นอุณหภูมิไม่คงที่และมีแจ้งเตือนที่ตู้คอนโทรล | ข้อมูลสำคัญครบในระดับพร้อมคัดกรอง",
    "last_customer_message_at":"2026-04-15T08:20:00.000Z",
    "last_assistant_message_at":"2026-04-15T08:23:00.000Z",
    "metadata":{"source":"sample_seed"}
  }
]'

postgrest_upsert "service_cases" '[
  {
    "id":"00000000-0000-0000-0000-000000000101",
    "customer_id":"00000000-0000-0000-0000-000000000301",
    "thread_id":"00000000-0000-0000-0000-000000000201",
    "lead_status":"qualified",
    "service_type":"cleaning",
    "ai_intent":"cleaning_request",
    "ai_confidence":0.91,
    "extracted_fields":{
      "customer_name":"คุณสมชาย ทดสอบ",
      "phone":"0891112233",
      "area":"ลาดพร้าว",
      "service_type":"cleaning",
      "machine_count":2,
      "preferred_date":"2026-04-20 ช่วงเช้า",
      "urgency":"medium"
    },
    "missing_fields":[],
    "summary":"ลูกค้า: คุณสมชาย ทดสอบ | ประเภทงาน: cleaning | พื้นที่: ลาดพร้าว | วันที่สะดวก: 2026-04-20 ช่วงเช้า | ข้อมูลสำคัญครบในระดับพร้อมคัดกรอง"
  },
  {
    "id":"00000000-0000-0000-0000-000000000102",
    "customer_id":"00000000-0000-0000-0000-000000000302",
    "thread_id":"00000000-0000-0000-0000-000000000202",
    "lead_status":"collecting_info",
    "service_type":"repair",
    "ai_intent":"repair_request",
    "ai_confidence":0.84,
    "extracted_fields":{
      "customer_name":"คุณมณี ทดสอบ",
      "phone":"0862223344",
      "area":"บางนา",
      "service_type":"repair",
      "symptoms":"แอร์ไม่เย็นและมีน้ำหยด",
      "urgency":"high"
    },
    "missing_fields":["preferred_date"],
    "summary":"ลูกค้า: คุณมณี ทดสอบ | ประเภทงาน: repair | พื้นที่: บางนา | อาการ/รายละเอียด: แอร์ไม่เย็นและมีน้ำหยด | ข้อมูลที่ยังขาด: preferred_date"
  },
  {
    "id":"00000000-0000-0000-0000-000000000103",
    "customer_id":"00000000-0000-0000-0000-000000000303",
    "thread_id":"00000000-0000-0000-0000-000000000203",
    "lead_status":"handed_off",
    "service_type":"cold_room",
    "ai_intent":"cold_room_request",
    "ai_confidence":0.42,
    "extracted_fields":{
      "customer_name":"คุณอารีย์ ทดสอบ",
      "phone":"0813334455",
      "area":"ชลบุรี",
      "service_type":"cold_room",
      "symptoms":"ห้องเย็นอุณหภูมิไม่คงที่และมีแจ้งเตือนที่ตู้คอนโทรล",
      "preferred_date":"2026-04-18",
      "urgency":"high"
    },
    "missing_fields":[],
    "summary":"ลูกค้า: คุณอารีย์ ทดสอบ | ประเภทงาน: cold_room | พื้นที่: ชลบุรี | อาการ/รายละเอียด: ห้องเย็นอุณหภูมิไม่คงที่และมีแจ้งเตือนที่ตู้คอนโทรล | ข้อมูลสำคัญครบในระดับพร้อมคัดกรอง",
    "handoff_reason":"งานห้องเย็นเป็นงานเฉพาะทาง ต้องให้แอดมินประเมินและจัดช่าง"
  }
]'

postgrest_upsert "admin_handoffs" '[
  {
    "id":"00000000-0000-0000-0000-000000000501",
    "case_id":"00000000-0000-0000-0000-000000000103",
    "thread_id":"00000000-0000-0000-0000-000000000203",
    "handoff_reason":"งานห้องเย็นเป็นงานเฉพาะทาง ต้องให้แอดมินประเมินและจัดช่าง",
    "summary_payload":{
      "caseId":"00000000-0000-0000-0000-000000000103",
      "customerName":"คุณอารีย์ ทดสอบ",
      "phone":"0813334455",
      "area":"ชลบุรี",
      "serviceType":"cold_room",
      "symptoms":"ห้องเย็นอุณหภูมิไม่คงที่และมีแจ้งเตือนที่ตู้คอนโทรล",
      "preferredDate":"2026-04-18",
      "urgency":"high",
      "leadStatus":"handed_off",
      "summary":"งานห้องเย็นต้องให้แอดมินรับช่วงต่อ"
    },
    "status":"pending"
  }
]'

postgrest_upsert "conversation_messages" '[
  {
    "id":"00000000-0000-0000-0000-000000000601",
    "thread_id":"00000000-0000-0000-0000-000000000201",
    "case_id":"00000000-0000-0000-0000-000000000101",
    "role":"customer",
    "message_text":"สวัสดีครับ อยากล้างแอร์ 2 เครื่อง อยู่ลาดพร้าว ขอคิวช่วงเช้าวันที่ 20 ได้ไหมครับ",
    "metadata":{"source":"sample_seed"}
  },
  {
    "id":"00000000-0000-0000-0000-000000000602",
    "thread_id":"00000000-0000-0000-0000-000000000201",
    "case_id":"00000000-0000-0000-0000-000000000101",
    "role":"assistant",
    "message_text":"รับทราบครับ ตอนนี้ผมบันทึกข้อมูลเบื้องต้นให้แล้ว เป็นงานล้างแอร์ 2 เครื่อง พื้นที่ลาดพร้าว และสะดวกวันที่ 20 ช่วงเช้า เคสนี้พร้อมส่งต่อแอดมินเพื่อตรวจสอบคิวและยืนยันรายละเอียดต่อครับ",
    "metadata":{"source":"sample_seed"}
  },
  {
    "id":"00000000-0000-0000-0000-000000000603",
    "thread_id":"00000000-0000-0000-0000-000000000202",
    "case_id":"00000000-0000-0000-0000-000000000102",
    "role":"customer",
    "message_text":"แอร์ไม่เย็นค่ะ อยู่บางนา แล้วมีน้ำหยดด้วยค่ะ",
    "metadata":{"source":"sample_seed"}
  },
  {
    "id":"00000000-0000-0000-0000-000000000604",
    "thread_id":"00000000-0000-0000-0000-000000000202",
    "case_id":"00000000-0000-0000-0000-000000000102",
    "role":"assistant",
    "message_text":"รับทราบครับ ตอนนี้ผมบันทึกอาการเบื้องต้นว่าแอร์ไม่เย็นและมีน้ำหยดแล้ว ขอทราบช่วงวันที่หรือเวลาที่สะดวกให้ช่างเข้าตรวจเพิ่มเติมอีกนิดนะครับ",
    "metadata":{"source":"sample_seed"}
  },
  {
    "id":"00000000-0000-0000-0000-000000000605",
    "thread_id":"00000000-0000-0000-0000-000000000203",
    "case_id":"00000000-0000-0000-0000-000000000103",
    "role":"customer",
    "message_text":"ขอให้ช่วยดูห้องเย็นที่โรงงานหน่อยค่ะ อุณหภูมิไม่นิ่งและมีแจ้งเตือนที่ตู้คอนโทรล",
    "metadata":{"source":"sample_seed"}
  },
  {
    "id":"00000000-0000-0000-0000-000000000606",
    "thread_id":"00000000-0000-0000-0000-000000000203",
    "case_id":"00000000-0000-0000-0000-000000000103",
    "role":"assistant",
    "message_text":"รับทราบครับ งานห้องเย็นเป็นงานเฉพาะทาง ผมได้สรุปข้อมูลเบื้องต้นและส่งต่อให้แอดมินช่วยประเมินและประสานช่างที่เหมาะสมให้แล้วครับ",
    "metadata":{"source":"sample_seed","handoff":true}
  }
]'

echo "Seeded sample cases into Supabase successfully."
