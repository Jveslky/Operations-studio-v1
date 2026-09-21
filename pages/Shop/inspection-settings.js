(function () {
    "use strict";

    const client = window.trackRightSupabase;
    const behaviorForm = document.getElementById("inspection-behavior-form");
    const defaultMode = document.getElementById("inspection-default-mode");
    const defaultTemplate = document.getElementById("inspection-default-template");
    const reportPass = document.getElementById("inspection-report-pass");
    const reportInternalMedia = document.getElementById("inspection-report-internal-media");
    const completionNotifications = document.getElementById("inspection-completion-notifications");
    const behaviorMessage = document.getElementById("inspection-behavior-message");
    const templateForm = document.getElementById("inspection-template-form");
    const templateId = document.getElementById("inspection-template-id");
    const templateName = document.getElementById("inspection-template-name");
    const templateDescription = document.getElementById("inspection-template-description");
    const templateSection = document.getElementById("inspection-template-section");
    const templateItems = document.getElementById("inspection-template-items");
    const templateMessage = document.getElementById("inspection-template-message");
    const templateList = document.getElementById("inspection-template-list");
    const saveTemplate = document.getElementById("save-inspection-template");
    const cancelEdit = document.getElementById("cancel-inspection-template");
    const responseSetForm = document.getElementById("inspection-response-set-form");
    const responseSetId = document.getElementById("inspection-response-set-id");
    const responseSetName = document.getElementById("inspection-response-set-name");
    const responseSetOptions = document.getElementById("inspection-response-set-options");
    const responseSetMessage = document.getElementById("inspection-response-set-message");
    const responseSetList = document.getElementById("inspection-response-set-list");
    const saveResponseSet = document.getElementById("save-inspection-response-set");
    const cancelResponseSet = document.getElementById("cancel-inspection-response-set");

    let context = null;
    let templates = [];
    let responseSets = [];

    function status(element, text, state) {
        element.textContent = text;
        element.className = `settings-message${state ? ` ${state}` : ""}`;
    }

    function canManage() {
        return ["owner", "admin"].includes(context?.role);
    }

    function parseSections() {
        const sections = [];
        let current = { title: templateSection.value.trim(), items: [] };
        templateItems.value.split(/\r?\n/).forEach(function (rawLine) {
            const line = rawLine.trim();
            if (!line) return;
            if (line.startsWith("##")) {
                if (current.items.length) sections.push(current);
                current = { title: line.slice(2).trim(), items: [] };
                return;
            }
            const required = line.startsWith("!");
            let label = required ? line.slice(1).trim() : line;
            let responseSet = responseSets.find(function (set) { return set.name === "Standard" && !set.is_archived; });
            const responseMatch = label.match(/^\[([^\]]+)\]\s*(.+)$/);
            if (responseMatch) {
                responseSet = responseSets.find(function (set) { return !set.is_archived && set.name.toLowerCase() === responseMatch[1].trim().toLowerCase(); });
                if (!responseSet) throw new Error(`Unknown response set: ${responseMatch[1]}`);
                label = responseMatch[2].trim();
            }
            if (label) current.items.push({ label, required, responseSetId: responseSet?.id || null });
        });
        if (current.items.length) sections.push(current);
        if (!sections.length || sections.some(function (section) { return !section.title; })) {
            throw new Error("Every checklist item must belong to a named section.");
        }
        return sections;
    }

    function serializeTemplate(template) {
        const lines = [];
        template.sections.forEach(function (section, sectionIndex) {
            if (sectionIndex > 0) lines.push(`## ${section.title}`);
            section.items.forEach(function (item) {
                const set = responseSets.find(function (responseSet) { return responseSet.id === item.response_set_id; });
                const prefix = set && set.name !== "Standard" ? `[${set.name}] ` : "";
                lines.push(`${item.is_required ? "! " : ""}${prefix}${item.label}`);
            });
        });
        return lines.join("\n");
    }

    async function loadTemplates() {
        const [templateResult, sectionResult, itemResult] = await Promise.all([
            client.from("shop_inspection_templates").select("id, name, description, is_archived, updated_at").eq("shop_id", context.shopId).order("name"),
            client.from("shop_inspection_template_sections").select("id, template_id, title, sort_order").eq("shop_id", context.shopId).order("sort_order"),
            client.from("shop_inspection_template_items").select("id, template_id, section_id, label, is_required, response_set_id, sort_order").eq("shop_id", context.shopId).order("sort_order")
        ]);
        const error = templateResult.error || sectionResult.error || itemResult.error;
        if (error) throw error;

        templates = templateResult.data.map(function (template) {
            return {
                ...template,
                sections: sectionResult.data.filter(function (section) { return section.template_id === template.id; }).map(function (section) {
                    return {
                        ...section,
                        items: itemResult.data.filter(function (item) { return item.section_id === section.id; })
                    };
                })
            };
        });
        renderTemplates();
        populateDefaultTemplates();
    }

    async function loadResponseSets() {
        const [setResult, optionResult] = await Promise.all([
            client.from("shop_inspection_response_sets").select("id, name, is_archived, is_system").eq("shop_id", context.shopId).order("name"),
            client.from("shop_inspection_response_options").select("id, response_set_id, label, meaning, sort_order").eq("shop_id", context.shopId).order("sort_order")
        ]);
        if (setResult.error || optionResult.error) throw setResult.error || optionResult.error;
        responseSets = setResult.data.map(function (set) {
            return { ...set, options: optionResult.data.filter(function (option) { return option.response_set_id === set.id; }) };
        });
        renderResponseSets();
    }

    function renderResponseSets() {
        responseSetList.replaceChildren();
        responseSets.forEach(function (set) {
            const row = document.createElement("article"); row.className = "inspection-template-row";
            const details = document.createElement("div");
            const title = document.createElement("strong"); title.textContent = `${set.name}${set.is_archived ? " — Archived" : ""}`;
            const summary = document.createElement("p"); summary.textContent = set.options.map(function (option) { return option.label; }).join(" · ");
            details.append(title, summary);
            const actions = document.createElement("div"); actions.className = "inspection-template-actions";
            if (!set.is_archived) {
                const edit = document.createElement("button"); edit.type = "button"; edit.dataset.editResponseSet = set.id; edit.textContent = "Edit"; actions.appendChild(edit);
            }
            if (!set.is_system) {
                const archive = document.createElement("button"); archive.type = "button"; archive.dataset.archiveResponseSet = set.id; archive.textContent = set.is_archived ? "Restore" : "Archive"; actions.appendChild(archive);
            }
            row.append(details, actions); responseSetList.appendChild(row);
        });
    }

    function parseResponseOptions() {
        const meanings = new Set(["positive", "info", "attention", "critical", "na"]);
        const options = responseSetOptions.value.split(/\r?\n/).filter(function (line) { return line.trim(); }).map(function (line) {
            const parts = line.split("|");
            const label = parts[0]?.trim(); const meaning = parts[1]?.trim().toLowerCase();
            if (!label || !meanings.has(meaning)) throw new Error(`Invalid response choice: ${line}`);
            return { label, meaning };
        });
        if (options.length < 2) throw new Error("A response set needs at least two choices.");
        if (new Set(options.map(function (option) { return option.label.toLowerCase(); })).size !== options.length) {
            throw new Error("Response choice labels must be unique within a set.");
        }
        return options;
    }

    function resetResponseSetForm() {
        responseSetForm.reset(); responseSetId.value = ""; responseSetName.disabled = !canManage(); saveResponseSet.textContent = "Save Response Set"; cancelResponseSet.hidden = true;
    }

    function populateDefaultTemplates(selectedValue) {
        const selected = selectedValue !== undefined ? selectedValue : defaultTemplate.value;
        defaultTemplate.innerHTML = '<option value="">No default template</option>';
        templates.filter(function (template) { return !template.is_archived; }).forEach(function (template) {
            const option = document.createElement("option");
            option.value = template.id;
            option.textContent = template.name;
            defaultTemplate.appendChild(option);
        });
        defaultTemplate.value = selected || "";
    }

    function renderTemplates() {
        templateList.replaceChildren();
        if (!templates.length) {
            templateList.textContent = "No inspection templates created.";
            return;
        }
        templates.forEach(function (template) {
            const row = document.createElement("article");
            row.className = "inspection-template-row";
            const details = document.createElement("div");
            const title = document.createElement("strong");
            title.textContent = `${template.name}${template.is_archived ? " — Archived" : ""}`;
            const summary = document.createElement("p");
            const itemCount = template.sections.reduce(function (total, section) { return total + section.items.length; }, 0);
            summary.textContent = `${template.sections.length} section${template.sections.length === 1 ? "" : "s"} · ${itemCount} item${itemCount === 1 ? "" : "s"}${template.description ? ` · ${template.description}` : ""}`;
            details.append(title, summary);
            const actions = document.createElement("div");
            actions.className = "inspection-template-actions";
            if (!template.is_archived) {
                const edit = document.createElement("button");
                edit.type = "button";
                edit.dataset.editTemplate = template.id;
                edit.textContent = "Edit";
                actions.appendChild(edit);
            }
            const archive = document.createElement("button");
            archive.type = "button";
            archive.dataset.archiveTemplate = template.id;
            archive.textContent = template.is_archived ? "Restore" : "Archive";
            actions.appendChild(archive);
            row.append(details, actions);
            templateList.appendChild(row);
        });
    }

    async function loadBehavior() {
        const { data, error } = await client.from("shop_inspection_settings")
            .select("default_attachment_mode, default_template_id, include_pass_items_in_report, include_internal_media_in_report, completion_notifications_enabled")
            .eq("shop_id", context.shopId)
            .maybeSingle();
        if (error) throw error;
        defaultMode.value = data?.default_attachment_mode || "never";
        reportPass.checked = data?.include_pass_items_in_report !== false;
        reportInternalMedia.checked = data?.include_internal_media_in_report === true;
        completionNotifications.checked = data?.completion_notifications_enabled !== false;
        populateDefaultTemplates(data?.default_template_id || "");
    }

    function resetTemplateForm() {
        templateForm.reset();
        templateId.value = "";
        saveTemplate.textContent = "Save Template";
        cancelEdit.hidden = true;
        status(templateMessage, "", "");
    }

    behaviorForm.addEventListener("submit", async function (event) {
        event.preventDefault();
        status(behaviorMessage, "Saving inspection behavior…", "");
        const { error } = await client.from("shop_inspection_settings").upsert({
            shop_id: context.shopId,
            default_attachment_mode: defaultMode.value,
            default_template_id: defaultTemplate.value || null,
            include_pass_items_in_report: reportPass.checked,
            include_internal_media_in_report: reportInternalMedia.checked,
            completion_notifications_enabled: completionNotifications.checked,
            updated_at: new Date().toISOString()
        });
        status(behaviorMessage, error ? `Could not save: ${error.message}` : "Inspection behavior saved.", error ? "error" : "success");
    });

    responseSetForm.addEventListener("submit", async function (event) {
        event.preventDefault();
        let options;
        try { options = parseResponseOptions(); } catch (error) { status(responseSetMessage, error.message, "error"); return; }
        saveResponseSet.disabled = true;
        const { error } = await client.rpc("save_shop_inspection_response_set", {
            requested_response_set_id: responseSetId.value || null,
            requested_name: responseSetName.value.trim(),
            requested_options: options
        });
        if (error) status(responseSetMessage, `Could not save response set: ${error.message}`, "error");
        else { resetResponseSetForm(); await loadResponseSets(); status(responseSetMessage, "Response set saved.", "success"); }
        saveResponseSet.disabled = false;
    });

    cancelResponseSet.addEventListener("click", resetResponseSetForm);

    responseSetList.addEventListener("click", async function (event) {
        const edit = event.target.closest("button[data-edit-response-set]");
        const archive = event.target.closest("button[data-archive-response-set]");
        if (edit) {
            const set = responseSets.find(function (item) { return item.id === edit.dataset.editResponseSet; });
            if (!set) return;
            responseSetId.value = set.id; responseSetName.value = set.name; responseSetName.disabled = set.is_system;
            responseSetOptions.value = set.options.map(function (option) { return `${option.label} | ${option.meaning}`; }).join("\n");
            saveResponseSet.textContent = "Update Response Set"; cancelResponseSet.hidden = false;
            responseSetForm.scrollIntoView({ behavior: "smooth", block: "center" });
        }
        if (archive) {
            const set = responseSets.find(function (item) { return item.id === archive.dataset.archiveResponseSet; });
            if (!set) return;
            const { error } = await client.from("shop_inspection_response_sets").update({ is_archived: !set.is_archived, updated_at: new Date().toISOString() }).eq("id", set.id).eq("shop_id", context.shopId);
            if (error) status(responseSetMessage, `Could not update response set: ${error.message}`, "error"); else await loadResponseSets();
        }
    });

    templateForm.addEventListener("submit", async function (event) {
        event.preventDefault();
        let sections;
        try { sections = parseSections(); } catch (error) {
            status(templateMessage, error.message, "error");
            return;
        }
        saveTemplate.disabled = true;
        status(templateMessage, "Saving template…", "");
        const { error } = await client.rpc("save_shop_inspection_template", {
            requested_template_id: templateId.value || null,
            requested_name: templateName.value.trim(),
            requested_description: templateDescription.value.trim() || null,
            requested_sections: sections
        });
        if (error) {
            status(templateMessage, `Could not save template: ${error.message}`, "error");
        } else {
            resetTemplateForm();
            await loadTemplates();
            status(templateMessage, "Template saved.", "success");
        }
        saveTemplate.disabled = false;
    });

    cancelEdit.addEventListener("click", resetTemplateForm);

    templateList.addEventListener("click", async function (event) {
        const editButton = event.target.closest("button[data-edit-template]");
        const archiveButton = event.target.closest("button[data-archive-template]");
        if (editButton) {
            const template = templates.find(function (item) { return item.id === editButton.dataset.editTemplate; });
            if (!template || !template.sections.length) return;
            templateId.value = template.id;
            templateName.value = template.name;
            templateDescription.value = template.description || "";
            templateSection.value = template.sections[0].title;
            templateItems.value = serializeTemplate(template);
            saveTemplate.textContent = "Update Template";
            cancelEdit.hidden = false;
            templateForm.scrollIntoView({ behavior: "smooth", block: "center" });
        }
        if (archiveButton) {
            const template = templates.find(function (item) { return item.id === archiveButton.dataset.archiveTemplate; });
            if (!template) return;
            if (!template.is_archived && defaultTemplate.value === template.id) {
                const settingsUpdate = await client.from("shop_inspection_settings")
                    .update({ default_template_id: null, updated_at: new Date().toISOString() })
                    .eq("shop_id", context.shopId);
                if (settingsUpdate.error) {
                    status(templateMessage, `Could not clear the default template: ${settingsUpdate.error.message}`, "error");
                    return;
                }
            }
            const { error } = await client.from("shop_inspection_templates")
                .update({ is_archived: !template.is_archived, updated_at: new Date().toISOString() })
                .eq("id", template.id)
                .eq("shop_id", context.shopId);
            if (error) status(templateMessage, `Could not update template: ${error.message}`, "error");
            else await loadTemplates();
        }
    });

    async function initialize() {
        context = await window.trackRightAuthReady;
        const editable = canManage();
        Array.from(behaviorForm.elements).concat(Array.from(templateForm.elements), Array.from(responseSetForm.elements)).forEach(function (element) { element.disabled = !editable; });
        const ensureResult = await client.rpc("ensure_shop_inspection_response_sets");
        if (ensureResult.error) throw ensureResult.error;
        await loadResponseSets();
        await loadTemplates();
        await loadBehavior();
        if (!editable) status(behaviorMessage, "Owner or admin access is required to change inspection settings.", "error");
    }

    initialize().catch(function (error) {
        console.error("Inspection settings failed to initialize:", error);
        status(behaviorMessage, `Inspection settings could not load: ${error.message}`, "error");
    });
})();
