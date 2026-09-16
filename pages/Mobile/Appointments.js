(function () {
    "use strict";
    const mobileData = window.TrackRightMobile.load();
    const appointments = mobileData.appointments;
    const byId = function (id) { return document.getElementById(id); };
    const picker = byId("appointmentDatePicker");
    const formPanel = byId("appointmentFormPanel");
    const timedList = byId("timedAppointmentList");
    const anytimeList = byId("anytimeAppointmentList");

    function escapeHtml(value) {
        return String(value || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
    }

    function formatTime(value) {
        if (!value) return "Anytime";
        const parts = value.split(":");
        const hour = Number(parts[0]);
        return (hour % 12 || 12) + ":" + parts[1] + (hour >= 12 ? " PM" : " AM");
    }

    function formatDate(value) {
        return new Date(value + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    }

    function card(appointment) {
        const completed = appointment.status === "Completed";
        return `<article class="appointment-card" data-appointment-id="${escapeHtml(appointment.id)}">
            <div class="appointment-time ${appointment.time ? "" : "anytime"}">${escapeHtml(formatTime(appointment.time))}</div>
            <div class="appointment-details">
                <div class="appointment-title"><div><strong>${escapeHtml(appointment.customer)}</strong><span>${escapeHtml(appointment.asset || "Asset not selected")}</span></div><span class="status-badge ${completed ? "completed" : "scheduled"}">${escapeHtml(appointment.status)}</span></div>
                <p>${escapeHtml(appointment.reason || "No service reason entered")}</p>
                <div class="appointment-meta"><span>📍 ${escapeHtml(appointment.location || "Location not entered")}</span><span>Tech: ${escapeHtml(appointment.technician || "Unassigned")}</span></div>
                ${appointment.notes ? `<p>${escapeHtml(appointment.notes)}</p>` : ""}
                <div class="appointment-actions">
                    ${completed ? "" : `<button type="button" class="secondary-button start-job">Start job</button><button type="button" class="secondary-button complete-appointment">Complete</button>`}
                </div>
            </div>
        </article>`;
    }

    function render() {
        const selected = appointments.filter(function (item) { return item.date === picker.value; });
        const timed = selected.filter(function (item) { return item.time; }).sort(function (a, b) { return a.time.localeCompare(b.time); });
        const anytime = selected.filter(function (item) { return !item.time; });
        timedList.innerHTML = timed.length ? timed.map(card).join("") : '<div class="empty-state">No timed calls scheduled.</div>';
        anytimeList.innerHTML = anytime.length ? anytime.map(card).join("") : '<div class="empty-state">No anytime calls scheduled.</div>';
        byId("appointmentCount").textContent = selected.length;
        byId("completedCount").textContent = selected.filter(function (item) { return item.status === "Completed"; }).length;
        byId("remainingCount").textContent = selected.filter(function (item) { return item.status !== "Completed"; }).length;
        byId("selectedDateLabel").textContent = formatDate(picker.value);
        byId("newAppointmentDate").value = picker.value;
    }

    function changeDate(days) {
        const date = new Date(picker.value + "T12:00:00");
        date.setDate(date.getDate() + days);
        picker.value = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
        render();
    }

    function createJob(appointment) {
        let job = mobileData.jobs.find(function (item) { return item.appointmentId === appointment.id; });
        if (!job) {
            job = {
                id: window.TrackRightMobile.id("job"), appointmentId: appointment.id, customer: appointment.customer, asset: appointment.asset,
                status: "Working", technician: appointment.technician || "Unassigned", location: appointment.location, complaint: appointment.reason,
                customerNotes: appointment.notes || "", technicianNotes: "", serviceCall: 0, miles: 0, travelHours: 0,
                labor: [], parts: [], misc: [], updatedAt: new Date().toISOString()
            };
            mobileData.jobs.push(job);
            appointment.status = "In Progress";
            window.TrackRightMobile.save(mobileData);
        }
        window.location.href = "MobileJobs.html?job=" + encodeURIComponent(job.id);
    }

    function handleListClick(event) {
        const article = event.target.closest("[data-appointment-id]");
        if (!article) return;
        const appointment = appointments.find(function (item) { return item.id === article.dataset.appointmentId; });
        if (!appointment) return;
        if (event.target.closest(".start-job")) createJob(appointment);
        if (event.target.closest(".complete-appointment")) {
            appointment.status = "Completed";
            window.TrackRightMobile.save(mobileData);
            render();
        }
    }

    byId("previousDayButton").addEventListener("click", function () { changeDate(-1); });
    byId("nextDayButton").addEventListener("click", function () { changeDate(1); });
    byId("todayButton").addEventListener("click", function () { picker.value = window.TrackRightMobile.localDate(0); render(); });
    picker.addEventListener("change", render);
    byId("openAppointmentFormButton").addEventListener("click", function () { formPanel.classList.remove("hidden"); byId("newAppointmentDate").value = picker.value; });
    byId("closeAppointmentFormButton").addEventListener("click", function () { formPanel.classList.add("hidden"); });
    timedList.addEventListener("click", handleListClick);
    anytimeList.addEventListener("click", handleListClick);

    byId("saveAppointmentButton").addEventListener("click", function () {
        const date = byId("newAppointmentDate").value;
        const customer = byId("newAppointmentCustomer").value.trim();
        if (!date || !customer) { byId("appointmentFormMessage").textContent = "Date and customer are required."; return; }
        appointments.push({
            id: window.TrackRightMobile.id("appointment"), date, time: byId("newAppointmentTime").value,
            customer, asset: byId("newAppointmentAsset").value.trim(), location: byId("newAppointmentLocation").value.trim(),
            technician: byId("newAppointmentTechnician").value.trim(), reason: byId("newAppointmentReason").value.trim(),
            notes: byId("newAppointmentNotes").value.trim(), status: "Scheduled"
        });
        window.TrackRightMobile.save(mobileData);
        picker.value = date;
        ["newAppointmentTime", "newAppointmentCustomer", "newAppointmentAsset", "newAppointmentLocation", "newAppointmentTechnician", "newAppointmentReason", "newAppointmentNotes"].forEach(function (id) { byId(id).value = ""; });
        formPanel.classList.add("hidden");
        render();
    });

    picker.value = window.TrackRightMobile.localDate(0);
    render();
    if (new URLSearchParams(window.location.search).get("action") === "new") byId("openAppointmentFormButton").click();
}());
