
  // ---- Advisory review: optional private queue for vendor "Action Required" notices (see SETUP.md) ----
  const ADV = { ready: false, loaded: false, busy: false, busyAction: null, error: "", notice: "", formError: "", filter: "all", data: null };
  function advisoryQueueRows() {
    if (!ADV.data || !Array.isArray(ADV.data.drafts)) { return []; }
    const attn = new Set(["needs_mapping", "needs_customer_content", "needs_review", "ready_for_approval", "rejected", "delivery_rejected", "delivery_unknown"]);
    return ADV.data.drafts.map((d) => Object.assign({}, d, { needsAttention: attn.has(d.status) }));
  }
  const ADVISORY_STATUS_LABEL = {
    needs_mapping: "Environment mapping required", needs_customer_content: "Manual customer identification required",
    needs_review: "Content review required", ready_for_approval: "Ready for approval",
    awaiting_approval: "Awaiting the approver's decision", approved: "Approved", rejected: "Rejected, needs editing",
    dispatching: "Send in progress", submitted: "Submitted to Outlook", sent: "Sent",
    delivery_unknown: "Delivery result unknown", delivery_rejected: "Send rejected",
  };
  const advisoryGroup = (row) => ["sent", "submitted"].indexOf(row.status) >= 0 ? "sent"
    : ["approved", "dispatching"].indexOf(row.status) >= 0 ? "approved"
    : ["rejected", "delivery_rejected", "delivery_unknown"].indexOf(row.status) >= 0 ? "attn" : "review";
  const advisoryTone = (group) => group === "sent" ? "success" : group === "attn" ? "critical" : group === "approved" ? "attention" : "caution";
  const advisoryIcon = (group) => group === "sent" ? "checkmark_circle_regular" : group === "attn" ? "warning_filled" : group === "approved" ? "arrow_circle_up_regular" : "clock_regular";
  const ADVISORY_CONFIDENCE_TAG = { high: "success", medium: "warn", low: "crit" };
  const ADVISORY_CONFIDENCE_ICON = { high: "checkmark_circle_filled", medium: "warning_filled", low: "error_circle_filled" };
  const ADVISORY_CONFIDENCE_LABEL = { high: "High confidence", medium: "Medium confidence", low: "Low confidence" };
  const advisoryConfBadge = (confidence, reason) => confidence ? '<span class="tag conf ' + (ADVISORY_CONFIDENCE_TAG[confidence] || "") +
    '" title="' + H(reason || "") + '">' + ico(ADVISORY_CONFIDENCE_ICON[confidence] || "info_filled") +
    "<span>" + H(ADVISORY_CONFIDENCE_LABEL[confidence] || sc(confidence)) + "</span></span>" : "";
  function advisoryRow(row) {
    const readOnly = MODE !== "live";
    const group = advisoryGroup(row);
    const title = row.customerName || (row.status === "needs_customer_content" ? "Customer could not be identified"
      : row.status === "needs_mapping" ? "Customer mapping pending"
        : readOnly ? "Customer name not shared" : "Customer mapping pending");
    const confTag = advisoryConfBadge(row.confidence, row.confidenceReason);
    return '<button class="data-row watch-case" type="button" data-advisory-open="' + H(row.id) + '">' +
      ico(advisoryIcon(group), "tone-" + advisoryTone(group)) +
      '<span class="row-main"><span class="row-title">' + H(title) + '</span><span class="row-meta">' +
      H(row.teamId || row.service || "") + (row.eventId ? DOT + H(row.eventId) : "") +
      '</span><span class="row-note">' + H((row.blockers && row.blockers[0]) || "") +
      (row.blockers && row.blockers.length > 1 ? " +" + (row.blockers.length - 1) : "") + '</span></span>' +
      '<span class="row-aside"><span class="cap c2">' + H(ADVISORY_STATUS_LABEL[row.status] || row.status) + "</span>" + confTag + "</span>" +
      ico("chevron_right_regular", "row-chevron") + "</button>";
  }
  function advisoryMappingRow(m) {
    return '<div class="data-row">' + ico("checkmark_circle_filled", "tone-success") + '<span class="row-main"><span class="row-title">' + H(m.customerName) + DOT + H(m.teamId) +
      '</span><span class="row-meta">' + H(m.environmentId) + " (" + H(m.environmentType) + ")" +
      '</span><span class="row-note">' + H((m.to || []).join("; ")) + '</span></span></div>';
  }
  function advisoryBanner() {
    if (!ADV.loaded) { return ""; }
    if (!ADV.ready) { return '<div class="ib">' + ico("info_filled") + '<div><b>No Advisory data</b>' + H(ADV.error || "Not configured on this PC, or not loaded yet.") + '</div></div>'; }
    let body = "";
    if (ADV.formError) { body += '<div class="ib critical">' + ico("warning_filled") + '<div><b>Operation could not be completed</b>' + H(ADV.formError) + '</div></div>'; }
    if (ADV.data.workerError) { body += '<div class="ib caution">' + ico("warning_filled") + '<div><b>The background worker stopped</b>' + H(ADV.data.workerError.error || "") + '</div></div>'; }
    if (ADV.notice) { body += '<div class="ib">' + ico("info_filled") + "<div><b>" + H(ADV.notice) + "</b></div></div>"; }
    return body;
  }
  function advisoryMappingForm() {
    return '<form data-advisory-mapping-form class="watch-rules"><div class="watch-rule-grid">' +
      '<label>Tenant/subscription GUID<input class="inp" name="environmentId" required></label>' +
      '<label>Type<select class="inp" name="environmentType"><option value="subscription">Azure subscription</option><option value="tenant">Tenant</option></select></label>' +
      '<label>Customer ID<input class="inp" name="customerId" required></label>' +
      '<label>Customer name<input class="inp" name="customerName" required></label>' +
      '<label>Team / workload<input class="inp" name="teamId" required></label>' +
      '<label>Service<input class="inp" name="service" required></label>' +
      '<label>To recipients<input class="inp" name="to" required placeholder="name@customer.com, name2@customer.com"></label>' +
      '<label>CC recipients<input class="inp" name="cc" placeholder="optional"></label>' +
      '<label>Approved domains<input class="inp" name="domains" required placeholder="customer.com"></label>' +
      '<label>Verification note<input class="inp" name="evidence" required placeholder="Where and when this was verified"></label>' +
      '</div><label class="cb"><input type="checkbox" name="verified" required><span>I have verified the identity and the responsible team.</span></label>' +
      '<button class="btn accent" type="submit"' + (ADV.busy ? " disabled" : "") + '>Save mapping</button></form>';
  }
  function pageAdvisory() {
    const readOnly = MODE !== "live";
    const rows = advisoryQueueRows();
    const q = state.q.trim().toLowerCase();
    const groupOf = (r) => advisoryGroup(r);
    const filtered = rows.filter((r) => ADV.filter === "all" || groupOf(r) === ADV.filter)
      .filter((r) => !q || ((r.customerName || "") + " " + (r.teamId || "") + " " + (r.eventId || "") + " " + (r.subject || "")).toLowerCase().includes(q));
    const counts = { all: rows.length, review: rows.filter((r) => groupOf(r) === "review").length,
      attn: rows.filter((r) => groupOf(r) === "attn").length, approved: rows.filter((r) => groupOf(r) === "approved").length,
      sent: rows.filter((r) => groupOf(r) === "sent").length };
    const tabs = '<div class="selbar watch-tabs" aria-label="Advisory status views">' +
      [["all", "All", counts.all], ["review", "Review", counts.review], ["attn", "Attention", counts.attn],
        ["approved", "Approved", counts.approved], ["sent", "Sent", counts.sent]].map((f) =>
        '<button class="sel' + (ADV.filter === f[0] ? " on" : "") + '" type="button" data-advisory-filter="' + f[0] +
        '" aria-pressed="' + (ADV.filter === f[0]) + '">' + H(f[1]) + '<span class="cnt">' + f[2] + "</span></button>").join("") + "</div>";
    const list = !ADV.ready ? empty(readOnly ? "No Advisory summary was shared in this publication." : "Advisory data could not be loaded, or is not configured on this PC.")
      : filtered.length ? '<div class="data-list watch-list">' + filtered.map(advisoryRow).join("") + "</div>"
        : empty(q ? "No notice matches this search." : "No records in this view.");
    const mappings = ADV.ready ? (ADV.data.mappings || []) : [];
    const mappingBody = (mappings.length ? '<div class="data-list">' + mappings.map(advisoryMappingRow).join("") + "</div>" : empty("No verified environment yet.")) +
      (readOnly || !ADV.ready ? "" : '<div class="row">' + advisoryMappingForm() + "</div>");
    const blockers = ADV.ready ? (ADV.data.deploymentBlockers || []) : [];
    const importBusy = ADV.busy && ADV.busyAction === "import", reloadBusy = ADV.busy && ADV.busyAction === "reload";
    const cmds = readOnly ? "" :
      '<button class="btn" type="button" data-advisory-action="import"' + (!ADV.ready || ADV.busy ? " disabled" : "") + '>' +
        ico("arrow_sync_regular", importBusy ? "spin" : "") + "<span>" + (importBusy ? "Loading\u2026" : "Fetch notices") + "</span></button>" +
      '<button class="btn" type="button" data-advisory-action="reload"' + (ADV.busy ? " disabled" : "") + '>' +
        ico("arrow_reset_regular", reloadBusy ? "spin" : "") + "<span>" + (reloadBusy ? "Loading\u2026" : "Refresh") + "</span></button>";
    return {
      sub: readOnly ? "Published summary of the Advisory approval queue. Real approval is granted only by an authorized reviewer on the access-restricted Microsoft Lists record."
        : "A version-locked approval workflow that routes Action Required notices to the correct customer and team. No e-mail is ever sent automatically.",
      cmds,
      body: advisoryBanner() + tabs + list +
        (readOnly ? "" : '<div class="row">' + disclosure("advisory-mappings", "Verified environment mappings", mappingBody, mappings.length + " environments") + "</div>") +
        (blockers.length ? '<div class="row">' + disclosure("advisory-deployment", "Deployment requirements", blockers.map((b) => '<p class="cap c2">' + H(b) + "</p>").join(""), blockers.length + " items") + "</div>" : "") +
        '<p class="cap c2">' + (readOnly ? "The sent text and recipients are only visible on the Microsoft Lists approval record; this page is a status summary."
          : "Approval is granted by a designated reviewer, with the exact recipient list and text shown, through Microsoft Lists. Real sending only happens after approval and when explicitly enabled.") + "</p>"
    };
  }
  function advisoryFormatBody(text) {
    // Turn the plain extracted notice text into a readable mini "e-mail" instead of a monospace
    // dump: real paragraphs, a real list instead of "·"/"1." prefixed lines, and short host-name
    // links instead of raw "<https://...>" tracking annotations (already Safe-Links-unwrapped and
    // validated server side, so only their display here is being cleaned up).
    const unescapeBasic = (s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    const linked = H(text).replace(/&lt;(https?:\/\/[\s\S]*?)&gt;/gi, (m, url) => {
      let host = url;
      try { host = new URL(unescapeBasic(url)).hostname; } catch (err) { /* keep raw text if not a parseable URL */ }
      return ' <a class="btn link" target="_blank" rel="noopener noreferrer" href="' + url + '">' + ico("open_regular") + "<span>" + H(host) + "</span></a>";
    });
    let html = "", items = [];
    const flushList = () => { if (items.length) { html += "<ul>" + items.map((t) => "<li>" + t + "</li>").join("") + "</ul>"; items = []; } };
    linked.split("\n").forEach((line) => {
      const bullet = line.match(/^\s*(?:[·•]|\d+[.)])\s+(.+)$/);
      if (bullet) { items.push(bullet[1]); return; }
      flushList();
      if (line.trim()) { html += "<p>" + line + "</p>"; }
    });
    flushList();
    return html || "<p>Customer text is not ready yet.</p>";
  }
  function openAdvisoryDraft(id) {
    const row = advisoryQueueRows().find((r) => r.id === id);
    if (!row) { return; }
    const readOnly = MODE !== "live";
    drawer.dataset.view = "advisory";
    const title = row.customerName || (row.status === "needs_customer_content" ? "Customer could not be identified" : "Customer mapping pending");
    const head = '<div><span class="eyebrow">' + H(ADVISORY_STATUS_LABEL[row.status] || row.status) + '</span><h2>' + H(title) +
      '</h2><div class="sh-meta">' + H(row.teamId || row.service || "") + (row.eventId ? DOT + H(row.eventId) : "") + "</div></div>";
    const blockers = (row.blockers || []).length ? '<div class="ib caution">' + ico("warning_filled") + '<div><b>Reasons blocking send</b>' + row.blockers.map(H).join("; ") + '</div></div>' : "";
    const manualHint = row.status === "needs_customer_content" ? '<div class="ib">' + ico("info_filled") +
      '<div><b>Manual identification required</b>This notice has no recognizable event/environment identity (e.g. a meaningless subscription name). Find which customer it belongs to from the vendor portal or the e-mail header, then add the mapping.</div></div>' : "";
    const pending = '<span class="c3">to be determined once mapped</span>';
    const evidenceEnvs = (row.evidence && row.evidence.environmentIds) || [];
    const evidenceAliases = (row.evidence && row.evidence.displayAliases && row.evidence.displayAliases.affectedCustomers) || [];
    const fields = [
      ["To", (row.to || []).length ? H(row.to.join("; ")) : pending],
      ["CC", (row.cc || []).length ? H(row.cc.join("; ")) : null],
      ["Subject", row.subject ? H(row.subject) : pending],
      ["Service", H(row.service || row.teamId || "—")],
      ["Event ID", row.eventId ? H(row.eventId) : "—"],
      row.confidence ? ["Confidence", advisoryConfBadge(row.confidence, null)] : null,
      row.decision ? ["Decision", H(row.decision)] : null,
      row.confidenceReason ? ["Reason", H(row.confidenceReason)] : null,
      !row.customerName && evidenceEnvs.length ? ["Verified scope", evidenceEnvs.map((e) => H(e.type) + ": " + H(e.id)).join("<br>")] : null,
      !row.customerName && evidenceAliases.length ? ["Alias in source", H(evidenceAliases.join(", "))] : null,
      ["Approved by", row.approvedBy ? H(row.approvedBy) : null],
    ].filter((f) => f !== null && f[1] !== null);
    const content = '<div class="sh-sec">' + blockers + manualHint +
      '<h3>Notice details</h3><div class="facts">' +
      fields.map((f) => '<div><div class="fk">' + f[0] + '</div><div class="fv">' + f[1] + "</div></div>").join("") +
      "</div></div>" +
      '<div class="sh-sec"><h3>Text to send</h3>' + advisoryFormatBody(row.body) +
      '<span id="advisoryDraftText" hidden>' + H(row.body || "") + "</span>" +
      (row.approvalUrl && !readOnly ? '<p><a class="btn link" href="' + H(row.approvalUrl) + '" target="_blank" rel="noopener noreferrer">' + ico("open_regular") + "<span>Open the Microsoft Lists approval record</span></a></p>" : "") +
      "</div>";
    const foot = readOnly ? '<button class="btn" type="button" data-close="1">Close</button>' :
      '<button class="btn" type="button" data-copy="advisory">Copy text</button>' +
      (row.resolvable ? '<button class="btn" type="button" data-advisory-resolve="' + H(row.id) + '" data-notice="' + H(row.noticeId) + '" data-source-hash="' + H(row.sourceHash || "") + '">Verify scope</button>' : "") +
      (row.editable ? '<button class="btn" type="button" data-advisory-edit="' + H(row.id) + '">Edit text</button>' : "") +
      (row.publishable ? '<button class="btn accent" type="button" data-advisory-publish="' + H(row.id) + '">Submit for approval</button>' : "") +
      '<button class="btn" type="button" data-close="1">Close</button>';
    showSheet("Advisory notice", head, content, foot);
  }
  function advisoryEditSheet(id) {
    const row = advisoryQueueRows().find((r) => r.id === id);
    if (!row) { return; }
    const head = '<div><span class="eyebrow">Edit text</span><h2>' + H(row.customerName || "") + "</h2></div>";
    const body = '<form data-advisory-edit-form data-id="' + H(id) + '" data-revision="' + row.revision + '" class="watch-rules">' +
      '<label>Subject<input class="inp" name="subject" required maxlength="240" value="' + H(row.subject || "") + '"></label>' +
      '<label>Exact text to send<textarea class="inp" name="body" rows="10" required maxlength="18000">' + H(row.body || "") + "</textarea></label>" +
      '<label class="cb"><input type="checkbox" name="contentVerified"' + (row.contentVerified ? " checked" : "") +
      '><span>I have checked this text for sharing with the customer; it contains no internal information or internal correspondence.</span></label>' +
      '<button class="btn accent" type="submit"' + (ADV.busy ? " disabled" : "") + ">Save new version</button></form>";
    showSheet("Advisory text", head, body, '<button class="btn" type="button" data-close="1">Cancel</button>');
  }
  function advisoryPublishSheet(id) {
    const row = advisoryQueueRows().find((r) => r.id === id);
    if (!row) { return; }
    const head = '<div><span class="eyebrow">Submit for approval</span><h2>' + H(row.customerName || "") + "</h2></div>";
    const body = '<div class="sh-sec"><div class="ib">' + ico("info_filled") +
      '<div><b>The full recipient list and text will be sent to the Microsoft Lists approval record</b>Only authorized reviewers can see it; the real customer send happens only after a separate approval.</div></div>' +
      '<pre class="code">To: ' + H((row.to || []).join("; ")) + (row.cc && row.cc.length ? "\nCC: " + H(row.cc.join("; ")) : "") + "</pre>" +
      '<pre class="code">' + H(row.body || "") + "</pre></div>";
    const COUNTDOWN = 5;
    showSheet("Submit for approval", head, body,
      '<button class="btn accent" type="button" data-advisory-confirm-publish="' + H(id) + '" data-revision="' + row.revision + '" data-digest="' + H(row.digest) + '" disabled>Confirm and submit (' + COUNTDOWN + ")</button>" +
      '<button class="btn" type="button" data-close="1">Cancel</button>');
    // Safety delay: the confirm button stays disabled with a visible countdown so a stray or
    // accidental click cannot submit this to the approval queue immediately.
    let remaining = COUNTDOWN;
    const tick = () => {
      const btn = drawer.querySelector("[data-advisory-confirm-publish]");
      if (!btn || !drawer.classList.contains("on")) { return; }
      remaining -= 1;
      if (remaining <= 0) {
        btn.disabled = ADV.busy;
        btn.textContent = "Confirm and submit";
      } else {
        btn.textContent = "Confirm and submit (" + remaining + ")";
        setTimeout(tick, 1000);
      }
    };
    setTimeout(tick, 1000);
  }
  function advisoryResolveSheet(id, noticeId, sourceHash) {
    const head = '<div><span class="eyebrow">Verify scope</span><h2>Affected environments</h2></div>';
    const body = '<div class="sh-sec"><p>Verify from the portal ALL tenant/subscription GUIDs affected by this event; a missing one can route the notice to the wrong, or an incomplete, customer.</p>' +
      '<form data-advisory-resolve-form data-id="' + H(id) + '" data-notice="' + H(noticeId || "") + '" data-source-hash="' + H(sourceHash || "") + '" class="watch-rules">' +
      '<label>Default type (applies to all GUIDs below)<select class="inp" name="environmentType"><option value="tenant">Tenant</option><option value="subscription">Azure subscription</option></select></label>' +
      '<label>Affected GUIDs (comma or newline separated; add "tenant:" or "subscription:" per line if the types are mixed)<textarea class="inp" name="environmentIds" rows="3" required placeholder="31619baa-... or subscription:f861a3e0-..."></textarea></label>' +
      '<label>Verification note<input class="inp" name="evidence" required placeholder="Vendor portal > Impacted resources, who checked, and when"></label>' +
      '<label class="cb"><input type="checkbox" name="verified" required><span>I have verified the complete list from the vendor portal.</span></label>' +
      '<button class="btn accent" type="submit"' + (ADV.busy ? " disabled" : "") + ">Save scope</button></form></div>";
    showSheet("Scope verification", head, body, '<button class="btn" type="button" data-close="1">Cancel</button>');
  }
  document.addEventListener("click", (event) => {
    const advisoryOpen = event.target.closest("[data-advisory-open]");
    if (advisoryOpen) { openAdvisoryDraft(advisoryOpen.getAttribute("data-advisory-open")); return; }
    if (MODE !== "live") { return; }
    const advisoryFilter = event.target.closest("[data-advisory-filter]");
    if (advisoryFilter) { ADV.filter = advisoryFilter.getAttribute("data-advisory-filter"); render(false); return; }
    const advisoryCmd = event.target.closest("[data-advisory-action]");
    if (advisoryCmd) { advisoryAction(advisoryCmd.getAttribute("data-advisory-action")); return; }
    const advisoryEdit = event.target.closest("[data-advisory-edit]");
    if (advisoryEdit) { advisoryEditSheet(advisoryEdit.getAttribute("data-advisory-edit")); return; }
    const advisoryPublish = event.target.closest("[data-advisory-publish]");
    if (advisoryPublish) { advisoryPublishSheet(advisoryPublish.getAttribute("data-advisory-publish")); return; }
    const advisoryResolve = event.target.closest("[data-advisory-resolve]");
    if (advisoryResolve) { advisoryResolveSheet(advisoryResolve.getAttribute("data-advisory-resolve"), advisoryResolve.getAttribute("data-notice"), advisoryResolve.getAttribute("data-source-hash")); return; }
    const advisoryConfirmPublish = event.target.closest("[data-advisory-confirm-publish]");
    if (advisoryConfirmPublish) {
      advisoryPost("/api/advisory/draft/publish", { id: advisoryConfirmPublish.getAttribute("data-advisory-confirm-publish"),
        revision: Number(advisoryConfirmPublish.getAttribute("data-revision")), digest: advisoryConfirmPublish.getAttribute("data-digest") })
        .then((result) => { if (result) { closeDrawer(); } });
    }
  });
  document.addEventListener("submit", async (event) => {
    if (event.target.matches("[data-advisory-mapping-form]")) {
      event.preventDefault();
      const f = new FormData(event.target);
      const split = (value) => String(value || "").split(",").map((v) => v.trim()).filter(Boolean);
      const result = await advisoryPost("/api/advisory/mapping", {
        environmentId: f.get("environmentId"), environmentType: f.get("environmentType"),
        customerId: f.get("customerId"), customerName: f.get("customerName"), teamId: f.get("teamId"), service: f.get("service"),
        to: split(f.get("to")), cc: split(f.get("cc")), domains: split(f.get("domains")),
        evidence: f.get("evidence"), verified: f.get("verified") === "on",
        mappingRevision: ADV.ready ? ADV.data.mappingRevision : null,
      });
      if (result) { event.target.reset(); }
      return;
    }
    if (event.target.matches("[data-advisory-edit-form]")) {
      event.preventDefault();
      const f = new FormData(event.target);
      const result = await advisoryPost("/api/advisory/draft/edit", {
        id: event.target.getAttribute("data-id"), revision: Number(event.target.getAttribute("data-revision")),
        subject: f.get("subject"), body: f.get("body"), contentVerified: f.get("contentVerified") === "on",
      });
      if (result) { closeDrawer(); }
      return;
    }
    if (event.target.matches("[data-advisory-resolve-form]")) {
      event.preventDefault();
      const f = new FormData(event.target);
      const defaultType = f.get("environmentType") === "subscription" ? "subscription" : "tenant";
      // Each line is a bare GUID (uses the selected default type) or "tenant:<guid>"/"subscription:<guid>"
      // for notices whose "impacted resources" table mixes both GUID types.
      const environmentIds = String(f.get("environmentIds") || "").split(/[,\n]/).map((v) => v.trim()).filter(Boolean)
        .map((raw) => {
          const m = raw.match(/^(tenant|subscription)\s*:\s*(.+)$/i);
          return m ? { type: m[1].toLowerCase(), id: m[2].trim() } : { type: defaultType, id: raw };
        });
      const result = await advisoryPost("/api/advisory/notice/resolve", {
        noticeId: event.target.getAttribute("data-notice"), sourceHash: event.target.getAttribute("data-source-hash"),
        environmentIds, evidence: f.get("evidence"), verified: f.get("verified") === "on",
      });
      if (result) { closeDrawer(); }
    }
  });
