-- The scheduler's duplicate check filters Notification by (companyId, href) once per
-- candidate reminder. Only (companyId, createdAt) was indexed, so each check scanned the
-- workspace's entire notification history.
CREATE INDEX "Notification_companyId_href_idx" ON "Notification"("companyId", "href");
