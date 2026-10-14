const supabaseClient = window.trackRightSupabase;

/* =========================
   APP CONFIGURATION
========================= */

const appMode = "shop";




let selectedCustomerId = null;
let editingCustomerId = null;
let editingCustomerUnitId = null;
let currentShopId = null;


/* =========================
   REPAIR ORDER FORM ELEMENTS
========================= */

const newRepairOrderForm =
    document.getElementById(
        "new-repair-order-form"
    );

const cancelNewRepairOrderButton =
    document.getElementById(
        "cancel-new-repair-order"
    );

const newCustomerInput =
    document.getElementById(
        "new-customer"
    );

const newUnitInput =
    document.getElementById(
        "new-unit"
    );

const newPriorityInput =
    document.getElementById(
        "new-priority"
    );

const newTechnicianInput =
    document.getElementById(
        "new-technician"
    );

const newComplaintInput =
    document.getElementById(
        "new-complaint"
    );


/* =========================
   CUSTOMER FORM ELEMENTS
========================= */

const addCustomerButton =
    document.getElementById(
        "add-customer-button"
    );

const addCustomerForm =
    document.getElementById(
        "add-customer-form"
    );

const closeCustomerFormButton =
    document.getElementById(
        "close-customer-form"
    );

const cancelCustomerFormButton =
    document.getElementById(
        "cancel-customer-form"
    );

const customerFormTitle =
    document.getElementById(
        "customer-form-title"
    );

const saveCustomerButton =
    document.getElementById(
        "save-customer-button"
    );

const customerSaveMessage =
    document.getElementById(
        "customer-save-message"
    );

const customerNameInput =
    document.getElementById(
        "customer-name"
    );

const customerContactInput =
    document.getElementById(
        "customer-contact"
    );

const customerPhoneInput =
    document.getElementById(
        "customer-phone"
    );

const customerEmailInput =
    document.getElementById(
        "customer-email"
    );

const customerNotesInput =
    document.getElementById(
        "customer-notes"
    );


/* =========================
   CUSTOMER SEARCH ELEMENTS
========================= */

const customerSearchInput =
    document.getElementById(
        "customer-search-input"
    );

const customerSearchResults =
    document.getElementById(
        "customer-search-results"
    );

const customerResultsList =
    document.getElementById(
        "customer-results-list"
    );

const closeCustomerSearchButton =
    document.getElementById(
        "close-customer-search"
    );


/* =========================
   CUSTOMER RECORD ELEMENTS
========================= */

const customerRecordPanel =
    document.getElementById(
        "customer-record-panel"
    );

const customerRecordName =
    document.getElementById(
        "customer-record-name"
    );

const customerRecordContact =
    document.getElementById(
        "customer-record-contact"
    );

const customerRecordPhone =
    document.getElementById(
        "customer-record-phone"
    );

const customerRecordEmail =
    document.getElementById(
        "customer-record-email"
    );

const customerRecordNotes =
    document.getElementById(
        "customer-record-notes"
    );

const closeCustomerRecordButton =
    document.getElementById(
        "close-customer-record"
    );

const editCustomerButton =
    document.getElementById(
        "edit-customer-button"
    );

const startCustomerRepairOrderButton =
    document.getElementById(
        "start-customer-repair-order"
    );

const customerRepairHistory =
    document.getElementById(
        "customer-repair-history"
    );


/* =========================
   CUSTOMER UNIT ELEMENTS
========================= */

const addCustomerUnitButton =
    document.getElementById(
        "add-customer-unit-button"
    );

const addCustomerUnitForm =
    document.getElementById(
        "add-customer-unit-form"
    );

const cancelCustomerUnitButton =
    document.getElementById(
        "cancel-customer-unit-button"
    );

const customerUnitList =
    document.getElementById(
        "customer-unit-list"
    );



const customerUnitYearInput =
    document.getElementById(
        "customer-unit-year"
    );

const customerUnitMakeInput =
    document.getElementById(
        "customer-unit-make"
    );

const customerUnitModelInput =
    document.getElementById(
        "customer-unit-model"
    );

