begin;
alter table public.shop_invoices add column if not exists paid_total numeric(12,2) not null default 0;
alter table public.shop_invoices add column if not exists balance_due numeric(12,2) not null default 0;
create table if not exists public.shop_invoice_payments (
 id uuid primary key default gen_random_uuid(), shop_id uuid not null references public.shops(id),
 invoice_id uuid not null references public.shop_invoices(id), request_id uuid not null unique,
 amount numeric(12,2) not null check(amount<>0), method text not null,
 payment_date date not null, reference text not null default '', notes text not null default '',
 reverses_id uuid unique references public.shop_invoice_payments(id),
 recorded_by uuid references auth.users(id), recorded_by_email text not null default '', recorded_at timestamptz not null default now(),
 check((reverses_id is null and amount>0) or (reverses_id is not null and amount<0))
);
alter table public.shop_invoice_payments add column if not exists restored_from_backup boolean not null default false;
alter table public.shop_invoice_payments add column if not exists restored_by uuid references auth.users(id);
alter table public.shop_invoice_payments add column if not exists restored_at timestamptz;
create index if not exists shop_payment_invoice_idx on public.shop_invoice_payments(shop_id,invoice_id,recorded_at,id);
-- Preserve prior settled invoices honestly: method/date/actor may not have been recorded.
insert into public.shop_invoice_payments(shop_id,invoice_id,request_id,amount,method,payment_date,notes)
select shop_id,id,id,total,'legacy',(coalesce(paid_at,created_at))::date,'Previously marked paid; payment method and collecting staff were not recorded.'
from public.shop_invoices i where status='Paid' and total>0 and not exists(select 1 from public.shop_invoice_payments p where p.invoice_id=i.id);
update public.shop_invoices i set paid_total=coalesce((select sum(amount) from public.shop_invoice_payments p where p.invoice_id=i.id),0),
 balance_due=greatest(total-coalesce((select sum(amount) from public.shop_invoice_payments p where p.invoice_id=i.id),0),0);
create table if not exists public.shop_payment_ro_events (
 id uuid primary key default gen_random_uuid(), shop_id uuid not null references public.shops(id),
 repair_order_id uuid not null references public.shop_repair_orders(id), invoice_id uuid not null references public.shop_invoices(id),
 previous_status text not null, new_status text not null, reason text not null,
 recorded_by uuid references auth.users(id), recorded_at timestamptz not null default now()
);
alter table public.shop_payment_ro_events add column if not exists restored_from_backup boolean not null default false;
alter table public.shop_payment_ro_events add column if not exists restored_by uuid references auth.users(id);
alter table public.shop_payment_ro_events add column if not exists restored_at timestamptz;
alter table public.shop_invoice_payments enable row level security;
alter table public.shop_payment_ro_events enable row level security;
drop policy if exists "office reads payments" on public.shop_invoice_payments;
create policy "office reads payments" on public.shop_invoice_payments for select to authenticated using(public.has_shop_role(shop_id,array['owner','admin','service_writer']));
drop policy if exists "office reads payment RO events" on public.shop_payment_ro_events;
create policy "office reads payment RO events" on public.shop_payment_ro_events for select to authenticated using(public.has_shop_role(shop_id,array['owner','admin','service_writer']));
revoke all on public.shop_invoice_payments,public.shop_payment_ro_events from authenticated;
grant select on public.shop_invoice_payments,public.shop_payment_ro_events to authenticated;
create or replace function public.immutable_shop_payment() returns trigger language plpgsql as $$
begin raise exception 'Payment history is immutable. Record a reversal instead.'; end $$;
drop trigger if exists immutable_shop_payment on public.shop_invoice_payments;
create trigger immutable_shop_payment before update or delete on public.shop_invoice_payments for each row execute function public.immutable_shop_payment();
drop trigger if exists immutable_shop_payment_event on public.shop_payment_ro_events;
create trigger immutable_shop_payment_event before update or delete on public.shop_payment_ro_events for each row execute function public.immutable_shop_payment();

create or replace function public.shop_payment_finance_guard() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare paid numeric;
begin
 select coalesce(sum(amount),0) into paid from public.shop_invoice_payments where invoice_id=new.id;
 new.paid_total=paid; new.balance_due=greatest(new.total-paid,0);
 if new.status='Paid' and new.balance_due>0 then raise exception 'Record payment to settle this invoice.'; end if;
 if paid>0 and new.status='Draft' then raise exception 'An invoice with payments cannot become a draft.'; end if;
 if new.status in ('Sent','Paid') then
  if new.balance_due=0 then
   new.status='Paid';
   new.paid_at=coalesce(new.paid_at,now());
  else new.status='Sent'; new.paid_at=null; end if;
 end if;
 return new;
