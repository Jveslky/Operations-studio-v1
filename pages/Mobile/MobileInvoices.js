const invoices = [
    {
        id: "invoice-1001",
        number: "INV-1001",
        jobId: "job-1003",
        customer: "Smith Residence",
        contact: "Robert Smith",
        address: "123 Main Street",
        asset: "2020 Chevrolet Equinox",
        status: "Draft",
        invoiceDate: "2026-08-13",
        dueDate: "2026-08-13",
        notes: "Thank you for your business.",
        taxRate: 0,
        paidAmount: 0,
        lines: [
            {
                description: "Service Call",
                quantity: 1,
                rate: 95
            },
            {
                description: "No-start diagnosis",
                quantity: 1,
                rate: 125
            },
            {
                description: "Battery",
                quantity: 1,
                rate: 189.95
            }
        ]
    },

    {
        id: "invoice-1002",
        number: "INV-1002",
        jobId: "job-1004",
        customer: "ABC Transport",
        contact: "Mike Carter",
        address: "Customer Yard",
        asset: "Truck 8 - Freightliner Cascadia",
        status: "Sent",
        invoiceDate: "2026-08-08",
        dueDate: "2026-08-22",
        notes: "",
        taxRate: 0,
        paidAmount: 0,
        lines: [
            {
                description: "Service Call",
                quantity: 1,
                rate: 150
            },
            {
                description: "Electrical diagnosis",
                quantity: 2.5,
                rate: 150
            },
            {
                description: "Harness repair",
                quantity: 1,
                rate: 225
            }
        ]
    },

    {
        id: "invoice-1003",
        number: "INV-1003",
        jobId: "job-987",
        customer: "Jones Excavating",
        contact: "Tom Jones",
        address: "North Jobsite",
        asset: "CAT 320 Excavator",
        status: "Past Due",
        invoiceDate: "2026-07-10",
        dueDate: "2026-07-24",
        notes: "",
        taxRate: 0,
        paidAmount: 500,
        lines: [
            {
                description: "Service Call",
                quantity: 1,
                rate: 175
            },
            {
                description: "Hydraulic diagnosis and repair",
                quantity: 5,
                rate: 150
            },
            {
                description: "Hydraulic hose assembly",
                quantity: 1,
                rate: 385
            }
        ]
    },

    {
        id: "invoice-1004",
        number: "INV-1004",
        jobId: "job-952",
        customer: "Miller Landscaping",
        contact: "",
        address: "Customer Yard",
        asset: "Takeuchi TL12",
        status: "Paid",
        invoiceDate: "2026-08-01",
        dueDate: "2026-08-01",
        notes: "",
        taxRate: 0,
        paidAmount: 765,
        lines: [
            {
                description: "Service Call",
                quantity: 1,
                rate: 125
            },
            {
                description: "Hydraulic hose replacement",
                quantity: 2,
                rate: 150
            },
            {
                description: "Hydraulic hose",
                quantity: 1,
                rate: 340
            }
        ]
    }
];


let selectedInvoiceId =
    null;


let currentFilter =
    "All";


const invoiceList =
    document.getElementById(
        "invoiceList"
    );


const invoiceDetailPanel =
    document.getElementById(
        "invoiceDetailPanel"
    );


const summaryGrid =
    document.querySelector(
        ".summary-grid"
    );


const filterPanel =
    document.querySelector(
        ".filter-panel"
    );


function money(
    value
) {

    return Number(value)
        .toLocaleString(
            "en-US",
            {
                style:
                    "currency",

                currency:
                    "USD"
            }
        );

}


function calculateInvoiceSubtotal(
    invoice
) {

    return invoice.lines.reduce(
        function (
            total,
            line
        ) {

            return total +
                (
                    Number(line.quantity) *
                    Number(line.rate)
                );

        },
        0
    );

}


function calculateInvoiceTax(
    invoice
) {

    return calculateInvoiceSubtotal(
        invoice
    ) * Number(
        invoice.taxRate || 0
    );

}


function calculateInvoiceTotal(
    invoice
) {

    return (
        calculateInvoiceSubtotal(
            invoice
        ) +
        calculateInvoiceTax(
            invoice
        )
    );

}


function calculateInvoiceBalance(
    invoice
) {

    return Math.max(
        0,
        calculateInvoiceTotal(
            invoice
        ) -
        Number(
            invoice.paidAmount || 0
        )
    );

}


