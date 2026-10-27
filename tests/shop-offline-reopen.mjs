import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const code=fs.readFileSync(new URL('../pages/Shop/offline-note-recovery.js',import.meta.url),'utf8');const stamp=Date.now();
const snapshot={version:1,actor:'user-a',shop:'shop-a',ro:'ro-uuid',label:'1028',expected:'2026-10-27T00:00:00Z',note:'original note',capturedAt:stamp};
function storage(initial={}){const m=new Map(Object.entries(initial));return {m,get length(){return m.size},key:i=>[...m.keys()][i],getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v)};}
function build({snap=snapshot,actor='user-a',expires=Math.floor(stamp/1000)+600,id='1028',extra={}}={}){
 const nodes=new Map();const by=id=>{if(!nodes.has(id))nodes.set(id,{id,textContent:'',value:'',hidden:true,disabled:false,readOnly:false});return nodes.get(id)};
 const local=storage({'long-shift-shop-test-guvzuufdmnvurshknsnq':JSON.stringify({user:{id:actor},expires_at:expires}),...extra});const session=storage({'longshift.offline.ro.tab.v1':JSON.stringify(snap)});
 vm.runInNewContext(code,{document:{getElementById:by},localStorage:local,sessionStorage:session,location:{search:`?id=${id}`},URLSearchParams,Date,Number,crypto:{randomUUID:()=> 'request-a'}});return {by,local};}
let a=build();assert.equal(a.by('editor').hidden,false);assert.equal(a.by('note').value,'original note');a.by('note').value='offline edit';a.by('save').onclick();const queued=JSON.parse(a.local.getItem('longshift.offline.note.v1:shop-a:user-a:request-a'));assert.equal(queued.note,'offline edit');assert.equal(queued.expected,snapshot.expected);assert.equal(a.by('save').disabled,true);
let wrong=build({actor:'other'});assert.equal(wrong.by('editor').hidden,true);let expired=build({expires:Math.floor(stamp/1000)-1});assert.equal(expired.by('editor').hidden,true);let order=build({id:'1029'});assert.equal(order.by('editor').hidden,true);let stale=build({snap:{...snapshot,capturedAt:stamp-9*60*60*1000}});assert.equal(stale.by('editor').hidden,true);
let pending=build({extra:{'longshift.offline.note.v1:shop-a:user-a:prior':JSON.stringify({ro:'ro-uuid',note:'pending note'})}});assert.equal(pending.by('note').value,'pending note');assert.equal(pending.by('save').disabled,true);
console.log('Offline reopen: same-tab/session matching, expiration, order scope, queued-note preservation and device save passed.');
