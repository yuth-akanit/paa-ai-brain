create extension if not exists "pgcrypto";

do $$
begin
  if not exists (select 1 from pg_type where typname = 'channel_provider') then
    create type channel_provider as enum ('line', 'facebook', 'website', 'instagram');
  end if;

  if not exists (select 1 from pg_type where typname = 'thread_status') then
    create type thread_status as enum ('open', 'waiting_customer', 'qualified', 'handed_off', 'closed');
  end if;

  if not exists (select 1 from pg_type where typname = 'message_role') then
    create type message_role as enum ('customer', 'assistant', 'admin', 'system');
  end if;

  if not exists (select 1 from pg_type where typname = 'lead_status') then
    create type lead_status as enum ('new', 'collecting_info', 'qualified', 'quoted', 'handed_off', 'closed');
  end if;

  if not exists (select 1 from pg_type where typname = 'service_type') then
    create type service_type as enum ('cleaning', 'repair', 'inspection', 'relocation', 'cold_room', 'other');
  end if;

  if not exists (select 1 from pg_type where typname = 'handoff_status') then
    create type handoff_status as enum ('pending', 'accepted', 'resolved');
  end if;

  if not exists (select 1 from pg_type where typname = 'doc_status') then
    create type doc_status as enum ('draft', 'published');
  end if;
end $$;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  display_name text,
  phone text,
  default_area text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.customers add column if not exists display_name text;
alter table public.customers add column if not exists phone text;
alter table public.customers add column if not exists default_area text;
alter table public.customers add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.customers add column if not exists created_at timestamptz not null default now();
alter table public.customers add column if not exists updated_at timestamptz not null default now();

create table if not exists public.customer_channels (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  provider channel_provider not null,
  external_user_id text not null,
  external_profile jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider, external_user_id)
);

alter table public.customer_channels add column if not exists customer_id uuid references public.customers(id) on delete cascade;
alter table public.customer_channels add column if not exists provider channel_provider;
alter table public.customer_channels add column if not exists external_user_id text;
alter table public.customer_channels add column if not exists external_profile jsonb not null default '{}'::jsonb;
alter table public.customer_channels add column if not exists created_at timestamptz not null default now();
alter table public.customer_channels add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'customer_channels_provider_external_user_id_key'
  ) then
    alter table public.customer_channels
    add constraint customer_channels_provider_external_user_id_key unique (provider, external_user_id);
  end if;
end $$;