function renderInvoices() {

    invoiceList.innerHTML =
        "";


    invoices
        .filter(
            function (invoice) {

                if (
                    currentFilter === "All"
                ) {
                    return true;
                }


                return invoice.status ===
                    currentFilter;

            }
        )
        .forEach(
            function (invoice) {

                const card =
                    document.createElement(
                        "article"
                    );


                card.className =
                    "invoice-card";


                const statusClass =
                    invoice.status
                        .toLowerCase()
                        .replaceAll(
                            " ",
                            "-"
                        );


                card.innerHTML =
                    `
                        <div>

                            <h3>
                                ${escapeHtml(invoice.number)}
                                ·
                                ${escapeHtml(invoice.customer)}
                            </h3>

                            <p>
                                ${escapeHtml(invoice.asset || "No asset")}
                            </p>

                            <div class="invoice-card-meta">

                                <span>
                                    Job: ${escapeHtml(invoice.jobId)}
                                </span>

                                <span>
                                    Due: ${formatDate(invoice.dueDate)}
                                </span>

                            </div>

                        </div>


                        <div class="invoice-card-right">

                            <strong>
                                ${money(calculateInvoiceBalance(invoice))}
                            </strong>

                            <span class="invoice-status ${statusClass}">
                                ${escapeHtml(invoice.status)}
                            </span>

                        </div>
                    `;


                card.addEventListener(
                    "click",
                    function () {

                        openInvoice(
                            invoice.id
                        );

                    }
                );


                invoiceList.appendChild(
                    card
                );

            }
        );


    updateInvoiceSummary();

}


function updateInvoiceSummary() {

    const draftCount =
        invoices.filter(
            function (invoice) {
                return invoice.status ===
                    "Draft";
            }
        ).length;


    const sentCount =
        invoices.filter(
            function (invoice) {
                return invoice.status ===
                    "Sent";
            }
        ).length;


    const pastDueCount =
        invoices.filter(
            function (invoice) {
                return invoice.status ===
                    "Past Due";
            }
        ).length;


    const outstanding =
        invoices
            .filter(
                function (invoice) {

                    return invoice.status !==
                        "Paid";

                }
            )
            .reduce(
                function (
                    total,
                    invoice
                ) {

                    return total +
                        calculateInvoiceBalance(
                            invoice
                        );

                },
                0
            );


    document.getElementById(
        "draftInvoiceCount"
    ).textContent =
        draftCount;


    document.getElementById(
        "sentInvoiceCount"
    ).textContent =
        sentCount;


    document.getElementById(
        "pastDueInvoiceCount"
    ).textContent =
        pastDueCount;


    document.getElementById(
        "outstandingInvoiceTotal"
    ).textContent =
        money(
            outstanding
        );

}


function openInvoice(
    invoiceId
) {

    const invoice =
        invoices.find(
            function (item) {
                return item.id ===
                    invoiceId;
            }
        );


    if (!invoice) {
        return;
    }


    selectedInvoiceId =
        invoice.id;


    invoiceList.classList.add(
        "hidden"
    );


    summaryGrid.classList.add(
        "hidden"
    );


    filterPanel.classList.add(
        "hidden"
    );


    document.getElementById(
        "newInvoiceButton"
    ).classList.add(
        "hidden"
    );


    invoiceDetailPanel.classList.remove(
        "hidden"
    );


    document.getElementById(
        "detailInvoiceNumber"
    ).textContent =
        invoice.number;


    document.getElementById(
        "detailInvoiceCustomer"
    ).textContent =
        invoice.customer;


    document.getElementById(
        "detailInvoiceStatus"
    ).textContent =
        invoice.status;


    document.getElementById(
        "detailInvoiceJob"
    ).textContent =
        invoice.jobId;


    document.getElementById(
        "detailInvoiceAsset"
    ).textContent =
        invoice.asset ||
        "—";


    document.getElementById(
        "detailInvoiceDate"
    ).textContent =
        formatDate(
            invoice.invoiceDate
        );


    document.getElementById(
        "detailInvoiceDueDate"
    ).textContent =
        formatDate(
            invoice.dueDate
        );


    document.getElementById(
        "detailBillToName"
    ).textContent =
        invoice.customer;


    document.getElementById(
        "detailBillToContact"
    ).textContent =
        invoice.contact ||
        "No contact listed";


    document.getElementById(
        "detailBillToAddress"
    ).textContent =
        invoice.address ||
        "No address listed";


    document.getElementById(
        "invoiceNotes"
    ).value =
        invoice.notes ||
        "";


    renderInvoiceLines(
        invoice
    );


    updateInvoiceTotals(
        invoice
    );

}


