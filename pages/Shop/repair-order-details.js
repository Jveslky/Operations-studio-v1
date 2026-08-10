

const repairOrders = [
    {
        id: "1042",
        customer: "ABC Construction",
        unit: "Unit 24",
        status: "Open",
        priority: "High",
        technician: "Mike",
        complaint: "Hydraulic leak at boom cylinder",
        partsNeeded: "Boom seal kit\nHydraulic fluid",
        customerNotes:
            "Customer reports leak worsens during heavy operation.",
        technicianNotes:
            "Verified leak at boom. Recommend resealing cylinder and retest.",
        laborHours: 2.5,
        additionalTechnician: "",
        additionalWorkPerformed: ""
    },
    {
        id: "1043",
        customer: "Example Customer",
        unit: "Unit 12",
        status: "In Progress",
        priority: "Medium",
        technician: "Unassigned",
        complaint: "Example complaint for repair order 1043",
        partsNeeded: "",
        customerNotes: "",
        technicianNotes: "",
        laborHours: 0,
        additionalTechnician: "",
        additionalWorkPerformed: ""
    }
];


/* =========================
   FIND REPAIR ORDER
========================= */

const params =
    new URLSearchParams(window.location.search);

const repairOrderId =
    params.get("id");

const storageKey =
    `repair-order-${repairOrderId}`;

let savedRepairOrder = null;

try {
    savedRepairOrder = JSON.parse(
        localStorage.getItem(storageKey)
    );
} catch (error) {
    console.error(
        "Could not read saved repair order:",
        error
    );
}

const sampleRepairOrder =
    repairOrders.find(
        order => order.id === repairOrderId
    );

const repairOrder =
    savedRepairOrder ||
    sampleRepairOrder;


/* =========================
   PAGE SETUP
========================= */

const detailPage =
    document.querySelector(".repair-detail-page");

