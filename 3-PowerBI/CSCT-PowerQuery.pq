// ============================================================================================
// Customer Success Control Tower - Power Query (M) for Power BI Desktop
// Home > Transform data > New Source > Blank Query, open Advanced Editor, paste ONE block per query,
// and name each query exactly as in its header comment (SiteUrl, fnCsctFlatten, Accounts, Cases, ...).
// Connector: SharePoint Online list 2.0 (display names). If the navigation step fails in your tenant,
// use Home > Get data > SharePoint Online list, pick the list, then keep the Keep/Renamed/Flat/Typed steps.
// ============================================================================================

// ---- SiteUrl  (Manage Parameters > New parameter, Type = Text)
"https://<tenant>.sharepoint.com/sites/CSControlTower" meta [IsParameterQuery = true, Type = "Text", IsParameterQueryRequired = true]

// ---- fnCsctFlatten  (turns lookup / person / multi-choice records and lists into plain text)
(t as table) as table =>
    Table.TransformColumns(
        t,
        List.Transform(
            Table.ColumnNames(t),
            (c) => {c, each
                if _ is record then Record.FieldOrDefault(_, "Title", Record.FieldOrDefault(_, "Value", null))
                else if _ is list then Text.Combine(List.Transform(_, (x) => if x is record then Text.From(Record.FieldOrDefault(x, "Title", Record.FieldOrDefault(x, "Value", ""))) else Text.From(x)), "; ")
                else _}
        )
    )

// ---- Accounts  (SharePoint list "CSCT Accounts")
let
    Source = SharePoint.Tables(SiteUrl, [Implementation = "2.0", ViewMode = "All"]),
    Raw = Source{[Title = "CSCT Accounts"]}[Items],
    Keep = Table.SelectColumns(Raw, {"Account", "Account ID", "Match Aliases", "Parent Group", "Segment", "Industry", "Tier", "Contract", "Contract End", "CSM Owner", "Microsoft Exec Sponsor", "Customer Exec Sponsor", "Key Contacts", "CSM Concern", "Concern Note", "MIRP Status", "Last Touchpoint", "Next Touchpoint", "Account Risk Score", "Account RAG", "Account Risk Drivers", "Account Trend", "Open Cases", "Red Cases", "Stalled Cases", "Open Complaints", "Active Escalations", "Pattern Alert", "Last Scored"}, MissingField.UseNull),
    Renamed = Table.RenameColumns(Keep, {{"Account", "Title"}, {"Account ID", "AccountId"}, {"Match Aliases", "Aliases"}, {"Parent Group", "ParentGroup"}, {"Tier", "StrategicTier"}, {"Contract", "ContractType"}, {"Contract End", "ContractEnd"}, {"CSM Owner", "CSMOwner"}, {"Microsoft Exec Sponsor", "MicrosoftExecSponsor"}, {"Customer Exec Sponsor", "CustomerExecSponsor"}, {"Key Contacts", "KeyContacts"}, {"CSM Concern", "CSMConcern"}, {"Concern Note", "CSMConcernNote"}, {"MIRP Status", "MIRPStatus"}, {"Last Touchpoint", "LastTouchpoint"}, {"Next Touchpoint", "NextTouchpoint"}, {"Account Risk Score", "AccountRiskScore"}, {"Account RAG", "AccountRAG"}, {"Account Risk Drivers", "AccountRiskDrivers"}, {"Account Trend", "AccountRiskTrend"}, {"Open Cases", "OpenCases"}, {"Red Cases", "RedCases"}, {"Stalled Cases", "StalledCases"}, {"Open Complaints", "OpenComplaints"}, {"Active Escalations", "ActiveEscalations"}, {"Pattern Alert", "PatternAlert"}, {"Last Scored", "LastScored"}}, MissingField.Ignore),
    Flat = fnCsctFlatten(Renamed),
    Typed = Table.TransformColumnTypes(Flat, {{"Title", type text}, {"AccountId", type text}, {"Aliases", type text}, {"ParentGroup", type text}, {"Segment", type text}, {"Industry", type text}, {"StrategicTier", type text}, {"ContractType", type text}, {"ContractEnd", type date}, {"CSMOwner", type text}, {"MicrosoftExecSponsor", type text}, {"CustomerExecSponsor", type text}, {"KeyContacts", type text}, {"CSMConcern", type text}, {"CSMConcernNote", type text}, {"MIRPStatus", type text}, {"LastTouchpoint", type date}, {"NextTouchpoint", type date}, {"AccountRiskScore", Int64.Type}, {"AccountRAG", type text}, {"AccountRiskDrivers", type text}, {"AccountRiskTrend", type text}, {"OpenCases", Int64.Type}, {"RedCases", Int64.Type}, {"StalledCases", Int64.Type}, {"OpenComplaints", Int64.Type}, {"ActiveEscalations", Int64.Type}, {"PatternAlert", type text}, {"LastScored", type datetime}})
