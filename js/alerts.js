/* Personal Shop alerts. Database RPCs enforce recipient, role, and current RO access. */
(function () {
 'use strict';
 window.LongShiftAlerts = { mount };
 function node(tag, text) { const n=document.createElement(tag); if(text!==undefined)n.textContent=text; if(tag==='button')n.style.cssText='min-height:44px;margin:4px;padding:8px 12px'; return n; }
 function mount({client,context,header,rootPath}) {
  if(document.getElementById('personal-shop-alerts')) return;
  const button=node('button','Alerts'); button.id='personal-shop-alerts'; button.type='button';
  const dialog=node('dialog'); dialog.setAttribute('aria-label','Alerts & Preferences');
  dialog.style.cssText='width:min(620px,calc(100vw - 32px));max-height:85vh;overflow:auto;background:#f3efe7;color:#242b2f;border:2px solid #d96524;border-radius:10px;padding:20px';
  const title=node('h2','Alerts & Preferences'), close=node('button','Close'), status=node('p'), list=node('section'), prefs=node('section');
  close.type='button'; close.addEventListener('click',()=>dialog.close());
  const refresh=node('button','Refresh'); refresh.type='button';
  status.setAttribute('role','status');
  dialog.append(title,close,refresh,status,list,prefs); document.body.append(dialog); header.append(button);
  let busy=false;
  async function rpc(name,args={}) { const r=await client.rpc(name,{p_shop:context.shopId,...args}); if(r.error)throw r.error; return r.data; }
  const labels={ro_assigned:'When I am assigned an RO',estimate_approved:'When an estimate on my RO is approved'};
  function error(e) {status.textContent='Could not complete alerts request. '+(e.message||'Please retry.');}
  async function load() {
   if(busy)return; busy=true; status.textContent='Loading alerts…';
   try {
    const [feed,settings]=await Promise.all([rpc('list_my_shop_alerts'),rpc('my_shop_alert_preferences')]);
    button.textContent=feed.unread?`Alerts (${feed.unread})`:'Alerts'; list.replaceChildren(node('h3','Recent alerts'));
    if(!feed.items.length)list.append(node('p','No alerts yet.'));
    for(const a of feed.items) {
     const row=node('div'); row.style.cssText='padding:12px 0;border-bottom:1px solid #bbb';
     const link=node('a',`${a.read_at?'':'Unread · '}${a.title}`);
     link.href=`${rootPath}pages/Shop/repair-order-details.html?id=${encodeURIComponent(a.repair_order_id)}`;
     const read=node('button','Mark read'); read.type='button'; read.disabled=!!a.read_at;
     read.addEventListener('click',async()=>{ read.disabled=true; try{await rpc('read_my_shop_alert',{p_event:a.id});busy=false;await load();}catch(e){read.disabled=false;error(e);} });
     // Navigation remains available even when saving read state fails.
     link.addEventListener('click',()=>{rpc('read_my_shop_alert',{p_event:a.id}).catch(error);});
     row.append(link,node('p',new Date(a.created_at).toLocaleString()),read);list.append(row);
    }
    prefs.replaceChildren(node('h3','My preferences'),node('p','Preferences affect new alerts. Existing alerts stay in your history.'));
    for(const setting of settings) {
     const row=node('div');row.style.cssText='padding:12px 0';
     const label=node('label'), input=node('input');input.type='checkbox';input.checked=setting.available&&(setting.required||setting.enabled);
     input.disabled=!setting.available||setting.required;
     label.append(input,document.createTextNode(' '+labels[setting.event_type]+(setting.required?' (required by shop)':!setting.available?' (disabled by shop)':'')));
     input.addEventListener('change',async()=>{input.disabled=true;try{await rpc('save_my_shop_alert_preference',{p_type:setting.event_type,p_enabled:input.checked});status.textContent='Preference saved.';}catch(e){input.checked=!input.checked;error(e);}finally{input.disabled=false;}});
     row.append(label);
     if(['owner','admin'].includes(context.role)) {
      const available=node('input'),required=node('input');available.type=required.type='checkbox';available.checked=setting.available;required.checked=setting.required;
      const al=node('label'),rl=node('label'), save=node('button','Save shop rule');save.type='button';
      al.append(available,document.createTextNode(' Available to shop'));rl.append(required,document.createTextNode(' Required'));
      save.addEventListener('click',async()=>{save.disabled=true;try{await rpc('save_shop_alert_rule',{p_type:setting.event_type,p_enabled:available.checked,p_required:required.checked});busy=false;await load();}catch(e){error(e);}finally{save.disabled=false;}});
      row.append(node('br'),al,rl,save);
     }
     prefs.append(row);
    }
    status.textContent=`${feed.unread} unread. Showing the latest ${feed.items.length} alerts.`;
   }catch(e){error(e);}finally{busy=false;}
  }
  button.addEventListener('click',()=>{dialog.showModal();load();});refresh.addEventListener('click',load);
  // Poll only in a visible tab. The database remains authoritative; no optimistic read counts.
  async function count(){if(document.hidden||dialog.open)return;try{const f=await rpc('list_my_shop_alerts');button.textContent=f.unread?`Alerts (${f.unread})`:'Alerts';}catch(e){button.title='Alerts unavailable. Open to retry.';}}
  count();const timer=setInterval(count,60000);window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
 }
})();
