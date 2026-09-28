(function () {
  "use strict";

  // Deliberately separate from js/supabase-client.js and every Shop/PFleet
  // session. The publishable key is public; authorization is enforced by RLS.
  const projectUrl = "https://yugxugsysvciscegavvv.supabase.co";
  const publishableKey = "sb_publishable_7HKip1HoUSpMhVkAiOg8pw_3L9I4P5B";
  const callbackType = new URLSearchParams(window.location.hash.slice(1)).get("type") ||
    new URLSearchParams(window.location.search).get("type");
  const invitationCallback = callbackType === "invite" || callbackType === "recovery";
  const $ = (id) => document.getElementById(id);
  const client = window.supabase?.createClient(projectUrl, publishableKey, {
    auth: {
      storageKey: "long-shift-snow-qa-auth",
      storage: window.sessionStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "implicit"
    }
  });

  function message(text, kind) {
    $("message").textContent = text;
    $("message").className = "message " + (kind || "");
  }

  function showSignedOut() {
    $("loading").hidden = true;
    $("signed-in").hidden = true;
    $("signed-out").hidden = false;
  }

  async function render() {
    if (!client) {
      showSignedOut();
      $("login-form").querySelector("button").disabled = true;
      message("The sign-in library could not load. Refresh and try again.", "error");
      return;
    }
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user) {
      showSignedOut();
      if (error && invitationCallback) message("This invitation could not be verified. Request a new Snow QA invitation.", "error");
      return;
    }

    $("loading").hidden = true;
    $("signed-out").hidden = true;
    $("signed-in").hidden = false;
    $("account-email").textContent = user.email || "Signed-in QA account";
    $("password-form").hidden = !invitationCallback;
    const box = $("memberships");
    box.replaceChildren();

    const { data: members, error: membersError } = await client.from("snow_members")
      .select("workspace_id,role,is_active")
      .eq("user_id", user.id).eq("is_active", true);
    if (membersError) {
      message("Workspace access could not load: " + membersError.message, "error");
      return;
    }
    const ids = (members || []).map((member) => member.workspace_id);
    let names = new Map();
    if (ids.length) {
      const { data: workspaces, error: workspaceError } = await client.from("snow_workspaces")
        .select("id,name").in("id", ids);
      if (workspaceError) {
        message("Workspace names could not load: " + workspaceError.message, "error");
        return;
      }
      names = new Map((workspaces || []).map((workspace) => [workspace.id, workspace.name]));
    }
    for (const member of members || []) {
      const row = document.createElement("div");
      row.className = "member";
      const name = document.createElement("strong");
      name.textContent = names.get(member.workspace_id) || "Snow QA workspace";
      const detail = document.createElement("span");
      detail.textContent = member.role.charAt(0).toUpperCase() + member.role.slice(1) + " · active";
      row.append(name, detail);
      box.append(row);
    }
    if (!ids.length) {
      const empty = document.createElement("p");
      empty.textContent = "No active Snow workspace yet. An owner can create the first QA workspace below.";
      box.append(empty);
    }
    $("workspace-form").hidden = ids.length > 0;
  }

  $("login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!client) return;
    const button = event.currentTarget.querySelector("button");
    button.disabled = true;
    message("Signing in…");
    const data = new FormData(event.currentTarget);
    const { error } = await client.auth.signInWithPassword({
      email: String(data.get("email") || "").trim(),
      password: String(data.get("password") || "")
    });
    button.disabled = false;
    if (error) return message(error.message, "error");
    event.currentTarget.reset();
    message("");
    await render();
  });

  $("password-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector("button");
    button.disabled = true;
    const password = String(new FormData(event.currentTarget).get("password") || "");
    const { error } = await client.auth.updateUser({ password });
    button.disabled = false;
    if (error) return message(error.message, "error");
    event.currentTarget.reset();
    event.currentTarget.hidden = true;
    message("Password saved. Your Snow QA session is ready.", "success");
  });

  $("workspace-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector("button");
    button.disabled = true;
    const requested_name = String(new FormData(event.currentTarget).get("name") || "").trim();
    const { error } = await client.rpc("snow_create_workspace", { requested_name });
    button.disabled = false;
    if (error) return message(error.message, "error");
    event.currentTarget.reset();
    message("QA workspace created.", "success");
    await render();
  });

  $("logout").addEventListener("click", async () => {
    const { error } = await client.auth.signOut();
    if (error) return message(error.message, "error");
    message("Signed out of Snow QA.", "success");
    showSignedOut();
  });

  render().catch(() => {
    showSignedOut();
    message("Snow QA is unavailable right now. Try again later.", "error");
  });
})();