in
    Typed

// ---- Cases  (SharePoint list "CSCT Cases")
let
    Source = SharePoint.Tables(SiteUrl, [Implementation = "2.0", ViewMode = "All"]),
    Raw = Source{[Title = "CSCT Cases"]}[Items],
    Keep = Table.SelectColumns(Raw, {"Case Title", "Case ID", "Account", "Customer (as notified)", "Severity", "Support Area Path", "Product Family", "Service", "Status", "Is Open", "Ball In Court", "Engineer", "Ownership Changes", "Reopen Count", "Created On", "First Response On", "Last Microsoft Update", "Last Customer Update", "Last Internal Update", "Last Activity", "Customer Chasers", "Severity Changed On", "Severity Change", "CritSit Active", "CritSit Ended On", "Customer Sentiment", "Business Impact", "Exec Visibility", "Next Action", "Next Action Owner", "Next Action Due", "Resolution ETA", "Escalation Status", "Risk Score", "Risk Level", "Pts Severity", "Pts Momentum", "Pts Age", "Pts SLA", "Pts Voice", "Pts Exposure", "Risk Drivers", "Previous Score", "Risk Trend", "Red Since", "Days Open", "Idle (business days)", "Stalled", "Stall Type", "SLA Status", "Escalation Triggers", "Suggested Level", "Playbook", "Recommended Action", "Complaint Open", "Request Open", "Last Scored", "Last Reviewed", "CSM Notes", "Case Link", "Closed On", "Resolution", "Source"}, MissingField.UseNull),
    Renamed = Table.RenameColumns(Keep, {{"Case Title", "Title"}, {"Case ID", "CaseId"}, {"Customer (as notified)", "CustomerNameRaw"}, {"Support Area Path", "SupportAreaPath"}, {"Product Family", "ProductFamily"}, {"Service", "ServiceName"}, {"Is Open", "IsOpen"}, {"Ball In Court", "BallInCourt"}, {"Ownership Changes", "OwnershipChanges"}, {"Reopen Count", "ReopenCount"}, {"Created On", "CreatedOn"}, {"First Response On", "FirstResponseOn"}, {"Last Microsoft Update", "LastMicrosoftUpdate"}, {"Last Customer Update", "LastCustomerUpdate"}, {"Last Internal Update", "LastInternalUpdate"}, {"Last Activity", "LastActivity"}, {"Customer Chasers", "CustomerChasers"}, {"Severity Changed On", "SeverityChangedOn"}, {"Severity Change", "SeverityChangeDir"}, {"CritSit Active", "CritSitActive"}, {"CritSit Ended On", "CritSitEndedOn"}, {"Customer Sentiment", "CustomerSentiment"}, {"Business Impact", "BusinessImpact"}, {"Exec Visibility", "ExecVisibility"}, {"Next Action", "NextAction"}, {"Next Action Owner", "NextActionOwner"}, {"Next Action Due", "NextActionDue"}, {"Resolution ETA", "ResolutionETA"}, {"Escalation Status", "EscalationStatus"}, {"Risk Score", "RiskScore"}, {"Risk Level", "RiskLevel"}, {"Pts Severity", "PtsSeverity"}, {"Pts Momentum", "PtsMomentum"}, {"Pts Age", "PtsAge"}, {"Pts SLA", "PtsSLA"}, {"Pts Voice", "PtsVoice"}, {"Pts Exposure", "PtsExposure"}, {"Risk Drivers", "RiskDrivers"}, {"Previous Score", "RiskScorePrev"}, {"Risk Trend", "RiskTrend"}, {"Red Since", "RedSince"}, {"Days Open", "DaysOpen"}, {"Idle (business days)", "BizDaysIdle"}, {"Stalled", "IsStalled"}, {"Stall Type", "StallType"}, {"SLA Status", "SLAStatus"}, {"Escalation Triggers", "EscalationTriggers"}, {"Suggested Level", "SuggestedLevel"}, {"Playbook", "PlaybookId"}, {"Recommended Action", "RecommendedAction"}, {"Complaint Open", "ComplaintOpen"}, {"Request Open", "RequestOpen"}, {"Last Scored", "LastScored"}, {"Last Reviewed", "LastReviewed"}, {"CSM Notes", "CSMNotes"}, {"Case Link", "CaseLink"}, {"Closed On", "ClosedOn"}}, MissingField.Ignore),
    Flat = fnCsctFlatten(Renamed),
    Typed = Table.TransformColumnTypes(Flat, {{"Title", type text}, {"CaseId", type text}, {"Account", type text}, {"CustomerNameRaw", type text}, {"Severity", type text}, {"SupportAreaPath", type text}, {"ProductFamily", type text}, {"ServiceName", type text}, {"Status", type text}, {"IsOpen", type logical}, {"BallInCourt", type text}, {"Engineer", type text}, {"OwnershipChanges", Int64.Type}, {"ReopenCount", Int64.Type}, {"CreatedOn", type datetime}, {"FirstResponseOn", type datetime}, {"LastMicrosoftUpdate", type datetime}, {"LastCustomerUpdate", type datetime}, {"LastInternalUpdate", type datetime}, {"LastActivity", type datetime}, {"CustomerChasers", Int64.Type}, {"SeverityChangedOn", type datetime}, {"SeverityChangeDir", type text}, {"CritSitActive", type logical}, {"CritSitEndedOn", type datetime}, {"CustomerSentiment", type text}, {"BusinessImpact", type text}, {"ExecVisibility", type logical}, {"NextAction", type text}, {"NextActionOwner", type text}, {"NextActionDue", type date}, {"ResolutionETA", type date}, {"EscalationStatus", type text}, {"RiskScore", Int64.Type}, {"RiskLevel", type text}, {"PtsSeverity", Int64.Type}, {"PtsMomentum", Int64.Type}, {"PtsAge", Int64.Type}, {"PtsSLA", Int64.Type}, {"PtsVoice", Int64.Type}, {"PtsExposure", Int64.Type}, {"RiskDrivers", type text}, {"RiskScorePrev", Int64.Type}, {"RiskTrend", type text}, {"RedSince", type datetime}, {"DaysOpen", Int64.Type}, {"BizDaysIdle", Int64.Type}, {"IsStalled", type logical}, {"StallType", type text}, {"SLAStatus", type text}, {"EscalationTriggers", type text}, {"SuggestedLevel", type text}, {"PlaybookId", type text}, {"RecommendedAction", type text}, {"ComplaintOpen", type logical}, {"RequestOpen", type logical}, {"LastScored", type datetime}, {"LastReviewed", type datetime}, {"CSMNotes", type text}, {"CaseLink", type text}, {"ClosedOn", type datetime}, {"Resolution", type text}, {"Source", type text}}),
    Keyed = Table.AddColumn(Typed, "CaseKey", each [CaseId], type text)
