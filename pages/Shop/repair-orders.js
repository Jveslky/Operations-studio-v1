/* =========================
   APP CONFIGURATION
========================= */

const appMode = "personal-fleet";
const fleetStorageKey = "track-right-fleet";


/* =========================
   SAMPLE REPAIR ORDERS
========================= */

const repairOrders =[];


/* =========================
   PAGE ELEMENTS
========================= */

const attentionOrders =
    document.querySelector("#attention-orders");

const inProgressOrders =
    document.querySelector("#in-progress-orders");

const completeOrders =
    document.querySelector("#complete-orders");

const newRepairOrderButton =
    document.querySelector(
        "#new-repair-order-button"
    );

const newRepairOrderForm =
    document.querySelector(
        "#new-repair-order-form"
    );

const cancelNewRepairOrderButton =
    document.querySelector(
        "#cancel-new-repair-order"
    );

const exportBackupButton =
    document.querySelector(
        "#export-backup-button"
    );

const importBackupInput =
    document.querySelector(
        "#import-backup-input"
    );

const newUnitInput =
    document.querySelector("#new-unit");


/* =========================
   STORAGE HELPERS
========================= */

function safelyParseStoredValue(key) {
    try {
        return JSON.parse(
            localStorage.getItem(key)
        );
    } catch (error) {
        console.error(
            `Could not read ${key}:`,
            error
        );

        return null;
    }
}

function getCurrentRepairOrder(order) {
    const storageKey =
        `repair-order-${order.id}`;

    const savedOrder =
        safelyParseStoredValue(storageKey);

    return savedOrder
        ? { ...order, ...savedOrder }
        : order;
}


/* =========================
   WORKFLOW RULES
========================= */

function getOrderSection(status) {
    switch (status) {
        case "In Progress":
        case "Waiting Parts":
        case "Waiting Approval":
        case "Waiting Customer":
            return inProgressOrders;

        case "Complete":
        case "Ready for Pickup":
        case "Ready for Payment":
        case "Awaiting Payment":
            return completeOrders;

        case "Open":
        case "Scheduled":
        case "Needs Info":
        default:
            return attentionOrders;
    }
}

function getStatusDotClass(status) {
    switch (status) {
        case "Waiting Parts":
        case "Waiting Approval":
        case "Waiting Customer":
            return "status-dot-yellow";

        case "Complete":
        case "Ready for Pickup":
        case "Ready for Payment":
        case "Awaiting Payment":
            return "status-dot-green";

        case "In Progress":
            return "status-dot-blue";

        default:
            return "status-dot-neutral";
    }
}


/* =========================
   CARD CREATION
========================= */

function createRepairOrderCard(order) {
    const card =
        document.createElement("a");

    card.className =
        "repair-order-card";

    card.href =
        `./repair-order-details.html?id=${order.id}`;

    card.innerHTML = `
        <div class="repair-order-heading">
            <span
                class="status-dot ${getStatusDotClass(order.status)}"
            ></span>

            <h3>RO #${order.id}</h3>
        </div>

        <p class="repair-order-customer">
            ${order.customer || "No owner entered"}
            •
            ${order.unit || "No unit entered"}
        </p>

        <p class="repair-order-complaint">
            ${order.complaint || "No work entered"}
        </p>

        <p class="repair-order-meta">
            ${order.status || "Open"}
            •
            ${order.technician || "Unassigned"}
            •
            ${order.priority || "Medium"} Priority
        </p>
    `;

    return card;
}

function showEmptyMessage(section, message) {
    if (section.children.length !== 0) {
        return;
    }

    const emptyMessage =
        document.createElement("p");

    emptyMessage.className =
        "empty-section-message";

    emptyMessage.textContent = message;

    section.appendChild(emptyMessage);
}


/* =========================
   DISCOVER ALL ORDERS
========================= */

function getAllRepairOrders() {
    const allRepairOrders = new Map();

    repairOrders.forEach(order => {
        allRepairOrders.set(
            order.id,
            getCurrentRepairOrder(order)
        );
    });

    for (
        let index = 0;
        index < localStorage.length;
        index++
    ) {
        const key =
            localStorage.key(index);

        if (
            !key ||
            !/^repair-order-\d+$/.test(key)
        ) {
            continue;
        }

        const storedOrder =
            safelyParseStoredValue(key);

        if (
            storedOrder &&
            storedOrder.id
        ) {
            allRepairOrders.set(
                String(storedOrder.id),
                storedOrder
            );
        }
    }

    return allRepairOrders;
}

function getFleetUnits() {
    const savedFleet =
        localStorage.getItem(fleetStorageKey);

    if (!savedFleet) {
        return [];
    }

    try {
        return JSON.parse(savedFleet);
    } catch (error) {
        console.error(
            "Could not load fleet units:",
            error
        );

        return [];
    }
}


function populateUnitDropdown() {
    const fleet = getFleetUnits();



    const availableUnits = fleet.filter(
        unit =>
            unit.archived !== true &&
            unit.status !== "Sold"
    );

    newUnitInput.innerHTML = `
        <option value="">
            Select a fleet unit
        </option>
    `;

    availableUnits.forEach(unit => {
        const option =
            document.createElement("option");

        option.value = unit.id;

        const unitNumber =
            unit.number
                ? `${unit.number} — `
                : "";

        option.textContent =
            `${unitNumber}${unit.name}`;

        newUnitInput.appendChild(option);
    });
}


