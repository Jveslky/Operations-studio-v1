(function () {
    "use strict";

    const client = window.trackRightSupabase;
    const behaviorForm = document.getElementById("inspection-behavior-form");
    const defaultMode = document.getElementById("inspection-default-mode");
    const defaultTemplate = document.getElementById("inspection-default-template");
    const reportPass = document.getElementById("inspection-report-pass");
    const reportInternalMedia = document.getElementById("inspection-report-internal-media");
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

    let context = null;
    let templates = [];

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
            const label = required ? line.slice(1).trim() : line;
            if (label) current.items.push({ label, required });
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
                lines.push(`${item.is_required ? "! " : ""}${item.label}`);
            });
        });
        return lines.join("\n");
    }

    async function loadTemplates() {
        const [templateResult, sectionResult, itemResult] = await Promise.all([
            client.from("shop_inspection_templates").select("id, name, description, is_archived, updated_at").eq("shop_id", context.shopId).order("name"),
            client.from("shop_inspection_template_sections").select("id, template_id, title, sort_order").eq("shop_id", context.shopId).order("sort_order"),
            client.from("shop_inspection_template_items").select("id, template_id, section_id, label, is_required, sort_order").eq("shop_id", context.shopId).order("sort_order")
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
            .select("default_attachment_mode, default_template_id, include_pass_items_in_report, include_internal_media_in_report")
            .eq("shop_id", context.shopId)
            .maybeSingle();
        if (error) throw error;
        defaultMode.value = data?.default_attachment_mode || "never";
        reportPass.checked = data?.include_pass_items_in_report !== false;
        reportInternalMedia.checked = data?.include_internal_media_in_report === true;
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
            updated_at: new Date().toISOString()
        });
        status(behaviorMessage, error ? `Could not save: ${error.message}` : "Inspection behavior saved.", error ? "error" : "success");
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
        Array.from(behaviorForm.elements).concat(Array.from(templateForm.elements)).forEach(function (element) { element.disabled = !editable; });
        await loadTemplates();
        await loadBehavior();
        if (!editable) status(behaviorMessage, "Owner or admin access is required to change inspection settings.", "error");
    }

    initialize().catch(function (error) {
        console.error("Inspection settings failed to initialize:", error);
        status(behaviorMessage, `Inspection settings could not load: ${error.message}`, "error");
    });
})();
