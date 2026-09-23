(function(){
    "use strict";
    const client=window.trackRightSupabase;
    let contextPromise=null;
    function context(){
        if(!contextPromise){
            contextPromise=Promise.resolve(window.trackRightAuthReady).then(function(value){
                if(!value?.shopId||!value?.user?.id) throw new Error("Your shop session is unavailable.");
                return value;
            });
        }
        return contextPromise;
    }
    function amount(value){const parsed=Number(value);return Number.isFinite(parsed)?parsed:0;}
    function model(row){return {
        id:String(row.invoice_number),recordId:row.id,legacyLocalId:row.legacy_local_id,
        repairOrderId:row.repair_order_number?String(row.repair_order_number):"",
        repairOrderRecordId:row.repair_order_id,sourceType:row.source_type,
        customerId:row.customer_id||"",customer:row.customer_name||"",
        customerEmail:row.customer_email||"",customerPhone:row.customer_phone||"",
        unitId:row.unit_id||"",unit:row.unit_name||"",complaint:row.complaint||"",
        subtotal:amount(row.subtotal),taxAmount:amount(row.tax_amount),total:amount(row.total),
        taxSnapshot:row.tax_snapshot||{},feeSnapshot:row.fee_snapshot,
        status:row.status||"Draft",dueDate:row.due_date||"",notes:row.notes||"",
        sentAt:row.sent_at,paidAt:row.paid_at,createdAt:row.created_at,updatedAt:row.updated_at
    };}
    function row(invoice,ctx,identity){
        const value={
            repair_order_id:invoice.repairOrderRecordId||null,
            repair_order_number:invoice.repairOrderId?Number(invoice.repairOrderId):null,
            source_type:invoice.sourceType||"repair-order",customer_id:invoice.customerId?String(invoice.customerId):null,
            unit_id:invoice.unitId?String(invoice.unitId):null,customer_name:invoice.customer||"",
            customer_email:invoice.customerEmail||"",customer_phone:invoice.customerPhone||"",
            unit_name:invoice.unit||"",complaint:invoice.complaint||"",subtotal:amount(invoice.subtotal),
            tax_amount:amount(invoice.taxAmount),total:amount(invoice.total),tax_snapshot:invoice.taxSnapshot||{},
            fee_snapshot:invoice.feeSnapshot||null,status:invoice.status||"Draft",due_date:invoice.dueDate||null,
            notes:invoice.notes||"",sent_at:invoice.sentAt||null,paid_at:invoice.paidAt||null
        };
        if(identity){value.shop_id=ctx.shopId;value.created_by=ctx.user.id;}
        return value;
    }
    async function list(){const ctx=await context();const result=await client.from("shop_invoices").select("*").eq("shop_id",ctx.shopId).order("invoice_number",{ascending:false});if(result.error)throw result.error;return(result.data||[]).map(model);}
    async function get(identifier){return(await list()).find(x=>x.id===String(identifier)||x.recordId===identifier||x.legacyLocalId===String(identifier))||null;}
    async function create(invoice){const ctx=await context();const result=await client.from("shop_invoices").insert(row(invoice,ctx,true)).select("*").single();if(result.error)throw result.error;return model(result.data);}
    async function update(invoice){const ctx=await context();const result=await client.from("shop_invoices").update(row(invoice,ctx,false)).eq("id",invoice.recordId).eq("shop_id",ctx.shopId).select("*").single();if(result.error)throw result.error;return model(result.data);}
    async function migrateBrowserInvoices(){
        const ctx=await context(),key=`track-right-invoices-migrated:${ctx.shopId}`;
        if(localStorage.getItem(key))return;
        let invoices=[];try{invoices=JSON.parse(localStorage.getItem("track-right-invoices"))||[];}catch(error){console.warn("Could not read browser invoices",error);}
        if(!Array.isArray(invoices)||!invoices.length){localStorage.setItem(key,new Date().toISOString());return;}
        const shopName=ctx.shop?.name||"this shop";
        if(!window.confirm(`${invoices.length} browser-only invoice${invoices.length===1?"":"s"} were found. Import them into ${shopName}?\n\nChoose Cancel if they belong to another shop.`))return;
        for(const invoice of invoices){
            const value=row(invoice,ctx,true);value.legacy_local_id=String(invoice.id);value.invoice_number=Number(invoice.id)||null;
            const existing=await client.from("shop_invoices").select("id").eq("shop_id",ctx.shopId).eq("legacy_local_id",value.legacy_local_id).maybeSingle();
            if(existing.error)throw existing.error;if(existing.data)continue;
            const result=await client.from("shop_invoices").insert(value);if(result.error)throw result.error;
        }
        localStorage.setItem(key,new Date().toISOString());
    }
    window.trackRightInvoices={list,get,create,update,migrateBrowserInvoices};
}());
