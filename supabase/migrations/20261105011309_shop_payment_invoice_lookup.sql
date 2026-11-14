-- Support payment lookups by invoice alone, including invoice transition checks.
-- The existing shop-first index supports a different leading filter.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
create index if not exists shop_invoice_payments_invoice_id_idx
 on public.shop_invoice_payments(invoice_id);
commit;
