/* Authorization evidence is shop-private; audit identity and timestamp come from the server. */
window.createEstimateApprovalAudit = function (originalOrder, getCurrentEstimate = () => originalOrder) {
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
    const snapshot = order => window.trackRightRepairOrders.approvalSnapshot(order);
    const canonical = value => JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a],[b]) => a.localeCompare(b))));
    const baseline = canonical(snapshot(originalOrder));
    let confirmedSnapshot = null, confirmedVersion = null;
    function estimateSummary(order = getCurrentEstimate()) {
        const currentSnapshot = canonical(snapshot(order));
        return {currentSnapshot, version: originalOrder.estimateVersion + (currentSnapshot !== baseline ? 1 : 0), total: Math.round(Number(order.estimateTotal || 0) * 100) / 100};
    }
    let revised = false, confirmed = false, previousStatus = status.value;
    const dialog = el('approval-dialog');
    const contactChoice = el('approval-contact-choice'), scope = el('approval-scope');
    const customerOption = document.createElement('option');
    customerOption.value = 'customer'; customerOption.textContent = originalOrder.customer || 'RO customer';
    contactChoice.replaceChildren(customerOption);
    const otherOption = document.createElement('option'); otherOption.value = 'other'; otherOption.textContent = 'Other'; contactChoice.append(otherOption);
    contactChoice.value = originalOrder.customer ? 'customer' : 'other';
    scope.value = 'entire';
    const relationship = el('approval-relationship'), related = el('approval-related');
    const superseded = id => history.some(a => a.related_authorization_id === id && ['replacement','amendment'].includes(a.authorization_relationship));
    function relationshipFields() {
        const linked = ['replacement','amendment'].includes(relationship.value);
        el('approval-related-label').hidden = !linked;
        el('approval-relationship-notes-label').hidden = relationship.value !== 'amendment';
        el('approval-relationship-help').textContent = linked ? 'Enter the complete resulting scope and amount. This replaces the selected authorization; other authorizations remain unchanged.' : history.length ? 'Additional work keeps earlier authorizations unchanged. Enter only the newly authorized scope and amount.' : '';
        el('approval-summary-relationship').textContent = history.length ? `${relationship.value || 'Choose relationship'}${linked ? ' — ' + (related.options?.[related.selectedIndex]?.textContent || related.value || 'Select earlier authorization') : ''}` : 'Initial authorization';
    }
    relationship.addEventListener('change', () => {
        confirmed = false;
        const entire = Array.from(scope.options || []).find(option => option.value === 'entire');
        if (entire) entire.disabled = relationship.value === 'additional';
        if (relationship.value === 'additional') { scope.value = 'custom'; amount.value = ''; selectionFields(); }
        relationshipFields();
    });
    related.addEventListener('change', () => { confirmed = false; relationshipFields(); });
    const amount = el('approval-authorized-amount');
    const money = value => Number(value).toLocaleString('en-US', {style:'currency',currency:'USD'});
    function renderSummary() {
        const summary = estimateSummary();
        el('approval-summary-version').textContent = `Rev. ${summary.version}`;
        el('approval-summary-scope').textContent = scope.value === 'entire' ? 'Entire estimate' : `${scope.value === 'custom' ? 'Custom' : 'Other'} — ${el('approval-scope-details').value.trim() || 'Describe approved work'}`;
        el('approval-summary-total').textContent = money(summary.total);
        amount.readOnly = scope.value === 'entire';
        if (amount.readOnly) amount.value = summary.total.toFixed(2);
        el('approval-amount-help').textContent = relationship.value === 'additional' ? 'Enter the additional estimate amount only. Earlier authorizations stay unchanged.' : amount.readOnly ? 'The entire estimate amount will be recorded.' : 'Enter the agreed amount for this scope only. The full estimate is preserved separately.';
    }
    function selectionFields() {
        el('approval-contact-label').hidden = contactChoice.value !== 'other';
        el('approval-scope-label').hidden = scope.value === 'entire';
        renderSummary();
    }
    contactChoice.addEventListener('change', selectionFields); scope.addEventListener('change', () => { amount.value = ''; confirmed = false; selectionFields(); });
    el('approval-scope-details').addEventListener('input', renderSummary);
    selectionFields();
    function authorization() {
        const method = el('approval-method').value;
        const contact = contactChoice.value === 'customer' ? (originalOrder.customer || '').trim() : el('approval-contact').value.trim();
        const notes = el('approval-notes').value.trim();
        const scopeValue = scope.value, scopeDetails = el('approval-scope-details').value.trim();
        if (!['verbal','written','digital'].includes(method) || !contact) throw new Error('Choose an approval method and enter the customer/contact who authorized the work.');
        if (!['entire','custom','other'].includes(scopeValue) || (scopeValue !== 'entire' && !scopeDetails)) throw new Error('Describe the custom or other work the customer approved.');
        if (method === 'verbal' && !notes) throw new Error('Add a note describing the verbal authorization.');
        const relation = history.length ? relationship.value : 'initial';
        if (relation === 'additional' && scopeValue === 'entire') throw new Error('Additional work requires its own description and amount; choose Custom or Other.');
        const relatedId = ['replacement','amendment'].includes(relation) ? related.value : null;
        const relationshipNotes = el('approval-relationship-notes').value.trim();
        if (!['initial','additional','replacement','amendment'].includes(relation)) throw new Error('Choose how this authorization relates to earlier authorizations.');
        if (['replacement','amendment'].includes(relation) && !history.some(a => a.id === relatedId && !superseded(a.id))) throw new Error('Select an earlier authorization that has not already been superseded.');
        if (relation === 'amendment' && !relationshipNotes) throw new Error('Explain the amendment and enter its complete resulting scope and amount.');
        const rawAmount = scopeValue === 'entire' ? estimateSummary().total.toFixed(2) : amount.value.trim();
        if (!/^\d+(\.\d{1,2})?$/.test(rawAmount) || Number(rawAmount) > 9999999999.99) throw new Error('Enter an authorized amount of zero or more with no more than two decimal places.');
        return {relation,relatedId,relationshipNotes,authorizedAmount: Number(rawAmount),method, contact, notes, scopeValue, scopeDetails: scopeValue === 'entire' ? '' : scopeDetails};
    }
    function openDialog() {
        if (!canWrite) return;
        el('approval-dialog-error').textContent = '';
        renderSummary(); relationshipFields();
        if (!dialog.open) dialog.showModal();
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
            renderSummary();
            if (!ready) throw new Error(message.textContent || 'Approval history is still loading. Try again in a moment.');
            const auth = authorization(), summary = estimateSummary(); confirmedSnapshot = summary.currentSnapshot; confirmedVersion = summary.version; confirmed = true; dialog.close();
            message.textContent = `Authorization ready: ${auth.contact} · ${money(auth.authorizedAmount)} · Rev. ${confirmedVersion} · ${auth.scopeValue === 'entire' ? 'Entire estimate' : auth.scopeDetails}. Save the repair order to record it.`;
        } catch (error) { el('approval-dialog-error').textContent = error.message; }
    });
    function showFields() {
        el('approval-repeat-label').hidden = true;
        if (el('approval-record-button')) el('approval-record-button').hidden = !canWrite;
    }
    status.addEventListener('change', () => {
        showFields();
        if (status.value === 'Approved' && (revised || originalOrder.estimateApprovalStatus !== 'Approved') && !confirmed) openDialog();
        if (status.value !== 'Approved') { previousStatus = status.value; confirmed = false; }
    });
    el('approval-record-button')?.addEventListener('click', () => {
        if (!canWrite) return;
        if (!ready) { message.textContent = 'Approval history is unavailable. Refresh before recording authorization.'; return; }
        repeat.checked = true; status.value = 'Approved'; status.dispatchEvent(new Event('change')); openDialog();
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
        const {data,error} = await client.from('shop_estimate_approvals').select('*,approval_scope,approval_scope_details,authorization_amount,authorization_relationship,related_authorization_id,relationship_notes').eq('shop_id',context.shopId).eq('repair_order_id',originalOrder.recordId).order('recorded_at',{ascending:false});
        if (error) { message.textContent = `Could not load approval history: ${error.message}. Refresh before recording approval.`; return; }
        history = data || []; ready = true;
        el('approval-relationship-label').hidden = !history.length;
        related.replaceChildren();
        const placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = 'Select earlier authorization'; related.append(placeholder);
        for (const a of history.filter(a => !superseded(a.id))) {
            const option = document.createElement('option'); option.value = a.id;
            option.textContent = `Rev. ${a.estimate_version} · ${money(a.authorization_amount ?? a.approved_amount)} · ${a.customer_contact} · ${new Date(a.recorded_at).toLocaleString()}`; related.append(option);
        }
        related.value = ''; relationshipFields();
        message.textContent = `Estimate version ${originalOrder.estimateVersion}. ${history.length ? 'Prior authorizations are preserved below.' : originalOrder.estimateApprovalStatus === 'Approved' ? 'Existing approval predates this history; its authorizer and time were not recorded.' : 'No customer authorization recorded.'}`;
        const list = el('approval-history'); list.replaceChildren();
        for (const approval of history) {
            const row = document.createElement('article'); row.className = 'approval-history-entry';
            const title = document.createElement('strong');
            title.textContent = `Version ${approval.estimate_version} · ${approval.authorization_amount != null ? 'Authorized ' + money(approval.authorization_amount) : 'Estimate total ' + money(approval.approved_amount) + (approval.approval_scope !== 'entire' ? ' (scope amount not recorded)' : '')}`;
            const scopeLine = document.createElement('p'); scopeLine.textContent = `Approved work: ${approval.approval_scope === 'entire' ? 'Entire estimate' : approval.approval_scope ? approval.approval_scope + ' — ' + (approval.approval_scope_details || 'Description not recorded') : 'Scope not recorded'}`;
            const contact = document.createElement('p'); contact.textContent = `Authorized by ${approval.customer_contact}`;
            const actor = document.createElement('p'); actor.className = 'authorization-metadata'; actor.textContent = `Recorded by ${approval.recorded_by_email || approval.recorded_by} · ${new Date(approval.recorded_at).toLocaleString()}`;
            const note = document.createElement(approval.notes?.length > 160 ? 'details' : 'p'); note.className = 'authorization-note';
            if (approval.notes?.length > 160) {
                const preview = document.createElement('summary'); preview.textContent = `Customer acknowledgment: ${approval.notes.slice(0, 120)}…`;
                const full = document.createElement('p'); full.textContent = approval.notes; note.append(preview, full);
            } else note.textContent = `Customer acknowledgment: ${approval.notes || 'None recorded'}`;
            const indicator = document.createElement('p'); indicator.className = 'authorization-status ' + (superseded(approval.id) ? 'authorization-superseded' : approval.authorization_relationship ? 'authorization-active' : 'authorization-unconfirmed');
            indicator.textContent = superseded(approval.id) ? 'Superseded' : approval.authorization_relationship ? 'Active authorization' : 'Relationship not recorded — confirm which authorization governs the work';
            const relationLine = document.createElement('p'); relationLine.className = 'authorization-metadata';
            const predecessor = history.find(a => a.id === approval.related_authorization_id);
            relationLine.textContent = approval.authorization_relationship ? `${approval.authorization_relationship}${predecessor ? ' of authorization recorded ' + new Date(predecessor.recorded_at).toLocaleString() : ''}${approval.relationship_notes ? ': ' + approval.relationship_notes : ''}` : '';
            const header = document.createElement('header'); header.className = 'authorization-record-header'; const method = document.createElement('span'); method.className = 'authorization-metadata'; method.textContent = approval.method; header.append(title, method, indicator);
            if (!approval.authorization_relationship && !superseded(approval.id)) indicator.className += ' authorization-warning';
            row.append(header,contact,scopeLine);
            if (relationLine.textContent) row.append(relationLine);
            row.append(actor,note);
            const details = document.createElement('details'), summary = document.createElement('summary'), snapshot = document.createElement('div');
            summary.textContent = 'Full estimate snapshot';
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
        const {method,contact,notes,scopeValue,scopeDetails,authorizedAmount,relation,relatedId,relationshipNotes} = authorization();
        if (!confirmed) { openDialog(); throw new Error('Confirm customer authorization in the popup before saving.'); }
        const savingSummary = estimateSummary(order);
        if (savingSummary.currentSnapshot !== confirmedSnapshot || savingSummary.version !== confirmedVersion) {
            confirmed = false; openDialog(); throw new Error('Estimate changed after confirmation. Review the summary and confirm again.');
        }
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
        return {id:requestId,authorization_relationship:relation,related_authorization_id:relatedId,relationship_notes:relationshipNotes,method,customer_contact:contact,notes,approval_scope:scopeValue,approval_scope_details:scopeDetails,authorized_amount:authorizedAmount,expected_authorized_version:confirmedVersion,evidence_path:file ? uploaded : null,evidence_name:file ? file.name : null,expected_version:originalOrder.estimateVersion,expected_updated_at:originalOrder.updatedAt};
    }};
};
