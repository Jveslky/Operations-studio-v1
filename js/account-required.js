(function () {
    "use strict";

    const client = window.trackRightSupabase;
    const logoutButton = document.getElementById("logout-button");

    client.auth.getSession().then(function ({ data }) {
        if (!data.session) {
            window.location.replace("login.html");
        }
    });

    logoutButton.addEventListener("click", async function () {
        logoutButton.disabled = true;
        await client.auth.signOut();
        window.location.replace("login.html");
    });
})();
