create extension if not exists "pgcrypto";

create type channel_provider as enum ('line', 'facebook', 'website', 'instagram');
create type thread_status as enum ('open', 'waiting_customer', 'qualified', 'handed_off', 'closed');
create type message_role as enum ('customer', 'assistant', 'admin', 'system');
create type lead_status as enum ('new', 'collecting_info', 'qualified', 'quoted', 'handed_off', 'closed');
create type service_type as enum ('cleaning', 'repair', 'inspection', 'relocation', 'cold_room', 'other');
create type handoff_status as enum ('pending', 'accepted', 'resolved');
create type doc_status as enum ('draft', 'published');

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  display_name text,
  phone text,
  default_area text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists customer_channels (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  provider channel_provider not null,
  external_user_id text not null,
  external_profile jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider, external_user_id)
);

create table if not exists conversation_threads (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  channel_provider channel_provider not null,
  status thread_status not null default 'open',
  summary text,
  last_customer_message_at timestamptz,
  last_assistant_message_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_conversation_threads_customer_status on conversation_threads(customer_id, status, updated_at desc);

create table if not exists service_cases (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  thread_id uuid not null references conversation_threads(id) on delete cascade,
  lead_status lead_status not null default 'new',
  service_type service_type,
  ai_intent text,
  ai_confidence numeric(4,3),
  extracted_fields jsonb not null default '{}'::jsonb,
  missing_fields text[] not null default '{}',
  summary text,
  handoff_reason text,
  admin_summary text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_service_cases_status_updated on service_cases(lead_status, updated_at desc);
create index if not exists idx_service_cases_thread on service_cases(thread_id);

create table if not exists conversation_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references conversation_threads(id) on delete cascade,
  case_id uuid references service_cases(id) on delete set null,
  role message_role not null,
  provider_message_id text,
  message_text text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_conversation_messages_thread_created on conversation_messages(thread_id, created_at asc);
create index if not exists idx_conversation_messages_case_created on conversation_messages(case_id, created_at asc);

create table if not exists knowledge_docs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null,
  content text not null,
  tags text[] not null default '{}',
  status doc_status not null default 'published',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_knowledge_docs_status_category on knowledge_docs(status, category);

create table if not exists service_catalog (
  id uuid primary key default gen_random_uuid(),
  service_code text not null unique,
  service_name_th text not null,
  description text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists pricing_rules (
  id uuid primary key default gen_random_uuid(),
  service_code text not null references service_catalog(service_code) on delete cascade,
  price_label text not null,
  details text not null,
  rule_type text not null default 'base_price',
  currency text not null default 'THB',
  amount_min numeric(12,2),
  amount_max numeric(12,2),
  conditions jsonb not null default '{}'::jsonb,
  display_order int not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_pricing_rules_service_active on pricing_rules(service_code, is_active, display_order);

create table if not exists admin_handoffs (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references service_cases(id) on delete cascade,
  thread_id uuid not null references conversation_threads(id) on delete cascade,
  handoff_reason text not null,
  summary_payload jsonb not null default '{}'::jsonb,
  status handoff_status not null default 'pending',
  handled_by text,
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_admin_handoffs_status_created on admin_handoffs(status, created_at desc);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_entity_created on audit_logs(entity_type, entity_id, created_at desc);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_customers_updated_at on customers;
create trigger trg_customers_updated_at before update on customers for each row execute function set_updated_at();

drop trigger if exists trg_customer_channels_updated_at on customer_channels;
create trigger trg_customer_channels_updated_at before update on customer_channels for each row execute function set_updated_at();

drop trigger if exists trg_conversation_threads_updated_at on conversation_threads;
create trigger trg_conversation_threads_updated_at before update on conversation_threads for each row execute function set_updated_at();

drop trigger if exists trg_service_cases_updated_at on service_cases;
create trigger trg_service_cases_updated_at before update on service_cases for each row execute function set_updated_at();

drop trigger if exists trg_knowledge_docs_updated_at on knowledge_docs;
create trigger trg_knowledge_docs_updated_at before update on knowledge_docs for each row execute function set_updated_at();

drop trigger if exists trg_service_catalog_updated_at on service_catalog;
create trigger trg_service_catalog_updated_at before update on service_catalog for each row execute function set_updated_at();

drop trigger if exists trg_pricing_rules_updated_at on pricing_rules;
create trigger trg_pricing_rules_updated_at before update on pricing_rules for each row execute function set_updated_at();

drop trigger if exists trg_admin_handoffs_updated_at on admin_handoffs;
create trigger trg_admin_handoffs_updated_at before update on admin_handoffs for each row execute function set_updated_at();
