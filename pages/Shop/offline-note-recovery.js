(function(){'use strict';
 const snapshotKey='longshift.offline.ro.tab.v1',sessionKey='long-shift-shop-test-guvzuufdmnvurshknsnq',prefix='longshift.offline.note.v1:';
 const by=id=>document.getElementById(id),status=by('status'),editor=by('editor');let snap;
 try {
  snap=JSON.parse(sessionStorage.getItem(snapshotKey)||'null');const session=JSON.parse(localStorage.getItem(sessionKey)||'null');const id=new URLSearchParams(location.search).get('id');
  if(!snap || snap.version!==1 || !session?.user?.id || session.user.id!==snap.actor || !session.expires_at || session.expires_at*1000<=Date.now() || (!Number.isFinite(snap.capturedAt)||snap.capturedAt>Date.now()||Date.now()-snap.capturedAt>8*60*60*1000) || ![snap.label,snap.ro].includes(id) || !snap.shop || !snap.ro || !snap.expected || typeof snap.note!=='string')throw Error('This tab has no available authorized offline copy. Reconnect and open the repair order again.');
  const start=`${prefix}${snap.shop}:${snap.actor}:`;let pending=[];for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(!k?.startsWith(start))continue;const p=JSON.parse(localStorage.getItem(k));if(p?.ro===snap.ro)pending.push(p);}
  by('order').textContent=`RO ${snap.label} · device copy`;by('saved-at').textContent=`Last viewed online: ${new Date(snap.capturedAt).toLocaleString()}. This copy may be out of date.`;
  if(pending.length){by('note').value=pending[0].note;by('note').readOnly=true;by('save').disabled=true;status.textContent='A saved note is already waiting or needs review. It will not be replaced here; reconnect to review and sync.';}
  else{by('note').value=snap.note;status.textContent='Offline copy available. Changes are saved only to this device until sync.';}
  editor.hidden=false;
 }catch(error){status.textContent=error.message||'The offline copy could not be opened.';return;}
 function sessionStillValid(){try{const session=JSON.parse(localStorage.getItem(sessionKey)||'null');return session?.user?.id===snap.actor && Number.isFinite(session.expires_at) && session.expires_at*1000>Date.now() && Number.isFinite(snap.capturedAt) && snap.capturedAt<=Date.now() && Date.now()-snap.capturedAt<=8*60*60*1000;}catch(_){return false;}}
 function enforceSession(){if(sessionStillValid())return;by('note').value='';by('order').textContent='';by('saved-at').textContent='';editor.hidden=true;status.textContent='This offline session is no longer available. Reconnect and open the repair order again.';}
 window.addEventListener('storage',event=>{if(event.key===sessionKey || event.key===null)enforceSession();});
 document.addEventListener('visibilitychange',enforceSession);
 const initialSession=JSON.parse(localStorage.getItem(sessionKey));
 const expiry=Math.min(initialSession.expires_at*1000,snap.capturedAt+8*60*60*1000);
 window.setTimeout(enforceSession,Math.max(0,expiry-Date.now()));
 by('save').onclick=()=>{try{
  const session=JSON.parse(localStorage.getItem(sessionKey)||'null');if(session?.user?.id!==snap.actor||session.expires_at*1000<=Date.now()||(!Number.isFinite(snap.capturedAt)||snap.capturedAt>Date.now()||Date.now()-snap.capturedAt>8*60*60*1000))throw Error('The offline session expired. Reconnect before saving.');
  const start=`${prefix}${snap.shop}:${snap.actor}:`;for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k?.startsWith(start)&&JSON.parse(localStorage.getItem(k))?.ro===snap.ro)throw Error('A note for this repair order is already saved on this device. Reconnect to review it.');}
  const note=by('note').value;if(note.length>20000)throw Error('Notes must be 20,000 characters or fewer.');const request=crypto.randomUUID();const p={shop:snap.shop,actor:snap.actor,request,ro:snap.ro,label:snap.label,expected:snap.expected,note,state:'pending'};localStorage.setItem(start+request,JSON.stringify(p));by('note').readOnly=true;by('save').disabled=true;status.textContent='Note saved on this device. It has not yet been saved to the shop.';
 }catch(error){status.textContent=`Note was not saved to this device: ${error.message}`;}};
})();
