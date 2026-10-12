/* Customer desk queries stay bounded and shop-scoped; existing edit/intake flows remain in customers.js. */
(function () {
    const el=id=>document.getElementById(id), money=n=>Number(n||0).toLocaleString('en-US',{style:'currency',currency:'USD'});
    const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    let page=0,total=0,search='',directoryRequest=0,activityRequest=0,activeCustomer=null,ordersPage=0,invoicesPage=0;
    const size=25;
    async function rpc(name,args) {
        const context=await window.trackRightAuthReady;
        const result=await window.trackRightSupabase.rpc(name,{p_shop:context.shopId,...args});
        if(result.error) throw new Error(result.error.message);
        return result.data;
    }
    function pager(prefix,current,count,busy=false) {
        el(prefix+'-previous').disabled=busy||current===0;
        el(prefix+'-next').disabled=busy||(current+1)*size>=count;
        el(prefix+'-page-label').textContent=count?`${current*size+1}–${Math.min((current+1)*size,count)} of ${count}`:'0 records';
    }
    async function directory(openRecord) {
        const request=++directoryRequest,list=el('customer-directory-list');
        pager('customer-directory',page,total,true);list.setAttribute('aria-busy','true');
        el('customer-directory-message').textContent='Loading customers…';
        try {
            const data=await rpc('shop_customer_directory',{p_search:search,p_page:page,p_size:size});
            if(request!==directoryRequest)return false;
            total=Number(data.count);
            if(page>0&&page*size>=total){page=Math.max(0,Math.ceil(total/size)-1);return directory(openRecord);}
            el('customer-count').textContent=data.summary.customers;el('customer-vehicle-count').textContent=data.summary.vehicles;
            el('customer-open-ro-count').textContent=data.summary.open_orders;el('customer-ar-total').textContent=money(data.summary.balance);
            list.replaceChildren();
            for(const customer of data.rows){
                const row=document.createElement('button');row.type='button';row.className='customer-desk-row';
                row.innerHTML=`<span class="customer-desk-identity"><strong>${escape(customer.name||'Unnamed customer')}</strong><span>${escape(customer.contact_name||'')}</span></span><span class="customer-desk-contact"><span>${escape(customer.phone||'—')}</span><span>${escape(customer.email||'—')}</span></span><span class="customer-desk-metrics"><span>${customer.vehicles} vehicles · ${customer.open_orders} open ROs</span><strong>${money(customer.balance)} A/R</strong></span>`;
                row.addEventListener('click',()=>openRecord(customer.id));list.append(row);
            }
            el('customer-directory-message').textContent=total?(search?`Matches for “${search}”`:'Customers A–Z'):(search?'No matching customers. Try a name, phone, email, vehicle or VIN.':'No customers added yet.');
            pager('customer-directory',page,total);return true;
        }catch(error){if(request!==directoryRequest)return false;list.replaceChildren();el('customer-directory-message').textContent=`Could not load customer desk: ${error.message}. Install the customer desk database update if it is missing.`;return false;}
        finally{if(request===directoryRequest)list.setAttribute('aria-busy','false');}
    }
    function renderActivity(data){
        const orders=el('customer-repair-history'),invoices=el('customer-invoice-history');orders.replaceChildren();invoices.replaceChildren();
        el('customer-record-balance').textContent=money(data.balance);
        for(const order of data.orders){const link=document.createElement('a');link.className='customer-history-card';const id=order.ro_number??order.legacy_local_id??order.id;
            link.href=`repair-order-details.html?id=${encodeURIComponent(id)}`;link.innerHTML=`<div class="customer-history-card-heading"><h3>RO #${escape(id)}</h3><span class="customer-history-status">${escape(order.status)}</span></div><p>${escape(order.unit_name||'No vehicle recorded')}</p><p>${escape(order.complaint||'No work description')}</p>`;orders.append(link);}
        for(const invoice of data.invoices){const link=document.createElement('a');link.className='customer-invoice-row';const id=invoice.invoice_number??invoice.legacy_local_id??invoice.id;
            link.href=`invoice-details.html?id=${encodeURIComponent(id)}`;link.innerHTML=`<strong>Invoice #${escape(id)}</strong><span class="customer-invoice-status ${invoice.status==='Paid'?'is-paid':invoice.status==='Sent'?'is-sent':''}">${escape(invoice.status)}</span><strong>${money(invoice.total)}</strong><span>${invoice.paid_at?'Paid '+escape(new Date(invoice.paid_at).toLocaleDateString()):invoice.due_date?'Due '+escape(invoice.due_date):'No due date'}</span>`;invoices.append(link);}
        if(!data.orders.length)orders.textContent='No repair history for this customer.';
        if(!data.invoices.length)invoices.textContent='No invoices for this customer.';
        pager('customer-orders',ordersPage,Number(data.orders_count));pager('customer-invoices',invoicesPage,Number(data.invoices_count));
    }
    async function activity(customerId,reset=true){
        if(reset){ordersPage=0;invoicesPage=0;}activeCustomer=String(customerId);const request=++activityRequest;
        el('customer-activity-message').textContent='Loading customer activity…';el('customer-record-balance').textContent='—';
        el('customer-repair-history').replaceChildren();el('customer-invoice-history').replaceChildren();
        pager('customer-orders',ordersPage,0,true);pager('customer-invoices',invoicesPage,0,true);
        try{const data=await rpc('shop_customer_activity',{p_customer:activeCustomer,p_orders_page:ordersPage,p_invoices_page:invoicesPage});if(request!==activityRequest)return;renderActivity(data);el('customer-activity-message').textContent='A/R includes sent, unpaid invoices. Drafts are excluded.';}
        catch(error){if(request===activityRequest)el('customer-activity-message').textContent=`Could not load customer activity: ${error.message}`;}
    }
    window.shopCustomerDesk={directory,activity,cancelActivity(){++activityRequest;activeCustomer=null;},initialize(openRecord){
        let timer;
        el('customer-search-input').addEventListener('input',()=>{clearTimeout(timer);++directoryRequest;pager('customer-directory',page,total,true);timer=setTimeout(()=>{search=el('customer-search-input').value.trim();page=0;directory(openRecord);},250);});
        for(const [id,delta]of [['customer-directory-previous',-1],['customer-directory-next',1]])el(id).addEventListener('click',()=>{page=Math.max(0,page+delta);directory(openRecord);});
        for(const [prefix,kind]of [['customer-orders','orders'],['customer-invoices','invoices']])for(const [suffix,delta]of [['previous',-1],['next',1]])el(prefix+'-'+suffix).addEventListener('click',()=>{if(!activeCustomer)return;if(kind==='orders')ordersPage=Math.max(0,ordersPage+delta);else invoicesPage=Math.max(0,invoicesPage+delta);activity(activeCustomer,false);});
    }};
})();
