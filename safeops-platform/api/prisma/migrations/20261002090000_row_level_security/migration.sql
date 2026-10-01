-- Row-level security: tenant isolation enforced by the database as well as the application.
--
-- Every service already checks the caller's company before it queries, and an HTTP probe of
-- all 294 routes found no way across. This is the second line: if a future change forgets
-- that check, Postgres still returns only rows of companies the session belongs to.
--
-- How a session says which companies those are: the API sets two transaction-local
-- settings before each query (see lib/prisma.ts and lib/tenantContext.ts):
--   safeops.company_ids   comma-separated company ids from the signed-in caller's token
--   safeops.bypass_rls    'on' only for work that is cross-tenant by nature - the
--                         scheduler, the platform console, operator CLIs
-- With neither set, a policy matches nothing: a code path that forgot to say who it is
-- acting for reads no rows and cannot write any, rather than reading all of them.
--
-- Policies bind the restricted `safeops_app` login the service runs as (APP_DB_PASSWORD).
-- They do not bind a table's owner, which is deliberate: migrations, backups and restores
-- run as the owner and must see everything. That is also why this changes nothing until
-- APP_DB_PASSWORD is set.
--
-- Covered: the 35 tables that carry a companyId. Not covered, and still guarded by the
-- application alone:
--   Membership, Invitation, ApiKey, SecurityPolicy - read while signing in, redeeming an
--     invitation or checking an API key, before the caller's company is known;
--   child tables without a companyId (incident events, permit controls, ...) - reached
--     through a parent row the policy does cover.

CREATE OR REPLACE FUNCTION safeops_tenant_visible(company_id text) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('safeops.bypass_rls', true), '') = 'on'
      OR company_id = ANY (string_to_array(nullif(current_setting('safeops.company_ids', true), ''), ','))
$$;

ALTER TABLE "AdminAuditEntry" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AdminAuditEntry"
  USING (safeops_tenant_visible("companyId")) WITH CHECK (safeops_tenant_visible("companyId"));

ALTER TABLE "ApiUsageDay" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ApiUsageDay"
  USING (safeops_tenant_visible("companyId")) WITH CHECK (safeops_tenant_visible("companyId"));

ALTER TABLE "Asset" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Asset"
  USING (safeops_tenant_visible("companyId")) WITH CHECK (safeops_tenant_visible("companyId"));

ALTER TABLE "Audit" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Audit"
  USING (safeops_tenant_visible("companyId")) WITH CHECK (safeops_tenant_visible("companyId"));

ALTER TABLE "AuditTemplate" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AuditTemplate"
  USING (safeops_tenant_visible("companyId")) WITH CHECK (safeops_tenant_visible("companyId"));

ALTER TABLE "Backup" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Backup"
  USING (safeops_tenant_visible("companyId")) WITH CHECK (safeops_tenant_visible("companyId"));

ALTER TABLE "Certificate" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Certificate"
  USING (safeops_tenant_visible("companyId")) WITH CHECK (safeops_tenant_visible("companyId"));

ALTER TABLE "ComplianceDocument" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ComplianceDocument"
  USING (safeops_tenant_visible("companyId")) WITH CHECK (safeops_tenant_visible("companyId"));

ALTER TABLE "ComplianceObligation" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ComplianceObligation"
  USING (safeops_tenant_visible("companyId")) WITH CHECK (safeops_tenant_visible("companyId"));

ALTER TABLE "ConnectorConfig" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ConnectorConfig"
  USING (safeops_tenant_visible("companyId")) WITH CHECK (safeops_tenant_visible("companyId"));

ALTER TABLE "ContractorCompany" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ContractorCompany"
  USING (safeops_tenant_visible("companyId")) WITH CHECK (safeops_tenant_visible("companyId"));

ALTER TABLE "ContractorWorker" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ContractorWorker"
  USING (safeops_tenant_visible("companyId")) WITH CHECK (safeops_tenant_visible("companyId"));

