(function () {
    'use strict';
    const money = value => value.toLocaleString('en-US', {style: 'currency', currency: 'USD'});
    const number = value => Number(value) || 0;
    const cents = value => Math.round(value * 100) / 100;

    async function resolve(client, shopId, customerId) {
        if (!shopId) throw new Error('No active shop');
        const shop = await client.from('shops').select('default_taxable, default_tax_rate').eq('id', shopId).single();
        if (shop.error) throw shop.error;
        if (!shop.data) throw new Error('Shop tax settings unavailable');
        let customer = null;
        if (customerId) {
            const result = await client.from('customer_tax_profiles').select('tax_status').eq('shop_id', shopId).eq('customer_id', customerId).maybeSingle();
            if (result.error) throw result.error;
            customer = result.data;
        }
        const status = customer?.tax_status || 'inherit';
        const taxable = status === 'taxable' || (status === 'inherit' && shop.data.default_taxable === true);
        return {taxable, rate: taxable ? number(shop.data.default_tax_rate) : 0};
    }

    function totals(order, settings) {
        const labor = number(order.estimateLaborHours) * number(order.estimateLaborRate) + number(order.estimatePrebuiltLaborTotal);
        const parts = number(order.estimatePartsTotal);
        const supplies = number(order.estimateShopSupplies);
        const environmental = number(order.estimateEnvironmentalFee);
        const other = number(order.estimateOtherCharges);
        const discount = number(order.estimateDiscount);
        const subtotal = cents(Math.max(0, labor + parts + supplies + environmental + other - discount));
        const base = Math.max(0, labor + parts +
            (order.estimateShopSuppliesTaxable === false ? 0 : supplies) +
            (order.estimateEnvironmentalFeeTaxable === true ? environmental : 0) +
            (order.estimateMiscFeeTaxable === false ? 0 : other) - discount);
        const tax = settings.taxable ? cents(base * settings.rate / 100) : 0;
        return {subtotal, tax, total: cents(subtotal + tax), label: settings.taxable ? `Tax (${settings.rate}%)` : 'Tax (exempt)'};
    }

    function lines(value) {
        return [`Subtotal: ${money(value.subtotal)}`, `${value.label}: ${money(value.tax)}`, `Estimated Total: ${money(value.total)}`];
    }
    window.shopEstimateTax = {resolve, totals, lines, money};
})();
