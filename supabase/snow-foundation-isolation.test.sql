-- Run only in a disposable Snow QA project AFTER snow-foundation.sql.
-- Synthetic auth identities and all records are rolled back on success.
begin;

insert into auth.users (id,email) values
('00000000-0000-4000-8000-0000000000a1','snow-owner-a@example.invalid'),
('00000000-0000-4000-8000-0000000000b1','snow-owner-b@example.invalid'),
('00000000-0000-4000-8000-0000000000a2','snow-dispatch-a@example.invalid'),
('00000000-0000-4000-8000-0000000000a3','snow-operator-a@example.invalid'),
('00000000-0000-4000-8000-0000000000a4','snow-inactive-a@example.invalid');

set local role authenticated;
do $$
declare
    owner_a uuid := '00000000-0000-4000-8000-0000000000a1';
    owner_b uuid := '00000000-0000-4000-8000-0000000000b1';
    dispatcher_a uuid := '00000000-0000-4000-8000-0000000000a2';
    operator_a uuid := '00000000-0000-4000-8000-0000000000a3';
    inactive_a uuid := '00000000-0000-4000-8000-0000000000a4';
    ws_a uuid; ws_b uuid; customer_a uuid; customer_b uuid;
    property_a uuid; property_b uuid; route_a uuid;
    event_a uuid; event_a_unassigned uuid; event_b uuid; quote_a uuid;
    n integer;
begin
    perform set_config('request.jwt.claim.sub',owner_a::text,true);
    ws_a := public.snow_create_workspace('Synthetic Snow A');
    perform public.snow_set_member(ws_a,dispatcher_a,'dispatcher',true);
    perform public.snow_set_member(ws_a,operator_a,'operator',true);
    perform public.snow_set_member(ws_a,inactive_a,'operator',false);
    insert into public.snow_customers(workspace_id,name) values(ws_a,'Synthetic Customer A') returning id into customer_a;
    insert into public.snow_properties(workspace_id,customer_id,address,property_type)
        values(ws_a,customer_a,'100 QA Test Lane','Residential') returning id into property_a;
    insert into public.snow_routes(workspace_id,name) values(ws_a,'QA Route A') returning id into route_a;
    insert into public.snow_service_events(workspace_id,property_id,route_id,assigned_user_id,service)
        values(ws_a,property_a,route_a,operator_a,'Plow') returning id into event_a;
    insert into public.snow_service_events(workspace_id,property_id,service)
        values(ws_a,property_a,'Unassigned site check') returning id into event_a_unassigned;
    insert into public.snow_quotes(workspace_id,service_event_id,version,pricing_method,unit_rate,projected_total,agreed_terms)
        values(ws_a,event_a,1,'flat',85,85,'Synthetic $85 visit') returning id into quote_a;

    perform set_config('request.jwt.claim.sub',owner_b::text,true);
    ws_b := public.snow_create_workspace('Synthetic Snow B');
    insert into public.snow_customers(workspace_id,name) values(ws_b,'Synthetic Customer B') returning id into customer_b;
    insert into public.snow_properties(workspace_id,customer_id,address,property_type)
        values(ws_b,customer_b,'200 QA Test Lane','Commercial') returning id into property_b;
    insert into public.snow_service_events(workspace_id,property_id,service)
        values(ws_b,property_b,'Salt') returning id into event_b;
    select count(*) into n from public.snow_service_events;
    if n <> 1 then raise exception 'B saw A event'; end if;
    if exists (select 1 from public.snow_quotes where id=quote_a)
    then raise exception 'B saw A quote'; end if;
    begin
        insert into public.snow_properties(workspace_id,customer_id,address,property_type)
        values(ws_b,customer_a,'Cross-tenant FK','Commercial');
        raise exception 'Cross-tenant customer FK accepted';
    exception when foreign_key_violation then null; end;

    perform set_config('request.jwt.claim.sub',dispatcher_a::text,true);
    select count(*) into n from public.snow_service_events;
    if n <> 2 then raise exception 'Dispatcher event scope: %',n; end if;
    perform public.snow_assign_service(event_a,operator_a,route_a,null,'high');

    perform set_config('request.jwt.claim.sub',operator_a::text,true);
    select count(*) into n from public.snow_service_events;
    if n <> 1 then raise exception 'Operator saw unassigned or cross-workspace event: %',n; end if;
    select count(*) into n from public.snow_customers;
    if n <> 1 then raise exception 'Operator customer scope: %',n; end if;
    select count(*) into n from public.snow_properties;
    if n <> 1 then raise exception 'Operator property scope: %',n; end if;
    select count(*) into n from public.snow_quotes;
    if n <> 1 then raise exception 'Operator quote scope: %',n; end if;
    begin
        update public.snow_service_events set status='Completed' where id=event_a;
        raise exception 'Operator direct event UPDATE accepted';
    exception when insufficient_privilege then null; end;
    begin
        perform public.snow_agree_quote(quote_a);
        raise exception 'Operator quote acceptance allowed';
    exception when raise_exception then
        if SQLERRM <> 'Not authorized' then raise; end if;
    end;
    begin
        perform public.snow_set_member(ws_a,operator_a,'owner',true);
        raise exception 'Operator role escalation allowed';
    exception when raise_exception then
        if SQLERRM <> 'Not authorized' then raise; end if;
    end;
    perform public.snow_record_service(event_a,'Service Started','Synthetic start','Snowing',null,null,null);
    perform public.snow_record_service(event_a,'Completed','Synthetic finish','Snow stopped','Salt',20,'lb');

    perform set_config('request.jwt.claim.sub',inactive_a::text,true);
    select count(*) into n from public.snow_service_events;
    if n <> 0 or public.snow_has_role(ws_a,array['operator'])
    then raise exception 'Inactive member retained access'; end if;

    perform set_config('request.jwt.claim.sub',owner_a::text,true);
    select count(*) into n from public.snow_service_events;
    if n <> 2 or exists (select 1 from public.snow_service_events where id=event_b)
    then raise exception 'A saw B event'; end if;
    begin
        perform public.snow_set_member(ws_a,owner_a,'operator',false);
        raise exception 'Last owner demotion allowed';
    exception when raise_exception then
        if SQLERRM <> 'The last active owner cannot be removed' then raise; end if;
    end;
    perform public.snow_agree_quote(quote_a);
    perform public.snow_mark_ready_to_bill(event_a);
    select count(*) into n from public.snow_event_log where service_event_id=event_a;
    if n < 5 then raise exception 'Missing audit entries: %',n; end if;
    begin
        update public.snow_event_log set action='tampered' where service_event_id=event_a;
        raise exception 'Audit history could be modified';
    exception when insufficient_privilege then null; end;
    begin
        perform public.snow_record_service(event_a,'Scheduled',null,null,null,null,null);
        raise exception 'Billed event reopened';
    exception when raise_exception then
        if SQLERRM <> 'Ready-to-bill service cannot be reopened' then raise; end if;
    end;

    raise notice 'Snow isolation checks passed; all synthetic records roll back.';
end;
$$;
rollback;
