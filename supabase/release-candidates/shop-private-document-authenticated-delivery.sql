-- Deploy after all three document viewers use authenticated downloads.
-- Previously issued links remain usable until their original expiry.
begin;

create policy "private shop documents cannot issue signed read links"
on storage.objects as restrictive
for select to anon, authenticated
using (
    bucket_id not in (
        'shop-ap-documents',
        'shop-team-documents',
        'customer-tax-certificates'
    )
    or not storage.allow_any_operation(array[
        'storage.object.sign',
        'storage.object.sign_many'
    ])
);

commit;
