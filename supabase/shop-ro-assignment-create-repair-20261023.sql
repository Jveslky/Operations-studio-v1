-- Test repair, corrected against the installed functions exported 2026-10-23.
-- Replaces the earlier repair; does not require live_qa_assignment_scope.
-- Creation without assignments requires write; assignment changes require assign.
-- Existing membership helpers, RLS, grants and permission presets are retained.
begin;
do $$ begin
 if to_regprocedure('public.has_shop_role(uuid,text[])') is null
 or to_regprocedure('public.shop_has_permission(uuid,text)') is null
 or to_regprocedure('public.resolve_shop_assignment(uuid,text)') is null then
  raise exception 'Assignment repair prerequisites missing; no changes applied';
 end if;
end $$;
create or replace function public.sync_shop_ro_assignments()
returns trigger language plpgsql security definer set search_path=public as $$
declare assignment_changed boolean; requested_assignment boolean;
begin
 if tg_op='INSERT' then
  if not public.has_shop_role(new.shop_id,array['owner','admin','foreman','service_writer'])
   or not public.shop_has_permission(new.shop_id,'repair_orders.write') then
   raise exception 'Repair-order creation permission required';
  end if;
  assignment_changed:=true;
  requested_assignment:=coalesce(trim(new.technician),'') not in ('','Unassigned')
   or coalesce(trim(new.additional_technician),'') not in ('','Unassigned')
   or new.technician_user_id is not null or new.additional_technician_user_id is not null;
 else
  assignment_changed:=new.technician is distinct from old.technician
   or new.additional_technician is distinct from old.additional_technician
   or new.technician_user_id is distinct from old.technician_user_id
   or new.additional_technician_user_id is distinct from old.additional_technician_user_id;
  requested_assignment:=assignment_changed;
 end if;
 if requested_assignment then
  if not public.has_shop_role(new.shop_id,array['owner','admin','foreman','service_writer'])
   or not public.shop_has_permission(new.shop_id,'repair_orders.assign') then
   raise exception 'Assignment permission required';
  end if;
 end if;
 if assignment_changed then
  new.technician_user_id:=public.resolve_shop_assignment(new.shop_id,new.technician);
  new.additional_technician_user_id:=public.resolve_shop_assignment(new.shop_id,new.additional_technician);
  if coalesce(trim(new.technician),'') not in ('','Unassigned') and new.technician_user_id is null then
   raise exception 'Primary technician must be active in this shop';
  end if;
  if coalesce(trim(new.additional_technician),'') not in ('','Unassigned') and new.additional_technician_user_id is null then
   raise exception 'Additional technician must be active in this shop';
  end if;
 end if;
 return new;
end $$;
commit;
