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

    const laborRateInput =
        document.querySelector("#labor-rate");

    const partsCostInput =
        document.querySelector("#parts-cost");

    const completionMileageInput =
        document.querySelector("#completion-mileage");

    const completionHoursInput =
        document.querySelector("#completion-hours");

    const completedDateInput =
        document.querySelector("#completed-date");

    const workPerformedInput =
        document.querySelector("#work-performed");

    const repairTotalDisplay =
        document.querySelector("#repair-total-display");


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

    repairOrder.laborRate =
        Number(laborRateInput.value) || 0;

    repairOrder.partsCost =
        Number(partsCostInput.value) || 0;

    completionMileageInput.value =
        repairOrder.completionMileage ?? "";

    completionHoursInput.value =
        repairOrder.completionHours ?? "";

    completedDateInput.value =
        repairOrder.completedDate || "";

    workPerformedInput.value =
        repairOrder.workPerformed || "";


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
        laborRateInput,
        partsCostInput,
        completionMileageInput,
        completionHoursInput,
        completedDateInput,
        workPerformedInput
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

    function calculateRepairTotal() {
        const laborHours =
            Number(laborHoursInput.value) || 0;

        const laborRate =
            Number(laborRateInput.value) || 0;

        const partsCost =
            Number(partsCostInput.value) || 0;

        const total =
            (laborHours * laborRate) +
            partsCost;

        repairTotalDisplay.textContent =
            total.toLocaleString(
                "en-US",
                {
                    style: "currency",
                    currency: "USD"
                }
            );

        return total;
    }

    [
        laborHoursInput,
        laborRateInput,
        partsCostInput
    ].forEach(input => {
        input.addEventListener(
            "input",
            calculateRepairTotal
        );
    });

    calculateRepairTotal();

    function writeRepairToFleetUnit(order) {
        const fleetStorageKey =
            "track-right-fleet";

        let fleet = [];

        try {
            fleet = JSON.parse(
                localStorage.getItem(fleetStorageKey)
            ) || [];
        } catch (error) {
            console.error(
                "Could not load fleet:",
                error
            );

            return;
        }

        const unitIndex =
            fleet.findIndex(
                unit =>
                    String(unit.id) ===
                    String(order.unitId)
            );

        if (unitIndex === -1) {
            console.warn(
                "Fleet unit not found for repair order:",
                order.unitId
            );

            return;
        }

        const unit =
            fleet[unitIndex];

        if (!Array.isArray(unit.serviceHistory)) {
            unit.serviceHistory = [];
        }

        const historyRecord = {
            repairOrderId: order.id,
            completedAt:
                order.completedDate ||
                new Date()
                    .toISOString()
                    .slice(0, 10),

            complaint:
                order.complaint || "",

            workPerformed:
                order.workPerformed || "",

            laborHours:
                Number(order.laborHours) || 0,

            laborRate:
                Number(order.laborRate) || 0,

            partsCost:
                Number(order.partsCost) || 0,

            totalCost:
                Number(order.totalCost) || 0,

            mileage:
                order.completionMileage === ""
                    ? ""
                    : Number(order.completionMileage),

            hours:
                order.completionHours === ""
                    ? ""
                    : Number(order.completionHours)
        };

        const existingHistoryIndex =
            unit.serviceHistory.findIndex(
                record =>
                    String(record.repairOrderId) ===
                    String(order.id)
            );

        if (existingHistoryIndex >= 0) {
            unit.serviceHistory[
                existingHistoryIndex
            ] = historyRecord;
        } else {
            unit.serviceHistory.push(
                historyRecord
            );
        }

        unit.repairCost =
            unit.serviceHistory.reduce(
                (total, record) =>
                    total +
                    (Number(record.totalCost) || 0),
                0
            );

        if (order.completionMileage !== "") {
            unit.mileage =
                Number(order.completionMileage);
        }

        if (order.completionHours !== "") {
            unit.hours =
                Number(order.completionHours);
        }

        if (unit.status === "Out of Service") {
            unit.status = "Active";
        }

        fleet[unitIndex] = unit;

        localStorage.setItem(
            fleetStorageKey,
            JSON.stringify(fleet)
        );
    }


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

        repairOrder.laborRate =
            Number(laborRateInput.value) || 0;

        repairOrder.partsCost =
            Number(partsCostInput.value) || 0;

        repairOrder.completionMileage =
            completionMileageInput.value === ""
                ? ""
                : Number(completionMileageInput.value);

        repairOrder.completionHours =
            completionHoursInput.value === ""
                ? ""
                : Number(completionHoursInput.value);

        repairOrder.completedDate =
            completedDateInput.value;

        repairOrder.workPerformed =
            workPerformedInput.value.trim();

        repairOrder.totalCost =
            calculateRepairTotal();

        

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

        if (
            repairOrder.status === "Complete" &&
            repairOrder.unitId
        ) {
            writeRepairToFleetUnit(repairOrder);
        }

        hasUnsavedChanges = false;

        saveMessage.textContent = "Saved";

        setTimeout(() => {
            window.location.href =
                "./Personalrepair-orders.html";
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
            "./Personalrepair-orders.html";

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
                "./Personalrepair-orders.html";
    
        });
    document.querySelectorAll('input[type="number"]').forEach(input => {
        input.addEventListener(
            "wheel",
            event => {
                event.preventDefault();
            },
            { passive: false }
        );
    });
    [
        laborHoursInput,
        laborRateInput,
        partsCostInput
    ].forEach(input => {
        input.addEventListener("focus", () => {
            if (Number(input.value) === 0) {
                input.value = "";
            }
        });
    });
}