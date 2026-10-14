/* Customer defaults live separately from invoice balances; financial edits are audited by PostgreSQL. */
(function () {
    const client=window.trackRightSupabase,el=id=>document.getElementById(id);
    const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    let generation=0,editCustomer=null,recordCustomer=null,loaded=false,dirty=false,saving=false;
    const fields=['account_number','terms_days','credit_limit','po_required','billing_contact','billing_email','billing_phone','account_status','tax_status','exemption_reason','exemption_certificate_number'];
    const certificates={edit:'',record:''};
    function markup(prefix,record) {
        return `<summary>Billing Preferences</summary><p class="billing-help">Invoice balances come from the payment ledger. Changing customer defaults does not change issued invoices. Credit limits are informational.</p><fieldset id="billing-${prefix}-fields" class="billing-fields" disabled>
        <label>Account number<input id="billing-${prefix}-account_number" maxlength="100"></label>
        <label>Tax status<select id="billing-${prefix}-tax_status"><option value="inherit">Use shop tax default</option><option value="taxable">Taxable</option><option value="exempt">Tax-exempt</option></select></label>
        <div id="billing-${prefix}-exempt" class="billing-wide billing-fields" hidden><label>Exemption reason<input id="billing-${prefix}-exemption_reason" maxlength="500"></label><label>Certificate number<input id="billing-${prefix}-exemption_certificate_number" maxlength="150"></label><label>Exemption document (PDF, JPG, PNG; 10 MB)<input id="billing-${prefix}-document" type="file" accept="application/pdf,image/jpeg,image/png"></label><span id="billing-${prefix}-document-info"></span><button id="billing-${prefix}-view-document" type="button" hidden>View exemption document</button></div>
        <label>Payment terms<select id="billing-${prefix}-type"><option value="receipt">Due Upon Receipt</option><option value="net">NET Account</option></select></label>
        <div id="billing-${prefix}-net" class="billing-wide billing-fields" hidden><label>NET days<select id="billing-${prefix}-days-choice"><option value="7">NET 7</option><option value="15">NET 15</option><option value="30">NET 30</option><option value="45">NET 45</option><option value="60">NET 60</option><option value="custom">Custom</option></select></label><label id="billing-${prefix}-custom" hidden>Custom days<input id="billing-${prefix}-terms_days" type="number" min="1" max="365" step="1"></label><label>Credit limit (optional)<input id="billing-${prefix}-credit_limit" type="number" min="0" step="0.01"></label><label>PO required<input id="billing-${prefix}-po_required" type="checkbox"></label></div>
        <label>Account status<select id="billing-${prefix}-account_status"><option value="active">Active</option><option value="hold">On hold</option></select></label>
        <label>Billing contact<input id="billing-${prefix}-billing_contact" maxlength="200"></label><label>Billing email<input id="billing-${prefix}-billing_email" type="email" maxlength="254"></label><label>Billing phone<input id="billing-${prefix}-billing_phone" type="tel" maxlength="100"></label></fieldset>
        <div class="billing-actions">${record?'<button id="billing-record-save" type="button" hidden>Save Billing Preferences</button>':''}<p id="billing-${prefix}-message" role="status"></p></div>${record?'<details id="billing-record-audit" hidden><summary>Financial settings history</summary><div id="billing-record-history" class="billing-history"></div></details>':''}`;
    }
    for(const prefix of ['edit','record']) {
        const details=document.createElement('details');details.className='customer-billing';details.id='billing-'+prefix;details.innerHTML=markup(prefix,prefix==='record');
        const parent=prefix==='edit'?el('add-customer-form'):el('customer-record-panel');parent.insertBefore(details,prefix==='edit'?parent.querySelector('.customer-form-actions'):parent.querySelector('.customer-record-notes'));
        details.addEventListener('input',()=>{if(prefix==='edit')dirty=true;sync(prefix);});details.addEventListener('change',()=>{if(prefix==='edit')dirty=true;sync(prefix);});
        el(`billing-${prefix}-view-document`).addEventListener('click',async()=>{try{const r=await client.storage.from('customer-tax-certificates').createSignedUrl(certificates[prefix],60);if(r.error)throw r.error;window.open(r.data.signedUrl,'_blank','noopener');}catch(e){message(prefix,e.message);}});
    }
    function message(prefix,text){el(`billing-${prefix}-message`).textContent=text;}
    function sync(prefix) {
        el(`billing-${prefix}-exempt`).hidden=el(`billing-${prefix}-tax_status`).value!=='exempt';
        const net=el(`billing-${prefix}-type`).value==='net';el(`billing-${prefix}-net`).hidden=!net;
        el(`billing-${prefix}-custom`).hidden=el(`billing-${prefix}-days-choice`).value!=='custom';
    }
    function populate(prefix,b={},t={}) {
        for(const field of fields){const node=el(`billing-${prefix}-${field}`),value=field==='tax_status'?t.tax_status||'inherit':field.startsWith('exemption_')?t[field]||'':b[field]??(field==='account_status'?'active':'');if(node.type==='checkbox')node.checked=value===true;else node.value=value;}
        const days=Number(b.terms_days||0);el(`billing-${prefix}-type`).value=days?'net':'receipt';el(`billing-${prefix}-days-choice`).value=[7,15,30,45,60].includes(days)?String(days):days?'custom':'30';
        certificates[prefix]=t.exemption_certificate_path||'';el(`billing-${prefix}-document`).value='';el(`billing-${prefix}-document-info`).textContent=certificates[prefix]?'Document attached':'';el(`billing-${prefix}-view-document`).hidden=!certificates[prefix];sync(prefix);
    }
    async function load(prefix,id){
        const request=++generation;loaded=false;message(prefix,'Loading billing preferences…');el(`billing-${prefix}-fields`).disabled=true;if(prefix==='record')el('billing-record-save').disabled=true;
        const c=await window.trackRightAuthReady,manager=['owner','admin'].includes(c.role);
        try{const [b,t]=await Promise.all([client.from('customer_billing_profiles').select('*').eq('shop_id',c.shopId).eq('customer_id',String(id)).maybeSingle(),client.from('customer_tax_profiles').select('*').eq('shop_id',c.shopId).eq('customer_id',String(id)).maybeSingle()]);if(request!==generation)return;if(b.error||t.error)throw b.error||t.error;
            populate(prefix,b.data||{},t.data||{});el(`billing-${prefix}-fields`).disabled=!manager;loaded=true;message(prefix,manager?'Changes are recorded with staff and time.':'Owner/admin access is required to change billing preferences.');dirty=false;
            if(prefix==='record'){el('billing-record-save').hidden=!manager;el('billing-record-save').disabled=false;el('billing-record-audit').hidden=!manager;if(manager){const r=await client.from('customer_billing_audit').select('setting_type,recorded_by_email,recorded_at,after_values,restored_from_backup').eq('shop_id',c.shopId).eq('customer_id',String(id)).order('recorded_at',{ascending:false}).limit(20);if(request!==generation)return;if(r.error)throw r.error;el('billing-record-history').innerHTML=(r.data||[]).map(a=>`<p>${escape(a.setting_type==='customer_tax_profiles'?'Tax status: '+a.after_values.tax_status:'Terms: '+(a.after_values.terms_days?'NET '+a.after_values.terms_days:'Due Upon Receipt')+' · Account '+a.after_values.account_status)} · ${escape(a.recorded_by_email||'Staff not recorded')} · ${escape(new Date(a.recorded_at).toLocaleString())}${a.restored_from_backup?' · Restored from backup':''}</p>`).join('')||'No financial settings changes recorded.';}}
        }catch(e){if(request===generation)message(prefix,`Billing preferences unavailable: ${e.message}. Install the customer billing SQL update.`);}
    }
    function values(prefix){const result={};for(const field of fields){const node=el(`billing-${prefix}-${field}`);result[field]=node.type==='checkbox'?node.checked:String(node.value).trim();}
        result.terms_days=el(`billing-${prefix}-type`).value==='receipt'?0:el(`billing-${prefix}-days-choice`).value==='custom'?Number(result.terms_days):Number(el(`billing-${prefix}-days-choice`).value);
        if(!Number.isInteger(result.terms_days)||result.terms_days<0||result.terms_days>365||(el(`billing-${prefix}-type`).value==='net'&&!result.terms_days))throw Error('Enter NET days from 1 to 365.');if(!result.terms_days){result.po_required=false;result.credit_limit='';}return result;
    }
    async function save(prefix,id){
        if(!loaded)throw Error('Billing preferences have not loaded. Reopen the customer before saving.');const c=await window.trackRightAuthReady;if(!['owner','admin'].includes(c.role))return;
        const payload=values(prefix),file=el(`billing-${prefix}-document`).files[0];
        if(file){if(file.size>10485760||!['application/pdf','image/jpeg','image/png'].includes(file.type))throw Error('Use a PDF, JPG or PNG no larger than 10 MB.');const path=`${c.shopId}/${id}/${crypto.randomUUID()}.${file.type==='application/pdf'?'pdf':file.type==='image/png'?'png':'jpg'}`;const upload=await client.storage.from('customer-tax-certificates').upload(path,file,{upsert:false});if(upload.error)throw upload.error;certificates[prefix]=path;el(`billing-${prefix}-document`).value='';}
        payload.exemption_certificate_path=certificates[prefix];const r=await client.rpc('save_shop_customer_billing',{p_shop:c.shopId,p_customer:String(id),p_values:payload});if(r.error)throw r.error;dirty=false;message(prefix,'Billing preferences saved.');
    }
    el('billing-record-save').addEventListener('click',async()=>{if(saving||!recordCustomer)return;saving=true;el('billing-record-save').disabled=true;try{await save('record',recordCustomer);await window.shopCustomerDesk.directory(window.openCustomerRecord);await load('record',recordCustomer);}catch(e){message('record',e.message);}finally{saving=false;el('billing-record-save').disabled=false;}});
    window.shopCustomerBilling={async newCustomer(){++generation;editCustomer=null;dirty=false;loaded=true;populate('edit');const c=await window.trackRightAuthReady;el('billing-edit-fields').disabled=!['owner','admin'].includes(c.role);message('edit',['owner','admin'].includes(c.role)?'Optional customer billing defaults.':'New customers use shop tax defaults and Due Upon Receipt. An owner/admin can configure NET terms.');},edit(id){editCustomer=id;return load('edit',id);},record(id){recordCustomer=id;return load('record',id);},async afterCustomerSaved(id){if(dirty)await save('edit',id);}};
})();
