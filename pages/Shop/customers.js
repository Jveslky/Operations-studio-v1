const supabaseClient = window.trackRightSupabase;

/* =========================
   APP CONFIGURATION
========================= */

const appMode = "shop";



const repairOrders = [];
const customerInvoices = [];

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





function getInvoices() {
    return customerInvoices;
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



/* =========================
   CUSTOMER DIRECTORY
========================= */

function getCustomerOpenRepairOrders(customerId) {
    return Array.from(
        getAllRepairOrders().values()
    ).filter(function (order) {
        return (
            order.customerId === customerId &&
            order.archived !== true &&
            order.status !== "Complete"
        );
    });
}

async function getCurrentShopId() {
    if (currentShopId) {
        return currentShopId;
    }

    const {
        data: { user },
        error: userError
    } = await supabaseClient.auth.getUser();

    if (userError || !user) {
        throw new Error("You must be logged in to load customers.");
    }

    const {
        data: membership,
        error: membershipError
    } = await supabaseClient
        .from("shop_members")
        .select("shop_id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

    if (membershipError || !membership) {
        throw new Error(
            membershipError?.message ||
            "No shop membership was found for this account."
        );
    }

    currentShopId = membership.shop_id;
    return currentShopId;
}

async function renderCustomerDirectory() {
    let shopId;

    try {
        shopId = await getCurrentShopId();
    } catch (error) {
        console.error("Could not determine shop:", error);
        customerDirectoryList.innerHTML = `
            <p class="customer-directory-empty">
                ${escapeHtml(error.message)}
            </p>
        `;
        return false;
    }

    const [customerResult, unitResult] = await Promise.all([
        supabaseClient.from("Customers").select("*")
            .eq("shop_id", shopId).eq("archived", false).order("name"),
        supabaseClient.from("customer_units").select("*")
            .eq("shop_id", shopId).eq("archived", false).order("created_at")
    ]);

    if (customerResult.error || unitResult.error) {
        const error = customerResult.error || unitResult.error;
        console.error(
            "Could not load customer directory:",
            error
        );
        customerDirectoryList.innerHTML = `
            <p class="customer-directory-empty">
                Could not load customer records: ${escapeHtml(error.message)}
            </p>
        `;
        return false;
    }

    const unitsByCustomer = new Map();
    (unitResult.data || []).forEach(function (unit) {
        const key = String(unit.customer_id);
        if (!unitsByCustomer.has(key)) unitsByCustomer.set(key, []);
        unitsByCustomer.get(key).push({
            id: unit.id, year: unit.year, make: unit.make, model: unit.model,
            serial: unit.serial, engineMake: unit.engine_make,
            engineModel: unit.engine_model, fuelType: unit.fuel_type,
            displacement: unit.displacement, archived: unit.archived
        });
    });

    const customers =
        (customerResult.data || []).map(function (customer) {
            return {
                id: customer.id,
                name: customer.name,
                contactName: customer.contact_name,
                phone: customer.phone,
                email: customer.email,
                notes: customer.notes,
                archived: customer.archived,
                createdAt: customer.created_at,
                updatedAt: customer.updated_at,

                units: unitsByCustomer.get(String(customer.id)) || []
            };
        });

    const repairOrders =
        Array.from(getAllRepairOrders().values());

    const invoices = getInvoices();

    const outstandingAmount =
        invoices
            .filter(function (invoice) {
                if (invoice.status === "Paid") {
                    return false;
                }

                if (invoice.status === "Draft") {
                    return false;
                }

                return invoice.status === "Sent";
            })
            .reduce(function (total, invoice) {
                return (
                    total +
                    (Number(invoice.total) || 0)
                );
            }, 0);

    customerDirectoryList.innerHTML = "";

    const totalVehicles =
        customers.reduce(function (total, customer) {
            const vehicles =
                Array.isArray(customer.units)
                    ? customer.units.filter(function (unit) {
                        return unit.archived !== true;
                    })
                    : [];

            return total + vehicles.length;
        }, 0);

    const openRepairOrders =
        repairOrders.filter(function (order) {
            return (
                order.archived !== true &&
                order.status !== "Complete"
            );
        });

    customerCount.textContent =
        customers.length;

    customerVehicleCount.textContent =
        totalVehicles;

    customerOpenRoCount.textContent =
        openRepairOrders.length;

    customerArTotal.textContent =
        formatCurrency(outstandingAmount);

    if (customers.length === 0) {
        customerDirectoryList.innerHTML = `
            <p class="customer-directory-empty">
                No customers added yet.
            </p>
        `;

        return true;
    }

    customers
        .sort(function (a, b) {
            return (a.name || "")
                .localeCompare(b.name || "");
        })
        .forEach(function (customer) {

            const vehicles =
                Array.isArray(customer.units)
                    ? customer.units.filter(function (unit) {
                        return unit.archived !== true;
                    })
                    : [];

            const openOrders =
                getCustomerOpenRepairOrders(
                    customer.id
                );

            const customerOrders =
                repairOrders
                    .filter(function (order) {
                        return (
                            order.customerId === customer.id &&
                            order.archived !== true
                        );
                    })
                    .sort(function (a, b) {
                        return (
                            Number(b.id) -
                            Number(a.id)
                        );
                    });

            const latestOrder =
                customerOrders[0] || null;

            const card =
                document.createElement("article");

            card.className =
                "customer-directory-card";

            card.tabIndex = 0;
            card.setAttribute(
                "role",
                "button"
            );

            card.innerHTML = `
                <div class="customer-directory-card-main">
                    <div>
                        <h3>
                            ${escapeHtml(customer.name)}
                        </h3>

                        <p class="customer-directory-contact">
                            ${customer.contactName
                    ? escapeHtml(customer.contactName)
                    : "No contact name"
                }
                            ${customer.phone
                    ? ` • ${escapeHtml(customer.phone)}`
                    : ""
                }
                        </p>

                        ${customer.email
                    ? `
                                    <p class="customer-directory-email">
                                        ${escapeHtml(customer.email)}
                                    </p>
                                `
                    : ""
                }
                    </div>

                    <div class="customer-directory-stats">
                        <span>
                            <strong>${vehicles.length}</strong>
                            Vehicles
                        </span>

                        <span>
                            <strong>${openOrders.length}</strong>
                            Open RO
                        </span>
                    </div>
                </div>

                <div class="customer-directory-card-footer">
                    ${latestOrder
                    ? `
                                <span>
                                    Latest:
                                    RO #${escapeHtml(latestOrder.id)}
                                    •
                                    ${escapeHtml(
                        latestOrder.status || "Open"
                    )}
                                </span>
                            `
                    : `
                                <span>No repair history</span>
                            `
                }
            `;

            function openRecord() {
                openCustomerRecord(
                    customer.id
                );
            }

            card.addEventListener(
                "click",
                openRecord
            );

            card.addEventListener(
                "keydown",
                function (event) {
                    if (
                        event.key === "Enter" ||
                        event.key === " "
                    ) {
                        event.preventDefault();
                        openRecord();
                    }
                }
            );

            customerDirectoryList.appendChild(
                card
            );
        });

    return true;
}

/* =========================
   REPAIR ORDER HELPERS
========================= */

function getCurrentRepairOrder(order) {
    return order;
}

function getAllRepairOrders() {
    const allRepairOrders = new Map();

    repairOrders.forEach(
        function (order) {
            allRepairOrders.set(
                String(order.id),
                getCurrentRepairOrder(order)
            );
        }
    );

    return allRepairOrders;
}
/* =========================
   ADD / EDIT CUSTOMER
========================= */

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

async function renderCustomerSearchResults(
    searchText
) {
    const normalizedSearch =
        searchText
            .trim()
            .toLowerCase();

    const {
        data: customers,
        error
    } = await supabaseClient
        .from("Customers")
        .select("*")
        .eq("archived", false);

    if (error) {
        console.error(
            "Could not search customers:",
            error
        );

        return;
    }

    const matchingCustomers =
        customers.filter(
            function (customer) {
                if (
                    customer.archived === true
                ) {
                    return false;
                }

                const searchableText = [
                    customer.name,
                    customer.contact_name,
                    customer.phone,
                    customer.email
                ]
                    .join(" ")
                    .toLowerCase();

                return searchableText.includes(
                    normalizedSearch
                );
            }
        );

    customerResultsList.innerHTML = "";

    if (
        matchingCustomers.length === 0
    ) {
        customerResultsList.innerHTML = `
            <p class="customer-search-empty">
                No customers found.
            </p>
        `;

        return;
    }

    matchingCustomers.forEach(
        function (customer) {
            const customerCard =
                document.createElement(
                    "article"
                );

            customerCard.className =
                "customer-result-card";

            customerCard.dataset.customerId =
                customer.id;

            customerCard.tabIndex = 0;

            customerCard.innerHTML = `
                <h3>
                    ${escapeHtml(
                customer.name
            )}
                </h3>

                ${customer.contactName
                    ? `
                            <p>
                                Contact:
                                ${escapeHtml(
                        customer.contactName
                    )}
                            </p>
                        `
                    : ""
                }

                ${customer.phone
                    ? `
                            <p>
                                Phone:
                                ${escapeHtml(
                        customer.phone
                    )}
                            </p>
                        `
                    : ""
                }

                ${customer.email
                    ? `
                            <p>
                                Email:
                                ${escapeHtml(
                        customer.email
                    )}
                            </p>
                        `
                    : ""
                }
            `;

            customerCard.addEventListener(
                "click",
                function () {
                    openCustomerRecord(
                        customer.id
                    );
                }
            );

            customerCard.addEventListener(
                "keydown",
                function (event) {
                    if (
                        event.key === "Enter" ||
                        event.key === " "
                    ) {
                        event.preventDefault();

                        openCustomerRecord(
                            customer.id
                        );
                    }
                }
            );

            customerResultsList.appendChild(
                customerCard
            );
        }
    );
}

function closeCustomerSearch() {
    customerSearchResults.hidden = true;
    customerSearchInput.value = "";
    customerResultsList.innerHTML = "";
}

customerSearchInput.addEventListener(
    "input",
    function () {
        const searchText =
            customerSearchInput
                .value
                .trim();

        if (searchText.length < 2) {
            customerSearchResults.hidden =
                true;

            customerResultsList.innerHTML =
                "";

            return;
        }

        customerRecordPanel.hidden = true;
        customerSearchResults.hidden = false;

        renderCustomerSearchResults(
            searchText
        );
    }
);

closeCustomerSearchButton.addEventListener(
    "click",
    closeCustomerSearch
);


/* =========================
   CUSTOMER RECORD
========================= */

async function openCustomerRecord(
    customerId
) {
    const {
        data: customer,
        error
    } = await supabaseClient
        .from("Customers")
        .select("*")
        .eq("id", customerId)
        .single();

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
}
function closeCustomerRecord() {
    customerRecordPanel.hidden = true;
    selectedCustomerId = null;
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
        .eq("customer_id", selectedCustomerId)
        .eq("archived", false)
        .order("created_at");

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
    customerRepairHistory.innerHTML = "";

    if (!selectedCustomerId) {
        return;
    }

    const matchingOrders =
        Array.from(
            getAllRepairOrders().values()
        ).filter(
            function (order) {
                return (
                    order.customerId ===
                    selectedCustomerId &&
                    order.archived !== true
                );
            }
        );

    if (matchingOrders.length === 0) {
        customerRepairHistory.innerHTML = `
            <p class="customer-search-empty">
                No repair orders found
                for this customer.
            </p>
        `;

        return;
    }

    matchingOrders
        .sort(
            function (
                firstOrder,
                secondOrder
            ) {
                return (
                    Number(secondOrder.id) -
                    Number(firstOrder.id)
                );
            }
        )
        .forEach(
            function (order) {
                const historyCard =
                    document.createElement(
                        "a"
                    );

                historyCard.className =
                    "customer-history-card";

                historyCard.href =
                    `repair-order-details.html?id=${order.id}`;

                historyCard.innerHTML = `
                    <div class="customer-history-card-heading">
                        <h3>
                            RO #${escapeHtml(
                    order.id
                )}
                        </h3>

                        <span class="customer-history-status">
                            ${escapeHtml(
                    order.status ||
                    "Open"
                )}
                        </span>
                    </div>

                    <p>
                        ${escapeHtml(
                    order.unit ||
                    "No unit entered"
                )}
                    </p>

                    <p>
                        ${escapeHtml(
                    order.complaint ||
                    "No complaint entered"
                )}
                    </p>
                `;

                customerRepairHistory
                    .appendChild(
                        historyCard
                    );
            }
        );
}/* =========================
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

        const unitsRefreshed =
            await renderCustomerUnits();

        if (!unitsRefreshed) {
            customerUnitSaveMessage.textContent =
                "Unit saved, but the unit list could not refresh. Reload the page to see the change.";
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
        const {
            data: selectedCustomer,
            error
        } = await supabaseClient
            .from("Customers")
            .select("*")
            .eq("id", selectedCustomerId)
            .single();

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

        newCustomerInput.value =
            selectedCustomer.name;

        populateCustomerUnitDropdown(
            selectedCustomer
        );

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
    try {
        await window.trackRightRepairOrders.migrateBrowserOrders();
        await window.trackRightInvoices.migrateBrowserInvoices();
        const [cloudOrders, cloudInvoices] = await Promise.all([
            window.trackRightRepairOrders.list(),
            window.trackRightInvoices.list()
        ]);
        repairOrders.splice(0, repairOrders.length, ...cloudOrders);
        customerInvoices.splice(0, customerInvoices.length, ...cloudInvoices);
    } catch (error) {
        console.error("Could not load customer financial history:", error);
    }

    await renderCustomerDirectory();
}

initializeCustomerDirectory();
