"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const folder = path.join(__dirname, "..", "7-LiveConnector");
const ui = path.join(__dirname, "..", "tools", "ui");
const rules = require(path.join(folder, "attention_rules.js"));
const live = fs.readFileSync(path.join(folder, "customer-success-control-tower.html"), "utf8");
const blocks = [...live.matchAll(/<script>\n([\s\S]*?)\n<\/script>/g)].map((m) => m[1]);
const engine = blocks.find((b) => b.includes("Risk Engine v"));
const spec = blocks.find((b) => b.startsWith("const CSCT_SPEC = "));
const sandbox = vm.createContext({});
vm.runInContext(engine + "\n" + spec + "\n" +
  'let CTX = csctBuildCtx({asOf:"2026-10-12T12:00:00Z",config:CSCT_SPEC.config,holidays:CSCT_SPEC.holidays});\n' +
  'const SPEC=CSCT_SPEC,TZMS=CTX.tz*3600000,DOT=" | ",MON=[];\n' +
  fs.readFileSync(path.join(ui, "app1b-fold.js"), "utf8") + "\n" +
  'globalThis.fold=foldAt;globalThis.biz=csctBizHours;globalThis.context=CTX;globalThis.cleanManual=cleanManual;globalThis.manualChoice=manualChoice;', sandbox);
const HOUR = 3600000;
const ms = Date.parse;
const now = ms("2026-10-12T12:00:00Z"); // Monday 15:00, UTC+3.
const clock = { hours: (a, b) => sandbox.biz(a, b, sandbox.context), add: (a, h) => {
  let start = a;
  for (let i = 0; i < 400 * 24; i++, start += HOUR) {
    if (sandbox.biz(a, start, sandbox.context) >= h) { return start; }
  }
  throw Error("No business deadline");
} };
const base = { CaseId: "2610100000000001", Account: "Example", Title: "Test", Severity: "Sev B",
  Engineer: "Test Engineer", CreatedOn: "2026-10-12T06:00:00Z", CreatedEstimated: false,
  CurrentOwnershipOn: "2026-10-12T06:00:00Z", LastAssignedEngineerReply: "2026-10-12T06:30:00Z",
  LastMicrosoftUpdate: "2026-10-12T06:30:00Z", NextActionOwner: "Customer" };
