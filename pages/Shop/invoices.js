/* =========================
   CONFIGURATION
========================= */

const supabaseClient = window.trackRightSupabase;
const invoices = [];
const repairOrders = [];


/* =========================
   PAGE ELEMENTS
========================= */

const createInvoiceButton =
    document.getElementById(
        "create-invoice-button"
    );

const createInvoiceForm =
    document.getElementById(
        "create-invoice-form"
    );

const closeInvoiceFormButton =
    document.getElementById(
        "close-invoice-form"
    );

const cancelInvoiceFormButton =
    document.getElementById(
        "cancel-invoice-form"
    );

const invoiceRepairOrderInput =
    document.getElementById(
        "invoice-repair-order"
    );

const invoiceSourceTypeInput =
    document.getElementById("invoice-source-type");

const invoiceRepairOrderField =
    document.getElementById("invoice-repair-order-field");

const invoiceCustomerField =
    document.getElementById("invoice-customer-field");

const invoiceCustomerInput =
    document.getElementById("invoice-customer");

const invoiceUnitField =
    document.getElementById("invoice-unit-field");

const invoiceUnitInput =
    document.getElementById("invoice-unit");

const invoiceSubtotalField =
    document.getElementById("invoice-subtotal-field");

const invoiceSubtotalInput =
    document.getElementById("invoice-subtotal-input");

const invoiceDescriptionField =
    document.getElementById("invoice-description-field");

const invoiceDescriptionInput =
    document.getElementById("invoice-description");

const invoiceDueDateInput =
    document.getElementById(
        "invoice-due-date"
    );

const invoiceNotesInput =
    document.getElementById(
        "invoice-notes"
    );

const invoiceCreateMessage =
    document.getElementById(
        "invoice-create-message"
    );

const invoiceSearchInput =
    document.getElementById(
        "invoice-search-input"
    );

const invoiceStatusFilter =
    document.getElementById(
        "invoice-status-filter"
    );

const invoiceList =
    document.getElementById(
        "invoice-list"
    );

const draftCount =
    document.getElementById(
        "draft-count"
    );

const sentCount =
    document.getElementById(
        "sent-count"
    );

const paidCount =
    document.getElementById(
        "paid-count"
    );

const outstandingTotal =
    document.getElementById(
        "outstanding-total"
    );

let currentShopContext = null;
let availableCustomers = [];
let customerUnitRequestId = 0;


/* =========================
   STORAGE HELPERS
========================= */

