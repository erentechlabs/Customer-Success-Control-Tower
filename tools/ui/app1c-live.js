
  const LIVE_PORT = /*@@PORT@@*/8787;
  const LIVE_URL = "http://127.0.0.1:" + LIVE_PORT + "/";

  // ---- Live connection: polling, title bar status, InfoBar, loading and connect states ----
  const LV = { snap: null, version: -1, sync: null, err: null, timer: 0, booted: false, manualAt: 0, manualUntil: 0, bar: null };
  const onLocalhost = () => location.protocol === "http:" && (location.hostname === "127.0.0.1" || location.hostname === "localhost");
  const syncing = () => !!LV.sync && (LV.sync.state === "syncing" || LV.sync.state === "starting");
  const manualActive = () => Date.now() < LV.manualUntil;
  const editingPage = () => !!document.activeElement.closest("[data-attention-form], [data-account-search], [data-queue-filter], [data-attention-priority], [data-history-filter], [data-advisory-mapping-form], [data-advisory-edit-form], [data-advisory-resolve-form], .command-menu[open]");
  async function attentionLoad() {
    try {
      const response = await fetch("/api/attention", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) { throw new Error(data.error || "HTTP " + response.status); }
      AT.preferences = data; AT.ready = true; AT.error = "";
    } catch (err) { AT.ready = false; AT.error = err.message || String(err); }
    finally { AT.loaded = true; }
  }
  async function attentionSave(update, notice, onDone) {
    if (!AT.ready || AT.busy) { return false; }
    AT.busy = true; AT.notice = ""; AT.error = "";
    const before = JSON.stringify(manualStates());
    let saved = false;
    try {
      const response = await fetch("/api/attention", { method: "POST",
        headers: { "Content-Type": "application/json", "X-CSCT": "attention" },
        body: JSON.stringify(Object.assign({ revision: AT.preferences.revision }, update)) });
      const data = await response.json();
      if (response.status === 409) {
        await attentionLoad();
        throw new Error(data.error || "Preferences changed in another tab; try again.");
      }
      if (!response.ok) { throw new Error(data.error || "HTTP " + response.status); }
      AT.preferences = data; AT.notice = notice; saved = true;
    } catch (err) { AT.error = err.message || String(err); }
    finally { AT.busy = false; }
    // Closing or reopening a case moves it between lists, so the e-mail history is folded again.
    if (LV.snap && JSON.stringify(manualStates()) !== before) { ingest(runLive(LV.snap, Date.now(), manualStates())); }
    if (onDone) { onDone(saved); }
    render(false);
    if (drawer.classList.contains("on") && drawer.dataset.attentionCase) {
      if (drawer.dataset.view === "followup") { openFollowUp(drawer.dataset.attentionCase); }
      else { openCase(drawer.dataset.attentionCase); }
    }
    return saved;
  }
  async function advisoryLoad() {
    try {
      const response = await fetch("/api/advisory/state", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) { throw new Error(data.error || "HTTP " + response.status); }
      if (data.available === false) { ADV.ready = false; ADV.error = data.reason || "Advisory review is not configured on this PC."; }
      else { ADV.data = data; ADV.ready = true; ADV.error = ""; }
    } catch (err) { ADV.ready = false; ADV.error = err.message || String(err); }
    finally { ADV.loaded = true; }
  }
  async function advisoryPost(path, body, actionName) {
    if (ADV.busy) { return null; }
    ADV.busy = true; ADV.busyAction = actionName || null; ADV.formError = "";
    render(false); // show the busy/disabled state immediately, before the network call starts
    let result = null;
    try {
      const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json", "X-CSCT": "advisory" }, body: JSON.stringify(body || {}) });
      const data = await response.json();
      if (!response.ok) { throw new Error(data.error || "HTTP " + response.status); }
      ADV.notice = data.message || ""; result = data;
      await advisoryLoad();
    } catch (err) { ADV.formError = err.message || String(err); }
    finally { ADV.busy = false; ADV.busyAction = null; }
    render(false);
    return result;
  }
  async function advisoryAction(action) {
    if (ADV.busy) { return; }
    if (action === "reload") {
      ADV.busy = true; ADV.busyAction = "reload"; ADV.notice = ""; ADV.formError = "";
      render(false); // show the busy/disabled state immediately, before the reload request starts
      await advisoryLoad();
      ADV.busy = false; ADV.busyAction = null;
      render(false);
      return;
    }
    if (action === "import") { await advisoryPost("/api/advisory/mailbox/import", {}, "import"); }
  }
  const RING = '<svg class="pring" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="13" stroke-dasharray="58 100"/></svg>';
  const stateBox = (icon, title, text, cmds, phase, cls) => '<div class="state' + (cls ? " " + cls : "") + '">' + icon + "<h2>" + H(title) + "</h2><p>" + H(text) + "</p>" +
    (phase !== undefined ? '<div class="phase" id="livePhase">' + H(phase) + "</div>" : "") + (cmds ? '<div class="cmds">' + cmds + "</div>" : "") + "</div>";
  function renderState(title, sub, body) {
    renderNav();
    ph.innerHTML = '<div class="ph-in"><div class="ph-tx"><h1>' + H(title) + "</h1>" + (sub ? "<p>" + H(sub) + "</p>" : "") + "</div></div>";
    app.innerHTML = body;
    scroller.style.setProperty("--ph-h", ph.offsetHeight + "px");
  }
  function liveApply() {
    if (!LV.snap || !AT.loaded) { return; }
    ingest(runLive(LV.snap, Date.now(), manualStates()));
    if (AT.busy || editingPage()) { renderNav(); return; }
    if (LV.booted && state.tab === "model") { renderNav(); return; }
    render(false);
    LV.booted = true;
  }
  function liveLoading() {
    const sy = LV.sync || {};
    if (!LV.err && sy.state !== "error" && app.querySelector(".state.loading")) { $("livePhase").textContent = sy.phase || "Connecting to the connector"; return; }
    const body = LV.err
      ? stateBox(ico("dismiss_circle_filled", "tone-critical"), "Live connector not responding", "This page could not reach the connector on this PC (" + LV.err + "). Start it with Start-ControlTower.cmd, then select Retry.", '<button class="btn accent" type="button" data-live="retry">Retry</button>')
      : sy.state === "error"
        ? stateBox(ico("warning_filled", "tone-caution"), "Could not read your mailbox", sy.error || "The connector could not reach Microsoft Graph.", '<button class="btn accent" type="button" data-live="sync">Retry</button>')
        : stateBox(RING, "Reading your support case e-mails", "The first sync reads about four months of Unified support notifications and TrackingID threads from Outlook, plus your customer meetings. It takes about a minute; after that, new e-mail is picked up every minute.", "", sy.phase || "Connecting to the connector", "loading");
    renderState("Control tower", "Live data from Outlook", body);
  }
  async function livePoll() {
    clearTimeout(LV.timer);
    let next = 15000;
    try {
      const r = await fetch("/api/snapshot?v=" + LV.version, { cache: "no-store" });
      if (!r.ok) { throw new Error("HTTP " + r.status); }
      const j = await r.json();
      LV.sync = j.sync || null; LV.err = null;
      if (LV.sync && LV.sync.state === "ok" && Date.parse(LV.sync.lastSuccess || "") >= LV.manualAt) { LV.manualUntil = 0; }
      if (Array.isArray(j.events)) { LV.snap = j; LV.version = j.version; liveApply(); }
      else if (!LV.snap) { liveLoading(); }
      if (syncing() || manualActive()) { next = 2000; }
    } catch (err) {
      LV.err = (err && err.message) || String(err);
      next = 10000;
      if (!LV.snap) { liveLoading(); }
    }
    liveStatus();
    LV.timer = setTimeout(livePoll, next);
  }
  function liveAction(kind) {
    if (kind === "attention") { attentionLoad().then(() => { liveApply(); liveStatus(); }); return; }
    if (kind === "sync" && !LV.err) {
      LV.manualAt = Date.now(); LV.manualUntil = LV.manualAt + 45000;
      liveStatus();
      fetch("/api/sync", { method: "POST", cache: "no-store" }).catch(() => null).then(() => { setTimeout(livePoll, 800); });
    } else { livePoll(); }
  }
  const infoBar = (sev, icon, title, msg, act) => '<div class="ib ' + sev + '">' + ico(icon) + '<div class="ib-tx"><b>' + H(title) + "</b>" + H(msg) + '</div><button class="btn" type="button" data-live="' + act + '">Retry</button></div>';
  function liveStatus() {
    const b = $("liveBtn"), sy = LV.sync || {};
    const last = sy.lastSuccess ? Date.parse(sy.lastSuccess) : null;
    const pollMs = (sy.pollSeconds || 60) * 1000;
    const stale = last !== null && Date.now() - last > Math.max(5 * 60000, 4 * pollMs);
    const since = hhmm(sy.lastSuccess || (LV.snap && LV.snap.generatedAt) || "");
    let tone = "neutral", icon = "circle_small_filled", text = "Connecting", tip = "Connecting to the live connector";
    if (LV.err) { tone = "critical"; icon = "dismiss_circle_filled"; text = "Offline"; tip = "The live connector is not responding." + (LV.snap ? " Showing data synced at " + since + "." : ""); }
    else if (manualActive() || (syncing() && (!LV.snap || /Reading|related/.test(sy.phase || "")))) { tone = "attention"; icon = "arrow_sync_regular"; text = "Syncing"; tip = sy.phase && syncing() ? sy.phase : "Checking Outlook for new case e-mail"; }
    else if (sy.state === "error") { tone = "caution"; icon = "warning_filled"; text = "Sync issue"; tip = sy.error || "The last sync failed"; }
    else if (last !== null) {
      tone = stale ? "caution" : "success"; icon = stale ? "warning_filled" : "circle_small_filled";
      text = (stale ? "Last sync " : "Live" + DOT) + since;
      tip = "Synced with Outlook at " + since + ". New case e-mail is checked every " + Math.round(pollMs / 1000) + " seconds and risk is re-scored every minute." +
        (sy.lastPublish ? " Shared snapshot last published " + fmtT(sy.lastPublish) + "." : "") + " Select to sync now.";
    }
    b.hidden = false;
    b.innerHTML = ico(icon, "tone-" + tone + (icon === "arrow_sync_regular" ? " spin" : "")) + "<span>" + H(text) + "</span>";
    b.title = tip; b.setAttribute("aria-label", text + ". " + tip);
    let bar = "";
    if (LV.snap && LV.err) { bar = infoBar("critical", "dismiss_circle_filled", "Live connector not running", "Showing data synced at " + since + ". Start it again with Start-ControlTower.cmd, then select Retry.", "retry"); }
    else if (LV.snap && sy.state === "error") { bar = infoBar("caution", "warning_filled", "Could not refresh from Outlook", (sy.error || "Unknown error") + ". Showing data synced at " + since + ".", "sync"); }
    else if (LV.snap && stale) { bar = infoBar("caution", "warning_filled", "Data may be out of date", "The last successful sync was at " + since + ".", "sync"); }
    else if (LV.snap && !AT.ready && AT.error) { bar = infoBar("caution", "warning_filled", "Saved case choices unavailable", AT.error + ". Cases you closed or reopened by hand are not applied until this loads.", "attention"); }
    if (bar !== LV.bar) { LV.bar = bar; $("banner").innerHTML = bar; }
  }
  function liveConnect() {
    const onFile = location.protocol === "file:";
    const steps = [
      ["1", "Start the connector", "Run Start-ControlTower.cmd in the Customer-Success-Control-Tower\\7-LiveConnector folder. It reads Outlook with your own Microsoft 365 sign-in through WorkIQ."],
      ["2", "Open the live dashboard", "The dashboard opens at " + LIVE_URL + " and refreshes every minute."]
    ];
    const body = '<div class="state">' + ico("mail_regular") + "<h2>Connect to live data</h2><p>This dashboard shows your real Unified support cases. A small connector on your PC reads case notifications, TrackingID threads and customer meetings from your Outlook and keeps them in memory only; nothing is uploaded or saved.</p>" +
      '<div class="phase" id="pingState"><span class="st">' + ico("circle_regular", "tone-neutral") + "<span>Looking for the connector on this PC</span></span></div>" +
      '<div class="cmds"><a class="btn accent" href="' + LIVE_URL + '">Open live dashboard</a>' + (onFile ? '<a class="btn" href="Customer-Success-Control-Tower/6-SampleData/customer-success-control-tower-demo.html">View demo data</a>' : "") + "</div>" +
      '<div class="card steps"><div class="lv">' + steps.map((x) => '<div class="lv-i tall na"><span class="tag acc">' + x[0] + '</span><div class="lv-t"><div class="strong">' + H(x[1]) + '</div><div class="lv-s">' + H(x[2]) + "</div></div></div>").join("") + "</div></div></div>";
    renderState("Control tower", "Waiting for the live connector on this PC", body);
    pingConnector();
  }
  function pingConnector() {
    const el = $("pingState"); if (!el) { return; }
    const show = (icon, tone, text) => { el.innerHTML = '<span class="st">' + ico(icon, "tone-" + tone) + "<span>" + H(text) + "</span></span>"; };
    fetch(LIVE_URL + "api/ping", { cache: "no-store" }).then((r) => r.json()).then((j) => {
      if (!j || j.app !== "csct-live") { throw new Error("not the connector"); }
      const onFile = location.protocol === "file:";
      show("checkmark_circle_filled", "success", onFile ? "Connector is running. Opening the live dashboard." : "Connector is running. Select Open live dashboard.");
      if (onFile) { setTimeout(() => { location.replace(LIVE_URL); }, 600); }
    }).catch(() => {
      show("circle_regular", "neutral", location.protocol === "file:" ? "Connector not detected yet. This page opens the live dashboard as soon as it starts." : "If the connector is already running, select Open live dashboard.");
      if (location.protocol === "file:") { setTimeout(pingConnector, 4000); }
    });
  }
  function bootData() {
    window.csctFindings = findings;
    $("liveBtn").addEventListener("click", () => liveAction("sync"));
    if (!onLocalhost()) { liveConnect(); return; }
    liveLoading(); liveStatus(); livePoll();
    attentionLoad().then(() => { liveApply(); liveStatus(); });
    advisoryLoad().then(() => render(false));
    setInterval(() => { if (LV.snap && !document.hidden) { liveApply(); liveStatus(); } }, 60000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) { if (LV.snap) { liveApply(); } livePoll(); } });
    setInterval(() => {
      if (!document.hidden && !AT.busy && !editingPage()) {
        attentionLoad().then(() => { liveApply(); liveStatus(); });
      }
      if (!document.hidden && !ADV.busy && !editingPage()) {
        advisoryLoad().then(() => render(false));
      }
    }, 60000);
  }
