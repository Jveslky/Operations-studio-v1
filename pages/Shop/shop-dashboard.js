/* =========================
   SHOP DASHBOARD
========================= */


const INVOICE_STORAGE_KEY =
    "track-right-invoices";

const ACCOUNTS_PAYABLE_STORAGE_KEY =
    "track-right-accounts-payable";


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

const repairOrderActivity =
    document.getElementById(
        "repair-order-activity"
    );

const invoiceActivity =
    document.getElementById(
        "invoice-activity"
    );

const settingsMenuButton =
    document.getElementById(
        "settings-menu-button"
    );

const settingsSidebar =
    document.getElementById(
        "settings-sidebar"
    );

const closeSettingsSidebar =
    document.getElementById(
        "close-settings-sidebar"
    );


settingsMenuButton.addEventListener(
    "click",
    function () {
        settingsSidebar.classList.add(
            "open"
        );
    }
);

closeSettingsSidebar.addEventListener(
    "click",
    function () {
        settingsSidebar.classList.remove(
            "open"
        );
    }
);


const dataManagementToggle =
    document.getElementById(
        "data-management-toggle"
    );

const dataManagementMenu =
    document.getElementById(
        "data-management-menu"
    );

const sidebarFullBackupButton =
    document.getElementById(
        "sidebar-full-backup-button"
    );

const sidebarImportBackupButton =
    document.getElementById(
        "sidebar-import-backup-button"
    );

const sidebarImportBackupInput =
    document.getElementById(
        "sidebar-import-backup-input"
    );


sidebarImportBackupButton.addEventListener(
    "click",
    function () {
        sidebarImportBackupInput.click();
    }
);





sidebarImportBackupButton.addEventListener(
    "click",
    function () {
        sidebarImportBackupInput.click();
    }
);

sidebarImportBackupInput.addEventListener(
    "change",
    function () {
        const selectedFile =
            sidebarImportBackupInput.files[0];

        if (!selectedFile) {
            return;
        }

        const fileReader =
            new FileReader();

        fileReader.addEventListener(
            "load",
            function () {
                try {
                    const backupData =
                        JSON.parse(
                            fileReader.result
                        );

                    const records =
                        backupData.records ||
                        backupData;

                    const shopStorageKeys = [
                        "track-right-customers",
                        "track-right-invoices",
                        "track-right-accounts-payable"
                    ];

                    Object.entries(
                        records
                    ).forEach(
                        function ([key, value]) {
                            const allowedKey =
                                key.startsWith(
                                    "repair-order-"
                                ) ||
                                shopStorageKeys.includes(
                                    key
                                );

                            if (!allowedKey) {
                                return;
                            }

                            localStorage.setItem(
                                key,
                                typeof value === "string"
                                    ? value
                                    : JSON.stringify(value)
                            );
                        }
                    );

                    alert(
                        "Backup imported successfully."
                    );

                    window.location.reload();

                } catch (error) {
                    console.error(error);

                    alert(
                        "That file could not be imported. Make sure it is a Track Right backup."
                    );
                }

                sidebarImportBackupInput.value =
                    "";
            }
        );

        fileReader.readAsText(
            selectedFile
        );
    }
);

sidebarFullBackupButton.addEventListener(
    "click",
    function () {
        const backupData = {
            appMode: "shop",
            exportedAt:
                new Date().toISOString(),
            records: {}
        };

        const shopStorageKeys = [
            "track-right-customers",
            "track-right-invoices",
            "track-right-accounts-payable"
        ];

        for (
            let index = 0;
            index < localStorage.length;
            index++
        ) {
            const key =
                localStorage.key(index);

            if (!key) {
                continue;
            }

            if (
                key.startsWith(
                    "repair-order-"
                )
            ) {
                const storedValue =
                    localStorage.getItem(
                        key
                    );

                try {
                    const storedOrder =
                        JSON.parse(
                            storedValue
                        );

                    if (
                        storedOrder &&
                        storedOrder.appMode ===
                        "shop"
                    ) {
                        backupData.records[key] =
                            storedValue;
                    }
                } catch (error) {
                    console.error(
                        "Unable to read repair order:",
                        key,
                        error
                    );
                }

                continue;
            }

            if (
                shopStorageKeys.includes(
                    key
                )
            ) {
                backupData.records[key] =
                    localStorage.getItem(
                        key
                    );
            }
        }

        const backupFile =
            new Blob(
                [
                    JSON.stringify(
                        backupData,
                        null,
                        2
                    )
                ],
                {
                    type: "application/json"
                }
            );

        const downloadUrl =
            URL.createObjectURL(
                backupFile
            );

        const downloadLink =
            document.createElement(
                "a"
            );

        const date =
            new Date()
                .toISOString()
                .slice(0, 10);

        downloadLink.href =
            downloadUrl;

        downloadLink.download =
            `track-right-shop-backup-${date}.json`;

        document.body.appendChild(
            downloadLink
        );

        downloadLink.click();
        downloadLink.remove();

        URL.revokeObjectURL(
            downloadUrl
        );
    }
);


dataManagementToggle.addEventListener(
    "click",
    function () {
        const isHidden =
            dataManagementMenu.hidden;

        dataManagementMenu.hidden =
            !isHidden;

        dataManagementToggle.setAttribute(
            "aria-expanded",
            String(isHidden)
        );
    }
);

/* =========================
   STORAGE
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


function getRepairOrders() {
    const orders = [];

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
            orders.push(order);
        }
    }

    return orders.sort(
        function (firstOrder, secondOrder) {
            return (
                Number(secondOrder.id) -
                Number(firstOrder.id)
            );
        }
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

function getAccountsPayable() {
    const bills =
        safelyParseStoredValue(
            ACCOUNTS_PAYABLE_STORAGE_KEY
        );

    return Array.isArray(bills)
        ? bills
        : [];
}


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
                    return bill.status !== "Paid";
                }
            )
            .reduce(
                function (total, bill) {
                    return (
                        total +
                        (Number(bill.amount) || 0)
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

function renderShopDashboard() {
    const repairOrders =
        getRepairOrders();

    const invoices =
        getInvoices();

    const bills =
        getAccountsPayable();

    renderKpis(
        repairOrders,
        invoices,
        bills
    );

    renderRepairOrderActivity(
        repairOrders
    );

    renderInvoiceActivity(
        invoices
    );
}

renderShopDashboard();