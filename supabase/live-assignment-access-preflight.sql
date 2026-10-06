-- READ ONLY. Run in Live project amikoqrqutnpojtcyjlx SQL Editor.
-- Returns schema/policy metadata and assignment counts only.
-- Does not read customer notes, photo bytes, credentials or mutate records.
begin transaction read only;
select jsonb_pretty(jsonb_build_object(
 'database', current_database(),
 'assignment_columns', coalesce((
   select jsonb_agg(jsonb_build_object('name',column_name,'type',data_type))
   from information_schema.columns
   where table_schema='public' and table_name='shop_repair_orders'
   and column_name in ('technician','additional_technician','technician_user_id','additional_technician_user_id')
 ),'[]'::jsonb),
 'shops', coalesce((
   select jsonb_agg(jsonb_build_object(
     'id',s.id,'name',s.name,
     'roles',(select jsonb_object_agg(role,n) from (
       select role,count(*) n from public.shop_members m where m.shop_id=s.id and m.is_active group by role
     ) counts),
     'repair_order_count',(select count(*) from public.shop_repair_orders r where r.shop_id=s.id),
     'unresolved_primary_labels',(select count(*) from public.shop_repair_orders r
       where r.shop_id=s.id and coalesce(trim(r.technician),'') not in ('','Unassigned')
       and not exists(select 1 from public.shop_members m join auth.users u on u.id=m.user_id
         where m.shop_id=s.id and m.is_active and lower(u.email)=lower(trim(r.technician))
         and m.role in ('owner','admin','foreman','service_writer','technician'))),
     'unresolved_additional_labels',(select count(*) from public.shop_repair_orders r
       where r.shop_id=s.id and coalesce(trim(r.additional_technician),'') not in ('','Unassigned')
       and not exists(select 1 from public.shop_members m join auth.users u on u.id=m.user_id
         where m.shop_id=s.id and m.is_active and lower(u.email)=lower(trim(r.additional_technician))
         and m.role in ('owner','admin','foreman','service_writer','technician')))
   ) order by s.id) from public.shops s
 ),'[]'::jsonb),
 'policies',coalesce((
   select jsonb_agg(jsonb_build_object('schema',schemaname,'table',tablename,
     'name',policyname,'mode',permissive,'roles',roles,'command',cmd,'using',qual,'check',with_check)
     order by schemaname,tablename,policyname)
   from pg_policies where (schemaname='public' and tablename in
     ('shop_repair_orders','shop_inspections','shop_inspection_items','shop_ro_media','shop_appointments'))
     or (schemaname='storage' and tablename='objects')
 ),'[]'::jsonb),
 'functions',coalesce((
   select jsonb_agg(jsonb_build_object('name',p.proname,'arguments',pg_get_function_identity_arguments(p.oid),
      'security_definer',p.prosecdef,'settings',p.proconfig,'acl',p.proacl::text,'definition',pg_get_functiondef(p.oid))
      order by p.proname)
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname in
     ('shop_role_permissions','shop_has_permission','has_shop_role','shop_can_access_ro',
      'shop_can_access_ro_file','resolve_shop_assignment','sync_shop_ro_assignments',
      'update_shop_repair_order_work','update_shop_repair_order_floor','attach_shop_inspection')
 ),'[]'::jsonb),
 'triggers',coalesce((
   select jsonb_agg(jsonb_build_object('table',c.relname,'name',t.tgname,'definition',pg_get_triggerdef(t.oid)))
   from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and not t.tgisinternal
   and c.relname in ('shop_repair_orders','shop_inspections','shop_inspection_items','shop_ro_media')
 ),'[]'::jsonb),
 'media_bucket',(select jsonb_build_object('id',id,'public',public) from storage.buckets where id='shop-inspection-media')
)) as live_assignment_preflight;
commit;
