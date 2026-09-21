(function () {
    "use strict";

    const client = window.trackRightSupabase;
    const orderId = new URLSearchParams(window.location.search).get("id");
    const attachInspectionButton = document.getElementById("attach-inspection-button");
    const inspectionTemplateSelect = document.getElementById("inspection-template-select");
    const inspectionList = document.getElementById("inspection-list");
    const message = document.getElementById("inspection-media-message");
    const mediaForm = document.getElementById("ro-media-form");
    const mediaFile = document.getElementById("ro-media-file");
    const mediaCategory = document.getElementById("ro-media-category");
    const mediaVisibility = document.getElementById("ro-media-visibility");
    const mediaInspectionItem = document.getElementById("ro-media-inspection-item");
    const mediaCaption = document.getElementById("ro-media-caption");
    const uploadButton = document.getElementById("upload-ro-media");
    const mediaList = document.getElementById("ro-media-list");
    const allowedTypes = new Set([
        "image/jpeg", "image/png", "image/heic", "image/heif",
        "video/mp4", "video/quicktime", "video/webm"
    ]);

    let context = null;
    let mediaRecords = [];
    let inspectionRecords = [];
    let inspectionItems = [];
    let inspectionSettings = { default_attachment_mode: "never", default_template_id: null };

    function setMessage(text, state) {
        message.textContent = text;
        message.className = `inspection-media-message${state ? ` ${state}` : ""}`;
    }

    function canAddDocumentation() {
        return ["owner", "admin", "service_writer", "technician"].includes(context?.role);
    }

    function setControlsEnabled(enabled) {
        attachInspectionButton.disabled = !enabled;
        Array.from(mediaForm.elements).forEach(function (element) {
            element.disabled = !enabled;
        });
    }

    function formatDate(value) {
        if (!value) return "Unknown date";
        return new Date(value).toLocaleString();
    }

    function formatSize(bytes) {
        const size = Number(bytes || 0);
        if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
        return `${Math.max(1, Math.round(size / 1024))} KB`;
    }

    async function renderInspections() {
        const [inspectionResult, itemResult] = await Promise.all([
            client.from("shop_inspections").select("id, title, status, created_at, created_by, completed_at").eq("shop_id", context.shopId).eq("repair_order_id", orderId).neq("status", "archived").order("created_at", { ascending: false }),
            client.from("shop_inspection_items").select("id, inspection_id, section_title, item_label, is_required, response, response_label, response_set_name, response_options, notes, sort_order").eq("shop_id", context.shopId).order("sort_order")
        ]);
        if (inspectionResult.error || itemResult.error) throw inspectionResult.error || itemResult.error;
        inspectionRecords = inspectionResult.data;
        const inspectionIds = new Set(inspectionRecords.map(function (inspection) { return inspection.id; }));
        inspectionItems = itemResult.data.filter(function (item) { return inspectionIds.has(item.inspection_id); });
        inspectionList.replaceChildren();
        if (!inspectionRecords.length) {
            const empty = document.createElement("p");
            empty.className = "ro-media-meta";
            empty.textContent = "No inspection attached. This repair order does not require one by default.";
            inspectionList.appendChild(empty);
            return;
        }

        inspectionRecords.forEach(function (inspection) {
            const row = document.createElement("article");
            row.className = "inspection-row";
            row.dataset.inspectionId = inspection.id;
            const header = document.createElement("div");
            header.className = "inspection-row-header";
            const details = document.createElement("div");
            const title = document.createElement("strong");
            title.textContent = inspection.title || "Inspection";
            const date = document.createElement("span");
            date.textContent = `Attached ${formatDate(inspection.created_at)}`;
            details.append(title, date);
            const status = document.createElement("span");
            status.className = "inspection-status";
            status.textContent = inspection.status;
            header.append(details, status);
            row.appendChild(header);

            const items = inspectionItems.filter(function (item) { return item.inspection_id === inspection.id; });
            if (items.length) {
                const checklist = document.createElement("div");
                checklist.className = "inspection-checklist";
                let currentSection = "";
                items.forEach(function (item) {
                    if (item.section_title !== currentSection) {
                        currentSection = item.section_title;
                        const sectionTitle = document.createElement("strong");
                        sectionTitle.textContent = currentSection;
                        checklist.appendChild(sectionTitle);
                    }
                    const itemRow = document.createElement("div");
                    itemRow.className = "inspection-item";
                    itemRow.dataset.itemId = item.id;
                    const label = document.createElement("span");
                    label.className = `inspection-item-label${item.is_required ? " required" : ""}`;
                    label.textContent = item.item_label;
                    const response = document.createElement("select");
                    response.className = "inspection-response";
                    const choices = Array.isArray(item.response_options) ? item.response_options : [
                        { label: "Pass", meaning: "positive" }, { label: "Attention", meaning: "attention" }, { label: "Fail", meaning: "critical" }, { label: "N/A", meaning: "na" }
                    ];
                    [{ label: "Not answered", meaning: "unanswered" }, ...choices].forEach(function (choice) {
                        const option = document.createElement("option");
                        option.value = choice.label; option.dataset.meaning = choice.meaning; option.textContent = choice.label; response.appendChild(option);
                    });
                    response.value = item.response_label || (item.response === "unanswered" ? "Not answered" : choices.find(function (choice) {
                        return ({ positive: "pass", info: "info", attention: "attention", critical: "fail", na: "na" })[choice.meaning] === item.response;
                    })?.label || "Not answered");
                    response.disabled = inspection.status === "complete" || !canAddDocumentation();
                    const notes = document.createElement("input");
                    notes.type = "text"; notes.className = "inspection-item-notes"; notes.placeholder = "Item notes"; notes.value = item.notes || "";
                    notes.disabled = inspection.status === "complete" || !canAddDocumentation();
                    itemRow.append(label, response, notes);
                    checklist.appendChild(itemRow);
                });
                row.appendChild(checklist);
                if (inspection.status !== "complete" && canAddDocumentation()) {
                    const complete = document.createElement("button");
                    complete.type = "button"; complete.className = "inspection-complete-button"; complete.dataset.completeInspection = inspection.id; complete.textContent = "Complete Inspection";
                    row.appendChild(complete);
                }
            } else {
                const emptyChecklist = document.createElement("span");
                emptyChecklist.className = "ro-media-meta";
                emptyChecklist.textContent = "General inspection attached without a checklist template.";
                row.appendChild(emptyChecklist);
            }
            inspectionList.appendChild(row);
        });
        populateInspectionItemOptions();
    }

    function populateInspectionItemOptions() {
        mediaInspectionItem.innerHTML = '<option value="">Repair order only</option>';
        inspectionItems.forEach(function (item) {
            const inspection = inspectionRecords.find(function (record) { return record.id === item.inspection_id; });
            const option = document.createElement("option");
            option.value = item.id;
            option.dataset.inspectionId = item.inspection_id;
            option.textContent = `${inspection?.title || "Inspection"} — ${item.item_label}`;
            mediaInspectionItem.appendChild(option);
        });
    }

    async function loadInspectionConfiguration() {
        const [templateResult, settingsResult] = await Promise.all([
            client.from("shop_inspection_templates").select("id, name").eq("shop_id", context.shopId).eq("is_archived", false).order("name"),
            client.from("shop_inspection_settings").select("default_attachment_mode, default_template_id").eq("shop_id", context.shopId).maybeSingle()
        ]);
        if (templateResult.error || settingsResult.error) throw templateResult.error || settingsResult.error;
        inspectionSettings = settingsResult.data || inspectionSettings;
        inspectionTemplateSelect.innerHTML = '<option value="">General inspection</option>';
        templateResult.data.forEach(function (template) {
            const option = document.createElement("option"); option.value = template.id; option.textContent = template.name; inspectionTemplateSelect.appendChild(option);
        });
        inspectionTemplateSelect.value = inspectionSettings.default_template_id || "";
    }

    async function signedUrl(path) {
        const { data, error } = await client.storage
            .from("shop-inspection-media")
            .createSignedUrl(path, 600);
        if (error) throw error;
        return data.signedUrl;
    }

    async function renderMedia() {
        const { data, error } = await client.from("shop_ro_media")
            .select("id, category, caption, visibility, object_path, mime_type, file_size, uploaded_by, created_at")
            .eq("shop_id", context.shopId)
            .eq("repair_order_id", orderId)
            .order("created_at", { ascending: false });

        if (error) throw error;
        mediaRecords = data;
        mediaList.replaceChildren();
        if (!data.length) {
            const empty = document.createElement("p");
            empty.className = "ro-media-meta";
            empty.textContent = "No photos or videos have been added.";
            mediaList.appendChild(empty);
            return;
        }

        for (const record of data) {
            const card = document.createElement("article");
            card.className = "ro-media-item";
            try {
                const url = await signedUrl(record.object_path);
                const preview = document.createElement(record.mime_type.startsWith("video/") ? "video" : "img");
                preview.className = "ro-media-preview";
                preview.src = url;
                if (preview.tagName === "VIDEO") {
                    preview.controls = true;
                    preview.preload = "metadata";
                } else {
                    preview.alt = record.caption || "Repair order photo";
                    preview.loading = "lazy";
                }
                card.appendChild(preview);
            } catch (error) {
                const unavailable = document.createElement("div");
                unavailable.className = "ro-media-preview ro-media-unavailable";
                unavailable.textContent = "Preview unavailable";
                card.appendChild(unavailable);
            }

            const body = document.createElement("div");
            body.className = "ro-media-item-body";
            const badges = document.createElement("div");
            badges.className = "ro-media-badges";
            [record.category || "Uncategorized", record.visibility === "customer" ? "Customer-visible" : "Internal"].forEach(function (label) {
                const badge = document.createElement("span");
                badge.className = "ro-media-badge";
                badge.textContent = label;
                badges.appendChild(badge);
            });
            const caption = document.createElement("p");
            caption.textContent = record.caption || "No caption";
            const meta = document.createElement("span");
            meta.className = "ro-media-meta";
            const uploader = record.uploaded_by === context.user.id ? "Uploaded by you" : "Uploaded by a team member";
            meta.textContent = `${uploader} · ${formatDate(record.created_at)} · ${formatSize(record.file_size)}`;
            body.append(badges, caption, meta);

            if (["owner", "admin", "service_writer"].includes(context.role) || record.uploaded_by === context.user.id) {
                const remove = document.createElement("button");
                remove.type = "button";
                remove.className = "ro-media-delete";
                remove.dataset.mediaId = record.id;
                remove.textContent = "Delete";
                body.appendChild(remove);
            }
            card.appendChild(body);
            mediaList.appendChild(card);
        }
    }

    attachInspectionButton.addEventListener("click", async function () {
        if (!canAddDocumentation()) return;
        attachInspectionButton.disabled = true;
        setMessage("Attaching inspection…", "");
        const { error } = await client.rpc("attach_shop_inspection", {
            requested_repair_order_id: String(orderId),
            requested_template_id: inspectionTemplateSelect.value || null
        });
        if (error) {
            setMessage(`Inspection could not be attached: ${error.message}`, "error");
        } else {
            await renderInspections();
            setMessage("Inspection attached.", "success");
        }
        attachInspectionButton.disabled = false;
    });

    mediaForm.addEventListener("submit", async function (event) {
        event.preventDefault();
        const file = mediaFile.files[0];
        if (!file || !allowedTypes.has(file.type)) {
            setMessage("Choose a JPG, PNG, HEIC, HEIF, MP4, MOV, or WebM file.", "error");
            return;
        }
        const isVideo = file.type.startsWith("video/");
        const limit = isVideo ? 100 * 1024 * 1024 : 10 * 1024 * 1024;
        if (file.size > limit) {
            setMessage(`${isVideo ? "Videos" : "Photos"} must be ${isVideo ? "100" : "10"} MB or smaller.`, "error");
            return;
        }

        uploadButton.disabled = true;
        setMessage("Uploading private media…", "");
        const extension = file.name.split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
        const path = `${context.shopId}/${String(orderId).replace(/[^a-zA-Z0-9_-]/g, "_")}/${crypto.randomUUID()}.${extension}`;
        const upload = await client.storage.from("shop-inspection-media")
            .upload(path, file, { contentType: file.type, upsert: false });
        if (upload.error) {
            setMessage(`Media upload failed: ${upload.error.message}`, "error");
            uploadButton.disabled = false;
            return;
        }

        const insert = await client.from("shop_ro_media").insert({
            shop_id: context.shopId,
            repair_order_id: String(orderId),
            category: mediaCategory.value || null,
            caption: mediaCaption.value.trim() || null,
            visibility: mediaVisibility.value,
            object_path: path,
            mime_type: file.type,
            file_size: file.size,
            uploaded_by: context.user.id,
            inspection_id: mediaInspectionItem.selectedOptions[0]?.dataset.inspectionId || null,
            inspection_item_id: mediaInspectionItem.value || null
        });
        if (insert.error) {
            await client.storage.from("shop-inspection-media").remove([path]);
            setMessage(`Media record could not be saved: ${insert.error.message}`, "error");
            uploadButton.disabled = false;
            return;
        }

        mediaForm.reset();
        await renderMedia();
        setMessage("Media uploaded privately.", "success");
        uploadButton.disabled = false;
    });

    mediaList.addEventListener("click", async function (event) {
        const button = event.target.closest("button[data-media-id]");
        if (!button) return;
        const record = mediaRecords.find(function (item) { return item.id === button.dataset.mediaId; });
        if (!record || !confirm("Delete this media file? This cannot be undone.")) return;

        button.disabled = true;
        const storageDelete = await client.storage.from("shop-inspection-media").remove([record.object_path]);
        if (storageDelete.error) {
            setMessage(`Media file could not be deleted: ${storageDelete.error.message}`, "error");
            button.disabled = false;
            return;
        }
        const recordDelete = await client.from("shop_ro_media")
            .delete()
            .eq("id", record.id)
            .eq("shop_id", context.shopId);
        if (recordDelete.error) {
            setMessage(`Media record could not be deleted: ${recordDelete.error.message}`, "error");
            button.disabled = false;
            return;
        }
        await renderMedia();
        setMessage("Media deleted.", "success");
    });

    inspectionList.addEventListener("change", async function (event) {
        const itemRow = event.target.closest("[data-item-id]");
        if (!itemRow) return;
        const responseInput = itemRow.querySelector(".inspection-response");
        const meaning = responseInput.selectedOptions[0].dataset.meaning;
        const response = ({ positive: "pass", info: "info", attention: "attention", critical: "fail", na: "na", unanswered: "unanswered" })[meaning];
        const responseLabel = response === "unanswered" ? null : responseInput.value;
        const notes = itemRow.querySelector(".inspection-item-notes").value.trim();
        const { error } = await client.from("shop_inspection_items")
            .update({ response, response_label: responseLabel, notes: notes || null, updated_by: context.user.id, updated_at: new Date().toISOString() })
            .eq("id", itemRow.dataset.itemId)
            .eq("shop_id", context.shopId);
        setMessage(error ? `Inspection item could not be saved: ${error.message}` : "Inspection item saved.", error ? "error" : "success");
    });

    inspectionList.addEventListener("focusout", async function (event) {
        if (!event.target.matches(".inspection-item-notes")) return;
        const itemRow = event.target.closest("[data-item-id]");
        const responseInput = itemRow.querySelector(".inspection-response");
        const meaning = responseInput.selectedOptions[0].dataset.meaning;
        const response = ({ positive: "pass", info: "info", attention: "attention", critical: "fail", na: "na", unanswered: "unanswered" })[meaning];
        const responseLabel = response === "unanswered" ? null : responseInput.value;
        const notes = event.target.value.trim();
        const { error } = await client.from("shop_inspection_items")
            .update({ response, response_label: responseLabel, notes: notes || null, updated_by: context.user.id, updated_at: new Date().toISOString() })
            .eq("id", itemRow.dataset.itemId)
            .eq("shop_id", context.shopId);
        if (error) setMessage(`Inspection notes could not be saved: ${error.message}`, "error");
    });

    inspectionList.addEventListener("click", async function (event) {
        const button = event.target.closest("button[data-complete-inspection]");
        if (!button) return;
        const inspectionId = button.dataset.completeInspection;
        const items = inspectionItems.filter(function (item) { return item.inspection_id === inspectionId; });
        const row = button.closest("[data-inspection-id]");
        const currentValues = Array.from(row.querySelectorAll("[data-item-id]")).map(function (itemRow) {
            return {
                id: itemRow.dataset.itemId,
                response: itemRow.querySelector(".inspection-response").selectedOptions[0].dataset.meaning,
                notes: itemRow.querySelector(".inspection-item-notes").value.trim()
            };
        });
        const unansweredRequired = items.some(function (item) {
            return item.is_required && currentValues.find(function (value) { return value.id === item.id; })?.response === "unanswered";
        });
        if (unansweredRequired) {
            setMessage("Answer every required item before completing the inspection.", "error");
            return;
        }
        button.disabled = true;
        const { error } = await client.from("shop_inspections")
            .update({ status: "complete", completed_by: context.user.id, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq("id", inspectionId)
            .eq("shop_id", context.shopId);
        if (error) {
            setMessage(`Inspection could not be completed: ${error.message}`, "error");
            button.disabled = false;
        } else {
            await renderInspections();
            setMessage("Inspection completed.", "success");
        }
    });

    async function initialize() {
        context = await window.trackRightAuthReady;
        if (!orderId || !context?.shopId) {
            setMessage("A valid repair order and shop membership are required.", "error");
            setControlsEnabled(false);
            return;
        }
        setControlsEnabled(canAddDocumentation());
        if (!canAddDocumentation()) {
            setMessage("Your role can view documentation but cannot add it.", "");
        }
        await loadInspectionConfiguration();
        await renderInspections();
        if (!inspectionRecords.length && inspectionSettings.default_attachment_mode === "attach" && canAddDocumentation()) {
            const { error } = await client.rpc("attach_shop_inspection", {
                requested_repair_order_id: String(orderId),
                requested_template_id: inspectionSettings.default_template_id || null
            });
            if (error) throw error;
            await renderInspections();
            setMessage("The shop's default inspection was attached automatically.", "success");
        } else if (!inspectionRecords.length && inspectionSettings.default_attachment_mode === "suggest") {
            setMessage("This shop suggests attaching an inspection to this repair order.", "");
        }
        await renderMedia();
    }

    initialize().catch(function (error) {
        console.error("Inspection and media failed to initialize:", error);
        setMessage(`Documentation could not be loaded: ${error.message}`, "error");
        setControlsEnabled(false);
    });
})();
