import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
const source = fs.readFileSync(
  new URL("../pages/Shop/shop-offline-ro.js", import.meta.url),
  "utf8",
);
const tick = () => new Promise((resolve) => setImmediate(resolve));
function element(tag = "input") {
  return {
    tag,
    children: [],
    events: {},
    value: "",
    disabled: false,
    hidden: false,
    style: {},
    setAttribute(k, v) {
      this[k] = v;
    },
    append(...x) {
      this.children.push(...x);
    },
    prepend(x) {
      this.children.unshift(x);
    },
    replaceChildren() {
      this.children = [];
    },
    addEventListener(k, f) {
      (this.events[k] ??= []).push(f);
    },
    fire(k) {
      return Promise.all((this.events[k] || []).map((f) => f()));
    },
  };
}
function build({
  online = false,
  stored = [],
  reply = { data: { status: "saved" } },
  otherChanges = false,
  owner = true,
  confirmResult = true,
} = {}) {
  const data = new Map(stored),
    events = {},
    timers = new Map();
  let timerId = 0,
    fail = false,
    reloads = 0,
    actor = "user-a",
    response = reply,
    calls = [];
  const storage = {
    get length() {
      return data.size;
    },
    key: (i) => [...data.keys()][i],
    getItem: (k) => data.get(k) || null,
    setItem(k, v) {
      if (fail) throw Error("Storage is full");
      data.set(k, v);
    },
    removeItem(k) {
      if (fail) throw Error("Storage blocked");
      data.delete(k);
    },
  };
  const win = {
    localStorage: storage,
    location: {
      reload() {
        reloads++;
      },
    },
    addEventListener(k, f) {
      (events[k] ??= []).push(f);
    },
    setTimeout(f) {
      timers.set(++timerId, f);
      return timerId;
    },
    clearTimeout(i) {
      timers.delete(i);
    },
    confirm: () => confirmResult,
    trackRightSupabase: {
      supabaseUrl: "https://project-a.supabase.co",
      auth: { getUser: async () => ({ data: { user: { id: actor } } }) },
      rpc: async (name, args) => {
        calls.push({ name, args: JSON.parse(JSON.stringify(args)) });
        if (response instanceof Error) throw response;
        return response;
      },
      from() {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          maybeSingle: async () => ({
            data: {
              technician_notes: "shop version",
              updated_at: "new-version",
            },
          }),
        };
      },
    },
  };
  const nav = {
    get onLine() {
      return online;
    },
    locks: {
      request(_name, options, callback) {
        return Promise.resolve(
          (callback || options)(callback ? (owner ? {} : null) : {}),
        );
      },
    },
  };
  const context = { shopId: "shop-a", user: { id: "user-a" } },
    order = { recordId: "ro-a", id: "1001", updatedAt: "original-version" };
  const approval = element();
  approval.value = "";
  const host = element("main"),
    note = element(),
    status = element("select"),
    disabled = element();
  note.value = "original note";
  status.value = "Open";
  disabled.value = "secret";
  disabled.disabled = true;
  vm.runInNewContext(source, {
    window: win,
    navigator: nav,
    document: { createElement: element, body: host },
    crypto: { randomUUID: () => `request-${calls.length}-${data.size}` },
    URL,
    AbortSignal,
    TextEncoder,
  });
  const control = win.shopOfflineRO.mount({
    context,
    order,
    inputs: { technician_notes: note, complaint: disabled, labor_hours: null },
    onlineOnlyInputs: [status],
    interactionOnlyInputs: [approval],
    canSync: () => !otherChanges,
    tabId: "tab-a",
    host,
    onReload: () => {
      reloads++;
    },
  });
  return {
    api: win.shopOfflineRO,
    context: control.context,
    control,
    note,
    approval,
    status,
    disabled,
    data,
    storage,
    host,
    calls,
    timers,
    events,
    setOnline(v) {
      online = v;
      return Promise.all(
        (events[v ? "online" : "offline"] || []).map((f) => f()),
      );
    },
    setReply(v) {
      response = v;
    },
    setActor(v) {
      actor = v;
    },
    setFail(v) {
      fail = v;
    },
    get reloads() {
      return reloads;
    },
  };
}
const flatten = (e) => [e, ...e.children.flatMap(flatten)];
const find = (b, text) => flatten(b.host).find((e) => e.textContent === text);
const statusText = (b) => b.host.children[0].children[1].textContent;
let b = build();
assert.equal(b.host.children[0].hidden, false);
b.note.value = "offline work";
await b.note.fire("input");
await tick();
assert.equal(b.data.size, 1);
assert.match(statusText(b), /Saved on this computer/);
assert.equal(b.calls.length, 0);
assert.equal(b.disabled.disabled, true);
const first = [...b.data.values()][0];
await b.setOnline(true);
await tick();
assert.equal(b.calls.length, 1);
assert.equal(b.calls[0].name, "sync_shop_offline_ro");
assert.equal(b.calls[0].args.p_patch.technician_notes, "offline work");
assert.equal(b.data.size, 0);
assert.equal(b.reloads, 1);
b = build({ online: true });
await tick();
assert.equal(
  b.host.children[0].hidden,
  true,
  "no save panel when connected with no saved changes",
);
// Lost reply must preserve and freeze exactly the same request, then retry automatically.
b = build({ reply: new Error("connection lost") });
b.note.value = "lost reply";
await b.control.queue();
await b.setOnline(true);
await tick();
assert.equal(b.data.size, 1);
assert.equal(b.note.disabled, true);
assert.equal(b.reloads, 0);
assert.equal(b.timers.size, 1);
const frozen = JSON.parse([...b.data.values()][0]);
assert.equal(frozen.attempted, true);
b.setReply({ data: { status: "saved" } });
await [...b.timers.values()][0]();
assert.equal(b.data.size, 0);
assert.deepEqual(b.calls[0].args, b.calls[1].args);
assert.equal(b.reloads, 1);
// Other form edits survive a successful sync. The page offers an explicit reload.
b = build();
b.note.value = "offline work";
b.status.value = "Ready for Payment";
await b.control.queue();
await b.setOnline(true);
await tick();
assert.equal(b.reloads, 0);
assert.equal(b.status.value, "Ready for Payment");
assert.equal(b.control.blocksOrderSave(), true);
assert.equal(find(b, "Reload repair order").hidden, false);
// Conflicts retain both versions and require an explicit reviewed save against latest timestamp.
b = build({ reply: { data: { status: "conflict" } } });
b.note.value = "device version";
await b.control.queue();
await b.setOnline(true);
await tick();
assert.equal(b.reloads, 0);
assert.equal(b.timers.size, 0);
await find(b, "Review changes").onclick();
const byLabel = (b, label) =>
  flatten(b.host).find((e) => e["aria-label"] === label);
