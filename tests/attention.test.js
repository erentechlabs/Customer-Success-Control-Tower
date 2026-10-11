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
  'globalThis.fold=foldAt;globalThis.biz=csctBizHours;globalThis.context=CTX;', sandbox);
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
function fold(events) {
  return sandbox.fold({ accounts: [{ Title: "Example" }], cases: { [base.CaseId]: { account: "Example" } },
    events: events.map((e) => Object.assign({ caseId: base.CaseId, actor: "Test Engineer" }, e)) },
    now, { cases: {}, accounts: {} }, true);
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
vm.runInContext('let X={closed:[]}; const state={q:"",closedStatus:"Closed",closedAccount:"",closedPeriod:"all"};\n' +
  'const hay=(c)=>(c.CaseId+" "+c.Account+" "+c.Title+" "+(c.Engineer||"")).toLowerCase();\n' +
  fs.readFileSync(path.join(ui, "app4-closed.js"), "utf8") +
  '\nglobalThis.historyRows=closedRows;globalThis.historySet=(rows,options)=>{X.closed=rows;Object.assign(state,options);};' +
  '\nglobalThis.historyDate=historyDate;globalThis.historyLabel=historyLabel;', sandbox);
const history = [
  { CaseId: "1", Status: "Closed", Account: "Example", Title: "Older", ClosedOn: "2026-09-01T08:00:00Z" },
  { CaseId: "2", Status: "Closed", Account: "Example", Title: "Recent", Engineer: "Test Engineer", ClosedOn: "2026-10-12T08:00:00Z", ClosureKind: "archived" },
  { CaseId: "3", Status: "Inactive", Account: "Other", Title: "Inactive", ClosedOn: "2026-09-01T08:00:00Z", ClosureInferredOn: "2026-10-11T08:00:00Z" },
  { CaseId: "4", Status: "Resolved", Account: "Other", Title: "Pending", ClosedOn: "2026-10-10T08:00:00Z" }
];
test("Closed history filters status, account, period and search together", () => {
  sandbox.historySet(history, { q: "", closedStatus: "Closed", closedAccount: "", closedPeriod: "all" });
  assert.deepEqual(Array.from(sandbox.historyRows(), (c) => c.CaseId), ["2", "1"]);
  sandbox.historySet(history, { closedPeriod: "7", q: "engineer", closedAccount: "Example" });
  assert.deepEqual(Array.from(sandbox.historyRows(), (c) => c.CaseId), ["2"]);
  sandbox.historySet(history, { closedStatus: "all", q: "", closedAccount: "", closedPeriod: "7" });
  assert.deepEqual(Array.from(sandbox.historyRows(), (c) => c.CaseId), ["2", "3", "4"]);
});
test("History labels never present customer consent or inactivity as confirmed closure", () => {
  assert.equal(sandbox.historyLabel(history[1]), "Archived");
  assert.equal(sandbox.historyLabel(history[2]), "Inactive (inferred)");
  assert.equal(sandbox.historyLabel(history[3]), "Closure pending");
  assert.equal(sandbox.historyDate(history[2]), history[2].ClosureInferredOn);
});
console.log(checked + " follow-up rule and event-fold checks passed.");
