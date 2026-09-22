const appointments = [
    {
        id: "appointment-1001",
        customer: "ABC Transport",
        unit: "Truck 12 - Freightliner Cascadia",
        date: "2026-08-30",
        startTime: "08:00",
        endTime: "09:30",
        technician: "Jon",
        type: "Shop",
        status: "Scheduled",
        location: "Main Shop",
        description: "Air leak diagnosis and brake inspection."
    },

    {
        id: "appointment-1002",
        customer: "Jones Excavating",
        unit: "Excavator 3 - CAT 320",
        date: "2026-08-30",
        startTime: "10:00",
        endTime: "12:00",
        technician: "Jon",
        type: "Mobile",
        status: "Confirmed",
        location: "North Jobsite",
        description: "Hydraulic leak at boom cylinder."
    },

    {
        id: "appointment-1003",
        customer: "Smith Residence",
        unit: "2020 Chevrolet Equinox",
        date: "2026-08-30",
        startTime: "13:00",
        endTime: "14:30",
        technician: "Mike",
        type: "Shop",
        status: "In Progress",
        location: "Main Shop",
        description: "No-start diagnosis."
    },

    {
        id: "appointment-1004",
        customer: "Delaware Landscape",
        unit: "Bobcat T66",
        date: "2026-08-30",
        startTime: "15:00",
        endTime: "16:00",
        technician: "",
        type: "Dropoff",
        status: "Scheduled",
        location: "Main Shop",
        description: "Track tension inspection and service."
    },

    {
        id: "appointment-1005",
        customer: "ABC Transport",
        unit: "Truck 7 - Peterbilt 389",
        date: "2026-08-31",
        startTime: "09:00",
        endTime: "11:00",
        technician: "Jon",
        type: "Shop",
        status: "Scheduled",
        location: "Main Shop",
        description: "PM service and DOT inspection."
    },

    {
        id: "appointment-1006",
        customer: "Jones Excavating",
        unit: "Skid Steer 2 - Bobcat S650",
        date: "2026-08-31",
        startTime: "12:30",
        endTime: "14:00",
        technician: "Mike",
        type: "Mobile",
        status: "Scheduled",
        location: "Customer Yard",
        description: "Intermittent auxiliary hydraulic fault."
    },

    {
        id: "appointment-1007",
        customer: "Smith Residence",
        unit: "2020 Chevrolet Equinox",
        date: "2026-08-29",
        startTime: "11:00",
        endTime: "12:00",
        technician: "Jon",
        type: "Shop",
        status: "Completed",
        location: "Main Shop",
        description: "Battery replacement and charging system test."
    }
];

// Approved team requests are loaded from Supabase by schedule-calendar-events.js.
const calendarEvents = [];


let selectedAppointmentId = null;


const scheduleDate =
    document.getElementById(
        "scheduleDate"
    );


const appointmentList =
    document.getElementById(
        "appointmentList"
    );


const appointmentFormPanel =
    document.getElementById(
        "appointmentFormPanel"
    );


function getLocalDateString(
    date = new Date()
) {

    const year =
        date.getFullYear();

    const month =
        String(
            date.getMonth() + 1
        ).padStart(
            2,
            "0"
        );

    const day =
        String(
            date.getDate()
        ).padStart(
            2,
            "0"
        );

    return `${year}-${month}-${day}`;
}

function openAppointment(
    appointmentId
) {

    const appointment =
        appointments.find(
            function (item) {

                return item.id ===
                    appointmentId;
            }
        );


    if (!appointment) {
        return;
    }


    selectedAppointmentId =
        appointment.id;


    document.getElementById(
        "appointmentCustomer"
    ).value =
        appointment.customer || "";


    document.getElementById(
        "appointmentUnit"
    ).value =
        appointment.unit || "";


    document.getElementById(
        "appointmentDate"
    ).value =
        appointment.date || "";


    document.getElementById(
        "appointmentStartTime"
    ).value =
        appointment.startTime || "";


    document.getElementById(
        "appointmentEndTime"
    ).value =
        appointment.endTime || "";


    document.getElementById(
        "appointmentTechnician"
    ).value =
        appointment.technician || "";


    document.getElementById(
        "appointmentType"
    ).value =
        appointment.type || "Shop";


    document.getElementById(
        "appointmentStatus"
    ).value =
        appointment.status || "Scheduled";


    document.getElementById(
        "appointmentLocation"
    ).value =
        appointment.location || "";


    document.getElementById(
        "appointmentDescription"
    ).value =
        appointment.description || "";


    document.querySelector(
        ".appointment-form-header h2"
    ).textContent =
        "Edit Appointment";


    document.getElementById(
        "saveAppointmentButton"
    ).textContent =
        "Save Changes";


    appointmentFormPanel.hidden =
        false;


    appointmentFormPanel.scrollIntoView(
        {
            behavior: "smooth",
            block: "start"
        }
    );
}


