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

    laborHoursInput.value =
        repairOrder.laborHours || 0;

    if (additionalTechnicianSelect) {
        additionalTechnicianSelect.value =
            repairOrder.additionalTechnician || "";
    }

    if (additionalWorkInput) {
        additionalWorkInput.value =
            repairOrder.additionalWorkPerformed || "";
    }


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
        additionalWorkInput
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
            Number(laborHoursInput.value) || 0;

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

        hasUnsavedChanges = false;

        saveMessage.textContent = "Saved";

        setTimeout(() => {
            saveMessage.textContent = "";
        }, 2000);
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
}