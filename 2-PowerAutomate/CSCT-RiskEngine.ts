/**
 * Customer Success Control Tower (CSCT) - Risk Engine v1.0.0
 * ---------------------------------------------------------------------------
 * Office Script for Excel on the web (Automate > New script > paste > save as "CSCT-RiskEngine").
 * Called by Power Automate flow "CSCT F2 - Daily Risk Engine & Digest" through
 * Excel Online (Business) > "Run script", with one parameter: inputJson (string).
 *
 * The same logic (types stripped) powers the HTML prototype and is mirrored by the
 * Risk Simulator sheet in CSCT-Build-Kit.xlsx, so all three always agree.
 *
 * Scoring summary (all weights/thresholds come from the "CSCT Config" list; defaults below):
 *   Case Risk Score 0-100 = Severity + Momentum + Age + SLA/Commitments + Customer Voice + Exposure
 *   RAG: Green < 30 <= Yellow < 60 <= Red, then hard-Red overrides (R1-R5) and Yellow floors (Y1-Y6).
 *   Stall types: Microsoft-side, Blocked (Product Group), Customer-side, Process (no owner), Commitment missed.
 *   Escalation triggers E1-E11 -> suggested level L1-L4. Account score rolls up cases, signals, escalations.
 */

interface ConfigRow { Title: string; Value: string | number | null; }

interface CaseIn {
  CaseId: string;
  Title: string;
  Account: string | null;
  Severity: string;
  Status: string;
  BallInCourt: string | null;
  Engineer: string | null;
  ProductFamily: string | null;
  CreatedOn: string;
  FirstResponseOn: string | null;
  LastMicrosoftUpdate: string | null;
  LastCustomerUpdate: string | null;
  LastActivity: string | null;
  OwnershipChanges: number | null;
  ReopenCount: number | null;
  CustomerChasers: number | null;
  CustomerSentiment: string | null;
  BusinessImpact: string | null;
  ExecVisibility: boolean | null;
  NextActionDue: string | null;
  ResolutionETA: string | null;
  CritSitActive: boolean | null;
  CritSitEndedOn: string | null;
  SeverityChangedOn: string | null;
  SeverityChangeDir: string | null;
  RiskScore: number | null;
  RedSince: string | null;
  ItemId?: number | null;
  AccountItemId?: number | null;
  EscalationStatus?: string | null;
}

interface AccountIn {
  Title: string;
  CSMConcern: string | null;
  ContractEnd: string | null;
  MIRPStatus: string | null;
  AccountRiskScore: number | null;
  ItemId?: number | null;
}

interface SignalIn {
  Account: string | null;
  CaseId: string | null;
  SignalType: string;
  Status: string;
  Category: string | null;
  DueDate: string | null;
}

interface EscalationIn {
  Account: string | null;
  CaseId: string | null;
  Status: string;
}

interface EngineInput {
  asOf: string;
  config: ConfigRow[];
  holidays: string[] | null;
  cases: CaseIn[];
  accounts: AccountIn[];
  signals: SignalIn[];
  escalations: EscalationIn[];
}

interface Driver { factor: string; label: string; pts: number; }

/** Field map written to SharePoint with MERGE (Content-Type: application/json;odata=nometadata). */
interface SpPatch { [key: string]: string | number | boolean | null; }

interface SnapshotRow {
  Title: string;
  SnapshotDate: string;
  RowType: string;
  CaseId: string | null;
  AccountName: string;
  Severity: string | null;
  Status: string | null;
  RiskScore: number;
  RiskLevel: string;
  IsStalled: boolean;
  StallType: string | null;
  SLAStatus: string | null;
  EscalationStatus: string | null;
  DaysOpen: number | null;
}

interface CaseOut {
  ItemId: number | null;
  AccountItemId: number | null;
  CaseId: string;
  Title: string;
  Account: string;
  Severity: string;
  Status: string;
  BallInCourt: string;
  DaysOpen: number;
  BizDaysIdle: number;
  MsIdleBD: number;
  IdleSide: string;
  IsStalled: boolean;
  StallType: string;
  SLAStatus: string;
  PtsSeverity: number;
  PtsMomentum: number;
  PtsAge: number;
  PtsSLA: number;
  PtsVoice: number;
  PtsExposure: number;
  RiskScore: number;
  ScoreBand: string;
  RiskLevel: string;
  Overrides: string;
  Floors: string;
  RiskDrivers: string;
  Drivers: Driver[];
  EscalationTriggers: string;
  SuggestedLevel: string;
  PlaybookId: string;
  RecommendedAction: string;
  ComplaintOpen: boolean;
  RequestOpen: boolean;
  RequestOverdue: boolean;
  CustomerEscalationRequest: boolean;
  RiskScorePrev: number | null;
  RiskTrend: string;
  RedSince: string | null;
  NewlyRed: boolean;
  LastScored: string;
  SpPatch: SpPatch;
}

interface AccountOut {
  ItemId: number | null;
  Title: string;
  AccountRiskScore: number;
  AccountRAG: string;
  RiskDrivers: string;
  Overrides: string;
  OpenCases: number;
  OpenSev1A: number;
  RedCases: number;
  YellowCases: number;
  GreenCases: number;
  StalledCases: number;
  OpenComplaints: number;
  OpenRequests: number;
  OverdueRequests: number;
  ActiveEscalations: number;
  PatternAlert: string;
  AccountRiskScorePrev: number | null;
  RiskTrend: string;
  LastScored: string;
  SpPatch: SpPatch;
}

interface CandidateOut {
  CaseId: string;
  CaseItemId: number | null;
  AccountItemId: number | null;
  Account: string;
  Title: string;
  Triggers: string;
  TriggerList: string[];
  TriggerLabels: string;
  Level: string;
  RiskScore: number;
  RiskLevel: string;
}

