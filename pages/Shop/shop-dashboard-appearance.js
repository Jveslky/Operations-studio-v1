(function () {
    "use strict";
    window.trackRightAuthReady.then(function () {
        const main=document.querySelector("main.shop-dashboard");
        const intro=main?.querySelector(".shop-dashboard-intro");
        if(!main||!intro)return;
        const sections=new Map(Array.from(main.querySelectorAll("[data-dashboard-section]")).map((section)=>[section.dataset.dashboardSection,section]));
        const saved=window.trackRightShopAppearance?.user?.dashboard_section_order||[];
        const order=Array.from(new Set([...saved,"operations","finance","activity","modules"]));
        let anchor=intro;
        order.forEach(function(key){const section=sections.get(key);if(!section)return;anchor.after(section);anchor=section;});
    });
})();
