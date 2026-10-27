/* First offline slice: one frozen technician-note operation per local key. */
(function(){'use strict';
 const prefix='longshift.offline.note.v1:';
 function keyFor(context,id){return `${prefix}${context.shopId}:${context.user.id}:${id}`;}
 function list(context,storage){const start=`${prefix}${context.shopId}:${context.user.id}:`,items=[];for(let i=0;i<storage.length;i++){const key=storage.key(i);if(!key?.startsWith(start))continue;const p=JSON.parse(storage.getItem(key));if(!p||p.shop!==context.shopId||p.actor!==context.user.id||typeof p.request!=='string'||typeof p.note!=='string'||!p.ro||!p.expected||!['pending','conflict'].includes(p.state))throw Error('Saved note data is unreadable.');items.push({key,...p});}return items;}
 async function send(client,storage,item){
  if(item.state==='conflict'&&!item.resolution)return 'conflict';
  const operation=item.resolution || item;
  let result;try{result=await client.rpc('sync_shop_offline_note',{p_shop:item.shop,p_request:operation.request,p_ro:item.ro,p_expected:operation.expected,p_note:operation.note});}catch(_){return 'pending';}
  if(result.error)return 'pending';
  if(result.data?.status==='conflict'){storage.setItem(item.key,JSON.stringify({...item,key:undefined,state:'conflict',reviewDraft:item.resolution?.note ?? item.reviewDraft,resolution:undefined}));return 'conflict';}
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
  let busy=false,storageError=false,lastResult='',requiresRefresh=false,review=null;
  function draw(){
   queue.replaceChildren();let items;try{items=list(context,storage);}catch(_){storageError=true;}if(storageError){status.textContent='Device storage is unavailable or unreadable. Notes cannot be safely queued or synced here.';save.disabled=true;retry.disabled=true;return;}
   const offline=!navigator.onLine;status.textContent=`${offline?'Offline. ':'Browser reports a connection. '}${items.length} note(s) saved on this device${items.some(i=>i.state==='conflict')?' — review required':''}. A note is not saved to the shop until sync succeeds.${lastResult?' '+lastResult:''}`;
   for(const item of items){
    const row=document.createElement('div');const text=document.createElement('p');text.textContent=`RO ${item.label} · ${item.state==='conflict'?'Conflict: repair order changed. Review the shop and device notes before saving.':'Waiting to sync'}`;
    const note=document.createElement('textarea');note.readOnly=true;note.value=item.note;note.setAttribute('aria-label',`Saved note for RO ${item.label}`);row.append(text,note);
    if(item.state==='conflict'){
     const button=document.createElement('button');button.type='button';button.className='secondary-btn';button.textContent=item.resolution?'Retry reviewed note':'Review conflict';button.disabled=busy||offline;
     button.onclick=()=>item.resolution?retryResolution(item):openReview(item);row.append(button);
     if(review?.key===item.key){
      const currentLabel=document.createElement('p');currentLabel.textContent='Current shop note';const current=document.createElement('textarea');current.readOnly=true;current.value=review.current;current.setAttribute('aria-label','Current shop note');
      const editLabel=document.createElement('p');editLabel.textContent='Reviewed note to save — edit this to include the information you want to keep from both versions.';const edited=document.createElement('textarea');edited.value=review.edited;edited.setAttribute('aria-label','Reviewed note to save');edited.oninput=()=>{review.edited=edited.value;};
      const apply=document.createElement('button');apply.type='button';apply.className='secondary-btn';apply.textContent='Save reviewed note';apply.disabled=busy||offline;apply.onclick=()=>applyReview(item,edited.value);
      const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancel review';cancel.onclick=()=>{review=null;draw();};row.append(currentLabel,current,editLabel,edited,apply,cancel);
     }
    }
    const discard=document.createElement('button');discard.type='button';discard.textContent='Discard saved note';discard.disabled=busy||!!item.resolution;discard.onclick=()=>{if(busy||!window.confirm('Discard this saved device note? This cannot be undone.'))return;try{storage.removeItem(item.key);review=null;draw();}catch(_){storageError=true;draw();}};row.append(discard);queue.append(row);
   }
   save.disabled=storageError;retry.disabled=storageError||busy||!navigator.onLine||!items.some(i=>i.state==='pending');
  }
  async function openReview(item){
   if(busy||!navigator.onLine)return;busy=true;review=null;lastResult='';draw();
   try{const result=await client.from('shop_repair_orders').select('technician_notes,updated_at').eq('shop_id',context.shopId).eq('id',item.ro).maybeSingle();if(result.error||!result.data?.updated_at)throw Error('The latest shop note could not be loaded. Check your connection and access, then try again.');review={key:item.key,current:result.data.technician_notes||'',edited:item.reviewDraft ?? (result.data.technician_notes||''),expected:result.data.updated_at};}catch(error){lastResult=error.message||'Could not load the latest shop note.';}finally{busy=false;draw();}
  }
  async function retryResolution(item){
   if(busy||!navigator.onLine)return;busy=true;lastResult='';draw();
   try{const result=await send(client,storage,item);if(result==='saved'){review=null;requiresRefresh=true;lastResult='Reviewed note confirmed saved to the shop. Reopen this repair order before saving other changes.';}else if(result==='conflict'){review=null;lastResult='The shop note changed again. Your device note is still saved; review the latest version.';}else{lastResult='Save not confirmed. Your device note and reviewed version are still saved here; retry when connected.';}}catch(_){storageError=true;}finally{busy=false;draw();}
  }
  async function applyReview(item,note){
   if(busy||!review||review.key!==item.key)return;
   if(note.length>20000){lastResult='Reviewed note must be 20,000 characters or fewer.';draw();return;}
   try{const latest=list(context,storage).find(x=>x.key===item.key);if(!latest||latest.state!=='conflict'||latest.resolution)throw Error('The saved note changed. Reopen the review.');const resolution={request:crypto.randomUUID(),expected:review.expected,note};storage.setItem(item.key,JSON.stringify({...latest,key:undefined,resolution}));review=null;await retryResolution({...latest,resolution});}catch(error){lastResult=error.message||'Could not save the reviewed note on this device.';draw();}
  }
  async function sync(){if(busy||storageError||!navigator.onLine)return;busy=true;lastResult='';draw();try{let saved=0;for(const item of list(context,storage)){if(item.state==='pending'&&await send(client,storage,item)==='saved'){saved++;if(item.ro===order.recordId)requiresRefresh=true;}}if(saved)lastResult=`${saved} note(s) confirmed saved to the shop. Reopen an affected repair order before saving other changes.`;}catch(_){storageError=true;}finally{busy=false;draw();}}
  save.onclick=()=>{try{if(!order.recordId||!order.updatedAt)throw Error('Open a current repair order online before saving a device note.');if(noteInput.value.length>20000)throw Error('Notes must be 20,000 characters or fewer.');const current=list(context,storage);if(current.some(i=>i.ro===order.recordId))throw Error('A note for this repair order is already saved on this device. Sync or review it first.');const request=crypto.randomUUID();const p={shop:context.shopId,actor:context.user.id,request,ro:order.recordId,label:String(order.id),expected:order.updatedAt,note:noteInput.value,state:'pending'};storage.setItem(keyFor(context,request),JSON.stringify(p));lastResult='';draw();if(navigator.onLine)sync();}catch(error){status.textContent=`Note was not saved to this device: ${error.message}`;}};
  retry.onclick=sync;window.addEventListener('online',()=>{draw();sync();});window.addEventListener('offline',draw);draw();if(navigator.onLine)sync();
  return {blocksOrderSave(){try{return busy||storageError||requiresRefresh||list(context,storage).some(i=>i.ro===order.recordId);}catch(_){return true;}}};
 };
})();