interface TopItem { CaseId: string; Account: string; Title: string; RiskLevel: string; RiskScore: number; TopDriver: string; Action: string; }

interface SummaryOut {
  asOf: string;
  openCases: number;
  red: number;
  yellow: number;
  green: number;
  stalled: number;
  stalledMicrosoft: number;
  stalledCustomer: number;
  slaBreached: number;
  slaAtRisk: number;
  sev1A: number;
  candidates: number;
  activeEscalations: number;
  openComplaints: number;
  openRequests: number;
  overdueSignals: number;
  accountsRed: number;
  accountsYellow: number;
  newlyRed: string[];
  top: TopItem[];
  brief: string;
}

interface EngineOutput {
  engineVersion: string;
  asOf: string;
  cases: CaseOut[];
  accounts: AccountOut[];
  candidates: CandidateOut[];
  snapshots: SnapshotRow[];
  summary: SummaryOut;
}

interface Ctx { cfg: { [key: string]: number }; asOfMs: number; asOfDay: number; tz: number; holidays: number[]; asOfIso: string; }

const CSCT_ENGINE_VERSION: string = "1.0.0";

const CSCT_DEFAULTS: { [key: string]: number } = {
  TZ_OffsetHours: 3, BusinessHours_Start: 9, BusinessHours_End: 18,
  SLA_FirstResponse_Hours_Sev1: 1, SLA_FirstResponse_Hours_SevA: 1, SLA_FirstResponse_Hours_SevB: 2, SLA_FirstResponse_Hours_SevC: 4,
  Stall_BD_Sev1: 1, Stall_BD_SevA: 1, Stall_BD_SevB: 3, Stall_BD_SevC: 5,
  Stall_CustomerSide_BD: 5, Stall_CustomerSide_BD_SevA: 2,
  Age_Target_Days_Sev1: 3, Age_Target_Days_SevA: 7, Age_Target_Days_SevB: 14, Age_Target_Days_SevC: 30,
  RAG_Yellow_Min: 30, RAG_Red_Min: 60,
  W_Sev1: 35, W_SevA: 22, W_SevB: 12, W_SevC: 3,
  W_IdleHalf: 8, W_Idle1x: 18, W_Idle2x: 25, W_CustIdle1x: 6, W_CustIdle2x: 10, W_BlindSpot: 5, Cap_Momentum: 30,
  W_AgeHalf: 5, W_Age1x: 15, W_Age2x: 20,
  W_SLA_AwaitingFirst: 15, W_SLA_AtRisk: 5, W_SLA_Late: 5, W_NextActionOverdue: 8, W_ETAMissed: 8, Cap_SLA: 15,
  W_Frustrated: 8, W_Angry: 15, W_Complaint: 8, W_Chasers: 6, W_RequestOverdue: 4, Cap_Voice: 20,
  W_Exec: 8, W_ImpactHigh: 4, W_ImpactCritical: 8, W_Churn: 5, W_Reopen: 5, W_SevRaised: 5,
  W_AcctConcern: 3, W_AcctCritical: 6, W_Renewal: 3, Cap_Exposure: 15,
  Chasers_Min: 2, Churn_Min: 3, Floor_Age_Days: 30, Recent_Days: 7, Renewal_Window_Days: 90, Trend_Delta: 10,
  Pattern_Min_Cases: 3, Pattern_Window_Days: 14,
  A_WorstCaseFactor: 0.4, A_PerRed: 10, A_Cap_Red: 20, A_PerYellow: 3, A_Cap_Yellow: 9,
  A_PerEscalation: 10, A_Cap_Escalation: 15, A_PerComplaint: 6, A_Cap_Complaint: 12,
  A_PerOverdueRequest: 4, A_Cap_OverdueRequest: 8,
  A_Concern_Watch: 5, A_Concern_Concern: 12, A_Concern_Critical: 25, A_Renewal: 5, A_MIRP: 3, A_Pattern: 5
};

const CSCT_RULE_LABELS: { [key: string]: string } = {
  R1: "Sev 1 / Critical Situation active",
  R2: "Sev A with no Microsoft update beyond threshold",
  R3: "Awaiting first response past SLA",
  R4: "Customer explicitly requested escalation",
  R5: "Angry customer with executive visibility",
  Y1: "Open Sev A",
  Y2: "Open customer complaint",
  Y3: "Case is stalled",
  Y4: "Open 30+ days",
  Y5: "Critical Situation ended in the last 7 days",
  Y6: "First-response SLA breached",
  E1: "Sev 1 / CritSit engaged",
  E2: "Sev A stalled on Microsoft side",
  E3: "First response overdue (Sev 1/A/B)",
  E4: "Red for 2+ runs and not improving",
  E5: "Customer requested escalation",
  E6: "Executive visibility on a Red case",
  E7: "Aged 2x target with no resolution ETA",
  E8: "Ownership churn or repeated reopen",
  E9: "Account pattern: repeated cases in one product",
  E10: "Complaint about service quality",
  E11: "Customer chasing without Microsoft reply"
};

const CSCT_TRIGGER_LEVEL: { [key: string]: number } = { E1: 3, E2: 2, E3: 2, E4: 1, E5: 2, E6: 4, E7: 1, E8: 1, E9: 1, E10: 1, E11: 1 };

const CSCT_LEVEL_NAMES: string[] = [
  "L0 - Watch",
  "L1 - Engineer's manager / Technical Advisor",
  "L2 - Support escalation (duty manager / 24x7 Case Management)",
  "L3 - Critical Situation Management",
  "L4 - Executive alignment"
];

function csctToMs(s: string | null | undefined): number | null {
  if (s === null || s === undefined || s === "") { return null; }
  const t = Date.parse(s);
  return isNaN(t) ? null : t;
}

