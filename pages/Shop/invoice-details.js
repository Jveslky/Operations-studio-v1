/* =========================
   CONFIGURATION
========================= */

const INVOICE_STORAGE_KEY =
    "track-right-invoices";

const CUSTOMER_STORAGE_KEY =
    "track-right-customers";

/* =========================
   PAGE ELEMENTS
========================= */

const invoiceDocument =
    document.getElementById(
        "invoice-document"
    );

const invoiceError =
    document.getElementById(
        "invoice-error"
    );

const invoiceNumber =
    document.getElementById(
        "invoice-number"
    );

const invoiceStatus =
    document.getElementById(
        "invoice-status"
    );

const invoiceCustomer =
    document.getElementById(
        "invoice-customer"
    );

const invoiceUnit =
    document.getElementById(
        "invoice-unit"
    );

const invoiceRepairOrder =
    document.getElementById(
        "invoice-repair-order"
    );

const invoiceCreatedDate =
    document.getElementById(
        "invoice-created-date"
    );

const invoiceDueDate =
    document.getElementById(
        "invoice-due-date"
    );

const invoicePaidDate =
    document.getElementById(
        "invoice-paid-date"
    );

const invoiceComplaint =
    document.getElementById(
        "invoice-complaint"
    );

const invoiceNotes =
    document.getElementById(
        "invoice-notes"
    );

const invoiceTotal =
    document.getElementById(
        "invoice-total"
    );

const printInvoiceButton =
    document.getElementById(
        "print-invoice-button"
    );

const sendInvoiceButton =
    document.getElementById(
        "send-invoice-button"
    );

const sendInvoiceModal =
    document.getElementById(
        "send-invoice-modal"
    );

const closeSendInvoiceModalButton =
    document.getElementById(
        "close-send-invoice-modal"
    );

const cancelSendInvoiceButton =
    document.getElementById(
        "cancel-send-invoice"
    );

const emailInvoiceButton =
    document.getElementById(
        "email-invoice-button"
    );

const textInvoiceButton =
    document.getElementById(
        "text-invoice-button"
    );

const sendInvoiceNumber =
    document.getElementById(
        "send-invoice-number"
    );

const sendInvoiceCustomer =
    document.getElementById(
        "send-invoice-customer"
    );

const sendInvoiceEmail =
    document.getElementById(
        "send-invoice-email"
    );

const sendInvoicePhone =
    document.getElementById(
        "send-invoice-phone"
    );

const sendInvoiceTotal =
    document.getElementById(
        "send-invoice-total"
    );

const sendInvoiceMessage =
    document.getElementById(
        "send-invoice-message"
    );

