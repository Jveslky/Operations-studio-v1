const fleetStorageKey = "track-right-fleet";

const showFormButton =
    document.querySelector("#show-form-button");

const exportUnitsButton =
    document.querySelector("#export-units-button");

const formPanel =
    document.querySelector("#unit-form-panel");

const unitForm =
    document.querySelector("#unit-form");

const cancelButton =
    document.querySelector("#cancel-button");

const formTitle =
    document.querySelector("#form-title");

const fleetList =
    document.querySelector("#fleet-list");

const emptyMessage =
    document.querySelector("#empty-message");

const totalUnits =
    document.querySelector("#total-units");

const activeUnits =
    document.querySelector("#active-units");

const outOfServiceUnits =
    document.querySelector("#out-of-service-units");

const archivedUnits =
    document.querySelector("#archived-units");

const filterButtons =
    document.querySelectorAll(".unit-filter");

const typeFilterInput = document.querySelector("#unit-type-filter");
const groupByTypeInput = document.querySelector("#group-by-type");
const viewPreferenceKey = "track-right-fleet-view";
const unitTypes = ["Car", "Truck", "Motorcycle", "Trailer", "Equipment", "Other"];

const savedView = (() => {
    try { return JSON.parse(localStorage.getItem(viewPreferenceKey)) || {}; }
    catch { return {}; }
})();
let currentFilter = ["active", "archived", "all"].includes(savedView.status)
    ? savedView.status
    : "active";
typeFilterInput.value = savedView.type || "all";
groupByTypeInput.checked = savedView.groupByType === true;

const unitIdInput =
    document.querySelector("#unit-id");

const unitNameInput =
    document.querySelector("#unit-name");

const unitNumberInput =
    document.querySelector("#unit-number");

const unitTypeInput =
    document.querySelector("#unit-type");

const unitStatusInput =
    document.querySelector("#unit-status");

const unitYearInput =
    document.querySelector("#unit-year");

const unitMakeInput =
    document.querySelector("#unit-make");

const unitModelInput =
    document.querySelector("#unit-model");

const unitEngineSizeInput =
    document.querySelector("#unit-engine-size");

const unitVinInput =
    document.querySelector("#unit-vin");

const unitMileageInput =
    document.querySelector("#unit-mileage");

const unitHoursInput =
    document.querySelector("#unit-hours");

const unitPurchasePriceInput =
    document.querySelector(
        "#unit-purchase-price"
    );

const serviceDialog = document.querySelector("#service-dialog");
const serviceForm = document.querySelector("#service-form");
const serviceUnitIdInput = document.querySelector("#service-unit-id");
const serviceDialogTitle = document.querySelector("#service-dialog-title");
const serviceDateInput = document.querySelector("#service-date");
const serviceDescriptionInput = document.querySelector("#service-description");
const serviceCostInput = document.querySelector("#service-cost");
const serviceMileageInput = document.querySelector("#service-mileage");
const serviceHoursInput = document.querySelector("#service-hours");
const regional = window.trackRightFleetRegion;
document.querySelector("#unit-distance-label").textContent = regional.distanceLabel();
document.querySelector("#service-distance-label").textContent = regional.distanceLabel();
document.querySelector("#purchase-price-label").textContent = `Purchase Price (${regional.get().currency_code})`;
document.querySelector("#service-cost-label").textContent = `Cost (${regional.get().currency_code})`;


function getFleet() {
    const savedFleet =
        localStorage.getItem(fleetStorageKey);

    if (!savedFleet) {
        return [];
    }

    try {
        return JSON.parse(savedFleet);
    } catch (error) {
        console.error("Could not load fleet:", error);
        return [];
    }
}


function saveFleet(fleet) {
    localStorage.setItem(
        fleetStorageKey,
        JSON.stringify(fleet)
    );
}


function createUnitId() {
    if (crypto.randomUUID) {
        return crypto.randomUUID();
    }

    return `unit-${Date.now()}`;
}


