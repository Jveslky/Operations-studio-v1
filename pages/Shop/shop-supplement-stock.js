(function(){
 'use strict';
 window.shopSupplementStock={async returnPart(order,supplement,line,message){
  const ctx=await window.trackRightAuthReady;
  const key=`long-shift-supplement-return:${ctx.shopId}:${ctx.user.id}:${supplement.id}`;
  let pending;
  try{pending=JSON.parse(localStorage.getItem(key)||'null');}catch{message('Could not read pending return. No return sent.');return;}
  if(pending&&pending.p_item!==line.item_id){message('A return for another part is awaiting confirmation. Retry that part first.');return;}
  const quantity=pending?String(pending.p_quantity):window.prompt('Quantity physically returned to stock?');if(quantity===null)return;
  const reason=pending?pending.p_reason:window.prompt('Return reason?');if(!reason?.trim())return;
  if(!window.confirm(`RO #${order.id}, Supplement ${supplement.supplement_number}: return ${quantity} ${line.stock_unit} of ${line.part_number}? This restores stock only; invoice credits are separate.`))return;
  try{
   const args=pending||{p_supplement:supplement.id,p_item:line.item_id,p_quantity:Number(quantity),p_reason:reason,p_request:crypto.randomUUID()};
   localStorage.setItem(key,JSON.stringify(args));
   const r=await window.trackRightSupabase.rpc('return_shop_supplement_stock',args);
   if(r.error){if(/^[0-9A-Z]{5}$/.test(r.error.code||''))localStorage.removeItem(key);throw r.error;}
   localStorage.removeItem(key);message('Physical supplement return recorded. Refresh inventory to see counts. Invoice unchanged.');
  }catch(e){message(e.message+' If server success is uncertain, retry Return on this part to reuse the saved request.');}
 }};
})();
