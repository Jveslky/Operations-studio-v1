const mobileData = window.TrackRightMobile.load();
const customers = mobileData.customers;

function persistCustomers() {
    window.TrackRightMobile.save(mobileData);
}


let selectedCustomerId =
    null;


const customerDirectory =
    document.getElementById(
        "customerDirectory"
    );


const customerDetailPanel =
    document.getElementById(
        "customerDetailPanel"
    );


const customerSearch =
    document.getElementById(
        "customerSearch"
    );


const customerFormPanel =
    document.getElementById(
        "customerFormPanel"
    );


const assetFormPanel =
    document.getElementById(
        "assetFormPanel"
    );


function renderCustomers(
    searchValue = ""
) {

    const search =
        searchValue
            .trim()
            .toLowerCase();


    customerDirectory.innerHTML =
        "";


    customers
        .filter(
            function (customer) {

                const searchableText =
                    [
                        customer.name,
                        customer.contact,
                        customer.phone,
                        ...customer.assets.map(
                            function (asset) {
                                return [
                                    asset.name,
                                    asset.make,
                                    asset.model
                                ].join(" ");
                            }
                        )
                    ]
                        .join(" ")
                        .toLowerCase();


                return searchableText.includes(
                    search
                );

            }
        )
        .forEach(
            function (customer) {

                const card =
                    document.createElement(
                        "article"
                    );


                card.className =
                    "customer-card";


                card.innerHTML =
                    `
                        <h3>
                            ${escapeHtml(customer.name)}
                        </h3>

                        <p>
                            ${escapeHtml(customer.contact || "No contact listed")}
                        </p>

                        <p>
                            ${escapeHtml(customer.phone || "No phone listed")}
                        </p>

                        <div class="customer-card-footer">
                            <span>
                                ${customer.assets.length} asset${customer.assets.length === 1 ? "" : "s"}
                            </span>

                            <span>
                                Open →
                            </span>
                        </div>
                    `;


                card.addEventListener(
                    "click",
                    function () {

                        openCustomer(
                            customer.id
                        );

                    }
                );


                customerDirectory.appendChild(
                    card
                );

            }
        );

}


function openCustomer(
    customerId
) {

    selectedCustomerId =
        customerId;


    const customer =
        customers.find(
            function (item) {
                return item.id === customerId;
            }
        );


    if (!customer) {
        return;
    }


    customerDirectory.classList.add(
        "hidden"
    );


    customerDetailPanel.classList.remove(
        "hidden"
    );


    document.getElementById(
        "detailCustomerName"
    ).textContent =
        customer.name;


    document.getElementById(
        "detailCustomerContact"
    ).textContent =
        customer.contact ||
        "No contact listed";


    document.getElementById(
        "detailCustomerPhone"
    ).textContent =
        customer.phone ||
        "—";


    document.getElementById(
        "detailCustomerEmail"
    ).textContent =
        customer.email ||
        "—";


    document.getElementById(
        "detailCustomerAddress"
    ).textContent =
        customer.address ||
        "—";


    renderAssets(
        customer
    );

}


function renderAssets(
    customer
) {

    const assetList =
        document.getElementById(
            "assetList"
        );


    assetList.innerHTML =
        "";


    customer.assets.forEach(
        function (asset) {

            const assetCard =
                document.createElement(
                    "article"
                );


            assetCard.className =
                "asset-card";


            const description =
                [
                    asset.year,
                    asset.make,
                    asset.model
                ]
                    .filter(Boolean)
                    .join(" ");


            assetCard.innerHTML =
                `
                    <h4>
                        ${escapeHtml(asset.name)}
                    </h4>

                    <p>
                        ${escapeHtml(description || "No vehicle/equipment description entered")}
                    </p>

                    <div class="asset-meta">

                        ${asset.vin
                    ? `<span>VIN: ${escapeHtml(asset.vin)}</span>`
                    : ""
                }

                        ${asset.serial
                    ? `<span>Serial: ${escapeHtml(asset.serial)}</span>`
                    : ""
                }

                        ${asset.mileage
                    ? `<span>${escapeHtml(asset.mileage)} miles</span>`
                    : ""
                }

                        ${asset.hours
                    ? `<span>${escapeHtml(asset.hours)} hours</span>`
                    : ""
                }

                        ${asset.engine
                    ? `<span>${escapeHtml(asset.engine)}</span>`
                    : ""
                }

                    </div>
                `;


            assetList.appendChild(
                assetCard
            );

        }
    );

}


