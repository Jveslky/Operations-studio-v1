(function () {
    "use strict";

    const client = window.trackRightSupabase;
    const form = document.getElementById("login-form");
    const message = document.getElementById("auth-message");
    const submitButton = form.querySelector("button[type='submit']");

    function showMessage(text, type) {
        message.textContent = text;
        message.className = `auth-message ${type || ""}`;
    }

    function requestedDestination() {
        const params = new URLSearchParams(window.location.search);
        const returnTo = params.get("returnTo");
        return returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//")
            ? returnTo
            : null;
    }

    async function accountDestination() {
        const requested = requestedDestination();
        if (requested) return requested;
        const { data: userData } = await client.auth.getUser();
        const userId = userData.user?.id;
        if (!userId) return "login.html";
        const [platform, personal, shop] = await Promise.all([
            client.from("platform_users").select("role").eq("user_id", userId).maybeSingle(),
            client.from("personal_fleet_members").select("account_id").eq("user_id", userId).eq("is_active", true).limit(1).maybeSingle(),
            client.from("shop_members").select("shop_id").eq("user_id", userId).eq("is_active", true).limit(1).maybeSingle()
        ]);
        if (platform.data) return "pages/Admin/development-dashboard.html";
        if (personal.data) return "pages/PersonalFleet/Personaldashboard.html";
        if (shop.data) return "pages/Shop/shop-dashboard.html";
        return "account-required.html";
    }

    async function finishPendingShopSetup() {
        const { data: userData } = await client.auth.getUser();
        const shopName =
            localStorage.getItem("track-right-pending-shop-name") ||
            userData.user?.user_metadata?.shop_name;
        if (!shopName) {
            return;
        }

        const { error } = await client.rpc("bootstrap_my_shop", {
            requested_shop_name: shopName
        });

        if (error) {
            throw error;
        }

        localStorage.removeItem("track-right-pending-shop-name");
    }

    client.auth.getSession().then(async function ({ data }) {
        if (data.session) {
            window.location.replace(await accountDestination());
        }
    });

    form.addEventListener("submit", async function (event) {
        event.preventDefault();
        submitButton.disabled = true;
        showMessage("Signing in…");

        const formData = new FormData(form);
        const { error } = await client.auth.signInWithPassword({
            email: String(formData.get("email") || "").trim(),
            password: String(formData.get("password") || "")
        });

        if (error) {
            showMessage(error.message, "error");
            submitButton.disabled = false;
            return;
        }

        try {
            await finishPendingShopSetup();
            window.location.replace(await accountDestination());
        } catch (setupError) {
            console.error(setupError);
            showMessage(
                "You are signed in, but shop setup could not finish. Contact an administrator.",
                "error"
            );
            submitButton.disabled = false;
        }
    });
})();
