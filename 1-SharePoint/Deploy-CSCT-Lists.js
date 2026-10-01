/*
 * Customer Success Control Tower - SharePoint provisioning script v1.0.0
 * ------------------------------------------------------------------------------------------
 * Creates 8 Microsoft Lists (Accounts, Cases, Case Events, Signals, Escalations, Daily Snapshot,
 * Review Log, Config) with typed columns, indexes, RAG column formatting and working views,
 * then seeds CSCT Config (thresholds, weights, EN/TR keywords, routing, holidays).
 * Idempotent: re-running skips lists / columns / views that already exist.
 *
 * HOW TO RUN (no admin rights or app registration needed - uses your own browser session):
 *   1. Open the target SharePoint site (e.g. https://<tenant>.sharepoint.com/sites/CSControlTower) in Edge.
 *      You need Edit / Manage Lists permission on the site.
 *   2. Press F12 > Console. (Optional) set options first, e.g.
 *        window.CSCT_OPTIONS = { seedDemo: true };      // also load the synthetic demo dataset
 *        window.CSCT_OPTIONS = { dryRun: true };        // print what would be created, change nothing
 *   3. Paste this whole file and press Enter. Progress is logged with a [CSCT] prefix.
 *
 * Generated from the CSCT single-source spec - do not hand-edit the MANIFEST block.
 */