const customerUnitSerialInput =
    document.getElementById(
        "customer-unit-serial"
    );

const customerUnitEngineMakeInput =
    document.getElementById(
        "customer-unit-engine-make"
    );

const customerUnitEngineModelInput =
    document.getElementById(
        "customer-unit-engine-model"
    );

const customerUnitFuelTypeInput =
    document.getElementById(
        "customer-unit-fuel-type"
    );

const customerUnitDisplacementInput =
    document.getElementById(
        "customer-unit-displacement"
    );

const customerUnitFormTitle =
    document.getElementById(
        "customer-unit-form-title"
    );

const saveCustomerUnitButton =
    document.getElementById(
        "save-customer-unit-button"
    );

const customerUnitSaveMessage =
    document.getElementById(
        "customer-unit-save-message"
    );

const customerDirectoryList =
    document.getElementById("customer-directory-list");

const customerCount =
    document.getElementById("customer-count");

const customerVehicleCount =
    document.getElementById("customer-vehicle-count");

const customerOpenRoCount =
    document.getElementById("customer-open-ro-count");

const customerArTotal =
    document.getElementById("customer-ar-total");


/* =========================
   GENERAL HELPERS
========================= */


function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}


/* =========================
   CUSTOMER STORAGE
========================= */





/* =========================
   CUSTOMER DIRECTORY
========================= */

async function getCurrentShopId() {
    const context = await window.trackRightAuthReady;
    currentShopId = context.shopId;
    if (!currentShopId) throw new Error('No active shop was found.');
    return currentShopId;
}

async function renderCustomerDirectory() {
    return window.shopCustomerDesk.directory(openCustomerRecord);
}

function openCustomerForm() {
    editingCustomerId = null;
    saveCustomerButton.disabled = false;

    addCustomerForm.reset();

    customerFormTitle.textContent =
        "Add Customer";

    saveCustomerButton.textContent =
        "Save Customer";

    customerRecordPanel.hidden = true;
    customerSearchResults.hidden = true;

    addCustomerForm.hidden = false;
    customerSaveMessage.textContent = "";

    customerNameInput.focus();
}

function closeCustomerForm() {
    addCustomerForm.hidden = true;
    addCustomerForm.reset();
    saveCustomerButton.disabled = false;

    editingCustomerId = null;

    customerFormTitle.textContent =
        "Add Customer";

    saveCustomerButton.textContent =
        "Save Customer";

    customerSaveMessage.textContent = "";
}

addCustomerButton.addEventListener(
    "click",
    openCustomerForm
);

closeCustomerFormButton.addEventListener(
    "click",
    closeCustomerForm
);

cancelCustomerFormButton.addEventListener(
    "click",
    closeCustomerForm
);

