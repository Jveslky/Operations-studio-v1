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
    let context, bills = [], scanMode = false, documentPath = null, ocrText = "", canWrite = false;

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
            const card = document.createElement("article"); card.className = "bill-card";
            const identity = document.createElement("div"); const vendor = document.createElement("strong"); vendor.textContent = bill.vendor; const reference = document.createElement("span"); reference.textContent = bill.invoice_number || "No reference"; identity.append(vendor, reference);
            const amount = document.createElement("div"); const amountLabel = document.createElement("span"); amountLabel.textContent = "Amount"; const amountValue = document.createElement("strong"); amountValue.textContent = money(bill.total); amount.append(amountLabel, amountValue);
            const due = document.createElement("div"); const dueLabel = document.createElement("span"); dueLabel.textContent = "Due"; const dueValue = document.createElement("strong"); dueValue.textContent = dateOnly(bill.due_date) || "No due date"; due.append(dueLabel, dueValue);
            const state = document.createElement("div"); const stateLabel = document.createElement("span"); stateLabel.textContent = "Status"; const stateValue = document.createElement("strong"); stateValue.className = `bill-status ${display.toLowerCase().replace(" ", "-")}`; stateValue.textContent = display; state.append(stateLabel, stateValue);
            if (bill.document_path) { const view = document.createElement("button"); view.type = "button"; view.dataset.documentPath = bill.document_path; view.textContent = "View Document"; state.appendChild(view); }
            if (!paid && canWrite) { const pay = document.createElement("button"); pay.type = "button"; pay.dataset.billId = bill.id; pay.textContent = "Mark Paid"; state.appendChild(pay); }
            card.append(identity, amount, due, state); list.appendChild(card);
        });
        if (!bills.length) list.innerHTML = '<p class="bill-list-empty">No vendor bills.</p>';
        byId("open-bill-count").textContent = open; byId("due-soon-count").textContent = soon; byId("overdue-bill-count").textContent = overdue; byId("total-payable").textContent = money(payable);
    }

    function openForm(scanning) {
        scanMode = scanning; form.reset(); documentPath = null; ocrText = ""; warning.hidden = true;
        fileField.hidden = !scanning; fileInput.required = scanning; form.hidden = false;
        setMessage(scanning ? "Choose an invoice to upload privately and prepare OCR suggestions." : "Enter and confirm the bill details.", "");
        form.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    async function closeForm() {
        if (documentPath && form.dataset.saved !== "true") await client.storage.from("shop-ap-documents").remove([documentPath]);
        form.hidden = true; form.reset(); documentPath = null; ocrText = ""; delete form.dataset.saved;
    }

    function normalizeDate(value) { if (!value) return ""; const date = new Date(value); return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10); }
    function suggestionsFromText(text) {
        const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
        const amounts = [...text.matchAll(/(?:\$\s*)?(\d{1,7}(?:,\d{3})*\.\d{2})/g)].map((match) => Number(match[1].replaceAll(",", ""))).filter(Number.isFinite);
        const invoice = text.match(/(?:invoice|inv\.?|reference|ref\.?)\s*(?:number|no\.?|#)?\s*[:#-]?\s*([A-Z0-9-]{3,})/i);
        const dates = [...text.matchAll(/\b(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})\b/g)].map((match) => match[1]);
        const labeledAmount = (label) => text.match(new RegExp(`${label}\\s*[:$-]?\\s*\\$?\\s*(\\d{1,7}(?:,\\d{3})*\\.\\d{2})`, "i"))?.[1]?.replaceAll(",", "") || "";
        const lower = text.toLowerCase();
        const category = lower.match(/\b(tire|tyre)\b/) ? "Tires" : lower.match(/\b(fuel|gasoline|diesel)\b/) ? "Fuel" : lower.match(/\b(tool|equipment)\b/) ? "Tools & Equipment" : lower.match(/\b(part|supply|material)\b/) ? "Parts & Supplies" : "";
        const repairOrder = text.match(/\b(?:RO|repair\s+order)\s*#?\s*([A-Z0-9-]+)\b/i);
        return {
            vendor: lines[0] || "", invoice_number: invoice?.[1] || "", invoice_date: normalizeDate(dates[0]), due_date: normalizeDate(dates[1]),
            subtotal: labeledAmount("subtotal"), tax: labeledAmount("(?:sales\\s+)?tax"), total: labeledAmount("(?:amount\\s+due|invoice\\s+total|grand\\s+total|total)") || (amounts.length ? Math.max(...amounts) : ""),
            category, repair_order_id: repairOrder?.[1] || ""
        };
    }

    async function pdfCanvases(file) {
        const pdfjs = await import("https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/build/pdf.min.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/build/pdf.worker.min.mjs";
        const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise; const result = [];
        for (let pageNumber = 1; pageNumber <= Math.min(pdf.numPages, 3); pageNumber += 1) {
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

    async function checkDuplicates() {
        warning.hidden = true; const vendor = fields.vendor.value.trim().toLowerCase(); const number = fields.invoice_number.value.trim().toLowerCase();
        const match = bills.find((bill) => (number && bill.invoice_number?.toLowerCase() === number && bill.vendor.toLowerCase() === vendor) || (Number(fields.total.value) > 0 && Number(bill.total) === Number(fields.total.value) && dateOnly(bill.invoice_date) === fields.invoice_date.value));
        if (match) { warning.textContent = `Possible duplicate: ${match.vendor} · ${match.invoice_number || "no reference"} · ${money(match.total)}. Review carefully before confirming.`; warning.hidden = false; }
    }

    fileInput.addEventListener("change", async function () {
        const file = fileInput.files[0]; if (!file) return;
        if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type) || file.size > 20 * 1024 * 1024) { setMessage("Use a PDF, JPG, or PNG no larger than 20 MB.", "error"); return; }
        if (documentPath) await client.storage.from("shop-ap-documents").remove([documentPath]);
        documentPath = `${context.shopId}/${crypto.randomUUID()}.${file.name.split(".").pop().replace(/[^a-z0-9]/gi, "").toLowerCase()}`;
        setMessage("Uploading the original privately…", ""); const upload = await client.storage.from("shop-ap-documents").upload(documentPath, file, { contentType: file.type });
        if (upload.error) { documentPath = null; setMessage(`Upload failed: ${upload.error.message}`, "error"); return; }
        try {
            ocrText = await runOcr(file); const suggestions = suggestionsFromText(ocrText);
            Object.entries(suggestions).forEach(([name, value]) => { if (value !== "") fields[name].value = value; });
            await checkDuplicates(); setMessage("OCR suggestions are ready. Review every value before creating the bill.", "success");
        } catch (error) { setMessage(`Original saved, but OCR could not finish: ${error.message}. Enter the values manually.`, "error"); }
    });

    byId("scan-bill-button").addEventListener("click", () => openForm(true)); byId("add-bill-button").addEventListener("click", () => openForm(false)); byId("close-bill-form").addEventListener("click", closeForm); byId("cancel-bill-form").addEventListener("click", closeForm);
    [fields.vendor, fields.invoice_number, fields.total, fields.invoice_date].forEach((field) => field.addEventListener("blur", checkDuplicates));

    form.addEventListener("submit", async function (event) {
        event.preventDefault(); await checkDuplicates(); if (scanMode && !documentPath) { setMessage("Upload the original invoice before confirming.", "error"); return; }
        const record = { shop_id: context.shopId, vendor: fields.vendor.value.trim(), invoice_number: fields.invoice_number.value.trim() || null, invoice_date: fields.invoice_date.value || null, due_date: fields.due_date.value || null, subtotal: fields.subtotal.value ? Number(fields.subtotal.value) : null, tax: fields.tax.value ? Number(fields.tax.value) : null, total: Number(fields.total.value), category: fields.category.value.trim() || null, repair_order_id: fields.repair_order_id.value.trim() || null, notes: fields.notes.value.trim() || null, document_path: documentPath, ocr_text: ocrText || null, status: "open", created_by: context.user.id };
        setMessage("Creating confirmed AP record…", ""); const result = await client.from("shop_accounts_payable").insert(record);
        if (result.error) { setMessage(`Bill could not be created: ${result.error.message}`, "error"); return; }
        form.dataset.saved = "true"; await closeForm(); await loadBills();
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
        context = authContext; canWrite = ["owner", "admin", "service_writer"].includes(context.role);
        byId("scan-bill-button").hidden = !canWrite; byId("add-bill-button").hidden = !canWrite;
        return loadBills();
    }).catch((error) => setMessage(`Accounts Payable could not load: ${error.message}`, "error"));
})();
