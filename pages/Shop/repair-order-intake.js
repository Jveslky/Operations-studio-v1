/* Quick intake uses authoritative, shop-scoped records; never browser customer caches. */
(function () {
    const el = id => document.getElementById(id);
    const message = el('quick-intake-message');
    let busy = false;
    let epoch = 0;
    let unitCustomer = null;
    const panels = ['customer', 'unit'];
    function say(text, error = false) {
        message.textContent = text;
        message.classList.toggle('error', error);
    }
    function close() {
        epoch++;
        panels.forEach(kind => {
            const panel = el(`quick-${kind}-panel`);
            panel.hidden = true;
            panel.querySelectorAll("input").forEach(input => input.disabled = true);
        });
    }
    function lock(value) {
        busy = value;
        el('intake-shortcuts').querySelectorAll('button').forEach(b => b.disabled = value);
        panels.forEach(kind => el(`quick-${kind}-panel`).querySelectorAll('input,button').forEach(b => b.disabled = value || el(`quick-${kind}-panel`).hidden));
        newCustomerInput.disabled = value || newCustomerInput.options.length <= 1;
        newRepairOrderForm.querySelector('[type="submit"]').disabled = value;
    }
    async function save(kind) {
        if (busy) return;
        const token = epoch;
        const panel = el(`quick-${kind}-panel`);
        const name = el(`quick-${kind}-name`);
        if (!name.value.trim()) { say('Enter a name or description.', true); name.focus(); return; }
        if (kind === 'customer' && !el('quick-customer-email').checkValidity()) {
            say('Check the email address.', true); el('quick-customer-email').focus(); return;
        }
        lock(true);
        say('Saving…');
        try {
            const context = await window.trackRightAuthReady;
            if (!window.trackRightCan('customers.write') || !window.trackRightCan('repair_orders.write')) throw new Error('Customer intake is unavailable for your role.');
            const shopId = await getRepairOrderShopId();
            if (context.shopId !== shopId) throw new Error('Shop changed. Reopen intake.');
            const customerId = unitCustomer;
            if (kind === 'unit' && (!customerId || customerId !== newCustomerInput.value)) throw new Error('Customer changed. Reopen vehicle intake.');
            const payload = { shop_id: shopId, name: name.value.trim(), archived: false };
            if (kind === 'customer') {
                payload.phone = el('quick-customer-phone').value.trim();
                payload.email = el('quick-customer-email').value.trim();
            } else {
                payload.customer_id = customerId;
                for (const field of ['year','make','model','serial']) payload[field] = el(`quick-unit-${field}`).value.trim();
            }
            const {data, error} = await supabaseClient.from(kind === 'customer' ? 'Customers' : 'customer_units').insert(payload).select('id, name').single();
            if (error) throw error;
            if (token !== epoch || newRepairOrderForm.hidden) { say('Record saved. Reopen intake to select it.'); return; }
            if (kind === 'customer') {
                unitLoadRequestId++;
                newCustomerInput.add(new Option(data.name, data.id));
                newCustomerInput.disabled = false;
                newCustomerInput.value = data.id;
                selectedCustomerId = data.id;
                setUnitDropdownState('Add a vehicle for this customer', true);
            } else {
                unitLoadRequestId++;
                newUnitInput.disabled = false;
                newUnitInput.add(new Option(payload.name, data.id));
                newUnitInput.value = data.id;
            }
            panel.querySelectorAll('input').forEach(input => input.value = '');
            close();
            newRoDataMessage.textContent = '';
            say(kind === 'customer' ? 'Customer selected. Add their vehicle next.' : 'Vehicle selected. Your repair-order draft is preserved.');
        } catch (error) {
            // A failed response can follow a successful write; ask for a list refresh before retrying.
            say(`Could not confirm save: ${error.message}. Check the customer or vehicle list before retrying.`, true);
        } finally { lock(false); }
    }
    panels.forEach(kind => {
        el(`quick-${kind}-open`).addEventListener('click', () => {
            if (busy) return;
            close();
            if (kind === 'unit') {
                unitCustomer = newCustomerInput.value;
                if (!unitCustomer) { say('Select or add a customer first.', true); return; }
                el('quick-unit-customer').textContent = `For ${newCustomerInput.selectedOptions[0].textContent}`;
            }
            say('');
            el(`quick-${kind}-panel`).hidden = false;
            el(`quick-${kind}-panel`).querySelectorAll("input,button").forEach(input => input.disabled = false);
            el(`quick-${kind}-name`).focus();
        });
        el(`quick-${kind}-save`).addEventListener('click', () => save(kind));
    });
    document.querySelectorAll('[data-intake-close]').forEach(button => button.addEventListener('click', close));
    newCustomerInput.addEventListener('change', close);
    cancelNewRepairOrderButton.addEventListener('click', () => { close(); say(''); });
    newRepairOrderForm.addEventListener('reset', () => { close(); say(''); });
    close();
    window.trackRightAuthReady.then(() => {
        el('intake-shortcuts').hidden = !(window.trackRightCan('customers.write') && window.trackRightCan('repair_orders.write'));
    });
})();