function getInvoices() {
    return invoices;
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function formatCurrency(value) {
    const amount = Number(value);

    if (!Number.isFinite(amount)) {
        return "$0.00";
    }

    return amount.toLocaleString(
        "en-US",
        {
            style: "currency",
            currency: "USD"
        }
    );
}


/* =========================
   REPAIR ORDER HELPERS
========================= */

function getAllRepairOrders() {
    return repairOrders.filter(order => order.archived !== true).sort(
        function (firstOrder, secondOrder) {
            return (
                Number(secondOrder.id) -
                Number(firstOrder.id)
            );
        }
    );
}

function getRepairOrderFinancials(order) {
    const laborHours = Number(order.estimateLaborHours) || 0;
    const laborRate = Number(order.estimateLaborRate) || 0;
    const laborTotal = laborHours * laborRate;
    const partsTotal = Number(order.estimatePartsTotal) || 0;
    const shopSupplies = Number(order.estimateShopSupplies) || 0;
    const environmentalFee = Number(order.estimateEnvironmentalFee) || 0;
    const miscellaneousFee = Number(order.estimateOtherCharges) || 0;
    const discount = Number(order.estimateDiscount) || 0;
    const grossSubtotal =
        laborTotal +
        partsTotal +
        shopSupplies +
        environmentalFee +
        miscellaneousFee;
    const subtotal = Math.max(0, grossSubtotal - discount);
    const taxableBeforeDiscount =
        laborTotal +
        partsTotal +
        (order.estimateShopSuppliesTaxable === false ? 0 : shopSupplies) +
        (order.estimateEnvironmentalFeeTaxable === true ? environmentalFee : 0) +
        (order.estimateMiscFeeTaxable === false ? 0 : miscellaneousFee);

    return {
        laborHours,
        laborRate,
        laborTotal,
        partsTotal,
        shopSupplies,
        shopSuppliesTaxable:
            order.estimateShopSuppliesTaxable !== false,
        environmentalFee,
        environmentalFeeTaxable:
            order.estimateEnvironmentalFeeTaxable === true,
        miscellaneousFee,
        miscellaneousFeeLabel:
            order.estimateMiscFeeLabel || "Miscellaneous fee",
        miscellaneousFeeTaxable:
            order.estimateMiscFeeTaxable !== false,
        discount,
        grossSubtotal,
        subtotal,
        taxableBase: Math.max(0, taxableBeforeDiscount - discount)
    };
}


/* =========================
   REPAIR ORDER DROPDOWN
========================= */

function populateRepairOrderDropdown() {
    invoiceRepairOrderInput.innerHTML = `
        <option value="">
            Select a repair order
        </option>
    `;

    const invoicedRepairOrderIds =
        new Set(
            getInvoices().map(
                function (invoice) {
                    return String(
                        invoice.repairOrderId
                    );
                }
            )
        );

    getAllRepairOrders().forEach(
        function (order) {
            if (
                invoicedRepairOrderIds.has(
                    String(order.id)
                )
            ) {
                return;
            }

            const option =
                document.createElement(
                    "option"
                );

            option.value = order.id;

            option.textContent =
                `RO #${order.id} — ` +
                `${order.customer || "No customer"} — ` +
                `${order.unit || "No unit"}`;

            invoiceRepairOrderInput
                .appendChild(option);
        }
    );
}

function setUnitDropdown(message, disabled) {
    invoiceUnitInput.innerHTML = "";

    const option = document.createElement("option");
    option.value = "";
    option.textContent = message;
    invoiceUnitInput.appendChild(option);
    invoiceUnitInput.disabled = disabled;
}

async function loadInvoiceCustomers() {
    currentShopContext =
        await window.trackRightAuthReady;

    if (!currentShopContext?.shopId) {
        throw new Error(
            "No active shop membership was found."
        );
    }

    const { data, error } = await supabaseClient
        .from("Customers")
        .select("id, name, email, phone")
        .eq("shop_id", currentShopContext.shopId)
        .eq("archived", false)
        .order("name");

    if (error) {
        throw error;
    }

    availableCustomers = data || [];
    invoiceCustomerInput.innerHTML = "";

    const initialOption = document.createElement("option");
    initialOption.value = "";
    initialOption.textContent = availableCustomers.length
        ? "Select a customer"
        : "No customers available";
    invoiceCustomerInput.appendChild(initialOption);

    availableCustomers.forEach(function (customer) {
        const option = document.createElement("option");
        option.value = customer.id;
        option.textContent = customer.name;
        invoiceCustomerInput.appendChild(option);
    });

    invoiceCustomerInput.disabled =
        availableCustomers.length === 0;
}

async function loadCustomerUnits(customerId) {
    const requestId = ++customerUnitRequestId;

    if (!customerId) {
        setUnitDropdown("Select a customer first", true);
        return;
    }

    setUnitDropdown("Loading units…", true);

    const { data, error } = await supabaseClient
        .from("customer_units")
        .select("id, year, make, model, serial")
        .eq("shop_id", currentShopContext.shopId)
        .eq("customer_id", customerId)
        .eq("archived", false)
        .order("created_at");

    if (requestId !== customerUnitRequestId) {
        return;
    }

    if (error) {
        setUnitDropdown("Units unavailable", true);
        throw error;
    }

    setUnitDropdown("No unit — general service", false);

    (data || []).forEach(function (unit) {
        const option = document.createElement("option");
        option.value = unit.id;
        option.textContent = [
            unit.year,
            unit.make,
            unit.model
        ].filter(Boolean).join(" ") ||
            unit.serial ||
            "Unnamed unit";
        invoiceUnitInput.appendChild(option);
    });
}

function updateInvoiceSourceFields() {
    const isOneOff =
        invoiceSourceTypeInput.value === "one-off";

    invoiceRepairOrderField.hidden = isOneOff;
    invoiceCustomerField.hidden = !isOneOff;
    invoiceUnitField.hidden = !isOneOff;
    invoiceSubtotalField.hidden = !isOneOff;
    invoiceDescriptionField.hidden = !isOneOff;

    invoiceRepairOrderInput.required = !isOneOff;
    invoiceCustomerInput.required = isOneOff;
    invoiceSubtotalInput.required = isOneOff;
    invoiceDescriptionInput.required = isOneOff;

    if (isOneOff) {
        invoiceRepairOrderInput.value = "";
        invoiceCustomerInput.focus();
    } else {
        invoiceCustomerInput.value = "";
        invoiceSubtotalInput.value = "";
        invoiceDescriptionInput.value = "";
        setUnitDropdown("Select a customer first", true);
        invoiceRepairOrderInput.focus();
    }
}


/* =========================
   FORM OPEN / CLOSE
========================= */

async function openInvoiceForm() {
    createInvoiceForm.reset();
    invoiceCreateMessage.textContent = "";

    populateRepairOrderDropdown();

    try {
        await loadInvoiceCustomers();
    } catch (error) {
        console.error("Could not load invoice customers:", error);
        invoiceCreateMessage.textContent =
            `Could not load customers: ${error.message}`;
    }

    const behavior = await window.trackRightShopBehavior;
    const defaultDueDate =
        new Date();

    defaultDueDate.setDate(
        defaultDueDate.getDate() + behavior.default_invoice_terms_days
    );

    invoiceDueDateInput.value =
        defaultDueDate
            .toISOString()
            .slice(0, 10);

    createInvoiceForm.hidden = false;
    updateInvoiceSourceFields();

    createInvoiceForm.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });

    invoiceRepairOrderInput.focus();
}

