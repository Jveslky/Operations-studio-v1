-- Shop-wide color schemes and per-user Shop dashboard preferences.
create table if not exists public.shop_appearance_settings (
    shop_id uuid primary key references public.shops(id) on delete cascade,
    color_scheme text not null default 'industrial' check(color_scheme in ('industrial','slate','forest','high_contrast')),
    updated_by uuid references auth.users(id) on delete set null,
    updated_at timestamptz not null default now()
);

create table if not exists public.shop_user_appearance_preferences (
    shop_id uuid not null references public.shops(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    dashboard_section_order text[] not null default array['operations','finance','activity','modules'],
    compact_dashboard boolean not null default false,
    updated_at timestamptz not null default now(),
    primary key(shop_id,user_id),
    check(
        cardinality(dashboard_section_order)=4
        and dashboard_section_order <@ array['operations','finance','activity','modules']::text[]
        and dashboard_section_order @> array['operations','finance','activity','modules']::text[]
    )
);

alter table public.shop_appearance_settings enable row level security;
alter table public.shop_user_appearance_preferences enable row level security;

drop policy if exists "shop members view shop appearance" on public.shop_appearance_settings;
create policy "shop members view shop appearance" on public.shop_appearance_settings for select to authenticated using(public.is_shop_member(shop_id));
drop policy if exists "owners and admins manage shop appearance" on public.shop_appearance_settings;
create policy "owners and admins manage shop appearance" on public.shop_appearance_settings for all to authenticated
using(public.has_shop_role(shop_id,array['owner','admin']))
with check(public.has_shop_role(shop_id,array['owner','admin']) and updated_by=auth.uid());

drop policy if exists "users manage their own shop appearance" on public.shop_user_appearance_preferences;
create policy "users manage their own shop appearance" on public.shop_user_appearance_preferences for all to authenticated
using(user_id=auth.uid() and public.is_shop_member(shop_id))
with check(user_id=auth.uid() and public.is_shop_member(shop_id));

grant select,insert,update on public.shop_appearance_settings to authenticated;
grant select,insert,update on public.shop_user_appearance_preferences to authenticated;

insert into public.shop_appearance_settings(shop_id,updated_by)
select shops.id,shops.created_by from public.shops shops
where not exists(select 1 from public.shop_appearance_settings appearance where appearance.shop_id=shops.id)
on conflict(shop_id) do nothing;