in
    Keyed

// ---- CaseEvents  (SharePoint list "CSCT Case Events")
let
    Source = SharePoint.Tables(SiteUrl, [Implementation = "2.0", ViewMode = "All"]),
    Raw = Source{[Title = "CSCT Case Events"]}[Items],
    Keep = Table.SelectColumns(Raw, {"Subject", "Case ID", "Event Type", "Event Time", "Actor", "Actor Side", "From", "To", "Snippet", "Classification", "Sentiment", "Message Link"}, MissingField.UseNull),
    Renamed = Table.RenameColumns(Keep, {{"Subject", "Title"}, {"Case ID", "CaseId"}, {"Event Type", "EventType"}, {"Event Time", "EventTime"}, {"Actor Side", "ActorSide"}, {"From", "FromValue"}, {"To", "ToValue"}, {"Message Link", "MessageLink"}}, MissingField.Ignore),
    Flat = fnCsctFlatten(Renamed),
    Typed = Table.TransformColumnTypes(Flat, {{"Title", type text}, {"CaseId", type text}, {"EventType", type text}, {"EventTime", type datetime}, {"Actor", type text}, {"ActorSide", type text}, {"FromValue", type text}, {"ToValue", type text}, {"Snippet", type text}, {"Classification", type text}, {"Sentiment", type text}, {"MessageLink", type text}})
in
    Typed

