-- Test database repair: requires live-qa-assignment-access.sql already installed.
-- Authorize before INSERT exists; preserve shop scope and active assignment resolution.
-- No memberships, permission presets, policies or business records are changed.
begin;
create or replace function public.sync_shop_ro_assignments()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if not public.live_qa_assignment_scope(new.shop_id) then return new; end if;
 if tg_op='INSERT' or new.technician is distinct from old.technician or new.additional_technician is distinct from old.additional_technician
 or new.technician_user_id is distinct from old.technician_user_id or new.additional_technician_user_id is distinct from old.additional_technician_user_id then
  if not public.has_shop_role(new.shop_id,array['owner','admin','service_writer']) or not public.shop_has_permission(new.shop_id,'repair_orders.write') then raise exception 'Assignment permission required'; end if;
  new.technician_user_id:=public.resolve_shop_assignment(new.shop_id,new.technician);
  new.additional_technician_user_id:=public.resolve_shop_assignment(new.shop_id,new.additional_technician);
  if trim(new.technician) not in ('','Unassigned') and new.technician_user_id is null then raise exception 'Primary technician must be active in this shop'; end if;
  if trim(new.additional_technician) not in ('','Unassigned') and new.additional_technician_user_id is null then raise exception 'Additional technician must be active in this shop'; end if;
 end if;
 return new;
end $$;
commit;
