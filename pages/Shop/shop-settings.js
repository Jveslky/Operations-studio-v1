(function () {
    "use strict";

    const client = window.trackRightSupabase;
    const form = document.getElementById("shop-profile-form");
    const saveButton = document.getElementById("save-shop-profile");
    const message = document.getElementById("shop-profile-message");
    const timezoneSelect = document.getElementById("shop-profile-timezone");
    const timezoneHelp = document.getElementById("timezone-help");
    const fields = {
        name: document.getElementById("shop-profile-name"),
        business_email: document.getElementById("shop-profile-email"),
        business_phone: document.getElementById("shop-profile-phone"),
        website: document.getElementById("shop-profile-website"),
        address_line_1: document.getElementById("shop-profile-address-1"),
        address_line_2: document.getElementById("shop-profile-address-2"),
        city: document.getElementById("shop-profile-city"),
        region: document.getElementById("shop-profile-region"),
        postal_code: document.getElementById("shop-profile-postal"),
        country: document.getElementById("shop-profile-country"),
        default_labor_rate: document.getElementById("shop-profile-labor-rate")
    };

    let context = null;
    let detectedTimezone = "UTC";

    function setMessage(text, state) {
        message.textContent = text;
        message.className = `settings-message${state ? ` ${state}` : ""}`;
    }

    function timezoneNames() {
        try {
            return Intl.supportedValuesOf("timeZone");
        } catch (error) {
            return ["UTC", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles"];
        }
    }

    function setupTimezones() {
        detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
        const zones = Array.from(new Set([
            ...timezoneNames(),
            "UTC",
            detectedTimezone
        ]));
        zones.sort().forEach(function (zone) {
            const option = document.createElement("option");
            option.value = zone;
            option.textContent = zone.replaceAll("_", " ");
            timezoneSelect.appendChild(option);
        });
    }

    function fillForm(shop) {
        Object.entries(fields).forEach(function ([column, input]) {
            input.value = shop[column] ?? "";
        });
        const selectedTimezone = shop.timezone || detectedTimezone;
        if (!Array.from(timezoneSelect.options).some(function (option) {
            return option.value === selectedTimezone;
        })) {
            const option = document.createElement("option");
            option.value = selectedTimezone;
            option.textContent = selectedTimezone.replaceAll("_", " ");
            timezoneSelect.appendChild(option);
        }
        timezoneSelect.value = selectedTimezone;
        timezoneHelp.textContent = shop.timezone
            ? `Saved shop timezone: ${shop.timezone}. This remains authoritative regardless of the device being used.`
            : `Suggested from this browser: ${detectedTimezone}. Save the profile to make it the shop-wide timezone.`;
    }

    function setEditable(editable) {
        Array.from(form.elements).forEach(function (element) {
            element.disabled = !editable;
        });
    }

    async function loadProfile() {
        context = await window.trackRightAuthReady;
        if (!context?.shopId) return;

        const canEdit = ["owner", "admin"].includes(context.role);
        const { data: shop, error } = await client
            .from("shops")
            .select("id, name, business_email, business_phone, website, address_line_1, address_line_2, city, region, postal_code, country, default_labor_rate, timezone")
            .eq("id", context.shopId)
            .single();

        if (error) {
            console.error("Could not load Shop Profile:", error);
            setMessage(`Could not load Shop Profile: ${error.message}`, "error");
            setEditable(false);
            return;
        }

        fillForm(shop);
        setEditable(canEdit);
        if (!canEdit) {
            setMessage("Owner or admin access is required to change Shop Profile settings.", "error");
        }
    }

    form.addEventListener("submit", async function (event) {
        event.preventDefault();
        if (!context?.shopId || !["owner", "admin"].includes(context.role)) {
            setMessage("Owner or admin access is required.", "error");
            return;
        }

        saveButton.disabled = true;
        setMessage("Saving Shop Profile…", "");

        const profile = {};
        Object.entries(fields).forEach(function ([column, input]) {
            profile[column] = column === "default_labor_rate"
                ? (input.value === "" ? null : Number(input.value))
                : (input.value.trim() || null);
        });
        profile.name = fields.name.value.trim();
        profile.timezone = timezoneSelect.value;
        profile.updated_at = new Date().toISOString();

        const { data: shop, error } = await client
            .from("shops")
            .update(profile)
            .eq("id", context.shopId)
            .select("id, name, business_email, business_phone, website, address_line_1, address_line_2, city, region, postal_code, country, default_labor_rate, timezone")
            .single();

        if (error) {
            console.error("Could not save Shop Profile:", error);
            setMessage(`Could not save Shop Profile: ${error.message}`, "error");
            saveButton.disabled = false;
            return;
        }

        fillForm(shop);
        context.shop = { ...(context.shop || {}), id: shop.id, name: shop.name };
        window.trackRightSetAccountLabel?.(shop.name);
        setMessage("Shop Profile saved.", "success");
        saveButton.disabled = false;
    });

    setupTimezones();
    loadProfile().catch(function (error) {
        console.error("Shop Profile failed to initialize:", error);
        setMessage(`Shop Profile failed to initialize: ${error.message}`, "error");
        setEditable(false);
    });
})();
