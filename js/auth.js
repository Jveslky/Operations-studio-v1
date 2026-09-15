(function () {
    "use strict";

    const client = window.trackRightSupabase;
    const loginPath = document.documentElement.dataset.loginPath || "login.html";
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
        const header = document.querySelector(".app-header-inner, .navbar-inner");
        if (!header || document.getElementById("account-controls")) {
            return;
        }

        const controls = document.createElement("div");
        controls.id = "account-controls";
        controls.className = "account-controls";

        const identity = document.createElement("span");
        identity.className = "account-identity";
        identity.textContent = context.shop?.name || context.user.email || "Account";

        if (window.trackRightCan("users.manage")) {
            const usersLink = document.createElement("a");
            usersLink.className = "account-users-link";
            usersLink.href = `${loginPath.replace(/login\.html(?:\?.*)?$/, "")}pages/Admin/users.html`;
            usersLink.textContent = "Users";
            controls.appendChild(usersLink);
        }

        const logout = document.createElement("button");
        logout.type = "button";
        logout.className = "account-logout";
        logout.textContent = "Log out";
        logout.addEventListener("click", async function () {
            logout.disabled = true;
            await client.auth.signOut();
            sendToLogin();
        });

        controls.append(identity, logout);
        header.appendChild(controls);
    }

    window.trackRightAuthReady = loadContext();

    client.auth.onAuthStateChange(function (event, session) {
        if (event === "SIGNED_OUT" || !session) {
            sendToLogin();
        }
    });
})();
