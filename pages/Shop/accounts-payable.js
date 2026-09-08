const addBillButton =
    document.getElementById(
        "add-bill-button"
    );

const billForm =
    document.getElementById(
        "bill-form"
    );

const closeBillFormButton =
    document.getElementById(
        "close-bill-form"
    );

const cancelBillFormButton =
    document.getElementById(
        "cancel-bill-form"
    );

const billList =
    document.getElementById(
        "bill-list"
    );

const openBillCount =
    document.getElementById(
        "open-bill-count"
    );

const dueSoonCount =
    document.getElementById(
        "due-soon-count"
    );

const overdueBillCount =
    document.getElementById(
        "overdue-bill-count"
    );

const totalPayable =
    document.getElementById(
        "total-payable"
    );

const exportApButton =
    document.getElementById(
        "export-ap-button"
    );

const apExportRange =
    document.getElementById(
        "ap-export-range"
    );

const apCustomRange =
    document.getElementById(
        "ap-custom-range"
    );

const apExportStart =
    document.getElementById(
        "ap-export-start"
    );

const apExportEnd =
    document.getElementById(
        "ap-export-end"
    );

apExportRange.addEventListener(
    "change",
    function () {
        const useCustomRange =
            apExportRange.value ===
            "custom";

        apCustomRange.hidden =
            !useCustomRange;
    }
);
function openBillForm() {
    billForm.hidden = false;

    billForm.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
}


function closeBillForm() {
    billForm.hidden = true;
    billForm.reset();
}


addBillButton.addEventListener(
    "click",
    openBillForm
);

closeBillFormButton.addEventListener(
    "click",
    closeBillForm
);

cancelBillFormButton.addEventListener(
    "click",
    closeBillForm
); const AP_STORAGE_KEY =
    "track-right-accounts-payable";

function formatCurrency(value) {
    return Number(value || 0).toLocaleString(
        "en-US",
        {
            style: "currency",
            currency: "USD"
        }
    );
}

function renderBills() {
    const bills =
        getBills();

    const today =
        new Date();

    today.setHours(0, 0, 0, 0);

    let openCount = 0;
    let dueSoon = 0;
    let overdueCount = 0;
    let payableTotal = 0;

    billList.innerHTML = "";

    bills.forEach(function (bill) {
        const isPaid =
            bill.status === "Paid";

        if (!isPaid) {
            openCount += 1;

            payableTotal +=
                Number(bill.amount) || 0;
        }

        let displayStatus =
            isPaid
                ? "Paid"
                : "Open";

        if (!isPaid && bill.dueDate) {
            const dueDate =
                new Date(
                    `${bill.dueDate}T00:00:00`
                );

            const difference =
                Math.ceil(
                    (dueDate - today) /
                    (1000 * 60 * 60 * 24)
                );

            if (difference < 0) {
                displayStatus = "Overdue";
                overdueCount += 1;
            } else if (difference <= 7) {
                displayStatus = "Due Soon";
                dueSoon += 1;
            }
        }

        const statusClass =
            displayStatus
                .toLowerCase()
                .replace(" ", "-");

        const card =
            document.createElement(
                "article"
            );

        card.className = "bill-card";

        card.innerHTML = `
    <div>
        <strong>
            ${bill.vendor || "No vendor"}
        </strong>

        <span>
            ${bill.reference || "No reference"}
        </span>
    </div>

    <div>
        <span>Amount</span>

        <strong>
            ${formatCurrency(bill.amount)}
        </strong>
    </div>

    <div>
        <span>Due</span>

        <strong>
            ${bill.dueDate || "No due date"}
        </strong>
    </div>

    <div>
       <div>
    <span>Status</span>
    <strong class="bill-status ${statusClass}">
        ${displayStatus}
    </strong>
</div>

    ${!isPaid
                ? `
            <div>
                <button
                    type="button"
                    data-action="mark-paid"
                    data-bill-id="${bill.id}">
                    Mark Paid
                </button>
            </div>
        `
                : ""
            }
`;

        billList.appendChild(card);

    });

    openBillCount.textContent =
        openCount;

    dueSoonCount.textContent =
        dueSoon;

    overdueBillCount.textContent =
        overdueCount;

    totalPayable.textContent =
        formatCurrency(
            payableTotal
        );

    if (billList.children.length === 0) {
        billList.innerHTML = `
            <p class="bill-list-empty">
                No vendor bills.
            </p>
        `;
    }
}

const billVendorInput =
    document.getElementById(
        "bill-vendor"
    );

const billReferenceInput =
    document.getElementById(
        "bill-reference"
    );

const billAmountInput =
    document.getElementById(
        "bill-amount"
    );

const billDueDateInput =
    document.getElementById(
        "bill-due-date"
    );

const billNotesInput =
    document.getElementById(
        "bill-notes"
    ); function getBills() {
        const savedBills =
            localStorage.getItem(
                AP_STORAGE_KEY
            );

        if (!savedBills) {
            return [];
        }

        try {
            const bills =
                JSON.parse(savedBills);

            return Array.isArray(bills)
                ? bills
                : [];
        } catch (error) {
            console.error(
                "Unable to load bills:",
                error
            );

            return [];
        }
    }


