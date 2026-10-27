(function () {
    "use strict";
    const client = window.trackRightSupabase;
    const byId = (id) => document.getElementById(id);
    const form = byId("bill-form");
    const list = byId("bill-list");
    const message = byId("bill-review-message");
    const warning = byId("bill-duplicate-warning");
    const fileField = byId("bill-document-field");
    const fileInput = byId("bill-document");
    const fields = {
        vendor: byId("bill-vendor"), invoice_number: byId("bill-reference"), invoice_date: byId("bill-invoice-date"),
        subtotal: byId("bill-subtotal"), tax: byId("bill-tax"), total: byId("bill-amount"), due_date: byId("bill-due-date"),
        category: byId("bill-category"), repair_order_id: byId("bill-repair-order"), notes: byId("bill-notes")
    };
    let context, bills = [], scanMode = false, documentPath = null, ocrText = "", canWrite = false, scanBusy = false, saveBusy = false, apFaultArmed = false, pendingBill = null, recoveryUnavailable = false, recoveryPanel = null;

    function setMessage(text, state) { message.textContent = text; message.className = `bill-review-message${state ? ` ${state}` : ""}`; }
    function money(value) { return Number(value || 0).toLocaleString("en-US", { style: "currency", currency: "USD" }); }
    function dateOnly(value) { return value ? String(value).slice(0, 10) : ""; }

    async function loadBills() {
        const result = await client.from("shop_accounts_payable").select("*").eq("shop_id", context.shopId).order("created_at", { ascending: false });
        if (result.error) throw result.error;
        bills = result.data; renderBills();
    }

    function renderBills() {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        let open = 0, soon = 0, overdue = 0, payable = 0;
        list.replaceChildren();
        bills.forEach(function (bill) {
            const paid = bill.status === "paid"; let display = paid ? "Paid" : "Open";
            if (!paid) { open += 1; payable += Number(bill.total) || 0; }
            if (!paid && bill.due_date) {
                const days = Math.ceil((new Date(`${bill.due_date}T00:00:00`) - today) / 86400000);
                if (days < 0) { display = "Overdue"; overdue += 1; } else if (days <= 7) { display = "Due Soon"; soon += 1; }
            }
            const card = document.createElement("article"); card.className = "bill-card"; card.dataset.billId = bill.id;
            const identity = document.createElement("div"); const vendor = document.createElement("strong"); vendor.textContent = bill.vendor; const reference = document.createElement("span"); reference.textContent = bill.invoice_number || "No reference"; identity.append(vendor, reference);
            const amount = document.createElement("div"); const amountLabel = document.createElement("span"); amountLabel.textContent = "Amount"; const amountValue = document.createElement("strong"); amountValue.textContent = money(bill.total); amount.append(amountLabel, amountValue);
            const due = document.createElement("div"); const dueLabel = document.createElement("span"); dueLabel.textContent = "Due"; const dueValue = document.createElement("strong"); dueValue.textContent = dateOnly(bill.due_date) || "No due date"; due.append(dueLabel, dueValue);
            const state = document.createElement("div"); const stateLabel = document.createElement("span"); stateLabel.textContent = "Status"; const stateValue = document.createElement("strong"); stateValue.className = `bill-status ${display.toLowerCase().replace(" ", "-")}`; stateValue.textContent = display; state.append(stateLabel, stateValue);
            if (bill.document_path) { const view = document.createElement("button"); view.type = "button"; view.dataset.documentPath = bill.document_path; view.textContent = "View Document"; state.appendChild(view); }
            if (bill.status !== 'void' && window.trackRightCan('inventory.receive') && window.trackRightCan('expenses.read')) { const receive=document.createElement('button');receive.type='button';receive.textContent='Review parts for receiving';receive.addEventListener('click',()=>window.shopAPReceiving.open(bill).catch(error=>{window.alert(error.message);}));state.append(receive); }
            if (!paid && canWrite) { const pay = document.createElement("button"); pay.type = "button"; pay.dataset.billId = bill.id; pay.textContent = "Mark Paid"; state.appendChild(pay); }
            card.append(identity, amount, due, state); list.appendChild(card);
        });
        if (!bills.length) list.innerHTML = '<p class="bill-list-empty">No vendor bills.</p>';
        byId("open-bill-count").textContent = open; byId("due-soon-count").textContent = soon; byId("overdue-bill-count").textContent = overdue; byId("total-payable").textContent = money(payable);
    }

    function pendingKey() { return `longshift.ap.bill.pending.v1:${context.shopId}:${context.user.id}`; }
    function readPending() {
        try { const raw=localStorage.getItem(pendingKey()); if(!raw)return null; const p=JSON.parse(raw);
            if(!p || p.version!==1 || p.shop!==context.shopId || p.actor!==context.user.id || typeof p.request!=='string' || !p.record || p.record.shop_id!==context.shopId || p.record.created_by!==context.user.id) throw Error('Invalid recovery data');
            return p;
        } catch (_) { recoveryUnavailable=true; return null; }
    }
    function drawRecovery() {
        if(!recoveryPanel){recoveryPanel=document.createElement('section');recoveryPanel.className='bill-duplicate-warning';form.before(recoveryPanel);}
        recoveryPanel.replaceChildren(); recoveryPanel.hidden=!pendingBill&&!recoveryUnavailable;
        const note=document.createElement('p');
        if(recoveryUnavailable){note.textContent='Bill recovery storage is unavailable or unreadable. No new bill can be submitted from this browser. Review your ledger and restore browser storage.';recoveryPanel.append(note);return;}
        if(!pendingBill)return;
        note.textContent=`A bill may already have been created: ${pendingBill.record.vendor} · ${pendingBill.record.invoice_number || 'no reference'} · ${money(pendingBill.record.total)}. Review the bill list. This saved request is available only in this browser for this account.`;
        const retry=document.createElement('button');retry.type='button';retry.textContent='Retry saved bill';retry.addEventListener('click',()=>sendPending());
        const resolve=document.createElement('button');resolve.type='button';resolve.textContent='Resolve after checking bills';resolve.addEventListener('click',()=>{
            if(saveBusy||!window.confirm('Only resolve after checking the bills and confirming the outcome. This clears the saved request on this browser. Continue?'))return;
            try {localStorage.removeItem(pendingKey());pendingBill=null;drawRecovery();}catch(_){recoveryUnavailable=true;drawRecovery();}
        });
        recoveryPanel.append(note,retry,resolve);
    }
    async function sendPending() {
        if(!pendingBill||saveBusy||recoveryUnavailable)return;
        saveBusy=true;drawRecovery();setMessage('Checking the saved bill request…','');
        let result;try {result=await client.rpc('create_shop_ap_bill_once',{p_shop:context.shopId,p_request:pendingBill.request,p_record:pendingBill.record});}
        catch(error){result={error};}
        if (!result.error && apFaultArmed && window.location.hostname === 'test-shop-combined.long-shift-test.pages.dev' && new URLSearchParams(window.location.search).get('btest') === 'ap-response-loss' && ['owner','admin'].includes(context.role)) {
            apFaultArmed=false;result={error:{message:'Btest: response lost after the server accepted the bill.'}};
        }
        saveBusy=false;
        if(result.error && String(result.error.message || '').includes('AP_DUPLICATE_REVIEW_REQUIRED')) {
            const rejected=pendingBill;
            try { localStorage.removeItem(pendingKey()); pendingBill=null; } catch (_) { recoveryUnavailable=true; drawRecovery(); return; }
            const record=rejected.record; form.hidden=false; scanMode=!!record.document_path; documentPath=record.document_path; ocrText=record.ocr_text || '';
            Object.keys(fields).forEach(key=>{fields[key].value=record[key] ?? '';});
            fileField.hidden=!scanMode; fileInput.required=false;
            try { await loadBills(); checkDuplicates(); setMessage('A matching bill appeared before this request was saved. Review it before deciding whether to create another.', 'error'); }
            catch (_) { setMessage('The bill was not created, but the bill list could not refresh. Reload and review the ledger before continuing.', 'error'); }
            drawRecovery(); return;
        }
        if(result.error){setMessage(`Bill outcome is uncertain: ${result.error.message} Check the bill list and retry the saved request.`, 'error');drawRecovery();return;}
        try {localStorage.removeItem(pendingKey());pendingBill=null;}catch(_){recoveryUnavailable=true;}
        form.dataset.saved='true';await closeForm();drawRecovery();
        try{await loadBills();setMessage('Bill saved.','success');}catch(_){setMessage('Bill saved, but the list could not refresh. Reload to see it.','error');}
    }
    function openForm(scanning) {
        if(scanBusy||saveBusy)return;
        if(recoveryUnavailable||pendingBill){drawRecovery();setMessage('Review the pending bill before starting another.','error');return;}
        scanMode = scanning; form.reset(); documentPath = null; ocrText = ""; warning.hidden = true; byId("bill-ocr-source").hidden=true;
        fileField.hidden = !scanning; fileInput.required = scanning; form.hidden = false;
        setMessage(scanning ? "Choose an invoice to upload privately and prepare OCR suggestions." : "Enter and confirm the bill details.", "");
        form.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    async function closeForm() {
        if(scanBusy||saveBusy)return;
        if (documentPath && !pendingBill && !recoveryUnavailable && form.dataset.saved !== "true") await client.storage.from("shop-ap-documents").remove([documentPath]);
        form.hidden = true; form.reset(); documentPath = null; ocrText = ""; delete form.dataset.saved;
    }

    function normalizeDate(value) { if (!value) return ""; const date = new Date(value); return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10); }
    function suggestionsFromText(text) {
        const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
        // Prefer an actual reference label. Decorative headings such as
        // "TEST INVOICE - NOT PAYABLE" must never become invoice numbers.
        const invoice = text.match(/^\s*(?:invoice\s*(?:number\b|no\.?\b|#|:)|inv\.?\s*(?:no\.?\b|#|:)|ref(?:erence)?\.?\s*(?:number\b|no\.?\b|#|:))\s*[:#-]?\s*([A-Z0-9][A-Z0-9._/-]*)[ \t]*[;:]?[ \t]*$/im);
        const dates = [...text.matchAll(/\b(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})\b/g)].map((match) => match[1]);
        // Line starts and full labels distinguish TOTAL from SUBTOTAL.
        // Unlabelled amounts are not reliable candidates for the bill total.
        const labeledAmount = label => {
            // A lone OCR artifact may precede a complete label. Do not accept
            // arbitrary words, unlabelled prices, or conflicting candidates.
            const pattern = new RegExp(`^[ \\t]*(?:[A-Z0-9|]?[ \\t]+)?${label}\\b[ \\t]*[:$-]?[ \\t]*\\$?[ \\t]*(\\d{1,7}(?:,\\d{3})*\\.\\d{2})[ \\t]*(?:USD)?[ \\t]*$`, 'gim');
            const values = [...text.matchAll(pattern)].map(match => match[1].replaceAll(',', ''));
            return new Set(values).size === 1 ? values[0] : '';
        };
        const lower = text.toLowerCase();
        const category = lower.match(/\b(tire|tyre)\b/) ? "Tires" : lower.match(/\b(fuel|gasoline|diesel)\b/) ? "Fuel" : lower.match(/\b(tool|equipment)\b/) ? "Tools & Equipment" : lower.match(/\b(part|supply|material)\b/) ? "Parts & Supplies" : "";
        const repairOrder = text.match(/\b(?:RO|repair\s+order)\s*#?\s*([A-Z0-9-]+)\b/i);
        return {
            vendor: lines[0] || "", invoice_number: invoice?.[1] || "", invoice_date: normalizeDate(dates[0]), due_date: normalizeDate(dates[1]),
            subtotal: labeledAmount("subtotal"), tax: labeledAmount("(?:sales\\s+)?tax"), total: labeledAmount("(?:amount\\s+due|invoice\\s+total|grand\\s+total|total)"),
            category, repair_order_id: repairOrder?.[1] || ""
        };
    }

    async function pdfCanvases(file) {
        const pdfjs = await import("https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/build/pdf.min.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/build/pdf.worker.min.mjs";
        const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise; const result = [];
        if (pdf.numPages > 10) throw Error('This PDF has more than 10 pages. Review the complete original and enter lines manually, or split it before scanning.');
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
            const page = await pdf.getPage(pageNumber); const viewport = page.getViewport({ scale: 1.7 }); const canvas = document.createElement("canvas"); canvas.width = viewport.width; canvas.height = viewport.height;
            await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise; result.push(canvas);
        }
        return result;
    }

    async function runOcr(file) {
        const sources = file.type === "application/pdf" ? await pdfCanvases(file) : [file]; let combined = "";
        for (let index = 0; index < sources.length; index += 1) { setMessage(`Reading page ${index + 1} of ${sources.length}…`, ""); const result = await Tesseract.recognize(sources[index], "eng"); combined += `${result.data.text}\n`; }
        return combined;
    }

    function checkDuplicates() {
        const vendor=fields.vendor.value.trim().toLowerCase(), number=fields.invoice_number.value.trim().toLowerCase(), date=fields.invoice_date.value;
        const matches=bills.filter(bill=>{
            if(!vendor || bill.status==='void' || String(bill.vendor || '').trim().toLowerCase()!==vendor)return false;
            if(number)return String(bill.invoice_number || '').trim().toLowerCase()===number;
            if(!date || !dateOnly(bill.invoice_date) || !fields.total.value)return false;
            return Number(bill.total)===Number(fields.total.value) && Math.abs(Date.parse(dateOnly(bill.invoice_date))-Date.parse(date))<=3*86400000;
        });
        warning.replaceChildren(); warning.hidden=!matches.length;
        if(matches.length){
            const title=document.createElement('p');title.textContent=number?'Possible duplicate: same vendor and invoice number.':'Possible duplicate: same vendor and amount, with an invoice date within three days.';warning.append(title);
            matches.forEach(bill=>{const line=document.createElement('p');line.textContent=`${bill.vendor} · ${bill.invoice_number || 'no reference'} · ${money(bill.total)} · ${dateOnly(bill.invoice_date) || 'no invoice date'} · ${bill.status}`;warning.append(line);});
            const view=document.createElement('button');view.type='button';view.textContent='View existing bills';view.addEventListener('click',()=>list.scrollIntoView({behavior:'smooth',block:'start'}));warning.append(view);
        }
        return matches;
    }

    fileInput.addEventListener("change", async function () {
        const file = fileInput.files[0]; if (!file || scanBusy || saveBusy) return;
        scanBusy=true;fileInput.disabled=true;
        ocrText=''; byId('bill-ocr-source').hidden=true;
        try {
            if (documentPath) { const removed=await client.storage.from("shop-ap-documents").remove([documentPath]);if(removed.error)throw removed.error;documentPath=null; }
            if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type) || !file.size || file.size > 20 * 1024 * 1024) throw Error("Use a PDF, JPG, or PNG no larger than 20 MB.");
            for(const field of Object.values(fields))field.value='';
            const path = `${context.shopId}/${crypto.randomUUID()}.${file.name.split(".").pop().replace(/[^a-z0-9]/gi, "").toLowerCase()}`;
            setMessage("Uploading the original privately…", "");
            const upload = await client.storage.from("shop-ap-documents").upload(path, file, { contentType: file.type });
            if(upload.error)throw upload.error;documentPath=path;
            ocrText = await runOcr(file); byId("bill-ocr-text").textContent=ocrText || "No readable text found. Retake the scan or enter the bill manually.";byId("bill-ocr-source").hidden=false; const suggestions = suggestionsFromText(ocrText);
            Object.entries(suggestions).forEach(([name, value]) => { if (value !== "") fields[name].value = value; });
            const missing=["subtotal","tax","total"].filter(name=>suggestions[name] === "");
            await checkDuplicates(); setMessage(missing.length ? `Scan needs review: ${missing.join(", ")} not recognized. Compare the original and fill missing values. Captured text is available below.` : "OCR suggestions are ready. Review every value before creating the bill. After saving, use Review parts for receiving.", missing.length ? "error" : "success");
        } catch (error) { setMessage(`${documentPath?'Original saved; enter values manually.':'Upload not confirmed.'} ${error.message}`, "error"); }
        finally {scanBusy=false;fileInput.disabled=false;}

    });

    byId("scan-bill-button").addEventListener("click", () => openForm(true)); byId("add-bill-button").addEventListener("click", () => openForm(false)); byId("close-bill-form").addEventListener("click", closeForm); byId("cancel-bill-form").addEventListener("click", closeForm);
    [fields.vendor, fields.invoice_number, fields.total, fields.invoice_date].forEach((field) => field.addEventListener("blur", checkDuplicates));

    form.addEventListener("submit", async function (event) {
        event.preventDefault(); if(scanBusy||saveBusy){setMessage("Wait for the current scan or save to finish.", "error");return;}
        if(recoveryUnavailable||pendingBill){drawRecovery();setMessage('Review the pending bill before starting another.','error');return;}
        pendingBill=readPending();if(recoveryUnavailable||pendingBill){drawRecovery();setMessage('Review the pending bill before starting another.','error');return;}
        try { await loadBills(); } catch (_) { setMessage('Could not check existing bills. No bill was submitted; try again when the list is available.', 'error');return; }
        const matches=checkDuplicates(); if(saveBusy||pendingBill||recoveryUnavailable)return; if(scanMode&&!documentPath){setMessage('Upload the original invoice before confirming.','error');return;}
        if(matches.length && !window.confirm(`Possible duplicate: ${matches.length} matching bill${matches.length===1?'':'s'} shown above. Create another bill anyway? This decision will be recorded.`))return;
        const record = { shop_id: context.shopId, vendor: fields.vendor.value.trim(), invoice_number: fields.invoice_number.value.trim() || null, invoice_date: fields.invoice_date.value || null, due_date: fields.due_date.value || null, subtotal: fields.subtotal.value ? Number(fields.subtotal.value) : null, tax: fields.tax.value ? Number(fields.tax.value) : null, total: Number(fields.total.value), category: fields.category.value.trim() || null, repair_order_id: fields.repair_order_id.value.trim() || null, notes: fields.notes.value.trim() || null, document_path: documentPath, ocr_text: ocrText || null, status: "open", created_by: context.user.id };
        if(matches.length)record.duplicate_override_ids=matches.map(bill=>bill.id).sort();
        const request={version:1,shop:context.shopId,actor:context.user.id,request:crypto.randomUUID(),record};
        try {localStorage.setItem(pendingKey(),JSON.stringify(request));pendingBill=request;drawRecovery();}catch(_){recoveryUnavailable=true;drawRecovery();setMessage('Could not save bill recovery information. No bill request was sent.','error');return;}
        await sendPending();
    });

    list.addEventListener("click", async function (event) {
        const documentButton = event.target.closest("button[data-document-path]");
        if (documentButton) {
            const signed = await client.storage.from("shop-ap-documents").createSignedUrl(documentButton.dataset.documentPath, 60);
            if (signed.error) { setMessage(`Document could not be opened: ${signed.error.message}`, "error"); return; }
            window.open(signed.data.signedUrl, "_blank", "noopener,noreferrer"); return;
        }
        const button = event.target.closest("button[data-bill-id]"); if (!button || !canWrite) return;
        const result = await client.from("shop_accounts_payable").update({ status: "paid", paid_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", button.dataset.billId).eq("shop_id", context.shopId);
        if (result.error) setMessage(`Bill could not be updated: ${result.error.message}`, "error"); else await loadBills();
    });
    byId("ap-export-range").addEventListener("change", function () { byId("ap-custom-range").hidden = this.value !== "custom"; });
    byId("export-ap-button").addEventListener("click", function () {
        const range = byId("ap-export-range").value; const now = new Date(); let start = null; let end = null;
        if (range === "week") { start = new Date(now); start.setDate(now.getDate() - now.getDay()); }
        if (range === "month") start = new Date(now.getFullYear(), now.getMonth(), 1);
        if (range === "year") start = new Date(now.getFullYear(), 0, 1);
        if (range === "custom") { start = byId("ap-export-start").value ? new Date(`${byId("ap-export-start").value}T00:00:00`) : null; end = byId("ap-export-end").value ? new Date(`${byId("ap-export-end").value}T23:59:59`) : null; }
        const selected = bills.filter((bill) => { const date = new Date(bill.invoice_date || bill.created_at); return (!start || date >= start) && (!end || date <= end); });
        const rows = [["Vendor","Invoice Number","Invoice Date","Due Date","Subtotal","Tax","Total","Category","Repair Order","Status"], ...selected.map((bill) => [bill.vendor,bill.invoice_number,dateOnly(bill.invoice_date),dateOnly(bill.due_date),bill.subtotal,bill.tax,bill.total,bill.category,bill.repair_order_id,bill.status])];
        const csv = rows.map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"','""')}"`).join(",")).join("\n"); const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); link.download = "accounts-payable.csv"; link.click(); URL.revokeObjectURL(link.href);
    });

    window.trackRightAuthReady.then(function (authContext) {
        context = authContext; canWrite = window.trackRightCan("expenses.write");
        if(canWrite){pendingBill=readPending();drawRecovery();}
        if (window.location?.hostname === 'test-shop-combined.long-shift-test.pages.dev' && new URLSearchParams(window.location.search).get('btest') === 'ap-response-loss' && ['owner','admin'].includes(context.role)) {
            const panel = document.createElement('section');
            const note = document.createElement('p'); note.textContent = 'Btest (Test only): discard one successful bill-save response. Creates a real Test bill; do not retry as a new bill.';
            const arm = document.createElement('button'); arm.type='button'; arm.textContent='Arm next AP response loss';
            arm.addEventListener('click',()=>{apFaultArmed=!apFaultArmed;arm.textContent=apFaultArmed?'AP response loss armed':'Arm next AP response loss';});
            panel.append(note,arm); form.before(panel);
        }
        byId("scan-bill-button").hidden = !canWrite; byId("add-bill-button").hidden = !canWrite;
        return loadBills();
    }).catch((error) => setMessage(`Accounts Payable could not load: ${error.message}`, "error"));
})();
