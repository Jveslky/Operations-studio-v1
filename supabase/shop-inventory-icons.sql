begin;
create table if not exists public.shop_inventory_category_icons (
 shop_id uuid not null references public.shops(id) on delete cascade,
 category_key text not null,
 preset text not null check (preset in ('batteries','belts','brake-pads','brake-rotors','bulbs','cooling','drivetrain','electrical','engine','exhaust','filters','fluids','fuel-system','hardware','hoses','hvac','ignition','misc','steering','suspension','tires','transmission','wheels','wipers')),
 primary key (shop_id, category_key)
);
alter table public.shop_inventory_category_icons enable row level security;
revoke all on public.shop_inventory_category_icons from public, anon, authenticated;

create or replace function public.shop_inventory_icons(p_shop uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if not public.shop_inventory_can(p_shop,'read') then raise exception 'Inventory read access required'; end if;
 return coalesce((select jsonb_object_agg(category_key,preset) from public.shop_inventory_category_icons where shop_id=p_shop),'{}'::jsonb);
end $$;

create or replace function public.save_shop_inventory_icon(p_shop uuid,p_category text,p_preset text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare k text:=lower(btrim(coalesce(p_category,'')));
begin
 if not public.shop_inventory_can(p_shop,'manage') then raise exception 'Inventory management access required'; end if;
 if not exists(select 1 from public.shop_inventory_items where shop_id=p_shop and lower(coalesce(category,''))=k and not archived)
 then raise exception 'Active inventory category required'; end if;
 if p_preset is null then
  delete from public.shop_inventory_category_icons where shop_id=p_shop and category_key=k;
 else
  insert into public.shop_inventory_category_icons values(p_shop,k,p_preset)
  on conflict (shop_id,category_key) do update set preset=excluded.preset;
 end if;
end $$;
revoke all on function public.shop_inventory_icons(uuid),public.save_shop_inventory_icon(uuid,text,text) from public,anon;
grant execute on function public.shop_inventory_icons(uuid),public.save_shop_inventory_icon(uuid,text,text) to authenticated;
commit;
