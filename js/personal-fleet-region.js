(function () {
    "use strict";

    const defaults = {
        region_code: "US", locale_code: "en-US", currency_code: "USD",
        distance_unit: "mi", volume_unit: "gal", temperature_unit: "F", pressure_unit: "psi"
    };

    function preferences() {
        return { ...defaults, ...(window.trackRightAuth?.personalAccount || {}) };
    }

    function displayDistance(value) {
        if (value === "" || value === null || value === undefined) return "";
        return preferences().distance_unit === "km" ? Math.round(Number(value) * 1.609344) : Number(value);
    }

    function storedDistance(value) {
        if (value === "" || value === null || value === undefined) return "";
        return preferences().distance_unit === "km" ? Number(value) / 1.609344 : Number(value);
    }

    function formatNumber(value, options) {
        return Number(value || 0).toLocaleString(preferences().locale_code, options);
    }

    window.trackRightFleetRegion = {
        defaults,
        get: preferences,
        currency(value) {
            return formatNumber(value, { style: "currency", currency: preferences().currency_code });
        },
        date(value) {
            if (!value) return "";
            const dateOnly = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
            const date = dateOnly
                ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
                : new Date(value);
            return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString(preferences().locale_code);
        },
        distanceLabel() { return preferences().distance_unit === "km" ? "Kilometres" : "Mileage"; },
        distanceShort() { return preferences().distance_unit; },
        toDisplayDistance: displayDistance,
        toStoredDistance: storedDistance,
        distance(value) {
            if (value === "" || value === null || value === undefined) return "—";
            return `${formatNumber(displayDistance(value), { maximumFractionDigits: 0 })} ${preferences().distance_unit}`;
        }
    };
})();
