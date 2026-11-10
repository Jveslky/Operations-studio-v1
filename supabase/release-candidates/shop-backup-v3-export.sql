-- Draft for isolated rehearsal. Import requires a verified backup format.
begin;

create schema if not exists private;

create or replace function private.shop_backup_v3_datasets()
returns table(key text, table_name text)
language sql immutable set search_path = ''
as $$
    values
            ('customers', 'Customers'),
            ('billing_profiles', 'customer_billing_profiles'),
            ('tax_profiles', 'customer_tax_profiles'),
            ('billing_audit', 'customer_billing_audit'),
            ('units', 'customer_units'),
            ('repair_orders', 'shop_repair_orders'),
            ('payments', 'shop_invoice_payments'),
            ('payment_ro_events', 'shop_payment_ro_events'),
            ('invoices', 'shop_invoices'),
            ('accounts_payable', 'shop_accounts_payable'),
            ('requests', 'shop_requests'),
            ('calendar', 'shop_calendar_events'),
            ('appointments', 'shop_appointments'),
            ('inventory_items', 'shop_inventory_items'),
            ('inventory_receipts', 'shop_inventory_receipts'),
            ('inventory_operations', 'shop_inventory_operations'),
            ('inventory_movements', 'shop_inventory_movements'),
            ('ro_stock_events', 'shop_ro_stock_events'),
            ('ro_stock_settlements', 'shop_ro_stock_settlements'),
            ('supplemental_estimates', 'shop_supplemental_estimates'),
            ('supplement_authorizations', 'shop_supplement_authorizations'),
            ('ap_stock_receipts', 'shop_ap_stock_receipts'),
            ('ap_bill_operations', 'shop_ap_bill_operations'),
            ('ap_duplicate_overrides', 'shop_ap_duplicate_overrides'),
            ('offline_note_operations', 'shop_offline_note_operations'),
            ('offline_ro_operations', 'shop_offline_ro_operations'),
            ('supplement_stock_settlements', null::text)
$$;


-- Shape and tenant checks only. The eventual restore must also verify
-- provenance and validate relationships before writing any records.
create or replace function private.validate_shop_backup_v3(p_backup jsonb, p_shop uuid)
returns void
language plpgsql immutable set search_path = ''
as $$
declare
    dataset record;
    cloud jsonb := p_backup->'cloud';
begin
    if p_shop is null
       or p_backup->>'format' is distinct from 'track-right-shop-backup'
       or p_backup->'version' is distinct from '3'::jsonb
       or p_backup->>'source_shop_id' is distinct from p_shop::text
       or jsonb_typeof(cloud) is distinct from 'object' then
        raise exception 'Invalid version 3 backup for this shop';
    end if;

    for dataset in select * from private.shop_backup_v3_datasets()
    loop
        if jsonb_typeof(cloud->dataset.key) is distinct from 'array' then
            raise exception 'Missing or invalid backup dataset: %', dataset.key;
        end if;
        if exists (
            select 1 from jsonb_array_elements(cloud->dataset.key) as rows(item)
            where jsonb_typeof(item) is distinct from 'object'
               or (dataset.table_name is not null and item->>'shop_id' is distinct from p_shop::text)
        ) then
            raise exception 'Invalid or foreign row in backup dataset: %', dataset.key;
        end if;
    end loop;

    if exists (
        select 1 from jsonb_object_keys(cloud) as keys(key)
        where not exists (select 1 from private.shop_backup_v3_datasets() d where d.key = keys.key)
    ) then
        raise exception 'Unknown version 3 backup dataset';
    end if;

    if exists (
        select 1 from jsonb_array_elements(cloud->'supplement_stock_settlements') as rows(item)
        where not exists (
            select 1 from jsonb_array_elements(cloud->'supplemental_estimates') as supplements(supplement)
            where supplement->>'id' = item->>'supplement_id'
        )
    ) then
        raise exception 'Stock settlement is missing its supplemental estimate';
    end if;
end;
$$;

revoke all on function private.shop_backup_v3_datasets() from public, anon, authenticated;
revoke all on function private.validate_shop_backup_v3(jsonb, uuid) from public, anon, authenticated;

