/* =========================
   APP CONFIGURATION
========================= */

const supabaseClient = window.trackRightSupabase;
const appMode = "shop";

const FLEET_STORAGE_KEY = "track-right-fleet";
const CUSTOMER_STORAGE_KEY = "track-right-customers";

const repairOrders = [];

let selectedCustomerId = null;
let unitLoadRequestId = 0;
let technicianOptionsLoaded = false;


/* =========================
   PAGE ELEMENTS
========================= */

const attentionOrders =
    document.getElementById("attention-orders");

const inProgressOrders =
    document.getElementById("in-progress-orders");

const paymentOrders = document.getElementById("payment-orders");

const completeOrders =
    document.getElementById("complete-orders");

const newRepairOrderButton =
    document.getElementById("new-repair-order-button");

const newRepairOrderForm =
    document.getElementById("new-repair-order-form");

const cancelNewRepairOrderButton =
    document.getElementById("cancel-new-repair-order");



const newCustomerInput =
    document.getElementById("new-customer");

const newUnitInput =
    document.getElementById("new-unit");

const newPriorityInput =
    document.getElementById("new-priority");

const newTechnicianInput =
    document.getElementById("new-technician");

const newComplaintInput =
    document.getElementById("new-complaint");

const newRoDataMessage =
    document.getElementById("new-ro-data-message");

const editCustomerButton =
    document.getElementById("edit-customer-button");

const customerFormTitle =
    document.getElementById("customer-form-title");

const saveCustomerButton =
    document.getElementById("save-customer-button");

let editingCustomerId = null;


/* =========================
   CUSTOMER ELEMENTS
========================= */

const addCustomerButton =
    document.getElementById("add-customer-button");

const addCustomerForm =
    document.getElementById("add-customer-form");

const closeCustomerFormButton =
    document.getElementById("close-customer-form");

const cancelCustomerFormButton =
    document.getElementById("cancel-customer-form");

const customerSaveMessage =
    document.getElementById("customer-save-message");

const customerSearchInput =
    document.getElementById("customer-search-input");

const customerSearchResults =
    document.getElementById("customer-search-results");

const customerResultsList =
    document.getElementById("customer-results-list");

const closeCustomerSearchButton =
    document.getElementById("close-customer-search");

const customerRecordPanel =
    document.getElementById("customer-record-panel");

const customerRecordName =
    document.getElementById("customer-record-name");

const customerRecordContact =
    document.getElementById("customer-record-contact");

const customerRecordPhone =
    document.getElementById("customer-record-phone");

const customerRecordEmail =
    document.getElementById("customer-record-email");

const customerRecordNotes =
    document.getElementById("customer-record-notes");

const closeCustomerRecordButton =
    document.getElementById("close-customer-record");

const startCustomerRepairOrderButton =
    document.getElementById("start-customer-repair-order");

const addCustomerUnitButton =
    document.getElementById("add-customer-unit-button");

const addCustomerUnitForm =
    document.getElementById("add-customer-unit-form");

const cancelCustomerUnitButton =
    document.getElementById("cancel-customer-unit-button");

const customerUnitList =
    document.getElementById("customer-unit-list");

const customerUnitNameInput =
    document.getElementById("customer-unit-name");

const customerUnitNumberInput =
    document.getElementById("customer-unit-number");

const customerUnitEngineMakeInput =
    document.getElementById("customer-unit-engine-make");

const customerUnitEngineModelInput =
    document.getElementById("customer-unit-engine-model");

const customerUnitFuelTypeInput =
    document.getElementById("customer-unit-fuel-type");

const customerUnitDisplacementInput =
    document.getElementById("customer-unit-displacement");
const customerUnitYearInput =
    document.getElementById("customer-unit-year");

const customerUnitMakeInput =
    document.getElementById("customer-unit-make");

const customerUnitModelInput =
    document.getElementById("customer-unit-model");

const customerUnitSerialInput =
    document.getElementById("customer-unit-serial");

const customerUnitFormTitle =
    document.getElementById("customer-unit-form-title");

const saveCustomerUnitButton =
    document.getElementById("save-customer-unit-button");

let editingCustomerUnitId = null;

const customerRepairHistory =
    document.getElementById("customer-repair-history");


/* =========================
   GENERAL STORAGE HELPERS
========================= */