end $$;
drop trigger if exists z_shop_payment_finance on public.shop_invoices;
create trigger z_shop_payment_finance before insert or update on public.shop_invoices for each row execute function public.shop_payment_finance_guard();

create or replace function public.shop_paid_pickup_transition() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.status='Paid' and new.repair_order_id is not null then
  update public.shop_repair_orders set status='Ready for Pickup' where id=new.repair_order_id and shop_id=new.shop_id and archived is not true and status='Ready for Payment';
 end if;
 return new;
end $$;
drop trigger if exists shop_paid_pickup_transition on public.shop_invoices;
create trigger shop_paid_pickup_transition after insert or update on public.shop_invoices for each row execute function public.shop_paid_pickup_transition();
create or replace function public.shop_finished_paid_pickup() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.status='Ready for Payment' and old.status<>'Complete' and exists(select 1 from public.shop_invoices where repair_order_id=new.id and shop_id=new.shop_id and status='Paid' and balance_due=0) then new.status='Ready for Pickup'; end if;
 return new;
end $$;
drop trigger if exists z_shop_finished_paid_pickup on public.shop_repair_orders;
create trigger z_shop_finished_paid_pickup before update on public.shop_repair_orders for each row execute function public.shop_finished_paid_pickup();
create or replace function public.shop_pickup_audit() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.status='Ready for Pickup' and old.status<>new.status then
  insert into public.shop_payment_ro_events(shop_id,repair_order_id,invoice_id,previous_status,new_status,reason,recorded_by)
  select new.shop_id,new.id,i.id,old.status,new.status,'Work finished and invoice fully paid',auth.uid()
  from public.shop_invoices i where i.repair_order_id=new.id and i.shop_id=new.shop_id and i.status='Paid' and i.balance_due=0;
 end if; return new;
end $$;
drop trigger if exists shop_pickup_audit on public.shop_repair_orders;
create trigger shop_pickup_audit after update on public.shop_repair_orders for each row execute function public.shop_pickup_audit();

create or replace function public.record_shop_invoice_payment(p_invoice uuid,p_request uuid,p_amount numeric,p_method text,p_date date,p_reference text default '',p_notes text default '')
returns public.shop_invoices language plpgsql security definer set search_path=public,pg_temp as $$
declare i public.shop_invoices; prior public.shop_invoice_payments;
begin
 select * into i from public.shop_invoices where id=p_invoice for update;
 if i.id is null or not public.has_shop_role(i.shop_id,array['owner','admin','service_writer']) then raise exception 'Your role cannot record payments for this invoice.'; end if;
 if p_request is null or p_amount is null or p_amount<=0 or p_amount<>round(p_amount,2) or p_amount>9999999999.99 or p_date is null or p_date>current_date or p_method is null or p_method not in ('cash','card','check','bank_transfer','other') or length(coalesce(p_reference,''))>200 or length(coalesce(p_notes,''))>2000 then raise exception 'Enter a positive payment with two decimal places, a valid method and a date no later than today.'; end if;
 select * into prior from public.shop_invoice_payments where request_id=p_request;
 if prior.id is not null then
  if prior.invoice_id=p_invoice and prior.amount=p_amount and prior.method=p_method and prior.payment_date=p_date and prior.reference=coalesce(p_reference,'') and prior.notes=coalesce(p_notes,'') and prior.reverses_id is null then return i; end if;
  raise exception 'This payment request was already used for different details.';
 end if;
 if i.status<>'Sent' then raise exception 'Only sent invoices with a remaining balance accept payments.'; end if;
 if p_amount>i.balance_due then raise exception 'Payment exceeds the remaining balance. Refresh the invoice.'; end if;
 insert into public.shop_invoice_payments(shop_id,invoice_id,request_id,amount,method,payment_date,reference,notes,recorded_by,recorded_by_email)
 values(i.shop_id,i.id,p_request,p_amount,p_method,p_date,coalesce(p_reference,''),coalesce(p_notes,''),auth.uid(),coalesce((select email from auth.users where id=auth.uid()),''));
 update public.shop_invoices set status='Sent' where id=i.id returning * into i; return i;
