import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
const queue = fs.readFileSync(
  new URL("../pages/Shop/shop-offline-ro.js", import.meta.url),
  "utf8",
);
const recovery = fs.readFileSync(
  new URL("../pages/Shop/offline-note-recovery.js", import.meta.url),
  "utf8",
);
const now = Date.now(),
  snapshot = {
    version: 2,
    project: "project-a",
    shop: "shop-a",
    actor: "user-a",
    ro: "ro-a",
    label: "1001",
    expected: "original-version",
    base: { technician_notes: "original", labor_hours: 0 },
    tab: "tab-a",
    sessionKey: "session-a",
    capturedAt: now,
  };
function build({
  snap = snapshot,
  actor = "user-a",
  expires = now / 1000 + 600,
  extra = {},
  owner = true,
} = {}) {
  const data = new Map(
      Object.entries({
        "session-a": JSON.stringify({
          user: { id: actor },
          expires_at: expires,
        }),
        ...extra,
      }),
    ),
    events = {},
    nodes = new Map();
  let fail = false,
    reloads = 0;
  const storage = {
    get length() {
      return data.size;
    },
    key: (i) => [...data.keys()][i],
    getItem: (k) => data.get(k) || null,
    setItem(k, v) {
      if (fail) throw Error("Full storage");
      data.set(k, v);
    },
    removeItem: (k) => data.delete(k),
  };
  const element = (tag) => ({
    tag,
    value: "",
    hidden: true,
    children: [],
    events: {},
    append(e) {
      this.children.push(e);
    },
    replaceChildren() {
      this.children = [];
    },
    addEventListener(k, f) {
      this.events[k] = f;
    },
  });
  const by = (id) => {
    if (!nodes.has(id)) nodes.set(id, element(id));
    return nodes.get(id);
  };
  const win = {
    localStorage: storage,
    addEventListener(k, f) {
      events[k] = f;
    },
    setTimeout() {},
  };
  const sessionStorage = {
    getItem: (k) =>
      k === "longshift.offline.ro.tab.v2" ? JSON.stringify(snap) : null,
  };
  vm.runInNewContext(queue + "\n" + recovery, {
    window: win,
    localStorage: storage,
    sessionStorage,
    document: {
      getElementById: by,
      createElement: element,
      addEventListener(k, f) {
        events[k] = f;
      },
    },
    navigator: {
      locks: {
        request(_name, options, callback) {
          return Promise.resolve(
            (callback || options)(callback ? (owner ? {} : null) : {}),
          );
        },
      },
    },
    location: {
      search: "?id=1001",
      reload() {
        reloads++;
      },
    },
    URLSearchParams,
    Date,
    Number,
    TextEncoder,
    crypto: { randomUUID: () => "request-a" },
    setTimeout() {},
  });
  return {
    data,
    by,
    events,
    storage,
    setFail(v) {
      fail = v;
    },
    get reloads() {
      return reloads;
    },
    inputs() {
      return by("fields").children.map((l) => l.children[0]);
    },
  };
}
let b = build();
assert.equal(b.by("editor").hidden, false);
b.inputs()[0].value = "offline work";
await b.by("save").onclick();
const key = "longshift.offline.ro.v1:project-a:shop-a:user-a:ro-a",
  saved = b.storage.getItem(key);
assert.equal(JSON.parse(saved).patch.technician_notes, "offline work");
assert.match(b.by("status").textContent, /Saved on this computer/);
// Reload hydrates all changes without altering the original optimistic version.
b = build({ extra: { [key]: saved } });
assert.equal(b.inputs()[0].value, "offline work");
b.inputs()[1].value = "2.5";
await b.by("save").onclick();
assert.equal(JSON.parse(b.storage.getItem(key)).patch.labor_hours, 2.5);
assert.equal(JSON.parse(b.storage.getItem(key)).expected, "original-version");
// On reconnect, the latest typing must be stored before reloading the online app.
b.inputs()[0].value = "last keystroke";
await b.events.online();
assert.equal(
  JSON.parse(b.storage.getItem(key)).patch.technician_notes,
  "last keystroke",
);
assert.equal(b.reloads, 1);
b = build();
b.inputs()[0].value = "unsaved";
b.setFail(true);
await b.events.online();
assert.equal(b.reloads, 0);
assert.match(b.by("status").textContent, /not saved/);
// Frozen requests and duplicate tabs must never rewrite an unconfirmed operation.
const attempted = JSON.stringify({
  ...JSON.parse(saved),
  attempted: true,
  state: "pending",
});
b = build({ extra: { [key]: attempted } });
assert.equal(b.inputs()[0].disabled, true);
await b.by("save").onclick();
assert.equal(b.storage.getItem(key), attempted);
await b.events.online();
assert.equal(b.reloads, 1);
b = build({ owner: false });
b.inputs()[0].value = "duplicate";
await b.by("save").onclick();
assert.equal(b.data.has(key), false);
assert.match(b.by("status").textContent, /other tab/);
for (const opts of [
  { actor: "other" },
  { expires: now / 1000 - 1 },
  { snap: { ...snapshot, capturedAt: now - 9 * 3600000 } },
  { snap: { ...snapshot, capturedAt: now + 100000 } },
  { snap: { ...snapshot, label: "other", ro: "other" } },
]) {
  assert.equal(build(opts).by("editor").hidden, true);
}
b = build({ extra: { [key]: saved } });
b.data.delete("session-a");
b.events.storage();
assert.equal(b.by("editor").hidden, true);
assert.equal(b.storage.getItem(key), saved);
b = build({
  extra: {
    "longshift.offline.note.v1:shop-a:user-a:old": JSON.stringify({
      ro: "ro-a",
      note: "older note",
    }),
  },
});
assert.equal(b.by("editor").hidden, true);
assert.match(b.by("status").textContent, /older technician note/);
console.log(
  "RO offline reopening: hydration, original version, reconnect flush, storage failure, frozen requests, duplicate tabs, expiry/account checks and old draft protection passed.",
);
