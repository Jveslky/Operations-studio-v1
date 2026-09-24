(function () {
    "use strict";

    const client = window.trackRightSupabase;
    const loginPath = document.documentElement.dataset.loginPath || "login.html";
    const workspace = document.documentElement.dataset.workspace || "shop";
    const requiredFeature = document.documentElement.dataset.feature || "";
    const rolePermissions = {
        owner: ["*"],
        admin: ["customers.read", "customers.write", "repair_orders.read", "repair_orders.write", "repair_orders.update_work", "invoices.read", "invoices.write", "expenses.read", "expenses.write", "schedule.manage", "inspections.work", "requests.review", "team_documents.manage", "data.export", "data.import", "settings.manage", "users.manage"],
        service_writer: ["customers.read", "customers.write", "repair_orders.read", "repair_orders.write", "invoices.read", "invoices.write", "schedule.manage", "inspections.work", "requests.review", "data.export"],
        technician: ["repair_orders.read", "repair_orders.update_work", "inspections.work"],
        read_only: ["customers.read", "repair_orders.read", "invoices.read", "expenses.read", "data.export"]
    };

    document.body.style.visibility = "hidden";

    function safeReturnPath() {
        const current = window.location.pathname + window.location.search;
        return current.includes("login.html") ? "" : current;
    }

    function sendToLogin() {
        const returnTo = encodeURIComponent(safeReturnPath());
        window.location.replace(`${loginPath}${returnTo ? `?returnTo=${returnTo}` : ""}`);
    }

    async function loadContext() {
        const { data: sessionData, error: sessionError } =
            await client.auth.getSession();

        if (sessionError || !sessionData.session) {
            sendToLogin();
            return null;
        }

        const user = sessionData.session.user;
        const platformResult = await client
            .from("platform_users")
            .select("role")
            .eq("user_id", user.id)
            .maybeSingle();
        const platformRole = platformResult.data?.role || null;

        if (workspace === "platform") {
            if (!platformRole) {
                const rootPath = loginPath.replace(/login\.html(?:\?.*)?$/, "");
                window.location.replace(`${rootPath}account-required.html?workspace=platform`);
                return null;
            }
            const context = {
                session: sessionData.session,
                user,
                workspace,
                platformRole,
                role: platformRole,
                membership: null
            };
            window.trackRightAuth = context;
            window.trackRightCan = () => true;
            document.documentElement.dataset.authReady = "true";
            addAccountControls(context);
            document.body.style.visibility = "visible";
            return context;
        }

        if (workspace === "personal_fleet") {
            const personalResult = await client
                .from("personal_fleet_members")
                .select("account_id, role, personal_fleet_accounts(id, name, plan_code, billing_status, unit_limit, features, status, region_code, locale_code, currency_code, distance_unit, volume_unit, temperature_unit, pressure_unit)")
                .eq("user_id", user.id)
                .eq("is_active", true)
                .limit(1)
                .maybeSingle();

            if (personalResult.error) {
                console.error("Unable to load Personal Fleet membership:", personalResult.error);
            }
            if (!personalResult.data) {
                const rootPath = loginPath.replace(/login\.html(?:\?.*)?$/, "");
                window.location.replace(`${rootPath}account-required.html?workspace=personal-fleet`);
                return null;
            }

            const personalAccount = personalResult.data.personal_fleet_accounts;
            if (requiredFeature && !personalAccount?.features?.includes(requiredFeature)) {
                window.location.replace("Personaldashboard.html?notice=feature-unavailable");
                return null;
            }
            const context = {
                session: sessionData.session,
                user,
                workspace,
                platformRole,
                membership: personalResult.data,
                personalAccountId: personalResult.data.account_id,
                role: personalResult.data.role,
                personalAccount
            };
            window.trackRightAuth = context;
            window.trackRightCan = function (permission) {
                if (context.role === "owner" || context.role === "manager") return true;
                return permission.endsWith(".read");
            };
            document.documentElement.dataset.authReady = "true";
            addAccountControls(context);
            document.body.style.visibility = "visible";
            return context;
        }

        let { data: membership, error: membershipError } = await client
            .from("shop_members")
            .select("*, shops(id, name)")
            .eq("user_id", user.id)
            .eq("is_active", true)
            .limit(1)
            .maybeSingle();

        if (!membership && user.user_metadata?.shop_name) {
            const { error: bootstrapError } = await client.rpc("bootstrap_my_shop", {
                requested_shop_name: user.user_metadata.shop_name
            });

            if (!bootstrapError) {
                const retry = await client
                    .from("shop_members")
                    .select("*, shops(id, name)")
                    .eq("user_id", user.id)
                    .eq("is_active", true)
                    .limit(1)
                    .maybeSingle();
                membership = retry.data;
                membershipError = retry.error;
            }
        }

        if (membershipError) {
            console.error("Unable to load shop membership:", membershipError);
        }

        if (!membership) {
            const rootPath = loginPath.replace(/login\.html(?:\?.*)?$/, "");
            window.location.replace(`${rootPath}account-required.html`);
            return null;
        }

        const context = {
            session: sessionData.session,
            user,
            workspace,
            platformRole,
            membership: membership || null,
            shopId: membership?.shop_id || null,
            role: membership?.role || null,
            shop: membership?.shops || null
        };

        window.trackRightAuth = context;
        window.trackRightCan = function (permission) {
            if (context.role === "owner") return true;
            const override = context.membership?.permission_overrides?.[permission];
            if (typeof override === "boolean") return override;
            const allowed = rolePermissions[context.role] || [];
            return allowed.includes("*") || allowed.includes(permission);
        };
        if (!applyShopPageAccess(context)) return null;
        document.documentElement.dataset.authReady = "true";
        if (window.trackRightCan("settings.manage")) addShopSettingsMenu();
        addAccountControls(context);
        document.body.style.visibility = "visible";
        return context;
    }

    function applyShopPageAccess(context) {
        const page = window.location.pathname.split("/").pop().toLowerCase();
        const rootPath = loginPath.replace(/login\.html(?:\?.*)?$/, "");
        const dashboard = context.role === "technician"
            ? `${rootPath}pages/Shop/technician-dashboard.html`
            : `${rootPath}pages/Shop/shop-dashboard.html`;
        const canUseAccountsPayable = window.trackRightCan("expenses.read") || window.trackRightCan("expenses.write");
        if (page === "accounts-payable.html" && !canUseAccountsPayable) {
            window.location.replace(dashboard);
            return false;
        }
        if (page === "shop-settings.html" && !window.trackRightCan("settings.manage")) {
            window.location.replace(dashboard);
            return false;
        }

        document.querySelectorAll(".app-nav a").forEach(function (link) {
            const linkedPage = new URL(link.href, window.location.href).pathname.split("/").pop().toLowerCase();
            if (linkedPage === "accounts-payable.html" && !canUseAccountsPayable) link.remove();
        });
        if (context.role !== "technician") return true;

        const technicianPages = new Set([
            "technician-dashboard.html",
            "repair-orders.html",
            "repair-order-details.html"
        ]);
        if (!technicianPages.has(page)) {
            window.location.replace(dashboard);
            return false;
        }

        document.querySelectorAll(".app-nav a").forEach(function (link) {
            const linkedPage = new URL(link.href, window.location.href).pathname.split("/").pop().toLowerCase();
            if (linkedPage === "shop-dashboard.html") {
                link.href = dashboard;
                link.textContent = "Dashboard";
                return;
            }
            if (linkedPage !== "repair-orders.html") link.remove();
        });
        return true;
    }

    function addShopSettingsMenu() {
        const header = document.querySelector(".app-header-inner, .header-inner");
        if (!header || document.getElementById("settings-menu-button")) return;
        const rootPath = loginPath.replace(/login\.html(?:\?.*)?$/, "");
        const button = document.createElement("button");
        button.id = "settings-menu-button";
        button.className = "settings-menu-button";
        button.type = "button";
        button.setAttribute("aria-label", "Open Shop settings menu");
        button.setAttribute("aria-controls", "settings-sidebar");
        button.setAttribute("aria-expanded", "false");
        button.innerHTML = "<span></span><span></span><span></span>";

        const overlay = document.createElement("div");
        overlay.className = "settings-sidebar-overlay";
        overlay.hidden = true;

        const sidebar = document.createElement("aside");
        sidebar.id = "settings-sidebar";
        sidebar.className = "settings-sidebar";
        sidebar.setAttribute("aria-hidden", "true");
        sidebar.innerHTML = `
            <div class="settings-sidebar-header">
                <h2>Shop Settings</h2>
                <button id="close-settings-sidebar" type="button" aria-label="Close settings menu">×</button>
            </div>
            <nav class="settings-sidebar-nav" aria-label="Shop settings">
                <a href="${rootPath}pages/Shop/shop-settings.html#shop-profile">Shop Profile</a>
                <a href="${rootPath}pages/Shop/shop-settings.html#customers-tax">Customers &amp; Tax</a>
                ${window.trackRightCan("users.manage") ? `<a href="${rootPath}pages/Admin/users.html">Users &amp; Permissions</a>` : ""}
                <a href="${rootPath}pages/Shop/shop-settings.html#team-documents">Team Documents</a>
                <a href="${rootPath}pages/Shop/shop-settings.html#requests">Requests</a>
                <a href="${rootPath}pages/Shop/shop-settings.html#behavior">Behavior</a>
                <a href="${rootPath}pages/Shop/shop-settings.html#appearance">Appearance</a>
                <a href="${rootPath}pages/Shop/shop-settings.html#linked-accounts">Linked Accounts</a>
                <a href="${rootPath}pages/Shop/shop-settings.html#data-management">Data Management</a>
                <a href="${rootPath}pages/Shop/shop-settings.html#inspections-photos">Inspections &amp; Photos</a>
            </nav>`;

        const close = () => {
            sidebar.classList.remove("open");
            sidebar.setAttribute("aria-hidden", "true");
            button.setAttribute("aria-expanded", "false");
            overlay.hidden = true;
        };
        const open = () => {
            sidebar.classList.add("open");
            sidebar.setAttribute("aria-hidden", "false");
            button.setAttribute("aria-expanded", "true");
            overlay.hidden = false;
            sidebar.querySelector("a, button")?.focus();
        };
        button.addEventListener("click", () => {
            if (sidebar.classList.contains("open")) close(); else open();
        });
        sidebar.querySelector("#close-settings-sidebar").addEventListener("click", close);
        overlay.addEventListener("click", close);
        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape" && sidebar.classList.contains("open")) {
                close();
                button.focus();
            }
        });
        header.prepend(button);
        document.body.append(overlay, sidebar);
    }

    function addAccountControls(context) {
        const header = document.querySelector(".app-header-inner, .header-inner, .navbar-inner, .dev-header");
        if (!header || document.getElementById("account-controls")) {
            return;
        }

        const controls = document.createElement("div");
        controls.id = "account-controls";
        controls.className = "account-controls";

        const rootPath = loginPath.replace(/login\.html(?:\?.*)?$/, "");
        if (context.workspace === "shop" && ["owner", "admin", "service_writer"].includes(context.role)) {
            addShopNotifications(context, header, rootPath);
        }
        const profileName = context.user.user_metadata?.full_name ||
            context.user.user_metadata?.name || "";
        const accountName = context.workspace === "personal_fleet"
            ? (context.personalAccount?.name || profileName || context.user.email || "Personal Fleet")
            : context.workspace === "platform"
                ? (profileName || context.user.email || "Platform")
                : (context.shop?.name || "Shop");
        window.trackRightAccountName = accountName;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "account-menu-button";
        button.setAttribute("aria-haspopup", "menu");
        button.setAttribute("aria-expanded", "false");
        button.innerHTML = `<span class="account-menu-label"></span><span class="account-menu-caret" aria-hidden="true">▼</span>`;
        button.querySelector(".account-menu-label").textContent = accountName;

        const menu = document.createElement("div");
        menu.className = "account-menu";
        menu.setAttribute("role", "menu");
        menu.hidden = true;

        function addLink(label, href) {
            const link = document.createElement("a");
            link.href = href;
            link.textContent = label;
            link.setAttribute("role", "menuitem");
            link.tabIndex = -1;
            menu.appendChild(link);
        }

        if (context.workspace === "personal_fleet") {
            addLink("Fleet Settings", `${rootPath}pages/PersonalFleet/fleet-settings.html`);
            addLink("Profile/Account", `${rootPath}pages/PersonalFleet/account-settings.html`);
        } else if (context.workspace === "platform") {
            addLink("Development", `${rootPath}pages/Admin/development-dashboard.html`);
        } else {
            if (window.trackRightCan("users.manage")) {
                addLink("Users", `${rootPath}pages/Admin/users.html`);
            }
            if (window.trackRightCan("settings.manage")) {
                addLink("Shop Settings", `${rootPath}pages/Shop/shop-settings.html`);
            }
        }

        const divider = document.createElement("div");
        divider.className = "account-menu-divider";
        divider.setAttribute("role", "separator");
        menu.appendChild(divider);

        const logout = document.createElement("button");
        logout.type = "button";
        logout.className = "account-logout";
        logout.textContent = "Log out";
        logout.setAttribute("role", "menuitem");
        logout.tabIndex = -1;
        logout.addEventListener("click", async function () {
            logout.disabled = true;
            await client.auth.signOut();
            // Explicit logout starts a fresh account selection, not a deep link.
            window.location.replace(loginPath);
        });

        menu.appendChild(logout);
        controls.append(button, menu);
        header.appendChild(controls);

        function setOpen(open, focusFirst = false) {
            controls.classList.toggle("open", open);
            menu.hidden = !open;
            button.setAttribute("aria-expanded", String(open));
            if (open && focusFirst) menu.querySelector('[role="menuitem"]')?.focus();
        }
        button.addEventListener("click", () => setOpen(menu.hidden));
        button.addEventListener("keydown", (event) => {
            if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true, true); }
        });
        menu.addEventListener("keydown", (event) => {
            const items = Array.from(menu.querySelectorAll('[role="menuitem"]'));
            const index = items.indexOf(document.activeElement);
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                const step = event.key === "ArrowDown" ? 1 : -1;
                items[(index + step + items.length) % items.length]?.focus();
            }
        });
        document.addEventListener("click", (event) => {
            if (!controls.contains(event.target)) setOpen(false);
        });
        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape" && !menu.hidden) {
                setOpen(false);
                button.focus();
            }
        });

        window.trackRightSetAccountLabel = function (name) {
            const resolvedName = name || profileName || context.user.email || "Account";
            window.trackRightAccountName = resolvedName;
            button.querySelector(".account-menu-label").textContent = resolvedName;
        };
    }

    async function addShopNotifications(context, header, rootPath) {
        if (document.getElementById("shop-notifications")) return;

        const wrapper = document.createElement("div");
        wrapper.id = "shop-notifications";
        wrapper.className = "shop-notifications";
        const button = document.createElement("button");
        button.type = "button";
        button.className = "shop-notification-button";
        button.setAttribute("aria-label", "Shop notifications");
        button.setAttribute("aria-haspopup", "menu");
        button.setAttribute("aria-expanded", "false");
        button.textContent = "Notifications";
        const badge = document.createElement("span");
        badge.className = "shop-notification-badge";
        badge.hidden = true;
        button.appendChild(badge);
        const menu = document.createElement("div");
        menu.className = "shop-notification-menu";
        menu.setAttribute("role", "menu");
        menu.hidden = true;
        wrapper.append(button, menu);
        header.appendChild(wrapper);

        function setOpen(open) {
            menu.hidden = !open;
            wrapper.classList.toggle("open", open);
            button.setAttribute("aria-expanded", String(open));
        }

        function emptyMessage(text) {
            menu.replaceChildren();
            const empty = document.createElement("p");
            empty.className = "shop-notification-empty";
            empty.textContent = text;
            menu.appendChild(empty);
        }

        async function markRead(ids) {
            if (!ids.length) return;
            await client.from("shop_notification_reads").upsert(
                ids.map(function (id) { return { notification_id: id, user_id: context.user.id }; }),
                { onConflict: "notification_id,user_id", ignoreDuplicates: true }
            );
        }

        try {
            const notificationResult = await client.from("shop_notifications")
                .select("id, notification_type, source_id, repair_order_id, title, message, severity, created_at")
                .eq("shop_id", context.shopId)
                .order("created_at", { ascending: false })
                .limit(20);
            if (notificationResult.error) throw notificationResult.error;
            const notifications = notificationResult.data;
            const ids = notifications.map(function (notification) { return notification.id; });
            let readIds = new Set();
            if (ids.length) {
                const readResult = await client.from("shop_notification_reads")
                    .select("notification_id")
                    .eq("user_id", context.user.id)
                    .in("notification_id", ids);
                if (readResult.error) throw readResult.error;
                readIds = new Set(readResult.data.map(function (read) { return read.notification_id; }));
            }

            const unread = notifications.filter(function (notification) { return !readIds.has(notification.id); });
            badge.textContent = unread.length > 99 ? "99+" : String(unread.length);
            badge.hidden = unread.length === 0;
            menu.replaceChildren();
            if (!notifications.length) {
                emptyMessage("No shop notifications.");
            } else {
                const heading = document.createElement("div");
                heading.className = "shop-notification-heading";
                const label = document.createElement("strong");
                label.textContent = "Shop notifications";
                const markAll = document.createElement("button");
                markAll.type = "button";
                markAll.textContent = "Mark all read";
                markAll.addEventListener("click", async function () {
                    await markRead(unread.map(function (notification) { return notification.id; }));
                    badge.hidden = true;
                    menu.querySelectorAll(".unread").forEach(function (item) { item.classList.remove("unread"); });
                });
                heading.append(label, markAll);
                menu.appendChild(heading);

                notifications.forEach(function (notification) {
                    const link = document.createElement("a");
                    link.href = notification.notification_type === "team_request_submitted"
                        ? `${rootPath}pages/Shop/shop-settings.html#requests`
                        : `${rootPath}pages/Shop/repair-order-details.html?id=${encodeURIComponent(notification.repair_order_id)}`;
                    link.className = `shop-notification-item severity-${notification.severity}${readIds.has(notification.id) ? "" : " unread"}`;
                    link.setAttribute("role", "menuitem");
                    const title = document.createElement("strong");
                    title.textContent = notification.title;
                    const summary = document.createElement("span");
                    summary.textContent = notification.message;
                    const date = document.createElement("small");
                    date.textContent = new Date(notification.created_at).toLocaleString();
                    link.append(title, summary, date);
                    link.addEventListener("click", async function (event) {
                        event.preventDefault();
                        await markRead([notification.id]);
                        window.location.href = link.href;
                    });
                    menu.appendChild(link);
                });
            }
        } catch (error) {
            console.error("Could not load shop notifications:", error);
            emptyMessage("Notifications could not be loaded.");
        }

        button.addEventListener("click", function () { setOpen(menu.hidden); });
        button.addEventListener("keydown", function (event) {
            if (event.key === "ArrowDown") {
                event.preventDefault(); setOpen(true); menu.querySelector('[role="menuitem"]')?.focus();
            }
        });
        document.addEventListener("click", function (event) {
            if (!wrapper.contains(event.target)) setOpen(false);
        });
        document.addEventListener("keydown", function (event) {
            if (event.key === "Escape" && !menu.hidden) { setOpen(false); button.focus(); }
        });
    }

    window.trackRightAuthReady = loadContext();

    client.auth.onAuthStateChange(function (event, session) {
        if (event === "SIGNED_OUT" || !session) {
            sendToLogin();
        }
    });
})();
