(function () {
    "use strict";
    const client=window.trackRightSupabase;
    const themeForm=document.getElementById("shop-theme-form");
    const themeMessage=document.getElementById("shop-theme-message");
    const layoutForm=document.getElementById("dashboard-layout-form");
    const layoutMessage=document.getElementById("dashboard-layout-message");
    const orderList=document.getElementById("dashboard-section-order");
    const compact=document.getElementById("compact-shop-dashboard");
    const labels={operations:"Operations snapshot",finance:"Financial snapshot",activity:"Repair order and invoice activity",modules:"Shop tools"};
    let context=null;
    let order=["operations","finance","activity","modules"];
    function status(element,text,state){element.textContent=text;element.className=`settings-message${state?` ${state}`:""}`;}
    function renderOrder(){
        orderList.replaceChildren(); order.forEach(function(key,index){
            const row=document.createElement("div");row.className="dashboard-order-row";row.dataset.section=key;
            const label=document.createElement("strong");label.textContent=labels[key];
            const actions=document.createElement("div");actions.className="dashboard-order-actions";
            [["↑","Move up",-1],["↓","Move down",1]].forEach(function(config){const button=document.createElement("button");button.type="button";button.textContent=config[0];button.title=config[1];button.setAttribute("aria-label",`${config[1]}: ${labels[key]}`);button.disabled=index+config[2]<0||index+config[2]>=order.length;button.addEventListener("click",function(){const next=index+config[2];[order[index],order[next]]=[order[next],order[index]];renderOrder();});actions.append(button);});
            row.append(label,actions);orderList.append(row);
        });
    }
    themeForm.addEventListener("change",function(event){if(event.target.name==="shop-theme")document.body.dataset.trShopTheme=event.target.value;});
    themeForm.addEventListener("submit",async function(event){event.preventDefault();const selected=themeForm.querySelector('input[name="shop-theme"]:checked');if(!selected)return;const button=document.getElementById("save-shop-theme");button.disabled=true;status(themeMessage,"Saving shop theme…","");const result=await client.from("shop_appearance_settings").upsert({shop_id:context.shopId,color_scheme:selected.value,updated_by:context.user.id,updated_at:new Date().toISOString()},{onConflict:"shop_id"});button.disabled=false;status(themeMessage,result.error?`Theme could not be saved: ${result.error.message}`:"Shop theme saved.",result.error?"error":"success");});
    layoutForm.addEventListener("submit",async function(event){event.preventDefault();status(layoutMessage,"Saving your dashboard…","");const result=await client.from("shop_user_appearance_preferences").upsert({shop_id:context.shopId,user_id:context.user.id,dashboard_section_order:order,compact_dashboard:compact.checked,updated_at:new Date().toISOString()},{onConflict:"shop_id,user_id"});if(!result.error)document.body.dataset.dashboardDensity=compact.checked?"compact":"comfortable";status(layoutMessage,result.error?`Dashboard could not be saved: ${result.error.message}`:"Your dashboard layout was saved.",result.error?"error":"success");});
    window.trackRightShopAppearanceReady.then(function(appearance){context=window.trackRightAuth;const scheme=appearance.shop?.color_scheme||"industrial";themeForm.querySelector(`input[value="${scheme}"]`).checked=true;order=Array.from(new Set([...(appearance.user?.dashboard_section_order||[]),...Object.keys(labels)])).filter((key)=>labels[key]);compact.checked=appearance.user?.compact_dashboard===true;renderOrder();const canEdit=["owner","admin"].includes(context.role);themeForm.querySelectorAll("input,button").forEach((element)=>element.disabled=!canEdit);if(!canEdit)status(themeMessage,"Owner or admin access is required to change the shop theme.","error");}).catch((error)=>status(layoutMessage,`Appearance could not load: ${error.message}`,"error"));
})();
