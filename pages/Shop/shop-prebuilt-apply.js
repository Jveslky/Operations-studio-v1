(function(){
'use strict';
window.shopPrebuiltApply={async mount({order,stockEditor,fields,changed}){
 const context=await window.trackRightAuthReady;if(!window.trackRightCan('repair_orders.write')||!['owner','admin','service_writer'].includes(context.role))return;
 const host=document.getElementById('stocked-estimate-parts');if(!host)return;
 const section=document.createElement('section');section.className='detail-card';const title=document.createElement('h3');title.textContent='Prebuilt jobs';const link=document.createElement('a');link.href='prebuilt-jobs.html';link.target='_blank';link.rel='noopener';link.textContent='Manage shop catalog';const select=document.createElement('select');select.setAttribute('aria-label','Choose prebuilt job');const button=document.createElement('button');button.type='button';button.className='secondary-btn';button.textContent='Review prebuilt';const status=document.createElement('p');status.setAttribute('role','status');const allocation=document.createElement('p');allocation.id='prebuilt-allocation-summary';section.append(title,link,select,button,status,allocation);host.before(section);
 let templates=[],busy=false,pickerOpen=false;
 if(order.estimatePrebuiltJobs===undefined||!order.prebuiltAllocationsAvailable){status.textContent='Prebuilt migration is required before adding jobs.';button.disabled=true;return;}
 async function load(){const r=await window.trackRightSupabase.from('shop_prebuilt_jobs').select('*').eq('shop_id',context.shopId).eq('archived',false).order('updated_at',{ascending:false}).limit(200);if(r.error)throw r.error;templates=r.data;select.replaceChildren();for(const t of templates){const o=document.createElement('option');o.value=t.id;o.textContent=`${t.definition.name} · ${t.definition.mode}`;select.append(o);}button.disabled=!templates.length;status.textContent=templates.length?'Choose a job, review quantities and prices, then save the RO to reserve stock.':'Create a prebuilt in the shop catalog first.';}
 button.onclick=async()=>{if(busy)return;busy=true;button.disabled=true;try{
  const t=templates.find(t=>t.id===select.value);if(!t)return;
  const latest=await window.trackRightSupabase.from('shop_prebuilt_jobs').select('*').eq('id',t.id).eq('shop_id',context.shopId).single();if(latest.error)throw latest.error;if(latest.data.archived)throw Error('Template is archived. Refresh the page.');
  const template=structuredClone(latest.data);
  for(const l of template.definition.lines){if(!l.item_id)continue;const r=await window.trackRightSupabase.rpc('shop_inventory_directory',{p_shop:context.shopId,p_search:l.part_number||'',p_filter:'active',p_page:0,p_size:25});if(r.error)throw r.error;const item=r.data.rows.find(i=>i.id===l.item_id);if(!item)throw Error('A stocked part is unavailable. Update the template first.');Object.assign(l,{description:item.description,part_number:item.part_number,stock_unit:item.stock_unit,unit_price:Number(item.sale_price)});}
  const q=await window.shopPrebuiltEditor.edit(template,{shopId:context.shopId,rate:Number(fields.rate.value||0),readOnly:true});if(!q)return;
  if(q.laborHours>0&&Number(fields.rate.value||0)<=0)throw Error('Enter the estimate labor rate before adding itemized labor.');
  if(q.lines.some(l=>l.item_id)&&!stockEditor)throw Error('Stock editor unavailable. No job added.');
  if(order.estimatePrebuiltJobs.length>=100)throw Error('At most 100 prebuilt instances per estimate.');
  const oldParts=Number(fields.parts.value||0);
  // Existing line value is preserved when adding a second use of the same part.
  // Package billing is carried by the estimate totals, not charged twice here.
  if(stockEditor)stockEditor.addLines(q.lines.filter(l=>l.item_id).map(l=>({item_id:l.item_id,part_number:l.part_number,description:l.description,stock_unit:l.stock_unit,quantity:l.quantity,unit_price:0})));
  fields.parts.value=(oldParts+q.parts).toFixed(2);
  const summary=`${q.definition.name} (${q.definition.mode}): prebuilt labor $${q.labor.toFixed(2)}, prebuilt parts $${q.parts.toFixed(2)}, expected job time ${q.expectedHours} h; billable hours ${q.laborHours} h × $${q.rate.toFixed(2)}. ${q.lines.map(l=>`${l.part_number||l.description}: ${l.quantity} ${l.stock_unit||'units'}, charge $${l.charge.toFixed(2)}`).join('; ')}`;
  fields.notes.value=[fields.notes.value,summary].filter(Boolean).join('\n');
  order.estimatePrebuiltJobs.push({schema_version:2,instance_id:crypto.randomUUID(),template_id:template.id,template_version:template.version,added_at:new Date().toISOString(),definition:q.definition,quote:q,summary});
  Object.assign(order,{estimatePrebuiltLaborTotal:window.shopPrebuiltPricing.totals(order.estimatePrebuiltJobs).labor,estimatePrebuiltPartsTotal:window.shopPrebuiltPricing.totals(order.estimatePrebuiltJobs).parts});
  changed();status.textContent='Added to the unsaved estimate. Review totals and tax, then save; normal approval revision and stock checks apply.';
 }catch(e){status.textContent=e.message;}finally{busy=false;button.disabled=!templates.length;}};
 window.shopPrebuiltApply.openCurrent=async()=>{
  if(busy||pickerOpen)return;pickerOpen=true;
  const dialog=document.createElement('dialog');dialog.className='prebuilt-dialog';dialog.setAttribute('aria-label','Add prebuilt to current repair order');
  const heading=document.createElement('h2');heading.textContent='Add prebuilt';
  const info=document.createElement('p');info.textContent=`Current repair order${order.customer?' · '+order.customer:''} · Labor rate $${Number(fields.rate.value||0).toFixed(2)}/h`;
  const picker=document.createElement('select');picker.setAttribute('aria-label','Active prebuilt jobs');
  const note=document.createElement('p');note.setAttribute('role','status');note.textContent='Loading active jobs…';
  const actions=document.createElement('div');actions.className='prebuilt-actions';const review=document.createElement('button');review.type='button';review.textContent='Review prebuilt';review.disabled=true;
  const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancel';cancel.onclick=()=>dialog.close();actions.append(review,cancel);dialog.append(heading,info,picker,note,actions);document.body.append(dialog);dialog.addEventListener('close',()=>{pickerOpen=false;dialog.remove()},{once:true});dialog.showModal();
  try{await load();if(!dialog.open)return;for(const t of templates){const option=document.createElement('option');option.value=t.id;option.textContent=`${t.definition.name} · ${t.definition.mode}`;picker.append(option)}review.disabled=!templates.length;note.textContent=templates.length?'Review parts, quantities and pricing before adding to this estimate.':'No active jobs. Create one in Inventory → Prebuilt Jobs.';}catch(e){note.textContent='Catalog unavailable: '+e.message;}
  review.onclick=async()=>{if(review.disabled)return;select.value=picker.value;dialog.close();await button.onclick();section.scrollIntoView({block:'center'});};
 };
 window.dispatchEvent(new CustomEvent('longshift:prebuilt-ready'));
 try{await load();}catch(e){status.textContent='Prebuilt catalog unavailable: '+e.message;button.disabled=true;}
}};
})();
