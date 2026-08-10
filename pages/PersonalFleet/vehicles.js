const STORAGE_KEY = "track-right-personal-vehicles";

const vehicleFormPanel = document.getElementById("vehicle-form-panel");
const vehicleForm = document.getElementById("vehicle-form");
const vehicleFormTitle = document.getElementById("vehicle-form-title");

const vehicleIdInput = document.getElementById("vehicle-id");
const vehicleNameInput = document.getElementById("vehicle-name");
const vehicleMileageInput = document.getElementById("vehicle-mileage");
const vehicleRepairCostInput = document.getElementById(
    "vehicle-repair-cost"
);

const showVehicleFormButton = document.getElementById(
    "show-vehicle-form"
);

const cancelVehicleFormButton = document.getElementById(
    "cancel-vehicle-form"
);

const vehicleSearchInput = document.getElementById("vehicle-search");
const vehicleList = document.getElementById("vehicle-list");
const vehicleEmptyState = document.getElementById(
    "vehicle-empty-state"
);

const totalVehiclesDisplay = document.getElementById(
    "total-vehicles"
);

const totalMileageDisplay = document.getElementById(
    "total-mileage"
);

const totalRepairCostDisplay = document.getElementById(
    "total-repair-cost"
);

function loadVehicles() {
    try {
        const savedVehicles = localStorage.getItem(STORAGE_KEY);

        return savedVehicles
            ? JSON.parse(savedVehicles)
            : [];
    } catch (error) {
        console.error("Could not load vehicles:", error);
        return [];
    }
}

function saveVehicles(vehicles) {
    localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(vehicles)
    );
}

function createVehicleId() {
    if (window.crypto?.randomUUID) {
        return crypto.randomUUID();
    }

    return `vehicle-${Date.now()}`;
}

function formatMileage(value) {
    return Number(value || 0).toLocaleString();
}

function formatCurrency(value) {
    return Number(value || 0).toLocaleString(
        "en-US",
        {
            style: "currency",
            currency: "USD"
        }
    );
}

function updateSummary(vehicles) {
    const totalMileage = vehicles.reduce(
        (sum, vehicle) =>
            sum + Number(vehicle.mileage || 0),
        0
    );

    const totalRepairCost = vehicles.reduce(
        (sum, vehicle) =>
            sum + Number(vehicle.repairCost || 0),
        0
    );

    totalVehiclesDisplay.textContent =
        vehicles.length.toLocaleString();

    totalMileageDisplay.textContent =
        formatMileage(totalMileage);

    totalRepairCostDisplay.textContent =
        formatCurrency(totalRepairCost);
}

function createVehicleCard(vehicle) {
    const card = document.createElement("article");
    card.className = "vehicle-card";
    card.dataset.vehicleId = vehicle.id;

    card.innerHTML = `
        <div>
            <h3>${escapeHtml(vehicle.name)}</h3>
            <p>Personal Fleet Vehicle</p>
        </div>

        <div class="vehicle-stat">
            <span>Mileage</span>
            <strong>
                ${formatMileage(vehicle.mileage)} mi
            </strong>
        </div>

        <div class="vehicle-stat">
            <span>Repair Cost</span>
            <strong>
                ${formatCurrency(vehicle.repairCost)}
            </strong>
        </div>

        <div class="vehicle-actions">
            <button
                type="button"
                class="vehicle-action-button edit"
                data-action="edit">
                Edit
            </button>

            <button
                type="button"
                class="vehicle-action-button delete"
                data-action="delete">
                Delete
            </button>
        </div>
    `;

    return card;
}

function escapeHtml(value) {
    const element = document.createElement("div");
    element.textContent = value ?? "";
    return element.innerHTML;
}

function renderVehicles() {
    const vehicles = loadVehicles();
    const searchTerm = vehicleSearchInput.value
        .trim()
        .toLowerCase();

    const filteredVehicles = vehicles.filter(
        (vehicle) =>
            vehicle.name
                .toLowerCase()
                .includes(searchTerm)
    );

    vehicleList.innerHTML = "";

    filteredVehicles.forEach((vehicle) => {
        vehicleList.appendChild(
            createVehicleCard(vehicle)
        );
    });

    vehicleEmptyState.hidden =
        filteredVehicles.length > 0;

    updateSummary(vehicles);
}

function openVehicleForm(vehicle = null) {
    vehicleForm.reset();

    if (vehicle) {
        vehicleFormTitle.textContent =
            "Edit Vehicle";

        vehicleIdInput.value = vehicle.id;
        vehicleNameInput.value = vehicle.name;
        vehicleMileageInput.value = vehicle.mileage;
        vehicleRepairCostInput.value =
            vehicle.repairCost;
    } else {
        vehicleFormTitle.textContent =
            "Add Vehicle";

        vehicleIdInput.value = "";
    }

    vehicleFormPanel.hidden = false;
    vehicleNameInput.focus();
}

function closeVehicleForm() {
    vehicleForm.reset();
    vehicleIdInput.value = "";
    vehicleFormPanel.hidden = true;
}

function handleVehicleSubmit(event) {
    event.preventDefault();

    const vehicles = loadVehicles();
    const existingVehicleId =
        vehicleIdInput.value.trim();

    const vehicleData = {
        id: existingVehicleId || createVehicleId(),
        name: vehicleNameInput.value.trim(),
        mileage: Number(vehicleMileageInput.value),
        repairCost: Number(
            vehicleRepairCostInput.value
        )
    };

    if (!vehicleData.name) {
        vehicleNameInput.focus();
        return;
    }

    const existingIndex = vehicles.findIndex(
        (vehicle) =>
            vehicle.id === existingVehicleId
    );

    if (existingIndex >= 0) {
        vehicles[existingIndex] = vehicleData;
    } else {
        vehicles.push(vehicleData);
    }

    saveVehicles(vehicles);
    closeVehicleForm();
    renderVehicles();
}

function handleVehicleListClick(event) {
    const button = event.target.closest(
        "[data-action]"
    );

    if (!button) {
        return;
    }

    const card = button.closest(".vehicle-card");

    if (!card) {
        return;
    }

    const vehicleId = card.dataset.vehicleId;
    const vehicles = loadVehicles();

    const vehicle = vehicles.find(
        (item) => item.id === vehicleId
    );

    if (!vehicle) {
        return;
    }

    if (button.dataset.action === "edit") {
        openVehicleForm(vehicle);
        return;
    }

    if (button.dataset.action === "delete") {
        const confirmed = window.confirm(
            `Delete ${vehicle.name}?`
        );

        if (!confirmed) {
            return;
        }

        const updatedVehicles = vehicles.filter(
            (item) => item.id !== vehicleId
        );

        saveVehicles(updatedVehicles);
        renderVehicles();
    }
}

showVehicleFormButton.addEventListener(
    "click",
    () => openVehicleForm()
);

cancelVehicleFormButton.addEventListener(
    "click",
    closeVehicleForm
);

vehicleForm.addEventListener(
    "submit",
    handleVehicleSubmit
);

vehicleSearchInput.addEventListener(
    "input",
    renderVehicles
);

vehicleList.addEventListener(
    "click",
    handleVehicleListClick
);

renderVehicles();