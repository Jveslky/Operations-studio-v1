/* =========================
   SHOP DASHBOARD
========================= */


/* =========================
   PAGE ELEMENTS
========================= */

const openRepairOrderCount =
    document.getElementById(
        "open-repair-order-count"
    );

const waitingApprovalCount =
    document.getElementById(
        "waiting-approval-count"
    );

const readyPaymentCount =
    document.getElementById(
        "ready-payment-count"
    );

const openInvoiceCount =
    document.getElementById(
        "open-invoice-count"
    );

const accountsReceivable =
    document.getElementById(
        "accounts-receivable"
    );

const accountsPayable =
    document.getElementById(
        "accounts-payable"
    );

const netPosition =
    document.getElementById(
        "net-position"
    );

const financeSection =
    document.getElementById(
        "shop-finance-section"
    );

const repairOrderActivity =
    document.getElementById(
        "repair-order-activity"
    );

const invoiceActivity =
    document.getElementById(
        "invoice-activity"
    );

function formatCurrency(value) {
    return (Number(value) || 0).toLocaleString(
        "en-US",
        {
            style: "currency",
            currency: "USD"
        }
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


/* =========================
   KPI CARDS
========================= */

function renderKpis(
    repairOrders,
    invoices,
    bills
) {
    const finishedStatuses =
        new Set([
            "Complete",
            "Ready for Pickup",
            "Ready for Payment",
            "Awaiting Payment",
            "Closed"
        ]);

    const openOrders =
        repairOrders.filter(
            function (order) {
                return !finishedStatuses.has(
                    order.status
                );
            }
        );

    const waitingApprovalOrders =
        repairOrders.filter(
            function (order) {
                return (
                    order.status ===
                    "Waiting Approval"
                );
            }
        );

    const readyPaymentOrders =
        repairOrders.filter(
            function (order) {
                return (
                    order.status ===
                    "Ready for Payment" ||
                    order.status ===
                    "Awaiting Payment"
                );
            }
        );

    const openInvoices =
        invoices.filter(
            function (invoice) {
                return invoice.status !== "Paid";
            }
        );

    const receivableAmount =
        invoices
            .filter(
                function (invoice) {
                    return invoice.status === "Sent";
                }
            )
            .reduce(
                function (total, invoice) {
                    return (
                        total +
                        (Number(invoice.total) || 0)
                    );
                },
                0
            );

    const payableAmount =
        bills
            .filter(
                function (bill) {
                    return String(bill.status).toLowerCase() !== "paid";
                }
            )
            .reduce(
                function (total, bill) {
                    return (
                        total +
                        (Number(bill.total ?? bill.amount) || 0)
                    );
                },
                0
            );

    const netAmount =
        receivableAmount -
        payableAmount;

    openRepairOrderCount.textContent =
        openOrders.length;

    waitingApprovalCount.textContent =
        waitingApprovalOrders.length;

    readyPaymentCount.textContent =
        readyPaymentOrders.length;

    openInvoiceCount.textContent =
        openInvoices.length;

    accountsReceivable.textContent =
        formatCurrency(
            receivableAmount
        );

    accountsPayable.textContent =
        formatCurrency(
            payableAmount
        );

    netPosition.textContent =
        formatCurrency(
            netAmount
        );
}

   
/* =========================
   REPAIR ORDER ACTIVITY
========================= */

function getInvoiceDisplayStatus(invoice) {
    if (invoice.status === "Paid") {
        return "Paid";
    }

    const today =
        new Date();

    today.setHours(
        0,
        0,
        0,
        0
    );

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

function renderRepairOrderActivity(
    repairOrders
) {
    const statusPriority = {
        "Needs Info": 1,
        "Waiting Approval": 2,
        "Waiting Customer": 3,
        "Waiting Parts": 4,
        "Open": 5,
        "Scheduled": 6,
        "In Progress": 7
    };

    const attentionOrders =
        repairOrders
            .filter(function (order) {
                return Object.hasOwn(
                    statusPriority,
                    order.status
                );
            })
            .sort(function (
                firstOrder,
                secondOrder
            ) {
                const statusDifference =
                    statusPriority[firstOrder.status] -
                    statusPriority[secondOrder.status];

                if (statusDifference !== 0) {
                    return statusDifference;
                }

                return (
                    Number(secondOrder.id) -
                    Number(firstOrder.id)
                );
            })
            .slice(0, 4);

    if (attentionOrders.length === 0) {
        repairOrderActivity.innerHTML = `
            <strong>
                No repair orders need attention
            </strong>

            <p>
                Waiting approvals, parts,
                customer responses, and missing
                information will appear here.
            </p>
        `;

        return;
    }

    repairOrderActivity.innerHTML =
        attentionOrders
            .map(function (order) {
                return `
                    <a
                        class="dashboard-activity-item"
                        href="repair-order-details.html?id=${escapeHtml(order.id)}"
                    >
                        <div class="activity-item-heading">
                            <strong>
                                RO #${escapeHtml(order.id)}
                            </strong>

                            <span class="activity-status">
                                ${escapeHtml(order.status)}
                            </span>
                        </div>

                        <p class="activity-customer">
                            ${escapeHtml(
                    order.customer ||
                    "No customer"
                )}
                            &bull;
                            ${escapeHtml(
                    order.unit ||
                    "No unit"
                )}
                        </p>

                        <p class="activity-detail">
                            ${escapeHtml(
                    order.complaint ||
                    "No work description entered"
                )}
                        </p>
                    </a>
                `;
            })
            .join("");
}
/* =========================
   INVOICE ACTIVITY
========================= */

function renderInvoiceActivity(invoices) {
    const unpaidInvoices =
        invoices
            .filter(function (invoice) {
                return invoice.status !== "Paid";
            })
            .sort(function (
                firstInvoice,
                secondInvoice
            ) {
                const firstStatus =
                    getInvoiceDisplayStatus(
                        firstInvoice
                    );

                const secondStatus =
                    getInvoiceDisplayStatus(
                        secondInvoice
                    );

                if (
                    firstStatus === "Overdue" &&
                    secondStatus !== "Overdue"
                ) {
                    return -1;
                }

                if (
                    secondStatus === "Overdue" &&
                    firstStatus !== "Overdue"
                ) {
                    return 1;
                }

                return (
                    Number(secondInvoice.id) -
                    Number(firstInvoice.id)
                );
            })
            .slice(0, 4);

    if (unpaidInvoices.length === 0) {
        invoiceActivity.innerHTML = `
            <strong>
                No outstanding invoices
            </strong>

            <p>
                Draft, sent, and overdue
                invoices will appear here.
            </p>
        `;

        return;
    }

    invoiceActivity.innerHTML =
        unpaidInvoices
            .map(function (invoice) {
                const displayStatus =
                    getInvoiceDisplayStatus(
                        invoice
                    );

                return `
                    <a
                        class="dashboard-activity-item"
                        href="invoice-details.html?id=${escapeHtml(invoice.id)}"
                    >
                        <div class="activity-item-heading">
                            <strong>
                                Invoice #${escapeHtml(invoice.id)}
                            </strong>

                            <span class="activity-status activity-${displayStatus.toLowerCase()}">
                                ${escapeHtml(displayStatus)}
                            </span>
                        </div>

                        <p class="activity-customer">
                            ${escapeHtml(
                    invoice.customer ||
                    "No customer"
                )}
                        </p>

                        <p class="activity-detail">
                            ${formatCurrency(invoice.total)}
                            ${invoice.dueDate
                        ? ` &bull; Due ${escapeHtml(invoice.dueDate)}`
                        : ""
                    }
                        </p>
                    </a>
                `;
            })
            .join("");
}



/* =========================
   INITIAL LOAD
========================= */

async function renderShopDashboard() {
    try {
        const context = await window.trackRightAuthReady;
        if (context.role === "service_writer") {
            document.getElementById("shop-dashboard-title").textContent = "Service Writer Workspace";
            document.getElementById("shop-dashboard-description").textContent =
                "Manage intake, scheduling, approvals, repair-order flow, and customer billing.";
        }
        await window.trackRightRepairOrders.migrateBrowserOrders();
        await window.trackRightInvoices.migrateBrowserInvoices();

        const canViewFinancialSnapshot = ["owner", "admin"].includes(context.role);
        financeSection.hidden = !canViewFinancialSnapshot;

        const [repairOrders, invoices, billsResult] = await Promise.all([
            window.trackRightRepairOrders.list(),
            window.trackRightInvoices.list(),
            canViewFinancialSnapshot
                ? window.trackRightSupabase
                    .from("shop_accounts_payable")
                    .select("total,status")
                    .eq("shop_id", context.shopId)
                : Promise.resolve({ data: [], error: null })
        ]);

        if (billsResult.error) {
            throw billsResult.error;
        }

        const activeRepairOrders = repairOrders.filter(function (order) {
            return order.archived !== true;
        });

        renderKpis(activeRepairOrders, invoices, billsResult.data || []);
        renderRepairOrderActivity(activeRepairOrders);
        renderInvoiceActivity(invoices);
    } catch (error) {
        console.error("Shop dashboard could not be refreshed.", error);
        repairOrderActivity.innerHTML = `
            <strong>Dashboard data is unavailable</strong>
            <p>Refresh the page or sign in again.</p>
        `;
        invoiceActivity.innerHTML = `
            <strong>Dashboard data is unavailable</strong>
            <p>No browser-only fallback was used.</p>
        `;
    }
}

renderShopDashboard();