function csctLocalDay(ms: number, tz: number): number {
  return Math.floor((ms + tz * 3600000) / 86400000);
}

function csctDow(day: number): number {
  return (((day + 4) % 7) + 7) % 7;
}

function csctIsBizDay(day: number, ctx: Ctx): boolean {
  const d = csctDow(day);
  return d !== 0 && d !== 6 && ctx.holidays.indexOf(day) < 0;
}

/** Full business days strictly between the day of `fromMs` and the as-of day (today is not counted). */
function csctBizDaysSince(fromMs: number, ctx: Ctx): number {
  const start = csctLocalDay(fromMs, ctx.tz);
  let n = 0;
  const first = Math.max(start + 1, ctx.asOfDay - 400);
  for (let d = first; d < ctx.asOfDay; d++) {
    if (csctIsBizDay(d, ctx)) { n++; }
  }
  return n;
}

function csctCalDaysSince(fromMs: number, ctx: Ctx): number {
  return Math.max(0, ctx.asOfDay - csctLocalDay(fromMs, ctx.tz));
}

function csctBizHours(startMs: number, endMs: number, ctx: Ctx): number {
  if (endMs <= startMs) { return 0; }
  const bs = ctx.cfg["BusinessHours_Start"];
  const be = ctx.cfg["BusinessHours_End"];
  const startDay = csctLocalDay(startMs, ctx.tz);
  const endDay = Math.min(csctLocalDay(endMs, ctx.tz), startDay + 400);
  let total = 0;
  for (let d = startDay; d <= endDay; d++) {
    if (!csctIsBizDay(d, ctx)) { continue; }
    const midnightUtc = d * 86400000 - ctx.tz * 3600000;
    const s = Math.max(midnightUtc + bs * 3600000, startMs);
    const e = Math.min(midnightUtc + be * 3600000, endMs);
    if (e > s) { total += (e - s) / 3600000; }
  }
  return Math.round(total * 100) / 100;
}

function csctSevKey(sev: string | null): string {
  const k = (sev || "C").replace(/^sev(erity)?\s*/i, "").trim().toUpperCase();
  return (k === "1" || k === "A" || k === "B" || k === "C") ? k : "C";
}

function csctSevCfg(ctx: Ctx, prefix: string, k: string): number {
  return ctx.cfg[prefix + "Sev" + k];
}

function csctIsOpenCase(status: string | null): boolean {
  const s = (status || "").toLowerCase();
  return !(s === "resolved" || s === "closed" || s === "canceled" || s === "cancelled");
}

function csctIsOpenSignal(status: string | null): boolean {
  const s = (status || "").toLowerCase();
  return !(s === "resolved" || s === "closed" || s.indexOf("closed") === 0);
}

function csctIsActiveEscalation(status: string | null): boolean {
  const s = status || "";
  return s === "Pending Manager Approval" || s === "Approved" || s === "Submitted" || s === "Active";
}

function csctIsOpenEscalation(status: string | null): boolean {
  const s = status || "";
  return !(s === "Closed" || s === "Dismissed" || s === "De-escalated");
}

function csctBuildCtx(input: EngineInput): Ctx {
  const cfg: { [key: string]: number } = {};
  Object.keys(CSCT_DEFAULTS).forEach((key: string) => { cfg[key] = CSCT_DEFAULTS[key]; });
  (input.config || []).forEach((row: ConfigRow) => {
    const v = Number(row.Value);
    if (row.Title && row.Value !== null && row.Value !== "" && !isNaN(v)) { cfg[row.Title] = v; }
  });
  const tz = cfg["TZ_OffsetHours"];
  const asOfMs = csctToMs(input.asOf) ?? Date.now();
  const holidays: number[] = [];
  (input.holidays || []).forEach((h: string) => {
    const ms = csctToMs(h);
    if (ms !== null) { holidays.push(csctLocalDay(ms, tz)); }
  });
  return { cfg: cfg, asOfMs: asOfMs, asOfDay: csctLocalDay(asOfMs, tz), tz: tz, holidays: holidays, asOfIso: new Date(asOfMs).toISOString() };
}

