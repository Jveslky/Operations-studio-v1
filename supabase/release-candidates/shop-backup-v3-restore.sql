-- Isolated rehearsal candidate. Install after shop-backup-v3-export.sql.
begin;

-- Private, transaction-scoped authorization for inserting signed historical
-- stock lines. Normal writes and all updates still use the original guards.
create table if not exists private.shop_backup_v3_stock_inserts (
    transaction_id bigint not null,
    shop_id uuid not null,
    row_id uuid not null,
    relation_name text not null,
    lines jsonb not null,
    primary key (transaction_id, relation_name, row_id)
);
revoke all on private.shop_backup_v3_stock_inserts from public, anon, authenticated;

do $install$
declare
    target record;
    original text;
    modified text;
begin
    for target in select * from (values
        ('public.guard_ro_stock()', 'shop_repair_orders', 'estimate_stock_lines'),
        ('public.guard_supplement_stock()', 'shop_supplemental_estimates', 'stock_lines')
    ) as hooks(signature, relation_name, lines_column)
    loop
        original := pg_get_functiondef(target.signature::regprocedure);
        if strpos(original, 'private.shop_backup_v3_stock_inserts') > 0 then
            continue;
        end if;
        modified := regexp_replace(original, '(?i)(^|\n)begin[[:space:]]*', E'\\1begin\n' || format(
            ' if tg_op = ''INSERT'' and exists (
                select 1 from private.shop_backup_v3_stock_inserts permit
                where permit.transaction_id = pg_catalog.txid_current()
                  and permit.relation_name = %L
                  and permit.shop_id = new.shop_id and permit.row_id = new.id
                  and permit.lines = new.%I
             ) then return new; end if;' || chr(10),
            target.relation_name, target.lines_column
        ));
        if modified is not distinct from original then
            raise exception 'Could not install historical stock hook for %', target.signature;
        end if;
        execute modified;
    end loop;
end $install$;

-- Allow only the original status and revision of a signed historical order.
-- The permit is private and exists only during the verified restore.
do $install$
declare
    original text := pg_get_functiondef('public.audit_shop_estimate_approval()'::regprocedure);
    modified text;
begin
    if strpos(original, 'backup_estimate_revision') = 0 then
        modified := regexp_replace(original, '(?i)(^|\n)begin[[:space:]]*', E'\\1begin\n' || $hook$
    if new.approval_request is null and exists (
        select 1 from private.shop_backup_v3_stock_inserts permit
        where permit.transaction_id = pg_catalog.txid_current()
          and permit.relation_name = 'backup_estimate_revision'
          and permit.shop_id = new.shop_id and permit.row_id = new.id
          and permit.lines->'status' = to_jsonb(new.estimate_approval_status)
          and permit.lines->'version' = to_jsonb(new.estimate_version)
          and (tg_op = 'INSERT' or permit.lines->'stock' = new.estimate_stock_lines)
    ) then return new; end if;
$hook$);
        if modified is not distinct from original then
            raise exception 'Could not install historical approval hook';
        end if;
        execute modified;
    end if;
end $install$;

-- Historical approvals retain their original dates and must not send a fresh alert.
do $install$
declare
    original text := pg_get_functiondef('public.notify_shop_estimate_approval()'::regprocedure);
    modified text;
begin
    if strpos(original, 'backup_estimate_alert') = 0 then
        modified := regexp_replace(original, '(?i)(^|\n)begin[[:space:]]*', E'\\1begin\n' || $hook$
    if exists (
        select 1 from private.shop_backup_v3_stock_inserts permit
        where permit.transaction_id = pg_catalog.txid_current()
          and permit.relation_name = 'backup_estimate_alert'
          and permit.shop_id = new.shop_id and permit.row_id = new.id
          and permit.lines = to_jsonb(new)
    ) then return new; end if;
$hook$);
        if modified is not distinct from original then
            raise exception 'Could not install historical approval alert hook';
        end if;
        execute modified;
    end if;
end $install$;