function renderInvoiceLines(
    invoice
) {

    const invoiceLineList =
        document.getElementById(
            "invoiceLineList"
        );


    invoiceLineList.innerHTML =
        "";


    invoice.lines.forEach(
        function (
            line,
            index
        ) {

            const row =
                document.createElement(
                    "div"
                );


            row.className =
                "invoice-line";


            row.innerHTML =
                `
                    <input
                        class="invoice-description"
                        type="text"
                        value="${escapeHtml(line.description)}"
                        placeholder="Description"
                    >

                    <input
                        class="invoice-quantity"
                        type="number"
                        min="0"
                        step="0.1"
                        value="${line.quantity}"
                        placeholder="Qty"
                    >

                    <input
                        class="invoice-rate"
                        type="number"
                        min="0"
                        step="0.01"
                        value="${line.rate}"
                        placeholder="Rate"
                    >

                    <button
                        class="remove-line-button"
                        type="button"
                    >
                        Remove
                    </button>
                `;


            row
                .querySelectorAll(
                    "input"
                )
                .forEach(
                    function (input) {

                        input.addEventListener(
                            "input",
                            function () {

                                syncInvoiceLines(
                                    invoice
                                );

                                updateInvoiceTotals(
                                    invoice
                                );

                            }
                        );

                    }
                );


            row
                .querySelector(
                    ".remove-line-button"
                )
                .addEventListener(
                    "click",
                    function () {

                        invoice.lines.splice(
                            index,
                            1
                        );


                        renderInvoiceLines(
                            invoice
                        );


                        updateInvoiceTotals(
                            invoice
                        );

                    }
                );


            invoiceLineList.appendChild(
                row
            );

        }
    );

}


function syncInvoiceLines(
    invoice
) {

    invoice.lines =
        [];


    document
        .querySelectorAll(
            ".invoice-line"
        )
        .forEach(
            function (row) {

                invoice.lines.push(
                    {
                        description:
                            row.querySelector(
                                ".invoice-description"
                            ).value.trim(),

                        quantity:
                            Number(
                                row.querySelector(
                                    ".invoice-quantity"
                                ).value
                            ) || 0,

                        rate:
                            Number(
                                row.querySelector(
                                    ".invoice-rate"
                                ).value
                            ) || 0
                    }
                );

            }
        );

}


function updateInvoiceTotals(
    invoice
) {

    const subtotal =
        calculateInvoiceSubtotal(
            invoice
        );


    const tax =
        calculateInvoiceTax(
            invoice
        );


    const total =
        calculateInvoiceTotal(
            invoice
        );


    const paid =
        Number(
            invoice.paidAmount || 0
        );


    const balance =
        calculateInvoiceBalance(
            invoice
        );


    document.getElementById(
        "invoiceSubtotal"
    ).textContent =
        money(subtotal);


    document.getElementById(
        "invoiceTax"
    ).textContent =
        money(tax);


    document.getElementById(
        "invoiceTotal"
    ).textContent =
        money(total);


    document.getElementById(
        "invoicePaid"
    ).textContent =
        money(paid);


    document.getElementById(
        "invoiceBalance"
    ).textContent =
        money(balance);


    document.getElementById(
        "detailInvoiceBalance"
    ).textContent =
        money(balance);

}


document.querySelectorAll(
    ".filter-button"
).forEach(
    function (button) {

        button.addEventListener(
            "click",
            function () {

                currentFilter =
                    button.dataset.filter;


                document
                    .querySelectorAll(
                        ".filter-button"
                    )
                    .forEach(
                        function (item) {

                            item.classList.remove(
                                "active"
                            );

                        }
                    );


                button.classList.add(
                    "active"
                );


                renderInvoices();

            }
        );

    }
);


document.getElementById(
    "closeInvoiceDetailButton"
).addEventListener(
    "click",
    function () {

        selectedInvoiceId =
            null;


        invoiceDetailPanel.classList.add(
            "hidden"
        );


        invoiceList.classList.remove(
            "hidden"
        );


        summaryGrid.classList.remove(
            "hidden"
        );


        filterPanel.classList.remove(
            "hidden"
        );


        document.getElementById(
            "newInvoiceButton"
        ).classList.remove(
            "hidden"
        );


        document.getElementById(
            "paymentPanel"
        ).classList.add(
            "hidden"
        );


        renderInvoices();

    }
);