function csctScoreCase(c: CaseIn, acct: AccountIn | null, signals: SignalIn[], ctx: Ctx): CaseOut {
  const cfg = ctx.cfg;
  const k = csctSevKey(c.Severity);
  const drivers: Driver[] = [];
  const add = (factor: string, label: string, pts: number): number => {
    if (pts > 0) { drivers.push({ factor: factor, label: label, pts: pts }); }
    return pts;
  };

  const createdMs = csctToMs(c.CreatedOn) ?? ctx.asOfMs;
  const daysOpen = csctCalDaysSince(createdMs, ctx);
  const lastMs = csctToMs(c.LastMicrosoftUpdate);
  const lastCust = csctToMs(c.LastCustomerUpdate);
  const lastAct = csctToMs(c.LastActivity);
  const visible = lastMs !== null || lastCust !== null;

  // Ball in court: explicit status wins, then the stored value, then the last correspondent.
  let ball = (c.BallInCourt || "").trim();
  if (ball === "" || ball === "Unknown") {
    if (!visible) { ball = "Unknown"; }
    else if (lastCust !== null && (lastMs === null || lastCust > lastMs)) { ball = "Microsoft"; }
    else { ball = "Customer"; }
  }
  const status = c.Status || "New";
  if (status === "Waiting on Customer") { ball = "Customer"; }
  if (status === "Waiting on Product Group") { ball = "Product Group"; }
  if (status === "Waiting on Microsoft") { ball = "Microsoft"; }
  const side = (ball === "Customer" || ball === "Partner") ? "Customer" : "Microsoft";

  // ---- Severity -------------------------------------------------------------
  const pSev = add("Severity", "Sev " + k + " base", cfg["W_Sev" + k]);

  // ---- Momentum / stall -----------------------------------------------------
  const T = csctSevCfg(ctx, "Stall_BD_", k);
  const msRef = lastMs ?? lastAct ?? createdMs;
  const corrRef = (lastMs !== null || lastCust !== null) ? Math.max(lastMs ?? 0, lastCust ?? 0) : (lastAct ?? createdMs);
  const msIdle = csctBizDaysSince(msRef, ctx);
  const custIdle = csctBizDaysSince(corrRef, ctx);
  let stallType = "None";
  let pMomBase = 0;
  let momLabel = "";
  if (side === "Microsoft") {
    const r = T > 0 ? msIdle / T : 0;
    if (r >= 2) { pMomBase = cfg["W_Idle2x"]; } else if (r >= 1) { pMomBase = cfg["W_Idle1x"]; } else if (r >= 0.5) { pMomBase = cfg["W_IdleHalf"]; }
    if (r >= 1) { stallType = ball === "Product Group" ? "Blocked (Product Group)" : "Microsoft-side"; }
    momLabel = "No Microsoft update for " + msIdle + " business day(s) (threshold " + T + ")";
  } else {
    const tc = (k === "1" || k === "A") ? cfg["Stall_CustomerSide_BD_SevA"] : cfg["Stall_CustomerSide_BD"];
    if (custIdle >= 2 * tc) { pMomBase = cfg["W_CustIdle2x"]; } else if (custIdle >= tc) { pMomBase = cfg["W_CustIdle1x"]; }
    if (custIdle >= tc) { stallType = "Customer-side"; }
    momLabel = "Awaiting customer for " + custIdle + " business day(s) (threshold " + tc + ")";
  }
  const eng = (c.Engineer || "").trim();
  const noOwner = eng === "" || eng.toLowerCase() === "(unassigned)";
  if (noOwner && csctBizDaysSince(createdMs, ctx) >= 1) {
    stallType = "Process (no owner)";
    if (pMomBase < cfg["W_Idle1x"]) { pMomBase = cfg["W_Idle1x"]; }
    momLabel = "No engineer assigned after " + csctBizDaysSince(createdMs, ctx) + " business day(s)";
  }
  let pMom = add("Momentum", momLabel, pMomBase);
  const blindSpot = !visible && csctBizDaysSince(createdMs, ctx) >= 1;
  if (blindSpot) { pMom += add("Momentum", "No case correspondence visible to CSM (blind spot)", cfg["W_BlindSpot"]); }
  pMom = Math.min(pMom, cfg["Cap_Momentum"]);

  // ---- Age ------------------------------------------------------------------
  const ageT = csctSevCfg(ctx, "Age_Target_Days_", k);
  const ar = ageT > 0 ? daysOpen / ageT : 0;
  const pAgeRaw = ar >= 2 ? cfg["W_Age2x"] : ar >= 1 ? cfg["W_Age1x"] : ar >= 0.5 ? cfg["W_AgeHalf"] : 0;
  const pAge = add("Age", "Open " + daysOpen + " day(s) vs " + ageT + "-day target", pAgeRaw);

  // ---- SLA & commitments ----------------------------------------------------
  const slaH = csctSevCfg(ctx, "SLA_FirstResponse_Hours_", k);
  const is24x7 = k === "1" || k === "A";
  const elapsedH = (endMs: number): number => is24x7 ? Math.max(0, (endMs - createdMs) / 3600000) : csctBizHours(createdMs, endMs, ctx);
  const frMs = csctToMs(c.FirstResponseOn);
  let slaStatus = "Met";
  let awaitingPastSla = false;
  let pSla = 0;
  if (frMs === null) {
    const e = elapsedH(ctx.asOfMs);
    if (e > slaH) {
      slaStatus = "Breached"; awaitingPastSla = true;
      pSla += add("SLA", "No first response after " + Math.round(e * 10) / 10 + "h (SLA " + slaH + "h)", cfg["W_SLA_AwaitingFirst"]);
    } else if (e >= 0.75 * slaH) {
      slaStatus = "At Risk";
      pSla += add("SLA", "First response due soon (" + Math.round(e * 10) / 10 + "h of " + slaH + "h)", cfg["W_SLA_AtRisk"]);
    } else { slaStatus = "Pending"; }
  } else if (elapsedH(frMs) > slaH) {
    slaStatus = "Late response";
    pSla += add("SLA", "First response was late", cfg["W_SLA_Late"]);
  }
  const naDue = csctToMs(c.NextActionDue);
  const eta = csctToMs(c.ResolutionETA);
  const naOverdue = naDue !== null && csctLocalDay(naDue, ctx.tz) < ctx.asOfDay;
  const etaMissed = eta !== null && csctLocalDay(eta, ctx.tz) < ctx.asOfDay;
  if (naOverdue) { pSla += add("SLA", "Next action overdue", cfg["W_NextActionOverdue"]); }
  if (etaMissed) { pSla += add("SLA", "Resolution ETA missed", cfg["W_ETAMissed"]); }
  pSla = Math.min(pSla, cfg["Cap_SLA"]);
  if (stallType === "None" && (naOverdue || etaMissed)) { stallType = "Commitment missed"; }

  // ---- Customer voice (derived from open signals on this case) --------------
  const caseSignals = signals.filter((s: SignalIn) => s.CaseId === c.CaseId && csctIsOpenSignal(s.Status));
  const complaintOpen = caseSignals.some((s: SignalIn) => s.SignalType === "Complaint");
  const escRequest = caseSignals.some((s: SignalIn) => s.SignalType === "Escalation Request");
  const requestOpen = caseSignals.some((s: SignalIn) => s.SignalType === "Additional Request");
  const requestOverdue = caseSignals.some((s: SignalIn) => {
    const due = csctToMs(s.DueDate);
    return s.SignalType === "Additional Request" && due !== null && csctLocalDay(due, ctx.tz) < ctx.asOfDay;
  });
  const qualityCats = ["Response time", "Engineer handling", "Communication", "Resolution quality"];
  const qualityComplaint = caseSignals.some((s: SignalIn) => s.SignalType === "Complaint" && qualityCats.indexOf(s.Category || "") >= 0);
  const sentiment = c.CustomerSentiment || "Neutral";
  const chasers = c.CustomerChasers || 0;
  let pVoice = 0;
  if (sentiment === "Angry") { pVoice += add("Voice", "Customer sentiment: Angry", cfg["W_Angry"]); }
  else if (sentiment === "Frustrated") { pVoice += add("Voice", "Customer sentiment: Frustrated", cfg["W_Frustrated"]); }
  if (complaintOpen) { pVoice += add("Voice", "Open complaint", cfg["W_Complaint"]); }
  if (chasers >= cfg["Chasers_Min"]) { pVoice += add("Voice", chasers + " customer follow-ups without Microsoft reply", cfg["W_Chasers"]); }
  if (requestOverdue) { pVoice += add("Voice", "Additional request overdue", cfg["W_RequestOverdue"]); }
  pVoice = Math.min(pVoice, cfg["Cap_Voice"]);

  // ---- Exposure & churn -----------------------------------------------------
  let pExp = 0;
  if (c.ExecVisibility) { pExp += add("Exposure", "Customer executive visibility", cfg["W_Exec"]); }
  if (c.BusinessImpact === "Critical") { pExp += add("Exposure", "Business impact: Critical", cfg["W_ImpactCritical"]); }
  else if (c.BusinessImpact === "High") { pExp += add("Exposure", "Business impact: High", cfg["W_ImpactHigh"]); }
  if ((c.OwnershipChanges || 0) >= cfg["Churn_Min"]) { pExp += add("Exposure", (c.OwnershipChanges || 0) + " ownership changes", cfg["W_Churn"]); }
  if ((c.ReopenCount || 0) >= 1) { pExp += add("Exposure", "Reopened " + (c.ReopenCount || 0) + "x", cfg["W_Reopen"]); }
  const sevChg = csctToMs(c.SeverityChangedOn);
  if (c.SeverityChangeDir === "Raised" && sevChg !== null && csctCalDaysSince(sevChg, ctx) <= cfg["Recent_Days"]) {
    pExp += add("Exposure", "Severity raised in last " + cfg["Recent_Days"] + " days", cfg["W_SevRaised"]);
  }
  const concern = acct ? (acct.CSMConcern || "None") : "None";
  if (concern === "Critical") { pExp += add("Exposure", "Account concern: Critical", cfg["W_AcctCritical"]); }
  else if (concern === "Concern") { pExp += add("Exposure", "Account concern: Concern", cfg["W_AcctConcern"]); }
  const contractEnd = acct ? csctToMs(acct.ContractEnd) : null;
  if (contractEnd !== null) {
    const daysToEnd = csctLocalDay(contractEnd, ctx.tz) - ctx.asOfDay;
    if (daysToEnd >= 0 && daysToEnd <= cfg["Renewal_Window_Days"]) { pExp += add("Exposure", "Contract ends in " + daysToEnd + " days", cfg["W_Renewal"]); }
  }
  pExp = Math.min(pExp, cfg["Cap_Exposure"]);

  // ---- Total, RAG, overrides and floors ------------------------------------
  const score = Math.min(100, Math.round(pSev + pMom + pAge + pSla + pVoice + pExp));
  const band = score >= cfg["RAG_Red_Min"] ? "Red" : score >= cfg["RAG_Yellow_Min"] ? "Yellow" : "Green";
  const overrides: string[] = [];
  const floors: string[] = [];
  const sevAStall = k === "A" && side === "Microsoft" && msIdle >= T;
  if (k === "1" || c.CritSitActive) { overrides.push("R1"); }
  if (sevAStall) { overrides.push("R2"); }
  if (awaitingPastSla && k !== "C") { overrides.push("R3"); }
  if (escRequest) { overrides.push("R4"); }
  if (sentiment === "Angry" && c.ExecVisibility) { overrides.push("R5"); }
  if (k === "A") { floors.push("Y1"); }
  if (complaintOpen) { floors.push("Y2"); }
  if (stallType !== "None") { floors.push("Y3"); }
  if (daysOpen >= cfg["Floor_Age_Days"]) { floors.push("Y4"); }
  const critEnd = csctToMs(c.CritSitEndedOn);
  if (!c.CritSitActive && critEnd !== null && csctCalDaysSince(critEnd, ctx) <= cfg["Recent_Days"]) { floors.push("Y5"); }
  if (awaitingPastSla) { floors.push("Y6"); }
  const level = (overrides.length > 0 || band === "Red") ? "Red" : ((band === "Yellow" || floors.length > 0) ? "Yellow" : "Green");

  // ---- Escalation triggers --------------------------------------------------
  const trig: string[] = [];
  if (k === "1" || c.CritSitActive) { trig.push("E1"); }
  if (sevAStall) { trig.push("E2"); }
  if (awaitingPastSla && k !== "C") { trig.push("E3"); }
  const prev = (c.RiskScore === null || c.RiskScore === undefined) ? null : c.RiskScore;
  if (level === "Red" && c.RedSince && (prev === null || score >= prev)) { trig.push("E4"); }
  if (escRequest) { trig.push("E5"); }
  if (c.ExecVisibility && level === "Red") { trig.push("E6"); }
  if (ar >= 2 && eta === null) { trig.push("E7"); }
  if ((c.OwnershipChanges || 0) >= cfg["Churn_Min"] || (c.ReopenCount || 0) >= 2) { trig.push("E8"); }
  if (qualityComplaint) { trig.push("E10"); }
  if (chasers >= cfg["Chasers_Min"] && side === "Microsoft") { trig.push("E11"); }
  let lvl = 0;
  let execAlign = false;
  trig.forEach((t: string) => {
    if (t === "E6") { execAlign = true; } else { lvl = Math.max(lvl, CSCT_TRIGGER_LEVEL[t] || 0); }
  });
  const suggested = trig.length === 0 ? "" : (lvl > 0 ? CSCT_LEVEL_NAMES[lvl] + (execAlign ? " + L4 executive alignment" : "") : CSCT_LEVEL_NAMES[4]);

  // ---- Recommended playbook -------------------------------------------------
  let pb = "PB-00";
  let action = level === "Green" ? "Standard monitoring - no action needed today." : "Watch: confirm next action, owner and ETA with the engineer.";
  if (k === "1" || c.CritSitActive) { pb = "PB-01"; action = "Critical situation: align with the CritSit manager, keep customer executives updated every 4 hours."; }
  else if (escRequest) { pb = "PB-04"; action = "Customer asked to escalate: build the escalation pack, get manager approval, submit at L2 today."; }
  else if (awaitingPastSla) { pb = "PB-03"; action = "First response overdue: contact the duty manager / 24x7 Case Management and inform the customer."; }
  else if (sevAStall) { pb = "PB-02"; action = "Sev A without update: engage the duty manager now and request an engineer update within 2 hours."; }
  else if (complaintOpen) { pb = "PB-07"; action = "Complaint open: acknowledge within 1 business day and agree a recovery plan with the engineer's manager."; }
  else if (stallType === "Process (no owner)") { pb = "PB-10"; action = "No owner: request engineer assignment through the duty manager."; }
  else if (blindSpot) { pb = "PB-13"; action = "Blind spot: check the case in the support portal and ask the engineer to CC you on updates."; }
  else if (stallType === "Blocked (Product Group)") { pb = "PB-05"; action = "Blocked on Product Group: ask for PG ETA and an interim workaround; if none in 1 business day go to L1."; }
  else if (stallType === "Microsoft-side") { pb = "PB-05"; action = "Nudge the engineer (template N1); no reply within 1 business day -> engineer's manager (L1)."; }
  else if (ar >= 2 && eta === null) { pb = "PB-09"; action = "Aging without a plan: request an action plan and ETA from the engineer's manager / TA."; }
  else if (stallType === "Customer-side") { pb = "PB-06"; action = "Nudge the customer (template C1); second nudge after 3 business days, then propose closure."; }
  else if (stallType === "Commitment missed") { pb = "PB-09"; action = "Commitment missed: reset next action / ETA with the engineer and update the customer."; }
  else if (requestOpen) { pb = "PB-08"; action = "Additional request open: route it, set owner and due date, confirm to the customer."; }
  else if ((c.OwnershipChanges || 0) >= cfg["Churn_Min"]) { pb = "PB-10"; action = "Ownership churn: ask for a single accountable owner and a handover summary."; }

  const trend = prev === null ? "New" : (score - prev >= cfg["Trend_Delta"] ? "Worsening" : (prev - score >= cfg["Trend_Delta"] ? "Improving" : "Stable"));
  const sortedDrivers = drivers.slice().sort((a: Driver, b: Driver) => b.pts - a.pts);
  const driverText = sortedDrivers.map((d: Driver) => d.label + " (+" + d.pts + ")").join("; ")
    + (overrides.length ? " | Override: " + overrides.map((o: string) => o + " " + CSCT_RULE_LABELS[o]).join(", ") : "")
    + (!overrides.length && floors.length && band !== "Red" && band !== "Yellow" ? " | Floor: " + floors.map((f: string) => f + " " + CSCT_RULE_LABELS[f]).join(", ") : "");
  const wasRed = c.RedSince !== null && c.RedSince !== undefined && c.RedSince !== "";

  return {
    CaseId: c.CaseId, Title: c.Title, Account: c.Account || "(unmapped)", Severity: "Sev " + k, Status: status,
    BallInCourt: ball, DaysOpen: daysOpen, BizDaysIdle: side === "Microsoft" ? msIdle : custIdle, MsIdleBD: msIdle, IdleSide: side,
    IsStalled: stallType !== "None", StallType: stallType, SLAStatus: slaStatus,
    PtsSeverity: pSev, PtsMomentum: pMom, PtsAge: pAge, PtsSLA: pSla, PtsVoice: pVoice, PtsExposure: pExp,
    RiskScore: score, ScoreBand: band, RiskLevel: level, Overrides: overrides.join("; "), Floors: floors.join("; "),
    RiskDrivers: driverText, Drivers: sortedDrivers,
    EscalationTriggers: trig.join("; "), SuggestedLevel: suggested,
    PlaybookId: pb, RecommendedAction: action,
    ComplaintOpen: complaintOpen, RequestOpen: requestOpen, RequestOverdue: requestOverdue, CustomerEscalationRequest: escRequest,
    RiskScorePrev: prev, RiskTrend: trend,
    RedSince: level === "Red" ? (wasRed ? (c.RedSince as string) : ctx.asOfIso) : null,
    NewlyRed: level === "Red" && !wasRed, LastScored: ctx.asOfIso
  };
}

