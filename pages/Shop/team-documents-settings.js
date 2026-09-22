(function () {
    "use strict";
    const client = window.trackRightSupabase;
    const form = document.getElementById("team-document-form");
    const member = document.getElementById("team-document-member");
    const type = document.getElementById("team-document-type");
    const title = document.getElementById("team-document-title");
    const issuer = document.getElementById("team-document-issuer");
    const number = document.getElementById("team-document-number");
    const issued = document.getElementById("team-document-issued");
    const expires = document.getElementById("team-document-expires");
    const reminder = document.getElementById("team-document-reminder");
    const fileInput = document.getElementById("team-document-file");
    const visible = document.getElementById("team-document-visible");
    const message = document.getElementById("team-document-message");
    const list = document.getElementById("team-document-list");
    const showArchived = document.getElementById("show-archived-documents");
    const saveButton = document.getElementById("save-team-document");
    let context = null;
    let members = new Map();
    let documents = [];

    function status(text, state) {
        message.textContent = text;
        message.className = `settings-message${state ? ` ${state}` : ""}`;
    }

    function canManage() { return Boolean(window.trackRightCan?.("team_documents.manage")); }
    function dateOnly(value) { return value ? String(value).slice(0, 10) : ""; }
    function formatDate(value) {
        if (!value) return "No expiration";
        const parts = dateOnly(value).split("-").map(Number);
        return new Date(parts[0], parts[1] - 1, parts[2]).toLocaleDateString();
    }

    function expiryState(documentRecord) {
        if (!documentRecord.expires_on) return { label: "No expiration", className: "current" };
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const expiry = new Date(`${documentRecord.expires_on}T00:00:00`);
        const days = Math.ceil((expiry - today) / 86400000);
        if (days < 0) return { label: `Expired ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago`, className: "expired" };
        if (days <= documentRecord.reminder_days) return { label: days === 0 ? "Expires today" : `Expires in ${days} days`, className: "due" };
        return { label: `Expires ${formatDate(documentRecord.expires_on)}`, className: "current" };
    }

    async function openDocument(path) {
        const preview = window.open("", "_blank");
        const result = await client.storage.from("shop-team-documents").createSignedUrl(path, 300);
        if (result.error) { preview?.close(); status(`Document could not be opened: ${result.error.message}`, "error"); return; }
        if (preview) { preview.opener = null; preview.location = result.data.signedUrl; }
        else window.location.assign(result.data.signedUrl);
    }

    function render() {
        list.replaceChildren();
        const counts = { current: 0, due: 0, expired: 0 };
        documents.filter((item) => !item.archived_at).forEach((item) => { counts[expiryState(item).className] += 1; });
        document.getElementById("team-documents-current").textContent = counts.current;
        document.getElementById("team-documents-due").textContent = counts.due;
        document.getElementById("team-documents-expired").textContent = counts.expired;
        documents.filter((item) => showArchived.checked || !item.archived_at).forEach((item) => {
            const state = expiryState(item);
            const row = document.createElement("article"); row.className = `team-document-row${item.archived_at ? " archived" : ""}`;
            const details = document.createElement("div");
            const heading = document.createElement("strong"); heading.textContent = item.title;
            const meta = document.createElement("p"); meta.textContent = `${members.get(item.subject_user_id)?.email || "Assigned team member"} · ${item.document_type.replace("_", " ")} · ${item.original_filename}`;
            const access = document.createElement("small"); access.textContent = item.visible_to_subject ? "Shared read-only with team member" : "Office only";
            details.append(heading, meta, access);
            const expiry = document.createElement("span"); expiry.className = `document-expiry ${state.className}`; expiry.textContent = item.archived_at ? "Archived" : state.label;
            const actions = document.createElement("div"); actions.className = "inspection-template-actions";
            const view = document.createElement("button"); view.type = "button"; view.textContent = "View"; view.addEventListener("click", () => openDocument(item.object_path)); actions.appendChild(view);
            if (canManage() && !item.archived_at) {
                const archive = document.createElement("button"); archive.type = "button"; archive.textContent = "Archive";
                archive.addEventListener("click", () => archiveDocument(item)); actions.appendChild(archive);
            }
            row.append(details, expiry, actions); list.appendChild(row);
        });
        if (!list.children.length) list.innerHTML = '<p class="settings-empty-state">No team documents match this view.</p>';
    }

    async function loadDocuments() {
        const result = await client.from("shop_team_documents").select("*").eq("shop_id", context.shopId).order("expires_on", { ascending: true, nullsFirst: false });
        if (result.error) throw result.error;
        documents = result.data || []; render();
    }

    async function loadMembers() {
        if (!canManage()) return;
        const result = await client.rpc("list_shop_request_members");
        if (result.error) throw result.error;
        (result.data || []).filter((item) => item.is_active).forEach((item) => {
            members.set(String(item.user_id), item);
            const option = document.createElement("option"); option.value = item.user_id; option.textContent = `${item.email} · ${item.role}`; member.appendChild(option);
        });
    }

    async function archiveDocument(item) {
        if (!confirm(`Archive ${item.title}? The file and history will be retained.`)) return;
        const result = await client.from("shop_team_documents").update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", item.id).eq("shop_id", context.shopId);
        if (result.error) { status(`Document could not be archived: ${result.error.message}`, "error"); return; }
        await loadDocuments(); status("Document archived. Its file and history were retained.", "success");
    }

    form.addEventListener("submit", async function (event) {
        event.preventDefault();
        if (!canManage()) { status("Owner or admin access is required.", "error"); return; }
        const file = fileInput.files[0];
        const allowed = ["application/pdf","image/jpeg","image/png","image/heic","image/heif","application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
        if (!file || !allowed.includes(file.type) || file.size > 20 * 1024 * 1024) { status("Choose a supported document no larger than 20 MB.", "error"); return; }
        if (issued.value && expires.value && expires.value < issued.value) { status("Expiration date cannot be before the issued date.", "error"); return; }
        saveButton.disabled = true; status("Uploading private team document…", "");
        const id = crypto.randomUUID();
        const extension = file.name.split(".").pop().replace(/[^a-z0-9]/gi, "").toLowerCase() || "bin";
        const path = `${context.shopId}/${id}/${crypto.randomUUID()}.${extension}`;
        const upload = await client.storage.from("shop-team-documents").upload(path, file, { contentType: file.type, upsert: false });
        if (upload.error) { saveButton.disabled = false; status(`Upload failed: ${upload.error.message}`, "error"); return; }
        const record = { id, shop_id: context.shopId, subject_user_id: member.value, document_type: type.value, title: title.value.trim(), issuer: issuer.value.trim() || null, document_number: number.value.trim() || null, issued_on: issued.value || null, expires_on: expires.value || null, reminder_days: Number(reminder.value), visible_to_subject: visible.checked, object_path: path, original_filename: file.name, mime_type: file.type, file_size: file.size, uploaded_by: context.user.id };
        const result = await client.from("shop_team_documents").insert(record);
        if (result.error) { await client.storage.from("shop-team-documents").remove([path]); saveButton.disabled = false; status(`Document record failed: ${result.error.message}`, "error"); return; }
        form.reset(); reminder.value = "30"; saveButton.disabled = false; await loadDocuments(); status("Team document uploaded privately.", "success");
    });

    showArchived.addEventListener("change", render);
    window.trackRightAuthReady.then(async function (authContext) {
        context = authContext;
        if (!canManage()) { form.hidden = true; document.querySelector("#team-documents .profile-intro").textContent = "Documents explicitly shared with your account appear below as read-only."; }
        await loadMembers(); await loadDocuments();
    }).catch((error) => status(`Team Documents could not load: ${error.message}`, "error"));
})();