addCustomerForm.addEventListener(
    "submit",
    async function (event) {
        event.preventDefault();
        console.log("SUPABASE CUSTOMER SUBMIT FIRED");

        const customerName =
            customerNameInput.value.trim();

        const contactName =
            customerContactInput.value.trim();

        const phone =
            customerPhoneInput.value.trim();

        const email =
            customerEmailInput.value.trim();

        const notes =
            customerNotesInput.value.trim();

        saveCustomerButton.disabled = true;
        customerSaveMessage.textContent = "Saving customer…";

        let shopId;

        try {
            shopId = await getCurrentShopId();
        } catch (shopError) {
            console.error("Could not determine shop:", shopError);
            customerSaveMessage.textContent = shopError.message;
            saveCustomerButton.disabled = false;
            return;
        }

        if (editingCustomerId) {
            const {
                data,
                error
            } = await supabaseClient
                .from("Customers")
                .update({
                    name: customerName,
                    contact_name: contactName,
                    phone: phone,
                    email: email,
                    notes: notes,
                    updated_at:
                        new Date().toISOString()
                })
                .eq("id", editingCustomerId)
                .eq("shop_id", shopId)
                .select()
                .single();

            if (error) {
                console.error(
                    "Customer update failed:",
                    error
                );

                customerSaveMessage.textContent =
                    `Customer update failed: ${error.message}`;

                saveCustomerButton.disabled = false;

                return;
            }

            selectedCustomerId = data.id;

            const directoryRefreshed =
                await renderCustomerDirectory();

            if (!directoryRefreshed) {
                customerSaveMessage.textContent =
                    "Customer updated, but the directory could not refresh. Reload the page to see the change.";
                saveCustomerButton.disabled = false;
                return;
            }

            customerSaveMessage.textContent =
                `${customerName} was updated successfully.`;

            setTimeout(
                function () {
                    closeCustomerForm();

                    openCustomerRecord(
                        selectedCustomerId
                    );

                    saveCustomerButton.disabled = false;
                },
                700
            );

            return;
        }

        const {
            data,
            error
        } = await supabaseClient
            .from("Customers")
            .insert({
                shop_id: shopId,
                name: customerName,
                contact_name: contactName,
                phone: phone,
                email: email,
                notes: notes,
                archived: false
            })
            .select()
            .single();

        if (error) {
            console.error(
                "Customer save failed:",
                error
            );

            customerSaveMessage.textContent =
                `Customer save failed: ${error.message}`;

            saveCustomerButton.disabled = false;

            return;
        }

        console.log(
            "Customer saved to Supabase:",
            data
        );

        const directoryRefreshed =
            await renderCustomerDirectory();

        if (!directoryRefreshed) {
            customerSaveMessage.textContent =
                "Customer saved, but the directory could not refresh. Reload the page to see the new customer.";
            saveCustomerButton.disabled = false;
            return;
        }

        customerSaveMessage.textContent =
            `${customerName} was saved and added to the directory.`;

        setTimeout(
            function () {
                closeCustomerForm();
                saveCustomerButton.disabled = false;
            },
            700
        );
    }
);


     

/* =========================
   CUSTOMER SEARCH
========================= */

function closeCustomerSearch() {
    customerSearchResults.hidden = true;
    customerResultsList.innerHTML = '';
}
closeCustomerSearchButton.addEventListener('click', closeCustomerSearch);
window.shopCustomerDesk.initialize(openCustomerRecord);

/* =========================
   CUSTOMER RECORD
========================= */

let customerRecordRequest = 0;
async function openCustomerRecord(
    customerId
) {
    const request = ++customerRecordRequest;
    window.shopCustomerDesk.cancelActivity();
    customerRecordPanel.hidden = true;
    selectedCustomerId = null;
    const shopId = await getCurrentShopId();
    const {
        data: customer,
        error
    } = await supabaseClient
        .from("Customers")
        .select("*")
        .eq("id", customerId)
        .eq("shop_id", shopId)
        .eq("archived", false)
        .single();
    if (request !== customerRecordRequest) return;

    if (error || !customer) {
        console.error(
            "Customer could not be found:",
            customerId,
            error
        );

        return;
    }

    selectedCustomerId = customer.id;

    customerRecordName.textContent =
        customer.name;

    customerRecordContact.textContent =
        customer.contact_name || "—";

    customerRecordPhone.textContent =
        customer.phone || "—";

    customerRecordEmail.textContent =
        customer.email || "—";

    customerRecordNotes.textContent =
        customer.notes ||
        "No notes added.";

    customerSearchResults.hidden = true;

    renderCustomerUnits();
    renderCustomerRepairHistory();

    customerRecordPanel.hidden = false;
    customerRecordName.focus({ preventScroll: true });
    customerRecordPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}
function closeCustomerRecord() {
    ++customerRecordRequest;
    window.shopCustomerDesk.cancelActivity();
    customerRecordPanel.hidden = true;
    selectedCustomerId = null;
    customerSearchInput.focus({ preventScroll: true });
    customerSearchInput.scrollIntoView({ behavior: "smooth", block: "center" });
}

closeCustomerRecordButton.addEventListener(
    "click",
    closeCustomerRecord
);