function csctScoreAccount(a: AccountIn, caseOuts: CaseOut[], casesIn: CaseIn[], signals: SignalIn[], escalations: EscalationIn[], ctx: Ctx): AccountOut {
  const cfg = ctx.cfg;
  const mine = caseOuts.filter((c: CaseOut) => c.Account === a.Title);
  const mineIn = casesIn.filter((c: CaseIn) => (c.Account || "") === a.Title && csctIsOpenCase(c.Status));
  const sig = signals.filter((s: SignalIn) => (s.Account || "") === a.Title && csctIsOpenSignal(s.Status));
  const esc = escalations.filter((e: EscalationIn) => (e.Account || "") === a.Title && csctIsActiveEscalation(e.Status));
  const red = mine.filter((c: CaseOut) => c.RiskLevel === "Red").length;
  const yellow = mine.filter((c: CaseOut) => c.RiskLevel === "Yellow").length;
  const green = mine.length - red - yellow;
  const stalled = mine.filter((c: CaseOut) => c.IsStalled).length;
  const sev1a = mine.filter((c: CaseOut) => c.Severity === "Sev 1" || c.Severity === "Sev A").length;
  const complaints = sig.filter((s: SignalIn) => s.SignalType === "Complaint").length;
  const requests = sig.filter((s: SignalIn) => s.SignalType === "Additional Request").length;
  const overdueReq = sig.filter((s: SignalIn) => {
    const due = csctToMs(s.DueDate);
    return s.SignalType === "Additional Request" && due !== null && csctLocalDay(due, ctx.tz) < ctx.asOfDay;
  }).length;
  const worst = mine.reduce((m: number, c: CaseOut) => Math.max(m, c.RiskScore), 0);

  // Pattern: N+ open cases in the same product family created within the window.
  const counts: { [key: string]: number } = {};
  mineIn.forEach((c: CaseIn) => {
    const created = csctToMs(c.CreatedOn);
    if (created !== null && csctCalDaysSince(created, ctx) <= cfg["Pattern_Window_Days"]) {
      const fam = c.ProductFamily || "Other";
      counts[fam] = (counts[fam] || 0) + 1;
    }
  });
  let pattern = "";
  Object.keys(counts).forEach((fam: string) => {
    if (counts[fam] >= cfg["Pattern_Min_Cases"] && pattern === "") {
      pattern = counts[fam] + " open " + fam + " cases in " + cfg["Pattern_Window_Days"] + " days";
    }
  });

  const parts: Driver[] = [];
  const addA = (label: string, pts: number): number => { if (pts > 0) { parts.push({ factor: "Account", label: label, pts: pts }); } return pts; };
  let pts = 0;
  pts += addA("Worst case score " + worst, Math.round(worst * cfg["A_WorstCaseFactor"]));
  pts += addA(red + " Red case(s)", Math.min(cfg["A_Cap_Red"], red * cfg["A_PerRed"]));
  pts += addA(yellow + " Yellow case(s)", Math.min(cfg["A_Cap_Yellow"], yellow * cfg["A_PerYellow"]));
  pts += addA(esc.length + " active escalation(s)", Math.min(cfg["A_Cap_Escalation"], esc.length * cfg["A_PerEscalation"]));
  pts += addA(complaints + " open complaint(s)", Math.min(cfg["A_Cap_Complaint"], complaints * cfg["A_PerComplaint"]));
  pts += addA(overdueReq + " overdue request(s)", Math.min(cfg["A_Cap_OverdueRequest"], overdueReq * cfg["A_PerOverdueRequest"]));
  const concern = a.CSMConcern || "None";
  if (concern === "Watch") { pts += addA("CSM concern: Watch", cfg["A_Concern_Watch"]); }
  if (concern === "Concern") { pts += addA("CSM concern: Concern", cfg["A_Concern_Concern"]); }
  if (concern === "Critical") { pts += addA("CSM concern: Critical", cfg["A_Concern_Critical"]); }
  const end = csctToMs(a.ContractEnd);
  if (end !== null) {
    const d = csctLocalDay(end, ctx.tz) - ctx.asOfDay;
    if (d >= 0 && d <= cfg["Renewal_Window_Days"] && red + yellow > 0) { pts += addA("Contract ends in " + d + " days with open risk", cfg["A_Renewal"]); }
  }
  const mirp = a.MIRPStatus || "";
  if (mirp === "Not Started" || mirp === "Pending" || mirp === "Expired") { pts += addA("MIRP " + mirp.toLowerCase(), cfg["A_MIRP"]); }
  if (pattern !== "") { pts += addA("Pattern: " + pattern, cfg["A_Pattern"]); }
  const score = Math.min(100, Math.round(pts));

  const ov: string[] = [];
  if (red >= 2) { ov.push("2+ Red cases"); }
  if (mine.some((c: CaseOut) => c.RiskLevel === "Red" && c.EscalationTriggers.indexOf("E6") >= 0)) { ov.push("Red case with executive visibility"); }
  if (mine.some((c: CaseOut) => c.Overrides.indexOf("R1") >= 0)) { ov.push("Sev 1 / CritSit active"); }
  if (concern === "Critical") { ov.push("CSM concern Critical"); }
  const floor = red >= 1 || concern === "Concern" || complaints >= 1 || pattern !== "";
  const band = score >= cfg["RAG_Red_Min"] ? "Red" : score >= cfg["RAG_Yellow_Min"] ? "Yellow" : "Green";
  const rag = (ov.length > 0 || band === "Red") ? "Red" : ((band === "Yellow" || floor) ? "Yellow" : "Green");
  const prev = (a.AccountRiskScore === null || a.AccountRiskScore === undefined) ? null : a.AccountRiskScore;
  const trend = prev === null ? "New" : (score - prev >= cfg["Trend_Delta"] ? "Worsening" : (prev - score >= cfg["Trend_Delta"] ? "Improving" : "Stable"));
  const text = parts.sort((x: Driver, y: Driver) => y.pts - x.pts).map((d: Driver) => d.label + " (+" + d.pts + ")").join("; ")
    + (ov.length ? " | Override: " + ov.join(", ") : "");

  return {
    Title: a.Title, AccountRiskScore: score, AccountRAG: rag, RiskDrivers: text, Overrides: ov.join("; "),
    OpenCases: mine.length, OpenSev1A: sev1a, RedCases: red, YellowCases: yellow, GreenCases: green, StalledCases: stalled,
    OpenComplaints: complaints, OpenRequests: requests, OverdueRequests: overdueReq, ActiveEscalations: esc.length,
    PatternAlert: pattern, AccountRiskScorePrev: prev, RiskTrend: trend, LastScored: ctx.asOfIso
  };
}

