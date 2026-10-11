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
    let revised = false, confirmed = false, previousStatus = status.value;
    const dialog = el('approval-dialog');
    const contactChoice = el('approval-contact-choice'), scope = el('approval-scope');
    const customerOption = document.createElement('option');
    customerOption.value = 'customer'; customerOption.textContent = originalOrder.customer || 'RO customer';
    contactChoice.replaceChildren(customerOption);
    const otherOption = document.createElement('option'); otherOption.value = 'other'; otherOption.textContent = 'Other'; contactChoice.append(otherOption);
    contactChoice.value = originalOrder.customer ? 'customer' : 'other';
    scope.value = 'entire';
    function selectionFields() {
        el('approval-contact-label').hidden = contactChoice.value !== 'other';
        el('approval-scope-label').hidden = scope.value === 'entire';
    }
    contactChoice.addEventListener('change', selectionFields); scope.addEventListener('change', selectionFields);
    selectionFields();
    function authorization() {
        const method = el('approval-method').value;
        const contact = contactChoice.value === 'customer' ? (originalOrder.customer || '').trim() : el('approval-contact').value.trim();
        const notes = el('approval-notes').value.trim();
        const scopeValue = scope.value, scopeDetails = el('approval-scope-details').value.trim();
        if (!['verbal','written','digital'].includes(method) || !contact) throw new Error('Choose an approval method and enter the customer/contact who authorized the work.');
        if (!['entire','custom','other'].includes(scopeValue) || (scopeValue !== 'entire' && !scopeDetails)) throw new Error('Describe the custom or other work the customer approved.');
        if (method === 'verbal' && !notes) throw new Error('Add a note describing the verbal authorization.');
        return {method, contact, notes, scopeValue, scopeDetails: scopeValue === 'entire' ? '' : scopeDetails};
    }
    function openDialog() {
        if (!canWrite) return;
        el('approval-dialog-error').textContent = '';
        dialog.showModal();
    }
    function cancelApproval() {
        status.value = previousStatus === 'Approved' ? 'Approved' : previousStatus;
        repeat.checked = false; confirmed = false; dialog.close();
        status.dispatchEvent(new Event('change'));
    }
    el('approval-cancel').addEventListener('click', cancelApproval);
    dialog.addEventListener('cancel', event => { event.preventDefault(); cancelApproval(); });
    el('approval-confirm').addEventListener('click', () => {
        try {
            if (!ready) throw new Error(message.textContent || 'Approval history is still loading. Try again in a moment.');
            const auth = authorization(); confirmed = true; dialog.close();
            message.textContent = `Authorization ready: ${auth.contact} · ${auth.scopeValue === 'entire' ? 'Entire estimate' : auth.scopeDetails}. Save the repair order to record it.`;
        } catch (error) { el('approval-dialog-error').textContent = error.message; }
    });
    function showFields() {
        el('approval-repeat-label').hidden = !canWrite || originalOrder.estimateApprovalStatus !== 'Approved';
    }
    status.addEventListener('change', () => {
        showFields();
        if (status.value === 'Approved' && (revised || originalOrder.estimateApprovalStatus !== 'Approved') && !confirmed) openDialog();
        if (status.value !== 'Approved') { previousStatus = status.value; confirmed = false; }
    });
    repeat.addEventListener('change', () => { if (repeat.checked) openDialog(); });
    for (const node of estimateInputs) node.addEventListener('input', () => {
        revised = true; confirmed = false;
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
        if (error) { message.textContent = `Could not load approval history: ${error.message}. Refresh before recording approval.`; return; }
        history = data || []; ready = true;
        message.textContent = `Estimate version ${originalOrder.estimateVersion}. ${history.length ? 'Prior authorizations are preserved below.' : originalOrder.estimateApprovalStatus === 'Approved' ? 'Existing approval predates this history; its authorizer and time were not recorded.' : 'No customer authorization recorded.'}`;
        const list = el('approval-history'); list.replaceChildren();
        for (const approval of history) {
            const row = document.createElement('article'); row.className = 'approval-history-entry';
            const title = document.createElement('strong');
            title.textContent = `Version ${approval.estimate_version} · Estimate total ${Number(approval.approved_amount).toLocaleString(undefined,{style:'currency',currency:'USD'})} · ${approval.method}`;
            const scopeLine = document.createElement('p'); scopeLine.textContent = `Approved work: ${approval.approval_scope && approval.approval_scope !== 'entire' ? approval.approval_scope + ' — ' + approval.approval_scope_details : 'Entire estimate'}`;
            const contact = document.createElement('p'); contact.textContent = `Authorized by ${approval.customer_contact}`;
            const actor = document.createElement('p'); actor.textContent = `Recorded by ${approval.recorded_by_email || approval.recorded_by} · ${new Date(approval.recorded_at).toLocaleString()}`;
            const note = document.createElement('p'); note.textContent = approval.notes;
            row.append(title,contact,scopeLine,actor,note);
            const details = document.createElement('details'), summary = document.createElement('summary'), snapshot = document.createElement('div');
            summary.textContent = 'Authorized estimate details';
            const labels = {complaint:'Work requested',parts_needed:'Parts needed',customer_name:'Customer',unit_name:'Vehicle',estimate_labor_hours:'Labor hours',estimate_labor_rate:'Labor rate',estimate_parts_total:'Parts',estimate_other_charges:'Other charges',estimate_shop_supplies:'Shop supplies',estimate_environmental_fee:'Environmental fee',estimate_misc_fee_label:'Other fee description',estimate_discount:'Discount',estimate_total:'Estimate total',estimate_notes:'Estimate notes',estimate_shop_supplies_taxable:'Shop supplies taxable',estimate_environmental_fee_taxable:'Environmental fee taxable',estimate_misc_fee_taxable:'Other fee taxable'};
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
        const {method,contact,notes,scopeValue,scopeDetails} = authorization();
        if (!confirmed) { openDialog(); throw new Error('Confirm customer authorization in the popup before saving.'); }
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
        return {id:requestId,method,customer_contact:contact,notes,approval_scope:scopeValue,approval_scope_details:scopeDetails,evidence_path:file ? uploaded : null,evidence_name:file ? file.name : null,expected_version:originalOrder.estimateVersion,expected_updated_at:originalOrder.updatedAt};
    }};
};
