-- Run once for a legacy Track Right database when accepting an invitation
-- reports that no unique or exclusion constraint matches ON CONFLICT.

create unique index if not exists shop_members_shop_user_unique
    on public.shop_members (shop_id, user_id);

notify pgrst, 'reload schema';
