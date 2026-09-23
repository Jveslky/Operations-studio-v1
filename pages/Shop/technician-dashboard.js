(function () {
    "use strict";
    const client = window.trackRightSupabase;
    const roList = document.getElementById("tech-ro-list");
    const scheduleList = document.getElementById("tech-schedule-list");
    const requestList = document.getElementById("tech-request-list");
    const documentList = document.getElementById("tech-document-list");
    const requestForm = document.getElementById("tech-request-form");
    const requestType = document.getElementById("tech-request-type");
    const requestStart = document.getElementById("tech-request-start");
    const requestEnd = document.getElementById("tech-request-end");
    const requestMessage = document.getElementById("tech-request-message");
    let context;

    function dateOnly(value) { return value ? String(value).slice(0, 10) : ""; }
    function formatDate(value) {
        if (!value) return "No date";
        const parts = dateOnly(value).split("-").map(Number);
        return new Date(parts[0], parts[1] - 1, parts[2]).toLocaleDateString();
    }
    function row(title, meta, badge, badgeClass) {
        const article = document.createElement("article"); article.className = "technician-row";
        const heading = document.createElement("div"); heading.className = "technician-row-heading";
        const strong = document.createElement("strong"); strong.textContent = title;
        const status = document.createElement("span"); status.className = `technician-badge ${badgeClass || ""}`; status.textContent = badge;
        const detail = document.createElement("p"); detail.textContent = meta;
        heading.append(strong, status); article.append(heading, detail); return article;
    }
    function empty(container, text) { container.replaceChildren(); const p=document.createElement("p"); p.textContent=text; container.append(p); }
    function isAssigned(order) {
        const email = context.user.email.toLowerCase();
        return [order.technician, order.additionalTechnician].some((value) => String(value || "").toLowerCase() === email);
    }
    function renderOrders(orders) {
        const active = orders.filter((order) => !order.archived && isAssigned(order) && !["Closed", "Complete"].includes(order.status));
        document.getElementById("tech-open-orders").textContent = active.length;
        document.getElementById("tech-waiting-approval").textContent = active.filter((order) => ["Sent", "Pending", "Waiting Approval"].includes(order.estimateApprovalStatus) || order.status === "Waiting Approval").length;
        roList.replaceChildren();
        active.forEach((order) => {
            const item = row(`RO #${order.id} · ${order.unit || "Unit not listed"}`, `${order.customer || "Customer"} · Authorization: ${order.estimateApprovalStatus || "Draft"}`, order.status, "");
            const link = document.createElement("a"); link.href=`repair-order-details.html?id=${encodeURIComponent(order.id)}`; link.textContent="Open repair order"; item.append(link); roList.append(item);
        });
        if (!active.length) empty(roList, "No open repair orders are assigned to your email.");
    }
    function renderSchedule(appointments) {
        const email=context.user.email.toLowerCase(), today=dateOnly(new Date().toISOString());
        const assigned=(appointments||[]).filter((item)=>String(item.technician||"").toLowerCase()===email && item.status!=="Cancelled" && item.scheduled_on>=today).slice(0,10);
        document.getElementById("tech-today-count").textContent=assigned.filter((item)=>item.scheduled_on===today).length;
        scheduleList.replaceChildren();
        assigned.forEach((item)=>scheduleList.append(row(`${formatDate(item.scheduled_on)} · ${String(item.start_time).slice(0,5)}`, `${item.customer}${item.unit ? ` · ${item.unit}`:""}${item.description ? ` · ${item.description}`:""}`, item.status, "")));
        if(!assigned.length) empty(scheduleList,"No upcoming appointments are assigned to your email.");
    }
    function renderRequests(requests) {
        requestList.replaceChildren();
        (requests||[]).forEach((item)=>{
            const dates=item.starts_on ? `${formatDate(item.starts_on)}${item.ends_on!==item.starts_on ? ` – ${formatDate(item.ends_on)}`:""}`:"No requested date";
            const entry=row(item.title,`${item.request_type.replace("_"," ")} · ${dates}`,item.status,item.status);
            if(item.reviewer_notes){const note=document.createElement("small");note.textContent=`Office note: ${item.reviewer_notes}`;entry.append(note);} requestList.append(entry);
        });
        if(!requestList.children.length) empty(requestList,"You have not submitted any requests.");
    }
    function expiry(documentRecord) {
        if(!documentRecord.expires_on)return{label:"No expiration",className:"current",alert:false};
        const today=new Date();today.setHours(0,0,0,0);const end=new Date(`${documentRecord.expires_on}T00:00:00`);const days=Math.ceil((end-today)/86400000);
        if(days<0)return{label:`Expired ${Math.abs(days)} days ago`,className:"expired",alert:true};
        if(days<=Number(documentRecord.reminder_days||30))return{label:days===0?"Expires today":`Expires in ${days} days`,className:"due",alert:true};
        return{label:`Expires ${formatDate(documentRecord.expires_on)}`,className:"current",alert:false};
    }
    async function openDocument(record, button) {
        button.disabled=true;const result=await client.storage.from("shop-team-documents").createSignedUrl(record.object_path,300);button.disabled=false;
        if(result.error){requestMessage.textContent=`Document could not open: ${result.error.message}`;return;} window.open(result.data.signedUrl,"_blank","noopener");
    }
    function renderDocuments(documents) {
        documentList.replaceChildren();let alerts=0;
        (documents||[]).filter((item)=>!item.archived_at).forEach((item)=>{const state=expiry(item);if(state.alert)alerts+=1;const entry=row(item.title,`${item.document_type.replaceAll("_"," ")}${item.issuer?` · ${item.issuer}`:""}`,state.label,state.className);const button=document.createElement("button");button.type="button";button.textContent="View document";button.addEventListener("click",()=>openDocument(item,button));entry.append(button);documentList.append(entry);});
        document.getElementById("tech-cert-alerts").textContent=alerts;if(!documentList.children.length)empty(documentList,"No certifications or documents have been shared with your account.");
    }
    function updateRequestDates(){const required=requestType.value!=="general";document.querySelector(".request-date-fields").hidden=!required;requestStart.required=required;requestEnd.required=required;if(!required){requestStart.value="";requestEnd.value="";}}
    async function loadRequests(){const result=await client.from("shop_requests").select("*").eq("shop_id",context.shopId).eq("requested_by",context.user.id).order("created_at",{ascending:false});if(result.error)throw result.error;renderRequests(result.data);}
    requestType.addEventListener("change",updateRequestDates);
    requestForm.addEventListener("submit",async(event)=>{event.preventDefault();if(requestStart.value&&requestEnd.value<requestStart.value){requestMessage.textContent="End date cannot be before the start date.";return;}const button=document.getElementById("tech-request-submit");button.disabled=true;requestMessage.textContent="Submitting…";const result=await client.from("shop_requests").insert({shop_id:context.shopId,requested_by:context.user.id,request_type:requestType.value,title:document.getElementById("tech-request-title").value.trim(),details:document.getElementById("tech-request-details").value.trim()||null,starts_on:requestStart.value||null,ends_on:requestEnd.value||null});button.disabled=false;if(result.error){requestMessage.textContent=`Request could not be submitted: ${result.error.message}`;return;}requestForm.reset();requestType.value="pto";updateRequestDates();requestMessage.textContent="Request submitted for office review.";await loadRequests();});
    window.trackRightAuthReady.then(async(authContext)=>{context=authContext;if(context.role!=="technician"){window.location.replace("shop-dashboard.html");return;}updateRequestDates();const today=dateOnly(new Date().toISOString());const [orders,appointments,requests,documents]=await Promise.all([window.trackRightRepairOrders.list(),client.from("shop_appointments").select("*").eq("shop_id",context.shopId).gte("scheduled_on",today).order("scheduled_on").order("start_time"),client.from("shop_requests").select("*").eq("shop_id",context.shopId).eq("requested_by",context.user.id).order("created_at",{ascending:false}),client.from("shop_team_documents").select("*").eq("shop_id",context.shopId).eq("subject_user_id",context.user.id).eq("visible_to_subject",true).order("expires_on",{ascending:true,nullsFirst:false})]);if(appointments.error)throw appointments.error;if(requests.error)throw requests.error;if(documents.error)throw documents.error;renderOrders(orders);renderSchedule(appointments.data);renderRequests(requests.data);renderDocuments(documents.data);}).catch((error)=>{console.error("Technician dashboard could not load",error);empty(roList,"Technician workspace data could not be loaded. Refresh or sign in again.");});
}());
