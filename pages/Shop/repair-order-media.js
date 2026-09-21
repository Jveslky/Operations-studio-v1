(function () {
    "use strict";

    const client = window.trackRightSupabase;
    const orderId = new URLSearchParams(window.location.search).get("id");
    const attachInspectionButton = document.getElementById("attach-inspection-button");
    const inspectionList = document.getElementById("inspection-list");
    const message = document.getElementById("inspection-media-message");
    const mediaForm = document.getElementById("ro-media-form");
    const mediaFile = document.getElementById("ro-media-file");
    const mediaCategory = document.getElementById("ro-media-category");
    const mediaVisibility = document.getElementById("ro-media-visibility");
    const mediaCaption = document.getElementById("ro-media-caption");
    const uploadButton = document.getElementById("upload-ro-media");
    const mediaList = document.getElementById("ro-media-list");
    const allowedTypes = new Set([
        "image/jpeg", "image/png", "image/heic", "image/heif",
        "video/mp4", "video/quicktime", "video/webm"
    ]);

    let context = null;
    let mediaRecords = [];

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
        const { data, error } = await client.from("shop_inspections")
            .select("id, title, status, created_at, created_by")
            .eq("shop_id", context.shopId)
            .eq("repair_order_id", orderId)
            .neq("status", "archived")
            .order("created_at", { ascending: false });

        if (error) throw error;
        inspectionList.replaceChildren();
        if (!data.length) {
            const empty = document.createElement("p");
            empty.className = "ro-media-meta";
            empty.textContent = "No inspection attached. This repair order does not require one by default.";
            inspectionList.appendChild(empty);
            return;
        }

        data.forEach(function (inspection) {
            const row = document.createElement("article");
            row.className = "inspection-row";
            const details = document.createElement("div");
            const title = document.createElement("strong");
            title.textContent = inspection.title || "Inspection";
            const date = document.createElement("span");
            date.textContent = `Attached ${formatDate(inspection.created_at)}`;
            details.append(title, date);
            const status = document.createElement("span");
            status.className = "inspection-status";
            status.textContent = inspection.status;
            row.append(details, status);
            inspectionList.appendChild(row);
        });
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
        const { error } = await client.from("shop_inspections").insert({
            shop_id: context.shopId,
            repair_order_id: String(orderId),
            title: "General Inspection",
            status: "draft",
            created_by: context.user.id
        });
        if (error) {
            setMessage(`Inspection could not be attached: ${error.message}`, "error");
        } else {
            await renderInspections();
            setMessage("Inspection attached. Checklist templates will be added in the next inspection PR.", "success");
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
            uploaded_by: context.user.id
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
        await Promise.all([renderInspections(), renderMedia()]);
    }

    initialize().catch(function (error) {
        console.error("Inspection and media failed to initialize:", error);
        setMessage(`Documentation could not be loaded: ${error.message}`, "error");
        setControlsEnabled(false);
    });
})();
