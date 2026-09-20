(function () {
    "use strict";
    const form = document.getElementById("profile-settings-form");
    const nameInput = document.getElementById("profile-name");
    const emailInput = document.getElementById("profile-email");
    const message = document.getElementById("profile-message");
    window.trackRightAuthReady.then(({ user }) => {
        nameInput.value = user.user_metadata?.full_name || user.user_metadata?.name || "";
        emailInput.value = user.email || "";
    });
    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const name = nameInput.value.trim();
        const { error } = await window.trackRightSupabase.auth.updateUser({ data: { full_name: name } });
        message.className = `settings-message ${error ? "error" : "success"}`;
        message.textContent = error ? error.message : "Profile saved.";
    });
})();
