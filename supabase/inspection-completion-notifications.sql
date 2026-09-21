-- Run after inspection-templates-and-rules.sql.
-- Adds deduplicated, shop-scoped in-app inspection completion notifications.

alter table public.shop_inspection_settings
    add column if not exists completion_notifications_enabled boolean not null default true;

create table if not exists public.shop_notifications (
    id uuid primary key default gen_random_uuid(),
    shop_id uuid not null references public.shops(id) on delete cascade,
    notification_type text not null,
    source_id uuid not null,
    repair_order_id text,
    title text not null,
    message text not null,
    severity text not null default 'info'
        check (severity in ('info', 'attention', 'critical')),
    created_at timestamptz not null default now(),
    unique (shop_id, notification_type, source_id)
);

create table if not exists public.shop_notification_reads (
    notification_id uuid not null references public.shop_notifications(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    read_at timestamptz not null default now(),
    primary key (notification_id, user_id)
);

create index if not exists shop_notifications_recent_idx
    on public.shop_notifications (shop_id, created_at desc);

alter table public.shop_notifications enable row level security;
alter table public.shop_notification_reads enable row level security;

drop policy if exists "office users view shop notifications" on public.shop_notifications;
create policy "office users view shop notifications"
on public.shop_notifications for select to authenticated
using (public.has_shop_role(shop_id, array['owner', 'admin', 'service_writer']));

drop policy if exists "users view their notification reads" on public.shop_notification_reads;
create policy "users view their notification reads"
on public.shop_notification_reads for select to authenticated
using (user_id = auth.uid());

drop policy if exists "users mark their notifications read" on public.shop_notification_reads;
create policy "users mark their notifications read"
on public.shop_notification_reads for insert to authenticated
with check (
    user_id = auth.uid()
    and exists (
        select 1 from public.shop_notifications notifications
        where notifications.id = notification_id
          and public.has_shop_role(notifications.shop_id, array['owner', 'admin', 'service_writer'])
    )
);

grant select on public.shop_notifications to authenticated;
grant select, insert on public.shop_notification_reads to authenticated;

create or replace function public.create_inspection_completion_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    notifications_enabled boolean;
    pass_count integer;
    attention_count integer;
    fail_count integer;
    na_count integer;
    notification_severity text;
begin
    if new.status <> 'complete' or old.status = 'complete' then return new; end if;

    select coalesce(settings.completion_notifications_enabled, true)
    into notifications_enabled
    from public.shop_inspection_settings settings
    where settings.shop_id = new.shop_id;
    if notifications_enabled is false then return new; end if;

    select
        count(*) filter (where response = 'pass'),
        count(*) filter (where response = 'attention'),
        count(*) filter (where response = 'fail'),
        count(*) filter (where response = 'na')
    into pass_count, attention_count, fail_count, na_count
    from public.shop_inspection_items where inspection_id = new.id;

    notification_severity := case
        when fail_count > 0 then 'critical'
        when attention_count > 0 then 'attention'
        else 'info'
    end;

    insert into public.shop_notifications (
        shop_id, notification_type, source_id, repair_order_id, title, message, severity
    ) values (
        new.shop_id,
        'inspection_completed',
        new.id,
        new.repair_order_id,
        'Inspection completed — RO #' || new.repair_order_id,
        pass_count || ' Pass · ' || attention_count || ' Attention · ' || fail_count || ' Fail · ' || na_count || ' N/A',
        notification_severity
    ) on conflict (shop_id, notification_type, source_id) do nothing;

    return new;
end;
$$;

drop trigger if exists notify_inspection_completion on public.shop_inspections;
create trigger notify_inspection_completion
after update of status on public.shop_inspections
for each row execute function public.create_inspection_completion_notification();
