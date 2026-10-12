(function () {
    'use strict';
    const client = window.trackRightSupabase;
    const round = value => Math.round((Number(value) || 0) * 100) / 100;
    const money = value => Number(value || 0).toLocaleString('en-US', {style:'currency',currency:'USD'});
    function financials(s) {
        const laborTotal = round(Number(s.labor_hours) * Number(s.labor_rate));
        const subtotal = round(Math.max(0,laborTotal + Number(s.parts_total) + Number(s.other_charges) - Number(s.discount)));
        return {laborTotal, subtotal, taxableBase:round(Math.max(0,laborTotal + Number(s.parts_total) + (s.other_taxable ? Number(s.other_charges) : 0) - Number(s.discount)))};
    }
    async function query(table, ro) {
        const ctx = await window.trackRightAuthReady;
        const result = await client.from(table).select('*').eq('shop_id',ctx.shopId).eq('repair_order_id',ro).order(table === 'shop_supplemental_estimates' ? 'supplement_number' : 'recorded_at');
        if (result.error) throw new Error(`Supplemental estimates unavailable: ${result.error.message}. Install the supplemental estimate database update or refresh.`);
        return result.data || [];
    }
    async function save(ro, existing, estimate) {
        const result = await client.rpc('save_shop_supplement',{p_ro:ro,p_id:existing?.id || null,p_expected_updated_at:existing?.updated_at || null,p_estimate:estimate});
        if (result.error) throw result.error;
        return result.data;
    }
    async function approve(s, authorization) {
        const result = await client.rpc('approve_shop_supplement',{p_id:s.id,p_expected_updated_at:s.updated_at,p_revision:s.revision,p_authorization:authorization});
        if (result.error) throw result.error;
        return result.data;
    }
    window.trackRightSupplements = {list:ro=>query('shop_supplemental_estimates',ro),history:ro=>query('shop_supplement_authorizations',ro),save,approve,financials,money};

    window.createSupplementalEstimates = function (order, isMainDirty) {
        const el = id => document.getElementById(id), section = el('supplemental-estimates');
        if (!window.trackRightCan('repair_orders.write')) {section.hidden=true; return;}
        const editor = el('supplement-editor'), approvalDialog = el('supplement-approval-dialog'), sendDialog=el('supplement-send-dialog');
        let supplements=[],history=[], editing=null, approving=null, sending=null, locked=false, ready=false, busy=false, evidencePath=null, evidenceFile=null;
        const priceKeys=['labor_hours','labor_rate','parts_total','other_charges','discount'];
        function message(error) {el('supplement-message').textContent=error.message || String(error);}
        function assertClean() {if (isMainDirty()) throw new Error('Save the repair order changes before working on a supplemental estimate.');}
        function readEditor() {
            const estimate={description:el('supplement-description').value.trim(),notes:el('supplement-notes').value.trim(),other_taxable:el('supplement-other-taxable').checked,status:el('supplement-status').value};
            for(const key of priceKeys) {
                const raw=el('supplement-'+key).value.trim() || '0';
                if(!/^\d+(\.\d{1,2})?$/.test(raw)) throw new Error('Enter nonnegative prices and hours with up to two decimal places.');
                estimate[key]=Number(raw);
            }
            if(!estimate.description) throw new Error('Describe the additional work.');
            return estimate;
        }
        function preview() {try{el('supplement-total').textContent=money(financials(readEditor()).subtotal);}catch{el('supplement-total').textContent='Complete the work description and pricing.';}}
        function addLine(parent,text,tag='p') {const n=document.createElement(tag);n.textContent=text;parent.append(n);return n;}
        function button(parent,label,action,readOnly=false) {const n=document.createElement('button');n.type='button';n.textContent=label;n.className='secondary-btn';n.disabled=false;if(locked&&!readOnly){n.textContent=label+' — Locked';n.setAttribute('aria-disabled','true');n.title='This repair order has been invoiced. Supplemental changes and sending are locked.';}n.addEventListener('click',()=>{try{if(locked&&!readOnly){const notice='This repair order has been invoiced. Supplemental estimates are locked to preserve the invoice snapshot. Printing and approval evidence remain available.';message(notice);window.alert(notice);return;}if(!readOnly)assertClean();action();}catch(e){message(e);}});parent.append(n);}
        function openEditor(s=null) {
            editing=s;el('supplement-editor-title').textContent=s?`Edit Supplement ${s.supplement_number} · Rev. ${s.revision}`:'Add supplemental estimate';
            el('supplement-description').value=s?.description || '';el('supplement-notes').value=s?.notes || '';
            for(const key of priceKeys) {
                const input=el('supplement-'+key), value=s?.[key] ?? (key==='labor_rate' ? order.estimateLaborRate || 0 : 0);
                input.value=Number(value)===0?'':value; input.placeholder=key==='labor_hours'?'0':'0.00';
            }
            el('supplement-other-taxable').checked=s?.other_taxable===true;
            el('supplement-status').value=s?.status==='Approved'?'Draft':s?.status || 'Draft';
            el('supplement-editor-help').textContent=s?.status==='Approved'?'Changing the approved work or pricing creates a new Draft revision. Earlier authorization is preserved.':'';
            el('supplement-editor-error').textContent='';preview();editor.showModal();
        }
        function openApproval(s) {
            approving=s;evidencePath=null;evidenceFile=null;el('supplement-evidence').value='';
            el('supplement-approval-title').textContent=`Authorize Supplement ${s.supplement_number}`;
            el('supplement-approval-summary').textContent=`Rev. ${s.revision} · ${s.description} · Entire supplement: ${money(s.total)}`;
            el('supplement-contact-choice').value=order.customer?'customer':'other';el('supplement-contact').value='';contactFields();
            el('supplement-method').value='';el('supplement-authorization-notes').value='';el('supplement-approval-error').textContent='';approvalDialog.showModal();
        }
        function contactFields() {el('supplement-contact-label').hidden=el('supplement-contact-choice').value!=='other';}
        el('supplement-contact-customer').textContent=order.customer || 'RO customer';
        el('supplement-contact-choice').addEventListener('change',contactFields);
        function documentText(s) {
            const f=financials(s);
            return [`Supplement ${s.supplement_number} · Rev. ${s.revision}`,`RO #${order.id}`,`Customer: ${order.customer || ''}`,`Vehicle: ${order.unit || ''}`,`Status: ${s.status}`,`Additional work: ${s.description}`,`Labor: ${s.labor_hours} hours × ${money(s.labor_rate)} = ${money(f.laborTotal)}`,`Parts: ${money(s.parts_total)}`,`Other charges: ${money(s.other_charges)} (${s.other_taxable?'taxable':'non-taxable'})`,`Discount: ${money(s.discount)}`,`Supplement total before invoice tax: ${money(s.total)}`,`Notes: ${s.notes || ''}`,'This supplement is additional to the original estimate.'].join('\n');
        }
        function print(s) {
            const popup=window.open('','_blank');if(!popup) throw new Error('Allow the print window and retry.');
            const escape=v=>v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
            popup.document.write(`<!doctype html><html><head><title>RO ${escape(String(order.id))} Supplement ${s.supplement_number}</title><style>body{font:16px system-ui;margin:40px}pre{font:inherit;white-space:pre-wrap;line-height:1.7}</style></head><body><h1>Long Shift — Supplemental estimate</h1><pre>${escape(documentText(s))}</pre></body></html>`);popup.document.close();popup.focus();popup.print();
        }
        function render() {
            const list=el('supplement-list');list.replaceChildren();
            if(!supplements.length) addLine(list,'No supplemental estimates yet.');
            for(const s of supplements) {
                const article=document.createElement('article');article.className='approval-history-entry';
                addLine(article,`Supplement ${s.supplement_number} · Rev. ${s.revision} · ${s.status} · ${money(s.total)}`,'strong');addLine(article,s.description);
                addLine(article,`Labor ${s.labor_hours} hrs × ${money(s.labor_rate)} · Parts ${money(s.parts_total)} · Other ${money(s.other_charges)} · Discount ${money(s.discount)}`);
                if(s.notes)addLine(article,s.notes);
                const actions=document.createElement('div');actions.className='detail-actions';
                button(actions,'Edit',()=>openEditor(s));
                if(s.status!=='Approved')button(actions,'Record approval',()=>openApproval(s));
                // Printing is read-only and remains available after invoicing.
                const printButton=document.createElement('button');printButton.type='button';printButton.className='secondary-btn';printButton.textContent='Print';printButton.addEventListener('click',()=>{try{print(s);}catch(e){message(e);}});actions.append(printButton);
                button(actions,'Send / copy',()=>{sending=s;el('supplement-send-message').value=documentText(s);el('supplement-send-error').textContent='';sendDialog.showModal();});article.append(actions);
                const approvals=history.filter(a=>a.supplement_id===s.id);
                for(const a of approvals) {
                    const details=document.createElement('details');addLine(details,`Authorization Rev. ${a.revision} · ${money(a.authorized_amount)} · ${a.revision===s.revision&&s.status==='Approved'?'Current supplement approval':'Earlier authorization'} — View snapshot`,'summary');
                    addLine(details,`Authorized by ${a.customer_contact} · ${a.method}`);addLine(details,`Recorded by ${a.recorded_by_email} · ${new Date(a.recorded_at).toLocaleString()}`);addLine(details,`Customer acknowledgment: ${a.notes || 'None recorded'}`);addLine(details,documentText(a.estimate_snapshot),'pre');
                    if(a.evidence_path)button(details,'Open approval evidence',async()=>{try{const r=await client.storage.from('shop-approval-evidence').download(a.evidence_path);if(r.error)throw r.error;const url=URL.createObjectURL(r.data),link=document.createElement('a');link.href=url;link.download=a.evidence_name || 'authorization';link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}catch(e){message(e);}},true);
                    article.append(details);
                }
                list.append(article);
            }
        }
        async function load() {
            const invoices=await window.trackRightInvoices.list();locked=invoices.some(i=>i.repairOrderRecordId===order.recordId);
            [supplements,history]=await Promise.all([window.trackRightSupplements.list(order.recordId),window.trackRightSupplements.history(order.recordId)]);
            ready=true;el('supplement-add').disabled=locked;
            el('supplement-message').textContent=locked?'This repair order is invoiced. Supplemental estimates are locked; their snapshots remain available.':'Approved supplements are added to the invoice once. Draft, Sent and Declined supplements are excluded.';render();
        }
        el('supplement-add').disabled=true;
        el('supplement-add').addEventListener('click',()=>{try{assertClean();if(ready&&!locked)openEditor();}catch(e){message(e);}});
        for(const n of editor.querySelectorAll('input,textarea,select'))n.addEventListener('input',preview);
        for(const key of priceKeys) {
            const input=el('supplement-'+key);
            input.addEventListener('focus',()=>{if(input.value!=='' && Number(input.value)===0)input.select();});
            input.addEventListener('blur',()=>{input.value=input.value.replace(/^0+(?=\d)/,'');preview();});
        }
        el('supplement-save').addEventListener('click',async()=>{
            if(busy)return;busy=true;el('supplement-save').disabled=true;
            try{assertClean();await save(order.recordId,editing,readEditor());editor.close();await load();}catch(e){el('supplement-editor-error').textContent=e.message;}finally{busy=false;el('supplement-save').disabled=false;}
        });
        el('supplement-approve').addEventListener('click',async()=>{
            if(busy)return;busy=true;el('supplement-approve').disabled=true;
            try {
                assertClean();const method=el('supplement-method').value,contact=el('supplement-contact-choice').value==='customer'?order.customer:el('supplement-contact').value.trim(),notes=el('supplement-authorization-notes').value.trim();
                if(!method||!contact)throw new Error('Choose a method and customer/contact.');if(method==='verbal'&&!notes)throw new Error('Add a note describing the verbal authorization.');
                const file=el('supplement-evidence').files[0];
                if(file){if(file.size===0||file.size>10*1024*1024||!['application/pdf','image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Evidence must be PDF, JPG, PNG or WebP up to 10 MB.');
                    if(file!==evidenceFile){const ctx=await window.trackRightAuthReady;const ext={'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[file.type];const path=`${ctx.shopId}/${order.recordId}/${crypto.randomUUID()}.${ext}`;const r=await client.storage.from('shop-approval-evidence').upload(path,file,{contentType:file.type,upsert:false});if(r.error)throw r.error;evidencePath=path;evidenceFile=file;}}
                await approve(approving,{method,customer_contact:contact,notes,evidence_path:file?evidencePath:null,evidence_name:file?file.name:null});approvalDialog.close();window.location.reload();
            } catch(e){el('supplement-approval-error').textContent=e.message;}finally{busy=false;el('supplement-approve').disabled=false;}
        });
        for(const id of ['supplement-editor','supplement-approval-dialog','supplement-send-dialog'])el(id).querySelector('[data-close]').addEventListener('click',()=>el(id).close());
        async function send(kind) {
            if(busy)return;busy=true;
            try{assertClean();const target=el(kind==='email'?'supplement-send-email':'supplement-send-phone').value.trim();if(!target)throw new Error(`Enter a customer ${kind==='email'?'email address':'phone number'}.`);
                const text=el('supplement-send-message').value;
                window.location.href=kind==='email'?`mailto:${encodeURIComponent(target)}?subject=${encodeURIComponent(`RO #${order.id} — Supplement ${sending.supplement_number}`)}&body=${encodeURIComponent(text)}`:`sms:${encodeURIComponent(target)}?body=${encodeURIComponent(text)}`;
                el('supplement-send-error').textContent='Message opened in your email/text app. Complete sending there.';
            }catch(e){el('supplement-send-error').textContent=e.message;}finally{busy=false;}
        }
        el('supplement-send-email-button').addEventListener('click',()=>send('email'));el('supplement-send-text-button').addEventListener('click',()=>send('text'));
        el('supplement-mark-sent').addEventListener('click',async()=>{
            if(busy)return;busy=true;
            try{assertClean();sending=await save(order.recordId,sending,{...sending,status:'Sent'});await load();el('supplement-send-error').textContent=sending.status==='Approved'?'Already approved; approval status preserved.':'Marked Sent.';}catch(e){el('supplement-send-error').textContent=e.message;}finally{busy=false;}
        });
        el('supplement-copy-button').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(el('supplement-send-message').value);el('supplement-send-error').textContent='Copied.';}catch{el('supplement-send-message').select();el('supplement-send-error').textContent='Select and copy the message.';}});
        if(order.customerId) Promise.resolve(window.trackRightAuthReady).then(async ctx => {
            const result=await client.from('Customers').select('email,phone').eq('shop_id',ctx.shopId).eq('id',order.customerId).maybeSingle();
            if(!result.error&&result.data){el('supplement-send-email').value=result.data.email || '';el('supplement-send-phone').value=result.data.phone || '';}
        }).catch(()=>{});
        load().catch(message);
    };
}());
