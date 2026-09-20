(function () {
    "use strict";
    const form = document.getElementById("fleet-settings-form");
    const nameInput = document.getElementById("fleet-name");
    const message = document.getElementById("settings-message");

    window.trackRightAuthReady.then((context) => {
        nameInput.value = context.personalAccount?.name ||
            context.user.user_metadata?.full_name || context.user.email || "";
    });

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const name = nameInput.value.trim();
        if (name.length < 2) return;
        const button = form.querySelector("button");
        button.disabled = true;
        message.className = "settings-message";
        message.textContent = "Saving…";
        const { error } = await window.trackRightSupabase.rpc("update_personal_fleet_name", {
            requested_name: name
        });
        button.disabled = false;
        if (error) {
            message.className = "settings-message error";
            message.textContent = error.message;
            return;
        }
        if (window.trackRightAuth?.personalAccount) window.trackRightAuth.personalAccount.name = name;
        window.trackRightSetAccountLabel?.(name);
        message.className = "settings-message success";
        message.textContent = "Fleet name saved.";
    });
})();
