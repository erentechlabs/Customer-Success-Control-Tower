(function () {
  "use strict";
  const SPEC = CSCT_SPEC, RULES = SPEC.rules;
  const DEMO = typeof CSCT_DEMO === "undefined" ? null : CSCT_DEMO;
  const SNAP = typeof CSCT_SNAPSHOT === "undefined" ? null : CSCT_SNAPSHOT;
  // demo: synthetic data; live: connector on this PC; snapshot: daily published copy (read-only, OneDrive-preview safe).
  const MODE = DEMO ? "demo" : SNAP ? "snapshot" : "live";
  const REAL = MODE !== "demo";
  let D = null, OUT = null, X = null, S = null, TREND = [];
  let CTX = csctBuildCtx({ asOf: new Date().toISOString(), config: SPEC.config, holidays: SPEC.holidays });
  const ICONS = /*@@ICONS@@*/{};
  const $ = (id) => document.getElementById(id);
  const html = document.documentElement;
  const root = $("appRoot"), app = $("app"), ph = $("ph"), navEl = $("nav"), scroller = $("scroll");
  const drawer = $("drawer"), scrim = $("scrim"), search = $("search"), asb = $("asb"), asbList = $("asbList");
  const H = (s) => String(s === null || s === undefined ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ico = (name, cls) => { const d = ICONS[name]; return d ? '<svg class="i' + (cls ? " " + cls : "") + '" viewBox="' + d[0] + '" aria-hidden="true" focusable="false"><path d="' + d[1] + '"/></svg>' : ""; };
  const DOT = " \u00b7 ";
  // Requester shown in lists: "from Name (address)" when the sender address is known.
  const fromWho = (name, mail, cap) => (name ? (cap ? "From " : "from ") + H(name) + (mail ? " (" + H(mail) + ")" : "") : "");
  const sc = (s) => (s ? String(s).charAt(0) + String(s).slice(1).toLowerCase() : "");
  const TZMS = CTX.tz * 3600000;
  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function fmt(iso, time) {
    if (!iso) { return "&mdash;"; }
    const t = Date.parse(iso); if (isNaN(t)) { return "&mdash;"; }
    const d = new Date(t + TZMS);
    let s = DOW[d.getUTCDay()] + " " + d.getUTCDate() + " " + MON[d.getUTCMonth()];
    if (time !== false && String(iso).length > 10) { s += " " + String(d.getUTCHours()).padStart(2, "0") + ":" + String(d.getUTCMinutes()).padStart(2, "0"); }
    return s;
  }
  const fmtT = (iso, time) => fmt(iso, time).replace(/&mdash;/g, "-");
  const byId = (arr, key) => { const m = {}; arr.forEach((x) => { m[x[key]] = x; }); return m; };
  let caseOut = {}, caseIn = {}, closedIn = {}, acctIn = {}, acctOut = {}, candByCase = {}, escOpenByCase = {}, evByCase = {}, openSignals = [];
  const hasCase = (id) => !!(caseOut[id] || closedIn[id]);
  const isClosedSig = (s) => s.Status === "Resolved" || s.Status === "Closed - No Action";
  const overdue = (iso) => !!iso && csctLocalDay(Date.parse(iso), CTX.tz) < CTX.asOfDay;
  // Load a data set (demo, or the live fold of Outlook case e-mails) and derive every lookup the pages use.
  function ingest(data) {
    D = data; OUT = csctRunEngine(data.input); CTX = csctBuildCtx(data.input);
    X = data.extra; TREND = data.trend || []; S = OUT.summary;
    caseOut = byId(OUT.cases, "CaseId"); caseIn = byId(X.cases, "CaseId");
    closedIn = byId(X.closed, "CaseId");
    acctIn = byId(X.accounts, "Title"); acctOut = byId(OUT.accounts, "Title");
    candByCase = byId(OUT.candidates, "CaseId");
    escOpenByCase = {}; X.escalations.forEach((e) => { if (["Closed", "De-escalated", "Dismissed"].indexOf(e.Status) < 0) { escOpenByCase[e.CaseId] = e; } });
    evByCase = {}; X.events.forEach((e) => { (evByCase[e.CaseId] = evByCase[e.CaseId] || []).push(e); });
    openSignals = X.signals.filter((s) => !isClosedSig(s));
    if (!acctOut[state.account]) { state.account = OUT.accounts.length ? OUT.accounts[0].Title : null; }
  }
  const openAccounts = () => { const m = {}; OUT.cases.forEach((c) => { m[c.Account] = 1; }); return Object.keys(m).length; };
  const drv = (c) => c.Drivers.filter((d) => d.factor !== "Severity").concat(c.Drivers.filter((d) => d.factor === "Severity"));
  const topDriver = (c) => { const d = drv(c); return d.length ? d[0].label : ""; };
  const riskText = (level) => ({ Red: "At risk", Yellow: "Watch", Green: "On track" }[level] || level);
  const riskStatus = (level) => status(level, riskText(level));
  const caseViews = () => '<div class="view-switch" aria-label="Case views">' +
    [["queue", "Open", S.openCases], ["closed", "Closed", X.closed.filter((c) => c.Status === "Closed").length]].map((v) =>
      '<button class="view-tab' + (state.tab === v[0] ? " on" : "") + '" type="button" data-goto="' + v[0] +
      '" aria-pressed="' + (state.tab === v[0]) + '">' + v[1] + '<span class="cnt">' + v[2] + "</span></button>").join("") + "</div>";

  // ---- Status vocabulary: icon + text, never color alone (WinUI InfoBar severities) ----
  const RAG = { Red: ["red", "critical", "error_circle_filled"], Yellow: ["yellow", "caution", "warning_filled"], Green: ["green", "success", "checkmark_circle_filled"] };
  const cls = (l) => (RAG[l] ? RAG[l][0] : "");
  const ragIco = (l) => (RAG[l] ? ico(RAG[l][2], "tone-" + RAG[l][1]) : ico("circle_regular", "tone-neutral"));
  const status = (l, text) => '<span class="st">' + ragIco(l) + "<span>" + H(text === undefined ? l : text) + "</span></span>";
  const score = (n, l, wide) => '<span class="score' + (wide ? " wide" : "") + '" title="Risk score ' + n + ' of 100"><b>' + n + '</b><span class="pb"><i class="' + cls(l) + '" style="width:' + Math.max(4, Math.min(100, n)) + '%"></i></span></span>';
  const dash = '<span class="c3">&mdash;</span>';
  const caseNo = (id) => (id ? '<span class="mono">' + H(id) + "</span>" : "");
  const tags = (s, acc) => (s ? '<span class="tags">' + s.split("; ").filter(Boolean).map((t) => '<span class="tag' + (acc ? " acc" : "") + '">' + H(t) + "</span>").join("") + "</span>" : dash);
  const trendIco = (t) => (t === "Worsening" ? ico("arrow_up_regular", "tone-critical") : t === "Improving" ? ico("arrow_down_regular", "tone-success") : ico("subtract_regular", "tone-neutral"));
  const trendText = (t, prev) => '<span class="st c2">' + trendIco(t) + "<span>" + H(t) + (prev === null || prev === undefined ? "" : " (was " + prev + ")") + "</span></span>";
  const slaCell = (s) => (s === "Breached" ? '<span class="st">' + ico("timer_regular", "tone-critical") + "<span>Breached</span></span>"
    : s === "At Risk" ? '<span class="st">' + ico("timer_regular", "tone-caution") + "<span>At risk</span></span>" : '<span class="c2">' + H(sc(s)) + "</span>");
  const SIG = {
    "Complaint": ["person_feedback_regular", "caution"], "Additional Request": ["document_text_regular", "attention"],
    "Escalation Request": ["alert_urgent_regular", "critical"], "Account Concern": ["building_regular", "caution"], "Praise": ["checkmark_circle_regular", "success"]
  };
  const sigIco = (t) => ico((SIG[t] || SIG.Complaint)[0], "tone-" + (SIG[t] || SIG.Complaint)[1]);
  const ESC = {
    "Active": ["pulse_regular", "attention"], "Pending Manager Approval": ["clock_regular", "caution"], "Approved": ["send_regular", "attention"],
    "Submitted": ["send_regular", "attention"], "Closed": ["checkmark_circle_regular", "success"], "De-escalated": ["arrow_down_regular", "success"], "Dismissed": ["subtract_regular", "neutral"]
  };
  const escStatus = (s) => '<span class="st">' + ico((ESC[s] || ESC.Dismissed)[0], "tone-" + (ESC[s] || ESC.Dismissed)[1]) + "<span>" + H(sc(s)) + "</span></span>";
  const lvl = (code, text) => '<span class="lvl"><span class="tag acc">' + H(code) + "</span><span>" + H(text) + "</span></span>";
  const levelCell = (level) => { const p = String(level || "").split(" - "); return lvl(p[0], p.slice(1).join(" - ")); };
  const levelShort = (level) => { const p = String(level || "").split(" - "); return '<span class="lvl" title="' + H(level) + '"><span class="tag acc">' + H(p[0]) + "</span><span>" + H(p.slice(1).join(" - ").replace(/\s*\([^)]*\)/g, "")) + "</span></span>"; };
  const caseCell = (c, hideAcct) => '<div class="two w-case"><span class="ellip" title="' + H(c.Title) + '">' + H(c.Title) + '</span><span class="l2 ellip">' + (hideAcct ? "" : H(c.Account) + DOT) + '<span class="mono">' + H(c.CaseId) + "</span></span></div>";
  const nextCell = (c) => '<div class="two w-next"><span>' + H(topDriver(c)) + '</span><span class="l2">' + H(c.PlaybookId) + DOT + H(c.RecommendedAction) + "</span></div>";
  const riskCell = (c) => '<div class="two risk">' + status(c.RiskLevel) + '<span class="l2 rs" title="Risk score ' + c.RiskScore + ' of 100"><span class="pb"><i class="' + cls(c.RiskLevel) + '" style="width:' + Math.max(4, Math.min(100, c.RiskScore)) + '%"></i></span><span class="num">' + c.RiskScore + "</span></span></div>";
  const signalsCell = (c) => {
    const t = [];
    if (c.IsStalled) { t.push('<span class="tag" title="Stalled: ' + H(c.StallType) + '">' + ico("pause_circle_regular") + H(c.StallType) + "</span>"); }
    if (c.SLAStatus === "Breached") { t.push('<span class="tag crit">' + ico("timer_regular") + "SLA breached</span>"); }
    else if (c.SLAStatus === "At Risk") { t.push('<span class="tag warn">' + ico("timer_regular") + "SLA at risk</span>"); }
    else if (c.SLAStatus === "Late response") { t.push('<span class="tag">' + ico("timer_regular") + "Late first response</span>"); }
    (c.EscalationTriggers ? c.EscalationTriggers.split("; ") : []).forEach((x) => { t.push('<span class="tag acc" title="' + H(x + " " + (CSCT_RULE_LABELS[x] || "")) + '">' + H(x) + "</span>"); });
    return t.length ? '<span class="tags">' + t.join("") + "</span>" : dash;
  };
  const card = (title, desc, body, extra) => '<div class="card' + (extra && extra.cls ? " " + extra.cls : "") + '"' + (extra && extra.id ? ' id="' + extra.id + '"' : "") + '><div class="ch"><div><h2>' + title + "</h2>" + (desc ? "<p>" + desc + "</p>" : "") + "</div>" + (extra && extra.cmd ? extra.cmd : "") + "</div>" + body + "</div>";
  const UX = { expanded: {}, accountQuery: "", returnFocus: null };
  const disclosure = (id, title, body, hint, initiallyOpen) => '<details class="expander" data-disclosure="' + H(id) + '"' +
    ((Object.prototype.hasOwnProperty.call(UX.expanded, id) ? UX.expanded[id] : initiallyOpen) ? " open" : "") +
    '><summary><span class="expander-title">' + H(title) + "</span>" +
    (hint ? '<span class="expander-hint">' + H(hint) + "</span>" : "") +
    ico("chevron_down_regular", "expander-chevron") + '</summary><div class="expander-body">' + body + "</div></details>";
  const li = (icon, title, sub, opt) => {
    const o = opt || {};
    return '<div class="lv-i' + (o.aside ? "" : " na") + (o.caseId ? ' click" data-case="' + H(o.caseId) + '" tabindex="0"' : '"') + ">" + icon + '<div class="lv-t"><div>' + title + "</div>" + (o.quote ? '<div class="lv-q">&ldquo;' + H(o.quote) + "&rdquo;</div>" : "") + (sub ? '<div class="lv-s">' + sub + "</div>" : "") + "</div>" + (o.aside ? '<span class="lv-a">' + o.aside + "</span>" : "") + "</div>";
  };
  const stat = (o) => {
    const inner = '<span class="stat-name">' + ico(o.icon, "tone-" + o.tone) + '<span class="stat-l" title="' + H(o.label) + '">' + H(o.label) +
      '</span></span><span class="stat-v">' + o.value + '</span><span class="stat-s" title="' + H(o.sub || "") + '">' + (o.sub ? H(o.sub) : "&nbsp;") + "</span>";
    return o.go ? '<button class="stat" type="button" data-goto="' + o.go + '"' + (o.filter ? ' data-filter="' + o.filter + '"' : "") + ">" + inner + "</button>" : '<div class="stat static">' + inner + "</div>";
  };
  const bars = (items, max) => '<div class="bars">' + items.map((it) => '<span class="bl" title="' + H(it[0]) + '">' + H(it[0]) + '</span><span class="bt"><i style="width:' + (100 * it[1] / Math.max(1, max)) + '%"></i></span><span class="bv">' + it[1] + "</span>").join("") + "</div>";
  const empty = (text) => '<div class="empty">' + ico("search_regular") + "<span>" + H(text) + "</span></div>";

  // ---- Navigation (NavigationView, Left; 5-10 equally important pages) ----
  const PAGES = [
    { id: "tower", label: "Control tower", icon: "gauge_regular" },
    { id: "queue", label: "Cases", icon: "clipboard_task_regular" },
    { id: "closed", label: "Cases", icon: "checkmark_circle_regular", hidden: true },
    { id: "attention", label: "Attention center", icon: "clock_regular" },
    { id: "esc", label: "Escalations", icon: "arrow_circle_up_regular" },
    { id: "voice", label: "Customer voice", icon: "person_feedback_regular" },
    { id: "acct", label: "Account 360", icon: "building_multiple_regular" },
    { id: "brief", label: "Manager brief", icon: "news_regular" },
    { id: "model", label: "Settings & rules", icon: "options_regular", footer: true }
  ];
  const badges = () => (S ? {
    queue: [S.red, "critical", S.red + " Red cases"],
    esc: [S.candidates, "attention", S.candidates + " escalation candidates"],
    voice: [S.overdueSignals, "caution", S.overdueSignals + " customer signals past due"],
    attention: AT.ready ? [attentionModel().active.length, "caution", MODE === "snapshot" ? "Published cases waiting for an update" : "Cases needing a new follow-up review"] : [0]
  } : {});
  const state = { tab: "tower", filter: "all", q: "", account: null, pane: "auto", packId: null,
    closedStatus: "Closed", closedAccount: "", closedPeriod: "all" };

  function renderNav() {
    const B = badges();
    const item = (p) => {
      const b = B[p.id], on = state.tab === p.id || (p.id === "queue" && state.tab === "closed");
      return '<button class="nav-item' + (on ? " on" : "") + '" type="button" data-tab="' + p.id + '" title="' + H(p.label) + '"' + (on ? ' aria-current="page"' : "") + '><span class="ni-ic">' + ico(p.icon) + '</span><span class="ni-lb">' + H(p.label) + "</span>" +
        (b && b[0] ? '<span class="badge ' + b[1] + '" title="' + H(b[2]) + '">' + b[0] + "</span>" : "") + "</button>";
    };
    const mainPages = PAGES.filter((p) => !p.footer && !p.hidden && (!p.liveOnly || MODE === "live"));
    navEl.innerHTML = mainPages.map(item).join("") +
      '<div class="nav-grow"></div><div class="nav-sep"></div>' +
      PAGES.filter((p) => p.footer).map(item).join("") + '<div class="nav-foot">Risk engine ' + H(CSCT_ENGINE_VERSION) + DOT + ({ live: "live data", snapshot: "shared snapshot", demo: "synthetic data" }[MODE]) + "</div>";
  }
  function applyPane() {
    const open = state.pane === "open" || (state.pane === "auto" && window.innerWidth >= 1008);
    root.classList.toggle("compact", !open);
    $("paneToggle").setAttribute("aria-expanded", String(open));
  }

  // ---- AutoSuggestBox (global search in the title bar) ----
  let sugItems = [], sugIdx = -1;
  const hay = (c) => { const ci = caseIn[c.CaseId] || closedIn[c.CaseId] || c; return (c.CaseId + " " + c.Title + " " + c.Account + " " + (ci.Engineer || "") + " " + (ci.EngineerMail || "") + " " + (ci.CustomerContacts || []).join(" ") + " " + Object.values(ci.ContactMails || {}).join(" ") + " " + (ci.Resolution || "")).toLowerCase(); };
  function queueRows() {
    const q = state.q.trim().toLowerCase();
    return OUT.cases.filter((c) => match(c, state.filter) && (!q || hay(c).indexOf(q) >= 0));
  }
  function hideSug() {
    asbList.hidden = true; asb.classList.remove("open"); search.setAttribute("aria-expanded", "false"); sugItems = []; sugIdx = -1;
  }
  function showSug() {
    const q = state.q.trim().toLowerCase();
    if (!q || state.tab === "queue" || state.tab === "closed") { hideSug(); return; }
    const cases = OUT.cases.filter((c) => hay(c).indexOf(q) >= 0);
    const history = X.closed.filter((c) => hay(c).indexOf(q) >= 0);
    const accts = OUT.accounts.filter((a) => a.Title.toLowerCase().indexOf(q) >= 0).slice(0, 3);
    sugItems = [];
    let h = "";
    if (cases.length) {
      h += '<div class="sug-h">Open cases</div>';
      cases.slice(0, 5).forEach((c) => { sugItems.push({ t: "case", id: c.CaseId }); h += '<div class="sug" role="option" data-sug="' + (sugItems.length - 1) + '">' + ragIco(c.RiskLevel) + '<div class="two"><span class="l1">' + H(c.Title) + '</span><span class="l2">' + H(c.Account) + DOT + '<span class="mono">' + H(c.CaseId) + '</span></span></div><span class="cap c2 num">' + c.RiskScore + "</span></div>"; });
    }
    if (history.length) {
      h += '<div class="sug-h">Closed case history</div>';
      history.slice(0, 5).forEach((c) => {
        sugItems.push({ t: "case", id: c.CaseId });
        h += '<div class="sug" role="option" data-sug="' + (sugItems.length - 1) + '">' + historyIcon(c) +
          '<div class="two"><span class="l1">' + H(c.Title) + '</span><span class="l2">' + H(c.Account) + DOT +
          caseNo(c.CaseId) + '</span></div><span class="cap c2">' + H(historyLabel(c)) + "</span></div>";
      });
    }
    if (accts.length) {
      h += '<div class="sug-h">Accounts</div>';
      accts.forEach((a) => { sugItems.push({ t: "acct", id: a.Title }); h += '<div class="sug" role="option" data-sug="' + (sugItems.length - 1) + '">' + ico("building_regular", "tone-neutral") + '<div class="two"><span class="l1">' + H(a.Title) + '</span><span class="l2">' + H(a.AccountRAG) + DOT + a.OpenCases + ' open cases</span></div><span class="cap c2 num">' + a.AccountRiskScore + "</span></div>"; });
    }
    if (cases.length) {
      sugItems.push({ t: "all" });
      h += '<div class="sug" role="option" data-sug="' + (sugItems.length - 1) + '">' + ico("search_regular", "tone-attention") + '<div class="two"><span class="l1">Show all ' + cases.length + ' matching cases in the action queue</span></div><span></span></div>';
    }
    if (history.length) {
      sugItems.push({ t: "history" });
      h += '<div class="sug" role="option" data-sug="' + (sugItems.length - 1) + '">' + ico("search_regular", "tone-attention") +
        '<div class="two"><span class="l1">Show all ' + history.length + ' matching records in closed case history</span></div><span></span></div>';
    }
    if (!sugItems.length) { h = '<div class="sug-empty">No results for &ldquo;' + H(state.q.trim()) + "&rdquo;</div>"; }
    const r = asb.getBoundingClientRect();
    asbList.style.left = r.left + "px"; asbList.style.top = (r.bottom - 1) + "px"; asbList.style.width = r.width + "px";
    asbList.innerHTML = h; asbList.hidden = false; asb.classList.add("open"); search.setAttribute("aria-expanded", "true"); sugIdx = -1;
  }
  function pickSug(i) {
    const it = sugItems[i]; if (!it) { return; }
    hideSug();
    if (it.t === "case") { openCase(it.id); }
    else if (it.t === "acct") { state.account = it.id; go("acct"); }
    else if (it.t === "history") { resetHistoryFilters("all"); go("closed"); }
    else { state.filter = "all"; go("queue"); }
  }
  function markSug() {
    asbList.querySelectorAll(".sug").forEach((el) => el.classList.toggle("on", Number(el.getAttribute("data-sug")) === sugIdx));
    const on = asbList.querySelector(".sug.on"); if (on) { on.scrollIntoView({ block: "nearest" }); }
  }
