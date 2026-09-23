const appointments = [];
const scheduleClient = window.trackRightSupabase;
let scheduleContext = null;
let canManageSchedule = false;

// Approved team requests are loaded from Supabase by schedule-calendar-events.js.
const calendarEvents = [];
let shopBehavior = { ...window.trackRightShopBehaviorDefaults };
window.trackRightShopBehavior.then(function (settings) { shopBehavior = settings; });


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

const upcomingAppointmentList = document.getElementById("upcomingAppointmentList");
let upcomingRangeDays = 14;

function appointmentFromRow(row) {
    return {
        id: row.id,
        customer: row.customer || "",
        unit: row.unit || "",
        date: row.scheduled_on,
        startTime: String(row.start_time || "").slice(0, 5),
        endTime: String(row.end_time || "").slice(0, 5),
        technician: row.technician || "",
        type: row.appointment_type || "Shop",
        status: row.status || "Scheduled",
        location: row.location || "",
        description: row.description || ""
    };
}

function appointmentPayload(appointment) {
    return {
        customer: appointment.customer,
        unit: appointment.unit || null,
        scheduled_on: appointment.date,
        start_time: appointment.startTime,
        end_time: appointment.endTime || null,
        technician: appointment.technician || null,
        appointment_type: appointment.type,
        status: appointment.status,
        location: appointment.location || null,
        description: appointment.description || null,
        updated_by: scheduleContext.user.id,
        updated_at: new Date().toISOString()
    };
}

async function loadAppointments() {
    appointmentList.innerHTML = '<div class="empty-state"><strong>Loading schedule…</strong></div>';
    const { data, error } = await scheduleClient
        .from("shop_appointments")
        .select("*")
        .eq("shop_id", scheduleContext.shopId)
        .order("scheduled_on", { ascending: true })
        .order("start_time", { ascending: true });
    if (error) {
        appointmentList.innerHTML = `<div class="empty-state error"><strong>Schedule could not load</strong><p>${escapeHtml(error.message)}</p></div>`;
        upcomingAppointmentList.innerHTML = '<div class="empty-state error"><strong>Upcoming schedule unavailable</strong><p>Refresh after the database setup is complete.</p></div>';
        return;
    }
    appointments.splice(0, appointments.length, ...(data || []).map(appointmentFromRow));
    renderSchedule();
    updateCounts();
}

function ensureTechnicianOption(value) {
    if (!value) return;
    const select = document.getElementById("appointmentTechnician");
    if ([...select.options].some((option) => option.value === value)) return;
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
}

async function loadScheduleTechnicians() {
    const select = document.getElementById("appointmentTechnician");
    const { data, error } = await scheduleClient.rpc("list_shop_schedule_members");
    if (error) {
        select.innerHTML = '<option value="">Technicians unavailable</option>';
        select.disabled = true;
        return;
    }
    select.innerHTML = '<option value="">Unassigned</option>';
    (data || []).forEach(function (member) {
        const option = document.createElement("option");
        option.value = member.email;
        option.textContent = member.email;
        select.appendChild(option);
    });
}


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


    ensureTechnicianOption(appointment.technician);
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

function addDays(dateString, amount) {
    const date = new Date(`${dateString}T12:00:00`);
    date.setDate(date.getDate() + amount);
    return getLocalDateString(date);
}

function formatScheduleDate(dateString) {
    return new Date(`${dateString}T12:00:00`).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric"
    });
}

