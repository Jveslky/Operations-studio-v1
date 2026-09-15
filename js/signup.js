(function () {
    "use strict";

    const client = window.trackRightSupabase;
    const form = document.getElementById("signup-form");
    const message = document.getElementById("auth-message");
    const submitButton = form.querySelector("button[type='submit']");

    function showMessage(text, type) {
        message.textContent = text;
        message.className = `auth-message ${type || ""}`;
    }

    form.addEventListener("submit", async function (event) {
        event.preventDefault();
        const formData = new FormData(form);
        const password = String(formData.get("password") || "");
        const confirmPassword = String(formData.get("confirmPassword") || "");
        const shopName = String(formData.get("shopName") || "").trim();

        if (password !== confirmPassword) {
            showMessage("Those passwords do not match.", "error");
            return;
        }

        submitButton.disabled = true;
        showMessage("Creating your account…");
        localStorage.setItem("track-right-pending-shop-name", shopName);

        const { data, error } = await client.auth.signUp({
            email: String(formData.get("email") || "").trim(),
            password,
            options: {
                data: {
                    full_name: String(formData.get("fullName") || "").trim(),
                    shop_name: shopName
                },
                emailRedirectTo: new URL("login.html", window.location.href).href
            }
        });

        if (error) {
            showMessage(error.message, "error");
            submitButton.disabled = false;
            return;
        }

        if (data.session) {
            const { error: setupError } = await client.rpc("bootstrap_my_shop", {
                requested_shop_name: shopName
            });

            if (setupError) {
                showMessage(setupError.message, "error");
                submitButton.disabled = false;
                return;
            }

            localStorage.removeItem("track-right-pending-shop-name");
            window.location.replace("pages/Shop/shop-dashboard.html");
            return;
        }

        showMessage(
            "Check your email to confirm the account, then return here to sign in.",
            "success"
        );
        form.reset();
    });
})();