assert.equal(
  byLabel(b, "Current shop version: Technician notes").value,
  "shop version",
);
assert.equal(
  byLabel(b, "Saved on this computer: Technician notes").value,
  "device version",
);
assert.equal(byLabel(b, "Reviewed Technician notes").disabled, true);
assert.equal(find(b, "Save reviewed edits").disabled, true);
await find(b, "Save reviewed edits").onclick();
assert.equal(
  b.calls.length,
  1,
  "clicking save without choosing/confirming must not submit old device text",
);
await find(b, "Start with shop version").onclick();
let reviewed = byLabel(b, "Reviewed Technician notes");
assert.equal(reviewed.value, "shop version");
assert.equal(find(b, "Save reviewed edits").disabled, true);
reviewed.value = "shop version + device version";
await reviewed.fire("input");
let confirm = byLabel(b, "Confirm reviewed changes");
confirm.checked = true;
await confirm.fire("change");
assert.equal(find(b, "Save reviewed edits").disabled, false);
reviewed.value += " + final edit";
await reviewed.fire("input");
assert.equal(
  confirm.checked,
  false,
  "editing after confirmation must invalidate it",
);
assert.equal(find(b, "Save reviewed edits").disabled, true);
confirm.checked = true;
await confirm.fire("change");
b.setReply(new Error("reviewed response lost"));
await find(b, "Save reviewed edits").onclick();
assert.equal(b.calls[1].args.p_expected, "new-version");
assert.equal(
  b.calls[1].args.p_patch.technician_notes,
  "shop version + device version + final edit",
);
assert.notEqual(b.calls[0].args.p_request, b.calls[1].args.p_request);
assert.equal(b.data.size, 1, "reviewed payload survives an uncertain response");
b.setReply({ data: { status: "saved" } });
await b.control.sync();
assert.deepEqual(
  b.calls[1].args,
  b.calls[2].args,
  "reviewed retry reuses the exact chosen text and request",
);
assert.equal(b.reloads, 1);
// Storage failures must never show a successful new save, including after an earlier save.
b = build();
b.note.value = "first";
await b.control.queue();
b.setFail(true);
b.note.value = "not stored";
assert.equal(await b.control.queue(), false);
assert.match(statusText(b), /not saved on this computer/);
assert.equal(
  JSON.parse([...b.data.values()][0]).patch.technician_notes,
  "first",
);
b.setFail(false);
await b.control.queue();
assert.equal(
  JSON.parse([...b.data.values()][0]).patch.technician_notes,
  "not stored",
);
// A copied sessionStorage tab ID cannot bypass the browser's editor lifetime lock.
b = build({ owner: false });
b.note.value = "duplicate tab";
assert.equal(await b.control.queue(), false);
assert.equal(b.data.size, 0);
assert.match(statusText(b), /another tab/);
// Legacy drafts block broader edits, and revoked/switched accounts cannot send them.
b = build({ otherChanges: true });
b.note.value = "waiting for older note";
await b.control.queue();
assert.equal(b.data.size, 0);
b = build();
b.note.value = "retained";
await b.control.queue();
b.setActor("other-account");
await b.setOnline(true);
await tick();
assert.equal(b.calls.length, 0);
assert.equal(b.data.size, 1);
const valid = JSON.parse(first),
  key = b.api.key(b.context, "ro-a");