(async function csctDeploy() {
  const MANIFEST = {
 "version": "1.0.0",
 "lists": [
  {
   "url": "CSCTAccounts",
   "title": "CSCT Accounts",
   "titleDisplay": "Account",
   "description": "Customer 360 master: one row per customer account, with automation-maintained health roll-ups.",
   "fields": [
    {
     "name": "AccountId",
     "type": "Text",
     "xml": "<Field Name=\"AccountId\" StaticName=\"AccountId\" DisplayName=\"Account ID\" Required=\"FALSE\" Description=\"TPID / CRM account ID.\" Type=\"Text\" MaxLength=\"255\" />",
     "indexed": true,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "Aliases",
     "type": "Text",
     "xml": "<Field Name=\"Aliases\" StaticName=\"Aliases\" DisplayName=\"Match Aliases\" Required=\"FALSE\" Description=\"Names and email domains used to map notifications, separated by ';' (e.g. contoso.com; Contoso Holding).\" Type=\"Text\" MaxLength=\"255\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "ParentGroup",
     "type": "Text",
     "xml": "<Field Name=\"ParentGroup\" StaticName=\"ParentGroup\" DisplayName=\"Parent Group\" Required=\"FALSE\" Description=\"Group / holding name for roll-ups.\" Type=\"Text\" MaxLength=\"255\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "Segment",
     "type": "Choice",
     "xml": "<Field Name=\"Segment\" StaticName=\"Segment\" DisplayName=\"Segment\" Required=\"FALSE\" Type=\"Choice\" FillInChoice=\"FALSE\" Format=\"Dropdown\"><CHOICES><CHOICE>Strategic</CHOICE><CHOICE>Major</CHOICE><CHOICE>Corporate</CHOICE><CHOICE>SME&amp;C</CHOICE><CHOICE>Public Sector</CHOICE></CHOICES></Field>",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "Industry",
     "type": "Choice",
     "xml": "<Field Name=\"Industry\" StaticName=\"Industry\" DisplayName=\"Industry\" Required=\"FALSE\" Type=\"Choice\" FillInChoice=\"FALSE\" Format=\"Dropdown\"><CHOICES><CHOICE>Financial Services</CHOICE><CHOICE>Energy &amp; Utilities</CHOICE><CHOICE>Manufacturing</CHOICE><CHOICE>Automotive</CHOICE><CHOICE>Defense &amp; Aerospace</CHOICE><CHOICE>Logistics</CHOICE><CHOICE>Retail</CHOICE><CHOICE>Telecommunications</CHOICE><CHOICE>Healthcare</CHOICE><CHOICE>Holding / Conglomerate</CHOICE><CHOICE>Public Sector</CHOICE><CHOICE>Other</CHOICE></CHOICES></Field>",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "StrategicTier",
     "type": "Choice",
     "xml": "<Field Name=\"StrategicTier\" StaticName=\"StrategicTier\" DisplayName=\"Tier\" Required=\"FALSE\" Type=\"Choice\" FillInChoice=\"FALSE\" Format=\"Dropdown\"><CHOICES><CHOICE>Tier 1</CHOICE><CHOICE>Tier 2</CHOICE><CHOICE>Tier 3</CHOICE></CHOICES></Field>",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "ContractType",
     "type": "Choice",
     "xml": "<Field Name=\"ContractType\" StaticName=\"ContractType\" DisplayName=\"Contract\" Required=\"FALSE\" Type=\"Choice\" FillInChoice=\"FALSE\" Format=\"Dropdown\"><CHOICES><CHOICE>Unified Enterprise</CHOICE><CHOICE>Unified Performance</CHOICE><CHOICE>Unified Core</CHOICE><CHOICE>Unified (other)</CHOICE><CHOICE>Premier (legacy)</CHOICE><CHOICE>Other</CHOICE></CHOICES></Field>",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "ContractEnd",
     "type": "DateOnly",
     "xml": "<Field Name=\"ContractEnd\" StaticName=\"ContractEnd\" DisplayName=\"Contract End\" Required=\"FALSE\" Description=\"Drives the renewal-window factor.\" Type=\"DateTime\" Format=\"DateOnly\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "CSMOwner",
     "type": "User",
     "xml": "<Field Name=\"CSMOwner\" StaticName=\"CSMOwner\" DisplayName=\"CSM Owner\" Required=\"FALSE\" Type=\"User\" UserSelectionMode=\"PeopleOnly\" UserSelectionScope=\"0\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "MicrosoftExecSponsor",
     "type": "User",
     "xml": "<Field Name=\"MicrosoftExecSponsor\" StaticName=\"MicrosoftExecSponsor\" DisplayName=\"Microsoft Exec Sponsor\" Required=\"FALSE\" Type=\"User\" UserSelectionMode=\"PeopleOnly\" UserSelectionScope=\"0\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "CustomerExecSponsor",
     "type": "Text",
     "xml": "<Field Name=\"CustomerExecSponsor\" StaticName=\"CustomerExecSponsor\" DisplayName=\"Customer Exec Sponsor\" Required=\"FALSE\" Type=\"Text\" MaxLength=\"255\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "KeyContacts",
     "type": "Note",
     "xml": "<Field Name=\"KeyContacts\" StaticName=\"KeyContacts\" DisplayName=\"Key Contacts\" Required=\"FALSE\" Type=\"Note\" NumLines=\"6\" RichText=\"FALSE\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "CSMConcern",
     "type": "Choice",
     "xml": "<Field Name=\"CSMConcern\" StaticName=\"CSMConcern\" DisplayName=\"CSM Concern\" Required=\"FALSE\" Description=\"Human judgement; Critical forces the account Red.\" Type=\"Choice\" FillInChoice=\"FALSE\" Format=\"Dropdown\"><Default>None</Default><CHOICES><CHOICE>None</CHOICE><CHOICE>Watch</CHOICE><CHOICE>Concern</CHOICE><CHOICE>Critical</CHOICE></CHOICES></Field>",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "CSMConcernNote",
     "type": "Note",
     "xml": "<Field Name=\"CSMConcernNote\" StaticName=\"CSMConcernNote\" DisplayName=\"Concern Note\" Required=\"FALSE\" Type=\"Note\" NumLines=\"6\" RichText=\"FALSE\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "MIRPStatus",
     "type": "Choice",
     "xml": "<Field Name=\"MIRPStatus\" StaticName=\"MIRPStatus\" DisplayName=\"MIRP Status\" Required=\"FALSE\" Description=\"Major Incident Response Plan readiness.\" Type=\"Choice\" FillInChoice=\"FALSE\" Format=\"Dropdown\"><CHOICES><CHOICE>Not Started</CHOICE><CHOICE>Pending</CHOICE><CHOICE>Approved</CHOICE><CHOICE>Expired</CHOICE><CHOICE>N/A</CHOICE></CHOICES></Field>",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "LastTouchpoint",
     "type": "DateOnly",
     "xml": "<Field Name=\"LastTouchpoint\" StaticName=\"LastTouchpoint\" DisplayName=\"Last Touchpoint\" Required=\"FALSE\" Type=\"DateTime\" Format=\"DateOnly\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "NextTouchpoint",
     "type": "DateOnly",
     "xml": "<Field Name=\"NextTouchpoint\" StaticName=\"NextTouchpoint\" DisplayName=\"Next Touchpoint\" Required=\"FALSE\" Type=\"DateTime\" Format=\"DateOnly\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "AccountRiskScore",
     "type": "Number",
     "xml": "<Field Name=\"AccountRiskScore\" StaticName=\"AccountRiskScore\" DisplayName=\"Account Risk Score\" Required=\"FALSE\" Type=\"Number\" Decimals=\"0\" Min=\"0\" Max=\"100\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": "{\"$schema\": \"https://developer.microsoft.com/json-schemas/sp/v2/column-formatting.schema.json\", \"elmType\": \"div\", \"style\": {\"display\": \"=if(@currentField == '', 'none', 'flex')\", \"align-items\": \"center\", \"width\": \"100%\"}, \"children\": [{\"elmType\": \"div\", \"style\": {\"flex-grow\": \"1\", \"height\": \"12px\", \"background-color\": \"#EFEFEF\", \"border-radius\": \"6px\", \"overflow\": \"hidden\", \"margin-right\": \"8px\"}, \"children\": [{\"elmType\": \"div\", \"style\": {\"height\": \"100%\", \"width\": \"=if(@currentField > 100, '100%', toString(@currentField) + '%')\", \"background-color\": \"=if(@currentField >= 60, '#DC2626', if(@currentField >= 30, '#F59E0B', '#16A34A'))\"}}]}, {\"elmType\": \"span\", \"style\": {\"font-weight\": \"600\", \"min-width\": \"24px\"}, \"txtContent\": \"@currentField\"}]}"
    },
    {
     "name": "AccountRAG",
     "type": "Choice",
     "xml": "<Field Name=\"AccountRAG\" StaticName=\"AccountRAG\" DisplayName=\"Account RAG\" Required=\"FALSE\" Type=\"Choice\" FillInChoice=\"FALSE\" Format=\"Dropdown\"><CHOICES><CHOICE>Green</CHOICE><CHOICE>Yellow</CHOICE><CHOICE>Red</CHOICE></CHOICES></Field>",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": "{\"$schema\": \"https://developer.microsoft.com/json-schemas/sp/v2/column-formatting.schema.json\", \"elmType\": \"div\", \"style\": {\"display\": \"=if(@currentField == '', 'none', 'inline-flex')\", \"align-items\": \"center\", \"padding\": \"2px 10px\", \"border-radius\": \"12px\", \"font-weight\": \"600\", \"background-color\": \"=if(@currentField == 'Red', '#FDE2E2', if(@currentField == 'Yellow', '#FEF3C7', '#DCFCE7'))\", \"color\": \"=if(@currentField == 'Red', '#991B1B', if(@currentField == 'Yellow', '#92400E', '#166534'))\"}, \"children\": [{\"elmType\": \"span\", \"style\": {\"width\": \"8px\", \"height\": \"8px\", \"border-radius\": \"50%\", \"margin-right\": \"6px\", \"background-color\": \"=if(@currentField == 'Red', '#DC2626', if(@currentField == 'Yellow', '#F59E0B', '#16A34A'))\"}}, {\"elmType\": \"span\", \"txtContent\": \"@currentField\"}]}"
    },
    {
     "name": "AccountRiskDrivers",
     "type": "Note",
     "xml": "<Field Name=\"AccountRiskDrivers\" StaticName=\"AccountRiskDrivers\" DisplayName=\"Account Risk Drivers\" Required=\"FALSE\" Type=\"Note\" NumLines=\"6\" RichText=\"FALSE\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "AccountRiskTrend",
     "type": "Choice",
     "xml": "<Field Name=\"AccountRiskTrend\" StaticName=\"AccountRiskTrend\" DisplayName=\"Account Trend\" Required=\"FALSE\" Type=\"Choice\" FillInChoice=\"FALSE\" Format=\"Dropdown\"><CHOICES><CHOICE>New</CHOICE><CHOICE>Improving</CHOICE><CHOICE>Stable</CHOICE><CHOICE>Worsening</CHOICE></CHOICES></Field>",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "OpenCases",
     "type": "Number",
     "xml": "<Field Name=\"OpenCases\" StaticName=\"OpenCases\" DisplayName=\"Open Cases\" Required=\"FALSE\" Type=\"Number\" Decimals=\"0\" Min=\"0\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "RedCases",
     "type": "Number",
     "xml": "<Field Name=\"RedCases\" StaticName=\"RedCases\" DisplayName=\"Red Cases\" Required=\"FALSE\" Type=\"Number\" Decimals=\"0\" Min=\"0\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "StalledCases",
     "type": "Number",
     "xml": "<Field Name=\"StalledCases\" StaticName=\"StalledCases\" DisplayName=\"Stalled Cases\" Required=\"FALSE\" Type=\"Number\" Decimals=\"0\" Min=\"0\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "OpenComplaints",
     "type": "Number",
     "xml": "<Field Name=\"OpenComplaints\" StaticName=\"OpenComplaints\" DisplayName=\"Open Complaints\" Required=\"FALSE\" Type=\"Number\" Decimals=\"0\" Min=\"0\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "ActiveEscalations",
     "type": "Number",
     "xml": "<Field Name=\"ActiveEscalations\" StaticName=\"ActiveEscalations\" DisplayName=\"Active Escalations\" Required=\"FALSE\" Type=\"Number\" Decimals=\"0\" Min=\"0\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "PatternAlert",
     "type": "Text",
     "xml": "<Field Name=\"PatternAlert\" StaticName=\"PatternAlert\" DisplayName=\"Pattern Alert\" Required=\"FALSE\" Description=\"E9: repeated cases in one product family.\" Type=\"Text\" MaxLength=\"255\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "LastScored",
     "type": "DateTime",
     "xml": "<Field Name=\"LastScored\" StaticName=\"LastScored\" DisplayName=\"Last Scored\" Required=\"FALSE\" Type=\"DateTime\" Format=\"DateTime\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    }
   ],
   "views": [
    {
     "title": "Account Health",
     "default": true,
     "query": "<OrderBy><FieldRef Name='AccountRiskScore' Ascending='FALSE'/></OrderBy>",
     "fields": [
      "LinkTitle",
      "AccountRAG",
      "AccountRiskScore",
      "AccountRiskTrend",
      "OpenCases",
      "RedCases",
      "StalledCases",
      "OpenComplaints",
      "ActiveEscalations",
      "PatternAlert",
      "CSMConcern",
      "ContractEnd",
      "MIRPStatus",
      "NextTouchpoint"
     ],
     "rowFormatter": "{\"$schema\": \"https://developer.microsoft.com/json-schemas/sp/v2/row-formatting.schema.json\", \"additionalRowClass\": \"=if([$AccountRAG] == 'Red', 'sp-field-severity--blocked', if([$AccountRAG] == 'Yellow', 'sp-field-severity--warning', ''))\"}"
    }
   ]
  },
  {
   "url": "CSCTCases",
   "title": "CSCT Cases",
   "titleDisplay": "Case Title",
   "description": "Case register: one row per Unified support case. Created and updated automatically from support notifications.",
   "fields": [
    {
     "name": "CaseId",
     "type": "Text",
     "xml": "<Field Name=\"CaseId\" StaticName=\"CaseId\" DisplayName=\"Case ID\" Required=\"TRUE\" Description=\"16-digit support case number (TrackingID).\" Type=\"Text\" MaxLength=\"255\" />",
     "indexed": true,
     "unique": true,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "Account",
     "type": "Lookup",
     "xml": "<Field Name=\"Account\" StaticName=\"Account\" DisplayName=\"Account\" Required=\"FALSE\" Description=\"Resolved via Match Aliases; empty = unmapped (Data Quality).\" Type=\"Lookup\" List=\"{{LIST:CSCTAccounts}}\" ShowField=\"Title\" />",
     "indexed": true,
     "unique": false,
     "lookupList": "CSCTAccounts",
     "formatter": null
    },
    {
     "name": "CustomerNameRaw",
     "type": "Text",
     "xml": "<Field Name=\"CustomerNameRaw\" StaticName=\"CustomerNameRaw\" DisplayName=\"Customer (as notified)\" Required=\"FALSE\" Type=\"Text\" MaxLength=\"255\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "Severity",
     "type": "Choice",
     "xml": "<Field Name=\"Severity\" StaticName=\"Severity\" DisplayName=\"Severity\" Required=\"FALSE\" Type=\"Choice\" FillInChoice=\"FALSE\" Format=\"Dropdown\"><Default>Sev C</Default><CHOICES><CHOICE>Sev 1</CHOICE><CHOICE>Sev A</CHOICE><CHOICE>Sev B</CHOICE><CHOICE>Sev C</CHOICE></CHOICES></Field>",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": "{\"$schema\": \"https://developer.microsoft.com/json-schemas/sp/v2/column-formatting.schema.json\", \"elmType\": \"div\", \"style\": {\"display\": \"inline-block\", \"padding\": \"1px 8px\", \"border-radius\": \"6px\", \"font-weight\": \"600\", \"border\": \"=if(@currentField == 'Sev 1' || @currentField == 'Sev A', '1px solid #DC2626', '1px solid #C8C8C8')\", \"color\": \"=if(@currentField == 'Sev 1' || @currentField == 'Sev A', '#B91C1C', '#333333')\"}, \"txtContent\": \"@currentField\"}"
    },
    {
     "name": "SupportAreaPath",
     "type": "Text",
     "xml": "<Field Name=\"SupportAreaPath\" StaticName=\"SupportAreaPath\" DisplayName=\"Support Area Path\" Required=\"FALSE\" Type=\"Text\" MaxLength=\"255\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "ProductFamily",
     "type": "Text",
     "xml": "<Field Name=\"ProductFamily\" StaticName=\"ProductFamily\" DisplayName=\"Product Family\" Required=\"FALSE\" Description=\"First segment of the support area path.\" Type=\"Text\" MaxLength=\"255\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "ServiceName",
     "type": "Text",
     "xml": "<Field Name=\"ServiceName\" StaticName=\"ServiceName\" DisplayName=\"Service\" Required=\"FALSE\" Type=\"Text\" MaxLength=\"255\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "Status",
     "type": "Choice",
     "xml": "<Field Name=\"Status\" StaticName=\"Status\" DisplayName=\"Status\" Required=\"FALSE\" Type=\"Choice\" FillInChoice=\"FALSE\" Format=\"Dropdown\"><Default>New</Default><CHOICES><CHOICE>New</CHOICE><CHOICE>In Progress</CHOICE><CHOICE>Waiting on Customer</CHOICE><CHOICE>Waiting on Microsoft</CHOICE><CHOICE>Waiting on Product Group</CHOICE><CHOICE>Mitigated - Monitoring</CHOICE><CHOICE>Resolved</CHOICE><CHOICE>Closed</CHOICE><CHOICE>Canceled</CHOICE></CHOICES></Field>",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "IsOpen",
     "type": "Boolean",
     "xml": "<Field Name=\"IsOpen\" StaticName=\"IsOpen\" DisplayName=\"Is Open\" Required=\"FALSE\" Type=\"Boolean\"><Default>1</Default></Field>",
     "indexed": true,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "BallInCourt",
     "type": "Choice",
     "xml": "<Field Name=\"BallInCourt\" StaticName=\"BallInCourt\" DisplayName=\"Ball In Court\" Required=\"FALSE\" Type=\"Choice\" FillInChoice=\"FALSE\" Format=\"Dropdown\"><Default>Unknown</Default><CHOICES><CHOICE>Microsoft</CHOICE><CHOICE>Customer</CHOICE><CHOICE>Product Group</CHOICE><CHOICE>Partner</CHOICE><CHOICE>Unknown</CHOICE></CHOICES></Field>",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "Engineer",
     "type": "Text",
     "xml": "<Field Name=\"Engineer\" StaticName=\"Engineer\" DisplayName=\"Engineer\" Required=\"FALSE\" Type=\"Text\" MaxLength=\"255\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "OwnershipChanges",
     "type": "Number",
     "xml": "<Field Name=\"OwnershipChanges\" StaticName=\"OwnershipChanges\" DisplayName=\"Ownership Changes\" Required=\"FALSE\" Type=\"Number\" Decimals=\"0\" Min=\"0\"><Default>0</Default></Field>",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "ReopenCount",
     "type": "Number",
     "xml": "<Field Name=\"ReopenCount\" StaticName=\"ReopenCount\" DisplayName=\"Reopen Count\" Required=\"FALSE\" Type=\"Number\" Decimals=\"0\" Min=\"0\"><Default>0</Default></Field>",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "CreatedOn",
     "type": "DateTime",
     "xml": "<Field Name=\"CreatedOn\" StaticName=\"CreatedOn\" DisplayName=\"Created On\" Required=\"FALSE\" Type=\"DateTime\" Format=\"DateTime\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "FirstResponseOn",
     "type": "DateTime",
     "xml": "<Field Name=\"FirstResponseOn\" StaticName=\"FirstResponseOn\" DisplayName=\"First Response On\" Required=\"FALSE\" Type=\"DateTime\" Format=\"DateTime\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "LastMicrosoftUpdate",
     "type": "DateTime",
     "xml": "<Field Name=\"LastMicrosoftUpdate\" StaticName=\"LastMicrosoftUpdate\" DisplayName=\"Last Microsoft Update\" Required=\"FALSE\" Type=\"DateTime\" Format=\"DateTime\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "LastCustomerUpdate",
     "type": "DateTime",
     "xml": "<Field Name=\"LastCustomerUpdate\" StaticName=\"LastCustomerUpdate\" DisplayName=\"Last Customer Update\" Required=\"FALSE\" Type=\"DateTime\" Format=\"DateTime\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "LastInternalUpdate",
     "type": "DateTime",
     "xml": "<Field Name=\"LastInternalUpdate\" StaticName=\"LastInternalUpdate\" DisplayName=\"Last Internal Update\" Required=\"FALSE\" Type=\"DateTime\" Format=\"DateTime\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "LastActivity",
     "type": "DateTime",
     "xml": "<Field Name=\"LastActivity\" StaticName=\"LastActivity\" DisplayName=\"Last Activity\" Required=\"FALSE\" Type=\"DateTime\" Format=\"DateTime\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "CustomerChasers",
     "type": "Number",
     "xml": "<Field Name=\"CustomerChasers\" StaticName=\"CustomerChasers\" DisplayName=\"Customer Chasers\" Required=\"FALSE\" Description=\"Customer messages since the last Microsoft reply.\" Type=\"Number\" Decimals=\"0\" Min=\"0\"><Default>0</Default></Field>",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "SeverityChangedOn",
     "type": "DateTime",
     "xml": "<Field Name=\"SeverityChangedOn\" StaticName=\"SeverityChangedOn\" DisplayName=\"Severity Changed On\" Required=\"FALSE\" Type=\"DateTime\" Format=\"DateTime\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "SeverityChangeDir",
     "type": "Choice",
     "xml": "<Field Name=\"SeverityChangeDir\" StaticName=\"SeverityChangeDir\" DisplayName=\"Severity Change\" Required=\"FALSE\" Type=\"Choice\" FillInChoice=\"FALSE\" Format=\"Dropdown\"><CHOICES><CHOICE>Raised</CHOICE><CHOICE>Lowered</CHOICE></CHOICES></Field>",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "CritSitActive",
     "type": "Boolean",
     "xml": "<Field Name=\"CritSitActive\" StaticName=\"CritSitActive\" DisplayName=\"CritSit Active\" Required=\"FALSE\" Type=\"Boolean\"><Default>0</Default></Field>",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "CritSitEndedOn",
     "type": "DateTime",
     "xml": "<Field Name=\"CritSitEndedOn\" StaticName=\"CritSitEndedOn\" DisplayName=\"CritSit Ended On\" Required=\"FALSE\" Type=\"DateTime\" Format=\"DateTime\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "CustomerSentiment",
     "type": "Choice",
     "xml": "<Field Name=\"CustomerSentiment\" StaticName=\"CustomerSentiment\" DisplayName=\"Customer Sentiment\" Required=\"FALSE\" Type=\"Choice\" FillInChoice=\"FALSE\" Format=\"Dropdown\"><Default>Neutral</Default><CHOICES><CHOICE>Positive</CHOICE><CHOICE>Neutral</CHOICE><CHOICE>Frustrated</CHOICE><CHOICE>Angry</CHOICE></CHOICES></Field>",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "BusinessImpact",
     "type": "Choice",
     "xml": "<Field Name=\"BusinessImpact\" StaticName=\"BusinessImpact\" DisplayName=\"Business Impact\" Required=\"FALSE\" Type=\"Choice\" FillInChoice=\"FALSE\" Format=\"Dropdown\"><Default>Medium</Default><CHOICES><CHOICE>Low</CHOICE><CHOICE>Medium</CHOICE><CHOICE>High</CHOICE><CHOICE>Critical</CHOICE></CHOICES></Field>",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "ExecVisibility",
     "type": "Boolean",
     "xml": "<Field Name=\"ExecVisibility\" StaticName=\"ExecVisibility\" DisplayName=\"Exec Visibility\" Required=\"FALSE\" Description=\"Customer executives are following this case.\" Type=\"Boolean\"><Default>0</Default></Field>",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "NextAction",
     "type": "Text",
     "xml": "<Field Name=\"NextAction\" StaticName=\"NextAction\" DisplayName=\"Next Action\" Required=\"FALSE\" Type=\"Text\" MaxLength=\"255\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "NextActionOwner",
     "type": "Choice",
     "xml": "<Field Name=\"NextActionOwner\" StaticName=\"NextActionOwner\" DisplayName=\"Next Action Owner\" Required=\"FALSE\" Type=\"Choice\" FillInChoice=\"FALSE\" Format=\"Dropdown\"><CHOICES><CHOICE>CSM</CHOICE><CHOICE>Engineer</CHOICE><CHOICE>Customer</CHOICE><CHOICE>Product Group</CHOICE><CHOICE>Manager</CHOICE></CHOICES></Field>",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "NextActionDue",
     "type": "DateOnly",
     "xml": "<Field Name=\"NextActionDue\" StaticName=\"NextActionDue\" DisplayName=\"Next Action Due\" Required=\"FALSE\" Type=\"DateTime\" Format=\"DateOnly\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "ResolutionETA",
     "type": "DateOnly",
     "xml": "<Field Name=\"ResolutionETA\" StaticName=\"ResolutionETA\" DisplayName=\"Resolution ETA\" Required=\"FALSE\" Type=\"DateTime\" Format=\"DateOnly\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "EscalationStatus",
     "type": "Choice",
     "xml": "<Field Name=\"EscalationStatus\" StaticName=\"EscalationStatus\" DisplayName=\"Escalation Status\" Required=\"FALSE\" Type=\"Choice\" FillInChoice=\"FALSE\" Format=\"Dropdown\"><Default>None</Default><CHOICES><CHOICE>None</CHOICE><CHOICE>Candidate</CHOICE><CHOICE>Pending Manager Approval</CHOICE><CHOICE>Approved</CHOICE><CHOICE>Submitted</CHOICE><CHOICE>Active</CHOICE><CHOICE>De-escalated</CHOICE><CHOICE>Closed</CHOICE><CHOICE>Dismissed</CHOICE></CHOICES></Field>",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "RiskScore",
     "type": "Number",
     "xml": "<Field Name=\"RiskScore\" StaticName=\"RiskScore\" DisplayName=\"Risk Score\" Required=\"FALSE\" Type=\"Number\" Decimals=\"0\" Min=\"0\" Max=\"100\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": "{\"$schema\": \"https://developer.microsoft.com/json-schemas/sp/v2/column-formatting.schema.json\", \"elmType\": \"div\", \"style\": {\"display\": \"=if(@currentField == '', 'none', 'flex')\", \"align-items\": \"center\", \"width\": \"100%\"}, \"children\": [{\"elmType\": \"div\", \"style\": {\"flex-grow\": \"1\", \"height\": \"12px\", \"background-color\": \"#EFEFEF\", \"border-radius\": \"6px\", \"overflow\": \"hidden\", \"margin-right\": \"8px\"}, \"children\": [{\"elmType\": \"div\", \"style\": {\"height\": \"100%\", \"width\": \"=if(@currentField > 100, '100%', toString(@currentField) + '%')\", \"background-color\": \"=if(@currentField >= 60, '#DC2626', if(@currentField >= 30, '#F59E0B', '#16A34A'))\"}}]}, {\"elmType\": \"span\", \"style\": {\"font-weight\": \"600\", \"min-width\": \"24px\"}, \"txtContent\": \"@currentField\"}]}"
    },
    {
     "name": "RiskLevel",
     "type": "Choice",
     "xml": "<Field Name=\"RiskLevel\" StaticName=\"RiskLevel\" DisplayName=\"Risk Level\" Required=\"FALSE\" Type=\"Choice\" FillInChoice=\"FALSE\" Format=\"Dropdown\"><CHOICES><CHOICE>Green</CHOICE><CHOICE>Yellow</CHOICE><CHOICE>Red</CHOICE></CHOICES></Field>",
     "indexed": true,
     "unique": false,
     "lookupList": null,
     "formatter": "{\"$schema\": \"https://developer.microsoft.com/json-schemas/sp/v2/column-formatting.schema.json\", \"elmType\": \"div\", \"style\": {\"display\": \"=if(@currentField == '', 'none', 'inline-flex')\", \"align-items\": \"center\", \"padding\": \"2px 10px\", \"border-radius\": \"12px\", \"font-weight\": \"600\", \"background-color\": \"=if(@currentField == 'Red', '#FDE2E2', if(@currentField == 'Yellow', '#FEF3C7', '#DCFCE7'))\", \"color\": \"=if(@currentField == 'Red', '#991B1B', if(@currentField == 'Yellow', '#92400E', '#166534'))\"}, \"children\": [{\"elmType\": \"span\", \"style\": {\"width\": \"8px\", \"height\": \"8px\", \"border-radius\": \"50%\", \"margin-right\": \"6px\", \"background-color\": \"=if(@currentField == 'Red', '#DC2626', if(@currentField == 'Yellow', '#F59E0B', '#16A34A'))\"}}, {\"elmType\": \"span\", \"txtContent\": \"@currentField\"}]}"
    },
    {
     "name": "PtsSeverity",
     "type": "Number",
     "xml": "<Field Name=\"PtsSeverity\" StaticName=\"PtsSeverity\" DisplayName=\"Pts Severity\" Required=\"FALSE\" Type=\"Number\" Decimals=\"0\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "PtsMomentum",
     "type": "Number",
     "xml": "<Field Name=\"PtsMomentum\" StaticName=\"PtsMomentum\" DisplayName=\"Pts Momentum\" Required=\"FALSE\" Type=\"Number\" Decimals=\"0\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "PtsAge",
     "type": "Number",
     "xml": "<Field Name=\"PtsAge\" StaticName=\"PtsAge\" DisplayName=\"Pts Age\" Required=\"FALSE\" Type=\"Number\" Decimals=\"0\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "PtsSLA",
     "type": "Number",
     "xml": "<Field Name=\"PtsSLA\" StaticName=\"PtsSLA\" DisplayName=\"Pts SLA\" Required=\"FALSE\" Type=\"Number\" Decimals=\"0\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "PtsVoice",
     "type": "Number",
     "xml": "<Field Name=\"PtsVoice\" StaticName=\"PtsVoice\" DisplayName=\"Pts Voice\" Required=\"FALSE\" Type=\"Number\" Decimals=\"0\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "PtsExposure",
     "type": "Number",
     "xml": "<Field Name=\"PtsExposure\" StaticName=\"PtsExposure\" DisplayName=\"Pts Exposure\" Required=\"FALSE\" Type=\"Number\" Decimals=\"0\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "RiskDrivers",
     "type": "Note",
     "xml": "<Field Name=\"RiskDrivers\" StaticName=\"RiskDrivers\" DisplayName=\"Risk Drivers\" Required=\"FALSE\" Description=\"Plain-language explanation of the score.\" Type=\"Note\" NumLines=\"6\" RichText=\"FALSE\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "RiskScorePrev",
     "type": "Number",
     "xml": "<Field Name=\"RiskScorePrev\" StaticName=\"RiskScorePrev\" DisplayName=\"Previous Score\" Required=\"FALSE\" Type=\"Number\" Decimals=\"0\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "RiskTrend",
     "type": "Choice",
     "xml": "<Field Name=\"RiskTrend\" StaticName=\"RiskTrend\" DisplayName=\"Risk Trend\" Required=\"FALSE\" Type=\"Choice\" FillInChoice=\"FALSE\" Format=\"Dropdown\"><CHOICES><CHOICE>New</CHOICE><CHOICE>Improving</CHOICE><CHOICE>Stable</CHOICE><CHOICE>Worsening</CHOICE></CHOICES></Field>",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "RedSince",
     "type": "DateTime",
     "xml": "<Field Name=\"RedSince\" StaticName=\"RedSince\" DisplayName=\"Red Since\" Required=\"FALSE\" Type=\"DateTime\" Format=\"DateTime\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "DaysOpen",
     "type": "Number",
     "xml": "<Field Name=\"DaysOpen\" StaticName=\"DaysOpen\" DisplayName=\"Days Open\" Required=\"FALSE\" Type=\"Number\" Decimals=\"0\" Min=\"0\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "BizDaysIdle",
     "type": "Number",
     "xml": "<Field Name=\"BizDaysIdle\" StaticName=\"BizDaysIdle\" DisplayName=\"Idle (business days)\" Required=\"FALSE\" Type=\"Number\" Decimals=\"0\" Min=\"0\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "IsStalled",
     "type": "Boolean",
     "xml": "<Field Name=\"IsStalled\" StaticName=\"IsStalled\" DisplayName=\"Stalled\" Required=\"FALSE\" Type=\"Boolean\"><Default>0</Default></Field>",
     "indexed": true,
     "unique": false,
     "lookupList": null,
     "formatter": "{\"$schema\": \"https://developer.microsoft.com/json-schemas/sp/v2/column-formatting.schema.json\", \"elmType\": \"div\", \"style\": {\"display\": \"=if(@currentField == true || @currentField == 'Yes' || @currentField == '1', 'inline-flex', 'none')\", \"align-items\": \"center\", \"padding\": \"1px 8px\", \"border-radius\": \"10px\", \"background-color\": \"#FDE2E2\", \"color\": \"#991B1B\", \"font-weight\": \"600\"}, \"children\": [{\"elmType\": \"span\", \"attributes\": {\"iconName\": \"CirclePause\"}, \"style\": {\"margin-right\": \"4px\"}}, {\"elmType\": \"span\", \"txtContent\": \"Stalled\"}]}"
    },
    {
     "name": "StallType",
     "type": "Choice",
     "xml": "<Field Name=\"StallType\" StaticName=\"StallType\" DisplayName=\"Stall Type\" Required=\"FALSE\" Type=\"Choice\" FillInChoice=\"FALSE\" Format=\"Dropdown\"><Default>None</Default><CHOICES><CHOICE>None</CHOICE><CHOICE>Microsoft-side</CHOICE><CHOICE>Blocked (Product Group)</CHOICE><CHOICE>Customer-side</CHOICE><CHOICE>Process (no owner)</CHOICE><CHOICE>Commitment missed</CHOICE></CHOICES></Field>",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "SLAStatus",
     "type": "Choice",
     "xml": "<Field Name=\"SLAStatus\" StaticName=\"SLAStatus\" DisplayName=\"SLA Status\" Required=\"FALSE\" Type=\"Choice\" FillInChoice=\"FALSE\" Format=\"Dropdown\"><CHOICES><CHOICE>Met</CHOICE><CHOICE>Pending</CHOICE><CHOICE>At Risk</CHOICE><CHOICE>Breached</CHOICE><CHOICE>Late response</CHOICE></CHOICES></Field>",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": "{\"$schema\": \"https://developer.microsoft.com/json-schemas/sp/v2/column-formatting.schema.json\", \"elmType\": \"div\", \"style\": {\"display\": \"inline-flex\", \"align-items\": \"center\", \"color\": \"=if(@currentField == 'Breached', '#B91C1C', if(@currentField == 'At Risk' || @currentField == 'Late response', '#B45309', '#166534'))\", \"font-weight\": \"=if(@currentField == 'Breached', '700', '400')\"}, \"children\": [{\"elmType\": \"span\", \"style\": {\"margin-right\": \"5px\"}, \"attributes\": {\"iconName\": \"=if(@currentField == 'Breached', 'AlarmClock', if(@currentField == 'At Risk' || @currentField == 'Late response', 'Warning', 'CheckMark'))\"}}, {\"elmType\": \"span\", \"txtContent\": \"@currentField\"}]}"
    },
    {
     "name": "EscalationTriggers",
     "type": "Text",
     "xml": "<Field Name=\"EscalationTriggers\" StaticName=\"EscalationTriggers\" DisplayName=\"Escalation Triggers\" Required=\"FALSE\" Type=\"Text\" MaxLength=\"255\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "SuggestedLevel",
     "type": "Text",
     "xml": "<Field Name=\"SuggestedLevel\" StaticName=\"SuggestedLevel\" DisplayName=\"Suggested Level\" Required=\"FALSE\" Type=\"Text\" MaxLength=\"255\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "PlaybookId",
     "type": "Text",
     "xml": "<Field Name=\"PlaybookId\" StaticName=\"PlaybookId\" DisplayName=\"Playbook\" Required=\"FALSE\" Type=\"Text\" MaxLength=\"255\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "RecommendedAction",
     "type": "Note",
     "xml": "<Field Name=\"RecommendedAction\" StaticName=\"RecommendedAction\" DisplayName=\"Recommended Action\" Required=\"FALSE\" Type=\"Note\" NumLines=\"6\" RichText=\"FALSE\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "ComplaintOpen",
     "type": "Boolean",
     "xml": "<Field Name=\"ComplaintOpen\" StaticName=\"ComplaintOpen\" DisplayName=\"Complaint Open\" Required=\"FALSE\" Type=\"Boolean\"><Default>0</Default></Field>",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "RequestOpen",
     "type": "Boolean",
     "xml": "<Field Name=\"RequestOpen\" StaticName=\"RequestOpen\" DisplayName=\"Request Open\" Required=\"FALSE\" Type=\"Boolean\"><Default>0</Default></Field>",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "LastScored",
     "type": "DateTime",
     "xml": "<Field Name=\"LastScored\" StaticName=\"LastScored\" DisplayName=\"Last Scored\" Required=\"FALSE\" Type=\"DateTime\" Format=\"DateTime\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "LastReviewed",
     "type": "DateTime",
     "xml": "<Field Name=\"LastReviewed\" StaticName=\"LastReviewed\" DisplayName=\"Last Reviewed\" Required=\"FALSE\" Type=\"DateTime\" Format=\"DateTime\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "CSMNotes",
     "type": "Note",
     "xml": "<Field Name=\"CSMNotes\" StaticName=\"CSMNotes\" DisplayName=\"CSM Notes\" Required=\"FALSE\" Type=\"Note\" NumLines=\"6\" RichText=\"FALSE\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "CaseLink",
     "type": "URL",
     "xml": "<Field Name=\"CaseLink\" StaticName=\"CaseLink\" DisplayName=\"Case Link\" Required=\"FALSE\" Type=\"URL\" Format=\"Hyperlink\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "ClosedOn",
     "type": "DateTime",
     "xml": "<Field Name=\"ClosedOn\" StaticName=\"ClosedOn\" DisplayName=\"Closed On\" Required=\"FALSE\" Type=\"DateTime\" Format=\"DateTime\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "Resolution",
     "type": "Text",
     "xml": "<Field Name=\"Resolution\" StaticName=\"Resolution\" DisplayName=\"Resolution\" Required=\"FALSE\" Type=\"Text\" MaxLength=\"255\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "Source",
     "type": "Choice",
     "xml": "<Field Name=\"Source\" StaticName=\"Source\" DisplayName=\"Source\" Required=\"FALSE\" Type=\"Choice\" FillInChoice=\"FALSE\" Format=\"Dropdown\"><Default>Email notification</Default><CHOICES><CHOICE>Email notification</CHOICE><CHOICE>Manual</CHOICE><CHOICE>Import</CHOICE></CHOICES></Field>",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    }
   ],
   "views": [
    {
     "title": "Action Queue",
     "default": true,
     "query": "<OrderBy><FieldRef Name='RiskScore' Ascending='FALSE'/></OrderBy><Where><Eq><FieldRef Name='IsOpen'/><Value Type='Boolean'>1</Value></Eq></Where>",
     "fields": [
      "RiskLevel",
      "RiskScore",
      "CaseId",
      "LinkTitle",
      "Account",
      "Severity",
      "Status",
      "BallInCourt",
      "BizDaysIdle",
      "DaysOpen",
      "IsStalled",
      "StallType",
      "SLAStatus",
      "EscalationTriggers",
      "PlaybookId",
      "NextAction",
      "NextActionDue",
      "LastReviewed"
     ],
     "rowFormatter": "{\"$schema\": \"https://developer.microsoft.com/json-schemas/sp/v2/row-formatting.schema.json\", \"additionalRowClass\": \"=if([$RiskLevel] == 'Red', 'sp-field-severity--blocked', if([$RiskLevel] == 'Yellow', 'sp-field-severity--warning', ''))\"}"
    },
    {
     "title": "Red and Yellow",
     "default": false,
     "query": "<OrderBy><FieldRef Name='RiskScore' Ascending='FALSE'/></OrderBy><Where><And><Eq><FieldRef Name='IsOpen'/><Value Type='Boolean'>1</Value></Eq><In><FieldRef Name='RiskLevel'/><Values><Value Type='Choice'>Red</Value><Value Type='Choice'>Yellow</Value></Values></In></And></Where>",
     "fields": [
      "RiskLevel",
      "RiskScore",
      "CaseId",
      "LinkTitle",
      "Account",
      "Severity",
      "Status",
      "BallInCourt",
      "BizDaysIdle",
      "DaysOpen",
      "IsStalled",
      "StallType",
      "SLAStatus",
      "EscalationTriggers",
      "PlaybookId",
      "NextAction",
      "NextActionDue",
      "LastReviewed"
     ],
     "rowFormatter": "{\"$schema\": \"https://developer.microsoft.com/json-schemas/sp/v2/row-formatting.schema.json\", \"additionalRowClass\": \"=if([$RiskLevel] == 'Red', 'sp-field-severity--blocked', if([$RiskLevel] == 'Yellow', 'sp-field-severity--warning', ''))\"}"
    },
    {
     "title": "Stalled",
     "default": false,
     "query": "<OrderBy><FieldRef Name='BizDaysIdle' Ascending='FALSE'/></OrderBy><Where><And><Eq><FieldRef Name='IsOpen'/><Value Type='Boolean'>1</Value></Eq><Eq><FieldRef Name='IsStalled'/><Value Type='Boolean'>1</Value></Eq></And></Where>",
     "fields": [
      "RiskLevel",
      "RiskScore",
      "CaseId",
      "LinkTitle",
      "Account",
      "Severity",
      "StallType",
      "BallInCourt",
      "BizDaysIdle",
      "LastMicrosoftUpdate",
      "LastCustomerUpdate",
      "Engineer",
      "PlaybookId",
      "RecommendedAction"
     ],
     "rowFormatter": "{\"$schema\": \"https://developer.microsoft.com/json-schemas/sp/v2/row-formatting.schema.json\", \"additionalRowClass\": \"=if([$RiskLevel] == 'Red', 'sp-field-severity--blocked', if([$RiskLevel] == 'Yellow', 'sp-field-severity--warning', ''))\"}"
    },
    {
     "title": "Escalation Candidates",
     "default": false,
     "query": "<OrderBy><FieldRef Name='RiskScore' Ascending='FALSE'/></OrderBy><Where><And><Eq><FieldRef Name='IsOpen'/><Value Type='Boolean'>1</Value></Eq><IsNotNull><FieldRef Name='EscalationTriggers'/></IsNotNull></And></Where>",
     "fields": [
      "RiskLevel",
      "RiskScore",
      "CaseId",
      "LinkTitle",
      "Account",
      "Severity",
      "EscalationTriggers",
      "SuggestedLevel",
      "EscalationStatus",
      "RecommendedAction"
     ],
     "rowFormatter": "{\"$schema\": \"https://developer.microsoft.com/json-schemas/sp/v2/row-formatting.schema.json\", \"additionalRowClass\": \"=if([$RiskLevel] == 'Red', 'sp-field-severity--blocked', if([$RiskLevel] == 'Yellow', 'sp-field-severity--warning', ''))\"}"
    },
    {
     "title": "Sev 1 and A",
     "default": false,
     "query": "<OrderBy><FieldRef Name='RiskScore' Ascending='FALSE'/></OrderBy><Where><And><Eq><FieldRef Name='IsOpen'/><Value Type='Boolean'>1</Value></Eq><In><FieldRef Name='Severity'/><Values><Value Type='Choice'>Sev 1</Value><Value Type='Choice'>Sev A</Value></Values></In></And></Where>",
     "fields": [
      "RiskLevel",
      "RiskScore",
      "CaseId",
      "LinkTitle",
      "Account",
      "Severity",
      "Status",
      "BallInCourt",
      "BizDaysIdle",
      "DaysOpen",
      "IsStalled",
      "StallType",
      "SLAStatus",
      "EscalationTriggers",
      "PlaybookId",
      "NextAction",
      "NextActionDue",
      "LastReviewed"
     ],
     "rowFormatter": "{\"$schema\": \"https://developer.microsoft.com/json-schemas/sp/v2/row-formatting.schema.json\", \"additionalRowClass\": \"=if([$RiskLevel] == 'Red', 'sp-field-severity--blocked', if([$RiskLevel] == 'Yellow', 'sp-field-severity--warning', ''))\"}"
    },
    {
     "title": "Needs Review Today",
     "default": false,
     "query": "<OrderBy><FieldRef Name='RiskScore' Ascending='FALSE'/></OrderBy><Where><And><And><Eq><FieldRef Name='IsOpen'/><Value Type='Boolean'>1</Value></Eq><In><FieldRef Name='RiskLevel'/><Values><Value Type='Choice'>Red</Value><Value Type='Choice'>Yellow</Value></Values></In></And><Or><IsNull><FieldRef Name='LastReviewed'/></IsNull><Lt><FieldRef Name='LastReviewed'/><Value Type='DateTime'><Today/></Value></Lt></Or></And></Where>",
     "fields": [
      "RiskLevel",
      "RiskScore",
      "CaseId",
      "LinkTitle",
      "Account",
      "Severity",
      "Status",
      "BallInCourt",
      "BizDaysIdle",
      "DaysOpen",
      "IsStalled",
      "StallType",
      "SLAStatus",
      "EscalationTriggers",
      "PlaybookId",
      "NextAction",
      "NextActionDue",
      "LastReviewed"
     ],
     "rowFormatter": "{\"$schema\": \"https://developer.microsoft.com/json-schemas/sp/v2/row-formatting.schema.json\", \"additionalRowClass\": \"=if([$RiskLevel] == 'Red', 'sp-field-severity--blocked', if([$RiskLevel] == 'Yellow', 'sp-field-severity--warning', ''))\"}"
    },
    {
     "title": "Unmapped Accounts",
     "default": false,
     "query": "<OrderBy><FieldRef Name='CreatedOn' Ascending='FALSE'/></OrderBy><Where><And><Eq><FieldRef Name='IsOpen'/><Value Type='Boolean'>1</Value></Eq><IsNull><FieldRef Name='Account'/></IsNull></And></Where>",
     "fields": [
      "CaseId",
      "LinkTitle",
      "CustomerNameRaw",
      "Severity",
      "CreatedOn",
      "Engineer"
     ],
     "rowFormatter": null
    },
    {
     "title": "Closed Last 30 Days",
     "default": false,
     "query": "<OrderBy><FieldRef Name='ClosedOn' Ascending='FALSE'/></OrderBy><Where><And><Eq><FieldRef Name='IsOpen'/><Value Type='Boolean'>0</Value></Eq><Geq><FieldRef Name='ClosedOn'/><Value Type='DateTime'><Today OffsetDays='-30'/></Value></Geq></And></Where>",
     "fields": [
      "CaseId",
      "LinkTitle",
      "Account",
      "Severity",
      "CreatedOn",
      "ClosedOn",
      "Resolution",
      "EscalationStatus"
     ],
     "rowFormatter": null
    }
   ]
  },
  {
   "url": "CSCTCaseEvents",
   "title": "CSCT Case Events",
   "titleDisplay": "Subject",
   "description": "Append-only timeline of every case email / notification (feeds timelines, chaser counts and Copilot grounding).",
   "fields": [
    {
     "name": "CaseId",
     "type": "Text",
     "xml": "<Field Name=\"CaseId\" StaticName=\"CaseId\" DisplayName=\"Case ID\" Required=\"TRUE\" Type=\"Text\" MaxLength=\"255\" />",
     "indexed": true,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "EventType",
     "type": "Choice",
     "xml": "<Field Name=\"EventType\" StaticName=\"EventType\" DisplayName=\"Event Type\" Required=\"FALSE\" Type=\"Choice\" FillInChoice=\"FALSE\" Format=\"Dropdown\"><CHOICES><CHOICE>Created</CHOICE><CHOICE>Ownership Change</CHOICE><CHOICE>Severity Change</CHOICE><CHOICE>Microsoft Update</CHOICE><CHOICE>Customer Update</CHOICE><CHOICE>Internal Update</CHOICE><CHOICE>CritSit Engaged</CHOICE><CHOICE>CritSit Disengaged</CHOICE><CHOICE>Closed</CHOICE><CHOICE>Reopened</CHOICE><CHOICE>CSM Note</CHOICE></CHOICES></Field>",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "EventTime",
     "type": "DateTime",
     "xml": "<Field Name=\"EventTime\" StaticName=\"EventTime\" DisplayName=\"Event Time\" Required=\"FALSE\" Type=\"DateTime\" Format=\"DateTime\" />",
     "indexed": true,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "Actor",
     "type": "Text",
     "xml": "<Field Name=\"Actor\" StaticName=\"Actor\" DisplayName=\"Actor\" Required=\"FALSE\" Type=\"Text\" MaxLength=\"255\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "ActorSide",
     "type": "Choice",
     "xml": "<Field Name=\"ActorSide\" StaticName=\"ActorSide\" DisplayName=\"Actor Side\" Required=\"FALSE\" Type=\"Choice\" FillInChoice=\"FALSE\" Format=\"Dropdown\"><CHOICES><CHOICE>Microsoft Support</CHOICE><CHOICE>Customer</CHOICE><CHOICE>Microsoft Internal</CHOICE><CHOICE>System</CHOICE></CHOICES></Field>",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "FromValue",
     "type": "Text",
     "xml": "<Field Name=\"FromValue\" StaticName=\"FromValue\" DisplayName=\"From\" Required=\"FALSE\" Type=\"Text\" MaxLength=\"255\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "ToValue",
     "type": "Text",
     "xml": "<Field Name=\"ToValue\" StaticName=\"ToValue\" DisplayName=\"To\" Required=\"FALSE\" Type=\"Text\" MaxLength=\"255\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "Snippet",
     "type": "Note",
     "xml": "<Field Name=\"Snippet\" StaticName=\"Snippet\" DisplayName=\"Snippet\" Required=\"FALSE\" Description=\"First 400 characters, plain text (configurable; set to 0 to store none).\" Type=\"Note\" NumLines=\"6\" RichText=\"FALSE\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "Classification",
     "type": "Choice",
     "xml": "<Field Name=\"Classification\" StaticName=\"Classification\" DisplayName=\"Classification\" Required=\"FALSE\" Type=\"Choice\" FillInChoice=\"FALSE\" Format=\"Dropdown\"><Default>None</Default><CHOICES><CHOICE>None</CHOICE><CHOICE>Complaint</CHOICE><CHOICE>Additional Request</CHOICE><CHOICE>Escalation Request</CHOICE><CHOICE>Praise</CHOICE></CHOICES></Field>",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "Sentiment",
     "type": "Choice",
     "xml": "<Field Name=\"Sentiment\" StaticName=\"Sentiment\" DisplayName=\"Sentiment\" Required=\"FALSE\" Type=\"Choice\" FillInChoice=\"FALSE\" Format=\"Dropdown\"><CHOICES><CHOICE>Positive</CHOICE><CHOICE>Neutral</CHOICE><CHOICE>Frustrated</CHOICE><CHOICE>Angry</CHOICE></CHOICES></Field>",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "MessageLink",
     "type": "URL",
     "xml": "<Field Name=\"MessageLink\" StaticName=\"MessageLink\" DisplayName=\"Message Link\" Required=\"FALSE\" Type=\"URL\" Format=\"Hyperlink\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    }
   ],
   "views": [
    {
     "title": "Last 7 Days",
     "default": true,
     "query": "<OrderBy><FieldRef Name='EventTime' Ascending='FALSE'/></OrderBy><Where><Geq><FieldRef Name='EventTime'/><Value Type='DateTime'><Today OffsetDays='-7'/></Value></Geq></Where>",
     "fields": [
      "EventTime",
      "CaseId",
      "EventType",
      "LinkTitle",
      "Actor",
      "ActorSide",
      "Classification",
      "Sentiment"
     ],
     "rowFormatter": null
    }
   ]
  },
  {
   "url": "CSCTSignals",
   "title": "CSCT Signals",
   "titleDisplay": "Summary",
   "description": "Customer voice register: complaints, additional requests, escalation requests, account concerns, praise.",
   "fields": [
    {
     "name": "SignalType",
     "type": "Choice",
     "xml": "<Field Name=\"SignalType\" StaticName=\"SignalType\" DisplayName=\"Signal Type\" Required=\"TRUE\" Type=\"Choice\" FillInChoice=\"FALSE\" Format=\"Dropdown\"><CHOICES><CHOICE>Complaint</CHOICE><CHOICE>Additional Request</CHOICE><CHOICE>Escalation Request</CHOICE><CHOICE>Account Concern</CHOICE><CHOICE>Praise</CHOICE></CHOICES></Field>",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "Account",
     "type": "Lookup",
     "xml": "<Field Name=\"Account\" StaticName=\"Account\" DisplayName=\"Account\" Required=\"FALSE\" Type=\"Lookup\" List=\"{{LIST:CSCTAccounts}}\" ShowField=\"Title\" />",
     "indexed": true,
     "unique": false,
     "lookupList": "CSCTAccounts",
     "formatter": null
    },
    {
     "name": "CaseId",
     "type": "Text",
     "xml": "<Field Name=\"CaseId\" StaticName=\"CaseId\" DisplayName=\"Case ID\" Required=\"FALSE\" Type=\"Text\" MaxLength=\"255\" />",
     "indexed": true,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "Source",
     "type": "Choice",
     "xml": "<Field Name=\"Source\" StaticName=\"Source\" DisplayName=\"Source\" Required=\"FALSE\" Type=\"Choice\" FillInChoice=\"FALSE\" Format=\"Dropdown\"><CHOICES><CHOICE>Case email</CHOICE><CHOICE>Email (non-case)</CHOICE><CHOICE>Teams</CHOICE><CHOICE>Meeting</CHOICE><CHOICE>Survey / DSAT</CHOICE><CHOICE>CSM observation</CHOICE></CHOICES></Field>",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "ReceivedOn",
     "type": "DateTime",
     "xml": "<Field Name=\"ReceivedOn\" StaticName=\"ReceivedOn\" DisplayName=\"Received On\" Required=\"FALSE\" Type=\"DateTime\" Format=\"DateTime\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "CustomerContact",
     "type": "Text",
     "xml": "<Field Name=\"CustomerContact\" StaticName=\"CustomerContact\" DisplayName=\"Customer Contact\" Required=\"FALSE\" Type=\"Text\" MaxLength=\"255\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "Category",
     "type": "Choice",
     "xml": "<Field Name=\"Category\" StaticName=\"Category\" DisplayName=\"Category\" Required=\"FALSE\" Type=\"Choice\" FillInChoice=\"FALSE\" Format=\"Dropdown\"><CHOICES><CHOICE>Response time</CHOICE><CHOICE>Engineer handling</CHOICE><CHOICE>Communication</CHOICE><CHOICE>Resolution quality</CHOICE><CHOICE>Product gap / bug</CHOICE><CHOICE>Commercial / renewal</CHOICE><CHOICE>Relationship / executive</CHOICE><CHOICE>Other</CHOICE></CHOICES></Field>",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "RequestType",
     "type": "Choice",
     "xml": "<Field Name=\"RequestType\" StaticName=\"RequestType\" DisplayName=\"Request Type\" Required=\"FALSE\" Type=\"Choice\" FillInChoice=\"FALSE\" Format=\"Dropdown\"><CHOICES><CHOICE>RCA / post-incident report</CHOICE><CHOICE>Call / meeting with SME</CHOICE><CHOICE>Action plan / documentation</CHOICE><CHOICE>Best-practice guidance</CHOICE><CHOICE>Workshop / session</CHOICE><CHOICE>Expedite / priority</CHOICE><CHOICE>Additional engineer / onsite</CHOICE><CHOICE>Other</CHOICE></CHOICES></Field>",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "Priority",
     "type": "Choice",
     "xml": "<Field Name=\"Priority\" StaticName=\"Priority\" DisplayName=\"Priority\" Required=\"FALSE\" Type=\"Choice\" FillInChoice=\"FALSE\" Format=\"Dropdown\"><Default>Medium</Default><CHOICES><CHOICE>Low</CHOICE><CHOICE>Medium</CHOICE><CHOICE>High</CHOICE><CHOICE>Critical</CHOICE></CHOICES></Field>",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "Owner",
     "type": "User",
     "xml": "<Field Name=\"Owner\" StaticName=\"Owner\" DisplayName=\"Owner\" Required=\"FALSE\" Type=\"User\" UserSelectionMode=\"PeopleOnly\" UserSelectionScope=\"0\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "DueDate",
     "type": "DateOnly",
     "xml": "<Field Name=\"DueDate\" StaticName=\"DueDate\" DisplayName=\"Due Date\" Required=\"FALSE\" Description=\"Acknowledge-by date for complaints; delivery date for requests.\" Type=\"DateTime\" Format=\"DateOnly\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "Status",
     "type": "Choice",
     "xml": "<Field Name=\"Status\" StaticName=\"Status\" DisplayName=\"Status\" Required=\"FALSE\" Type=\"Choice\" FillInChoice=\"FALSE\" Format=\"Dropdown\"><Default>New</Default><CHOICES><CHOICE>New</CHOICE><CHOICE>Acknowledged</CHOICE><CHOICE>In Progress</CHOICE><CHOICE>Waiting on Customer</CHOICE><CHOICE>Waiting on Microsoft</CHOICE><CHOICE>Resolved</CHOICE><CHOICE>Closed - No Action</CHOICE></CHOICES></Field>",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "IsOpen",
     "type": "Boolean",
     "xml": "<Field Name=\"IsOpen\" StaticName=\"IsOpen\" DisplayName=\"Is Open\" Required=\"FALSE\" Type=\"Boolean\"><Default>1</Default></Field>",
     "indexed": true,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "AcknowledgedOn",
     "type": "DateTime",
     "xml": "<Field Name=\"AcknowledgedOn\" StaticName=\"AcknowledgedOn\" DisplayName=\"Acknowledged On\" Required=\"FALSE\" Type=\"DateTime\" Format=\"DateTime\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "ResolvedOn",
     "type": "DateTime",
     "xml": "<Field Name=\"ResolvedOn\" StaticName=\"ResolvedOn\" DisplayName=\"Resolved On\" Required=\"FALSE\" Type=\"DateTime\" Format=\"DateTime\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "Verbatim",
     "type": "Note",
     "xml": "<Field Name=\"Verbatim\" StaticName=\"Verbatim\" DisplayName=\"Customer Verbatim\" Required=\"FALSE\" Type=\"Note\" NumLines=\"6\" RichText=\"FALSE\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "Resolution",
     "type": "Note",
     "xml": "<Field Name=\"Resolution\" StaticName=\"Resolution\" DisplayName=\"Resolution\" Required=\"FALSE\" Type=\"Note\" NumLines=\"6\" RichText=\"FALSE\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "DetectedBy",
     "type": "Choice",
     "xml": "<Field Name=\"DetectedBy\" StaticName=\"DetectedBy\" DisplayName=\"Detected By\" Required=\"FALSE\" Type=\"Choice\" FillInChoice=\"FALSE\" Format=\"Dropdown\"><CHOICES><CHOICE>Keyword rules</CHOICE><CHOICE>AI classifier</CHOICE><CHOICE>CSM</CHOICE></CHOICES></Field>",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    }
   ],
   "views": [
    {
     "title": "Open Signals",
     "default": true,
     "query": "<OrderBy><FieldRef Name='DueDate' Ascending='TRUE'/></OrderBy><Where><Eq><FieldRef Name='IsOpen'/><Value Type='Boolean'>1</Value></Eq></Where>",
     "fields": [
      "LinkTitle",
      "SignalType",
      "Account",
      "CaseId",
      "Priority",
      "Status",
      "DueDate",
      "Owner",
      "ReceivedOn",
      "Category",
      "RequestType",
      "DetectedBy"
     ],
     "rowFormatter": "{\"$schema\": \"https://developer.microsoft.com/json-schemas/sp/v2/row-formatting.schema.json\", \"additionalRowClass\": \"=if([$DueDate] != '' && [$DueDate] < @now && [$IsOpen] == true, 'sp-field-severity--blocked', '')\"}"
    },
    {
     "title": "Complaints",
     "default": false,
     "query": "<OrderBy><FieldRef Name='ReceivedOn' Ascending='FALSE'/></OrderBy><Where><Eq><FieldRef Name='SignalType'/><Value Type='Choice'>Complaint</Value></Eq></Where>",
     "fields": [
      "LinkTitle",
      "Account",
      "CaseId",
      "Category",
      "Priority",
      "Status",
      "ReceivedOn",
      "AcknowledgedOn",
      "DueDate",
      "Verbatim"
     ],
     "rowFormatter": "{\"$schema\": \"https://developer.microsoft.com/json-schemas/sp/v2/row-formatting.schema.json\", \"additionalRowClass\": \"=if([$DueDate] != '' && [$DueDate] < @now && [$IsOpen] == true, 'sp-field-severity--blocked', '')\"}"
    },
    {
     "title": "Additional Requests",
     "default": false,
     "query": "<OrderBy><FieldRef Name='DueDate' Ascending='TRUE'/></OrderBy><Where><Eq><FieldRef Name='SignalType'/><Value Type='Choice'>Additional Request</Value></Eq></Where>",
     "fields": [
      "LinkTitle",
      "Account",
      "CaseId",
      "RequestType",
      "Priority",
      "Status",
      "DueDate",
      "Owner",
      "Resolution"
     ],
     "rowFormatter": "{\"$schema\": \"https://developer.microsoft.com/json-schemas/sp/v2/row-formatting.schema.json\", \"additionalRowClass\": \"=if([$DueDate] != '' && [$DueDate] < @now && [$IsOpen] == true, 'sp-field-severity--blocked', '')\"}"
    },
    {
     "title": "Overdue",
     "default": false,
     "query": "<OrderBy><FieldRef Name='DueDate' Ascending='TRUE'/></OrderBy><Where><And><Eq><FieldRef Name='IsOpen'/><Value Type='Boolean'>1</Value></Eq><Lt><FieldRef Name='DueDate'/><Value Type='DateTime'><Today/></Value></Lt></And></Where>",
     "fields": [
      "LinkTitle",
      "SignalType",
      "Account",
      "CaseId",
      "Priority",
      "Status",
      "DueDate",
      "Owner"
     ],
     "rowFormatter": "{\"$schema\": \"https://developer.microsoft.com/json-schemas/sp/v2/row-formatting.schema.json\", \"additionalRowClass\": \"=if([$DueDate] != '' && [$DueDate] < @now && [$IsOpen] == true, 'sp-field-severity--blocked', '')\"}"
    }
   ]
  },
  {
   "url": "CSCTEscalations",
   "title": "CSCT Escalations",
   "titleDisplay": "Escalation Summary",
   "description": "Escalation register with readiness checklist, manager approval and outcome.",
   "fields": [
    {
     "name": "CaseId",
     "type": "Text",
     "xml": "<Field Name=\"CaseId\" StaticName=\"CaseId\" DisplayName=\"Case ID\" Required=\"FALSE\" Type=\"Text\" MaxLength=\"255\" />",
     "indexed": true,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "Account",
     "type": "Lookup",
     "xml": "<Field Name=\"Account\" StaticName=\"Account\" DisplayName=\"Account\" Required=\"FALSE\" Type=\"Lookup\" List=\"{{LIST:CSCTAccounts}}\" ShowField=\"Title\" />",
     "indexed": false,
     "unique": false,
     "lookupList": "CSCTAccounts",
     "formatter": null
    },
    {
     "name": "TriggerRules",
     "type": "MultiChoice",
     "xml": "<Field Name=\"TriggerRules\" StaticName=\"TriggerRules\" DisplayName=\"Trigger Rules\" Required=\"FALSE\" Type=\"MultiChoice\" FillInChoice=\"FALSE\"><CHOICES><CHOICE>E1</CHOICE><CHOICE>E2</CHOICE><CHOICE>E3</CHOICE><CHOICE>E4</CHOICE><CHOICE>E5</CHOICE><CHOICE>E6</CHOICE><CHOICE>E7</CHOICE><CHOICE>E8</CHOICE><CHOICE>E9</CHOICE><CHOICE>E10</CHOICE><CHOICE>E11</CHOICE></CHOICES></Field>",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "Level",
     "type": "Choice",
     "xml": "<Field Name=\"Level\" StaticName=\"Level\" DisplayName=\"Level\" Required=\"FALSE\" Type=\"Choice\" FillInChoice=\"FALSE\" Format=\"Dropdown\"><CHOICES><CHOICE>L0 - Watch</CHOICE><CHOICE>L1 - Engineer's manager / Technical Advisor</CHOICE><CHOICE>L2 - Support escalation (duty manager / 24x7 Case Management)</CHOICE><CHOICE>L3 - Critical Situation Management</CHOICE><CHOICE>L4 - Executive alignment</CHOICE></CHOICES></Field>",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "Status",
     "type": "Choice",
     "xml": "<Field Name=\"Status\" StaticName=\"Status\" DisplayName=\"Status\" Required=\"FALSE\" Type=\"Choice\" FillInChoice=\"FALSE\" Format=\"Dropdown\"><Default>Candidate</Default><CHOICES><CHOICE>Candidate</CHOICE><CHOICE>Pending Manager Approval</CHOICE><CHOICE>Approved</CHOICE><CHOICE>Submitted</CHOICE><CHOICE>Active</CHOICE><CHOICE>De-escalated</CHOICE><CHOICE>Closed</CHOICE><CHOICE>Dismissed</CHOICE></CHOICES></Field>",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "IsOpen",
     "type": "Boolean",
     "xml": "<Field Name=\"IsOpen\" StaticName=\"IsOpen\" DisplayName=\"Is Open\" Required=\"FALSE\" Type=\"Boolean\"><Default>1</Default></Field>",
     "indexed": true,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "ProposedOn",
     "type": "DateTime",
     "xml": "<Field Name=\"ProposedOn\" StaticName=\"ProposedOn\" DisplayName=\"Proposed On\" Required=\"FALSE\" Type=\"DateTime\" Format=\"DateTime\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "ApprovedBy",
     "type": "User",
     "xml": "<Field Name=\"ApprovedBy\" StaticName=\"ApprovedBy\" DisplayName=\"Approved By\" Required=\"FALSE\" Type=\"User\" UserSelectionMode=\"PeopleOnly\" UserSelectionScope=\"0\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "ApprovedOn",
     "type": "DateTime",
     "xml": "<Field Name=\"ApprovedOn\" StaticName=\"ApprovedOn\" DisplayName=\"Approved On\" Required=\"FALSE\" Type=\"DateTime\" Format=\"DateTime\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "SubmittedOn",
     "type": "DateTime",
     "xml": "<Field Name=\"SubmittedOn\" StaticName=\"SubmittedOn\" DisplayName=\"Submitted On\" Required=\"FALSE\" Type=\"DateTime\" Format=\"DateTime\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "EngagedOn",
     "type": "DateTime",
     "xml": "<Field Name=\"EngagedOn\" StaticName=\"EngagedOn\" DisplayName=\"Engaged On\" Required=\"FALSE\" Type=\"DateTime\" Format=\"DateTime\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "ClosedOn",
     "type": "DateTime",
     "xml": "<Field Name=\"ClosedOn\" StaticName=\"ClosedOn\" DisplayName=\"Closed On\" Required=\"FALSE\" Type=\"DateTime\" Format=\"DateTime\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "MicrosoftContact",
     "type": "Text",
     "xml": "<Field Name=\"MicrosoftContact\" StaticName=\"MicrosoftContact\" DisplayName=\"Microsoft Escalation Contact\" Required=\"FALSE\" Type=\"Text\" MaxLength=\"255\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "BusinessImpact",
     "type": "Note",
     "xml": "<Field Name=\"BusinessImpact\" StaticName=\"BusinessImpact\" DisplayName=\"Business Impact Statement\" Required=\"FALSE\" Type=\"Note\" NumLines=\"6\" RichText=\"FALSE\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "CustomerAsk",
     "type": "Note",
     "xml": "<Field Name=\"CustomerAsk\" StaticName=\"CustomerAsk\" DisplayName=\"Customer Ask\" Required=\"FALSE\" Type=\"Note\" NumLines=\"6\" RichText=\"FALSE\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "TimelineSummary",
     "type": "Note",
     "xml": "<Field Name=\"TimelineSummary\" StaticName=\"TimelineSummary\" DisplayName=\"Timeline Summary\" Required=\"FALSE\" Description=\"Copilot drafts it from Case Events.\" Type=\"Note\" NumLines=\"6\" RichText=\"FALSE\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "RdyImpact",
     "type": "Boolean",
     "xml": "<Field Name=\"RdyImpact\" StaticName=\"RdyImpact\" DisplayName=\"Ready: Impact\" Required=\"FALSE\" Type=\"Boolean\"><Default>0</Default></Field>",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "RdyTimeline",
     "type": "Boolean",
     "xml": "<Field Name=\"RdyTimeline\" StaticName=\"RdyTimeline\" DisplayName=\"Ready: Timeline\" Required=\"FALSE\" Type=\"Boolean\"><Default>0</Default></Field>",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "RdyTechStatus",
     "type": "Boolean",
     "xml": "<Field Name=\"RdyTechStatus\" StaticName=\"RdyTechStatus\" DisplayName=\"Ready: Tech Status\" Required=\"FALSE\" Type=\"Boolean\"><Default>0</Default></Field>",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "RdyAsk",
     "type": "Boolean",
     "xml": "<Field Name=\"RdyAsk\" StaticName=\"RdyAsk\" DisplayName=\"Ready: Ask\" Required=\"FALSE\" Type=\"Boolean\"><Default>0</Default></Field>",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "RdyContacts",
     "type": "Boolean",
     "xml": "<Field Name=\"RdyContacts\" StaticName=\"RdyContacts\" DisplayName=\"Ready: Contacts\" Required=\"FALSE\" Type=\"Boolean\"><Default>0</Default></Field>",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "RdyExecAware",
     "type": "Boolean",
     "xml": "<Field Name=\"RdyExecAware\" StaticName=\"RdyExecAware\" DisplayName=\"Ready: Exec Aware\" Required=\"FALSE\" Type=\"Boolean\"><Default>0</Default></Field>",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "RdyMgrApproval",
     "type": "Boolean",
     "xml": "<Field Name=\"RdyMgrApproval\" StaticName=\"RdyMgrApproval\" DisplayName=\"Ready: Manager Approval\" Required=\"FALSE\" Type=\"Boolean\"><Default>0</Default></Field>",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "ReadinessPct",
     "type": "Number",
     "xml": "<Field Name=\"ReadinessPct\" StaticName=\"ReadinessPct\" DisplayName=\"Readiness %\" Required=\"FALSE\" Type=\"Number\" Decimals=\"0\" Min=\"0\" Max=\"100\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": "{\"$schema\": \"https://developer.microsoft.com/json-schemas/sp/v2/column-formatting.schema.json\", \"elmType\": \"div\", \"style\": {\"display\": \"=if(@currentField == '', 'none', 'flex')\", \"align-items\": \"center\", \"width\": \"100%\"}, \"children\": [{\"elmType\": \"div\", \"style\": {\"flex-grow\": \"1\", \"height\": \"12px\", \"background-color\": \"#EFEFEF\", \"border-radius\": \"6px\", \"overflow\": \"hidden\", \"margin-right\": \"8px\"}, \"children\": [{\"elmType\": \"div\", \"style\": {\"height\": \"100%\", \"width\": \"=if(@currentField > 100, '100%', toString(@currentField) + '%')\", \"background-color\": \"=if(@currentField >= 85, '#16A34A', if(@currentField >= 50, '#F59E0B', '#DC2626'))\"}}]}, {\"elmType\": \"span\", \"style\": {\"font-weight\": \"600\", \"min-width\": \"24px\"}, \"txtContent\": \"@currentField\"}]}"
    },
    {
     "name": "HoursToEngage",
     "type": "Number",
     "xml": "<Field Name=\"HoursToEngage\" StaticName=\"HoursToEngage\" DisplayName=\"Hours to Engage\" Required=\"FALSE\" Type=\"Number\" Decimals=\"1\" Min=\"0\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "DeescalationCriteria",
     "type": "Note",
     "xml": "<Field Name=\"DeescalationCriteria\" StaticName=\"DeescalationCriteria\" DisplayName=\"De-escalation Criteria\" Required=\"FALSE\" Type=\"Note\" NumLines=\"6\" RichText=\"FALSE\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "Outcome",
     "type": "Note",
     "xml": "<Field Name=\"Outcome\" StaticName=\"Outcome\" DisplayName=\"Outcome\" Required=\"FALSE\" Type=\"Note\" NumLines=\"6\" RichText=\"FALSE\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "LessonsLearned",
     "type": "Note",
     "xml": "<Field Name=\"LessonsLearned\" StaticName=\"LessonsLearned\" DisplayName=\"Lessons Learned\" Required=\"FALSE\" Type=\"Note\" NumLines=\"6\" RichText=\"FALSE\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    }
   ],
   "views": [
    {
     "title": "Open Escalations",
     "default": true,
     "query": "<OrderBy><FieldRef Name='ProposedOn' Ascending='FALSE'/></OrderBy><Where><Eq><FieldRef Name='IsOpen'/><Value Type='Boolean'>1</Value></Eq></Where>",
     "fields": [
      "LinkTitle",
      "Account",
      "CaseId",
      "Level",
      "Status",
      "TriggerRules",
      "ReadinessPct",
      "ProposedOn",
      "ApprovedOn",
      "EngagedOn",
      "HoursToEngage"
     ],
     "rowFormatter": null
    },
    {
     "title": "Pending Manager Approval",
     "default": false,
     "query": "<OrderBy><FieldRef Name='ProposedOn' Ascending='FALSE'/></OrderBy><Where><Eq><FieldRef Name='Status'/><Value Type='Choice'>Pending Manager Approval</Value></Eq></Where>",
     "fields": [
      "LinkTitle",
      "Account",
      "CaseId",
      "Level",
      "TriggerRules",
      "ReadinessPct",
      "BusinessImpact",
      "CustomerAsk",
      "ProposedOn"
     ],
     "rowFormatter": null
    }
   ]
  },
  {
   "url": "CSCTDailySnapshot",
   "title": "CSCT Daily Snapshot",
   "titleDisplay": "Snapshot Key",
   "description": "One row per open case and per account per engine run - powers trends in Power BI.",
   "fields": [
    {
     "name": "SnapshotDate",
     "type": "DateOnly",
     "xml": "<Field Name=\"SnapshotDate\" StaticName=\"SnapshotDate\" DisplayName=\"Snapshot Date\" Required=\"FALSE\" Type=\"DateTime\" Format=\"DateOnly\" />",
     "indexed": true,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "RowType",
     "type": "Choice",
     "xml": "<Field Name=\"RowType\" StaticName=\"RowType\" DisplayName=\"Row Type\" Required=\"FALSE\" Type=\"Choice\" FillInChoice=\"FALSE\" Format=\"Dropdown\"><CHOICES><CHOICE>Case</CHOICE><CHOICE>Account</CHOICE></CHOICES></Field>",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "CaseId",
     "type": "Text",
     "xml": "<Field Name=\"CaseId\" StaticName=\"CaseId\" DisplayName=\"Case ID\" Required=\"FALSE\" Type=\"Text\" MaxLength=\"255\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "AccountName",
     "type": "Text",
     "xml": "<Field Name=\"AccountName\" StaticName=\"AccountName\" DisplayName=\"Account\" Required=\"FALSE\" Type=\"Text\" MaxLength=\"255\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "Severity",
     "type": "Text",
     "xml": "<Field Name=\"Severity\" StaticName=\"Severity\" DisplayName=\"Severity\" Required=\"FALSE\" Type=\"Text\" MaxLength=\"255\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "Status",
     "type": "Text",
     "xml": "<Field Name=\"Status\" StaticName=\"Status\" DisplayName=\"Status\" Required=\"FALSE\" Type=\"Text\" MaxLength=\"255\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "RiskScore",
     "type": "Number",
     "xml": "<Field Name=\"RiskScore\" StaticName=\"RiskScore\" DisplayName=\"Risk Score\" Required=\"FALSE\" Type=\"Number\" Decimals=\"0\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "RiskLevel",
     "type": "Text",
     "xml": "<Field Name=\"RiskLevel\" StaticName=\"RiskLevel\" DisplayName=\"Risk Level\" Required=\"FALSE\" Type=\"Text\" MaxLength=\"255\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "IsStalled",
     "type": "Boolean",
     "xml": "<Field Name=\"IsStalled\" StaticName=\"IsStalled\" DisplayName=\"Stalled\" Required=\"FALSE\" Type=\"Boolean\"><Default>0</Default></Field>",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "StallType",
     "type": "Text",
     "xml": "<Field Name=\"StallType\" StaticName=\"StallType\" DisplayName=\"Stall Type\" Required=\"FALSE\" Type=\"Text\" MaxLength=\"255\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "SLAStatus",
     "type": "Text",
     "xml": "<Field Name=\"SLAStatus\" StaticName=\"SLAStatus\" DisplayName=\"SLA Status\" Required=\"FALSE\" Type=\"Text\" MaxLength=\"255\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "EscalationStatus",
     "type": "Text",
     "xml": "<Field Name=\"EscalationStatus\" StaticName=\"EscalationStatus\" DisplayName=\"Escalation Status\" Required=\"FALSE\" Type=\"Text\" MaxLength=\"255\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "DaysOpen",
     "type": "Number",
     "xml": "<Field Name=\"DaysOpen\" StaticName=\"DaysOpen\" DisplayName=\"Days Open\" Required=\"FALSE\" Type=\"Number\" Decimals=\"0\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    }
   ],
   "views": [
    {
     "title": "Latest",
     "default": true,
     "query": "<OrderBy><FieldRef Name='SnapshotDate' Ascending='FALSE'/></OrderBy>",
     "fields": [
      "SnapshotDate",
      "RowType",
      "CaseId",
      "AccountName",
      "Severity",
      "RiskScore",
      "RiskLevel",
      "IsStalled",
      "StallType",
      "SLAStatus"
     ],
     "rowFormatter": null
    }
   ]
  },
  {
   "url": "CSCTReviewLog",
   "title": "CSCT Review Log",
   "titleDisplay": "Review",
   "description": "Daily triage, manager syncs and weekly executive reviews: KPIs, decisions, actions, asks, executive summary.",
   "fields": [
    {
     "name": "ReviewDate",
     "type": "DateOnly",
     "xml": "<Field Name=\"ReviewDate\" StaticName=\"ReviewDate\" DisplayName=\"Review Date\" Required=\"FALSE\" Type=\"DateTime\" Format=\"DateOnly\" />",
     "indexed": true,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "ReviewType",
     "type": "Choice",
     "xml": "<Field Name=\"ReviewType\" StaticName=\"ReviewType\" DisplayName=\"Review Type\" Required=\"FALSE\" Type=\"Choice\" FillInChoice=\"FALSE\" Format=\"Dropdown\"><CHOICES><CHOICE>Daily Triage</CHOICE><CHOICE>Manager Sync</CHOICE><CHOICE>Weekly Executive Review</CHOICE><CHOICE>Monthly Calibration</CHOICE><CHOICE>Account Review</CHOICE></CHOICES></Field>",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "Reviewer",
     "type": "User",
     "xml": "<Field Name=\"Reviewer\" StaticName=\"Reviewer\" DisplayName=\"Reviewer\" Required=\"FALSE\" Type=\"User\" UserSelectionMode=\"PeopleOnly\" UserSelectionScope=\"0\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "OpenCases",
     "type": "Number",
     "xml": "<Field Name=\"OpenCases\" StaticName=\"OpenCases\" DisplayName=\"Open Cases\" Required=\"FALSE\" Type=\"Number\" Decimals=\"0\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "RedCases",
     "type": "Number",
     "xml": "<Field Name=\"RedCases\" StaticName=\"RedCases\" DisplayName=\"Red\" Required=\"FALSE\" Type=\"Number\" Decimals=\"0\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "YellowCases",
     "type": "Number",
     "xml": "<Field Name=\"YellowCases\" StaticName=\"YellowCases\" DisplayName=\"Yellow\" Required=\"FALSE\" Type=\"Number\" Decimals=\"0\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "StalledCases",
     "type": "Number",
     "xml": "<Field Name=\"StalledCases\" StaticName=\"StalledCases\" DisplayName=\"Stalled\" Required=\"FALSE\" Type=\"Number\" Decimals=\"0\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "SLABreaches",
     "type": "Number",
     "xml": "<Field Name=\"SLABreaches\" StaticName=\"SLABreaches\" DisplayName=\"SLA Breaches\" Required=\"FALSE\" Type=\"Number\" Decimals=\"0\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "EscalationCandidates",
     "type": "Number",
     "xml": "<Field Name=\"EscalationCandidates\" StaticName=\"EscalationCandidates\" DisplayName=\"Escalation Candidates\" Required=\"FALSE\" Type=\"Number\" Decimals=\"0\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "NewSignals",
     "type": "Number",
     "xml": "<Field Name=\"NewSignals\" StaticName=\"NewSignals\" DisplayName=\"New Signals\" Required=\"FALSE\" Type=\"Number\" Decimals=\"0\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "ExecutiveSummary",
     "type": "Note",
     "xml": "<Field Name=\"ExecutiveSummary\" StaticName=\"ExecutiveSummary\" DisplayName=\"Executive Summary\" Required=\"FALSE\" Type=\"Note\" NumLines=\"6\" RichText=\"TRUE\" RichTextMode=\"FullHtml\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "Decisions",
     "type": "Note",
     "xml": "<Field Name=\"Decisions\" StaticName=\"Decisions\" DisplayName=\"Decisions\" Required=\"FALSE\" Type=\"Note\" NumLines=\"6\" RichText=\"FALSE\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "ActionsAgreed",
     "type": "Note",
     "xml": "<Field Name=\"ActionsAgreed\" StaticName=\"ActionsAgreed\" DisplayName=\"Actions Agreed\" Required=\"FALSE\" Type=\"Note\" NumLines=\"6\" RichText=\"FALSE\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "AsksForManager",
     "type": "Note",
     "xml": "<Field Name=\"AsksForManager\" StaticName=\"AsksForManager\" DisplayName=\"Asks for Manager\" Required=\"FALSE\" Type=\"Note\" NumLines=\"6\" RichText=\"FALSE\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "ManagerAcknowledged",
     "type": "Boolean",
     "xml": "<Field Name=\"ManagerAcknowledged\" StaticName=\"ManagerAcknowledged\" DisplayName=\"Manager Acknowledged\" Required=\"FALSE\" Type=\"Boolean\"><Default>0</Default></Field>",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "ManagerComments",
     "type": "Note",
     "xml": "<Field Name=\"ManagerComments\" StaticName=\"ManagerComments\" DisplayName=\"Manager Comments\" Required=\"FALSE\" Type=\"Note\" NumLines=\"6\" RichText=\"FALSE\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    }
   ],
   "views": [
    {
     "title": "All Reviews",
     "default": true,
     "query": "<OrderBy><FieldRef Name='ReviewDate' Ascending='FALSE'/></OrderBy>",
     "fields": [
      "ReviewDate",
      "ReviewType",
      "LinkTitle",
      "Reviewer",
      "RedCases",
      "YellowCases",
      "StalledCases",
      "EscalationCandidates",
      "ManagerAcknowledged"
     ],
     "rowFormatter": null
    }
   ]
  },
  {
   "url": "CSCTConfig",
   "title": "CSCT Config",
   "titleDisplay": "Key",
   "description": "Tunable thresholds, weights, SLA targets, keyword dictionaries (EN/TR), routing and holidays.",
   "fields": [
    {
     "name": "Value",
     "type": "Text",
     "xml": "<Field Name=\"Value\" StaticName=\"Value\" DisplayName=\"Value\" Required=\"TRUE\" Type=\"Text\" MaxLength=\"255\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "Category",
     "type": "Choice",
     "xml": "<Field Name=\"Category\" StaticName=\"Category\" DisplayName=\"Category\" Required=\"FALSE\" Type=\"Choice\" FillInChoice=\"FALSE\" Format=\"Dropdown\"><CHOICES><CHOICE>SLA</CHOICE><CHOICE>Stall</CHOICE><CHOICE>Age</CHOICE><CHOICE>RAG</CHOICE><CHOICE>Weight</CHOICE><CHOICE>Cap</CHOICE><CHOICE>Account</CHOICE><CHOICE>Rule</CHOICE><CHOICE>Keyword</CHOICE><CHOICE>Parsing</CHOICE><CHOICE>Routing</CHOICE><CHOICE>Schedule</CHOICE><CHOICE>Holiday</CHOICE></CHOICES></Field>",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    },
    {
     "name": "Description",
     "type": "Note",
     "xml": "<Field Name=\"Description\" StaticName=\"Description\" DisplayName=\"Description\" Required=\"FALSE\" Type=\"Note\" NumLines=\"6\" RichText=\"FALSE\" />",
     "indexed": false,
     "unique": false,
     "lookupList": null,
     "formatter": null
    }
   ],
   "views": [
    {
     "title": "By Category",
     "default": true,
     "query": "<OrderBy><FieldRef Name='Category'/><FieldRef Name='Title'/></OrderBy>",
     "fields": [
      "Category",
      "LinkTitle",
      "Value",
      "Description"
     ],
     "rowFormatter": null
    }
   ]
  }
 ],
 "config": [
  {
   "Title": "TZ_OffsetHours",
   "Value": "3",
   "Category": "Schedule",
   "Description": "Europe/Istanbul offset (UTC+3, no DST)."
  },
  {
   "Title": "BusinessHours_Start",
   "Value": "9",
   "Category": "SLA",
   "Description": "Business hours start (local) for Sev B/C SLA clocks."
  },
  {
   "Title": "BusinessHours_End",
   "Value": "18",
   "Category": "SLA",
   "Description": "Business hours end (local)."
  },
  {
   "Title": "SLA_FirstResponse_Hours_Sev1",
   "Value": "1",
   "Category": "SLA",
   "Description": "Unified Services Description default (Unified Performance: 0.5). 24x7."
  },
  {
   "Title": "SLA_FirstResponse_Hours_SevA",
   "Value": "1",
   "Category": "SLA",
   "Description": "Default 1h, 24x7. Verify against each customer's contract."
  },
  {
   "Title": "SLA_FirstResponse_Hours_SevB",
   "Value": "2",
   "Category": "SLA",
   "Description": "Default 2 business hours."
  },
  {
   "Title": "SLA_FirstResponse_Hours_SevC",
   "Value": "4",
   "Category": "SLA",
   "Description": "Default 4 business hours."
  },
  {
   "Title": "Stall_BD_Sev1",
   "Value": "1",
   "Category": "Stall",
   "Description": "Business days without a Microsoft update before a Sev 1 counts as stalled (real-time watch also runs hourly)."
  },
  {
   "Title": "Stall_BD_SevA",
   "Value": "1",
   "Category": "Stall",
   "Description": "Sev A expects daily updates."
  },
  {
   "Title": "Stall_BD_SevB",
   "Value": "3",
   "Category": "Stall",
   "Description": "Sev B expects an update at least every 3 business days."
  },
  {
   "Title": "Stall_BD_SevC",
   "Value": "5",
   "Category": "Stall",
   "Description": "Sev C expects a weekly update."
  },
  {
   "Title": "Stall_CustomerSide_BD",
   "Value": "5",
   "Category": "Stall",
   "Description": "Customer silence (ball with customer) before nudge / closure proposal."
  },
  {
   "Title": "Stall_CustomerSide_BD_SevA",
   "Value": "2",
   "Category": "Stall",
   "Description": "Customer silence threshold for Sev 1/A."
  },
  {
   "Title": "Age_Target_Days_Sev1",
   "Value": "3",
   "Category": "Age",
   "Description": "Target resolution window (calendar days)."
  },
  {
   "Title": "Age_Target_Days_SevA",
   "Value": "7",
   "Category": "Age",
   "Description": ""
  },
  {
   "Title": "Age_Target_Days_SevB",
   "Value": "14",
   "Category": "Age",
   "Description": ""
  },
  {
   "Title": "Age_Target_Days_SevC",
   "Value": "30",
   "Category": "Age",
   "Description": ""
  },
  {
   "Title": "RAG_Yellow_Min",
   "Value": "30",
   "Category": "RAG",
   "Description": "Score >= this is Yellow."
  },
  {
   "Title": "RAG_Red_Min",
   "Value": "60",
   "Category": "RAG",
   "Description": "Score >= this is Red."
  },
  {
   "Title": "W_Sev1",
   "Value": "35",
   "Category": "Weight",
   "Description": "Severity base points."
  },
  {
   "Title": "W_SevA",
   "Value": "22",
   "Category": "Weight",
   "Description": ""
  },
  {
   "Title": "W_SevB",
   "Value": "12",
   "Category": "Weight",
   "Description": ""
  },
  {
   "Title": "W_SevC",
   "Value": "3",
   "Category": "Weight",
   "Description": ""
  },
  {
   "Title": "W_IdleHalf",
   "Value": "8",
   "Category": "Weight",
   "Description": "Microsoft idle >= 50% of stall threshold."
  },
  {
   "Title": "W_Idle1x",
   "Value": "18",
   "Category": "Weight",
   "Description": "Microsoft idle >= threshold (stalled)."
  },
  {
   "Title": "W_Idle2x",
   "Value": "25",
   "Category": "Weight",
   "Description": "Microsoft idle >= 2x threshold."
  },
  {
   "Title": "W_CustIdle1x",
   "Value": "6",
   "Category": "Weight",
   "Description": "Customer silence >= threshold."
  },
  {
   "Title": "W_CustIdle2x",
   "Value": "10",
   "Category": "Weight",
   "Description": "Customer silence >= 2x threshold."
  },
  {
   "Title": "W_BlindSpot",
   "Value": "5",
   "Category": "Weight",
   "Description": "No case correspondence visible to the CSM."
  },
  {
   "Title": "Cap_Momentum",
   "Value": "30",
   "Category": "Cap",
   "Description": "Momentum factor cap."
  },
  {
   "Title": "W_AgeHalf",
   "Value": "5",
   "Category": "Weight",
   "Description": "Age >= 50% of target."
  },
  {
   "Title": "W_Age1x",
   "Value": "15",
   "Category": "Weight",
   "Description": "Age >= target."
  },
  {
   "Title": "W_Age2x",
   "Value": "20",
   "Category": "Weight",
   "Description": "Age >= 2x target."
  },
  {
   "Title": "W_SLA_AwaitingFirst",
   "Value": "15",
   "Category": "Weight",
   "Description": "Still no first response after SLA."
  },
  {
   "Title": "W_SLA_AtRisk",
   "Value": "5",
   "Category": "Weight",
   "Description": ">= 75% of SLA elapsed, no response."
  },
  {
   "Title": "W_SLA_Late",
   "Value": "5",
   "Category": "Weight",
   "Description": "First response was late (historical)."
  },
  {
   "Title": "W_NextActionOverdue",
   "Value": "8",
   "Category": "Weight",
   "Description": ""
  },
  {
   "Title": "W_ETAMissed",
   "Value": "8",
   "Category": "Weight",
   "Description": ""
  },
  {
   "Title": "Cap_SLA",
   "Value": "15",
   "Category": "Cap",
   "Description": ""
  },
  {
   "Title": "W_Frustrated",
   "Value": "8",
   "Category": "Weight",
   "Description": ""
  },
  {
   "Title": "W_Angry",
   "Value": "15",
   "Category": "Weight",
   "Description": ""
  },
  {
   "Title": "W_Complaint",
   "Value": "8",
   "Category": "Weight",
   "Description": "Open complaint on the case."
  },
  {
   "Title": "W_Chasers",
   "Value": "6",
   "Category": "Weight",
   "Description": "Customer follow-ups without a Microsoft reply."
  },
  {
   "Title": "W_RequestOverdue",
   "Value": "4",
   "Category": "Weight",
   "Description": ""
  },
  {
   "Title": "Cap_Voice",
   "Value": "20",
   "Category": "Cap",
   "Description": ""
  },
  {
   "Title": "W_Exec",
   "Value": "8",
   "Category": "Weight",
   "Description": "Customer executive visibility."
  },
  {
   "Title": "W_ImpactHigh",
   "Value": "4",
   "Category": "Weight",
   "Description": ""
  },
  {
   "Title": "W_ImpactCritical",
   "Value": "8",
   "Category": "Weight",
   "Description": ""
  },
  {
   "Title": "W_Churn",
   "Value": "5",
   "Category": "Weight",
   "Description": "Ownership changes >= Churn_Min."
  },
  {
   "Title": "W_Reopen",
   "Value": "5",
   "Category": "Weight",
   "Description": ""
  },
  {
   "Title": "W_SevRaised",
   "Value": "5",
   "Category": "Weight",
   "Description": "Severity raised in the last Recent_Days."
  },
  {
   "Title": "W_AcctConcern",
   "Value": "3",
   "Category": "Weight",
   "Description": "Account CSM concern = Concern."
  },
  {
   "Title": "W_AcctCritical",
   "Value": "6",
   "Category": "Weight",
   "Description": "Account CSM concern = Critical."
  },
  {
   "Title": "W_Renewal",
   "Value": "3",
   "Category": "Weight",
   "Description": "Contract ends within Renewal_Window_Days."
  },
  {
   "Title": "Cap_Exposure",
   "Value": "15",
   "Category": "Cap",
   "Description": ""
  },
  {
   "Title": "Chasers_Min",
   "Value": "2",
   "Category": "Rule",
   "Description": ""
  },
  {
   "Title": "Churn_Min",
   "Value": "3",
   "Category": "Rule",
   "Description": ""
  },
  {
   "Title": "Floor_Age_Days",
   "Value": "30",
   "Category": "Rule",
   "Description": "Open this long -> at least Yellow."
  },
  {
   "Title": "Recent_Days",
   "Value": "7",
   "Category": "Rule",
   "Description": "Window for 'recently raised / recently de-escalated'."
  },
  {
   "Title": "Renewal_Window_Days",
   "Value": "90",
   "Category": "Rule",
   "Description": ""
  },
  {
   "Title": "Trend_Delta",
   "Value": "10",
   "Category": "Rule",
   "Description": "Score change that counts as Improving / Worsening."
  },
  {
   "Title": "Pattern_Min_Cases",
   "Value": "3",
   "Category": "Rule",
   "Description": "E9 account pattern threshold."
  },
  {
   "Title": "Pattern_Window_Days",
   "Value": "14",
   "Category": "Rule",
   "Description": ""
  },
  {
   "Title": "A_WorstCaseFactor",
   "Value": "0.4",
   "Category": "Account",
   "Description": "Account score = 40% of the worst open case score + roll-ups below."
  },
  {
   "Title": "A_PerRed",
   "Value": "10",
   "Category": "Account",
   "Description": ""
  },
  {
   "Title": "A_Cap_Red",
   "Value": "20",
   "Category": "Account",
   "Description": ""
  },
  {
   "Title": "A_PerYellow",
   "Value": "3",
   "Category": "Account",
   "Description": ""
  },
  {
   "Title": "A_Cap_Yellow",
   "Value": "9",
   "Category": "Account",
   "Description": ""
  },
  {
   "Title": "A_PerEscalation",
   "Value": "10",
   "Category": "Account",
   "Description": ""
  },
  {
   "Title": "A_Cap_Escalation",
   "Value": "15",
   "Category": "Account",
   "Description": ""
  },
  {
   "Title": "A_PerComplaint",
   "Value": "6",
   "Category": "Account",
   "Description": ""
  },
  {
   "Title": "A_Cap_Complaint",
   "Value": "12",
   "Category": "Account",
   "Description": ""
  },
  {
   "Title": "A_PerOverdueRequest",
   "Value": "4",
   "Category": "Account",
   "Description": ""
  },
  {
   "Title": "A_Cap_OverdueRequest",
   "Value": "8",
   "Category": "Account",
   "Description": ""
  },
  {
   "Title": "A_Concern_Watch",
   "Value": "5",
   "Category": "Account",
   "Description": ""
  },
  {
   "Title": "A_Concern_Concern",
   "Value": "12",
   "Category": "Account",
   "Description": ""
  },
  {
   "Title": "A_Concern_Critical",
   "Value": "25",
   "Category": "Account",
   "Description": ""
  },
  {
   "Title": "A_Renewal",
   "Value": "5",
   "Category": "Account",
   "Description": "Renewal window with open Red/Yellow cases."
  },
  {
   "Title": "A_MIRP",
   "Value": "3",
   "Category": "Account",
   "Description": "MIRP not started / pending / expired."
  },
  {
   "Title": "A_Pattern",
   "Value": "5",
   "Category": "Account",
   "Description": "E9 pattern alert present."
  },
  {
   "Title": "KW_Complaint_EN",
   "Value": "unacceptable; not acceptable; disappointed; not satisfied; poor support; no response; still waiting; frustrated; complaint; waste of time; very slow",
   "Category": "Keyword",
   "Description": "Complaint detection (English)."
  },
  {
   "Title": "KW_Complaint_TR",
   "Value": "kabul edilemez; memnun değiliz; memnuniyetsiz; şikayet; hâlâ bekliyoruz; hala bekliyoruz; yanıt alamadık; dönüş alamadık; çok yavaş; hayal kırıklığı",
   "Category": "Keyword",
   "Description": "Complaint detection (Turkish)."
  },
  {
   "Title": "KW_Escalation_EN",
   "Value": "escalate; escalation; management attention; senior engineer; duty manager; production down; business critical; CIO; CTO",
   "Category": "Keyword",
   "Description": "Escalation-request detection (English)."
  },
  {
   "Title": "KW_Escalation_TR",
   "Value": "eskalasyon; eskale; yönetime; üst yönetim; acil; kritik; üretim durdu; iş etkisi; genel müdür",
   "Category": "Keyword",
   "Description": "Escalation-request detection (Turkish)."
  },
  {
   "Title": "KW_Request_EN",
   "Value": "RCA; root cause; post-incident; preventive action; schedule a call; can we have a call; workshop; documentation; best practice; additional engineer; onsite",
   "Category": "Keyword",
   "Description": "Additional-request detection (English)."
  },
  {
   "Title": "KW_Request_TR",
   "Value": "kök neden; önleyici aksiyon; toplantı; görüşme; dokümantasyon; ek talep; rica ediyoruz; paylaşabilir misiniz; yerinde destek",
   "Category": "Keyword",
   "Description": "Additional-request detection (Turkish)."
  },
  {
   "Title": "KW_MicrosoftPending_EN",
   "Value": "we will; I will; we are currently; investigating; testing; will update you; will share; working on",
   "Category": "Keyword",
   "Description": "Microsoft reply that keeps the ball with Microsoft."
  },
  {
   "Title": "Parse_NotificationSender",
   "Value": "notifications@techsupport.microsoft.com",
   "Category": "Parsing",
   "Description": "Lifecycle notifications (created / ownership / severity change / closed)."
  },
  {
   "Title": "Parse_SupportMailSender",
   "Value": "supportmail@techsupport.microsoft.com",
   "Category": "Parsing",
   "Description": "Engineer correspondence and Critical Situation notices."
  },
  {
   "Title": "Parse_CaseToken",
   "Value": "TrackingID#",
   "Category": "Parsing",
   "Description": "Subject token followed by the 16-digit case number."
  },
  {
   "Title": "Parse_InternalDomain",
   "Value": "microsoft.com",
   "Category": "Parsing",
   "Description": "Internal senders (CSM / CSAM / vendors)."
  },
  {
   "Title": "Parse_StoreSnippetChars",
   "Value": "400",
   "Category": "Parsing",
   "Description": "Characters of message text kept in Case Events (0 = none)."
  },
  {
   "Title": "Routing_24x7CaseManagement",
   "Value": "24x7casemanagement@microsoft.com",
   "Category": "Routing",
   "Description": "Management assistance for Sev B/C outside business hours (as stated in Microsoft support notifications)."
  },
  {
   "Title": "Routing_SeverityRaise",
   "Value": "Local support number (aka.ms/premierhotline)",
   "Category": "Routing",
   "Description": "Raise severity / engage CritSit by phone."
  },
  {
   "Title": "Routing_ManagerUPN",
   "Value": "<manager@microsoft.com>",
   "Category": "Routing",
   "Description": "Receives approvals, daily digest mention and weekly summary."
  },
  {
   "Title": "Routing_TeamName",
   "Value": "Customer Success Control Tower",
   "Category": "Routing",
   "Description": "Teams team for alerts and reviews."
  },
  {
   "Title": "Schedule_Engine",
   "Value": "Mon-Fri 07:30",
   "Category": "Schedule",
   "Description": "F2 Daily Risk Engine & Digest (local time)."
  },
  {
   "Title": "Schedule_WeeklySummary",
   "Value": "Fri 16:00",
   "Category": "Schedule",
   "Description": "F4 Weekly Executive Summary."
  },
  {
   "Title": "Schedule_SLAWatch",
   "Value": "Hourly 08:00-20:00; Sev 1/A 24x7",
   "Category": "Schedule",
   "Description": "F7 SLA & Sev A watch."
  },
  {
   "Title": "Holiday_2026-10-29",
   "Value": "2026-10-29",
   "Category": "Holiday",
   "Description": "Republic Day"
  },
  {
   "Title": "Holiday_2027-01-01",
   "Value": "2027-01-01",
   "Category": "Holiday",
   "Description": "New Year's Day"
  },
  {
   "Title": "Holiday_2027-04-23",
   "Value": "2027-04-23",
   "Category": "Holiday",
   "Description": "National Sovereignty and Children's Day"
  },
  {
   "Title": "Holiday_2027-05-01",
   "Value": "2027-05-01",
   "Category": "Holiday",
   "Description": "Labour Day"
  },
  {
   "Title": "Holiday_2027-05-19",
   "Value": "2027-05-19",
   "Category": "Holiday",
   "Description": "Commemoration of Atatürk, Youth and Sports Day"
  },
  {
   "Title": "Holiday_2027-07-15",
   "Value": "2027-07-15",
   "Category": "Holiday",
   "Description": "Democracy and National Unity Day"
  },
  {
   "Title": "Holiday_2027-08-30",
   "Value": "2027-08-30",
   "Category": "Holiday",
   "Description": "Victory Day"
  },
  {
   "Title": "Holiday_2027-10-29",
   "Value": "2027-10-29",
   "Category": "Holiday",
   "Description": "Republic Day"
  }
 ]
};
  const DEMO = {"CSCTAccounts": [{"Title": "Contoso Holding", "AccountId": "TP-100101", "Aliases": "contoso.com; Contoso Holding", "Segment": "Strategic", "Industry": "Holding / Conglomerate", "StrategicTier": "Tier 1", "ContractType": "Unified Enterprise", "ContractEnd": "2026-12-15", "CSMConcern": "Concern", "CSMConcernNote": "CIO unhappy with Teams reliability ahead of renewal.", "MIRPStatus": "Approved", "CustomerExecSponsor": "Group CIO", "LastTouchpoint": "2026-09-24", "NextTouchpoint": "2026-10-06", "AccountRiskScore": 85, "AccountRAG": "Red", "AccountRiskDrivers": "Worst case score 83 (+33); 2 Red case(s) (+20); 2 open complaint(s) (+12); CSM concern: Concern (+12); Contract ends in 76 days with open risk (+5); 1 Yellow case(s) (+3) | Override: 2+ Red cases, Red case with executive visibility", "AccountRiskTrend": "Worsening", "OpenCases": 4, "RedCases": 2, "StalledCases": 3, "OpenComplaints": 2, "ActiveEscalations": 0, "PatternAlert": "", "LastScored": "2026-09-30T04:30:00.000Z"}, {"Title": "Woodgrove Bank", "AccountId": "TP-100102", "Aliases": "woodgrovebank.com; Woodgrove Bank", "Segment": "Strategic", "Industry": "Financial Services", "StrategicTier": "Tier 1", "ContractType": "Unified Performance", "ContractEnd": "2027-06-30", "CSMConcern": "Watch", "CSMConcernNote": "Core banking modernization in flight; low tolerance for outages.", "MIRPStatus": "Pending", "CustomerExecSponsor": "CTO", "LastTouchpoint": "2026-09-22", "NextTouchpoint": "2026-10-02", "AccountRiskScore": 54, "AccountRAG": "Red", "AccountRiskDrivers": "Worst case score 58 (+23); 1 Red case(s) (+10); 1 active escalation(s) (+10); CSM concern: Watch (+5); 1 Yellow case(s) (+3); MIRP pending (+3) | Override: Red case with executive visibility, Sev 1 / CritSit active", "AccountRiskTrend": "Worsening", "OpenCases": 5, "RedCases": 1, "StalledCases": 1, "OpenComplaints": 0, "ActiveEscalations": 1, "PatternAlert": "", "LastScored": "2026-09-30T04:30:00.000Z"}, {"Title": "Fabrikam Energy", "AccountId": "TP-100103", "Aliases": "fabrikam.com; Fabrikam Energy", "Segment": "Major", "Industry": "Energy & Utilities", "StrategicTier": "Tier 1", "ContractType": "Unified Enterprise", "ContractEnd": "2027-03-31", "CSMConcern": "None", "CSMConcernNote": "", "MIRPStatus": "Approved", "CustomerExecSponsor": "CIO", "LastTouchpoint": "2026-09-18", "NextTouchpoint": "2026-10-09", "AccountRiskScore": 66, "AccountRAG": "Red", "AccountRiskDrivers": "Worst case score 89 (+36); 1 Red case(s) (+10); 1 active escalation(s) (+10); 2 Yellow case(s) (+6); 1 overdue request(s) (+4)", "AccountRiskTrend": "Worsening", "OpenCases": 4, "RedCases": 1, "StalledCases": 1, "OpenComplaints": 0, "ActiveEscalations": 1, "PatternAlert": "", "LastScored": "2026-09-30T04:30:00.000Z"}, {"Title": "Northwind Logistics", "AccountId": "TP-100104", "Aliases": "northwindlogistics.com; Northwind Logistics", "Segment": "Major", "Industry": "Logistics", "StrategicTier": "Tier 2", "ContractType": "Unified Enterprise", "ContractEnd": "2026-11-30", "CSMConcern": "Watch", "CSMConcernNote": "Renewal in ~60 days; evaluating support options.", "MIRPStatus": "Pending", "CustomerExecSponsor": "IT Director", "LastTouchpoint": "2026-09-15", "NextTouchpoint": "2026-10-01", "AccountRiskScore": 34, "AccountRAG": "Yellow", "AccountRiskDrivers": "Worst case score 38 (+15); 2 Yellow case(s) (+6); CSM concern: Watch (+5); Contract ends in 61 days with open risk (+5); MIRP pending (+3)", "AccountRiskTrend": "Stable", "OpenCases": 3, "RedCases": 0, "StalledCases": 1, "OpenComplaints": 0, "ActiveEscalations": 0, "PatternAlert": "", "LastScored": "2026-09-30T04:30:00.000Z"}, {"Title": "Tailspin Aerospace", "AccountId": "TP-100105", "Aliases": "tailspinaero.com; Tailspin Aerospace", "Segment": "Strategic", "Industry": "Defense & Aerospace", "StrategicTier": "Tier 1", "ContractType": "Unified Enterprise", "ContractEnd": "2027-09-30", "CSMConcern": "None", "CSMConcernNote": "", "MIRPStatus": "Approved", "CustomerExecSponsor": "CISO", "LastTouchpoint": "2026-09-10", "NextTouchpoint": "2026-10-14", "AccountRiskScore": 23, "AccountRAG": "Green", "AccountRiskDrivers": "Worst case score 39 (+16); 1 overdue request(s) (+4); 1 Yellow case(s) (+3)", "AccountRiskTrend": "Stable", "OpenCases": 4, "RedCases": 0, "StalledCases": 0, "OpenComplaints": 0, "ActiveEscalations": 0, "PatternAlert": "", "LastScored": "2026-09-30T04:30:00.000Z"}, {"Title": "Adatum Automotive", "AccountId": "TP-100106", "Aliases": "adatum.com; Adatum Automotive", "Segment": "Major", "Industry": "Automotive", "StrategicTier": "Tier 2", "ContractType": "Unified Enterprise", "ContractEnd": "2027-01-31", "CSMConcern": "None", "CSMConcernNote": "", "MIRPStatus": "Not Started", "CustomerExecSponsor": "IT Director", "LastTouchpoint": "2026-09-01", "NextTouchpoint": "2026-10-07", "AccountRiskScore": 31, "AccountRAG": "Yellow", "AccountRiskDrivers": "Worst case score 56 (+22); 2 Yellow case(s) (+6); MIRP not started (+3)", "AccountRiskTrend": "Stable", "OpenCases": 3, "RedCases": 0, "StalledCases": 1, "OpenComplaints": 0, "ActiveEscalations": 0, "PatternAlert": "", "LastScored": "2026-09-30T04:30:00.000Z"}, {"Title": "Litware Manufacturing", "AccountId": "TP-100107", "Aliases": "litware.com; Litware Manufacturing", "Segment": "Corporate", "Industry": "Manufacturing", "StrategicTier": "Tier 2", "ContractType": "Unified Core", "ContractEnd": "2027-05-31", "CSMConcern": "None", "CSMConcernNote": "", "MIRPStatus": "Approved", "CustomerExecSponsor": "IT Manager", "LastTouchpoint": "2026-08-28", "NextTouchpoint": "2026-10-20", "AccountRiskScore": 13, "AccountRAG": "Green", "AccountRiskDrivers": "Worst case score 24 (+10); 1 Yellow case(s) (+3)", "AccountRiskTrend": "Stable", "OpenCases": 2, "RedCases": 0, "StalledCases": 1, "OpenComplaints": 0, "ActiveEscalations": 0, "PatternAlert": "", "LastScored": "2026-09-30T04:30:00.000Z"}, {"Title": "Proseware Retail", "AccountId": "TP-100108", "Aliases": "proseware.com; Proseware Retail", "Segment": "Corporate", "Industry": "Retail", "StrategicTier": "Tier 3", "ContractType": "Unified Core", "ContractEnd": "2027-02-28", "CSMConcern": "Watch", "CSMConcernNote": "Store operations sensitive to POS incidents.", "MIRPStatus": "Approved", "CustomerExecSponsor": "Head of IT", "LastTouchpoint": "2026-09-19", "NextTouchpoint": "2026-10-10", "AccountRiskScore": 49, "AccountRAG": "Yellow", "AccountRiskDrivers": "Worst case score 71 (+28); 1 Red case(s) (+10); 1 open complaint(s) (+6); CSM concern: Watch (+5)", "AccountRiskTrend": "Stable", "OpenCases": 3, "RedCases": 1, "StalledCases": 1, "OpenComplaints": 1, "ActiveEscalations": 0, "PatternAlert": "", "LastScored": "2026-09-30T04:30:00.000Z"}, {"Title": "Relecloud Telecom", "AccountId": "TP-100109", "Aliases": "relecloud.com; Relecloud Telecom", "Segment": "Major", "Industry": "Telecommunications", "StrategicTier": "Tier 2", "ContractType": "Unified Enterprise", "ContractEnd": "2027-08-31", "CSMConcern": "None", "CSMConcernNote": "", "MIRPStatus": "Approved", "CustomerExecSponsor": "CTO", "LastTouchpoint": "2026-09-17", "NextTouchpoint": "2026-10-15", "AccountRiskScore": 21, "AccountRAG": "Green", "AccountRiskDrivers": "Worst case score 46 (+18); 1 Yellow case(s) (+3)", "AccountRiskTrend": "Stable", "OpenCases": 3, "RedCases": 0, "StalledCases": 0, "OpenComplaints": 0, "ActiveEscalations": 0, "PatternAlert": "", "LastScored": "2026-09-30T04:30:00.000Z"}, {"Title": "Humongous Insurance", "AccountId": "TP-100110", "Aliases": "humongousinsurance.com; Humongous Insurance", "Segment": "Major", "Industry": "Financial Services", "StrategicTier": "Tier 1", "ContractType": "Unified Enterprise", "ContractEnd": "2026-12-20", "CSMConcern": "Critical", "CSMConcernNote": "CIO escalated dissatisfaction with Exchange migration support; renewal at risk.", "MIRPStatus": "Pending", "CustomerExecSponsor": "CIO", "LastTouchpoint": "2026-09-28", "NextTouchpoint": "2026-10-01", "AccountRiskScore": 95, "AccountRAG": "Red", "AccountRiskDrivers": "Worst case score 70 (+28); CSM concern: Critical (+25); 1 Red case(s) (+10); 1 active escalation(s) (+10); 1 open complaint(s) (+6); Contract ends in 81 days with open risk (+5); Pattern: 3 open Exchange Online cases in 14 days (+5); 1 Yellow case(s) (+3); MIRP pending (+3) | Override: Red case with executive visibility, CSM concern Critical", "AccountRiskTrend": "Stable", "OpenCases": 4, "RedCases": 1, "StalledCases": 1, "OpenComplaints": 1, "ActiveEscalations": 1, "PatternAlert": "3 open Exchange Online cases in 14 days", "LastScored": "2026-09-30T04:30:00.000Z"}, {"Title": "Wide World Importers", "AccountId": "TP-100111", "Aliases": "wideworldimporters.com; Wide World Importers", "Segment": "Corporate", "Industry": "Retail", "StrategicTier": "Tier 3", "ContractType": "Unified Core", "ContractEnd": "2027-04-30", "CSMConcern": "None", "CSMConcernNote": "", "MIRPStatus": "Approved", "CustomerExecSponsor": "IT Manager", "LastTouchpoint": "2026-09-05", "NextTouchpoint": "2026-10-21", "AccountRiskScore": 25, "AccountRAG": "Yellow", "AccountRiskDrivers": "Worst case score 40 (+16); 1 open complaint(s) (+6); 1 Yellow case(s) (+3)", "AccountRiskTrend": "Stable", "OpenCases": 2, "RedCases": 0, "StalledCases": 1, "OpenComplaints": 1, "ActiveEscalations": 0, "PatternAlert": "", "LastScored": "2026-09-30T04:30:00.000Z"}, {"Title": "Lamna Healthcare", "AccountId": "TP-100112", "Aliases": "lamnahealthcare.com; Lamna Healthcare", "Segment": "Major", "Industry": "Healthcare", "StrategicTier": "Tier 2", "ContractType": "Unified Enterprise", "ContractEnd": "2027-07-31", "CSMConcern": "None", "CSMConcernNote": "", "MIRPStatus": "Approved", "CustomerExecSponsor": "CIO", "LastTouchpoint": "2026-09-23", "NextTouchpoint": "2026-10-13", "AccountRiskScore": 30, "AccountRAG": "Yellow", "AccountRiskDrivers": "Worst case score 50 (+20); 1 Red case(s) (+10)", "AccountRiskTrend": "Worsening", "OpenCases": 3, "RedCases": 1, "StalledCases": 1, "OpenComplaints": 0, "ActiveEscalations": 0, "PatternAlert": "", "LastScored": "2026-09-30T04:30:00.000Z"}], "CSCTCases": [{"CaseId": "2609280050001101", "Title": "Teams meetings drop for 2,000 HQ users during large calls", "Severity": "Sev A", "SupportAreaPath": "Microsoft Teams/Meetings/Call quality", "ProductFamily": "Microsoft Teams", "ServiceName": "Unified Support | Enterprise", "Status": "In Progress", "Engineer": "Priya Raman", "OwnershipChanges": 2, "ReopenCount": 0, "CreatedOn": "2026-09-28T10:05:00+03:00", "FirstResponseOn": "2026-09-28T10:40:00+03:00", "LastMicrosoftUpdate": "2026-09-28T16:00:00+03:00", "LastCustomerUpdate": "2026-09-29T09:30:00+03:00", "LastActivity": "2026-09-29T09:30:00+03:00", "CustomerChasers": 2, "SeverityChangedOn": null, "SeverityChangeDir": null, "CritSitActive": false, "CritSitEndedOn": null, "CustomerSentiment": "Frustrated", "BusinessImpact": "High", "ExecVisibility": true, "NextAction": "Engineer to share network trace analysis", "NextActionOwner": "Engineer", "NextActionDue": "2026-09-29", "ResolutionETA": null, "EscalationStatus": "Candidate", "_account": "Contoso Holding", "CustomerNameRaw": "Contoso Holding", "IsOpen": true, "BallInCourt": "Microsoft", "RiskScore": 83, "RiskLevel": "Red", "PtsSeverity": 22, "PtsMomentum": 18, "PtsAge": 0, "PtsSLA": 8, "PtsVoice": 20, "PtsExposure": 15, "RiskDrivers": "Sev A base (+22); No Microsoft update for 1 business day(s) (threshold 1) (+18); Next action overdue (+8); Customer sentiment: Frustrated (+8); Open complaint (+8); Customer executive visibility (+8); 2 customer follow-ups without Microsoft reply (+6); Business impact: High (+4); Account concern: Concern (+3); Contract ends in 76 days (+3) | Override: R2 Sev A with no Microsoft update beyond threshold", "RiskScorePrev": 45, "RiskTrend": "Worsening", "RedSince": "2026-09-30T04:30:00.000Z", "DaysOpen": 2, "BizDaysIdle": 1, "IsStalled": true, "StallType": "Microsoft-side", "SLAStatus": "Met", "EscalationTriggers": "E2; E6; E10; E11", "SuggestedLevel": "L2 - Support escalation (duty manager / 24x7 Case Management) + L4 executive alignment", "PlaybookId": "PB-02", "RecommendedAction": "Sev A without update: engage the duty manager now and request an engineer update within 2 hours.", "ComplaintOpen": true, "RequestOpen": false, "LastScored": "2026-09-30T04:30:00.000Z", "Source": "Import"}, {"CaseId": "2609170050001102", "Title": "Mail delivery delays to external domains after connector change", "Severity": "Sev B", "SupportAreaPath": "Exchange Online/Mail Flow/Delivery delays", "ProductFamily": "Exchange Online", "ServiceName": "Unified Support | Enterprise", "Status": "In Progress", "Engineer": "Mateo Alvarez", "OwnershipChanges": 1, "ReopenCount": 0, "CreatedOn": "2026-09-17T11:20:00+03:00", "FirstResponseOn": "2026-09-17T12:30:00+03:00", "LastMicrosoftUpdate": "2026-09-23T15:10:00+03:00", "LastCustomerUpdate": "2026-09-28T09:15:00+03:00", "LastActivity": "2026-09-28T09:15:00+03:00", "CustomerChasers": 2, "SeverityChangedOn": null, "SeverityChangeDir": null, "CritSitActive": false, "CritSitEndedOn": null, "CustomerSentiment": "Frustrated", "BusinessImpact": "Medium", "ExecVisibility": false, "NextAction": "Engineer to confirm connector fix plan", "NextActionOwner": "Engineer", "NextActionDue": "2026-10-01", "ResolutionETA": null, "EscalationStatus": "Candidate", "_account": "Contoso Holding", "CustomerNameRaw": "Contoso Holding", "IsOpen": true, "BallInCourt": "Microsoft", "RiskScore": 61, "RiskLevel": "Red", "PtsSeverity": 12, "PtsMomentum": 18, "PtsAge": 5, "PtsSLA": 0, "PtsVoice": 20, "PtsExposure": 6, "RiskDrivers": "No Microsoft update for 4 business day(s) (threshold 3) (+18); Sev B base (+12); Customer sentiment: Frustrated (+8); Open complaint (+8); 2 customer follow-ups without Microsoft reply (+6); Open 13 day(s) vs 14-day target (+5); Account concern: Concern (+3); Contract ends in 76 days (+3)", "RiskScorePrev": 55, "RiskTrend": "Stable", "RedSince": "2026-09-30T04:30:00.000Z", "DaysOpen": 13, "BizDaysIdle": 4, "IsStalled": true, "StallType": "Microsoft-side", "SLAStatus": "Met", "EscalationTriggers": "E10; E11", "SuggestedLevel": "L1 - Engineer's manager / Technical Advisor", "PlaybookId": "PB-07", "RecommendedAction": "Complaint open: acknowledge within 1 business day and agree a recovery plan with the engineer's manager.", "ComplaintOpen": true, "RequestOpen": false, "LastScored": "2026-09-30T04:30:00.000Z", "Source": "Import"}, {"CaseId": "2609250050001103", "Title": "Site permission inheritance broken after tenant-to-tenant migration", "Severity": "Sev C", "SupportAreaPath": "SharePoint Online/Sites/Permissions", "ProductFamily": "SharePoint Online", "ServiceName": "Unified Support | Enterprise", "Status": "Waiting on Customer", "Engineer": "Chen Wei", "OwnershipChanges": 1, "ReopenCount": 0, "CreatedOn": "2026-09-25T14:00:00+03:00", "FirstResponseOn": "2026-09-25T15:30:00+03:00", "LastMicrosoftUpdate": "2026-09-29T11:00:00+03:00", "LastCustomerUpdate": "2026-09-28T10:00:00+03:00", "LastActivity": "2026-09-29T11:00:00+03:00", "CustomerChasers": 0, "SeverityChangedOn": null, "SeverityChangeDir": null, "CritSitActive": false, "CritSitEndedOn": null, "CustomerSentiment": "Neutral", "BusinessImpact": "Medium", "ExecVisibility": false, "NextAction": "Customer to share affected site list", "NextActionOwner": "Customer", "NextActionDue": "2026-10-02", "ResolutionETA": null, "EscalationStatus": "None", "_account": "Contoso Holding", "CustomerNameRaw": "Contoso Holding", "IsOpen": true, "BallInCourt": "Customer", "RiskScore": 9, "RiskLevel": "Green", "PtsSeverity": 3, "PtsMomentum": 0, "PtsAge": 0, "PtsSLA": 0, "PtsVoice": 0, "PtsExposure": 6, "RiskDrivers": "Sev C base (+3); Account concern: Concern (+3); Contract ends in 76 days (+3)", "RiskScorePrev": 9, "RiskTrend": "Stable", "RedSince": null, "DaysOpen": 5, "BizDaysIdle": 0, "IsStalled": false, "StallType": "None", "SLAStatus": "Met", "EscalationTriggers": "", "SuggestedLevel": "", "PlaybookId": "PB-00", "RecommendedAction": "Standard monitoring - no action needed today.", "ComplaintOpen": false, "RequestOpen": false, "LastScored": "2026-09-30T04:30:00.000Z", "Source": "Import"}, {"CaseId": "2609160050001104", "Title": "Azure Policy remediation tasks failing at scale", "Severity": "Sev C", "SupportAreaPath": "Azure/Governance/Azure Policy", "ProductFamily": "Azure", "ServiceName": "Unified Support | Enterprise", "Status": "In Progress", "Engineer": "Lukas Novak", "OwnershipChanges": 1, "ReopenCount": 0, "CreatedOn": "2026-09-16T09:40:00+03:00", "FirstResponseOn": "2026-09-17T10:00:00+03:00", "LastMicrosoftUpdate": null, "LastCustomerUpdate": null, "LastActivity": "2026-09-17T10:00:00+03:00", "CustomerChasers": 0, "SeverityChangedOn": null, "SeverityChangeDir": null, "CritSitActive": false, "CritSitEndedOn": null, "CustomerSentiment": "Neutral", "BusinessImpact": "Medium", "ExecVisibility": false, "NextAction": null, "NextActionOwner": null, "NextActionDue": null, "ResolutionETA": null, "EscalationStatus": "None", "_account": "Contoso Holding", "CustomerNameRaw": "Contoso Holding", "IsOpen": true, "BallInCourt": "Unknown", "RiskScore": 37, "RiskLevel": "Yellow", "PtsSeverity": 3, "PtsMomentum": 23, "PtsAge": 0, "PtsSLA": 5, "PtsVoice": 0, "PtsExposure": 6, "RiskDrivers": "No Microsoft update for 8 business day(s) (threshold 5) (+18); No case correspondence visible to CSM (blind spot) (+5); First response was late (+5); Sev C base (+3); Account concern: Concern (+3); Contract ends in 76 days (+3)", "RiskScorePrev": 30, "RiskTrend": "Stable", "RedSince": null, "DaysOpen": 14, "BizDaysIdle": 8, "IsStalled": true, "StallType": "Microsoft-side", "SLAStatus": "Late response", "EscalationTriggers": "", "SuggestedLevel": "", "PlaybookId": "PB-13", "RecommendedAction": "Blind spot: check the case in the support portal and ask the engineer to CC you on updates.", "ComplaintOpen": false, "RequestOpen": false, "LastScored": "2026-09-30T04:30:00.000Z", "Source": "Import"}, {"CaseId": "2609300050001201", "Title": "Core banking VM cluster unreachable after host maintenance", "Severity": "Sev 1", "SupportAreaPath": "Azure/Virtual Machines/Availability", "ProductFamily": "Azure", "ServiceName": "Unified Support | Enterprise", "Status": "In Progress", "Engineer": "Samuel Okoro", "OwnershipChanges": 1, "ReopenCount": 0, "CreatedOn": "2026-09-30T02:10:00+03:00", "FirstResponseOn": "2026-09-30T02:34:00+03:00", "LastMicrosoftUpdate": "2026-09-30T06:30:00+03:00", "LastCustomerUpdate": "2026-09-30T06:10:00+03:00", "LastActivity": "2026-09-30T06:30:00+03:00", "CustomerChasers": 0, "SeverityChangedOn": null, "SeverityChangeDir": null, "CritSitActive": true, "CritSitEndedOn": null, "CustomerSentiment": "Frustrated", "BusinessImpact": "Critical", "ExecVisibility": true, "NextAction": "Bridge call every 2h; next update 08:30", "NextActionOwner": "Engineer", "NextActionDue": "2026-09-30", "ResolutionETA": null, "EscalationStatus": "Active", "_account": "Woodgrove Bank", "CustomerNameRaw": "Woodgrove Bank", "IsOpen": true, "BallInCourt": "Microsoft", "RiskScore": 58, "RiskLevel": "Red", "PtsSeverity": 35, "PtsMomentum": 0, "PtsAge": 0, "PtsSLA": 0, "PtsVoice": 8, "PtsExposure": 15, "RiskDrivers": "Sev 1 base (+35); Customer sentiment: Frustrated (+8); Customer executive visibility (+8); Business impact: Critical (+8) | Override: R1 Sev 1 / Critical Situation active", "RiskScorePrev": null, "RiskTrend": "New", "RedSince": "2026-09-30T04:30:00.000Z", "DaysOpen": 0, "BizDaysIdle": 0, "IsStalled": false, "StallType": "None", "SLAStatus": "Met", "EscalationTriggers": "E1; E6", "SuggestedLevel": "L3 - Critical Situation Management + L4 executive alignment", "PlaybookId": "PB-01", "RecommendedAction": "Critical situation: align with the CritSit manager, keep customer executives updated every 4 hours.", "ComplaintOpen": false, "RequestOpen": true, "LastScored": "2026-09-30T04:30:00.000Z", "Source": "Import"}, {"CaseId": "2609220050001202", "Title": "Conditional Access blocks branch devices intermittently", "Severity": "Sev B", "SupportAreaPath": "Microsoft Entra ID/Conditional Access/Sign-in failures", "ProductFamily": "Microsoft Entra ID", "ServiceName": "Unified Support | Enterprise", "Status": "In Progress", "Engineer": "Ana Costa", "OwnershipChanges": 2, "ReopenCount": 0, "CreatedOn": "2026-09-22T10:00:00+03:00", "FirstResponseOn": "2026-09-22T11:05:00+03:00", "LastMicrosoftUpdate": "2026-09-25T16:00:00+03:00", "LastCustomerUpdate": "2026-09-28T14:00:00+03:00", "LastActivity": "2026-09-28T14:00:00+03:00", "CustomerChasers": 1, "SeverityChangedOn": null, "SeverityChangeDir": null, "CritSitActive": false, "CritSitEndedOn": null, "CustomerSentiment": "Neutral", "BusinessImpact": "Medium", "ExecVisibility": false, "NextAction": "Engineer reviewing sign-in logs", "NextActionOwner": "Engineer", "NextActionDue": "2026-10-01", "ResolutionETA": null, "EscalationStatus": "None", "_account": "Woodgrove Bank", "CustomerNameRaw": "Woodgrove Bank", "IsOpen": true, "BallInCourt": "Microsoft", "RiskScore": 25, "RiskLevel": "Green", "PtsSeverity": 12, "PtsMomentum": 8, "PtsAge": 5, "PtsSLA": 0, "PtsVoice": 0, "PtsExposure": 0, "RiskDrivers": "Sev B base (+12); No Microsoft update for 2 business day(s) (threshold 3) (+8); Open 8 day(s) vs 14-day target (+5)", "RiskScorePrev": 20, "RiskTrend": "Stable", "RedSince": null, "DaysOpen": 8, "BizDaysIdle": 2, "IsStalled": false, "StallType": "None", "SLAStatus": "Met", "EscalationTriggers": "", "SuggestedLevel": "", "PlaybookId": "PB-00", "RecommendedAction": "Standard monitoring - no action needed today.", "ComplaintOpen": false, "RequestOpen": false, "LastScored": "2026-09-30T04:30:00.000Z", "Source": "Import"}, {"CaseId": "2609100050001203", "Title": "Defender for Endpoint onboarding fails on Windows Server 2016", "Severity": "Sev C", "SupportAreaPath": "Microsoft Defender for Endpoint/Onboarding/Windows Server", "ProductFamily": "Microsoft Defender for Endpoint", "ServiceName": "Unified Support | Enterprise", "Status": "Waiting on Customer", "Engineer": "Fatima Zahra", "OwnershipChanges": 1, "ReopenCount": 0, "CreatedOn": "2026-09-10T13:00:00+03:00", "FirstResponseOn": "2026-09-10T14:10:00+03:00", "LastMicrosoftUpdate": "2026-09-14T15:00:00+03:00", "LastCustomerUpdate": "2026-09-11T10:00:00+03:00", "LastActivity": "2026-09-14T15:00:00+03:00", "CustomerChasers": 0, "SeverityChangedOn": null, "SeverityChangeDir": null, "CritSitActive": false, "CritSitEndedOn": null, "CustomerSentiment": "Neutral", "BusinessImpact": "Low", "ExecVisibility": false, "NextAction": "Customer to upload MDE client analyzer logs", "NextActionOwner": "Customer", "NextActionDue": "2026-09-21", "ResolutionETA": null, "EscalationStatus": "None", "_account": "Woodgrove Bank", "CustomerNameRaw": "Woodgrove Bank", "IsOpen": true, "BallInCourt": "Customer", "RiskScore": 26, "RiskLevel": "Yellow", "PtsSeverity": 3, "PtsMomentum": 10, "PtsAge": 5, "PtsSLA": 8, "PtsVoice": 0, "PtsExposure": 0, "RiskDrivers": "Awaiting customer for 11 business day(s) (threshold 5) (+10); Next action overdue (+8); Open 20 day(s) vs 30-day target (+5); Sev C base (+3) | Floor: Y3 Case is stalled", "RiskScorePrev": 26, "RiskTrend": "Stable", "RedSince": null, "DaysOpen": 20, "BizDaysIdle": 11, "IsStalled": true, "StallType": "Customer-side", "SLAStatus": "Met", "EscalationTriggers": "", "SuggestedLevel": "", "PlaybookId": "PB-06", "RecommendedAction": "Nudge the customer (template C1); second nudge after 3 business days, then propose closure.", "ComplaintOpen": false, "RequestOpen": false, "LastScored": "2026-09-30T04:30:00.000Z", "Source": "Import"}, {"CaseId": "2609280050001204", "Title": "Power BI gateway refresh failures for risk reports", "Severity": "Sev B", "SupportAreaPath": "Power BI/Service/Gateway", "ProductFamily": "Power BI", "ServiceName": "Unified Support | Enterprise", "Status": "Waiting on Customer", "Engineer": "Kenji Sato", "OwnershipChanges": 1, "ReopenCount": 0, "CreatedOn": "2026-09-28T09:30:00+03:00", "FirstResponseOn": "2026-09-28T10:15:00+03:00", "LastMicrosoftUpdate": "2026-09-29T17:00:00+03:00", "LastCustomerUpdate": "2026-09-29T10:00:00+03:00", "LastActivity": "2026-09-29T17:00:00+03:00", "CustomerChasers": 0, "SeverityChangedOn": null, "SeverityChangeDir": null, "CritSitActive": false, "CritSitEndedOn": null, "CustomerSentiment": "Neutral", "BusinessImpact": "Medium", "ExecVisibility": false, "NextAction": "Customer to test gateway update", "NextActionOwner": "Customer", "NextActionDue": "2026-10-02", "ResolutionETA": null, "EscalationStatus": "None", "_account": "Woodgrove Bank", "CustomerNameRaw": "Woodgrove Bank", "IsOpen": true, "BallInCourt": "Customer", "RiskScore": 12, "RiskLevel": "Green", "PtsSeverity": 12, "PtsMomentum": 0, "PtsAge": 0, "PtsSLA": 0, "PtsVoice": 0, "PtsExposure": 0, "RiskDrivers": "Sev B base (+12)", "RiskScorePrev": 12, "RiskTrend": "Stable", "RedSince": null, "DaysOpen": 2, "BizDaysIdle": 0, "IsStalled": false, "StallType": "None", "SLAStatus": "Met", "EscalationTriggers": "", "SuggestedLevel": "", "PlaybookId": "PB-00", "RecommendedAction": "Standard monitoring - no action needed today.", "ComplaintOpen": false, "RequestOpen": false, "LastScored": "2026-09-30T04:30:00.000Z", "Source": "Import"}, {"CaseId": "2609250050001205", "Title": "Key Vault throttling during nightly batch jobs", "Severity": "Sev B", "SupportAreaPath": "Azure/Key Vault/Throttling", "ProductFamily": "Azure", "ServiceName": "Unified Support | Enterprise", "Status": "In Progress", "Engineer": "Elena Petrova", "OwnershipChanges": 1, "ReopenCount": 0, "CreatedOn": "2026-09-25T10:00:00+03:00", "FirstResponseOn": "2026-09-25T10:50:00+03:00", "LastMicrosoftUpdate": "2026-09-29T15:00:00+03:00", "LastCustomerUpdate": "2026-09-29T09:00:00+03:00", "LastActivity": "2026-09-29T15:00:00+03:00", "CustomerChasers": 0, "SeverityChangedOn": null, "SeverityChangeDir": null, "CritSitActive": false, "CritSitEndedOn": null, "CustomerSentiment": "Neutral", "BusinessImpact": "Medium", "ExecVisibility": false, "NextAction": "Customer to apply retry policy", "NextActionOwner": "Customer", "NextActionDue": "2026-10-02", "ResolutionETA": null, "EscalationStatus": "None", "_account": "Woodgrove Bank", "CustomerNameRaw": "Woodgrove Bank", "IsOpen": true, "BallInCourt": "Customer", "RiskScore": 12, "RiskLevel": "Green", "PtsSeverity": 12, "PtsMomentum": 0, "PtsAge": 0, "PtsSLA": 0, "PtsVoice": 0, "PtsExposure": 0, "RiskDrivers": "Sev B base (+12)", "RiskScorePrev": 12, "RiskTrend": "Stable", "RedSince": null, "DaysOpen": 5, "BizDaysIdle": 0, "IsStalled": false, "StallType": "None", "SLAStatus": "Met", "EscalationTriggers": "", "SuggestedLevel": "", "PlaybookId": "PB-00", "RecommendedAction": "Standard monitoring - no action needed today.", "ComplaintOpen": false, "RequestOpen": false, "LastScored": "2026-09-30T04:30:00.000Z", "Source": "Import"}, {"CaseId": "2609030050001301", "Title": "SCADA reporting queries time out on SQL Server 2022", "Severity": "Sev B", "SupportAreaPath": "SQL Server/Performance/Query tuning", "ProductFamily": "SQL Server", "ServiceName": "Unified Support | Enterprise", "Status": "Waiting on Product Group", "Engineer": "Daniel Kim", "OwnershipChanges": 2, "ReopenCount": 0, "CreatedOn": "2026-09-03T09:15:00+03:00", "FirstResponseOn": "2026-09-03T10:00:00+03:00", "LastMicrosoftUpdate": "2026-09-18T16:00:00+03:00", "LastCustomerUpdate": "2026-09-24T11:00:00+03:00", "LastActivity": "2026-09-24T11:00:00+03:00", "CustomerChasers": 2, "SeverityChangedOn": null, "SeverityChangeDir": null, "CritSitActive": false, "CritSitEndedOn": null, "CustomerSentiment": "Frustrated", "BusinessImpact": "High", "ExecVisibility": false, "NextAction": "PG to confirm hotfix feasibility", "NextActionOwner": "Product Group", "NextActionDue": "2026-09-25", "ResolutionETA": "2026-09-25", "EscalationStatus": "Pending Manager Approval", "_account": "Fabrikam Energy", "CustomerNameRaw": "Fabrikam Energy", "IsOpen": true, "BallInCourt": "Product Group", "RiskScore": 89, "RiskLevel": "Red", "PtsSeverity": 12, "PtsMomentum": 25, "PtsAge": 15, "PtsSLA": 15, "PtsVoice": 18, "PtsExposure": 4, "RiskDrivers": "No Microsoft update for 7 business day(s) (threshold 3) (+25); Open 27 day(s) vs 14-day target (+15); Sev B base (+12); Next action overdue (+8); Resolution ETA missed (+8); Customer sentiment: Frustrated (+8); 2 customer follow-ups without Microsoft reply (+6); Additional request overdue (+4); Business impact: High (+4)", "RiskScorePrev": 74, "RiskTrend": "Worsening", "RedSince": "2026-09-25T07:30:00+03:00", "DaysOpen": 27, "BizDaysIdle": 7, "IsStalled": true, "StallType": "Blocked (Product Group)", "SLAStatus": "Met", "EscalationTriggers": "E4; E11", "SuggestedLevel": "L1 - Engineer's manager / Technical Advisor", "PlaybookId": "PB-05", "RecommendedAction": "Blocked on Product Group: ask for PG ETA and an interim workaround; if none in 1 business day go to L1.", "ComplaintOpen": false, "RequestOpen": true, "LastScored": "2026-09-30T04:30:00.000Z", "Source": "Import"}, {"CaseId": "2609240050001302", "Title": "ExpressRoute circuit flapping on Istanbul peering", "Severity": "Sev A", "SupportAreaPath": "Azure/Networking/ExpressRoute", "ProductFamily": "Azure", "ServiceName": "Unified Support | Enterprise", "Status": "In Progress", "Engineer": "Olivia Brooks", "OwnershipChanges": 1, "ReopenCount": 0, "CreatedOn": "2026-09-24T08:30:00+03:00", "FirstResponseOn": "2026-09-24T09:05:00+03:00", "LastMicrosoftUpdate": "2026-09-29T18:00:00+03:00", "LastCustomerUpdate": "2026-09-29T10:00:00+03:00", "LastActivity": "2026-09-29T18:00:00+03:00", "CustomerChasers": 0, "SeverityChangedOn": "2026-09-25T11:00:00+03:00", "SeverityChangeDir": "Raised", "CritSitActive": false, "CritSitEndedOn": null, "CustomerSentiment": "Neutral", "BusinessImpact": "High", "ExecVisibility": false, "NextAction": "Replace edge line card in maintenance window", "NextActionOwner": "Engineer", "NextActionDue": "2026-10-01", "ResolutionETA": "2026-10-02", "EscalationStatus": "None", "_account": "Fabrikam Energy", "CustomerNameRaw": "Fabrikam Energy", "IsOpen": true, "BallInCourt": "Customer", "RiskScore": 36, "RiskLevel": "Yellow", "PtsSeverity": 22, "PtsMomentum": 0, "PtsAge": 5, "PtsSLA": 0, "PtsVoice": 0, "PtsExposure": 9, "RiskDrivers": "Sev A base (+22); Open 6 day(s) vs 7-day target (+5); Severity raised in last 7 days (+5); Business impact: High (+4)", "RiskScorePrev": 33, "RiskTrend": "Stable", "RedSince": null, "DaysOpen": 6, "BizDaysIdle": 0, "IsStalled": false, "StallType": "None", "SLAStatus": "Met", "EscalationTriggers": "", "SuggestedLevel": "", "PlaybookId": "PB-00", "RecommendedAction": "Watch: confirm next action, owner and ETA with the engineer.", "ComplaintOpen": false, "RequestOpen": false, "LastScored": "2026-09-30T04:30:00.000Z", "Source": "Import"}, {"CaseId": "2609290050001303", "Title": "Outlook add-in crashes after Microsoft 365 Apps update", "Severity": "Sev C", "SupportAreaPath": "Microsoft 365 Apps/Outlook/Add-ins", "ProductFamily": "Microsoft 365 Apps", "ServiceName": "Unified Support | Enterprise", "Status": "New", "Engineer": "(unassigned)", "OwnershipChanges": 0, "ReopenCount": 0, "CreatedOn": "2026-09-29T11:00:00+03:00", "FirstResponseOn": null, "LastMicrosoftUpdate": null, "LastCustomerUpdate": null, "LastActivity": "2026-09-29T11:00:00+03:00", "CustomerChasers": 0, "SeverityChangedOn": null, "SeverityChangeDir": null, "CritSitActive": false, "CritSitEndedOn": null, "CustomerSentiment": "Neutral", "BusinessImpact": "Medium", "ExecVisibility": false, "NextAction": null, "NextActionOwner": null, "NextActionDue": null, "ResolutionETA": null, "EscalationStatus": "None", "_account": "Fabrikam Energy", "CustomerNameRaw": "Fabrikam Energy", "IsOpen": true, "BallInCourt": "Unknown", "RiskScore": 18, "RiskLevel": "Yellow", "PtsSeverity": 3, "PtsMomentum": 0, "PtsAge": 0, "PtsSLA": 15, "PtsVoice": 0, "PtsExposure": 0, "RiskDrivers": "No first response after 7h (SLA 4h) (+15); Sev C base (+3) | Floor: Y6 First-response SLA breached", "RiskScorePrev": null, "RiskTrend": "New", "RedSince": null, "DaysOpen": 1, "BizDaysIdle": 0, "IsStalled": false, "StallType": "None", "SLAStatus": "Breached", "EscalationTriggers": "", "SuggestedLevel": "", "PlaybookId": "PB-03", "RecommendedAction": "First response overdue: contact the duty manager / 24x7 Case Management and inform the customer.", "ComplaintOpen": false, "RequestOpen": false, "LastScored": "2026-09-30T04:30:00.000Z", "Source": "Import"}, {"CaseId": "2609290050001304", "Title": "Azure Monitor alerts delayed for turbine telemetry", "Severity": "Sev B", "SupportAreaPath": "Azure/Azure Monitor/Alerts", "ProductFamily": "Azure", "ServiceName": "Unified Support | Enterprise", "Status": "In Progress", "Engineer": "Chen Wei", "OwnershipChanges": 1, "ReopenCount": 0, "CreatedOn": "2026-09-29T13:00:00+03:00", "FirstResponseOn": "2026-09-29T14:20:00+03:00", "LastMicrosoftUpdate": "2026-09-29T16:00:00+03:00", "LastCustomerUpdate": null, "LastActivity": "2026-09-29T16:00:00+03:00", "CustomerChasers": 0, "SeverityChangedOn": null, "SeverityChangeDir": null, "CritSitActive": false, "CritSitEndedOn": null, "CustomerSentiment": "Neutral", "BusinessImpact": "Medium", "ExecVisibility": false, "NextAction": "Engineer collecting alert pipeline traces", "NextActionOwner": "Engineer", "NextActionDue": "2026-10-01", "ResolutionETA": null, "EscalationStatus": "None", "_account": "Fabrikam Energy", "CustomerNameRaw": "Fabrikam Energy", "IsOpen": true, "BallInCourt": "Customer", "RiskScore": 12, "RiskLevel": "Green", "PtsSeverity": 12, "PtsMomentum": 0, "PtsAge": 0, "PtsSLA": 0, "PtsVoice": 0, "PtsExposure": 0, "RiskDrivers": "Sev B base (+12)", "RiskScorePrev": null, "RiskTrend": "New", "RedSince": null, "DaysOpen": 1, "BizDaysIdle": 0, "IsStalled": false, "StallType": "None", "SLAStatus": "Met", "EscalationTriggers": "", "SuggestedLevel": "", "PlaybookId": "PB-00", "RecommendedAction": "Standard monitoring - no action needed today.", "ComplaintOpen": false, "RequestOpen": false, "LastScored": "2026-09-30T04:30:00.000Z", "Source": "Import"}, {"CaseId": "2609150050001401", "Title": "Warehouse handhelds fail Android Enterprise enrollment", "Severity": "Sev B", "SupportAreaPath": "Microsoft Intune/Enrollment/Android Enterprise", "ProductFamily": "Microsoft Intune", "ServiceName": "Unified Support | Enterprise", "Status": "In Progress", "Engineer": "Priya Raman", "OwnershipChanges": 3, "ReopenCount": 0, "CreatedOn": "2026-09-15T10:00:00+03:00", "FirstResponseOn": "2026-09-15T10:20:00+03:00", "LastMicrosoftUpdate": "2026-09-29T15:25:00+03:00", "LastCustomerUpdate": "2026-09-28T09:10:00+03:00", "LastActivity": "2026-09-29T15:25:00+03:00", "CustomerChasers": 0, "SeverityChangedOn": "2026-09-23T10:00:00+03:00", "SeverityChangeDir": "Lowered", "CritSitActive": false, "CritSitEndedOn": "2026-09-23T10:00:00+03:00", "CustomerSentiment": "Neutral", "BusinessImpact": "Medium", "ExecVisibility": false, "NextAction": "Engineer to share lab test results", "NextActionOwner": "Engineer", "NextActionDue": "2026-10-02", "ResolutionETA": null, "EscalationStatus": "Candidate", "_account": "Northwind Logistics", "CustomerNameRaw": "Northwind Logistics", "IsOpen": true, "BallInCourt": "Microsoft", "RiskScore": 35, "RiskLevel": "Yellow", "PtsSeverity": 12, "PtsMomentum": 0, "PtsAge": 15, "PtsSLA": 0, "PtsVoice": 0, "PtsExposure": 8, "RiskDrivers": "Open 15 day(s) vs 14-day target (+15); Sev B base (+12); 3 ownership changes (+5); Contract ends in 61 days (+3)", "RiskScorePrev": 34, "RiskTrend": "Stable", "RedSince": null, "DaysOpen": 15, "BizDaysIdle": 0, "IsStalled": false, "StallType": "None", "SLAStatus": "Met", "EscalationTriggers": "E8", "SuggestedLevel": "L1 - Engineer's manager / Technical Advisor", "PlaybookId": "PB-08", "RecommendedAction": "Additional request open: route it, set owner and due date, confirm to the customer.", "ComplaintOpen": false, "RequestOpen": true, "LastScored": "2026-09-30T04:30:00.000Z", "Source": "Import"}, {"CaseId": "2609210050001402", "Title": "Route-optimization app: AKS cluster upgrade stuck", "Severity": "Sev B", "SupportAreaPath": "Azure/Azure Kubernetes Service/Cluster upgrade", "ProductFamily": "Azure", "ServiceName": "Unified Support | Enterprise", "Status": "In Progress", "Engineer": "Mateo Alvarez", "OwnershipChanges": 1, "ReopenCount": 0, "CreatedOn": "2026-09-21T09:00:00+03:00", "FirstResponseOn": "2026-09-21T09:45:00+03:00", "LastMicrosoftUpdate": "2026-09-24T12:00:00+03:00", "LastCustomerUpdate": "2026-09-25T10:30:00+03:00", "LastActivity": "2026-09-25T10:30:00+03:00", "CustomerChasers": 1, "SeverityChangedOn": null, "SeverityChangeDir": null, "CritSitActive": false, "CritSitEndedOn": null, "CustomerSentiment": "Neutral", "BusinessImpact": "Medium", "ExecVisibility": false, "NextAction": "Engineer to review upgrade logs", "NextActionOwner": "Engineer", "NextActionDue": "2026-09-30", "ResolutionETA": null, "EscalationStatus": "None", "_account": "Northwind Logistics", "CustomerNameRaw": "Northwind Logistics", "IsOpen": true, "BallInCourt": "Microsoft", "RiskScore": 38, "RiskLevel": "Yellow", "PtsSeverity": 12, "PtsMomentum": 18, "PtsAge": 5, "PtsSLA": 0, "PtsVoice": 0, "PtsExposure": 3, "RiskDrivers": "No Microsoft update for 3 business day(s) (threshold 3) (+18); Sev B base (+12); Open 9 day(s) vs 14-day target (+5); Contract ends in 61 days (+3)", "RiskScorePrev": 22, "RiskTrend": "Worsening", "RedSince": null, "DaysOpen": 9, "BizDaysIdle": 3, "IsStalled": true, "StallType": "Microsoft-side", "SLAStatus": "Met", "EscalationTriggers": "", "SuggestedLevel": "", "PlaybookId": "PB-05", "RecommendedAction": "Nudge the engineer (template N1); no reply within 1 business day -> engineer's manager (L1).", "ComplaintOpen": false, "RequestOpen": false, "LastScored": "2026-09-30T04:30:00.000Z", "Source": "Import"}, {"CaseId": "2609280050001403", "Title": "D365 Finance batch jobs stuck in Executing", "Severity": "Sev C", "SupportAreaPath": "Dynamics 365/Finance/Batch processing", "ProductFamily": "Dynamics 365", "ServiceName": "Unified Support | Enterprise", "Status": "Waiting on Customer", "Engineer": "Kenji Sato", "OwnershipChanges": 1, "ReopenCount": 0, "CreatedOn": "2026-09-28T15:00:00+03:00", "FirstResponseOn": "2026-09-28T16:30:00+03:00", "LastMicrosoftUpdate": "2026-09-29T12:00:00+03:00", "LastCustomerUpdate": "2026-09-29T09:00:00+03:00", "LastActivity": "2026-09-29T12:00:00+03:00", "CustomerChasers": 0, "SeverityChangedOn": null, "SeverityChangeDir": null, "CritSitActive": false, "CritSitEndedOn": null, "CustomerSentiment": "Neutral", "BusinessImpact": "Low", "ExecVisibility": false, "NextAction": "Customer to share batch server logs", "NextActionOwner": "Customer", "NextActionDue": "2026-10-05", "ResolutionETA": null, "EscalationStatus": "None", "_account": "Northwind Logistics", "CustomerNameRaw": "Northwind Logistics", "IsOpen": true, "BallInCourt": "Customer", "RiskScore": 6, "RiskLevel": "Green", "PtsSeverity": 3, "PtsMomentum": 0, "PtsAge": 0, "PtsSLA": 0, "PtsVoice": 0, "PtsExposure": 3, "RiskDrivers": "Sev C base (+3); Contract ends in 61 days (+3)", "RiskScorePrev": 6, "RiskTrend": "Stable", "RedSince": null, "DaysOpen": 2, "BizDaysIdle": 0, "IsStalled": false, "StallType": "None", "SLAStatus": "Met", "EscalationTriggers": "", "SuggestedLevel": "", "PlaybookId": "PB-00", "RecommendedAction": "Standard monitoring - no action needed today.", "ComplaintOpen": false, "RequestOpen": false, "LastScored": "2026-09-30T04:30:00.000Z", "Source": "Import"}, {"CaseId": "2609080050001501", "Title": "WSUS synchronization errors on disconnected network", "Severity": "Sev C", "SupportAreaPath": "Windows Server/WSUS/Synchronization", "ProductFamily": "Windows Server", "ServiceName": "Unified Support | Enterprise", "Status": "Waiting on Customer", "Engineer": "Lukas Novak", "OwnershipChanges": 1, "ReopenCount": 0, "CreatedOn": "2026-09-08T10:00:00+03:00", "FirstResponseOn": "2026-09-08T11:00:00+03:00", "LastMicrosoftUpdate": "2026-09-25T15:00:00+03:00", "LastCustomerUpdate": "2026-09-24T16:00:00+03:00", "LastActivity": "2026-09-25T15:00:00+03:00", "CustomerChasers": 0, "SeverityChangedOn": null, "SeverityChangeDir": null, "CritSitActive": false, "CritSitEndedOn": null, "CustomerSentiment": "Neutral", "BusinessImpact": "Low", "ExecVisibility": false, "NextAction": "Customer to run WSUS cleanup script", "NextActionOwner": "Customer", "NextActionDue": "2026-10-05", "ResolutionETA": null, "EscalationStatus": "None", "_account": "Tailspin Aerospace", "CustomerNameRaw": "Tailspin Aerospace", "IsOpen": true, "BallInCourt": "Customer", "RiskScore": 8, "RiskLevel": "Green", "PtsSeverity": 3, "PtsMomentum": 0, "PtsAge": 5, "PtsSLA": 0, "PtsVoice": 0, "PtsExposure": 0, "RiskDrivers": "Open 22 day(s) vs 30-day target (+5); Sev C base (+3)", "RiskScorePrev": 8, "RiskTrend": "Stable", "RedSince": null, "DaysOpen": 22, "BizDaysIdle": 2, "IsStalled": false, "StallType": "None", "SLAStatus": "Met", "EscalationTriggers": "", "SuggestedLevel": "", "PlaybookId": "PB-00", "RecommendedAction": "Standard monitoring - no action needed today.", "ComplaintOpen": false, "RequestOpen": false, "LastScored": "2026-09-30T04:30:00.000Z", "Source": "Import"}, {"CaseId": "2609230050001502", "Title": "Purview DLP policy tips not showing in Outlook", "Severity": "Sev B", "SupportAreaPath": "Microsoft Purview/Data Loss Prevention/Policy tips", "ProductFamily": "Microsoft Purview", "ServiceName": "Unified Support | Enterprise", "Status": "In Progress", "Engineer": "Fatima Zahra", "OwnershipChanges": 1, "ReopenCount": 0, "CreatedOn": "2026-09-23T14:00:00+03:00", "FirstResponseOn": "2026-09-23T15:00:00+03:00", "LastMicrosoftUpdate": "2026-09-28T11:00:00+03:00", "LastCustomerUpdate": "2026-09-28T16:00:00+03:00", "LastActivity": "2026-09-28T16:00:00+03:00", "CustomerChasers": 1, "SeverityChangedOn": null, "SeverityChangeDir": null, "CritSitActive": false, "CritSitEndedOn": null, "CustomerSentiment": "Neutral", "BusinessImpact": "Medium", "ExecVisibility": false, "NextAction": "Engineer to reproduce with test policy", "NextActionOwner": "Engineer", "NextActionDue": "2026-10-01", "ResolutionETA": null, "EscalationStatus": "None", "_account": "Tailspin Aerospace", "CustomerNameRaw": "Tailspin Aerospace", "IsOpen": true, "BallInCourt": "Microsoft", "RiskScore": 17, "RiskLevel": "Green", "PtsSeverity": 12, "PtsMomentum": 0, "PtsAge": 5, "PtsSLA": 0, "PtsVoice": 0, "PtsExposure": 0, "RiskDrivers": "Sev B base (+12); Open 7 day(s) vs 14-day target (+5)", "RiskScorePrev": 17, "RiskTrend": "Stable", "RedSince": null, "DaysOpen": 7, "BizDaysIdle": 1, "IsStalled": false, "StallType": "None", "SLAStatus": "Met", "EscalationTriggers": "", "SuggestedLevel": "", "PlaybookId": "PB-00", "RecommendedAction": "Standard monitoring - no action needed today.", "ComplaintOpen": false, "RequestOpen": false, "LastScored": "2026-09-30T04:30:00.000Z", "Source": "Import"}, {"CaseId": "2609160050001503", "Title": "AVD session hosts fail to register with host pool", "Severity": "Sev B", "SupportAreaPath": "Azure Virtual Desktop/Session hosts/Registration", "ProductFamily": "Azure Virtual Desktop", "ServiceName": "Unified Support | Enterprise", "Status": "In Progress", "Engineer": "Samuel Okoro", "OwnershipChanges": 1, "ReopenCount": 0, "CreatedOn": "2026-09-16T09:30:00+03:00", "FirstResponseOn": "2026-09-16T10:30:00+03:00", "LastMicrosoftUpdate": "2026-09-25T17:00:00+03:00", "LastCustomerUpdate": "2026-09-25T11:00:00+03:00", "LastActivity": "2026-09-25T17:00:00+03:00", "CustomerChasers": 0, "SeverityChangedOn": null, "SeverityChangeDir": null, "CritSitActive": false, "CritSitEndedOn": null, "CustomerSentiment": "Neutral", "BusinessImpact": "Medium", "ExecVisibility": false, "NextAction": "Engineer testing new agent build", "NextActionOwner": "Engineer", "NextActionDue": "2026-10-01", "ResolutionETA": null, "EscalationStatus": "None", "_account": "Tailspin Aerospace", "CustomerNameRaw": "Tailspin Aerospace", "IsOpen": true, "BallInCourt": "Microsoft", "RiskScore": 39, "RiskLevel": "Yellow", "PtsSeverity": 12, "PtsMomentum": 8, "PtsAge": 15, "PtsSLA": 0, "PtsVoice": 4, "PtsExposure": 0, "RiskDrivers": "Open 14 day(s) vs 14-day target (+15); Sev B base (+12); No Microsoft update for 2 business day(s) (threshold 3) (+8); Additional request overdue (+4)", "RiskScorePrev": 31, "RiskTrend": "Stable", "RedSince": null, "DaysOpen": 14, "BizDaysIdle": 2, "IsStalled": false, "StallType": "None", "SLAStatus": "Met", "EscalationTriggers": "", "SuggestedLevel": "", "PlaybookId": "PB-08", "RecommendedAction": "Additional request open: route it, set owner and due date, confirm to the customer.", "ComplaintOpen": false, "RequestOpen": true, "LastScored": "2026-09-30T04:30:00.000Z", "Source": "Import"}, {"CaseId": "2609250050001504", "Title": "PIM activation notification emails not received", "Severity": "Sev C", "SupportAreaPath": "Microsoft Entra ID/Privileged Identity Management/Notifications", "ProductFamily": "Microsoft Entra ID", "ServiceName": "Unified Support | Enterprise", "Status": "Waiting on Customer", "Engineer": "Ana Costa", "OwnershipChanges": 1, "ReopenCount": 0, "CreatedOn": "2026-09-25T10:00:00+03:00", "FirstResponseOn": "2026-09-25T11:30:00+03:00", "LastMicrosoftUpdate": "2026-09-29T10:00:00+03:00", "LastCustomerUpdate": "2026-09-28T15:00:00+03:00", "LastActivity": "2026-09-29T10:00:00+03:00", "CustomerChasers": 0, "SeverityChangedOn": null, "SeverityChangeDir": null, "CritSitActive": false, "CritSitEndedOn": null, "CustomerSentiment": "Neutral", "BusinessImpact": "Low", "ExecVisibility": false, "NextAction": "Customer to confirm mail flow rule", "NextActionOwner": "Customer", "NextActionDue": "2026-10-02", "ResolutionETA": null, "EscalationStatus": "None", "_account": "Tailspin Aerospace", "CustomerNameRaw": "Tailspin Aerospace", "IsOpen": true, "BallInCourt": "Customer", "RiskScore": 3, "RiskLevel": "Green", "PtsSeverity": 3, "PtsMomentum": 0, "PtsAge": 0, "PtsSLA": 0, "PtsVoice": 0, "PtsExposure": 0, "RiskDrivers": "Sev C base (+3)", "RiskScorePrev": 3, "RiskTrend": "Stable", "RedSince": null, "DaysOpen": 5, "BizDaysIdle": 0, "IsStalled": false, "StallType": "None", "SLAStatus": "Met", "EscalationTriggers": "", "SuggestedLevel": "", "PlaybookId": "PB-00", "RecommendedAction": "Standard monitoring - no action needed today.", "ComplaintOpen": false, "RequestOpen": false, "LastScored": "2026-09-30T04:30:00.000Z", "Source": "Import"}, {"CaseId": "2609180050001601", "Title": "Autopilot pre-provisioning fails with TPM attestation error", "Severity": "Sev B", "SupportAreaPath": "Windows 11/Deployment/Autopilot", "ProductFamily": "Windows 11", "ServiceName": "Unified Support | Enterprise", "Status": "In Progress", "Engineer": "Olivia Brooks", "OwnershipChanges": 1, "ReopenCount": 0, "CreatedOn": "2026-09-18T09:00:00+03:00", "FirstResponseOn": "2026-09-18T09:40:00+03:00", "LastMicrosoftUpdate": "2026-09-21T16:00:00+03:00", "LastCustomerUpdate": "2026-09-29T09:00:00+03:00", "LastActivity": "2026-09-29T09:00:00+03:00", "CustomerChasers": 3, "SeverityChangedOn": null, "SeverityChangeDir": null, "CritSitActive": false, "CritSitEndedOn": null, "CustomerSentiment": "Frustrated", "BusinessImpact": "Medium", "ExecVisibility": false, "NextAction": "Engineer to confirm TPM firmware findings", "NextActionOwner": "Engineer", "NextActionDue": "2026-10-01", "ResolutionETA": null, "EscalationStatus": "Candidate", "_account": "Adatum Automotive", "CustomerNameRaw": "Adatum Automotive", "IsOpen": true, "BallInCourt": "Microsoft", "RiskScore": 56, "RiskLevel": "Yellow", "PtsSeverity": 12, "PtsMomentum": 25, "PtsAge": 5, "PtsSLA": 0, "PtsVoice": 14, "PtsExposure": 0, "RiskDrivers": "No Microsoft update for 6 business day(s) (threshold 3) (+25); Sev B base (+12); Customer sentiment: Frustrated (+8); 3 customer follow-ups without Microsoft reply (+6); Open 12 day(s) vs 14-day target (+5)", "RiskScorePrev": 48, "RiskTrend": "Stable", "RedSince": null, "DaysOpen": 12, "BizDaysIdle": 6, "IsStalled": true, "StallType": "Microsoft-side", "SLAStatus": "Met", "EscalationTriggers": "E11", "SuggestedLevel": "L1 - Engineer's manager / Technical Advisor", "PlaybookId": "PB-05", "RecommendedAction": "Nudge the engineer (template N1); no reply within 1 business day -> engineer's manager (L1).", "ComplaintOpen": false, "RequestOpen": true, "LastScored": "2026-09-30T04:30:00.000Z", "Source": "Import"}, {"CaseId": "2609290050001602", "Title": "Sentinel SAP data connector stopped ingesting", "Severity": "Sev A", "SupportAreaPath": "Microsoft Sentinel/Data connectors/SAP", "ProductFamily": "Microsoft Sentinel", "ServiceName": "Unified Support | Enterprise", "Status": "In Progress", "Engineer": "Elena Petrova", "OwnershipChanges": 1, "ReopenCount": 0, "CreatedOn": "2026-09-29T08:00:00+03:00", "FirstResponseOn": "2026-09-29T08:30:00+03:00", "LastMicrosoftUpdate": "2026-09-29T17:00:00+03:00", "LastCustomerUpdate": "2026-09-29T12:00:00+03:00", "LastActivity": "2026-09-29T17:00:00+03:00", "CustomerChasers": 0, "SeverityChangedOn": null, "SeverityChangeDir": null, "CritSitActive": false, "CritSitEndedOn": null, "CustomerSentiment": "Neutral", "BusinessImpact": "High", "ExecVisibility": false, "NextAction": "Customer to restart connector with debug logging", "NextActionOwner": "Customer", "NextActionDue": "2026-09-30", "ResolutionETA": null, "EscalationStatus": "None", "_account": "Adatum Automotive", "CustomerNameRaw": "Adatum Automotive", "IsOpen": true, "BallInCourt": "Customer", "RiskScore": 26, "RiskLevel": "Yellow", "PtsSeverity": 22, "PtsMomentum": 0, "PtsAge": 0, "PtsSLA": 0, "PtsVoice": 0, "PtsExposure": 4, "RiskDrivers": "Sev A base (+22); Business impact: High (+4) | Floor: Y1 Open Sev A", "RiskScorePrev": null, "RiskTrend": "New", "RedSince": null, "DaysOpen": 1, "BizDaysIdle": 0, "IsStalled": false, "StallType": "None", "SLAStatus": "Met", "EscalationTriggers": "", "SuggestedLevel": "", "PlaybookId": "PB-00", "RecommendedAction": "Watch: confirm next action, owner and ETA with the engineer.", "ComplaintOpen": false, "RequestOpen": false, "LastScored": "2026-09-30T04:30:00.000Z", "Source": "Import"}, {"CaseId": "2609240050001603", "Title": "Supply Chain master planning run takes 9+ hours", "Severity": "Sev C", "SupportAreaPath": "Dynamics 365/Supply Chain Management/Master planning", "ProductFamily": "Dynamics 365", "ServiceName": "Unified Support | Enterprise", "Status": "In Progress", "Engineer": "Daniel Kim", "OwnershipChanges": 1, "ReopenCount": 0, "CreatedOn": "2026-09-24T10:00:00+03:00", "FirstResponseOn": "2026-09-24T12:00:00+03:00", "LastMicrosoftUpdate": "2026-09-29T14:00:00+03:00", "LastCustomerUpdate": "2026-09-29T09:00:00+03:00", "LastActivity": "2026-09-29T14:00:00+03:00", "CustomerChasers": 0, "SeverityChangedOn": null, "SeverityChangeDir": null, "CritSitActive": false, "CritSitEndedOn": null, "CustomerSentiment": "Neutral", "BusinessImpact": "Medium", "ExecVisibility": false, "NextAction": "Customer to test planning optimization", "NextActionOwner": "Customer", "NextActionDue": "2026-10-06", "ResolutionETA": null, "EscalationStatus": "None", "_account": "Adatum Automotive", "CustomerNameRaw": "Adatum Automotive", "IsOpen": true, "BallInCourt": "Customer", "RiskScore": 3, "RiskLevel": "Green", "PtsSeverity": 3, "PtsMomentum": 0, "PtsAge": 0, "PtsSLA": 0, "PtsVoice": 0, "PtsExposure": 0, "RiskDrivers": "Sev C base (+3)", "RiskScorePrev": 3, "RiskTrend": "Stable", "RedSince": null, "DaysOpen": 6, "BizDaysIdle": 0, "IsStalled": false, "StallType": "None", "SLAStatus": "Met", "EscalationTriggers": "", "SuggestedLevel": "", "PlaybookId": "PB-00", "RecommendedAction": "Standard monitoring - no action needed today.", "ComplaintOpen": false, "RequestOpen": false, "LastScored": "2026-09-30T04:30:00.000Z", "Source": "Import"}, {"CaseId": "2608250050001701", "Title": "MES integration: Always On failover takes 4+ minutes", "Severity": "Sev C", "SupportAreaPath": "SQL Server/High Availability/Always On", "ProductFamily": "SQL Server", "ServiceName": "Unified Support | Enterprise", "Status": "Waiting on Customer", "Engineer": "Mateo Alvarez", "OwnershipChanges": 2, "ReopenCount": 0, "CreatedOn": "2026-08-25T10:00:00+03:00", "FirstResponseOn": "2026-08-25T11:00:00+03:00", "LastMicrosoftUpdate": "2026-09-17T15:00:00+03:00", "LastCustomerUpdate": "2026-09-15T10:00:00+03:00", "LastActivity": "2026-09-17T15:00:00+03:00", "CustomerChasers": 0, "SeverityChangedOn": null, "SeverityChangeDir": null, "CritSitActive": false, "CritSitEndedOn": null, "CustomerSentiment": "Neutral", "BusinessImpact": "Medium", "ExecVisibility": false, "NextAction": "Customer to schedule failover test window", "NextActionOwner": "Customer", "NextActionDue": "2026-10-15", "ResolutionETA": null, "EscalationStatus": "None", "_account": "Litware Manufacturing", "CustomerNameRaw": "Litware Manufacturing", "IsOpen": true, "BallInCourt": "Customer", "RiskScore": 24, "RiskLevel": "Yellow", "PtsSeverity": 3, "PtsMomentum": 6, "PtsAge": 15, "PtsSLA": 0, "PtsVoice": 0, "PtsExposure": 0, "RiskDrivers": "Open 36 day(s) vs 30-day target (+15); Awaiting customer for 8 business day(s) (threshold 5) (+6); Sev C base (+3) | Floor: Y3 Case is stalled, Y4 Open 30+ days", "RiskScorePrev": 24, "RiskTrend": "Stable", "RedSince": null, "DaysOpen": 36, "BizDaysIdle": 8, "IsStalled": true, "StallType": "Customer-side", "SLAStatus": "Met", "EscalationTriggers": "", "SuggestedLevel": "", "PlaybookId": "PB-06", "RecommendedAction": "Nudge the customer (template C1); second nudge after 3 business days, then propose closure.", "ComplaintOpen": false, "RequestOpen": true, "LastScored": "2026-09-30T04:30:00.000Z", "Source": "Import"}, {"CaseId": "2609250050001702", "Title": "OneDrive sync client high CPU on shop-floor PCs", "Severity": "Sev C", "SupportAreaPath": "OneDrive/Sync client/Performance", "ProductFamily": "OneDrive", "ServiceName": "Unified Support | Enterprise", "Status": "Waiting on Customer", "Engineer": "Ioana Marin", "OwnershipChanges": 1, "ReopenCount": 0, "CreatedOn": "2026-09-25T13:00:00+03:00", "FirstResponseOn": "2026-09-25T15:00:00+03:00", "LastMicrosoftUpdate": "2026-09-28T11:00:00+03:00", "LastCustomerUpdate": "2026-09-25T16:00:00+03:00", "LastActivity": "2026-09-28T11:00:00+03:00", "CustomerChasers": 0, "SeverityChangedOn": null, "SeverityChangeDir": null, "CritSitActive": false, "CritSitEndedOn": null, "CustomerSentiment": "Neutral", "BusinessImpact": "Low", "ExecVisibility": false, "NextAction": "Customer to collect sync diagnostics", "NextActionOwner": "Customer", "NextActionDue": "2026-10-05", "ResolutionETA": null, "EscalationStatus": "None", "_account": "Litware Manufacturing", "CustomerNameRaw": "Litware Manufacturing", "IsOpen": true, "BallInCourt": "Customer", "RiskScore": 3, "RiskLevel": "Green", "PtsSeverity": 3, "PtsMomentum": 0, "PtsAge": 0, "PtsSLA": 0, "PtsVoice": 0, "PtsExposure": 0, "RiskDrivers": "Sev C base (+3)", "RiskScorePrev": 3, "RiskTrend": "Stable", "RedSince": null, "DaysOpen": 5, "BizDaysIdle": 1, "IsStalled": false, "StallType": "None", "SLAStatus": "Met", "EscalationTriggers": "", "SuggestedLevel": "", "PlaybookId": "PB-00", "RecommendedAction": "Standard monitoring - no action needed today.", "ComplaintOpen": false, "RequestOpen": false, "LastScored": "2026-09-30T04:30:00.000Z", "Source": "Import"}, {"CaseId": "2609110050001801", "Title": "POS terminals roll back Windows 10 IoT cumulative update", "Severity": "Sev B", "SupportAreaPath": "Windows 10 IoT/Updates/Servicing", "ProductFamily": "Windows 10 IoT", "ServiceName": "Unified Support | Enterprise", "Status": "In Progress", "Engineer": "Kenji Sato", "OwnershipChanges": 4, "ReopenCount": 1, "CreatedOn": "2026-09-11T10:00:00+03:00", "FirstResponseOn": "2026-09-11T10:30:00+03:00", "LastMicrosoftUpdate": "2026-09-22T13:00:00+03:00", "LastCustomerUpdate": "2026-09-23T09:30:00+03:00", "LastActivity": "2026-09-23T09:30:00+03:00", "CustomerChasers": 1, "SeverityChangedOn": null, "SeverityChangeDir": null, "CritSitActive": false, "CritSitEndedOn": null, "CustomerSentiment": "Frustrated", "BusinessImpact": "Medium", "ExecVisibility": false, "NextAction": "New engineer to reproduce rollback", "NextActionOwner": "Engineer", "NextActionDue": "2026-10-01", "ResolutionETA": null, "EscalationStatus": "Candidate", "_account": "Proseware Retail", "CustomerNameRaw": "Proseware Retail", "IsOpen": true, "BallInCourt": "Microsoft", "RiskScore": 71, "RiskLevel": "Red", "PtsSeverity": 12, "PtsMomentum": 18, "PtsAge": 15, "PtsSLA": 0, "PtsVoice": 16, "PtsExposure": 10, "RiskDrivers": "No Microsoft update for 5 business day(s) (threshold 3) (+18); Open 19 day(s) vs 14-day target (+15); Sev B base (+12); Customer sentiment: Frustrated (+8); Open complaint (+8); 4 ownership changes (+5); Reopened 1x (+5)", "RiskScorePrev": 60, "RiskTrend": "Worsening", "RedSince": "2026-09-29T07:30:00+03:00", "DaysOpen": 19, "BizDaysIdle": 5, "IsStalled": true, "StallType": "Microsoft-side", "SLAStatus": "Met", "EscalationTriggers": "E4; E8; E10", "SuggestedLevel": "L1 - Engineer's manager / Technical Advisor", "PlaybookId": "PB-07", "RecommendedAction": "Complaint open: acknowledge within 1 business day and agree a recovery plan with the engineer's manager.", "ComplaintOpen": true, "RequestOpen": false, "LastScored": "2026-09-30T04:30:00.000Z", "Source": "Import"}, {"CaseId": "2609250050001802", "Title": "EOP quarantines vendor invoices as phishing", "Severity": "Sev C", "SupportAreaPath": "Exchange Online/Anti-spam/False positives", "ProductFamily": "Exchange Online", "ServiceName": "Unified Support | Enterprise", "Status": "Waiting on Customer", "Engineer": "Chen Wei", "OwnershipChanges": 1, "ReopenCount": 0, "CreatedOn": "2026-09-25T09:00:00+03:00", "FirstResponseOn": "2026-09-25T10:30:00+03:00", "LastMicrosoftUpdate": "2026-09-29T16:00:00+03:00", "LastCustomerUpdate": "2026-09-29T11:00:00+03:00", "LastActivity": "2026-09-29T16:00:00+03:00", "CustomerChasers": 0, "SeverityChangedOn": null, "SeverityChangeDir": null, "CritSitActive": false, "CritSitEndedOn": null, "CustomerSentiment": "Neutral", "BusinessImpact": "Low", "ExecVisibility": false, "NextAction": "Customer to submit samples", "NextActionOwner": "Customer", "NextActionDue": "2026-10-03", "ResolutionETA": null, "EscalationStatus": "None", "_account": "Proseware Retail", "CustomerNameRaw": "Proseware Retail", "IsOpen": true, "BallInCourt": "Customer", "RiskScore": 3, "RiskLevel": "Green", "PtsSeverity": 3, "PtsMomentum": 0, "PtsAge": 0, "PtsSLA": 0, "PtsVoice": 0, "PtsExposure": 0, "RiskDrivers": "Sev C base (+3)", "RiskScorePrev": 3, "RiskTrend": "Stable", "RedSince": null, "DaysOpen": 5, "BizDaysIdle": 0, "IsStalled": false, "StallType": "None", "SLAStatus": "Met", "EscalationTriggers": "", "SuggestedLevel": "", "PlaybookId": "PB-00", "RecommendedAction": "Standard monitoring - no action needed today.", "ComplaintOpen": false, "RequestOpen": false, "LastScored": "2026-09-30T04:30:00.000Z", "Source": "Import"}, {"CaseId": "2609300050001803", "Title": "Power Automate flows failing with 429 throttling", "Severity": "Sev C", "SupportAreaPath": "Power Automate/Cloud flows/Throttling", "ProductFamily": "Power Automate", "ServiceName": "Unified Support | Enterprise", "Status": "New", "Engineer": "(unassigned)", "OwnershipChanges": 0, "ReopenCount": 0, "CreatedOn": "2026-09-30T06:50:00+03:00", "FirstResponseOn": null, "LastMicrosoftUpdate": null, "LastCustomerUpdate": null, "LastActivity": "2026-09-30T06:50:00+03:00", "CustomerChasers": 0, "SeverityChangedOn": null, "SeverityChangeDir": null, "CritSitActive": false, "CritSitEndedOn": null, "CustomerSentiment": "Neutral", "BusinessImpact": "Low", "ExecVisibility": false, "NextAction": null, "NextActionOwner": null, "NextActionDue": null, "ResolutionETA": null, "EscalationStatus": "None", "_account": "Proseware Retail", "CustomerNameRaw": "Proseware Retail", "IsOpen": true, "BallInCourt": "Unknown", "RiskScore": 3, "RiskLevel": "Green", "PtsSeverity": 3, "PtsMomentum": 0, "PtsAge": 0, "PtsSLA": 0, "PtsVoice": 0, "PtsExposure": 0, "RiskDrivers": "Sev C base (+3)", "RiskScorePrev": null, "RiskTrend": "New", "RedSince": null, "DaysOpen": 0, "BizDaysIdle": 0, "IsStalled": false, "StallType": "None", "SLAStatus": "Pending", "EscalationTriggers": "", "SuggestedLevel": "", "PlaybookId": "PB-00", "RecommendedAction": "Standard monitoring - no action needed today.", "ComplaintOpen": false, "RequestOpen": false, "LastScored": "2026-09-30T04:30:00.000Z", "Source": "Import"}, {"CaseId": "2609140050001901", "Title": "Azure Firewall SNAT port exhaustion at peak traffic", "Severity": "Sev A", "SupportAreaPath": "Azure/Networking/Azure Firewall", "ProductFamily": "Azure", "ServiceName": "Unified Support | Enterprise", "Status": "In Progress", "Engineer": "Samuel Okoro", "OwnershipChanges": 2, "ReopenCount": 0, "CreatedOn": "2026-09-14T09:00:00+03:00", "FirstResponseOn": "2026-09-14T09:20:00+03:00", "LastMicrosoftUpdate": "2026-09-29T17:30:00+03:00", "LastCustomerUpdate": "2026-09-29T11:00:00+03:00", "LastActivity": "2026-09-29T17:30:00+03:00", "CustomerChasers": 0, "SeverityChangedOn": null, "SeverityChangeDir": null, "CritSitActive": false, "CritSitEndedOn": null, "CustomerSentiment": "Neutral", "BusinessImpact": "High", "ExecVisibility": false, "NextAction": "PG reviewing SNAT scaling logs", "NextActionOwner": "Product Group", "NextActionDue": "2026-10-01", "ResolutionETA": null, "EscalationStatus": "Candidate", "_account": "Relecloud Telecom", "CustomerNameRaw": "Relecloud Telecom", "IsOpen": true, "BallInCourt": "Microsoft", "RiskScore": 46, "RiskLevel": "Yellow", "PtsSeverity": 22, "PtsMomentum": 0, "PtsAge": 20, "PtsSLA": 0, "PtsVoice": 0, "PtsExposure": 4, "RiskDrivers": "Sev A base (+22); Open 16 day(s) vs 7-day target (+20); Business impact: High (+4)", "RiskScorePrev": 46, "RiskTrend": "Stable", "RedSince": null, "DaysOpen": 16, "BizDaysIdle": 0, "IsStalled": false, "StallType": "None", "SLAStatus": "Met", "EscalationTriggers": "E7", "SuggestedLevel": "L1 - Engineer's manager / Technical Advisor", "PlaybookId": "PB-09", "RecommendedAction": "Aging without a plan: request an action plan and ETA from the engineer's manager / TA.", "ComplaintOpen": false, "RequestOpen": true, "LastScored": "2026-09-30T04:30:00.000Z", "Source": "Import"}, {"CaseId": "2609290050001902", "Title": "Teams Rooms devices show offline in admin center", "Severity": "Sev C", "SupportAreaPath": "Microsoft Teams/Teams Rooms/Device management", "ProductFamily": "Microsoft Teams", "ServiceName": "Unified Support | Enterprise", "Status": "In Progress", "Engineer": "Fatima Zahra", "OwnershipChanges": 1, "ReopenCount": 0, "CreatedOn": "2026-09-29T10:00:00+03:00", "FirstResponseOn": "2026-09-29T12:00:00+03:00", "LastMicrosoftUpdate": "2026-09-29T12:00:00+03:00", "LastCustomerUpdate": null, "LastActivity": "2026-09-29T12:00:00+03:00", "CustomerChasers": 0, "SeverityChangedOn": null, "SeverityChangeDir": null, "CritSitActive": false, "CritSitEndedOn": null, "CustomerSentiment": "Neutral", "BusinessImpact": "Low", "ExecVisibility": false, "NextAction": "Customer to share device logs", "NextActionOwner": "Customer", "NextActionDue": "2026-10-03", "ResolutionETA": null, "EscalationStatus": "None", "_account": "Relecloud Telecom", "CustomerNameRaw": "Relecloud Telecom", "IsOpen": true, "BallInCourt": "Customer", "RiskScore": 3, "RiskLevel": "Green", "PtsSeverity": 3, "PtsMomentum": 0, "PtsAge": 0, "PtsSLA": 0, "PtsVoice": 0, "PtsExposure": 0, "RiskDrivers": "Sev C base (+3)", "RiskScorePrev": null, "RiskTrend": "New", "RedSince": null, "DaysOpen": 1, "BizDaysIdle": 0, "IsStalled": false, "StallType": "None", "SLAStatus": "Met", "EscalationTriggers": "", "SuggestedLevel": "", "PlaybookId": "PB-00", "RecommendedAction": "Standard monitoring - no action needed today.", "ComplaintOpen": false, "RequestOpen": false, "LastScored": "2026-09-30T04:30:00.000Z", "Source": "Import"}, {"CaseId": "2609240050001903", "Title": "Front Door managed certificate renewal failing", "Severity": "Sev B", "SupportAreaPath": "Azure/Front Door/Certificates", "ProductFamily": "Azure", "ServiceName": "Unified Support | Enterprise", "Status": "In Progress", "Engineer": "Elena Petrova", "OwnershipChanges": 1, "ReopenCount": 0, "CreatedOn": "2026-09-24T11:00:00+03:00", "FirstResponseOn": "2026-09-24T11:40:00+03:00", "LastMicrosoftUpdate": "2026-09-28T15:00:00+03:00", "LastCustomerUpdate": "2026-09-29T09:00:00+03:00", "LastActivity": "2026-09-29T09:00:00+03:00", "CustomerChasers": 1, "SeverityChangedOn": null, "SeverityChangeDir": null, "CritSitActive": false, "CritSitEndedOn": null, "CustomerSentiment": "Neutral", "BusinessImpact": "Medium", "ExecVisibility": false, "NextAction": "Engineer validating DNS CNAME chain", "NextActionOwner": "Engineer", "NextActionDue": "2026-10-01", "ResolutionETA": null, "EscalationStatus": "None", "_account": "Relecloud Telecom", "CustomerNameRaw": "Relecloud Telecom", "IsOpen": true, "BallInCourt": "Microsoft", "RiskScore": 12, "RiskLevel": "Green", "PtsSeverity": 12, "PtsMomentum": 0, "PtsAge": 0, "PtsSLA": 0, "PtsVoice": 0, "PtsExposure": 0, "RiskDrivers": "Sev B base (+12)", "RiskScorePrev": 12, "RiskTrend": "Stable", "RedSince": null, "DaysOpen": 6, "BizDaysIdle": 1, "IsStalled": false, "StallType": "None", "SLAStatus": "Met", "EscalationTriggers": "", "SuggestedLevel": "", "PlaybookId": "PB-00", "RecommendedAction": "Standard monitoring - no action needed today.", "ComplaintOpen": false, "RequestOpen": false, "LastScored": "2026-09-30T04:30:00.000Z", "Source": "Import"}, {"CaseId": "2609040050002001", "Title": "Hybrid migration batches failing with MRS proxy errors", "Severity": "Sev B", "SupportAreaPath": "Exchange Online/Migration/Hybrid", "ProductFamily": "Exchange Online", "ServiceName": "Unified Support | Enterprise", "Status": "In Progress", "Engineer": "Daniel Kim", "OwnershipChanges": 2, "ReopenCount": 0, "CreatedOn": "2026-09-04T10:00:00+03:00", "FirstResponseOn": "2026-09-04T10:45:00+03:00", "LastMicrosoftUpdate": "2026-09-25T17:00:00+03:00", "LastCustomerUpdate": "2026-09-28T10:00:00+03:00", "LastActivity": "2026-09-28T10:00:00+03:00", "CustomerChasers": 1, "SeverityChangedOn": null, "SeverityChangeDir": null, "CritSitActive": false, "CritSitEndedOn": null, "CustomerSentiment": "Angry", "BusinessImpact": "High", "ExecVisibility": true, "NextAction": "Senior engineer to join daily call", "NextActionOwner": "Engineer", "NextActionDue": "2026-10-01", "ResolutionETA": null, "EscalationStatus": "Submitted", "_account": "Humongous Insurance", "CustomerNameRaw": "Humongous Insurance", "IsOpen": true, "BallInCourt": "Microsoft", "RiskScore": 70, "RiskLevel": "Red", "PtsSeverity": 12, "PtsMomentum": 8, "PtsAge": 15, "PtsSLA": 0, "PtsVoice": 20, "PtsExposure": 15, "RiskDrivers": "Open 26 day(s) vs 14-day target (+15); Customer sentiment: Angry (+15); Sev B base (+12); No Microsoft update for 2 business day(s) (threshold 3) (+8); Open complaint (+8); Customer executive visibility (+8); Account concern: Critical (+6); Business impact: High (+4); Contract ends in 81 days (+3) | Override: R4 Customer explicitly requested escalation, R5 Angry customer with executive visibility", "RiskScorePrev": 70, "RiskTrend": "Stable", "RedSince": "2026-09-24T07:30:00+03:00", "DaysOpen": 26, "BizDaysIdle": 2, "IsStalled": false, "StallType": "None", "SLAStatus": "Met", "EscalationTriggers": "E4; E5; E6; E10", "SuggestedLevel": "L2 - Support escalation (duty manager / 24x7 Case Management) + L4 executive alignment", "PlaybookId": "PB-04", "RecommendedAction": "Customer asked to escalate: build the escalation pack, get manager approval, submit at L2 today.", "ComplaintOpen": true, "RequestOpen": false, "LastScored": "2026-09-30T04:30:00.000Z", "Source": "Import"}, {"CaseId": "2609220050002002", "Title": "Mailbox permissions not replicating after migration", "Severity": "Sev B", "SupportAreaPath": "Exchange Online/Mailbox permissions/Full access", "ProductFamily": "Exchange Online", "ServiceName": "Unified Support | Enterprise", "Status": "In Progress", "Engineer": "Ioana Marin", "OwnershipChanges": 1, "ReopenCount": 0, "CreatedOn": "2026-09-22T09:00:00+03:00", "FirstResponseOn": "2026-09-22T10:30:00+03:00", "LastMicrosoftUpdate": "2026-09-23T16:00:00+03:00", "LastCustomerUpdate": "2026-09-24T10:00:00+03:00", "LastActivity": "2026-09-24T10:00:00+03:00", "CustomerChasers": 1, "SeverityChangedOn": null, "SeverityChangeDir": null, "CritSitActive": false, "CritSitEndedOn": null, "CustomerSentiment": "Frustrated", "BusinessImpact": "Medium", "ExecVisibility": false, "NextAction": "Engineer to analyze permission sync logs", "NextActionOwner": "Engineer", "NextActionDue": "2026-10-01", "ResolutionETA": null, "EscalationStatus": "None", "_account": "Humongous Insurance", "CustomerNameRaw": "Humongous Insurance", "IsOpen": true, "BallInCourt": "Microsoft", "RiskScore": 52, "RiskLevel": "Yellow", "PtsSeverity": 12, "PtsMomentum": 18, "PtsAge": 5, "PtsSLA": 0, "PtsVoice": 8, "PtsExposure": 9, "RiskDrivers": "No Microsoft update for 4 business day(s) (threshold 3) (+18); Sev B base (+12); Customer sentiment: Frustrated (+8); Account concern: Critical (+6); Open 8 day(s) vs 14-day target (+5); Contract ends in 81 days (+3)", "RiskScorePrev": 44, "RiskTrend": "Stable", "RedSince": null, "DaysOpen": 8, "BizDaysIdle": 4, "IsStalled": true, "StallType": "Microsoft-side", "SLAStatus": "Met", "EscalationTriggers": "", "SuggestedLevel": "", "PlaybookId": "PB-05", "RecommendedAction": "Nudge the engineer (template N1); no reply within 1 business day -> engineer's manager (L1).", "ComplaintOpen": false, "RequestOpen": false, "LastScored": "2026-09-30T04:30:00.000Z", "Source": "Import"}, {"CaseId": "2609250050002003", "Title": "Shared mailbox auto-mapping not working post-migration", "Severity": "Sev C", "SupportAreaPath": "Exchange Online/Mailbox permissions/Auto-mapping", "ProductFamily": "Exchange Online", "ServiceName": "Unified Support | Enterprise", "Status": "Waiting on Customer", "Engineer": "Lukas Novak", "OwnershipChanges": 1, "ReopenCount": 0, "CreatedOn": "2026-09-25T10:00:00+03:00", "FirstResponseOn": "2026-09-25T11:00:00+03:00", "LastMicrosoftUpdate": "2026-09-28T14:00:00+03:00", "LastCustomerUpdate": "2026-09-25T15:00:00+03:00", "LastActivity": "2026-09-28T14:00:00+03:00", "CustomerChasers": 0, "SeverityChangedOn": null, "SeverityChangeDir": null, "CritSitActive": false, "CritSitEndedOn": null, "CustomerSentiment": "Neutral", "BusinessImpact": "Low", "ExecVisibility": false, "NextAction": "Customer to test re-added permissions", "NextActionOwner": "Customer", "NextActionDue": "2026-10-02", "ResolutionETA": null, "EscalationStatus": "None", "_account": "Humongous Insurance", "CustomerNameRaw": "Humongous Insurance", "IsOpen": true, "BallInCourt": "Customer", "RiskScore": 12, "RiskLevel": "Green", "PtsSeverity": 3, "PtsMomentum": 0, "PtsAge": 0, "PtsSLA": 0, "PtsVoice": 0, "PtsExposure": 9, "RiskDrivers": "Account concern: Critical (+6); Sev C base (+3); Contract ends in 81 days (+3)", "RiskScorePrev": 12, "RiskTrend": "Stable", "RedSince": null, "DaysOpen": 5, "BizDaysIdle": 1, "IsStalled": false, "StallType": "None", "SLAStatus": "Met", "EscalationTriggers": "", "SuggestedLevel": "", "PlaybookId": "PB-00", "RecommendedAction": "Standard monitoring - no action needed today.", "ComplaintOpen": false, "RequestOpen": false, "LastScored": "2026-09-30T04:30:00.000Z", "Source": "Import"}, {"CaseId": "2609280050002004", "Title": "Free/busy lookups fail between on-premises and cloud users", "Severity": "Sev B", "SupportAreaPath": "Exchange Online/Hybrid/Free-busy", "ProductFamily": "Exchange Online", "ServiceName": "Unified Support | Enterprise", "Status": "In Progress", "Engineer": "Priya Raman", "OwnershipChanges": 1, "ReopenCount": 0, "CreatedOn": "2026-09-28T11:00:00+03:00", "FirstResponseOn": "2026-09-28T11:30:00+03:00", "LastMicrosoftUpdate": "2026-09-29T16:00:00+03:00", "LastCustomerUpdate": "2026-09-29T10:00:00+03:00", "LastActivity": "2026-09-29T16:00:00+03:00", "CustomerChasers": 0, "SeverityChangedOn": null, "SeverityChangeDir": null, "CritSitActive": false, "CritSitEndedOn": null, "CustomerSentiment": "Neutral", "BusinessImpact": "Medium", "ExecVisibility": false, "NextAction": "Customer to run hybrid configuration wizard", "NextActionOwner": "Customer", "NextActionDue": "2026-10-02", "ResolutionETA": null, "EscalationStatus": "None", "_account": "Humongous Insurance", "CustomerNameRaw": "Humongous Insurance", "IsOpen": true, "BallInCourt": "Customer", "RiskScore": 21, "RiskLevel": "Green", "PtsSeverity": 12, "PtsMomentum": 0, "PtsAge": 0, "PtsSLA": 0, "PtsVoice": 0, "PtsExposure": 9, "RiskDrivers": "Sev B base (+12); Account concern: Critical (+6); Contract ends in 81 days (+3)", "RiskScorePrev": 21, "RiskTrend": "Stable", "RedSince": null, "DaysOpen": 2, "BizDaysIdle": 0, "IsStalled": false, "StallType": "None", "SLAStatus": "Met", "EscalationTriggers": "", "SuggestedLevel": "", "PlaybookId": "PB-00", "RecommendedAction": "Standard monitoring - no action needed today.", "ComplaintOpen": false, "RequestOpen": false, "LastScored": "2026-09-30T04:30:00.000Z", "Source": "Import"}, {"CaseId": "2609240050002101", "Title": "Azure SQL Database DTU spikes during month-end close", "Severity": "Sev C", "SupportAreaPath": "Azure/Azure SQL Database/Performance", "ProductFamily": "Azure", "ServiceName": "Unified Support | Enterprise", "Status": "Waiting on Customer", "Engineer": "Olivia Brooks", "OwnershipChanges": 1, "ReopenCount": 0, "CreatedOn": "2026-09-24T10:00:00+03:00", "FirstResponseOn": "2026-09-24T11:00:00+03:00", "LastMicrosoftUpdate": "2026-09-25T16:00:00+03:00", "LastCustomerUpdate": "2026-09-24T14:00:00+03:00", "LastActivity": "2026-09-25T16:00:00+03:00", "CustomerChasers": 0, "SeverityChangedOn": null, "SeverityChangeDir": null, "CritSitActive": false, "CritSitEndedOn": null, "CustomerSentiment": "Neutral", "BusinessImpact": "Low", "ExecVisibility": false, "NextAction": "Customer to enable Query Store", "NextActionOwner": "Customer", "NextActionDue": "2026-10-02", "ResolutionETA": null, "EscalationStatus": "None", "_account": "Wide World Importers", "CustomerNameRaw": "Wide World Importers", "IsOpen": true, "BallInCourt": "Customer", "RiskScore": 3, "RiskLevel": "Green", "PtsSeverity": 3, "PtsMomentum": 0, "PtsAge": 0, "PtsSLA": 0, "PtsVoice": 0, "PtsExposure": 0, "RiskDrivers": "Sev C base (+3)", "RiskScorePrev": 3, "RiskTrend": "Stable", "RedSince": null, "DaysOpen": 6, "BizDaysIdle": 2, "IsStalled": false, "StallType": "None", "SLAStatus": "Met", "EscalationTriggers": "", "SuggestedLevel": "", "PlaybookId": "PB-00", "RecommendedAction": "Standard monitoring - no action needed today.", "ComplaintOpen": false, "RequestOpen": false, "LastScored": "2026-09-30T04:30:00.000Z", "Source": "Import"}, {"CaseId": "2609090050002102", "Title": "CSP license assignment errors in Partner Center", "Severity": "Sev C", "SupportAreaPath": "Partner Center/Licensing/Assignments", "ProductFamily": "Partner Center", "ServiceName": "Unified Support | Enterprise", "Status": "In Progress", "Engineer": "Kenji Sato", "OwnershipChanges": 1, "ReopenCount": 0, "CreatedOn": "2026-09-09T11:00:00+03:00", "FirstResponseOn": "2026-09-09T13:00:00+03:00", "LastMicrosoftUpdate": "2026-09-16T10:00:00+03:00", "LastCustomerUpdate": "2026-09-23T09:00:00+03:00", "LastActivity": "2026-09-23T09:00:00+03:00", "CustomerChasers": 2, "SeverityChangedOn": null, "SeverityChangeDir": null, "CritSitActive": false, "CritSitEndedOn": null, "CustomerSentiment": "Neutral", "BusinessImpact": "Medium", "ExecVisibility": false, "NextAction": "Engineer to confirm licensing backend fix", "NextActionOwner": "Engineer", "NextActionDue": "2026-10-01", "ResolutionETA": null, "EscalationStatus": "Candidate", "_account": "Wide World Importers", "CustomerNameRaw": "Wide World Importers", "IsOpen": true, "BallInCourt": "Microsoft", "RiskScore": 40, "RiskLevel": "Yellow", "PtsSeverity": 3, "PtsMomentum": 18, "PtsAge": 5, "PtsSLA": 0, "PtsVoice": 14, "PtsExposure": 0, "RiskDrivers": "No Microsoft update for 9 business day(s) (threshold 5) (+18); Open complaint (+8); 2 customer follow-ups without Microsoft reply (+6); Open 21 day(s) vs 30-day target (+5); Sev C base (+3)", "RiskScorePrev": 28, "RiskTrend": "Worsening", "RedSince": null, "DaysOpen": 21, "BizDaysIdle": 9, "IsStalled": true, "StallType": "Microsoft-side", "SLAStatus": "Met", "EscalationTriggers": "E10; E11", "SuggestedLevel": "L1 - Engineer's manager / Technical Advisor", "PlaybookId": "PB-07", "RecommendedAction": "Complaint open: acknowledge within 1 business day and agree a recovery plan with the engineer's manager.", "ComplaintOpen": true, "RequestOpen": false, "LastScored": "2026-09-30T04:30:00.000Z", "Source": "Import"}, {"CaseId": "2609230050002201", "Title": "Intune compliance not evaluating on iOS 26 devices", "Severity": "Sev B", "SupportAreaPath": "Microsoft Intune/Device compliance/iOS", "ProductFamily": "Microsoft Intune", "ServiceName": "Unified Support | Enterprise", "Status": "In Progress", "Engineer": "Ana Costa", "OwnershipChanges": 1, "ReopenCount": 0, "CreatedOn": "2026-09-23T09:00:00+03:00", "FirstResponseOn": "2026-09-23T09:30:00+03:00", "LastMicrosoftUpdate": "2026-09-29T15:00:00+03:00", "LastCustomerUpdate": "2026-09-29T10:00:00+03:00", "LastActivity": "2026-09-29T15:00:00+03:00", "CustomerChasers": 0, "SeverityChangedOn": null, "SeverityChangeDir": null, "CritSitActive": false, "CritSitEndedOn": null, "CustomerSentiment": "Positive", "BusinessImpact": "Medium", "ExecVisibility": false, "NextAction": "Customer to validate fix on pilot group", "NextActionOwner": "Customer", "NextActionDue": "2026-10-01", "ResolutionETA": null, "EscalationStatus": "None", "_account": "Lamna Healthcare", "CustomerNameRaw": "Lamna Healthcare", "IsOpen": true, "BallInCourt": "Customer", "RiskScore": 17, "RiskLevel": "Green", "PtsSeverity": 12, "PtsMomentum": 0, "PtsAge": 5, "PtsSLA": 0, "PtsVoice": 0, "PtsExposure": 0, "RiskDrivers": "Sev B base (+12); Open 7 day(s) vs 14-day target (+5)", "RiskScorePrev": 17, "RiskTrend": "Stable", "RedSince": null, "DaysOpen": 7, "BizDaysIdle": 0, "IsStalled": false, "StallType": "None", "SLAStatus": "Met", "EscalationTriggers": "", "SuggestedLevel": "", "PlaybookId": "PB-00", "RecommendedAction": "Standard monitoring - no action needed today.", "ComplaintOpen": false, "RequestOpen": false, "LastScored": "2026-09-30T04:30:00.000Z", "Source": "Import"}, {"CaseId": "2609160050002202", "Title": "Teams Phone PSTN calls drop after 30 minutes", "Severity": "Sev B", "SupportAreaPath": "Microsoft Teams/Teams Phone/Call quality", "ProductFamily": "Microsoft Teams", "ServiceName": "Unified Support | Enterprise", "Status": "In Progress", "Engineer": "Samuel Okoro", "OwnershipChanges": 1, "ReopenCount": 0, "CreatedOn": "2026-09-16T10:00:00+03:00", "FirstResponseOn": "2026-09-16T10:40:00+03:00", "LastMicrosoftUpdate": "2026-09-28T16:00:00+03:00", "LastCustomerUpdate": "2026-09-28T17:00:00+03:00", "LastActivity": "2026-09-28T17:00:00+03:00", "CustomerChasers": 0, "SeverityChangedOn": null, "SeverityChangeDir": null, "CritSitActive": false, "CritSitEndedOn": null, "CustomerSentiment": "Neutral", "BusinessImpact": "Medium", "ExecVisibility": false, "NextAction": "Carrier trunk trace review", "NextActionOwner": "Engineer", "NextActionDue": "2026-10-01", "ResolutionETA": "2026-10-02", "EscalationStatus": "None", "_account": "Lamna Healthcare", "CustomerNameRaw": "Lamna Healthcare", "IsOpen": true, "BallInCourt": "Microsoft", "RiskScore": 27, "RiskLevel": "Green", "PtsSeverity": 12, "PtsMomentum": 0, "PtsAge": 15, "PtsSLA": 0, "PtsVoice": 0, "PtsExposure": 0, "RiskDrivers": "Open 14 day(s) vs 14-day target (+15); Sev B base (+12)", "RiskScorePrev": 27, "RiskTrend": "Stable", "RedSince": null, "DaysOpen": 14, "BizDaysIdle": 1, "IsStalled": false, "StallType": "None", "SLAStatus": "Met", "EscalationTriggers": "", "SuggestedLevel": "", "PlaybookId": "PB-00", "RecommendedAction": "Standard monitoring - no action needed today.", "ComplaintOpen": false, "RequestOpen": false, "LastScored": "2026-09-30T04:30:00.000Z", "Source": "Import"}, {"CaseId": "2609280050002203", "Title": "Entra Connect sync errors for new hires", "Severity": "Sev B", "SupportAreaPath": "Microsoft Entra ID/Entra Connect/Sync errors", "ProductFamily": "Microsoft Entra ID", "ServiceName": "Unified Support | Enterprise", "Status": "New", "Engineer": "(unassigned)", "OwnershipChanges": 0, "ReopenCount": 0, "CreatedOn": "2026-09-28T09:00:00+03:00", "FirstResponseOn": null, "LastMicrosoftUpdate": null, "LastCustomerUpdate": null, "LastActivity": "2026-09-28T09:00:00+03:00", "CustomerChasers": 0, "SeverityChangedOn": null, "SeverityChangeDir": null, "CritSitActive": false, "CritSitEndedOn": null, "CustomerSentiment": "Neutral", "BusinessImpact": "Medium", "ExecVisibility": false, "NextAction": null, "NextActionOwner": null, "NextActionDue": null, "ResolutionETA": null, "EscalationStatus": "Candidate", "_account": "Lamna Healthcare", "CustomerNameRaw": "Lamna Healthcare", "IsOpen": true, "BallInCourt": "Unknown", "RiskScore": 50, "RiskLevel": "Red", "PtsSeverity": 12, "PtsMomentum": 23, "PtsAge": 0, "PtsSLA": 15, "PtsVoice": 0, "PtsExposure": 0, "RiskDrivers": "No engineer assigned after 1 business day(s) (+18); No first response after 18h (SLA 2h) (+15); Sev B base (+12); No case correspondence visible to CSM (blind spot) (+5) | Override: R3 Awaiting first response past SLA", "RiskScorePrev": 38, "RiskTrend": "Worsening", "RedSince": "2026-09-30T04:30:00.000Z", "DaysOpen": 2, "BizDaysIdle": 1, "IsStalled": true, "StallType": "Process (no owner)", "SLAStatus": "Breached", "EscalationTriggers": "E3", "SuggestedLevel": "L2 - Support escalation (duty manager / 24x7 Case Management)", "PlaybookId": "PB-03", "RecommendedAction": "First response overdue: contact the duty manager / 24x7 Case Management and inform the customer.", "ComplaintOpen": false, "RequestOpen": false, "LastScored": "2026-09-30T04:30:00.000Z", "Source": "Import"}, {"CaseId": "2609010050001150", "Title": "Retention policy not applying to Exchange Online mailboxes", "_account": "Contoso Holding", "CustomerNameRaw": "Contoso Holding", "Severity": "Sev C", "SupportAreaPath": "Exchange Online/Compliance/Retention", "ProductFamily": "Exchange Online", "Status": "Closed", "IsOpen": false, "CreatedOn": "2026-09-01T10:00:00+03:00", "ClosedOn": "2026-09-12T16:00:00+03:00", "Resolution": "Resolved", "Source": "Import"}, {"CaseId": "2609020050001250", "Title": "Azure Backup job failures for SQL VMs", "_account": "Woodgrove Bank", "CustomerNameRaw": "Woodgrove Bank", "Severity": "Sev B", "SupportAreaPath": "Azure/Backup/SQL in VM", "ProductFamily": "Azure", "Status": "Closed", "IsOpen": false, "CreatedOn": "2026-09-02T09:00:00+03:00", "ClosedOn": "2026-09-19T12:00:00+03:00", "Resolution": "Resolved", "Source": "Import"}, {"CaseId": "2609050050001350", "Title": "Intune Wi-Fi profile not deploying to Android", "_account": "Fabrikam Energy", "CustomerNameRaw": "Fabrikam Energy", "Severity": "Sev C", "SupportAreaPath": "Microsoft Intune/Configuration/Wi-Fi", "ProductFamily": "Microsoft Intune", "Status": "Closed", "IsOpen": false, "CreatedOn": "2026-09-05T11:00:00+03:00", "ClosedOn": "2026-09-24T15:00:00+03:00", "Resolution": "Resolved by customer", "Source": "Import"}, {"CaseId": "2609080050001450", "Title": "Teams Direct Routing SBC certificate rejected", "_account": "Northwind Logistics", "CustomerNameRaw": "Northwind Logistics", "Severity": "Sev A", "SupportAreaPath": "Microsoft Teams/Direct Routing/Certificates", "ProductFamily": "Microsoft Teams", "Status": "Closed", "IsOpen": false, "CreatedOn": "2026-09-08T08:00:00+03:00", "ClosedOn": "2026-09-10T18:00:00+03:00", "Resolution": "Resolved", "Source": "Import"}, {"CaseId": "2609100050001550", "Title": "BitLocker recovery keys not escrowed to Entra ID", "_account": "Tailspin Aerospace", "CustomerNameRaw": "Tailspin Aerospace", "Severity": "Sev B", "SupportAreaPath": "Microsoft Intune/Endpoint security/BitLocker", "ProductFamily": "Microsoft Intune", "Status": "Closed", "IsOpen": false, "CreatedOn": "2026-09-10T09:30:00+03:00", "ClosedOn": "2026-09-26T11:00:00+03:00", "Resolution": "Resolved", "Source": "Import"}, {"CaseId": "2609110050001650", "Title": "SharePoint search results missing new content", "_account": "Adatum Automotive", "CustomerNameRaw": "Adatum Automotive", "Severity": "Sev C", "SupportAreaPath": "SharePoint Online/Search/Crawl", "ProductFamily": "SharePoint Online", "Status": "Closed", "IsOpen": false, "CreatedOn": "2026-09-11T14:00:00+03:00", "ClosedOn": "2026-09-25T10:00:00+03:00", "Resolution": "Resolved", "Source": "Import"}, {"CaseId": "2609140050001750", "Title": "Azure Site Recovery replication lag", "_account": "Litware Manufacturing", "CustomerNameRaw": "Litware Manufacturing", "Severity": "Sev B", "SupportAreaPath": "Azure/Site Recovery/Replication", "ProductFamily": "Azure", "Status": "Closed", "IsOpen": false, "CreatedOn": "2026-09-14T10:00:00+03:00", "ClosedOn": "2026-09-28T17:00:00+03:00", "Resolution": "Resolved", "Source": "Import"}, {"CaseId": "2609150050001850", "Title": "Mailbox quota errors after license change", "_account": "Proseware Retail", "CustomerNameRaw": "Proseware Retail", "Severity": "Sev C", "SupportAreaPath": "Exchange Online/Mailbox/Quota", "ProductFamily": "Exchange Online", "Status": "Closed", "IsOpen": false, "CreatedOn": "2026-09-15T09:00:00+03:00", "ClosedOn": "2026-09-22T12:00:00+03:00", "Resolution": "Resolved by customer", "Source": "Import"}, {"CaseId": "2609170050001950", "Title": "Azure DNS private zone resolution failures", "_account": "Relecloud Telecom", "CustomerNameRaw": "Relecloud Telecom", "Severity": "Sev B", "SupportAreaPath": "Azure/DNS/Private zones", "ProductFamily": "Azure", "Status": "Closed", "IsOpen": false, "CreatedOn": "2026-09-17T13:00:00+03:00", "ClosedOn": "2026-09-29T10:00:00+03:00", "Resolution": "Resolved", "Source": "Import"}, {"CaseId": "2609180050002050", "Title": "Outlook profile corruption after migration", "_account": "Humongous Insurance", "CustomerNameRaw": "Humongous Insurance", "Severity": "Sev C", "SupportAreaPath": "Microsoft 365 Apps/Outlook/Profiles", "ProductFamily": "Microsoft 365 Apps", "Status": "Closed", "IsOpen": false, "CreatedOn": "2026-09-18T10:00:00+03:00", "ClosedOn": "2026-09-23T16:00:00+03:00", "Resolution": "Resolved", "Source": "Import"}, {"CaseId": "2609210050002150", "Title": "Power BI Premium capacity overload at month-end", "_account": "Wide World Importers", "CustomerNameRaw": "Wide World Importers", "Severity": "Sev B", "SupportAreaPath": "Power BI/Premium/Capacity", "ProductFamily": "Power BI", "Status": "Closed", "IsOpen": false, "CreatedOn": "2026-09-21T09:00:00+03:00", "ClosedOn": "2026-09-27T14:00:00+03:00", "Resolution": "Resolved", "Source": "Import"}, {"CaseId": "2609220050002250", "Title": "B2B invitation redemption failures", "_account": "Lamna Healthcare", "CustomerNameRaw": "Lamna Healthcare", "Severity": "Sev C", "SupportAreaPath": "Microsoft Entra ID/External identities/B2B", "ProductFamily": "Microsoft Entra ID", "Status": "Closed", "IsOpen": false, "CreatedOn": "2026-09-22T11:00:00+03:00", "ClosedOn": "2026-09-29T16:30:00+03:00", "Resolution": "Resolved by customer", "Source": "Import"}], "CSCTSignals": [{"Title": "No meaningful update on mail-flow delays for 4 business days", "SignalType": "Complaint", "CaseId": "2609170050001102", "Source": "Case email", "ReceivedOn": "2026-09-24T10:05:00+03:00", "CustomerContact": "IT Operations Manager", "Category": "Response time", "RequestType": null, "Priority": "High", "DueDate": "2026-09-25", "Status": "New", "Verbatim": "We have been waiting since last Wednesday without a meaningful update on a mail-flow issue. This is not acceptable.", "DetectedBy": "Keyword rules", "_account": "Contoso Holding", "IsOpen": true}, {"Title": "Migration failing for three weeks; CIO asking questions", "SignalType": "Complaint", "CaseId": "2609040050002001", "Source": "Case email", "ReceivedOn": "2026-09-28T10:02:00+03:00", "CustomerContact": "Messaging Lead", "Category": "Resolution quality", "RequestType": null, "Priority": "Critical", "DueDate": "2026-09-30", "Status": "In Progress", "Verbatim": "Third week of failed migration batches. Our CIO is asking why Microsoft cannot resolve this.", "DetectedBy": "AI classifier", "_account": "Humongous Insurance", "IsOpen": true}, {"Title": "Customer asks for management escalation and a senior engineer today", "SignalType": "Escalation Request", "CaseId": "2609040050002001", "Source": "Case email", "ReceivedOn": "2026-09-28T10:02:00+03:00", "CustomerContact": "Messaging Lead", "Category": "Resolution quality", "RequestType": null, "Priority": "Critical", "DueDate": "2026-09-29", "Status": "In Progress", "Verbatim": "Please escalate this case to management; we need a senior engineer engaged today.", "DetectedBy": "Keyword rules", "_account": "Humongous Insurance", "IsOpen": true}, {"Title": "SME call requested this week", "SignalType": "Additional Request", "CaseId": "2609160050001503", "Source": "Case email", "ReceivedOn": "2026-09-24T15:00:00+03:00", "CustomerContact": "Cloud Architect", "Category": null, "RequestType": "Call / meeting with SME", "Priority": "Medium", "DueDate": "2026-09-28", "Status": "Acknowledged", "Verbatim": "Can we schedule a call with a subject-matter expert this week?", "DetectedBy": "Keyword rules", "_account": "Tailspin Aerospace", "IsOpen": true}, {"Title": "RCA and preventive action plan after restoration", "SignalType": "Additional Request", "CaseId": "2609300050001201", "Source": "Case email", "ReceivedOn": "2026-09-30T06:15:00+03:00", "CustomerContact": "Head of Infrastructure", "Category": null, "RequestType": "RCA / post-incident report", "Priority": "High", "DueDate": "2026-10-07", "Status": "New", "Verbatim": "Please provide an RCA and preventive action plan once service is restored.", "DetectedBy": "Keyword rules", "_account": "Woodgrove Bank", "IsOpen": true}, {"Title": "Written action plan and PG engagement status", "SignalType": "Additional Request", "CaseId": "2609030050001301", "Source": "Case email", "ReceivedOn": "2026-09-24T11:05:00+03:00", "CustomerContact": "DBA Team Lead", "Category": null, "RequestType": "Action plan / documentation", "Priority": "High", "DueDate": "2026-09-29", "Status": "In Progress", "Verbatim": "We need the product group engagement status and a written action plan.", "DetectedBy": "AI classifier", "_account": "Fabrikam Energy", "IsOpen": true}, {"Title": "Repeated re-explaining after each engineer change", "SignalType": "Complaint", "CaseId": "2609110050001801", "Source": "Case email", "ReceivedOn": "2026-09-29T09:40:00+03:00", "CustomerContact": "Store Systems Manager", "Category": "Engineer handling", "RequestType": null, "Priority": "High", "DueDate": "2026-09-30", "Status": "New", "Verbatim": "Every time the case moves to a new engineer we have to explain everything again.", "DetectedBy": "AI classifier", "_account": "Proseware Retail", "IsOpen": true}, {"Title": "CIO unhappy with Teams reliability; will raise in QBR", "SignalType": "Account Concern", "CaseId": null, "Source": "Meeting", "ReceivedOn": "2026-09-26T14:00:00+03:00", "CustomerContact": "Group CIO", "Category": "Relationship / executive", "RequestType": null, "Priority": "High", "DueDate": "2026-10-03", "Status": "In Progress", "Verbatim": "Teams reliability is now a board-level topic for us.", "DetectedBy": "CSM", "_account": "Contoso Holding", "IsOpen": true}, {"Title": "Renewal decision tied to Exchange migration experience", "SignalType": "Account Concern", "CaseId": null, "Source": "CSM observation", "ReceivedOn": "2026-09-25T16:00:00+03:00", "CustomerContact": "CIO", "Category": "Commercial / renewal", "RequestType": null, "Priority": "Critical", "DueDate": "2026-10-02", "Status": "In Progress", "Verbatim": "The support experience on the migration will weigh on our renewal decision.", "DetectedBy": "CSM", "_account": "Humongous Insurance", "IsOpen": true}, {"Title": "Thanks for quick turnaround on iOS compliance", "SignalType": "Praise", "CaseId": "2609230050002201", "Source": "Case email", "ReceivedOn": "2026-09-29T10:30:00+03:00", "CustomerContact": "Endpoint Lead", "Category": "Other", "RequestType": null, "Priority": "Low", "DueDate": null, "Status": "Resolved", "Verbatim": "Thanks for the quick turnaround on the iOS compliance issue.", "DetectedBy": "AI classifier", "_account": "Lamna Healthcare", "IsOpen": false}, {"Title": "Workaround document for TPM attestation failures", "SignalType": "Additional Request", "CaseId": "2609180050001601", "Source": "Case email", "ReceivedOn": "2026-09-25T09:00:00+03:00", "CustomerContact": "Workplace Lead", "Category": null, "RequestType": "Action plan / documentation", "Priority": "Medium", "DueDate": "2026-10-02", "Status": "In Progress", "Verbatim": "Can Microsoft share a workaround document for TPM attestation failures?", "DetectedBy": "Keyword rules", "_account": "Adatum Automotive", "IsOpen": true}, {"Title": "Customer still waiting a week for licensing fix", "SignalType": "Complaint", "CaseId": "2609090050002102", "Source": "Case email", "ReceivedOn": "2026-09-23T09:05:00+03:00", "CustomerContact": "IT Manager", "Category": "Response time", "RequestType": null, "Priority": "Medium", "DueDate": "2026-09-24", "Status": "New", "Verbatim": "We are still waiting on this; we have had no response for a week.", "DetectedBy": "Keyword rules", "_account": "Wide World Importers", "IsOpen": true}, {"Title": "Best-practice guidance for Android Enterprise dedicated devices", "SignalType": "Additional Request", "CaseId": "2609150050001401", "Source": "Case email", "ReceivedOn": "2026-09-28T09:15:00+03:00", "CustomerContact": "Mobility Lead", "Category": null, "RequestType": "Best-practice guidance", "Priority": "Low", "DueDate": "2026-10-05", "Status": "New", "Verbatim": "Please share best-practice guidance for Android Enterprise dedicated devices.", "DetectedBy": "Keyword rules", "_account": "Northwind Logistics", "IsOpen": true}, {"Title": "Capacity-planning session for Azure Firewall", "SignalType": "Additional Request", "CaseId": "2609140050001901", "Source": "Case email", "ReceivedOn": "2026-09-29T11:05:00+03:00", "CustomerContact": "Network Architect", "Category": null, "RequestType": "Workshop / session", "Priority": "Medium", "DueDate": "2026-10-09", "Status": "New", "Verbatim": "Could we have a capacity-planning session for Azure Firewall?", "DetectedBy": "Keyword rules", "_account": "Relecloud Telecom", "IsOpen": true}, {"Title": "Meetings keep dropping before CEO town hall", "SignalType": "Complaint", "CaseId": "2609280050001101", "Source": "Case email", "ReceivedOn": "2026-09-29T09:32:00+03:00", "CustomerContact": "Collaboration Lead", "Category": "Resolution quality", "RequestType": null, "Priority": "Critical", "DueDate": "2026-09-30", "Status": "New", "Verbatim": "Meetings keep dropping and the CEO town hall is on Friday. We need this fixed now.", "DetectedBy": "AI classifier", "_account": "Contoso Holding", "IsOpen": true}, {"Title": "Postpone failover test to next month", "SignalType": "Additional Request", "CaseId": "2608250050001701", "Source": "Case email", "ReceivedOn": "2026-09-15T10:00:00+03:00", "CustomerContact": "IT Manager", "Category": null, "RequestType": "Other", "Priority": "Low", "DueDate": "2026-10-15", "Status": "Waiting on Customer", "Verbatim": "Can we postpone the failover test to next month?", "DetectedBy": "Keyword rules", "_account": "Litware Manufacturing", "IsOpen": true}, {"Title": "Renewal in ~60 days; evaluating support options", "SignalType": "Account Concern", "CaseId": null, "Source": "Meeting", "ReceivedOn": "2026-09-24T11:00:00+03:00", "CustomerContact": "IT Director", "Category": "Commercial / renewal", "RequestType": null, "Priority": "Medium", "DueDate": "2026-10-08", "Status": "New", "Verbatim": "We are reviewing our support model before renewal.", "DetectedBy": "CSM", "_account": "Northwind Logistics", "IsOpen": true}, {"Title": "Slow first response on backup case (resolved)", "SignalType": "Complaint", "CaseId": "2609020050001250", "Source": "Case email", "ReceivedOn": "2026-09-15T12:00:00+03:00", "CustomerContact": "Backup Admin", "Category": "Response time", "RequestType": null, "Priority": "Medium", "DueDate": "2026-09-16", "Status": "Resolved", "Verbatim": "It took too long to get the first response on our backup case.", "DetectedBy": "Keyword rules", "_account": "Woodgrove Bank", "IsOpen": false}], "CSCTEscalations": [{"Title": "Core banking cluster outage - Critical Situation", "CaseId": "2609300050001201", "Level": "L3 - Critical Situation Management", "Status": "Active", "ProposedOn": "2026-09-30T02:30:00+03:00", "ApprovedOn": "2026-09-30T02:35:00+03:00", "SubmittedOn": "2026-09-30T02:35:00+03:00", "EngagedOn": "2026-09-30T02:45:00+03:00", "ClosedOn": null, "MicrosoftContact": "CritSit Manager (on shift)", "BusinessImpact": "Core banking unavailable for the branch network; ~1,200 branch users affected.", "CustomerAsk": "Restore access, 2-hourly bridge updates, RCA within 5 business days.", "RdyImpact": true, "RdyTimeline": true, "RdyTechStatus": true, "RdyAsk": true, "RdyContacts": true, "RdyExecAware": true, "RdyMgrApproval": true, "ReadinessPct": 100, "HoursToEngage": 0.25, "Outcome": "", "_account": "Woodgrove Bank", "_multi": {"TriggerRules": ["E1"]}, "IsOpen": true}, {"Title": "SCADA SQL timeouts blocked on Product Group", "CaseId": "2609030050001301", "Level": "L1 - Engineer's manager / Technical Advisor", "Status": "Pending Manager Approval", "ProposedOn": "2026-09-28T08:00:00+03:00", "ApprovedOn": null, "SubmittedOn": null, "EngagedOn": null, "ClosedOn": null, "MicrosoftContact": "", "BusinessImpact": "Operational reporting for 14 plants delayed; manual workarounds each morning.", "CustomerAsk": "PG hotfix decision and written action plan by Friday.", "RdyImpact": true, "RdyTimeline": true, "RdyTechStatus": true, "RdyAsk": true, "RdyContacts": true, "RdyExecAware": false, "RdyMgrApproval": false, "ReadinessPct": 71, "HoursToEngage": null, "Outcome": "", "_account": "Fabrikam Energy", "_multi": {"TriggerRules": ["E4", "E11"]}, "IsOpen": true}, {"Title": "Exchange hybrid migration failing for 3+ weeks", "CaseId": "2609040050002001", "Level": "L2 - Support escalation (duty manager / 24x7 Case Management)", "Status": "Submitted", "ProposedOn": "2026-09-28T11:00:00+03:00", "ApprovedOn": "2026-09-28T12:00:00+03:00", "SubmittedOn": "2026-09-29T09:00:00+03:00", "EngagedOn": null, "ClosedOn": null, "MicrosoftContact": "Support Escalation Manager (assigned)", "BusinessImpact": "3,500 mailboxes blocked from migration; CIO engaged; renewal at risk.", "CustomerAsk": "Senior engineer daily, root cause and migration plan within 48h.", "RdyImpact": true, "RdyTimeline": true, "RdyTechStatus": true, "RdyAsk": true, "RdyContacts": true, "RdyExecAware": true, "RdyMgrApproval": true, "ReadinessPct": 100, "HoursToEngage": null, "Outcome": "", "_account": "Humongous Insurance", "_multi": {"TriggerRules": ["E5", "E6"]}, "IsOpen": true}, {"Title": "Retention policy case - response delays", "CaseId": "2609010050001150", "Level": "L2 - Support escalation (duty manager / 24x7 Case Management)", "Status": "Closed", "ProposedOn": "2026-09-08T10:00:00+03:00", "ApprovedOn": "2026-09-08T11:00:00+03:00", "SubmittedOn": "2026-09-08T12:00:00+03:00", "EngagedOn": "2026-09-08T16:00:00+03:00", "ClosedOn": "2026-09-11T17:00:00+03:00", "MicrosoftContact": "Duty Manager", "BusinessImpact": "Legal hold compliance deadline at risk.", "CustomerAsk": "Engineer swap and daily updates.", "RdyImpact": true, "RdyTimeline": true, "RdyTechStatus": true, "RdyAsk": true, "RdyContacts": true, "RdyExecAware": true, "RdyMgrApproval": true, "ReadinessPct": 100, "HoursToEngage": 6.0, "Outcome": "Engineer swapped, daily updates agreed; resolved in 3 days.", "_account": "Contoso Holding", "_multi": {"TriggerRules": ["E11"]}, "IsOpen": false}, {"Title": "Android enrollment raised to Sev A by mistake", "CaseId": "2609150050001401", "Level": "L3 - Critical Situation Management", "Status": "De-escalated", "ProposedOn": "2026-09-22T18:00:00+03:00", "ApprovedOn": "2026-09-22T18:05:00+03:00", "SubmittedOn": "2026-09-22T18:05:00+03:00", "EngagedOn": "2026-09-22T18:30:00+03:00", "ClosedOn": "2026-09-23T10:00:00+03:00", "MicrosoftContact": "CritSit Manager", "BusinessImpact": "Warehouse scanning partially impacted.", "CustomerAsk": "Confirm severity and continue at Sev B.", "RdyImpact": true, "RdyTimeline": true, "RdyTechStatus": true, "RdyAsk": true, "RdyContacts": true, "RdyExecAware": false, "RdyMgrApproval": true, "ReadinessPct": 86, "HoursToEngage": 0.5, "Outcome": "Severity reduced A to B; CritSit disengaged; engineer continues.", "_account": "Northwind Logistics", "_multi": {"TriggerRules": ["E1"]}, "IsOpen": false}]};

  // ------------------------------------------------------------------ runner
  const opts = Object.assign({ dryRun: false, seedConfig: true, seedDemo: false }, (typeof window !== "undefined" && window.CSCT_OPTIONS) || {});
  const log = (...a) => console.log("%c[CSCT]", "color:#b11f4b;font-weight:bold", ...a);
  const guessSite = () => {
    if (typeof window !== "undefined" && window.CSCT_SITE) { return window.CSCT_SITE.replace(/\/$/, ""); }
    const m = location.href.match(/^(https:\/\/[^/]+\/(?:sites|teams)\/[^/?#]+)/i);
    return m ? m[1] : location.origin;
  };
  let site = guessSite();
  let digest = null;
  const H = (extra) => Object.assign({ "Accept": "application/json;odata=verbose", "Content-Type": "application/json;odata=verbose" }, digest ? { "X-RequestDigest": digest } : {}, extra || {});
  async function call(method, path, body, extra) {
    const isWrite = method !== "GET";
    if (opts.dryRun && isWrite) { log("DRY-RUN", method, path, body ? JSON.stringify(body).slice(0, 160) : ""); return { ok: true, status: 200, json: {} }; }
    const r = await fetch(site + path, { method: method === "MERGE" ? "POST" : method, headers: H(method === "MERGE" ? Object.assign({ "X-HTTP-Method": "MERGE", "IF-MATCH": "*" }, extra || {}) : extra), body: body ? JSON.stringify(body) : undefined, credentials: "include" });
    let json = null; try { json = await r.json(); } catch (e) { json = null; }
    if (!r.ok && r.status !== 404) { throw new Error(method + " " + path + " -> " + r.status + " " + JSON.stringify(json && json.error ? json.error.message : json)); }
    return { ok: r.ok, status: r.status, json: json };
  }
  const q = (s) => encodeURIComponent(s.replace(/'/g, "''"));
  async function refreshDigest() {
    const r = await fetch(site + "/_api/contextinfo", { method: "POST", headers: { "Accept": "application/json;odata=verbose" }, credentials: "include" });
    if (!r.ok) { throw new Error("contextinfo failed (" + r.status + "). Open the target site first or set window.CSCT_SITE."); }
    const j = await r.json();
    digest = j.d.GetContextWebInformation.FormDigestValue;
    site = j.d.GetContextWebInformation.WebFullUrl.replace(/\/$/, "");
  }
  const listIds = {};
  async function ensureList(l) {
    let r = await call("GET", "/_api/web/lists/getbytitle('" + q(l.title) + "')?$select=Id,Title");
    if (r.status === 404) {
      r = await call("GET", "/_api/web/lists/getbytitle('" + q(l.url) + "')?$select=Id,Title");
    }
    if (r.status === 404) {
      log("Creating list", l.title);
      const c = await call("POST", "/_api/web/lists", { __metadata: { type: "SP.List" }, BaseTemplate: 100, Title: l.url, Description: l.description, AllowContentTypes: true, ContentTypesEnabled: false });
      listIds[l.url] = opts.dryRun ? "{DRYRUN-" + l.url + "}" : c.json.d.Id;
      await call("MERGE", "/_api/web/lists(guid'" + listIds[l.url] + "')", { __metadata: { type: "SP.List" }, Title: l.title, EnableVersioning: true });
      await call("MERGE", "/_api/web/lists(guid'" + listIds[l.url] + "')/fields/getbyinternalnameortitle('Title')", { __metadata: { type: "SP.Field" }, Title: l.titleDisplay });
    } else {
      listIds[l.url] = r.json.d.Id;
      if (r.json.d.Title !== l.title) { await call("MERGE", "/_api/web/lists(guid'" + listIds[l.url] + "')", { __metadata: { type: "SP.List" }, Title: l.title }); }
      log("List exists", l.title);
    }
  }
  async function ensureField(l, f) {
    const base = "/_api/web/lists(guid'" + listIds[l.url] + "')/fields";
    const r = await call("GET", base + "/getbyinternalnameortitle('" + f.name + "')?$select=InternalName");
    if (r.status !== 404 && !opts.dryRun) { return false; }
    const xml = f.xml.replace(/\{\{LIST:([A-Za-z]+)\}\}/, (m, u) => "{" + String(listIds[u]).replace(/[{}]/g, "") + "}");
    await call("POST", base + "/createfieldasxml", { parameters: { __metadata: { type: "SP.XmlSchemaFieldCreationInformation" }, SchemaXml: xml, Options: 8 } });
    if (f.indexed) { await call("MERGE", base + "/getbyinternalnameortitle('" + f.name + "')", { __metadata: { type: "SP.Field" }, Indexed: true }); }
    if (f.unique) { await call("MERGE", base + "/getbyinternalnameortitle('" + f.name + "')", { __metadata: { type: "SP.Field" }, EnforceUniqueValues: true }); }
    if (f.formatter) { await call("MERGE", base + "/getbyinternalnameortitle('" + f.name + "')", { __metadata: { type: "SP.Field" }, CustomFormatter: f.formatter }); }
    return true;
  }
  async function ensureView(l, v) {
    const base = "/_api/web/lists(guid'" + listIds[l.url] + "')/views";
    const r = await call("GET", base + "/getbytitle('" + q(v.title) + "')?$select=Id");
    if (r.status !== 404 && !opts.dryRun) { log("  view exists", v.title); return; }
    await call("POST", base, { __metadata: { type: "SP.View" }, Title: v.title, PersonalView: false, ViewQuery: v.query, RowLimit: 100, Paged: true });
    const vb = base + "/getbytitle('" + q(v.title) + "')";
    await call("POST", vb + "/viewfields/removeallviewfields");
    for (const fld of v.fields) { await call("POST", vb + "/viewfields/addviewfield('" + fld + "')"); }
    const patch = { __metadata: { type: "SP.View" } };
    if (v.default) { patch.DefaultView = true; }
    if (v.rowFormatter) { patch.CustomFormatter = v.rowFormatter; }
    if (v.default || v.rowFormatter) { await call("MERGE", vb, patch); }
    log("  view", v.title, v.default ? "(default)" : "");
  }
  async function entityType(url) {
    if (opts.dryRun) { return "SP.Data." + url + "ListItem"; }
    const r = await call("GET", "/_api/web/lists(guid'" + listIds[url] + "')?$select=ListItemEntityTypeFullName");
    return r.json.d.ListItemEntityTypeFullName;
  }
  async function addItems(url, rows, lookup) {
    const t = await entityType(url);
    const ids = {};
    for (const row of rows) {
      const body = { __metadata: { type: t } };
      Object.keys(row).forEach((k) => {
        if (k.charAt(0) === "_" || row[k] === null || row[k] === undefined || row[k] === "") { return; }
        body[k] = row[k];
      });
      if (row._account && lookup) { body.AccountId = lookup[row._account] || null; }
      if (row._multi) { Object.keys(row._multi).forEach((k) => { body[k] = { __metadata: { type: "Collection(Edm.String)" }, results: row._multi[k] }; }); }
      const r = await call("POST", "/_api/web/lists(guid'" + listIds[url] + "')/items", body);
      ids[row.Title] = opts.dryRun ? 1 : r.json.d.Id;
    }
    log("  seeded", rows.length, "items into", url);
    return ids;
  }

  log("Customer Success Control Tower provisioning v" + MANIFEST.version + (opts.dryRun ? " (dry run)" : ""));
  if (!opts.dryRun) { await refreshDigest(); }
  log("Target site:", site);
  for (const l of MANIFEST.lists) { await ensureList(l); }
  for (const l of MANIFEST.lists) {
    let n = 0;
    for (const f of l.fields) { if (await ensureField(l, f)) { n++; } }
    log(l.title + ": " + n + " column(s) created");
  }
  for (const l of MANIFEST.lists) { for (const v of l.views) { await ensureView(l, v); } }
  if (opts.seedConfig) {
    const existing = opts.dryRun ? { json: { d: { results: [] } } } : await call("GET", "/_api/web/lists(guid'" + listIds.CSCTConfig + "')/items?$select=Title&$top=500");
    const have = new Set((existing.json.d.results || []).map((x) => x.Title));
    await addItems("CSCTConfig", MANIFEST.config.filter((c) => !have.has(c.Title)));
  }
  if (opts.seedDemo) {
    const acc = await addItems("CSCTAccounts", DEMO.CSCTAccounts);
    await addItems("CSCTCases", DEMO.CSCTCases, acc);
    await addItems("CSCTSignals", DEMO.CSCTSignals, acc);
    await addItems("CSCTEscalations", DEMO.CSCTEscalations, acc);
  }
  log("Done. Lists:", MANIFEST.lists.map((l) => l.title).join(", "));
  return { site: site, lists: listIds };
})().then((r) => console.log("[CSCT] finished", r)).catch((e) => console.error("[CSCT] failed:", e));
