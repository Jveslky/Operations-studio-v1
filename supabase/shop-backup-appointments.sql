-- Apply after shop-appointments.sql and shop-user-permissions.sql.
-- Adds Schedule appointments to same-shop, missing-only version 2 backup restores.

create or replace function public.restore_shop_data_backup(backup jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
    target_shop uuid;
    item jsonb;
    restored integer := 0;
    affected integer := 0;
begin
    if backup->>'format' <> 'track-right-shop-backup'
       or coalesce((backup->>'version')::integer,0) <> 2 then
        raise exception 'Unsupported Track Right Shop backup';
    end if;
    target_shop := (backup->>'source_shop_id')::uuid;
    if not public.shop_has_permission(target_shop,'data.import') then
        raise exception 'Data-import permission is required';
    end if;
    for item in select value from jsonb_array_elements(coalesce(backup#>'{cloud,customers}','[]'::jsonb)) loop
        if item->>'shop_id' <> target_shop::text then raise exception 'Customer tenant validation failed'; end if;
        insert into public."Customers" select * from jsonb_populate_record(null::public."Customers",item)
        on conflict(id) do nothing;
        get diagnostics affected=row_count; restored:=restored+affected;
    end loop;
    for item in select value from jsonb_array_elements(coalesce(backup#>'{cloud,units}','[]'::jsonb)) loop
        if item->>'shop_id' <> target_shop::text then raise exception 'Unit tenant validation failed'; end if;
        insert into public.customer_units select * from jsonb_populate_record(null::public.customer_units,item)
        on conflict(id) do nothing;
        get diagnostics affected=row_count; restored:=restored+affected;
    end loop;
    for item in select value from jsonb_array_elements(coalesce(backup#>'{cloud,repair_orders}','[]'::jsonb)) loop
        if item->>'shop_id'<>target_shop::text then raise exception 'Repair order tenant validation failed'; end if;
        insert into public.shop_repair_orders select * from jsonb_populate_record(null::public.shop_repair_orders,item)
        on conflict(id) do nothing;
        get diagnostics affected=row_count; restored:=restored+affected;
    end loop;
    for item in select value from jsonb_array_elements(coalesce(backup#>'{cloud,invoices}','[]'::jsonb)) loop
        if item->>'shop_id'<>target_shop::text then raise exception 'Invoice tenant validation failed'; end if;
        insert into public.shop_invoices select * from jsonb_populate_record(null::public.shop_invoices,item)
        on conflict(id) do nothing;
        get diagnostics affected=row_count; restored:=restored+affected;
    end loop;
    for item in select value from jsonb_array_elements(coalesce(backup#>'{cloud,accounts_payable}','[]'::jsonb)) loop
        if item->>'shop_id' <> target_shop::text then raise exception 'Accounts payable tenant validation failed'; end if;
        insert into public.shop_accounts_payable select * from jsonb_populate_record(null::public.shop_accounts_payable,item)
        on conflict(id) do nothing;
        get diagnostics affected=row_count; restored:=restored+affected;
    end loop;
    for item in select value from jsonb_array_elements(coalesce(backup#>'{cloud,requests}','[]'::jsonb)) loop
        if item->>'shop_id' <> target_shop::text then raise exception 'Request tenant validation failed'; end if;
        insert into public.shop_requests select * from jsonb_populate_record(null::public.shop_requests,item)
        on conflict(id) do nothing;
        get diagnostics affected=row_count; restored:=restored+affected;
    end loop;
    for item in select value from jsonb_array_elements(coalesce(backup#>'{cloud,calendar}','[]'::jsonb)) loop
        if item->>'shop_id' <> target_shop::text then raise exception 'Calendar tenant validation failed'; end if;
        insert into public.shop_calendar_events select * from jsonb_populate_record(null::public.shop_calendar_events,item)
        on conflict(id) do nothing;
        get diagnostics affected=row_count; restored:=restored+affected;
    end loop;
    for item in select value from jsonb_array_elements(coalesce(backup#>'{cloud,appointments}','[]'::jsonb)) loop
        if item->>'shop_id' <> target_shop::text then raise exception 'Appointment tenant validation failed'; end if;
        insert into public.shop_appointments select * from jsonb_populate_record(null::public.shop_appointments,item)
        on conflict(id) do nothing;
        get diagnostics affected=row_count; restored:=restored+affected;
    end loop;
    return jsonb_build_object('restored',restored);
end;
$$;

revoke all on function public.restore_shop_data_backup(jsonb) from public;
grant execute on function public.restore_shop_data_backup(jsonb) to authenticated;
