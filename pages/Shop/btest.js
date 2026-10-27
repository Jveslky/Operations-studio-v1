(function(){
'use strict';
const cases=[
 ['offline','Offline edits and reconnect','blocked','Disconnect during supported RO edits. Reload, restore connectivity, and verify the durable queue, persistent banner, sync state, and conflict handling.','No silent loss or false server-save confirmation; reconnect never overwrites another person’s work.','General Shop offline queue and sync UI remain unfinished.'],
 ['restore','Backup and restore rehearsal','blocked','Back up an isolated shop, then restore into an authorized disposable Test destination. Compare records, stock ledgers, audit trails, and operation IDs.','Balances, quantities, history and retry identities reconcile exactly.','Inventory-inclusive backup/restore must be implemented before this rehearsal.'],
 ['ap-response','Ambiguous AP bill save','blocked','Interrupt the response after a confirmed supplier bill save. Reload and recover the original operation. Check the original attachment and bill count.','One bill, preserved original, and a clear uncertain/saved state; no new financial entry on retry.','Durable recovery for AP bill creation is not yet verified.'],
 ['receipt-retry','Stock receipt response loss','not_run','Record initial stock. Submit a reviewed delivery, interrupt the response, reload, and retry the same pending receipt.','Stock increases once, one receipt/audit is linked, AP payment and amount remain unchanged.',''],
 ['contention','Concurrent stock allocation','not_run','Use two isolated sessions to reserve the same limited stock on different ROs. Confirm against the same initial quantity.','No overselling or negative availability; the losing request receives a useful shortage/conflict response.',''],
 ['stale','Conflicting estimate edits','not_run','Open one RO in two office sessions. Save a price/authorization change in one, then attempt the stale edit in the other.','Stale edits are rejected or explicitly reconciled; authorization and invoice snapshots stay consistent.',''],
 ['payment','Payment retry and reversal','not_run','In disposable Test data, exercise a split/partial payment, a lost response with the same operation key, then an authorized reversal.','One original transaction, correct balance, immutable history and one reversal; no duplicate on replay.',''],
 ['roles','Roles and tenant isolation','not_run','Repeat direct-route and record access with owner, writer, assigned technician and a separate shop account.','Only authorized records and actions are available; no cross-shop data or attachments leak.',''],
 ['documents','Document interruption and recovery','not_run','Upload PDF/image samples, including unreadable and multipage files. Interrupt upload/OCR, cancel, and reopen saved originals.','Incomplete scans cannot silently create bills; missing totals require review and saved originals remain available.',''],
 ['lifecycle','RO stock lifecycle after disruption','not_run','Reserve parts, reload, complete work, reopen, and return unused stock using authorized actions and exact retries.','Holds release/consume once; reopening never consumes twice; returns preserve the source and audit.',''],
 ['layout','Wide desktop and phone visual pass','not_run','Inspect dashboard, Parts, Receiving, Prebuilt Jobs, dialogs, alerts and navigation at wide desktop and phone widths.','Readable controls, reachable actions, no page overflow or clipped dialog headings.',''],
 ['supplier','Representative supplier invoice','not_run','Upload an authorized real supplier invoice. Compare every header and line against the original, then review pack conversion without assuming delivery.','Amounts and quantities are corrected explicitly; unread/missing lines never become silently accepted stock.','']
].map(([id,title,initial,steps,expected,blocker])=>({id,title,initial,steps,expected,blocker}));
const states=['blocked','not_run','pass','fail'];
function allowedHost(host){return host==='long-shift-test.pages.dev'||host.endsWith('.long-shift-test.pages.dev');}
function makeRun(shop,user){return{id:crypto.randomUUID(),name:'Berserker run '+new Date().toISOString().slice(0,10),build:'',shop,user,updated:new Date().toISOString(),results:Object.fromEntries(cases.map(c=>[c.id,{status:c.initial,notes:c.blocker}]))};}
function validRun(r,shop,user){return r&&typeof r.id==='string'&&r.id.length<100&&r.shop===shop&&r.user===user&&typeof r.name==='string'&&r.name.length<=100&&typeof r.build==='string'&&r.build.length<=200&&r.results&&cases.every(c=>{const x=r.results[c.id];return x&&states.includes(x.status)&&typeof x.notes==='string'&&x.notes.length<=10000&&(x.status!=='pass'||(x.notes.trim().length>0&&r.build.trim().length>0));});}
window.shopBtestModel={cases,allowedHost,makeRun,validRun};
const by=id=>document.getElementById(id),gate=by('btest-gate');if(!gate)return;
if(!allowedHost(location.hostname)){gate.textContent='This desk is available only on the Long Shift Test deployment.';return;}
function script(src){return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=()=>reject(Error('A required script could not load.'));document.head.append(s);});}
(async()=>{
 await script('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2');await script('../../js/supabase-client.js');await script('../../js/auth.js');
 const context=await window.trackRightAuthReady;if(!['owner','admin'].includes(context.role)){gate.textContent='This Test desk requires a shop owner or admin.';return;}
 await script('../../js/shop-appearance.js');
 const shop=context.shopId,user=context.user.id,key=`longshift.btest.v1:${shop}:${user}`;
 const privateCheck=by('btest-private-check'),privatePath=by('btest-private-path'),privateResult=by('btest-private-result');
 privateCheck.addEventListener('click',async()=>{
  const path=privatePath.value.trim(); if(!path){privateResult.textContent='Enter a Test document path.';return;}
  privateCheck.disabled=true;privateResult.textContent='Checking document access…';
  try {const result=await window.trackRightSupabase.storage.from('shop-ap-documents').createSignedUrl(path,60);
   if(result.error){const code=String(result.error.statusCode || result.error.status || '');privateResult.textContent=(code==='400'||code==='403'||code==='404') ? 'Storage did not grant a link. Confirm the same document succeeds in its own shop before treating this as a denial.' : 'Storage check failed; result inconclusive.';}
   else privateResult.textContent=result.data?.signedUrl ? 'Storage granted a link for this document.' : 'Storage response was incomplete; result inconclusive.';
  }catch(_){privateResult.textContent='Storage check failed; result inconclusive.';}finally{privateCheck.disabled=false;}
 });

 let runs=[],run,storageFailed=false;
 const say=text=>by('btest-message').textContent=text;
 try{const raw=localStorage.getItem(key);if(raw){const data=JSON.parse(raw);if(!Array.isArray(data)||data.length>50||!data.every(r=>validRun(r,shop,user)))throw Error('Saved run data is invalid.');runs=data;}}
 catch(e){gate.textContent='Saved test journal could not be read. '+e.message+' No existing data was overwritten.';return;}
 run=runs[0]||makeRun(shop,user);
 const buildLabel=document.createElement('label');buildLabel.textContent='Build / deployment reference';const build=document.createElement('input');build.id='run-build';build.maxLength=200;build.placeholder='Exact commit or deployment URL';buildLabel.append(build);by('run-name').parentElement.after(buildLabel);
 gate.textContent=`Test only · ${context.shop?.name||'Shop'} · journal scoped to this account`;
 by('btest-desk').hidden=false;
 function save(show=true){run.name=by('run-name').value.slice(0,100);run.build=build.value.slice(0,200);run.updated=new Date().toISOString();if(!validRun(run,shop,user)){storageFailed=true;say('Run is NOT saved: each recorded pass needs a build reference and evidence. Correct the fields before leaving.');return false;}const next=[run,...runs.filter(r=>r.id!==run.id)].slice(0,50);try{localStorage.setItem(key,JSON.stringify(next));runs=next;storageFailed=false;if(show)say('Run saved in this browser. Export JSON to keep a portable copy.');list();return true;}catch(e){storageFailed=true;say('Run is NOT saved: browser storage failed. Export JSON now to preserve this work.');return false;}}
 function list(){const select=by('run-list');select.replaceChildren();for(const r of runs.length?runs:[run]){const opt=document.createElement('option');opt.value=r.id;opt.textContent=r.name||'Untitled run';select.append(opt);}select.value=run.id;}
 function summary(){by('btest-summary').replaceChildren();for(const status of states){const box=document.createElement('article');box.className='btest-stat';const value=document.createElement('strong');value.textContent=String(Object.values(run.results).filter(r=>r.status===status).length);const text=document.createElement('span');text.textContent=({blocked:'Blocked',not_run:'Not run',pass:'Recorded passes',fail:'Failures'})[status];box.append(value,text);by('btest-summary').append(box);}}
 function draw(){by('run-name').value=run.name;build.value=run.build;list();summary();const host=by('btest-cases');host.replaceChildren();for(const c of cases){const result=run.results[c.id];if(by('case-filter').value!=='all'&&result.status!==by('case-filter').value)continue;
 const card=document.createElement('article');card.className='btest-case';card.dataset.status=result.status;
 const id=document.createElement('span');id.className='case-id';id.textContent=c.id.toUpperCase();const h=document.createElement('h3');h.textContent=c.title;const steps=document.createElement('p');steps.textContent=c.steps;const expected=document.createElement('p');const strong=document.createElement('strong');strong.textContent='Expected: ';expected.append(strong,document.createTextNode(c.expected));card.append(id,h,steps,expected);
 const statusLabel=document.createElement('label');statusLabel.textContent='Result';const select=document.createElement('select');for(const status of states){const opt=document.createElement('option');opt.value=status;opt.textContent=({blocked:'Blocked',not_run:'Not run',pass:'Pass',fail:'Fail'})[status];select.append(opt);}select.value=result.status;statusLabel.append(select);
 const notesLabel=document.createElement('label');notesLabel.textContent='Evidence / blocker / recovery notes';const notes=document.createElement('textarea');notes.maxLength=10000;notes.value=result.notes;notes.placeholder='Build, role, record IDs, before/after values, observations and evidence location';notesLabel.append(notes);
 notes.addEventListener('input',()=>{result.notes=notes.value;if(result.status==='pass'&&!result.notes.trim()){result.status='not_run';select.value='not_run';card.dataset.status='not_run';summary();}save();});
 select.addEventListener('change',()=>{if(select.value==='pass'&&(!notes.value.trim()||!build.value.trim())){select.value=result.status;say('Record the exact build and evidence before marking a pass.');return;}result.status=select.value;card.dataset.status=result.status;summary();save();});card.append(statusLabel,notesLabel);host.append(card);}}
 by('run-name').addEventListener('input',()=>save());build.addEventListener('input',()=>save());by('save-run').onclick=()=>save();by('case-filter').onchange=draw;
 by('run-list').onchange=()=>{run=runs.find(r=>r.id===by('run-list').value)||run;draw();say('Loaded saved run.');};
 by('new-run').onclick=()=>{if(!save())return;run=makeRun(shop,user);by('run-name').value=run.name;build.value='';save();draw();say('New run created. Previous runs retained; the latest 50 are kept locally.');};
 by('export-run').onclick=()=>{save(false);const payload={schema:'longshift.btest.v1',environment:'Test',origin:location.origin,exportedAt:new Date().toISOString(),run,scenarios:cases};const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='longshift-btest-'+run.id+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);say('Run JSON download requested. Check your downloads.');};
 window.addEventListener('beforeunload',e=>{if(storageFailed){e.preventDefault();e.returnValue='';}});draw();
})().catch(e=>{gate.textContent='Test desk could not initialize: '+e.message;});
})();
