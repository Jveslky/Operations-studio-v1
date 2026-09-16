(function () {
    "use strict";
    const data = window.TrackRightMobile.load();
    const today = window.TrackRightMobile.localDate(0);
    const money = window.TrackRightMobile.money;
    const byId = function (id) { return document.getElementById(id); };
    const escapeHtml = function (value) { return String(value || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); };

    function invoiceBalance(invoice) { return Math.max(0, window.TrackRightMobile.invoiceTotal(invoice) - Number(invoice.paidAmount || 0)); }
    function timeLabel(value) {
        if (!value) return "Anytime";
        const parts = value.split(":"); const hour = Number(parts[0]);
        return (hour % 12 || 12) + ":" + parts[1] + (hour >= 12 ? " PM" : " AM");
    }

    function render() {
        const calls = data.appointments.filter(function (item) { return item.date === today && item.status !== "Completed"; }).sort(function (a, b) { return (a.time || "99:99").localeCompare(b.time || "99:99"); });
        const active = data.jobs.filter(function (item) { return ["Scheduled", "En Route", "Working"].includes(item.status); });
        const waiting = data.jobs.filter(function (item) { return String(item.status).startsWith("Waiting") || item.status === "Return Visit Needed"; });
        const ready = data.jobs.filter(function (item) { return item.status === "Ready to Invoice"; });
        const unpaid = data.invoices.filter(function (item) { return invoiceBalance(item) > 0 && item.status !== "Draft"; });

        byId("dashboardDate").textContent = new Date(today + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
        byId("todayCount").textContent = calls.length;
        byId("nextCall").textContent = calls.length ? "Next: " + timeLabel(calls[0].time) : "No calls scheduled";
        byId("activeJobCount").textContent = active.length;
        byId("waitingJobCount").textContent = waiting.length + " waiting";
        byId("readyJobCount").textContent = ready.length;
        byId("readyJobValue").textContent = money(ready.reduce(function (sum, job) { return sum + window.TrackRightMobile.jobTotal(job); }, 0)) + " pending";
        byId("outstandingTotal").textContent = money(unpaid.reduce(function (sum, invoice) { return sum + invoiceBalance(invoice); }, 0));
        byId("unpaidCount").textContent = unpaid.length + " unpaid invoice" + (unpaid.length === 1 ? "" : "s");

        byId("todaySchedule").innerHTML = calls.length ? calls.map(function (item) {
            return `<a class="appointment-card" href="Appointments.html"><div class="appointment-time">${escapeHtml(timeLabel(item.time))}</div><div class="appointment-info"><strong>${escapeHtml(item.customer)}</strong><span>${escapeHtml(item.asset)}</span><small>${escapeHtml(item.reason)}</small></div></a>`;
        }).join("") : '<div class="empty-state">No remaining calls today. Use New Appointment to add one.</div>';

        const serviceAlerts = data.customers.flatMap(function (customer) { return (customer.assets || []).filter(function (asset) { return asset.serviceStatus && asset.serviceStatus !== "current"; }).map(function (asset) { return { customer: customer.name, asset: asset.name, level: asset.serviceStatus, text: asset.serviceNote }; }); });
        const alerts = [
            ...waiting.map(function (job) { return { level: "warning", title: job.customer + " — " + job.asset, text: job.status, href: "MobileJobs.html?job=" + encodeURIComponent(job.id) }; }),
            ...serviceAlerts.map(function (item) { return { level: item.level, title: item.customer + " — " + item.asset, text: item.text, href: "MobileCustomers.html" }; }),
            ...unpaid.filter(function (invoice) { return invoice.status === "Past Due"; }).map(function (invoice) { return { level: "overdue", title: invoice.number + " — " + invoice.customer, text: money(invoiceBalance(invoice)) + " past due", href: "MobileInvoices.html" }; })
        ];
        byId("notificationList").innerHTML = alerts.length ? alerts.slice(0, 6).map(function (item) { return `<a class="notification-card ${escapeHtml(item.level)}" href="${item.href}"><span class="notification-dot"></span><div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.text)}</small></div><span>→</span></a>`; }).join("") : '<div class="empty-state">No service alerts. Everything is current.</div>';

        byId("jobActivity").innerHTML = [["Working", active.length], ["Waiting", waiting.length], ["Ready to invoice", ready.length]].map(function (row) { return `<div class="activity-row"><span>${row[0]}</span><strong>${row[1]}</strong></div>`; }).join("");
        byId("billingActivity").innerHTML = [["Drafts", data.invoices.filter(function (i) { return i.status === "Draft"; }).length], ["Sent / unpaid", unpaid.length], ["Collected", money(data.invoices.reduce(function (sum, i) { return sum + Number(i.paidAmount || 0); }, 0))]].map(function (row) { return `<div class="activity-row"><span>${row[0]}</span><strong>${row[1]}</strong></div>`; }).join("");
    }

    const params = new URLSearchParams(window.location.search);
    if (params.get("resetDemo") === "1") localStorage.removeItem(window.TrackRightMobile.storageKey);
    render();

    byId("menuButton").addEventListener("click", function () {
        const menu = byId("mobileMenu");
        menu.classList.toggle("open");
        byId("menuButton").setAttribute("aria-expanded", String(menu.classList.contains("open")));
    });
}());
