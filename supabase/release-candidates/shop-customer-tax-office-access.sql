begin;

create policy "invoice staff read customer tax profiles"
on public.customer_tax_profiles as restrictive
for select to authenticated
using (
    public.has_shop_role(shop_id, array['owner', 'admin', 'service_writer'])
    and public.shop_has_permission(shop_id, 'invoices.write')
);

create policy "invoice staff read customer tax certificates"
on storage.objects as restrictive
for select to authenticated
using (
    case when bucket_id = 'customer-tax-certificates' then
        public.has_shop_role((storage.foldername(name))[1]::uuid, array['owner', 'admin', 'service_writer'])
        and public.shop_has_permission((storage.foldername(name))[1]::uuid, 'invoices.write')
    else true end
);

commit;
