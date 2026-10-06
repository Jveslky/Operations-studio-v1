

/* =========================
   FIND REPAIR ORDER
========================= */

(async function initializeRepairOrderDetails() {

const params =
    new URLSearchParams(window.location.search);

const repairOrderId =
    params.get("id");

let repairOrder = null;

try {
    await window.trackRightRepairOrders.migrateBrowserOrders();
    repairOrder = await window.trackRightRepairOrders.get(repairOrderId);
} catch (error) {
    console.error("Could not load repair order:", error);
}


/* =========================
   PAGE SETUP
========================= */

const detailPage =
    document.querySelector(".repair-detail-page");

if (!repairOrder) {
    detailPage.innerHTML = `
        <section class="detail-card">
            <h1>Repair order not found</h1>
            <p>This repair order does not exist or is no longer available.</p>
            <a class="secondary-btn" href="./repair-orders.html">
                Back to Repair Orders
            </a>
        </section>
    `;
} else {
    const saveButton =
        document.querySelector("#save-button");

    const closeButton =
        document.querySelector("#close-button");

    const statusDisplay =
        document.querySelector("#status-display");

    const statusSelect =
        document.querySelector("#status-select");

    const technicianSelect =
        document.querySelector("#technician-select");

    const prioritySelect =
        document.querySelector("#priority-select");

    const complaintInput =
        document.querySelector("#complaint");

    const partsNeededInput =
        document.querySelector("#parts-needed");

    const customerNotesInput =
        document.querySelector("#customer-notes");

    const technicianNotesInput =
        document.querySelector("#technician-notes");

    const laborHoursInput =
        document.querySelector("#labor-hours");

    const additionalTechnicianSelect =
        document.querySelector(
            "#additional-technician-select"
        );

    const additionalWorkInput =
        document.querySelector(
            "#additional-work-performed"
        );

    const estimateLaborHoursInput =
        document.getElementById("estimate-labor-hours");

    const estimateLaborRateInput =
        document.getElementById("estimate-labor-rate");

    const estimatePartsTotalInput =
        document.getElementById("estimate-parts-total");

    const estimateOtherChargesInput =
        document.getElementById("estimate-other-charges");

    const estimateShopSuppliesInput =
        document.getElementById("estimate-shop-supplies");

    const estimateShopSuppliesTaxableInput =
        document.getElementById("estimate-shop-supplies-taxable");

    const estimateEnvironmentalFeeInput =
        document.getElementById("estimate-environmental-fee");

    const estimateEnvironmentalFeeTaxableInput =
        document.getElementById("estimate-environmental-fee-taxable");

    const estimateMiscFeeLabelInput =
        document.getElementById("estimate-misc-fee-label");

    const estimateMiscFeeTaxableInput =
        document.getElementById("estimate-misc-fee-taxable");

    const estimateDiscountInput =
        document.getElementById("estimate-discount");

    const estimateTotalDisplay =
        document.getElementById("estimate-total");

    const estimateApprovalStatusInput =
        document.getElementById("estimate-approval-status");

    const estimateStatusDisplay =
        document.getElementById("estimate-status-display");

    const estimateNotesInput =
        document.getElementById("estimate-notes");


    const printEstimateButton =
        document.querySelector("#print-estimate-button");

    const sendEstimateButton =
        document.querySelector("#send-estimate-button");

    const sendEstimateModal =
        document.querySelector("#send-estimate-modal");

    const closeSendEstimateModalButton =
        document.querySelector("#close-send-estimate-modal");

    const emailEstimateButton =
        document.querySelector("#email-estimate-button");

    const textEstimateButton =
        document.querySelector("#text-estimate-button");

    const sendPreviewCustomer =
        document.querySelector("#send-preview-customer");

    const sendPreviewEmail =
        document.querySelector("#send-preview-email");

    const sendPreviewPhone =
        document.querySelector("#send-preview-phone");

    const sendPreviewTotal =
        document.querySelector("#send-preview-total");

    const sendPreviewMessage =
        document.querySelector("#send-preview-message");

    const createInvoiceButton =
        document.getElementById(
            "create-invoice-button"
        );

    function addTechnicianOption(list, value) {
        if (!list || !value) {
            return;
        }

        const alreadyExists =
            Array.from(list.options).some(function (option) {
                return option.value === value;
            });

        if (!alreadyExists) {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = value;
            list.appendChild(option);
        }
    }

    async function loadTechnicianOptions() {
        const technicianList = technicianSelect;
        const additionalTechnicianList = additionalTechnicianSelect;

        addTechnicianOption(
            technicianList,
            repairOrder.technician
        );
        addTechnicianOption(
            additionalTechnicianList,
            repairOrder.additionalTechnician
        );

        try {
            await window.trackRightAuthReady;

            const { data, error } =
                await window.trackRightSupabase.rpc(
                    "list_shop_schedule_members"
                );

            if (error) {
                throw error;
            }

            (data || []).forEach(function (member) {
                const technicianName =
                    member.email || "";

                addTechnicianOption(
                    technicianList,
                    technicianName
                );
                addTechnicianOption(
                    additionalTechnicianList,
                    technicianName
                );
            });
            technicianSelect.value = repairOrder.technician || "Unassigned";
            additionalTechnicianSelect.value = repairOrder.additionalTechnician || "";
        } catch (error) {
            console.error(
                "Could not load active technicians:",
                error
            );
        }
    }


    function getNumberValue(input) {
        const value = Number(input.value);

        return Number.isFinite(value)
            ? value
            : 0;
    }

    function setEstimateNumberValue(input, value) {
        const number = Number(value);

        input.value =
            Number.isFinite(number) && number !== 0
                ? String(number)
                : "";
    }

    function calculateEstimateTotal() {
        const laborHours =
            getNumberValue(estimateLaborHoursInput);

        const laborRate =
            getNumberValue(estimateLaborRateInput);

        const partsTotal =
            getNumberValue(estimatePartsTotalInput);

        const otherCharges =
            getNumberValue(estimateOtherChargesInput);

        const shopSupplies =
            getNumberValue(estimateShopSuppliesInput);

        const environmentalFee =
            getNumberValue(estimateEnvironmentalFeeInput);

        const discount =
            getNumberValue(estimateDiscountInput);

        const laborTotal =
            laborHours * laborRate;

        return (
            laborTotal +
            partsTotal +
            shopSupplies +
            environmentalFee +
            otherCharges -
            discount
        );
    }

    function renderEstimateTotal() {
        const total = Math.max(
            0,
            calculateEstimateTotal()
        );

        estimateTotalDisplay.textContent =
            total.toLocaleString("en-US", {
                style: "currency",
                currency: "USD"
            });
    }

    function renderEstimateStatus() {
        const status =
            estimateApprovalStatusInput.value;

        estimateStatusDisplay.textContent =
            status;

        estimateStatusDisplay.className =
            `estimate-status estimate-${status.toLowerCase()}`;
    }

    [
        estimateLaborHoursInput,
        estimateLaborRateInput,
        estimatePartsTotalInput,
        estimateShopSuppliesInput,
        estimateEnvironmentalFeeInput,
        estimateOtherChargesInput,
        estimateDiscountInput
    ].forEach(function (input) {
        input.addEventListener(
            "input",
            renderEstimateTotal
        );
    });

    estimateApprovalStatusInput.addEventListener(
        "change",
        renderEstimateStatus
    );

    /* =========================
       DISPLAY ORDER DATA
    ========================= */

    document.querySelector("#ro-number").textContent =
        `Repair Order #${repairOrder.id}`;

    document.querySelector("#customer-name").textContent =
        repairOrder.customer || "No customer entered";

    document.querySelector("#unit-name").textContent =
        repairOrder.unit || "No unit entered";

    statusDisplay.textContent =
        repairOrder.status || "Open";

    // Keep a historical status selected until the user chooses a core status.
    const currentStatus = repairOrder.status || "Open";
    if (!Array.from(statusSelect.options).some(option => option.value === currentStatus)) {
        const legacyOption = document.createElement("option");
        legacyOption.value = currentStatus;
        legacyOption.textContent = currentStatus + " (previous status)";
        statusSelect.appendChild(legacyOption);
    }
    statusSelect.value = currentStatus;

    technicianSelect.value =
        repairOrder.technician || "Unassigned";

    prioritySelect.value =
        repairOrder.priority || "Medium";

    complaintInput.value =
        repairOrder.complaint || "";

    partsNeededInput.value =
        repairOrder.partsNeeded || "";

    customerNotesInput.value =
        repairOrder.customerNotes || "";

    technicianNotesInput.value =
        repairOrder.technicianNotes || "";

    if (laborHoursInput) {
        laborHoursInput.value =
            repairOrder.laborHours || 0;
    }

    if (additionalTechnicianSelect) {
        additionalTechnicianSelect.value =
            repairOrder.additionalTechnician || "";
    }

    if (additionalWorkInput) {
        additionalWorkInput.value =
            repairOrder.additionalWorkPerformed || "";
    }

    setEstimateNumberValue(
        estimateLaborHoursInput,
        repairOrder.estimateLaborHours
    );

    setEstimateNumberValue(
        estimateLaborRateInput,
        repairOrder.estimateLaborRate
    );

    setEstimateNumberValue(
        estimatePartsTotalInput,
        repairOrder.estimatePartsTotal
    );

    setEstimateNumberValue(
        estimateOtherChargesInput,
        repairOrder.estimateOtherCharges
    );

    setEstimateNumberValue(
        estimateShopSuppliesInput,
        repairOrder.estimateShopSupplies
    );

    estimateShopSuppliesTaxableInput.checked =
        repairOrder.estimateShopSuppliesTaxable !== false;

    setEstimateNumberValue(
        estimateEnvironmentalFeeInput,
        repairOrder.estimateEnvironmentalFee
    );

    estimateEnvironmentalFeeTaxableInput.checked =
        repairOrder.estimateEnvironmentalFeeTaxable === true;

    estimateMiscFeeLabelInput.value =
        repairOrder.estimateMiscFeeLabel || "";

    estimateMiscFeeTaxableInput.checked =
        repairOrder.estimateMiscFeeTaxable !== false;

    setEstimateNumberValue(
        estimateDiscountInput,
        repairOrder.estimateDiscount
    );

    estimateApprovalStatusInput.value =
        repairOrder.estimateApprovalStatus || "Draft";

    estimateNotesInput.value =
        repairOrder.estimateNotes || "";

    renderEstimateTotal();
    renderEstimateStatus();
    loadTechnicianOptions();


    /* =========================
       UNSAVED CHANGES
    ========================= */

    let hasUnsavedChanges = false;

    const editableFields = [
        complaintInput,
        partsNeededInput,
        customerNotesInput,
        technicianNotesInput,
        laborHoursInput,
        statusSelect,
        technicianSelect,
        prioritySelect,
        additionalTechnicianSelect,
        additionalWorkInput,
        estimateLaborHoursInput,
        estimateLaborRateInput,
        estimatePartsTotalInput,
        estimateShopSuppliesInput,
        estimateShopSuppliesTaxableInput,
        estimateEnvironmentalFeeInput,
        estimateEnvironmentalFeeTaxableInput,
        estimateOtherChargesInput,
        estimateMiscFeeLabelInput,
        estimateMiscFeeTaxableInput,
        estimateDiscountInput,
        estimateApprovalStatusInput,
        estimateNotesInput
    ];

    const canWriteRepairOrder = window.trackRightCan("repair_orders.write");
    const canUpdateWork = window.trackRightCan("repair_orders.update_work");
    const workFields = new Set([
        statusSelect,
        technicianNotesInput,
        laborHoursInput,
        additionalWorkInput
    ]);

    editableFields.forEach(function (field) {
        if (!field) return;
        field.disabled = canWriteRepairOrder
            ? false
            : !(canUpdateWork && workFields.has(field));
    });

    saveButton.hidden = !canWriteRepairOrder && !canUpdateWork;
    createInvoiceButton.hidden = !window.trackRightCan("invoices.write");
    sendEstimateButton.hidden = !canWriteRepairOrder;

    editableFields.forEach(field => {
        if (!field) {
            return;
        }

        field.addEventListener("input", function () {
            hasUnsavedChanges = true;
        });

        field.addEventListener("change", function () {
            hasUnsavedChanges = true;
        });
    });

    statusSelect.addEventListener("change", function () {
        statusDisplay.textContent =
            statusSelect.value;
    });


    /* =========================
       SAVE REPAIR ORDER
    ========================= */

    saveButton.addEventListener("click", async function () {
        saveButton.disabled = true;
        repairOrder.customer =
            repairOrder.customer || "";

        repairOrder.unit =
            repairOrder.unit || "";

        repairOrder.complaint =
            complaintInput.value.trim();

        repairOrder.partsNeeded =
            partsNeededInput.value.trim();

        repairOrder.customerNotes =
            customerNotesInput.value.trim();

        repairOrder.technicianNotes =
            technicianNotesInput.value.trim();

        repairOrder.laborHours =
            laborHoursInput
                ? Number(laborHoursInput.value) || 0
                : repairOrder.laborHours || 0;

        repairOrder.status =
            statusSelect.value;

        repairOrder.technician =
            technicianSelect.value;

        repairOrder.priority =
            prioritySelect.value;

        repairOrder.additionalTechnician =
            additionalTechnicianSelect
                ? additionalTechnicianSelect.value
                : "";

        repairOrder.additionalWorkPerformed =
            additionalWorkInput
                ? additionalWorkInput.value.trim()
                : "";

        repairOrder.estimateLaborHours =
            getNumberValue(estimateLaborHoursInput);

        repairOrder.estimateLaborRate =
            getNumberValue(estimateLaborRateInput);

        repairOrder.estimatePartsTotal =
            getNumberValue(estimatePartsTotalInput);

        repairOrder.estimateOtherCharges =
            getNumberValue(estimateOtherChargesInput);

        repairOrder.estimateShopSupplies =
            getNumberValue(estimateShopSuppliesInput);

        repairOrder.estimateShopSuppliesTaxable =
            estimateShopSuppliesTaxableInput.checked;

        repairOrder.estimateEnvironmentalFee =
            getNumberValue(estimateEnvironmentalFeeInput);

        repairOrder.estimateEnvironmentalFeeTaxable =
            estimateEnvironmentalFeeTaxableInput.checked;

        repairOrder.estimateMiscFeeLabel =
            estimateMiscFeeLabelInput.value.trim();

        repairOrder.estimateMiscFeeTaxable =
            estimateMiscFeeTaxableInput.checked;

        repairOrder.estimateDiscount =
            getNumberValue(estimateDiscountInput);

        repairOrder.estimateTotal =
            Math.max(0, calculateEstimateTotal());

        repairOrder.estimateApprovalStatus =
            estimateApprovalStatusInput.value;

        repairOrder.estimateNotes =
            estimateNotesInput.value.trim();


        /* Required complaint */

        if (!repairOrder.complaint) {
            repairOrder.status = "Needs Info";
            statusSelect.value = "Needs Info";
            statusDisplay.textContent = "Needs Info";
        }


        /* Technician required for active work */

        if (
            repairOrder.status === "In Progress" &&
            repairOrder.technician === "Unassigned"
        ) {
            repairOrder.status = "Needs Info";
            statusSelect.value = "Needs Info";
            statusDisplay.textContent = "Needs Info";
        }


        try {
            repairOrder = await window.trackRightRepairOrders.update(repairOrder);
            hasUnsavedChanges = false;
            window.location.href = "./repair-orders.html";
        } catch (error) {
            console.error("Could not save repair order:", error);
            alert(error?.message || "Could not save this repair order. Please retry.");
            saveButton.disabled = false;
        }
    });


    /* =========================
       CLOSE REPAIR ORDER
    ========================= */

    closeButton.addEventListener("click", function () {
        if (hasUnsavedChanges) {
            const shouldClose = confirm(
                "You have unsaved changes. Close without saving?"
            );

            if (!shouldClose) {
                return;
            }
        }

        window.location.href =
            "./repair-orders.html";

    });

    createInvoiceButton?.addEventListener(
        "click",
        async function () {
            createInvoiceButton.disabled = true;
            try {
                const invoices = await window.trackRightInvoices.list();
                const existingInvoice = invoices.find(function (invoice) {
                    return invoice.repairOrderRecordId === repairOrder.recordId ||
                        String(invoice.repairOrderId) === String(repairOrder.id);
                });
                window.location.href = existingInvoice
                    ? `invoice-details.html?id=${encodeURIComponent(existingInvoice.id)}`
                    : `invoices.html?repairOrderId=${encodeURIComponent(repairOrder.id)}`;
            } catch (error) {
                console.error("Could not check repair-order invoice:", error);
                alert(error?.message || "Could not open invoicing. Please retry.");
                createInvoiceButton.disabled = false;
            }
        }
    );
         

    printEstimateButton.addEventListener(
        "click",
        function () {
            window.print();
        }
    );

    async function getEstimateCustomer() {
        if (!repairOrder.customerId) {
            return null;
        }

        const authContext = await window.trackRightAuthReady;
        const { data, error } = await window.trackRightSupabase
            .from("Customers")
            .select("id,name,email,phone")
            .eq("shop_id", authContext.shopId)
            .eq("id", repairOrder.customerId)
            .maybeSingle();

        if (error) {
            throw error;
        }

        return data;
    }

    function getEstimateMessage() {
        const estimateTotal =
            calculateEstimateTotal().toLocaleString(
                "en-US",
                {
                    style: "currency",
                    currency: "USD"
                }
            );

        return [
            `Hello,`,
            ``,
            `An estimate has been prepared for ${repairOrder.unit || "your unit"}.`,
            `Repair Order: #${repairOrder.id}`,
            `Estimated Total: ${estimateTotal}`,
            ``,
            `Please contact us with approval or any questions.`
        ].join("\n");
    }
    async function openSendEstimateModal() {
        const customer = await getEstimateCustomer();

        const estimateTotal =
            calculateEstimateTotal().toLocaleString(
                "en-US",
                {
                    style: "currency",
                    currency: "USD"
                }
            );

        sendPreviewCustomer.textContent =
            customer?.name ||
            repairOrder.customer ||
            "Not available";

        sendPreviewEmail.textContent =
            customer?.email ||
            "No email saved";

        sendPreviewPhone.textContent =
            customer?.phone ||
            "No phone saved";

        sendPreviewTotal.textContent =
            estimateTotal;

        sendPreviewMessage.value =
            getEstimateMessage();

        sendEstimateModal.hidden = false;
        sendPreviewMessage.focus();
    }

    function closeSendEstimateModal() {
        sendEstimateModal.hidden = true;
        sendEstimateButton.focus();
    }

    sendEstimateButton.addEventListener(
        "click",
        openSendEstimateModal
    );

    closeSendEstimateModalButton.addEventListener(
        "click",
        closeSendEstimateModal
    );

    sendEstimateModal.addEventListener(
        "click",
        function (event) {
            if (event.target === sendEstimateModal) {
                closeSendEstimateModal();
            }
        }
    );

    document.addEventListener(
        "keydown",
        function (event) {
            if (
                event.key === "Escape" &&
                !sendEstimateModal.hidden
            ) {
                closeSendEstimateModal();
            }
        }
    );

    async function markEstimateAsSent() {
        estimateApprovalStatusInput.value = "Sent";

        estimateStatusDisplay.textContent = "Sent";
        estimateStatusDisplay.className =
            "estimate-status estimate-sent";

        repairOrder.estimateApprovalStatus = "Sent";
        repairOrder = await window.trackRightRepairOrders.update(repairOrder);
    }

    emailEstimateButton.addEventListener(
        "click",
        async function () {
        const customer = await getEstimateCustomer();

            if (!customer || !customer.email) {
                alert(
                    "This customer does not have an email address saved."
                );

                return;
            }

            const subject =
                `Estimate for Repair Order #${repairOrder.id}`;

            const message =
                sendPreviewMessage.value;

            await markEstimateAsSent();
            closeSendEstimateModal();

            window.location.href =
                `mailto:${encodeURIComponent(customer.email)}` +
                `?subject=${encodeURIComponent(subject)}` +
                `&body=${encodeURIComponent(message)}`;
        }
    );

    textEstimateButton.addEventListener(
        "click",
        async function () {
            const customer = await getEstimateCustomer();

            if (!customer || !customer.phone) {
                alert(
                    "This customer does not have a phone number saved."
                );

                return;
            }

            const message =
                sendPreviewMessage.value;

            await markEstimateAsSent();
            closeSendEstimateModal();

            window.location.href =
                `sms:${customer.phone}` +
                `?body=${encodeURIComponent(message)}`;
        }
    );
}
}());
