const jobs = [
    {
        id: "job-1001",
        customer: "ABC Transport",
        asset: "Truck 12 - Freightliner Cascadia",
        status: "Working",
        technician: "Jon",
        location: "Customer Yard",
        complaint: "Air leak near rear brake chamber.",
        technicianNotes: "",
        serviceCall: 125,
        miles: 18,
        travelHours: 0.5,
        labor: [
            {
                description: "Diagnose air leak",
                quantity: 1,
                rate: 150
            }
        ],
        parts: [],
        misc: []
    },

    {
        id: "job-1002",
        customer: "Jones Excavating",
        asset: "Excavator 3 - CAT 320",
        status: "Waiting on Parts",
        technician: "Jon",
        location: "North Jobsite",
        complaint: "Hydraulic leak at boom cylinder.",
        technicianNotes: "Leak confirmed at hose fitting.",
        serviceCall: 150,
        miles: 31,
        travelHours: 1,
        labor: [
            {
                description: "Hydraulic leak diagnosis",
                quantity: 1.5,
                rate: 150
            }
        ],
        parts: [],
        misc: []
    },

    {
        id: "job-1003",
        customer: "Smith Residence",
        asset: "2020 Chevrolet Equinox",
        status: "Ready to Invoice",
        technician: "Jon",
        location: "123 Main Street",
        complaint: "Vehicle will not start.",
        technicianNotes: "Battery failed load test. Battery replaced and starting system retested.",
        serviceCall: 95,
        miles: 8,
        travelHours: 0.25,
        labor: [
            {
                description: "No-start diagnosis",
                quantity: 1,
                rate: 125
            }
        ],
        parts: [
            {
                description: "Battery",
                quantity: 1,
                rate: 189.95
            }
        ],
        misc: []
    }
];

const assets = [
    {
        customer: "ABC Transport",
        name: "Truck 12 - Freightliner Cascadia"
    },
    {
        customer: "Jones Excavating",
        name: "Excavator 3 - CAT 320"
    },
    {
        customer: "Smith Residence",
        name: "2020 Chevrolet Equinox"
    }
];


const technicians = [
    "Jon",
    "Mike",
    "Unassigned"
];


let selectedJobId =
    null;


const jobFormPanel =
    document.getElementById(
        "jobFormPanel"
    );


const jobBoard =
    document.querySelector(
        ".job-board"
    );


const jobDetailPanel =
    document.getElementById(
        "jobDetailPanel"
    );


function getJobGroup(
    status
) {

    if (
        status === "Scheduled" ||
        status === "En Route" ||
        status === "Working"
    ) {
        return "active";
    }


    if (
        status === "Waiting on Parts" ||
        status === "Waiting on Customer" ||
        status === "Return Visit Needed"
    ) {
        return "waiting";
    }


    return "done";
}

const customers = [
    {
        id: "customer-1001",
        name: "ABC Transport",
        phone: ""
    },
    {
        id: "customer-1002",
        name: "Jones Excavating",
        phone: ""
    },
    {
        id: "customer-1003",
        name: "Smith Residence",
        phone: ""
    }
];

function renderJobs() {

    const activeJobList =
        document.getElementById(
            "activeJobList"
        );


    const waitingJobList =
        document.getElementById(
            "waitingJobList"
        );


    const doneJobList =
        document.getElementById(
            "doneJobList"
        );




    activeJobList.innerHTML =
        "";


    waitingJobList.innerHTML =
        "";


    doneJobList.innerHTML =
        "";


    jobs.forEach(
        function (job) {

            const card =
                document.createElement(
                    "article"
                );


            card.className =
                "job-card";


            card.innerHTML =
                `
                    <div class="job-card-header">

                        <div>
                            <h4>
                                ${escapeHtml(job.customer)}
                            </h4>

                            <p>
                                ${escapeHtml(job.asset || "No asset selected")}
                            </p>
                        </div>

                        <span class="job-status">
                            ${escapeHtml(job.status)}
                        </span>

                    </div>

                    <p>
                        ${escapeHtml(job.complaint)}
                    </p>

                    <div class="job-card-meta">

                        <span>
                            ${escapeHtml(job.location || "No location")}
                        </span>

                        <span>
                            Tech: ${escapeHtml(job.technician || "Unassigned")}
                        </span>

                    </div>
                `;


            card.addEventListener(
                "click",
                function () {

                    openJob(
                        job.id
                    );

                }
            );


            const group =
                getJobGroup(
                    job.status
                );


            if (
                group === "active"
            ) {

                activeJobList.appendChild(
                    card
                );

            } else if (
                group === "waiting"
            ) {

                waitingJobList.appendChild(
                    card
                );

            } else {

                doneJobList.appendChild(
                    card
                );

            }

        }
    );


    updateCounts();

}


