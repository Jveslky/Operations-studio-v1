import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

const origin = 'https://test-shop-combined.long-shift-test.pages.dev';
const checkoutId = '11111111-1111-1111-1111-111111111111';
const env = {
    SHOP_PAYMENT_ORIGIN: origin,
    STRIPE_TEST_SECRET_KEY: 'sk_test_fixture',
    STRIPE_TEST_WEBHOOK_SECRET: 'whsec_fixture',
    SUPABASE_URL: 'https://test.example',
    SUPABASE_ANON_KEY: 'anon-fixture',
    SUPABASE_SERVICE_ROLE_KEY: 'service-fixture'
};
let handler;
globalThis.Deno = { env: { get: key => env[key] }, serve: fn => { handler = fn; } };
const calls = [];
globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/prepare_shop_payment_checkout')) {
        return Response.json({
            id: checkoutId, merchant_account: 'acct_test', provider: 'stripe',
            amount_cents: 15000, currency: 'usd', expires_at: 2000000000
        });
    }
    if (url === 'https://api.stripe.com/v1/checkout/sessions') {
        return Response.json({ livemode: false, url: 'https://checkout.stripe.com/test' });
    }
    assert.ok(url.endsWith('/reconcile_shop_processor_payment'));
    return Response.json('posted');
};

await import('../supabase/functions/shop-online-payments/index.ts');
const createCheckout = () => new Request(origin, {
    method: 'POST', headers: { Origin: origin, Authorization: 'Bearer office-session' },
    body: JSON.stringify({ invoiceId: checkoutId, amount: 1 })
});
assert.equal((await handler(createCheckout())).status, 200);
assert.equal(calls[0].options.headers.Authorization, 'Bearer office-session');
assert.equal(calls[1].options.headers['Stripe-Account'], 'acct_test');
assert.equal(calls[1].options.headers['Idempotency-Key'], checkoutId);
assert.equal(calls[1].options.body.get('line_items[0][price_data][unit_amount]'), '15000');

const event = {
    type: 'checkout.session.completed', account: 'acct_test', livemode: false,
    data: { object: {
        mode: 'payment', payment_status: 'paid', payment_intent: 'pi_test',
        amount_total: 15000, currency: 'usd', metadata: { long_shift_checkout: checkoutId }
    } }
};
function webhook(payload, { tampered = false, age = 0 } = {}) {
    const body = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000) - age;
    const signature = createHmac('sha256', env.STRIPE_TEST_WEBHOOK_SECRET)
        .update(`${timestamp}.${body}`).digest('hex');
    return new Request(origin, {
        method: 'POST', body: tampered ? body.replace('15000', '1') : body,
        headers: { 'Stripe-Signature': `t=${timestamp},v1=${signature}` }
    });
}
assert.equal((await handler(webhook(event, { tampered: true }))).status, 400);
assert.equal((await handler(webhook(event, { age: 360 }))).status, 400);
assert.equal((await handler(webhook({ ...event, livemode: true }))).status, 200);
assert.equal(calls.length, 2);
assert.equal((await handler(webhook(event))).status, 200);
assert.deepEqual(JSON.parse(calls[2].options.body), {
    p_checkout: checkoutId, p_provider: 'stripe', p_merchant: 'acct_test',
    p_payment: 'pi_test', p_amount: 150, p_currency: 'usd'
});
console.log('Stripe sandbox: authenticated reservation, server amount, connected account, signed paid event, tamper and live-event guards passed.');