create or replace function public.restore_shop_data_backup_v3(p_shop uuid, p_backup jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    dataset record;
    item jsonb;
    current_row jsonb;
    identity_predicate text;
    cloud jsonb := p_backup->'cloud';
    legacy_result jsonb;
    financial_result jsonb;
    base_orders jsonb;
    order_id uuid;
    current_lines jsonb;
    stock_lines jsonb;
    inserted_supplements uuid[] := array[]::uuid[];
    stock_event_count bigint;
    inserted_orders uuid[] := array[]::uuid[];
    added integer := 0;
begin
    if auth.uid() is null or p_shop is null
       or not coalesce(public.has_shop_role(p_shop, array['owner', 'admin']), false)
       or not coalesce(public.shop_has_permission(p_shop, 'data.import'), false) then
        raise exception 'Shop backup import permission is required' using errcode = '42501';
    end if;
    perform private.verify_shop_backup_v3(p_backup, p_shop);
    -- Concurrent imports must observe the preceding import before testing IDs.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
        'shop-backup-v3:' || p_shop::text, 0));

    -- Offline operations use a single-column RO foreign key. Check tenant
    -- ownership against the signed repair order dataset as well.
    if exists (
        select 1
        from jsonb_array_elements((cloud->'offline_ro_operations') ||
                                  (cloud->'offline_note_operations')) as operations(item)
        where not exists (
            select 1 from jsonb_array_elements(cloud->'repair_orders') as orders(ro)
            where ro->>'id' = operations.item->>'repair_order_id'
        )
    ) then
        raise exception 'Offline operation is missing its repair order';
    end if;

    -- Stocked inserts are rejected by the normal RO trigger. Stage new ROs
    -- without stock lines, then reserve the lines after restoring inventory.
    -- Only signed settled rows qualify for a historical insert. Their
    -- original event and settlement rows are restored below.
    insert into private.shop_backup_v3_stock_inserts
    select txid_current(), p_shop, (ro->>'id')::uuid, 'shop_repair_orders', ro->'estimate_stock_lines'
    from jsonb_array_elements(cloud->'repair_orders') as orders(ro)
    where exists (
        select 1 from jsonb_array_elements(cloud->'ro_stock_settlements') as settlements(st)
        where st->>'repair_order_id' = ro->>'id'
    );
    insert into private.shop_backup_v3_stock_inserts
    select txid_current(), p_shop, (se->>'id')::uuid, 'shop_supplemental_estimates', se->'stock_lines'
    from jsonb_array_elements(cloud->'supplemental_estimates') as supplements(se)
    where exists (
        select 1 from jsonb_array_elements(cloud->'supplement_stock_settlements') as settlements(st)
        where st->>'supplement_id' = se->>'id'
    );

    select coalesce(jsonb_agg(
        case when not exists (
                 select 1 from private.shop_backup_v3_stock_inserts permit
                 where permit.transaction_id = txid_current()
                   and permit.relation_name = 'shop_repair_orders'
                   and permit.row_id = (ro->>'id')::uuid
             ) then ro || '{"estimate_stock_lines":[],"stock_lines_expected":[]}'::jsonb
             else ro end
    ), '[]'::jsonb),
    coalesce(array_agg((ro->>'id')::uuid), array[]::uuid[])
    into base_orders, inserted_orders
    from jsonb_array_elements(cloud->'repair_orders') as orders(ro)
    where not exists (
        select 1 from public.shop_repair_orders existing
        where existing.id = (ro->>'id')::uuid and existing.shop_id = p_shop
    );

    if exists (
        select 1 from jsonb_array_elements(base_orders) as orders(ro)
        where ro->>'estimate_approval_status' = 'Approved'
          and not exists (
              select 1 from jsonb_array_elements(cloud->'estimate_approvals') as approvals(approval)
              where approval->>'repair_order_id' = ro->>'id'
          )
    ) then
        raise exception 'Backup is missing approval history for a repair order';
    end if;

    if cloud ? 'estimate_approvals' then
        insert into private.shop_backup_v3_stock_inserts
        select txid_current(), p_shop, (ro->>'id')::uuid, 'backup_estimate_revision',
               jsonb_build_object('status', ro->'estimate_approval_status',
                                  'version', ro->'estimate_version',
                                  'stock', ro->'estimate_stock_lines')
        from jsonb_array_elements(cloud->'repair_orders') as orders(ro)
        where (ro->>'id')::uuid = any(inserted_orders)
          and ro->>'approval_request' is null;
    end if;

    legacy_result := public.restore_shop_data_backup(
        jsonb_build_object('format', 'track-right-shop-backup', 'version', 2,
                           'source_shop_id', p_shop, 'cloud',
                           jsonb_set(cloud - array['invoices','payments','payment_ro_events'],
                                     '{repair_orders}', base_orders))
    );

    -- Insert as one statement so linked approvals can reference other
    -- approval rows from the same backup regardless of array order.
    if exists (
        select 1 from jsonb_populate_recordset(null::public.shop_estimate_approvals,
                                              cloud->'estimate_approvals') incoming
        join public.shop_estimate_approvals existing on existing.id = incoming.id
        where to_jsonb(existing) is distinct from to_jsonb(incoming)
    ) then
        raise exception 'Existing record differs in backup dataset: estimate_approvals';
    end if;
    insert into private.shop_backup_v3_stock_inserts
    select txid_current(), p_shop, incoming.id, 'backup_estimate_alert', to_jsonb(incoming)
    from jsonb_populate_recordset(null::public.shop_estimate_approvals,
                                 cloud->'estimate_approvals') incoming
    where not exists (
        select 1 from public.shop_estimate_approvals existing where existing.id = incoming.id
    );
    insert into public.shop_estimate_approvals
    select incoming.*
    from jsonb_populate_recordset(null::public.shop_estimate_approvals,
                                 cloud->'estimate_approvals') incoming
    where not exists (
        select 1 from public.shop_estimate_approvals existing where existing.id = incoming.id
    );
    get diagnostics added = row_count;

    -- Parents precede dependent rows. Existing matching rows are safe to
    -- retain. A mismatched row or a conflicting unique key aborts the import.
    for dataset in
        select * from (values
            ('supplemental_estimates', 'shop_supplemental_estimates', array['id']),
            ('supplement_authorizations', 'shop_supplement_authorizations', array['id']),
            ('inventory_items', 'shop_inventory_items', array['id']),
            ('inventory_receipts', 'shop_inventory_receipts', array['id']),
            ('inventory_operations', 'shop_inventory_operations', array['id']),
            ('inventory_movements', 'shop_inventory_movements', array['id']),
            ('ro_stock_events', 'shop_ro_stock_events', array['id']),
            ('ro_stock_settlements', 'shop_ro_stock_settlements', array['repair_order_id']),
            ('supplement_stock_settlements', 'shop_supplement_stock_settlements', array['supplement_id']),
            ('ap_stock_receipts', 'shop_ap_stock_receipts', array['shop_id','request_id']),
            ('ap_bill_operations', 'shop_ap_bill_operations', array['shop_id','request_id']),
            ('ap_duplicate_overrides', 'shop_ap_duplicate_overrides', array['bill_id']),
            ('offline_note_operations', 'shop_offline_note_operations', array['shop_id','request_id']),
            ('offline_ro_operations', 'shop_offline_ro_operations', array['shop_id','request_id'])
        ) as datasets(key, table_name, identity_keys)
    loop
        select string_agg(format('r.%1$I = incoming.%1$I', k), ' and ')
        into identity_predicate from unnest(dataset.identity_keys) as keys(k);
        for item in select value from jsonb_array_elements(cloud->dataset.key)
        loop
            execute format(
                'select to_jsonb(r) from public.%1$I r
                 cross join jsonb_populate_record(null::public.%1$I, $1) incoming
                 where %2$s',
                dataset.table_name, identity_predicate
            ) into current_row using item;
            if current_row is not null then
                if current_row is distinct from item then
                    raise exception 'Existing record differs in backup dataset: %', dataset.key;
                end if;
                continue;
            end if;
            if dataset.key = 'supplemental_estimates'
               and coalesce(item->'stock_lines', '[]'::jsonb) <> '[]'::jsonb
               and not exists (
                   select 1 from private.shop_backup_v3_stock_inserts permit
                   where permit.transaction_id = txid_current()
                     and permit.relation_name = 'shop_supplemental_estimates'
                     and permit.row_id = (item->>'id')::uuid
               ) then
                inserted_supplements := array_append(inserted_supplements, (item->>'id')::uuid);
                item := jsonb_set(item, '{stock_lines}', '[]'::jsonb);
            end if;
            execute format(
                'insert into public.%1$I select * from jsonb_populate_record(null::public.%1$I, $1)',
                dataset.table_name
            ) using item;
            added := added + 1;
        end loop;
    end loop;

    for item in select value from jsonb_array_elements(cloud->'repair_orders')
    loop
        order_id := (item->>'id')::uuid;
        stock_lines := coalesce(item->'estimate_stock_lines', '[]'::jsonb);
        select coalesce(estimate_stock_lines, '[]'::jsonb) into strict current_lines
        from public.shop_repair_orders where id = order_id and shop_id = p_shop
        for update;
        if order_id = any(inserted_orders) and current_lines is distinct from stock_lines then
            update public.shop_repair_orders
            set estimate_stock_lines = stock_lines, stock_lines_expected = current_lines
            where id = order_id and shop_id = p_shop;
        elsif current_lines is distinct from stock_lines then
            raise exception 'Existing repair order stock lines differ from backup';
        end if;
    end loop;

    -- Reconcile against the imported history. Any new stock event indicates
    -- the signed lines and restored history did not agree.
    if cardinality(inserted_supplements) > 0 then
        select count(*) into stock_event_count
        from public.shop_ro_stock_events where shop_id = p_shop;
        for item in select value from jsonb_array_elements(cloud->'supplemental_estimates')
        loop
            if (item->>'id')::uuid = any(inserted_supplements) then
                update public.shop_supplemental_estimates
                set stock_lines = item->'stock_lines'
                where id = (item->>'id')::uuid and shop_id = p_shop;
                if not found then
                    raise exception 'Restored supplemental estimate is missing';
                end if;
            end if;
        end loop;
        if (select count(*) from public.shop_ro_stock_events where shop_id = p_shop)
           is distinct from stock_event_count then
            raise exception 'Restored supplemental stock does not match its event history';
        end if;
    end if;

    -- Invoice validation reads approved supplements, so invoices and their
    -- payment history must follow restoration of the supplement snapshots.
    financial_result := public.restore_shop_data_backup(
        jsonb_build_object('format', 'track-right-shop-backup', 'version', 2,
                           'source_shop_id', p_shop, 'cloud', jsonb_build_object(
                               'invoices', cloud->'invoices', 'payments', cloud->'payments',
                               'payment_ro_events', cloud->'payment_ro_events'))
    );
    legacy_result := legacy_result || jsonb_build_object(
        'restored', (legacy_result->>'restored')::integer + (financial_result->>'restored')::integer
    );

    delete from private.shop_backup_v3_stock_inserts
    where transaction_id = txid_current() and shop_id = p_shop;

    return legacy_result || jsonb_build_object('additional_rows_restored', added);
end;
$$;

revoke all on function public.restore_shop_data_backup_v3(uuid, jsonb) from public, anon;
grant execute on function public.restore_shop_data_backup_v3(uuid, jsonb) to authenticated;
create or replace function public.upload_shop_data_backup_v3(p_shop uuid, p_backup_text text)
returns jsonb language sql set search_path = ''
as $$ select public.restore_shop_data_backup_v3(p_shop, p_backup_text::jsonb) $$;
revoke all on function public.upload_shop_data_backup_v3(uuid, text) from public, anon;
grant execute on function public.upload_shop_data_backup_v3(uuid, text) to authenticated;

commit;
