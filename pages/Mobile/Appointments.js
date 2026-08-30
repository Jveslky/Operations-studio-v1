console.log(
    "Appointment Book loaded"
);


const selectedDateLabel =
    document.getElementById(
        "selectedDateLabel"
    );


const appointmentDatePicker =
    document.getElementById(
        "appointmentDatePicker"
    );


const previousDayButton =
    document.getElementById(
        "previousDayButton"
    );


const todayButton =
    document.getElementById(
        "todayButton"
    );


const nextDayButton =
    document.getElementById(
        "nextDayButton"
    );


const openAppointmentFormButton =
    document.getElementById(
        "openAppointmentFormButton"
    );


const closeAppointmentFormButton =
    document.getElementById(
        "closeAppointmentFormButton"
    );


const appointmentFormPanel =
    document.getElementById(
        "appointmentFormPanel"
    );


const newAppointmentDate =
    document.getElementById(
        "newAppointmentDate"
    );


const newAppointmentTime =
    document.getElementById(
        "newAppointmentTime"
    );


const newAppointmentCustomer =
    document.getElementById(
        "newAppointmentCustomer"
    );


const newAppointmentAsset =
    document.getElementById(
        "newAppointmentAsset"
    );


const newAppointmentLocation =
    document.getElementById(
        "newAppointmentLocation"
    );


const newAppointmentTechnician =
    document.getElementById(
        "newAppointmentTechnician"
    );


const newAppointmentReason =
    document.getElementById(
        "newAppointmentReason"
    );


const newAppointmentNotes =
    document.getElementById(
        "newAppointmentNotes"
    );


const saveAppointmentButton =
    document.getElementById(
        "saveAppointmentButton"
    );


const appointmentFormMessage =
    document.getElementById(
        "appointmentFormMessage"
    );


const anytimeAppointmentList =
    document.getElementById(
        "anytimeAppointmentList"
    );


const timedAppointmentList =
    document.getElementById(
        "timedAppointmentList"
    );


function formatDateLabel(
    dateValue
) {

    const date =
        new Date(
            dateValue + "T12:00:00"
        );


    return date.toLocaleDateString(
        "en-US",
        {
            weekday:
                "long",

            month:
                "long",

            day:
                "numeric",

            year:
                "numeric"
        }
    );

}


function updateSelectedDate(
    dateValue
) {

    appointmentDatePicker.value =
        dateValue;


    newAppointmentDate.value =
        dateValue;


    selectedDateLabel.textContent =
        formatDateLabel(
            dateValue
        );

}


function shiftSelectedDate(
    numberOfDays
) {

    const selectedDate =
        new Date(
            appointmentDatePicker.value +
            "T12:00:00"
        );


    selectedDate.setDate(
        selectedDate.getDate() +
        numberOfDays
    );


    const updatedDate =
        selectedDate
            .toISOString()
            .split("T")[0];


    updateSelectedDate(
        updatedDate
    );

}


previousDayButton.addEventListener(
    "click",
    function () {

        shiftSelectedDate(
            -1
        );

    }
);


nextDayButton.addEventListener(
    "click",
    function () {

        shiftSelectedDate(
            1
        );

    }
);


todayButton.addEventListener(
    "click",
    function () {

        const today =
            new Date();


        const year =
            today.getFullYear();


        const month =
            String(
                today.getMonth() + 1
            ).padStart(
                2,
                "0"
            );


        const day =
            String(
                today.getDate()
            ).padStart(
                2,
                "0"
            );


        updateSelectedDate(
            `${year}-${month}-${day}`
        );

    }
);


appointmentDatePicker.addEventListener(
    "change",
    function () {

        if (
            !appointmentDatePicker.value
        ) {
            return;
        }


        updateSelectedDate(
            appointmentDatePicker.value
        );

    }
);


openAppointmentFormButton.addEventListener(
    "click",
    function () {

        appointmentFormPanel.classList.remove(
            "hidden"
        );


        newAppointmentDate.value =
            appointmentDatePicker.value;


        appointmentFormMessage.textContent =
            "";

    }
);


closeAppointmentFormButton.addEventListener(
    "click",
    function () {

        appointmentFormPanel.classList.add(
            "hidden"
        );

    }
);


saveAppointmentButton.addEventListener(
    "click",
    function () {

        const date =
            newAppointmentDate.value;


        const time =
            newAppointmentTime.value.trim();


        const customer =
            newAppointmentCustomer.value.trim();


        const asset =
            newAppointmentAsset.value.trim();


        const location =
            newAppointmentLocation.value.trim();


        const technician =
            newAppointmentTechnician.value.trim();


        const reason =
            newAppointmentReason.value.trim();


        const notes =
            newAppointmentNotes.value.trim();


        if (
            !date ||
            !customer
        ) {

            appointmentFormMessage.textContent =
                "Date and customer are required.";

            return;

        }


        const appointmentCard =
            document.createElement(
                "article"
            );


        appointmentCard.className =
            "appointment-card";


        const timeDisplay =
            time
                ? formatAppointmentTime(
                    time
                )
                : "Anytime";


        appointmentCard.innerHTML =
            `
                <div class="appointment-time ${time ? "" : "anytime"}">
                    ${escapeHtml(timeDisplay)}
                </div>

                <div class="appointment-details">

                    <div class="appointment-title">

                        <div>
                            <strong>
                                ${escapeHtml(customer)}
                            </strong>

                            <span>
                                ${escapeHtml(asset || "Asset not selected")}
                            </span>
                        </div>

                        <span class="status-badge scheduled">
                            Scheduled
                        </span>

                    </div>

                    <p>
                        ${escapeHtml(reason || "No reason entered")}
                    </p>

                    <div class="appointment-meta">

                        <span>
                            📍 ${escapeHtml(location || "Location not entered")}
                        </span>

                        <span>
                            Tech: ${escapeHtml(technician || "Unassigned")}
                        </span>

                    </div>

                    ${notes
                ? `
                                <p>
                                    ${escapeHtml(notes)}
                                </p>
                            `
                : ""
            }

                </div>
            `;


        if (
            time
        ) {

            timedAppointmentList.appendChild(
                appointmentCard
            );

        } else {

            anytimeAppointmentList.appendChild(
                appointmentCard
            );

        }


        appointmentFormMessage.textContent =
            "Appointment added.";


        clearAppointmentForm();


        /*
            Placeholder only.

            This is where the eventual
            Supabase INSERT will go.
        */

    }
);


function formatAppointmentTime(
    timeValue
) {

    const parts =
        timeValue.split(
            ":"
        );


    let hour =
        Number(
            parts[0]
        );


    const minutes =
        parts[1];


    const suffix =
        hour >= 12
            ? "PM"
            : "AM";


    hour =
        hour % 12;


    if (
        hour === 0
    ) {
        hour = 12;
    }


    return `${hour}:${minutes} ${suffix}`;

}


function clearAppointmentForm() {

    newAppointmentTime.value =
        "";


    newAppointmentCustomer.value =
        "";


    newAppointmentAsset.value =
        "";


    newAppointmentLocation.value =
        "";


    newAppointmentTechnician.value =
        "";


    newAppointmentReason.value =
        "";


    newAppointmentNotes.value =
        "";

}


function escapeHtml(
    value
) {

    return value
        .replaceAll(
            "&",
            "&amp;"
        )
        .replaceAll(
            "<",
            "&lt;"
        )
        .replaceAll(
            ">",
            "&gt;"
        )
        .replaceAll(
            '"',
            "&quot;"
        )
        .replaceAll(
            "'",
            "&#039;"
        );

}