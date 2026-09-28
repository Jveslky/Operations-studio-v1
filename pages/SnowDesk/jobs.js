(function () {
  'use strict';
  const KEY = 'snowDeskDraft.v1';
  const $ = (id) => document.getElementById(id);
  let state;
  try { state = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { state = {}; }
  if (!state || typeof state !== 'object') state = {};
  if (!Array.isArray(state.jobs)) state.jobs = [];
  let selectedId = null;
  let estimateHandoff = state.estimateHandoff && typeof state.estimateHandoff === 'object' ? state.estimateHandoff : null;
  if (estimateHandoff) {
    if (['Commercial','Residential'].includes(estimateHandoff.kind)) $('kind').value = estimateHandoff.kind;
    if (['Plow','Plow + salt','Salt'].includes(estimateHandoff.service)) $('service').value = estimateHandoff.service;
    $('price').value = String(estimateHandoff.price || '').slice(0,70);
    $('estimate-preview').hidden = false;
    $('estimate-preview').textContent = 'Estimate carried into intake: '+String(estimateHandoff.details || '')+'. Review and adjust before scheduling.';
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); return true; }
    catch { $('ticket-message').textContent = 'Could not save on this device. Copy the details before leaving.'; return false; }
  }
  const value = (id) => $(id).value.trim();
  const dateLabel = (raw) => { if (!raw) return 'Unscheduled'; const date = new Date(raw); return Number.isNaN(date.valueOf()) ? raw : date.toLocaleString([], {dateStyle:'medium',timeStyle:'short'}); };
  const statusOf = (job) => job.done ? 'Completed' : (job.status === 'Completed' ? 'Scheduled' : (job.status || 'Scheduled'));
  function selected() { return state.jobs.find(j => j.id === selectedId); }
  function optionList(id, values) {
    $(id).replaceChildren();
    for (const entry of [...new Set(values.filter(Boolean))].sort()) {
      const option = document.createElement('option'); option.value = entry; $(id).append(option);
    }
  }
  function choices() {
    optionList('known-properties', state.jobs.map(j => j.address));
    optionList('known-routes', state.jobs.map(j => j.route));
    optionList('known-operators', state.jobs.map(j => j.assigned));
    const current = $('route-filter').value;
    $('route-filter').replaceChildren(new Option('All routes','all'));
    for (const route of [...new Set(state.jobs.map(j => j.route).filter(Boolean))].sort()) $('route-filter').append(new Option(route,route));
    $('route-filter').value = [...$('route-filter').options].some(o => o.value === current) ? current : 'all';
  }
  function render() {
    choices();
    $('open-count').textContent = state.jobs.filter(j => !j.done).length;
    $('bill-count').textContent = state.jobs.filter(j => j.billReady).length;
    const route = $('route-filter').value, view = $('status-filter').value;
    const order = {asap:0,high:1,standard:2,flexible:3};
    const jobs = state.jobs.filter(j => (route === 'all' || (j.route || '') === route) && (view === 'all' || (view === 'done' ? j.done : !j.done)))
      .sort((a,b) => (order[a.priority] ?? 2) - (order[b.priority] ?? 2) || (a.when || '').localeCompare(b.when || ''));
    const list = $('stop-list'); list.replaceChildren();
    if (!jobs.length) { const empty=document.createElement('p'); empty.className='empty'; empty.textContent='No stops in this view yet.'; list.append(empty); return; }
    for (const job of jobs) {
      const row=document.createElement('article'); row.className='stop '+(job.kind === 'Commercial' ? 'commercial' : 'residential');
      const top=document.createElement('div'); top.className='stop-top';
      const title=document.createElement('strong'); title.textContent=job.site || job.address || 'Unnamed stop';
      const badge=document.createElement('span'); badge.className='badge '+(job.priority || 'standard'); badge.textContent=(job.priority || 'standard').toUpperCase();
      top.append(title,badge);
      const detail=document.createElement('small'); detail.textContent=[job.kind || 'Stop',job.work || 'Service',dateLabel(job.when)].join(' · ');
      const location=document.createElement('small'); location.textContent=[job.address,job.route || 'Unrouted',job.assigned || 'Unassigned'].filter(Boolean).join(' · ');
      const actions=document.createElement('div'); actions.className='row';
      const status=document.createElement('span'); status.className='badge'; status.textContent=statusOf(job)+(job.billReady?' · Ready to bill':'')+(job.quote?.status === 'Agreed'?' · Quote agreed':'');
      const open=document.createElement('button'); open.type='button'; open.className='secondary'; open.textContent='Open ticket'; open.addEventListener('click',()=>openTicket(job.id));
      actions.append(status,open); row.append(top,detail,location,actions); list.append(row);
    }
  }
  function appendEvent(job, message) {
    if (!Array.isArray(job.events)) job.events=[];
    job.events.push({at:new Date().toISOString(),detail:message});
  }
  function history(job) {
    const list=$('ticket-history'); list.replaceChildren();
    for (const event of (job.events || []).slice().reverse()) {
      const li=document.createElement('li'); li.textContent=new Date(event.at).toLocaleString()+' · '+event.detail; list.append(li);
    }
    if (!list.children.length) {const li=document.createElement('li');li.textContent='No updates on this device.';list.append(li);}
  }
  function openTicket(id) {
    selectedId=id; const job=selected(); if (!job) return;
    $('ticket').hidden=false;
    $('ticket-title').textContent=job.site || job.address || 'Service ticket';
    $('ticket-subtitle').textContent=[job.address,job.customer,job.phone].filter(Boolean).join(' · ');
    const fields={ 'ticket-status':statusOf(job),'ticket-operator':job.assigned || '', 'ticket-route':job.route || '', 'ticket-when':job.when || '', 'ticket-price':job.quote?.price || job.price || '', 'ticket-quote-status':job.quote?.status || 'Draft', 'ticket-service':job.work || '', 'ticket-condition':job.condition || '', 'ticket-material':job.material || '', 'ticket-quantity':job.quantity || '', 'ticket-notes':job.notes || '' };
    for (const [id,content] of Object.entries(fields)) $(id).value=content;
    $('ready-to-bill').disabled=!!job.billReady;
    $('ready-to-bill').textContent=job.billReady ? 'Ready to bill recorded' : 'Mark ready to bill';
    $('ticket-message').textContent=job.billReady?'Ready to bill; invoicing is not connected.':'';
    $('ticket-estimate').hidden=!(job.quote?.estimate?.details || job.estimateDetails);
    $('ticket-estimate-details').textContent=job.quote?.estimate?.details || job.estimateDetails || '';
    history(job); render();
    $('ticket').scrollIntoView({behavior:'smooth',block:'start'});
  }
  $('address').addEventListener('change',()=>{
    const address=value('address').toLowerCase();
    const previous=state.jobs.slice().reverse().find(j => j.address && j.address.toLowerCase() === address);
    if (!previous) return;
    for (const [id,key] of [['customer','customer'],['phone','phone'],['email','email'],['access','access'],['price','price'],['window-note','windowNote']]) if (!value(id) && previous[key]) $(id).value=previous[key];
    $('kind').value=previous.kind || 'Residential'; $('service').value=previous.work || 'Plow';
    $('intake-message').textContent='Existing property found; check the saved details before scheduling.';
  });
  $('intake-form').addEventListener('submit',(event)=>{
    event.preventDefault();
    if (!value('customer') || !value('address')) return;
    const now=new Date().toISOString();
    const estimate = estimateHandoff ? {details:String(estimateHandoff.details || '').slice(0,600), inputs:estimateHandoff.inputs || null, projectedRevenue:estimateHandoff.projectedRevenue || null} : null;
    const job={id:crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),site:value('customer')+' · '+value('address'),customer:value('customer'),phone:value('phone'),email:value('email'),address:value('address'),kind:value('kind'),work:value('service'),priority:value('priority'),price:value('price'),quote:{price:value('price'),status:value('quote-status'),estimate,recordedAt:now},estimateDetails:estimate?.details || '',access:value('access'),route:value('route'),assigned:value('operator'),when:value('when'),windowNote:value('window-note'),done:false,status:'Scheduled',billReady:false,events:[{at:now,detail:'Job added'+(value('when')?' and scheduled':' without a service time')+(value('quote-status')==='Agreed'?' · quote agreed':'')}],createdAt:now};
    state.jobs.push(job);
    delete state.estimateHandoff;
    if (!save()) {state.jobs.pop();if(estimateHandoff)state.estimateHandoff=estimateHandoff;$('intake-message').textContent='Could not save this stop on this device.';return;}
    $('intake-form').reset(); $('intake-message').textContent='Stop added. Open the ticket to update status or document service.';
    $('estimate-preview').hidden=true;
    estimateHandoff=null;
    render();openTicket(job.id);
  });
  $('save-ticket').addEventListener('click',()=>{
    const job=selected(); if(!job)return;
    const update={status:value('ticket-status'),assigned:value('ticket-operator'),route:value('ticket-route'),when:value('ticket-when'),price:value('ticket-price'),work:value('ticket-service'),condition:value('ticket-condition'),material:value('ticket-material'),quantity:value('ticket-quantity'),notes:value('ticket-notes')};
    const changed=Object.entries(update).filter(([key,entry])=>String(job[key] || '')!==entry).map(([key])=>key);
    const quoteStatus=value('ticket-quote-status');
    if ((job.quote?.status || 'Draft')!==quoteStatus) changed.push('quote agreement');
    if (!changed.length) { $('ticket-message').textContent='No changes to record.';return; }
    Object.assign(job,update);job.done=update.status==='Completed';
    const now=new Date().toISOString();if(update.status==='Service Started'&&!job.startedAt)job.startedAt=now;if(job.done&&!job.completedAt)job.completedAt=now;
    job.quote={...(job.quote || {}),price:update.price,status:quoteStatus,recordedAt:now};
    appendEvent(job,'Updated '+changed.join(', ')+(job.done?' · completed at '+new Date(now).toLocaleString():''));
    if (!save())return;
    $('ticket-message').textContent='Update recorded on this device.';history(job);render();
  });
  $('ready-to-bill').addEventListener('click',()=>{
    const job=selected();if(!job)return;
    if (!job.done) { $('ticket-message').textContent='Record Completed status before marking ready to bill.';return; }
    if (job.billReady)return;
    job.billReady=true;appendEvent(job,'Marked ready to bill');if(!save())return;
    $('ticket-message').textContent='Ready to bill. Invoice creation is not connected yet.';$('ready-to-bill').disabled=true;render();history(job);
  });
  function notifyCustomer(kind) {
    const job=selected();if(!job)return;
    const status=statusOf(job),message=`${job.customer || 'Hello'}, your ${job.work || 'snow service'} at ${job.address || job.site} is ${status.toLowerCase()}. ${job.windowNote || 'We will update you when service status changes.'}`;
    if(kind==='sms') {
      if(!job.phone) { $('ticket-message').textContent='Add a phone number to this property before opening a text.';return; }
      window.location.href=`sms:${encodeURIComponent(job.phone)}?body=${encodeURIComponent(message)}`;
    } else {
      if(!job.email) { $('ticket-message').textContent='Add an email during intake before opening a message.';return; }
      window.location.href=`mailto:${encodeURIComponent(job.email)}?subject=${encodeURIComponent('Snow service update')}&body=${encodeURIComponent(message)}`;
    }
  }
  $('text-customer').addEventListener('click',()=>notifyCustomer('sms'));
  $('email-customer').addEventListener('click',()=>notifyCustomer('email'));
  $('print-ticket').addEventListener('click',()=>window.print());
  $('close-ticket').addEventListener('click',()=>{$('ticket').hidden=true;selectedId=null;});
  $('route-filter').addEventListener('change',render);
  $('status-filter').addEventListener('change',render);
  render();
}());
