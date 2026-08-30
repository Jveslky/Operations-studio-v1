const expenses = [];


const expenseFormPanel =
    document.getElementById(
        "expenseFormPanel"
    );

let selectedExpenseId =
    null;


const expenseDetailPanel =
    document.getElementById(
        "expenseDetailPanel"
    );



document.getElementById(
    "scanReceiptButton"
).addEventListener(
    "click",
    function () {

        expenseFormPanel.classList.remove(
            "hidden"
        );

        document.getElementById(
            "expenseDateInput"
        ).value =
            "2026-08-15";

        document.getElementById(
            "expenseVendorInput"
        ).value =
            "NAPA Auto Parts";

        document.getElementById(
            "expenseAmountInput"
        ).value =
            "187.42";

        document.getElementById(
            "expenseCategoryInput"
        ).value =
            "Parts";

        document.getElementById(
            "expenseNotesInput"
        ).value =
            "Brake fittings and air line";

        document.getElementById(
            "receiptStatus"
        ).textContent =
            "Receipt scanned successfully";

    }
);


document.getElementById(
    "manualExpenseButton"
).addEventListener(
    "click",
    function () {

        clearExpenseForm();

        expenseFormPanel.classList.remove(
            "hidden"
        );

    }
);


document.getElementById(
    "closeExpenseFormButton"
).addEventListener(
    "click",
    function () {

        expenseFormPanel.classList.add(
            "hidden"
        );

    }
);

const customers = [
    "ABC Transport",
    "Jones Excavating",
    "Smith Residence"
];


const jobs = [
    {
        id: "job-1001",
        customer: "ABC Transport",
        label: "Truck 12 - Air Leak"
    },
    {
        id: "job-1002",
        customer: "Jones Excavating",
        label: "Excavator 3 - Hydraulic Leak"
    },
    {
        id: "job-1003",
        customer: "Smith Residence",
        label: "Equinox - No Start"
    }
];


document.getElementById(
    "saveExpenseButton"
).addEventListener(
    "click",
    function () {

        const vendor =
            document.getElementById(
                "expenseVendorInput"
            ).value.trim();

        const amount =
            Number(
                document.getElementById(
                    "expenseAmountInput"
                ).value
            );

        if (
            !vendor ||
            !amount
        ) {

            document.getElementById(
                "expenseFormMessage"
            ).textContent =
                "Vendor and amount are required.";

       
            return;

        }


        expenses.push(
            {
                id:
                    "expense-" +
                    Date.now(),

                date:
                    document.getElementById(
                        "expenseDateInput"
                    ).value,

                vendor:
                    vendor,

                amount:
                    amount,

                category:
                    document.getElementById(
                        "expenseCategoryInput"
                    ).value,

                customer:
                    document.getElementById(
                        "expenseCustomerInput"
                    ).value,

                job:
                    document.getElementById(
                        "expenseJobInput"
                    ).value,

                notes:
                    document.getElementById(
                        "expenseNotesInput"
                    ).value.trim(),

              receipt:
                    document.getElementById(
                        "receiptStatus"
                    ).textContent ===
                    "Receipt scanned successfully",
            }
        );


        renderExpenses();

        clearExpenseForm();

        expenseFormPanel.classList.add(
            "hidden"
        );

    }
);

document.getElementById(
    "expenseCustomerInput"
).addEventListener(
    "change",
    function () {
        renderExpenseJobs();
    }
);

function renderExpenseCustomers() {

    const customerSelect =
        document.getElementById(
            "expenseCustomerInput"
        );

    customerSelect.innerHTML =
        `
            <option value="">
                Not Linked
            </option>
        `;

    customers.forEach(
        function (customer) {

            const option =
                document.createElement(
                    "option"
                );

            option.value =
                customer;

            option.textContent =
                customer;

            customerSelect.appendChild(
                option
            );

        }
    );
}

function renderExpenseJobs() {

    const selectedCustomer =
        document.getElementById(
            "expenseCustomerInput"
        ).value;

    const jobSelect =
        document.getElementById(
            "expenseJobInput"
        );

    jobSelect.innerHTML =
        `
            <option value="">
                Not Linked
            </option>
        `;

    if (!selectedCustomer) {
        return;
    }

    const customerJobs =
        jobs.filter(
            function (job) {
                return job.customer ===
                    selectedCustomer;
            }
        );

    customerJobs.forEach(
        function (job) {

            const option =
                document.createElement(
                    "option"
                );

            option.value =
                job.id;

            option.textContent =
                job.label;

            jobSelect.appendChild(
                option
            );

        }
    );
}


