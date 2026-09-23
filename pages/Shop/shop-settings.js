(function () {
    "use strict";

    const client = window.trackRightSupabase;
    const form = document.getElementById("shop-profile-form");
    const saveButton = document.getElementById("save-shop-profile");
    const message = document.getElementById("shop-profile-message");
    const timezoneSelect = document.getElementById("shop-profile-timezone");
    const timezoneHelp = document.getElementById("timezone-help");
    const shopTaxForm = document.getElementById("shop-tax-form");
    const shopDefaultTaxable = document.getElementById("shop-default-taxable");
    const shopDefaultTaxRate = document.getElementById("shop-default-tax-rate");
    const saveShopTax = document.getElementById("save-shop-tax");
    const shopTaxMessage = document.getElementById("shop-tax-message");
    const customerTaxForm = document.getElementById("customer-tax-form");
    const customerTaxCustomer = document.getElementById("customer-tax-customer");
    const customerTaxStatus = document.getElementById("customer-tax-status");
    const exemptionReason = document.getElementById("customer-exemption-reason");
    const exemptionNumber = document.getElementById("customer-exemption-number");
    const exemptionFile = document.getElementById("customer-exemption-file");
    const exemptionFields = document.querySelectorAll(".customer-exemption-field");
    const certificateStatus = document.getElementById("customer-certificate-status");
    const saveCustomerTax = document.getElementById("save-customer-tax");
    const customerTaxMessage = document.getElementById("customer-tax-message");
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
    let customerTaxRecords = new Map();

    function setMessage(text, state) {
        message.textContent = text;
        message.className = `settings-message${state ? ` ${state}` : ""}`;
    }

    function setStatus(element, text, state) {
        element.textContent = text;
        element.className = `settings-message${state ? ` ${state}` : ""}`;
    }

    function canManageShop() {
        return Boolean(context?.shopId && ["owner", "admin"].includes(context.role));
    }

    function setTaxEditable(editable) {
        [shopTaxForm, customerTaxForm].forEach(function (taxForm) {
            Array.from(taxForm.elements).forEach(function (element) {
                element.disabled = !editable;
            });
        });
    }

    function showExemptionFields() {
        const visible = customerTaxStatus.value === "exempt";
        exemptionFields.forEach(function (field) {
            field.hidden = !visible;
        });
    }

    async function showCertificate(path) {
        certificateStatus.replaceChildren();
        if (!path) {
            certificateStatus.textContent = "No exemption certificate uploaded.";
            return;
        }

        const { data, error } = await client.storage
            .from("customer-tax-certificates")
            .createSignedUrl(path, 600);
        if (error) {
            certificateStatus.textContent = "Certificate saved, but a preview link could not be created.";
            return;
        }

        const link = document.createElement("a");
        link.href = data.signedUrl;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = "View current certificate (link valid for 10 minutes)";
        certificateStatus.appendChild(link);
    }

    function fillCustomerTax(customer) {
        customerTaxStatus.value = customer.tax_status || "inherit";
        exemptionReason.value = customer.tax_exemption_reason || "";
        exemptionNumber.value = customer.tax_exemption_certificate_number || "";
        exemptionFile.value = "";
        showExemptionFields();
        showCertificate(customer.tax_exemption_certificate_path);
    }

    async function loadTaxSettings() {
        const [shopResult, customerResult, taxProfileResult] = await Promise.all([
            client.from("shops")
                .select("default_taxable, default_tax_rate")
                .eq("id", context.shopId)
                .single(),
            client.from("Customers")
                .select("id, name")
                .eq("shop_id", context.shopId)
                .eq("archived", false)
                .order("name"),
            client.from("customer_tax_profiles")
                .select("customer_id, tax_status, exemption_reason, exemption_certificate_number, exemption_certificate_path")
                .eq("shop_id", context.shopId)
        ]);

        if (shopResult.error || customerResult.error || taxProfileResult.error) {
            const error = shopResult.error || customerResult.error || taxProfileResult.error;
            throw new Error(error.message);
        }

        shopDefaultTaxable.checked = shopResult.data.default_taxable === true;
        shopDefaultTaxRate.value = Number(shopResult.data.default_tax_rate || 0);
        const profiles = new Map(taxProfileResult.data.map(function (profile) {
            return [String(profile.customer_id), profile];
        }));
        customerTaxRecords = new Map(customerResult.data.map(function (customer) {
            const profile = profiles.get(String(customer.id)) || {};
            return [String(customer.id), {
                ...customer,
                tax_status: profile.tax_status || "inherit",
                tax_exemption_reason: profile.exemption_reason || null,
                tax_exemption_certificate_number: profile.exemption_certificate_number || null,
                tax_exemption_certificate_path: profile.exemption_certificate_path || null
            }];
        }));
        customerTaxCustomer.innerHTML = '<option value="">Select a customer</option>';
        customerResult.data.forEach(function (customer) {
            const option = document.createElement("option");
            option.value = customer.id;
            option.textContent = customer.name;
            customerTaxCustomer.appendChild(option);
        });
        setTaxEditable(canManageShop());
        if (!canManageShop()) {
            setStatus(shopTaxMessage, "Owner or admin access is required to change tax settings.", "error");
        }
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

    function normalizeWebsite(value) {
        const entered = value.trim();
        if (!entered) return null;

        const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(entered)
            ? entered
            : `https://${entered}`;
        let url;
        try {
            url = new URL(candidate);
        } catch (error) {
            throw new Error("Enter a valid website, such as example.com.");
        }
        if (!["http:", "https:"].includes(url.protocol) || !url.hostname) {
            throw new Error("Enter a valid http or https website.");
        }
        return url.href;
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

        try {
            await loadTaxSettings();
        } catch (taxError) {
            console.error("Could not load Customers & Tax settings:", taxError);
            setStatus(shopTaxMessage, `Could not load tax settings: ${taxError.message}`, "error");
            setTaxEditable(false);
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
        try {
            profile.website = normalizeWebsite(fields.website.value);
        } catch (error) {
            setMessage(error.message, "error");
            fields.website.focus();
            saveButton.disabled = false;
            return;
        }
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

    customerTaxStatus.addEventListener("change", showExemptionFields);

    customerTaxCustomer.addEventListener("change", function () {
        setStatus(customerTaxMessage, "", "");
        const customer = customerTaxRecords.get(customerTaxCustomer.value);
        if (customer) {
            fillCustomerTax(customer);
        } else {
            customerTaxForm.reset();
            customerTaxCustomer.value = "";
            showExemptionFields();
            certificateStatus.textContent = "";
        }
    });

    shopTaxForm.addEventListener("submit", async function (event) {
        event.preventDefault();
        if (!canManageShop()) {
            setStatus(shopTaxMessage, "Owner or admin access is required.", "error");
            return;
        }

        saveShopTax.disabled = true;
        setStatus(shopTaxMessage, "Saving tax defaults…", "");
        const { error } = await client.from("shops")
            .update({
                default_taxable: shopDefaultTaxable.checked,
                default_tax_rate: Number(shopDefaultTaxRate.value),
                updated_at: new Date().toISOString()
            })
            .eq("id", context.shopId);

        if (error) {
            setStatus(shopTaxMessage, `Could not save tax defaults: ${error.message}`, "error");
        } else {
            setStatus(shopTaxMessage, "Shop tax defaults saved.", "success");
        }
        saveShopTax.disabled = false;
    });

    customerTaxForm.addEventListener("submit", async function (event) {
        event.preventDefault();
        const customer = customerTaxRecords.get(customerTaxCustomer.value);
        if (!canManageShop() || !customer) {
            setStatus(customerTaxMessage, "Select a customer and confirm owner or admin access.", "error");
            return;
        }

        const file = exemptionFile.files[0];
        const allowedCertificateTypes = ["application/pdf", "image/jpeg", "image/png"];
        if (file && !allowedCertificateTypes.includes(file.type)) {
            setStatus(customerTaxMessage, "Certificate must be a PDF, JPG, or PNG.", "error");
            return;
        }
        if (file && file.size > 10 * 1024 * 1024) {
            setStatus(customerTaxMessage, "Certificate files must be 10 MB or smaller.", "error");
            return;
        }

        saveCustomerTax.disabled = true;
        setStatus(customerTaxMessage, "Saving customer tax setting…", "");
        let certificatePath = customer.tax_exemption_certificate_path || null;
        let uploadedPath = null;

        if (file) {
            const extension = file.name.split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
            uploadedPath = `${context.shopId}/${customer.id}/${crypto.randomUUID()}.${extension}`;
            const upload = await client.storage.from("customer-tax-certificates")
                .upload(uploadedPath, file, { contentType: file.type, upsert: false });
            if (upload.error) {
                setStatus(customerTaxMessage, `Certificate upload failed: ${upload.error.message}`, "error");
                saveCustomerTax.disabled = false;
                return;
            }
            certificatePath = uploadedPath;
        }

        const isExempt = customerTaxStatus.value === "exempt";
        const update = {
            shop_id: context.shopId,
            customer_id: customer.id,
            tax_status: customerTaxStatus.value,
            exemption_reason: isExempt ? (exemptionReason.value.trim() || null) : null,
            exemption_certificate_number: isExempt ? (exemptionNumber.value.trim() || null) : null,
            exemption_certificate_path: isExempt ? certificatePath : null,
            updated_at: new Date().toISOString()
        };
        const { data: profile, error } = await client.from("customer_tax_profiles")
            .upsert(update, { onConflict: "customer_id" })
            .select("customer_id, tax_status, exemption_reason, exemption_certificate_number, exemption_certificate_path")
            .single();

        if (error) {
            if (uploadedPath) {
                await client.storage.from("customer-tax-certificates").remove([uploadedPath]);
            }
            setStatus(customerTaxMessage, `Could not save customer tax setting: ${error.message}`, "error");
            saveCustomerTax.disabled = false;
            return;
        }

        const data = {
            id: customer.id,
            name: customer.name,
            tax_status: profile.tax_status,
            tax_exemption_reason: profile.exemption_reason,
            tax_exemption_certificate_number: profile.exemption_certificate_number,
            tax_exemption_certificate_path: profile.exemption_certificate_path
        };
        if (customer.tax_exemption_certificate_path && customer.tax_exemption_certificate_path !== data.tax_exemption_certificate_path) {
            await client.storage.from("customer-tax-certificates").remove([customer.tax_exemption_certificate_path]);
        }
        customerTaxRecords.set(String(data.id), data);
        fillCustomerTax(data);
        setStatus(customerTaxMessage, "Customer tax setting saved.", "success");
        saveCustomerTax.disabled = false;
    });

    setupTimezones();
    loadProfile().catch(function (error) {
        console.error("Shop Profile failed to initialize:", error);
        setMessage(`Shop Profile failed to initialize: ${error.message}`, "error");
        setEditable(false);
    });
})();
