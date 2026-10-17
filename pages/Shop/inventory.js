(function () {
    'use strict';
    const el=id=>document.getElementById(id),client=window.trackRightSupabase;
    const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const money=value=>Number(value||0).toLocaleString('en-US',{style:'currency',currency:'USD',maximumFractionDigits:4});
    const quantity=value=>Number(value||0).toLocaleString('en-US',{maximumFractionDigits:3});
    let context,page=0,count=0,generation=0,historyGeneration=0,historyPage=0,historyCount=0,historyItem=null,timer;
    let rows=[],basket=[],editing=null,adjusting=null,canReceive=false,canManage=false,loaded=false,busy=false,pending=null,storageKey='',dirty=false;
    const allowedRPCs=new Set(['save_shop_inventory_item','receive_shop_inventory','adjust_shop_inventory']);
    function readPending(){
        const keys=[];for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key===storageKey||key?.startsWith(storageKey+':'))keys.push(key);}
        if(!keys.length)return null;
        const action=JSON.parse(localStorage.getItem(keys.sort()[0]));
        if(!allowedRPCs.has(action.rpc)||action.args?.p_shop!==context.shopId||typeof action.args?.p_request!=='string')throw Error('The saved inventory request needs review. No new writes are enabled.');
        action.storageKey=keys.sort()[0];return action;
    }
    function message(text,error=false){el('inventory-message').textContent=text;el('inventory-message').classList.toggle('is-error',error);}
    function controls(){
        const locked=busy||!!pending||!loaded;
        el('inventory-new').hidden=!canManage;
        el('inventory-new').disabled=locked;
        el('inventory-item-fields').disabled=locked||!canManage;
        el('inventory-item-save').disabled=locked||!canManage;
        el('inventory-receipt-fields').disabled=locked||!canReceive;
        el('inventory-receipt-save').disabled=locked||!canReceive||!basket.length;
        el('inventory-adjustment-fields').disabled=locked||!canManage;
        el('inventory-adjustment-save').disabled=locked||!canManage;
        for(const id of ['inventory-item-cancel','inventory-receipt-cancel','inventory-adjustment-cancel'])el(id).disabled=busy||!!pending;
        el('inventory-retry').disabled=busy||!pending;
        el('inventory-pending').hidden=!pending;
        if(pending)el('inventory-pending-text').textContent=pending.summary+' This request is saved on this browser, but server success is not confirmed. Retry the same save before making another change.';
        pager();render();
    }
    function pager(){el('inventory-previous').disabled=page===0||!loaded;el('inventory-next').disabled=!loaded||(page+1)*25>=count;el('inventory-page-label').textContent=count?`${page*25+1}–${Math.min((page+1)*25,count)} of ${count}`:'0 parts';}
    function render(){
        const container=el('inventory-rows');container.replaceChildren();
        for(const item of rows){
            const card=document.createElement('article');card.className='inventory-part';
            card.innerHTML=`<div><h3>${escape(item.part_number)} ${item.archived?'· Archived':''}</h3><p>${escape(item.manufacturer||'No manufacturer')} · ${escape(item.description)}</p><p>Bin: ${escape(item.location||'Not set')} · Sale: ${money(item.sale_price)} / ${escape(item.stock_unit)}</p></div><div><div class="count ${Number(item.on_hand)<=Number(item.reorder_point)?'low':''}">${quantity(item.on_hand)} ${escape(item.stock_unit)}</div><p>On hand · Reorder at ${quantity(item.reorder_point)}</p><p>Last receipt cost: ${item.last_unit_cost==null?'—':money(item.last_unit_cost)}</p></div><div class="inventory-actions"></div>`;
            const actions=card.querySelector('.inventory-actions');
            function button(label,action,write=false){const b=document.createElement('button');b.type='button';b.textContent=label;b.disabled=write&&(busy||!!pending||!loaded);b.addEventListener('click',action);actions.append(b);}
            button('History',()=>{historyItem=item;historyPage=0;loadHistory();});
            if(canReceive&&!item.archived)button('Add to receipt',()=>addToReceipt(item),true);
            if(canManage){button('Edit',()=>editItem(item),true);button('Correct count',()=>adjustItem(item),true);}
            container.append(card);
        }
    }
    async function load(){
        const request=++generation;loaded=false;rows=[];controls();message('Loading stock…');
        try{
            const result=await client.rpc('shop_inventory_directory',{p_shop:context.shopId,p_search:el('inventory-search').value.trim(),p_filter:el('inventory-filter').value,p_page:page,p_size:25});
            if(request!==generation)return;if(result.error)throw result.error;
            count=Number(result.data.count);if(page>0&&page*25>=count){page=Math.max(0,Math.ceil(count/25)-1);return load();}
            rows=result.data.rows||[];canReceive=result.data.can_receive===true;canManage=result.data.can_manage===true;loaded=true;controls();
            message(rows.length?'Stock refreshed. Open History for receipts and corrections.':'No matching parts. An owner/admin can add the first catalog item.');
        }catch(error){if(request!==generation)return;count=0;canReceive=false;canManage=false;controls();message(`Inventory unavailable: ${error.message}. If this workspace has not been installed, apply the inventory foundation SQL update.`,true);}
    }
    async function loadHistory(){
        const item=historyItem,request=++historyGeneration;el('inventory-history').hidden=false;el('inventory-history-title').textContent=`Stock history · ${item.part_number}`;
        el('inventory-history-rows').textContent='Loading history…';el('history-previous').disabled=true;el('history-next').disabled=true;
        try{
            const result=await client.rpc('shop_inventory_history',{p_shop:context.shopId,p_item:item.id,p_page:historyPage,p_size:25});
            if(request!==historyGeneration)return;if(result.error)throw result.error;
            historyCount=Number(result.data.count);
            el('inventory-history-rows').innerHTML=result.data.rows.map(row=>`<article class="movement"><strong>${Number(row.quantity)>0?'+':''}${quantity(row.quantity)} ${escape(item.stock_unit)} · ${escape(row.kind)}</strong><p>${escape(row.reason)}</p>${row.receipt_id?`<p>${escape(row.supplier)} · Invoice ${escape(row.invoice_reference)} · Delivery ${escape(row.delivery_reference)} · ${money(row.unit_cost)} / unit</p>`:''}<p>${escape(row.recorded_by_email||'Staff')} · ${escape(new Date(row.recorded_at).toLocaleString())}</p></article>`).join('')||'No stock movements recorded.';
            el('history-page-label').textContent=historyCount?`${historyPage*25+1}–${Math.min((historyPage+1)*25,historyCount)} of ${historyCount}`:'0 movements';
            el('history-previous').disabled=historyPage===0;el('history-next').disabled=(historyPage+1)*25>=historyCount;
        }catch(error){if(request!==historyGeneration)return;el('inventory-history-rows').textContent=`History unavailable: ${error.message}`;el('history-page-label').textContent='';}
    }
    const itemFields={part_number:'item-part-number',manufacturer:'item-manufacturer',description:'item-description',stock_unit:'item-stock-unit',location:'item-location',sale_price:'item-sale-price',reorder_point:'item-reorder-point',archived:'item-archived'};
    function editItem(item=null){
        if(dirty&&!window.confirm('Discard unsaved part edits?'))return;
        editing=item;dirty=false;el('inventory-editor').hidden=false;el('inventory-editor-title').textContent=item?'Edit part':'Add part';
        for(const [key,id] of Object.entries(itemFields)){const node=el(id),value=item?.[key]??(key==='stock_unit'?'each':key==='sale_price'||key==='reorder_point'?'0':'');if(node.type==='checkbox')node.checked=value===true;else node.value=value;}
        el('item-part-number').focus();
    }
    function addToReceipt(item){
        if(basket.some(line=>line.item.id===item.id)){message('That part is already in the receipt. Edit its received quantity below.');return;}
        basket.push({item,quantity:'1',unit_cost:item.last_unit_cost==null?'':String(item.last_unit_cost)});renderBasket();controls();
    }
    function renderBasket(){
        el('inventory-receipt').hidden=!basket.length;const container=el('receipt-lines');container.replaceChildren();
        for(const line of basket){
            const row=document.createElement('div');row.className='receipt-line';row.innerHTML=`<div><strong>${escape(line.item.part_number)}</strong><p>${escape(line.item.description)} · ${escape(line.item.stock_unit)}</p></div>`;
            for(const [key,label,step,max] of [['quantity','Received stock units','0.001','99999999999.999'],['unit_cost','Cost / stock unit','0.0001','9999999999.9999']]){
                const wrapper=document.createElement('label');wrapper.textContent=label;const input=document.createElement('input');input.type='number';input.min=key==='quantity'?'0.001':'0';input.max=max;input.step=step;input.required=true;input.value=line[key];input.addEventListener('input',()=>{line[key]=input.value;});wrapper.append(input);row.append(wrapper);
            }
            const remove=document.createElement('button');remove.type='button';remove.textContent='Remove';remove.addEventListener('click',()=>{basket=basket.filter(value=>value!==line);renderBasket();controls();});row.append(remove);container.append(row);
        }
    }
    function adjustItem(item){adjusting=item;el('inventory-adjustment').hidden=false;el('adjustment-part').textContent=`${item.part_number} · Current on hand: ${quantity(item.on_hand)} ${item.stock_unit}`;el('inventory-adjustment-form').reset();el('adjustment-quantity').focus();}
    function numeric(value,decimals,positive=false){const pattern=new RegExp(`^[0-9]+(?:\\.[0-9]{1,${decimals}})?$`);if(!pattern.test(String(value))||!Number.isFinite(Number(value))||Number(value)<0||positive&&Number(value)<=0)throw Error(`Enter ${positive?'positive':'nonnegative'} values with up to ${decimals} decimal places.`);return Number(value);}
    async function mutate(rpc,args,summary,confirm=false){
        if(busy||pending)return;
        if(confirm&&!window.confirm(summary+'\n\nConfirm this inventory change?'))return;
        const action={rpc,args:{...args,p_shop:context.shopId,p_request:crypto.randomUUID()},summary};
        // Persist before transmission. Reloads and lost responses reuse this exact
        // user/shop-scoped request instead of inventing another stock transaction.
        try{
            // Another tab may already be waiting on an unconfirmed response.
            const existing=readPending();
            if(existing){pending=existing;controls();message('Another inventory save is waiting for confirmation. Retry that same save first.',true);return;}
            // Separate keys keep simultaneous tabs from overwriting one another's
            // recoverable requests. Server locks/constraints resolve collisions.
            action.storageKey=storageKey+':'+action.args.p_request;
            localStorage.setItem(action.storageKey,JSON.stringify(action));pending=action;
        }catch(error){message('Could not preserve a safe retry request. No save was sent. Check browser storage and retry.',true);return;}
        return transmit();
    }
    async function transmit(){
        if(busy||!pending)return;busy=true;controls();const action=pending;message('Saving inventory change…');
        try{
            const result=await client.rpc(action.rpc,action.args);
            if(result.error){
                // A PostgreSQL rejection is definitive: its transaction rolled back.
                // Transport failures are ambiguous and must keep the retry key.
                if(result.error.code&&/^[0-9A-Z]{5}$/.test(result.error.code)&&!result.error.code.startsWith('PGRST')){localStorage.removeItem(action.storageKey);pending=readPending();}
                throw result.error;
            }
            localStorage.removeItem(action.storageKey);pending=readPending();dirty=false;
            if(action.rpc==='save_shop_inventory_item'){editing=null;el('inventory-editor').hidden=true;}
            if(action.rpc==='receive_shop_inventory'){basket=[];el('inventory-receipt-form').reset();renderBasket();}
            if(action.rpc==='adjust_shop_inventory'){adjusting=null;el('inventory-adjustment').hidden=true;}
            await load();if(historyItem)await loadHistory();message(loaded?'Inventory change saved and recorded in history.':'Inventory change saved, but stock refresh failed. Refresh stock before making another change.',!loaded);
        }catch(error){message(pending?`Server save not confirmed: ${error.message}. Use Retry same save; do not enter it again.`:error.code==='23505'?'That part or supplier/invoice/delivery already exists. Check its history before receiving again.':error.message,true);}
        finally{busy=false;controls();}
    }
    el('inventory-item-form').addEventListener('submit',async event=>{event.preventDefault();if(!canManage)return;try{const values={};for(const [key,id] of Object.entries(itemFields)){const n=el(id);values[key]=n.type==='checkbox'?n.checked:n.value.trim();}numeric(values.sale_price,2);numeric(values.reorder_point,3);await mutate('save_shop_inventory_item',{p_id:editing?.id||null,p_expected:editing?.updated_at||null,p_values:values},`Save part ${values.part_number}`);}catch(error){message(error.message,true);}});
    el('inventory-receipt-form').addEventListener('submit',async event=>{event.preventDefault();if(!canReceive||!basket.length)return;try{const receipt={supplier:el('receipt-supplier').value.trim(),invoice_reference:el('receipt-invoice').value.trim(),delivery_reference:el('receipt-delivery').value.trim(),notes:el('receipt-notes').value.trim()};if(!receipt.supplier||!receipt.invoice_reference||!receipt.delivery_reference)throw Error('Supplier, invoice and delivery references are required.');const lines=basket.map(line=>({item_id:line.item.id,quantity:numeric(line.quantity,3,true),unit_cost:numeric(line.unit_cost,4)}));const summary=`Receive from ${receipt.supplier}\nInvoice ${receipt.invoice_reference} · Delivery ${receipt.delivery_reference}\n`+basket.map(line=>`${line.item.part_number}: +${quantity(line.quantity)} ${line.item.stock_unit} at ${money(line.unit_cost)} each`).join('\n');await mutate('receive_shop_inventory',{p_receipt:receipt,p_lines:lines},summary,true);}catch(error){message(error.message,true);}});
    el('inventory-adjustment-form').addEventListener('submit',async event=>{event.preventDefault();if(!canManage||!adjusting)return;try{const raw=el('adjustment-quantity').value.trim(),value=Number(raw),reason=el('adjustment-reason').value.trim();if(!/^-?[0-9]+(?:\.[0-9]{1,3})?$/.test(raw)||!Number.isFinite(value)||value===0||!reason)throw Error('Enter a nonzero correction (up to 3 decimals) and a reason.');const next=Math.round((Number(adjusting.on_hand)+value)*1000)/1000;if(next<0)throw Error('Correction would make stock negative.');await mutate('adjust_shop_inventory',{p_item:adjusting.id,p_quantity:value,p_expected:Number(adjusting.on_hand),p_reason:reason},`${adjusting.part_number}: ${quantity(adjusting.on_hand)} → ${quantity(next)} ${adjusting.stock_unit}\nReason: ${reason}`,true);}catch(error){message(error.message,true);}});
    el('inventory-new').addEventListener('click',()=>editItem());el('inventory-item-form').addEventListener('input',()=>{dirty=true;});
    el('inventory-item-cancel').addEventListener('click',()=>{if(!dirty||window.confirm('Discard unsaved part edits?')){dirty=false;editing=null;el('inventory-editor').hidden=true;}});
    el('inventory-adjustment-cancel').addEventListener('click',()=>{adjusting=null;el('inventory-adjustment').hidden=true;});
    el('inventory-receipt-cancel').addEventListener('click',()=>{if(!basket.length||window.confirm('Clear this unsaved receipt?')){basket=[];el('inventory-receipt-form').reset();renderBasket();controls();}});
    el('inventory-refresh').addEventListener('click',()=>{clearTimeout(timer);load();if(historyItem)loadHistory();});
    el('inventory-filter').addEventListener('change',()=>{page=0;load();});el('inventory-search').addEventListener('input',()=>{clearTimeout(timer);++generation;loaded=false;rows=[];controls();timer=setTimeout(()=>{page=0;load();},250);});
    el('inventory-previous').addEventListener('click',()=>{page=Math.max(0,page-1);load();});el('inventory-next').addEventListener('click',()=>{page++;load();});
    el('inventory-history-close').addEventListener('click',()=>{++historyGeneration;historyItem=null;el('inventory-history').hidden=true;});
    el('history-previous').addEventListener('click',()=>{historyPage=Math.max(0,historyPage-1);loadHistory();});el('history-next').addEventListener('click',()=>{historyPage++;loadHistory();});
    el('inventory-retry').addEventListener('click',()=>transmit());
    window.addEventListener('beforeunload',event=>{if((dirty||basket.length||adjusting)&&!pending){event.preventDefault();event.returnValue='';}});
    async function initialize(){try{
        context=await window.trackRightAuthReady;if(!context?.shopId||!context?.user?.id)throw Error('Shop session unavailable.');
        storageKey=`long-shift-inventory-pending:${context.shopId}:${context.user.id}`;
        pending=readPending();
        await load();
    }catch(error){message(error.message,true);loaded=false;controls();}}
    initialize();
})();
