do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'knowledge_docs'
      and column_name = 'tags'
      and data_type = 'jsonb'
  ) then
    alter table public.knowledge_docs
    alter column tags drop default;

    alter table public.knowledge_docs
    alter column tags type text[]
    using (
      case
        when tags is null then '{}'::text[]
        else array(
          select jsonb_array_elements_text(tags)
        )
      end
    );

    alter table public.knowledge_docs
    alter column tags set default '{}'::text[];
  end if;
end $$;

alter table public.knowledge_docs
alter column tags set default '{}'::text[];
