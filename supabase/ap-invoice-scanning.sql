-- Authoritative Accounts Payable records and private source documents.
-- Additive only; existing local browser records are not deleted or imported automatically.

create table if not exists public.shop_accounts_payable (
    id uuid primary key default gen_random_uuid(),
    shop_id uuid not null references public.shops(id) on delete cascade,
    vendor text not null,
    invoice_number text,
    invoice_date date,
    due_date date,
    subtotal numeric(14,2),
    tax numeric(14,2),
    total numeric(14,2) not null check (total >= 0),
    category text,
    repair_order_id text,
    notes text,
    document_path text unique,
    ocr_text text,
    status text not null default 'open' check (status in ('open','paid','void')),
    created_by uuid not null references auth.users(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    paid_at timestamptz
);

create index if not exists shop_ap_recent_idx on public.shop_accounts_payable(shop_id, created_at desc);
create index if not exists shop_ap_vendor_invoice_idx on public.shop_accounts_payable(shop_id, lower(vendor), lower(invoice_number));
alter table public.shop_accounts_payable enable row level security;

drop policy if exists "finance users view accounts payable" on public.shop_accounts_payable;
create policy "finance users view accounts payable" on public.shop_accounts_payable for select to authenticated
using (public.has_shop_role(shop_id,array['owner','admin','service_writer','read_only']));
drop policy if exists "finance users create accounts payable" on public.shop_accounts_payable;
create policy "finance users create accounts payable" on public.shop_accounts_payable for insert to authenticated
with check (created_by=auth.uid() and public.has_shop_role(shop_id,array['owner','admin','service_writer']));
drop policy if exists "finance users update accounts payable" on public.shop_accounts_payable;
create policy "finance users update accounts payable" on public.shop_accounts_payable for update to authenticated
using (public.has_shop_role(shop_id,array['owner','admin','service_writer']))
with check (public.has_shop_role(shop_id,array['owner','admin','service_writer']));
grant select,insert,update on public.shop_accounts_payable to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('shop-ap-documents','shop-ap-documents',false,20971520,array['application/pdf','image/jpeg','image/png'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "finance users view ap documents" on storage.objects;
create policy "finance users view ap documents" on storage.objects for select to authenticated
using(bucket_id='shop-ap-documents' and public.has_shop_role((storage.foldername(name))[1]::uuid,array['owner','admin','service_writer','read_only']));
drop policy if exists "finance users upload ap documents" on storage.objects;
create policy "finance users upload ap documents" on storage.objects for insert to authenticated
with check(bucket_id='shop-ap-documents' and public.has_shop_role((storage.foldername(name))[1]::uuid,array['owner','admin','service_writer']));
drop policy if exists "finance users delete pending ap documents" on storage.objects;
create policy "finance users delete pending ap documents" on storage.objects for delete to authenticated
using(
    bucket_id='shop-ap-documents'
    and public.has_shop_role((storage.foldername(name))[1]::uuid,array['owner','admin','service_writer'])
    and not exists(select 1 from public.shop_accounts_payable where document_path=name)
);