for (const response of [
  { status: 403, error: { code: "42501" } },
  { status: 401, error: { code: "PGRST301" } },
  { status: 500, error: { code: "XX000" } },
]) {
  b = build({ stored: [[key, JSON.stringify(valid)]], reply: response });
  await b.setOnline(true);
  await tick();
  assert.equal(b.data.size, 1);
  assert.equal(b.reloads, 0);
  assert.equal(JSON.parse([...b.data.values()][0]).attempted, true);
}
b = build({ stored: [[key, "{broken"]] });
assert.equal(b.control.blocksOrderSave(), true);
assert.match(statusText(b), /could not be saved/);
// Project, shop and actor isolation; payload restrictions mirror the SQL contract.
b = build();
b.storage.setItem(key, first);
assert.equal(
  b.api.list({ ...b.context, project: "other" }, b.storage).length,
  0,
);
assert.equal(
  b.api.list({ ...b.context, shopId: "other" }, b.storage).length,
  0,
);
assert.equal(
  b.api.list({ ...b.context, user: { id: "other" } }, b.storage).length,
  0,
);
assert.throws(() => b.api.validate({ status: "Ready for Payment" }));
assert.throws(() => b.api.validate({ labor_hours: -1 }));
assert.throws(() => b.api.validate({ priority: "bogus" }));
b.api.validate({ priority: "Medium" });
console.log(
  "RO device saves: reconnect, exact replay, conflict review, safe refresh, storage errors, duplicate tabs, legacy guard, account scope and permissions passed.",
);

// Exercise the actual controller's Save handler, not a duplicated implementation.
{
  const controller = fs.readFileSync(
    new URL("../pages/Shop/repair-order-details.js", import.meta.url),
    "utf8",
  );
  const handler = controller.slice(
    controller.indexOf(
      '    saveButton.addEventListener("click", async function () {',
    ),
    controller.indexOf(
      "    /* =========================\n       CLOSE REPAIR ORDER",
    ),
  );
  for (const scenario of [
    {
      online: false,
      retained: true,
      unsupported: true,
      wording: /Work details are saved/,
    },
    { online: false, retained: false, unsupported: true, wording: null },
    { online: false, missing: true, wording: /Offline saving is unavailable/ },
    { online: true, blocked: true, wording: /Check the save message/ },
  ]) {
    let save,
      queues = 0;
    const messages = [];
    vm.runInNewContext(handler, {
      saveButton: {
        addEventListener(_name, f) {
          save = f;
        },
      },
      navigator: { onLine: scenario.online },
      alert: (m) => messages.push(m),
      offlineROControl: scenario.missing
        ? null
        : {
            queue: async () => {
              queues++;
              return scenario.retained;
            },
            unsupportedChanged: () => scenario.unsupported,
            blocksOrderSave: () => scenario.blocked,
          },
    });
    await save();
    assert.equal(queues, scenario.online || scenario.missing ? 0 : 1);
    if (scenario.wording) assert.match(messages[0], scenario.wording);
    else
      assert.equal(
        messages.length,
        0,
        "a failed local save must never claim the work was retained",
      );
  }
  console.log(
    "RO Save button: offline routing, storage-failure wording, missing module fallback and pending-save guard passed.",
  );
}

