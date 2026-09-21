(function () {
    "use strict";

    const client = window.trackRightSupabase;
    const requestForm = document.getElementById("forgot-password-form");
    const updateForm = document.getElementById("reset-password-form");
    const message = document.getElementById("auth-message");
    let recoveryReady = false;

    function showMessage(text, type) {
        message.textContent = text;
        message.className = `auth-message ${type || ""}`;
    }

    if (requestForm) {
        requestForm.addEventListener("submit", async function (event) {
            event.preventDefault();
            const email = String(new FormData(requestForm).get("email") || "").trim();
            const resetUrl = new URL("./reset-password.html", document.baseURI);
            resetUrl.search = "";
            resetUrl.hash = "";
            const redirectTo = resetUrl.href;
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
        const submitButton = updateForm.querySelector('button[type="submit"]');
        const currentUrl = new URL(window.location.href);
        const hashParameters = new URLSearchParams(currentUrl.hash.replace(/^#/, ""));
        const recoveryCode = currentUrl.searchParams.get("code");
        const callbackError = currentUrl.searchParams.get("error_description") || hashParameters.get("error_description");
        const hasRecoveryHash = hashParameters.get("type") === "recovery" && Boolean(hashParameters.get("access_token"));

        function showExpiredMessage() {
            recoveryReady = false;
            updateForm.hidden = true;
            showMessage("This reset link has expired or is invalid. Request a new password reset link.", "error");
        }

        async function waitForRecoverySession() {
            if (callbackError || (!recoveryCode && !hasRecoveryHash)) {
                showExpiredMessage();
                return;
            }

            showMessage("Verifying your secure reset link…", "");

            try {
                if (recoveryCode) {
                    const { error } = await client.auth.exchangeCodeForSession(recoveryCode);
                    if (error) {
                        const { data: existingSession } = await client.auth.getSession();
                        if (!existingSession.session) throw error;
                    }
                } else {
                    await new Promise(function (resolve) {
                        let settled = false;
                        let subscription;
                        const finish = function () {
                            if (settled) return;
                            settled = true;
                            subscription?.unsubscribe();
                            resolve();
                        };
                        const authListener = client.auth.onAuthStateChange(function (event) {
                            if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") finish();
                        });
                        subscription = authListener.data.subscription;
                        window.setTimeout(finish, 2500);
                    });
                }

                const { data, error } = await client.auth.getSession();
                if (error || !data.session) throw error || new Error("Recovery session was not established.");

                recoveryReady = true;
                updateForm.hidden = false;
                submitButton.disabled = false;
                showMessage("Reset link verified. Choose your new password.", "success");
                window.history.replaceState({}, document.title, currentUrl.pathname);
            } catch (error) {
                console.error("Password recovery callback failed:", error);
                showExpiredMessage();
            }
        }

        submitButton.disabled = true;
        waitForRecoverySession();

        updateForm.addEventListener("submit", async function (event) {
            event.preventDefault();

            const { data: sessionData } = await client.auth.getSession();
            if (!recoveryReady || !sessionData.session) {
                showExpiredMessage();
                return;
            }

            const formData = new FormData(updateForm);
            const password = String(formData.get("password") || "");
            const confirmPassword = String(formData.get("confirmPassword") || "");

            if (password !== confirmPassword) {
                showMessage("Those passwords do not match.", "error");
                return;
            }

            submitButton.disabled = true;
            const { error } = await client.auth.updateUser({ password });
            if (error) {
                submitButton.disabled = false;
                if (/session|expired|token/i.test(error.message)) showExpiredMessage();
                else showMessage(error.message, "error");
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
