with customer_1 as (
  insert into customers (display_name, phone, default_area, metadata)
  values ('คุณสมชาย ทดสอบ', '0891112233', 'ลาดพร้าว', '{"source":"sample_seed"}'::jsonb)
  returning id
),
channel_1 as (
  insert into customer_channels (customer_id, provider, external_user_id, external_profile)
  select id, 'line', 'sample-line-user-001', '{"displayName":"คุณสมชาย ทดสอบ"}'::jsonb
  from customer_1
  on conflict (provider, external_user_id) do update set
    external_profile = excluded.external_profile
  returning customer_id
),
thread_1 as (
  insert into conversation_threads (
    customer_id,
    channel_provider,
    status,
    summary,
    last_customer_message_at,
    last_assistant_message_at,
    metadata
  )
  select
    customer_id,
    'line',
    'qualified',
    'ลูกค้า: คุณสมชาย ทดสอบ | ประเภทงาน: cleaning | พื้นที่: ลาดพร้าว | วันที่สะดวก: 2026-04-20 ช่วงเช้า | ข้อมูลสำคัญครบในระดับพร้อมคัดกรอง',
    now() - interval '30 minutes',
    now() - interval '28 minutes',
    '{"source":"sample_seed"}'::jsonb
  from channel_1
  returning id, customer_id
),
case_1 as (
  insert into service_cases (
    customer_id,
    thread_id,
    lead_status,
    service_type,
    ai_intent,
    ai_confidence,
    extracted_fields,
    missing_fields,
    summary
  )
  select
    customer_id,
    id,
    'qualified',
    'cleaning',
    'cleaning_request',
    0.91,
    '{
      "customer_name":"คุณสมชาย ทดสอบ",
      "phone":"0891112233",
      "area":"ลาดพร้าว",
      "service_type":"cleaning",
      "machine_count":2,
      "preferred_date":"2026-04-20 ช่วงเช้า",
      "urgency":"medium"
    }'::jsonb,
    '{}'::text[],
    'ลูกค้า: คุณสมชาย ทดสอบ | ประเภทงาน: cleaning | พื้นที่: ลาดพร้าว | วันที่สะดวก: 2026-04-20 ช่วงเช้า | ข้อมูลสำคัญครบในระดับพร้อมคัดกรอง'
  from thread_1
  returning id, thread_id
)
insert into conversation_messages (thread_id, case_id, role, message_text, metadata)
select thread_id, id, 'customer', 'สวัสดีครับ อยากล้างแอร์ 2 เครื่อง อยู่ลาดพร้าว ขอคิวช่วงเช้าวันที่ 20 ได้ไหมครับ', '{"source":"sample_seed"}'::jsonb
from case_1
union all
select thread_id, id, 'assistant', 'รับทราบครับ ตอนนี้ผมบันทึกข้อมูลเบื้องต้นให้แล้ว เป็นงานล้างแอร์ 2 เครื่อง พื้นที่ลาดพร้าว และสะดวกวันที่ 20 ช่วงเช้า เคสนี้พร้อมส่งต่อแอดมินเพื่อตรวจสอบคิวและยืนยันรายละเอียดต่อครับ', '{"source":"sample_seed"}'::jsonb
from case_1;

with customer_2 as (
  insert into customers (display_name, phone, default_area, metadata)
  values ('คุณมณี ทดสอบ', '0862223344', 'บางนา', '{"source":"sample_seed"}'::jsonb)
  returning id
),
channel_2 as (
  insert into customer_channels (customer_id, provider, external_user_id, external_profile)
  select id, 'line', 'sample-line-user-002', '{"displayName":"คุณมณี ทดสอบ"}'::jsonb
  from customer_2
  on conflict (provider, external_user_id) do update set
    external_profile = excluded.external_profile
  returning customer_id
),
thread_2 as (
  insert into conversation_threads (
    customer_id,
    channel_provider,
    status,
    summary,
    last_customer_message_at,
    last_assistant_message_at,
    metadata
  )
  select
    customer_id,
    'line',
    'waiting_customer',
    'ลูกค้า: คุณมณี ทดสอบ | ประเภทงาน: repair | พื้นที่: บางนา | อาการ/รายละเอียด: แอร์ไม่เย็นและมีน้ำหยด | ข้อมูลที่ยังขาด: preferred_date',
    now() - interval '12 minutes',
    now() - interval '10 minutes',
    '{"source":"sample_seed"}'::jsonb
  from channel_2
  returning id, customer_id
),
case_2 as (
  insert into service_cases (
    customer_id,
    thread_id,
    lead_status,
    service_type,
    ai_intent,
    ai_confidence,
    extracted_fields,
    missing_fields,
    summary
  )
  select
    customer_id,
    id,
    'collecting_info',
    'repair',
    'repair_request',
    0.84,
    '{
      "customer_name":"คุณมณี ทดสอบ",
      "phone":"0862223344",
      "area":"บางนา",
      "service_type":"repair",
      "symptoms":"แอร์ไม่เย็นและมีน้ำหยด",
      "urgency":"high"
    }'::jsonb,
    array['preferred_date']::text[],
    'ลูกค้า: คุณมณี ทดสอบ | ประเภทงาน: repair | พื้นที่: บางนา | อาการ/รายละเอียด: แอร์ไม่เย็นและมีน้ำหยด | ข้อมูลที่ยังขาด: preferred_date'
  from thread_2
  returning id, thread_id
)
insert into conversation_messages (thread_id, case_id, role, message_text, metadata)
select thread_id, id, 'customer', 'แอร์ไม่เย็นค่ะ อยู่บางนา แล้วมีน้ำหยดด้วยค่ะ', '{"source":"sample_seed"}'::jsonb
from case_2
union all
select thread_id, id, 'assistant', 'รับทราบครับ ตอนนี้ผมบันทึกอาการเบื้องต้นว่าแอร์ไม่เย็นและมีน้ำหยดแล้ว ขอทราบช่วงวันที่หรือเวลาที่สะดวกให้ช่างเข้าตรวจเพิ่มเติมอีกนิดนะครับ', '{"source":"sample_seed"}'::jsonb
from case_2;