end $$;
create or replace function public.reverse_shop_invoice_payment(p_payment uuid,p_request uuid,p_reason text)
returns public.shop_invoices language plpgsql security definer set search_path=public,pg_temp as $$
declare i public.shop_invoices; original public.shop_invoice_payments; prior public.shop_invoice_payments;
begin
 select * into original from public.shop_invoice_payments where id=p_payment;
 if original.id is null or not public.has_shop_role(original.shop_id,array['owner','admin','service_writer']) then raise exception 'Your role cannot reverse this payment.'; end if;
 select * into i from public.shop_invoices where id=original.invoice_id for update;
 if p_request is null or length(trim(coalesce(p_reason,'')))=0 or length(p_reason)>2000 then raise exception 'Enter a reason for the reversal.'; end if;
 select * into prior from public.shop_invoice_payments where request_id=p_request;
 if prior.id is not null then
  if prior.reverses_id=p_payment and prior.notes=trim(p_reason) then return i; end if;
  raise exception 'This reversal request was already used.';
 end if;
 if original.reverses_id is not null or exists(select 1 from public.shop_invoice_payments where reverses_id=p_payment) then raise exception 'This entry is already reversed or is a reversal.'; end if;
 insert into public.shop_invoice_payments(shop_id,invoice_id,request_id,amount,method,payment_date,notes,reverses_id,recorded_by,recorded_by_email)
 values(original.shop_id,i.id,p_request,-original.amount,original.method,current_date,trim(p_reason),original.id,auth.uid(),coalesce((select email from auth.users where id=auth.uid()),''));
 update public.shop_invoices set status='Sent',paid_at=null where id=i.id returning * into i; return i;
end $$;
create or replace function public.shop_invoice_payment_history(p_invoice uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare i public.shop_invoices;
begin
 select * into i from public.shop_invoices where id=p_invoice;
 if i.id is null or not public.has_shop_role(i.shop_id,array['owner','admin','service_writer']) then raise exception 'Your role cannot view this payment history.'; end if;
 return jsonb_build_object('invoice',to_jsonb(i),'entries',coalesce((select jsonb_agg(to_jsonb(p) order by recorded_at,id) from public.shop_invoice_payments p where invoice_id=i.id),'[]'::jsonb),
 'events',coalesce((select jsonb_agg(to_jsonb(e) order by recorded_at,id) from public.shop_payment_ro_events e where invoice_id=i.id),'[]'::jsonb));
end $$;
revoke all on function public.record_shop_invoice_payment(uuid,uuid,numeric,text,date,text,text),public.reverse_shop_invoice_payment(uuid,uuid,text),public.shop_invoice_payment_history(uuid) from public;
grant execute on function public.record_shop_invoice_payment(uuid,uuid,numeric,text,date,text,text),public.reverse_shop_invoice_payment(uuid,uuid,text),public.shop_invoice_payment_history(uuid) to authenticated;

-- Keep customer directory/history A/R on the same authoritative remaining balance.
create or replace function public.shop_customer_directory(p_shop uuid,p_search text default '',p_page integer default 0,p_size integer default 10)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare result jsonb; needle text := lower(trim(coalesce(p_search,''))); digits text := regexp_replace(coalesce(p_search,''),'[^0-9]','','g');
begin
 if not public.has_shop_role(p_shop,array['owner','admin','service_writer']) then raise exception 'Your role cannot open the customer desk.'; end if;
 if p_page is null or p_page<0 or p_page>100000 or p_size is null or p_size<1 or p_size>50 or length(needle)>200 then raise exception 'Invalid customer search or page.'; end if;
 with matched as (
  select c.id,c.name,c.contact_name,c.phone,c.email,c.created_at from public."Customers" c
  where c.shop_id=p_shop and c.archived is not true and (
   needle='' or strpos(lower(concat_ws(' ',c.name,c.contact_name,c.phone,c.email)),needle)>0
   or (length(digits)>=3 and needle !~ '[a-z]' and strpos(regexp_replace(coalesce(c.phone,''),'[^0-9]','','g'),digits)>0)
   or exists(select 1 from public.customer_units u where u.shop_id=p_shop and u.customer_id=c.id and u.archived is not true
     and strpos(lower(concat_ws(' ',u.name,u.year,u.make,u.model,u.serial)),needle)>0)
  )
 ), page_rows as (select * from matched order by created_at desc nulls last,id limit p_size offset p_page*p_size)
 select jsonb_build_object(
  'count',(select count(*) from matched),
  'summary',jsonb_build_object(
   'customers',(select count(*) from public."Customers" where shop_id=p_shop and archived is not true),
   'vehicles',(select count(*) from public.customer_units where shop_id=p_shop and archived is not true),
   'open_orders',(select count(*) from public.shop_repair_orders where shop_id=p_shop and archived is not true and status not in ('Complete','Closed','Paid')),
   'balance',coalesce((select sum(balance_due) from public.shop_invoices where shop_id=p_shop and status='Sent'),0)),
  'rows',coalesce((select jsonb_agg(to_jsonb(c)||jsonb_build_object(
   'vehicles',(select count(*) from public.customer_units u where u.shop_id=p_shop and u.customer_id=c.id and u.archived is not true),
   'open_orders',(select count(*) from public.shop_repair_orders r where r.shop_id=p_shop and r.customer_id=c.id::text and r.archived is not true and r.status not in ('Complete','Closed','Paid')),
   'balance',coalesce((select sum(i.balance_due) from public.shop_invoices i where i.shop_id=p_shop and i.customer_id=c.id::text and i.status='Sent'),0)
  ) order by c.created_at desc nulls last,c.id) from page_rows c),'[]'::jsonb)
 ) into result;
 return result;
end $$;

create or replace function public.shop_customer_activity(p_shop uuid,p_customer text,p_orders_page integer default 0,p_invoices_page integer default 0)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if not public.has_shop_role(p_shop,array['owner','admin','service_writer']) then raise exception 'Your role cannot view customer financial history.'; end if;
 if p_orders_page is null or p_orders_page<0 or p_orders_page>100000 or p_invoices_page is null or p_invoices_page<0 or p_invoices_page>100000 then raise exception 'Invalid history page.'; end if;
 if not exists(select 1 from public."Customers" where shop_id=p_shop and id::text=p_customer and archived is not true) then raise exception 'Customer not found in this shop.'; end if;
 return jsonb_build_object(
  'orders_count',(select count(*) from public.shop_repair_orders where shop_id=p_shop and customer_id=p_customer and archived is not true),
  'invoices_count',(select count(*) from public.shop_invoices where shop_id=p_shop and customer_id=p_customer),
  'balance',coalesce((select sum(balance_due) from public.shop_invoices where shop_id=p_shop and customer_id=p_customer and status='Sent'),0),
  'orders',coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc,r.id) from (
   select ro_number,legacy_local_id,id,status,unit_name,complaint,created_at from public.shop_repair_orders where shop_id=p_shop and customer_id=p_customer and archived is not true order by created_at desc,id limit 25 offset p_orders_page*25
  )r),'[]'::jsonb),
  'invoices',coalesce((select jsonb_agg(to_jsonb(i) order by i.created_at desc,i.id) from (
   select invoice_number,legacy_local_id,id,status,total,paid_total,balance_due,due_date,paid_at,created_at from public.shop_invoices where shop_id=p_shop and customer_id=p_customer order by created_at desc,id limit 25 offset p_invoices_page*25
  )i),'[]'::jsonb)
 );
