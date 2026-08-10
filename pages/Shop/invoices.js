/* =========================
   CONFIGURATION
========================= */

const INVOICE_STORAGE_KEY =
    "track-right-invoices";


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

const invoiceDueDateInput =
    document.getElementById(
        "invoice-due-date"
    );

const invoiceNotesInput =
    document.getElementById(
        "invoice-notes"
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


/* =========================
   STORAGE HELPERS
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

function getInvoices() {
    const invoices =
        safelyParseStoredValue(
            INVOICE_STORAGE_KEY
        );

    return Array.isArray(invoices)
        ? invoices
        : [];
}

function saveInvoices(invoices) {
    localStorage.setItem(
        INVOICE_STORAGE_KEY,
        JSON.stringify(invoices)
    );
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
    const repairOrders = [];

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

        const order =
            safelyParseStoredValue(key);

        if (
            order &&
            order.id &&
            order.archived !== true
        ) {
            repairOrders.push(order);
        }
    }

    return repairOrders.sort(
        function (firstOrder, secondOrder) {
            return (
                Number(secondOrder.id) -
                Number(firstOrder.id)
            );
        }
    );
}

function getRepairOrderTotal(order) {
    const estimateTotal =
        Number(order.estimateTotal);

    if (Number.isFinite(estimateTotal)) {
        return estimateTotal;
    }

    const invoiceTotal =
        Number(order.invoiceTotal);

    if (Number.isFinite(invoiceTotal)) {
        return invoiceTotal;
    }

    const laborHours =
        Number(order.laborHours) || 0;

    const laborRate =
        Number(order.laborRate) || 0;

    const partsTotal =
        Number(order.partsTotal) || 0;

    return (
        laborHours * laborRate +
        partsTotal
    );
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


/* =========================
   FORM OPEN / CLOSE
========================= */

function openInvoiceForm() {
    createInvoiceForm.reset();

    populateRepairOrderDropdown();

    const defaultDueDate =
        new Date();

    defaultDueDate.setDate(
        defaultDueDate.getDate() + 30
    );

    invoiceDueDateInput.value =
        defaultDueDate
            .toISOString()
            .slice(0, 10);

    createInvoiceForm.hidden = false;

    createInvoiceForm.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });

    invoiceRepairOrderInput.focus();
}

function closeInvoiceForm() {
    createInvoiceForm.hidden = true;
    createInvoiceForm.reset();
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


/* =========================
   CREATE INVOICE
========================= */

createInvoiceForm.addEventListener(
    "submit",
    function (event) {
        event.preventDefault();

        const selectedRepairOrder =
            getAllRepairOrders().find(
                function (order) {
                    return (
                        String(order.id) ===
                        invoiceRepairOrderInput.value
                    );
                }
            );

        if (!selectedRepairOrder) {
            return;
        }

        const invoices =
            getInvoices();

        const invoiceNumber =
            String(
                Math.max(
                    ...invoices.map(
                        function (invoice) {
                            return Number(
                                invoice.id
                            );
                        }
                    ).filter(Number.isFinite),
                    1000
                ) + 1
            );

        const invoice = {
            id:
                invoiceNumber,

            repairOrderId:
                selectedRepairOrder.id,

            customerId:
                selectedRepairOrder.customerId || "",

            customer:
                selectedRepairOrder.customer || "",

            unitId:
                selectedRepairOrder.unitId || "",

            unit:
                selectedRepairOrder.unit || "",

            complaint:
                selectedRepairOrder.complaint || "",

            total:
                getRepairOrderTotal(
                    selectedRepairOrder
                ),

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

        invoices.push(invoice);

        saveInvoices(invoices);

        closeInvoiceForm();
        renderInvoices();
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
                RO #${escapeHtml(invoice.repairOrderId)}
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

function updateInvoiceStatus(
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

    saveInvoices(invoices);
    renderInvoices();
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
                    invoice.status ===
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

function syncInvoicesFromRepairOrders() {
    const invoices = getInvoices();

    let didChange = false;

    invoices.forEach(function (invoice) {
        if (invoice.status === "Paid") {
            return;
        }

        const repairOrder =
            safelyParseStoredValue(
                `repair-order-${invoice.repairOrderId}`
            );

        if (!repairOrder) {
            return;
        }

        const updatedTotal =
            getRepairOrderTotal(repairOrder);

        if (
            Number(invoice.total) !==
            Number(updatedTotal)
        ) {
            invoice.total = updatedTotal;
            didChange = true;
        }

        if (
            invoice.customer !==
            repairOrder.customer
        ) {
            invoice.customer =
                repairOrder.customer || "";

            didChange = true;
        }

        if (
            invoice.unit !==
            repairOrder.unit
        ) {
            invoice.unit =
                repairOrder.unit || "";

            didChange = true;
        }

        if (
            invoice.complaint !==
            repairOrder.complaint
        ) {
            invoice.complaint =
                repairOrder.complaint || "";

            didChange = true;
        }
    });

    if (didChange) {
        saveInvoices(invoices);
    }

    return invoices;
}

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

renderInvoices();
const invoices =
    syncInvoicesFromRepairOrders();