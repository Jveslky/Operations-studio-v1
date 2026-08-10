const fleetStorageKey = "track-right-fleet";

const showFormButton =
    document.querySelector("#show-form-button");

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
        unitVinInput.value = unit.vin || "";
        unitMileageInput.value = unit.mileage ?? "";
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


function getStatusClass(status) {
    return `status-${status
        .toLowerCase()
        .replaceAll(" ", "-")}`;
}


function renderFleet() {
    const fleet = getFleet();

    const visibleFleet = fleet.filter(
        unit => unit.archived !== true
    );

    fleetList.innerHTML = "";

    totalUnits.textContent =
        visibleFleet.length;

    activeUnits.textContent =
        visibleFleet.filter(
            unit => unit.status === "Active"
        ).length;

    outOfServiceUnits.textContent =
        visibleFleet.filter(
            unit => unit.status === "Out of Service"
        ).length;

    emptyMessage.style.display =
        visibleFleet.length === 0
            ? "block"
            : "none";

    visibleFleet.forEach(unit => {
        const card =
            document.createElement("article");

        card.className = "unit-card";

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
                            RO #${record.repairOrderId}
                        </strong>

                        <span>
                            ${record.completedAt || "No date"}
                        </span>
                    </div>

                    <p>
                        ${record.workPerformed ||
                        record.complaint ||
                        "Completed repair"}
                    </p>

                    <strong>
                        ${Number(
                            record.totalCost || 0
                        ).toLocaleString(
                            "en-US",
                            {
                                style: "currency",
                                currency: "USD"
                            }
                        )}
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
                    <h3>${unit.name}</h3>

                    <div class="unit-number">
                        ${formatValue(unit.number)}
                    </div>
                </div>

                <span
                    class="status-badge ${getStatusClass(unit.status)}"
                >
                    ${unit.status}
                </span>
            </div>

            <div class="unit-details">
                <div class="unit-detail">
                    <span>Type</span>
                    <strong>${formatValue(unit.type)}</strong>
                </div>

                <div class="unit-detail">
                    <span>Year</span>
                    <strong>${formatValue(unit.year)}</strong>
                </div>

                <div class="unit-detail">
                    <span>Make</span>
                    <strong>${formatValue(unit.make)}</strong>
                </div>

                <div class="unit-detail">
                    <span>Model</span>
                    <strong>${formatValue(unit.model)}</strong>
                </div>

                <div class="unit-detail">
                    <span>Mileage</span>
                    <strong>${formatValue(unit.mileage)}</strong>
                </div>

                <div class="unit-detail">
                    <span>Hours</span>
                    <strong>${formatValue(unit.hours)}</strong>
                </div>

                <div class="unit-detail">
                    <span>VIN / Serial</span>
                    <strong>${formatValue(unit.vin)}</strong>
                </div>
            </div>

            <div class="unit-service-summary">
    <div class="service-summary-header">
        <div>
            <span>Lifetime Repair Cost</span>

            <strong>
                ${repairCost.toLocaleString(
                    "en-US",
                    {
                        style: "currency",
                        currency: "USD"
                    }
                )}
            </strong>
        </div>

        <div>
            <span>Completed Repairs</span>

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
                <button
                    class="edit-unit-btn"
                    type="button"
                    data-unit-id="${unit.id}"
                >
                    Edit
                </button>

                <button
                    class="archive-unit-btn"
                    type="button"
                    data-unit-id="${unit.id}"
                >
                    Archive
                </button>
            </div>
        `;

        fleetList.appendChild(card);
    });
}


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
    function (event) {
        event.preventDefault();

        const fleet = getFleet();

        const existingId =
            unitIdInput.value;

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

            vin:
                unitVinInput.value.trim(),

            mileage:
                unitMileageInput.value === ""
                    ? ""
                    : Number(unitMileageInput.value),

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

            unitRecord.archived =
                existingUnit.archived || false;

            unitRecord.serviceHistory =
                existingUnit.serviceHistory || [];

            unitRecord.repairCost =
                Number(existingUnit.repairCost) || 0;

            fleet[existingIndex] =
                unitRecord;
        } else {
            unitRecord.serviceHistory = [];
            unitRecord.repairCost = 0;

            fleet.push(unitRecord);
        }

        saveFleet(fleet);
        closeForm();
        renderFleet();
    }
);


fleetList.addEventListener(
    "click",
    function (event) {
        const editButton =
            event.target.closest(
                ".edit-unit-btn"
            );

        const archiveButton =
            event.target.closest(
                ".archive-unit-btn"
            );

        const fleet = getFleet();

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

            unit.archived = true;

            saveFleet(fleet);
            renderFleet();
        }
    }
);


renderFleet();