customerSearch.addEventListener(
    "input",
    function () {

        renderCustomers(
            customerSearch.value
        );

    }
);


document.getElementById(
    "newCustomerButton"
).addEventListener(
    "click",
    function () {

        customerFormPanel.classList.remove(
            "hidden"
        );

    }
);


document.getElementById(
    "closeCustomerFormButton"
).addEventListener(
    "click",
    function () {

        customerFormPanel.classList.add(
            "hidden"
        );

    }
);


document.getElementById(
    "closeCustomerDetailButton"
).addEventListener(
    "click",
    function () {

        selectedCustomerId =
            null;


        customerDetailPanel.classList.add(
            "hidden"
        );


        customerDirectory.classList.remove(
            "hidden"
        );


        assetFormPanel.classList.add(
            "hidden"
        );

    }
);


document.getElementById(
    "newAssetButton"
).addEventListener(
    "click",
    function () {

        assetFormPanel.classList.remove(
            "hidden"
        );

    }
);


document.getElementById(
    "closeAssetFormButton"
).addEventListener(
    "click",
    function () {

        assetFormPanel.classList.add(
            "hidden"
        );

    }
);


document.getElementById(
    "saveCustomerButton"
).addEventListener(
    "click",
    function () {

        const name =
            document.getElementById(
                "customerNameInput"
            ).value.trim();


        if (!name) {

            document.getElementById(
                "customerFormMessage"
            ).textContent =
                "Customer name is required.";

            return;

        }


        customers.push(
            {
                id:
                    "customer-" +
                    Date.now(),

                name:
                    name,

                contact:
                    document.getElementById(
                        "customerContactInput"
                    ).value.trim(),

                phone:
                    document.getElementById(
                        "customerPhoneInput"
                    ).value.trim(),

                email:
                    document.getElementById(
                        "customerEmailInput"
                    ).value.trim(),

                address:
                    document.getElementById(
                        "customerAddressInput"
                    ).value.trim(),

                assets:
                    []
            }
        );

        persistCustomers();


        clearCustomerForm();


        customerFormPanel.classList.add(
            "hidden"
        );


        renderCustomers();

    }
);


document.getElementById(
    "saveAssetButton"
).addEventListener(
    "click",
    function () {

        const customer =
            customers.find(
                function (item) {
                    return item.id === selectedCustomerId;
                }
            );


        if (!customer) {
            return;
        }


        const name =
            document.getElementById(
                "assetNameInput"
            ).value.trim();


        if (!name) {

            document.getElementById(
                "assetFormMessage"
            ).textContent =
                "Give the asset a name or unit number.";

            return;

        }


        customer.assets.push(
            {
                name:
                    name,

                year:
                    document.getElementById(
                        "assetYearInput"
                    ).value.trim(),

                make:
                    document.getElementById(
                        "assetMakeInput"
                    ).value.trim(),

                model:
                    document.getElementById(
                        "assetModelInput"
                    ).value.trim(),

                vin:
                    document.getElementById(
                        "assetVinInput"
                    ).value.trim(),

                serial:
                    document.getElementById(
                        "assetSerialInput"
                    ).value.trim(),

                mileage:
                    document.getElementById(
                        "assetMileageInput"
                    ).value.trim(),

                hours:
                    document.getElementById(
                        "assetHoursInput"
                    ).value.trim(),

                engine:
                    document.getElementById(
                        "assetEngineInput"
                    ).value.trim(),

                notes:
                    document.getElementById(
                        "assetNotesInput"
                    ).value.trim()
            }
        );

        persistCustomers();


        clearAssetForm();


        assetFormPanel.classList.add(
            "hidden"
        );


        renderAssets(
            customer
        );

    }
);


function clearCustomerForm() {

    [
        "customerNameInput",
        "customerContactInput",
        "customerPhoneInput",
        "customerEmailInput",
        "customerAddressInput",
        "customerNotesInput"
    ]
        .forEach(
            function (id) {

                document.getElementById(
                    id
                ).value =
                    "";

            }
        );

}


function clearAssetForm() {

    [
        "assetNameInput",
        "assetYearInput",
        "assetMakeInput",
        "assetModelInput",
        "assetVinInput",
        "assetSerialInput",
        "assetMileageInput",
        "assetHoursInput",
        "assetEngineInput",
        "assetNotesInput"
    ]
        .forEach(
            function (id) {

                document.getElementById(
                    id
                ).value =
                    "";

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


renderCustomers();

if (new URLSearchParams(window.location.search).get("action") === "new") {
    document.getElementById("newCustomerButton").click();
}
