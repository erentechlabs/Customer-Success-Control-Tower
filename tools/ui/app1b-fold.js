
  // ---- Real data: fold the connector's Unified support case e-mail events into the engine input ----
  const HOUR = 3600000, DAY = 86400000;
  const SEVRANK = { "1": 4, A: 3, B: 2, C: 1 };
  const EVT = {
    created: "Created", submitted: "Created", ownership: "Ownership Change", severity: "Severity Change", reopened: "Reopened",
    closed: "Closed", archived: "Closed", critsit_start: "Critical Situation", critsit_end: "Critical Situation",
    ms_update: "Microsoft Update", customer_update: "Customer Update", account_team: "Account Team", notification: "Notification"
  };
  const isoOf = (ms) => (ms === null || ms === undefined ? null : new Date(ms).toISOString());
  // Ownership notices name the engineer without an address; take it from that person's own e-mails on the thread.
  // The support relay can shorten sender names, so a first name plus the other's initial also matches.
  const normName = (x) => String(x || "").normalize("NFD").replace(/[\u0300-\u036f.]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  function samePerson(a, b) {
    const x = normName(a), y = normName(b);
    if (!x || !y) { return false; }
    if (x === y) { return true; }
    const xs = x.split(" "), ys = y.split(" ");
    if (xs.length < 2 || ys.length < 2) { return false; }
    const sub = (p, q) => p.every((t) => q.indexOf(t) >= 0);
    if (sub(xs, ys) || sub(ys, xs)) { return true; }
    const ini = (p, q) => p.length === 2 && p[1].length === 1 && q[1].charAt(0) === p[1];
    return xs[0] === ys[0] && (ini(xs, ys) || ini(ys, xs));
  }
  function mailFor(name, byName) {
    const keys = Object.keys(byName).filter((k) => byName[k]);
    const exact = keys.filter((k) => normName(k) === normName(name));
    if (exact.length) { return byName[exact[0]]; }
    const mails = keys.filter((k) => samePerson(name, k)).map((k) => byName[k]).filter((v, i, arr) => arr.indexOf(v) === i);
    return mails.length === 1 ? mails[0] : "";
  }
  const fullName = (name, keys) => keys.filter((k) => samePerson(name, k) && normName(k).length > normName(name).length).sort((a, b) => b.length - a.length)[0] || name;
  // A MIRP confirmation in Engage Center is valid for 180 days; after that it counts as expired.
  const MIRP_VALID_DAYS = 180;
  const mirpDue = (a) => { const t = Date.parse((a && a.MIRPConfirmedOn) || ""); return isNaN(t) ? null : t + MIRP_VALID_DAYS * 86400000; };
  function mirpEffective(a, nowMs) {
    const st = (a && a.MIRPStatus) || "";
    const due = mirpDue(a);
    return (st === "Confirmed" || st === "Approved") && due !== null && nowMs > due ? "Expired" : st;
  }
  const localDate = (day) => new Date(day * DAY).toISOString().slice(0, 10);
  const bizAdd = (ms, n) => { let day = csctLocalDay(ms, CTX.tz), k = 0; while (k < n) { day++; if (csctIsBizDay(day, CTX)) { k++; } } return localDate(day); };
  const hhmm = (iso) => { const t = Date.parse(iso); if (isNaN(t)) { return ""; } const d = new Date(t + TZMS); return String(d.getUTCHours()).padStart(2, "0") + ":" + String(d.getUTCMinutes()).padStart(2, "0"); };
  // Shared snapshot schedule: "HH:MM" Istanbul times on business days, from the connector settings (ms after local midnight).
  const pubSlots = (times) => (times || []).map((t) => /^(\d{1,2}):(\d{2})$/.exec(t)).filter(Boolean).map((m) => Number(m[1]) * HOUR + Number(m[2]) * 60000).sort((a, b) => a - b);
  const slotHm = (off) => String(Math.floor(off / HOUR)).padStart(2, "0") + ":" + String(Math.round((off % HOUR) / 60000)).padStart(2, "0");
  // Gap between slots when the schedule is regular (e.g. every 10 minutes); 0 for an irregular list of times.
  const slotGap = (slots) => (slots.length > 2 && slots.every((t, i) => !i || t - slots[i - 1] === slots[1] - slots[0]) ? slots[1] - slots[0] : 0);
  const gapText = (gap) => (gap === HOUR ? "every hour" : gap % HOUR === 0 ? "every " + gap / HOUR + " hours" : "every " + Math.round(gap / 60000) + " minutes");
  function scheduleText(slots) {
    if (!slots.length) { return "not scheduled"; }
    const gap = slotGap(slots);
    return gap ? gapText(gap) + " from " + slotHm(slots[0]) + " to " + slotHm(slots[slots.length - 1]) + " on business days" : "on business days at " + slots.map(slotHm).join(", ");
  }
  const scheduleLabel = (slots) => { const gap = slotGap(slots); return !slots.length ? "Off" : gap ? gapText(gap).charAt(0).toUpperCase() + gapText(gap).slice(1) : slotHm(slots[0]); };
  function caseDate(id) {
    const m = /^(\d\d)(\d\d)(\d\d)\d{10}$/.exec(id || "");
    if (!m) { return null; }
    const t = Date.UTC(2000 + Number(m[1]), Number(m[2]) - 1, Number(m[3]), 9) - TZMS;
    return isNaN(t) ? null : t;
  }
  function productFamily(area) {
    const p = String(area || "").split(/\s*[\/\\>|]\s*/).filter(Boolean);
    if (!p.length) { return "Other"; }
    return /^(microsoft 365|office 365|m365|o365|microsoft)$/i.test(p[0]) && p[1] ? p[1] : p[0];
  }
  function detailOf(e) {
    switch (e.kind) {
      case "created": return "Case created" + (e.sev ? " with severity " + e.sev : "");
      case "submitted": return "Case submitted to Microsoft Support";
      case "ownership": return (e.engineer || "An engineer") + " took ownership" + (e.sev ? " (severity " + e.sev + ")" : "");
      case "severity": return "Severity changed" + (e.sevFrom ? " from " + e.sevFrom : "") + (e.sevTo ? " to " + e.sevTo : "");
      case "reopened": return "Case reopened";
      case "closed": return "Case closed" + (e.resolution && e.resolution !== "Closed" ? " as " + e.resolution : "");
      case "archived": return "Case archived";
      case "critsit_start": return "Critical situation engaged";
      case "critsit_end": return "Critical situation ended";
      default: {
        const txt = String(e.preview || "").trim();
        if (!txt) { return describe(e); }
        const flag = e.closure ? (e.role === "customer" ? "Customer agreed to close. " : "Closure proposed. ") : "";
        return flag + (txt.length > 240 ? txt.slice(0, 237) + "..." : txt);
      }
    }
  }
  // Timeline wording when e-mail text is not available (shared snapshot): what happened, not what was written.
  function describe(e) {
    if (e.kind === "ms_update") {
      return "Engineer update" + (e.closure ? ": closure proposed" : e.ball === "Customer" ? ": asked the customer for information or a confirmation"
        : e.ball === "Microsoft" ? ": still working on it" : e.ball === "Product Group" ? ": waiting on the product group" : "");
    }
    if (e.kind === "customer_update") {
      const bits = (e.signals || []).map((s) => s.label);
      if (e.closure) { bits.unshift("agreed to close the case"); }
      if (e.exec) { bits.push("mentions executives"); }
      if (e.sentiment && e.sentiment !== "Neutral") { bits.push("tone: " + e.sentiment.toLowerCase()); }
      return "Customer reply" + (bits.length ? ": " + bits.join(DOT) : "");
    }
    if (e.kind === "account_team") { return "Account team message on the case thread"; }
    return e.title || "Support notification";
  }

  // Replays the case e-mail events up to time T and produces the engine input plus the page data.
  function foldAt(snap, T, carry, full) {
    const staleMs = ((snap.settings && snap.settings.staleCaseDays) || 21) * DAY;
    const recentMs = (CTX.cfg.Recent_Days || 7) * DAY;
    const meta = snap.cases || {};
    const acctList = (snap.accounts || []).slice();
    const known = {}; acctList.forEach((a) => { known[a.Title] = 1; });
    const by = {}, order = [];
    snap.events.forEach((e) => {
      const t = Date.parse(e.t);
      if (isNaN(t) || t > T) { return; }
      if (!by[e.caseId]) { by[e.caseId] = []; order.push(e.caseId); }
      by[e.caseId].push(e);
    });
    const casesIn = [], casesX = [], closed = [], signals = [], escalations = [], events = [];
    order.forEach((id) => {
      const evs = by[id].slice().sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
      const account = (meta[id] && meta[id].account) || "Unassigned";
      if (!known[account]) { known[account] = 1; acctList.push({ Title: account, Source: "Not in the account map" }); }
      const s = {
        title: "", subj: "", area: "", service: "", link: null, mail: null, sev: null, created: null, submitted: null,
        engineer: "", engMail: "", owners: 0, firstEng: null, firstOwn: null, lastMs: null, lastCust: null, lastAct: null, lastTeam: null,
        chasers: 0, prevCust: null, side: "", closedAt: null, resolution: "", reopen: 0, sevAt: null, sevDir: null,
        crit: [], closure: null, consent: null, ball: null, exec: [], sent: [], sig: [], cust: {}, custMail: {}, msAll: {},
        ownAt: null, ownReply: null, waitingSince: null, reopenedAt: null, closedKind: ""
      };
      evs.forEach((e) => {
        const t = Date.parse(e.t), f = e.fields || {};
        s.lastAct = t;
        if (f.caseTitle) { s.title = f.caseTitle; }
        if (f.areaPath) { s.area = f.areaPath; }
        if (f.serviceName) { s.service = f.serviceName; }
        if (f.caseLink) { s.link = f.caseLink; }
        if (e.title && e.role !== "system") { s.subj = e.title; }
        if (e.link) { s.mail = e.link; }
        const lastCrit = s.crit.length ? s.crit[s.crit.length - 1] : null;
        switch (e.kind) {
          case "created": if (s.created === null) { s.created = t; } if (e.sev) { s.sev = e.sev; } break;
          case "submitted": if (s.submitted === null) { s.submitted = t; } break;
          case "ownership":
            if (e.engineer && !samePerson(e.engineer, s.engineer)) {
              if (s.engineer) { s.owners++; }
              s.engineer = e.engineer; s.ownAt = t; s.ownReply = null;
            }
            if (s.firstOwn === null) { s.firstOwn = t; }
            if (e.sev) { s.sev = e.sev; }
            break;
          case "severity":
            if (e.sevTo) { s.sevDir = (SEVRANK[e.sevTo] || 0) > (SEVRANK[e.sevFrom || s.sev] || 0) ? "Raised" : "Lowered"; s.sev = e.sevTo; s.sevAt = t; }
            break;
          case "reopened": s.reopen++; s.closedAt = null; s.consent = null; s.closure = null; s.reopenedAt = t; s.waitingSince = null; break;
          case "closed": case "archived": s.closedAt = t; s.closedKind = e.kind; s.resolution = e.resolution || "Closed"; s.waitingSince = null; break;
          case "critsit_start": if (!lastCrit || lastCrit.end !== null) { s.crit.push({ start: t, end: null }); } break;
          case "critsit_end": if (lastCrit && lastCrit.end === null) { lastCrit.end = t; } else if (!lastCrit) { s.crit.push({ start: t, end: t }); } break;
          case "ms_update":
            s.lastMs = t; if (s.firstEng === null) { s.firstEng = t; }
            s.waitingSince = null;
            if (samePerson(s.engineer, e.actor)) { s.ownReply = t; }
            s.chasers = 0; s.prevCust = null; s.side = "ms";
            s.closure = e.closure ? t : null; s.ball = e.ball || null;
            if (!s.engMail) { s.engMail = e.actor || ""; }
            if (e.actor) { s.msAll[e.actor] = e.actorMail || s.msAll[e.actor] || ""; }
            break;
          case "customer_update":
             if (s.waitingSince === null && !e.closure) { s.waitingSince = t; }
            // A chaser is a customer follow-up 20+ hours after their previous unanswered message.
            if (s.side === "cust" && s.prevCust !== null && t - s.prevCust >= 20 * HOUR) { s.chasers++; }
            if (s.side !== "cust" || s.prevCust === null || t - s.prevCust >= 20 * HOUR) { s.prevCust = t; }
            s.lastCust = t; s.side = "cust";
            if (e.actor) { s.cust[e.actor] = t; if (e.actorMail) { s.custMail[e.actor] = e.actorMail; } }
            if (e.closure) { s.consent = t; }
            if (e.exec) { s.exec.push(t); }
            if (e.sentiment) { s.sent.push([t, e.sentiment]); }
            (e.signals || []).forEach((x) => { s.sig.push({ x: x, t: t, who: e.actor || "", whoMail: e.actorMail || "", link: e.link || null, sent: e.sentiment || "" }); });
            break;
          case "account_team": s.lastTeam = t; break;
          default: break;
        }
        if (full) { events.push({ CaseId: id, EventTime: e.t, EventType: EVT[e.kind] || "Notification", Actor: e.actor || "", Detail: detailOf(e), Link: e.link || null }); }
      });

      const title = s.title || s.subj || "Case " + id;
      // Customer-side people who wrote on the thread, most recent first.
      const contacts = Object.keys(s.cust).sort((a, b) => s.cust[b] - s.cust[a]);
      const contactMails = {};
      contacts.forEach((n) => { if (s.custMail[n]) { contactMails[n] = s.custMail[n]; } });
      const engName = fullName(s.engineer || s.engMail, Object.keys(s.msAll));
      const engineerMail = mailFor(engName, s.msAll) || null;
      const engineerWrote = !!engName && Object.keys(s.msAll).some((k) => samePerson(engName, k));
      const fam = productFamily(s.area);
      const sevLabel = s.sev ? "Sev " + s.sev : null;
      const firstT = Date.parse(evs[0].t), cd = caseDate(id);
      const createdKnown = s.created !== null || s.submitted !== null;
      const createdMs = s.created !== null ? s.created : s.submitted !== null ? s.submitted : cd !== null ? Math.min(cd, firstT) : firstT;
      let fr = s.firstEng === null ? s.firstOwn : s.firstOwn === null ? s.firstEng : Math.min(s.firstEng, s.firstOwn);
      // First-response SLA needs a real creation time and a known severity; otherwise it is not measurable.
      const slaMeasurable = createdKnown && !!s.sev;
      if (!slaMeasurable) { fr = createdMs; }
      const voiceAfter = (t0) => s.sig.some((g) => g.t > t0 && g.x.type !== "Additional Request");
      const resolvedAt = s.closedAt === null && s.consent !== null && !voiceAfter(s.consent) ? s.consent : null;
      const staleAt = s.closedAt === null && resolvedAt === null && T - s.lastAct > staleMs ? s.lastAct : null;
      const endAt = s.closedAt !== null ? s.closedAt : resolvedAt !== null ? resolvedAt : staleAt;
      const recentSent = s.sent.filter((p) => T - p[0] <= recentMs).map((p) => p[1]);
      const sentiment = recentSent.indexOf("Angry") >= 0 ? "Angry" : recentSent.indexOf("Frustrated") >= 0 ? "Frustrated" : "Neutral";

      if (endAt !== null) {
        closed.push({
          CaseId: id, Account: account, Title: title, SupportAreaPath: s.area, ProductFamily: fam, Severity: sevLabel || "Sev not set",
          CreatedOn: isoOf(createdMs), ClosedOn: isoOf(endAt), Status: s.closedAt !== null ? "Closed" : resolvedAt !== null ? "Resolved" : "Inactive",
          Resolution: s.closedAt !== null ? s.resolution : resolvedAt !== null ? "Customer agreed to close" : "No activity for " + Math.round((T - s.lastAct) / DAY) + " days (closure inferred)",
          CustomerContacts: contacts, ContactMails: contactMails, EngineerMail: engineerMail, Engineer: engName,
          ClosureInferredOn: staleAt !== null && endAt === staleAt ? isoOf(staleAt + staleMs) : null,
          ClosureKind: s.closedAt !== null ? s.closedKind : resolvedAt !== null ? "consent" : "inactivity",
          ServiceName: s.service, CaseLink: s.link, LastMailLink: s.mail, EngineerWrote: engineerWrote,
          SeverityKnown: !!s.sev, CreatedEstimated: !createdKnown, AccountSource: meta[id] ? meta[id].accountSource : "",
          FirstOwnershipOn: isoOf(s.firstOwn), FirstEngineerReplyOn: isoOf(s.firstEng),
          LastMicrosoftUpdate: isoOf(s.lastMs), LastCustomerUpdate: isoOf(s.lastCust), LastActivity: isoOf(s.lastAct),
          OwnershipChanges: s.owners, ReopenCount: s.reopen
        });
      } else {
        const status = s.closure !== null && (s.lastCust === null || s.lastCust < s.closure) ? "Waiting on Customer"
          : s.firstEng === null && s.firstOwn === null && !s.engineer ? "New" : "In Progress";
        const ball = status === "Waiting on Customer" ? null : s.side === "ms" && s.ball ? s.ball : null;
        const lastCrit = s.crit.length ? s.crit[s.crit.length - 1] : null;
        const prev = carry.cases[id] || {};
        const next = status === "Waiting on Customer" ? ["Customer to confirm the proposed closure", "Customer"]
          : ball === "Product Group" ? ["Product group to respond; engineer to share an ETA", "Microsoft"]
          : ball === "Microsoft" || (ball === null && s.side === "cust") ? ["Engineer to send the next update", "Microsoft"]
          : s.side === "ms" ? ["Customer to reply to the engineer", "Customer"] : ["Engineer to make first contact", "Microsoft"];
        const cIn = {
          CaseId: id, Title: title, Account: account, Severity: sevLabel, Status: status, BallInCourt: ball,
          Engineer: engName || (createdKnown ? "" : "(not visible)"), ProductFamily: fam,
          CreatedOn: isoOf(createdMs), FirstResponseOn: isoOf(fr), LastMicrosoftUpdate: isoOf(s.lastMs), LastCustomerUpdate: isoOf(s.lastCust), LastActivity: isoOf(s.lastAct),
          OwnershipChanges: s.owners, ReopenCount: s.reopen, CustomerChasers: s.chasers, CustomerSentiment: sentiment, BusinessImpact: null,
          ExecVisibility: s.exec.some((t) => T - t <= 30 * DAY), NextActionDue: null, ResolutionETA: null,
          CritSitActive: !!lastCrit && lastCrit.end === null, CritSitEndedOn: lastCrit && lastCrit.end !== null ? isoOf(lastCrit.end) : null,
          SeverityChangedOn: isoOf(s.sevAt), SeverityChangeDir: s.sevDir,
          RiskScore: prev.score === undefined ? null : prev.score, RedSince: prev.red || null
        };
        casesIn.push(cIn);
        if (full) {
          casesX.push(Object.assign({}, cIn, {
            SupportAreaPath: s.area, ServiceName: s.service, NextAction: next[0], NextActionOwner: next[1],
            EscalationStatus: cIn.CritSitActive ? "Active" : "None", CaseLink: s.link, LastMailLink: s.mail,
            SeverityKnown: !!s.sev, CreatedEstimated: !createdKnown, SLAMeasurable: slaMeasurable, AccountSource: meta[id] ? meta[id].accountSource : "",
            CustomerContacts: contacts, ContactMails: contactMails, EngineerMail: engineerMail, EngineerWrote: engineerWrote,
            CurrentOwnershipOn: isoOf(s.ownAt), LastAssignedEngineerReply: isoOf(s.ownReply),
            CustomerWaitingSince: isoOf(s.waitingSince), LastReopenedOn: isoOf(s.reopenedAt), FollowUpBall: ball
          }));
        }
      }

      // Customer voice: one signal per case, type and category; the latest wording is shown.
      const groups = {}, keys = [];
      s.sig.forEach((g) => { const k = g.x.type + "|" + g.x.category; if (!groups[k]) { groups[k] = { first: g, last: g, n: 0 }; keys.push(k); } groups[k].last = g; groups[k].n++; });
      keys.forEach((k, i) => {
        const g = groups[k], t0 = g.first.t, type = g.first.x.type, x = g.last.x;
        const ack = (s.lastMs !== null && s.lastMs > t0) || (s.lastTeam !== null && s.lastTeam > t0);
        const done = (endAt !== null && endAt >= t0) || T - Math.max(g.last.t, s.lastAct) > 14 * DAY;
        const due = type === "Complaint" ? bizAdd(t0, 1) : type === "Escalation Request" ? localDate(csctLocalDay(t0, CTX.tz)) : bizAdd(t0, 3);
        signals.push({
          Id: "SIG-" + id.slice(-6) + "-" + (i + 1), SignalType: type, Account: account, CaseId: id, Title: x.label + " - " + title,
          Source: "Case e-mail", ReceivedOn: isoOf(t0), CustomerContact: g.first.who, CustomerContactMail: g.first.whoMail || null,
          Category: type === "Additional Request" ? null : x.category, RequestType: type === "Additional Request" ? x.category : null,
          Priority: type === "Escalation Request" || g.first.sent === "Angry" ? "High" : "Medium", DueDate: due,
          Status: done ? "Resolved" : ack ? "In Progress" : "New", Verbatim: x.quote || null, DetectedBy: 'keyword "' + x.phrase + '"',
          Link: g.last.link, Occurrences: g.n
        });
      });

      // CritSit episodes are escalations raised by Microsoft Support (L3); readiness does not apply.
      s.crit.forEach((c, i) => {
        const end = c.end !== null ? c.end : endAt;
        escalations.push({
          Id: "CRIT-" + id.slice(-6) + (s.crit.length > 1 ? "-" + (i + 1) : ""), CaseId: id, Account: account, Title: title,
          TriggerRules: "E1", Level: "L3 - Critical Situation Management", Status: end !== null ? "Closed" : "Active",
          ProposedOn: isoOf(c.start), ApprovedOn: null, SubmittedOn: isoOf(c.start), EngagedOn: isoOf(c.start), ClosedOn: isoOf(end),
          MicrosoftContact: "Critical Situation Management", BusinessImpact: "", CustomerAsk: "Critical situation raised on the case",
          ReadinessPct: null, HoursToEngage: null, Outcome: c.end !== null ? "CritSit ended" : end !== null ? "Case closed" : "", Auto: true
        });
      });
    });
    const accountsIn = acctList.map((a) => ({
      Title: a.Title, CSMConcern: a.CSMConcern || "None", ContractEnd: a.ContractEnd || null, MIRPStatus: mirpEffective(a, T),
      AccountRiskScore: carry.accounts[a.Title] === undefined ? null : carry.accounts[a.Title]
    }));
    closed.sort((a, b) => String(b.ClosedOn).localeCompare(String(a.ClosedOn)));
    escalations.sort((a, b) => String(b.ProposedOn).localeCompare(String(a.ProposedOn)));
    return {
      input: {
        asOf: isoOf(T), config: SPEC.config, holidays: SPEC.holidays, cases: casesIn, accounts: accountsIn,
        signals: signals.map((x) => ({ Account: x.Account, CaseId: x.CaseId, SignalType: x.SignalType, Status: x.Status, Category: x.Category, DueDate: x.DueDate })),
        escalations: escalations.map((x) => ({ Account: x.Account, CaseId: x.CaseId, Status: x.Status }))
      },
      extra: { accounts: acctList, cases: casesX, closed: closed, signals: signals, escalations: escalations, events: events }
    };
  }

  // Scores the last 21 business days at 18:00 and carries each day's scores into the next run, then scores now.
  function runLive(snap, nowMs) {
    const today = csctLocalDay(nowMs, CTX.tz), days = [];
    let d = today;
    while (days.length < 21) { d--; if (csctIsBizDay(d, CTX)) { days.unshift(d); } }
    const point = (day, out) => { const dt = new Date(day * DAY); return { date: localDate(day), label: dt.getUTCDate() + " " + MON[dt.getUTCMonth()], red: out.summary.red, yellow: out.summary.yellow, green: out.summary.green, stalled: out.summary.stalled, open: out.summary.openCases }; };
    let carry = { cases: {}, accounts: {} };
    const trend = [];
    days.forEach((day) => {
      const out = csctRunEngine(foldAt(snap, day * DAY - CTX.tz * HOUR + 18 * HOUR, carry, false).input);
      carry = { cases: {}, accounts: {} };
      out.cases.forEach((c) => { carry.cases[c.CaseId] = { score: c.RiskScore, red: c.RedSince }; });
      out.accounts.forEach((a) => { carry.accounts[a.Title] = a.AccountRiskScore; });
      trend.push(point(day, out));
    });
    const f = foldAt(snap, nowMs, carry, true);
    trend.push(point(today, csctRunEngine(f.input)));
    f.trend = trend;
    f.publishSlots = pubSlots(snap.settings && snap.settings.publishTimes);
    return f;
  }

  // Structured findings for the end-of-day review; the Scout automation reads window.csctFindings() in the browser.
  function findings() {
    if (!OUT) { return null; }
    const since = CTX.asOfMs - 24 * 3600000;
    const pick = (c) => {
      const ci = caseIn[c.CaseId] || {};
      return {
        caseId: c.CaseId, account: c.Account, title: c.Title, severity: c.Severity, status: c.Status, ball: c.BallInCourt,
        risk: c.RiskLevel, score: c.RiskScore, trend: c.RiskTrend, newlyRed: !!c.NewlyRed, stall: c.StallType, sla: c.SLAStatus,
        idleBusinessDays: c.BizDaysIdle, daysOpen: c.DaysOpen, triggers: c.EscalationTriggers, suggestedLevel: c.SuggestedLevel,
        playbook: c.PlaybookId, action: c.RecommendedAction, drivers: drv(c).slice(0, 3).map((d) => d.label),
        engineer: ci.Engineer || "", lastMicrosoftUpdate: ci.LastMicrosoftUpdate || null, lastCustomerUpdate: ci.LastCustomerUpdate || null, nextAction: ci.NextAction || ""
      };
    };
    return {
      mode: MODE, asOf: D.input.asOf,
      summary: { open: S.openCases, red: S.red, yellow: S.yellow, green: S.green, stalled: S.stalled, slaBreached: S.slaBreached, candidates: S.candidates,
        activeEscalations: S.activeEscalations, openComplaints: S.openComplaints, openRequests: S.openRequests, overdueSignals: S.overdueSignals, accountsRed: S.accountsRed, accountsYellow: S.accountsYellow },
      cases: OUT.cases.map(pick),
      candidates: OUT.candidates.map((c) => ({ caseId: c.CaseId, account: c.Account, title: c.Title, triggers: c.TriggerLabels, level: c.Level, risk: c.RiskLevel, score: c.RiskScore })),
      signals: openSignals.map((s) => ({ type: s.SignalType, account: s.Account, caseId: s.CaseId, title: s.Title, category: s.Category || s.RequestType, received: s.ReceivedOn,
        due: s.DueDate, overdue: overdue(s.DueDate), status: s.Status, priority: s.Priority, contact: s.CustomerContact, contactMail: s.CustomerContactMail || null, quote: s.Verbatim || null, caseOpen: !!caseOut[s.CaseId] })),
      escalations: X.escalations.filter((e) => ["Closed", "De-escalated", "Dismissed"].indexOf(e.Status) < 0).map((e) => ({ caseId: e.CaseId, account: e.Account, level: e.Level, status: e.Status, since: e.ProposedOn })),
      accounts: OUT.accounts.filter((a) => a.AccountRAG !== "Green" || a.RiskTrend === "Worsening" || a.OpenComplaints || a.OpenRequests)
        .map((a) => ({ account: a.Title, rag: a.AccountRAG, score: a.AccountRiskScore, trend: a.RiskTrend, drivers: a.RiskDrivers })),
      newCases: X.cases.filter((c) => Date.parse(c.CreatedOn) >= since).map((c) => ({ caseId: c.CaseId, account: c.Account, title: c.Title, severity: c.Severity })),
      closedRecently: X.closed.filter((c) => c.Status === "Closed" && Date.parse(c.ClosedOn) >= since)
        .map((c) => ({ caseId: c.CaseId, account: c.Account, title: c.Title, status: c.Status, closedOn: c.ClosedOn, resolution: c.Resolution })),
      attention: MODE !== "snapshot" ? attentionFindings() : null
    };
  }
