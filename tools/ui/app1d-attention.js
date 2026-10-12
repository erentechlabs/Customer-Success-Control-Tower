
  const AT = { ready: false, loaded: false, busy: false, error: "", notice: "", filter: "active",
    preferences: { revision: 0, rules: CSCT_ATTENTION.defaults, cases: {} } };
  // Cases closed or reopened by hand, read from the saved preferences (live, demo) or the published copy (snapshot).
  // Demo data is fixed in time, so choices made there are dated with its as-of time.
  const stateTime = () => (MODE === "demo" ? CTX.asOfMs : Date.now());
  function manualStates() {
    if (MODE === "snapshot") { return cleanManual(SNAP.manual); }
    const found = {};
    Object.keys(AT.preferences.cases).forEach((id) => { if (AT.preferences.cases[id].manual) { found[id] = AT.preferences.cases[id].manual; } });
    return cleanManual(found);
  }
  let CASE_FLASH = null;
  // The confirmation shown once after closing or reopening a case; it replaces the status note, an error is shown above it.
  function withFlash(id, note) {
    if (!CASE_FLASH || CASE_FLASH.id !== id) { return note; }
    const f = CASE_FLASH; CASE_FLASH = null;
    return '<div class="ib ' + f.kind + '">' + ico(f.icon) + "<div><b>" + H(f.title) + "</b>" + H(f.text) + "</div></div>" + (f.kind === "success" ? "" : note);
  }
  const caseStateButton = (id, target) => (MODE !== "snapshot" && AT.ready ? '<button class="btn" type="button" data-case-state="' + target +
    '" data-case-id="' + H(id) + '"' + (AT.busy ? " disabled" : "") + ">" + ico(target === "closed" ? "checkmark_circle_regular" : "arrow_reset_regular") +
    "<span>" + (target === "closed" ? "Mark as closed" : "Move to open cases") + "</span></button>" : "");
  async function caseStateAction(id, target) {
    if (MODE === "snapshot" || !AT.ready || AT.busy || (target !== "closed" && target !== "open")) { return; }
    const c = caseIn[id] || closedIn[id];
    if (!c) { return; }
    const record = Object.assign({}, AT.preferences.cases[id]);
    // Matching what the mailbox already shows removes the manual choice instead of storing a redundant one.
    const choice = manualChoice(c, target, isoOf(stateTime()));
    if (choice) { record.manual = choice; } else { delete record.manual; }
    const official = !!c.OfficialClosed, inferred = !!c.AutoClosed && !official;
    await attentionSave({ caseId: id, record }, "", (saved) => {
      CASE_FLASH = saved
        ? { id, kind: "success", icon: "checkmark_circle_filled", title: target === "open" ? "Moved to open cases" : inferred ? "Marked as closed" : "Moved to closed cases",
          text: target === "closed"
            ? (choice ? "Only Control Tower changed; Microsoft has not sent a closure notification. Use Move to open cases if this was a mistake." : "This is the status Microsoft's notifications show. Use Move to open cases to undo.")
            : (official ? "Microsoft's last notification closed this case; a closure or reopen notification that arrives later takes over. "
              : inferred ? "The e-mail history had closed this case without a closure notification; one that arrives later takes over. " : "") + "Use Mark as closed to close it again." }
        : { id, kind: "critical", icon: "warning_filled", title: "Could not change the case status", text: AT.error || "Try again." };
    });
  }
  function attentionAdd(ms, hours) {
    let day = csctLocalDay(ms, CTX.tz), left = hours;
    for (let n = 0; n < 400; n++, day++) {
      if (!csctIsBizDay(day, CTX)) { continue; }
      const midnight = day * DAY - CTX.tz * HOUR;
      const start = Math.max(ms, midnight + CTX.cfg.BusinessHours_Start * HOUR);
      const end = midnight + CTX.cfg.BusinessHours_End * HOUR;
      const available = Math.max(0, (end - start) / HOUR);
      if (available >= left) { return start + left * HOUR; }
      left -= available;
    }
    throw new Error("No follow-up deadline within the configured calendar");
  }
  function attentionModel() {
    const preferences = MODE === "snapshot" ? { rules: CSCT_ATTENTION.defaults, cases: {} } : AT.preferences;
    return CSCT_ATTENTION.evaluate(X.cases, X.closed, preferences, CTX.asOfMs,
      { hours: (start, end) => csctBizHours(start, end, CTX), add: attentionAdd, day: CTX.cfg.BusinessHours_End - CTX.cfg.BusinessHours_Start });
  }
  function attentionFresh() {
    if (MODE === "demo") { return true; }
    if (MODE !== "live" || !LV.snap || LV.err || !LV.sync || LV.sync.state === "error") { return false; }
    const last = Date.parse(LV.sync.lastSuccess || "");
    return Number.isFinite(last) && Date.now() - last <= Math.max(5 * 60000, (LV.sync.pollSeconds || 60) * 4000);
  }
  function attentionFindings() {
    const m = attentionModel();
    return { policy: "Local review only. No automatic sends or escalations.", ready: AT.ready,
      dataFresh: attentionFresh(), error: AT.error || null, thresholds: AT.preferences.rules,
      businessDayHours: CTX.cfg.BusinessHours_End - CTX.cfg.BusinessHours_Start,
      needsReview: AT.ready ? m.active : [], snoozed: AT.ready ? m.snoozed : [],
      reviewed: AT.ready ? m.reviewed : [], visibilityChecks: m.coverage };
  }
  const attentionHours = (h) => Math.round(h * 10) / 10;
  const attentionButton = (action, id, text, accent) => '<button class="btn' + (accent ? " accent" : "") +
    '" type="button" data-attention-action="' + action + '" data-attention-id="' + H(id) + '"' +
    (!AT.ready || AT.busy ? " disabled" : "") + ">" + H(text) + "</button>";
  function attentionControls(id, includeReview) {
    const record = AT.preferences.cases[id] || {}, row = attentionModel().rows.find((r) => r.caseId === id);
    return '<div class="watch-controls"><label>Importance <select class="inp" data-attention-priority="' + H(id) +
      '" aria-label="Follow-up importance for case ' + H(id) + '"' + (!AT.ready || AT.busy ? " disabled" : "") + ">" +
      ["Standard", "Important", "Critical"].map((p) => '<option' + ((record.priority || "Standard") === p ? " selected" : "") + ">" + p + "</option>").join("") + "</select></label>" +
      '<div class="watch-commandbar">' +
      (row ? (includeReview === false ? "" : row.status === "Needs review" ? attentionButton("review", id, "Mark reviewed") : attentionButton("reset", id, "Return to review")) +
        '<details class="command-menu"><summary class="btn">Snooze ' + ico("chevron_down_regular") +
        '</summary><div class="command-menu-items">' + attentionButton("hour", id, "For 1 hour") +
        attentionButton("next", id, "Next business day") + "</div></details>" : "") +
      attentionButton("draft", id, "Preview draft") + "</div></div>";
  }
  function attentionRow(row) {
    const reason = row.reasons[0];
    return '<button class="data-row watch-case" type="button" data-followup="' + H(row.caseId) + '">' +
      ico(row.level === 2 ? "alert_urgent_regular" : "clock_regular", row.level === 2 ? "tone-critical" : "tone-caution") +
      '<span class="row-main"><span class="row-title">' + H(row.title) + '</span><span class="row-meta">' + H(row.account) + DOT +
      caseNo(row.caseId) + '</span><span class="row-note">' + H(reason.title) +
      (row.reasons.length > 1 ? " +" + (row.reasons.length - 1) : "") + '</span></span><span class="row-aside"><span>' +
      attentionHours(reason.elapsed) + 'h</span><span class="cap c2">' +
      (row.status === "Needs review" ? row.level === 2 ? "Urgent" : reason.clock === "business hours" ? "Business hours" : "24/7 hours" : H(row.status)) +
      "</span></span>" + ico("chevron_right_regular", "row-chevron") + "</button>";
  }
  function openFollowUp(id) {
    const row = attentionModel().rows.find((r) => r.caseId === id);
    if (!row) { openCase(id); return; }
    const readOnly = MODE === "snapshot";
    if (readOnly) { delete drawer.dataset.attentionCase; }
    else { drawer.dataset.attentionCase = id; }
    drawer.dataset.view = "followup";
    const head = '<div><span class="eyebrow">' + (readOnly ? "Published follow-up" : H(row.status)) + '</span><h2>' + H(row.title) +
      '</h2><div class="sh-meta">' + H(row.account) + DOT + caseNo(id) + "</div></div>";
    const evidence = row.reasons.map((r) => '<div class="followup-evidence"><b>' + H(r.title) +
      '</b><p class="c2">' + attentionHours(r.elapsed) + " of " + r.threshold + " " + r.clock +
      '</p><div class="cap c2">Since ' + fmt(r.since) + DOT + "due " + fmt(r.due) +
      "</div><p>" + H(r.action) + "</p></div>").join("");
    const body = '<div class="sh-sec">' + (readOnly ? "" : attentionBanner()) + evidence +
      (row.snoozedUntil ? '<p class="cap c2">Snoozed until ' + fmt(row.snoozedUntil) + "</p>" : "") + "</div>" +
      (readOnly ? '<p class="detail-note">Read-only, as published ' + fmt(D.input.asOf) +
        ". Default operational targets are used; private importance, reviewed and snooze choices are not shared. A later reply is visible after the next publication and page reload.</p>"
        : '<div class="sh-sec">' + disclosure("manage-followup-" + id, "More options", attentionControls(id, false),
          "Importance, snooze or draft") + '</div><p class="detail-note">Review only. No messages are sent.</p>');
    const foot = (readOnly ? "" : row.status === "Needs review" ? attentionButton("review", id, "Mark reviewed", true) :
      attentionButton("reset", id, "Return to review")) +
      '<button class="btn" type="button" data-case="' + H(id) + '">View case</button>';
    showSheet("Follow-up " + id, head, body, foot);
  }
  function attentionSettings() {
    const ruleLabels = { urgentHours: "Sev 1 / A (24/7)", importantHours: "Important case", standardHours: "Standard / Sev B",
      lowHours: "Standard / Sev C", ownerHours: "Missing ownership", pgHours: "Product-group cadence" };
    return '<form data-attention-form class="watch-rules"><div class="watch-rule-grid">' +
      Object.keys(ruleLabels).map((key) => '<label>' + H(ruleLabels[key]) + '<input type="number" name="' + key +
        '" class="inp" min="0.5" max="48" step="0.5" required value="' + AT.preferences.rules[key] + '"' +
        (!AT.ready || AT.busy ? " disabled" : "") + ' aria-label="' + H(ruleLabels[key]) + ' hours"></label>').join("") +
      '</div><p class="cap c2">Business hours except Sev 1/A (24/7). Critical importance uses at most 1 business hour. Urgency increases at twice the threshold, or after one business day without a reply. These are operational targets, not Microsoft SLA commitments.</p>' +
      '<button class="btn" type="submit"' + (!AT.ready || AT.busy ? " disabled" : "") + ">Save thresholds</button></form>";
  }
  function attentionBanner() {
    let body = "";
    if (MODE === "demo") {
      body += '<div class="ib">' + ico("info_filled") + '<div><b>Fictional demo</b>Changes stay in this page and reset on reload. No mailbox or messages are accessed.</div></div>';
    }
    if (AT.error) {
      body += '<div class="ib critical">' + ico("warning_filled") + '<div><b>Follow-up preference error</b>' + H(AT.error) +
        '</div><button class="btn" type="button" data-attention-action="reload">Retry</button></div>';
    } else if (!AT.ready) { body += '<div class="ib">' + ico("clock_regular") + "<div><b>Loading follow-up preferences</b>Review and snooze controls are unavailable until loading finishes.</div></div>"; }
    if (!attentionFresh()) {
      body += '<div class="ib caution">' + ico("warning_filled") + "<div><b>Confirm freshness before following up</b>The latest mailbox sync is unavailable or stale. Timers are provisional; a reply may already have arrived.</div></div>";
    }
    if (AT.notice) { body += '<div class="ib">' + ico("info_filled") + "<div><b>" + H(AT.notice) + "</b>No e-mail or Teams message was sent.</div></div>"; }
    return body;
  }
  function attentionSummaryCard() {
    if (MODE !== "live") { return ""; }
    const m = attentionModel();
    const text = !AT.ready ? "Follow-up preferences are loading or unavailable"
      : m.active.length + (m.active.length === 1 ? " case needs review" : " cases need review") + DOT + m.snoozed.length + " snoozed" + DOT + m.reviewed.length + " reviewed";
    return '<div class="followup-strip">' + ico("clock_regular", "tone-attention") +
      '<div><b>Quiet follow-up</b><span>' + H(text) + '</span></div><button class="btn subtle" type="button" data-goto="attention">Review ' +
      ico("chevron_right_regular") + "</button></div>";
  }
  function pageAttention() {
    const m = attentionModel(), q = state.q.trim().toLowerCase();
    const readOnly = MODE === "snapshot";
    const choose = readOnly ? m.active : AT.filter === "snoozed" ? m.snoozed : AT.filter === "reviewed" ? m.reviewed : m.active;
    const rows = choose.filter((r) => (r.caseId + " " + r.title + " " + r.account + " " + r.engineer).toLowerCase().includes(q));
    const coverage = m.coverage.filter((r) => (r.caseId + " " + r.title + " " + r.account).toLowerCase().includes(q));
    const filters = [["active", "Needs review", m.active.length], ["snoozed", "Snoozed", m.snoozed.length],
      ["reviewed", "Reviewed", m.reviewed.length]];
    const checks = coverage.length ? '<div class="lv">' + coverage.map((r) =>
      li(ico("info_filled", "tone-neutral"), H(r.title), H(r.account) + DOT + H(r.kind) + "<br>" + H(r.detail),
        { caseId: hasCase(r.caseId) ? r.caseId : null })).join("") + "</div>" : empty("No visibility gaps found.");
    const list = !AT.ready ? empty("Follow-up preferences must load before the review list is available.")
      : rows.length ? '<div class="data-list watch-list">' + rows.map(attentionRow).join("") + "</div>"
        : empty(q ? "No follow-ups match your search." : AT.filter === "active" ? "Nothing needs a new review right now." : "No cases in this view.");
    const tabs = '<div class="selbar watch-tabs" aria-label="Follow-up views">' + filters.map((f) => '<button class="sel' + (AT.filter === f[0] ? " on" : "") +
      '" type="button" data-attention-filter="' + f[0] + '" aria-pressed="' + (AT.filter === f[0]) + '">' + H(f[1]) + '<span class="cnt">' + f[2] + "</span></button>").join("") + "</div>";
    return { sub: readOnly ? "Published reply and update waits. Read-only; personal review choices are not shared." :
        "Cases waiting for a reply or an update. Select a case to review it.",
      body: (readOnly ? '<p class="cap c2" style="margin-bottom:12px">As published ' + fmt(D.input.asOf) +
        ". Uses standard follow-up targets; a new reply appears after the next publication and reload.</p>" : attentionBanner()) +
        '<div class="row"><div class="card watch-inbox">' + (readOnly ? "" : tabs) + list +
        '</div></div><div class="row">' + disclosure("visibility-checks", "Visibility checks", checks, m.coverage.length + (m.coverage.length === 1 ? " record" : " records")) +
        '</div><p class="cap c2">' + (readOnly ? "Read-only evidence from received e-mails, not proof of engineer inactivity." :
          "Replies clear automatically when they reach your mailbox. Nothing is sent to anyone.") + "</p>" };
  }
  function attentionDigest() {
    const m = attentionModel();
    const lines = ["Control Tower - review digest (not sent)", "As of " + fmtT(D.input.asOf),
      attentionFresh() ? "Mailbox data is fresh." : "WARNING: mailbox data is stale or unavailable; confirm before acting.",
      "Operational targets, not contractual SLA. No automatic messages or escalations.", "",
      m.active.length + " cases need review; " + m.snoozed.length + " snoozed; " + m.reviewed.length + " reviewed."];
    m.active.forEach((r, i) => {
      lines.push("", (i + 1) + ". " + r.account + " | " + r.caseId + " | " + r.title + " | " + r.priority);
      r.reasons.forEach((reason) => lines.push("- " + reason.title + ": " + attentionHours(reason.elapsed) + " / " + reason.threshold + " " + reason.clock + ". " + reason.action));
    });
    lines.push("", "Visibility checks: " + m.coverage.length + ". Inspect the case record, not just e-mail history.");
    return lines.join("\n");
  }
  function attentionDraft(id) {
    const c = caseIn[id];
    if (!c) { AT.error = "This case is no longer open. Refresh the follow-up list."; render(false); return; }
    const row = attentionModel().rows.find((r) => r.caseId === id);
    delete drawer.dataset.attentionCase;
    const noOwner = !c.Engineer || c.Engineer === "(not visible)";
    const text = "Subject: Follow-up on case " + id + "\n\nHello,\n\n" +
      (noOwner ? "Could you please confirm the assigned owner and the next action for this case?"
        : "Could you please share the current status, next action and the expected time of the next update for this case?") +
      "\n\nThank you.";
    showSheet("Follow-up draft", "<h2>Preview only</h2><p>Case " + H(id) + DOT + H(c.Account) + "</p>",
      '<div class="sh-sec"><div class="ib">' + ico("info_filled") +
      "<div><b>Not sent or saved to Outlook</b>Review the latest case thread before using this draft. Any e-mail or Teams send requires your explicit approval in Scout.</div></div><p>Suggested recipient: " +
      (noOwner ? "Check the support owner on the existing thread" : H(c.Engineer) + (c.EngineerMail ? " (" + H(c.EngineerMail) + ")" : " (address not visible)")) +
      "</p>" + (row ? "<p class=\"c2\">Reason: " + H(row.reasons.map((r) => r.title).join("; ")) + "</p>" : "") +
      '<pre class="code" id="attentionDraftText">' + H(text) + "</pre></div>",
      '<button class="btn" type="button" data-copy="attention-draft">Copy draft</button><button class="btn" type="button" data-close="1">Close</button>');
  }
  async function attentionAction(action, id) {
    if (action === "reload") { await attentionLoad(); render(false); return; }
    if (action === "draft") { attentionDraft(id); return; }
    if (!AT.ready || AT.busy) { return; }
    const row = attentionModel().rows.find((r) => r.caseId === id);
    if (!row) { AT.notice = "The follow-up has already cleared"; render(false); return; }
    const record = Object.assign({}, AT.preferences.cases[id]);
    const marker = { signature: row.signature, level: row.level };
    if (action === "review") { record.reviewed = marker; delete record.snooze; }
    else if (action === "reset") { delete record.reviewed; delete record.snooze; }
    else {
      const until = action === "hour" ? Date.now() + HOUR : (() => {
        let day = csctLocalDay(Date.now(), CTX.tz) + 1;
        while (!csctIsBizDay(day, CTX)) { day++; }
        return day * DAY - CTX.tz * HOUR + CTX.cfg.BusinessHours_Start * HOUR;
      })();
      record.snooze = Object.assign({ until: isoOf(until) }, marker); delete record.reviewed;
    }
    await attentionSave({ caseId: id, record }, action === "review" ? "Marked reviewed for this episode" : action === "reset" ? "Returned to review" : "Follow-up snoozed");
  }
  document.addEventListener("click", (event) => {
    if (!OUT) { return; }
    const followup = event.target.closest("[data-followup]");
    if (followup) { openFollowUp(followup.getAttribute("data-followup")); return; }
    if (MODE === "snapshot") { return; }
    const caseState = event.target.closest("[data-case-state]");
    if (caseState) { caseStateAction(caseState.getAttribute("data-case-id"), caseState.getAttribute("data-case-state")); return; }
    const filter = event.target.closest("[data-attention-filter]");
    if (filter) { AT.filter = filter.getAttribute("data-attention-filter"); render(false); return; }
    const button = event.target.closest("[data-attention-action]");
    if (button) { attentionAction(button.getAttribute("data-attention-action"), button.getAttribute("data-attention-id")); }
  });
  document.addEventListener("change", async (event) => {
    const id = event.target.getAttribute("data-attention-priority");
    if (MODE === "snapshot" || !id || !AT.ready || AT.busy) { return; }
    const record = Object.assign({}, AT.preferences.cases[id], { priority: event.target.value });
    if (record.priority === "Standard") { delete record.priority; }
    delete record.reviewed; delete record.snooze;
    await attentionSave({ caseId: id, record }, "Follow-up importance saved");
  });
  document.addEventListener("submit", async (event) => {
    if (!event.target.matches("[data-attention-form]")) { return; }
    event.preventDefault();
    const rules = {};
    new FormData(event.target).forEach((value, key) => { rules[key] = Number(value); });
    await attentionSave({ rules }, "Follow-up thresholds saved");
  });
