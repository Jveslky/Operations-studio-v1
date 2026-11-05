if (!sessionStorage.getItem("longshift.offline.ro.tab.v2")) {
  (function () {
    "use strict";
    const snapshotKey = "longshift.offline.ro.tab.v1",
      sessionKey = "long-shift-shop-test-guvzuufdmnvurshknsnq",
      prefix = "longshift.offline.note.v1:";
    const by = (id) => document.getElementById(id),
      status = by("status"),
      editor = by("editor");
    let snap;
    try {
      snap = JSON.parse(sessionStorage.getItem(snapshotKey) || "null");
      const session = JSON.parse(localStorage.getItem(sessionKey) || "null");
      const id = new URLSearchParams(location.search).get("id");
      if (
        !snap ||
        snap.version !== 1 ||
        !session?.user?.id ||
        session.user.id !== snap.actor ||
        !session.expires_at ||
        session.expires_at * 1000 <= Date.now() ||
        !Number.isFinite(snap.capturedAt) ||
        snap.capturedAt > Date.now() ||
        Date.now() - snap.capturedAt > 8 * 60 * 60 * 1000 ||
        ![snap.label, snap.ro].includes(id) ||
        !snap.shop ||
        !snap.ro ||
        !snap.expected ||
        typeof snap.note !== "string"
      )
        throw Error(
          "This tab has no available authorized offline copy. Reconnect and open the repair order again.",
        );
      const start = `${prefix}${snap.shop}:${snap.actor}:`;
      let pending = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k?.startsWith(start)) continue;
        const p = JSON.parse(localStorage.getItem(k));
        if (p?.ro === snap.ro) pending.push(p);
      }
      by("order").textContent = `RO ${snap.label} · device copy`;
      by("saved-at").textContent =
        `Last viewed online: ${new Date(snap.capturedAt).toLocaleString()}. This copy may be out of date.`;
      if (pending.length) {
        by("note").value = pending[0].note;
        by("note").readOnly = true;
        by("save").disabled = true;
        status.textContent =
          "A saved note is already waiting or needs review. It will not be replaced here; reconnect to review and sync.";
      } else {
        by("note").value = snap.note;
        status.textContent =
          "Offline copy available. Changes are saved only to this device until sync.";
      }
      const legacyLabel = by("legacy-note-label");
      if (legacyLabel) legacyLabel.hidden = false;
      editor.hidden = false;
    } catch (error) {
      status.textContent =
        error.message || "The offline copy could not be opened.";
      return;
    }
    function sessionStillValid() {
      try {
        const session = JSON.parse(localStorage.getItem(sessionKey) || "null");
        return (
          session?.user?.id === snap.actor &&
          Number.isFinite(session.expires_at) &&
          session.expires_at * 1000 > Date.now() &&
          Number.isFinite(snap.capturedAt) &&
          snap.capturedAt <= Date.now() &&
          Date.now() - snap.capturedAt <= 8 * 60 * 60 * 1000
        );
      } catch (_) {
        return false;
      }
    }
    function enforceSession() {
      if (sessionStillValid()) return;
      by("note").value = "";
      by("order").textContent = "";
      by("saved-at").textContent = "";
      editor.hidden = true;
      status.textContent =
        "This offline session is no longer available. Reconnect and open the repair order again.";
    }
    window.addEventListener("storage", (event) => {
      if (event.key === sessionKey || event.key === null) enforceSession();
    });
    document.addEventListener("visibilitychange", enforceSession);
    const initialSession = JSON.parse(localStorage.getItem(sessionKey));
    const expiry = Math.min(
      initialSession.expires_at * 1000,
      snap.capturedAt + 8 * 60 * 60 * 1000,
    );
    window.setTimeout(enforceSession, Math.max(0, expiry - Date.now()));
    by("save").onclick = () => {
      try {
        const session = JSON.parse(localStorage.getItem(sessionKey) || "null");
        if (
          session?.user?.id !== snap.actor ||
          session.expires_at * 1000 <= Date.now() ||
          !Number.isFinite(snap.capturedAt) ||
          snap.capturedAt > Date.now() ||
          Date.now() - snap.capturedAt > 8 * 60 * 60 * 1000
        )
          throw Error("The offline session expired. Reconnect before saving.");
        const start = `${prefix}${snap.shop}:${snap.actor}:`;
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (
            k?.startsWith(start) &&
            JSON.parse(localStorage.getItem(k))?.ro === snap.ro
          )
            throw Error(
              "A note for this repair order is already saved on this device. Reconnect to review it.",
            );
        }
        const note = by("note").value;
        if (note.length > 20000)
          throw Error("Notes must be 20,000 characters or fewer.");
        const request = crypto.randomUUID();
        const p = {
          shop: snap.shop,
          actor: snap.actor,
          request,
          ro: snap.ro,
          label: snap.label,
          expected: snap.expected,
          note,
          state: "pending",
        };
        localStorage.setItem(start + request, JSON.stringify(p));
        by("note").readOnly = true;
        by("save").disabled = true;
        status.textContent =
          "Note saved on this device. It has not yet been saved to the shop.";
      } catch (error) {
        status.textContent = `Note was not saved to this device: ${error.message}`;
      }
    };
  })();
} else {
  (function () {
    "use strict";
    const by = (id) => document.getElementById(id);
    let snap,
      context,
      inputs = {};
    const status = by("status"),
      editor = by("editor");
    let editorReady;
    function valid() {
      try {
        const s = JSON.parse(localStorage.getItem(snap.sessionKey) || "null");
        return (
          s?.user?.id === snap.actor &&
          s.expires_at * 1000 > Date.now() &&
          Date.now() - snap.capturedAt < 8 * 60 * 60 * 1000 &&
          snap.capturedAt <= Date.now()
        );
      } catch (_) {
        return false;
      }
    }
    function enforce() {
      if (valid()) return true;
      editor.replaceChildren();
      editor.hidden = true;
      status.textContent =
        "This offline session is unavailable. Reconnect and sign in with the same account. Saved device edits are retained.";
      return false;
    }
    try {
      snap = JSON.parse(
        sessionStorage.getItem("longshift.offline.ro.tab.v2") || "null",
      );
      const id = new URLSearchParams(location.search).get("id");
      if (
        !snap ||
        snap.version !== 2 ||
        !snap.base ||
        ![snap.label, snap.ro].includes(id) ||
        !snap.project ||
        !snap.shop ||
        !snap.expected ||
        !snap.tab ||
        !valid()
      )
        throw Error(
          "No authorized offline copy is available in this tab. Reconnect and open the RO online.",
        );
      context = {
        project: snap.project,
        shopId: snap.shop,
        user: { id: snap.actor },
      };
      editorReady = window.shopOfflineRO.claimEditor(context, snap.ro);
      // Legacy device notes remain separate and must be reviewed before a broader draft.
      const start = `longshift.offline.note.v1:${snap.shop}:${snap.actor}:`;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (
          k?.startsWith(start) &&
          JSON.parse(localStorage.getItem(k))?.ro === snap.ro
        )
          throw Error(
            "An older technician note is saved. Reconnect to review it before editing the RO.",
          );
      }
      const pending = window.shopOfflineRO
        .list(context, localStorage)
        .find((x) => x.ro === snap.ro);
      by("order").textContent = `RO ${snap.label} · device copy`;
      by("saved-at").textContent =
        `Last opened online: ${new Date(snap.capturedAt).toLocaleString()}. This copy may be out of date.`;
      for (const [k, v] of Object.entries(snap.base)) {
        if (!Object.hasOwn(window.shopOfflineRO.fields, k))
          throw Error("Invalid offline copy");
        const label = document.createElement("label");
        label.textContent = window.shopOfflineRO.fields[k];
        const input = document.createElement("textarea");
        input.value = String(pending?.patch[k] ?? v);
        input.disabled =
          !!pending?.attempted || (!!pending && pending.tab !== snap.tab);
        label.append(input);
        by("fields").append(label);
        inputs[k] = input;
        input.addEventListener("input", save);
      }
      by("save").disabled =
        !!pending?.attempted || (!!pending && pending.tab !== snap.tab);
      editor.hidden = false;
      status.textContent = pending
        ? "Device draft retained. Reconnect to sync or review; it is not confirmed saved to the shop."
        : "Offline copy ready. Supported field edits save to this device as you type.";
    } catch (e) {
      status.textContent = e.message || "Offline copy unavailable.";
      return;
    }
    async function save() {
      try {
        if (!navigator.locks)
          throw Error("Safe device storage is unavailable in this browser.");
        if (!(await editorReady))
          throw Error(
            "Use the other tab already editing this repair order, or close it and reopen this page.",
          );
        return await navigator.locks.request(
          window.shopOfflineRO.scope(context),
          async () => {
            if (!enforce()) throw Error("The offline session expired.");
            const existing = window.shopOfflineRO
              .list(context, localStorage)
              .find((x) => x.ro === snap.ro);
            if (existing && (existing.attempted || existing.tab !== snap.tab))
              throw Error(
                "Frozen edits or another tab own this draft. Reconnect to review.",
              );
            const patch = Object.fromEntries(
              Object.entries(inputs)
                .map(([k, e]) => [
                  k,
                  k === "labor_hours" ? Number(e.value) : e.value,
                ])
                .filter(([k, v]) => v !== snap.base[k]),
            );
            const key = window.shopOfflineRO.key(context, snap.ro);
            if (!Object.keys(patch).length) {
              if (existing) localStorage.removeItem(key);
              status.textContent = "No changes remain in this device draft.";
              return true;
            }
            window.shopOfflineRO.validate(patch);
            localStorage.setItem(
              key,
              JSON.stringify({
                project: snap.project,
                shop: snap.shop,
                actor: snap.actor,
                ro: snap.ro,
                label: snap.label,
                expected: existing?.expected || snap.expected,
                tab: snap.tab,
                request: existing?.request || crypto.randomUUID(),
                patch,
                state: "draft",
              }),
            );
            status.textContent =
              "Saved on this computer. Will save to the shop when connected.";
            return true;
          },
        );
      } catch (e) {
        status.textContent =
          "Changes were not saved on this computer: " + e.message;
        return false;
      }
    }
    const saveFeedback = document.createElement("p");
    saveFeedback.setAttribute("role", "status");
    by("save").parentNode.append(saveFeedback);
    by("save").onclick = async () => {
      saveFeedback.textContent = "Saving on this computer…";
      await save();
      saveFeedback.textContent = status.textContent;
    };
    window.addEventListener("pageshow", (e) => {
      if (e.persisted)
        editorReady = window.shopOfflineRO.claimEditor(context, snap.ro);
    });
    window.addEventListener("online", async () => {
      const pending = window.shopOfflineRO
        .list(context, localStorage)
        .find((x) => x.ro === snap.ro);
      if (
        !(pending?.attempted || (pending && pending.tab !== snap.tab)) &&
        !(await save())
      )
        return;
      status.textContent = "Connection returned. Reopening your repair order…";
      location.reload();
    });
    window.addEventListener("storage", enforce);
    document.addEventListener("visibilitychange", enforce);
    const session = JSON.parse(localStorage.getItem(snap.sessionKey));
    setTimeout(
      enforce,
      Math.max(
        0,
        Math.min(
          session.expires_at * 1000,
          snap.capturedAt + 8 * 60 * 60 * 1000,
        ) - Date.now(),
      ),
    );
  })();
}