/* =========================
   RENDER QUEUE
========================= */

function renderRepairOrders() {
    const allRepairOrders =
        getAllRepairOrders();

    allRepairOrders.forEach(order => {
        if (order.archived === true) {
            return;
        }

        const destinationSection =
            getOrderSection(order.status);

        const card =
            createRepairOrderCard(order);

        destinationSection.appendChild(card);
    });

    showEmptyMessage(
        attentionOrders,
        "No repair orders need attention."
    );

    showEmptyMessage(
        inProgressOrders,
        "No repair orders are currently in progress."
    );

    showEmptyMessage(
        completeOrders,
        "No completed repair orders."
    );
}

populateUnitDropdown();

renderRepairOrders();


/* =========================
   NEW REPAIR ORDER FORM
========================= */

newRepairOrderButton.addEventListener(
    "click",
    function () {
        newRepairOrderForm.hidden = false;

        document
            .querySelector("#new-customer")
            .focus();
    }
);

cancelNewRepairOrderButton.addEventListener(
    "click",
    function () {
        newRepairOrderForm.reset();
        newRepairOrderForm.hidden = true;
    }
);

function getNextRepairOrderId() {
    const repairOrderIds =
        repairOrders.map(
            order => Number(order.id)
        );

    for (
        let index = 0;
        index < localStorage.length;
        index++
    ) {
        const key =
            localStorage.key(index);

        if (
            !key ||
            !/^repair-order-\d+$/.test(key)
        ) {
            continue;
        }

        const storedId = Number(
            key.replace(
                "repair-order-",
                ""
            )
        );

        if (Number.isFinite(storedId)) {
            repairOrderIds.push(storedId);
        }
    }

    return String(
        Math.max(
            ...repairOrderIds,
            1000
        ) + 1
    );
}

newRepairOrderForm.addEventListener(
    "submit",
    function (event) {
        event.preventDefault();

        const newRepairOrder = {
            id: getNextRepairOrderId(),

            customer: document
                .querySelector("#new-customer")
                .value
                .trim(),
            unitId: document
                .querySelector("#new-unit")
                .value,

            unit: document
                .querySelector("#new-unit")
                .options[
                document.querySelector("#new-unit").selectedIndex
            ]
                .textContent
                .trim(),

            status: "Open",

            priority: document
                .querySelector("#new-priority")
                .value,

            technician: document
                .querySelector("#new-technician")
                .value,

            complaint: document
                .querySelector("#new-complaint")
                .value
                .trim(),

            partsNeeded: "",
            customerNotes: "",
            technicianNotes: "",
            laborHours: 0,
            additionalTechnician: "",
            additionalWorkPerformed: "",
            archived: false,
            appMode: appMode
        };

        localStorage.setItem(
            `repair-order-${newRepairOrder.id}`,
            JSON.stringify(newRepairOrder)
        );

        window.location.reload();
    }
);


/* =========================
   EXPORT BACKUP
========================= */

exportBackupButton.addEventListener(
    "click",
    function () {
        const backupData = {
            appMode: appMode,
            exportedAt:
                new Date().toISOString(),
            records: {}
        };

        for (
            let index = 0;
            index < localStorage.length;
            index++
        ) {
            const key =
                localStorage.key(index);

            if (
                key &&
                key.startsWith(
                    "repair-order-"
                )
            ) {
                backupData.records[key] =
                    localStorage.getItem(key);
            }
        }

        const backupFile =
            new Blob(
                [
                    JSON.stringify(
                        backupData,
                        null,
                        2
                    )
                ],
                {
                    type: "application/json"
                }
            );

        const downloadUrl =
            URL.createObjectURL(
                backupFile
            );

        const downloadLink =
            document.createElement("a");

        const date =
            new Date()
                .toISOString()
                .slice(0, 10);

        downloadLink.href =
            downloadUrl;

        downloadLink.download =
            `track-right-personal-fleet-${date}.json`;

        document.body.appendChild(
            downloadLink
        );

        downloadLink.click();
        downloadLink.remove();

        URL.revokeObjectURL(
            downloadUrl
        );
    }
);


/* =========================
   IMPORT BACKUP
========================= */

importBackupInput.addEventListener(
    "change",
    function () {
        const selectedFile =
            importBackupInput.files[0];

        if (!selectedFile) {
            return;
        }

        const fileReader =
            new FileReader();

        fileReader.addEventListener(
            "load",
            function () {
                try {
                    const backupData =
                        JSON.parse(
                            fileReader.result
                        );

                    const records =
                        backupData.records ||
                        backupData;

                    Object.entries(
                        records
                    ).forEach(
                        ([key, value]) => {
                            if (
                                key.startsWith(
                                    "repair-order-"
                                )
                            ) {
                                localStorage.setItem(
                                    key,
                                    value
                                );
                            }
                        }
                    );

                    alert(
                        "Backup imported successfully."
                    );

                    window.location.reload();
                } catch (error) {
                    console.error(error);

                    alert(
                        "That file could not be imported. Make sure it is a Track Right backup."
                    );
                }

                importBackupInput.value =
                    "";
            }
        );

        fileReader.readAsText(
            selectedFile
        );
    }
);