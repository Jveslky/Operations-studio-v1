-- Shop-scoped team requests, office review, and approved calendar entries.
-- Additive only; existing schedule and repair-order data is not modified.

create table if not exists public.shop_requests (
    id uuid primary key default gen_random_uuid(),
    shop_id uuid not null references public.shops(id) on delete cascade,
    requested_by uuid not null references auth.users(id) on delete restrict,
    request_type text not null check (request_type in ('pto','medical','general')),
    title text not null check (char_length(trim(title)) between 2 and 160),
    details text check (char_length(details) <= 2000),
    starts_on date,
    ends_on date,
    status text not null default 'pending' check (status in ('pending','approved','declined')),
    reviewer_notes text check (char_length(reviewer_notes) <= 2000),
    reviewed_by uuid references auth.users(id) on delete set null,
    reviewed_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check ((request_type='general') or (starts_on is not null and ends_on is not null)),
    check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

create table if not exists public.shop_calendar_events (
    id uuid primary key default gen_random_uuid(),
    shop_id uuid not null references public.shops(id) on delete cascade,
    source_request_id uuid unique references public.shop_requests(id) on delete cascade,
    event_type text not null default 'team_absence' check (event_type in ('team_absence','office_reminder')),
    title text not null check (char_length(trim(title)) between 2 and 200),
    starts_on date not null,
    ends_on date not null,
    subject_user_id uuid references auth.users(id) on delete set null,
    office_reminder_at timestamptz,
    notes text,
    created_by uuid not null references auth.users(id) on delete restrict,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (ends_on >= starts_on)
);

create index if not exists shop_requests_shop_status_idx on public.shop_requests(shop_id,status,created_at desc);
create index if not exists shop_requests_requester_idx on public.shop_requests(requested_by,created_at desc);
create index if not exists shop_calendar_events_shop_dates_idx on public.shop_calendar_events(shop_id,starts_on,ends_on);

alter table public.shop_requests enable row level security;
alter table public.shop_calendar_events enable row level security;

drop policy if exists "members submit their own requests" on public.shop_requests;
create policy "members submit their own requests" on public.shop_requests for insert to authenticated
with check (requested_by=auth.uid() and public.has_shop_role(shop_id,array['owner','admin','service_writer','technician','read_only']));

drop policy if exists "members view own and office views all requests" on public.shop_requests;
create policy "members view own and office views all requests" on public.shop_requests for select to authenticated
using (requested_by=auth.uid() or public.has_shop_role(shop_id,array['owner','admin','service_writer']));

drop policy if exists "shop members view calendar events" on public.shop_calendar_events;
create policy "shop members view calendar events" on public.shop_calendar_events for select to authenticated
using (public.has_shop_role(shop_id,array['owner','admin','service_writer','technician','read_only']));

grant select,insert on public.shop_requests to authenticated;
revoke update on public.shop_requests from authenticated;
grant select on public.shop_calendar_events to authenticated;

create or replace function public.list_shop_request_members()
returns table(user_id uuid,email text,role text,is_active boolean)
language sql stable security definer set search_path=public as $$
    select members.user_id,users.email::text,members.role,members.is_active
    from public.shop_members members join auth.users users on users.id=members.user_id
    where members.shop_id in (
        select mine.shop_id from public.shop_members mine
        where mine.user_id=auth.uid() and mine.is_active=true
    ) and members.is_active=true order by users.email;
$$;

revoke all on function public.list_shop_request_members() from public;
grant execute on function public.list_shop_request_members() to authenticated;

create or replace function public.review_shop_request(
    request_id uuid,
    decision text,
    office_notes text default null,
    add_to_calendar boolean default true,
    reminder_at timestamptz default null
) returns public.shop_requests
language plpgsql security definer set search_path=public as $$
declare
    target public.shop_requests;
begin
    select * into target from public.shop_requests where id=request_id for update;
    if target.id is null then raise exception 'Request not found'; end if;
    if not public.has_shop_role(target.shop_id,array['owner','admin','service_writer']) then
        raise exception 'Office review permission is required';
    end if;
    if decision not in ('approved','declined') then raise exception 'Invalid review decision'; end if;

    update public.shop_requests set status=decision, reviewer_notes=nullif(trim(office_notes),''),
        reviewed_by=auth.uid(), reviewed_at=now(), updated_at=now()
    where id=request_id returning * into target;

    if decision='approved' and add_to_calendar and target.starts_on is not null then
        insert into public.shop_calendar_events(shop_id,source_request_id,title,starts_on,ends_on,subject_user_id,office_reminder_at,notes,created_by)
        values(target.shop_id,target.id,target.title,target.starts_on,coalesce(target.ends_on,target.starts_on),target.requested_by,reminder_at,target.details,auth.uid())
        on conflict(source_request_id) do update set title=excluded.title,starts_on=excluded.starts_on,ends_on=excluded.ends_on,
            subject_user_id=excluded.subject_user_id,office_reminder_at=excluded.office_reminder_at,notes=excluded.notes,updated_at=now();
    else
        delete from public.shop_calendar_events where source_request_id=target.id;
    end if;
    return target;
end;
$$;

revoke all on function public.review_shop_request(uuid,text,text,boolean,timestamptz) from public;
grant execute on function public.review_shop_request(uuid,text,text,boolean,timestamptz) to authenticated;