function renderSchedule() {

    const selectedDate =
        scheduleDate.value;


    const dateAppointments =
        appointments
            .filter(
                function (appointment) {

                    return appointment.date ===
                        selectedDate;

                }
            )
            .concat(calendarEvents.filter(function (event) {
                return event.date <= selectedDate && event.endDate >= selectedDate;
            }))
            .sort(
                function (a, b) {

                    return a.startTime
                        .localeCompare(
                            b.startTime
                        );

                }
            );


    const headingDate =
        new Date(
            selectedDate +
            "T12:00:00"
        );


    document.getElementById(
        "scheduleDateHeading"
    ).textContent =
        headingDate.toLocaleDateString(
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


    appointmentList.innerHTML =
        "";


    if (
        dateAppointments.length === 0
    ) {

        appointmentList.innerHTML =
            `
                <div class="empty-state">

                    <strong>
                        Nothing scheduled
                    </strong>

                    <p>
                        No appointments are scheduled for this day.
                    </p>

                </div>
            `;

        return;
    }


    dateAppointments.forEach(
        function (appointment) {

            const card =
                document.createElement(
                    "article"
                );


            card.className =
                "appointment-card";


            card.innerHTML =
                `
                <div class="appointment-time">

                            <strong>
                                ${appointment.allDay ? "All day" : formatTime(
                    appointment.startTime
                )}
                    </strong>

                            <span>
                                ${appointment.allDay ? "" : formatTime(
                    appointment.endTime
                )}
                    </span>

                </div>


                <div class="appointment-details">

                    <div class="appointment-header">

                        <div>

                            <h4>
                                ${escapeHtml(
                    appointment.customer
                )}
                            </h4>

                            <p>
                                ${escapeHtml(
                    appointment.unit ||
                    "No unit selected"
                )}
                            </p>

                        </div>

                        <span class="appointment-status">
                            ${escapeHtml(
                    appointment.status
                )}
                        </span>

                    </div>


                    <p class="appointment-description">
                        ${escapeHtml(
                    appointment.description ||
                    "No work description"
                )}
                    </p>


                    <div class="appointment-meta">

                        <span>
                            ${escapeHtml(
                    appointment.type
                )}
                        </span>

                        <span>
                            Tech:
                            ${escapeHtml(
                    appointment.technician ||
                    "Unassigned"
                )}
                        </span>

                        <span>
                            ${escapeHtml(
                    appointment.location ||
                    "No location"
                )}
                        </span>

                    </div>

                </div>
            `;


            if (!appointment.readOnly) {
                card.addEventListener("click", function () { openAppointment(appointment.id); });
            } else {
                card.classList.add("calendar-request-event");
            }


            appointmentList.appendChild(
                card
            );

        }
    );

    updateCounts();

}


function formatTime(
    time
) {

    if (!time) {
        return "";
    }


    const parts =
        time.split(":");


    const date =
        new Date();


    date.setHours(
        Number(
            parts[0]
        )
    );


    date.setMinutes(
        Number(
            parts[1]
        )
    );


    return date.toLocaleTimeString(
        "en-US",
        {
            hour:
                "numeric",

            minute:
                "2-digit"
        }
    );

}


function changeScheduleDate(
    amount
) {

    const date =
        new Date(
            scheduleDate.value +
            "T12:00:00"
        );


    date.setDate(
        date.getDate() +
        amount
    );


    scheduleDate.value =
        getLocalDateString(
            date
        );


    renderSchedule();

}


document.getElementById(
    "new-appointment-button"
).addEventListener(
    "click",
    function () {

        selectedAppointmentId = null;

        clearAppointmentForm();

        document.getElementById(
            "appointmentDate"
        ).value =
            scheduleDate.value;

        document.querySelector(
            ".appointment-form-header h2"
        ).textContent =
            "New Appointment";

        document.getElementById(
            "saveAppointmentButton"
        ).textContent =
            "Schedule Appointment";

        appointmentFormPanel.hidden =
            false;

        appointmentFormPanel.scrollIntoView(
            {
                behavior: "smooth",
                block: "start"
            }
        );
    }
);


document.getElementById(
    "closeAppointmentButton"
).addEventListener(
    "click",
    function () {

        appointmentFormPanel
            .classList
            .add(
                "hidden"
            );

    }
    );

    function closeAppointmentForm() {

        selectedAppointmentId =
            null;

        clearAppointmentForm();

        appointmentFormPanel.hidden =
            true;
    }


    document.getElementById(
        "closeAppointmentButton"
    ).addEventListener(
        "click",
        closeAppointmentForm
    );


    document.getElementById(
        "cancelAppointmentButton"
    ).addEventListener(
        "click",
        closeAppointmentForm
    );


document.getElementById(
    "saveAppointmentButton"
).addEventListener(
    "click",
    function () {

        const customer =
            document.getElementById(
                "appointmentCustomer"
            ).value.trim();


        const date =
            document.getElementById(
                "appointmentDate"
            ).value;


        const startTime =
            document.getElementById(
                "appointmentStartTime"
            ).value;


        if (
            !customer ||
            !date ||
            !startTime
        ) {

            document.getElementById(
                "appointmentMessage"
            ).textContent =
                "Customer, date and start time are required.";

            return;

        }


        const appointment = {

            id:
                "appointment-" +
                Date.now(),

            customer:
                customer,

            unit:
                document.getElementById(
                    "appointmentUnit"
                ).value.trim(),

            date:
                date,

            startTime:
                startTime,

            endTime:
                document.getElementById(
                    "appointmentEndTime"
                ).value,

            technician:
                document.getElementById(
                    "appointmentTechnician"
                ).value,

            type:
                document.getElementById(
                    "appointmentType"
                ).value,

            status:
                document.getElementById(
                    "appointmentStatus"
                ).value,

            location:
                document.getElementById(
                    "appointmentLocation"
                ).value.trim(),

            description:
                document.getElementById(
                    "appointmentDescription"
                ).value.trim()

        };


        if (selectedAppointmentId) {

            const existingAppointment =
                appointments.find(
                    function (item) {

                        return item.id ===
                            selectedAppointmentId;
                    }
                );


            if (existingAppointment) {

                existingAppointment.customer =
                    appointment.customer;

                existingAppointment.unit =
                    appointment.unit;

                existingAppointment.date =
                    appointment.date;

                existingAppointment.startTime =
                    appointment.startTime;

                existingAppointment.endTime =
                    appointment.endTime;

                existingAppointment.technician =
                    appointment.technician;

                existingAppointment.type =
                    appointment.type;

                existingAppointment.status =
                    appointment.status;

                existingAppointment.location =
                    appointment.location;

                existingAppointment.description =
                    appointment.description;
            }

        } else {

            appointments.push(
                appointment
            );
        }


        scheduleDate.value =
            appointment.date;


        clearAppointmentForm();


        appointmentFormPanel
            .classList
            .add(
                "hidden"
        );

        selectedAppointmentId =
            null;

        appointmentFormPanel.hidden =
            true;

        scheduleDate.value =
            appointment.date;

        clearAppointmentForm();

        renderSchedule();
        updateCounts();

    }
);


document.getElementById(
    "previousDayButton"
).addEventListener(
    "click",
    function () {

        changeScheduleDate(
            -1
        );

    }
);


document.getElementById(
    "nextDayButton"
).addEventListener(
    "click",
    function () {

        changeScheduleDate(
            1
        );

    }
);


document.getElementById(
    "todayButton"
).addEventListener(
    "click",
    function () {

        scheduleDate.value =
            getLocalDateString();


        renderSchedule();

    }
);


scheduleDate.addEventListener(
    "change",
    renderSchedule
);


function clearAppointmentForm() {

    [
        "appointmentCustomer",
        "appointmentUnit",
        "appointmentDate",
        "appointmentStartTime",
        "appointmentEndTime",
        "appointmentLocation",
        "appointmentDescription"
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
        "appointmentTechnician"
    ).value =
        "";


    document.getElementById(
        "appointmentType"
    ).value =
        "Shop";


    document.getElementById(
        "appointmentStatus"
    ).value =
        "Scheduled";


    document.getElementById(
        "appointmentMessage"
    ).textContent =
        "";

}


function escapeHtml(
    value
) {

    return String(
        value
    )
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

function updateCounts() {

    const today =
        getLocalDateString();


    const todayCount =
        appointments.filter(
            function (appointment) {

                return appointment.date ===
                    today;

            }
        ).length;


    const scheduledCount =
        appointments.filter(
            function (appointment) {

                return (
                    appointment.status === "Scheduled" ||
                    appointment.status === "Confirmed"
                );

            }
        ).length;


    const activeCount =
        appointments.filter(
            function (appointment) {

                return appointment.status ===
                    "In Progress";

            }
        ).length;


    const completedCount =
        appointments.filter(
            function (appointment) {

                return appointment.status ===
                    "Completed";

            }
        ).length;


    document.getElementById(
        "todayAppointmentCount"
    ).textContent =
        todayCount;


    document.getElementById(
        "scheduledAppointmentCount"
    ).textContent =
        scheduledCount;


    document.getElementById(
        "activeAppointmentCount"
    ).textContent =
        activeCount;


    document.getElementById(
        "completedAppointmentCount"
    ).textContent =
        completedCount;

}


scheduleDate.value =
    getLocalDateString();

renderSchedule();
updateCounts();
