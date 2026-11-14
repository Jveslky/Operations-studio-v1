-- Deploy after the inspection media client uses authenticated downloads.
-- Existing signed links remain usable until their original expiry.
begin;

create policy "inspection media cannot issue signed read links"
on storage.objects as restrictive
for select to anon, authenticated
using (
    bucket_id <> 'shop-inspection-media'
    or not storage.allow_any_operation(array[
        'storage.object.sign',
        'storage.object.sign_many'
    ])
);

commit;