editCustomerButton.addEventListener(
    "click",
    async function () {

        console.log(
            "Editing customer ID:",
            selectedCustomerId
        );
        const {
            data: customer,
            error
        } = await supabaseClient
            .from("Customers")
            .select("*")
            .eq("id", selectedCustomerId)
            .single();

        if (error || !customer) {
            console.error(
                "Could not load customer for editing:",
                selectedCustomerId,
                error
            );

            return;
        }

        editingCustomerId =
            customer.id;

        customerNameInput.value =
            customer.name || "";

        customerContactInput.value =
            customer.contact_name || "";

        customerPhoneInput.value =
            customer.phone || "";

        customerEmailInput.value =
            customer.email || "";

        customerNotesInput.value =
            customer.notes || "";

        customerFormTitle.textContent =
            "Edit Customer";

        saveCustomerButton.textContent =
            "Update Customer";

        customerSaveMessage.textContent =
            "";

        customerRecordPanel.hidden = true;
        addCustomerForm.hidden = false;

        customerNameInput.focus();
    }
);

/* =========================
   CUSTOMER UNITS
========================= */

function populateCustomerUnitDropdown(customer) {
    newUnitInput.innerHTML = `
        <option value="">
            Select a Vehicle
        </option>
    `;

    const units = Array.isArray(customer.units)
        ? customer.units.filter(function (unit) {
            return unit.archived !== true;
        })
        : [];

    units.forEach(function (unit) {
        const option =
            document.createElement("option");

        option.value = unit.id;

        const vehicleDescription = [
            unit.year,
            unit.make,
            unit.model
        ]
            .filter(Boolean)
            .join(" ");

        option.textContent =
            vehicleDescription || "Unnamed Vehicle";

        newUnitInput.appendChild(option);
    });
}

async function renderCustomerUnits() {
    const requestedCustomerId = selectedCustomerId;
    customerUnitList.innerHTML = "";

    if (!selectedCustomerId) {
        return false;
    }

    let shopId;

    try {
        shopId = await getCurrentShopId();
    } catch (shopError) {
        console.error(
            "Could not determine shop:",
            shopError
        );

        customerUnitList.innerHTML = `
            <p class="customer-search-empty">
                ${escapeHtml(shopError.message)}
            </p>
        `;

        return false;
    }

    const {
        data: unitsData,
        error
    } = await supabaseClient
        .from("customer_units")
        .select("*")
        .eq("shop_id", shopId)
        .eq("customer_id", requestedCustomerId)
        .eq("archived", false)
        .order("created_at");

    if (requestedCustomerId !== selectedCustomerId) return false;
    if (error) {
        console.error(
            "Could not load customer units:",
            error
        );

        customerUnitList.innerHTML = `
            <p class="customer-search-empty">
                Could not load units: ${escapeHtml(error.message)}
            </p>
        `;

        return false;
    }

    const units =
        unitsData.map(function (unit) {
            return {
                id: unit.id,
                year: unit.year,
                make: unit.make,
                model: unit.model,
                serial: unit.serial,
                engineMake: unit.engine_make,
                engineModel: unit.engine_model,
                fuelType: unit.fuel_type,
                displacement: unit.displacement,
                archived: unit.archived
            };
        });

    if (units.length === 0) {
        customerUnitList.innerHTML = `
            <p class="customer-search-empty">
                No units have been added
                for this customer.
            </p>
        `;

        return true;
    }

    units.forEach(
        function (unit) {
            const unitCard =
                document.createElement(
                    "article"
                );

            unitCard.className =
                "customer-unit-card";

            unitCard.tabIndex = 0;

            unitCard.dataset.unitId =
                unit.id;

            const unitTitle = [
                unit.year,
                unit.make,
                unit.model
            ]
                .filter(Boolean)
                .join(" ");

            const unitDescription = [
                unit.year,
                unit.make,
                unit.model
            ]
                .filter(Boolean)
                .join(" ");

            unitCard.innerHTML = `
                <div class="customer-unit-card-heading">
                    <strong>
                        ${escapeHtml(
                unitTitle ||
                "Unnamed Unit"
            )}
                    </strong>

                    <span>Edit</span>
                </div>

                ${unitDescription
                    ? `
                        <p>
                            ${escapeHtml(
                        unitDescription
                    )}
                        </p>
                    `
                    : ""
                }

                ${unit.serial
                    ? `
                        <p>
                            VIN/Serial:
                            ${escapeHtml(
                        unit.serial
                    )}
                        </p>
                    `
                    : ""
                }

                ${unit.engineMake ||
                    unit.engineModel
                    ? `
                        <p>
                            Engine:
                            ${escapeHtml(
                        [
                            unit.engineMake,
                            unit.engineModel
                        ]
                            .filter(Boolean)
                            .join(" ")
                    )}
                        </p>
                    `
                    : ""
                }

                ${unit.fuelType ||
                    unit.displacement
                    ? `
                        <p>
                            ${escapeHtml(
                        [
                            unit.fuelType,
                            unit.displacement
                        ]
                            .filter(Boolean)
                            .join(" • ")
                    )}
                        </p>
                    `
                    : ""
                }
            `;

            unitCard.addEventListener(
                "click",
                function () {
                    openEditCustomerUnitForm(
                        unit.id
                    );
                }
            );

            unitCard.addEventListener(
                "keydown",
                function (event) {
                    if (
                        event.key === "Enter" ||
                        event.key === " "
                    ) {
                        event.preventDefault();

                        openEditCustomerUnitForm(
                            unit.id
                        );
                    }
                }
            );

            customerUnitList.appendChild(
                unitCard
            );
        }
    );

    return true;
}