const prefs = () => ({ rules: rules.defaults, cases: {} });
function run(overrides = {}, preferences = prefs(), at = now, closed = []) {
  return rules.evaluate([Object.assign({}, base, overrides)], closed, preferences, at, clock);
}
let checked = 0;
function test(name, fn) { fn(); checked++; }
test("No alarm when waiting for customer", () => assert.equal(run().active.length, 0));
test("Unanswered customer business-hour boundary", () => {
  const c = { CustomerWaitingSince: "2026-10-12T08:00:00Z" };
  assert.equal(run(c, prefs(), now - 60000).active.length, 0);
  assert.equal(run(c).active[0].reasons[0].key, "reply");
});
test("Customer chaser does not postpone episode", () => {
  assert.equal(run({ CustomerWaitingSince: "2026-10-12T07:00:00Z", LastCustomerUpdate: "2026-10-12T11:59:00Z" }).active.length, 1);
});
test("Weekends do not count for Sev B", () => {
  assert.equal(run({ CustomerWaitingSince: "2026-10-09T14:00:00Z" }, prefs(), ms("2026-10-11T18:00:00Z")).active.length, 0);
  assert.equal(clock.hours(ms("2026-10-09T14:00:00Z"), ms("2026-10-12T08:00:00Z")), 3);
});
test("Configured holiday does not count", () => {
  assert.equal(clock.hours(ms("2026-10-29T06:00:00Z"), ms("2026-10-29T15:00:00Z")), 0);
});
test("Sev A counts 24/7, ownership is not a reply", () => {
  const a = run({ Severity: "Sev A", LastAssignedEngineerReply: null, CurrentOwnershipOn: "2026-10-11T15:00:00Z" },
    prefs(), ms("2026-10-11T16:00:00Z"));
  assert.equal(a.active[0].reasons[0].key, "contact");
  assert.equal(a.active[0].level, 2);
});
test("Missing owner and absent history are distinct", () => {
  assert.equal(run({ Engineer: "" }).active[0].reasons[0].key, "owner");
  const unknown = run({ Engineer: "", CreatedEstimated: true });
  assert.equal(unknown.active.length, 0);
  assert.equal(unknown.coverage.length, 1);
});
test("Importance shortens follow-up but not risk or severity", () => {
  const p = prefs(); p.cases[base.CaseId] = { priority: "Important" };
  const wait = { CustomerWaitingSince: "2026-10-12T10:00:00Z" };
  assert.equal(run(wait).active.length, 0);
  assert.equal(run(wait, p).active[0].reasons[0].threshold, 2);
  p.cases[base.CaseId].priority = "Critical";
  assert.equal(run(wait, p).active[0].level, 2);
  assert.equal(base.Severity, "Sev B");
});
test("Sev C follows its separate threshold", () => {
  assert.equal(run({ Severity: "Sev C", CustomerWaitingSince: "2026-10-12T06:00:00Z" }).active.length, 0);
});
test("Replies become urgent after one business day, other waits at twice the threshold", () => {
  assert.equal(rules.longAfter("reply", 8, false, 9), 9);
  assert.equal(rules.longAfter("reply", 4, false, 9), 8);
  assert.equal(rules.longAfter("owner", 2, false, 9), 4);
  assert.equal(rules.longAfter("update", 8, false, 9), 16);
  assert.equal(rules.longAfter("pg", 8, false, 9), 16);
  assert.equal(rules.longAfter("reply", 8, true, 9), 16);
  const sevC = (since, day) => rules.evaluate([Object.assign({}, base, { Severity: "Sev C", CustomerWaitingSince: since })], [], prefs(), now,
    day === undefined ? clock : Object.assign({}, clock, { day })).active[0];
  assert.equal(sevC("2026-10-09T12:30:00Z").level, 1);
  assert.equal(sevC("2026-10-09T12:00:00Z").level, 2);
  assert.equal(sevC("2026-10-09T13:00:00Z", 8).level, 2);
  assert.equal(sevC("2026-10-09T13:00:00Z").level, 1);
  const pg = run({ NextActionOwner: "Microsoft", FollowUpBall: "Product Group", LastMicrosoftUpdate: "2026-10-09T08:00:00Z" }).active[0];
  assert.equal(pg.reasons[0].key, "pg"); assert.equal(pg.level, 1);
});
test("PG follow-up waits longer", () => {
  assert.equal(run({ NextActionOwner: "Microsoft", FollowUpBall: "Product Group" }).active.length, 0);
  const r = run({ NextActionOwner: "Microsoft", FollowUpBall: "Product Group", LastMicrosoftUpdate: "2026-10-09T12:00:00Z" });
  assert.equal(r.active[0].reasons[0].key, "pg");
  const p = prefs(); p.cases[base.CaseId] = { priority: "Critical" };
  assert.equal(run({ NextActionOwner: "Microsoft", FollowUpBall: "Product Group" }, p).active[0].reasons[0].threshold, 1);
});
test("Important never makes a custom short threshold slower", () => {
  const p = prefs(); p.rules = Object.assign({}, rules.defaults, { standardHours: 1, importantHours: 4 });
  p.cases[base.CaseId] = { priority: "Important" };
  assert.equal(run({ CustomerWaitingSince: "2026-10-12T10:00:00Z" }, p).active[0].reasons[0].threshold, 1);
});
test("Newly reopened case requires fresh engineer action", () => {
  assert.equal(run({ LastReopenedOn: "2026-10-12T07:00:00Z" }).active[0].reasons[0].key, "reopen");
});
test("One row combines multiple reasons", () => {
  const r = run({ LastAssignedEngineerReply: null, CustomerWaitingSince: "2026-10-12T06:00:00Z" });
  assert.equal(r.active.length, 1); assert.equal(r.active[0].reasons.length, 2);
});
test("Review and snooze apply to current episode; new wait resurfaces", () => {
  const c = { CustomerWaitingSince: "2026-10-12T07:00:00Z" }, row = run(c).active[0], p = prefs();
  p.cases[base.CaseId] = { reviewed: { signature: row.signature, level: row.level } };
  assert.equal(run(c, p).active.length, 0); assert.equal(run(c, p).reviewed.length, 1);
  assert.equal(run({ CustomerWaitingSince: "2026-10-12T08:00:00Z" }, p).active.length, 1);
  p.cases[base.CaseId] = { snooze: { signature: row.signature, level: row.level, until: "2026-10-12T13:00:00Z" } };
  assert.equal(run(c, p).snoozed.length, 1);
  assert.equal(run(c, p, ms("2026-10-12T13:00:00Z")).active.length, 1);
});
test("Increasing urgency bypasses snooze and review", () => {
  const c = { CustomerWaitingSince: "2026-10-12T06:00:00Z" }, row = run(c).active[0], p = prefs();
  assert.equal(row.level, 1);
  p.cases[base.CaseId] = { snooze: { signature: row.signature, level: 1, until: "2026-10-13T12:00:00Z" } };
  assert.equal(run(c, p, ms("2026-10-12T14:00:00Z")).active.length, 1);
});
test("Removing a reason does not spam a reviewed case", () => {
  const c = { LastAssignedEngineerReply: null, CustomerWaitingSince: "2026-10-12T08:00:00Z" };
  const row = run(c).active[0], p = prefs();
  p.cases[base.CaseId] = { reviewed: { signature: row.signature, level: row.level } };
  assert.equal(run({ CustomerWaitingSince: c.CustomerWaitingSince }, p).reviewed.length, 1);
});
test("Closed and inferred-inactive cases are visibility checks, not response alarms", () => {
  const result = rules.evaluate([], [
    { CaseId: "1", ClosedOn: "2026-10-12T07:00:00Z", Status: "Closed", Engineer: "A" },
    { CaseId: "2", ClosedOn: "2026-09-10T07:00:00Z", ClosureInferredOn: "2026-10-12T07:00:00Z", Status: "Inactive", Engineer: "A" },
    { CaseId: "3", ClosedOn: "2026-10-12T07:00:00Z", Status: "Closed", Engineer: "" }
  ], prefs(), now, clock);
  assert.equal(result.active.length, 0); assert.equal(result.coverage.length, 2);
});
function fold(events, manual, at = now) {
  return sandbox.fold({ accounts: [{ Title: "Example" }], cases: { [base.CaseId]: { account: "Example" } }, me: { name: "Case Owner" },
    events: events.map((e) => Object.assign({ caseId: base.CaseId, actor: "Test Engineer" }, e)) },
    at, { cases: {}, accounts: {} }, true, manual);
}
const created = { kind: "created", t: "2026-10-12T06:00:00Z", sev: "B" };
const owner = { kind: "ownership", t: "2026-10-12T06:05:00Z", engineer: "Test Engineer" };
test("Fold keeps first unanswered message, ignores team and notices", () => {
  const result = fold([created, owner, { kind: "customer_update", t: "2026-10-12T07:00:00Z", role: "customer" },
    { kind: "customer_update", t: "2026-10-12T09:00:00Z", role: "customer" },
    { kind: "account_team", t: "2026-10-12T10:00:00Z" },
    { kind: "notification", t: "2026-10-12T11:00:00Z" }]);
  assert.equal(result.extra.cases[0].CustomerWaitingSince, "2026-10-12T07:00:00.000Z");
  assert.equal(result.extra.cases[0].LastAssignedEngineerReply, null);
});
test("Technical reply clears customer wait and marks personal contact", () => {
  const result = fold([created, owner, { kind: "customer_update", t: "2026-10-12T07:00:00Z", role: "customer" },
    { kind: "ms_update", t: "2026-10-12T08:00:00Z", role: "ms" }]);
  assert.equal(result.extra.cases[0].CustomerWaitingSince, null);
  assert.equal(result.extra.cases[0].LastAssignedEngineerReply, "2026-10-12T08:00:00.000Z");
});
test("Ownership change requires the new owner's reply", () => {
  const result = fold([created, owner, { kind: "ms_update", t: "2026-10-12T07:00:00Z", role: "ms" },
    { kind: "ownership", t: "2026-10-12T08:00:00Z", engineer: "New Engineer" },
    { kind: "ms_update", t: "2026-10-12T09:00:00Z", role: "ms" }]);
  assert.equal(result.extra.cases[0].CurrentOwnershipOn, "2026-10-12T08:00:00.000Z");
  assert.equal(result.extra.cases[0].LastAssignedEngineerReply, null);
});
test("Repeated ownership notice does not reset timer", () => {
  assert.equal(fold([created, owner, Object.assign({}, owner, { t: "2026-10-12T10:00:00Z" })]).extra.cases[0].CurrentOwnershipOn,
    "2026-10-12T06:05:00.000Z");
});
test("Closure stops response alarms; reopening clears old waits", () => {
  const events = [created, owner, { kind: "customer_update", t: "2026-10-12T07:00:00Z", role: "customer" },
    { kind: "closed", t: "2026-10-12T08:00:00Z" }];
  assert.equal(fold(events).extra.cases.length, 0);
  const reopened = fold(events.concat({ kind: "reopened", t: "2026-10-12T09:00:00Z" }));
  assert.equal(reopened.extra.cases[0].CustomerWaitingSince, null);
  assert.equal(reopened.extra.cases[0].LastReopenedOn, "2026-10-12T09:00:00.000Z");
  assert.equal(reopened.extra.closed.length, 0);
});
test("Closed history retains complete metadata and all timeline events", () => {
  const events = [
    Object.assign({}, created, { fields: { caseTitle: "Closure metadata", areaPath: "Microsoft 365/Exchange", serviceName: "Exchange",
      caseLink: "https://example.test/case" } }),
    owner,
    { kind: "ms_update", t: "2026-10-12T06:30:00Z", role: "ms", actorMail: "engineer@example.test" },
    { kind: "customer_update", t: "2026-10-12T07:00:00Z", role: "customer", actor: "Customer Name", actorMail: "customer@example.test" },
    { kind: "closed", t: "2026-10-12T08:00:00Z", role: "system", resolution: "Resolved",
      link: "https://example.test/mail" }
  ];
  const result = fold(events), c = result.extra.closed[0];
  assert.equal(result.extra.cases.length, 0);
  assert.equal(c.Status, "Closed"); assert.equal(c.ClosureKind, "closed");
  assert.equal(c.ClosureInferredOn, null);
  assert.equal(c.Resolution, "Resolved"); assert.equal(c.Title, "Closure metadata");
  assert.equal(c.Engineer, "Test Engineer"); assert.equal(c.EngineerMail, "engineer@example.test");
  assert.equal(c.ContactMails["Customer Name"], "customer@example.test");
  assert.equal(c.FirstEngineerReplyOn, "2026-10-12T06:30:00.000Z");
  assert.equal(c.LastMicrosoftUpdate, "2026-10-12T06:30:00.000Z");
  assert.equal(c.LastCustomerUpdate, "2026-10-12T07:00:00.000Z");
  assert.equal(c.FirstOwnershipOn, "2026-10-12T06:05:00.000Z");
  assert.equal(c.ClosedOn, "2026-10-12T08:00:00.000Z");
  assert.equal(c.CaseLink, "https://example.test/case"); assert.equal(c.LastMailLink, "https://example.test/mail");
  assert.equal(c.ServiceName, "Exchange"); assert.equal(c.CreatedEstimated, false);
  assert.equal(c.OwnershipChanges, 0); assert.equal(c.ReopenCount, 0);
  assert.equal(result.extra.events.length, events.length);
});
test("Archive is official history, not consent or inactivity", () => {
  const c = fold([created, owner, { kind: "archived", t: "2026-10-12T08:00:00Z" }]).extra.closed[0];
  assert.equal(c.Status, "Closed"); assert.equal(c.ClosureKind, "archived"); assert.equal(c.ClosureInferredOn, null);
});
test("Customer agreement stays pending without an official closure", () => {
  const c = fold([created, owner, { kind: "customer_update", t: "2026-10-12T08:00:00Z", closure: true, role: "customer" }]).extra.closed[0];
  assert.equal(c.Status, "Resolved"); assert.equal(c.ClosureKind, "consent");
  assert.equal(c.ClosureInferredOn, null);
});
test("Inactive history has a recorded threshold distinct from last activity", () => {
  const c = fold([{ kind: "created", t: "2026-09-01T06:00:00Z", sev: "B" },
    { kind: "ownership", t: "2026-09-01T07:00:00Z", engineer: "Test Engineer" }]).extra.closed[0];
  assert.equal(c.Status, "Inactive"); assert.equal(c.ClosureKind, "inactivity");
  assert.equal(c.LastActivity, "2026-09-01T07:00:00.000Z");
  assert.equal(c.ClosureInferredOn, "2026-09-22T07:00:00.000Z");
  assert.notEqual(c.ClosedOn, c.ClosureInferredOn);
});
const manualAt = (state, at) => ({ [base.CaseId]: { state, at } });
const unanswered = [created, owner, { kind: "customer_update", t: "2026-10-12T07:00:00Z", role: "customer",
  signals: [{ type: "Complaint", category: "Delay", label: "Delay", phrase: "slow" }] }];
