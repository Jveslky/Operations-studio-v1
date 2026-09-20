(function () {
    "use strict";

    const client = window.trackRightSupabase;
    const logoutButton = document.getElementById("logout-button");
    const workspace = new URLSearchParams(window.location.search).get("workspace");
    const title = document.getElementById("access-title");
    const description = document.getElementById("access-description");

    if (workspace === "personal-fleet") {
        title.textContent = "Personal Fleet invitation required";
        description.textContent = "Your login works, but this account has not accepted a Personal Fleet invitation. Open the private invitation link you received to finish setup.";
    } else if (workspace === "platform") {
        title.textContent = "Development access required";
        description.textContent = "This account does not have Track Right platform-administrator access.";
    } else {
        title.textContent = "Shop access required";
        description.textContent = "Your login works, but this account has not been connected to a shop. Ask the shop owner or administrator to add you.";
    }

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