/* =========================
   CUSTOMER REPAIR HISTORY
========================= */

function renderCustomerRepairHistory() {
    if (selectedCustomerId) return window.shopCustomerDesk.activity(selectedCustomerId);
}
/* =========================
   CUSTOMER UNIT FORM
========================= */

function openCustomerUnitForm() {
    if (!selectedCustomerId) {
        return;
    }

    editingCustomerUnitId = null;
    saveCustomerUnitButton.disabled = false;

    addCustomerUnitForm.reset();
    customerUnitSaveMessage.textContent = "";

    customerUnitFormTitle.textContent =
        "Add Customer Unit";

    saveCustomerUnitButton.textContent =
        "Save Unit";

    addCustomerUnitForm.hidden = false;

    customerUnitYearInput.focus();
}

async function openEditCustomerUnitForm(
    unitId
) {
    const {
        data: unit,
        error
    } = await supabaseClient
        .from("customer_units")
        .select("*")
        .eq("id", unitId)
        .eq("customer_id", selectedCustomerId)
        .single();

    if (error || !unit) {
        console.error(
            "Could not load unit for editing:",
            unitId,
            error
        );

        return;
    }

    editingCustomerUnitId = unit.id;

    customerUnitYearInput.value =
        unit.year || "";

    customerUnitMakeInput.value =
        unit.make || "";

    customerUnitModelInput.value =
        unit.model || "";

    customerUnitSerialInput.value =
        unit.serial || "";

    customerUnitEngineMakeInput.value =
        unit.engine_make || "";

    customerUnitEngineModelInput.value =
        unit.engine_model || "";

    customerUnitFuelTypeInput.value =
        unit.fuel_type || "";

    customerUnitDisplacementInput.value =
        unit.displacement || "";

    customerUnitFormTitle.textContent =
        "Edit Customer Unit";

    saveCustomerUnitButton.textContent =
        "Update Unit";

    addCustomerUnitForm.hidden = false;

    addCustomerUnitForm.scrollIntoView({
        behavior: "smooth",
        block: "nearest"
    });

    customerUnitYearInput.focus();
}

function closeCustomerUnitForm() {
    addCustomerUnitForm.hidden = true;

    addCustomerUnitForm.reset();
    saveCustomerUnitButton.disabled = false;
    customerUnitSaveMessage.textContent = "";

    editingCustomerUnitId = null;

    customerUnitFormTitle.textContent =
        "Add Customer Unit";

    saveCustomerUnitButton.textContent =
        "Save Unit";
}

addCustomerUnitButton.addEventListener(
    "click",
    openCustomerUnitForm
);