// Late approval/tax setup reproduces the note-only reload blocker observed on Test.
b = build();
b.approval.readOnly = true;
b.approval.value = "125.00";
b.note.value = "note-only after tax loaded";
await b.control.queue();
assert.equal(b.control.unsupportedChanged(), false);
assert.equal(b.host.children[0]["data-save-mode"], "offline");
assert.equal(b.host.children[0].children[0].textContent, "Offline mode");
await b.setOnline(true);
await tick();
assert.equal(
  b.reloads,
  1,
  "untouched calculated approval amount must not hold note-only reload",
);
b = build();
b.approval.value = "125.00";
await b.approval.fire("input");
b.note.value = "note with an approval draft";
await b.control.queue();
await b.setOnline(true);
await tick();
assert.equal(b.reloads, 0, "actual approval input must retain the form");
assert.equal(b.control.unsupportedChanged(), true);
console.log(
  "Reload guard: late calculated approval setup ignored, actual approval edits retained; offline mode visibly marked.",
);

// A second shop change invalidates a reviewed save and requires a fresh choice.
b = build({ reply: { data: { status: "conflict" } } });
b.note.value = "retained device text";
await b.control.queue();
await b.setOnline(true);
await tick();
await find(b, "Review changes").onclick();
await find(b, "Start with my saved version").onclick();
assert.equal(
  byLabel(b, "Reviewed Technician notes").value,
  "retained device text",
);
assert.equal(
  find(b, "Save reviewed edits").disabled,
  true,
  "choosing the device version alone cannot replace the shop text",
);
let acknowledgement = byLabel(b, "Confirm reviewed changes");
acknowledgement.checked = true;
await acknowledgement.fire("change");
byLabel(b, "Reviewed Technician notes").value = "both versions reviewed";
await byLabel(b, "Reviewed Technician notes").fire("input");
acknowledgement.checked = true;
await acknowledgement.fire("change");
await find(b, "Save reviewed edits").onclick();
assert.equal(b.reloads, 0);
assert.equal(
  JSON.parse([...b.data.values()][0]).reviewDraft.technician_notes,
  "both versions reviewed",
);
await find(b, "Review changes").onclick();
assert.equal(
  byLabel(b, "Saved on this computer: Technician notes").value,
  "both versions reviewed",
);
assert.equal(byLabel(b, "Reviewed Technician notes").value, "");
assert.equal(
  find(b, "Save reviewed edits").disabled,
  true,
  "a renewed conflict must require a new review",
);
console.log(
  "Explicit review: both versions visible, no default replacement, confirmation reset, exact lost-response retry and renewed conflict preservation passed.",
);

