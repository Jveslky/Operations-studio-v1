/* Authorization evidence is shop-private; audit identity and timestamp come from the server. */
window.createEstimateApprovalAudit = function (originalOrder) {
    originalOrder = {...originalOrder};
    const el = id => document.getElementById(id);
    const client = window.trackRightSupabase;
    const status = el('estimate-approval-status');
    const message = el('approval-audit-message');
    const fields = el('approval-fields');
    const repeat = el('approval-repeat');
    const evidence = el('approval-evidence');
    let history = [], ready = false, uploaded = null, uploadedFile = null, requestId = null;
    const canWrite = window.trackRightCan('repair_orders.write');
    const estimateInputs = Array.from(document.querySelectorAll('[id^="estimate-"]')).filter(node => ['INPUT','TEXTAREA'].includes(node.tagName));
    // Work descriptions are part of the authorized estimate, too.
    for (const id of ['complaint','parts-needed']) { const node = el(id); if (node) estimateInputs.push(node); }
    let revised = false;
    function showFields() {
        fields.hidden = !canWrite || status.value !== 'Approved' || (originalOrder.estimateApprovalStatus === 'Approved' && !revised && !repeat.checked);
        el('approval-repeat-label').hidden = !canWrite || originalOrder.estimateApprovalStatus !== 'Approved';
    }
    status.addEventListener('change', showFields);
    repeat.addEventListener('change', showFields);
    for (const node of estimateInputs) node.addEventListener('input', () => {
        revised = true;
        if (status.value === 'Approved') {
            status.value = 'Draft';
            status.dispatchEvent(new Event('change'));
            message.textContent = 'Estimate changed. Earlier authorizations are preserved; record fresh approval for the revision.';
        }
    });
    for (const node of fields.querySelectorAll('input,select,textarea')) node.disabled = !canWrite;
    async function load() {
        if (!canWrite) { message.textContent = 'Customer authorization history is available to office staff.'; return; }
        if (!originalOrder.approvalAuditAvailable) { message.textContent = 'Approval history is unavailable until the database update is installed.'; return; }
        const context = await window.trackRightAuthReady;
        const {data,error} = await client.from('shop_estimate_approvals').select('*').eq('shop_id',context.shopId).eq('repair_order_id',originalOrder.recordId).order('recorded_at',{ascending:false});
        if (error) { message.textContent = 'Could not load approval history. Refresh before recording approval.'; return; }
        history = data || []; ready = true;
        message.textContent = `Estimate version ${originalOrder.estimateVersion}. ${history.length ? 'Prior authorizations are preserved below.' : originalOrder.estimateApprovalStatus === 'Approved' ? 'Existing approval predates this history; its authorizer and time were not recorded.' : 'No customer authorization recorded.'}`;
        const list = el('approval-history'); list.replaceChildren();
        for (const approval of history) {
            const row = document.createElement('article'); row.className = 'approval-history-entry';
            const title = document.createElement('strong');
            title.textContent = `Version ${approval.estimate_version} · ${Number(approval.approved_amount).toLocaleString(undefined,{style:'currency',currency:'USD'})} · ${approval.method}`;
            const contact = document.createElement('p'); contact.textContent = `Authorized by ${approval.customer_contact}`;
            const actor = document.createElement('p'); actor.textContent = `Recorded by ${approval.recorded_by_email || approval.recorded_by} · ${new Date(approval.recorded_at).toLocaleString()}`;
            const note = document.createElement('p'); note.textContent = approval.notes;
            row.append(title,contact,actor,note);
            const details = document.createElement('details'), summary = document.createElement('summary'), snapshot = document.createElement('div');
            summary.textContent = 'Authorized estimate details';
            const labels = {complaint:'Work requested',parts_needed:'Parts needed',customer_name:'Customer',unit_name:'Vehicle',estimate_labor_hours:'Labor hours',estimate_labor_rate:'Labor rate',estimate_parts_total:'Parts',estimate_other_charges:'Other charges',estimate_shop_supplies:'Shop supplies',estimate_environmental_fee:'Environmental fee',estimate_misc_fee_label:'Other fee description',estimate_discount:'Discount',estimate_total:'Authorized total',estimate_notes:'Estimate notes',estimate_shop_supplies_taxable:'Shop supplies taxable',estimate_environmental_fee_taxable:'Environmental fee taxable',estimate_misc_fee_taxable:'Other fee taxable'};
            for (const [key,value] of Object.entries(approval.estimate_snapshot)) {
                if (!labels[key]) continue;
                const line = document.createElement('p'); line.textContent = `${labels[key]}: ${value}`; snapshot.append(line);
            }
            details.append(summary,snapshot); row.append(details);
            if (approval.evidence_path) {
                const button = document.createElement('button'); button.type = 'button'; button.textContent = `Open evidence: ${approval.evidence_name || 'Document'}`;
                button.addEventListener('click',async () => {
                    button.disabled = true;
                    try {
                        const result = await client.storage.from('shop-approval-evidence').download(approval.evidence_path);
                        if (result.error) throw result.error;
                        const url = URL.createObjectURL(result.data), link = document.createElement('a');
                        link.href = url; link.download = approval.evidence_name || 'approval-evidence'; link.click();
                        setTimeout(() => URL.revokeObjectURL(url),60000);
                    } catch (error) { message.textContent = `Could not open evidence: ${error.message}`; }
                    finally { button.disabled = false; }
                }); row.append(button);
            }
            list.append(row);
        }
    }
    load().catch(error => { message.textContent = `Could not load approval history: ${error.message}`; });
    setTimeout(showFields,0);
    return { async prepare(order) {
        if (order.estimateApprovalStatus !== 'Approved') return null;
        const requiresApproval = revised || originalOrder.estimateApprovalStatus !== 'Approved' || repeat.checked;
        if (!requiresApproval) return null;
        if (!ready) throw new Error('Approval history is unavailable. Install the database update or refresh before recording authorization.');
        const method = el('approval-method').value, contact = el('approval-contact').value.trim(), notes = el('approval-notes').value.trim();
        if (!['verbal','written','digital'].includes(method) || !contact) throw new Error('Choose an approval method and enter the customer/contact who authorized the work.');
        if (method === 'verbal' && !notes) throw new Error('Add a note describing the verbal authorization.');
        const context = await window.trackRightAuthReady, file = evidence.files[0];
        if (file && (file.size > 10*1024*1024 || file.size === 0 || !['application/pdf','image/jpeg','image/png','image/webp'].includes(file.type))) throw new Error('Evidence must be a PDF, JPG, PNG or WebP up to 10 MB.');
        if (!requestId) requestId = crypto.randomUUID();
        if (file && uploadedFile !== file) {
            const extension = {'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[file.type];
            const path = `${context.shopId}/${originalOrder.recordId}/${crypto.randomUUID()}.${extension}`;
            const result = await client.storage.from('shop-approval-evidence').upload(path,file,{contentType:file.type,upsert:false});
            if (result.error) throw result.error;
            uploaded = path; uploadedFile = file;
        }
        return {id:requestId,method,customer_contact:contact,notes,evidence_path:file ? uploaded : null,evidence_name:file ? file.name : null,expected_version:originalOrder.estimateVersion,expected_updated_at:originalOrder.updatedAt};
    }};
};