test("Closing an open case by hand moves it to history without inventing a Microsoft notice", () => {
  const plain = fold(unanswered);
  assert.equal(plain.extra.cases.length, 1); assert.equal(plain.extra.cases[0].AutoClosed, false);
  assert.equal(plain.extra.cases[0].ManualState, null);
  assert.equal(plain.extra.signals[0].Status, "New");
  const result = fold(unanswered, manualAt("closed", "2026-10-12T10:00:00Z"));
  assert.equal(result.extra.cases.length, 0); assert.equal(result.input.cases.length, 0);
  const c = result.extra.closed[0];
  assert.equal(c.Status, "Closed"); assert.equal(c.ClosureKind, "manual"); assert.equal(c.ClosedOn, "2026-10-12T10:00:00.000Z");
  assert.equal(c.ClosureInferredOn, null); assert.equal(c.AutoClosed, false); assert.equal(c.ManualState, "closed");
  assert.match(c.Resolution, /Closed manually/);
  assert.equal(c.LastCustomerUpdate, "2026-10-12T07:00:00.000Z");
  const change = result.extra.events.filter((e) => e.EventType === "Status change");
  assert.equal(change.length, 1); assert.equal(change[0].Actor, "Case Owner"); assert.equal(change[0].EventTime, "2026-10-12T10:00:00.000Z");
  assert.equal(result.extra.signals[0].Status, "Resolved");
  assert.equal(fold(unanswered).extra.events.filter((e) => e.EventType === "Status change").length, 0);
});
test("Reopening a closed case by hand does not look like a Microsoft reopen", () => {
  const closedEvents = [created, owner, { kind: "closed", t: "2026-10-12T08:00:00Z", role: "system" }];
  assert.equal(fold(closedEvents).extra.closed[0].AutoClosed, true);
  const result = fold(closedEvents, manualAt("open", "2026-10-12T09:00:00Z"));
  assert.equal(result.extra.closed.length, 0); assert.equal(result.extra.cases.length, 1);
  const c = result.extra.cases[0];
  assert.equal(c.AutoClosed, true); assert.equal(c.ManualState, "open");
  assert.equal(c.LastReopenedOn, null); assert.equal(c.CustomerWaitingSince, null); assert.equal(c.ReopenCount, 0);
  const rows = rules.evaluate(result.extra.cases, result.extra.closed, prefs(), now, clock).rows;
  assert.ok(rows.every((r) => r.reasons.every((x) => x.key !== "reopen")));
  assert.equal(result.extra.events.filter((e) => e.EventType === "Status change")[0].Detail, "Moved to open cases in Control Tower");
});
test("Official closure or reopen notices that arrive after a manual choice take over", () => {
  const closedEvents = [created, owner, { kind: "closed", t: "2026-10-12T08:00:00Z", role: "system" }];
  assert.equal(fold(closedEvents, manualAt("open", "2026-10-12T07:30:00Z")).extra.closed.length, 1);
  const closedAgain = closedEvents.concat({ kind: "closed", t: "2026-10-12T11:00:00Z", role: "system" });
  const again = fold(closedAgain, manualAt("open", "2026-10-12T09:00:00Z"));
  assert.equal(again.extra.cases.length, 0); assert.equal(again.extra.closed[0].ClosureKind, "closed");
  assert.equal(again.extra.events.filter((e) => e.EventType === "Status change").length, 0);
  const reopened = fold(unanswered.concat({ kind: "reopened", t: "2026-10-12T11:00:00Z", role: "system" }), manualAt("closed", "2026-10-12T10:00:00Z"));
  assert.equal(reopened.extra.cases.length, 1); assert.equal(reopened.extra.closed.length, 0);
  assert.equal(reopened.extra.cases[0].ManualState, null);
  const later = fold(unanswered.concat({ kind: "reopened", t: "2026-10-12T09:00:00Z", role: "system" }), manualAt("closed", "2026-10-12T10:00:00Z"));
  assert.equal(later.extra.cases.length, 0); assert.equal(later.extra.closed[0].ClosureKind, "manual");
});
test("Manual choices are ignored when malformed or when no choice is passed", () => {
  const cleaned = sandbox.cleanManual({ [base.CaseId]: { state: "closed", at: "2026-10-12T10:00:00Z" }, bad: { state: "closed", at: "2026-10-12T10:00:00Z" },
    "2610100000000002": { state: "resolved", at: "2026-10-12T10:00:00Z" }, "2610100000000003": { state: "open", at: "soon" }, "2610100000000004": null });
  assert.deepEqual(Object.keys(cleaned), [base.CaseId]);
  assert.deepEqual(Object.keys(sandbox.cleanManual(null)), []); assert.deepEqual(Object.keys(sandbox.cleanManual("closed")), []);
  assert.equal(fold(unanswered, { [base.CaseId]: { state: "resolved", at: "2026-10-12T10:00:00Z" } }).extra.cases.length, 1);
  assert.equal(fold(unanswered, { [base.CaseId]: { state: "closed", at: "invalid" } }).extra.cases.length, 1);
});
test("A closure inferred from inactivity or customer agreement can be confirmed by hand", () => {
  const inactive = [{ kind: "created", t: "2026-09-01T06:00:00Z", sev: "B" }, { kind: "ownership", t: "2026-09-01T07:00:00Z", engineer: "Test Engineer" }];
  const plain = fold(inactive).extra.closed[0];
  assert.equal(plain.Status, "Inactive"); assert.equal(plain.AutoClosed, true); assert.equal(plain.OfficialClosed, false);
  const confirmed = fold(inactive, manualAt("closed", "2026-10-12T10:00:00Z")).extra.closed[0];
  assert.equal(confirmed.Status, "Closed"); assert.equal(confirmed.ClosureKind, "manual"); assert.equal(confirmed.ClosedOn, "2026-10-12T10:00:00.000Z");
  assert.equal(confirmed.ClosureInferredOn, null); assert.equal(confirmed.AutoClosed, true); assert.equal(confirmed.OfficialClosed, false);
  assert.equal(confirmed.ManualState, "closed");
  const pending = [created, owner, { kind: "customer_update", t: "2026-10-12T08:00:00Z", closure: true, role: "customer" }];
  assert.equal(fold(pending).extra.closed[0].Status, "Resolved");
  assert.equal(fold(pending, manualAt("closed", "2026-10-12T10:00:00Z")).extra.closed[0].ClosureKind, "manual");
  const reopened = fold(inactive, manualAt("open", "2026-10-12T10:00:00Z")).extra.cases[0];
  assert.equal(reopened.AutoClosed, true); assert.equal(reopened.OfficialClosed, false); assert.equal(reopened.ManualState, "open");
  assert.equal(fold([created, owner, { kind: "closed", t: "2026-10-12T08:00:00Z", role: "system" }]).extra.closed[0].OfficialClosed, true);
  assert.equal(fold(unanswered).extra.cases[0].OfficialClosed, false);
});
test("A case reopened by hand after an inferred closure closes again on later evidence", () => {
  const inactive = [{ kind: "created", t: "2026-09-01T06:00:00Z", sev: "B" }, { kind: "ownership", t: "2026-09-01T07:00:00Z", engineer: "Test Engineer" }];
  const choice = manualAt("open", "2026-10-12T10:00:00Z");
  const held = fold(inactive, choice).extra.cases[0];
  assert.equal(held.ManualState, "open"); assert.equal(held.AutoClosed, true);
  assert.equal(fold(inactive, choice, ms("2026-11-02T09:00:00Z")).extra.cases.length, 1);
  const later = fold(inactive, choice, ms("2026-11-03T10:00:01Z")).extra;
  assert.equal(later.cases.length, 0);
  assert.equal(later.closed[0].Status, "Inactive"); assert.equal(later.closed[0].ClosureInferredOn, "2026-11-02T10:00:00.000Z");
  assert.equal(later.closed[0].ManualState, null); assert.equal(later.closed[0].AutoClosed, true);
  const active = fold(inactive.concat({ kind: "customer_update", t: "2026-10-12T11:00:00Z", role: "customer" }), choice).extra.cases[0];
  assert.equal(active.AutoClosed, false); assert.equal(active.ManualState, null);
  const asked = [created, owner, { kind: "customer_update", t: "2026-10-12T08:00:00Z", closure: true, role: "customer" }];
  assert.equal(fold(asked, choice).extra.cases[0].ManualState, "open");
  const again = fold(asked.concat({ kind: "customer_update", t: "2026-10-12T11:00:00Z", closure: true, role: "customer" }), choice).extra;
  assert.equal(again.cases.length, 0); assert.equal(again.closed[0].Status, "Resolved"); assert.equal(again.closed[0].ManualState, null);
  const official = [created, owner, { kind: "closed", t: "2026-10-12T08:00:00Z", role: "system" }, { kind: "customer_update", t: "2026-10-12T11:00:00Z", role: "customer" }];
  assert.equal(fold(official, manualAt("open", "2026-10-12T09:00:00Z")).extra.cases[0].ManualState, "open");
});
test("A manual choice is stored only when the official e-mail history does not already show that state", () => {
  const official = { AutoClosed: true, OfficialClosed: true }, inferred = { AutoClosed: true, OfficialClosed: false }, open = { AutoClosed: false, OfficialClosed: false };
  const show = (c, target) => { const v = sandbox.manualChoice(c, target, "T"); return v ? v.state + "@" + v.at : null; };
  assert.equal(show(official, "closed"), null); assert.equal(show(official, "open"), "open@T");
  assert.equal(show(inferred, "closed"), "closed@T"); assert.equal(show(inferred, "open"), "open@T");
  assert.equal(show(open, "open"), null); assert.equal(show(open, "closed"), "closed@T");
});
test("Manually closed cases are not visibility checks", () => {
  const result = rules.evaluate([], [
    { CaseId: "1", ClosedOn: "2026-10-12T07:00:00Z", Status: "Closed", ClosureKind: "manual", Engineer: "" },
    { CaseId: "2", ClosedOn: "2026-10-12T07:00:00Z", Status: "Closed", ClosureKind: "closed", Engineer: "" }
  ], prefs(), now, clock);
  assert.deepEqual(result.coverage.map((c) => c.caseId), ["2"]);
});
vm.runInContext('let X={closed:[]}; const state={q:"",closedStatus:"Closed",closedAccount:"",closedPeriod:"all"};\n' +
  'const hay=(c)=>(c.CaseId+" "+c.Account+" "+c.Title+" "+(c.Engineer||"")).toLowerCase();\n' +
  fs.readFileSync(path.join(ui, "app4-closed.js"), "utf8") +
  '\nglobalThis.historyRows=closedRows;globalThis.historySet=(rows,options)=>{X.closed=rows;Object.assign(state,options);};' +
  '\nglobalThis.historyDate=historyDate;globalThis.historyLabel=historyLabel;globalThis.activitySince=activitySince;', sandbox);