create table if not exists public.conversation_threads (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  channel_provider channel_provider not null,
  status thread_status not null default 'open',
  summary text,
  last_customer_message_at timestamptz,
  last_assistant_message_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.conversation_threads add column if not exists customer_id uuid references public.customers(id) on delete cascade;
alter table public.conversation_threads add column if not exists channel_provider channel_provider;
alter table public.conversation_threads add column if not exists status thread_status not null default 'open';
alter table public.conversation_threads add column if not exists summary text;
alter table public.conversation_threads add column if not exists last_customer_message_at timestamptz;
alter table public.conversation_threads add column if not exists last_assistant_message_at timestamptz;
alter table public.conversation_threads add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.conversation_threads add column if not exists created_at timestamptz not null default now();
alter table public.conversation_threads add column if not exists updated_at timestamptz not null default now();

create table if not exists public.service_cases (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  thread_id uuid not null references public.conversation_threads(id) on delete cascade,
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

alter table public.service_cases add column if not exists customer_id uuid references public.customers(id) on delete cascade;
alter table public.service_cases add column if not exists thread_id uuid references public.conversation_threads(id) on delete cascade;
alter table public.service_cases add column if not exists lead_status lead_status not null default 'new';
alter table public.service_cases add column if not exists service_type service_type;
alter table public.service_cases add column if not exists ai_intent text;
alter table public.service_cases add column if not exists ai_confidence numeric(4,3);
alter table public.service_cases add column if not exists extracted_fields jsonb not null default '{}'::jsonb;
alter table public.service_cases add column if not exists missing_fields text[] not null default '{}';
alter table public.service_cases add column if not exists summary text;
alter table public.service_cases add column if not exists handoff_reason text;
alter table public.service_cases add column if not exists admin_summary text;
alter table public.service_cases add column if not exists notes text;
alter table public.service_cases add column if not exists created_at timestamptz not null default now();
alter table public.service_cases add column if not exists updated_at timestamptz not null default now();

create table if not exists public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.conversation_threads(id) on delete cascade,
  case_id uuid references public.service_cases(id) on delete set null,
  role message_role not null,
  provider_message_id text,
  message_text text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.conversation_messages add column if not exists thread_id uuid references public.conversation_threads(id) on delete cascade;
alter table public.conversation_messages add column if not exists case_id uuid references public.service_cases(id) on delete set null;
alter table public.conversation_messages add column if not exists role message_role;
alter table public.conversation_messages add column if not exists provider_message_id text;
alter table public.conversation_messages add column if not exists message_text text;
alter table public.conversation_messages add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.conversation_messages add column if not exists created_at timestamptz not null default now();

create table if not exists public.knowledge_docs (
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

alter table public.knowledge_docs add column if not exists title text;
alter table public.knowledge_docs add column if not exists category text;
alter table public.knowledge_docs add column if not exists content text;
alter table public.knowledge_docs add column if not exists tags text[] not null default '{}';
alter table public.knowledge_docs add column if not exists status doc_status not null default 'published';
alter table public.knowledge_docs add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.knowledge_docs add column if not exists created_at timestamptz not null default now();
alter table public.knowledge_docs add column if not exists updated_at timestamptz not null default now();

create table if not exists public.service_catalog (
  id uuid primary key default gen_random_uuid(),
  service_code text not null unique,
  service_name_th text not null,
  description text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.service_catalog add column if not exists service_code text;
alter table public.service_catalog add column if not exists service_name_th text;
alter table public.service_catalog add column if not exists description text;
alter table public.service_catalog add column if not exists is_active boolean not null default true;
alter table public.service_catalog add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.service_catalog add column if not exists created_at timestamptz not null default now();
alter table public.service_catalog add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'service_catalog_service_code_key'
  ) then
    alter table public.service_catalog
    add constraint service_catalog_service_code_key unique (service_code);
  end if;
end $$;

create table if not exists public.pricing_rules (
  id uuid primary key default gen_random_uuid(),
  service_code text not null references public.service_catalog(service_code) on delete cascade,
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

alter table public.pricing_rules add column if not exists service_code text references public.service_catalog(service_code) on delete cascade;
alter table public.pricing_rules add column if not exists price_label text;
alter table public.pricing_rules add column if not exists details text;
alter table public.pricing_rules add column if not exists rule_type text not null default 'base_price';
alter table public.pricing_rules add column if not exists currency text not null default 'THB';
alter table public.pricing_rules add column if not exists amount_min numeric(12,2);
alter table public.pricing_rules add column if not exists amount_max numeric(12,2);
alter table public.pricing_rules add column if not exists conditions jsonb not null default '{}'::jsonb;
alter table public.pricing_rules add column if not exists display_order int not null default 100;
alter table public.pricing_rules add column if not exists is_active boolean not null default true;
alter table public.pricing_rules add column if not exists created_at timestamptz not null default now();
alter table public.pricing_rules add column if not exists updated_at timestamptz not null default now();

create table if not exists public.admin_handoffs (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.service_cases(id) on delete cascade,
  thread_id uuid not null references public.conversation_threads(id) on delete cascade,
  handoff_reason text not null,
  summary_payload jsonb not null default '{}'::jsonb,
  status handoff_status not null default 'pending',
  handled_by text,
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.admin_handoffs add column if not exists case_id uuid references public.service_cases(id) on delete cascade;
alter table public.admin_handoffs add column if not exists thread_id uuid references public.conversation_threads(id) on delete cascade;
alter table public.admin_handoffs add column if not exists handoff_reason text;
alter table public.admin_handoffs add column if not exists summary_payload jsonb not null default '{}'::jsonb;
alter table public.admin_handoffs add column if not exists status handoff_status not null default 'pending';
alter table public.admin_handoffs add column if not exists handled_by text;
alter table public.admin_handoffs add column if not exists handled_at timestamptz;
alter table public.admin_handoffs add column if not exists created_at timestamptz not null default now();
alter table public.admin_handoffs add column if not exists updated_at timestamptz not null default now();

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.audit_logs add column if not exists entity_type text;
alter table public.audit_logs add column if not exists entity_id uuid;
alter table public.audit_logs add column if not exists action text;
alter table public.audit_logs add column if not exists payload jsonb not null default '{}'::jsonb;
alter table public.audit_logs add column if not exists created_at timestamptz not null default now();

create index if not exists idx_conversation_threads_customer_status on public.conversation_threads(customer_id, status, updated_at desc);
create index if not exists idx_service_cases_status_updated on public.service_cases(lead_status, updated_at desc);
create index if not exists idx_service_cases_thread on public.service_cases(thread_id);
create index if not exists idx_conversation_messages_thread_created on public.conversation_messages(thread_id, created_at asc);
create index if not exists idx_conversation_messages_case_created on public.conversation_messages(case_id, created_at asc);
create index if not exists idx_knowledge_docs_status_category on public.knowledge_docs(status, category);
create index if not exists idx_pricing_rules_service_active on public.pricing_rules(service_code, is_active, display_order);
create index if not exists idx_admin_handoffs_status_created on public.admin_handoffs(status, created_at desc);
create index if not exists idx_audit_logs_entity_created on public.audit_logs(entity_type, entity_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_customers_updated_at on public.customers;
create trigger trg_customers_updated_at before update on public.customers for each row execute function public.set_updated_at();

drop trigger if exists trg_customer_channels_updated_at on public.customer_channels;
create trigger trg_customer_channels_updated_at before update on public.customer_channels for each row execute function public.set_updated_at();

drop trigger if exists trg_conversation_threads_updated_at on public.conversation_threads;
create trigger trg_conversation_threads_updated_at before update on public.conversation_threads for each row execute function public.set_updated_at();

drop trigger if exists trg_service_cases_updated_at on public.service_cases;
create trigger trg_service_cases_updated_at before update on public.service_cases for each row execute function public.set_updated_at();

drop trigger if exists trg_knowledge_docs_updated_at on public.knowledge_docs;
create trigger trg_knowledge_docs_updated_at before update on public.knowledge_docs for each row execute function public.set_updated_at();

drop trigger if exists trg_service_catalog_updated_at on public.service_catalog;
create trigger trg_service_catalog_updated_at before update on public.service_catalog for each row execute function public.set_updated_at();

drop trigger if exists trg_pricing_rules_updated_at on public.pricing_rules;
create trigger trg_pricing_rules_updated_at before update on public.pricing_rules for each row execute function public.set_updated_at();

drop trigger if exists trg_admin_handoffs_updated_at on public.admin_handoffs;
create trigger trg_admin_handoffs_updated_at before update on public.admin_handoffs for each row execute function public.set_updated_at();