document.getElementById(
    "addInvoiceLineButton"
).addEventListener(
    "click",
    function () {

        const invoice =
            getSelectedInvoice();


        if (!invoice) {
            return;
        }


        invoice.lines.push(
            {
                description: "",
                quantity: 1,
                rate: 0
            }
        );


        renderInvoiceLines(
            invoice
        );


        updateInvoiceTotals(
            invoice
        );

    }
);


document.getElementById(
    "saveInvoiceButton"
).addEventListener(
    "click",
    function () {

        const invoice =
            getSelectedInvoice();


        if (!invoice) {
            return;
        }


        syncInvoiceLines(
            invoice
        );


        invoice.notes =
            document.getElementById(
                "invoiceNotes"
            ).value.trim();


        updateInvoiceTotals(
            invoice
        );

    }
);


document.getElementById(
    "sendInvoiceButton"
).addEventListener(
    "click",
    function () {

        const invoice =
            getSelectedInvoice();


        if (!invoice) {
            return;
        }


        syncInvoiceLines(
            invoice
        );


        invoice.status =
            "Sent";


        document.getElementById(
            "detailInvoiceStatus"
        ).textContent =
            invoice.status;


        updateInvoiceSummary();

    }
);


document.getElementById(
    "recordPaymentButton"
).addEventListener(
    "click",
    function () {

        const invoice =
            getSelectedInvoice();


        if (!invoice) {
            return;
        }


        const balance =
            calculateInvoiceBalance(
                invoice
            );


        document.getElementById(
            "paymentAmountInput"
        ).value =
            balance.toFixed(2);


        document.getElementById(
            "paymentPanel"
        ).classList.remove(
            "hidden"
        );

    }
);


document.getElementById(
    "closePaymentButton"
).addEventListener(
    "click",
    function () {

        document.getElementById(
            "paymentPanel"
        ).classList.add(
            "hidden"
        );

    }
);


document.getElementById(
    "applyPaymentButton"
).addEventListener(
    "click",
    function () {

        const invoice =
            getSelectedInvoice();


        if (!invoice) {
            return;
        }


        const amount =
            Number(
                document.getElementById(
                    "paymentAmountInput"
                ).value
            ) || 0;


        if (
            amount <= 0
        ) {
            return;
        }


        invoice.paidAmount +=
            amount;


        if (
            calculateInvoiceBalance(
                invoice
            ) <= 0
        ) {

            invoice.status =
                "Paid";

        }


        document.getElementById(
            "detailInvoiceStatus"
        ).textContent =
            invoice.status;


        updateInvoiceTotals(
            invoice
        );


        updateInvoiceSummary();


        document.getElementById(
            "paymentPanel"
        ).classList.add(
            "hidden"
        );

    }
);


document.getElementById(
    "backToJobButton"
).addEventListener(
    "click",
    function () {

        const invoice =
            getSelectedInvoice();


        if (!invoice) {
            return;
        }


        /*
            Placeholder.

            Eventually this should open
            the associated job directly.

            Example:

            window.location.href =
                "MobileJobs.html?job=" +
                encodeURIComponent(
                    invoice.jobId
                );
        */

        window.location.href =
            "MobileJobs.html";

    }
);


document.getElementById(
    "newInvoiceButton"
).addEventListener(
    "click",
    function () {

        /*
            Placeholder.

            Eventually this should either:

            1. Create from a Ready to Invoice job

            or

            2. Allow a standalone invoice
               if we decide we want that.
        */

        console.log(
            "New Invoice clicked"
        );

    }
);


function getSelectedInvoice() {

    return invoices.find(
        function (invoice) {

            return invoice.id ===
                selectedInvoiceId;

        }
    );

}


function formatDate(
    dateValue
) {

    if (!dateValue) {
        return "—";
    }


    const date =
        new Date(
            dateValue +
            "T12:00:00"
        );


    return date.toLocaleDateString(
        "en-US",
        {
            month:
                "short",

            day:
                "numeric",

            year:
                "numeric"
        }
    );

}


function escapeHtml(
    value
) {

    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

}


renderInvoices();

