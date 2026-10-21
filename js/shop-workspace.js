/* Shop presentation only; existing auth, page guards and alert RPCs remain authoritative. */
(function(){
'use strict';
function mount({context,header,rootPath}){
 if(!location.pathname.includes('/pages/Shop/')||document.getElementById('shop-utility-bar'))return {alertsHost:header};
 const sheet=document.createElement('link');sheet.rel='stylesheet';sheet.href=rootPath+'css/shop-workspace.css';document.head.append(sheet);
 document.body.classList.add('shop-workspace');header.classList.add('ls-header');
 const nav=header.querySelector('.app-nav');
 const page=p=>p.replace(/\/+$/,'').split('/').pop().replace(/\.html$/,'');
 const current=page(location.pathname),can=window.trackRightCan;
 const permission={customers:'customers.read','repair-orders':'repair_orders.read',invoices:'invoices.read','accounts-payable':'expenses.read',schedule:'schedule.manage',inventory:'inventory.read'};
 const category=p=>/invoice|accounts-payable|net-accounts|report/.test(p)?'Finance':/inventory|receiving/.test(p)?'Inventory':'Workflow';
 if(nav){
  const entries=Array.from(nav.querySelectorAll('a')).filter(a=>{const p=page(new URL(a.href,location.href).pathname);return !permission[p]||can(permission[p])}).map(a=>({a,p:page(new URL(a.href,location.href).pathname)}));
  const groups=['Workflow','Inventory','Finance'].filter(g=>entries.some(e=>category(e.p)===g));
  let selected=category(current);if(!groups.includes(selected))selected=groups[0];
  const top=document.createElement('nav'),bottom=document.createElement('nav');top.className='ls-groups';top.setAttribute('aria-label','Shop sections');bottom.className='ls-pages';bottom.setAttribute('aria-label','Shop pages');
  const active=p=>p===current||(p==='repair-orders'&&current==='repair-order-details')||(p==='invoices'&&current==='invoice-details');
  function render(){top.replaceChildren();bottom.replaceChildren();for(const group of groups){const b=document.createElement('button');b.type='button';b.textContent=group;b.setAttribute('aria-pressed',String(group===selected));b.onclick=()=>{selected=group;render()};top.append(b)}for(const e of entries.filter(e=>category(e.p)===selected)){e.a.classList.toggle('active',active(e.p));if(active(e.p))e.a.setAttribute('aria-current','page');else e.a.removeAttribute('aria-current');bottom.append(e.a)}}
  const shell=document.createElement('div');shell.className='ls-navigation';
  // A technician's small work menu needs no extra group-selection row.
  if(context.role!=='technician'&&groups.length>1)shell.append(top);shell.append(bottom);nav.replaceWith(shell);render();
 }
 const dock=document.createElement('div');dock.id='shop-utility-bar';dock.setAttribute('aria-label','Shop utilities');
 const host=document.createElement('div');host.className='ls-alert-host';dock.append(host);
 const legacy=document.getElementById('shop-notifications');if(legacy){const b=legacy.querySelector('button');if(b)b.childNodes[0].textContent='Requests ';dock.append(legacy)}
 const name=document.createElement('span');name.className='ls-shop-name';name.textContent=context.shop?.name||'Shop';dock.append(name);
 const settings=document.createElement('button');settings.type='button';settings.textContent='⚙';settings.setAttribute('aria-label','Utility bar settings');dock.append(settings);
 const panel=document.createElement('dialog');panel.className='ls-utility-settings';panel.setAttribute('aria-label','Utility bar settings');
 const title=document.createElement('h2');title.textContent='Your utility bar';const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';label.append(input,document.createTextNode(' Show utility bar on phone'));
 const close=document.createElement('button');close.type='button';close.textContent='Close';close.onclick=()=>panel.close();panel.append(title,label,close);document.body.append(dock,panel);
 const fallback=document.createElement('div');fallback.className='ls-phone-alert-host';
 const compact=document.createElement('div');compact.className='ls-header-actions';
 const account=header.querySelector('#account-controls');
 if(account){const b=account.querySelector('.account-menu-button');if(b){b.setAttribute('aria-label','Shop account: '+(context.shop?.name||'Shop'));const icon=document.createElement('span');icon.className='ls-bay-icon';icon.setAttribute('aria-hidden','true');icon.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 4h18v4H3zM5 8v13M19 8v13M8 12h8M8 16h8"/></svg>';b.prepend(icon)}compact.append(account)}
 compact.append(fallback);header.append(compact);
 const menuTitle=document.createElement('div');menuTitle.className='ls-account-name';menuTitle.textContent=context.shop?.name||'Shop';const menu=account?.querySelector('.account-menu');if(menu)menu.prepend(menuTitle);
 const phoneAlert=document.createElement('button');phoneAlert.type='button';phoneAlert.className='ls-bell-button';phoneAlert.setAttribute('aria-label','Open alerts');phoneAlert.setAttribute('aria-expanded','false');phoneAlert.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M5 17h14l-2-3V9l-3-3h-4L7 9v5zM10 20h4M12 3v3"/></svg>';fallback.append(phoneAlert);
 phoneAlert.onclick=()=>document.getElementById('personal-shop-alerts')?.click();
 const key='longshift.utilities.mobile.'+context.user.id;let enabled=false;try{enabled=localStorage.getItem(key)==='true'}catch{}input.checked=enabled;
 const media=matchMedia('(max-width:700px)');function place(){const phone=media.matches;dock.hidden=phone&&!enabled;const b=document.getElementById('personal-shop-alerts');if(b)host.append(b);fallback.hidden=!phone}
 input.onchange=()=>{enabled=input.checked;try{localStorage.setItem(key,String(enabled))}catch{}place()};settings.onclick=()=>panel.showModal();media.addEventListener('change',place);place();
 // Settings stay reachable while the phone bar is disabled.
 const customize=document.createElement('button');customize.type='button';customize.className='ls-phone-customize';customize.textContent='Utilities';customize.setAttribute('role','menuitem');customize.tabIndex=-1;
 customize.onclick=()=>{const controls=header.querySelector('#account-controls');if(controls){const menu=controls.querySelector('.account-menu');if(menu)menu.hidden=true;controls.classList.remove('open');const b=controls.querySelector('.account-menu-button');if(b)b.setAttribute('aria-expanded','false')}panel.showModal()};
 const accountMenu=header.querySelector('.account-menu');if(accountMenu)accountMenu.prepend(customize);else header.append(customize);
 const ticker=document.createElement('div');ticker.className='ls-ticker';ticker.hidden=true;ticker.setAttribute('role','status');document.body.append(ticker);let known=null,timer;
 window.addEventListener('longshift:alerts',e=>{const f=e.detail;phoneAlert.setAttribute('aria-label','Alerts, '+f.unread+' unread');phoneAlert.dataset.unread=f.unread?String(f.unread):'';if(known){const fresh=f.items.find(a=>!known.has(a.id)&&!a.read_at&&!a.resolved_at);if(fresh&&!document.hidden&&(!media.matches||enabled)){ticker.textContent=fresh.title;ticker.hidden=false;clearTimeout(timer);timer=setTimeout(()=>ticker.hidden=true,4500)}}known=new Set(f.items.map(a=>a.id))});
 window.addEventListener('pagehide',()=>{clearTimeout(timer);media.removeEventListener('change',place)},{once:true});
 return {alertsHost:host,afterAlerts:()=>{place();const dialog=document.querySelector('.ls-alert-dialog');if(dialog){const sync=()=>phoneAlert.setAttribute('aria-expanded',String(dialog.open));const observer=new MutationObserver(sync);observer.observe(dialog,{attributes:true,attributeFilter:['open']});window.addEventListener('pagehide',()=>observer.disconnect(),{once:true});sync()}}};
}
window.LongShiftWorkspace={mount};
})();