if (!repairOrder) {
    detailPage.innerHTML = `
        <h1>Repair order not found</h1>
    `;
} else {
    const saveButton =
        document.querySelector("#save-button");

    const closeButton =
        document.querySelector("#close-button");

    const saveMessage =
        document.querySelector("#save-message");

    const archiveButton =
        document.querySelector("#archive-button");

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
    console.log(
        "Create invoice button loaded:",
        createInvoiceButton
    );


    function getNumberValue(input) {
        const value = Number(input.value);

        return Number.isFinite(value)
            ? value
            : 0;
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

        const laborTotal =
            laborHours * laborRate;

        return (
            laborTotal +
            partsTotal +
            otherCharges
        );
    }

    function renderEstimateTotal() {
        const total =
            calculateEstimateTotal();

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
        estimateOtherChargesInput
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

    const INVOICE_STORAGE_KEY =
        "track-right-invoices";

    function getInvoices() {
        const storedInvoices =
            localStorage.getItem(
                INVOICE_STORAGE_KEY
            );

        if (!storedInvoices) {
            return [];
        }

        try {
            const invoices =
                JSON.parse(storedInvoices);

            return Array.isArray(invoices)
                ? invoices
                : [];
        } catch (error) {
            console.error(
                "Could not read invoices:",
                error
            );

            return [];
        }
    }

    function saveInvoices(invoices) {
        localStorage.setItem(
            INVOICE_STORAGE_KEY,
            JSON.stringify(invoices)
        );
    }

    function getNextInvoiceId(invoices) {
        const invoiceIds =
            invoices
                .map(function (invoice) {
                    return Number(invoice.id);
                })
                .filter(Number.isFinite);

        return String(
            Math.max(
                ...invoiceIds,
                1000
            ) + 1
        );
    }

    function getInvoiceTotal(order) {
        const estimateTotal =
            Number(order.estimateTotal);

        if (Number.isFinite(estimateTotal)) {
            return estimateTotal;
        }

        const laborHours =
            Number(order.laborHours) || 0;

        const laborRate =
            Number(order.laborRate) || 0;

        const partsTotal =
            Number(order.partsTotal) || 0;

        return (
            laborHours * laborRate +
            partsTotal
        );
    }

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

    statusSelect.value =
        repairOrder.status || "Open";

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

    estimateLaborHoursInput.value =
        repairOrder.estimateLaborHours ?? 0;

    estimateLaborRateInput.value =
        repairOrder.estimateLaborRate ?? 0;

    estimatePartsTotalInput.value =
        repairOrder.estimatePartsTotal ?? 0;

    estimateOtherChargesInput.value =
        repairOrder.estimateOtherCharges ?? 0;

    estimateApprovalStatusInput.value =
        repairOrder.estimateApprovalStatus || "Draft";

    estimateNotesInput.value =
        repairOrder.estimateNotes || "";

    renderEstimateTotal();
    renderEstimateStatus();


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
        estimateOtherChargesInput,
        estimateApprovalStatusInput,
        estimateNotesInput
    ];

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

    saveButton.addEventListener("click", function () {
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

        repairOrder.estimateTotal =
            calculateEstimateTotal();

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


        localStorage.setItem(
            storageKey,
            JSON.stringify(repairOrder)
        );

        setTimeout(() => {
            window.location.href =
                "./repair-orders.html";
        }, 500);
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
        function () {
            const invoices = getInvoices();
           

            console.log("Existing invoices:", invoices);
            console.log("Repair order:", repairOrder);

            const existingInvoice =
                invoices.find(
                    function (invoice) {
                        return (
                            String(
                                invoice.repairOrderId
                            ) ===
                            String(
                                repairOrder.id
                            )
                        );
                    }
                );
            if (existingInvoice) {
                console.log(
                    "Invoice object:",
                    existingInvoice
                );

                window.location.href =
                    `invoice-details.html?id=${existingInvoice.id}`;

                return;
            }

            console.log(
                "CREATE INVOICE BUTTON:",
                createInvoiceButton
            );

        

            const createdDate =
                new Date();

            const dueDate =
                new Date(createdDate);

            dueDate.setDate(
                dueDate.getDate() + 30
            );

            const invoice = {
                id:
                    getNextInvoiceId(invoices),

                repairOrderId:
                    repairOrder.id,

                customerId:
                    repairOrder.customerId || "",

                customer:
                    repairOrder.customer || "",

                unitId:
                    repairOrder.unitId || "",

                unit:
                    repairOrder.unit || "",

                complaint:
                    repairOrder.complaint || "",

                total:
                    getInvoiceTotal(
                        repairOrder
                    ),

                status: "Draft",
                sentAt: null,

                createdAt:
                    createdDate.toISOString(),

                dueDate:
                    dueDate
                        .toISOString()
                        .slice(0, 10),

                paidAt:
                    null,

                notes:
                    ""
            };

        

            invoices.push(invoice);
            saveInvoices(invoices);

            console.log(
                "Saved invoices:",
                localStorage.getItem("track-right-invoices")
            );

          

    window.location.href =
        `invoice-details.html?id=${invoice.id}`;
        }
    );

  
    // window.location.href =
    //     `invoices.html?invoice=${invoice.id}`;
         

    /* =========================
ARCHIVE REPAIR ORDER

======================== */

    archiveButton.addEventListener("click", function () {
        const shouldArchive = confirm(
            "Archive this repair order?"
        );

        if (!shouldArchive) {
            return;
        }

        repairOrder.archived = true;

        localStorage.setItem(
            storageKey,
            JSON.stringify(repairOrder)
        );

        window.location.href =
            "./repair-orders.html";

    });
    printEstimateButton.addEventListener(
        "click",
        function () {
            window.print();
        }
    );

    function getEstimateCustomer() {
        let customers = [];

        try {
            customers = JSON.parse(
                localStorage.getItem("track-right-customers")
            ) || [];
        } catch (error) {
            console.error(
                "Could not read customer records:",
                error
            );
        }

        return customers.find(function (customer) {
            return customer.id === repairOrder.customerId;
        }) || null;
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
    function openSendEstimateModal() {
        const customer = getEstimateCustomer();

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

    console.log("sendEstimateButton:", sendEstimateButton);
    console.log("closeSendEstimateModalButton:", closeSendEstimateModalButton);
    console.log("sendEstimateModal:", sendEstimateModal);

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

    function markEstimateAsSent() {
        estimateApprovalStatusInput.value = "Sent";

        estimateStatusDisplay.textContent = "Sent";
        estimateStatusDisplay.className =
            "estimate-status estimate-sent";

        const savedRepairOrder =
            JSON.parse(
                localStorage.getItem(
                    `repair-order-${repairOrder.id}`
                )
            ) || {};

        savedRepairOrder.estimateApprovalStatus = "Sent";

        localStorage.setItem(
            `repair-order-${repairOrder.id}`,
            JSON.stringify(savedRepairOrder)
        );
    }

    emailEstimateButton.addEventListener(
        "click",
        function () {
            const customer = getEstimateCustomer();

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

            markEstimateAsSent();
            closeSendEstimateModal();

            window.location.href =
                `mailto:${encodeURIComponent(customer.email)}` +
                `?subject=${encodeURIComponent(subject)}` +
                `&body=${encodeURIComponent(message)}`;
        }
    );

    textEstimateButton.addEventListener(
        "click",
        function () {
            const customer = getEstimateCustomer();

            if (!customer || !customer.phone) {
                alert(
                    "This customer does not have a phone number saved."
                );

                return;
            }

            const message =
                sendPreviewMessage.value;

            markEstimateAsSent();
            closeSendEstimateModal();

            window.location.href =
                `sms:${customer.phone}` +
                `?body=${encodeURIComponent(message)}`;
        }
    );
}