function safelyParseStoredValue(key) {
    const storedValue = localStorage.getItem(key);

    if (!storedValue) {
        return null;
    }

    try {
        return JSON.parse(storedValue);
    } catch (error) {
        console.error(`Could not read ${key}:`, error);
        return null;
    }
}




/* =========================
   REPAIR ORDER HELPERS
========================= */

function getCurrentRepairOrder(order) {
    return order;
}

function getCustomerUnitById(customerId, unitId) {
    const customer = getCustomers().find(function (item) {
        return item.id === customerId;
    });

    if (!customer || !Array.isArray(customer.units)) {
        return null;
    }

    return customer.units.find(function (unit) {
        return unit.id === unitId;
    }) || null;
}

function getAllRepairOrders() {
    const allRepairOrders = new Map();

    repairOrders.forEach(function (order) {
        allRepairOrders.set(
            String(order.id),
            getCurrentRepairOrder(order)
        );
    });

    return allRepairOrders;
}

function getOrderSection(status) {
    switch (status) {
        case "In Progress":
        case "Waiting Parts":
        case "Waiting Approval":
        case "Waiting Customer":
            return inProgressOrders;

        case "Ready for Payment":
        case "Awaiting Payment":
            return paymentOrders;
        case "Complete":
        case "Closed":
        case "Paid":
        case "Ready for Pickup":
            return completeOrders;

        case "Open":
        case "Scheduled":
        case "Needs Info":
        default:
            return attentionOrders;
    }
}

function getStatusDotClass(status) {
    switch (status) {
        case "Waiting Parts":
        case "Waiting Approval":
        case "Waiting Customer":
            return "status-dot-yellow";

        case "Complete":
        case "Ready for Pickup":
        case "Ready for Payment":
        case "Awaiting Payment":
            return "status-dot-green";

        case "In Progress":
            return "status-dot-blue";

        default:
            return "status-dot-neutral";
    }
}

const roEstimateCurrency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function createRepairOrderCard(order) {
    const card = document.createElement("a");

    const linkedUnit = getCustomerUnitById(
        order.customerId,
        order.unitId
    );

    const engineSize = linkedUnit
        ? linkedUnit.displacement || ""
        : "";

    const estimateStatus =
        order.estimateApprovalStatus || "No Estimate";

    const estimateStatusClass =
        estimateStatus
            .toLowerCase()
            .replaceAll(" ", "-");

    card.className = "repair-order-card";

    card.href =
        `./repair-order-details.html?id=${order.id}`;

    card.innerHTML = `
    <div class="ro-identity">
        <div class="ro-card-heading">
            <h3>RO #${escapeHtml(order.id)}</h3>
            <span class="ro-estimate-amount">
                ${roEstimateCurrency.format(order.estimateTotal ?? 0)}
                <small>Est. before tax</small>
            </span>
        </div>
        <p class="repair-order-customer">${escapeHtml(order.customer || "No customer entered")} &bull; ${escapeHtml(order.unit || "No unit entered")}</p>
        ${engineSize ? `<p class="repair-order-engine">Engine Size: ${escapeHtml(engineSize)}</p>` : ""}
        <p class="repair-order-complaint">${escapeHtml(order.complaint || "No work entered")}</p>
    </div>
    <div class="ro-row-secondary">
        <span class="estimate-card-status estimate-${escapeHtml(estimateStatusClass)}">${escapeHtml(estimateStatus === "No Estimate" ? estimateStatus : `Estimate: ${estimateStatus}`)}</span>
        <span class="ro-exact-status">${escapeHtml(order.status === "Complete" ? "Collected / Closed" : order.status || "Open")}</span>
    </div>
    <div class="ro-card-meta">Tech: ${escapeHtml(order.technician || "Unassigned")} &bull; ${escapeHtml(order.priority || "Medium")}</div>
`;

    return card;
}

function showEmptyMessage(section, message) {
    if (section.children.length !== 0) {
        return;
    }

    const emptyMessage =
        document.createElement("p");

    emptyMessage.className =
        "empty-section-message";

    emptyMessage.textContent = message;

    section.appendChild(emptyMessage);
}