// ---- Signals  (SharePoint list "CSCT Signals")
let
    Source = SharePoint.Tables(SiteUrl, [Implementation = "2.0", ViewMode = "All"]),
    Raw = Source{[Title = "CSCT Signals"]}[Items],
    Keep = Table.SelectColumns(Raw, {"Summary", "Signal Type", "Account", "Case ID", "Source", "Received On", "Customer Contact", "Category", "Request Type", "Priority", "Owner", "Due Date", "Status", "Is Open", "Acknowledged On", "Resolved On", "Customer Verbatim", "Resolution", "Detected By"}, MissingField.UseNull),
    Renamed = Table.RenameColumns(Keep, {{"Summary", "Title"}, {"Signal Type", "SignalType"}, {"Case ID", "CaseId"}, {"Received On", "ReceivedOn"}, {"Customer Contact", "CustomerContact"}, {"Request Type", "RequestType"}, {"Due Date", "DueDate"}, {"Is Open", "IsOpen"}, {"Acknowledged On", "AcknowledgedOn"}, {"Resolved On", "ResolvedOn"}, {"Customer Verbatim", "Verbatim"}, {"Detected By", "DetectedBy"}}, MissingField.Ignore),
    Flat = fnCsctFlatten(Renamed),
    Typed = Table.TransformColumnTypes(Flat, {{"Title", type text}, {"SignalType", type text}, {"Account", type text}, {"CaseId", type text}, {"Source", type text}, {"ReceivedOn", type datetime}, {"CustomerContact", type text}, {"Category", type text}, {"RequestType", type text}, {"Priority", type text}, {"Owner", type text}, {"DueDate", type date}, {"Status", type text}, {"IsOpen", type logical}, {"AcknowledgedOn", type datetime}, {"ResolvedOn", type datetime}, {"Verbatim", type text}, {"Resolution", type text}, {"DetectedBy", type text}})
in
    Typed

// ---- Escalations  (SharePoint list "CSCT Escalations")
let
    Source = SharePoint.Tables(SiteUrl, [Implementation = "2.0", ViewMode = "All"]),
    Raw = Source{[Title = "CSCT Escalations"]}[Items],
    Keep = Table.SelectColumns(Raw, {"Escalation Summary", "Case ID", "Account", "Trigger Rules", "Level", "Status", "Is Open", "Proposed On", "Approved By", "Approved On", "Submitted On", "Engaged On", "Closed On", "Microsoft Escalation Contact", "Business Impact Statement", "Customer Ask", "Timeline Summary", "Ready: Impact", "Ready: Timeline", "Ready: Tech Status", "Ready: Ask", "Ready: Contacts", "Ready: Exec Aware", "Ready: Manager Approval", "Readiness %", "Hours to Engage", "De-escalation Criteria", "Outcome", "Lessons Learned"}, MissingField.UseNull),
    Renamed = Table.RenameColumns(Keep, {{"Escalation Summary", "Title"}, {"Case ID", "CaseId"}, {"Trigger Rules", "TriggerRules"}, {"Is Open", "IsOpen"}, {"Proposed On", "ProposedOn"}, {"Approved By", "ApprovedBy"}, {"Approved On", "ApprovedOn"}, {"Submitted On", "SubmittedOn"}, {"Engaged On", "EngagedOn"}, {"Closed On", "ClosedOn"}, {"Microsoft Escalation Contact", "MicrosoftContact"}, {"Business Impact Statement", "BusinessImpact"}, {"Customer Ask", "CustomerAsk"}, {"Timeline Summary", "TimelineSummary"}, {"Ready: Impact", "RdyImpact"}, {"Ready: Timeline", "RdyTimeline"}, {"Ready: Tech Status", "RdyTechStatus"}, {"Ready: Ask", "RdyAsk"}, {"Ready: Contacts", "RdyContacts"}, {"Ready: Exec Aware", "RdyExecAware"}, {"Ready: Manager Approval", "RdyMgrApproval"}, {"Readiness %", "ReadinessPct"}, {"Hours to Engage", "HoursToEngage"}, {"De-escalation Criteria", "DeescalationCriteria"}, {"Lessons Learned", "LessonsLearned"}}, MissingField.Ignore),
    Flat = fnCsctFlatten(Renamed),
    Typed = Table.TransformColumnTypes(Flat, {{"Title", type text}, {"CaseId", type text}, {"Account", type text}, {"TriggerRules", type text}, {"Level", type text}, {"Status", type text}, {"IsOpen", type logical}, {"ProposedOn", type datetime}, {"ApprovedBy", type text}, {"ApprovedOn", type datetime}, {"SubmittedOn", type datetime}, {"EngagedOn", type datetime}, {"ClosedOn", type datetime}, {"MicrosoftContact", type text}, {"BusinessImpact", type text}, {"CustomerAsk", type text}, {"TimelineSummary", type text}, {"RdyImpact", type logical}, {"RdyTimeline", type logical}, {"RdyTechStatus", type logical}, {"RdyAsk", type logical}, {"RdyContacts", type logical}, {"RdyExecAware", type logical}, {"RdyMgrApproval", type logical}, {"ReadinessPct", Int64.Type}, {"HoursToEngage", type number}, {"DeescalationCriteria", type text}, {"Outcome", type text}, {"LessonsLearned", type text}})
in
    Typed