ALTER TABLE "CorrectiveAction" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CorrectiveAction"
  USING (safeops_tenant_visible("companyId")) WITH CHECK (safeops_tenant_visible("companyId"));

ALTER TABLE "Counter" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Counter"
  USING (safeops_tenant_visible("companyId")) WITH CHECK (safeops_tenant_visible("companyId"));

ALTER TABLE "Employee" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Employee"
  USING (safeops_tenant_visible("companyId")) WITH CHECK (safeops_tenant_visible("companyId"));

ALTER TABLE "Incident" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Incident"
  USING (safeops_tenant_visible("companyId")) WITH CHECK (safeops_tenant_visible("companyId"));

ALTER TABLE "Inspection" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Inspection"
  USING (safeops_tenant_visible("companyId")) WITH CHECK (safeops_tenant_visible("companyId"));

ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Notification"
  USING (safeops_tenant_visible("companyId")) WITH CHECK (safeops_tenant_visible("companyId"));

ALTER TABLE "OrgConfigItem" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "OrgConfigItem"
  USING (safeops_tenant_visible("companyId")) WITH CHECK (safeops_tenant_visible("companyId"));

ALTER TABLE "OrgSettings" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "OrgSettings"
  USING (safeops_tenant_visible("companyId")) WITH CHECK (safeops_tenant_visible("companyId"));

ALTER TABLE "Permit" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Permit"
  USING (safeops_tenant_visible("companyId")) WITH CHECK (safeops_tenant_visible("companyId"));

ALTER TABLE "PpeIssue" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PpeIssue"
  USING (safeops_tenant_visible("companyId")) WITH CHECK (safeops_tenant_visible("companyId"));

ALTER TABLE "Project" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Project"
  USING (safeops_tenant_visible("companyId")) WITH CHECK (safeops_tenant_visible("companyId"));

ALTER TABLE "ReportRun" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ReportRun"
  USING (safeops_tenant_visible("companyId")) WITH CHECK (safeops_tenant_visible("companyId"));

ALTER TABLE "ReportSchedule" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ReportSchedule"
  USING (safeops_tenant_visible("companyId")) WITH CHECK (safeops_tenant_visible("companyId"));

ALTER TABLE "RetentionPolicy" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "RetentionPolicy"
  USING (safeops_tenant_visible("companyId")) WITH CHECK (safeops_tenant_visible("companyId"));

ALTER TABLE "RoleDefinition" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "RoleDefinition"
  USING (safeops_tenant_visible("companyId")) WITH CHECK (safeops_tenant_visible("companyId"));

ALTER TABLE "Site" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Site"
  USING (safeops_tenant_visible("companyId")) WITH CHECK (safeops_tenant_visible("companyId"));

ALTER TABLE "ToolboxMeeting" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ToolboxMeeting"
  USING (safeops_tenant_visible("companyId")) WITH CHECK (safeops_tenant_visible("companyId"));

ALTER TABLE "TrainingCourse" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "TrainingCourse"
  USING (safeops_tenant_visible("companyId")) WITH CHECK (safeops_tenant_visible("companyId"));

ALTER TABLE "TrainingSession" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "TrainingSession"
  USING (safeops_tenant_visible("companyId")) WITH CHECK (safeops_tenant_visible("companyId"));

ALTER TABLE "Visitor" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Visitor"
  USING (safeops_tenant_visible("companyId")) WITH CHECK (safeops_tenant_visible("companyId"));

ALTER TABLE "VisitorBlacklist" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "VisitorBlacklist"
  USING (safeops_tenant_visible("companyId")) WITH CHECK (safeops_tenant_visible("companyId"));

ALTER TABLE "Webhook" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Webhook"
  USING (safeops_tenant_visible("companyId")) WITH CHECK (safeops_tenant_visible("companyId"));

ALTER TABLE "WebhookDelivery" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "WebhookDelivery"
  USING (safeops_tenant_visible("companyId")) WITH CHECK (safeops_tenant_visible("companyId"));
