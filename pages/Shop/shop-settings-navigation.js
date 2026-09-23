(function () {
    "use strict";

    const navigation = document.querySelector(".shop-settings-nav");
    const content = document.querySelector(".shop-settings-content");
    if (!navigation || !content) return;

    const sections = Array.from(content.querySelectorAll(":scope > section[id]"));
    const links = Array.from(navigation.querySelectorAll('a[href^="#"]'));
    const sectionIds = new Set(sections.map(function (section) { return section.id; }));

    function showSelectedSection() {
        const requested = decodeURIComponent(window.location.hash.slice(1));
        const selected = sectionIds.has(requested) ? requested : "shop-profile";

        sections.forEach(function (section) {
            section.hidden = section.id !== selected;
        });
        links.forEach(function (link) {
            const active = link.getAttribute("href") === "#" + selected;
            link.classList.toggle("active", active);
            if (active) link.setAttribute("aria-current", "location");
            else link.removeAttribute("aria-current");
        });
    }

    window.addEventListener("hashchange", showSelectedSection);
    showSelectedSection();
})();