function saveBills(bills) {
    localStorage.setItem(
        AP_STORAGE_KEY,
        JSON.stringify(bills)
    );
} billForm.addEventListener(
    "submit",
    function (event) {
        event.preventDefault();

        const bills =
            getBills();

        const bill = {
            id:
                crypto.randomUUID(),

            vendor:
                billVendorInput
                    .value
                    .trim(),

            reference:
                billReferenceInput
                    .value
                    .trim(),

            amount:
                Number(
                    billAmountInput.value
                ) || 0,

            dueDate:
                billDueDateInput.value,

            notes:
                billNotesInput
                    .value
                    .trim(),

            status:
                "Open",

            createdAt:
                new Date().toISOString(),

            paidAt:
                null
        };

        bills.push(bill);

        saveBills(bills);

        renderBills();

        closeBillForm();

        console.log(
            "Bill saved:",
            bill
        );
    }
);

exportApButton.addEventListener(
    "click",
    function () {
        const bills =
            getBills();

        const selectedRange =
            apExportRange.value;

        const now =
            new Date();

        const filteredBills =
            bills.filter(
                function (bill) {
                    if (selectedRange === "all") {
                        return true;
                    }

                    if (!bill.createdAt) {
                        return false;
                    }

                    const billDate =
                        new Date(
                            bill.createdAt
                        );

                    if (selectedRange === "year") {
                        return (
                            billDate.getFullYear() ===
                            now.getFullYear()
                        );
                    }

                    if (selectedRange === "month") {
                        return (
                            billDate.getFullYear() ===
                            now.getFullYear() &&
                            billDate.getMonth() ===
                            now.getMonth()
                        );
                    }

                    if (selectedRange === "week") {
                        const weekStart =
                            new Date(now);

                        weekStart.setHours(
                            0,
                            0,
                            0,
                            0
                        );

                        weekStart.setDate(
                            now.getDate() -
                            now.getDay()
                        );

                        const weekEnd =
                            new Date(
                                weekStart
                            );

                        weekEnd.setDate(
                            weekStart.getDate() + 7
                        );

                        return (
                            billDate >= weekStart &&
                            billDate < weekEnd
                        );
                    }

                    if (selectedRange === "custom") {
                        if (
                            !apExportStart.value ||
                            !apExportEnd.value
                        ) {
                            return false;
                        }

                        const startDate =
                            new Date(
                                apExportStart.value
                            );

                        const endDate =
                            new Date(
                                apExportEnd.value
                            );

                        endDate.setHours(
                            23,
                            59,
                            59,
                            999
                        );

                        return (
                            billDate >= startDate &&
                            billDate <= endDate
                        );
                    }

                    return true;
                }
            );

        if (
            selectedRange === "custom" &&
            (
                !apExportStart.value ||
                !apExportEnd.value
            )
        ) {
            alert(
                "Select a start and end date."
            );

            return;
        }

        if (
            selectedRange === "custom" &&
            apExportEnd.value <
            apExportStart.value
        ) {
            alert(
                "End date cannot be before start date."
            );

            return;
        }

        if (filteredBills.length === 0) {
            alert(
                "No accounts payable records found for that date range."
            );

            return;
        }

        const headers = [
            "Vendor",
            "Reference",
            "Amount",
            "Due Date",
            "Status",
            "Created At",
            "Paid At",
            "Notes"
        ];

        const rows =
            filteredBills.map(
                function (bill) {
                    return [
                        bill.vendor || "",
                        bill.reference || "",
                        bill.amount || 0,
                        bill.dueDate || "",
                        bill.status || "",
                        bill.createdAt || "",
                        bill.paidAt || "",
                        bill.notes || ""
                    ];
                }
            );

        const csvRows = [
            headers,
            ...rows
        ];

        const csv =
            csvRows
                .map(
                    function (row) {
                        return row
                            .map(
                                function (value) {
                                    const escapedValue =
                                        String(value)
                                            .replace(
                                                /"/g,
                                                '""'
                                            );

                                    return `"${escapedValue}"`;
                                }
                            )
                            .join(",");
                    }
                )
                .join("\n");

        const exportFile =
            new Blob(
                [csv],
                {
                    type:
                        "text/csv;charset=utf-8;"
                }
            );

        const downloadUrl =
            URL.createObjectURL(
                exportFile
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
            `track-right-accounts-payable-${date}.csv`;

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


billList.addEventListener(
    "click",
    function (event) {
        const button =
            event.target.closest(
                'button[data-action="mark-paid"]'
            );

        if (!button) {
            return;
        }

        const bills =
            getBills();

        const bill =
            bills.find(
                function (item) {
                    return (
                        String(item.id) ===
                        String(
                            button.dataset.billId
                        )
                    );
                }
            );

        if (!bill) {
            return;
        }

        bill.status = "Paid";
        bill.paidAt =
            new Date().toISOString();
        saveBills(bills);

        renderBills();
    }
);

renderBills();