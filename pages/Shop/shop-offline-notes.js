/* First offline slice: one frozen technician-note operation per local key. */
(function(){'use strict';
 const prefix='longshift.offline.note.v1:';
 function keyFor(context,id){return `${prefix}${context.shopId}:${context.user.id}:${id}`;}
 function list(context,storage){const start=`${prefix}${context.shopId}:${context.user.id}:`,items=[];for(let i=0;i<storage.length;i++){const key=storage.key(i);if(!key?.startsWith(start))continue;const p=JSON.parse(storage.getItem(key));if(!p||p.shop!==context.shopId||p.actor!==context.user.id||typeof p.request!=='string'||typeof p.note!=='string'||!p.ro||!p.expected||!['pending','conflict'].includes(p.state))throw Error('Saved note data is unreadable.');items.push({key,...p});}return items;}
 async function send(client,storage,item){
  if(item.state==='conflict')return 'conflict';
  let result;try{result=await client.rpc('sync_shop_offline_note',{p_shop:item.shop,p_request:item.request,p_ro:item.ro,p_expected:item.expected,p_note:item.note});}catch(_){return 'pending';}
  if(result.error)return 'pending';
  if(result.data?.status==='conflict'){storage.setItem(item.key,JSON.stringify({...item,key:undefined,state:'conflict'}));return 'conflict';}
  if(result.data?.status!=='saved')return 'pending';
  storage.removeItem(item.key);return 'saved';
 }
 window.shopOfflineNotes={keyFor,list,send};
 window.shopOfflineNotes.mount=async function({context,order,noteInput}){
  const storage=window.localStorage,client=window.trackRightSupabase;
  const box=document.createElement('section');box.className='detail-card';box.setAttribute('aria-label','Offline technician notes');
  const heading=document.createElement('h3');heading.textContent='Technician note sync';
  const explanation=document.createElement('p');explanation.textContent='Save a technician note on this device for later sync. Reconnect and open a repair order while signed in as the same account to sync. This does not save the rest of the repair order. Notes are stored on this browser; keep the device secure.';
  const status=document.createElement('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const queue=document.createElement('div');const save=document.createElement('button');save.type='button';save.textContent='Save technician note to device';save.className='secondary-btn';
  const retry=document.createElement('button');retry.type='button';retry.textContent='Sync saved notes';retry.className='secondary-btn';
  box.append(heading,explanation,status,save,retry,queue);noteInput.closest('label').after(box);
  let busy=false,storageError=false,lastResult='',requiresRefresh=false;
  function draw(){
   queue.replaceChildren();let items;try{items=list(context,storage);}catch(_){storageError=true;}if(storageError){status.textContent='Device storage is unavailable or unreadable. Notes cannot be safely queued or synced here.';save.disabled=true;retry.disabled=true;return;}
   const offline=!navigator.onLine;status.textContent=`${offline?'Offline. ':'Browser reports a connection. '}${items.length} note(s) saved on this device${items.some(i=>i.state==='conflict')?' — review required':''}. A note is not saved to the shop until sync succeeds.${lastResult?' '+lastResult:''}`;
   for(const item of items){const row=document.createElement('div');const text=document.createElement('p');text.textContent=`RO ${item.label} · ${item.state==='conflict'?'Conflict: repair order changed. Copy your note, reopen the latest order, and review before applying.':'Waiting to sync'}`;const note=document.createElement('textarea');note.readOnly=true;note.value=item.note;note.setAttribute('aria-label',`Saved note for RO ${item.label}`);const discard=document.createElement('button');discard.type='button';discard.textContent='Discard saved note';discard.onclick=()=>{if(busy||!window.confirm('Discard this saved device note? This cannot be undone.'))return;try{storage.removeItem(item.key);draw();}catch(_){storageError=true;draw();}};row.append(text,note,discard);queue.append(row);}
   save.disabled=storageError;retry.disabled=storageError||busy||!navigator.onLine||!items.some(i=>i.state==='pending');
  }
  async function sync(){if(busy||storageError||!navigator.onLine)return;busy=true;lastResult='';draw();try{let saved=0;for(const item of list(context,storage)){if(item.state==='pending'&&await send(client,storage,item)==='saved'){saved++;if(item.ro===order.recordId)requiresRefresh=true;}}if(saved)lastResult=`${saved} note(s) confirmed saved to the shop. Reopen an affected repair order before saving other changes.`;}catch(_){storageError=true;}finally{busy=false;draw();}}
  save.onclick=()=>{try{if(!order.recordId||!order.updatedAt)throw Error('Open a current repair order online before saving a device note.');if(noteInput.value.length>20000)throw Error('Notes must be 20,000 characters or fewer.');const current=list(context,storage);if(current.some(i=>i.ro===order.recordId))throw Error('A note for this repair order is already saved on this device. Sync or review it first.');const request=crypto.randomUUID();const p={shop:context.shopId,actor:context.user.id,request,ro:order.recordId,label:String(order.id),expected:order.updatedAt,note:noteInput.value,state:'pending'};storage.setItem(keyFor(context,request),JSON.stringify(p));lastResult='';draw();if(navigator.onLine)sync();}catch(error){status.textContent=`Note was not saved to this device: ${error.message}`;}};
  retry.onclick=sync;window.addEventListener('online',()=>{draw();sync();});window.addEventListener('offline',draw);draw();if(navigator.onLine)sync();
  return {blocksOrderSave(){try{return busy||storageError||requiresRefresh||list(context,storage).some(i=>i.ro===order.recordId);}catch(_){return true;}}};
 };
})();
