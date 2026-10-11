
  const historyDate = (c) => c.Status === "Inactive" ? c.ClosureInferredOn || c.ClosedOn : c.ClosedOn;
  const historyLabel = (c) => c.Status === "Closed" ? c.ClosureKind === "archived" ? "Archived" : "Closed"
    : c.Status === "Resolved" ? "Closure pending" : c.Status === "Inactive" ? "Inactive (inferred)" : c.Status || "Unknown";
  const historyIcon = (c) => ico(c.Status === "Closed" ? "checkmark_circle_regular" : "info_filled",
    c.Status === "Closed" ? "tone-success" : "tone-neutral");
  const historyStatus = (c) => '<span class="st">' + historyIcon(c) + "<span>" + H(historyLabel(c)) + "</span></span>";
  function resetHistoryFilters(status, account) {
    state.closedStatus = status || "Closed"; state.closedAccount = account || ""; state.closedPeriod = "all";
  }
  function closedRows() {
    const q = state.q.trim().toLowerCase(), days = Number(state.closedPeriod);
    const cutoff = state.closedPeriod === "all" ? null : CTX.asOfMs - days * DAY;
    return X.closed.filter((c) => (state.closedStatus === "all" || c.Status === state.closedStatus) &&
      (!state.closedAccount || c.Account === state.closedAccount) &&
      (cutoff === null || Date.parse(historyDate(c) || "") >= cutoff) && (!q || hay(c).includes(q)))
      .slice().sort((a, b) => String(historyDate(b) || "").localeCompare(String(historyDate(a) || "")) || a.CaseId.localeCompare(b.CaseId));
  }
  function closedTable(rows, accountView) {
    return '<div class="tw"><table class="tbl history' + (accountView ? " account-history" : "") +
      '"><thead><tr><th>Case</th><th>Status</th><th>Closed / recorded</th>' +
      (accountView ? "" : "<th>Engineer</th><th>Closure outcome</th>") + "</tr></thead><tbody>" +
      rows.map((c) => '<tr class="click" data-case="' + H(c.CaseId) + '" tabindex="0"><td>' + caseCell(c, accountView) +
        "</td><td>" + historyStatus(c) + '</td><td><div class="two"><span>' + fmt(historyDate(c), false) +
        '</span><span class="l2">' + (c.Status === "Closed" ? "Notification received" : c.Status === "Resolved" ? "Customer agreed to close" : "Inactivity threshold reached") +
        "</span></div></td>" + (accountView ? "" : '<td><div class="two"><span>' + H(c.Engineer || "Not visible") +
        '</span><span class="l2">' + H(c.Severity || "Not set") + '</span></div></td><td><div class="two history-outcome">' +
        H(c.Resolution || "No outcome in the available history") + "</div></td>") + "</tr>").join("") + "</tbody></table></div>";
  }
  function pageClosed() {
    const rows = closedRows(), confirmed = X.closed.filter((c) => c.Status === "Closed").length;
    const accounts = [...new Set(X.closed.map((c) => c.Account))].sort((a, b) => a.localeCompare(b));
    const choose = (name, label, options, selected) => "<label>" + H(label) + '<select class="inp" data-history-filter="' + name +
      '" aria-label="' + H(label) + '">' + options.map((o) => '<option value="' + H(o[0]) + '"' +
        (selected === o[0] ? " selected" : "") + ">" + H(o[1]) + "</option>").join("") + "</select></label>";
    const filters = '<div class="history-filters">' + choose("closedStatus", "Status",
      [["Closed", "Closed / archived (" + confirmed + ")"], ["Resolved", "Closure pending"], ["Inactive", "Inactive (inferred)"], ["all", "All history"]],
      state.closedStatus) + choose("closedAccount", "Account", [["", "All accounts"]].concat(accounts.map((a) => [a, a])), state.closedAccount) +
      choose("closedPeriod", "Period", [["all", "All available history"], ["7", "Last 7 days"], ["30", "Last 30 days"], ["90", "Last 90 days"]],
        state.closedPeriod) + "</div>";
    const more = '<div class="list-toolbar"><span class="cap c2">' + rows.length + " cases" +
      (state.q.trim() ? DOT + "matching " + H(state.q.trim()) : "") + '</span><button class="btn subtle" type="button" data-history-reset>Reset</button></div>';
    return { sub: "Open and closed cases, with status and the next step.",
      body: caseViews() + '<div class="card">' + disclosure("history-filters", "Filter history", filters,
        state.closedStatus === "Closed" && !state.closedAccount && state.closedPeriod === "all" ? "Confirmed closures" : "Filters applied") + more +
        (rows.length ? closedTable(rows) : empty("No matching records.")) + "</div>" +
        '<p class="cap c2">Pending closure and inactivity are separate from confirmed closure. The timeline shows the available e-mail history.</p>' };
  }
  function casePeople(ci) {
    const mailLine = (addr) => addr ? '<div class="fm">' + (MODE === "live" ? '<a href="mailto:' + H(addr) + '">' + H(addr) + "</a>" : H(addr)) + "</div>" : "";
    const mailsShown = MODE === "live" || !!(SNAP && SNAP.contactEmailsIncluded);
    const engMail = ci.EngineerMail ? mailLine(ci.EngineerMail) : ci.Engineer && mailsShown ? '<div class="fm">' +
      (ci.EngineerWrote ? "No personal address in their e-mails" : "No e-mail from them yet") + "</div>" : "";
    const contacts = ci.CustomerContacts || [], cmails = ci.ContactMails || {};
    return {
      engineer: ci.Engineer ? H(ci.Engineer) + engMail : '<span class="c3">Not visible in available history</span>',
      customers: contacts.length ? contacts.map((n) => '<div class="fp">' + H(n) + mailLine(cmails[n]) + "</div>").join("")
        : '<span class="c3">' + (REAL ? "No customer e-mail visible" : "Not recorded") + "</span>"
    };
  }
  function caseSignalsSection(id) {
    const sigs = X.signals.filter((s) => s.CaseId === id);
    return sigs.length ? '<div class="sh-sec"><h3>Customer voice</h3><div class="lv">' +
      sigs.map((s) => li(sigIco(s.SignalType), H(sc(s.SignalType)), H(sc(s.Status)) +
        (s.ReceivedOn ? DOT + "received " + fmt(s.ReceivedOn) : "") +
        (s.CustomerContact ? DOT + fromWho(s.CustomerContact, s.CustomerContactMail) : ""), { quote: s.Verbatim })).join("") + "</div></div>" : "";
  }
  function caseTimelineSection(id) {
    const events = (evByCase[id] || []).slice().sort((a, b) => String(b.EventTime).localeCompare(String(a.EventTime)));
    const side = (t) => t === "Customer Update" ? "cust" : ["Microsoft Update", "Ownership Change", "Account Team"].includes(t) ? "ms" : "sys";
    const eventRows = (list) => '<div class="tl">' + list.map((e) => '<div class="ev ' + side(e.EventType) + '"><div class="ev-h"><b>' + H(e.EventType) +
        "</b><span>" + fmt(e.EventTime) + DOT + H(e.Actor) + "</span>" +
        (e.Link ? '<a href="' + H(e.Link) + '" target="_blank" rel="noopener noreferrer">Open e-mail</a>' : "") +
        "</div><div>" + H(e.Detail) + "</div></div>").join("") + "</div>";
    return '<div class="sh-sec"><h3>Timeline (' + events.length + ')</h3>' + (events.length ? eventRows(events.slice(0, 5)) +
      (events.length > 5 ? disclosure("timeline-earlier-" + id, "Earlier updates", eventRows(events.slice(5)),
        (events.length - 5) + " updates") : "") : empty("No timeline events in the available history.")) + "</div>";
  }
  const caseSourceButton = (url, label) => url ? '<a class="btn" href="' + H(url) +
    '" target="_blank" rel="noopener noreferrer">' + ico("open_regular") + "<span>" + H(label) + "</span></a>" : "";
  function openClosedCase(id) {
    const ci = closedIn[id];
    if (!ci) { return; }
    hideSug(); delete drawer.dataset.attentionCase;
    const confirmed = ci.Status === "Closed", people = casePeople(ci);
    const duration = confirmed && ci.CreatedOn && ci.ClosedOn
      ? Math.max(0, Math.round((Date.parse(ci.ClosedOn) - Date.parse(ci.CreatedOn)) / DAY * 10) / 10) : null;
    const head = '<div><div class="sh-kpi">' + historyStatus(ci) +
      '</div><h2>' + H(ci.Title) + '</h2><div class="sh-meta"><span>' + caseNo(id) + DOT + H(ci.Account) +
      (ci.Severity ? DOT + H(ci.Severity) : "") + '</span><div>' + (confirmed ? "Closed " : "Recorded ") +
      fmt(historyDate(ci), false) + "</div></div></div>";
    const notice = confirmed ? "A support " + (ci.ClosureKind === "archived" ? "archive" : "closure") +
      " notification was received. This is the latest status visible in your mailbox."
      : ci.Status === "Resolved" ? "The customer agreed to close, but no official closure notification is visible. Confirm the case status before treating it as closed."
        : "This case left the open queue after inactivity. Its actual closure is not confirmed; the recorded date is the inactivity threshold, not a support closure date.";
    const facts = '<div class="facts">' + fact("Case number", caseNo(id)) + fact("Account", H(ci.Account)) +
      fact("Status", historyStatus(ci)) + fact(confirmed ? "Closed / archived" : "Recorded", fmt(historyDate(ci))) +
      fact("Created", fmt(ci.CreatedOn) + (ci.CreatedEstimated ? '<div class="fm">Estimated from available history</div>' : "")) +
      fact("Time to closure", duration === null || !Number.isFinite(duration) ? '<span class="c3">Not confirmed</span>' :
        H(duration + " calendar days") + (ci.CreatedEstimated ? '<div class="fm">Estimated creation date</div>' : "")) +
      fact("Engineer", people.engineer) + fact("Customer contacts", people.customers) +
      fact("Severity", H(ci.Severity || "Not set")) + fact("Support area", H(ci.SupportAreaPath || ci.ProductFamily || "Not set")) +
      fact("Service", H(ci.ServiceName || "Not set")) + fact("Ownership changes", H(ci.OwnershipChanges === undefined ? "Not recorded" : ci.OwnershipChanges)) +
      fact("First ownership", fmt(ci.FirstOwnershipOn)) + fact("First engineer e-mail", fmt(ci.FirstEngineerReplyOn)) +
      fact("Last Microsoft update", fmt(ci.LastMicrosoftUpdate)) + fact("Last customer update", fmt(ci.LastCustomerUpdate)) +
      fact("Last activity", fmt(ci.LastActivity)) + fact("Reopen count", H(ci.ReopenCount === undefined ? "Not recorded" : ci.ReopenCount)) + "</div>";
    let body = '<div class="sh-sec"><div class="ib' + (confirmed ? "" : " caution") + '">' + ico("info_filled") +
      '<div><b>' + H(historyLabel(ci)) + "</b>" + H(notice) + "</div></div></div>" +
      '<div class="sh-sec"><h3>Closure outcome</h3><p>' + H(ci.Resolution || "No closure outcome in the available history.") +
      '</p><p class="cap c2">This is the recorded closure outcome, not an inferred technical fix. See the timeline or original e-mails for resolution details.</p></div>' +
      '<div class="sh-sec">' + disclosure("closed-facts-" + id, "Case information", facts, "People, dates and service") + "</div>" + caseSignalsSection(id);
    const escalations = X.escalations.filter((e) => e.CaseId === id);
    if (escalations.length) {
      body += '<div class="sh-sec"><h3>Escalation history</h3><div class="lv">' + escalations.map((e) =>
        li(ico("arrow_circle_up_regular", "tone-attention"), H(e.Level), H(sc(e.Status)) + DOT + fmt(e.ProposedOn) +
          (e.Outcome ? DOT + H(e.Outcome) : ""))).join("") + "</div></div>";
    }
    body += caseTimelineSection(id);
    const foot = caseSourceButton(ci.CaseLink, "Open case record") + caseSourceButton(ci.LastMailLink, "Open latest e-mail") +
      '<button class="btn" type="button" data-close="1">Close</button>';
    showSheet("Case history " + id, head, body, foot);
  }
