(function(){
    "use strict";
    const client=window.trackRightSupabase;
    const token=new URLSearchParams(window.location.search).get("token")||localStorage.getItem("track-right-shop-beta-token");
    const summary=document.getElementById("invite-summary");
    const message=document.getElementById("auth-message");
    const form=document.getElementById("shop-beta-signup-form");
    const acceptButton=document.getElementById("accept-shop-beta-invite");
    const existingAccount=document.getElementById("existing-account-link");
    function show(text,type){message.textContent=text;message.className=`auth-message ${type||""}`;}
    async function accept(){
        if(!token){show("Open the complete private Shop invitation link.","error");return;}
        acceptButton.disabled=true;show("Creating your Shop workspace…");
        const result=await client.rpc("accept_shop_beta_invitation",{invitation_token:token});
        if(result.error){show(result.error.message,"error");acceptButton.disabled=false;return;}
        localStorage.removeItem("track-right-shop-beta-token");
        window.location.replace("pages/Shop/shop-dashboard.html");
    }
    async function initialize(){
        if(!token){summary.textContent="This invitation link is incomplete.";show("Ask for a new Shop beta invitation link.","error");return;}
        const result=await client.rpc("get_shop_beta_invitation",{invitation_token:token});
        if(result.error||!result.data?.length){summary.textContent="This invitation is invalid or no longer available.";show("Ask for a new Shop beta invitation.","error");return;}
        const invitation=result.data[0];
        summary.textContent=`You’re invited to create ${invitation.shop_name} on Track Right Shop beta.`;
        localStorage.setItem("track-right-shop-beta-token",token);
        const session=await client.auth.getSession();
        if(session.data.session){acceptButton.hidden=false;return;}
        form.elements.email.value=invitation.email;form.elements.shopName.value=invitation.shop_name;form.hidden=false;
        const returnPath=`${window.location.pathname}?token=${encodeURIComponent(token)}`;
        existingAccount.querySelector("a").href=`login.html?returnTo=${encodeURIComponent(returnPath)}`;
        existingAccount.hidden=false;
    }
    form.addEventListener("submit",async function(event){
        event.preventDefault();const submit=form.querySelector('[type="submit"]');submit.disabled=true;show("Creating your account…");
        const data=new FormData(form);const redirect=new URL("shop-beta-invite.html",window.location.href);redirect.searchParams.set("token",token);
        const result=await client.auth.signUp({email:String(data.get("email")),password:String(data.get("password")),options:{data:{full_name:String(data.get("fullName")||"").trim()},emailRedirectTo:redirect.href}});
        if(result.error){show(result.error.message,"error");submit.disabled=false;return;}
        if(result.data.session)await accept();else{form.hidden=true;show("Confirm your email, then return here to finish creating the shop.","success");}
    });
    acceptButton.addEventListener("click",accept);initialize();
}());
