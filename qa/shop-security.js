"use strict";
const target = {"shopId": "ddd8d44c-041f-4510-aa8b-a03b2dde87a6", "roId": "581a7d02-dae5-4cd1-a4d4-23b8ae6dc59c", "inspectionId": "add470c4-b560-4629-a6ce-fb3a2e382545", "itemId": "dc6f34e7-c712-4b39-8e28-6a3b71a4eb49", "mediaId": "a52375ab-4559-4752-b26e-a057a2258338", "path": "ddd8d44c-041f-4510-aa8b-a03b2dde87a6/1002/2b8bf163-4aa8-48b8-a0e1-c9b4a0ae1a2f.jpg", "sha256": "2601ec5eaf1fc542ce61cabf1c745cbb2e81b6072e43c2bade6f26044b153c1e"};
const client = window.trackRightSupabase;
const allowedShops = new Set([target.shopId, "1161bc88-9ed5-4d76-a2cf-c7a77d41eea9"]);
const $ = id => document.getElementById(id);
let context, link, linkExpires, rows = [];
function record(name, passed, detail = "") {
    const row = {name, passed, detail}; rows.push(row);
    const li = document.createElement("li"); li.className = passed ? "pass" : "fail";
    li.textContent = `${passed ? "PASS" : "FAIL"} — ${name}${detail ? `: ${detail}` : ""}`;
    $("results").append(li);
}
function deniedRead(result) {
    return result.error ? result.error.code === "42501" : Array.isArray(result.data) && result.data.length === 0;
}
function deniedFile(result) {
    const code = Number(result.error?.statusCode || result.error?.status);
    return !result.data && !!result.error && [400, 403, 404].includes(code);
}
async function hash(blob) {
    return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer())))
        .map(x => x.toString(16).padStart(2,"0")).join("");
}
async function directPhoto(anonymous = false) {
    const headers = { apikey: client.supabaseKey };
    if (!anonymous) {
        const session = await client.auth.getSession();
        if (session.error || !session.data.session?.access_token) throw new Error("Authenticated session unavailable");
        headers.Authorization = `Bearer ${session.data.session.access_token}`;
    }
    const path = target.path.split("/").map(encodeURIComponent).join("/");
    const response = await fetch(`${client.supabaseUrl}/storage/v1/object/authenticated/shop-inspection-media/${path}?qa=${Date.now()}`, { headers, cache: "no-store" });
    if (response.ok) {
        const blob = await response.blob();
        return { allowed: true, status: response.status, size: blob.size, matches: await hash(blob) === target.sha256 };
    }
    return { allowed: false, status: response.status, size: 0, matches: false };
}
async function sdkPhotoSummary(result) {
    const blob = result.data;
    return {
        hasData: !!blob,
        size: blob?.size ?? null,
        type: blob?.type || "",
        matches: blob instanceof Blob ? await hash(blob) === target.sha256 : false,
        hasError: !!result.error,
        errorName: result.error?.name || "none",
        errorStatus: result.error?.statusCode || result.error?.status || result.error?.originalError?.status || "not supplied"
    };
}
async function freshSdkPhoto() {
    const session = await client.auth.getSession();
    const token = session.data.session?.access_token;
    if (session.error || !token) throw new Error("Authenticated session unavailable");
    let httpStatus = null;
    const isolated = window.supabase.createClient(client.supabaseUrl, client.supabaseKey, {
        auth: { persistSession:false, autoRefreshToken:false, detectSessionInUrl:false },
        global: {
            headers: { Authorization: `Bearer ${token}` },
            fetch: async (input, options) => {
                const url = new URL(input);
                if (url.origin !== client.supabaseUrl || !url.pathname.startsWith("/storage/v1/object/")) {
                    throw new Error("Unexpected SDK download destination");
                }
                url.searchParams.set("qa", crypto.randomUUID());
                const response = await fetch(url.href, {...options, cache:"no-store"});
                httpStatus = response.status;
                return response;
            }
        }
    });
    const result = await isolated.storage.from("shop-inspection-media").download(target.path);
    return {summary:await sdkPhotoSummary(result), httpStatus};
}
function sdkDetail(summary) {
    return `SDK data: ${summary.hasData}; bytes: ${summary.size ?? "none"}; type: ${summary.type || "none"}; fixture hash matches: ${summary.matches}; error: ${summary.errorName}; status: ${summary.errorStatus}`;
}
function photoResult(result, allow) {
    return allow ? result.allowed && result.matches : !result.allowed && [400,401,403,404].includes(result.status);
}
async function checkExpiry() {
    if (!link || Date.now() < linkExpires) return;
    $("expiry").disabled = true;
    try { const response = await fetch(link, {cache:"no-store"}); record("Signed link expiry", [400,401,403,404].includes(response.status), `HTTP ${response.status}`); }
    catch(error) { record("Signed link expiry",false,"Network failure; expiry not verified"); }
    $("report").disabled = false;
    $("run").disabled = false;
    $("expiry-help").textContent = "Expiry check finished. Download results now.";
}
async function init() {
    const host = location.hostname;
    if (!(host === "long-shift-test.pages.dev" || host.endsWith(".long-shift-test.pages.dev") || host === "localhost") ||
        client.supabaseUrl !== "https://guvzuufdmnvurshknsnq.supabase.co") throw new Error("Stopped: this page only runs against Shop Test");
    const user = await client.auth.getUser();
    if (user.error || !user.data.user) throw new Error("Sign into Shop Test first, then reopen this page");
    const member = await client.from("shop_members").select("shop_id,role,is_active")
        .eq("user_id",user.data.user.id).eq("is_active",true).limit(2);
    if (member.error || member.data?.length !== 1 || !allowedShops.has(member.data[0].shop_id)) throw new Error("Expected exactly one active Test A/B membership");
    context = {...member.data[0],userId:user.data.user.id};
    $("identity").textContent = `${context.shop_id === target.shopId ? "Test A" : "Test B"} • ${context.role}`;
    $("run").disabled = false;
}
$("run").addEventListener("click", async () => {
    $("run").disabled=true; $("expiry").disabled=true; link=null;rows=[];$("results").replaceChildren();
    try {
        const verified = await client.auth.getUser();
        if (verified.error || verified.data.user?.id !== context.userId) throw new Error("Session changed; reload this page");
        const allow = context.shop_id === target.shopId && ["owner","admin","service_writer","foreman"].includes(context.role);
        const targets = [["shop_repair_orders",target.roId],["shop_inspections",target.inspectionId],["shop_inspection_items",target.itemId],["shop_ro_media",target.mediaId]];
        for (const [table,id] of targets) {
            const result = await client.from(table).select("id,shop_id").eq("id",id);
            record(`${table} direct UUID read`, allow ? !result.error && result.data?.length===1 && result.data[0].shop_id===target.shopId : deniedRead(result),allow?"Expected own-shop record":"Expected no record");
        }
        const photo = await client.storage.from("shop-inspection-media").download(target.path);
        const rawPhoto = await directPhoto();
        record("Private photo direct download", photoResult(rawPhoto,allow), `HTTP ${rawPhoto.status}; photo bytes received: ${rawPhoto.size}`);
        const sdk = await sdkPhotoSummary(photo);
        record("SDK photo download comparison", allow ? !sdk.hasError && sdk.matches : sdk.hasError && !sdk.hasData, sdkDetail(sdk));
        const fresh = await freshSdkPhoto();
        const freshAllowed = !fresh.summary.hasError && fresh.summary.matches && fresh.httpStatus === 200;
        const freshDenied = fresh.summary.hasError && !fresh.summary.hasData && [400,401,403,404].includes(fresh.httpStatus);
        record("SDK photo download without cache", allow ? freshAllowed : freshDenied, `HTTP ${fresh.httpStatus}; ${sdkDetail(fresh.summary)}`);
        const sign = await client.storage.from("shop-inspection-media").createSignedUrl(target.path,30);
        record("Private photo signing authorization",allow ? !sign.error && !!sign.data?.signedUrl : deniedFile(sign));
        if (allow && !sign.error && sign.data?.signedUrl) {
            link=sign.data.signedUrl;linkExpires=Date.now()+45000;
            const control=await fetch(link,{cache:"no-store"});
            record("Signed link positive control",control.ok && await hash(await control.blob())===target.sha256);
            $("expiry-help").textContent="The test link lasts 30 seconds. Check expiry after 45 seconds; the link itself stays private.";
            $("report").disabled=true;
            setTimeout(checkExpiry,45000);
        }
        // Empty arrays exercise the server permission gate without inserting records.
        const restore = await client.rpc("restore_shop_data_backup",{backup:{format:"track-right-shop-backup",version:3,source_shop_id:target.shopId,cloud:{}}});
        const canImport = context.shop_id === target.shopId && ["owner","admin"].includes(context.role);
        record("Restore RPC permission gate (empty payload)",canImport ? !restore.error && restore.data?.restored===0 : !!restore.error && /Data-import permission is required/.test(restore.error.message));
        const anon=window.supabase.createClient(client.supabaseUrl,client.supabaseKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
        record("Anonymous RO direct read",deniedRead(await anon.from("shop_repair_orders").select("id").eq("id",target.roId)));
        const anonymousPhoto=await directPhoto(true);
        record("Anonymous photo direct download",photoResult(anonymousPhoto,false),`HTTP ${anonymousPhoto.status}; photo bytes received: ${anonymousPhoto.size}`);
    } catch(error) {record("Checks completed",false,error.message);}
    finally {$("run").disabled=!!link;$("report").disabled=!!link;}
});
$("expiry").addEventListener("click",checkExpiry);
$("report").addEventListener("click",()=>{
    const report={probe_version:3,checked_at:new Date().toISOString(),project:"guvzuufdmnvurshknsnq",shop:context.shop_id===target.shopId?"Test A":"Test B",role:context.role,results:rows};
    const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:"application/json"}));const a=document.createElement("a");a.href=url;a.download=`long-shift-security-${report.shop.replace(" ","-")}-${context.role}.json`;a.click();URL.revokeObjectURL(url);
});
init().catch(error=>{$("identity").textContent=error.message;});