function openForm(unit = null) {
    formPanel.classList.remove("hidden");

    if (unit) {
        formTitle.textContent = "Edit Unit";

        unitIdInput.value = unit.id;
        unitNameInput.value = unit.name;
        unitNumberInput.value = unit.number || "";
        unitTypeInput.value = unit.type || "Truck";
        unitStatusInput.value = unit.status || "Active";
        unitYearInput.value = unit.year || "";
        unitMakeInput.value = unit.make || "";
        unitModelInput.value = unit.model || "";
        unitEngineSizeInput.value = unit.engineSize || "";
        unitVinInput.value = unit.vin || "";
        unitMileageInput.value = regional.toDisplayDistance(unit.mileage);
        unitHoursInput.value = unit.hours ?? "";
        unitPurchasePriceInput.value =
            unit.purchasePrice ?? "";
    } else {
        formTitle.textContent = "Add Unit";
        unitForm.reset();
        unitIdInput.value = "";
    }

    unitNameInput.focus();
}


function closeForm() {
    unitForm.reset();
    unitIdInput.value = "";
    formPanel.classList.add("hidden");
    unitPurchasePriceInput.value = "";
}


function formatValue(value) {
    if (
        value === undefined ||
        value === null ||
        value === ""
    ) {
        return "—";
    }

    return value;
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}


function getStatusClass(status) {
    return `status-${String(status || "unknown")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")}`;
}