function renderAssetOptions() {

    const assetSelect =
        document.getElementById(
            "jobAssetInput"
        );

    const selectedCustomer =
        document.getElementById(
            "jobCustomerInput"
        ).value;

    assetSelect.innerHTML =
        `
            <option value="">
                Select Asset / Unit
            </option>
        `;

    if (!selectedCustomer) {
        return;
    }

    const customerAssets =
        assets.filter(
            function (asset) {
                return asset.customer ===
                    selectedCustomer;
            }
        );

    customerAssets.forEach(
        function (asset) {

            const option =
                document.createElement(
                    "option"
                );

            option.value =
                asset.name;

            option.textContent =
                asset.name;

            assetSelect.appendChild(
                option
            );

        }
    );
}


function renderTechnicianOptions() {

    const technicianSelect =
        document.getElementById(
            "jobTechnicianInput"
        );

    technicianSelect.innerHTML =
        `
            <option value="">
                Select Technician
            </option>
        `;


    technicians.forEach(
        function (technician) {

            const option =
                document.createElement(
                    "option"
                );

            option.value =
                technician;

            option.textContent =
                technician;

            technicianSelect.appendChild(
                option
            );

        }
    );
}

function updateCounts() {

    const activeCount =
        jobs.filter(
            function (job) {

                return getJobGroup(
                    job.status
                ) === "active";

            }
        ).length;


    const waitingCount =
        jobs.filter(
            function (job) {

                return getJobGroup(
                    job.status
                ) === "waiting";

            }
        ).length;


    const invoiceCount =
        jobs.filter(
            function (job) {

                return job.status ===
                    "Ready to Invoice";

            }
        ).length;


    document.getElementById(
        "activeJobCount"
    ).textContent =
        activeCount;


    document.getElementById(
        "waitingJobCount"
    ).textContent =
        waitingCount;


    document.getElementById(
        "invoiceJobCount"
    ).textContent =
        invoiceCount;

}


function openJob(
    jobId
) {

    const job =
        jobs.find(
            function (item) {
                return item.id === jobId;
            }
        );


    if (!job) {
        return;
    }


    selectedJobId =
        job.id;


    jobBoard.classList.add(
        "hidden"
    );


    document.querySelector(
        ".summary-grid"
    ).classList.add(
        "hidden"
    );


    jobDetailPanel.classList.remove(
        "hidden"
    );


    document.getElementById(
        "detailJobTitle"
    ).textContent =
        job.asset ||
        "General Service Job";


    document.getElementById(
        "detailJobCustomer"
    ).textContent =
        job.customer;


    document.getElementById(
        "detailJobStatus"
    ).textContent =
        job.status;


    document.getElementById(
        "detailJobAsset"
    ).textContent =
        job.asset ||
        "—";


    document.getElementById(
        "detailJobTechnician"
    ).textContent =
        job.technician ||
        "Unassigned";


    document.getElementById(
        "detailJobLocation"
    ).textContent =
        job.location ||
        "—";


    document.getElementById(
        "detailJobComplaint"
    ).textContent =
        job.complaint;


    document.getElementById(
        "detailTechnicianNotes"
    ).value =
        job.technicianNotes ||
        "";


    document.getElementById(
        "serviceCallCharge"
    ).value =
        job.serviceCall ||
        "";


    document.getElementById(
        "travelMiles"
    ).value =
        job.miles ||
        "";


    document.getElementById(
        "travelHours"
    ).value =
        job.travelHours ||
        "";


    renderLineItems(
        job
    );


    calculateJobTotal();

}


function renderLineItems(
    job
) {

    renderLineItemGroup(
        "laborList",
        job.labor
    );


    renderLineItemGroup(
        "partsList",
        job.parts
    );


    renderLineItemGroup(
        "miscList",
        job.misc
    );

}


