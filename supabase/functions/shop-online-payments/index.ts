const allowedOrigin = Deno.env.get("SHOP_PAYMENT_ORIGIN");
const stripeKey = Deno.env.get("STRIPE_TEST_SECRET_KEY");
const webhookSecret = Deno.env.get("STRIPE_TEST_WEBHOOK_SECRET");
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const encoder = new TextEncoder();

function reply(body: object, status = 200, origin?: string) {
    const headers = new Headers();
    if (origin) {
        headers.set("Access-Control-Allow-Origin", origin);
        headers.set("Access-Control-Allow-Headers", "authorization, apikey, content-type, x-client-info");
        headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
        headers.set("Vary", "Origin");
    }
    return Response.json(body, { status, headers });
}

function rpc(name: string, key: string, authorization: string, body: object) {
    return fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
        method: "POST",
        headers: { apikey: key, Authorization: authorization, "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });
}

async function verifiedStripeSignature(body: string, header: string) {
    const fields = header.split(",");
    const timestamp = fields.find(field => field.startsWith("t="))?.slice(2);
    if (!timestamp || !/^\d+$/.test(timestamp)
        || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
    const key = await crypto.subtle.importKey(
        "raw", encoder.encode(webhookSecret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]
    );
    const payload = encoder.encode(`${timestamp}.${body}`);
    for (const field of fields) {
        if (!/^v1=[0-9a-f]{64}$/.test(field)) continue;
        const signature = Uint8Array.from(field.slice(3).match(/../g)!, pair => parseInt(pair, 16));
        if (await crypto.subtle.verify("HMAC", key, signature, payload)) return true;
    }
    return false;
}

Deno.serve(async request => {
    const origin = request.headers.get("Origin");
    const browserOrigin = origin && origin === allowedOrigin ? origin : undefined;
    if (request.method === "OPTIONS") return reply({}, browserOrigin ? 200 : 403, browserOrigin);
    if (request.method !== "POST") return reply({ error: "Method not allowed" }, 405, browserOrigin);

    try {
        const signature = request.headers.get("Stripe-Signature");
        if (signature) {
            if (!webhookSecret || !serviceKey) return reply({ error: "Webhook unavailable" }, 503);
            const raw = await request.text();
            if (!(await verifiedStripeSignature(raw, signature))) return reply({ error: "Invalid signature" }, 400);
            const event = JSON.parse(raw);
            const session = event.data?.object;
            if (event.livemode !== false || event.type !== "checkout.session.completed"
                || session?.mode !== "payment" || session.payment_status !== "paid"
                || !session.metadata?.long_shift_checkout) return reply({ received: true });
            if (typeof event.account !== "string" || typeof session.payment_intent !== "string"
                || !Number.isSafeInteger(session.amount_total) || typeof session.currency !== "string") {
                return reply({ error: "Incomplete checkout confirmation" }, 400);
            }
            const result = await rpc("reconcile_shop_processor_payment", serviceKey, `Bearer ${serviceKey}`, {
                p_checkout: session.metadata.long_shift_checkout,
                p_provider: "stripe",
                p_merchant: event.account,
                p_payment: session.payment_intent,
                p_amount: session.amount_total / 100,
                p_currency: session.currency
            });
            if (!result.ok) return reply({ error: "Payment reconciliation failed" }, 500);
            return reply({ received: true });
        }

        if (!browserOrigin) return reply({ error: "Origin not allowed" }, 403);
        const authorization = request.headers.get("Authorization");
        if (!authorization || !anonKey) return reply({ error: "Sign in required" }, 401, browserOrigin);
        if (!stripeKey?.startsWith("sk_test_") || !webhookSecret || !serviceKey) {
            return reply({ error: "Stripe sandbox is not configured" }, 503, browserOrigin);
        }
        const { invoiceId } = await request.json();
        if (typeof invoiceId !== "string" || !/^[0-9a-f-]{36}$/i.test(invoiceId)) {
            return reply({ error: "Invalid invoice" }, 400, browserOrigin);
        }
        const reservation = await rpc("prepare_shop_payment_checkout", anonKey, authorization, { p_invoice: invoiceId });
        const checkout = await reservation.json();
        if (!reservation.ok) return reply({ error: "This invoice cannot start checkout" }, 409, browserOrigin);
        if (checkout.provider !== "stripe") return reply({ error: "Unsupported processor" }, 409, browserOrigin);

        const session = await fetch("https://api.stripe.com/v1/checkout/sessions", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${stripeKey}`,
                "Stripe-Account": checkout.merchant_account,
                "Idempotency-Key": `${checkout.id}:card-filter-v1`,
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body: new URLSearchParams({
                mode: "payment",
                success_url: `${browserOrigin}/pages/Shop/payment-return.html`,
                cancel_url: `${browserOrigin}/pages/Shop/payment-return.html?cancelled=1`,
                expires_at: String(checkout.expires_at),
                "allowed_payment_method_types[0]": "card",
                "metadata[long_shift_checkout]": checkout.id,
                "line_items[0][quantity]": "1",
                "line_items[0][price_data][currency]": checkout.currency,
                "line_items[0][price_data][unit_amount]": String(checkout.amount_cents),
                "line_items[0][price_data][product_data][name]": "Long Shift shop invoice"
            })
        });
        const data = await session.json();
        if (!session.ok) {
            const code = data.error?.code;
            console.warn("Stripe checkout rejected", JSON.stringify({
                status: session.status,
                code: typeof code === "string" && /^[a-z_]{1,80}$/.test(code) ? code : null,
                requestId: session.headers.get("request-id")
            }));
        }
        if (!session.ok || data.livemode !== false || typeof data.url !== "string"
            || new URL(data.url).origin !== "https://checkout.stripe.com") {
            return reply({ error: "Stripe could not create a test checkout" }, 502, browserOrigin);
        }
        return reply({ url: data.url }, 200, browserOrigin);
    } catch {
        return reply({ error: "Payment service could not complete the request" }, 500, browserOrigin);
    }
});
