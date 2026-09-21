-- Run after inspection-completion-notifications.sql.
-- Adds reusable, severity-mapped response choices while preserving stable
-- internal meanings for alerts and historical reporting.

create table if not exists public.shop_inspection_response_sets (
    id uuid primary key default gen_random_uuid(),
    shop_id uuid not null references public.shops(id) on delete cascade,
    name text not null,
    is_system boolean not null default false,
    is_archived boolean not null default false,
    created_by uuid not null references auth.users(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (shop_id, name)
);

create table if not exists public.shop_inspection_response_options (
    id uuid primary key default gen_random_uuid(),
    shop_id uuid not null references public.shops(id) on delete cascade,
    response_set_id uuid not null references public.shop_inspection_response_sets(id) on delete cascade,
    label text not null,
    meaning text not null check (meaning in ('positive', 'info', 'attention', 'critical', 'na')),
    sort_order integer not null default 0
);

alter table public.shop_inspection_template_items
    add column if not exists response_set_id uuid references public.shop_inspection_response_sets(id) on delete set null;

alter table public.shop_inspection_items
    add column if not exists response_set_name text,
    add column if not exists response_options jsonb,
    add column if not exists response_label text;

alter table public.shop_inspection_items drop constraint if exists shop_inspection_items_response_check;
alter table public.shop_inspection_items add constraint shop_inspection_items_response_check
    check (response in ('unanswered', 'pass', 'info', 'attention', 'fail', 'na'));

alter table public.shop_inspection_response_sets enable row level security;
alter table public.shop_inspection_response_options enable row level security;
drop policy if exists "members view inspection response sets" on public.shop_inspection_response_sets;
create policy "members view inspection response sets" on public.shop_inspection_response_sets for select to authenticated using (public.is_shop_member(shop_id));
drop policy if exists "owners manage inspection response sets" on public.shop_inspection_response_sets;
create policy "owners manage inspection response sets" on public.shop_inspection_response_sets for update to authenticated using (public.has_shop_role(shop_id, array['owner','admin'])) with check (public.has_shop_role(shop_id, array['owner','admin']));
drop policy if exists "members view inspection response options" on public.shop_inspection_response_options;
create policy "members view inspection response options" on public.shop_inspection_response_options for select to authenticated using (public.is_shop_member(shop_id));
grant select, update on public.shop_inspection_response_sets to authenticated;
grant select on public.shop_inspection_response_options to authenticated;

create or replace function public.ensure_shop_inspection_response_sets()
returns void language plpgsql security definer set search_path = public as $$
declare current_shop_id uuid; set_id uuid;
begin
    select shop_id into current_shop_id from public.shop_members where user_id = auth.uid() and is_active = true limit 1;
    if current_shop_id is null then raise exception 'Shop membership required'; end if;

    insert into public.shop_inspection_response_sets(shop_id,name,is_system,created_by) values(current_shop_id,'Standard',true,auth.uid()) on conflict(shop_id,name) do update set name=excluded.name returning id into set_id;
    if not exists(select 1 from public.shop_inspection_response_options where response_set_id=set_id) then
        insert into public.shop_inspection_response_options(shop_id,response_set_id,label,meaning,sort_order) values
        (current_shop_id,set_id,'Pass','positive',1),(current_shop_id,set_id,'Attention','attention',2),(current_shop_id,set_id,'Fail','critical',3),(current_shop_id,set_id,'N/A','na',4);
    end if;
    insert into public.shop_inspection_response_sets(shop_id,name,created_by) values(current_shop_id,'Fluid Level',auth.uid()) on conflict(shop_id,name) do update set name=excluded.name returning id into set_id;
    if not exists(select 1 from public.shop_inspection_response_options where response_set_id=set_id) then
        insert into public.shop_inspection_response_options(shop_id,response_set_id,label,meaning,sort_order) values
        (current_shop_id,set_id,'Full','positive',1),(current_shop_id,set_id,'Low','attention',2),(current_shop_id,set_id,'Topped Off','info',3),(current_shop_id,set_id,'Empty','critical',4),(current_shop_id,set_id,'N/A','na',5);
    end if;
    insert into public.shop_inspection_response_sets(shop_id,name,created_by) values(current_shop_id,'Service Urgency',auth.uid()) on conflict(shop_id,name) do update set name=excluded.name returning id into set_id;
    if not exists(select 1 from public.shop_inspection_response_options where response_set_id=set_id) then
        insert into public.shop_inspection_response_options(shop_id,response_set_id,label,meaning,sort_order) values
        (current_shop_id,set_id,'Good','positive',1),(current_shop_id,set_id,'Due Soon','attention',2),(current_shop_id,set_id,'Immediate','critical',3),(current_shop_id,set_id,'N/A','na',4);
    end if;
end; $$;

create or replace function public.save_shop_inspection_response_set(requested_response_set_id uuid, requested_name text, requested_options jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare current_shop_id uuid; saved_id uuid; option jsonb; option_number integer:=0;
begin
    select shop_id into current_shop_id from public.shop_members where user_id=auth.uid() and is_active=true and role in ('owner','admin') limit 1;
    if current_shop_id is null then raise exception 'Owner or admin access required'; end if;
    if jsonb_array_length(coalesce(requested_options,'[]'::jsonb)) < 2 then raise exception 'At least two choices are required'; end if;
    if requested_response_set_id is null then
        insert into public.shop_inspection_response_sets(shop_id,name,created_by) values(current_shop_id,trim(requested_name),auth.uid()) returning id into saved_id;
    else
        update public.shop_inspection_response_sets set name=case when is_system then name else trim(requested_name) end,updated_at=now() where id=requested_response_set_id and shop_id=current_shop_id and is_archived=false returning id into saved_id;
        if saved_id is null then raise exception 'Active response set not found'; end if;
        delete from public.shop_inspection_response_options where response_set_id=saved_id;
    end if;
    for option in select value from jsonb_array_elements(requested_options) loop
        option_number:=option_number+1;
        insert into public.shop_inspection_response_options(shop_id,response_set_id,label,meaning,sort_order)
        values(current_shop_id,saved_id,trim(option->>'label'),option->>'meaning',option_number);
    end loop;
    return saved_id;
end; $$;

-- Replace template save so every item can select a response set.
create or replace function public.save_shop_inspection_template(requested_template_id uuid, requested_name text, requested_description text, requested_sections jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare current_shop_id uuid; saved_template_id uuid; section jsonb; item jsonb; saved_section_id uuid; section_number integer:=0; item_number integer; selected_set uuid;
begin
    select shop_id into current_shop_id from public.shop_members where user_id=auth.uid() and is_active=true and role in ('owner','admin') limit 1;
    if current_shop_id is null then raise exception 'Owner or admin access required'; end if;
    if requested_template_id is null then insert into public.shop_inspection_templates(shop_id,name,description,created_by) values(current_shop_id,trim(requested_name),nullif(trim(requested_description),''),auth.uid()) returning id into saved_template_id;
    else update public.shop_inspection_templates set name=trim(requested_name),description=nullif(trim(requested_description),''),updated_at=now() where id=requested_template_id and shop_id=current_shop_id and is_archived=false returning id into saved_template_id; delete from public.shop_inspection_template_sections where template_id=saved_template_id and shop_id=current_shop_id; end if;
    if saved_template_id is null then raise exception 'Template not found'; end if;
    for section in select value from jsonb_array_elements(requested_sections) loop
        section_number:=section_number+1; insert into public.shop_inspection_template_sections(shop_id,template_id,title,sort_order) values(current_shop_id,saved_template_id,trim(section->>'title'),section_number) returning id into saved_section_id; item_number:=0;
        for item in select value from jsonb_array_elements(section->'items') loop
            item_number:=item_number+1; selected_set:=nullif(item->>'responseSetId','')::uuid;
            if selected_set is not null and not exists(select 1 from public.shop_inspection_response_sets where id=selected_set and shop_id=current_shop_id and is_archived=false) then raise exception 'Invalid response set'; end if;
            insert into public.shop_inspection_template_items(shop_id,template_id,section_id,label,is_required,response_set_id,sort_order) values(current_shop_id,saved_template_id,saved_section_id,trim(item->>'label'),coalesce((item->>'required')::boolean,false),selected_set,item_number);
        end loop;
    end loop; return saved_template_id;
end; $$;

-- Replace attachment so labels/options are snapshotted into the inspection.
create or replace function public.attach_shop_inspection(requested_repair_order_id text, requested_template_id uuid default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare current_shop_id uuid; new_inspection_id uuid; template_name text;
begin
    select shop_id into current_shop_id from public.shop_members where user_id=auth.uid() and is_active=true and role in ('owner','admin','service_writer','technician') limit 1;
    if current_shop_id is null then raise exception 'Workflow access required'; end if;
    if requested_template_id is not null then select name into template_name from public.shop_inspection_templates where id=requested_template_id and shop_id=current_shop_id and is_archived=false; if template_name is null then raise exception 'Active template not found'; end if; end if;
    insert into public.shop_inspections(shop_id,repair_order_id,template_id,title,status,created_by) values(current_shop_id,requested_repair_order_id,requested_template_id,coalesce(template_name,'General Inspection'),'draft',auth.uid()) returning id into new_inspection_id;
    if requested_template_id is not null then
        insert into public.shop_inspection_items(shop_id,inspection_id,template_item_id,section_title,item_label,is_required,sort_order,response_set_name,response_options)
        select current_shop_id,new_inspection_id,items.id,sections.title,items.label,items.is_required,sections.sort_order*10000+items.sort_order,coalesce(sets.name,'Standard'),
        coalesce((select jsonb_agg(jsonb_build_object('label',options.label,'meaning',options.meaning) order by options.sort_order) from public.shop_inspection_response_options options where options.response_set_id=items.response_set_id),'[{"label":"Pass","meaning":"positive"},{"label":"Attention","meaning":"attention"},{"label":"Fail","meaning":"critical"},{"label":"N/A","meaning":"na"}]'::jsonb)
        from public.shop_inspection_template_items items join public.shop_inspection_template_sections sections on sections.id=items.section_id left join public.shop_inspection_response_sets sets on sets.id=items.response_set_id where items.template_id=requested_template_id;
    end if; return new_inspection_id;
end; $$;

revoke execute on function public.ensure_shop_inspection_response_sets() from public,anon;
revoke execute on function public.save_shop_inspection_response_set(uuid,text,jsonb) from public,anon;
grant execute on function public.ensure_shop_inspection_response_sets() to authenticated;
grant execute on function public.save_shop_inspection_response_set(uuid,text,jsonb) to authenticated;

create or replace function public.create_inspection_completion_notification()
returns trigger language plpgsql security definer set search_path=public as $$
declare notifications_enabled boolean; pass_count integer; info_count integer; attention_count integer; fail_count integer; na_count integer; notification_severity text;
begin
    if new.status <> 'complete' or old.status = 'complete' then return new; end if;
    select coalesce(settings.completion_notifications_enabled,true) into notifications_enabled from public.shop_inspection_settings settings where settings.shop_id=new.shop_id;
    if notifications_enabled is false then return new; end if;
    select count(*) filter(where response='pass'),count(*) filter(where response='info'),count(*) filter(where response='attention'),count(*) filter(where response='fail'),count(*) filter(where response='na')
    into pass_count,info_count,attention_count,fail_count,na_count from public.shop_inspection_items where inspection_id=new.id;
    notification_severity:=case when fail_count>0 then 'critical' when attention_count>0 then 'attention' else 'info' end;
    insert into public.shop_notifications(shop_id,notification_type,source_id,repair_order_id,title,message,severity)
    values(new.shop_id,'inspection_completed',new.id,new.repair_order_id,'Inspection completed — RO #'||new.repair_order_id,pass_count||' Positive · '||info_count||' Info · '||attention_count||' Attention · '||fail_count||' Critical · '||na_count||' N/A',notification_severity)
    on conflict(shop_id,notification_type,source_id) do nothing;
    return new;
end; $$;
