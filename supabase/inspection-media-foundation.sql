-- Private, shop-scoped inspection and repair-order media foundation.
-- Additive only: no existing repair-order or customer data is changed.

create table if not exists public.shop_inspection_settings (
    shop_id uuid primary key references public.shops(id) on delete cascade,
    default_attachment_mode text not null default 'never'
        check (default_attachment_mode in ('never', 'suggest', 'attach')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.shop_inspections (
    id uuid primary key default gen_random_uuid(),
    shop_id uuid not null references public.shops(id) on delete cascade,
    repair_order_id text not null,
    template_id uuid,
    title text not null default 'General Inspection',
    status text not null default 'draft'
        check (status in ('draft', 'complete', 'archived')),
    created_by uuid not null references auth.users(id),
    completed_by uuid references auth.users(id),
    created_at timestamptz not null default now(),
    completed_at timestamptz,
    updated_at timestamptz not null default now()
);

create index if not exists shop_inspections_shop_ro_idx
    on public.shop_inspections (shop_id, repair_order_id, created_at desc);

create table if not exists public.shop_ro_media (
    id uuid primary key default gen_random_uuid(),
    shop_id uuid not null references public.shops(id) on delete cascade,
    repair_order_id text not null,
    inspection_id uuid references public.shop_inspections(id) on delete set null,
    inspection_item_id uuid,
    category text check (category is null or category in ('before', 'during', 'after')),
    caption text,
    visibility text not null default 'internal'
        check (visibility in ('internal', 'customer')),
    object_path text not null unique,
    mime_type text not null,
    file_size bigint not null check (file_size > 0),
    uploaded_by uuid not null references auth.users(id),
    created_at timestamptz not null default now()
);

create index if not exists shop_ro_media_shop_ro_idx
    on public.shop_ro_media (shop_id, repair_order_id, created_at desc);

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
    return new;
end;
$$;

drop trigger if exists validate_inspection_media_shop_scope on public.shop_ro_media;
create trigger validate_inspection_media_shop_scope
before insert or update on public.shop_ro_media
for each row execute function public.validate_inspection_media_shop();

alter table public.shop_inspection_settings enable row level security;
alter table public.shop_inspections enable row level security;
alter table public.shop_ro_media enable row level security;

drop policy if exists "members view inspection settings" on public.shop_inspection_settings;
create policy "members view inspection settings"
on public.shop_inspection_settings for select to authenticated
using (public.is_shop_member(shop_id));

drop policy if exists "owners and admins manage inspection settings" on public.shop_inspection_settings;
create policy "owners and admins manage inspection settings"
on public.shop_inspection_settings for all to authenticated
using (public.has_shop_role(shop_id, array['owner', 'admin']))
with check (public.has_shop_role(shop_id, array['owner', 'admin']));

drop policy if exists "members view inspections" on public.shop_inspections;
create policy "members view inspections"
on public.shop_inspections for select to authenticated
using (public.is_shop_member(shop_id));

drop policy if exists "workflow users create inspections" on public.shop_inspections;
create policy "workflow users create inspections"
on public.shop_inspections for insert to authenticated
with check (
    created_by = auth.uid()
    and public.has_shop_role(shop_id, array['owner', 'admin', 'service_writer', 'technician'])
);

drop policy if exists "workflow users update inspections" on public.shop_inspections;
create policy "workflow users update inspections"
on public.shop_inspections for update to authenticated
using (public.has_shop_role(shop_id, array['owner', 'admin', 'service_writer', 'technician']))
with check (public.has_shop_role(shop_id, array['owner', 'admin', 'service_writer', 'technician']));

drop policy if exists "members view repair order media" on public.shop_ro_media;
create policy "members view repair order media"
on public.shop_ro_media for select to authenticated
using (public.is_shop_member(shop_id));

drop policy if exists "workflow users create repair order media" on public.shop_ro_media;
create policy "workflow users create repair order media"
on public.shop_ro_media for insert to authenticated
with check (
    uploaded_by = auth.uid()
    and public.has_shop_role(shop_id, array['owner', 'admin', 'service_writer', 'technician'])
);

drop policy if exists "office users delete repair order media" on public.shop_ro_media;
create policy "office users delete repair order media"
on public.shop_ro_media for delete to authenticated
using (
    public.has_shop_role(shop_id, array['owner', 'admin', 'service_writer'])
    or uploaded_by = auth.uid()
);

grant select, insert, update on public.shop_inspections to authenticated;
grant select, insert, delete on public.shop_ro_media to authenticated;
grant select, insert, update on public.shop_inspection_settings to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'shop-inspection-media',
    'shop-inspection-media',
    false,
    104857600,
    array[
        'image/jpeg', 'image/png', 'image/heic', 'image/heif',
        'video/mp4', 'video/quicktime', 'video/webm'
    ]
)
on conflict (id) do update set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "shop members view inspection media files" on storage.objects;
create policy "shop members view inspection media files"
on storage.objects for select to authenticated
using (
    bucket_id = 'shop-inspection-media'
    and public.is_shop_member((storage.foldername(name))[1]::uuid)
);

drop policy if exists "workflow users upload inspection media files" on storage.objects;
create policy "workflow users upload inspection media files"
on storage.objects for insert to authenticated
with check (
    bucket_id = 'shop-inspection-media'
    and public.has_shop_role(
        (storage.foldername(name))[1]::uuid,
        array['owner', 'admin', 'service_writer', 'technician']
    )
);

drop policy if exists "authorized users delete inspection media files" on storage.objects;
create policy "authorized users delete inspection media files"
on storage.objects for delete to authenticated
using (
    bucket_id = 'shop-inspection-media'
    and (
        public.has_shop_role(
            (storage.foldername(name))[1]::uuid,
            array['owner', 'admin', 'service_writer']
        )
        or exists (
            select 1 from public.shop_ro_media media
            where media.object_path = name
              and media.uploaded_by = auth.uid()
        )
    )
);

insert into public.shop_inspection_settings (shop_id, default_attachment_mode)
select id, 'never' from public.shops
on conflict (shop_id) do nothing;
