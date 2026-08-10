/* =========================
   APP CONFIGURATION
========================= */

const appMode = "shop";

const CUSTOMER_STORAGE_KEY =
    "track-right-customers";

const INVOICE_STORAGE_KEY = "track-right-invoices";

const repairOrders = [];

let selectedCustomerId = null;
let editingCustomerId = null;
let editingCustomerUnitId = null;


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

function safelyParseStoredValue(key) {
    const storedValue =
        localStorage.getItem(key);

    if (!storedValue) {
        return null;
    }

    try {
        return JSON.parse(storedValue);
    } catch (error) {
        console.error(
            `Could not read ${key}:`,
            error
        );

        return null;
    }
}

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

function getCustomers() {
    const customers =
        safelyParseStoredValue(
            CUSTOMER_STORAGE_KEY
        );

    return Array.isArray(customers)
        ? customers
        : [];
}

function saveCustomers(customers) {
    localStorage.setItem(
        CUSTOMER_STORAGE_KEY,
        JSON.stringify(customers)
    );
}

function getInvoices() {
    const invoices =
        safelyParseStoredValue(
            INVOICE_STORAGE_KEY
        );

    return Array.isArray(invoices)
        ? invoices
        : [];
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

function getSelectedCustomer() {
    return getCustomers().find(
        function (customer) {
            return (
                customer.id ===
                selectedCustomerId
            );
        }
    ) || null;
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

function renderCustomerDirectory() {
    const customers =
        getCustomers().filter(function (customer) {
            return customer.archived !== true;
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

        return;
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
}

/* =========================
   REPAIR ORDER HELPERS
========================= */

function getCurrentRepairOrder(order) {
    const savedOrder =
        safelyParseStoredValue(
            `repair-order-${order.id}`
        );

    return savedOrder
        ? { ...order, ...savedOrder }
        : order;
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

    for (
        let index = 0;
        index < localStorage.length;
        index++
    ) {
        const key =
            localStorage.key(index);

        if (
            !key ||
            !/^repair-order-\d+$/.test(key)
        ) {
            continue;
        }

        const storedOrder =
            safelyParseStoredValue(key);

        if (
            storedOrder &&
            storedOrder.id
        ) {
            allRepairOrders.set(
                String(storedOrder.id),
                storedOrder
            );
        }
    }

    return allRepairOrders;
}

function getNextRepairOrderId() {
    const repairOrderIds = [];

    repairOrders.forEach(
        function (order) {
            const orderId =
                Number(order.id);

            if (
                Number.isFinite(orderId)
            ) {
                repairOrderIds.push(
                    orderId
                );
            }
        }
    );

    for (
        let index = 0;
        index < localStorage.length;
        index++
    ) {
        const key =
            localStorage.key(index);

        if (
            !key ||
            !/^repair-order-\d+$/.test(key)
        ) {
            continue;
        }

        const storedId =
            Number(
                key.replace(
                    "repair-order-",
                    ""
                )
            );

        if (
            Number.isFinite(storedId)
        ) {
            repairOrderIds.push(
                storedId
            );
        }
    }

    return String(
        Math.max(
            ...repairOrderIds,
            1000
        ) + 1
    );
}/* =========================
   ADD / EDIT CUSTOMER
========================= */

function openCustomerForm() {
    editingCustomerId = null;

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
    function (event) {
        event.preventDefault();

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

        const customers = getCustomers();

        if (editingCustomerId) {
            const customerIndex =
                customers.findIndex(
                    function (customer) {
                        return (
                            customer.id ===
                            editingCustomerId
                        );
                    }
                );

            if (customerIndex === -1) {
                return;
            }

            customers[customerIndex] = {
                ...customers[customerIndex],

                name: customerName,
                contactName: contactName,
                phone: phone,
                email: email,
                notes: notes,

                updatedAt:
                    new Date().toISOString()
            };

            saveCustomers(customers);

            selectedCustomerId =
                editingCustomerId;

            customerSaveMessage.textContent =
                `${customerName} was updated successfully.`;

            setTimeout(
                function () {
                    closeCustomerForm();

                    openCustomerRecord(
                        selectedCustomerId
                    );
                },
                700
            );

            return;
        }


        const newCustomer = {
            id: crypto.randomUUID(),

            name: customerName,
            contactName: contactName,
            phone: phone,
            email: email,
            notes: notes,

            units: [],
            archived: false,

            createdAt:
                new Date().toISOString()
        };

        customers.push(newCustomer);

        saveCustomers(customers);

        renderCustomerDirectory();

        customerSaveMessage.textContent =
            `${customerName} was saved successfully.`;

        setTimeout(
            function () {
                closeCustomerForm();
            },
            700
        );
    }
);

renderCustomerDirectory();

/* =========================
   CUSTOMER SEARCH
========================= */

function renderCustomerSearchResults(
    searchText
) {
    const normalizedSearch =
        searchText
            .trim()
            .toLowerCase();

    const matchingCustomers =
        getCustomers().filter(
            function (customer) {
                if (
                    customer.archived === true
                ) {
                    return false;
                }

                const searchableText = [
                    customer.name,
                    customer.contactName,
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

function openCustomerRecord(
    customerId
) {
    const customer =
        getCustomers().find(
            function (item) {
                return (
                    item.id === customerId
                );
            }
        );

    if (!customer) {
        console.error(
            "Customer could not be found:",
            customerId
        );

        return;
    }

    selectedCustomerId = customer.id;

    customerRecordName.textContent =
        customer.name;

    customerRecordContact.textContent =
        customer.contactName || "—";

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
    function () {
        const customer =
            getSelectedCustomer();

        if (!customer) {
            return;
        }

        editingCustomerId =
            customer.id;

        customerNameInput.value =
            customer.name || "";

        customerContactInput.value =
            customer.contactName || "";

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
);/* =========================
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

function renderCustomerUnits() {
    const customer =
        getSelectedCustomer();

    customerUnitList.innerHTML = "";

    if (!customer) {
        return;
    }

    const units =
        Array.isArray(customer.units)
            ? customer.units.filter(
                function (unit) {
                    return (
                        unit.archived !== true
                    );
                }
            )
            : [];

    if (units.length === 0) {
        customerUnitList.innerHTML = `
            <p class="customer-search-empty">
                No units have been added
                for this customer.
            </p>
        `;

        return;
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

    addCustomerUnitForm.reset();

    customerUnitFormTitle.textContent =
        "Add Customer Unit";

    saveCustomerUnitButton.textContent =
        "Save Unit";

    addCustomerUnitForm.hidden = false;

    customerUnitYearInput.focus();
}

function openEditCustomerUnitForm(
    unitId
) {
    const customer =
        getSelectedCustomer();

    if (
        !customer ||
        !Array.isArray(customer.units)
    ) {
        return;
    }

    const unit =
        customer.units.find(
            function (item) {
                return item.id === unitId;
            }
        );

    if (!unit) {
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
        unit.engineMake || "";

    customerUnitEngineModelInput.value =
        unit.engineModel || "";

    customerUnitFuelTypeInput.value =
        unit.fuelType || "";

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
    function (event) {
        event.preventDefault();

        const customers =
            getCustomers();

        const customerIndex =
            customers.findIndex(
                function (customer) {
                    return (
                        customer.id ===
                        selectedCustomerId
                    );
                }
            );

        if (customerIndex === -1) {
            return;
        }

        if (
            !Array.isArray(
                customers[
                    customerIndex
                ].units
            )
        ) {
            customers[
                customerIndex
            ].units = [];
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

            engineMake:
                customerUnitEngineMakeInput
                    .value,

            engineModel:
                customerUnitEngineModelInput
                    .value
                    .trim(),

            fuelType:
                customerUnitFuelTypeInput
                    .value,

            displacement:
                customerUnitDisplacementInput
                    .value
                    .trim()
        };

        if (editingCustomerUnitId) {
            const unitIndex =
                customers[
                    customerIndex
                ].units.findIndex(
                    function (unit) {
                        return (
                            unit.id ===
                            editingCustomerUnitId
                        );
                    }
                );

            if (unitIndex === -1) {
                return;
            }

            customers[
                customerIndex
            ].units[unitIndex] = {
                ...customers[
                    customerIndex
                ].units[unitIndex],

                ...unitValues,

                updatedAt:
                    new Date().toISOString()
            };
        } else {
            customers[
                customerIndex
            ].units.push({
                id: crypto.randomUUID(),

                customerId:
                    selectedCustomerId,

                ...unitValues,

                archived: false,

                createdAt:
                    new Date().toISOString()
            });
        }

        saveCustomers(customers);

        closeCustomerUnitForm();

        renderCustomerUnits();
    }
);/* =========================
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
    function () {
        const selectedCustomer =
            getCustomers().find(
                function (customer) {
                    return (
                        customer.id ===
                        selectedCustomerId
                    );
                }
            );

        if (!selectedCustomer) {
            console.error(
                "Could not find selected customer:",
                selectedCustomerId
            );

            return;
        }

        newRepairOrderForm.reset();

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
    function (event) {
        event.preventDefault();

        const selectedUnitOption =
            newUnitInput.options[
            newUnitInput.selectedIndex
            ];

        const newRepairOrder = {
            id:
                getNextRepairOrderId(),

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

        localStorage.setItem(
            `repair-order-${newRepairOrder.id}`,
            JSON.stringify(
                newRepairOrder
            )
        );

        window.location.href =
            `repair-order-details.html?id=${newRepairOrder.id}`;
    }
);

renderCustomerDirectory();