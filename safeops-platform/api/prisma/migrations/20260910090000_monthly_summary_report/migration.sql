-- A third report type: the month a site has just had, rather than what is outstanding now.
--
-- The two existing types both answer "what is owed today", which is what a Monday morning
-- needs and not what a month-end review needs. This one covers a closed calendar period,
-- which is why ReportData already carried periodStart - unused until now.
--
-- Adding a value to an enum is additive and reversible in practice: no existing row
-- changes, and nothing reads the new value until a schedule or a preview asks for it.
ALTER TYPE "ReportType" ADD VALUE IF NOT EXISTS 'monthly_summary';
