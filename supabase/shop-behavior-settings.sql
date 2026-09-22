-- Shop-wide operational defaults. Additive; existing records are not rewritten.
create table if not exists public.shop_behavior_settings (
    shop_id uuid primary key references public.shops(id) on delete cascade,
    scheduling_lead_hours integer not null default 0 check(scheduling_lead_hours between 0 and 8760),
    default_appointment_duration_minutes integer not null default 60 check(default_appointment_duration_minutes between 15 and 480),
    default_appointment_type text not null default 'Shop' check(default_appointment_type in ('Shop','Mobile','Pickup','Dropoff')),
    default_ro_priority text not null default 'Medium' check(default_ro_priority in ('Low','Medium','High')),
    default_invoice_terms_days integer not null default 30 check(default_invoice_terms_days between 0 and 365),
    auto_add_approved_time_off boolean not null default true,
    request_reminder_lead_hours integer not null default 24 check(request_reminder_lead_hours between 0 and 8760),
    updated_by uuid references auth.users(id) on delete set null,
    updated_at timestamptz not null default now()
);

alter table public.shop_behavior_settings enable row level security;
drop policy if exists "shop members view behavior settings" on public.shop_behavior_settings;
create policy "shop members view behavior settings" on public.shop_behavior_settings for select to authenticated
using(public.is_shop_member(shop_id));
drop policy if exists "owners and admins manage behavior settings" on public.shop_behavior_settings;
create policy "owners and admins manage behavior settings" on public.shop_behavior_settings for all to authenticated
using(public.has_shop_role(shop_id,array['owner','admin']))
with check(public.has_shop_role(shop_id,array['owner','admin']) and updated_by=auth.uid());
grant select,insert,update on public.shop_behavior_settings to authenticated;

insert into public.shop_behavior_settings(shop_id,updated_by)
select shops.id,shops.created_by from public.shops shops
where not exists(select 1 from public.shop_behavior_settings settings where settings.shop_id=shops.id)
on conflict(shop_id) do nothing;
