import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('../js/accept-invite.js',import.meta.url),'utf8');
async function setup({email=null,signupSession=null,acceptError=null}={}) {
 const nodes={},redirects=[],calls=[],saved=new Map();let authListener;
 for(const id of ['invite-summary','auth-message','invite-signup-form','invite-login-link','invite-switch-account','accept-invite-button'])nodes[id]={hidden:true,disabled:false,events:{},addEventListener(e,fn){this.events[e]=fn;}};
 nodes['invite-signup-form'].elements={email:{}};
 const session=email?{user:{email}}:null;
 const client={rpc:async(name,args)=>{calls.push({name,args});return name==='get_shop_invitation'?{data:[{email:'writer@qa.test',shop_name:'QA C',role:'service_writer'}]}:{error:acceptError};},auth:{getSession:async()=>({data:{session}}),onAuthStateChange(fn){authListener=fn;},signUp:async(args)=>{calls.push({name:'signup',args});return {data:{session:signupSession}};},signOut:async()=>({error:null})}};
 vm.runInNewContext(source,{window:{trackRightSupabase:client,location:{search:'?token=synthetic-token',href:'https://preview.test/accept-invite.html?token=synthetic-token',replace:x=>redirects.push(x)}},document:{getElementById:id=>nodes[id]},localStorage:{getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)},URL,URLSearchParams,FormData:class{get(k){return {email:'writer@qa.test',password:'synthetic-password',fullName:'QA Writer'}[k];}}});
 await new Promise(r=>setImmediate(r));
 return {nodes,redirects,calls,auth:session=>authListener('SIGNED_IN',session),submit:()=>nodes['invite-signup-form'].events.submit({preventDefault(){}})};
}
let a=await setup();assert.equal(a.nodes['invite-signup-form'].hidden,false);assert.equal(a.nodes['invite-login-link'].hidden,false);
const login=new URL(a.nodes['invite-login-link'].href);assert.equal(login.searchParams.get('returnTo'),'/accept-invite.html?token=synthetic-token');
await a.submit();assert.match(a.nodes['auth-message'].textContent,/Sign in to join/);assert.equal(a.calls.filter(x=>x.name==='accept_shop_invitation').length,0);
a.auth({user:{email:'writer@qa.test'}});assert.equal(a.nodes['accept-invite-button'].hidden,false);assert.equal(a.nodes['invite-signup-form'].hidden,true);
await a.nodes['accept-invite-button'].events.click();assert.match(a.redirects.at(-1),/shop-dashboard/);
a=await setup({email:'owner@qa.test'});assert.equal(a.nodes['accept-invite-button'].hidden,true);assert.equal(a.nodes['invite-switch-account'].hidden,false);assert.match(a.nodes['auth-message'].textContent,/owner@qa.test/);
await a.nodes['invite-switch-account'].events.click();assert.equal(new URL(a.redirects.at(-1)).searchParams.get('returnTo'),'/accept-invite.html?token=synthetic-token');
a=await setup({email:'WRITER@QA.TEST',acceptError:{message:'Expired'}});assert.equal(a.nodes['accept-invite-button'].hidden,false);await a.nodes['accept-invite-button'].events.click();assert.equal(a.redirects.length,0);assert.equal(a.nodes['accept-invite-button'].disabled,false);
console.log('Staff invitation UI: preserved sign-in link, confirmation/session transition, wrong-account switch and failed acceptance passed.');
