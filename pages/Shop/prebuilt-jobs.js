(async function(){
'use strict';const context=await window.trackRightAuthReady,client=window.trackRightSupabase;
const by=id=>document.getElementById(id),status=by('prebuilt-status'),list=by('prebuilt-list');
const use=window.trackRightCan('repair_orders.write')&&['owner','admin','service_writer'].includes(context.role),manage=['owner','admin'].includes(context.role)&&window.trackRightCan('settings.manage');
if(!use){status.textContent='Office estimate access is required.';return;}
const key=`long-shift-prebuilt-save:${context.shopId}:${context.user.id}`;let busy=false;
function pending(){return JSON.parse(localStorage.getItem(key)||'null');}
async function save(args){if(busy)return;busy=true;by('prebuilt-new').disabled=true;try{
 const stored=pending();if(stored&&JSON.stringify(stored)!==JSON.stringify(args))throw Error('Retry the unconfirmed template save first.');
 localStorage.setItem(key,JSON.stringify(args));by('prebuilt-retry').hidden=false;
 const r=await client.rpc('save_shop_prebuilt_job',args);if(r.error){if(/^[0-9A-Z]{5}$/.test(r.error.code||'')){localStorage.removeItem(key);by('prebuilt-retry').hidden=true;}throw r.error;}
 localStorage.removeItem(key);by('prebuilt-retry').hidden=true;await load();status.textContent='Template saved.';
}catch(e){status.textContent=e.message+' If the result is uncertain, retry the same saved request.';}finally{busy=false;by('prebuilt-new').disabled=false;}}
async function edit(t){if(busy)return;try{if(pending())throw Error('Retry the unconfirmed save first.');const q=await window.shopPrebuiltEditor.edit(t,{shopId:context.shopId,rate:0});if(!q)return;await save({p_shop:context.shopId,p_id:t.id,p_request:crypto.randomUUID(),p_expected:t.version??null,p_definition:q.definition,p_archived:t.archived||false});}catch(e){status.textContent=e.message;}}
async function load(){list.replaceChildren();try{let query=client.from('shop_prebuilt_jobs').select('*').eq('shop_id',context.shopId).order('updated_at',{ascending:false}).limit(200);if(!by('prebuilt-archived').checked)query=query.eq('archived',false);const r=await query;if(r.error)throw r.error;
 for(const t of r.data){const card=document.createElement('article');card.className='prebuilt-card';const h=document.createElement('h2');h.textContent=`${t.definition.name}${t.archived?' · Archived':''}`;const p=document.createElement('p');p.textContent=`${t.definition.mode} · revision ${t.version} · ${t.definition.lines.length} parts`;card.append(h,p);
 if(manage){const editButton=document.createElement('button');editButton.textContent='Edit';editButton.onclick=()=>edit(t);const archive=document.createElement('button');archive.textContent=t.archived?'Restore':'Archive';archive.onclick=()=>{if(window.confirm(`${archive.textContent} ${t.definition.name}? Existing jobs stay unchanged.`))save({p_shop:context.shopId,p_id:t.id,p_request:crypto.randomUUID(),p_expected:t.version,p_definition:t.definition,p_archived:!t.archived});};card.append(editButton,archive);}list.append(card);
 }status.textContent=r.data.length?'Showing up to 200 templates.':'No templates yet.';
}catch(e){status.textContent='Catalog unavailable. '+e.message;}}
by('prebuilt-new').hidden=!manage;by('prebuilt-new').onclick=()=>edit({id:crypto.randomUUID(),definition:{name:'',mode:'flat',base_price:0,labor_hours:0,billable_hours:0,expected_hours:0,base_labor:0,base_parts:0,labor_pricing:'included',lines:[]}});
by('prebuilt-refresh').onclick=load;by('prebuilt-archived').onchange=load;by('prebuilt-retry').onclick=()=>{try{const args=pending();if(args)save(args);}catch(e){status.textContent=e.message;}};
try{by('prebuilt-retry').hidden=!pending();}catch(e){status.textContent='Local save recovery unavailable. '+e.message;return;}await load();
})();