const roListSearch = document.getElementById("ro-list-search");
const roListSort = document.getElementById("ro-list-sort");
const roPageSize = document.getElementById("ro-page-size");
const roLanePages = new Map();
function resetRepairOrderPages() {
    roLanePages.clear();
    renderRepairOrders();
}
roListSearch?.addEventListener("input", resetRepairOrderPages);
roListSort?.addEventListener("change", resetRepairOrderPages);
roPageSize?.addEventListener("change", resetRepairOrderPages);

const roSortCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
const compareOrderNumber = (a, b) => roSortCollator.compare(String(a.id), String(b.id));
const compareOrderDate = (a, b) => (Date.parse(a.createdAt) || 0) - (Date.parse(b.createdAt) || 0);
const roSortOptions = {
    "date-newest": (a, b) => compareOrderDate(b, a) || compareOrderNumber(b, a),
    "date-oldest": (a, b) => compareOrderDate(a, b) || compareOrderNumber(a, b),
    number: compareOrderNumber,
    customer: (a, b) => roSortCollator.compare(a.customer || "", b.customer || "") || compareOrderNumber(a, b)
};

function renderRepairOrders() {
    const query = roListSearch?.value.trim().toLowerCase().replace(/^(?:ro\s*)?#\s*/, "");
    const ordersByLane = new Map([attentionOrders, inProgressOrders, paymentOrders, completeOrders].map(lane => [lane, []]));
    const pageSize = Number(roPageSize?.value) || 25;

    const allRepairOrders =
        getAllRepairOrders();

    const compareOrders = roSortOptions[roListSort?.value];
    const orderedRepairOrders = compareOrders ? allRepairOrders.toSorted(compareOrders) : allRepairOrders;

    orderedRepairOrders.forEach(function (order) {
        if (!window.shopWorkflow.matchesOrder(order, new URLSearchParams(window.location.search).get('scope'))) {
            return;
        }

        if (query && ![order.id, order.customer, order.unit, order.technician || "Unassigned"].some(
            value => String(value ?? "").toLowerCase().includes(query)
        )) return;

        const destinationSection =
            getOrderSection(order.status);

        ordersByLane.get(destinationSection).push(order);
    });

    for (const [lane, orders] of ordersByLane) {
        const total = orders.length;
        const lastPage = Math.max(0, Math.ceil(total / pageSize) - 1);
        const page = Math.min(roLanePages.get(lane) ?? 0, lastPage);
        roLanePages.set(lane, page);
        const offset = page * pageSize;
        lane.replaceChildren(...orders.slice(offset, offset + pageSize).map(createRepairOrderCard));

        let pager = lane.parentElement.querySelector(".ro-lane-pager");
        if (!pager) {
            pager = document.createElement("nav");
            pager.className = "ro-lane-pager";
            pager.setAttribute("aria-label", lane.parentElement.querySelector("h2").firstChild.textContent.trim() + " pages");
            lane.after(pager);
        }
        const focusedStep = pager.contains(document.activeElement) ? document.activeElement.dataset.step : undefined;
        pager.replaceChildren();
        pager.hidden = lastPage === 0;
        if (!pager.hidden) {
            const range = document.createElement("span");
            range.textContent = `${offset + 1}–${Math.min(offset + pageSize, total)} of ${total}`;
            for (const [step, label] of [[-1, "Previous"], [1, "Next"]]) {
                const button = document.createElement("button");
                button.type = "button";
                button.textContent = label;
                button.dataset.step = step;
                button.disabled = page + step < 0 || page + step > lastPage;
                button.addEventListener("click", () => {
                    roLanePages.set(lane, page + step);
                    renderRepairOrders();
                });
                if (step === 1) pager.append(range);
                pager.append(button);
            }
            if (focusedStep) (pager.querySelector(`[data-step="${focusedStep}"]:enabled`) || pager.querySelector("button:enabled"))?.focus({ preventScroll: true });
        }
        const count = lane.parentElement.querySelector(".ro-lane-count");
        if (!count) continue;
        count.textContent = total;
        count.setAttribute("aria-label", total === 1 ? "1 repair order" : `${total} repair orders`);
    }

    showEmptyMessage(
        attentionOrders,
        "No repair orders need attention."
    );

    showEmptyMessage(
        inProgressOrders,
        "No repair orders are currently in progress."
    );

    showEmptyMessage(paymentOrders, "No repair orders awaiting payment.");

    showEmptyMessage(
        completeOrders,
        "No completed repair orders."
    );
}


/* =========================
   NEW REPAIR ORDER
========================= */

function openNewRepairOrderForm() {
    newRepairOrderForm.hidden = false;

    newRepairOrderForm.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });

    setTimeout(function () {
        newCustomerInput.focus();
    }, 250);
}