function closeInvoiceForm() {
    createInvoiceForm.hidden = true;
    createInvoiceForm.reset();
    invoiceCreateMessage.textContent = "";
    customerUnitRequestId += 1;
}

createInvoiceButton.addEventListener(
    "click",
    openInvoiceForm
);

closeInvoiceFormButton.addEventListener(
    "click",
    closeInvoiceForm
);

cancelInvoiceFormButton.addEventListener(
    "click",
    closeInvoiceForm
);

invoiceSourceTypeInput.addEventListener(
    "change",
    updateInvoiceSourceFields
);

invoiceCustomerInput.addEventListener(
    "change",
    async function () {
        invoiceCreateMessage.textContent = "";

        try {
            await loadCustomerUnits(
                invoiceCustomerInput.value
            );
        } catch (error) {
            console.error("Could not load invoice units:", error);
            invoiceCreateMessage.textContent =
                `Could not load units: ${error.message}`;
        }
    }
);


/* =========================
   CREATE INVOICE
========================= */

createInvoiceForm.addEventListener(
    "submit",
    async function (event) {
        event.preventDefault();
        invoiceCreateMessage.textContent = "";

        const isOneOff =
            invoiceSourceTypeInput.value === "one-off";

        const selectedRepairOrder =
            getAllRepairOrders().find(
                function (order) {
                    return (
                        String(order.id) ===
                        invoiceRepairOrderInput.value
                    );
                }
            );

        if (!isOneOff && !selectedRepairOrder) {
            invoiceCreateMessage.textContent =
                "Select a valid repair order.";
            return;
        }

        const selectedCustomer = isOneOff
            ? availableCustomers.find(function (customer) {
                return String(customer.id) ===
                    invoiceCustomerInput.value;
            })
            : null;

        if (isOneOff && !selectedCustomer) {
            invoiceCreateMessage.textContent =
                "Select a valid customer.";
            return;
        }

        const selectedUnitOption =
            invoiceUnitInput.options[
                invoiceUnitInput.selectedIndex
            ];

        const selectedCustomerId = isOneOff
            ? selectedCustomer.id
            : selectedRepairOrder.customerId || "";

        const invoiceCustomerRecord = selectedCustomer ||
            availableCustomers.find(function (customer) {
                return String(customer.id) ===
                    String(selectedCustomerId);
            }) || null;

        const oneOffSubtotal =
            Number(invoiceSubtotalInput.value);

        if (
            isOneOff &&
            (!Number.isFinite(oneOffSubtotal) || oneOffSubtotal < 0)
        ) {
            invoiceCreateMessage.textContent =
                "Enter a valid invoice subtotal.";
            return;
        }

        let context;
        let shopTax;
        let customerTax = null;

        try {
            context = currentShopContext ||
                await window.trackRightAuthReady;
            if (!context?.shopId) {
                throw new Error("No active shop membership was found.");
            }

            const shopResult = await supabaseClient
                .from("shops")
                .select("default_taxable, default_tax_rate")
                .eq("id", context.shopId)
                .single();
            if (shopResult.error) throw shopResult.error;
            shopTax = shopResult.data;

            if (selectedCustomerId) {
                const customerResult = await supabaseClient
                    .from("customer_tax_profiles")
                    .select("customer_id, tax_status, exemption_reason, exemption_certificate_number")
                    .eq("customer_id", selectedCustomerId)
                    .eq("shop_id", context.shopId)
                    .maybeSingle();
                if (customerResult.error) throw customerResult.error;
                customerTax = customerResult.data;
            }
        } catch (error) {
            console.error("Could not resolve invoice tax:", error);
            invoiceCreateMessage.textContent =
                `Could not create the tax snapshot: ${error.message}`;
            return;
        }

        const taxStatus = customerTax?.tax_status || "inherit";
        const taxable = taxStatus === "taxable" ||
            (taxStatus === "inherit" && shopTax.default_taxable === true);
        const taxRate = taxable ? Number(shopTax.default_tax_rate || 0) : 0;
        const repairOrderFinancials = isOneOff
            ? null
            : getRepairOrderFinancials(selectedRepairOrder);
        const subtotal = isOneOff
            ? oneOffSubtotal
            : repairOrderFinancials.subtotal;
        const taxableBase = taxable
            ? isOneOff
                ? subtotal
                : repairOrderFinancials.taxableBase
            : 0;
        const taxAmount = Math.round(taxableBase * (taxRate / 100) * 100) / 100;

        const invoice = {
            repairOrderId:
                isOneOff ? "" : selectedRepairOrder.id,

            repairOrderRecordId:
                isOneOff ? null : selectedRepairOrder.recordId,

            sourceType:
                isOneOff ? "one-off" : "repair-order",

            customerId:
                selectedCustomerId,

            customer:
                isOneOff
                    ? selectedCustomer.name || ""
                    : selectedRepairOrder.customer || "",

            customerEmail:
                invoiceCustomerRecord?.email || "",

            customerPhone:
                invoiceCustomerRecord?.phone || "",

            unitId:
                isOneOff
                    ? invoiceUnitInput.value
                    : selectedRepairOrder.unitId || "",

            unit:
                isOneOff
                    ? invoiceUnitInput.value
                        ? selectedUnitOption.textContent.trim()
                        : ""
                    : selectedRepairOrder.unit || "",

            complaint:
                isOneOff
                    ? invoiceDescriptionInput.value.trim()
                    : selectedRepairOrder.complaint || "",

            subtotal: subtotal,

            taxAmount: taxAmount,

            total: subtotal + taxAmount,

            taxSnapshot: {
                taxable: taxable,
                rate: taxRate,
                taxableBase: taxableBase,
                customerTaxStatus: taxStatus,
                exemptionReason: taxable ? null : (customerTax?.exemption_reason || null),
                exemptionCertificateNumber: taxable ? null : (customerTax?.exemption_certificate_number || null),
                capturedAt: new Date().toISOString()
            },

            feeSnapshot: repairOrderFinancials,

            status:
                "Draft",

            dueDate:
                invoiceDueDateInput.value,

            notes:
                invoiceNotesInput
                    .value
                    .trim(),

            createdAt:
                new Date().toISOString(),

            paidAt:
                null
        };

        try {
            const savedInvoice = await window.trackRightInvoices.create(invoice);
            invoices.unshift(savedInvoice);
            closeInvoiceForm();
            renderInvoices();
        } catch (error) {
            console.error("Could not create invoice:", error);
            invoiceCreateMessage.textContent =
                `Invoice was not created: ${error.message}`;
        }
    }
);


