
  // ---- Page: Account 360 ----
  function accountOptions() {
    const query = UX.accountQuery.trim().toLowerCase();
    const accounts = OUT.accounts.filter((x) => x.Title.toLowerCase().includes(query));
    return accounts.length ? accounts.map((x) => {
      const on = x.Title === state.account;
      return '<button class="ali' + (on ? " on" : "") + '" type="button" role="option" aria-selected="' + on +
        '" data-account="' + H(x.Title) + '" title="' + H(x.Title) + '"><span class="nm">' + H(x.Title) +
        '</span><span class="sc">' + ragIco(x.AccountRAG) + "<b>" + x.AccountRiskScore + "</b></span></button>";
    }).join("") : empty("No matching accounts.");
  }
  function pageAcct() {
    const a = acctOut[state.account], ai = acctIn[state.account] || {};
    if (!a) { return { sub: "Select an account to see its risk drivers, cases, customer voice and escalations", body: empty("No accounts yet.") }; }
    const list = card("Accounts", OUT.accounts.length + " accounts" + DOT + "sorted by risk",
      '<input class="inp account-search" type="search" data-account-search placeholder="Find an account" aria-label="Find an account" value="' +
      H(UX.accountQuery) + '"><div class="alist" role="listbox" aria-label="Accounts">' + accountOptions() + "</div>");
    const cases = OUT.cases.filter((c) => c.Account === a.Title);
    const sigs = X.signals.filter((s) => s.Account === a.Title && (!REAL || !isClosedSig(s) || Date.parse(s.ReceivedOn) >= CTX.asOfMs - 30 * 86400000));
    const escs = X.escalations.filter((e) => e.Account === a.Title);
    const closed = X.closed.filter((c) => c.Account === a.Title && Date.parse(historyDate(c) || "") >= CTX.asOfMs - 30 * DAY);
    const confirmedClosed = closed.filter((c) => c.Status === "Closed").length;
    const endDays = ai.ContractEnd ? Math.round((Date.parse(ai.ContractEnd) - CTX.asOfMs) / 86400000) : null;
    const mirp = mirpEffective(ai, CTX.asOfMs), mirpDueMs = mirpDue(ai);
    const mirpDueIso = mirpDueMs === null ? null : new Date(mirpDueMs).toISOString();
    const mirpWho = ai.MIRPConfirmedBy || "the customer administrator";
    const actions = [];
    if (a.AccountRAG === "Red") { actions.push(["PB-11", "Account review with your manager this week: technical, relationship and commercial action plan."]); }
    if (a.PatternAlert) { actions.push(["E9", "Pattern (" + a.PatternAlert + "): request a problem-management review and propose a proactive session."]); }
    if (endDays !== null && endDays <= 90) { actions.push(["Renewal", "Renewal in " + endDays + " days: brief the account team on open risk and the recovery plan."]); }
    if (mirp === "Pending" || mirp === "Not Started") { actions.push(["MIRP", "MIRP not confirmed yet" + (ai.MIRPAsOf ? " (checked " + fmtT(ai.MIRPAsOf, false) + ")" : "") + ": ask the customer administrator to review and confirm it in Engage Center."]); }
    else if (mirp === "Expired") { actions.push(["MIRP", "MIRP confirmation expired " + fmtT(mirpDueIso, false) + ": ask " + mirpWho + " to review and re-confirm it in Engage Center."]); }
    else if (mirpDueMs !== null && mirpDueMs - CTX.asOfMs <= 30 * 86400000) { actions.push(["MIRP", "MIRP confirmation expires " + fmtT(mirpDueIso, false) + ": ask " + mirpWho + " to review and re-confirm before then."]); }
    if (a.OpenComplaints) { actions.push(["PB-07", "Close the loop on " + a.OpenComplaints + " open complaint(s)."]); }
    if (a.OpenRequests) { actions.push(["PB-08", "Route " + a.OpenRequests + " open customer request(s) and confirm an owner and date to the customer."]); }
    cases.filter((c) => c.RiskLevel === "Red").forEach((c) => actions.push([c.PlaybookId, "Red case " + c.CaseId.slice(-4) + ": " + c.RecommendedAction]));
    if (!actions.length) { actions.push(["OK", "No account-level action needed; keep the standard cadence."]); }
    const minis = [[a.OpenCases, "Open"], [confirmedClosed, "Closed in 30 days"], [a.RedCases + a.YellowCases, "On watch / at risk"], [a.ActiveEscalations, "Escalations"]];
    const notSet = '<span class="c3">Not set</span>';
    const profile = [ai.Group, ai.Segment, ai.Industry, ai.StrategicTier, ai.ContractType].filter(Boolean);
    const mapped = !REAL || ai.Source === "Account map";
    const head = '<div class="card"><div class="ahead">' + ring(a.AccountRiskScore, a.AccountRAG) + '<div class="a-info"><div class="sh-kpi">' + riskStatus(a.AccountRAG) + trendText(a.RiskTrend, a.AccountRiskScorePrev) + "</div>" +
      '<div class="a-title">' + H(a.Title) + '</div><div class="c2">' + (profile.length ? profile.map(H).join(DOT) : "Profile not set in the account map") + "</div>" +
      "</div></div>" +
      disclosure("account-profile-" + a.Title, "Account profile", '<div class="a-meta"><span>Contract ends ' + (ai.ContractEnd ? "<b>" + fmt(ai.ContractEnd, false) + "</b> (" + endDays + " days)" : notSet) + "</span>" +
      "<span>MIRP " + (mirp ? "<b>" + H(mirp) + "</b>" + (mirpDueMs !== null
        ? " (" + (ai.MIRPConfirmedBy ? "by " + H(ai.MIRPConfirmedBy) + ", " : "") + fmt(ai.MIRPConfirmedOn, false) + "; review by " + fmt(mirpDueIso, false) + ")"
        : ai.MIRPAsOf ? " (as of " + fmt(ai.MIRPAsOf, false) + ")" : "") : notSet) + "</span>" +
      "<span>CSM concern <b>" + H(ai.CSMConcern || "None") + "</b></span><span>Exec sponsor " + (ai.CustomerExecSponsor ? "<b>" + H(ai.CustomerExecSponsor) + "</b>" : notSet) + "</span>" +
      "<span>Last touchpoint " + (ai.LastTouchpoint ? "<b>" + fmt(ai.LastTouchpoint, false) + "</b>" : '<span class="c3">None found</span>') + "</span><span>Next touchpoint " + (ai.NextTouchpoint ? "<b>" + fmt(ai.NextTouchpoint, false) + "</b>" : '<span class="c3">None scheduled</span>') + "</span></div>" +
      (ai.CSMConcernNote ? '<div class="cap c2" style="margin-top:8px">CSM note: ' + H(ai.CSMConcernNote) + "</div>" : "") +
      (ai.MIRPNote ? '<div class="cap c2" style="margin-top:8px">MIRP note: ' + H(ai.MIRPNote) + "</div>" : "") +
      (mapped ? "" : '<div class="cap c2" style="margin-top:8px">Found in case e-mails but not in the account map. Add it to csct-live-config.json to track MIRP, contract and CSM concern.</div>'),
        "MIRP " + (mirp || "not set") + (ai.ContractType ? DOT + ai.ContractType : "")) +
      '<div class="sec"><div class="mini">' + minis.map((m) => "<div><b>" + m[0] + "</b><span>" + H(m[1]) + "</span></div>").join("") + "</div></div>" +
      disclosure("account-risk-" + a.Title, "Why this score", "<p>" + H(a.RiskDrivers || "No risk drivers.") + "</p>") + "</div>";
    const act = '<div class="lv">' + actions.map((x) => '<div class="lv-i tall wide na"><span class="tag acc">' + H(x[0]) + '</span><div class="lv-t">' + H(x[1]) + "</div></div>").join("") + "</div>";
    const voice = (sigs.length || escs.length) ? '<div class="lv">' + sigs.map((s) => li(sigIco(s.SignalType), H(s.Title), [caseNo(s.CaseId), H(sc(s.SignalType)), H(sc(s.Status)), fromWho(s.CustomerContact, s.CustomerContactMail)].filter(Boolean).join(DOT), { caseId: hasCase(s.CaseId) ? s.CaseId : null })).join("") +
      escs.map((e) => li(ico("arrow_circle_up_regular", "tone-attention"), H(e.Title), caseNo(e.CaseId) + DOT + H(e.Level.split(" - ")[0]) + " escalation" + DOT + H(sc(e.Status)), { caseId: hasCase(e.CaseId) ? e.CaseId : null })).join("") + "</div>" : empty("No signals or escalations.");
    const right = '<div class="stack">' + head +
      card("Open cases", cases.length + " open" + DOT + "select a case for details", cases.length ? queueTable(cases, true, true) : empty("No open cases.")) +
      card("Case history", confirmedClosed + " confirmed closures in 30 days" + DOT + "pending and inferred records are labelled separately",
        closed.length ? closedTable(closed, true) : empty("No recent case history."),
        { cmd: '<button class="btn link" type="button" data-history-account="' + H(a.Title) + '">All history</button>' }) +
      disclosure("account-actions-" + a.Title, "Recommended actions", act, actions.length + " items") +
      disclosure("account-voice-" + a.Title, "Customer voice & escalations", voice, sigs.length + escs.length + " records") + "</div>";
    return { sub: "Account health, open cases and customer context.", body: '<div class="split">' + list + right + "</div>" };
  }

  // ---- Page: Manager brief ----
  function briefModel() {
    const reds = OUT.cases.filter((c) => c.RiskLevel === "Red");
    const acctRed = OUT.accounts.filter((a) => a.AccountRAG === "Red");
    const pend = X.escalations.filter((e) => e.Status === "Pending Manager Approval");
    const bigCand = OUT.candidates.filter((c) => c.Level.indexOf("L1") !== 0 || c.Triggers.indexOf("E6") >= 0);
    const last = TREND[TREND.length - 1], wk = TREND[Math.max(0, TREND.length - 6)];
    const d = (a, b) => (a - b > 0 ? "+" : "") + (a - b);
    const oldest = openSignals.filter((s) => s.SignalType === "Complaint" && s.Status === "New").sort((a, b) => String(a.ReceivedOn).localeCompare(String(b.ReceivedOn)))[0];
    const followUps = MODE !== "snapshot" && AT.ready ? attentionModel().active : [];
    return {
      title: "Customer Success Control Tower daily brief",
      date: fmtT(D.input.asOf, false),
      headline: S.openCases + " open cases across " + openAccounts() + " accounts: " + S.red + " Red, " + S.yellow + " Yellow, " + S.green + " Green. " + S.stalled + " stalled (" + S.stalledMicrosoft + " on the Microsoft side), " + S.slaBreached + " first-response SLA breaches, " + S.candidates + " escalation candidates, " + S.accountsRed + " accounts Red.",
      wow: "Week over week: Red " + d(last.red, wk.red) + ", Yellow " + d(last.yellow, wk.yellow) + ", Stalled " + d(last.stalled, wk.stalled) + ". Turned Red today: " + S.newlyRed.length + ".",
      sections: [
        ...(MODE !== "snapshot" ? [{ title: "Quiet follow-up review (nothing sent)", items: AT.ready
          ? followUps.slice(0, 8).map((r) => r.account + " (" + r.caseId + "): " + r.reasons.map((x) => x.title).join("; ") + ". Review the latest thread before contacting anyone.")
          : ["Follow-up preferences unavailable; open Attention center to retry."] }] : []),
        { title: "Top risks", ordered: true, items: reds.slice(0, 5).map((c) => c.Account + " - " + c.Title + " (case " + c.CaseId + ", " + c.Severity + ", " + c.RiskScore + "/100). Why: " + drv(c).slice(0, 2).map((x) => x.label).join("; ") + ". Next: " + c.RecommendedAction) },
        { title: "Decisions needed from manager", items: pend.map((e) => "Approve " + e.Level.split(" - ")[0] + " escalation for " + e.Account + " (" + e.CaseId + "): " + e.CustomerAsk)
          .concat(bigCand.map((c) => "Review candidate " + c.Account + " (" + c.CaseId + "): " + c.Level + " - " + c.TriggerLabels.split("; ").slice(0, 2).join("; "))) },
        { title: "Accounts at risk", items: acctRed.map((a) => a.Title + " (" + a.AccountRiskScore + "/100, " + a.RiskTrend.toLowerCase() + "): " + a.RiskDrivers.split("; ").slice(0, 3).join("; ")) },
        { title: "Customer voice", items: [S.openComplaints + (S.openComplaints === 1 ? " open complaint, " : " open complaints, ") + S.openRequests + (S.openRequests === 1 ? " open additional request, " : " open additional requests, ") + S.overdueSignals + " past due. Oldest unacknowledged: " + (oldest ? oldest.Account + (oldest.CaseId ? ", case " + oldest.CaseId : "") + " (" + fmtT(oldest.ReceivedOn, false) + ")" : "none") + "."] },
        { title: "Watchlist (Yellow, rising)", items: OUT.cases.filter((c) => c.RiskLevel === "Yellow").slice(0, 4).map((c) => c.Account + " - " + c.Title + " (case " + c.CaseId + ", " + c.RiskScore + "): " + topDriver(c)) }
      ]
    };
  }
  function briefToText(m) {
    const L = [m.title + " - " + m.date, "", "Headline: " + m.headline, m.wow];
    m.sections.forEach((s) => { L.push(""); L.push(s.title); s.items.forEach((it, i) => L.push((s.ordered ? (i + 1) + ". " : "- ") + it)); });
    return L.join("\n");
  }
  function pageBrief() {
    const m = briefModel();
    const last = TREND[TREND.length - 1], wk = TREND[Math.max(0, TREND.length - 6)];
    const delta = (a, b) => { const x = a - b; return x > 0 ? '<span class="delta tone-critical">' + ico("arrow_up_regular") + "<span>" + x + "</span></span>" : x < 0 ? '<span class="delta tone-success">' + ico("arrow_down_regular") + "<span>" + (-x) + "</span></span>" : '<span class="delta c3">' + ico("subtract_regular") + "<span>0</span></span>"; };
    const doc = '<article class="brief"><div class="b-title">' + H(m.title) + '</div><div class="cap c2" style="margin:-8px 0 16px">' + H(m.date) + DOT + ({ live: "live from Outlook, as of " + H(hhmm(D.input.asOf)), snapshot: "snapshot published at " + H(hhmm(D.input.asOf)), demo: "generated by the daily engine at 07:30" }[MODE]) + "</div>" +
      '<p><span class="strong">Headline. </span>' + H(m.headline) + '</p><p class="c2">' + H(m.wow) + "</p>" +
      m.sections.map((s) => "<h3>" + H(s.title) + "</h3>" + (s.items.length ? (s.ordered ? "<ol>" : "<ul>") + s.items.map((it) => "<li>" + H(it) + "</li>").join("") + (s.ordered ? "</ol>" : "</ul>") : '<p class="c2">None.</p>')).join("") + "</article>";
    const wow = card("Week over week", "Today compared with 5 business days ago", '<div class="tw"><table class="tbl wow"><thead><tr><th>Metric</th><th class="r">Today</th><th class="r">5 days ago</th><th class="r">Change</th></tr></thead><tbody>' +
      [["Red cases", last.red, wk.red], ["Yellow cases", last.yellow, wk.yellow], ["Stalled cases", last.stalled, wk.stalled], ["Open cases", last.open, wk.open]].map((r) => "<tr><td>" + r[0] + '</td><td class="r num strong">' + r[1] + '</td><td class="r num c2">' + r[2] + '</td><td class="r">' + delta(r[1], r[2]) + "</td></tr>").join("") + "</tbody></table></div>");
    const rhythmRows = REAL
      ? [["09:00", "Daily Case Summary in Teams: cases opened in the last 24 hours"], ["Every minute", "Live panel re-scores from Outlook while the connector runs on your PC"], [scheduleLabel(D.publishSlots), "Shared snapshot published to OneDrive (8-SharedDashboard) " + scheduleText(D.publishSlots)], ["17:45", "End-of-day review: proposed actions sent to you; nothing is done without your approval"], ["Monthly", "Calibration with your manager: thresholds, weights, false positives"]]
      : [["07:30", "Daily brief lands in Teams (read in 2 minutes, react or reply)"], ["Any time", "Approve or reject escalation cards (F3)"], ["Tue and Thu", "15-minute Control Tower sync: Red accounts, pending escalations"], ["Fri 16:00", "Weekly executive summary email (F4)"], ["Monthly", "Calibration: thresholds, weights, false positives"]];
    const rhythm = card(REAL ? "Operating rhythm" : "Manager operating rhythm", REAL ? "What runs automatically today" : "Target: under 10 minutes a day", '<div class="rhythm">' + rhythmRows.map((x) => '<div class="w">' + H(x[0]) + "</div><div>" + H(x[1]) + "</div>").join("") + "</div>");
    return {
      sub: "Portfolio summary and decisions to review. Copying does not send it.",
      cmds: '<button class="btn accent" type="button" data-copy="brief">' + ico("copy_regular") + "<span>Copy brief</span></button>",
      body: '<div class="row">' + card("Today's brief", "", doc) + '</div><div class="row">' +
        disclosure("brief-comparison", "Week over week", wow) + '</div><div class="row">' +
        disclosure("brief-rhythm", "Operating rhythm", rhythm) + "</div>"
    };
  }

  // ---- Page: Risk model (simulator runs the production engine) ----
  function bizBack(n) {
    let day = CTX.asOfDay, k = 0;
    while (k < n) { day--; if (csctIsBizDay(day, CTX)) { k++; } }
    return new Date(day * 86400000 - TZMS + 12 * 3600000).toISOString();
  }
  function daysBack(n, hour) { return new Date((CTX.asOfDay - n) * 86400000 - TZMS + (hour || 9) * 3600000).toISOString(); }
  const SIM = { sev: "Sev B", ball: "Microsoft", days: 12, msIdle: 4, custIdle: 0, visible: true, owner: true, fr: "ontime", na: false, eta: false, sent: "Frustrated", complaint: false, chasers: 2, req: false, escreq: false, exec: false, impact: "Medium", owners: 1, reopen: 0, raised: false, concern: "None", renewal: false, crit: false, critEnded: false, redY: false, prev: 40 };
  function simulate() {
    const created = daysBack(Math.max(SIM.days, SIM.fr === "none" ? 1 : 0), 9);
    const cIn = {
      CaseId: "SIM", Title: "Simulated case", Account: "Sim", Severity: SIM.sev, Status: "In Progress", BallInCourt: SIM.ball,
      Engineer: SIM.owner ? "Sim Engineer" : "(unassigned)", ProductFamily: "Sim", CreatedOn: created,
      FirstResponseOn: SIM.fr === "none" ? null : new Date(Date.parse(created) + (SIM.fr === "late" ? 5 * 86400000 : 0.2 * 3600000)).toISOString(),
      LastMicrosoftUpdate: SIM.visible ? bizBack((SIM.ball === "Customer" || SIM.ball === "Partner" ? SIM.custIdle : SIM.msIdle) + 1) : null,
      LastCustomerUpdate: null, LastActivity: bizBack(SIM.msIdle + 1),
      OwnershipChanges: SIM.owners, ReopenCount: SIM.reopen, CustomerChasers: SIM.chasers, CustomerSentiment: SIM.sent, BusinessImpact: SIM.impact, ExecVisibility: SIM.exec,
      NextActionDue: SIM.na ? daysBack(1) : null, ResolutionETA: SIM.eta ? daysBack(1) : null, CritSitActive: SIM.crit, CritSitEndedOn: SIM.critEnded ? daysBack(2) : null,
      SeverityChangedOn: SIM.raised ? daysBack(2) : null, SeverityChangeDir: SIM.raised ? "Raised" : null, RiskScore: SIM.prev, RedSince: SIM.redY ? daysBack(1) : null
    };
    const sigs = [];
    if (SIM.complaint) { sigs.push({ Account: "Sim", CaseId: "SIM", SignalType: "Complaint", Status: "New", Category: "Response time", DueDate: null }); }
    if (SIM.req) { sigs.push({ Account: "Sim", CaseId: "SIM", SignalType: "Additional Request", Status: "New", Category: null, DueDate: daysBack(1) }); }
    if (SIM.escreq) { sigs.push({ Account: "Sim", CaseId: "SIM", SignalType: "Escalation Request", Status: "New", Category: null, DueDate: null }); }
    const acct = { Title: "Sim", CSMConcern: SIM.concern, ContractEnd: SIM.renewal ? daysBack(-30) : daysBack(-400), MIRPStatus: "Approved", AccountRiskScore: null };
    return csctScoreCase(cIn, acct, sigs, CTX);
  }
  function factorBars(c) {
    const f = [["Severity", c.PtsSeverity, 35], ["Momentum", c.PtsMomentum, 30], ["Age", c.PtsAge, 20], ["SLA", c.PtsSLA, 15], ["Voice", c.PtsVoice, 20], ["Exposure", c.PtsExposure, 15]];
    return '<div class="fb">' + f.map((x) => "<span>" + x[0] + '</span><span class="bt"><i style="width:' + (100 * x[1] / x[2]) + '%"></i></span><span class="fv">' + x[1] + " / " + x[2] + "</span>").join("") + "</div>";
  }
  const driversList = (c) => (c.Drivers.length ? '<ul class="drivers">' + c.Drivers.map((d) => "<li><span>" + H(d.label) + "</span><span>+" + d.pts + "</span></li>").join("") + "</ul>" : '<div class="c2">No risk drivers.</div>');
  const ruleText = (ids) => ids.split("; ").map((o) => o + " " + (CSCT_RULE_LABELS[o] || "")).join(", ");
  function simResult() {
    const r = simulate();
    const band = "Score band " + r.ScoreBand + (r.Overrides ? DOT + "override " + r.Overrides : "") + (r.Floors ? DOT + "floor " + r.Floors : "");
    return '<div class="ch"><div><h2>Result</h2><p>Recalculated on every change</p></div></div>' +
      '<div class="simtop"><span class="big">' + r.RiskScore + "</span>" + status(r.RiskLevel) + '<span class="cap c2">' + H(band) + "</span></div>" +
      '<div class="sh-sec"><h3>Score factors</h3>' + factorBars(r) + "</div>" +
      '<div class="sh-sec"><h3>Drivers</h3>' + driversList(r) + "</div>" +
      '<div class="sh-sec"><h3>Stall, SLA and escalation</h3><div class="facts"><div><div class="fk">Stall</div><div class="fv">' + H(r.StallType) + '</div></div><div><div class="fk">SLA</div><div class="fv">' + H(sc(r.SLAStatus)) + "</div></div>" +
      '<div><div class="fk">Triggers</div><div class="fv">' + tags(r.EscalationTriggers, true) + '</div></div><div><div class="fk">Suggested level</div><div class="fv">' + (r.EscalationTriggers ? H(r.SuggestedLevel) : "No escalation trigger") + "</div></div></div></div>" +
      '<div class="ib" style="margin-top:20px">' + ico("info_filled") + "<div><b>" + H(r.PlaybookId) + "</b>" + H(r.RecommendedAction) + "</div></div>";
  }
  function pageModel() {
    const sel = (k, opts) => '<select class="inp" data-sim="' + k + '">' + opts.map((o) => "<option" + (String(SIM[k]) === String(o[0]) ? " selected" : "") + ' value="' + o[0] + '">' + o[1] + "</option>").join("") + "</select>";
    const num = (k, min, max) => '<input class="inp" type="number" min="' + min + '" max="' + max + '" data-sim="' + k + '" value="' + SIM[k] + '">';
    const cb = (k, label) => '<label class="cb"><input type="checkbox" data-sim="' + k + '"' + (SIM[k] ? " checked" : "") + "><span>" + label + "</span></label>";
    const fld = (label, ctl) => '<label class="field"><span>' + label + "</span>" + ctl + "</label>";
    const o = (a) => a.map((x) => [x, x]);
    const form = '<div class="form">' +
      fld("Severity", sel("sev", o(["Sev 1", "Sev A", "Sev B", "Sev C"]))) + fld("Ball in court", sel("ball", o(["Microsoft", "Customer", "Product Group", "Partner", "Unknown"]))) + fld("Days open", num("days", 0, 120)) +
      fld("Business days since Microsoft update", num("msIdle", 0, 40)) + fld("Business days customer silent", num("custIdle", 0, 40)) + fld("First response", sel("fr", [["ontime", "On time"], ["late", "Late"], ["none", "None yet (past SLA)"]])) +
      fld("Customer sentiment", sel("sent", o(["Positive", "Neutral", "Frustrated", "Angry"]))) + fld("Customer chasers", num("chasers", 0, 10)) + fld("Business impact", sel("impact", o(["Low", "Medium", "High", "Critical"]))) +
      fld("Ownership changes", num("owners", 0, 10)) + fld("Times reopened", num("reopen", 0, 5)) + fld("Account CSM concern", sel("concern", o(["None", "Watch", "Concern", "Critical"]))) +
      "</div>" + '<div class="checks">' + cb("visible", "Correspondence visible") + cb("owner", "Engineer assigned") + cb("na", "Next action overdue") + cb("eta", "ETA missed") + cb("complaint", "Open complaint") + cb("req", "Request overdue") +
      cb("escreq", "Customer asked to escalate") + cb("exec", "Exec visibility") + cb("raised", "Severity raised (7 days)") + cb("renewal", "Contract ends within 90 days") + cb("crit", "CritSit active") + cb("critEnded", "CritSit ended within 7 days") + "</div>" +
      '<div class="form hist">' + fld("Previous score (yesterday)", num("prev", 0, 100)) + '<div class="field"><span>Yesterday</span>' + cb("redY", "Was Red yesterday") + "</div></div>";
    const tbl = (rows, heads) => '<div class="tw"><table class="tbl rules"><thead><tr>' + heads.map((x) => "<th>" + x + "</th>").join("") + "</tr></thead><tbody>" + rows.map((r) => "<tr>" + r.map((x) => "<td>" + H(x) + "</td>").join("") + "</tr>").join("") + "</tbody></table></div>";
    const simulator = '<div class="row r21">' + card("Risk simulator", "Try a scenario without changing real cases", form) + '<div class="card simres" id="simres">' + simResult() + "</div></div>";
    const rules =
      '<div class="row r11">' + card("Score factors (0 to 100)", "Green below 30, Yellow from 30, Red from 60; " + (REAL ? "weights are part of the engine settings" : "all weights live in CSCT Config"), tbl(RULES.factors.map((f) => [f[1], f[2], String(f[3])]), ["Factor", "Points", "Cap"])) +
      card("Overrides and floors", "Hard rules that beat the score", tbl(RULES.overrides, ["Rule", "Effect", "Condition"])) + "</div>" +
      '<div class="row r11">' + card("Stalled case detection", "Business days, Europe/Istanbul calendar with holidays", tbl(RULES.stall.map((r) => [r[0] + " " + r[1], r[2], r[3]]), ["Rule", "Condition", "Action"])) +
      card("Escalation triggers", "Fired triggers create an escalation candidate", tbl(RULES.triggers.map((r) => [r[0], r[1], r[2]]), ["ID", "Condition", "Level"])) + "</div>" +
      '<div class="row">' + card("Playbooks", "Recommended workflow attached to every case", tbl(RULES.playbooks.map((r) => [r[0] + " " + r[1], r[2], r[3]]), ["Playbook", "When", "Steps"])) + "</div>";
    const about = "<p>Cases come from support notifications and case e-mail threads in your Outlook. People, last replies and timelines reflect only the messages you receive. Status and customer signals are inferred from those messages; confirm in the case record before acting.</p>" +
      "<p>Closed means a support closure/archive notice exists. Customer agreement and inactivity are not confirmed closures. MIRP comes from Engage Center. Open cases alone are scored for current risk.</p>" +
      "<p>The live connector checks mail every minute while this PC is on. The shared copy has a separate publication schedule. Nothing in the dashboard sends e-mail, Teams messages or escalations automatically.</p>";
    return { sub: "Preferences, data sources and scoring rules. Advanced tools stay out of the daily flow.",
      body: (MODE !== "snapshot" ? '<div class="row">' + attentionBanner() + disclosure("followup-policy", "Follow-up thresholds", attentionSettings(),
        "Operational targets, not SLA") + "</div>" : "") +
      '<div class="row">' + disclosure("data-sources", "About the data", about) + "</div>" +
      '<div class="row">' + disclosure("risk-rules", "Risk rules & playbooks", rules) + "</div>" +
      '<div class="row">' + disclosure("risk-simulator", "Risk simulator", simulator, "Advanced") + "</div>" +
      (MODE !== "snapshot" ? '<div class="row">' + disclosure("review-export", "Copy a follow-up summary",
        '<p class="c2">Plain text for your own review. Copying never sends it.</p><button class="btn" type="button" data-copy="attention">Copy summary</button>') + "</div>" : "") };
  }

  // ---- Case sheet and escalation pack ----
  function escPack(c) {
    const ci = caseIn[c.CaseId] || {};
    const cand = candByCase[c.CaseId];
    const ev = (evByCase[c.CaseId] || []).map((e) => "  - " + fmtT(e.EventTime) + " | " + e.EventType + " | " + e.Detail).join("\n");
    const level = cand ? cand.Level : c.SuggestedLevel || "L1 - Engineer's manager / Technical Advisor";
    const ask = level.indexOf("L2") === 0 ? "Duty manager engagement today, a named senior engineer and an agreed update cadence (Sev A: every 4h; Sev B: daily)."
      : level.indexOf("L3") === 0 ? "Critical Situation engagement, 24x7 effort and executive update cadence."
      : level.indexOf("L4") === 0 ? "Executive alignment between Microsoft and customer sponsors, plus a committed recovery plan."
      : "Written action plan and ETA from the engineer's manager / Technical Advisor within 1 business day.";
    return "Escalation request - " + c.Account + " - Case " + c.CaseId + " (" + c.Severity + ")\n" +
      "Title: " + c.Title + "\nSuggested level: " + level + "\nTriggers: " + (cand ? cand.TriggerLabels : c.EscalationTriggers) + "\n" +
      "Risk: " + c.RiskLevel + " (" + c.RiskScore + "/100) - " + drv(c).slice(0, 3).map((d) => d.label).join("; ") + "\n\n" +
      "1. Business impact: " + (ci.BusinessImpact ? ci.BusinessImpact + " impact" : "Not assessed yet") + (ci.ExecVisibility ? "; customer executives are following the case" : "") + ". [CSM: users / processes / revenue affected]\n" +
      "2. Current status: " + c.Status + "; ball with " + c.BallInCourt + "; engineer " + (ci.Engineer || "-") + (ci.EngineerMail ? " <" + ci.EngineerMail + ">" : "") + "; last Microsoft update " + fmt(ci.LastMicrosoftUpdate).replace(/&mdash;/g, "none visible") + " (" + c.MsIdleBD + " business days)\n" +
      "3. Timeline:\n" + (ev || "  - (no events)") + "\n" +
      "4. What has been tried: [Copilot: summarize engineer updates from the case thread]\n" +
      "5. Ask: " + ask + "\n" +
      "6. Customer contacts and availability: " + ((ci.CustomerContacts || []).length ? ci.CustomerContacts.map((n) => n + ((ci.ContactMails || {})[n] ? " <" + ci.ContactMails[n] + ">" : "")).join(", ") + " [role, phone, hours]" : "[name, role, phone, hours]") + "\n" +
      "7. Customer exec awareness: " + (ci.ExecVisibility ? "Yes" : "No / unknown") + "\n" +
      "8. Manager approval: " + (REAL ? "pending" : "pending (Teams approval card)") + "\n";
  }
  const closeBtn = '<button class="btn subtle icon" type="button" data-close="1" aria-label="Close" title="Close">' + ico("dismiss_regular") + "</button>";
  const fact = (k, v) => '<div><div class="fk">' + k + '</div><div class="fv">' + v + "</div></div>";
  // First-response deadline with the engine's rules: Sev 1/A around the clock, Sev B/C in business hours on business days.
  function firstResponseDue(ci) {
    const created = Date.parse(ci.CreatedOn || ""), k = csctSevKey(ci.Severity), h = csctSevCfg(CTX, "SLA_FirstResponse_Hours_", k);
    if (isNaN(created) || !h) { return null; }
    const allDay = k === "1" || k === "A", rule = ci.Severity + ": " + h + (allDay ? " hours" : " business hours");
    if (allDay) { return { ms: created + h * HOUR, rule: rule }; }
    const bs = CTX.cfg.BusinessHours_Start, be = CTX.cfg.BusinessHours_End;
    let left = h * HOUR;
    for (let day = csctLocalDay(created, CTX.tz), n = 0; n < 60; day++, n++) {
      if (!csctIsBizDay(day, CTX)) { continue; }
      const mid = day * DAY - CTX.tz * HOUR, s = Math.max(mid + bs * HOUR, created), e = mid + be * HOUR;
      if (e <= s) { continue; }
      if (e - s >= left) { return { ms: s + left, rule: rule }; }
      left -= e - s;
    }
    return null;
  }
  function showSheet(label, headHtml, bodyHtml, footHtml) {
    if (!drawer.classList.contains("on")) { UX.returnFocus = document.activeElement; }
    drawer.innerHTML = '<div class="sh-top"><div class="sh-h">' + headHtml + closeBtn + '</div><div class="sh-b" id="sheetBody">' + bodyHtml + '</div></div><div class="sh-f">' + footHtml + "</div>";
    drawer.setAttribute("aria-label", label);
    drawer.classList.add("on"); scrim.classList.add("on"); drawer.setAttribute("aria-hidden", "false");
    root.inert = true;
    $("sheetBody").scrollTop = 0;
    const first = drawer.querySelector(".sh-f .btn") || drawer.querySelector("[data-close]"); if (first) { first.focus({ preventScroll: true }); }
  }
  function openCase(id) {
    const c = caseOut[id];
    if (!c) { if (closedIn[id]) { openClosedCase(id); } return; }
    hideSug();
    const ci = caseIn[id] || {};
    drawer.dataset.attentionCase = id; drawer.dataset.view = "case";
    const esc = escOpenByCase[id];
    const live = REAL;
    const sevText = H(c.Severity) + (live && !ci.SeverityKnown ? ' <span class="c2">(assumed; not in notifications)</span>' : "");
    // Awaiting the first response: show when it is due instead of an empty value.
    const due = live && ci.SLAMeasurable && !ci.FirstResponseOn ? firstResponseDue(ci) : null;
    const dueIso = due === null ? null : new Date(due.ms).toISOString(), frLate = due !== null && due.ms <= CTX.asOfMs;
    const frText = live && !ci.SLAMeasurable ? '<span class="c2">Not measurable (' + (ci.CreatedEstimated ? "no creation notice" : "severity unknown") + ")</span>"
      : due !== null ? 'Not yet<div class="fm">' + (frLate ? '<span class="tone-critical">Overdue since ' + fmt(dueIso) + "</span>" : "Due " + fmt(dueIso)) + "</div>" : fmt(ci.FirstResponseOn);
    // Only automatic notices so far: say so, so empty values do not read as missing data.
    let notice = "";
    if (live && !ci.LastMicrosoftUpdate && !ci.LastCustomerUpdate && !ci.CreatedEstimated) {
      const dueLine = due === null ? "" : frLate ? " The first response was due " + fmtT(dueIso) + " (" + due.rule + ") and is overdue." : " The first response is due " + fmtT(dueIso) + " (" + due.rule + ").";
      const t = ci.Engineer
        ? ["No case e-mail yet", ci.Engineer + " accepted the case, but no e-mail from the engineer or the customer has arrived so far. If they are already in touch, ask the engineer to copy the account team." + dueLine]
        : ["No engineer on the case yet", "So far only Microsoft's automatic notices have arrived (case created " + fmtT(ci.CreatedOn) + "). The ownership notice that names the engineer usually arrives within minutes of creation; none has arrived yet." + dueLine];
      notice = '<div class="ib' + (frLate ? " caution" : "") + '" style="margin-bottom:16px">' + ico(frLate ? "warning_filled" : "info_filled") + "<div><b>" + H(t[0]) + "</b>" + H(t[1]) + "</div></div>";
    }
    const noneYet = '<span class="c3">None yet</span>';
    const head = '<div><div class="sh-kpi">' + riskStatus(c.RiskLevel) + '<span class="cap c2">' + H(c.Severity) + "</span></div><h2>" + H(c.Title) + '</h2><div class="sh-meta">' +
      caseNo(id) + DOT + H(c.Account) + "</div></div>";
    const people = casePeople(ci);
    const facts = '<div class="facts">' + fact("Status", H(sc(c.Status))) + fact("Ball in court", H(c.BallInCourt)) +
      fact("Engineer", ci.Engineer ? people.engineer + '<div class="fm">' + (ci.OwnershipChanges || 0) + " ownership change" + ((ci.OwnershipChanges || 0) === 1 ? "" : "s") + "</div>"
        : '<span class="c3">Not assigned</span>' + (live ? '<div class="fm">No ownership notice yet</div>' : "")) + fact("Customer contact", people.customers) +
      fact("Case number", caseNo(c.CaseId)) + fact("Days open", c.DaysOpen) +
      fact("Created", fmt(ci.CreatedOn) + (live && ci.CreatedEstimated ? ' <span class="c2">(from case number)</span>' : "")) + fact("First response", frText) +
      fact("Last Microsoft update", ci.LastMicrosoftUpdate || !live ? fmt(ci.LastMicrosoftUpdate) : noneYet) + fact("Last customer update", ci.LastCustomerUpdate || !live ? fmt(ci.LastCustomerUpdate) : noneYet) +
      fact("Idle", c.BizDaysIdle + " business days (" + H(c.IdleSide) + " side)") + fact("SLA", slaCell(c.SLAStatus)) + fact("Stall", H(c.StallType)) + fact("Sentiment", H(ci.CustomerSentiment) + (ci.ExecVisibility ? ' <span class="c2">(exec visibility)</span>' : "")) +
      fact("Next action", H(ci.NextAction || "Not set")) + fact(live ? "Severity" : "Next action due", live ? sevText : fmt(ci.NextActionDue, false)) + "</div>";
    const essential = '<div class="facts">' + fact("Status", H(sc(c.Status))) + fact("Next step", H(ci.NextAction || c.RecommendedAction)) +
      fact("Engineer", people.engineer) + fact("Last update", fmt(ci.LastMicrosoftUpdate || ci.LastActivity)) + "</div>";
    let b = '<div class="sh-sec">' + notice + essential + '</div><div class="sh-sec">' +
      disclosure("case-facts-" + id, "Case information", facts, "Contacts, dates and service") + "</div>";
    if (MODE !== "snapshot") {
      const followup = attentionModel().rows.find((r) => r.caseId === id);
      b += '<div class="sh-sec">' + (followup ? '<button class="btn" type="button" data-followup="' + H(id) +
        '">Review follow-up</button>' : disclosure("case-priority-" + id, "Follow-up options", attentionControls(id),
        "No automatic messages")) + "</div>";
    }
    b += '<div class="sh-sec">' + disclosure("case-score-" + id, "Score breakdown", factorBars(c) + driversList(c) +
      (c.Overrides || c.Floors ? '<div class="cap c2" style="margin-top:8px">' + (c.Overrides ? "Overrides: " + H(ruleText(c.Overrides)) : "") + (c.Overrides && c.Floors ? DOT : "") + (c.Floors ? "Floors: " + H(ruleText(c.Floors)) : "") + "</div>" : "")) + "</div>";
    b += '<div class="sh-sec">' + disclosure("case-workflow-" + id, "Recommended workflow", "<p>" + H(c.RecommendedAction) + "</p>",
      c.PlaybookId) + "</div>";
    if (c.EscalationTriggers) {
      b += '<div class="sh-sec"><h3>Escalation</h3><div class="lvl-list">' + c.EscalationTriggers.split("; ").map((t) => lvl(t, CSCT_RULE_LABELS[t] || "")).join("") + "</div>" +
        '<div style="margin-top:12px">' + levelCell(c.SuggestedLevel) + "</div>" +
        (esc ? '<div class="ib" style="margin-top:12px">' + ico("info_filled") + "<div><b>Existing escalation</b>" + H(esc.Id) + DOT + H(sc(esc.Status)) + DOT + "readiness " + esc.ReadinessPct + "%</div></div>" : "") + "</div>";
    }
    b += caseSignalsSection(id) + caseTimelineSection(id);
    b += '<div class="sh-sec">' + disclosure("case-prompts-" + id, "Copilot prompts", '<pre class="code">Summarize TrackingID#' + H(id) + " from my email in the last 14 days: timeline, what Microsoft tried, open customer asks, and sentiment.\n\nDraft a proactive customer update for case " + H(id) + " (" + H(c.Account) + ") in the customer's language: status, next step, owner and ETA. Keep it under 120 words.</pre>") + "</div>";
    const foot = (c.EscalationTriggers && !esc ? '<button class="btn accent" type="button" data-pack="' + H(id) + '">' + ico("arrow_circle_up_regular") + "<span>Build escalation pack</span></button>" : "") +
      caseSourceButton(ci.CaseLink, "Open case record") + caseSourceButton(ci.LastMailLink, "Open latest e-mail") + '<button class="btn" type="button" data-close="1">Close</button>';
    showSheet("Case " + id, head, b, foot);
  }
  function openPack(id) {
    const c = caseOut[id]; if (!c) { return; }
    state.packId = id;
    delete drawer.dataset.attentionCase;
    const head = '<div><span class="tag acc">Escalation pack</span><h2>' + H(c.Account) + DOT + H(c.Title) + '</h2><div class="sh-meta"><span>' + (REAL
      ? "Draft generated from the case data and timeline. Fill in the bracketed parts, or ask Scout to draft them from the case thread; nothing is submitted without your approval."
      : "Draft generated from the case register and timeline. Copilot fills the bracketed parts from the case email thread; the manager approves in Teams before anything is submitted.") + "</span></div></div>";
    const foot = '<button class="btn accent" type="button" data-copy="pack">' + ico("copy_regular") + '<span>Copy pack</span></button><button class="btn" type="button" data-case="' + H(id) + '">' + ico("arrow_left_regular") + "<span>Back to case</span></button>";
    showSheet("Escalation pack " + id, head, '<div class="sh-sec"><pre class="code" id="packtext">' + H(escPack(c)) + "</pre></div>", foot);
  }
  function closeDrawer() {
    const wasOpen = drawer.classList.contains("on");
    drawer.classList.remove("on"); scrim.classList.remove("on"); drawer.setAttribute("aria-hidden", "true"); root.inert = false;
    if (wasOpen) {
      const target = UX.returnFocus && UX.returnFocus.isConnected ? UX.returnFocus : navEl.querySelector(".nav-item.on");
      if (target) { target.focus({ preventScroll: true }); }
      UX.returnFocus = null;
    }
  }

  // ---- Render loop ----
  const RENDER = { tower: pageTower, queue: pageQueue, closed: pageClosed, attention: pageAttention, esc: pageEsc, voice: pageVoice, acct: pageAcct, brief: pageBrief, model: pageModel };
  let ro = null, roRaf = 0;
  function render(animate) {
    renderNav();
    if (!OUT) { return; }
    const pageTop = scroller.scrollTop;
    const atBottom = pageTop > 0 && scroller.scrollHeight - scroller.clientHeight - pageTop < 2;
    // Account 360 rebuilds its list on every render; keep the list where it was.
    const prevList = app.querySelector(".split .alist"), listTop = prevList ? prevList.scrollTop : 0;
    const prevAccount = prevList && prevList.querySelector(".ali.on");
    const selectedBefore = prevAccount ? prevAccount.getAttribute("data-account") : null;
    const p = PAGES.filter((x) => x.id === state.tab)[0];
    const out = RENDER[state.tab]();
    ph.innerHTML = '<div class="ph-in"><div class="ph-tx"><h1>' + H(p.label) + "</h1>" + (out.sub ? "<p>" + H(out.sub) + "</p>" : "") + "</div>" + (out.cmds ? '<div class="ph-cmds">' + out.cmds + "</div>" : "") + "</div>";
    app.innerHTML = out.body + '<div class="foot"><span>' + ({
      live: "Live Outlook data",
      snapshot: "Shared snapshot" + DOT + fmtT(D.input.asOf),
      demo: "Fictional demo data"
    }[MODE]) + '</span><button class="btn link" type="button" data-about-data>About the data</button></div>';
    if (animate) { app.classList.remove("enter"); void app.offsetWidth; app.classList.add("enter"); }
    scroller.style.setProperty("--ph-h", ph.offsetHeight + "px");
    const newList = app.querySelector(".split .alist");
    if (newList) {
      newList.scrollTop = listTop;
      const on = newList.querySelector(".ali.on");
      if (on && on.getAttribute("data-account") !== selectedBefore && newList.scrollHeight > newList.clientHeight + 1) {
        const r = on.getBoundingClientRect(), box = newList.getBoundingClientRect();
        if (r.top < box.top || r.bottom > box.bottom) { newList.scrollTop += r.top - box.top - (box.height - r.height) / 2; }
      }
    }
    if (ro) { ro.disconnect(); }
    const el = $("trendChart");
    if (el) {
      if (window.ResizeObserver) {
        ro = ro || new ResizeObserver(() => { cancelAnimationFrame(roRaf); roRaf = requestAnimationFrame(drawTrend); });
        ro.observe(el);
      } else { drawTrend(); }
    }
    scroller.scrollTop = atBottom ? scroller.scrollHeight - scroller.clientHeight : pageTop;
  }
  function go(tab) {
     if (tab === "attention" && MODE === "snapshot") { return; }
    const changed = state.tab !== tab;
    state.tab = tab; closeDrawer(); hideSug();
    render(changed); scroller.scrollTop = 0;
    try { history.replaceState(null, "", location.pathname + location.search + "#" + tab); } catch (err) { /* file or sandboxed preview */ }
  }
  function doCopy(btn) {
    const kind = btn.getAttribute("data-copy");
    const txt = kind === "pack" ? escPack(caseOut[state.packId]) : kind === "attention" ? attentionDigest()
      : kind === "attention-draft" ? $("attentionDraftText").textContent : briefToText(briefModel());
    const orig = btn.innerHTML;
    const done = () => { btn.innerHTML = ico("checkmark_regular") + "<span>Copied</span>"; setTimeout(() => { btn.innerHTML = orig; }, 1500); };
    const fallback = () => { const ta = document.createElement("textarea"); ta.value = txt; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); try { if (document.execCommand("copy")) { done(); } } catch (err) { /* ignore */ } ta.remove(); };
    try { navigator.clipboard.writeText(txt).then(done, fallback); } catch (err) { fallback(); }
  }

  document.addEventListener("click", (e) => {
    const t = e.target;
    document.querySelectorAll(".command-menu[open]").forEach((menu) => {
      if (!menu.contains(t) || t.closest("[data-attention-action]")) { menu.open = false; }
    });
    if (t.closest("[data-close]") || t === scrim) { closeDrawer(); return; }
    const lv = t.closest("[data-live]"); if (lv) { liveAction(lv.getAttribute("data-live")); return; }
    if (!OUT) { const tb = t.closest("[data-tab]"); if (tb) { state.tab = tb.getAttribute("data-tab"); renderNav(); } return; }
    const pack = t.closest("[data-pack]"); if (pack) { e.stopPropagation(); openPack(pack.getAttribute("data-pack")); return; }
    const cp = t.closest("[data-copy]"); if (cp) { doCopy(cp); return; }
    if (t.closest("[data-clear-search]")) { search.value = ""; state.q = ""; render(false); return; }
    if (t.closest("[data-about-data]")) { UX.expanded["data-sources"] = true; go("model"); return; }
    if (t.closest("[data-history-reset]")) { resetHistoryFilters(); search.value = ""; state.q = ""; render(false); return; }
    const historyAccount = t.closest("[data-history-account]");
    if (historyAccount) { resetHistoryFilters("all", historyAccount.getAttribute("data-history-account")); search.value = ""; state.q = ""; go("closed"); return; }
    const cs = t.closest("[data-case]"); if (cs) { openCase(cs.getAttribute("data-case")); return; }
    const tab = t.closest("[data-tab]"); if (tab) { go(tab.getAttribute("data-tab")); return; }
    const g = t.closest("[data-goto]"); if (g) { if (g.getAttribute("data-filter")) { state.filter = g.getAttribute("data-filter"); } go(g.getAttribute("data-goto")); return; }
    const fl = t.closest("[data-filter]"); if (fl) { state.filter = fl.getAttribute("data-filter"); render(false); return; }
    const ac = t.closest("[data-account]");
    if (ac) {
      const same = state.tab === "acct", inList = !!ac.closest(".split .alist");
      state.account = ac.getAttribute("data-account");
      if (!same) { go("acct"); return; }
      const keep = scroller.scrollTop;
      render(false);
      // Side by side the list stays put and the new account's details start at the top; stacked, bring the details into view under the list.
      const det = inList ? app.querySelector(".split > .stack") : null;
      if (det && det.getBoundingClientRect().left < app.querySelector(".split").getBoundingClientRect().left + 24) {
        scroller.scrollTop = keep + det.getBoundingClientRect().top - scroller.getBoundingClientRect().top - ph.offsetHeight - 12;
      } else { scroller.scrollTop = 0; }
      const sel = app.querySelector('.ali.on'); if (sel && inList) { sel.focus({ preventScroll: true }); }
      return;
    }
  });
  asbList.addEventListener("mousedown", (e) => { const s = e.target.closest("[data-sug]"); e.preventDefault(); if (s) { pickSug(Number(s.getAttribute("data-sug"))); } });
  search.addEventListener("input", () => { state.q = search.value; if (!OUT) { return; } if (["queue", "attention", "closed"].includes(state.tab)) { render(false); } else { showSug(); } });
  document.addEventListener("input", (e) => {
    if (!e.target.matches("[data-account-search]")) { return; }
    UX.accountQuery = e.target.value;
    app.querySelector(".alist").innerHTML = accountOptions();
  });
  document.addEventListener("toggle", (e) => {
    const id = e.target.getAttribute && e.target.getAttribute("data-disclosure");
    if (id) { UX.expanded[id] = e.target.open; }
    if (e.target.matches && e.target.matches(".command-menu[open]")) {
      document.querySelectorAll(".command-menu[open]").forEach((menu) => { if (menu !== e.target) { menu.open = false; } });
    }
  }, true);
  search.addEventListener("focus", () => { if (OUT && state.q.trim()) { showSug(); } });
  search.addEventListener("blur", () => { setTimeout(hideSug, 120); });
  search.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" && sugItems.length) { e.preventDefault(); sugIdx = (sugIdx + 1) % sugItems.length; markSug(); }
    else if (e.key === "ArrowUp" && sugItems.length) { e.preventDefault(); sugIdx = (sugIdx - 1 + sugItems.length) % sugItems.length; markSug(); }
    else if (e.key === "Enter") {
      e.preventDefault();
      if (sugIdx >= 0) { pickSug(sugIdx); }
      else if (state.q.trim() && !["queue", "closed"].includes(state.tab)) {
        const q = state.q.trim().toLowerCase();
        if (!OUT.cases.some((c) => hay(c).includes(q)) && X.closed.some((c) => hay(c).includes(q))) { resetHistoryFilters("all"); go("closed"); }
        else { state.filter = "all"; go("queue"); }
      }
    }
    else if (e.key === "Escape") { if (!asbList.hidden) { hideSug(); } else if (search.value) { search.value = ""; state.q = ""; if (["queue", "attention", "closed"].includes(state.tab)) { render(false); } } }
  });
  document.addEventListener("keydown", (e) => {
    if (drawer.classList.contains("on") && e.key === "Tab") {
      const items = [...drawer.querySelectorAll("button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), summary, textarea")].filter((el) => el.getClientRects().length);
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      return;
    }
    if (e.key === "Escape" && document.querySelector(".command-menu[open]")) {
      const menu = document.querySelector(".command-menu[open]"); menu.open = false; menu.querySelector("summary").focus(); return;
    }
    if (e.key === "Escape" && drawer.classList.contains("on")) { closeDrawer(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k" && !drawer.classList.contains("on")) { e.preventDefault(); search.focus(); return; }
    if (e.target.matches(".sel, .ali, .view-tab") && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) {
      const items = [...e.target.parentElement.querySelectorAll(e.target.matches(".ali") ? ".ali" : e.target.matches(".view-tab") ? ".view-tab" : ".sel")];
      const index = items.indexOf(e.target), step = e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 1;
      const next = e.key === "Home" ? items[0] : e.key === "End" ? items[items.length - 1] : items[(index + step + items.length) % items.length];
      e.preventDefault();
      if (next.matches(".ali")) { next.focus(); }
      else {
        const selector = next.hasAttribute("data-goto") ? '.view-switch [data-goto="' + next.dataset.goto + '"]'
          : next.hasAttribute("data-filter") ? '[data-filter="' + next.dataset.filter + '"]' : '[data-attention-filter="' + next.dataset.attentionFilter + '"]';
        next.click(); app.querySelector(selector).focus();
      }
      return;
    }
    if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches("tr[data-case], .lv-i[data-case]")) { e.preventDefault(); openCase(e.target.getAttribute("data-case")); }
  });
  document.addEventListener("change", (e) => {
    const historyKey = e.target.getAttribute("data-history-filter");
    if (historyKey && ["closedStatus", "closedAccount", "closedPeriod"].includes(historyKey)) {
      state[historyKey] = e.target.value; render(false);
      app.querySelector('[data-history-filter="' + historyKey + '"]').focus(); return;
    }
    if (e.target.matches("[data-queue-filter]")) {
      state.filter = e.target.value; render(false);
      app.querySelector("[data-queue-filter]").focus(); return;
    }
    const k = e.target.getAttribute && e.target.getAttribute("data-sim");
    if (!k) { return; }
    SIM[k] = e.target.type === "checkbox" ? e.target.checked : (e.target.type === "number" ? Number(e.target.value) : e.target.value);
    $("simres").innerHTML = simResult();
  });
  scroller.addEventListener("scroll", () => { ph.classList.toggle("scrolled", scroller.scrollTop > 0); }, { passive: true });
  window.addEventListener("resize", () => { if (state.pane === "auto") { applyPane(); } hideSug(); scroller.style.setProperty("--ph-h", ph.offsetHeight + "px"); });
  window.addEventListener("hashchange", () => { const t = (location.hash || "").replace("#", ""); if (RENDER[t] && t !== state.tab) { go(t); } });

  const themeBtn = $("themeToggle");
  const setThemeIcon = () => {
    const dark = html.getAttribute("data-theme") === "dark";
    themeBtn.innerHTML = ico(dark ? "weather_sunny_regular" : "weather_moon_regular");
    themeBtn.title = dark ? "Switch to light theme" : "Switch to dark theme"; themeBtn.setAttribute("aria-label", themeBtn.title);
  };
  themeBtn.addEventListener("click", () => { html.setAttribute("data-theme", html.getAttribute("data-theme") === "dark" ? "light" : "dark"); setThemeIcon(); });
  $("paneToggle").innerHTML = ico("navigation_regular");
  $("paneToggle").addEventListener("click", () => { state.pane = root.classList.contains("compact") ? "open" : "closed"; applyPane(); });
  $("asbIco").innerHTML = ico("search_regular");
  $("tbSub").textContent = { live: "Live from Outlook", snapshot: "Shared snapshot", demo: "Synthetic demo data" }[MODE];
  $("asof").hidden = MODE === "live";
  setThemeIcon(); applyPane();
  const hashTab = (location.hash || "").replace("#", "");
  if (RENDER[hashTab] && (hashTab !== "attention" || MODE !== "snapshot")) { state.tab = hashTab; }
  if (DEMO) {
    AT.ready = true;
    ingest(runLive(DEMO, Date.parse(DEMO.sampleAsOf)));
    window.csctFindings = findings;
    $("asof").textContent = "As of " + fmtT(D.input.asOf);
    $("asof").title = "Engine run " + fmtT(D.input.asOf) + " (Europe/Istanbul)";
    render(false);
  } else { bootData(); }
})();