cancelCustomerUnitButton.addEventListener(
    "click",
    closeCustomerUnitForm
);

addCustomerUnitForm.addEventListener(
    "submit",
    async function (event) {
        event.preventDefault();

        const customerId = selectedCustomerId;

        if (!customerId) {
            customerUnitSaveMessage.textContent =
                "Select a customer before saving a unit.";
            return;
        }

        saveCustomerUnitButton.disabled = true;
        customerUnitSaveMessage.textContent =
            editingCustomerUnitId
                ? "Updating unit…"
                : "Saving unit…";

        let shopId;

        try {
            shopId = await getCurrentShopId();
        } catch (shopError) {
            console.error(
                "Could not determine shop:",
                shopError
            );

            customerUnitSaveMessage.textContent =
                shopError.message;
            saveCustomerUnitButton.disabled = false;
            return;
        }

        const {
            data: customer,
            error: customerError
        } = await supabaseClient
            .from("Customers")
            .select("id")
            .eq("id", customerId)
            .eq("shop_id", shopId)
            .eq("archived", false)
            .maybeSingle();

        if (customerError || !customer) {
            console.error(
                "Could not validate unit customer:",
                customerError
            );

            customerUnitSaveMessage.textContent =
                customerError
                    ? `Could not validate customer: ${customerError.message}`
                    : "This customer is not active in your shop.";
            saveCustomerUnitButton.disabled = false;
            return;
        }

        const unitValues = {
            year:
                customerUnitYearInput
                    .value
                    .trim(),

            make:
                customerUnitMakeInput
                    .value
                    .trim(),

            model:
                customerUnitModelInput
                    .value
                    .trim(),

            serial:
                customerUnitSerialInput
                    .value
                    .trim(),

            engine_make:
                customerUnitEngineMakeInput
                    .value,

            engine_model:
                customerUnitEngineModelInput
                    .value
                    .trim(),

            fuel_type:
                customerUnitFuelTypeInput
                    .value,

            displacement:
                customerUnitDisplacementInput
                    .value
                    .trim()
        };

        if (editingCustomerUnitId) {
            const {
                data: updatedUnit,
                error
            } = await supabaseClient
                .from("customer_units")
                .update({
                    ...unitValues,
                    updated_at:
                        new Date().toISOString()
                })
                .eq(
                    "id",
                    editingCustomerUnitId
                )
                .eq(
                    "customer_id",
                    customerId
                )
                .eq("shop_id", shopId)
                .select()
                .single();

            if (error || !updatedUnit) {
                console.error(
                    "Unit update failed:",
                    error
                );

                customerUnitSaveMessage.textContent =
                    `Unit update failed: ${error?.message || "No unit was updated."}`;
                saveCustomerUnitButton.disabled = false;
                return;
            }
        } else {
            const {
                data: savedUnit,
                error
            } = await supabaseClient
                .from("customer_units")
                .insert({
                    shop_id: shopId,

                    customer_id: customerId,

                    ...unitValues,

                    archived: false
                })
                .select()
                .single();

            if (error || !savedUnit) {
                console.error(
                    "Unit save failed:",
                    error
                );

                customerUnitSaveMessage.textContent =
                    `Unit save failed: ${error?.message || "No unit was created."}`;
                saveCustomerUnitButton.disabled = false;
                return;
            }
        }

        const [unitsRefreshed, directoryRefreshed] = await Promise.all([
            renderCustomerUnits(),
            renderCustomerDirectory()
        ]);

        if (!unitsRefreshed || !directoryRefreshed) {
            customerUnitSaveMessage.textContent =
                "Unit saved, but the page could not refresh. Reload to see the change.";
            saveCustomerUnitButton.disabled = false;
            return;
        }

        customerUnitSaveMessage.textContent =
            editingCustomerUnitId
                ? "Unit updated successfully."
                : "Unit saved and added to this customer.";

        setTimeout(
            closeCustomerUnitForm,
            700
        );
    }
);


/* =========================
   START REPAIR ORDER
========================= */

