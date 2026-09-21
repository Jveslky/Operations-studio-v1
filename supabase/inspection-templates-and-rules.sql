-- Run after inspection-media-foundation.sql.
-- Adds editable templates, version-safe inspection checklist snapshots, behavior,
-- and report preferences. Existing inspection/media records remain intact.

create table if not exists public.shop_inspection_templates (
    id uuid primary key default gen_random_uuid(),
    shop_id uuid not null references public.shops(id) on delete cascade,
    name text not null,
    description text,
    is_archived boolean not null default false,
    created_by uuid not null references auth.users(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.shop_inspection_template_sections (
    id uuid primary key default gen_random_uuid(),
    shop_id uuid not null references public.shops(id) on delete cascade,
    template_id uuid not null references public.shop_inspection_templates(id) on delete cascade,
    title text not null,
    sort_order integer not null default 0
);

create table if not exists public.shop_inspection_template_items (
    id uuid primary key default gen_random_uuid(),
    shop_id uuid not null references public.shops(id) on delete cascade,
    template_id uuid not null references public.shop_inspection_templates(id) on delete cascade,
    section_id uuid not null references public.shop_inspection_template_sections(id) on delete cascade,
    label text not null,
    is_required boolean not null default false,
    sort_order integer not null default 0
);

alter table public.shop_inspection_settings
    add column if not exists default_template_id uuid references public.shop_inspection_templates(id) on delete set null,
    add column if not exists include_pass_items_in_report boolean not null default true,
    add column if not exists include_internal_media_in_report boolean not null default false;

alter table public.shop_inspections
    add column if not exists template_id uuid references public.shop_inspection_templates(id) on delete set null;

do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'shop_inspections_template_id_fkey') then
        alter table public.shop_inspections
            add constraint shop_inspections_template_id_fkey
            foreign key (template_id) references public.shop_inspection_templates(id) on delete set null;
    end if;
end $$;

create table if not exists public.shop_inspection_items (
    id uuid primary key default gen_random_uuid(),
    shop_id uuid not null references public.shops(id) on delete cascade,
    inspection_id uuid not null references public.shop_inspections(id) on delete cascade,
    template_item_id uuid references public.shop_inspection_template_items(id) on delete set null,
    section_title text not null,
    item_label text not null,
    is_required boolean not null default false,
    sort_order integer not null default 0,
    response text not null default 'unanswered'
        check (response in ('unanswered', 'pass', 'attention', 'fail', 'na')),
    notes text,
    updated_by uuid references auth.users(id),
    updated_at timestamptz not null default now()
);

create index if not exists inspection_template_sections_order_idx on public.shop_inspection_template_sections(template_id, sort_order);
create index if not exists inspection_template_items_order_idx on public.shop_inspection_template_items(section_id, sort_order);
create index if not exists inspection_items_inspection_order_idx on public.shop_inspection_items(inspection_id, sort_order);

create or replace function public.validate_inspection_settings_template()
returns trigger language plpgsql security definer set search_path = public as $$
begin
    if new.default_template_id is not null and not exists (
        select 1 from public.shop_inspection_templates templates
        where templates.id = new.default_template_id and templates.shop_id = new.shop_id and templates.is_archived = false
    ) then raise exception 'Default template must be active and belong to this shop'; end if;
    return new;
end;
$$;
drop trigger if exists validate_inspection_settings_template_scope on public.shop_inspection_settings;
create trigger validate_inspection_settings_template_scope before insert or update on public.shop_inspection_settings
for each row execute function public.validate_inspection_settings_template();

create or replace function public.protect_inspection_completion()
returns trigger language plpgsql security definer set search_path = public as $$
begin
    if old.status = 'complete' and new is distinct from old then
        raise exception 'Completed inspections are locked';
    end if;
    if new.status = 'complete' and old.status <> 'complete' and exists (
        select 1 from public.shop_inspection_items items
        where items.inspection_id = new.id and items.is_required = true and items.response = 'unanswered'
    ) then raise exception 'Required inspection items must be answered'; end if;
    return new;
end;
$$;
drop trigger if exists protect_completed_inspection on public.shop_inspections;
create trigger protect_completed_inspection before update on public.shop_inspections
for each row execute function public.protect_inspection_completion();

create or replace function public.protect_completed_inspection_items()
returns trigger language plpgsql security definer set search_path = public as $$
begin
    if exists (select 1 from public.shop_inspections inspections where inspections.id = new.inspection_id and inspections.status = 'complete') then
        raise exception 'Completed inspection items are locked';
    end if;
    return new;
end;
$$;
drop trigger if exists protect_completed_inspection_item_changes on public.shop_inspection_items;
create trigger protect_completed_inspection_item_changes before update on public.shop_inspection_items
for each row execute function public.protect_completed_inspection_items();

alter table public.shop_inspection_templates enable row level security;
alter table public.shop_inspection_template_sections enable row level security;
alter table public.shop_inspection_template_items enable row level security;
alter table public.shop_inspection_items enable row level security;

do $$
declare table_name text;
begin
    foreach table_name in array array['shop_inspection_templates', 'shop_inspection_template_sections', 'shop_inspection_template_items']
    loop
        execute format('drop policy if exists "members view %s" on public.%I', table_name, table_name);
        execute format('create policy "members view %s" on public.%I for select to authenticated using (public.is_shop_member(shop_id))', table_name, table_name);
        execute format('drop policy if exists "owners manage %s" on public.%I', table_name, table_name);
        execute format('create policy "owners manage %s" on public.%I for all to authenticated using (public.has_shop_role(shop_id, array[''owner'', ''admin''])) with check (public.has_shop_role(shop_id, array[''owner'', ''admin'']))', table_name, table_name);
    end loop;
end $$;

drop policy if exists "members view inspection items" on public.shop_inspection_items;
create policy "members view inspection items" on public.shop_inspection_items
for select to authenticated using (public.is_shop_member(shop_id));

drop policy if exists "workflow users update inspection items" on public.shop_inspection_items;
create policy "workflow users update inspection items" on public.shop_inspection_items
for update to authenticated
using (public.has_shop_role(shop_id, array['owner', 'admin', 'service_writer', 'technician']))
with check (public.has_shop_role(shop_id, array['owner', 'admin', 'service_writer', 'technician']));

grant select, update on public.shop_inspection_templates to authenticated;
grant select on public.shop_inspection_template_sections to authenticated;
grant select on public.shop_inspection_template_items to authenticated;
grant select, update on public.shop_inspection_items to authenticated;

create or replace function public.save_shop_inspection_template(
    requested_template_id uuid,
    requested_name text,
    requested_description text,
    requested_sections jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    current_shop_id uuid;
    saved_template_id uuid;
    section jsonb;
    item jsonb;
    saved_section_id uuid;
    section_number integer := 0;
    item_number integer;
begin
    select shop_id into current_shop_id from public.shop_members
    where user_id = auth.uid() and is_active = true and role in ('owner', 'admin') limit 1;
    if current_shop_id is null then raise exception 'Owner or admin access required'; end if;
    if char_length(trim(coalesce(requested_name, ''))) < 2 then raise exception 'Template name is required'; end if;
    if jsonb_array_length(coalesce(requested_sections, '[]'::jsonb)) = 0 then raise exception 'At least one section is required'; end if;

    if requested_template_id is null then
        insert into public.shop_inspection_templates(shop_id, name, description, created_by)
        values(current_shop_id, trim(requested_name), nullif(trim(requested_description), ''), auth.uid()) returning id into saved_template_id;
    else
        update public.shop_inspection_templates set name = trim(requested_name), description = nullif(trim(requested_description), ''), updated_at = now()
        where id = requested_template_id and shop_id = current_shop_id and is_archived = false returning id into saved_template_id;
        if saved_template_id is null then raise exception 'Active template not found'; end if;
        delete from public.shop_inspection_template_sections where template_id = saved_template_id and shop_id = current_shop_id;
    end if;

    for section in select value from jsonb_array_elements(requested_sections)
    loop
        section_number := section_number + 1;
        insert into public.shop_inspection_template_sections(shop_id, template_id, title, sort_order)
        values(current_shop_id, saved_template_id, trim(section->>'title'), section_number) returning id into saved_section_id;
        item_number := 0;
        for item in select value from jsonb_array_elements(section->'items')
        loop
            item_number := item_number + 1;
            insert into public.shop_inspection_template_items(shop_id, template_id, section_id, label, is_required, sort_order)
            values(current_shop_id, saved_template_id, saved_section_id, trim(item->>'label'), coalesce((item->>'required')::boolean, false), item_number);
        end loop;
    end loop;
    return saved_template_id;
end;
$$;

create or replace function public.attach_shop_inspection(requested_repair_order_id text, requested_template_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    current_shop_id uuid;
    new_inspection_id uuid;
    template_name text;
begin
    select shop_id into current_shop_id from public.shop_members
    where user_id = auth.uid() and is_active = true and role in ('owner', 'admin', 'service_writer', 'technician') limit 1;
    if current_shop_id is null then raise exception 'Workflow access required'; end if;
    if requested_template_id is not null then
        select name into template_name from public.shop_inspection_templates
        where id = requested_template_id and shop_id = current_shop_id and is_archived = false;
        if template_name is null then raise exception 'Active template not found'; end if;
    end if;
    insert into public.shop_inspections(shop_id, repair_order_id, template_id, title, status, created_by)
    values(current_shop_id, requested_repair_order_id, requested_template_id, coalesce(template_name, 'General Inspection'), 'draft', auth.uid())
    returning id into new_inspection_id;
    if requested_template_id is not null then
        insert into public.shop_inspection_items(shop_id, inspection_id, template_item_id, section_title, item_label, is_required, sort_order)
        select current_shop_id, new_inspection_id, items.id, sections.title, items.label, items.is_required,
               sections.sort_order * 10000 + items.sort_order
        from public.shop_inspection_template_items items
        join public.shop_inspection_template_sections sections on sections.id = items.section_id
        where items.template_id = requested_template_id order by sections.sort_order, items.sort_order;
    end if;
    return new_inspection_id;
end;
$$;

revoke execute on function public.save_shop_inspection_template(uuid, text, text, jsonb) from public, anon;
revoke execute on function public.attach_shop_inspection(text, uuid) from public, anon;
grant execute on function public.save_shop_inspection_template(uuid, text, text, jsonb) to authenticated;
grant execute on function public.attach_shop_inspection(text, uuid) to authenticated;

create or replace function public.validate_inspection_media_shop()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if new.inspection_id is not null and not exists (
        select 1 from public.shop_inspections inspections
        where inspections.id = new.inspection_id
          and inspections.shop_id = new.shop_id
          and inspections.repair_order_id = new.repair_order_id
    ) then
        raise exception 'Inspection does not belong to this repair order';
    end if;
    if new.inspection_item_id is not null and not exists (
        select 1 from public.shop_inspection_items items
        where items.id = new.inspection_item_id
          and items.inspection_id = new.inspection_id
          and items.shop_id = new.shop_id
    ) then
        raise exception 'Inspection item does not belong to this inspection';
    end if;
    return new;
end;
$$;
