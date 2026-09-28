-- Snow foundation, phase 1. Review and test in a disposable project before
-- applying to the shared Supabase project. This migration does not touch Shop,
-- Mobile, or Personal Fleet tables and does not import browser-local drafts.
begin;

create table if not exists public.snow_workspaces (
    id uuid primary key default gen_random_uuid(),
    name text not null check (length(trim(name)) between 2 and 120),
    created_by uuid not null references auth.users(id),
    created_at timestamptz not null default now()
);

create table if not exists public.snow_members (
    workspace_id uuid not null references public.snow_workspaces(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    role text not null check (role in ('owner','dispatcher','operator')),
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    primary key (workspace_id,user_id)
);

-- This SECURITY DEFINER helper avoids recursive RLS on snow_members. It is
-- owned by the migration role, runs with a fixed search path, and never accepts
-- a caller-supplied user ID.
create or replace function public.snow_has_role(target_workspace uuid, allowed_roles text[])
returns boolean language sql stable security definer set search_path = '' as $$
    select exists (
        select 1 from public.snow_members m
        where m.workspace_id = target_workspace
          and m.user_id = auth.uid() and m.is_active
          and m.role = any(allowed_roles)
    );
$$;

create table if not exists public.snow_customers (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null references public.snow_workspaces(id),
    name text not null check (length(trim(name)) between 1 and 160),
    phone text not null default '',
    email text not null default '',
    created_at timestamptz not null default now(),
    unique (workspace_id,id)
);

create table if not exists public.snow_properties (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null references public.snow_workspaces(id),
    customer_id uuid not null,
    address text not null check (length(trim(address)) between 1 and 240),
    property_type text not null check (property_type in ('Residential','Commercial')),
    access_notes text not null default '',
    preferences text not null default '',
    created_at timestamptz not null default now(),
    unique (workspace_id,id),
    foreign key (workspace_id,customer_id)
        references public.snow_customers(workspace_id,id)
);

create table if not exists public.snow_routes (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null references public.snow_workspaces(id),
    name text not null check (length(trim(name)) between 1 and 100),
    unique (workspace_id,id)
);

create table if not exists public.snow_service_events (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null references public.snow_workspaces(id),
    property_id uuid not null,
    route_id uuid,
    assigned_user_id uuid,
    service text not null check (length(trim(service)) between 1 and 120),
    priority text not null default 'standard'
        check (priority in ('asap','high','standard','flexible')),
    status text not null default 'Scheduled'
        check (status in ('Scheduled','On Route','Service Started','Weather Delay','Completed')),
    scheduled_at timestamptz,
    started_at timestamptz,
    completed_at timestamptz,
    condition_note text not null default '',
    material_type text not null default '',
    material_quantity numeric(12,3) check (material_quantity >= 0),
    material_unit text not null default '',
    service_notes text not null default '',
    ready_to_bill_at timestamptz,
    created_by uuid not null default auth.uid() references auth.users(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (workspace_id,id),
    foreign key (workspace_id,property_id)
        references public.snow_properties(workspace_id,id),
    foreign key (workspace_id,route_id)
        references public.snow_routes(workspace_id,id),
    foreign key (workspace_id,assigned_user_id)
        references public.snow_members(workspace_id,user_id)
);

create table if not exists public.snow_quotes (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null references public.snow_workspaces(id),
    service_event_id uuid not null,
    version integer not null check (version > 0),
    status text not null default 'Draft'
        check (status in ('Draft','Agreed','Superseded')),
    pricing_method text not null check (pricing_method in ('flat','hourly','per_visit')),
    unit_rate numeric(12,2) check (unit_rate >= 0),
    projected_total numeric(12,2) check (projected_total >= 0),
    agreed_terms text not null default '',
    estimate_inputs jsonb not null default '{}'::jsonb,
    agreed_at timestamptz,
    agreed_by uuid references auth.users(id),
    created_by uuid not null default auth.uid() references auth.users(id),
    created_at timestamptz not null default now(),
    unique (workspace_id,id),
    unique (workspace_id,service_event_id,version),
    foreign key (workspace_id,service_event_id)
        references public.snow_service_events(workspace_id,id)
);
create unique index if not exists snow_one_agreed_quote_per_event
    on public.snow_quotes(workspace_id,service_event_id)
    where status = 'Agreed';

create table if not exists public.snow_event_log (
    id bigint generated always as identity primary key,
    workspace_id uuid not null references public.snow_workspaces(id),
    service_event_id uuid not null,
    actor_id uuid references auth.users(id),
    occurred_at timestamptz not null default now(),
    action text not null,
    previous_data jsonb,
    new_data jsonb,
    foreign key (workspace_id,service_event_id)
        references public.snow_service_events(workspace_id,id)
);

create index if not exists snow_events_schedule_idx
    on public.snow_service_events(workspace_id,status,scheduled_at);
create index if not exists snow_events_route_idx
    on public.snow_service_events(workspace_id,route_id,scheduled_at);
create index if not exists snow_events_property_idx
    on public.snow_service_events(workspace_id,property_id,created_at desc);
create index if not exists snow_log_event_idx
    on public.snow_event_log(workspace_id,service_event_id,id);

-- Server-written audit entries. Clients have no INSERT/UPDATE/DELETE grant on
-- the log; accepted quotes and ticket changes leave a record even if a UI
-- forgets to request one.
create or replace function public.snow_audit_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare target_event uuid;
begin
    if TG_TABLE_NAME = 'snow_quotes' then
        target_event := new.service_event_id;
    else
        target_event := new.id;
    end if;
    insert into public.snow_event_log
        (workspace_id,service_event_id,actor_id,action,previous_data,new_data)
    values (new.workspace_id,target_event,auth.uid(),
        TG_TABLE_NAME || '_' || lower(TG_OP),
        case when TG_OP = 'UPDATE' then to_jsonb(old) else null end,
        to_jsonb(new));
    return new;
end;
$$;
drop trigger if exists snow_audit_service_events on public.snow_service_events;
create trigger snow_audit_service_events after insert or update on public.snow_service_events
    for each row execute function public.snow_audit_change();
drop trigger if exists snow_audit_quotes on public.snow_quotes;
create trigger snow_audit_quotes after insert or update on public.snow_quotes
    for each row execute function public.snow_audit_change();

alter table public.snow_workspaces enable row level security;
alter table public.snow_members enable row level security;
alter table public.snow_customers enable row level security;
alter table public.snow_properties enable row level security;
alter table public.snow_routes enable row level security;
alter table public.snow_service_events enable row level security;
alter table public.snow_quotes enable row level security;
alter table public.snow_event_log enable row level security;

create policy snow_workspace_read on public.snow_workspaces for select to authenticated
    using (public.snow_has_role(id,array['owner','dispatcher','operator']));
create policy snow_members_read on public.snow_members for select to authenticated
    using (public.snow_has_role(workspace_id,array['owner','dispatcher'])
        or (user_id = auth.uid() and public.snow_has_role(workspace_id,array['operator'])));
create policy snow_customers_read on public.snow_customers for select to authenticated
    using (public.snow_has_role(workspace_id,array['owner','dispatcher']) or
        (public.snow_has_role(workspace_id,array['operator']) and exists (
            select 1 from public.snow_properties p
            join public.snow_service_events e
                on e.workspace_id = p.workspace_id and e.property_id = p.id
            where p.workspace_id = snow_customers.workspace_id
              and p.customer_id = snow_customers.id
              and e.assigned_user_id = auth.uid()
        )));
create policy snow_properties_read on public.snow_properties for select to authenticated
    using (public.snow_has_role(workspace_id,array['owner','dispatcher']) or
        (public.snow_has_role(workspace_id,array['operator']) and exists (
            select 1 from public.snow_service_events e
            where e.workspace_id = snow_properties.workspace_id
              and e.property_id = snow_properties.id
              and e.assigned_user_id = auth.uid()
        )));
create policy snow_routes_read on public.snow_routes for select to authenticated
    using (public.snow_has_role(workspace_id,array['owner','dispatcher']) or
        (public.snow_has_role(workspace_id,array['operator']) and exists (
            select 1 from public.snow_service_events e
            where e.workspace_id = snow_routes.workspace_id
              and e.route_id = snow_routes.id
              and e.assigned_user_id = auth.uid()
        )));
create policy snow_events_read on public.snow_service_events for select to authenticated
    using (public.snow_has_role(workspace_id,array['owner','dispatcher']) or
        (assigned_user_id = auth.uid() and public.snow_has_role(workspace_id,array['operator'])));
create policy snow_quotes_read on public.snow_quotes for select to authenticated
    using (public.snow_has_role(workspace_id,array['owner','dispatcher']) or
        (public.snow_has_role(workspace_id,array['operator']) and exists (
            select 1 from public.snow_service_events e
            where e.workspace_id = snow_quotes.workspace_id
              and e.id = snow_quotes.service_event_id
              and e.assigned_user_id = auth.uid()
        )));
create policy snow_log_read on public.snow_event_log for select to authenticated
    using (public.snow_has_role(workspace_id,array['owner','dispatcher']) or
        (public.snow_has_role(workspace_id,array['operator']) and exists (
            select 1 from public.snow_service_events e
            where e.workspace_id = snow_event_log.workspace_id
              and e.id = snow_event_log.service_event_id
              and e.assigned_user_id = auth.uid()
        )));

create policy snow_customers_insert on public.snow_customers for insert to authenticated
    with check (public.snow_has_role(workspace_id,array['owner','dispatcher']));
create policy snow_properties_insert on public.snow_properties for insert to authenticated
    with check (public.snow_has_role(workspace_id,array['owner','dispatcher']));
create policy snow_routes_insert on public.snow_routes for insert to authenticated
    with check (public.snow_has_role(workspace_id,array['owner','dispatcher']));
create policy snow_events_insert on public.snow_service_events for insert to authenticated
    with check (created_by = auth.uid() and public.snow_has_role(workspace_id,array['owner','dispatcher'])
        and status = 'Scheduled' and started_at is null and completed_at is null
        and ready_to_bill_at is null);
create policy snow_quotes_insert on public.snow_quotes for insert to authenticated
    with check (created_by = auth.uid() and public.snow_has_role(workspace_id,array['owner','dispatcher'])
        and status = 'Draft' and agreed_at is null and agreed_by is null);
create policy snow_customers_update on public.snow_customers for update to authenticated
    using (public.snow_has_role(workspace_id,array['owner','dispatcher']))
    with check (public.snow_has_role(workspace_id,array['owner','dispatcher']));
create policy snow_properties_update on public.snow_properties for update to authenticated
    using (public.snow_has_role(workspace_id,array['owner','dispatcher']))
    with check (public.snow_has_role(workspace_id,array['owner','dispatcher']));
create policy snow_routes_update on public.snow_routes for update to authenticated
    using (public.snow_has_role(workspace_id,array['owner','dispatcher']))
    with check (public.snow_has_role(workspace_id,array['owner','dispatcher']));

-- Create a workspace and its owner in one transaction. Direct table inserts
-- into snow_workspaces/snow_members are never granted to client roles.
create or replace function public.snow_create_workspace(requested_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare new_id uuid;
begin
    if auth.uid() is null then raise exception 'Authentication required'; end if;
    insert into public.snow_workspaces(name,created_by)
    values (requested_name,auth.uid()) returning id into new_id;
    insert into public.snow_members(workspace_id,user_id,role)
    values (new_id,auth.uid(),'owner');
    return new_id;
end;
$$;

create or replace function public.snow_set_member(target_workspace uuid,target_user uuid,new_role text,new_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
    perform 1 from public.snow_workspaces w where w.id = target_workspace for update;
    if not public.snow_has_role(target_workspace,array['owner'])
       or new_role not in ('owner','dispatcher','operator') or new_role is null
       or new_active is null then raise exception 'Not authorized'; end if;
    if exists (select 1 from public.snow_members m
               where m.workspace_id = target_workspace and m.user_id = target_user
                 and m.role = 'owner' and m.is_active)
       and (new_role <> 'owner' or not new_active)
       and (select count(*) from public.snow_members m
            where m.workspace_id = target_workspace and m.role = 'owner' and m.is_active) <= 1
    then raise exception 'The last active owner cannot be removed'; end if;
    insert into public.snow_members(workspace_id,user_id,role,is_active)
    values (target_workspace,target_user,new_role,new_active)
    on conflict (workspace_id,user_id) do update
       set role = excluded.role,is_active = excluded.is_active;
end;
$$;

create or replace function public.snow_assign_service(
    target_event uuid,next_assignee uuid,next_route uuid,
    next_scheduled_at timestamptz,next_priority text
) returns public.snow_service_events
language plpgsql security definer set search_path = '' as $$
declare current_event public.snow_service_events;
begin
    select * into current_event from public.snow_service_events where id = target_event for update;
    if not found then raise exception 'Service event unavailable'; end if;
    if not public.snow_has_role(current_event.workspace_id,array['owner','dispatcher'])
       or next_priority not in ('asap','high','standard','flexible')
       or next_priority is null then raise exception 'Not authorized or invalid priority'; end if;
    if next_assignee is not null and not exists (
        select 1 from public.snow_members m where m.workspace_id = current_event.workspace_id
          and m.user_id = next_assignee and m.is_active
    ) then raise exception 'Assignee unavailable'; end if;
    update public.snow_service_events e set
        assigned_user_id = next_assignee,route_id = next_route,
        scheduled_at = next_scheduled_at,priority = next_priority,updated_at = now()
    where e.id = target_event returning * into current_event;
    return current_event;
end;
$$;

-- Status/material updates are a controlled transaction. Client table UPDATE
-- grants are absent, so operators cannot reassign tickets or spoof timestamps.
create or replace function public.snow_record_service(
    target_event uuid, next_status text, next_note text,
    next_condition text, next_material text, next_quantity numeric, next_unit text
) returns public.snow_service_events
language plpgsql security definer set search_path = '' as $$
declare current_event public.snow_service_events;
begin
    select * into current_event from public.snow_service_events where id = target_event for update;
    if not found then raise exception 'Service event unavailable'; end if;
    if not (public.snow_has_role(current_event.workspace_id,array['owner','dispatcher'])
        or (current_event.assigned_user_id = auth.uid()
            and public.snow_has_role(current_event.workspace_id,array['operator'])))
    then raise exception 'Not authorized'; end if;
    if next_status not in ('Scheduled','On Route','Service Started','Weather Delay','Completed')
       or next_status is null or next_quantity < 0
       or length(coalesce(next_note,'')) > 4000
       or length(coalesce(next_condition,'')) > 250
       or length(coalesce(next_material,'')) > 120
       or length(coalesce(next_unit,'')) > 50
    then raise exception 'Invalid service update'; end if;
    if current_event.ready_to_bill_at is not null and next_status <> 'Completed'
    then raise exception 'Ready-to-bill service cannot be reopened'; end if;
    if current_event.status = 'Completed' and next_status <> 'Completed'
       and not public.snow_has_role(current_event.workspace_id,array['owner','dispatcher'])
    then raise exception 'Only dispatch can reopen completed service'; end if;
    update public.snow_service_events e set
        status = next_status,
        started_at = case when next_status = 'Service Started' and e.started_at is null
            then now() else e.started_at end,
        completed_at = case when next_status <> 'Completed' then null
            when e.completed_at is null then now() else e.completed_at end,
        service_notes = coalesce(next_note,''),
        condition_note = coalesce(next_condition,''),
        material_type = coalesce(next_material,''),
        material_quantity = next_quantity,
        material_unit = coalesce(next_unit,''),
        updated_at = now()
    where e.id = target_event returning * into current_event;
    return current_event;
end;
$$;

create or replace function public.snow_agree_quote(target_quote uuid)
returns public.snow_quotes language plpgsql security definer set search_path = '' as $$
declare current_quote public.snow_quotes;
begin
    select * into current_quote from public.snow_quotes where id = target_quote for update;
    if not found then raise exception 'Quote unavailable'; end if;
    if not public.snow_has_role(current_quote.workspace_id,array['owner','dispatcher'])
    then raise exception 'Not authorized'; end if;
    if current_quote.status <> 'Draft' then raise exception 'Quote is not a draft'; end if;
    if not exists (select 1 from public.snow_service_events e
                   where e.id = current_quote.service_event_id
                     and e.workspace_id = current_quote.workspace_id
                     and e.ready_to_bill_at is null)
    then raise exception 'Service event unavailable or already ready to bill'; end if;
    update public.snow_quotes q set status = 'Superseded'
    where q.workspace_id = current_quote.workspace_id
      and q.service_event_id = current_quote.service_event_id and q.status = 'Agreed';
    update public.snow_quotes q set status = 'Agreed',agreed_at = now(),agreed_by = auth.uid()
    where q.id = target_quote returning * into current_quote;
    return current_quote;
end;
$$;

create or replace function public.snow_mark_ready_to_bill(target_event uuid)
returns public.snow_service_events language plpgsql security definer set search_path = '' as $$
declare current_event public.snow_service_events;
begin
    select * into current_event from public.snow_service_events where id = target_event for update;
    if not found then raise exception 'Service event unavailable'; end if;
    if not public.snow_has_role(current_event.workspace_id,array['owner','dispatcher'])
       or current_event.status <> 'Completed'
       or not exists (select 1 from public.snow_quotes q
                      where q.workspace_id = current_event.workspace_id
                        and q.service_event_id = target_event and q.status = 'Agreed')
    then raise exception 'Completion and agreed quote required'; end if;
    if current_event.ready_to_bill_at is not null then return current_event; end if;
    update public.snow_service_events e
    set ready_to_bill_at = coalesce(e.ready_to_bill_at,now()),updated_at = now()
    where e.id = target_event returning * into current_event;
    return current_event;
end;
$$;

-- No direct access is granted to workspace, membership, or audit mutations.
revoke all on public.snow_workspaces,public.snow_members,public.snow_customers,
    public.snow_properties,public.snow_routes,public.snow_service_events,
    public.snow_quotes,public.snow_event_log from anon,authenticated;
grant select on public.snow_workspaces,public.snow_members,public.snow_customers,
    public.snow_properties,public.snow_routes,public.snow_service_events,
    public.snow_quotes,public.snow_event_log to authenticated;
grant insert(workspace_id,name,phone,email) on public.snow_customers to authenticated;
grant insert(workspace_id,customer_id,address,property_type,access_notes,preferences)
    on public.snow_properties to authenticated;
grant insert(workspace_id,name) on public.snow_routes to authenticated;
grant insert(workspace_id,property_id,route_id,assigned_user_id,service,priority,scheduled_at)
    on public.snow_service_events to authenticated;
grant insert(workspace_id,service_event_id,version,pricing_method,unit_rate,
    projected_total,agreed_terms,estimate_inputs) on public.snow_quotes to authenticated;
grant update(name,phone,email) on public.snow_customers to authenticated;
grant update(customer_id,address,property_type,access_notes,preferences)
    on public.snow_properties to authenticated;
grant update(name) on public.snow_routes to authenticated;

revoke all on function public.snow_has_role(uuid,text[]),
    public.snow_create_workspace(text),public.snow_set_member(uuid,uuid,text,boolean),
    public.snow_assign_service(uuid,uuid,uuid,timestamptz,text),
    public.snow_record_service(uuid,text,text,text,text,numeric,text),
    public.snow_agree_quote(uuid),public.snow_mark_ready_to_bill(uuid),
    public.snow_audit_change() from public,anon;
grant execute on function public.snow_has_role(uuid,text[]),
    public.snow_create_workspace(text),public.snow_set_member(uuid,uuid,text,boolean),
    public.snow_assign_service(uuid,uuid,uuid,timestamptz,text),
    public.snow_record_service(uuid,text,text,text,text,numeric,text),
    public.snow_agree_quote(uuid),public.snow_mark_ready_to_bill(uuid) to authenticated;

commit;