function renderUpcomingSchedule() {
    const startDate = getLocalDateString();
    const endDate = addDays(startDate, upcomingRangeDays - 1);
    const activeStatuses = new Set(["Scheduled", "Confirmed", "In Progress"]);
    const upcomingAppointments = appointments.filter(function (appointment) {
        return appointment.date >= startDate && appointment.date <= endDate && activeStatuses.has(appointment.status);
    });
    const upcomingCalendarEvents = calendarEvents.filter(function (event) {
        return event.date <= endDate && event.endDate >= startDate;
    });
    const upcomingItems = upcomingAppointments.concat(upcomingCalendarEvents).sort(function (a, b) {
        return a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime);
    });

    document.getElementById("upcomingScheduleSummary").textContent =
        `${upcomingItems.length} active item${upcomingItems.length === 1 ? "" : "s"} from ${formatScheduleDate(startDate)} through ${formatScheduleDate(endDate)}.`;

    if (!upcomingItems.length) {
        upcomingAppointmentList.innerHTML = `<div class="empty-state"><strong>No upcoming work</strong><p>No active appointments are scheduled in the next ${upcomingRangeDays} days.</p></div>`;
        return;
    }

    const groups = upcomingItems.reduce(function (result, item) {
        const groupDate = item.date < startDate ? startDate : item.date;
        if (!result[groupDate]) result[groupDate] = [];
        result[groupDate].push(item);
        return result;
    }, {});

    upcomingAppointmentList.innerHTML = Object.entries(groups).map(function ([date, items]) {
        return `<section class="upcoming-day-group">
            <div class="upcoming-day-heading"><strong>${escapeHtml(formatScheduleDate(date))}</strong><span>${items.length} item${items.length === 1 ? "" : "s"}</span></div>
            <div class="upcoming-day-items">${items.map(function (appointment) {
                const endDateLabel = appointment.endDate && appointment.endDate !== appointment.date ? ` through ${formatScheduleDate(appointment.endDate)}` : "";
                const editable = !appointment.readOnly && canManageSchedule;
                return `<article class="upcoming-appointment-card ${appointment.readOnly ? "calendar-request-event" : editable ? "" : "appointment-read-only"}" ${editable ? `data-appointment-id="${escapeHtml(appointment.id)}" tabindex="0" role="button"` : ""}>
                    <div class="upcoming-time"><strong>${appointment.allDay ? "All day" : formatTime(appointment.startTime)}</strong><span>${appointment.allDay ? endDateLabel : formatTime(appointment.endTime)}</span></div>
                    <div class="upcoming-main"><div><strong>${escapeHtml(appointment.customer)}</strong><span>${escapeHtml(appointment.unit || "No unit selected")}</span></div><p>${escapeHtml(appointment.description || "No work description")}</p></div>
                    <div class="upcoming-side"><span class="appointment-status">${escapeHtml(appointment.status)}</span><small>${escapeHtml(appointment.technician || "Unassigned")}</small></div>
                </article>`;
            }).join("")}</div>
        </section>`;
    }).join("");

    upcomingAppointmentList.querySelectorAll("[data-appointment-id]").forEach(function (card) {
        const open = function () { openAppointment(card.dataset.appointmentId); };
        card.addEventListener("click", open);
        card.addEventListener("keydown", function (event) {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                open();
            }
        });
    });
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

    renderUpcomingSchedule();


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


            if (!appointment.readOnly && canManageSchedule) {
                card.addEventListener("click", function () { openAppointment(appointment.id); });
            } else if (appointment.readOnly) {
                card.classList.add("calendar-request-event");
            } else {
                card.classList.add("appointment-read-only");
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
    async function () {

        if (!canManageSchedule) return;

        shopBehavior = await window.trackRightShopBehavior;

        selectedAppointmentId = null;

        clearAppointmentForm();

        document.getElementById(
            "appointmentDate"
        ).value =
            scheduleDate.value;

        document.getElementById("appointmentType").value = shopBehavior.default_appointment_type;

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

function closeAppointmentForm() {

    selectedAppointmentId = null;

    clearAppointmentForm();

    appointmentFormPanel.hidden = true;
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
    async function () {

        if (!canManageSchedule || !scheduleContext) return;

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

        if (!selectedAppointmentId && date && startTime && shopBehavior.scheduling_lead_hours > 0) {
            const earliest = new Date(Date.now() + shopBehavior.scheduling_lead_hours * 3600000);
            const requested = new Date(`${date}T${startTime}:00`);
            if (requested < earliest) {
                document.getElementById("appointmentMessage").textContent =
                    `This shop requires ${shopBehavior.scheduling_lead_hours} hours of scheduling notice.`;
                return;
            }
        }


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

            id: selectedAppointmentId || null,

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


        const saveButton = document.getElementById("saveAppointmentButton");
        const appointmentMessage = document.getElementById("appointmentMessage");
        saveButton.disabled = true;
        appointmentMessage.textContent = "Saving appointment…";
        let query;
        if (selectedAppointmentId) {
            query = scheduleClient.from("shop_appointments")
                .update(appointmentPayload(appointment))
                .eq("id", selectedAppointmentId)
                .eq("shop_id", scheduleContext.shopId)
                .select("*").single();
        } else {
            query = scheduleClient.from("shop_appointments")
                .insert({
                    ...appointmentPayload(appointment),
                    shop_id: scheduleContext.shopId,
                    created_by: scheduleContext.user.id
                })
                .select("*").single();
        }
        const { data: savedRow, error } = await query;
        saveButton.disabled = false;
        if (error) {
            appointmentMessage.textContent = `Appointment could not be saved: ${error.message}`;
            return;
        }

        const savedAppointment = appointmentFromRow(savedRow);
        const existingIndex = appointments.findIndex((item) => item.id === savedAppointment.id);
        if (existingIndex >= 0) appointments.splice(existingIndex, 1, savedAppointment);
        else appointments.push(savedAppointment);

        scheduleDate.value = savedAppointment.date;
        selectedAppointmentId = null;
        appointmentFormPanel.hidden = true;
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

document.getElementById("scheduledSummaryCard").addEventListener("click", function () {
    document.getElementById("upcomingSchedule").scrollIntoView({ behavior: "smooth", block: "start" });
});

document.querySelectorAll("[data-upcoming-days]").forEach(function (button) {
    button.addEventListener("click", function () {
        upcomingRangeDays = Number(button.dataset.upcomingDays);
        document.querySelectorAll("[data-upcoming-days]").forEach(function (rangeButton) {
            const active = rangeButton === button;
            rangeButton.classList.toggle("active", active);
            rangeButton.setAttribute("aria-pressed", String(active));
        });
        renderUpcomingSchedule();
    });
});

document.getElementById("appointmentStartTime").addEventListener("change", function () {
    if (!this.value || selectedAppointmentId) return;
    const parts=this.value.split(":").map(Number);
    const endMinutes=parts[0]*60+parts[1]+Number(shopBehavior.default_appointment_duration_minutes || 60);
    document.getElementById("appointmentEndTime").value=`${String(Math.floor((endMinutes/60)%24)).padStart(2,"0")}:${String(endMinutes%60).padStart(2,"0")}`;
});


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
                    appointment.date >= today &&
                    (appointment.status === "Scheduled" ||
                    appointment.status === "Confirmed")
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

appointmentList.innerHTML = '<div class="empty-state"><strong>Loading schedule…</strong></div>';
upcomingAppointmentList.innerHTML = '<div class="empty-state"><strong>Loading upcoming work…</strong></div>';

window.trackRightAuthReady.then(async function (context) {
    if (!context) return;
    scheduleContext = context;
    canManageSchedule = window.trackRightCan("schedule.manage");
    document.getElementById("new-appointment-button").hidden = !canManageSchedule;
    await Promise.all([loadScheduleTechnicians(), loadAppointments()]);
}).catch(function (error) {
    appointmentList.innerHTML = `<div class="empty-state error"><strong>Schedule could not initialize</strong><p>${escapeHtml(error.message)}</p></div>`;
});
