-- Test-first source navigation. Read-only, invoker rights retain AP and inventory RLS.
begin;
create or replace function public.shop_receiving_detail(p_shop uuid,p_receipt uuid)
returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare receipt jsonb; lines jsonb; source jsonb;
begin
 if not public.shop_inventory_can(p_shop,'read') then raise exception 'Inventory read access is required.';end if;
 select to_jsonb(r) into receipt from shop_inventory_receipts r where r.shop_id=p_shop and r.id=p_receipt;
 if receipt is null then raise exception 'Receipt is unavailable.';end if;
 select coalesce(jsonb_agg(jsonb_build_object('item_id',i.id,'part_number',i.part_number,'description',i.description,'manufacturer',i.manufacturer,'stock_unit',i.stock_unit,'quantity',m.quantity,'unit_cost',m.unit_cost,'line_cost',m.quantity*m.unit_cost) order by i.part_number,i.id),'[]'::jsonb)
 into lines from shop_inventory_movements m join shop_inventory_items i on i.shop_id=m.shop_id and i.id=m.item_id
 where m.shop_id=p_shop and m.receipt_id=p_receipt and m.kind='receipt';
 -- Both link and bill reads retain RLS; inventory-only staff receive no AP link.
 select jsonb_build_object('kind','ap','bill_id',b.id,'invoice_reference',b.invoice_number)
 into source from shop_ap_stock_receipts link join shop_accounts_payable b on b.id=link.bill_id and b.shop_id=link.shop_id
 where link.shop_id=p_shop and link.receipt_id=p_receipt;
 return jsonb_build_object('receipt',receipt,'lines',lines,'source',source);
end $$;
revoke all on function public.shop_receiving_detail(uuid,uuid) from public,anon;
grant execute on function public.shop_receiving_detail(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
