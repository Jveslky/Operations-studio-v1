(function () {
    "use strict";
    const client = window.trackRightSupabase;
    const form = document.getElementById("shop-request-form");
    const type = document.getElementById("shop-request-type");
    const title = document.getElementById("shop-request-title");
    const details = document.getElementById("shop-request-details");
    const start = document.getElementById("shop-request-start");
    const end = document.getElementById("shop-request-end");
    const submit = document.getElementById("submit-shop-request");
    const message = document.getElementById("shop-request-message");
    const filter = document.getElementById("shop-request-filter");
    const list = document.getElementById("shop-request-list");
    const notificationPreference = document.getElementById("request-notification-preference");
    const notificationsEnabled = document.getElementById("request-notifications-enabled");
    const saveNotificationPreference = document.getElementById("save-request-notifications");
    let context = null;
    let requests = [];
    let members = new Map();
    let behavior = { ...window.trackRightShopBehaviorDefaults };

    function isOffice() { return Boolean(window.trackRightCan?.("requests.review")); }
    function setMessage(text, state) { message.textContent = text; message.className = `settings-message${state ? ` ${state}` : ""}`; }
    function formatDate(value) { if (!value) return "No date required"; const p=String(value).slice(0,10).split("-").map(Number); return new Date(p[0],p[1]-1,p[2]).toLocaleDateString(); }
    function requestType(value) { return { pto:"PTO", medical:"Medical absence", general:"General" }[value] || value; }
    function memberName(id) { const record=members.get(String(id)); return record?.display_name || record?.email || "Team member"; }

    function updateDateRequirement() {
        const required = type.value !== "general";
        document.querySelectorAll(".request-date-field").forEach((field) => field.hidden = !required);
        start.required = required; end.required = required;
        if (!required) { start.value = ""; end.value = ""; }
    }

    async function loadMembers() {
        if (!isOffice()) return;
        const result = await client.rpc("list_shop_request_members");
        if (result.error) throw result.error;
        (result.data || []).forEach((item) => members.set(String(item.user_id), item));
    }

    async function loadRequests() {
        const result = await client.from("shop_requests").select("*").eq("shop_id", context.shopId).order("created_at", { ascending:false });
        if (result.error) throw result.error;
        requests = result.data || []; render();
    }

    async function loadNotificationPreference() {
        if (!isOffice()) return;
        notificationPreference.hidden = false;
        const result = await client.from("shops").select("request_notifications_enabled").eq("id", context.shopId).single();
        if (result.error) throw result.error;
        notificationsEnabled.checked = result.data.request_notifications_enabled !== false;
        const canChange = ["owner", "admin"].includes(context.role);
        notificationsEnabled.disabled = !canChange; saveNotificationPreference.hidden = !canChange;
    }

    function reviewPanel(item) {
        const panel=document.createElement("div"); panel.className="request-review-panel";
        const notes=document.createElement("textarea"); notes.rows=2; notes.maxLength=2000; notes.placeholder="Office review notes (optional)"; notes.value=item.reviewer_notes || "";
        const reminder=document.createElement("input"); reminder.type="datetime-local"; reminder.title="Office reminder";
        const calendarLabel=document.createElement("label"); calendarLabel.className="settings-checkbox";
        const calendar=document.createElement("input"); calendar.type="checkbox"; calendar.checked=item.request_type !== "general" && behavior.auto_add_approved_time_off !== false; calendar.disabled=!item.starts_on;
        if (item.starts_on && Number(behavior.request_reminder_lead_hours) >= 0) {
            const reminderTime=new Date(`${item.starts_on}T08:00:00`); reminderTime.setHours(reminderTime.getHours()-Number(behavior.request_reminder_lead_hours));
            const local=new Date(reminderTime.getTime()-reminderTime.getTimezoneOffset()*60000); reminder.value=local.toISOString().slice(0,16);
        }
        calendarLabel.append(calendar, document.createTextNode("Add approved request to calendar"));
        const actions=document.createElement("div"); actions.className="request-review-actions";
        const approve=document.createElement("button"); approve.type="button"; approve.className="approve-request"; approve.textContent="Approve";
        const decline=document.createElement("button"); decline.type="button"; decline.className="decline-request"; decline.textContent="Decline";
        approve.addEventListener("click", () => review(item,"approved",notes.value,calendar.checked,reminder.value,approve));
        decline.addEventListener("click", () => review(item,"declined",notes.value,false,"",decline));
        actions.append(approve,decline); panel.append(notes,reminder,calendarLabel,actions); return panel;
    }

    function render() {
        const counts={pending:0,approved:0,declined:0}; requests.forEach((item) => counts[item.status]++);
        Object.keys(counts).forEach((key) => document.getElementById(`shop-requests-${key}`).textContent=counts[key]);
        document.getElementById("shop-request-list-title").textContent=isOffice()?"Shop request queue":"My requests";
        const selected=filter.value;
        const visible=requests.filter((item) => selected==="all" || (selected==="open" ? item.status==="pending" : item.status===selected));
        list.replaceChildren();
        visible.forEach((item) => {
            const row=document.createElement("article"); row.className="shop-request-row";
            const header=document.createElement("header"); const heading=document.createElement("div");
            const h3=document.createElement("h3"); h3.textContent=item.title;
            const by=document.createElement("p"); by.textContent=`${requestType(item.request_type)} · ${isOffice()?memberName(item.requested_by):"Submitted by you"}`;
            const badge=document.createElement("span"); badge.className=`request-status ${item.status}`; badge.textContent=item.status;
            heading.append(h3,by); header.append(heading,badge); row.append(header);
            const meta=document.createElement("div"); meta.className="shop-request-meta";
            const dateText=item.starts_on ? `${formatDate(item.starts_on)}${item.ends_on && item.ends_on!==item.starts_on ? ` – ${formatDate(item.ends_on)}`:""}` : "No requested date";
            meta.textContent=`${dateText} · Submitted ${new Date(item.created_at).toLocaleDateString()}`; row.append(meta);
            if (item.details) { const body=document.createElement("p"); body.textContent=item.details; row.append(body); }
            if (item.reviewer_notes) { const note=document.createElement("p"); note.textContent=`Office note: ${item.reviewer_notes}`; row.append(note); }
            if (isOffice() && item.status==="pending") row.append(reviewPanel(item));
            list.append(row);
        });
        if (!list.children.length) list.innerHTML='<p class="settings-empty-state">No requests match this view.</p>';
    }

    async function review(item, decision, notes, addCalendar, reminder, button) {
        button.disabled=true; setMessage(`${decision==="approved"?"Approving":"Declining"} request…`,"");
        const result=await client.rpc("review_shop_request", { request_id:item.id, decision, office_notes:notes || null, add_to_calendar:addCalendar, reminder_at:reminder ? new Date(reminder).toISOString() : null });
        button.disabled=false;
        if (result.error) { setMessage(`Request could not be reviewed: ${result.error.message}`,"error"); return; }
        await loadRequests(); setMessage(decision==="approved" ? `Request approved${addCalendar ? " and added to the calendar":""}.` : "Request declined.","success");
    }

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (start.value && end.value && end.value < start.value) { setMessage("End date cannot be before the start date.","error"); return; }
        submit.disabled=true; setMessage("Submitting request…","");
        const result=await client.from("shop_requests").insert({ shop_id:context.shopId, requested_by:context.user.id, request_type:type.value, title:title.value.trim(), details:details.value.trim() || null, starts_on:start.value || null, ends_on:end.value || null });
        submit.disabled=false;
        if (result.error) { setMessage(`Request could not be submitted: ${result.error.message}`,"error"); return; }
        form.reset(); type.value="pto"; updateDateRequirement(); await loadRequests(); setMessage("Request submitted for office review.","success");
    });
    type.addEventListener("change",updateDateRequirement); filter.addEventListener("change",render);
    saveNotificationPreference.addEventListener("click", async () => {
        saveNotificationPreference.disabled=true; setMessage("Saving notification preference…","");
        const result=await client.from("shops").update({ request_notifications_enabled:notificationsEnabled.checked, updated_at:new Date().toISOString() }).eq("id",context.shopId);
        saveNotificationPreference.disabled=false;
        setMessage(result.error ? `Preference could not be saved: ${result.error.message}` : "Request notification preference saved.", result.error ? "error" : "success");
    });
    window.trackRightAuthReady.then(async (authContext) => { context=authContext; behavior=await window.trackRightShopBehavior; updateDateRequirement(); await loadMembers(); await loadNotificationPreference(); await loadRequests(); }).catch((error) => setMessage(`Requests could not load: ${error.message}`,"error"));
})();
