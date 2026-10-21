(function(){
'use strict';
const el=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
function field(host,label,value,type='text'){const l=el('label',label),i=el('input');i.type=type;i.value=value??'';if(type==='number'){i.min=0;i.step='0.001';}l.append(i);host.append(l);return i;}
async function edit(template,{shopId,rate,readOnly=false}){
 const data=structuredClone(template.definition),dialog=el('dialog');dialog.className='prebuilt-dialog';
 dialog.append(el('h2',readOnly?'Review prebuilt job':'Edit shop prebuilt'),el('p','Review actual quantities and parts before adding. Included parts still reserve stock. Prices shown are before tax.'));
 const form=el('form'),grid=el('div');grid.className='prebuilt-grid';form.append(grid);dialog.append(form);
 const name=field(grid,'Job name',data.name),modeLabel=el('label','Pricing'),mode=el('select');
 for(const [v,t] of [['flat','Flat package'],['itemized','Itemized labor + parts'],['mixed','Flat base + selected charges']]){const o=el('option',t);o.value=v;mode.append(o);}mode.value=data.mode;modeLabel.append(mode);grid.append(modeLabel);
 const base=field(grid,'Flat / base package price',data.base_price,'number'),expected=field(grid,'Expected job time (hours)',data.expected_hours ?? data.labor_hours ?? 0,'number'),hours=field(grid,'Billable labor hours (itemized / mixed)',data.billable_hours ?? (data.mode==='itemized'?data.labor_hours:0) ?? 0,'number');
 const baseLabor=field(grid,'Prebuilt labor allocation',data.base_labor ?? 0,'number'),baseParts=field(grid,'Prebuilt parts allocation',data.base_parts ?? 0,'number');
 const laborLabel=el('label','Labor in mixed mode'),labor=el('select');for(const [v,t] of [['included','Included in base price'],['hours','Hours × current estimate rate']]){const o=el('option',t);o.value=v;labor.append(o);}labor.value=data.labor_pricing;laborLabel.append(labor);grid.append(laborLabel);
 dialog.append(el('p',`Current estimate labor rate: $${Number(rate).toFixed(2)}. Expected job time is your planning target. It never changes pricing or actual time worked. Flat/base labor and parts allocations must equal the package price. Itemized pricing uses separate billable hours.`));
 const rows=el('div'),state=[];form.append(rows);
 function row(value){
  const l={...value},box=el('fieldset'),head=el('legend','Part / material');box.append(head);rows.append(box);
  const desc=field(box,'Description',l.description),qty=field(box,'Actual quantity',l.quantity,'number'),included=field(box,'Quantity included in package',l.included_quantity,'number');
  const label=el('label','Pricing rule'),pricing=el('select');for(const [v,t] of [['included','Included; extras charged separately'],['difference','Charge difference above unit allowance'],['itemized','Itemized (mixed / itemized mode)']]){const o=el('option',t);o.value=v;pricing.append(o);}pricing.value=l.pricing;label.append(pricing);box.append(label);
  const price=field(box,'Price per unit',l.unit_price,'number'),allowance=field(box,'Included allowance per unit',l.allowance,'number'),extra=field(box,'Price per additional unit',l.extra_price,'number');
  const identity=el('p',l.item_id?`Stocked: ${l.part_number} · ${l.stock_unit}`:'Non-stocked part / material');box.append(identity);
  const search=field(box,'Find / substitute stocked part','','search'),find=el('button','Search stock'),results=el('div');find.type='button';box.append(find,results);
  find.onclick=async()=>{find.disabled=true;results.replaceChildren();try{const r=await window.trackRightSupabase.rpc('shop_inventory_directory',{p_shop:shopId,p_search:search.value,p_filter:'active',p_page:0,p_size:25});if(r.error)throw r.error;
   for(const item of r.data.rows){const b=el('button',`${item.part_number} · ${item.description} · available ${item.available}`);b.type='button';b.onclick=()=>{Object.assign(l,{item_id:item.id,part_number:item.part_number,stock_unit:item.stock_unit});desc.value=item.description;price.value=item.sale_price;identity.textContent=`Stocked: ${item.part_number} · ${item.stock_unit}`;results.replaceChildren();};results.append(b);}
  }catch(e){status.textContent=e.message;}finally{find.disabled=false;}};
  const unlink=el('button','Use as non-stocked'),remove=el('button','Remove part');unlink.type=remove.type='button';box.append(unlink,remove);unlink.onclick=()=>{l.item_id=null;l.part_number='';l.stock_unit='each';identity.textContent='Non-stocked part / material';};
  const entry={box,read:()=>({...l,description:desc.value.trim(),quantity:qty.value,included_quantity:included.value,pricing:pricing.value,unit_price:price.value,allowance:allowance.value,extra_price:extra.value})};state.push(entry);remove.onclick=()=>{state.splice(state.indexOf(entry),1);box.remove();};
 }
 data.lines.forEach(row);const add=el('button','Add part / material');add.type='button';add.onclick=()=>row({description:'',quantity:1,included_quantity:1,pricing:'included',unit_price:0,allowance:0,extra_price:0,item_id:null,stock_unit:'each'});form.append(add);
 const status=el('p');status.setAttribute('role','status');form.append(status);const actions=el('div');actions.className='prebuilt-actions';const review=el('button','Calculate review'),accept=el('button',readOnly?'Add to estimate':'Save template'),cancel=el('button','Cancel');review.type=cancel.type='button';accept.type='submit';accept.disabled=true;actions.append(review,accept,cancel);form.append(actions);
 let approved=null;const read=()=>({name:name.value.trim(),mode:mode.value,base_price:base.value,labor_hours:hours.value,billable_hours:hours.value,expected_hours:expected.value,base_labor:baseLabor.value,base_parts:baseParts.value,labor_pricing:labor.value,lines:state.map(e=>e.read())});
 form.oninput=form.onchange=()=>{approved=null;accept.disabled=true;};
 // Button-driven structural / stock changes also invalidate a prior review.
 form.addEventListener('click',e=>{if(e.target.tagName==='BUTTON'&&e.target!==review&&e.target!==accept){approved=null;accept.disabled=true;}});
 review.onclick=()=>{try{approved=window.shopPrebuiltPricing.quote(read(),rate);status.textContent=`Prebuilt labor $${approved.labor.toFixed(2)} + prebuilt parts $${approved.parts.toFixed(2)} = $${approved.total.toFixed(2)} before tax. Expected job time: ${approved.expectedHours} h; billable hours: ${approved.laborHours} h. ${approved.lines.map(l=>`${l.description}: ${l.quantity} ${l.stock_unit||'units'}, $${l.charge.toFixed(2)}`).join('; ')}`;accept.disabled=false;}catch(e){approved=null;accept.disabled=true;status.textContent=e.message;}};
 document.body.append(dialog);dialog.showModal();return new Promise(resolve=>{const done=value=>{dialog.close();dialog.remove();resolve(value);};cancel.onclick=()=>done(null);dialog.addEventListener('cancel',e=>{e.preventDefault();done(null);});form.onsubmit=e=>{e.preventDefault();if(approved)done(approved);};});
}
window.shopPrebuiltEditor={edit};
})();