function csctRunEngine(input: EngineInput): EngineOutput {
  const ctx = csctBuildCtx(input);
  const accounts = input.accounts || [];
  const signals = input.signals || [];
  const escalations = input.escalations || [];
  const openCases = (input.cases || []).filter((c: CaseIn) => csctIsOpenCase(c.Status));
  const byName: { [key: string]: AccountIn } = {};
  accounts.forEach((a: AccountIn) => { byName[a.Title] = a; });

  const caseOuts = openCases.map((c: CaseIn) => csctScoreCase(c, byName[c.Account || ""] || null, signals, ctx))
    .sort((a: CaseOut, b: CaseOut) => b.RiskScore - a.RiskScore);
  const accountOuts = accounts.map((a: AccountIn) => csctScoreAccount(a, caseOuts, openCases, signals, escalations, ctx))
    .sort((a: AccountOut, b: AccountOut) => b.AccountRiskScore - a.AccountRiskScore);

  const candidates: CandidateOut[] = [];
  caseOuts.forEach((c: CaseOut) => {
    if (c.EscalationTriggers === "") { return; }
    const hasOpen = escalations.some((e: EscalationIn) => e.CaseId === c.CaseId && csctIsOpenEscalation(e.Status));
    if (hasOpen) { return; }
    const ids = c.EscalationTriggers.split("; ");
    candidates.push({
      CaseId: c.CaseId, Account: c.Account, Title: c.Title, Triggers: c.EscalationTriggers,
      TriggerLabels: ids.map((t: string) => t + " " + CSCT_RULE_LABELS[t]).join("; "),
      Level: c.SuggestedLevel, RiskScore: c.RiskScore, RiskLevel: c.RiskLevel
    });
  });

  const openSignals = signals.filter((s: SignalIn) => csctIsOpenSignal(s.Status));
  const summary: SummaryOut = {
    asOf: ctx.asOfIso,
    openCases: caseOuts.length,
    red: caseOuts.filter((c: CaseOut) => c.RiskLevel === "Red").length,
    yellow: caseOuts.filter((c: CaseOut) => c.RiskLevel === "Yellow").length,
    green: caseOuts.filter((c: CaseOut) => c.RiskLevel === "Green").length,
    stalled: caseOuts.filter((c: CaseOut) => c.IsStalled).length,
    stalledMicrosoft: caseOuts.filter((c: CaseOut) => c.StallType === "Microsoft-side" || c.StallType === "Blocked (Product Group)" || c.StallType === "Process (no owner)").length,
    stalledCustomer: caseOuts.filter((c: CaseOut) => c.StallType === "Customer-side").length,
    slaBreached: caseOuts.filter((c: CaseOut) => c.SLAStatus === "Breached").length,
    slaAtRisk: caseOuts.filter((c: CaseOut) => c.SLAStatus === "At Risk").length,
    sev1A: caseOuts.filter((c: CaseOut) => c.Severity === "Sev 1" || c.Severity === "Sev A").length,
    candidates: candidates.length,
    activeEscalations: escalations.filter((e: EscalationIn) => csctIsActiveEscalation(e.Status)).length,
    openComplaints: openSignals.filter((s: SignalIn) => s.SignalType === "Complaint").length,
    openRequests: openSignals.filter((s: SignalIn) => s.SignalType === "Additional Request").length,
    overdueSignals: openSignals.filter((s: SignalIn) => {
      const due = csctToMs(s.DueDate);
      return due !== null && csctLocalDay(due, ctx.tz) < ctx.asOfDay;
    }).length,
    accountsRed: accountOuts.filter((a: AccountOut) => a.AccountRAG === "Red").length,
    accountsYellow: accountOuts.filter((a: AccountOut) => a.AccountRAG === "Yellow").length,
    newlyRed: caseOuts.filter((c: CaseOut) => c.NewlyRed).map((c: CaseOut) => c.CaseId),
    top: caseOuts.slice(0, 5).map((c: CaseOut) => {
      const nonSev = c.Drivers.filter((d: Driver) => d.factor !== "Severity");
      return {
        CaseId: c.CaseId, Account: c.Account, Title: c.Title, RiskLevel: c.RiskLevel, RiskScore: c.RiskScore,
        TopDriver: nonSev.length ? nonSev[0].label : (c.Drivers.length ? c.Drivers[0].label : ""), Action: c.RecommendedAction
      };
    })
  };
  return { engineVersion: CSCT_ENGINE_VERSION, asOf: ctx.asOfIso, cases: caseOuts, accounts: accountOuts, candidates: candidates, summary: summary };
}

/**
 * Office Script entry point. Power Automate passes the JSON produced by the flow's Compose step:
 * { asOf, config[], holidays[], cases[], accounts[], signals[], escalations[] } and parses the returned JSON.
 * If the workbook contains a table named "RunLog", one audit row is appended per run.
 */
function main(workbook: ExcelScript.Workbook, inputJson: string): string {
  const input = JSON.parse(inputJson) as EngineInput;
  const out = csctRunEngine(input);
  const log = workbook.getTable("RunLog");
  if (log) {
    log.addRow(-1, [out.asOf, out.summary.openCases, out.summary.red, out.summary.yellow, out.summary.green,
      out.summary.stalled, out.summary.candidates, CSCT_ENGINE_VERSION]);
  }
  return JSON.stringify(out);
}