function clearExpenseForm() {

    document.getElementById(
        "expenseDateInput"
    ).value =
        "";

    document.getElementById(
        "expenseVendorInput"
    ).value =
        "";

    document.getElementById(
        "expenseAmountInput"
    ).value =
        "";

    document.getElementById(
        "expenseCategoryInput"
    ).value =
        "";

    document.getElementById(
        "expenseCustomerInput"
    ).value =
        "";

    document.getElementById(
        "expenseJobInput"
    ).value =
        "";

    document.getElementById(
        "expenseNotesInput"
    ).value =
        "";

    document.getElementById(
        "receiptStatus"
    ).textContent =
        "No receipt attached";

    document.getElementById(
        "expenseFormMessage"
    ).textContent =
        "";

}


function renderExpenses() {

    const expenseList =
        document.getElementById(
            "expenseList"
        );

    expenseList.innerHTML =
        "";


    expenses.forEach(
        function (expense) {

            const card =
                document.createElement(
                    "article"
                );

            card.className =
                "expense-card";

            const linkedJob =
                jobs.find(
                    function (job) {
                        return job.id === expense.job;
                    }
                );

            const jobLabel =
                linkedJob
                    ? linkedJob.label
                    : "";

            card.innerHTML =
                `
        <div>
            <strong>
                ${expense.vendor}
            </strong>

            <p>
                ${expense.date || "No date"}
                ·
                ${expense.category || "Uncategorized"}
            </p>

            ${jobLabel
                    ? `
                        <p>
                            Job: ${jobLabel}
                        </p>
                    `
                    : ""
                }
        </div>

        <strong>
            ${expense.amount.toLocaleString(
                    "en-US",
                    {
                        style: "currency",
                        currency: "USD"
                    }
                )}
        </strong>
    `;

            card.addEventListener(
                "click",
                function () {

                    openExpense(
                        expense.id
                    );

                }
            );

            card.tabIndex =
                0;

            card.setAttribute(
                "role",
                "button"
            );

            card.addEventListener(
                "keydown",
                function (event) {

                    if (
                        event.key === "Enter" ||
                        event.key === " "
                    ) {

                        event.preventDefault();

                        openExpense(
                            expense.id
                        );

                    }

                }
            );

            expenseList.appendChild(
                card
            );

        }
    );


    updateExpenseTotals();

}

function openExpense(
    expenseId
) {

    const expense =
        expenses.find(
            function (item) {
                return item.id ===
                    expenseId;
            }
        );

    if (!expense) {
        return;
    }


    selectedExpenseId =
        expense.id;


    const linkedJob =
        jobs.find(
            function (job) {
                return job.id ===
                    expense.job;
            }
        );


    document.getElementById(
        "detailExpenseVendor"
    ).textContent =
        expense.vendor;


    document.getElementById(
        "detailExpenseDate"
    ).textContent =
        expense.date ||
        "No date";


    document.getElementById(
        "detailExpenseAmount"
    ).textContent =
        formatMoney(
            expense.amount
        );


    document.getElementById(
        "detailExpenseCategory"
    ).textContent =
        expense.category ||
        "Uncategorized";


    document.getElementById(
        "detailExpenseCustomer"
    ).textContent =
        expense.customer ||
        "Not Linked";


    document.getElementById(
        "detailExpenseJob"
    ).textContent =
        linkedJob
            ? linkedJob.label
            : "Not Linked";


    document.getElementById(
        "detailExpenseNotes"
    ).textContent =
        expense.notes ||
        "No notes";


    document.getElementById(
        "detailExpenseReceipt"
    ).textContent =
        expense.receipt
            ? "Receipt attached"
            : "No receipt attached";


    expenseDetailPanel.classList.remove(
        "hidden"
    );

}

document.getElementById(
    "closeExpenseDetailButton"
).addEventListener(
    "click",
    function () {

        selectedExpenseId =
            null;

        expenseDetailPanel.classList.add(
            "hidden"
        );

    }
);


function updateExpenseTotals() {

    let total =
        0;

    let parts =
        0;

    let fuel =
        0;

    let other =
        0;


    expenses.forEach(
        function (expense) {

            total +=
                expense.amount;

            if (
                expense.category ===
                "Parts"
            ) {

                parts +=
                    expense.amount;

            } else if (
                expense.category ===
                "Fuel / Travel"
            ) {

                fuel +=
                    expense.amount;

            } else {

                other +=
                    expense.amount;

            }

        }
    );


    document.getElementById(
        "monthlyExpenseTotal"
    ).textContent =
        formatMoney(total);

    document.getElementById(
        "partsExpenseTotal"
    ).textContent =
        formatMoney(parts);

    document.getElementById(
        "fuelExpenseTotal"
    ).textContent =
        formatMoney(fuel);

    document.getElementById(
        "otherExpenseTotal"
    ).textContent =
        formatMoney(other);

}


function formatMoney(
    amount
) {

    return amount.toLocaleString(
        "en-US",
        {
            style:
                "currency",

            currency:
                "USD"
        }
    );

}


renderExpenseCustomers();
renderExpenseJobs();
renderExpenses();