(function () {
    'use strict';
    const el = id => document.getElementById(id);
    const money = value => Number(value || 0).toLocaleString('en-US', {style:'currency',currency:'USD'});
    const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const invoiceId = row => row.invoice_number ?? row.legacy_local_id ?? row.id;
    let page=0,detailPage=0,count=0,customer=null,generation=0,timer;
    const size=()=>Number(el('net-size').value);
    function message(text,error=false){el('net-message').textContent=text;el('net-message').classList.toggle('is-error',error);}
    function pager(busy=false){const current=customer?detailPage:page;el('net-previous').disabled=busy||current===0;el('net-next').disabled=busy||(current+1)*size()>=count;el('net-page-label').textContent=count?`${current*size()+1}–${Math.min((current+1)*size(),count)} of ${count}`:'0 records';}
    function aging(summary){
        const metrics=[['Outstanding','balance'],['Not yet overdue','current_amount'],['Overdue','overdue'],['1–30 days overdue','age_1_30'],['31–60 days overdue','age_31_60'],['61–90 days overdue','age_61_90'],['91+ days overdue','age_90_plus'],['No due date — review','undated']];
        const tone = key => {
            if (!(Number(summary[key]) > 0)) return 'is-neutral';
            if (key === 'current_amount') return 'is-current';
            if (key === 'undated') return 'is-review';
            if (key === 'age_1_30') return 'is-amber';
            if (key === 'age_31_60') return 'is-orange';
            if (key === 'age_61_90' || key === 'age_90_plus') return 'is-red';
            if (key === 'overdue') return Number(summary.age_61_90)>0 || Number(summary.age_90_plus)>0 ? 'is-red' : Number(summary.age_31_60)>0 ? 'is-orange' : 'is-amber';
            return 'is-neutral';
        };
        el('net-summary').innerHTML=metrics.map(([label,key])=>`<article class="${tone(key)}"><small>${label}</small><strong>${money(summary[key])}</strong>${key==='undated' && Number(summary[key])>0?'<span class="net-review-badge">Review due dates</span>':''}</article>`).join('');
    }
    function renderAccount(account){
        el('net-account-info').innerHTML=`<h2>${escape(account.name||'Unnamed customer')}</h2><p>${escape(account.account_number||'No account number')} · ${account.terms_days?'NET '+account.terms_days:'Due Upon Receipt defaults'} <span class="net-badge ${account.account_status==='hold'?'warning':''}">${account.account_status==='hold'?'On hold':'Active'}</span></p><p>${escape(account.billing_contact||'No billing contact')} · ${escape(account.billing_email||'No billing email')} · ${escape(account.billing_phone||'No billing phone')}</p><p>${account.credit_limit==null?'No credit limit set':'Credit limit: '+money(account.credit_limit)+' (informational)'}${account.archived?' · Archived customer with outstanding NET work':''}</p><a href="customers.html?customer=${encodeURIComponent(account.id)}">Customer profile &amp; full history →</a>`;
    }
    function renderDirectory(rows){
        const list=el('net-rows');list.replaceChildren();
        for(const account of rows){const button=document.createElement('button');button.type='button';button.className='net-account';button.innerHTML=`<span><strong>${escape(account.name||'Unnamed customer')}</strong><small>${escape(account.account_number||'No account number')} · ${account.terms_days?'NET '+account.terms_days:'Prior NET invoices'}</small><span class="net-badge ${account.account_status==='hold'?'warning':''}">${account.account_status==='hold'?'On hold':'Active'}${account.archived?' · Archived':''}</span></span><span>${escape(account.billing_contact||'No billing contact')}<small>${escape(account.billing_email||account.billing_phone||'No billing contact details')}</small><small>${account.invoice_count} outstanding invoices${account.oldest_due?' · Oldest due '+escape(account.oldest_due):''}</small></span><span class="money"><strong>${money(account.balance)}</strong><small>${money(account.overdue)} overdue</small></span>`;button.addEventListener('click',()=>{customer=account.id;detailPage=0;load();});list.append(button);}
    }
    function renderInvoices(rows){
        el('net-invoices').innerHTML=rows.length?rows.map(row=>`<article class="net-invoice"><div><a href="invoice-details.html?id=${encodeURIComponent(invoiceId(row))}">Invoice #${escape(invoiceId(row))}</a><small>${row.terms_days?'NET '+row.terms_days:'Due Upon Receipt'}${row.purchase_order?' · PO '+escape(row.purchase_order):''}</small>${row.ro_number?`<small><a href="repair-order-details.html?id=${encodeURIComponent(row.ro_number)}">RO #${escape(row.ro_number)}</a> · ${escape(row.ro_status||'')}</small>`:''}</div><div><strong>${money(row.balance_due)} due</strong><small>${money(row.total)} total · ${money(row.paid_total)} paid</small></div><div>${row.due_date?'Due '+escape(row.due_date):'No due date'}<small>${row.days_overdue==null?'Review due date':row.days_overdue>0?row.days_overdue+' days overdue':'Not overdue'}</small></div><a class="pay-link" href="invoice-details.html?id=${encodeURIComponent(invoiceId(row))}&amp;action=record-payment">Record Payment</a></article>`).join(''):'No outstanding invoices. Open the customer profile for paid invoices and full history.';
    }
    async function load(){
        const request=++generation;pager(true);message('Loading account balances…');
        // Clear old amounts while fetching; never present stale balances after a failed refresh.
        el('net-summary').replaceChildren();el('net-rows').replaceChildren();el('net-account-info').replaceChildren();el('net-invoices').replaceChildren();el('net-as-of').textContent='';
        el('net-directory').hidden=!!customer;el('net-detail').hidden=!customer;el('net-back').hidden=!customer;
        try{
            const context=await window.trackRightAuthReady;
            if(!['owner','admin','service_writer'].includes(context?.role))throw Error('Your role cannot open NET Accounts.');
            const args=customer?{p_shop:context.shopId,p_customer:customer,p_page:detailPage,p_size:size()}:{p_shop:context.shopId,p_search:el('net-search').value.trim(),p_filter:el('net-filter').value,p_sort:el('net-sort').value,p_page:page,p_size:size()};
            const result=await window.trackRightSupabase.rpc(customer?'shop_net_account_invoices':'shop_net_accounts',args);
            if(request!==generation)return;if(result.error)throw Error(result.error.message);
            const data=result.data;count=Number(data.count);
            if((customer?detailPage:page)>0&&(customer?detailPage:page)*size()>=count){if(customer)detailPage=Math.max(0,Math.ceil(count/size())-1);else page=Math.max(0,Math.ceil(count/size())-1);return load();}
            aging(customer?data.account:data.summary);
            el('net-as-of').textContent=`As of ${data.as_of} in the shop timezone · ${customer?'Selected account':count+' matching accounts'} · Balances refreshed from invoices and payments`;
            if(customer){renderAccount(data.account);renderInvoices(data.rows);}else renderDirectory(data.rows);
            message(customer?'All issued invoice terms remain unchanged.':count?'Select an account to review its outstanding invoices.':'No matching NET accounts.');pager();
        }catch(error){if(request!==generation)return;count=0;el('net-detail').hidden=true;message(`Could not load NET Accounts: ${error.message} If the workspace has not been installed, run the NET Accounts SQL update.`,true);pager();}
    }
    el('net-refresh').addEventListener('click',()=>{clearTimeout(timer);load();});
    for(const id of ['net-filter','net-sort','net-size'])el(id).addEventListener('change',()=>{clearTimeout(timer);page=0;load();});
    el('net-search').addEventListener('input',()=>{clearTimeout(timer);++generation;pager(true);timer=setTimeout(()=>{page=0;load();},250);});
    el('net-back').addEventListener('click',()=>{customer=null;load();});
    el('net-previous').addEventListener('click',()=>{if(customer)detailPage=Math.max(0,detailPage-1);else page=Math.max(0,page-1);load();});
    el('net-next').addEventListener('click',()=>{if(customer)detailPage++;else page++;load();});
    load();
})();
