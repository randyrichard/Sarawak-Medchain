-- Organisation administration: sites, departments, user linkage and invitations.
--
-- Entirely additive. Every new column has a default that preserves current behaviour -
-- existing sites and departments come out active, which is what they are - and no column
-- is dropped or narrowed, so a rollback loses only the new fields.
--
-- ASCII only on purpose: this cluster is WIN1252.

-- Sites gain the details a real company records, plus a reversible off-switch. Sites are
-- never deleted: incidents, permits and assets point at them, and a site that stops
-- existing takes their history with it.
ALTER TABLE "Site" ADD COLUMN "code"         TEXT    NOT NULL DEFAULT '';
ALTER TABLE "Site" ADD COLUMN "address"      TEXT    NOT NULL DEFAULT '';
ALTER TABLE "Site" ADD COLUMN "contactName"  TEXT    NOT NULL DEFAULT '';
ALTER TABLE "Site" ADD COLUMN "contactPhone" TEXT    NOT NULL DEFAULT '';
ALTER TABLE "Site" ADD COLUMN "active"       BOOLEAN NOT NULL DEFAULT true;

-- Departments gain a code, an accountable manager and the same off-switch. The manager is
-- a real user rather than a typed-in name; SET NULL keeps the department readable if that
-- user is later removed.
ALTER TABLE "Department" ADD COLUMN "code"          TEXT    NOT NULL DEFAULT '';
ALTER TABLE "Department" ADD COLUMN "managerUserId" TEXT;
ALTER TABLE "Department" ADD COLUMN "active"        BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Department"
  ADD CONSTRAINT "Department_managerUserId_fkey"
  FOREIGN KEY ("managerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Department_siteId_active_idx" ON "Department"("siteId", "active");

-- The explicit link between an HSE employee record and a login. Nullable because most
-- workers never sign in, and unique because one login is one person.
ALTER TABLE "Employee" ADD COLUMN "userId" TEXT;
CREATE UNIQUE INDEX "Employee_userId_key" ON "Employee"("userId");
ALTER TABLE "Employee"
  ADD CONSTRAINT "Employee_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Invitations. Only the hash of the token is stored, exactly as password resets do: a
-- leaked database must not hand out working invitations.
CREATE TABLE "Invitation" (
  "id"           TEXT NOT NULL,
  "companyId"    TEXT NOT NULL,
  "email"        TEXT NOT NULL,
  "role"         "Role" NOT NULL,
  "siteIds"      TEXT[] DEFAULT ARRAY[]::TEXT[],
  "departmentId" TEXT,
  "tokenHash"    TEXT NOT NULL,
  "expiresAt"    TIMESTAMP(3) NOT NULL,
  "acceptedAt"   TIMESTAMP(3),
  "revokedAt"    TIMESTAMP(3),
  "revokedBy"    TEXT,
  "userId"       TEXT NOT NULL,
  "invitedBy"    TEXT NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Invitation_tokenHash_key"    ON "Invitation"("tokenHash");
CREATE INDEX        "Invitation_companyId_email_idx"     ON "Invitation"("companyId", "email");
CREATE INDEX        "Invitation_companyId_createdAt_idx" ON "Invitation"("companyId", "createdAt");
CREATE INDEX        "Invitation_userId_idx"              ON "Invitation"("userId");

ALTER TABLE "Invitation"
  ADD CONSTRAINT "Invitation_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Invitation"
  ADD CONSTRAINT "Invitation_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
