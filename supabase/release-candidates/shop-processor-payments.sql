begin;

create schema if not exists private;

-- The checkout service creates this record before contacting the processor.
create table private.shop_payment_checkouts (
    id uuid primary key default gen_random_uuid(),
    invoice_id uuid not null references public.shop_invoices(id),
    provider text not null,
    merchant_account text not null,
    amount numeric(12,2) not null check (amount > 0),
    currency text not null check (currency ~ '^[a-z]{3}$'),
    expires_at timestamptz not null default (date_trunc('second', now()) + interval '2 hours'),
    processor_payment_id text,
    confirmed_amount numeric(12,2),
    confirmed_currency text,
    outcome text check (outcome in ('posted', 'review')),
    unique (provider, merchant_account, processor_payment_id)
);
alter table private.shop_payment_checkouts enable row level security;
revoke all on private.shop_payment_checkouts from public, anon, authenticated;

-- Merchant accounts are provisioned by an operator in the sandbox.
create table private.shop_payment_merchants (
    shop_id uuid primary key references public.shops(id),
    provider text not null,
    merchant_account text not null,
    unique (provider, merchant_account)
);
alter table private.shop_payment_merchants enable row level security;
revoke all on private.shop_payment_merchants from public, anon, authenticated;

create function public.prepare_shop_payment_checkout(p_invoice uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
    invoice public.shop_invoices;
    merchant private.shop_payment_merchants;
    checkout private.shop_payment_checkouts;
begin
    select * into invoice from public.shop_invoices
    where id = p_invoice
      and auth.uid() is not null
      and public.has_shop_role(shop_id, array['owner', 'admin', 'service_writer'])
    for update;
    if not found or invoice.status <> 'Sent' or invoice.balance_due <= 0 then
        raise exception 'This invoice cannot accept an online payment';
    end if;

    select * into merchant from private.shop_payment_merchants where shop_id = invoice.shop_id;
    if not found then raise exception 'Online payments are not configured for this shop'; end if;

    select * into checkout from private.shop_payment_checkouts
    where invoice_id = invoice.id and expires_at > now()
      and outcome is null
    order by expires_at desc limit 1;
    if found then
        if checkout.amount <> invoice.balance_due
           or checkout.provider <> merchant.provider
           or checkout.merchant_account <> merchant.merchant_account then
            raise exception 'An earlier checkout is still open. Wait for it to expire before creating a new link.';
        end if;
    else
        insert into private.shop_payment_checkouts (invoice_id, provider, merchant_account, amount, currency)
        values (invoice.id, merchant.provider, merchant.merchant_account, invoice.balance_due, 'usd')
        returning * into checkout;
    end if;
    return jsonb_build_object(
        'id', checkout.id, 'provider', checkout.provider,
        'merchant_account', checkout.merchant_account,
        'amount_cents', checkout.amount * 100, 'currency', checkout.currency,
        'expires_at', extract(epoch from checkout.expires_at)::bigint
    );
end;
$$;

revoke all on function public.prepare_shop_payment_checkout(uuid) from public, anon;
grant execute on function public.prepare_shop_payment_checkout(uuid) to authenticated;

-- Only the server may call this after verifying the processor confirmation.
create function public.reconcile_shop_processor_payment(
    p_checkout uuid, p_provider text, p_merchant text, p_payment text,
    p_amount numeric, p_currency text
) returns text
language plpgsql security definer set search_path = '' as $$
declare
    checkout private.shop_payment_checkouts;
    invoice public.shop_invoices;
    result text;
begin
    select * into strict checkout from private.shop_payment_checkouts
    where id = p_checkout for update;

    if checkout.provider is distinct from p_provider
       or checkout.merchant_account is distinct from p_merchant
       or nullif(btrim(p_payment), '') is null or length(p_payment) > 200
       or p_amount is null or p_amount <= 0 or p_amount > 9999999999.99
       or p_amount <> round(p_amount, 2)
       or p_currency is null or p_currency !~ '^[a-z]{3}$' then
        raise exception 'Invalid processor payment confirmation';
    end if;

    if checkout.outcome is not null then
        if checkout.processor_payment_id is distinct from p_payment
           or checkout.confirmed_amount is distinct from p_amount
           or checkout.confirmed_currency is distinct from p_currency then
            raise exception 'Processor confirmation differs from the recorded payment';
        end if;
        return checkout.outcome;
    end if;

    select * into strict invoice from public.shop_invoices
    where id = checkout.invoice_id for update;

    result := 'review';
    if invoice.status = 'Sent' and invoice.balance_due = p_amount
       and checkout.amount = p_amount and checkout.currency = p_currency then
        insert into public.shop_invoice_payments
            (shop_id, invoice_id, request_id, amount, method, payment_date, reference)
        values
            (invoice.shop_id, invoice.id, checkout.id, p_amount, 'card', current_date, p_payment);
        update public.shop_invoices set status = 'Sent' where id = invoice.id;
        result := 'posted';
    end if;

    update private.shop_payment_checkouts
    set processor_payment_id = p_payment, confirmed_amount = p_amount,
        confirmed_currency = p_currency, outcome = result
    where id = checkout.id;
    return result;
end;
$$;

revoke all on function public.reconcile_shop_processor_payment(uuid,text,text,text,numeric,text)
    from public, anon, authenticated;
grant execute on function public.reconcile_shop_processor_payment(uuid,text,text,text,numeric,text)
    to service_role;

commit;
