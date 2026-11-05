/* Durable, project/shop/account-scoped existing-RO work drafts. No financial fields. */
(function () {
  "use strict";
  const fields = {
    complaint: "Complaint",
    parts_needed: "Parts needed",
    customer_notes: "Customer notes",
    technician_notes: "Technician notes",
    labor_hours: "Labor hours",
    additional_work_performed: "Additional work",
    priority: "Priority",
  };
  const prefix = "longshift.offline.ro.v1:";
  function scope(c) {
    return `${prefix}${c.project}:${c.shopId}:${c.user.id}:`;
  }
  function key(c, ro) {
    return scope(c) + ro;
  }
  function validate(p) {
    if (!p || typeof p !== "object" || !Object.keys(p).length)
      throw Error("No supported changes to save.");
    for (const [k, v] of Object.entries(p)) {
      if (!Object.hasOwn(fields, k))
        throw Error("This field requires an online save.");
      if (k === "labor_hours") {
        if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 100000)
          throw Error("Labor hours must be between 0 and 100,000.");
      } else if (typeof v !== "string" || v.length > 20000)
        throw Error("Each text field must be 20,000 characters or fewer.");
    }
    if (
      Object.hasOwn(p, "priority") &&
      !["Low", "Medium", "High", "Critical", "Normal"].includes(p.priority)
    )
      throw Error("Choose a valid priority.");
    if (
      new TextEncoder().encode(JSON.stringify(p)).length +
        Object.keys(p).length * 2 >
      150000
    )
      throw Error(
        "These changes are too large to save together. Shorten the text and try again.",
      );
    return p;
  }
  function list(c, storage) {
    const items = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (!k?.startsWith(scope(c))) continue;
      const p = JSON.parse(storage.getItem(k));
      if (
        !p ||
        p.project !== c.project ||
        p.shop !== c.shopId ||
        p.actor !== c.user.id ||
        !p.ro ||
        !p.expected ||
        !p.request ||
        !["draft", "pending", "conflict"].includes(p.state)
      )
        throw Error("Device edits are unreadable; do not clear browser data.");
      if (
        k !== key(c, p.ro) ||
        typeof p.expected !== "string" ||
        typeof p.request !== "string"
      )
        throw Error(
          "Saved changes could not be read. Keep this browser’s data and contact your shop owner.",
        );
      validate(p.patch);
      if (p.resolution) {
        if (
          typeof p.resolution.request !== "string" ||
          typeof p.resolution.expected !== "string"
        )
          throw Error("Saved review could not be read.");
        validate(p.resolution.patch);
      }
      items.push({ ...p, key: k });
    }
    return items;
  }
  function write(storage, p) {
    storage.setItem(p.key, JSON.stringify({ ...p, key: undefined }));
  }
  async function send(client, storage, item) {
    if (item.state === "conflict" && !item.resolution) return "conflict";
    const op = item.resolution || item;
    item = {
      ...item,
      state: item.resolution ? "conflict" : "pending",
      attempted: true,
      issue: null,
    };
    write(storage, item);
    let result;
    try {
      let call = client.rpc("sync_shop_offline_ro", {
        p_shop: item.shop,
        p_request: op.request,
        p_ro: item.ro,
        p_expected: op.expected,
        p_patch: op.patch,
      });
      if (typeof call.abortSignal === "function")
        call = call.abortSignal(AbortSignal.timeout(30000));
      result = await call;
    } catch (_) {
      write(storage, { ...item, issue: "connection" });
      return "pending";
    }
    if (result.error) {
      const code = result.error.code;
      const issue =
        result.status === 401 ||
        ["PGRST301", "PGRST302", "PGRST303"].includes(code)
          ? "session"
          : result.status === 403 ||
              code === "42501" ||
              (code === "P0001" &&
                result.error.message === "Repair order is unavailable")
            ? "access"
            : !result.status
              ? "connection"
              : "server";
      write(storage, { ...item, issue });
      return "pending";
    }
    if (result.data?.status === "conflict") {
      write(storage, {
        ...item,
        state: "conflict",
        resolution: undefined,
        reviewDraft: op.patch,
        issue: null,
      });
      return "conflict";
    }
    if (result.data?.status !== "saved") {
      write(storage, { ...item, issue: "server" });
      return "pending";
    }
    storage.removeItem(item.key);
    return "saved";
  }
  // A duplicated browser tab inherits sessionStorage. A lifetime lock prevents two
  // copies from silently replacing the same unsent draft, even with the same tab ID.
  function claimEditor(c, ro) {
    return new Promise((resolve) => {
      if (!navigator.locks) {
        resolve(false);
        return;
      }
      navigator.locks
        .request(
          scope(c) + "editor:" + ro,
          { ifAvailable: true },
          async (lock) => {
            resolve(!!lock);
            if (lock)
              await new Promise((release) =>
                window.addEventListener("pagehide", release, { once: true }),
              );
          },
        )
        .catch(() => resolve(false));
    });
  }
  window.shopOfflineRO = {
    fields,
    scope,
    key,
    list,
    validate,
    send,
    claimEditor,
  };
  window.shopOfflineRO.mount = function ({
    context,
    order,
    inputs,
    onlineOnlyInputs = [],
    canSync = () => true,
    tabId,
    onSynced = () => {},
    host = document.body,
  }) {
    // Some RO layouts omit actual labor hours. Optional missing controls must not
    // prevent durable drafts or service-worker setup for the fields that exist.
    inputs = Object.fromEntries(
      Object.entries(inputs).filter(([k, e]) => e && Object.hasOwn(fields, k)),
    );
    let storage;
    try { storage = window.localStorage; }
    catch (_) { storage = {get length(){throw Error('Browser storage is blocked. Keep this page open and reconnect before saving.');}}; }
    const client = window.trackRightSupabase;
    const c = {
      ...context,
      project: new URL(client.supabaseUrl).hostname.split(".")[0],
    };
    const tab = tabId || crypto.randomUUID();
    let editorReady = claimEditor(c, order.recordId);
    window.addEventListener("pageshow", (e) => {
      if (e.persisted) editorReady = claimEditor(c, order.recordId);
    });
    const base = Object.fromEntries(
      Object.entries(inputs).map(([k, e]) => [
        k,
        k === "labor_hours" ? Number(e.value) : e.value,
      ]),
    );
    const box = document.createElement("section");
    box.className = "detail-card ro-save-state";
    box.setAttribute("aria-label", "Offline repair-order edits");
    const status = document.createElement("p");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    const details = document.createElement("details"),
      summary = document.createElement("summary");
    const explanation = document.createElement("p");
    explanation.textContent = `You can keep ${Object.keys(inputs)
      .map((k) => fields[k].toLowerCase())
      .join(
        ", ",
      )} on this computer while offline. Status, assignments, approvals, pricing, stock, payments and uploads need a connection. Keep this browser's data until saving to the shop is confirmed.`;
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "secondary-btn";
    retry.textContent = "Try saving again";
    const reopen = document.createElement("button");
    reopen.type = "button";
    reopen.className = "secondary-btn";
    reopen.textContent = "Reload repair order";
    reopen.hidden = true;
    reopen.onclick = () => window.location.reload();
    const rows = document.createElement("div");
    details.append(summary, explanation, retry, reopen, rows);
    box.append(status, details);
    host.prepend(box);
    let busy = false,
      broken = false,
      refresh = false,
      last = "",
      review = null,
      saveError = "",
      retryTimer = null,
      notified = false;
    const originalDisabled = new Map(
      Object.values(inputs).map((e) => [e, e.disabled]),
    );
    const read = () => list(c, storage);
    const lock = (fn) =>
      navigator.locks
        ? navigator.locks.request(scope(c), fn)
        : Promise.reject(
            Error(
              "Safe device storage requires a browser with Web Locks support.",
            ),
          );
    const changed = () =>
      Object.fromEntries(
        Object.entries(inputs)
          .filter(
            ([k, e]) =>
              !e.disabled &&
              (k === "labor_hours" ? Number(e.value) : e.value) !== base[k],
          )
          .map(([k, e]) => [
            k,
            k === "labor_hours" ? Number(e.value) : e.value,
          ]),
      );
    function button(label, action, disabled = false) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "secondary-btn";
      b.textContent = label;
      b.disabled = disabled;
      b.onclick = action;
      return b;
    }
    function draw() {
      rows.replaceChildren();
      let items = [];
      try {
        items = read();
      } catch (e) {
        broken = true;
        last = e.message;
      }
      status.textContent =
        saveError ||
        (broken
          ? "Changes could not be saved on this computer. Keep this page open. " +
            last
          : refresh
            ? "Saved to the shop. Reload this repair order before continuing."
            : items.some((i) => i.state === "conflict" && !i.resolution)
              ? "Someone else changed a repair order. Review your saved changes below."
              : busy
                ? "Saving your changes to the shop…"
                : items.length
                  ? navigator.onLine
                    ? "Saved on this computer. Waiting to save to the shop."
                    : "Saved on this computer. Will save to the shop when connected."
                  : last ||
                    (!navigator.onLine
                      ? "You’re offline. Work details save on this computer as you type."
                      : ""));
      box.hidden = !status.textContent;
      summary.textContent = items.length
        ? `Saved changes (${items.length})`
        : "About offline saving";
      if (
        broken ||
        items.some(
          (i) =>
            i.state === "conflict" ||
            i.issue === "access" ||
            i.issue === "session",
        )
      )
        details.open = true;
      reopen.hidden = !refresh;
      const current = items.find((x) => x.ro === order.recordId);
      for (const e of Object.values(inputs))
        e.disabled =
          originalDisabled.get(e) ||
          (busy && !!current) ||
          refresh ||
          !!current?.attempted ||
          (!!current && current.tab !== tab);
      retry.disabled =
        busy ||
        broken ||
        !navigator.onLine ||
        !items.some((i) => i.state !== "conflict" || i.resolution);
      for (const item of items) {
        const row = document.createElement("div"),
          label = document.createElement("p");
        label.textContent = `RO ${item.label} · ${item.issue === "access" ? "Access denied; edits remain on device. Restore membership/assignment and retry." : item.issue === "session" ? "Sign in with the same account; edits remain on device." : item.issue ? "Save not confirmed; edits remain on device. Retry the same request." : item.state === "conflict" ? "Changed at the shop — review required." : "Waiting to sync."}`;
        const copy = document.createElement("textarea");
        copy.readOnly = true;
        copy.value = Object.entries(item.patch)
          .map(([k, v]) => `${fields[k]}: ${v}`)
          .join("\n");
        copy.setAttribute("aria-label", `Device edits for RO ${item.label}`);
        row.append(label, copy);
        if (item.state === "conflict")
          row.append(
            button(
              item.resolution ? "Retry reviewed edits" : "Review changes",
              () => (item.resolution ? sync() : openReview(item)),
              busy || !navigator.onLine,
            ),
          );
        if (review?.key === item.key) {
          const editors = {};
          for (const k of Object.keys(item.patch)) {
            const l = document.createElement("label");
            l.textContent = `${fields[k]} — shop: ${review.current[k] ?? ""}`;
            const e = document.createElement("textarea");
            e.value = String(review.patch[k] ?? review.current[k] ?? "");
            e.addEventListener("input", () => {
              review.patch[k] = k === "labor_hours" ? Number(e.value) : e.value;
            });
            e.setAttribute("aria-label", `Reviewed ${fields[k]}`);
            editors[k] = e;
            l.append(e);
            row.append(l);
          }
          row.append(
            button(
              "Save reviewed edits",
              () =>
                applyReview(
                  item,
                  Object.fromEntries(
                    Object.entries(editors).map(([k, e]) => [
                      k,
                      k === "labor_hours" ? Number(e.value) : e.value,
                    ]),
                  ),
                ),
              busy || !navigator.onLine,
            ),
          );
          row.append(
            button(
              "Cancel review",
              () => {
                review = null;
                draw();
              },
              busy,
            ),
          );
        }
        row.append(
          button(
            "Discard these changes",
            async () => {
              if (
                !window.confirm(
                  "Discard this unsent device draft? This cannot be undone.",
                )
              )
                return;
              try {
                await lock(async () => {
                  const p = read().find((x) => x.key === item.key);
                  if (p?.attempted)
                    throw Error(
                      "A save was attempted. Confirm its result by syncing before discarding.",
                    );
                  storage.removeItem(item.key);
                });
                last = "Saved changes discarded.";
                draw();
              } catch (e) {
                last = e.message;
                draw();
              }
            },
            busy || item.attempted,
          ),
        );
        rows.append(row);
      }
    }
    async function queue() {
      let stored = false;
      saveError = "";
      try {
        if(!navigator.locks)throw Error('Offline saving is unavailable in this browser. Keep this page open and reconnect before saving.');
        if (!(await editorReady))
          throw Error(
            "This repair order is already open for offline editing in another tab. Use that tab, or close it and reopen this repair order.",
          );
        await lock(async () => {
          if (refresh)
            throw Error("Reload this repair order before making more changes.");
          const patch = changed();
          if (!order.recordId || !order.updatedAt)
            throw Error("Open a current repair order online first.");
          if (!canSync())
            throw Error(
              "Review the older technician-note queue and reopen this repair order first.",
            );
          const existing = read().find((x) => x.ro === order.recordId);
          if (existing && (existing.attempted || existing.tab !== tab))
            throw Error(
              "This RO already has frozen device edits or a draft in another tab. Sync/review that copy first.",
            );
          if (!Object.keys(patch).length) {
            if (existing) storage.removeItem(existing.key);
            last = "No work-detail changes to save.";
            return;
          }
          validate(patch);
          const item = {
            project: c.project,
            shop: c.shopId,
            actor: c.user.id,
            ro: order.recordId,
            label: String(order.id),
            expected: existing?.expected || order.updatedAt,
            request: existing?.request || crypto.randomUUID(),
            patch,
            state: "draft",
            tab,
            key: key(c, order.recordId),
          };
          write(storage, item);
          stored = true;
          last =
            "Saved on this computer. Will save to the shop when connected.";
        });
        draw();
        if (navigator.onLine) await sync();
        return stored;
      } catch (e) {
        saveError = `Changes were not saved on this computer: ${e.message}`;
        draw();
        return false;
      }
    }
    async function sync() {
      if (busy || broken || !navigator.onLine) return;
      try {
        if (!read().length) return;
      } catch (_) {
        broken = true;
        draw();
        return;
      }
      busy = true;
      saveError = "";
      draw();
      try {
        await lock(async () => {
          const auth = await client.auth.getUser();
          if (auth.error || auth.data?.user?.id !== c.user.id)
            throw Error(
              "Sign in again with the same account. Device edits have been retained.",
            );
          if (!canSync())
            throw Error(
              "Resolve the older note queue and reopen this repair order before syncing device edits.",
            );
          let count = 0;
          for (const item of read()) {
            if (item.state === "conflict" && !item.resolution) continue;
            if ((await send(client, storage, item)) === "saved") {
              count++;
              if (item.ro === order.recordId) refresh = true;
            }
          }
          if (count) last = "Saved to the shop.";
        });
      } catch (e) {
        saveError =
          e.message ||
          "Save not confirmed. Your changes are retained on this computer.";
      } finally {
        busy = false;
        draw();
        scheduleRetry();
        if (refresh && !notified && !unsupportedChanged()) {
          notified = true;
          onSynced();
        }
      }
    }
    function scheduleRetry() {
      if (retryTimer) window.clearTimeout(retryTimer);
      try {
        if (
          !broken &&
          navigator.onLine &&
          read().some(
            (i) =>
              (i.state !== "conflict" || i.resolution) &&
              (!i.issue || i.issue === "connection" || i.issue === "server"),
          )
        )
          retryTimer = window.setTimeout(sync, 30000);
      } catch (_) {
        broken = true;
        draw();
      }
    }
    async function openReview(item) {
      busy = true;
      saveError = "";
      draw();
      try {
        const result = await client
          .from("shop_repair_orders")
          .select(Object.keys(fields).join(",") + ",updated_at")
          .eq("shop_id", c.shopId)
          .eq("id", item.ro)
          .maybeSingle();
        if (result.error || !result.data)
          throw Error(
            "Could not load the latest RO. Check your access and connection.",
          );
        review = {
          key: item.key,
          current: result.data,
          expected: result.data.updated_at,
          patch: item.reviewDraft || item.patch,
        };
      } catch (e) {
        saveError = e.message;
      } finally {
        busy = false;
        draw();
      }
    }
    async function applyReview(item, patch) {
      try {
        validate(patch);
        await lock(async () => {
          const latest = read().find((x) => x.key === item.key);
          if (!latest || latest.state !== "conflict" || latest.resolution)
            throw Error("Device edits changed. Reopen the review.");
          write(storage, {
            ...latest,
            resolution: {
              request: crypto.randomUUID(),
              expected: review.expected,
              patch,
            },
          });
        });
        review = null;
        await sync();
      } catch (e) {
        saveError = e.message;
        draw();
      }
    }
    retry.onclick = sync;
    for (const e of Object.values(inputs))
      for (const event of ["input", "change"])
        e.addEventListener(event, () => {
          if (!navigator.onLine) queue();
        });
    const onlineBaseline = new Map(
      onlineOnlyInputs
        .filter(Boolean)
        .map((e) => [e, e.type === "checkbox" ? e.checked : e.value]),
    );
    const unsupportedChanged = () =>
      [...onlineBaseline].some(
        ([e, v]) => (e.type === "checkbox" ? e.checked : e.value) !== v,
      );
    window.addEventListener("online", () => {
      draw();
      sync();
    });
    window.addEventListener("offline", draw);
    window.addEventListener("storage", (e) => {
      if (e.key === null || e.key?.startsWith(scope(c))) draw();
    });
    try {
      const draft = read().find((x) => x.ro === order.recordId);
      if (draft?.state === "draft" && draft.tab === tab && !draft.attempted)
        for (const [k, v] of Object.entries(draft.patch))
          if (inputs[k]) inputs[k].value = String(v);
    } catch (_) {
      broken = true;
    }
    draw();
    if (navigator.onLine && canSync()) sync();
    return {
      queue,
      sync,
      blocksOrderSave() {
        try {
          return (
            busy ||
            broken ||
            refresh ||
            read().some((x) => x.ro === order.recordId)
          );
        } catch (_) {
          return true;
        }
      },
      unsupportedChanged,
      context: c,
      base,
      tab,
    };
  };
})();