-- Provision matching keys on the source and authorized recovery target through
-- the database operator. Keep the keys outside the backup JSON.
create table if not exists private.shop_backup_v3_signing_keys (
    key_id uuid primary key,
    secret bytea not null check (octet_length(secret) >= 32),
    active boolean not null default false
);
create unique index if not exists shop_backup_v3_one_active_key
    on private.shop_backup_v3_signing_keys (active) where active;
revoke all on private.shop_backup_v3_signing_keys from public, anon, authenticated;

create or replace function private.shop_backup_v3_mac(p_payload jsonb, p_secret bytea)
returns text language sql immutable strict set search_path = ''
as $$
    select encode(extensions.hmac(convert_to(p_payload::text, 'UTF8'), p_secret, 'sha256'), 'hex')
$$;

create or replace function private.verify_shop_backup_v3(p_backup jsonb, p_shop uuid)
returns void language plpgsql stable set search_path = ''
as $$
declare
    signing_key private.shop_backup_v3_signing_keys;
    expected text;
begin
    select * into signing_key from private.shop_backup_v3_signing_keys
    where key_id::text = p_backup->>'signing_key_id';
    expected := private.shop_backup_v3_mac(p_backup - 'signature', signing_key.secret);
    if expected is null or sha256(convert_to(expected, 'UTF8')) is distinct from
       sha256(convert_to(p_backup->>'signature', 'UTF8')) then
        raise exception 'Backup signature could not be verified';
    end if;
    perform private.validate_shop_backup_v3(p_backup, p_shop);
end;
$$;

revoke all on function private.shop_backup_v3_mac(jsonb, bytea) from public, anon, authenticated;
revoke all on function private.verify_shop_backup_v3(jsonb, uuid) from public, anon, authenticated;

create or replace function public.export_shop_data_backup_v3(p_shop uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    dataset record;
    signing_key private.shop_backup_v3_signing_keys;
    payload jsonb;
    records jsonb;
    cloud jsonb := '{}'::jsonb;
begin
    if auth.uid() is null or p_shop is null
       or not coalesce(public.has_shop_role(p_shop, array['owner', 'admin']), false)
       or not coalesce(public.shop_has_permission(p_shop, 'data.export'), false) then
        raise exception 'Shop backup export permission is required' using errcode = '42501';
    end if;

    select * into signing_key from private.shop_backup_v3_signing_keys where active;
    if not found then
        raise exception 'Shop backup signing is not configured';
    end if;

    -- The table names come exclusively from this fixed list.
    for dataset in
        select * from private.shop_backup_v3_datasets() where table_name is not null
    loop
        execute format(
            'select coalesce(jsonb_agg(to_jsonb(r)), ''[]''::jsonb) from public.%I r where r.shop_id = $1',
            dataset.table_name
        ) into records using p_shop;
        cloud := cloud || jsonb_build_object(dataset.key, records);
    end loop;

    select coalesce(jsonb_agg(to_jsonb(settlement)), '[]'::jsonb) into records
    from public.shop_supplement_stock_settlements settlement
    join public.shop_supplemental_estimates supplement on supplement.id = settlement.supplement_id
    where supplement.shop_id = p_shop;
    cloud := cloud || jsonb_build_object('supplement_stock_settlements', records);

    payload := jsonb_build_object(
        'signing_key_id', signing_key.key_id,
        'format', 'track-right-shop-backup',
        'version', 3,
        'source_shop_id', p_shop,
        'exported_at', statement_timestamp(),
        'excludes', jsonb_build_array('private storage files', 'device-local data', 'unsubmitted stock confirmations'),
        'cloud', cloud
    );
    return payload || jsonb_build_object('signature', private.shop_backup_v3_mac(payload, signing_key.secret));
end;
$$;

revoke all on function public.export_shop_data_backup_v3(uuid) from public, anon;
grant execute on function public.export_shop_data_backup_v3(uuid) to authenticated;

create or replace function public.download_shop_data_backup_v3(p_shop uuid)
returns text language sql stable set search_path = ''
as $$ select public.export_shop_data_backup_v3(p_shop)::text $$;
revoke all on function public.download_shop_data_backup_v3(uuid) from public, anon;
grant execute on function public.download_shop_data_backup_v3(uuid) to authenticated;

commit;
