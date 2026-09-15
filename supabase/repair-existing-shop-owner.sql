-- Run once in the Supabase SQL editor for an existing Track Right shop whose
-- original account was created before owner roles were added.
--
-- Safety rule: only a shop with exactly one active member and no active owner
-- is repaired. Existing multi-user shops and existing owners are untouched.

alter table public.shop_members
    add column if not exists role text not null default 'technician',
    add column if not exists is_active boolean not null default true;

alter table public.shops
    add column if not exists created_by uuid references auth.users(id);

with sole_members as (
    select shop_id, min(user_id::text)::uuid as user_id
    from public.shop_members
    where is_active = true
    group by shop_id
    having count(*) = 1
), ownerless_shops as (
    select shops.id
    from public.shops shops
    where not exists (
        select 1
        from public.shop_members owners
        where owners.shop_id = shops.id
          and owners.is_active = true
          and owners.role = 'owner'
    )
)
update public.shop_members members
set role = 'owner'
from sole_members, ownerless_shops
where members.shop_id = sole_members.shop_id
  and members.user_id = sole_members.user_id
  and members.shop_id = ownerless_shops.id;

update public.shops shops
set created_by = owners.user_id
from public.shop_members owners
where shops.id = owners.shop_id
  and shops.created_by is null
  and owners.role = 'owner'
  and owners.is_active = true;

notify pgrst, 'reload schema';
