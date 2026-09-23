begin;

create table if not exists public.shop_invoices (
    id uuid primary key default gen_random_uuid(),
    shop_id uuid not null references public.shops(id) on delete cascade,
    invoice_number bigint,
    legacy_local_id text,
    repair_order_id uuid references public.shop_repair_orders(id) on delete set null,
    repair_order_number bigint,
    source_type text not null default 'repair-order',
    customer_id text,
    unit_id text,
    customer_name text not null default '',
    customer_email text not null default '',
    customer_phone text not null default '',
    unit_name text not null default '',
    complaint text not null default '',
    subtotal numeric(12,2) not null default 0,
    tax_amount numeric(12,2) not null default 0,
    total numeric(12,2) not null default 0,
    tax_snapshot jsonb not null default '{}'::jsonb,
    fee_snapshot jsonb,
    status text not null default 'Draft',
    due_date date,
    notes text not null default '',
    sent_at timestamptz,
    paid_at timestamptz,
    created_by uuid not null default auth.uid() references auth.users(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (shop_id, invoice_number),
    unique (shop_id, legacy_local_id)
);

create unique index if not exists shop_invoices_one_per_repair_order
on public.shop_invoices (repair_order_id)
where repair_order_id is not null;

create index if not exists shop_invoices_shop_status_idx
on public.shop_invoices (shop_id, status, created_at desc);

create or replace function public.assign_shop_invoice_number()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
    if new.invoice_number is null then
        perform pg_advisory_xact_lock(hashtextextended('invoice:' || new.shop_id::text, 0));
        select greatest(coalesce(max(invoice_number),1000)+1,1001)
        into new.invoice_number from public.shop_invoices where shop_id=new.shop_id;
    end if;
    new.updated_at=now();
    return new;
end;
$$;

drop trigger if exists assign_shop_invoice_number on public.shop_invoices;
create trigger assign_shop_invoice_number before insert on public.shop_invoices
for each row execute function public.assign_shop_invoice_number();

create or replace function public.protect_shop_invoice_snapshot()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
    new.shop_id=old.shop_id;
    new.invoice_number=old.invoice_number;
    new.repair_order_id=old.repair_order_id;
    new.repair_order_number=old.repair_order_number;
    new.subtotal=old.subtotal;
    new.tax_amount=old.tax_amount;
    new.total=old.total;
    new.tax_snapshot=old.tax_snapshot;
    new.fee_snapshot=old.fee_snapshot;
    new.created_by=old.created_by;
    new.created_at=old.created_at;
    new.updated_at=now();
    return new;
end;
$$;

drop trigger if exists protect_shop_invoice_snapshot on public.shop_invoices;
create trigger protect_shop_invoice_snapshot before update on public.shop_invoices
for each row execute function public.protect_shop_invoice_snapshot();

alter table public.shop_invoices enable row level security;
drop policy if exists "shop members view invoices" on public.shop_invoices;
create policy "shop members view invoices" on public.shop_invoices for select to authenticated
using(public.is_shop_member(shop_id));
drop policy if exists "office creates invoices" on public.shop_invoices;
create policy "office creates invoices" on public.shop_invoices for insert to authenticated
with check(created_by=auth.uid() and public.has_shop_role(shop_id,array['owner','admin','service_writer']));
drop policy if exists "office updates invoices" on public.shop_invoices;
create policy "office updates invoices" on public.shop_invoices for update to authenticated
using(public.has_shop_role(shop_id,array['owner','admin','service_writer']))
with check(public.has_shop_role(shop_id,array['owner','admin','service_writer']));
drop policy if exists "owners delete invoices" on public.shop_invoices;
create policy "owners delete invoices" on public.shop_invoices for delete to authenticated
using(public.has_shop_role(shop_id,array['owner','admin']));

grant select,insert,update,delete on public.shop_invoices to authenticated;
commit;