function renderFleet() {
    const fleet = getFleet();

    const activeFleet = fleet.filter(unit => unit.archived !== true);
    const archivedFleet = fleet.filter(unit => unit.archived === true);
    const statusFleet = currentFilter === "all"
        ? fleet
        : currentFilter === "archived"
            ? archivedFleet
            : activeFleet;
    const visibleFleet = typeFilterInput.value === "all"
        ? statusFleet
        : statusFleet.filter(unit => (unit.type || "Other") === typeFilterInput.value);

    fleetList.innerHTML = "";

    totalUnits.textContent =
        activeFleet.length;

    activeUnits.textContent =
        activeFleet.filter(
            unit => unit.status === "Active"
        ).length;

    outOfServiceUnits.textContent =
        activeFleet.filter(
            unit => unit.status === "Out of Service"
        ).length;

    archivedUnits.textContent = archivedFleet.length;

    emptyMessage.style.display =
        visibleFleet.length === 0
            ? "block"
            : "none";

    visibleFleet.forEach(unit => {
        const card =
            document.createElement("article");

        card.className = `unit-card${unit.archived === true ? " archived-unit" : ""}`;

        const serviceHistory =
            Array.isArray(unit.serviceHistory)
                ? unit.serviceHistory
                : [];

        const recentService =
            serviceHistory
                .slice()
                .sort((a, b) =>
                    String(b.completedAt || "")
                        .localeCompare(
                            String(a.completedAt || "")
                        )
                )
                .slice(0, 3);

        const repairCost =
            Number(unit.repairCost) || 0;

        const serviceHistoryMarkup =
            recentService.length > 0
                ? recentService
                    .map(record => `
                <div class="service-history-item">
                    <div>
                        <strong>
                            ${record.repairOrderId ? `RO #${escapeHtml(record.repairOrderId)}` : "Service entry"}
                        </strong>

                        <span>
                            ${escapeHtml(record.completedAt ? regional.date(record.completedAt) : "No date")}
                        </span>
                    </div>

                    <p>
                        ${escapeHtml(record.workPerformed ||
                        record.complaint ||
                        "Completed repair")}
                    </p>

                    <strong>
                        ${regional.currency(record.totalCost || 0)}
                    </strong>
                </div>
            `)
                    .join("")
                : `
            <p class="no-service-history">
                No completed repair history yet.
            </p>
        `;

        card.innerHTML = `
            <div class="unit-card-header">
                <div>
                    <h3>${escapeHtml(unit.name)}</h3>

                    <div class="unit-number">
                        ${escapeHtml(formatValue(unit.number))}
                    </div>
                </div>

                <span
                    class="status-badge ${getStatusClass(unit.status)}"
                >
                    ${unit.archived === true ? "Archived" : escapeHtml(unit.status)}
                </span>
            </div>

            ${unit.archived === true ? `
                <p class="archive-details">
                    <strong>Archived ${escapeHtml(formatArchiveDate(unit.archivedAt))}</strong>
                    ${unit.archiveReason ? `<br>${escapeHtml(unit.archiveReason)}` : ""}
                </p>
            ` : ""}

            <div class="unit-details">
                <div class="unit-detail">
                    <span>Type</span>
                    <strong>${escapeHtml(formatValue(unit.type))}</strong>
                </div>

                <div class="unit-detail">
                    <span>Year</span>
                    <strong>${escapeHtml(formatValue(unit.year))}</strong>
                </div>

                <div class="unit-detail">
                    <span>Make</span>
                    <strong>${escapeHtml(formatValue(unit.make))}</strong>
                </div>

                <div class="unit-detail">
                    <span>Model</span>
                    <strong>${escapeHtml(formatValue(unit.model))}</strong>
                </div>

                <div class="unit-detail">
                    <span>Engine Size</span>
                    <strong>${escapeHtml(formatValue(unit.engineSize))}</strong>
                </div>

                <div class="unit-detail">
                    <span>${regional.distanceLabel()}</span>
                    <strong>${escapeHtml(regional.distance(unit.mileage))}</strong>
                </div>

                <div class="unit-detail">
                    <span>Hours</span>
                    <strong>${escapeHtml(formatValue(unit.hours))}</strong>
                </div>

                <div class="unit-detail">
                    <span>VIN / Serial</span>
                    <strong>${escapeHtml(formatValue(unit.vin))}</strong>
                </div>
            </div>

            <div class="unit-service-summary">
    <div class="service-summary-header">
        <div>
            <span>Lifetime Repair Cost</span>

            <strong>
                ${regional.currency(repairCost)}
            </strong>
        </div>

        <div>
            <span>Service Records</span>

            <strong>
                ${serviceHistory.length}
            </strong>
        </div>
    </div>

    <div class="service-history-list">
        ${serviceHistoryMarkup}
    </div>
</div>

            <div class="unit-actions">
                ${unit.archived === true ? `
                <label class="dashboard-inclusion">
                    <input class="dashboard-inclusion-toggle" type="checkbox"
                        data-unit-id="${escapeHtml(unit.id)}"
                        ${unit.includeInDashboardTotals === true ? "checked" : ""}>
                    Include in dashboard totals
                </label>
                ` : ""}
                <button
                    class="log-service-btn"
                    type="button"
                    data-unit-id="${escapeHtml(unit.id)}"
                    ${unit.archived === true ? "disabled" : ""}
                    title="${unit.archived === true ? "Restore this unit before adding routine records" : "Add a maintenance record"}"
                >
                    Log service
                </button>

                <button
                    class="edit-unit-btn"
                    type="button"
                    data-unit-id="${escapeHtml(unit.id)}"
                >
                    Edit
                </button>

                <button
                    class="${unit.archived === true ? "restore-unit-btn" : "archive-unit-btn"}"
                    type="button"
                    data-unit-id="${escapeHtml(unit.id)}"
                >
                    ${unit.archived === true ? "Restore to Active" : "Archive"}
                </button>
            </div>
        `;

        if (groupByTypeInput.checked) {
            const type = unitTypes.includes(unit.type) ? unit.type : "Other";
            let groupList = fleetList.querySelector(`[data-type-group="${type}"] .fleet-type-list`);
            if (!groupList) {
                const typeUnits = visibleFleet.filter(item =>
                    (unitTypes.includes(item.type) ? item.type : "Other") === type
                );
                const group = document.createElement("section");
                group.className = "fleet-type-group";
                group.dataset.typeGroup = type;
                group.innerHTML = `<div class="fleet-type-heading"><h3>${escapeHtml(type)}</h3><span>${typeUnits.length}</span></div><div class="fleet-type-list"></div>`;
                fleetList.appendChild(group);
                groupList = group.querySelector(".fleet-type-list");
            }
            groupList.appendChild(card);
        } else {
            fleetList.appendChild(card);
        }
    });
}

function saveViewPreference() {
    localStorage.setItem(viewPreferenceKey, JSON.stringify({
        status: currentFilter,
        type: typeFilterInput.value,
        groupByType: groupByTypeInput.checked
    }));
}

function formatArchiveDate(value) {
    if (!value) return "(date unavailable)";
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? String(value)
        : regional.date(date);
}

filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
        currentFilter = button.dataset.filter;
        filterButtons.forEach((item) => item.classList.toggle("active", item === button));
        saveViewPreference();
        renderFleet();
    });
});

filterButtons.forEach(button => button.classList.toggle("active", button.dataset.filter === currentFilter));
typeFilterInput.addEventListener("change", () => { saveViewPreference(); renderFleet(); });
groupByTypeInput.addEventListener("change", () => { saveViewPreference(); renderFleet(); });

exportUnitsButton.addEventListener("click", () => {
    const headers = [
        "Fleet Name", "Name", "Unit Number", "Type", "Status", "Year", "Make", "Model",
        "Engine Size", "VIN / Serial", `${regional.distanceLabel()} (${regional.distanceShort()})`, "Hours", `Purchase Price (${regional.get().currency_code})`,
        "Archived", "Archived Date", "Archive Reason", "Included in Dashboard Totals"
    ];
    const fleet = getFleet();
    const statusFleet = currentFilter === "all" ? fleet : fleet.filter(unit =>
        currentFilter === "archived" ? unit.archived === true : unit.archived !== true
    );
    const exportFleet = typeFilterInput.value === "all"
        ? statusFleet
        : statusFleet.filter(unit => (unit.type || "Other") === typeFilterInput.value);
    const rows = exportFleet.map(unit => [
        window.trackRightAuth?.personalAccount?.name || "Personal Fleet",
        unit.name, unit.number, unit.type, unit.status, unit.year, unit.make, unit.model,
        unit.engineSize, unit.vin, regional.toDisplayDistance(unit.mileage), unit.hours, unit.purchasePrice,
        unit.archived === true ? "Yes" : "No", unit.archivedAt || "", unit.archiveReason || "",
        unit.archived === true ? (unit.includeInDashboardTotals === true ? "Yes" : "No") : "Yes"
    ]);
    const csv = [headers, ...rows]
        .map(row => row.map(value => `"${String(value ?? "").replaceAll('"', '""')}"`).join(","))
        .join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    const fleetSlug = String(window.trackRightAuth?.personalAccount?.name || "personal-fleet")
        .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    link.download = `track-right-${fleetSlug || "personal-fleet"}-units-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
});


if (showFormButton) {
    showFormButton.addEventListener(
        "click",
        function () {
            openForm();
        }
    );
}

cancelButton.addEventListener(
    "click",
    function () {
        closeForm();
    }
);


unitForm.addEventListener(
    "submit",
    async function (event) {
        event.preventDefault();

        const fleet = getFleet();

        const existingId =
            unitIdInput.value;

        const unitLimit = Number(
            window.trackRightAuth?.personalAccount?.unit_limit || 20
        );
        if (!existingId && fleet.filter((unit) => unit.archived !== true).length >= unitLimit) {
            alert(`Your current plan supports up to ${unitLimit} active units.`);
            return;
        }

        const unitRecord = {
            id:
                existingId ||
                createUnitId(),

            name:
                unitNameInput.value.trim(),

            number:
                unitNumberInput.value.trim(),

            type:
                unitTypeInput.value,

            status:
                unitStatusInput.value,

            year:
                unitYearInput.value,

            make:
                unitMakeInput.value.trim(),

            model:
                unitModelInput.value.trim(),

            engineSize:
                unitEngineSizeInput.value.trim(),

            vin:
                unitVinInput.value.trim(),

            mileage:
                unitMileageInput.value === ""
                    ? ""
                    : regional.toStoredDistance(unitMileageInput.value),

            hours:
                unitHoursInput.value === ""
                    ? ""
                    : Number(unitHoursInput.value),

            purchasePrice:
                unitPurchasePriceInput.value === ""
                    ? ""
                    : Number(
                        unitPurchasePriceInput.value
                    ),

            archived: false
        };

        const existingIndex =
            fleet.findIndex(
                unit => unit.id === existingId
            );

        if (existingIndex >= 0) {
            const existingUnit =
                fleet[existingIndex];

            Object.assign(unitRecord, {
                ...existingUnit,
                ...unitRecord,
                archived: existingUnit.archived === true,
                serviceHistory: existingUnit.serviceHistory || [],
                repairCost: Number(existingUnit.repairCost) || 0
            });

            fleet[existingIndex] =
                unitRecord;
        } else {
            unitRecord.serviceHistory = [];
            unitRecord.repairCost = 0;

            fleet.push(unitRecord);
        }

        saveFleet(fleet);
        await window.trackRightPersonalData.flush();
        closeForm();
        renderFleet();
    }
);


fleetList.addEventListener(
    "click",
    async function (event) {
        const editButton =
            event.target.closest(
                ".edit-unit-btn"
            );

        const archiveButton =
            event.target.closest(
                ".archive-unit-btn"
            );

        const restoreButton = event.target.closest(".restore-unit-btn");
        const dashboardToggle = event.target.closest(".dashboard-inclusion-toggle");

        const serviceButton =
            event.target.closest(".log-service-btn");

        const fleet = getFleet();

        if (dashboardToggle) {
            const unit = fleet.find(item => item.id === dashboardToggle.dataset.unitId);
            if (!unit) return;
            unit.includeInDashboardTotals = dashboardToggle.checked;
            saveFleet(fleet);
            await window.trackRightPersonalData.flush();
            return;
        }

        if (restoreButton) {
            const unit = fleet.find(item => item.id === restoreButton.dataset.unitId);
            if (!unit || !confirm(`Restore ${unit.name} to the active fleet?`)) return;
            unit.archived = false;
            unit.restoredAt = new Date().toISOString();
            saveFleet(fleet);
            await window.trackRightPersonalData.flush();
            renderFleet();
            return;
        }

        if (serviceButton) {
            const unit = fleet.find((item) => item.id === serviceButton.dataset.unitId);
            if (!unit) return;
            serviceForm.reset();
            serviceUnitIdInput.value = unit.id;
            serviceDialogTitle.textContent = `Log service · ${unit.name}`;
            serviceDateInput.value = new Date().toISOString().slice(0, 10);
            serviceMileageInput.value = regional.toDisplayDistance(unit.mileage);
            serviceHoursInput.value = unit.hours ?? "";
            serviceDialog.showModal();
            serviceDescriptionInput.focus();
            return;
        }

        if (editButton) {
            const unit =
                fleet.find(
                    item =>
                        item.id ===
                        editButton.dataset.unitId
                );

            if (unit) {
                openForm(unit);
            }

            return;
        }

        if (archiveButton) {
            const unit =
                fleet.find(
                    item =>
                        item.id ===
                        archiveButton.dataset.unitId
                );

            if (!unit) {
                return;
            }

            const shouldArchive =
                confirm(
                    `Archive ${unit.name}?`
                );

            if (!shouldArchive) {
                return;
            }

            const reason = prompt("Optional archive reason:", unit.archiveReason || "");
            if (reason === null) return;
            const removeFromTotals = confirm("Remove this unit from current dashboard totals?\n\nOK removes it. Cancel keeps its history included in dashboard totals.");

            unit.archived = true;
            unit.archivedAt = new Date().toISOString();
            unit.archiveReason = reason.trim();
            unit.includeInDashboardTotals = !removeFromTotals;

            saveFleet(fleet);
            await window.trackRightPersonalData.flush();
            renderFleet();
        }
    }
);

document.querySelector("#close-service-dialog").addEventListener("click", () => serviceDialog.close());
document.querySelector("#cancel-service").addEventListener("click", () => serviceDialog.close());

serviceForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    const fleet = getFleet();
    const unit = fleet.find((item) => item.id === serviceUnitIdInput.value);
    if (!unit) return;
    if (!Array.isArray(unit.serviceHistory)) unit.serviceHistory = [];
    const cost = Number(serviceCostInput.value) || 0;
    unit.serviceHistory.push({
        id: crypto.randomUUID ? crypto.randomUUID() : `service-${Date.now()}`,
        source: "manual",
        completedAt: serviceDateInput.value,
        workPerformed: serviceDescriptionInput.value.trim(),
        totalCost: cost,
        mileage: serviceMileageInput.value === "" ? "" : regional.toStoredDistance(serviceMileageInput.value),
        hours: serviceHoursInput.value === "" ? "" : Number(serviceHoursInput.value)
    });
    unit.repairCost = unit.serviceHistory.reduce((total, record) => total + (Number(record.totalCost) || 0), 0);
    if (serviceMileageInput.value !== "") unit.mileage = regional.toStoredDistance(serviceMileageInput.value);
    if (serviceHoursInput.value !== "") unit.hours = Number(serviceHoursInput.value);
    saveFleet(fleet);
    await window.trackRightPersonalData.flush();
    serviceDialog.close();
    renderFleet();
});


renderFleet();