const history = [
  { CaseId: "1", Status: "Closed", Account: "Example", Title: "Older", ClosedOn: "2026-09-01T08:00:00Z" },
  { CaseId: "2", Status: "Closed", Account: "Example", Title: "Recent", Engineer: "Test Engineer", ClosedOn: "2026-10-12T08:00:00Z", ClosureKind: "archived" },
  { CaseId: "3", Status: "Inactive", Account: "Other", Title: "Inactive", ClosedOn: "2026-09-01T08:00:00Z", ClosureInferredOn: "2026-10-11T08:00:00Z" },
  { CaseId: "4", Status: "Resolved", Account: "Other", Title: "Pending", ClosedOn: "2026-10-10T08:00:00Z" },
  { CaseId: "5", Status: "Closed", Account: "Example", Title: "By hand", ClosedOn: "2026-10-12T09:00:00Z", ClosureKind: "manual", LastActivity: "2026-10-12T10:00:00Z" }
];
test("Closed history filters status, account, period and search together", () => {
  sandbox.historySet(history, { q: "", closedStatus: "Closed", closedAccount: "", closedPeriod: "all" });
  assert.deepEqual(Array.from(sandbox.historyRows(), (c) => c.CaseId), ["5", "2", "1"]);
  sandbox.historySet(history, { closedPeriod: "7", q: "engineer", closedAccount: "Example" });
  assert.deepEqual(Array.from(sandbox.historyRows(), (c) => c.CaseId), ["2"]);
  sandbox.historySet(history, { closedStatus: "all", q: "", closedAccount: "", closedPeriod: "7" });
  assert.deepEqual(Array.from(sandbox.historyRows(), (c) => c.CaseId), ["5", "2", "3", "4"]);
});
test("History labels never present customer consent or inactivity as confirmed closure", () => {
  assert.equal(sandbox.historyLabel(history[1]), "Archived");
  assert.equal(sandbox.historyLabel(history[2]), "Inactive (inferred)");
  assert.equal(sandbox.historyLabel(history[3]), "Closure pending");
  assert.equal(sandbox.historyDate(history[2]), history[2].ClosureInferredOn);
  assert.equal(sandbox.historyLabel(history[4]), "Closed manually");
  assert.equal(sandbox.activitySince(history[4]), true);
  assert.equal(sandbox.activitySince(Object.assign({}, history[4], { LastActivity: "2026-10-12T08:00:00Z" })), false);
  assert.equal(sandbox.activitySince(history[1]), false);
});
console.log(checked + " follow-up rule and event-fold checks passed.");
