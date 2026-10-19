(function(){
 'use strict';
 const client=window.trackRightSupabase;
 window.shopROInventory={async mount({order,totalInput,changed}){
  if(order.estimateStockLines===undefined)return null;
  const context=await window.trackRightAuthReady,office=window.trackRightCan('repair_orders.write');
  let lines=structuredClone(order.estimateStockLines),results=[],busy=false;
  const section=document.createElement('section');section.className='detail-card ro-stock-editor';
  const title=document.createElement('h3');title.textContent='Stocked estimate parts';section.append(title);
  const help=document.createElement('p');help.textContent='Saved lines hold stock. Ready for Payment consumes held quantities after confirmation. On hand includes held parts until then. Manual parts charges remain in Parts total. Returns restore stock only; handle invoice credits separately.';section.append(help);
  const message=document.createElement('p');message.setAttribute('role','status');section.append(message);
  const list=document.createElement('div');section.append(list);
  const search=document.createElement('input');search.className='detail-input';search.placeholder='Search stocked parts';search.setAttribute('aria-label','Search stocked parts');
  const find=document.createElement('button');find.className='secondary-btn';find.type='button';find.textContent='Search inventory';
  const found=document.createElement('div');
  if(office){section.append(search,find,found);}
  const host=document.getElementById('stocked-estimate-parts');
  if(host)host.append(section);else totalInput.closest('label')?.parentElement?.append(section);
  const total=()=>lines.reduce((n,x)=>n+Math.round(Number(x.quantity)*Number(x.unit_price)*100)/100,0);
  function apply(next){const manual=Math.round((Number(totalInput.value||0)-total())*100)/100;lines=next;totalInput.value=(manual+total()).toFixed(2);draw();totalInput.dispatchEvent(new Event('input',{bubbles:true}));changed();}
  function draw(){list.replaceChildren();for(const line of lines){const row=document.createElement('p'),text=document.createElement('span');text.textContent=`${line.part_number} · ${line.description} · ${line.quantity} ${line.stock_unit} × $${Number(line.unit_price).toFixed(2)} `;row.append(text);
   if(office){const qty=document.createElement('input');row.className='ro-stock-line';qty.className='detail-input';qty.type='number';qty.min='0.001';qty.step='0.001';qty.value=line.quantity;qty.setAttribute('aria-label','Quantity for '+line.part_number);qty.addEventListener('change',()=>{if(!qty.checkValidity()){qty.reportValidity();return;}apply(lines.map(x=>x===line?{...x,quantity:Number(qty.value)}:x));});row.append(qty);
    const remove=document.createElement('button');remove.className='secondary-btn';remove.type='button';remove.textContent='Remove';remove.addEventListener('click',()=>apply(lines.filter(x=>x!==line)));row.append(remove);}
   if(window.trackRightCan('inventory.manage')){const ret=document.createElement('button');ret.className='secondary-btn';ret.type='button';ret.textContent='Return unused stock';ret.addEventListener('click',async()=>{if(busy)return;const pendingKey='long-shift-ro-return:'+context.shopId+':'+context.user.id+':'+order.recordId;
let pending;try{pending=JSON.parse(localStorage.getItem(pendingKey)||'null');}catch(e){message.textContent='Could not read pending return. No return sent.';return;}
if(pending&&pending.p_item!==line.item_id){message.textContent='A return for another part is awaiting confirmation. Retry Return on that part first.';return;}
const qty=pending?String(pending.p_quantity):window.prompt('Quantity physically returned to stock?');if(qty===null)return;const reason=pending?pending.p_reason:window.prompt('Return reason?');if(!reason?.trim())return;if(!window.confirm(`Return ${qty} ${line.stock_unit} of ${line.part_number} to stock?`))return;busy=true;ret.disabled=true;try{const args=pending||{p_ro:order.recordId,p_item:line.item_id,p_quantity:Number(qty),p_reason:reason,p_request:crypto.randomUUID()};localStorage.setItem(pendingKey,JSON.stringify(args));const r=await client.rpc('return_shop_ro_stock',args);if(r.error){if(/^[0-9A-Z]{5}$/.test(r.error.code||''))localStorage.removeItem(pendingKey);throw r.error;}localStorage.removeItem(pendingKey);message.textContent='Physical return recorded. Refresh inventory to see counts.';}catch(e){message.textContent=e.message+' If server success is uncertain, click Return again to retry the saved request.';}finally{busy=false;ret.disabled=false;}});row.append(ret);}
   list.append(row);}}
  find.addEventListener('click',async()=>{find.disabled=true;found.replaceChildren();try{const r=await client.rpc('shop_inventory_directory',{p_shop:context.shopId,p_search:search.value,p_filter:'active',p_page:0,p_size:25});if(r.error)throw r.error;results=r.data.rows;for(const item of results){const button=document.createElement('button');button.type='button';button.textContent=`${item.part_number} · On hand ${item.on_hand} · On hold ${item.on_hold} · Available ${item.available}`;button.addEventListener('click',()=>{if(lines.some(x=>x.item_id===item.id)){message.textContent='Change the quantity on the existing line.';return;}apply([...lines,{item_id:item.id,part_number:item.part_number,description:item.description,stock_unit:item.stock_unit,quantity:1,unit_price:Number(item.sale_price)}]);});found.append(button);}message.textContent='Availability is checked again when the repair order is saved.';}catch(e){message.textContent=e.message;}finally{find.disabled=false;}});
  draw();return {lines:()=>structuredClone(lines)};
 }};
})();