// One-click combination preserves both divergent additions without duplicating the shared note history.
b = build();
const combine = b.api.combineNotes;
assert.equal(
  combine("base\nshop addition", "base\ndevice addition"),
  "base\nshop addition\ndevice addition",
);
assert.equal(
  combine("base\nshop edit\nend", "base\ndevice edit\nend"),
  "base\nshop edit\ndevice edit\nend",
);
assert.equal(combine("same\nnote", "same\nnote"), "same\nnote");
assert.equal(combine("", "device"), "device");
assert.equal(combine("shop", ""), "shop");
assert.equal(combine("base", "base\nnew"), "base\nnew");
assert.equal(
  combine("base\na\na\nend", "base\nb\na\nend"),
  "base\na\nb\na\nend",
  "repeated lines in divergent blocks must not be globally removed",
);
assert.equal(combine("base\r\nshop", "base\ndevice"), "base\nshop\ndevice");
b = build({ reply: { data: { status: "conflict" } } });
b.note.value = "device version";
await b.control.queue();
await b.setOnline(true);
await tick();
await find(b, "Review changes").onclick();
await find(b, "Combine notes").onclick();
assert.equal(
  byLabel(b, "Reviewed Technician notes").value,
  "shop version\ndevice version",
);
assert.equal(
  find(b, "Save reviewed edits").disabled,
  true,
  "combining must not save or skip confirmation",
);
assert.equal(b.calls.length, 1);
let combineAck = byLabel(b, "Confirm reviewed changes");
combineAck.checked = true;
await combineAck.fire("change");
await find(b, "Combine notes").onclick();
assert.equal(
  byLabel(b, "Reviewed Technician notes").value,
  "shop version\ndevice version",
  "repeated combine uses source copies, not the previous result",
);
assert.equal(byLabel(b, "Confirm reviewed changes").checked, false);
combineAck = byLabel(b, "Confirm reviewed changes");
combineAck.checked = true;
await combineAck.fire("change");
b.setReply({ data: { status: "saved" } });
await find(b, "Save reviewed edits").onclick();
assert.equal(
  b.calls[1].args.p_patch.technician_notes,
  "shop version\ndevice version",
);
assert.equal(b.reloads, 1);
console.log(
  "Combine notes: shared edges once, divergent text/repetitions preserved, idempotent UI, explicit confirmation and exact combined submission passed.",
);

// Discard only definitively unsent edits; never erase an uncertain committed request.
b = build({ reply: { data: { status: "conflict" } } });
b.note.value = "discard conflict";
await b.control.queue();
await b.setOnline(true);
await tick();
assert.equal(find(b, "Discard these changes").disabled, false);
const conflictCalls = b.calls.length;
await find(b, "Discard these changes").onclick();
assert.equal(b.data.size, 0);
assert.equal(
  b.calls.length,
  conflictCalls,
  "discard must not write to the shop",
);
assert.equal(b.reloads, 1);
assert.doesNotMatch(statusText(b), /Saved to the shop/);
b = build({ confirmResult: false });
b.note.value = "keep on cancel";
await b.control.queue();
await find(b, "Discard these changes").onclick();
assert.equal(b.data.size, 1);
assert.equal(b.reloads, 0);
b = build();
b.note.value = "unsent";
await b.control.queue();
b.status.value = "unsaved status";
await find(b, "Discard these changes").onclick();
assert.equal(b.data.size, 0);
assert.equal(b.reloads, 0);
assert.equal(b.control.blocksOrderSave(), true);
assert.match(statusText(b), /discarded/);
b = build({ reply: new Error("response lost") });
b.note.value = "unknown outcome";
await b.control.queue();
await b.setOnline(true);
await tick();
assert.equal(find(b, "Discard these changes").disabled, true);
await find(b, "Discard these changes").onclick();
assert.equal(b.data.size, 1);
assert.equal(b.reloads, 0);
// Recheck inside the lock when another tab has changed a formerly discardable copy.
b = build({ reply: { data: { status: "conflict" } } });
b.note.value = "conflict";
await b.control.queue();
await b.setOnline(true);
await tick();
const oldDiscard = find(b, "Discard these changes"),
  storedKey = [...b.data.keys()][0];
const resolving = JSON.parse(b.data.get(storedKey));
resolving.resolution = {
  request: "reviewed",
  expected: "later",
  patch: { technician_notes: "possibly saved" },
};
b.data.set(storedKey, JSON.stringify(resolving));
await oldDiscard.onclick();
assert.equal(b.data.size, 1);
assert.equal(b.reloads, 0);
b = build();
b.note.value = "storage failure";
await b.control.queue();
b.setFail(true);
await find(b, "Discard these changes").onclick();
assert.equal(b.data.size, 1);
assert.match(statusText(b), /Could not discard/);
assert.equal(b.reloads, 0);
console.log(
  "Discard: confirmed conflicts/unsent drafts removable, cancel/storage failure retained, unknown outcomes protected, shop untouched, other form edits retained.",
);