async function populateTechnicianOptions() {
    if (technicianOptionsLoaded) {
        return;
    }

    const technicianOptions = newTechnicianInput;

    try {
        await window.trackRightAuthReady;

        const { data, error } =
            await supabaseClient.rpc(
                "list_shop_schedule_members"
            );

        if (error) {
            throw error;
        }

        technicianOptions.innerHTML = '<option value="Unassigned">Unassigned</option>';

        (data || []).forEach(function (member) {
            if (!member.email) {
                return;
            }

            const option = document.createElement("option");
            option.value = member.email;
            option.textContent = member.email;
            technicianOptions.appendChild(option);
        });

        technicianOptionsLoaded = true;
    } catch (error) {
        console.error(
            "Could not load active technicians:",
            error
        );
    }
}

newRepairOrderButton.addEventListener(
    "click",
    async function () {
        if (!newRepairOrderForm.hidden) { newComplaintInput.focus(); return; }
        selectedCustomerId = null;

        newRepairOrderForm.reset();
        newPriorityInput.value = (await window.trackRightShopBehavior).default_ro_priority;

        openNewRepairOrderForm();

        await Promise.all([
            populateCustomerDropdown(),
            populateTechnicianOptions()
        ]);
    }
);

cancelNewRepairOrderButton.addEventListener(
    "click",
    function () {
        newRepairOrderForm.reset();
        newRepairOrderForm.hidden = true;
        selectedCustomerId = null;
        unitLoadRequestId += 1;
        newRoDataMessage.textContent = "";
        newRoDataMessage.classList.remove("error");
        setUnitDropdownState("Select a customer first", true);
    }
);

newRepairOrderForm.addEventListener(
    "submit",
    async function (event) {
        event.preventDefault();
        if (!newCustomerInput.value || !newUnitInput.value) {
            newRoDataMessage.textContent = "Select a customer and vehicle before saving the repair order.";
            newRoDataMessage.classList.add("error");
            return;
        }
        const submitButton = newRepairOrderForm.querySelector('[type="submit"]');
        submitButton.disabled = true;
        newRoDataMessage.textContent = "Saving repair order…";
        newRoDataMessage.classList.remove("error");

        const selectedUnitOption =
            newUnitInput.options[
            newUnitInput.selectedIndex
            ];

        const selectedCustomerOption =
            newCustomerInput.options[
            newCustomerInput.selectedIndex
            ];

        const newRepairOrder = {
            customerId:
                selectedCustomerId || "",

            customer:
                selectedCustomerOption
                    ? selectedCustomerOption.textContent.trim()
                    : "",

            unitId:
                newUnitInput.value,

            unit:
                selectedUnitOption
                    ? selectedUnitOption.textContent
                        .replaceAll("â€”", "-")
                        .replaceAll("—", "-")
                        .trim()
                    : "",

            status: "Open",

            priority:
                newPriorityInput.value,

            technician:
                newTechnicianInput.value,

            complaint:
                newComplaintInput.value.trim(),

            partsNeeded: "",
            customerNotes: "",
            technicianNotes: "",
            laborHours: 0,
            additionalTechnician: "",
            additionalWorkPerformed: "",
            archived: false,
            appMode: appMode
        };

        try {
            const savedOrder = await window.trackRightRepairOrders.create(newRepairOrder);
            repairOrders.unshift(savedOrder);
            window.location.href = `./repair-order-details.html?id=${encodeURIComponent(savedOrder.id)}`;
        } catch (error) {
            console.error("Could not create repair order:", error);
            newRoDataMessage.textContent =
                error?.message || "Could not save this repair order. Please retry.";
            newRoDataMessage.classList.add("error");
            submitButton.disabled = false;
        }
    }
);


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