// ---- Snapshot  (SharePoint list "CSCT Daily Snapshot")
let
    Source = SharePoint.Tables(SiteUrl, [Implementation = "2.0", ViewMode = "All"]),
    Raw = Source{[Title = "CSCT Daily Snapshot"]}[Items],
    Keep = Table.SelectColumns(Raw, {"Snapshot Key", "Snapshot Date", "Row Type", "Case ID", "Account", "Severity", "Status", "Risk Score", "Risk Level", "Stalled", "Stall Type", "SLA Status", "Escalation Status", "Days Open"}, MissingField.UseNull),
    Renamed = Table.RenameColumns(Keep, {{"Snapshot Key", "Title"}, {"Snapshot Date", "SnapshotDate"}, {"Row Type", "RowType"}, {"Case ID", "CaseId"}, {"Account", "AccountName"}, {"Risk Score", "RiskScore"}, {"Risk Level", "RiskLevel"}, {"Stalled", "IsStalled"}, {"Stall Type", "StallType"}, {"SLA Status", "SLAStatus"}, {"Escalation Status", "EscalationStatus"}, {"Days Open", "DaysOpen"}}, MissingField.Ignore),
    Flat = fnCsctFlatten(Renamed),
    Typed = Table.TransformColumnTypes(Flat, {{"Title", type text}, {"SnapshotDate", type date}, {"RowType", type text}, {"CaseId", type text}, {"AccountName", type text}, {"Severity", type text}, {"Status", type text}, {"RiskScore", Int64.Type}, {"RiskLevel", type text}, {"IsStalled", type logical}, {"StallType", type text}, {"SLAStatus", type text}, {"EscalationStatus", type text}, {"DaysOpen", Int64.Type}})
in
    Typed

// ---- ReviewLog  (SharePoint list "CSCT Review Log")
let
    Source = SharePoint.Tables(SiteUrl, [Implementation = "2.0", ViewMode = "All"]),
    Raw = Source{[Title = "CSCT Review Log"]}[Items],
    Keep = Table.SelectColumns(Raw, {"Review", "Review Date", "Review Type", "Reviewer", "Open Cases", "Red", "Yellow", "Stalled", "SLA Breaches", "Escalation Candidates", "New Signals", "Executive Summary", "Decisions", "Actions Agreed", "Asks for Manager", "Manager Acknowledged", "Manager Comments"}, MissingField.UseNull),
    Renamed = Table.RenameColumns(Keep, {{"Review", "Title"}, {"Review Date", "ReviewDate"}, {"Review Type", "ReviewType"}, {"Open Cases", "OpenCases"}, {"Red", "RedCases"}, {"Yellow", "YellowCases"}, {"Stalled", "StalledCases"}, {"SLA Breaches", "SLABreaches"}, {"Escalation Candidates", "EscalationCandidates"}, {"New Signals", "NewSignals"}, {"Executive Summary", "ExecutiveSummary"}, {"Actions Agreed", "ActionsAgreed"}, {"Asks for Manager", "AsksForManager"}, {"Manager Acknowledged", "ManagerAcknowledged"}, {"Manager Comments", "ManagerComments"}}, MissingField.Ignore),
    Flat = fnCsctFlatten(Renamed),
    Typed = Table.TransformColumnTypes(Flat, {{"Title", type text}, {"ReviewDate", type date}, {"ReviewType", type text}, {"Reviewer", type text}, {"OpenCases", Int64.Type}, {"RedCases", Int64.Type}, {"YellowCases", Int64.Type}, {"StalledCases", Int64.Type}, {"SLABreaches", Int64.Type}, {"EscalationCandidates", Int64.Type}, {"NewSignals", Int64.Type}, {"ExecutiveSummary", type text}, {"Decisions", type text}, {"ActionsAgreed", type text}, {"AsksForManager", type text}, {"ManagerAcknowledged", type logical}, {"ManagerComments", type text}})
in
    Typed

// ---- Config  (SharePoint list "CSCT Config")
let
    Source = SharePoint.Tables(SiteUrl, [Implementation = "2.0", ViewMode = "All"]),
    Raw = Source{[Title = "CSCT Config"]}[Items],
    Keep = Table.SelectColumns(Raw, {"Key", "Value", "Category", "Description"}, MissingField.UseNull),
    Renamed = Table.RenameColumns(Keep, {{"Key", "Title"}}, MissingField.Ignore),
    Flat = fnCsctFlatten(Renamed),
    Typed = Table.TransformColumnTypes(Flat, {{"Title", type text}, {"Value", type text}, {"Category", type text}, {"Description", type text}})
in
    Typed
