const fleetStorageKey = "track-right-fleet";

const completedStatuses = [
    "Complete",
    "Ready for Pickup",
    "Ready for Payment",
    "Awaiting Payment"
];

const totalUnitsDisplay =
    document.querySelector("#dashboard-total-units");

const activeUnitsDisplay =
    document.querySelector("#dashboard-active-units");

const archivedUnitsDisplay =
    document.querySelector("#dashboard-archived-units");

const openOrdersDisplay =
    document.querySelector("#dashboard-open-orders");

const waitingPartsDisplay =
    document.querySelector("#dashboard-waiting-parts");

const ordersThisYearDisplay =
    document.querySelector("#dashboard-orders-this-year");

const yearlyMaintenanceDisplay =
    document.querySelector("#dashboard-yearly-maintenance");

const purchaseCostDisplay =
    document.querySelector("#dashboard-purchase-cost");

const lifetimeCostDisplay =
    document.querySelector("#dashboard-lifetime-cost");


function safelyParse(value, fallback) {
    try {
        return value
            ? JSON.parse(value)
            : fallback;
    } catch (error) {
        console.error(
            "Could not read dashboard data:",
            error
        );

        return fallback;
    }
}


function getFleet() {
    const fleet = safelyParse(
        localStorage.getItem(fleetStorageKey),
        []
    );

    return Array.isArray(fleet)
        ? fleet
        : [];
}


function getRepairOrders(fleet) {
    const repairOrders = [];

    const fleetIds = new Set(
        fleet.map(unit => String(unit.id))
    );

    for (
        let index = 0;
        index < localStorage.length;
        index++
    ) {
        const key = localStorage.key(index);

        if (
            !key ||
            !/^repair-order-\d+$/.test(key)
        ) {
            continue;
        }

        const repairOrder = safelyParse(
            localStorage.getItem(key),
            null
        );

        if (!repairOrder) {
            continue;
        }

        const belongsToPersonalFleet =
            repairOrder.appMode === "personal-fleet" ||
            (
                repairOrder.unitId &&
                fleetIds.has(
                    String(repairOrder.unitId)
                )
            );

        if (belongsToPersonalFleet) {
            repairOrders.push(repairOrder);
        }
    }

    return repairOrders;
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


function getOrderDate(order) {
    const savedDate =
        order.createdAt ||
        order.dateCreated ||
        order.openedAt ||
        order.completedDate ||
        order.completedAt;

    if (!savedDate) {
        return null;
    }

    const date = new Date(savedDate);

    return Number.isNaN(date.getTime())
        ? null
        : date;
}


function getYearlyMaintenance(fleet, currentYear) {
    return fleet.reduce((fleetTotal, unit) => {
        const history = Array.isArray(
            unit.serviceHistory
        )
            ? unit.serviceHistory
            : [];

        const unitTotal = history.reduce(
            (historyTotal, repair) => {
                const repairDate =
                    repair.completedAt ||
                    repair.completedDate;

                if (!repairDate) {
                    return historyTotal;
                }

                const date = new Date(repairDate);

                if (
                    Number.isNaN(date.getTime()) ||
                    date.getFullYear() !== currentYear
                ) {
                    return historyTotal;
                }

                return historyTotal +
                    (Number(repair.totalCost) || 0);
            },
            0
        );

        return fleetTotal + unitTotal;
    }, 0);
}


function renderDashboard() {
    const fleet = getFleet();
    const repairOrders =
        getRepairOrders(fleet);

    const currentYear =
        new Date().getFullYear();

    const activeFleet = fleet.filter(
        unit => unit.archived !== true
    );

    const archivedFleet = fleet.filter(
        unit => unit.archived === true
    );

    const activeUnits = activeFleet.filter(
        unit => unit.status === "Active"
    ).length;

    const openRepairOrders =
        repairOrders.filter(order =>
            order.archived !== true &&
            !completedStatuses.includes(
                order.status
            )
        );

    const waitingOnParts =
        openRepairOrders.filter(order =>
            order.status === "Waiting Parts" ||
            order.status === "Waiting on Parts"
        ).length;

    const ordersThisYear =
        repairOrders.filter(order => {
            const orderDate =
                getOrderDate(order);

            return (
                orderDate &&
                orderDate.getFullYear() ===
                currentYear
            );
        }).length;

    const yearlyMaintenance =
        getYearlyMaintenance(
            fleet,
            currentYear
        );

    const initialFleetPurchase =
        fleet.reduce(
            (total, unit) =>
                total +
                (
                    Number(unit.purchasePrice) ||
                    Number(unit.purchaseCost) ||
                    0
                ),
            0
        );

    const lifetimeRepairCost =
        fleet.reduce(
            (total, unit) =>
                total +
                (Number(unit.repairCost) || 0),
            0
        );

    totalUnitsDisplay.textContent =
        activeFleet.length.toLocaleString();

    activeUnitsDisplay.textContent =
        activeUnits.toLocaleString();

    archivedUnitsDisplay.textContent =
        archivedFleet.length.toLocaleString();

    openOrdersDisplay.textContent =
        openRepairOrders.length.toLocaleString();

    waitingPartsDisplay.textContent =
        waitingOnParts.toLocaleString();

    ordersThisYearDisplay.textContent =
        ordersThisYear.toLocaleString();

    yearlyMaintenanceDisplay.textContent =
        formatCurrency(yearlyMaintenance);

    purchaseCostDisplay.textContent =
        formatCurrency(initialFleetPurchase);

    lifetimeCostDisplay.textContent =
        formatCurrency(lifetimeRepairCost);
}


renderDashboard();