/* =========================
   ADD CUSTOMER
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

    document
        .getElementById("customer-name")
        .focus();
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

if (addCustomerButton) {
    addCustomerButton?.addEventListener(
        "click",
        openCustomerForm
    );
}

if (closeCustomerFormButton) {
    closeCustomerFormButton?.addEventListener(
        "click",
        closeCustomerForm
    );
}

if (cancelCustomerFormButton) {
    cancelCustomerFormButton?.addEventListener(
        "click",
        closeCustomerForm
    );
}

if (addCustomerForm) {
    addCustomerForm?.addEventListener(
        "submit",
        function (event) {
            event.preventDefault();

        const customerName =
            document
                .getElementById("customer-name")
                .value
                .trim();

        const contactName =
            document
                .getElementById("customer-contact")
                .value
                .trim();

        const phone =
            document
                .getElementById("customer-phone")
                .value
                .trim();

        const email =
            document
                .getElementById("customer-email")
                .value
                .trim();

        const notes =
            document
                .getElementById("customer-notes")
                .value
                .trim();

        const customers = getCustomers();

        if (editingCustomerId) {
            const customerIndex =
                customers.findIndex(function (customer) {
                    return customer.id === editingCustomerId;
                });

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
                updatedAt: new Date().toISOString()
            };

            saveCustomers(customers);

            selectedCustomerId = editingCustomerId;

            customerSaveMessage.textContent =
                `${customerName} was updated successfully.`;

            setTimeout(function () {
                closeCustomerForm();
                openCustomerRecord(selectedCustomerId);
            }, 700);

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
            createdAt: new Date().toISOString()
        };

        customers.push(newCustomer);
        saveCustomers(customers);

        customerSaveMessage.textContent =
            `${customerName} was saved successfully.`;

        setTimeout(function () {
            closeCustomerForm();
        }, 700);
    }
);
}

/* =========================
   CUSTOMER SEARCH
========================= */

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function renderCustomerSearchResults(searchText) {
    const normalizedSearch =
        searchText.trim().toLowerCase();

    const matchingCustomers =
        getCustomers().filter(function (customer) {
            if (customer.archived === true) {
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
        });

    customerResultsList.innerHTML = "";

    if (matchingCustomers.length === 0) {
        customerResultsList.innerHTML = `
            <p class="customer-search-empty">
                No customers found.
            </p>
        `;

        return;
    }

    matchingCustomers.forEach(function (customer) {
        const customerCard =
            document.createElement("article");

        customerCard.className =
            "customer-result-card";

        customerCard.dataset.customerId =
            customer.id;

        customerCard.tabIndex = 0;

        customerCard.innerHTML = `
            <h3>${escapeHtml(customer.name)}</h3>

            ${customer.contactName
                ? `<p>Contact: ${escapeHtml(customer.contactName)}</p>`
                : ""
            }

            ${customer.phone
                ? `<p>Phone: ${escapeHtml(customer.phone)}</p>`
                : ""
            }

            ${customer.email
                ? `<p>Email: ${escapeHtml(customer.email)}</p>`
                : ""
            }
        `;

        customerCard?.addEventListener(
            "click",
            function () {
                openCustomerRecord(customer.id);
            }
        );

        customerCard?.addEventListener(
            "keydown",
            function (event) {
                if (
                    event.key === "Enter" ||
                    event.key === " "
                ) {
                    event.preventDefault();
                    openCustomerRecord(customer.id);
                }
            }
        );

        customerResultsList.appendChild(
            customerCard
        );
    });
}

if (customerSearchInput) {
    customerSearchInput?.addEventListener(
        "input",
        function () {
            const searchText =
                customerSearchInput.value.trim();

            if (searchText.length < 2) {
                customerSearchResults.hidden = true;
                customerResultsList.innerHTML = "";
                return;
            }

            customerRecordPanel.hidden = true;
            customerSearchResults.hidden = false;

            renderCustomerSearchResults(searchText);
        }
    );
}

closeCustomerSearchButton?.addEventListener(
    "click",
    closeCustomerSearch
);


/* =========================
   CUSTOMER RECORD
========================= */

function openCustomerRecord(customerId) {
    const customer =
        getCustomers().find(function (item) {
            return item.id === customerId;
        });

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
        customer.notes || "No notes added.";

    customerSearchResults.hidden = true;
    renderCustomerUnits();
    renderCustomerRepairHistory();
    customerRecordPanel.hidden = false;
}

function closeCustomerRecord() {
    customerRecordPanel.hidden = true;
    selectedCustomerId = null;
}

closeCustomerRecordButton?.addEventListener(
    "click",
    closeCustomerRecord
);

editCustomerButton?.addEventListener(
    "click",
    function () {
        const customer = getSelectedCustomer();

        if (!customer) {
            return;
        }

        editingCustomerId = customer.id;

        document.getElementById("customer-name").value =
            customer.name || "";

        document.getElementById("customer-contact").value =
            customer.contactName || "";

        document.getElementById("customer-phone").value =
            customer.phone || "";

        document.getElementById("customer-email").value =
            customer.email || "";

        document.getElementById("customer-notes").value =
            customer.notes || "";

        customerFormTitle.textContent =
            "Edit Customer";

        saveCustomerButton.textContent =
            "Update Customer";

        customerSaveMessage.textContent = "";

        customerRecordPanel.hidden = true;
        addCustomerForm.hidden = false;

        document
            .getElementById("customer-name")
            .focus();
    }
);
/* =========================
   CUSTOMER UNITS
========================= */

function getSelectedCustomer() {
    return getCustomers().find(function (customer) {
        return customer.id === selectedCustomerId;
    });
}

function setUnitDropdownState(message, disabled) {
    newUnitInput.innerHTML = "";

    const option = document.createElement("option");
    option.value = "";
    option.textContent = message;
    newUnitInput.appendChild(option);
    newUnitInput.value = "";
    newUnitInput.disabled = disabled;
}

async function getRepairOrderShopId() {
    const context = await window.trackRightAuthReady;

    if (!context?.user || !context.shopId) {
        throw new Error(
            "Your active shop membership could not be determined."
        );
    }

    return context.shopId;
}

newCustomerInput.addEventListener(
    "change",
    async function () {
        const requestId = ++unitLoadRequestId;
        const customerId =
            newCustomerInput.value || null;
        selectedCustomerId = customerId;

        newRoDataMessage.textContent = "";
        newRoDataMessage.classList.remove("error");

        if (!customerId) {
            setUnitDropdownState(
                "Select a customer first",
                true
            );
            return;
        }

        setUnitDropdownState("Loading units…", true);

        try {
            const shopId = await getRepairOrderShopId();
            const { data: units, error } =
                await supabaseClient
                    .from("customer_units")
                    .select("id, name, year, make, model, serial")
                    .eq("shop_id", shopId)
                    .eq("customer_id", customerId)
                    .eq("archived", false)
                    .order("created_at");

            if (requestId !== unitLoadRequestId) {
                return;
            }

            if (error) {
                throw error;
            }

            if (!units || units.length === 0) {
                setUnitDropdownState("No units available", true);
                newRoDataMessage.textContent =
                    "This customer has no active units.";
                return;
            }

            setUnitDropdownState(
                "Select a customer vehicle",
                false
            );

            units.forEach(function (unit) {
                const option =
                    document.createElement("option");

                option.value = unit.id;
                option.textContent = [
                    unit.year,
                    unit.make,
                    unit.model
                ]
                    .filter(Boolean)
                    .join(" ") ||
                    unit.name || unit.serial ||
                    "Unnamed unit";

                newUnitInput.appendChild(option);
            });
        } catch (error) {
            if (requestId !== unitLoadRequestId) {
                return;
            }

            console.error(
                "Could not load customer units:",
                error
            );
            setUnitDropdownState("Units unavailable", true);
            newRoDataMessage.textContent =
                `Could not load units: ${error.message}`;
            newRoDataMessage.classList.add("error");
        }
    }
);

async function populateCustomerDropdown() {
    unitLoadRequestId += 1;
    selectedCustomerId = null;
    newCustomerInput.disabled = true;
    newCustomerInput.innerHTML = `
        <option value="">Loading customers…</option>
    `;
    setUnitDropdownState("Select a customer first", true);
    newRoDataMessage.textContent = "";
    newRoDataMessage.classList.remove("error");

    try {
        const shopId = await getRepairOrderShopId();
        const { data: customers, error } =
            await supabaseClient
                .from("Customers")
                .select("id, name")
                .eq("shop_id", shopId)
                .eq("archived", false)
                .order("name");

        if (error) {
            throw error;
        }

        newCustomerInput.innerHTML = "";

        const initialOption =
            document.createElement("option");
        initialOption.value = "";
        initialOption.textContent = customers?.length
            ? "Select a customer"
            : "No customers available";
        newCustomerInput.appendChild(initialOption);

        (customers || []).forEach(function (customer) {
            const option =
                document.createElement("option");

            option.value = customer.id;
            option.textContent = customer.name;
            newCustomerInput.appendChild(option);
        });

        newCustomerInput.disabled = !customers?.length;

        if (!customers?.length) {
            newRoDataMessage.textContent =
                "Add an active customer before creating a repair order.";
        }

        return customers || [];
    } catch (error) {
        console.error("Could not load customers:", error);
        newCustomerInput.innerHTML = `
            <option value="">Customers unavailable</option>
        `;
        newCustomerInput.disabled = true;
        newRoDataMessage.textContent =
            `Could not load customers: ${error.message}`;
        newRoDataMessage.classList.add("error");
        return [];
    }
}

function renderCustomerUnits() {
    const customer = getSelectedCustomer();

    customerUnitList.innerHTML = "";

    if (!customer) {
        return;
    }

    const units = Array.isArray(customer.units)
        ? customer.units.filter(function (unit) {
            return unit.archived !== true;
        })
        : [];

    if (units.length === 0) {
        customerUnitList.innerHTML = `
            <p class="customer-search-empty">
                No units have been added for this customer.
            </p>
        `;

        return;
    }

    units.forEach(function (unit) {
        const unitCard =
            document.createElement("article");

        unitCard.className =
            "customer-unit-card";

        unitCard.tabIndex = 0;
        unitCard.dataset.unitId = unit.id;

        const unitTitle = [
            unit.number,
            unit.name
        ]
            .filter(Boolean)
            .join(" — ");

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
                    ${escapeHtml(unitTitle || "Unnamed Unit")}
                </strong>

                <span>Edit</span>
            </div>

            ${unitDescription
                ? `<p>${escapeHtml(unitDescription)}</p>`
                : ""
            }

            ${unit.serial
                ? `<p>VIN/Serial: ${escapeHtml(unit.serial)}</p>`
                : ""
            }

            ${
            unit.engineMake || unit.engineModel
                ? `<p>Engine: ${escapeHtml(
                    [unit.engineMake, unit.engineModel]
                        .filter(Boolean)
                        .join(" ")
                )}</p>`
                : ""
            }

${unit.fuelType || unit.displacement
                ? `<p>${escapeHtml(
                    [unit.fuelType, unit.displacement]
                        .filter(Boolean)
                        .join(" • ")
                )}</p>`
                : ""
}
        `;

        unitCard.addEventListener(
            "click",
            function () {
                openEditCustomerUnitForm(unit.id);
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

                    openEditCustomerUnitForm(unit.id);
                }
            }
        );

        customerUnitList.appendChild(unitCard);
    });
}

function renderCustomerRepairHistory() {
    customerRepairHistory.innerHTML = "";

    if (!selectedCustomerId) {
        return;
    }

    const matchingOrders = Array.from(
        getAllRepairOrders().values()
    ).filter(function (order) {
        return (
            order.customerId === selectedCustomerId &&
            order.archived !== true
        );
    });

    if (matchingOrders.length === 0) {
        customerRepairHistory.innerHTML = `
            <p class="customer-search-empty">
                No repair orders found for this customer.
            </p>
        `;

        return;
    }

    matchingOrders
        .sort(function (firstOrder, secondOrder) {
            return Number(secondOrder.id) - Number(firstOrder.id);
        })
        .forEach(function (order) {
            const historyCard =
                document.createElement("a");

            historyCard.className =
                "customer-history-card";

            historyCard.href =
                `./repair-order-details.html?id=${order.id}`;

            historyCard.innerHTML = `
                <div class="customer-history-card-heading">
                    <h3>
                        RO #${escapeHtml(order.id)}
                    </h3>

                    <span class="customer-history-status">
                        ${escapeHtml(order.status === "Complete" ? "Collected / Closed" : order.status || "Open")}
                    </span>
                </div>

                <p>
                    ${escapeHtml(order.unit || "No unit entered")}
                </p>

                <p>
                    ${escapeHtml(order.complaint || "No complaint entered")}
                </p>
            `;

            customerRepairHistory.appendChild(
                historyCard
            );
        });
}

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

    customerUnitNameInput.focus();
}

function openEditCustomerUnitForm(unitId) {
    const customer = getSelectedCustomer();

    if (
        !customer ||
        !Array.isArray(customer.units)
    ) {
        return;
    }

    const unit = customer.units.find(function (item) {
        return item.id === unitId;
    });

    if (!unit) {
        return;
    }

    editingCustomerUnitId = unit.id;

    customerUnitNameInput.value =
        unit.name || "";

    customerUnitNumberInput.value =
        unit.number || "";

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

    customerUnitNameInput.focus();
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

addCustomerUnitButton?.addEventListener(
    "click",
    openCustomerUnitForm
);

cancelCustomerUnitButton?.addEventListener(
    "click",
    closeCustomerUnitForm
);

addCustomerUnitForm?.addEventListener(
    "submit",
    function (event) {
        event.preventDefault();

        const customers = getCustomers();

        const customerIndex =
            customers.findIndex(function (customer) {
                return customer.id === selectedCustomerId;
            });

        if (customerIndex === -1) {
            return;
        }

        if (
            !Array.isArray(
                customers[customerIndex].units
            )
        ) {
            customers[customerIndex].units = [];
        }

        const unitValues = {
            name:
                customerUnitNameInput.value.trim(),

            number:
                customerUnitNumberInput.value.trim(),

            year:
                customerUnitYearInput.value.trim(),

            make:
                customerUnitMakeInput.value.trim(),

            model:
                customerUnitModelInput.value.trim(),

            serial:
                customerUnitSerialInput.value.trim(),

           engineMake:
                customerUnitEngineMakeInput.value,

            engineModel:
                customerUnitEngineModelInput.value.trim(),

            fuelType:
                customerUnitFuelTypeInput.value,

            displacement:
                customerUnitDisplacementInput.value.trim()
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
);
/* =========================
   START RO FROM CUSTOMER
========================= */

startCustomerRepairOrderButton?.addEventListener(
    "click",
    async function () {
        const customerId = selectedCustomerId;

        if (!customerId) {
            console.error(
                "Could not determine the selected customer."
            );
            return;
        }

        newRepairOrderForm.reset();
        newPriorityInput.value = (await window.trackRightShopBehavior).default_ro_priority;

        customerRecordPanel.hidden = true;
        customerSearchResults.hidden = true;
        addCustomerForm.hidden = true;

        openNewRepairOrderForm();

        await populateCustomerDropdown();

        const matchingOption = Array.from(
            newCustomerInput.options
        ).some(function (option) {
            return option.value === customerId;
        });

        if (!matchingOption) {
            newRoDataMessage.textContent =
                "That customer is not active in this shop.";
            newRoDataMessage.classList.add("error");
            return;
        }

        newCustomerInput.value = customerId;
        newCustomerInput.dispatchEvent(
            new Event("change")
        );
    }
);

/* =========================
   EXPORT BACKUP
========================= */


/* =========================
   INITIAL PAGE LOAD
========================= */


async function initializeRepairOrders() {
    try {
        await window.trackRightRepairOrders.migrateBrowserOrders();
        const cloudOrders = await window.trackRightRepairOrders.list();
        repairOrders.splice(0, repairOrders.length, ...cloudOrders);
        renderRepairOrders();
    } catch (error) {
        console.error("Could not load repair orders:", error);
        attentionOrders.innerHTML = `
            <p class="empty-section-message">
                Repair orders could not be loaded. Refresh the page or sign in again.
            </p>
        `;
        inProgressOrders.innerHTML = "";
        completeOrders.innerHTML = "";
    paymentOrders.innerHTML = "";
    }
}

initializeRepairOrders();

(function showDashboardScope() {
    const scope = new URLSearchParams(window.location.search).get('scope');
    const labels = {open:'Open repair orders',approval:'Waiting for approval',pickup:'Ready for pickup'};
    if (!labels[scope]) return;
    const heading = document.querySelector('main h1');
    if (!heading) return;
    const notice = document.createElement('p');
    notice.append(document.createTextNode(labels[scope] + ' · '));
    const reset = document.createElement('a');
    reset.href = './repair-orders.html';
    reset.textContent = 'Show all';
    notice.append(reset);
    heading.insertAdjacentElement('afterend', notice);
})();
