(function(){
    'use strict';
    if(new URLSearchParams(window.location.search).get('view')!=='receiving')return;
    const el=id=>document.getElementById(id),client=window.trackRightSupabase;
    const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const money=(value,precision=2)=>Number(value||0).toLocaleString('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:precision});
    const number=value=>Number(value||0).toLocaleString('en-US',{maximumFractionDigits:4});
    const date=value=>new Date(value).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
    let context,page=0,total=0,supplier='',generation=0,recentGeneration=0,detailGeneration=0,timer,detailOrigin='home';
    function open(screen){++detailGeneration;window.shopInventoryReceiving.open(screen);}
    function dateBounds(){
        const from=el('receiving-from').value,through=el('receiving-through').value;
        if(from&&through&&from>through)throw Error('Choose an end date on or after the start date.');
        let until=null;
        if(through){const next=new Date(through+'T00:00:00');next.setDate(next.getDate()+1);until=next.toISOString();}
        return {p_from:from?new Date(from+'T00:00:00').toISOString():null,p_until:until};
    }
    function receiptRow(receipt,origin){
        const row=document.createElement('button');row.type='button';row.className='receiving-receipt-row';
        row.innerHTML=`<span><strong>${escape(receipt.supplier)}</strong><small>Invoice ${escape(receipt.invoice_reference)} · Delivery ${escape(receipt.delivery_reference)}${receipt.purchase_order?' · PO '+escape(receipt.purchase_order):''}</small></span><span class="receiving-row-count">${receipt.quantity_received==null?'Quantity unavailable':number(receipt.quantity_received)+' '+(Number(receipt.quantity_received)===1?'unit received':'units received')}</span><span class="receiving-row-cost">${money(receipt.receipt_cost)}<small>before tax</small></span><span class="receiving-row-date">${date(receipt.recorded_at)}</span><span aria-hidden="true">›</span>`;
        row.addEventListener('click',()=>showReceipt(receipt.id,origin));return row;
    }
    async function loadRecent(){
        const request=++recentGeneration;
        el('receiving-recent-rows').replaceChildren();el('receiving-recent-message').textContent='Loading confirmed receipts…';
        try{
            const r=await client.rpc('shop_receiving_directory',{p_shop:context.shopId,p_size:25});
            if(request!==recentGeneration)return;if(r.error)throw r.error;
            for(const receipt of r.data.rows||[])el('receiving-recent-rows').append(receiptRow(receipt,'home'));
            el('receiving-recent-message').textContent=r.data.rows?.length?'':'No confirmed receipts yet. Receive a delivery to start your history.';
        }catch(error){if(request===recentGeneration)el('receiving-recent-message').textContent='Receipt history unavailable. '+error.message;}
    }
    const hasFilters=()=>!!el('receiving-search').value.trim()||!!el('receiving-from').value||!!el('receiving-through').value;
    function vendors(groups){
        const container=el('receiving-vendors');container.replaceChildren();
        const filtering=hasFilters();
        container.hidden=filtering||!!supplier;
        el('receiving-vendor-heading').textContent=supplier?supplier:filtering?'Matching receipts':'Suppliers';
        el('receiving-all-suppliers').hidden=!supplier;
        if(container.hidden)return;
        for(const group of groups){
            const button=document.createElement('button');button.type='button';
            button.className='receiving-supplier-tile';
            button.innerHTML=`<span class="receiving-supplier-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 21V8l9-5 9 5v13M2 21h20M8 21v-8h8v8M7 9h2m2 0h2m2 0h2"/></svg></span><span class="receiving-supplier-arrow" aria-hidden="true">›</span><strong>${escape(group.supplier)}</strong><span>${Number(group.receipt_count)} ${Number(group.receipt_count)===1?'receipt':'receipts'}</span><small>Last received ${date(group.last_received)}</small>`;
            button.addEventListener('click',()=>{supplier=group.supplier;page=0;loadHistory();});container.append(button);
        }
    }
    function pager(loading=false){el('receiving-previous').disabled=loading||page===0;el('receiving-next').disabled=loading||(page+1)*25>=total;el('receiving-page-label').textContent=total?`${page*25+1}–${Math.min((page+1)*25,total)} of ${total} receipts`:'0 receipts';}
    async function loadHistory(){
        const request=++generation;
        el('receiving-history-rows').replaceChildren();el('receiving-vendors').replaceChildren();el('receiving-history-message').textContent='Loading history…';el('receiving-history-pager').hidden=true;total=0;pager(true);
        try{
            const bounds=dateBounds();
            const r=await client.rpc('shop_receiving_directory',{p_shop:context.shopId,p_search:el('receiving-search').value.trim(),p_supplier:supplier,...bounds,p_page:page,p_size:25});
            if(request!==generation)return;if(r.error)throw r.error;
            total=Number(r.data.count)||0;vendors(r.data.vendors||[]);
            const overview=!supplier&&!hasFilters();
            el('receiving-history-pager').hidden=overview;
            if(!overview)for(const receipt of r.data.rows||[])el('receiving-history-rows').append(receiptRow(receipt,'history'));
            el('receiving-history-message').textContent=overview?(r.data.vendors?.length?'':'No suppliers yet. Confirm a receipt to start your history.'):(total?'':'No receipts match these filters.');
            pager();
        }catch(error){if(request===generation){el('receiving-vendors').replaceChildren();el('receiving-history-message').textContent=error.message;pager(true);}}
    }
    async function showReceipt(id,origin){
        open('detail');detailOrigin=origin;el('receiving-detail-close').textContent=origin==='home'?'Back to Receiving':'Back to supplier deliveries';el('receiving-detail').hidden=false;
        const request=++detailGeneration;el('receiving-detail-body').textContent='Loading receipt…';
        try{
            const r=await client.rpc('shop_receiving_detail',{p_shop:context.shopId,p_receipt:id});
            if(request!==detailGeneration)return;if(r.error)throw r.error;
            const receipt=r.data.receipt,lines=r.data.lines||[],source=r.data.source,total=lines.reduce((sum,line)=>sum+Number(line.line_cost),0);
            const automaticNote=/^Reviewed AP bill [0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test((receipt.notes||'').trim());
            const sourceLink=source?.kind==='ap'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(source.bill_id)?`<p class="receiving-source">Received through Accounts Payable · <a href="accounts-payable.html?bill=${encodeURIComponent(source.bill_id)}">Open supplier invoice ${escape(source.invoice_reference||receipt.invoice_reference)}</a></p>`:automaticNote?'<p class="inventory-help">Received through Accounts Payable</p>':'';
            el('receiving-detail-body').innerHTML=`<div class="receiving-receipt-meta"><strong>${escape(receipt.supplier)}</strong><span>${date(receipt.recorded_at)}</span><span>Invoice ${escape(receipt.invoice_reference)}</span><span>Delivery ${escape(receipt.delivery_reference)}</span><span>PO ${escape(receipt.purchase_order||'Not provided')}</span></div>${sourceLink}${receipt.notes&&!automaticNote?`<p class="receiving-receipt-notes">${escape(receipt.notes)}</p>`:''}<div class="receiving-table-scroll"><table><caption>Parts received · catalog descriptions shown</caption><thead><tr><th>Part</th><th>Received</th><th>Unit cost</th><th>Line cost</th></tr></thead><tbody>${lines.map(line=>`<tr><td><strong>${escape(line.part_number)}</strong><small>${escape(line.description)}${line.manufacturer?' · '+escape(line.manufacturer):''}</small></td><td>${number(line.quantity)} ${escape(line.stock_unit)}</td><td>${money(line.unit_cost,4)}</td><td>${money(line.line_cost)}</td></tr>`).join('')}</tbody><tfoot><tr><th colspan="3">Receipt cost · before tax</th><td>${money(total)}</td></tr></tfoot></table></div><p class="inventory-help">Recorded by ${escape(receipt.recorded_by_email)} · ${escape(new Date(receipt.recorded_at).toLocaleString())}</p>`;
        }catch(error){if(request===detailGeneration)el('receiving-detail-body').textContent=error.message;}
    }
    function browseSuppliers(){
        clearTimeout(timer);supplier='';page=0;
        for(const id of ['receiving-search','receiving-from','receiving-through'])el(id).value='';
        open('history');loadHistory();
    }
    el('receiving-browse').addEventListener('click',browseSuppliers);
    el('receiving-detail-close').addEventListener('click',()=>open(detailOrigin));
    el('receiving-back').addEventListener('click',()=>{++detailGeneration;loadRecent();});
    el('receiving-all-suppliers').addEventListener('click',browseSuppliers);
    el('receiving-search').addEventListener('input',()=>{clearTimeout(timer);supplier='';++generation;el('receiving-vendors').replaceChildren();el('receiving-history-rows').replaceChildren();el('receiving-history-message').textContent='Searching…';pager(true);timer=setTimeout(()=>{page=0;loadHistory();},250);});
    for(const id of ['receiving-from','receiving-through'])el(id).addEventListener('change',()=>{clearTimeout(timer);page=0;loadHistory();});
    el('receiving-previous').addEventListener('click',()=>{page=Math.max(0,page-1);loadHistory();});
    el('receiving-next').addEventListener('click',()=>{page++;loadHistory();});
    el('inventory-refresh').addEventListener('click',()=>{loadRecent();loadHistory();});
    window.shopReceivingWorkspace={refresh:()=>{if(context)loadRecent();}};
    window.trackRightAuthReady.then(value=>{context=value;if(context?.shopId)loadRecent();else el('receiving-recent-message').textContent='A shop session is required.';}).catch(error=>{el('receiving-recent-message').textContent=error.message;});
})();