async function populateTechnicianOptions() {
    try {
        await window.trackRightAuthReady;
        const { data, error } = await supabaseClient.rpc(
            "list_shop_schedule_members"
        );
        if (error) throw error;

        newTechnicianInput.innerHTML =
            '<option value="Unassigned">Unassigned</option>';
        (data || []).forEach(function (member) {
            if (!member.email) return;
            const option = document.createElement("option");
            option.value = member.email;
            option.textContent = member.email;
            newTechnicianInput.appendChild(option);
        });
    } catch (error) {
        console.error("Could not load active technicians:", error);
        newTechnicianInput.innerHTML =
            '<option value="Unassigned">Unassigned</option>';
    }
}

function openNewRepairOrderForm() {
    newRepairOrderForm.hidden = false;

    newRepairOrderForm.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });

    setTimeout(
        function () {
            newCustomerInput.focus();
        },
        250
    );
}

function closeNewRepairOrderForm() {
    newRepairOrderForm.reset();

    newRepairOrderForm.hidden = true;
}

startCustomerRepairOrderButton.addEventListener(
    "click",
    async function () {
        const shopId = await getCurrentShopId();
        const [customerResult, unitResult] = await Promise.all([
            supabaseClient.from("Customers").select("*")
                .eq("id", selectedCustomerId)
                .eq("shop_id", shopId)
                .eq("archived", false)
                .single(),
            supabaseClient.from("customer_units").select("*")
                .eq("shop_id", shopId)
                .eq("customer_id", selectedCustomerId)
                .eq("archived", false)
                .order("created_at")
        ]);
        const selectedCustomer = customerResult.data;
        const error = customerResult.error || unitResult.error;

        if (error) {
            console.error(
                "Could not load selected customer:",
                error
            );

            return;
        }

        if (!selectedCustomer) {
            console.error(
                "Could not find selected customer:",
                selectedCustomerId
            );

            return;
        }

        newRepairOrderForm.reset();
        newPriorityInput.value = (await window.trackRightShopBehavior).default_ro_priority;
        await populateTechnicianOptions();

        newCustomerInput.value =
            selectedCustomer.name;

        populateCustomerUnitDropdown({
            units: unitResult.data || []
        });

        customerRecordPanel.hidden = true;
        customerSearchResults.hidden = true;
        addCustomerForm.hidden = true;

        openNewRepairOrderForm();
    }
);

cancelNewRepairOrderButton.addEventListener(
    "click",
    closeNewRepairOrderForm
);

newRepairOrderForm.addEventListener(
    "submit",
    async function (event) {
        event.preventDefault();
        const submitButton = newRepairOrderForm.querySelector('[type="submit"]');
        submitButton.disabled = true;

        const selectedUnitOption =
            newUnitInput.options[
            newUnitInput.selectedIndex
            ];

        const newRepairOrder = {
            customerId:
                selectedCustomerId || "",

            customer:
                newCustomerInput
                    .value
                    .trim(),

            unitId:
                newUnitInput.value,

            unit:
                selectedUnitOption
                    ? selectedUnitOption
                        .textContent
                        .trim()
                    : "",

            status:
                "Open",

            priority:
                newPriorityInput.value,

            technician:
                newTechnicianInput.value,

            complaint:
                newComplaintInput
                    .value
                    .trim(),

            partsNeeded:
                "",

            customerNotes:
                "",

            technicianNotes:
                "",

            laborHours:
                0,

            additionalTechnician:
                "",

            additionalWorkPerformed:
                "",

            archived:
                false,

            appMode:
                appMode
        };

        try {
            const savedOrder = await window.trackRightRepairOrders.create(newRepairOrder);
            window.location.href =
                `repair-order-details.html?id=${encodeURIComponent(savedOrder.id)}`;
        } catch (error) {
            console.error("Could not create repair order:", error);
            alert(error?.message || "Could not save this repair order. Please retry.");
            submitButton.disabled = false;
        }
    }
);

async function initializeCustomerDirectory() {
    await renderCustomerDirectory();
}
initializeCustomerDirectory();
