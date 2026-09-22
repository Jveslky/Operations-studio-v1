(function () {
    "use strict";
    window.trackRightShopAppearanceReady=window.trackRightAuthReady.then(async function(context){
        const defaults={shop:{color_scheme:"industrial"},user:{dashboard_section_order:["operations","finance","activity","modules"],compact_dashboard:false}};
        if(context?.workspace!=="shop"||!context.shopId){window.trackRightShopAppearance=defaults;return defaults;}
        const loginPath=document.documentElement.dataset.loginPath||"login.html";
        const rootPath=loginPath.replace(/login\.html(?:\?.*)?$/,"");
        if(!document.getElementById("shop-appearance-stylesheet")){const link=document.createElement("link");link.id="shop-appearance-stylesheet";link.rel="stylesheet";link.href=`${rootPath}css/shop-appearance.css`;document.head.appendChild(link);}
        const client=window.trackRightSupabase;
        const [shopResult,userResult]=await Promise.all([
            client.from("shop_appearance_settings").select("color_scheme").eq("shop_id",context.shopId).maybeSingle(),
            client.from("shop_user_appearance_preferences").select("dashboard_section_order,compact_dashboard").eq("shop_id",context.shopId).eq("user_id",context.user.id).maybeSingle()
        ]);
        const appearance={shop:shopResult.error?defaults.shop:(shopResult.data||defaults.shop),user:userResult.error?defaults.user:(userResult.data||defaults.user)};
        document.body.dataset.trShopTheme=appearance.shop.color_scheme;
        document.body.dataset.dashboardDensity=appearance.user.compact_dashboard?"compact":"comfortable";
        window.trackRightShopAppearance=appearance;return appearance;
    });
})();
