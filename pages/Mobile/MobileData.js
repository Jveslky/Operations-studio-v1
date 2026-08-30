const MOBILE_DATA_KEY =
    "trackRightMobileData";


const defaultMobileData = {
    customers: [],
    assets: [],
    appointments: [],
    jobs: [],
    invoices: []
};


function loadMobileData() {

    const storedValue =
        localStorage.getItem(
            MOBILE_DATA_KEY
        );


    if (!storedValue) {

        saveMobileData(
            defaultMobileData
        );

        return structuredClone(
            defaultMobileData
        );

    }


    try {

        const parsedValue =
            JSON.parse(
                storedValue
            );


        return {
            customers:
                Array.isArray(
                    parsedValue.customers
                )
                    ? parsedValue.customers
                    : [],

            assets:
                Array.isArray(
                    parsedValue.assets
                )
                    ? parsedValue.assets
                    : [],

            appointments:
                Array.isArray(
                    parsedValue.appointments
                )
                    ? parsedValue.appointments
                    : [],

            jobs:
                Array.isArray(
                    parsedValue.jobs
                )
                    ? parsedValue.jobs
                    : [],

            invoices:
                Array.isArray(
                    parsedValue.invoices
                )
                    ? parsedValue.invoices
                    : []
        };

    } catch (error) {

        console.error(
            "Could not load Mobile data:",
            error
        );


        return structuredClone(
            defaultMobileData
        );

    }

}


function saveMobileData(
    mobileData
) {

    localStorage.setItem(
        MOBILE_DATA_KEY,
        JSON.stringify(
            mobileData
        )
    );

}


function createMobileId(
    prefix
) {

    return (
        prefix +
        "-" +
        crypto.randomUUID()
    );

}