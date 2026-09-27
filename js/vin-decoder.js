(function () {
    "use strict";

    const form = document.getElementById("add-customer-unit-form");
    const vinInput = document.getElementById("customer-unit-serial");
    const decodeButton = document.getElementById("decode-customer-unit-vin");
    const applyButton = document.getElementById("apply-customer-unit-vin");
    const result = document.getElementById("vin-lookup-result");
    const status = document.getElementById("vin-lookup-status");
    const fields = document.getElementById("vin-lookup-fields");
    if (!form || !vinInput || !decodeButton || !applyButton || !result || !status || !fields) return;

    const inputs = {
        year: document.getElementById("customer-unit-year"),
        make: document.getElementById("customer-unit-make"),
        model: document.getElementById("customer-unit-model")
    };
    const output = {
        year: document.getElementById("vin-lookup-year"),
        make: document.getElementById("vin-lookup-make"),
        model: document.getElementById("vin-lookup-model")
    };
    let suggestion = null;
    let pending = null;

    function clearResult() {
        if (pending) pending.abort();
        pending = null;
        suggestion = null;
        decodeButton.disabled = false;
        fields.hidden = true;
        result.hidden = true;
        status.textContent = "";
    }

    vinInput.addEventListener("input", clearResult);
    form.addEventListener("reset", clearResult);

    decodeButton.addEventListener("click", async function () {
        clearResult();
        const vin = vinInput.value.trim().toUpperCase();
        result.hidden = false;
        if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) {
            status.textContent = "Enter a complete 17-character road-vehicle VIN. Equipment serial numbers can be entered manually.";
            return;
        }

        const controller = new AbortController();
        pending = controller;
        decodeButton.disabled = true;
        status.textContent = "Checking the VIN with NHTSA…";
        const timer = window.setTimeout(() => controller.abort(), 10000);
        try {
            const url = new URL(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(vin)}`);
            url.searchParams.set("format", "json");
            const response = await fetch(url.toString(), { signal: controller.signal });
            if (!response.ok) throw new Error("NHTSA is unavailable");
            const data = await response.json();
            if (pending !== controller || vinInput.value.trim().toUpperCase() !== vin) return;
            const decoded = data && Array.isArray(data.Results) ? data.Results[0] : null;
            const code = String(decoded?.ErrorCode ?? "");
            if (!decoded) {
                status.textContent = "NHTSA returned no result. Check the VIN or enter unit details manually.";
                return;
            }
            const values = {
                year: String(decoded.ModelYear || "").trim(),
                make: String(decoded.Make || "").trim(),
                model: String(decoded.Model || "").trim()
            };
            if (!values.year && !values.make && !values.model) {
                status.textContent = code === "0"
                    ? "NHTSA returned no year, make, or model. Enter the details manually."
                    : `NHTSA could not confirm this VIN (code ${code || "unknown"}). Check it or enter details manually.`;
                return;
            }
            for (const key of Object.keys(output)) output[key].textContent = values[key] || "Not provided";
            fields.hidden = false;
            if (code !== "0") {
                applyButton.hidden = true;
                status.textContent = `NHTSA could not confirm this VIN (code ${code || "unknown"}). It returned partial details below for reference only. Verify the VIN and enter the unit manually.`;
                return;
            }
            suggestion = { vin, values };
            applyButton.hidden = false;
            status.textContent = "Suggested by NHTSA. Its model may be broader than a trim or sales name. Check the vehicle before filling; existing entries stay as entered.";
        } catch (error) {
            if (pending !== controller) return;
            status.textContent = error.name === "AbortError"
                ? "The lookup timed out. Enter the unit details manually or try again."
                : "The lookup is unavailable. Enter the unit details manually or try again.";
        } finally {
            window.clearTimeout(timer);
            if (pending === controller) {
                pending = null;
                decodeButton.disabled = false;
            }
        }
    });

    applyButton.addEventListener("click", function () {
        if (!suggestion || vinInput.value.trim().toUpperCase() !== suggestion.vin) {
            clearResult();
            return;
        }
        const filled = [];
        for (const [key, input] of Object.entries(inputs)) {
            if (!input.value.trim() && suggestion.values[key]) {
                input.value = suggestion.values[key];
                input.dispatchEvent(new Event("input", { bubbles: true }));
                filled.push(key);
            }
        }
        status.textContent = filled.length
            ? `Filled ${filled.join(", ")}. Review the form, then save the unit when ready.`
            : "Existing fields were kept. Review the details and save when ready.";
    });
}());
