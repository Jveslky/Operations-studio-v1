(function () {
    "use strict";

    const NOTES_KEY = "trackRightDevelopmentNotesV1";
    const repository = "Jveslky/Operations-studio-v1";
    const rootPrefix = document.documentElement.dataset.rootPrefix || "";
    const project = {
        pages: 36,
        protectedPages: 23,
        modules: [
            { name: "Platform & Access", state: "live", progress: 82, description: "Login, shop membership, invitations, roles, account recovery, and module routing.", href: "pages/Admin/users.html" },
            { name: "Shop Operations", state: "partial", progress: 66, description: "Core shop screens exist. Shared data wiring, exports, and invoice flow still need consolidation.", href: "pages/Shop/shop-dashboard.html" },
            { name: "Mobile Service", state: "working", progress: 74, description: "Connected field workflow is functional with local persistence; Supabase migration remains.", href: "pages/Mobile/MobileDashboard.html" },
            { name: "Personal Fleet", state: "partial", progress: 48, description: "Vehicle and repair screens exist. Add-on permissions and shared data architecture remain.", href: "pages/PersonalFleet/Personaldashboard.html" }
        ],
        attention: [
            { title: "Operational data layer", detail: "Shop, Mobile, and Personal Fleet do not yet share one Supabase model.", state: "partial" },
            { title: "Automated test coverage", detail: "No repeatable browser or unit test suite is connected.", state: "not-connected" },
            { title: "Shop import workflow", detail: "Backup import and validation are not connected.", state: "not-connected" },
            { title: "Personal Fleet permissions", detail: "Repair-order add-on access rules are not wired.", state: "blocked" },
            { title: "Responsive coverage", detail: "Mobile Service is checked; the full Shop and Fleet page set is not.", state: "partial" },
            { title: "Project status automation", detail: "Module progress is maintained here and is not yet derived from tests.", state: "not-connected" }
        ],
        backlog: [
            { title: "Connect operational data to Supabase", detail: "Define the shared model and migrate one module at a time.", state: "planned" },
            { title: "Finish Shop data management", detail: "Invoice/AP export, full backup, import validation, and recovery.", state: "partial" },
            { title: "Add Personal Fleet feature permissions", detail: "Keep core fleet available and gate repair-order add-ons.", state: "planned" },
            { title: "Create automated smoke tests", detail: "Protect auth, navigation, and the critical record workflows.", state: "not-connected" },
            { title: "Complete responsive review", detail: "Verify every Shop and Personal Fleet page at phone width.", state: "partial" }
        ],
        activity: [
            { title: "Mobile Service workflow completed", detail: "Appointments now flow into jobs and draft invoices." },
            { title: "Invitation membership conflict repaired", detail: "Legacy membership constraints now support the invite flow." },
            { title: "Authentication system connected", detail: "Login, recovery, membership, roles, and protected routes are live." },
            { title: "Shop data-management work consolidated", detail: "Shared settings and export behavior moved toward one implementation." }
        ]
    };

    const byId = (id) => document.getElementById(id);
    const labelForState = (state) => ({ live: "Live", complete: "Complete", working: "Working", partial: "Partial", planned: "Planned", blocked: "Blocked", error: "Error", "not-connected": "Not connected" }[state] || state);

    function renderProject() {
        const completeCount = project.modules.filter((module) => ["complete", "live"].includes(module.state)).length;
        byId("metric-modules").textContent = String(project.modules.length);
        byId("metric-modules-detail").textContent = `${completeCount} live · ${project.modules.length - completeCount} still developing`;
        byId("metric-pages").textContent = String(project.pages);
        byId("metric-protected").textContent = String(project.protectedPages);
        byId("metric-protected-detail").textContent = `${project.pages - project.protectedPages} require review or are public auth pages`;
        byId("metric-attention").textContent = String(project.attention.length);
        byId("attention-count").textContent = String(project.attention.length);
        byId("backlog-count").textContent = String(project.backlog.length);

        byId("attention-list").innerHTML = project.attention.map((item) => `
            <div class="attention-item ${item.state}"><span class="attention-icon" aria-hidden="true"></span>
                <div><strong>${item.title}</strong><small>${item.detail}</small></div><span class="state-label">${labelForState(item.state)}</span></div>`).join("");

        byId("module-grid").innerHTML = project.modules.map((module, index) => `
            <article class="module-card"><div class="module-card-top"><span class="module-index">${String(index + 1).padStart(2, "0")}</span><span class="status-chip ${module.state}">${labelForState(module.state)}</span></div>
                <h3>${module.name}</h3><p>${module.description}</p><div class="module-progress"><div><span>Connected build</span><strong>${module.progress}%</strong></div><div class="progress-track"><span style="width:${module.progress}%"></span></div></div><a href="${rootPrefix}${module.href}">Open module →</a></article>`).join("");

        byId("backlog-list").innerHTML = project.backlog.map((item) => `<li><div><strong>${item.title}</strong><small>${item.detail}</small></div><span class="status-chip ${item.state}">${labelForState(item.state)}</span></li>`).join("");
        byId("activity-list").innerHTML = project.activity.map((item) => `<div class="activity-item"><strong>${item.title}</strong><span>${item.detail}</span></div>`).join("");
        byId("continue-progress").style.width = "90%";
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
        if (context.role !== "owner") {
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
