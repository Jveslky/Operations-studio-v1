(function () {
    "use strict";
    const client=window.trackRightSupabase;
    const form=document.getElementById("shop-behavior-form");
    const message=document.getElementById("shop-behavior-message");
    const save=document.getElementById("save-shop-behavior");
    const fields={
        scheduling_lead_hours:document.getElementById("behavior-scheduling-lead"),
        default_appointment_duration_minutes:document.getElementById("behavior-appointment-duration"),
        default_appointment_type:document.getElementById("behavior-appointment-type"),
        default_ro_priority:document.getElementById("behavior-ro-priority"),
        default_invoice_terms_days:document.getElementById("behavior-invoice-terms"),
        request_reminder_lead_hours:document.getElementById("behavior-request-reminder"),
        auto_add_approved_time_off:document.getElementById("behavior-auto-calendar")
    };
    let context=null;
    function status(text,state){message.textContent=text;message.className=`settings-message${state?` ${state}`:""}`;}
    function fill(settings){Object.entries(fields).forEach(([key,input])=>{if(input.type==="checkbox")input.checked=settings[key]!==false;else if(input.type==="number")input.value=Number(settings[key])===0?"":settings[key];else input.value=settings[key];});}
    function editable(value){Array.from(form.elements).forEach((element)=>element.disabled=!value);}
    form.addEventListener("submit",async function(event){
        event.preventDefault(); save.disabled=true; status("Saving shop behavior…","");
        const record={shop_id:context.shopId,scheduling_lead_hours:Number(fields.scheduling_lead_hours.value),default_appointment_duration_minutes:Number(fields.default_appointment_duration_minutes.value),default_appointment_type:fields.default_appointment_type.value,default_ro_priority:fields.default_ro_priority.value,default_invoice_terms_days:Number(fields.default_invoice_terms_days.value),request_reminder_lead_hours:Number(fields.request_reminder_lead_hours.value),auto_add_approved_time_off:fields.auto_add_approved_time_off.checked,updated_by:context.user.id,updated_at:new Date().toISOString()};
        const result=await client.from("shop_behavior_settings").upsert(record,{onConflict:"shop_id"}); save.disabled=false;
        status(result.error?`Behavior could not be saved: ${result.error.message}`:"Shop behavior saved. New workflows will use these defaults.",result.error?"error":"success");
    });
    window.trackRightAuthReady.then(async function(authContext){context=authContext;const settings=await window.trackRightShopBehavior;fill(settings);const canEdit=["owner","admin"].includes(context.role);editable(canEdit);if(!canEdit)status("Owner or admin access is required to change shop behavior.","error");}).catch((error)=>status(`Behavior could not load: ${error.message}`,"error"));
})();
