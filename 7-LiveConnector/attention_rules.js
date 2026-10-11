(function (root) {
  "use strict";
  const HOUR = 3600000;
  const defaults = { urgentHours: 1, importantHours: 2, standardHours: 4, lowHours: 8, ownerHours: 2, pgHours: 8 };
  const time = (value) => { const ms = Date.parse(value || ""); return Number.isFinite(ms) ? ms : null; };
  const iso = (ms) => new Date(ms).toISOString();

  function evaluate(cases, closed, preferences, now, clock) {
    const rules = Object.assign({}, defaults, preferences.rules);
    const rows = [], coverage = [];
    cases.forEach((c) => {
      const saved = preferences.cases[c.CaseId] || {};
      const priority = saved.priority || "Standard";
      const sev = String(c.Severity || "").replace(/^Sev\s*/i, "").toUpperCase();
      const wall = sev === "1" || sev === "A";
      const standard = sev === "C" ? rules.lowHours : rules.standardHours;
      const hours = wall ? rules.urgentHours : priority === "Critical" ? Math.min(standard, rules.importantHours, 1)
        : priority === "Important" ? Math.min(standard, rules.importantHours) : standard;
      const reasons = [];
      const add = (key, title, start, threshold, action) => {
        const ms = time(start);
        if (ms === null || ms > now) { return; }
        const elapsed = wall ? (now - ms) / HOUR : clock.hours(ms, now);
        if (elapsed < threshold) { return; }
        const level = wall || priority === "Critical" || elapsed >= 2 * threshold ? 2 : 1;
        reasons.push({ key, title, since: iso(ms), elapsed, threshold, clock: wall ? "24/7 hours" : "business hours",
          due: iso(wall ? ms + threshold * HOUR : clock.add(ms, threshold)), level, action });
      };
      const assigned = !!c.Engineer && c.Engineer !== "(not visible)";
      const lastMs = time(c.LastMicrosoftUpdate);
      const own = time(c.CurrentOwnershipOn);
      const ownReply = time(c.LastAssignedEngineerReply);
      if (!assigned && !c.CreatedEstimated) {
        add("owner", "No ownership visible", c.CreatedOn, Math.min(hours, rules.ownerHours),
          "Check assignment in the case record; prepare one ownership follow-up on the existing thread.");
      } else if (assigned && own !== null && (ownReply === null || ownReply < own)) {
        add("contact", "Owner accepted, no personal reply visible", c.CurrentOwnershipOn, hours,
          "Ask the assigned engineer for a first update or to copy the account team. An ownership notice is not a technical reply.");
      }
      if (c.CustomerWaitingSince) {
        add("reply", "Customer message not answered", c.CustomerWaitingSince, hours,
          "Prepare one concise reply request on the existing thread, with the next step and ETA.");
      } else if (lastMs !== null && c.NextActionOwner === "Microsoft") {
        const pg = c.FollowUpBall === "Product Group";
        add(pg ? "pg" : "update", pg ? "Product-group follow-up due" : "Engineer progress update due",
          c.LastMicrosoftUpdate, pg && !wall && priority === "Standard" ? Math.max(hours, rules.pgHours) : hours,
          pg ? "Ask the engineer for the product-group status and the next customer update time."
            : "Check the latest progress and prepare an update request; do not infer inactivity from automatic notices.");
      }
      const reopen = time(c.LastReopenedOn);
      if (reopen !== null && (lastMs === null || lastMs < reopen)) {
        add("reopen", "Reopened, no engineer update visible", c.LastReopenedOn, hours,
          "Confirm the reopened case has an owner and a fresh action plan.");
      }
      if (!assigned && c.CreatedEstimated) {
        coverage.push({ caseId: c.CaseId, account: c.Account, title: c.Title, kind: "Incomplete history",
          detail: "No creation or ownership notice is visible. Confirm assignment; no ownership timer is asserted." });
      }
      if (!reasons.length) { return; }
      const level = Math.max(...reasons.map((r) => r.level));
      const signature = reasons.map((r) => r.key + ":" + r.since).sort().join("|");
      const matches = (marker) => marker && marker.level >= level &&
        signature.split("|").every((episode) => marker.signature.split("|").includes(episode));
      const snoozed = matches(saved.snooze) && time(saved.snooze.until) > now;
      const reviewed = matches(saved.reviewed);
      rows.push({ caseId: c.CaseId, account: c.Account, title: c.Title, engineer: c.Engineer || "", priority,
        level, signature, reasons, status: snoozed ? "Snoozed" : reviewed ? "Reviewed" : "Needs review",
        snoozedUntil: snoozed ? saved.snooze.until : null });
    });
    closed.forEach((c) => {
      const end = time(c.ClosureInferredOn || c.ClosedOn);
      if (end === null || now - end > 7 * 86400000) { return; }
      if (c.Status === "Inactive" || c.Status === "Resolved" || !c.Engineer) {
        coverage.push({ caseId: c.CaseId, account: c.Account, title: c.Title,
          kind: c.Status === "Inactive" ? "Closure inferred" : c.Status === "Resolved" ? "Closure not confirmed" : "Closed, owner not visible",
          detail: c.Status === "Inactive" ? "Hidden from the open queue after inactivity, not a confirmed closure. Check the case record."
            : c.Status === "Resolved" ? "Customer agreed to close; an official closure notice is not visible."
              : "A closure notice exists, but no engineer assignment is visible in the available e-mail history." });
      }
    });
    rows.sort((a, b) => b.level - a.level || Math.min(...a.reasons.map((r) => time(r.due))) - Math.min(...b.reasons.map((r) => time(r.due))));
    return { rows, coverage, active: rows.filter((r) => r.status === "Needs review"),
      snoozed: rows.filter((r) => r.status === "Snoozed"), reviewed: rows.filter((r) => r.status === "Reviewed") };
  }
  const api = { defaults, evaluate };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
  else { root.CSCT_ATTENTION = api; }
})(typeof globalThis === "undefined" ? this : globalThis);
