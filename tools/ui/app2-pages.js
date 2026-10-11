
  // ---- Charts ----
  function donut() {
    const segs = [["Red", S.red], ["Yellow", S.yellow], ["Green", S.green]];
    const tot = S.red + S.yellow + S.green, r = 64, C = 2 * Math.PI * r, gap = tot > 1 ? 3 : 0;
    let off = 0, arcs = "";
    segs.forEach((p) => {
      if (!p[1]) { return; }
      const len = C * p[1] / tot, vis = Math.max(0.5, len - gap);
      arcs += '<circle class="' + cls(p[0]) + '" cx="84" cy="84" r="' + r + '" stroke-dasharray="' + vis.toFixed(2) + " " + (C - vis).toFixed(2) + '" stroke-dashoffset="' + (-off).toFixed(2) + '"/>';
      off += len;
    });
    const legend = '<div class="legend grid">' + segs.map((p) => '<span><span class="st">' + ragIco(p[0]) + "<span>" + p[0] + '</span></span><span class="lg-v"><b>' + p[1] + '</b><span class="c3">' + (tot ? Math.round(100 * p[1] / tot) : 0) + "%</span></span></span>").join("") + "</div>";
    return '<div class="donut" role="img" aria-label="' + S.red + " Red, " + S.yellow + " Yellow, " + S.green + ' Green"><svg viewBox="0 0 168 168"><circle class="trk" cx="84" cy="84" r="' + r + '"/>' + arcs +
      '</svg><div class="ctr"><span class="stat-v">' + tot + '</span><span class="cap c2">open cases</span></div></div>' + legend;
  }
  function drawTrend() {
    const el = $("trendChart"); if (!el) { return; }
    const W = Math.floor(el.clientWidth), HH = Math.floor(el.clientHeight);
    if (W < 80 || HH < 80) { return; }
    const P = { l: 40, r: 24, t: 12, b: 32 }, n = TREND.length;
    if (n < 2) { el.innerHTML = empty("Not enough history for a trend yet."); return; }
    const maxData = Math.max.apply(null, TREND.map((t) => Math.max(t.red, t.yellow, t.stalled)));
    const step = maxData <= 10 ? 2 : maxData <= 25 ? 5 : 10;
    const maxV = Math.ceil((maxData + 1) / step) * step;
    const x = (i) => P.l + (W - P.l - P.r) * i / (n - 1);
    const y = (v) => P.t + (HH - P.t - P.b) * (1 - v / maxV);
    let g = "";
    for (let v = 0; v <= maxV; v += step) {
      g += '<line class="gl" x1="' + P.l + '" x2="' + (W - P.r) + '" y1="' + y(v).toFixed(1) + '" y2="' + y(v).toFixed(1) + '"/><text x="' + (P.l - 12) + '" y="' + (y(v) + 4).toFixed(1) + '" text-anchor="end">' + v + "</text>";
    }
    const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor((W - P.l - P.r) / 72))));
    for (let i = 0; i < n; i++) {
      const isLast = i === n - 1;
      if ((i % every === 0 && n - 1 - i >= every) || isLast) {
        g += '<text x="' + x(i).toFixed(1) + '" y="' + (HH - 8) + '" text-anchor="middle">' + H(TREND[i].label) + "</text>";
      }
    }
    const line = (k) => '<polyline class="ln ' + k + '" points="' + TREND.map((t, i) => x(i).toFixed(1) + "," + y(t[k]).toFixed(1)).join(" ") + '"/>';
    const dots = (i) => ["stalled", "yellow", "red"].map((k) => '<circle class="dot ' + k + '" r="4" cx="' + x(i).toFixed(1) + '" cy="' + y(TREND[i][k]).toFixed(1) + '"/>').join("");
    el.innerHTML = '<svg width="' + W + '" height="' + HH + '" aria-hidden="true">' + g + line("stalled") + line("yellow") + line("red") +
      '<g id="trendHover"></g><g id="trendLast">' + dots(n - 1) + '</g><rect x="' + P.l + '" y="' + P.t + '" width="' + (W - P.l - P.r) + '" height="' + (HH - P.t - P.b) + '" fill="transparent" id="trendHit"/></svg><div class="tip" id="trendTip" hidden></div>';
    const hit = $("trendHit"), hov = $("trendHover"), last = $("trendLast"), tip = $("trendTip");
    hit.addEventListener("mousemove", (ev) => {
      const bx = hit.getBoundingClientRect();
      const i = Math.max(0, Math.min(n - 1, Math.round((ev.clientX - bx.left) / bx.width * (n - 1))));
      const t = TREND[i];
      hov.innerHTML = '<line class="guide" x1="' + x(i).toFixed(1) + '" x2="' + x(i).toFixed(1) + '" y1="' + P.t + '" y2="' + (HH - P.b) + '"/>' + dots(i);
      last.style.display = "none";
      tip.innerHTML = '<div class="th">' + H(t.label) + "</div>" + [["red", "Red", t.red], ["yellow", "Yellow", t.yellow], ["stalled", "Stalled", t.stalled]].map((r) => '<div class="tr"><i class="dotc ' + r[0] + '"></i><span>' + r[1] + '</span><b class="num">' + r[2] + "</b></div>").join("");
      tip.hidden = false;
      const tw = tip.offsetWidth, left = x(i) + 16 + tw > W ? x(i) - 16 - tw : x(i) + 16;
      tip.style.left = left + "px"; tip.style.top = P.t + "px";
    });
    hit.addEventListener("mouseleave", () => { hov.innerHTML = ""; last.style.display = ""; tip.hidden = true; });
  }
  const gauge = (v, l) => {
    const pt = (p, rr) => { const a = Math.PI * (1 - p / 100); return [100 + rr * Math.cos(a), 100 - rr * Math.sin(a)]; };
    const arc = (p0, p1) => { const a = pt(p0, 80), b = pt(p1, 80); return "M" + a[0].toFixed(2) + " " + a[1].toFixed(2) + " A80 80 0 0 1 " + b[0].toFixed(2) + " " + b[1].toFixed(2); };
    const ticks = [30, 60].map((p) => { const a = pt(p, 72), b = pt(p, 88); return '<line class="tick" x1="' + a[0].toFixed(2) + '" y1="' + a[1].toFixed(2) + '" x2="' + b[0].toFixed(2) + '" y2="' + b[1].toFixed(2) + '"/>'; }).join("");
    return '<div class="gauge" role="img" aria-label="Account risk score ' + v + ' of 100"><svg viewBox="0 0 200 116"><path class="trk" d="' + arc(0, 100) + '"/><path class="' + cls(l) + '" d="' + arc(0, Math.max(0.5, Math.min(100, v))) + '"/>' + ticks +
      '</svg><div class="gv"><b>' + v + "</b><span>of 100</span></div></div>";
  };
  const ring = (v, l) => {
    const r = 20, C = 2 * Math.PI * r, len = C * Math.max(0, Math.min(100, v)) / 100;
    return '<div class="ring"><svg viewBox="0 0 48 48" aria-hidden="true"><circle class="trk" cx="24" cy="24" r="' + r + '"/><circle class="' + cls(l) + '" cx="24" cy="24" r="' + r + '" stroke-linecap="round" stroke-dasharray="' + len.toFixed(2) + " " + C.toFixed(2) + '"/></svg><b>' + v + "</b></div>";
  };

  function queueTable(rows, compact, hideAcct) {
    let h = '<div class="tw"><table class="tbl case-table' + (compact ? " compact" : "") +
      '"><thead><tr><th>Case</th><th>Status</th><th>Next step</th>' + (compact ? "" : "<th>Last activity</th>") + "</tr></thead><tbody>";
    rows.forEach((c) => {
      const ci = caseIn[c.CaseId] || {};
      h += '<tr class="click" data-case="' + H(c.CaseId) + '" tabindex="0"><td>' + caseCell(c, hideAcct) + '</td><td><div class="two">' +
        riskStatus(c.RiskLevel) + '<span class="l2">' + H(c.Severity) + DOT + H(sc(c.Status)) +
        '</span></div></td><td><div class="two next-summary"><span>' + H(ci.NextAction || c.RecommendedAction) +
        '</span><span class="l2">' + H(ci.NextActionOwner || c.BallInCourt) + '</span></div></td>' +
        (compact ? "" : '<td class="case-activity"><div class="two"><span>' + fmt(ci.LastActivity, false) +
          '</span><span class="l2">' + c.DaysOpen + " days open</span></div></td>") + "</tr>";
    });
    return h + "</tbody></table></div>";
  }

  // ---- Page: Control tower ----
  function pageTower() {
    const nAcc = OUT.accounts.length, confirmed = X.closed.filter((c) => c.Status === "Closed").length;
    const followups = MODE !== "snapshot" && AT.ready ? attentionModel().active : [];
    const kp = [
      { icon: "clipboard_task_regular", tone: "neutral", label: "Open cases", value: S.openCases, sub: S.green + " on track", go: "queue", filter: "all" },
      { icon: "clock_regular", tone: "caution", label: MODE !== "snapshot" ? "Follow-up" : "Needs attention",
        value: MODE !== "snapshot" ? AT.ready ? followups.length : "&mdash;" : S.red + S.yellow,
        sub: MODE !== "snapshot" ? "Waiting for an update" : "At risk or on watch", go: MODE !== "snapshot" ? "attention" : "queue" },
      { icon: "checkmark_circle_regular", tone: "success", label: "Closed cases", value: confirmed, sub: "Confirmed in mailbox", go: "closed" },
      { icon: "building_multiple_regular", tone: "neutral", label: "Accounts", value: nAcc, sub: openAccounts() + " with open cases", go: "acct" }
    ];
    let h = '<div class="stats overview-stats">' + kp.map(stat).join("") + "</div>";
    const top = OUT.cases.filter((c) => c.RiskLevel !== "Green" || followups.some((r) => r.caseId === c.CaseId)).slice(0, 6);
    h += '<div class="row">' + card("Needs a closer look", "Waiting updates and cases on watch",
      top.length ? queueTable(top, true) : empty("Everything is on track."),
      { cmd: '<button class="btn link" type="button" data-goto="queue" data-filter="all">All cases ' + ico("chevron_right_regular") + "</button>" }) + "</div>";
    // Live data lists every mapped account; the grid shows the ones that need a look, rows centered.
    const shown = REAL ? OUT.accounts.filter((a) => a.OpenCases || a.AccountRAG !== "Green" || a.OpenComplaints || a.OpenRequests || a.ActiveEscalations) : OUT.accounts;
    const accounts = shown.map((a) => '<button class="data-row" type="button" data-account="' + H(a.Title) + '">' +
      ico("building_regular", "tone-neutral") + '<span class="row-main"><span class="row-title">' + H(a.Title) +
      '</span><span class="row-meta">' + a.OpenCases + " open" + DOT + a.ActiveEscalations + ' escalations</span></span><span class="row-aside">' +
      riskStatus(a.AccountRAG) + "</span>" + ico("chevron_right_regular", "row-chevron") + "</button>");
    const since = CTX.asOfMs - 24 * 3600000;
    const newCases = X.cases.filter((c) => Date.parse(c.CreatedOn) >= since);
    const newSig = X.signals.filter((s) => s.ReceivedOn && Date.parse(s.ReceivedOn) >= since && s.SignalType !== "Praise");
    const closed = X.closed.filter((c) => c.Status === "Closed" && Date.parse(c.ClosedOn) >= CTX.asOfMs - 48 * 3600000);
    const more = (arr, k, label) => (arr.length > k ? '<div class="lv-more">+' + (arr.length - k) + " more " + label + "</div>" : "");
    let ch = '<div class="lv">';
    S.newlyRed.forEach((id) => { const c = caseOut[id]; ch += li(ragIco("Red"), H(c.Account) + DOT + H(c.Title), caseNo(id) + DOT + "Turned Red" + DOT + H(topDriver(c)), { caseId: id }); });
    newCases.slice(0, 3).forEach((c) => { ch += li(ico("add_circle_regular", "tone-attention"), H(c.Account) + DOT + H(c.Title), caseNo(c.CaseId) + DOT + "New case" + DOT + H(c.Severity), { caseId: c.CaseId }); });
    ch += more(newCases, 3, "new cases");
    newSig.slice(0, 3).forEach((s) => { ch += li(sigIco(s.SignalType), H(s.Account) + DOT + H(s.Title), [caseNo(s.CaseId), "New " + H(s.SignalType.toLowerCase()), fromWho(s.CustomerContact, s.CustomerContactMail)].filter(Boolean).join(DOT), { quote: s.Verbatim && s.Verbatim.length > 120 ? s.Verbatim.slice(0, 117) + "..." : s.Verbatim }); });
    ch += more(newSig, 3, "new signals in Customer voice");
    closed.forEach((c) => { ch += li(historyIcon(c), H(c.Account) + DOT + H(c.Title), caseNo(c.CaseId) + DOT + H(historyLabel(c)) + DOT + H(c.Resolution), { caseId: c.CaseId }); });
    ch += "</div>";
    if (ch === '<div class="lv"></div>') { ch = empty("No changes in the last 24 hours."); }
    const accountBody = accounts.length ? '<div class="data-list">' + accounts.slice(0, 5).join("") + "</div>" +
      (accounts.length > 5 ? disclosure("more-account-health", "More accounts", '<div class="data-list">' + accounts.slice(5).join("") + "</div>", (accounts.length - 5) + " accounts") : "") : empty("No accounts need attention.");
    h += '<div class="row r11">' + card("Account health", "", accountBody,
      { cmd: '<button class="btn link" type="button" data-goto="acct">All accounts</button>' }) +
      card("Recent activity", "New cases, customer signals and confirmed closures", ch) + "</div>";
    const chart = '<div class="row r21 chart-row">' + card("Risk trend", TREND.length + " business days",
      '<div class="chart" id="trendChart" role="img" aria-label="Case risk trend"></div><div class="legend"><span class="red">At risk</span><span class="yellow">Watch</span><span class="stalled">Stalled</span></div>') +
      card("Risk distribution", "", '<div class="distribution">' + donut() + "</div>") + "</div>";
    h += '<div class="row">' + disclosure("portfolio-trend", "Portfolio trends", chart,
      S.red + " at risk" + DOT + S.yellow + " watch" + DOT + S.green + " on track") + "</div>";
    return { sub: "Your portfolio at a glance. " + S.red + " at risk, " + S.yellow + " on watch.", body: h };
  }

  // ---- Page: Action queue ----
  const FILTERS = [["all", "All open"], ["red", "At risk"], ["yellow", "Watch"], ["green", "On track"], ["stalled", "Stalled"], ["sla", "SLA risk"], ["cand", "Escalation review"], ["sev", "Sev 1 / A"], ["voice", "Customer voice"], ["blind", "Incomplete visibility"]];
  function match(c, f) {
    switch (f) {
      case "red": return c.RiskLevel === "Red";
      case "yellow": return c.RiskLevel === "Yellow";
      case "green": return c.RiskLevel === "Green";
      case "stalled": return c.IsStalled;
      case "sla": return c.SLAStatus === "Breached" || c.SLAStatus === "At Risk";
      case "cand": return !!c.EscalationTriggers;
      case "sev": return c.Severity === "Sev 1" || c.Severity === "Sev A";
      case "voice": return c.ComplaintOpen || c.RequestOpen || c.CustomerEscalationRequest;
      case "blind": return c.PlaybookId === "PB-13";
      default: return true;
    }
  }
  function pageQueue() {
    const rows = queueRows(), q = state.q.trim();
    const picker = '<label class="inline-field">Show<select class="inp" data-queue-filter aria-label="Case view">' +
      FILTERS.map((f) => '<option value="' + f[0] + '"' + (state.filter === f[0] ? " selected" : "") + ">" +
        H(f[1]) + " (" + OUT.cases.filter((c) => match(c, f[0])).length + ")</option>").join("") + "</select></label>";
    const toolbar = '<div class="list-toolbar">' + picker + '<span class="cap c2">' + rows.length + " cases" +
      (q ? DOT + "matching " + H(q) : "") + "</span></div>";
    const body = caseViews() + '<div class="card">' + toolbar + (rows.length ? queueTable(rows, false) : empty("No matching open cases.")) + "</div>";
    return { sub: "Open and closed cases, with status and the next step.", body };
  }

  // ---- Page: Escalations ----
  const READY = [["RdyImpact", "Business impact"], ["RdyTimeline", "Timeline"], ["RdyTechStatus", "Technical status"], ["RdyAsk", "Specific ask"], ["RdyContacts", "Contacts"], ["RdyExecAware", "Exec awareness"], ["RdyMgrApproval", "Manager approval"]];
  function pageEsc() {
    const cnt = (sts) => X.escalations.filter((e) => sts.indexOf(e.Status) >= 0).length;
    const recentClosed = X.escalations.filter((e) => ["Closed", "De-escalated"].indexOf(e.Status) >= 0 && e.ClosedOn && Date.parse(e.ClosedOn) >= CTX.asOfMs - 30 * 86400000).length;
    const steps = [["Candidates", OUT.candidates.length, "Proposed by the engine"], ["Pending approval", cnt(["Pending Manager Approval"]), "Manager decides in Teams"], ["Approved or submitted", cnt(["Approved", "Submitted"]), "Routed to Microsoft"], ["Active", cnt(["Active"]), "Engaged and tracked"], ["Closed in 30 days", recentClosed, "Closed or de-escalated"]];
    // Real data: only engine proposals and Microsoft-raised critical situations are observable, so no approval stages.
    const realSteps = [["Escalation candidates", OUT.candidates.length, "Proposed by the engine; you decide"], ["Active critical situations", cnt(["Active"]), "Raised by Microsoft Support"], ["Closed in 30 days", recentClosed, "Critical situations ended"]];
    let h = '<div class="row">' + (REAL
      ? card("Escalation overview", "Engine proposals and critical situations on your cases", '<div class="funnel f3">' + realSteps.map((s) => '<div class="fstep"><span class="v">' + s[1] + '</span><span>' + H(s[0]) + '</span><span class="l">' + H(s[2]) + "</span></div>").join("") + "</div>")
      : card("Escalation funnel", "Every step from engine proposal to de-escalation is tracked",
        '<div class="funnel">' + steps.map((s, i) => (i ? '<span class="fchev">' + ico("chevron_right_regular") + "</span>" : "") + '<div class="fstep"><span class="v">' + s[1] + '</span><span>' + H(s[0]) + '</span><span class="l">' + H(s[2]) + "</span></div>").join("") + "</div>")) + "</div>";
    const candRows = OUT.candidates.map((c) => '<tr class="click" data-case="' + H(c.CaseId) + '" tabindex="0"><td>' + riskCell(c) + "</td><td>" + caseCell(c) + '</td><td><span class="tags">' +
      c.Triggers.split("; ").map((t) => '<span class="tag acc" title="' + H(t + " " + (CSCT_RULE_LABELS[t] || "")) + '">' + H(t) + "</span>").join("") + "</span></td><td>" + levelShort(c.Level) + '</td><td class="r"><button class="btn" type="button" data-pack="' + H(c.CaseId) + '">Build pack</button></td></tr>').join("");
    const levels = [["L1", "Engineer's manager or Technical Advisor", "Reply on the case thread asking for manager engagement; request a written action plan and ETA."],
      ["L2", "Support escalation", "Duty manager; outside business hours for Sev B/C use 24x7 Case Management (24x7casemanagement@microsoft.com)."],
      ["L3", "Critical Situation Management", "Business-critical outage: raise severity via the local support number (aka.ms/premierhotline)."],
      ["L4", "Executive alignment", "Manager and Microsoft executive sponsor align with the customer sponsor; runs in parallel to L1 to L3."]];
    h += '<div class="row">' + card("Cases to review", "Proposed by the risk engine. Nothing is escalated automatically.",
      OUT.candidates.length ? '<div class="tw"><table class="tbl cand"><thead><tr><th>Risk</th><th>Case</th><th>Triggers</th><th>Suggested level</th><th class="r">Action</th></tr></thead><tbody>' + candRows + "</tbody></table></div>" : empty("No escalation candidates today.")) +
      "</div><div class=\"row\">" + disclosure("escalation-channels", "Escalation channels", '<div class="lv">' + levels.map((l) => '<div class="lv-i tall na"><span class="tag acc">' + l[0] + '</span><div class="lv-t"><div class="strong">' + H(l[1]) + '</div><div class="lv-s">' + H(l[2]) + "</div></div></div>").join("") + "</div>") + "</div>";
    const reg = X.escalations.map((e) => {
      const auto = e.ReadinessPct === null || e.ReadinessPct === undefined;
      const missing = READY.filter((r) => !e[r[0]]).map((r) => r[1]);
      const ready = auto ? '<div class="two"><span>Automatic</span><span class="l2">Raised by Microsoft Support; no pack needed</span></div>'
        : '<div class="two">' + '<span class="score wide"><b>' + e.ReadinessPct + '%</b><span class="pb"><i style="width:' + Math.max(4, e.ReadinessPct) + '%"></i></span></span><span class="l2">' + (missing.length ? "Missing: " + H(missing.join(", ")) : "All " + READY.length + " items ready") + "</span></div>";
      const when = auto ? (e.ClosedOn ? "Ended " + fmt(e.ClosedOn) : "Engaged, still active") : e.HoursToEngage !== null && e.HoursToEngage !== undefined ? "Engaged in " + e.HoursToEngage + " h" : "Not engaged yet";
      return "<tr" + (hasCase(e.CaseId) ? ' class="click" data-case="' + H(e.CaseId) + '" tabindex="0"' : "") + '><td><span class="tag acc">' + H(e.Level.split(" - ")[0]) + '</span></td><td><div class="two w-case"><span class="ellip" title="' + H(e.Title) + '">' + H(e.Title) + '</span><span class="l2">' + H(e.Account) + DOT + '<span class="mono">' + H(e.CaseId) + "</span></span></div></td><td>" + escStatus(e.Status) + "</td>" +
        "<td>" + ready + "</td>" +
        '<td><div class="two nw"><span>' + fmt(e.ProposedOn) + '</span><span class="l2">' + when + "</span></div></td>" +
        '<td><div class="two w-ask"><span>' + H(e.CustomerAsk) + "</span>" + (e.Outcome ? '<span class="l2">Outcome: ' + H(e.Outcome) + "</span>" : "") + "</div></td></tr>";
    }).join("");
    h += '<div class="row">' + disclosure("escalation-register", "Escalation history",
      reg ? '<div class="tw"><table class="tbl reg"><thead><tr><th>Level</th><th>Escalation</th><th>Status</th><th>Readiness</th><th>Proposed</th><th>Customer ask and outcome</th></tr></thead><tbody>' + reg + "</tbody></table></div>" : empty("No escalations in the available history."),
      X.escalations.length + " records") + "</div>";
    return { sub: "Candidates and critical situations. Escalation requires your approval.", body: h };
  }

  // ---- Page: Customer voice ----
  function pageVoice() {
    const n = (t) => openSignals.filter((s) => s.SignalType === t).length;
    const odT = (t) => openSignals.filter((s) => s.SignalType === t && overdue(s.DueDate)).length;
    const od = openSignals.filter((s) => overdue(s.DueDate)).length;
    const kp = [
      { icon: "person_feedback_regular", tone: "neutral", label: "Complaints", value: n("Complaint"), sub: odT("Complaint") + " overdue" },
      { icon: "document_text_regular", tone: "neutral", label: "Requests", value: n("Additional Request"), sub: odT("Additional Request") + " overdue" },
      { icon: "alert_urgent_regular", tone: "neutral", label: "Escalation requests", value: n("Escalation Request"), sub: "Customer asked to escalate" },
      { icon: "timer_regular", tone: "caution", label: "Overdue", value: od, sub: "Needs review" }
    ];
    const cat = {}; openSignals.forEach((s) => { const k = s.Category || s.RequestType || "Other"; cat[k] = (cat[k] || 0) + 1; });
    const catKeys = Object.keys(cat).sort((a, b) => cat[b] - cat[a] || a.localeCompare(b));
    const row = (s) => {
      const od2 = overdue(s.DueDate), click = s.CaseId && hasCase(s.CaseId);
      const meta = [s.CaseId ? caseNo(s.CaseId) + (closedIn[s.CaseId] ? " (" + H(historyLabel(closedIn[s.CaseId])) + ")" : "") : "",
        H(s.Category || s.RequestType || ""), "Received " + fmt(s.ReceivedOn, false)].filter(Boolean);
      if (s.DueDate) { meta.push('<span class="' + (od2 ? "tone-critical" : "") + '">Due ' + fmt(s.DueDate, false) + (od2 ? " (overdue)" : "") + "</span>"); }
      return li(sigIco(s.SignalType), H(s.Account) + DOT + H(s.Title), meta.join(DOT), { quote: s.Verbatim, caseId: click ? s.CaseId : null, aside: '<span class="tag' + (od2 ? " crit" : "") + '">' + H(sc(s.Status)) + "</span>" });
    };
    const sec = (t) => openSignals.filter((s) => s.SignalType === t).sort((a, b) => String(a.DueDate).localeCompare(String(b.DueDate)));
    const list = (arr) => (arr.length ? '<div class="lv">' + arr.map(row).join("") + "</div>" : empty("Nothing open."));
    let h = '<div class="stats overview-stats">' + kp.map(stat).join("") + "</div>";
    const how = REAL
      ? "The connector checks every customer e-mail in a TrackingID thread with bilingual keyword rules (English and Turkish). A signal is New until Microsoft or the account team replies, then In progress; it resolves when the case closes or after 14 quiet days. Nothing is sent to the customer."
      : "Every customer email in a case thread is checked with bilingual keyword rules (English and Turkish, editable in CSCT Config) plus an optional AI Builder classifier. Detections land as New for CSM triage; nothing is sent to the customer automatically.";
    h += '<div class="row r21">' + card("Complaints and escalation requests", "Acknowledge within 1 business day (PB-07); escalation requests force the case Red (R4)", list(sec("Escalation Request").concat(sec("Complaint")))) +
      card("Themes", "Open signals by category or request type", (catKeys.length ? bars(catKeys.map((k) => [k, cat[k]]), Math.max.apply(null, Object.values(cat).concat([1]))) : empty("No open signals.")) +
        disclosure("voice-detection", "How detection works", "<p>" + H(how) + "</p>")) + "</div>";
    h += '<div class="row r11">' + card("Additional customer requests", "RCAs, SME calls, documentation and workshops (PB-08)", list(sec("Additional Request"))) +
      card("Account-level concerns", REAL ? "Set as CSM concern in the account map; e-mail rules do not raise them" : "Raised in meetings or observed by the CSM; they feed the account score", list(sec("Account Concern"))) + "</div>";
    return { sub: "Complaints, escalation requests, additional requests and account concerns detected in case email threads", body: h };
  }