with customer_3 as (
  insert into customers (display_name, phone, default_area, metadata)
  values ('คุณอารีย์ ทดสอบ', '0813334455', 'ชลบุรี', '{"source":"sample_seed"}'::jsonb)
  returning id
),
channel_3 as (
  insert into customer_channels (customer_id, provider, external_user_id, external_profile)
  select id, 'line', 'sample-line-user-003', '{"displayName":"คุณอารีย์ ทดสอบ"}'::jsonb
  from customer_3
  on conflict (provider, external_user_id) do update set
    external_profile = excluded.external_profile
  returning customer_id
),
thread_3 as (
  insert into conversation_threads (
    customer_id,
    channel_provider,
    status,
    summary,
    last_customer_message_at,
    last_assistant_message_at,
    metadata
  )
  select
    customer_id,
    'line',
    'handed_off',
    'ลูกค้า: คุณอารีย์ ทดสอบ | ประเภทงาน: cold_room | พื้นที่: ชลบุรี | อาการ/รายละเอียด: ห้องเย็นอุณหภูมิไม่คงที่และมีแจ้งเตือนที่ตู้คอนโทรล | ข้อมูลสำคัญครบในระดับพร้อมคัดกรอง',
    now() - interval '50 minutes',
    now() - interval '47 minutes',
    '{"source":"sample_seed"}'::jsonb
  from channel_3
  returning id, customer_id
),
case_3 as (
  insert into service_cases (
    customer_id,
    thread_id,
    lead_status,
    service_type,
    ai_intent,
    ai_confidence,
    extracted_fields,
    missing_fields,
    summary,
    handoff_reason
  )
  select
    customer_id,
    id,
    'handed_off',
    'cold_room',
    'cold_room_request',
    0.42,
    '{
      "customer_name":"คุณอารีย์ ทดสอบ",
      "phone":"0813334455",
      "area":"ชลบุรี",
      "service_type":"cold_room",
      "symptoms":"ห้องเย็นอุณหภูมิไม่คงที่และมีแจ้งเตือนที่ตู้คอนโทรล",
      "preferred_date":"2026-04-18",
      "urgency":"high"
    }'::jsonb,
    '{}'::text[],
    'ลูกค้า: คุณอารีย์ ทดสอบ | ประเภทงาน: cold_room | พื้นที่: ชลบุรี | อาการ/รายละเอียด: ห้องเย็นอุณหภูมิไม่คงที่และมีแจ้งเตือนที่ตู้คอนโทรล | ข้อมูลสำคัญครบในระดับพร้อมคัดกรอง',
    'งานห้องเย็นเป็นงานเฉพาะทาง ต้องให้แอดมินประเมินและจัดช่าง'
  from thread_3
  returning id, thread_id
),
handoff_3 as (
  insert into admin_handoffs (
    case_id,
    thread_id,
    handoff_reason,
    summary_payload,
    status
  )
  select
    id,
    thread_id,
    'งานห้องเย็นเป็นงานเฉพาะทาง ต้องให้แอดมินประเมินและจัดช่าง',
    '{
      "caseId":"sample-cold-room",
      "customerName":"คุณอารีย์ ทดสอบ",
      "phone":"0813334455",
      "area":"ชลบุรี",
      "serviceType":"cold_room",
      "symptoms":"ห้องเย็นอุณหภูมิไม่คงที่และมีแจ้งเตือนที่ตู้คอนโทรล",
      "preferredDate":"2026-04-18",
      "urgency":"high",
      "leadStatus":"handed_off",
      "summary":"งานห้องเย็นต้องให้แอดมินรับช่วงต่อ"
    }'::jsonb,
    'pending'
  from case_3
  returning case_id, thread_id
)
insert into conversation_messages (thread_id, case_id, role, message_text, metadata)
select thread_id, case_id, 'customer', 'ขอให้ช่วยดูห้องเย็นที่โรงงานหน่อยค่ะ อุณหภูมิไม่นิ่งและมีแจ้งเตือนที่ตู้คอนโทรล', '{"source":"sample_seed"}'::jsonb
from handoff_3
union all
select thread_id, case_id, 'assistant', 'รับทราบครับ งานห้องเย็นเป็นงานเฉพาะทาง ผมได้สรุปข้อมูลเบื้องต้นและส่งต่อให้แอดมินช่วยประเมินและประสานช่างที่เหมาะสมให้แล้วครับ', '{"source":"sample_seed","handoff":true}'::jsonb
from handoff_3;
