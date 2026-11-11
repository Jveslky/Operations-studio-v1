-- Run only in an isolated QA database after installing both backup v3 candidates.
-- All synthetic rows are rolled back, including the simulated source loss.
begin;
set local statement_timeout='50s';
set local lock_timeout='2s';
do $qa$
declare
 s uuid := gen_random_uuid(); u uuid; part uuid; ro public.shop_repair_orders;
 held_ro uuid; settled_ro uuid; a1 uuid; b text; original jsonb; result jsonb;
 lines jsonb; answer jsonb; totals jsonb; counts jsonb; expected_counts jsonb;
 repeat_result jsonb; bad jsonb; secret bytea; new_id uuid := gen_random_uuid(); denied boolean;
 step text := 'setup';
begin
 select user_id into strict u from public.shop_members where role='owner' and is_active limit 1;
 perform set_config('request.jwt.claim.sub',u::text,true);
 insert into public.shops(id,name,created_by) values(s,'Backup approval rehearsal',u);
 insert into public.shop_members(shop_id,user_id,role) values(s,u,'owner') on conflict(shop_id,user_id) do nothing;
 insert into private.shop_backup_v3_signing_keys(key_id,secret,active)
 select gen_random_uuid(),extensions.gen_random_bytes(32),true
 where not exists(select 1 from private.shop_backup_v3_signing_keys where active);
 begin
  step := 'receive stock';
  answer := public.save_shop_inventory_item(s,gen_random_uuid(),null,null,
    '{"part_number":"QA-RESTORE","description":"Restore fixture","stock_unit":"each","sale_price":25,"reorder_point":0}'::jsonb);
  part := (answer#>>'{item,id}')::uuid;
  perform public.receive_shop_inventory(s,gen_random_uuid(),'{"supplier":"QA","invoice_reference":"QA","delivery_reference":"QA"}',
      jsonb_build_array(jsonb_build_object('item_id',part,'quantity',10,'unit_cost',10)));
  lines := jsonb_build_array(jsonb_build_object('item_id',part,'part_number','QA-RESTORE','description','Restore fixture','stock_unit','each','quantity',2,'unit_price',25));
  for n in 1..2 loop
   step := 'create order '||n;
   insert into public.shop_repair_orders(shop_id,customer_name,unit_name,complaint,estimate_parts_total,estimate_total)
   values(s,'QA restore','QA unit','Synthetic recovery fixture',50,50) returning * into ro;
   update public.shop_repair_orders set stock_lines_expected='[]',estimate_stock_lines=lines where id=ro.id returning * into ro;
   totals := public.shop_estimate_authorization_totals(to_jsonb(ro));
   a1 := gen_random_uuid();
   step := 'initial authorization '||n;
   update public.shop_repair_orders set estimate_approval_status='Approved',approval_request=jsonb_build_object(
      'id',a1,'method','verbal','customer_contact','QA','notes','Synthetic approval',
      'expected_updated_at',ro.updated_at,'expected_version',ro.estimate_version,
      'expected_estimate_total',totals->'total','authorization_relationship','initial')
   where id=ro.id returning * into ro;
   step := 'linked amendment '||n;
   update public.shop_repair_orders set estimate_approval_status='Approved',approval_request=jsonb_build_object(
      'id',gen_random_uuid(),'method','verbal','customer_contact','QA','notes','Synthetic amendment',
      'expected_updated_at',ro.updated_at,'expected_version',ro.estimate_version,
      'expected_estimate_total',totals->'total','authorization_relationship','amendment',
      'related_authorization_id',a1,'relationship_notes','Reconfirm original scope')
   where id=ro.id returning * into ro;
   if n=1 then held_ro:=ro.id;
   else
    settled_ro:=ro.id;
    step := 'settle stocked order';
    perform public.confirm_shop_ro_stock(ro.id,lines);
    update public.shop_repair_orders set status='Ready for Payment' where id=ro.id;
   end if;
  end loop;
  step := 'export';
  b := public.download_shop_data_backup_v3(s);
  original := b::jsonb;
  select to_jsonb(c) into expected_counts from public.shop_stock_counts(s,part) c;
  raise exception using errcode='ZQ001',message='Roll back source fixture';
 exception when sqlstate 'ZQ001' then null;
 end;
 step := 'restore';
 result := public.upload_shop_data_backup_v3(s,b);
 step := 'verify approvals';
 if (select jsonb_agg(to_jsonb(a) order by a.id) from public.shop_estimate_approvals a where shop_id=s)
    is distinct from (select jsonb_agg(a order by a->>'id') from jsonb_array_elements(original#>'{cloud,estimate_approvals}') a)
 then raise exception 'Approval records changed'; end if;
 step := 'verify revisions';
 if exists(select 1 from jsonb_array_elements(original#>'{cloud,repair_orders}') x
   join public.shop_repair_orders r on r.id=(x->>'id')::uuid
   where r.estimate_approval_status is distinct from x->>'estimate_approval_status'
      or r.estimate_version is distinct from (x->>'estimate_version')::integer
      or r.estimate_stock_lines is distinct from x->'estimate_stock_lines') then raise exception 'Restored order revision changed'; end if;
 step := 'verify inventory';
 select to_jsonb(c) into counts from public.shop_stock_counts(s,part) c;
 if counts is distinct from expected_counts then raise exception 'Stock counts changed: % vs %',counts,expected_counts; end if;
 if (select count(*) from public.shop_ro_stock_events where shop_id=s) <> jsonb_array_length(original#>'{cloud,ro_stock_events}') then raise exception 'Stock event count changed'; end if;
 step := 'verify exact stock events';
 if (select jsonb_agg(to_jsonb(e) order by e.id) from public.shop_ro_stock_events e where shop_id=s)
    is distinct from (select jsonb_agg(e order by e->>'id') from jsonb_array_elements(original#>'{cloud,ro_stock_events}') e)
 then raise exception 'Stock event records changed'; end if;
 if exists(select 1 from public.shop_alert_events where shop_id=s and event_type='estimate_approved') then
  raise exception 'Historical approval emitted a new alert';
 end if;
 step := 'repeat restore';
 answer := public.upload_shop_data_backup_v3(s,b);
 if answer->>'restored'<>'0' or answer->>'additional_rows_restored'<>'0' then raise exception 'Repeated restore inserted records'; end if;
 repeat_result := answer;
 step := 'ordinary approval guard';
 denied := false;
 begin
  insert into public.shop_repair_orders(shop_id,customer_name,unit_name,estimate_approval_status)
  values(s,'QA guard','QA unit','Approved');
 exception when others then
  if SQLERRM <> 'Create the repair order before recording approval.' then raise; end if;
  denied := true;
 end;
 if not denied then raise exception 'Ordinary approved insert was allowed'; end if;
 if has_table_privilege('authenticated','private.shop_backup_v3_stock_inserts'::regclass,'INSERT') then
  raise exception 'Authenticated caller can mint restore permits';
 end if;
 step := 'atomic mismatch rollback';
 bad := original;
 select value || jsonb_build_object('id',new_id,'ro_number',null,'legacy_local_id',null,'status','Open','estimate_approval_status','Draft','estimate_stock_lines','[]'::jsonb)
 into answer from jsonb_array_elements(original#>'{cloud,repair_orders}') limit 1;
 bad := jsonb_set(bad,'{cloud,repair_orders}',(bad#>'{cloud,repair_orders}') || answer);
 bad := jsonb_set(bad,'{cloud,estimate_approvals,0,notes}','"Different historical approval"');
 select k.secret into strict secret from private.shop_backup_v3_signing_keys k where key_id::text=bad->>'signing_key_id';
 bad := (bad-'signature') || jsonb_build_object('signature',private.shop_backup_v3_mac(bad-'signature',secret));
 denied := false;
 begin
  perform public.upload_shop_data_backup_v3(s,bad::text);
 exception when others then
  if SQLERRM <> 'Existing record differs in backup dataset: estimate_approvals' then raise; end if;
  denied := true;
 end;
 if not denied or exists(select 1 from public.shop_repair_orders where id=new_id)
    or exists(select 1 from private.shop_backup_v3_stock_inserts where transaction_id=txid_current() and shop_id=s) then
  raise exception 'Mismatched history failed to roll back';
 end if;
 step := 'signature tamper';
 denied := false;
 begin
  perform public.upload_shop_data_backup_v3(s,jsonb_set(original,'{cloud,estimate_approvals,0,notes}','"Tampered"')::text);
 exception when others then
  if SQLERRM <> 'Backup signature could not be verified' then raise; end if;
  denied := true;
 end;
 if not denied then raise exception 'Unsigned change accepted'; end if;
 perform set_config('qa.backup_result',jsonb_build_object('first',result,'repeat',repeat_result,'stock',counts,'approvals',4)::text,true);
exception when query_canceled or others then
 perform set_config('qa.backup_result',step||': '||SQLSTATE||': '||SQLERRM,true);
end $qa$;
select current_setting('qa.backup_result') as result;

rollback;
