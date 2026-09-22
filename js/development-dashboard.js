(function () {
    "use strict";

    const NOTES_KEY = "trackRightDevelopmentNotesV1";
    const repository = "Jveslky/Operations-studio-v1";
    const rootPrefix = document.documentElement.dataset.rootPrefix || "";
    const project = {
        pages: 38,
        protectedPages: 25,
        modules: [
            { name: "Platform & Access", description: "Shared identity, protected routing, membership, recovery, and production delivery.", href: "pages/Admin/personal-fleet-invites.html", stages: [
                { name: "Identity foundation", checks: [{ label: "Authentication", status: "complete" }, { label: "Password recovery", status: "complete" }, { label: "Protected routes", status: "complete" }, { label: "Workspace routing", status: "complete" }] },
                { name: "Access control", checks: [{ label: "Shop membership", status: "complete" }, { label: "Personal Fleet invitations", status: "complete" }, { label: "Role presets", status: "complete" }, { label: "Granular database enforcement", status: "complete" }] },
                { name: "Production delivery", checks: [{ label: "GitHub Pages deployment", status: "complete" }, { label: "Supabase auth configuration", status: "complete" }, { label: "Resend SMTP delivery", status: "complete" }, { label: "Infrastructure shortcuts", status: "complete" }] },
                { name: "Launch validation", checks: [{ label: "Manual auth and invitation pass", status: "complete" }, { label: "Automated auth regression suite", status: "pending", critical: true }] }
            ] },
            { name: "Shop Operations", description: "The full shop workspace from customer intake through finance and owner controls.", href: "pages/Shop/shop-dashboard.html", stages: [
                { name: "Core operations", checks: [{ label: "Customers", status: "complete" }, { label: "Units", status: "complete" }, { label: "Repair orders", status: "complete" }, { label: "Technician assignment", status: "complete" }, { label: "Invoices", status: "complete" }, { label: "Accounts payable", status: "complete" }] },
                { name: "Owner controls", checks: [{ label: "Shop profile and tax", status: "complete" }, { label: "Inspections and media", status: "complete" }, { label: "Requests and documents", status: "complete" }, { label: "Behavior and appearance", status: "complete" }, { label: "Data management", status: "complete" }, { label: "Users and permissions", status: "complete" }] },
                { name: "Data and security", checks: [{ label: "Explicit shop scoping", status: "complete" }, { label: "Sensitive-workflow RLS", status: "complete" }, { label: "Private media storage", status: "complete" }, { label: "Validated backup recovery", status: "complete" }] },
                { name: "Launch validation", checks: [{ label: "Manual core workflow pass", status: "complete" }, { label: "Full phone-width review", status: "pending" }, { label: "Automated smoke coverage", status: "pending", critical: true }, { label: "External shop pilot", status: "pending", critical: true }] }
            ] },
            { name: "Mobile Service", description: "Field-service workflow, mobile persistence, office handoff, and technician deployment.", href: "pages/Mobile/MobileDashboard.html", stages: [
                { name: "Field workflow", checks: [{ label: "Appointments", status: "complete" }, { label: "Customers", status: "complete" }, { label: "Field jobs", status: "complete" }, { label: "Invoices", status: "complete" }, { label: "Expenses", status: "complete" }] },
                { name: "Cloud data foundation", checks: [{ label: "Supabase persistence", status: "pending", critical: true }, { label: "Tenant scoping", status: "pending", critical: true }, { label: "Shared unit history", status: "pending" }, { label: "Offline-sync strategy", status: "pending" }] },
                { name: "Office handoff", checks: [{ label: "Appointment to field job", status: "complete" }, { label: "Field job to draft invoice", status: "complete" }, { label: "Shared Shop account handoff", status: "pending" }] },
                { name: "Launch validation", checks: [{ label: "Phone layout pass", status: "complete" }, { label: "Authenticated field pilot", status: "pending", critical: true }, { label: "Automated smoke coverage", status: "pending", critical: true }] }
            ] },
            { name: "Personal Fleet", description: "Cloud fleet records, maintenance, repair orders, regional formats, and beta access.", href: "pages/PersonalFleet/Personaldashboard.html", stages: [
                { name: "Account and setup", checks: [{ label: "Private invitations", status: "complete" }, { label: "Cloud account records", status: "complete" }, { label: "Fleet naming", status: "complete" }, { label: "Regional units and currency", status: "complete" }] },
                { name: "Fleet management", checks: [{ label: "Create and edit units", status: "complete" }, { label: "Archive and restore", status: "complete" }, { label: "Dashboard scopes", status: "complete" }] },
                { name: "Maintenance workflow", checks: [{ label: "Service history and reminders", status: "complete" }, { label: "Repair orders", status: "complete" }, { label: "Technician assignment", status: "complete" }, { label: "Exports and backups", status: "complete" }] },
                { name: "Beta validation", checks: [{ label: "Primary invitation flow", status: "complete" }, { label: "Two feedback accounts complete", status: "pending", critical: true }, { label: "Full phone-width review", status: "pending" }, { label: "Automated smoke coverage", status: "pending", critical: true }] }
            ] }
        ],
        attention: [
            { title: "Operational data layer", detail: "Shop, Mobile, and Personal Fleet do not yet share one Supabase model.", state: "partial" },
            { title: "Automated test coverage", detail: "No repeatable browser or unit test suite is connected.", state: "not-connected" },
            { title: "Mobile cloud persistence", detail: "The field workflow still needs shop-scoped Supabase persistence and tenant isolation.", state: "not-connected" },
            { title: "Personal Fleet field test", detail: "Complete onboarding and real workflow feedback with both complimentary accounts.", state: "working" },
            { title: "Responsive coverage", detail: "The complete Shop and Personal Fleet page sets still need a documented phone-width pass.", state: "partial" },
            { title: "External launch validation", detail: "Shop and Mobile still need real pilot use before deployment can be marked complete.", state: "partial" }
        ],
        backlog: [
            { title: "Move Mobile Service to Supabase", detail: "Replace local-only persistence with shop-scoped cloud records and policies.", state: "planned" },
            { title: "Pilot Shop Operations", detail: "Run the complete authenticated workflow with an external shop account.", state: "planned" },
            { title: "Field-test Personal Fleet beta", detail: "Validate invitations, cloud persistence, backups, and phone layouts with the two feedback accounts.", state: "working" },
            { title: "Create automated smoke tests", detail: "Protect auth, navigation, and the critical record workflows.", state: "not-connected" },
            { title: "Complete responsive review", detail: "Verify every Shop and Personal Fleet page at phone width.", state: "partial" }
        ],
        activity: [
            { title: "Shop navigation completed", detail: "The shared settings hamburger is now available across authenticated Shop pages." },
            { title: "Granular permissions enforced", detail: "Role presets and sensitive actions are protected in both the interface and database." },
            { title: "Shop data recovery connected", detail: "Scoped exports, validated backups, and protected restore are available in Data Management." },
            { title: "Personal Fleet beta connected", detail: "Cloud records, manual service entries, feature access, 20-unit limits, and complimentary invitations are wired." },
            { title: "Mobile Service workflow completed", detail: "Appointments now flow into jobs and draft invoices." }
        ]
    };

    const byId = (id) => document.getElementById(id);
    const labelForState = (state) => ({ live: "Live", complete: "Complete", working: "Working", partial: "Partial", planned: "Planned", pending: "Pending", blocked: "Blocked", error: "Error", "not-connected": "Not connected" }[state] || state);
    const flattenChecks = (module) => module.stages.flatMap((stage) => stage.checks);
    const completedChecks = (checks) => checks.filter((check) => check.status === "complete").length;
    const completionPercent = (checks) => checks.length ? Math.round((completedChecks(checks) / checks.length) * 100) : 0;
    const moduleState = (progress) => progress === 100 ? "live" : progress >= 75 ? "working" : "partial";

    function stageMarkup(stage) {
        const done = completedChecks(stage.checks);
        const progress = completionPercent(stage.checks);
        const state = progress === 100 ? "complete" : progress === 0 ? "planned" : "working";
        return `<details class="stage-row" ${progress < 100 ? "open" : ""}>
            <summary><span><strong>${stage.name}</strong><small>${done}/${stage.checks.length} checks</small></span><span class="stage-progress"><b>${progress}%</b><i><em style="width:${progress}%"></em></i></span></summary>
            <ul>${stage.checks.map((check) => `<li class="${check.status}"><span aria-hidden="true"></span><span>${check.label}${check.critical && check.status !== "complete" ? " <b>Launch blocker</b>" : ""}</span><small>${labelForState(check.status)}</small></li>`).join("")}</ul>
            <span class="visually-hidden">${labelForState(state)}</span>
        </details>`;
    }

    function renderProject() {
        const allChecks = project.modules.flatMap(flattenChecks);
        const allStages = project.modules.flatMap((module) => module.stages);
        const checksDone = completedChecks(allChecks);
        const stagesDone = allStages.filter((stage) => completionPercent(stage.checks) === 100).length;
        const openChecks = allChecks.length - checksDone;
        const blockers = allChecks.filter((check) => check.critical && check.status !== "complete").length;
        const overallProgress = completionPercent(allChecks);
        byId("metric-readiness").textContent = `${overallProgress}%`;
        byId("metric-readiness-detail").textContent = `${checksDone} of ${allChecks.length} checks complete`;
        byId("metric-modules").textContent = String(project.modules.length);
        byId("metric-modules-detail").textContent = `${stagesDone} of ${allStages.length} deployment stages complete`;
        byId("metric-protected").textContent = String(project.protectedPages);
        byId("metric-protected-detail").textContent = `${project.pages - project.protectedPages} require review or are public auth pages`;
        byId("metric-open-checks").textContent = String(openChecks);
        byId("metric-open-checks-detail").textContent = `${blockers} launch blockers`;
        byId("attention-count").textContent = String(project.attention.length);
        byId("backlog-count").textContent = String(project.backlog.length);

        byId("attention-list").innerHTML = project.attention.map((item) => `
            <div class="attention-item ${item.state}"><span class="attention-icon" aria-hidden="true"></span>
                <div><strong>${item.title}</strong><small>${item.detail}</small></div><span class="state-label">${labelForState(item.state)}</span></div>`).join("");

        byId("deployment-summary").innerHTML = `<div><span>Overall product completion</span><strong>${overallProgress}%</strong></div><div class="progress-track" role="progressbar" aria-label="Overall product completion" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${overallProgress}"><span style="width:${overallProgress}%"></span></div><small>${checksDone} complete · ${openChecks} open · ${blockers} launch blockers · reviewed September 22, 2026</small>`;

        byId("module-grid").innerHTML = project.modules.map((module, index) => {
            const checks = flattenChecks(module);
            const done = completedChecks(checks);
            const progress = completionPercent(checks);
            const blockers = checks.filter((check) => check.critical && check.status !== "complete").length;
            const state = moduleState(progress);
            return `<article class="module-card"><div class="module-card-top"><span class="module-index">${String(index + 1).padStart(2, "0")}</span><span class="status-chip ${state}">${labelForState(state)}</span></div>
                <h3>${module.name}</h3><p>${module.description}</p>
                <div class="module-progress"><div><span>Deployment readiness</span><strong>${progress}%</strong></div><div class="progress-track" role="progressbar" aria-label="${module.name} deployment readiness" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}"><span style="width:${progress}%"></span></div></div>
                <div class="module-metrics"><span><b>${module.stages.length}</b> stages</span><span><b>${done}/${checks.length}</b> checks</span><span><b>${blockers}</b> blockers</span></div>
                <div class="stage-list">${module.stages.map(stageMarkup).join("")}</div><a href="${rootPrefix}${module.href}">Open module →</a></article>`;
        }).join("");

        byId("backlog-list").innerHTML = project.backlog.map((item) => `<li><div><strong>${item.title}</strong><small>${item.detail}</small></div><span class="status-chip ${item.state}">${labelForState(item.state)}</span></li>`).join("");
        byId("activity-list").innerHTML = project.activity.map((item) => `<div class="activity-item"><strong>${item.title}</strong><span>${item.detail}</span></div>`).join("");
        const mobile = project.modules.find((module) => module.name === "Mobile Service");
        const mobileProgress = completionPercent(flattenChecks(mobile));
        byId("current-focus").textContent = "Mobile Service cloud data";
        byId("focus-detail").textContent = "Supabase persistence, tenant scoping, and field validation";
        byId("continue-title").textContent = "Mobile Service cloud data";
        byId("continue-description").textContent = "Move the working field workflow from local persistence into shop-scoped Supabase records, then run the authenticated field pilot.";
        byId("continue-progress").style.width = `${mobileProgress}%`;
    }

    function healthCard(name, state, value, detail) {
        return `<article class="health-card"><div class="health-card-head"><h3>${name}</h3><span class="status-chip ${state}">${labelForState(state)}</span></div><p>${value}</p><small>${detail}</small></article>`;
    }

    async function checkHealth() {
        const grid = byId("health-grid");
        const refresh = byId("refresh-health");
        refresh.disabled = true;
        refresh.textContent = "Checking…";
        const context = await window.trackRightAuthReady;
        const checks = [
            healthCard("Authentication", context?.user ? "live" : "error", context?.user ? "Signed in" : "Unavailable", context?.user?.email || "No authenticated user returned"),
            healthCard("Membership", context?.membership ? "live" : "error", context?.role || "Unavailable", context?.shop?.name || "No active shop membership returned"),
            healthCard("Deployment", "live", "Online", window.location.hostname || "Local preview"),
            healthCard("Automated tests", "not-connected", "0", "No automated suite is connected yet")
        ];
        try {
            const response = await fetch(`https://api.github.com/repos/${repository}/commits?per_page=1`, { headers: { Accept: "application/vnd.github+json" } });
            if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
            const latest = (await response.json())[0];
            checks.splice(2, 0, healthCard("GitHub", "live", latest?.sha?.slice(0, 7) || "0", latest?.commit?.message?.split("\n")[0] || "No commit returned"));
        } catch (error) {
            checks.splice(2, 0, healthCard("GitHub", "error", "Unavailable", error.message));
        }
        grid.innerHTML = checks.join("");
        const hasError = checks.some((check) => check.includes("status-chip error"));
        byId("sidebar-status-dot").className = `status-dot ${hasError ? "bad" : "good"}`;
        byId("sidebar-status").textContent = hasError ? "Check system status" : "Core systems online";
        refresh.disabled = false;
        refresh.textContent = "Refresh checks";
    }

    function setupNotes() {
        const notes = byId("project-notes");
        const status = byId("notes-status");
        const count = byId("notes-count");
        let timer;
        const updateCount = () => { count.textContent = `${notes.value.length.toLocaleString()} characters`; };
        const saveNotes = () => {
            const payload = { value: notes.value, savedAt: new Date().toISOString() };
            localStorage.setItem(NOTES_KEY, JSON.stringify(payload));
            status.textContent = `Saved ${new Date(payload.savedAt).toLocaleString()}`;
        };
        try {
            const saved = JSON.parse(localStorage.getItem(NOTES_KEY));
            if (saved?.value) { notes.value = saved.value; status.textContent = `Last saved ${new Date(saved.savedAt).toLocaleString()}`; }
        } catch (error) { status.textContent = "Notes storage could not be read"; }
        updateCount();
        notes.addEventListener("input", () => { updateCount(); status.textContent = "Saving…"; window.clearTimeout(timer); timer = window.setTimeout(saveNotes, 450); });
        byId("clear-notes").addEventListener("click", () => {
            if (!notes.value || window.confirm("Clear all project notes saved in this browser?")) { notes.value = ""; localStorage.removeItem(NOTES_KEY); status.textContent = "No local notes saved yet"; updateCount(); }
        });
    }

    function setupNavigation() {
        const sidebar = document.querySelector(".dev-sidebar");
        const button = byId("mobile-menu-button");
        button.addEventListener("click", () => { const isOpen = sidebar.classList.toggle("open"); button.setAttribute("aria-expanded", String(isOpen)); });
        document.querySelectorAll(".dev-nav a").forEach((link) => link.addEventListener("click", () => sidebar.classList.remove("open")));
    }

    async function initialize() {
        const context = await window.trackRightAuthReady;
        if (!context) return;
        if (context.platformRole !== "platform_owner" && context.platformRole !== "platform_admin") {
            byId("development-dashboard").hidden = true;
            document.querySelector(".dev-sidebar").hidden = true;
            byId("development-access-denied").hidden = false;
            return;
        }
        byId("current-date").textContent = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date());
        renderProject(); setupNotes(); setupNavigation();
        byId("refresh-health").addEventListener("click", checkHealth);
        await checkHealth();
    }

    initialize().catch((error) => {
        console.error("Development dashboard failed to initialize:", error);
        byId("sidebar-status-dot")?.classList.add("bad");
        if (byId("sidebar-status")) byId("sidebar-status").textContent = "Dashboard error";
    });
})();
