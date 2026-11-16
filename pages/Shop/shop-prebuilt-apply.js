(function(){
'use strict';
window.shopPrebuiltApply={async mount({order,stockEditor,fields,changed}){
 const context=await window.trackRightAuthReady;if(!window.trackRightCan('repair_orders.write')||!['owner','admin','service_writer'].includes(context.role))return;
 const host=document.getElementById('stocked-estimate-parts');if(!host)return;
 const section=document.createElement('section');section.className='detail-card ro-prebuilt-picker';const title=document.createElement('h3');title.textContent='Prebuilt jobs';const link=document.createElement('a');link.href='prebuilt-jobs.html';link.target='_blank';link.rel='noopener';link.textContent='Open Prebuilt Jobs';const select=document.createElement('select');select.setAttribute('aria-label','Choose prebuilt job');const button=document.createElement('button');button.type='button';button.className='primary-btn';button.textContent='Add prebuilt job';const status=document.createElement('p');status.setAttribute('role','status');const allocation=document.createElement('p');allocation.id='prebuilt-allocation-summary';const controls=document.createElement('div');controls.className='ro-prebuilt-controls';
 const search=document.createElement('input');search.type='search';search.placeholder='Find a prebuilt job';search.setAttribute('aria-label','Find a prebuilt job');
 const jobs=document.createElement('ul');jobs.className='ro-prebuilt-jobs';
 controls.append(button);section.append(title,link,controls,status,jobs,allocation);host.before(section);
 let templates=[],pickerOpen=false;
 if(order.estimatePrebuiltJobs===undefined||!order.prebuiltAllocationsAvailable){status.textContent='Prebuilt migration is required before adding jobs.';button.disabled=true;return;}
 function renderJobs(){
  jobs.replaceChildren();
  for(const job of order.estimatePrebuiltJobs){
   const item=document.createElement('li');
   const name=document.createElement('strong');
   name.textContent=job.definition?.name||job.quote?.definition?.name||'Prebuilt job';
   item.append(name);
   if(Number.isFinite(job.quote?.total)){
    const amount=document.createElement('span');
    amount.textContent=`$${job.quote.total.toFixed(2)} before tax`;
    item.append(amount);
   }
   jobs.append(item);
  }
 }
 renderJobs();
 async function load(){const r=await window.trackRightSupabase.from('shop_prebuilt_jobs').select('*').eq('shop_id',context.shopId).eq('archived',false).order('updated_at',{ascending:false}).limit(200);if(r.error)throw r.error;return r.data||[];}
 function renderOptions(add,note,mode){
  const selected=select.value;
  const query=search.value.trim().toLowerCase();
  const matches=templates.filter(t=>(mode==='mixed'||t.definition.mode===mode)&&t.definition.name.toLowerCase().includes(query));
  select.replaceChildren();
  for(const template of matches){
   const option=document.createElement('option');option.value=template.id;
   option.textContent=`${template.definition.name} · ${template.definition.mode}`;
   select.append(option);
  }
  if(matches.some(template=>template.id===selected))select.value=selected;
  add.disabled=!matches.length;
  note.textContent=matches.length?'':templates.length?'No matching jobs in this category.':'No active jobs. Add one in the catalog.';
 }
 async function quoteJob(templateId){
  const latest=await window.trackRightSupabase.from('shop_prebuilt_jobs').select('*').eq('id',templateId).eq('shop_id',context.shopId).single();if(latest.error)throw latest.error;if(latest.data.archived)throw Error('Template is archived. Refresh the page.');
  const template=structuredClone(latest.data);
  for(const l of template.definition.lines){if(!l.item_id)continue;const r=await window.trackRightSupabase.rpc('shop_inventory_directory',{p_shop:context.shopId,p_search:l.part_number||'',p_filter:'active',p_page:0,p_size:25});if(r.error)throw r.error;const item=r.data.rows.find(i=>i.id===l.item_id);if(!item)throw Error('A stocked part is unavailable. Update the template first.');Object.assign(l,{description:item.description,part_number:item.part_number,stock_unit:item.stock_unit,unit_price:Number(item.sale_price)});}
  const quote=window.shopPrebuiltPricing.quote(template.definition,Number(fields.rate.value||0));
  return {template,quote};
 }
 function addJob(template,q,extraPart,extraHours,nonStock){
  if(q.laborHours>0&&Number(fields.rate.value||0)<=0)throw Error('Enter the estimate labor rate before adding itemized labor.');
  if(q.lines.some(l=>l.item_id)&&!stockEditor)throw Error('Stock editor unavailable. No job added.');
  if(order.estimatePrebuiltJobs.length>=100)throw Error('At most 100 prebuilt instances per estimate.');
  if(extraPart&&!stockEditor)throw Error('Stock editor unavailable. No job added.');
  const extraCharge=extraPart?Math.round(extraPart.quantity*extraPart.unit_price*100)/100:0;
  const oldParts=Number(fields.parts.value||0);
  // Existing line value is preserved when adding a second use of the same part.
  // Package billing is carried by the estimate totals, not charged twice here.
  const stockLines=q.lines.filter(l=>l.item_id).map(l=>({item_id:l.item_id,part_number:l.part_number,description:l.description,stock_unit:l.stock_unit,quantity:l.quantity,unit_price:0}));
  // The add-on charge is included in Parts Total even when it shares a stock line with the package.
  if(extraPart)stockLines.push(extraPart);
  if(stockEditor)stockEditor.addLines(stockLines);
  fields.parts.value=(oldParts+q.parts+extraCharge+(nonStock?.total||0)).toFixed(2);
  if(extraHours)fields.hours.value=String(Math.round((Number(fields.hours.value||0)+extraHours)*1000)/1000);
  const summary=`${q.definition.name} (${q.definition.mode}): prebuilt labor $${q.labor.toFixed(2)}, prebuilt parts $${q.parts.toFixed(2)}, expected job time ${q.expectedHours} h; billable hours ${q.laborHours} h × $${q.rate.toFixed(2)}. ${q.lines.map(l=>`${l.part_number||l.description}: ${l.quantity} ${l.stock_unit||'units'}, charge $${l.charge.toFixed(2)}`).join('; ')}`;
  fields.notes.value=[fields.notes.value,summary,
   extraPart&&`Add-on part: ${extraPart.part_number} · ${extraPart.quantity} ${extraPart.stock_unit} · $${extraCharge.toFixed(2)}`,
   nonStock&&`Non-stock part: ${nonStock.description} · $${nonStock.total.toFixed(2)}`,
   extraHours&&`Add-on labor: ${extraHours} h × $${q.rate.toFixed(2)}`].filter(Boolean).join('\n');
  order.estimatePrebuiltJobs.push({schema_version:2,instance_id:crypto.randomUUID(),template_id:template.id,template_version:template.version,added_at:new Date().toISOString(),definition:q.definition,quote:q,summary});
  Object.assign(order,{estimatePrebuiltLaborTotal:window.shopPrebuiltPricing.totals(order.estimatePrebuiltJobs).labor,estimatePrebuiltPartsTotal:window.shopPrebuiltPricing.totals(order.estimatePrebuiltJobs).parts});
  renderJobs();changed();status.textContent='Job added. Save the repair order to keep it.';
 }
 window.shopPrebuiltApply.openCurrent=async()=>{
  if(pickerOpen)return;
  pickerOpen=true;
  search.value='';select.replaceChildren();templates=[];
  const dialog=document.createElement('dialog');
  dialog.className='prebuilt-dialog ro-prebuilt-dialog';
  dialog.setAttribute('aria-label','Add prebuilt job');
  const heading=document.createElement('h2');heading.textContent='Add prebuilt job';
  const info=document.createElement('p');info.textContent=`Current repair order${order.customer?' · '+order.customer:''} · Labor rate $${Number(fields.rate.value||0).toFixed(2)}/h`;
  const note=document.createElement('p');note.setAttribute('role','status');note.textContent='Loading active jobs…';
  const actions=document.createElement('div');actions.className='prebuilt-actions';
  const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancel';cancel.onclick=()=>dialog.close();
  const add=document.createElement('button');add.type='button';add.textContent='Add to estimate';add.disabled=true;
  const catalogLink=link.cloneNode(true);
  const categories=document.createElement('div');categories.className='ro-prebuilt-categories';
  categories.setAttribute('role','group');categories.setAttribute('aria-label','Pricing type');
  let mode='flat',loading=true,adding=false;
  const filter=()=>renderOptions(add,note,mode);
  const extras=document.createElement('fieldset');extras.hidden=true;
  const legend=document.createElement('legend');legend.textContent='Optional add-ons';extras.append(legend);
  function extraField(labelText,type,value){
   const label=document.createElement('label');label.textContent=labelText;
   const input=document.createElement('input');input.type=type;input.value=value;
   label.append(input);extras.append(label);return input;
  }
  const partNumber=extraField('Stocked part number','text','');
  const quantity=extraField('Part quantity','number','1');quantity.min='0.001';quantity.step='0.001';
  const hours=extraField('Additional labor hours','number','');hours.min='0';hours.step='0.1';
  const nonStockDescription=extraField('Non-stock part number or description','text','');
  nonStockDescription.maxLength=150;
  const nonStockPrice=extraField('Non-stock part total','number','');nonStockPrice.min='0';nonStockPrice.step='0.01';
  function getNonStockPart(){
   const description=nonStockDescription.value.trim();
   const price=nonStockPrice.value;
   if(!description&&!price)return null;
   if(!description||!/^\d+(?:\.\d{1,2})?$/.test(price)||Number(price)>9999999){
    throw Error('Enter a non-stock part number or description and a valid line total.');
   }
   return {description,total:Number(price)};
  }
  async function getExtraPart(number,count){
   if(!number)return null;
   if(!Number.isFinite(count)||count<=0||count>9999999||Math.abs(count*1000-Math.round(count*1000))>0.00001)throw Error('Enter a positive part quantity with up to three decimals.');
   const result=await window.trackRightSupabase.rpc('shop_inventory_directory',{p_shop:context.shopId,p_search:number,p_filter:'active',p_page:0,p_size:25});
   if(result.error)throw result.error;
   const item=result.data.rows.find(row=>row.part_number.toLowerCase()===number.toLowerCase());
   if(!item)throw Error('Enter an exact active stocked part number.');
   return {item_id:item.id,part_number:item.part_number,description:item.description,stock_unit:item.stock_unit,quantity:count,unit_price:Number(item.sale_price)};
  }
  const categoryButtons=['flat','mixed'].map(value=>{
   const category=document.createElement('button');category.type='button';
   category.textContent=value[0].toUpperCase()+value.slice(1);
   category.onclick=()=>selectCategory(value);
   categories.append(category);
   return [value,category];
  });
  function selectCategory(value){
   mode=value;extras.hidden=mode!=='mixed';
   for(const [key,category] of categoryButtons)category.setAttribute('aria-pressed',String(key===mode));
   catalogLink.href='prebuilt-jobs.html?mode='+mode;
   catalogLink.textContent='Build a '+mode+' job in Prebuilt Jobs';
   if(!loading)filter();
  }
  selectCategory(mode);
  actions.append(cancel,add);dialog.append(heading,categories,info,search,select,extras,note,actions,catalogLink);
  document.body.append(dialog);
  dialog.addEventListener('close',()=>{
   pickerOpen=false;search.removeEventListener('input',filter);dialog.remove();
  },{once:true});
  add.onclick=async()=>{
   if(add.disabled||adding||!dialog.open||!select.value)return;
   adding=true;
   const id=select.value;
   add.disabled=search.disabled=select.disabled=extras.disabled=true;
   for(const [,category] of categoryButtons)category.disabled=true;
   note.textContent='Checking pricing and stocked parts…';
   try{
    const {template,quote}=await quoteJob(id);
    const extraHours=mode==='mixed'?Number(hours.value||0):0;
    if(!Number.isFinite(extraHours)||extraHours<0||extraHours>9999999||Math.abs(extraHours*10-Math.round(extraHours*10))>0.00001)throw Error('Enter labor hours in tenths of an hour.');
    if(extraHours&&quote.rate<=0)throw Error('Enter the estimate labor rate before adding labor.');
    const extraPart=mode==='mixed'?await getExtraPart(partNumber.value.trim(),Number(quantity.value)):null;
    if(!dialog.open)return;
    const nonStock=mode==='mixed'?getNonStockPart():null;
    addJob(template,quote,extraPart,extraHours,nonStock);
    dialog.close();section.scrollIntoView({block:'nearest'});
   }catch(e){if(dialog.open)note.textContent=e.message;}
   finally{
    adding=false;
    if(dialog.open){
     add.disabled=search.disabled=select.disabled=extras.disabled=false;
     for(const [,category] of categoryButtons)category.disabled=false;
    }
   }
  };
  dialog.showModal();
  search.focus();
  try{
   const loaded=await load();
   if(!dialog.open)return;
   templates=loaded;loading=false;
   filter();
   search.addEventListener('input',filter);
  }catch(e){note.textContent='Catalog unavailable: '+e.message;}
 };
 button.onclick=window.shopPrebuiltApply.openCurrent;
 window.dispatchEvent(new CustomEvent('longshift:prebuilt-ready'));
}};
})();