/* =========================
   INVOICE RENDERING
========================= */

function renderInvoiceSummary(invoices) {
    draftCount.textContent =
        invoices.filter(
            function (invoice) {
                return (
                    invoice.status === "Draft"
                );
            }
        ).length;

    sentCount.textContent =
        invoices.filter(
            function (invoice) {
                return (
                    invoice.status === "Sent"
                );
            }
        ).length;

    paidCount.textContent =
        invoices.filter(
            function (invoice) {
                return (
                    invoice.status === "Paid"
                );
            }
        ).length;

    const outstandingAmount =
        invoices
            .filter(function (invoice) {
                return invoice.status === "Sent";
            })
            .reduce(function (total, invoice) {
                return (
                    total +
                    (Number(invoice.total) || 0)
                );
            }, 0);

    outstandingTotal.textContent =
        formatCurrency(outstandingAmount);
}

function createInvoiceCard(invoice) {
    const card =
        document.createElement("article");

    const displayStatus =
        getInvoiceDisplayStatus(invoice);

    card.className = "invoice-card";
    card.dataset.invoiceId = invoice.id;
    card.tabIndex = 0;
    card.setAttribute("role", "link");

    function openInvoiceDetails(event) {
        if (event.target.closest("button")) {
            return;
        }

        window.location.href =
            `invoice-details.html?id=${invoice.id}`;
    }

    card.addEventListener(
        "click",
        openInvoiceDetails
    );

    card.addEventListener(
        "keydown",
        function (event) {
            if (
                event.key === "Enter" ||
                event.key === " "
            ) {
                event.preventDefault();
                openInvoiceDetails(event);
            }
        }
    );

    card.innerHTML = `
        <div>
            <strong>
                Invoice #${escapeHtml(invoice.id)}
            </strong>

            <p>
                ${invoice.repairOrderId
                    ? `RO #${escapeHtml(invoice.repairOrderId)}`
                    : "One-off invoice"
                }
            </p>
        </div>

        <div>
            <strong>
                ${escapeHtml(
        invoice.customer ||
        "No customer"
    )}
            </strong>

            <p>
                ${escapeHtml(
        invoice.unit ||
        "No unit"
    )}
            </p>
        </div>

        <div>
            <strong>
                ${formatCurrency(invoice.total)}
            </strong>
        </div>

        <div>
            ${invoice.dueDate
            ? escapeHtml(invoice.dueDate)
            : "No due date"
        }
        </div>

        <div class="invoice-card-status">
            <span class="invoice-status">
                ${escapeHtml(displayStatus)}
            </span>

            <div class="invoice-card-actions">
              

                ${displayStatus !== "Paid"
            ? `
                            <button
                                type="button"
                                data-action="mark-paid">
                                Mark Paid
                            </button>
                        `
            : ""
        }
            </div>
        </div>
    `;

    return card;
}

async function updateInvoiceStatus(
    invoiceId,
    newStatus
) {
    const invoices = getInvoices();

    const invoice =
        invoices.find(function (item) {
            return (
                String(item.id) ===
                String(invoiceId)
            );
        });

    if (!invoice) {
        return;
    }

    invoice.status = newStatus;

    if (newStatus === "Sent") {
        invoice.sentAt =
            new Date().toISOString();
    }

    if (newStatus === "Paid") {
        invoice.paidAt =
            new Date().toISOString();
    }

    try {
        const savedInvoice = await window.trackRightInvoices.update(invoice);
        Object.assign(invoice, savedInvoice);
        renderInvoices();
    } catch (error) {
        console.error("Could not update invoice:", error);
        alert(error?.message || "Could not update this invoice.");
    }
}

function renderInvoices() {
    const searchText =
        invoiceSearchInput
            .value
            .trim()
            .toLowerCase();

    const selectedStatus =
        invoiceStatusFilter.value;

    const invoices =
        getInvoices();

    renderInvoiceSummary(invoices);

    const filteredInvoices =
        invoices.filter(
            function (invoice) {
                const matchesStatus =
                    selectedStatus === "All" ||
                    getInvoiceDisplayStatus(invoice) ===
                    selectedStatus;

                const searchableText = [
                    invoice.id,
                    invoice.repairOrderId,
                    invoice.customer,
                    invoice.unit,
                    invoice.status
                ]
                    .join(" ")
                    .toLowerCase();

                const matchesSearch =
                    searchableText.includes(
                        searchText
                    );

                return (
                    matchesStatus &&
                    matchesSearch
                );
            }
        );

    invoiceList.innerHTML = "";

    if (
        filteredInvoices.length === 0
    ) {
        invoiceList.innerHTML = `
            <p>
                No invoices found.
            </p>
        `;

        return;
    }

    filteredInvoices
        .sort(
            function (
                firstInvoice,
                secondInvoice
            ) {
                return (
                    Number(secondInvoice.id) -
                    Number(firstInvoice.id)
                );
            }
        )
        .forEach(
            function (invoice) {
                invoiceList.appendChild(
                    createInvoiceCard(invoice)
                );
            }
    );
}

function getInvoiceDisplayStatus(invoice) {
    if (invoice.status === "Paid") {
        return "Paid";
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dueDate =
        invoice.dueDate
            ? new Date(`${invoice.dueDate}T00:00:00`)
            : null;

    if (
        invoice.status === "Sent" &&
        dueDate &&
        dueDate < today
    ) {
        return "Overdue";
    }

    return invoice.status || "Draft";
}


/* =========================
   FILTER EVENTS
========================= */

invoiceSearchInput.addEventListener(
    "input",
    renderInvoices
);

invoiceStatusFilter.addEventListener(
    "change",
    renderInvoices
);


/* =========================
   INITIAL LOAD
========================= */

invoiceList.addEventListener(
    "click",
    function (event) {
        const actionButton =
            event.target.closest(
                "button[data-action]"
            );

        if (!actionButton) {
            return;
        }

        const invoiceCard =
            actionButton.closest(
                "[data-invoice-id]"
            );

        if (!invoiceCard) {
            return;
        }

        const invoiceId =
            invoiceCard.dataset.invoiceId;

        const action =
            actionButton.dataset.action;

      

        if (action === "mark-paid") {
            updateInvoiceStatus(
                invoiceId,
                "Paid"
            );
        }
    }
);

async function initializeInvoices() {
    try {
        await Promise.all([
            window.trackRightInvoices.migrateBrowserInvoices(),
            window.trackRightRepairOrders.migrateBrowserOrders()
        ]);
        const [cloudInvoices, cloudOrders] = await Promise.all([
            window.trackRightInvoices.list(),
            window.trackRightRepairOrders.list()
        ]);
        invoices.splice(0, invoices.length, ...cloudInvoices);
        repairOrders.splice(0, repairOrders.length, ...cloudOrders);
        renderInvoices();
    } catch (error) {
        console.error("Could not load invoices:", error);
        invoiceList.innerHTML = `<p class="invoice-empty">Invoices could not be loaded. Refresh or sign in again.</p>`;
        return;
    }

    const requestedRepairOrderId = new URLSearchParams(window.location.search).get("repairOrderId");
    if (requestedRepairOrderId) {
        openInvoiceForm().then(function () {
        const matchingOption = Array.from(
            invoiceRepairOrderInput.options
        ).some(function (option) {
            return option.value === requestedRepairOrderId;
        });

        if (matchingOption) {
            invoiceRepairOrderInput.value =
                requestedRepairOrderId;
        } else {
            invoiceCreateMessage.textContent =
                "That repair order is already invoiced or is no longer available.";
        }
        });
    }
}

initializeInvoices();
