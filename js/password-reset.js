(function () {
    "use strict";

    const client = window.trackRightSupabase;
    const requestForm = document.getElementById("forgot-password-form");
    const updateForm = document.getElementById("reset-password-form");
    const message = document.getElementById("auth-message");

    function showMessage(text, type) {
        message.textContent = text;
        message.className = `auth-message ${type || ""}`;
    }

    if (requestForm) {
        requestForm.addEventListener("submit", async function (event) {
            event.preventDefault();
            const email = String(new FormData(requestForm).get("email") || "").trim();
            const redirectTo = new URL("reset-password.html", window.location.href).href;
            const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo });

            if (error) {
                showMessage(error.message, "error");
                return;
            }

            showMessage("If that address exists, a reset link is on the way.", "success");
            requestForm.reset();
        });
    }

    if (updateForm) {
        updateForm.addEventListener("submit", async function (event) {
            event.preventDefault();
            const formData = new FormData(updateForm);
            const password = String(formData.get("password") || "");
            const confirmPassword = String(formData.get("confirmPassword") || "");

            if (password !== confirmPassword) {
                showMessage("Those passwords do not match.", "error");
                return;
            }

            const { error } = await client.auth.updateUser({ password });
            if (error) {
                showMessage(error.message, "error");
                return;
            }

            showMessage("Password updated. Sending you to login…", "success");
            await client.auth.signOut();
            window.setTimeout(function () {
                window.location.replace("login.html");
            }, 900);
        });
    }
})();