const markPaidButton =
    document.getElementById(
        "mark-paid-button"
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

function getCustomers() {
    const savedCustomers =
        localStorage.getItem(
            CUSTOMER_STORAGE_KEY
        );

    if (!savedCustomers) {
        return [];
    }

    try {
        const customers =
            JSON.parse(savedCustomers);

        return Array.isArray(customers)
            ? customers
            : [];
    } catch (error) {
        console.error(
            "Unable to load customers:",
            error
        );

        return [];
    }
}

function getInvoiceCustomer() {
    if (
        !currentInvoice ||
        !currentInvoice.customerId
    ) {
        return null;
    }

    return getCustomers().find(
        function (customer) {
            return (
                String(customer.id) ===
                String(
                    currentInvoice.customerId
                )
            );
        }
    ) || null;
}

/* =========================
   DISPLAY HELPERS
========================= */

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

function formatDate(value) {
    if (!value) {
        return "—";
    }

    const date = new Date(value);

    if (
        Number.isNaN(
            date.getTime()
        )
    ) {
        return value;
    }

    return date.toLocaleDateString(
        "en-US",
        {
            year: "numeric",
            month: "short",
            day: "numeric"
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
            ? new Date(
                `${invoice.dueDate}T00:00:00`
            )
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
   CURRENT INVOICE
========================= */

const pageParameters =
    new URLSearchParams(
        window.location.search
    );

const invoiceId =
    pageParameters.get("id");

let currentInvoice = null;

function findCurrentInvoice() {
    currentInvoice =
        getInvoices().find(
            function (invoice) {
                return (
                    String(invoice.id) ===
                    String(invoiceId)
                );
            }
        ) || null;
}


/* =========================
   RENDER INVOICE
========================= */

function renderInvoice() {
    findCurrentInvoice();

    if (!currentInvoice) {
        invoiceDocument.hidden = true;
        invoiceError.hidden = false;
        return;
    }

    invoiceDocument.hidden = false;
    invoiceError.hidden = true;

    const displayStatus =
        getInvoiceDisplayStatus(
            currentInvoice
        );

    invoiceNumber.textContent =
        `Invoice #${currentInvoice.id}`;

    invoiceStatus.textContent =
        displayStatus;

    invoiceCustomer.textContent =
        currentInvoice.customer || "—";

    invoiceUnit.textContent =
        currentInvoice.unit || "—";

    invoiceRepairOrder.textContent =
        currentInvoice.repairOrderId
            ? `RO #${currentInvoice.repairOrderId}`
            : "—";

    invoiceRepairOrder.href =
        currentInvoice.repairOrderId
            ? `repair-order-details.html?id=${currentInvoice.repairOrderId}`
            : "#";

    invoiceCreatedDate.textContent =
        formatDate(
            currentInvoice.createdAt
        );

    invoiceDueDate.textContent =
        formatDate(
            currentInvoice.dueDate
        );

    invoicePaidDate.textContent =
        formatDate(
            currentInvoice.paidAt
        );

    invoiceComplaint.textContent =
        currentInvoice.complaint ||
        "No work description entered.";

    invoiceNotes.textContent =
        currentInvoice.notes ||
        "No invoice notes entered.";

    invoiceTotal.textContent =
        formatCurrency(
            currentInvoice.total
        );

    sendInvoiceButton.hidden =
        displayStatus === "Paid";

    markPaidButton.hidden =
        displayStatus === "Paid";
}


/* =========================
   STATUS UPDATES
========================= */

function updateCurrentInvoiceStatus(
    newStatus
) {
    const invoices = getInvoices();

    const invoice =
        invoices.find(
            function (item) {
                return (
                    String(item.id) ===
                    String(invoiceId)
                );
            }
        );

    if (!invoice) {
        return;
    }

    invoice.status = newStatus;

    if (
        newStatus === "Sent" &&
        !invoice.sentAt
    ) {
        invoice.sentAt =
            new Date().toISOString();
    }

    if (newStatus === "Paid") {
        invoice.paidAt =
            new Date().toISOString();
    }

    saveInvoices(invoices);

    renderInvoice();
}

sendInvoiceButton.addEventListener(
    "click",
    function () {
        if (!currentInvoice) {
            return;
        }

        sendInvoiceNumber.textContent =
            `Invoice #${currentInvoice.id}`;

        sendInvoiceCustomer.textContent =
            currentInvoice.customer || "—";

        sendInvoiceTotal.textContent =
            formatCurrency(
                currentInvoice.total
            );

        const customer =
            getInvoiceCustomer();

        sendInvoiceEmail.textContent =
            customer?.email || "No email on file";

        sendInvoicePhone.textContent =
            customer?.phone || "No phone on file";

        if (currentInvoice.status === "Draft") {
            sendInvoiceMessage.value =
                `Invoice #${currentInvoice.id} is ready. Total due: ${formatCurrency(currentInvoice.total)}.`;
        } else {
            sendInvoiceMessage.value =
                `Just a reminder that invoice #${currentInvoice.id} has an outstanding balance of ${formatCurrency(currentInvoice.total)}. Please let us know if you have any questions.`;
        }

        sendInvoiceModal.hidden = false;
    }
);

function closeSendInvoiceModal() {
    sendInvoiceModal.hidden = true;
}

closeSendInvoiceModalButton.addEventListener(
    "click",
    closeSendInvoiceModal
);

cancelSendInvoiceButton.addEventListener(
    "click",
    closeSendInvoiceModal
);

emailInvoiceButton.addEventListener(
    "click",
    function () {
        if (!currentInvoice) {
            return;
        }

        const customer =
            getInvoiceCustomer();

        if (!customer?.email) {
            alert(
                "This customer does not have an email address on file."
            );
            return;
        }

        const subject =
            `Invoice #${currentInvoice.id}`;

        const message =
            sendInvoiceMessage.value.trim();

        updateCurrentInvoiceStatus(
            "Sent"
        );

        closeSendInvoiceModal();

        window.location.href =
            `mailto:${customer.email}` +
            `?subject=${encodeURIComponent(subject)}` +
            `&body=${encodeURIComponent(message)}`;
    }
);

textInvoiceButton.addEventListener(
    "click",
    function () {
        if (!currentInvoice) {
            return;
        }

        const customer =
            getInvoiceCustomer();

        if (!customer?.phone) {
            alert(
                "This customer does not have a phone number on file."
            );
            return;
        }

        const message =
            sendInvoiceMessage.value.trim();

        updateCurrentInvoiceStatus(
            "Sent"
        );

        closeSendInvoiceModal();

        window.location.href =
            `sms:${customer.phone}` +
            `?body=${encodeURIComponent(message)}`;
    }
);

markPaidButton.addEventListener(
    "click",
    function () {
        updateCurrentInvoiceStatus(
            "Paid"
        );
    }
);

printInvoiceButton.addEventListener(
    "click",
    function () {
        window.print();
    }
);


/* =========================
   INITIAL LOAD
========================= */

renderInvoice();