function renderLineItemGroup(
    elementId,
    items
) {

    const container =
        document.getElementById(
            elementId
        );


    container.innerHTML =
        "";


    items.forEach(
        function (
            item,
            index
        ) {

            const row =
                document.createElement(
                    "div"
                );


            row.className =
                "line-item";


            row.innerHTML =
                `
                    <input
                        class="line-description"
                        type="text"
                        value="${escapeHtml(item.description)}"
                        placeholder="Description"
                    >

                    <input
                        class="line-quantity"
                        type="number"
                        min="0"
                        step="0.1"
                        value="${item.quantity}"
                        placeholder="Qty / Hours"
                    >

                    <input
                        class="line-rate"
                        type="number"
                        min="0"
                        step="0.01"
                        value="${item.rate}"
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
                            calculateJobTotal
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

                        items.splice(
                            index,
                            1
                        );


                        renderLineItems(
                            getSelectedJob()
                        );


                        calculateJobTotal();

                    }
                );


            container.appendChild(
                row
            );

        }
    );

}


function addLineItem(
    groupName
) {

    const job =
        getSelectedJob();


    if (!job) {
        return;
    }


    job[groupName].push(
        {
            description: "",
            quantity: 1,
            rate: 0
        }
    );


    renderLineItems(
        job
    );

}


function getSelectedJob() {

    return jobs.find(
        function (job) {
            return job.id === selectedJobId;
        }
    );

}


function calculateJobTotal() {

    const serviceCall =
        Number(
            document.getElementById(
                "serviceCallCharge"
            ).value
        ) || 0;


    let total =
        serviceCall;


    [
        "laborList",
        "partsList",
        "miscList"
    ]
        .forEach(
            function (listId) {

                const rows =
                    document
                        .getElementById(
                            listId
                        )
                        .querySelectorAll(
                            ".line-item"
                        );


                rows.forEach(
                    function (row) {

                        const quantity =
                            Number(
                                row.querySelector(
                                    ".line-quantity"
                                ).value
                            ) || 0;


                        const rate =
                            Number(
                                row.querySelector(
                                    ".line-rate"
                                ).value
                            ) || 0;


                        total +=
                            quantity *
                            rate;

                    }
                );

            }
        );


    document.getElementById(
        "jobTotal"
    ).textContent =
        total.toLocaleString(
            "en-US",
            {
                style:
                    "currency",

                currency:
                    "USD"
            }
        );

}


document.getElementById(
    "newJobButton"
).addEventListener(
    "click",
    function () {

        jobFormPanel.classList.remove(
            "hidden"
        );

    }
);


document.getElementById(
    "closeJobFormButton"
).addEventListener(
    "click",
    function () {

        jobFormPanel.classList.add(
            "hidden"
        );

    }
);


document.getElementById(
    "saveJobButton"
).addEventListener(
    "click",
    function () {

        const customer =
            document.getElementById(
                "jobCustomerInput"
            ).value.trim();


        const complaint =
            document.getElementById(
                "jobComplaintInput"
            ).value.trim();


        if (
            !customer ||
            !complaint
        ) {

            document.getElementById(
                "jobFormMessage"
            ).textContent =
                "Customer and job description are required.";

            return;

        }


        jobs.push(
            {
                id:
                    "job-" +
                    Date.now(),

                customer:
                    customer,

                asset:
                    document.getElementById(
                        "jobAssetInput"
                    ).value.trim(),

                status:
                    document.getElementById(
                        "jobStatusInput"
                    ).value,

                technician:
                    document.getElementById(
                        "jobTechnicianInput"
                    ).value.trim(),

                location:
                    document.getElementById(
                        "jobLocationInput"
                    ).value.trim(),

                complaint:
                    complaint,

                customerNotes:
                    document.getElementById(
                        "jobCustomerNotesInput"
                    ).value.trim(),

                technicianNotes:
                    document.getElementById(
                        "jobTechnicianNotesInput"
                    ).value.trim(),

                serviceCall:
                    0,

                miles:
                    0,

                travelHours:
                    0,

                labor:
                    [],

                parts:
                    [],

                misc:
                    []
            }
        );


        clearJobForm();


        jobFormPanel.classList.add(
            "hidden"
        );


        renderJobs();

    }
);


document.getElementById(
    "closeJobDetailButton"
).addEventListener(
    "click",
    function () {

        selectedJobId =
            null;


        jobDetailPanel.classList.add(
            "hidden"
        );


        jobBoard.classList.remove(
            "hidden"
        );


        document.querySelector(
            ".summary-grid"
        ).classList.remove(
            "hidden"
        );


        renderJobs();

    }
);

document.getElementById(
    "jobCustomerInput"
).addEventListener(
    "change",
    function () {

        renderAssetOptions();

    }
);


document.getElementById(
    "addLaborButton"
).addEventListener(
    "click",
    function () {

        addLineItem(
            "labor"
        );

    }
);


document.getElementById(
    "addPartButton"
).addEventListener(
    "click",
    function () {

        addLineItem(
            "parts"
        );

    }
);


document.getElementById(
    "addMiscButton"
).addEventListener(
    "click",
    function () {

        addLineItem(
            "misc"
        );

    }
);


document.getElementById(
    "serviceCallCharge"
).addEventListener(
    "input",
    calculateJobTotal
);


document.getElementById(
    "saveJobChangesButton"
).addEventListener(
    "click",
    function () {

        const job =
            getSelectedJob();


        if (!job) {
            return;
        }


        job.technicianNotes =
            document.getElementById(
                "detailTechnicianNotes"
            ).value.trim();


        job.serviceCall =
            Number(
                document.getElementById(
                    "serviceCallCharge"
                ).value
            ) || 0;


        job.miles =
            Number(
                document.getElementById(
                    "travelMiles"
                ).value
            ) || 0;


        job.travelHours =
            Number(
                document.getElementById(
                    "travelHours"
                ).value
            ) || 0;


        syncLineItemsFromScreen(
            job
        );

    }
);

function renderCustomerOptions(
    selectedCustomer = ""
) {

    const customerSelect =
        document.getElementById(
            "jobCustomerInput"
        );

    customerSelect.innerHTML =
        `
            <option value="">
                Select Customer
            </option>
        `;

    customers.forEach(
        function (customer) {

            const option =
                document.createElement(
                    "option"
                );

            option.value =
                customer.name;

            option.textContent =
                customer.name;

            customerSelect.appendChild(
                option
            );

        }
    );

    customerSelect.value =
        selectedCustomer;
}

const quickCustomerForm =
    document.getElementById(
        "quickCustomerForm"
    );


document.getElementById(
    "addCustomerFromJobButton"
).addEventListener(
    "click",
    function () {

        quickCustomerForm.classList.remove(
            "hidden"
        );

    }
);


document.getElementById(
    "closeQuickCustomerButton"
).addEventListener(
    "click",
    function () {

        quickCustomerForm.classList.add(
            "hidden"
        );

    }
);


document.getElementById(
    "saveQuickCustomerButton"
).addEventListener(
    "click",
    function () {

        const name =
            document.getElementById(
                "quickCustomerName"
            ).value.trim();

        const phone =
            document.getElementById(
                "quickCustomerPhone"
            ).value.trim();

        if (!name) {

            document.getElementById(
                "quickCustomerMessage"
            ).textContent =
                "Customer name is required.";

            return;
        }


        const newCustomer = {
            id:
                "customer-" +
                Date.now(),

            name:
                name,

            phone:
                phone
        };


        customers.push(
            newCustomer
        );


        renderCustomerOptions(
            newCustomer.name
        );


        document.getElementById(
            "quickCustomerName"
        ).value =
            "";


        document.getElementById(
            "quickCustomerPhone"
        ).value =
            "";


        document.getElementById(
            "quickCustomerMessage"
        ).textContent =
            "";


        quickCustomerForm.classList.add(
            "hidden"
        );

    }
);


document.getElementById(
    "readyToInvoiceButton"
).addEventListener(
    "click",
    function () {

        const job =
            getSelectedJob();


        if (!job) {
            return;
        }


        syncLineItemsFromScreen(
            job
        );


        job.status =
            "Ready to Invoice";


        document.getElementById(
            "detailJobStatus"
        ).textContent =
            job.status;


        renderJobs();

    }
);


function syncLineItemsFromScreen(
    job
) {

    job.labor =
        readLineItems(
            "laborList"
        );


    job.parts =
        readLineItems(
            "partsList"
        );


    job.misc =
        readLineItems(
            "miscList"
        );

}


function readLineItems(
    listId
) {

    const result =
        [];


    document
        .getElementById(
            listId
        )
        .querySelectorAll(
            ".line-item"
        )
        .forEach(
            function (row) {

                result.push(
                    {
                        description:
                            row.querySelector(
                                ".line-description"
                            ).value.trim(),

                        quantity:
                            Number(
                                row.querySelector(
                                    ".line-quantity"
                                ).value
                            ) || 0,

                        rate:
                            Number(
                                row.querySelector(
                                    ".line-rate"
                                ).value
                            ) || 0
                    }
                );

            }
        );


    return result;

}


function clearJobForm() {

    [
        "jobCustomerInput",
        "jobAssetInput",
        "jobTechnicianInput",
        "jobLocationInput",
        "jobComplaintInput",
        "jobCustomerNotesInput",
        "jobTechnicianNotesInput"
    ]
        .forEach(
            function (id) {

                document.getElementById(
                    id
                ).value =
                    "";

            }
        );


    document.getElementById(
        "jobStatusInput"
    ).value =
        "Scheduled";


    document.getElementById(
        "jobFormMessage"
    ).textContent =
        "";

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


renderCustomerOptions();
renderAssetOptions();
renderTechnicianOptions();
renderJobs();