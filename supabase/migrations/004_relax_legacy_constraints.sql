do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'pricing_rules'
      and column_name = 'issue_type'
  ) then
    alter table public.pricing_rules
    alter column issue_type drop not null;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'pricing_rules'
      and column_name = 'service_name'
  ) then
    alter table public.pricing_rules
    alter column service_name drop not null;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'pricing_rules'
      and column_name = 'base_price'
  ) then
    alter table public.pricing_rules
    alter column base_price drop not null;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'knowledge_docs'
      and column_name = 'doc_type'
  ) then
    alter table public.knowledge_docs
    alter column doc_type drop not null;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'knowledge_docs'
      and column_name = 'content_md'
  ) then
    alter table public.knowledge_docs
    alter column content_md drop not null;
  end if;
end $$;
