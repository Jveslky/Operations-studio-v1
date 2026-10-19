(function () {
    'use strict';
    const client=window.trackRightSupabase,parts=window.shopAPParts;
    let dialog,bill,context,rows=[],busy=false,pending=null,key='',generation=0,historyReady=false;
    const node=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
    const by=id=>dialog.querySelector('#'+id);
    const message=text=>{by('ap-stock-message').textContent=text;};
    function field(parent,label,value,change,type='text') {
        const wrap=node('label',label),input=node('input');input.type=type;input.value=value||'';
        if(type==='number'){input.min='0';input.step='any';}input.addEventListener('input',()=>change(input.value));wrap.append(input);parent.append(wrap);return input;
    }
    function button(parent,text,action){const b=node('button',text);b.type='button';b.addEventListener('click',()=>Promise.resolve().then(action).catch(e=>message(e.message)));parent.append(b);return b;}
    function makeDialog(){
        dialog=node('dialog');dialog.className='ap-stock-dialog';dialog.setAttribute('aria-labelledby','ap-stock-title');
        dialog.innerHTML='<h2 id="ap-stock-title">Review parts for receiving</h2><p id="ap-stock-bill"></p><p>Suggestions are incomplete until reviewed. Invoice quantity is not proof of delivery. Match each stocked part, check pack size and enter what physically arrived. Freight, cores, returns, special orders and backorders need a deliberate decision.</p><details><summary>Supplier document text</summary><pre id="ap-stock-source"></pre></details><div id="ap-stock-history"></div><fieldset id="ap-stock-fields"><label>Delivery reference<input id="ap-stock-delivery" maxlength="200"></label><div id="ap-stock-rows"></div><button id="ap-stock-add" type="button">Add missing line</button><label><input id="ap-stock-source-check" type="checkbox"> I checked the original document and accounted for missing lines, fees, cores and backorders.</label><label><input id="ap-stock-physical" type="checkbox"> I verified quantities physically delivered and stock units per supplier unit.</label></fieldset><p id="ap-stock-message" role="status" aria-live="polite"></p><div id="ap-stock-actions"></div>';
        document.body.append(dialog);
        by('ap-stock-add').addEventListener('click',()=>{rows.push({source:'Manual review',description:'',action:'',received:'',pack:'',supplier_cost:''});draw();});
        button(by('ap-stock-actions'),'Confirm reviewed receipt',submit).id='ap-stock-save';
        button(by('ap-stock-actions'),'Retry same receipt',transmit).id='ap-stock-retry';
        button(by('ap-stock-actions'),'View original document',async()=>{if(!bill.document_path)throw Error('No original document attached to this bill.');const r=await client.storage.from('shop-ap-documents').createSignedUrl(bill.document_path,60);if(r.error)throw r.error;window.open(r.data.signedUrl,'_blank','noopener,noreferrer');});
        button(by('ap-stock-actions'),'Close',()=>{if(busy)return;if(!pending&&rows.length&&!window.confirm('Close this unsaved receiving review?'))return;generation++;dialog.close();});
        dialog.addEventListener('cancel',event=>{event.preventDefault();if(!busy&&(pending||!rows.length||window.confirm('Close this unsaved receiving review?'))){generation++;dialog.close();}});
    }
    function controls(){by('ap-stock-fields').disabled=busy||!!pending||!historyReady;by('ap-stock-save').disabled=busy||!!pending||!historyReady;by('ap-stock-retry').hidden=!pending;by('ap-stock-retry').disabled=busy;}
    function draw(){
        const container=by('ap-stock-rows');container.replaceChildren();
        rows.forEach((row,index)=>{
            const card=node('section');card.className='ap-stock-row';card.append(node('h3',`Line ${index+1}`),node('p',row.source));
            field(card,'Supplier part number',row.part_number,v=>row.part_number=v);
            field(card,'Description',row.description,v=>row.description=v);
            const label=node('label','Decision'),choice=node('select');
            for(const [v,t] of [['','Choose…'],['receive','Receive into stock'],['skip','Exclude from stock']]){const option=node('option',t);option.value=v;choice.append(option);}choice.value=row.action||'';
            choice.addEventListener('change',()=>{row.action=choice.value;draw();});label.append(choice);card.append(label);
            if(row.action==='skip')field(card,'Exclusion reason (freight, core, not delivered, etc.)',row.reason,v=>row.reason=v);
            if(row.action==='receive'){
                card.append(node('p',`Invoice quantity suggestion: ${row.ordered||'Not read'}. Verify against the document.`));
                const query=field(card,'Find catalog part',row.part_number,v=>row.search=v),matches=node('div');
                card.append(node('p',row.item_label?'Matched: '+row.item_label:'No inventory part matched.'));
                button(card,'Search inventory',async()=>{
                    const token=row.searchGeneration=(row.searchGeneration||0)+1,session=generation;
                    const r=await client.rpc('shop_inventory_directory',{p_shop:context.shopId,p_search:query.value.trim(),p_filter:'active',p_page:0,p_size:25});
                    if(session!==generation||token!==row.searchGeneration||!card.isConnected)return;if(r.error)throw r.error;
                    matches.replaceChildren();
                    for(const item of r.data.rows||[])button(matches,`${item.part_number} · ${item.manufacturer||''} · ${item.description} · ${item.stock_unit}`,()=>{row.item_id=item.id;row.item_label=`${item.part_number} · ${item.description} / ${item.stock_unit}`;draw();});
                    if(!r.data.rows?.length)matches.textContent='No match. Create the catalog item in Inventory, then search again. Do not substitute a different part.';
                });card.append(matches);
                field(card,'Supplier units actually delivered',row.received,v=>row.received=v,'number');
                field(card,'Stock units in one supplier unit (1 for each)',row.pack,v=>row.pack=v,'number');
                field(card,'Cost per supplier unit (before tax/freight)',row.supplier_cost,v=>row.supplier_cost=v,'number');
                const link=node('a','Open Inventory to create/check parts');link.href='./inventory.html';link.target='_blank';link.rel='noopener';card.append(link);
            }
            container.append(card);
        });controls();
    }
    async function submit(){
        if(busy||pending||!historyReady)return;
        const review={delivery:by('ap-stock-delivery').value.trim(),source_check:by('ap-stock-source-check').checked,physical_check:by('ap-stock-physical').checked,rows:structuredClone(rows).map(({search,searchGeneration,...row})=>row)};
        if(!review.delivery||!review.source_check||!review.physical_check||!rows.length)throw Error('Review the source and physical delivery, add lines, and enter a delivery reference.');
        const ids=new Set(),summary=[];
        for(const row of review.rows){
            if(row.action==='skip'){if(!row.reason?.trim())throw Error('Explain every excluded line.');continue;}
            if(row.action!=='receive')throw Error('Choose a decision for every line.');
            const line=parts.stockLine(row);if(ids.has(line.item_id))throw Error('Combine repeated inventory parts into one received line and explain excluded duplicate rows.');ids.add(line.item_id);
            summary.push(`${row.item_label}: +${line.quantity} at $${line.unit_cost} / stock unit`);
        }
        if(!summary.length)throw Error('Select at least one delivered stocked part.');
        if(!window.confirm(`${bill.vendor} · Invoice ${bill.invoice_number}\nDelivery ${review.delivery}\n${summary.join('\n')}\n\nConfirm receipt? This adds stock; it does not pay the bill or add parts to an RO.`))return;
        const existing=localStorage.getItem(key);if(existing){pending=JSON.parse(existing);controls();throw Error('A receipt is already awaiting confirmation. Retry the same receipt first.');}
        const action={p_shop:context.shopId,p_request:crypto.randomUUID(),p_bill:bill.id,p_expected:bill.updated_at,p_review:review};
        localStorage.setItem(key,JSON.stringify(action));pending=action;return transmit();
    }
    async function transmit(){
        if(busy||!pending)return;busy=true;controls();message('Saving reviewed delivery…');
        try{
            const r=await client.rpc('receive_shop_ap_stock',pending);
            if(r.error){if(/^[0-9A-Z]{5}$/.test(r.error.code||'')){localStorage.removeItem(key);pending=null;}throw r.error;}
            localStorage.removeItem(key);pending=null;rows=[];by('ap-stock-rows').replaceChildren();by('ap-stock-fields').hidden=true;by('ap-stock-save').hidden=true;
            message(`Receipt ${r.data.receipt_id} recorded. Inventory increased once; AP amount and payment status unchanged. Close and reopen to view receipt history.`);
        }catch(e){
            if(e.code==='23505'&&String(e.message).includes('shop_inventory_receipt_identity'))message('This delivery has already been received. Check the previously confirmed deliveries and Inventory history. No additional stock was added.');
            else message(`${e.message}. ${pending?'Server success is uncertain. Retry the same receipt; do not enter it again.':'No receipt saved. Review and correct before confirming.'}`);
        }
        finally{busy=false;controls();}
    }
    window.shopAPReceiving={async open(record){
        if(busy)return;if(!dialog)makeDialog();context=await window.trackRightAuthReady;
        if(!window.trackRightCan('inventory.receive')||!window.trackRightCan('expenses.read'))throw Error('AP and inventory receiving access are required.');
        bill=record;historyReady=false;const session=++generation;key=`long-shift-ap-receipt:${context.shopId}:${context.user.id}:${bill.id}`;
        pending=null;by('ap-stock-save').hidden=false;by('ap-stock-fields').hidden=false;
        by('ap-stock-bill').textContent=`${bill.vendor} · Invoice ${bill.invoice_number||'Missing reference'}`;by('ap-stock-source').textContent=bill.ocr_text||'No extracted text. View the original document and add lines manually.';
        by('ap-stock-history').textContent='Loading previous receipts…';by('ap-stock-delivery').value='';by('ap-stock-source-check').checked=false;by('ap-stock-physical').checked=false;
        rows=parts.suggest(bill.ocr_text);draw();message('Review suggestions against View Document. Unread lines can be added manually.');dialog.showModal();
        try{pending=JSON.parse(localStorage.getItem(key)||'null');controls();}catch{by('ap-stock-fields').disabled=true;by('ap-stock-save').disabled=true;message('Cannot read the saved receipt request. Browser storage needs review before receiving.');return;}
        if(pending){
            if(pending.p_shop!==context.shopId||pending.p_bill!==bill.id||typeof pending.p_request!=='string'||!Array.isArray(pending.p_review?.rows)){by('ap-stock-retry').disabled=true;message('Saved receipt request needs review before receiving.');return;}
            const details=node('details');details.append(node('summary','Review the saved receipt awaiting confirmation'),node('pre',JSON.stringify(pending.p_review,null,2)));by('ap-stock-history').replaceChildren(details);
            message('An earlier receipt has an unconfirmed response. Retry the same receipt before starting another.');
        }
        const r=await client.from('shop_ap_stock_receipts').select('receipt_id,recorded_at,review').eq('shop_id',context.shopId).eq('bill_id',bill.id).order('recorded_at',{ascending:false});
        if(session!==generation)return;
        if(r.error){by('ap-stock-fields').disabled=true;by('ap-stock-save').disabled=true;message('Receiving history unavailable. Apply the AP reviewed receiving SQL and reopen before receiving.');return;}
        historyReady=true;controls();const history=by('ap-stock-history');if(!pending)history.replaceChildren();history.append(node('h3','Previously confirmed deliveries'));
        for(const receipt of r.data){history.append(node('p',`${receipt.review.delivery} · ${new Date(receipt.recorded_at).toLocaleString()} · ${receipt.receipt_id}`));for(const row of receipt.review.rows||[])if(row.action==='receive')history.append(node('p',`${row.item_label||row.part_number||row.item_id}: ${row.received} supplier units × ${row.pack} stock units`));}
        if(!r.data.length)history.append(node('p','No linked deliveries recorded. Check Inventory history for receipts entered separately.'));
    }};
    window.addEventListener('beforeunload',event=>{if(dialog?.open&&rows.length&&!pending){event.preventDefault();event.returnValue='';}});
})();
