-- TEST ONLY: guvzuufdmnvurshknsnq. Install after existing inspection/role migrations.
begin;
do $$ begin
 if not exists(select 1 from public.shops where id='ddd8d44c-041f-4510-aa8b-a03b2dde87a6') or not exists(select 1 from public.shops where id='1161bc88-9ed5-4d76-a2cf-c7a77d41eea9') or exists(select 1 from public.shops where id not in ('ddd8d44c-041f-4510-aa8b-a03b2dde87a6','1161bc88-9ed5-4d76-a2cf-c7a77d41eea9')) then raise exception 'STOP: expected only Long Shift Shop Test A/B'; end if;
end $$;
-- Apply after shop-appointments.sql and shop-user-permissions.sql.
-- Recovery v3: inspection snapshots, templates and media metadata; v2 remains supported.

create or replace function public.restore_shop_data_backup(backup jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
    target_shop uuid;
    item jsonb;
    restored integer := 0;
    affected integer := 0;
    existing_shop uuid;
begin
    if backup->>'format' is distinct from 'track-right-shop-backup'
       or coalesce((backup->>'version')::integer,0) not in (2,3) then
        raise exception 'Unsupported Track Right Shop backup';
    end if;
    target_shop := (backup->>'source_shop_id')::uuid;
    if not public.shop_has_permission(target_shop,'data.import') then
        raise exception 'Data-import permission is required';
    end if;
    for item in select value from jsonb_array_elements(coalesce(backup#>'{cloud,customers}','[]'::jsonb)) loop
        if item->>'shop_id' is distinct from target_shop::text then raise exception 'Customer tenant validation failed'; end if;
        insert into public."Customers" select * from jsonb_populate_record(null::public."Customers",item)
        on conflict(id) do nothing;
        get diagnostics affected=row_count; restored:=restored+affected;
    end loop;
    for item in select value from jsonb_array_elements(coalesce(backup#>'{cloud,units}','[]'::jsonb)) loop
        if item->>'shop_id' is distinct from target_shop::text then raise exception 'Unit tenant validation failed'; end if;
        insert into public.customer_units select * from jsonb_populate_record(null::public.customer_units,item)
        on conflict(id) do nothing;
        get diagnostics affected=row_count; restored:=restored+affected;
    end loop;
    for item in select value from jsonb_array_elements(coalesce(backup#>'{cloud,repair_orders}','[]'::jsonb)) loop
        if item->>'shop_id' is distinct from target_shop::text then raise exception 'Repair order tenant validation failed'; end if;
        insert into public.shop_repair_orders select * from jsonb_populate_record(null::public.shop_repair_orders,item)
        on conflict(id) do nothing;
        get diagnostics affected=row_count; restored:=restored+affected;
    end loop;
    for item in select value from jsonb_array_elements(coalesce(backup#>'{cloud,invoices}','[]'::jsonb)) loop
        if item->>'shop_id' is distinct from target_shop::text then raise exception 'Invoice tenant validation failed'; end if;
        insert into public.shop_invoices select * from jsonb_populate_record(null::public.shop_invoices,item)
        on conflict(id) do nothing;
        get diagnostics affected=row_count; restored:=restored+affected;
    end loop;
    for item in select value from jsonb_array_elements(coalesce(backup#>'{cloud,accounts_payable}','[]'::jsonb)) loop
        if item->>'shop_id' is distinct from target_shop::text then raise exception 'Accounts payable tenant validation failed'; end if;
        insert into public.shop_accounts_payable select * from jsonb_populate_record(null::public.shop_accounts_payable,item)
        on conflict(id) do nothing;
        get diagnostics affected=row_count; restored:=restored+affected;
    end loop;
    for item in select value from jsonb_array_elements(coalesce(backup#>'{cloud,requests}','[]'::jsonb)) loop
        if item->>'shop_id' is distinct from target_shop::text then raise exception 'Request tenant validation failed'; end if;
        insert into public.shop_requests select * from jsonb_populate_record(null::public.shop_requests,item)
        on conflict(id) do nothing;
        get diagnostics affected=row_count; restored:=restored+affected;
    end loop;
    for item in select value from jsonb_array_elements(coalesce(backup#>'{cloud,calendar}','[]'::jsonb)) loop
        if item->>'shop_id' is distinct from target_shop::text then raise exception 'Calendar tenant validation failed'; end if;
        insert into public.shop_calendar_events select * from jsonb_populate_record(null::public.shop_calendar_events,item)
        on conflict(id) do nothing;
        get diagnostics affected=row_count; restored:=restored+affected;
    end loop;
    for item in select value from jsonb_array_elements(coalesce(backup#>'{cloud,appointments}','[]'::jsonb)) loop
        if item->>'shop_id' is distinct from target_shop::text then raise exception 'Appointment tenant validation failed'; end if;
        insert into public.shop_appointments select * from jsonb_populate_record(null::public.shop_appointments,item)
        on conflict(id) do nothing;
        get diagnostics affected=row_count; restored:=restored+affected;
    end loop;

    for item in select value from jsonb_array_elements(coalesce(backup#>'{cloud,response_sets}','[]'::jsonb)) loop
        if item->>'shop_id' is distinct from target_shop::text then raise exception 'Recovery tenant validation failed: response_sets'; end if;
        select shop_id into existing_shop from public.shop_inspection_response_sets where id=(item->>'id')::uuid;
        if found and existing_shop is distinct from target_shop then raise exception 'Recovery ID belongs to another shop'; end if;
        insert into public.shop_inspection_response_sets select * from jsonb_populate_record(null::public.shop_inspection_response_sets,item) on conflict(id) do nothing;
        get diagnostics affected=row_count; restored:=restored+affected;
    end loop;

    for item in select value from jsonb_array_elements(coalesce(backup#>'{cloud,response_options}','[]'::jsonb)) loop
        if item->>'shop_id' is distinct from target_shop::text then raise exception 'Recovery tenant validation failed: response_options'; end if;
        select shop_id into existing_shop from public.shop_inspection_response_options where id=(item->>'id')::uuid;
        if found and existing_shop is distinct from target_shop then raise exception 'Recovery ID belongs to another shop'; end if;
        if item->>'response_set_id' is not null and not exists(select 1 from public.shop_inspection_response_sets where id=(item->>'response_set_id')::uuid and shop_id=target_shop) then raise exception 'Recovery parent belongs to another shop or is missing: response_set_id'; end if;
        insert into public.shop_inspection_response_options select * from jsonb_populate_record(null::public.shop_inspection_response_options,item) on conflict(id) do nothing;
        get diagnostics affected=row_count; restored:=restored+affected;
    end loop;

    for item in select value from jsonb_array_elements(coalesce(backup#>'{cloud,inspection_templates}','[]'::jsonb)) loop
        if item->>'shop_id' is distinct from target_shop::text then raise exception 'Recovery tenant validation failed: inspection_templates'; end if;
        select shop_id into existing_shop from public.shop_inspection_templates where id=(item->>'id')::uuid;
        if found and existing_shop is distinct from target_shop then raise exception 'Recovery ID belongs to another shop'; end if;
        insert into public.shop_inspection_templates select * from jsonb_populate_record(null::public.shop_inspection_templates,item) on conflict(id) do nothing;
        get diagnostics affected=row_count; restored:=restored+affected;
    end loop;

    for item in select value from jsonb_array_elements(coalesce(backup#>'{cloud,template_sections}','[]'::jsonb)) loop
        if item->>'shop_id' is distinct from target_shop::text then raise exception 'Recovery tenant validation failed: template_sections'; end if;
        select shop_id into existing_shop from public.shop_inspection_template_sections where id=(item->>'id')::uuid;
        if found and existing_shop is distinct from target_shop then raise exception 'Recovery ID belongs to another shop'; end if;
        if item->>'template_id' is not null and not exists(select 1 from public.shop_inspection_templates where id=(item->>'template_id')::uuid and shop_id=target_shop) then raise exception 'Recovery parent belongs to another shop or is missing: template_id'; end if;
        insert into public.shop_inspection_template_sections select * from jsonb_populate_record(null::public.shop_inspection_template_sections,item) on conflict(id) do nothing;
        get diagnostics affected=row_count; restored:=restored+affected;
    end loop;

    for item in select value from jsonb_array_elements(coalesce(backup#>'{cloud,template_items}','[]'::jsonb)) loop
        if item->>'shop_id' is distinct from target_shop::text then raise exception 'Recovery tenant validation failed: template_items'; end if;
        select shop_id into existing_shop from public.shop_inspection_template_items where id=(item->>'id')::uuid;
        if found and existing_shop is distinct from target_shop then raise exception 'Recovery ID belongs to another shop'; end if;
        if item->>'template_id' is not null and not exists(select 1 from public.shop_inspection_templates where id=(item->>'template_id')::uuid and shop_id=target_shop) then raise exception 'Recovery parent belongs to another shop or is missing: template_id'; end if;
        if item->>'section_id' is not null and not exists(select 1 from public.shop_inspection_template_sections where id=(item->>'section_id')::uuid and shop_id=target_shop) then raise exception 'Recovery parent belongs to another shop or is missing: section_id'; end if;
        if item->>'response_set_id' is not null and not exists(select 1 from public.shop_inspection_response_sets where id=(item->>'response_set_id')::uuid and shop_id=target_shop) then raise exception 'Recovery parent belongs to another shop or is missing: response_set_id'; end if;
        if not exists(select 1 from public.shop_inspection_template_sections where id=(item->>'section_id')::uuid and template_id=(item->>'template_id')::uuid and shop_id=target_shop) then raise exception 'Recovery template section mismatch'; end if;
        insert into public.shop_inspection_template_items select * from jsonb_populate_record(null::public.shop_inspection_template_items,item) on conflict(id) do nothing;
        get diagnostics affected=row_count; restored:=restored+affected;
    end loop;

    for item in select value from jsonb_array_elements(coalesce(backup#>'{cloud,inspections}','[]'::jsonb)) loop
        if item->>'shop_id' is distinct from target_shop::text then raise exception 'Recovery tenant validation failed: inspections'; end if;
        select shop_id into existing_shop from public.shop_inspections where id=(item->>'id')::uuid;
        if found and existing_shop is distinct from target_shop then raise exception 'Recovery ID belongs to another shop'; end if;
        if item->>'template_id' is not null and not exists(select 1 from public.shop_inspection_templates where id=(item->>'template_id')::uuid and shop_id=target_shop) then raise exception 'Recovery parent belongs to another shop or is missing: template_id'; end if;
        if not exists(select 1 from public.shop_repair_orders where shop_id=target_shop and (id::text=item->>'repair_order_id' or ro_number::text=item->>'repair_order_id')) then raise exception 'Recovery repair order missing in this shop'; end if;
        insert into public.shop_inspections select * from jsonb_populate_record(null::public.shop_inspections,item) on conflict(id) do nothing;
        get diagnostics affected=row_count; restored:=restored+affected;
    end loop;

    for item in select value from jsonb_array_elements(coalesce(backup#>'{cloud,inspection_items}','[]'::jsonb)) loop
        if item->>'shop_id' is distinct from target_shop::text then raise exception 'Recovery tenant validation failed: inspection_items'; end if;
        select shop_id into existing_shop from public.shop_inspection_items where id=(item->>'id')::uuid;
        if found and existing_shop is distinct from target_shop then raise exception 'Recovery ID belongs to another shop'; end if;
        if item->>'inspection_id' is not null and not exists(select 1 from public.shop_inspections where id=(item->>'inspection_id')::uuid and shop_id=target_shop) then raise exception 'Recovery parent belongs to another shop or is missing: inspection_id'; end if;
        if item->>'template_item_id' is not null and not exists(select 1 from public.shop_inspection_template_items where id=(item->>'template_item_id')::uuid and shop_id=target_shop) then raise exception 'Recovery parent belongs to another shop or is missing: template_item_id'; end if;
        insert into public.shop_inspection_items select * from jsonb_populate_record(null::public.shop_inspection_items,item) on conflict(id) do nothing;
        get diagnostics affected=row_count; restored:=restored+affected;
    end loop;

    for item in select value from jsonb_array_elements(coalesce(backup#>'{cloud,ro_media}','[]'::jsonb)) loop
        if item->>'shop_id' is distinct from target_shop::text then raise exception 'Recovery tenant validation failed: ro_media'; end if;
        select shop_id into existing_shop from public.shop_ro_media where id=(item->>'id')::uuid;
        if found and existing_shop is distinct from target_shop then raise exception 'Recovery ID belongs to another shop'; end if;
        if item->>'inspection_id' is not null and not exists(select 1 from public.shop_inspections where id=(item->>'inspection_id')::uuid and shop_id=target_shop) then raise exception 'Recovery parent belongs to another shop or is missing: inspection_id'; end if;
        if item->>'inspection_item_id' is not null and not exists(select 1 from public.shop_inspection_items where id=(item->>'inspection_item_id')::uuid and shop_id=target_shop) then raise exception 'Recovery parent belongs to another shop or is missing: inspection_item_id'; end if;
        if not exists(select 1 from public.shop_repair_orders where shop_id=target_shop and (id::text=item->>'repair_order_id' or ro_number::text=item->>'repair_order_id')) then raise exception 'Recovery repair order missing in this shop'; end if;
        if split_part(item->>'object_path','/',1) is distinct from target_shop::text
           or split_part(item->>'object_path','/',2) is distinct from regexp_replace(item->>'repair_order_id','[^a-zA-Z0-9_-]','_','g')
           or array_length(string_to_array(item->>'object_path','/'),1) is distinct from 3
           or split_part(item->>'object_path','/',3) in ('','.','..') then raise exception 'Recovery media path mismatch'; end if;
        insert into public.shop_ro_media select * from jsonb_populate_record(null::public.shop_ro_media,item) on conflict(id) do nothing;
        get diagnostics affected=row_count; restored:=restored+affected;
    end loop;
    return jsonb_build_object('restored',restored);
end;
$$;

revoke all on function public.restore_shop_data_backup(jsonb) from public;
grant execute on function public.restore_shop_data_backup(jsonb) to authenticated;

commit;