end $$;
revoke all on function public.shop_customer_directory(uuid,text,integer,integer) from public;
revoke all on function public.shop_customer_activity(uuid,text,integer,integer) from public;
grant execute on function public.shop_customer_directory(uuid,text,integer,integer) to authenticated;
grant execute on function public.shop_customer_activity(uuid,text,integer,integer) to authenticated;

create or replace function public.restore_shop_data_backup(backup jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
    target_shop uuid;
    item jsonb;
    restored integer := 0;
    affected integer := 0;
    payment public.shop_invoice_payments;
    original public.shop_invoice_payments;
    existing public.shop_invoice_payments;
    invoice_item jsonb;
    event public.shop_payment_ro_events;
    existing_event public.shop_payment_ro_events;
begin
    if backup->>'format' <> 'track-right-shop-backup'
       or coalesce((backup->>'version')::integer,0) <> 2 then
        raise exception 'Unsupported Track Right Shop backup';
    end if;
    target_shop := (backup->>'source_shop_id')::uuid;
    if not public.shop_has_permission(target_shop,'data.import') then
        raise exception 'Data-import permission is required';
    end if;
    if backup->'cloud' ? 'payments' then
        for invoice_item in select value from jsonb_array_elements(coalesce(backup#>'{cloud,invoices}','[]'::jsonb)) loop
            if coalesce((invoice_item->>'paid_total')::numeric,0) is distinct from
               (select coalesce(sum((value->>'amount')::numeric),0) from jsonb_array_elements(backup#>'{cloud,payments}') where value->>'invoice_id'=invoice_item->>'id') then
                raise exception 'Backup payment history does not match invoice paid total';
            end if;
        end loop;
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
        insert into public.shop_invoices select * from jsonb_populate_record(null::public.shop_invoices,case when item->>'status'='Paid' then jsonb_set(item,'{status}','"Sent"'::jsonb) else item end)
        on conflict(id) do nothing;
        get diagnostics affected=row_count; restored:=restored+affected;
        if affected=1 and item->>'status'='Paid' and not (backup->'cloud' ? 'payments') and (item->>'total')::numeric>0 then
            insert into public.shop_invoice_payments(shop_id,invoice_id,request_id,amount,method,payment_date,notes,restored_from_backup,restored_by,restored_at)
            values(target_shop,(item->>'id')::uuid,gen_random_uuid(),(item->>'total')::numeric,'legacy',coalesce((item->>'paid_at')::timestamptz,(item->>'created_at')::timestamptz)::date,'Restored pre-ledger Paid invoice; original payment method/staff were not recorded.',true,auth.uid(),now());
        end if;
    end loop;
    for item in select value from jsonb_array_elements(coalesce(backup#>'{cloud,payments}','[]'::jsonb)) order by (value->>'reverses_id') is not null,(value->>'recorded_at')::timestamptz loop
        payment:=jsonb_populate_record(null::public.shop_invoice_payments,item);
        if not exists(select 1 from jsonb_array_elements(coalesce(backup#>'{cloud,invoices}','[]'::jsonb)) where value->>'id'=payment.invoice_id::text) then raise exception 'Backup payment invoice is missing'; end if;
        if payment.shop_id is distinct from target_shop or not exists(select 1 from public.shop_invoices where id=payment.invoice_id and shop_id=target_shop) then raise exception 'Payment tenant validation failed'; end if;
        if payment.method not in ('cash','card','check','bank_transfer','other','legacy') then raise exception 'Invalid backup payment method'; end if;
        if payment.reverses_id is not null then
            select * into original from public.shop_invoice_payments where id=payment.reverses_id;
            if original.id is null or original.invoice_id<>payment.invoice_id or original.shop_id<>target_shop or original.amount<>-payment.amount or original.reverses_id is not null then raise exception 'Invalid backup reversal'; end if;
        end if;
        select * into existing from public.shop_invoice_payments where id=payment.id;
        if existing.id is not null then
            if (to_jsonb(existing)-array['restored_from_backup','restored_by','restored_at']) is distinct from (to_jsonb(payment)-array['restored_from_backup','restored_by','restored_at']) then raise exception 'Existing payment audit differs from backup'; end if;
        else
            payment.restored_from_backup:=true;payment.restored_by:=auth.uid();payment.restored_at:=now();
            insert into public.shop_invoice_payments select payment.*;
            restored:=restored+1;
        end if;
    end loop;
    for invoice_item in select value from jsonb_array_elements(coalesce(backup#>'{cloud,invoices}','[]'::jsonb)) loop
        if exists(select 1 from public.shop_invoice_payments where invoice_id=(invoice_item->>'id')::uuid having sum(amount)<0 or sum(amount)>(select total from public.shop_invoices where id=(invoice_item->>'id')::uuid)) then raise exception 'Backup payments exceed invoice balance'; end if;
        update public.shop_invoices set status=status where id=(invoice_item->>'id')::uuid and shop_id=target_shop;
        if coalesce((invoice_item->>'paid_total')::numeric,0)>0 and not exists(select 1 from public.shop_invoice_payments where invoice_id=(invoice_item->>'id')::uuid) then raise exception 'Backup is missing payment history'; end if;
    end loop;
    for item in select value from jsonb_array_elements(coalesce(backup#>'{cloud,payment_ro_events}','[]'::jsonb)) loop
        event:=jsonb_populate_record(null::public.shop_payment_ro_events,item);
        if event.shop_id is distinct from target_shop or not exists(select 1 from public.shop_invoices where id=event.invoice_id and shop_id=target_shop and repair_order_id=event.repair_order_id) then raise exception 'Payment event tenant validation failed'; end if;
        select * into existing_event from public.shop_payment_ro_events where id=event.id;
        if existing_event.id is not null then
            if (to_jsonb(existing_event)-array['restored_from_backup','restored_by','restored_at']) is distinct from (to_jsonb(event)-array['restored_from_backup','restored_by','restored_at']) then raise exception 'Existing payment event audit differs from backup'; end if;
        else
            event.restored_from_backup:=true;event.restored_by:=auth.uid();event.restored_at:=now();
            insert into public.shop_payment_ro_events select event.*;
            restored:=restored+1;
        end if;
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

notify pgrst, 'reload schema';
commit;
select to_regprocedure('public.record_shop_invoice_payment(uuid,uuid,numeric,text,date,text,text)') is not null as payments_installed, to_regprocedure('public.reverse_shop_invoice_payment(uuid,uuid,text)') is not null as reversals_installed;
