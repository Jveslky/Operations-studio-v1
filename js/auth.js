(function () {
    "use strict";

    const client = window.trackRightSupabase;
    const loginPath = document.documentElement.dataset.loginPath || "login.html";
    const workspace = document.documentElement.dataset.workspace || "shop";
    const requiredFeature = document.documentElement.dataset.feature || "";
    const rolePermissions = {
        owner: ["*"],
        admin: ["customers.write", "repair_orders.write", "invoices.write", "expenses.write", "users.manage"],
        service_writer: ["customers.write", "repair_orders.write", "invoices.write"],
        technician: ["customers.read", "repair_orders.read", "repair_orders.update_work"],
        read_only: ["customers.read", "repair_orders.read", "invoices.read", "expenses.read"]
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
                .select("account_id, role, personal_fleet_accounts(id, name, plan_code, billing_status, unit_limit, features, status)")
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
            .select("shop_id, role, shops(id, name)")
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
                    .select("shop_id, role, shops(id, name)")
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
            const allowed = rolePermissions[context.role] || [];
            return allowed.includes("*") || allowed.includes(permission);
        };
        document.documentElement.dataset.authReady = "true";
        addAccountControls(context);
        document.body.style.visibility = "visible";
        return context;
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
            addLink("Shop Settings", `${rootPath}pages/Shop/shop-settings.html`);
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
            sendToLogin();
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

    window.trackRightAuthReady = loadContext();

    client.auth.onAuthStateChange(function (event, session) {
        if (event === "SIGNED_OUT" || !session) {
            sendToLogin();
        }
    });
})();
