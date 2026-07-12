-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'STATE_ADMIN', 'HOSPITAL_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'EMPLOYER', 'PATIENT');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'PENDING', 'SUSPENDED', 'DISABLED');

-- CreateEnum
CREATE TYPE "FacilityType" AS ENUM ('HOSPITAL', 'CLINIC');

-- CreateEnum
CREATE TYPE "FacilityStatus" AS ENUM ('PENDING', 'APPROVED', 'SUSPENDED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DoctorStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'INACTIVE');

-- CreateEnum
CREATE TYPE "MCStatus" AS ENUM ('ACTIVE', 'REVOKED', 'AMENDED');

-- CreateEnum
CREATE TYPE "VerificationResult" AS ENUM ('VALID', 'INVALID', 'REVOKED', 'EXPIRED', 'TAMPERED');

-- CreateEnum
CREATE TYPE "FraudAlertType" AS ENUM ('DUPLICATE_MC', 'VOLUME_ANOMALY', 'SUSPENDED_FACILITY', 'INACTIVE_DOCTOR', 'HASH_MISMATCH', 'INVALID_MMC', 'GEO_ANOMALY', 'RATE_ABUSE');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'CONFIRMED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('LOGIN', 'LOGIN_FAILED', 'LOGOUT', 'TWO_FA_ENABLED', 'ISSUE_MC', 'REVOKE_MC', 'AMEND_MC', 'VERIFY_MC', 'DOWNLOAD_MC', 'SHARE_MC', 'REGISTER_FACILITY', 'APPROVE_FACILITY', 'REJECT_FACILITY', 'SUSPEND_FACILITY', 'REGISTER_DOCTOR', 'SUSPEND_DOCTOR', 'REINSTATE_DOCTOR', 'CREATE_USER', 'UPDATE_USER', 'CREATE_API_KEY', 'REVOKE_API_KEY', 'FRAUD_ALERT_RAISED', 'FRAUD_ALERT_REVIEWED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'SMS', 'PUSH', 'IN_APP');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "state" TEXT,
    "icEncrypted" TEXT,
    "icHash" TEXT,
    "totpSecretEncrypted" TEXT,
    "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "lastLoginIp" TEXT,
    "lastLoginCountry" TEXT,
    "facilityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY['verify:read']::TEXT[],
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Facility" (
    "id" TEXT NOT NULL,
    "type" "FacilityType" NOT NULL,
    "name" TEXT NOT NULL,
    "registrationNo" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "district" TEXT,
    "address" TEXT NOT NULL,
    "phone" TEXT,
    "status" "FacilityStatus" NOT NULL DEFAULT 'PENDING',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "suspendedAt" TIMESTAMP(3),
    "suspendReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Facility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Doctor" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mmcNumber" TEXT NOT NULL,
    "specialty" TEXT,
    "status" "DoctorStatus" NOT NULL DEFAULT 'ACTIVE',
    "facilityId" TEXT NOT NULL,
    "signingPublicKey" TEXT NOT NULL,
    "signingKeyEncrypted" TEXT NOT NULL,
    "suspendedAt" TIMESTAMP(3),
    "suspendReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Doctor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicalCertificate" (
    "id" TEXT NOT NULL,
    "mcNumber" TEXT NOT NULL,
    "patientName" TEXT NOT NULL,
    "patientIcEncrypted" TEXT NOT NULL,
    "patientIcHash" TEXT NOT NULL,
    "patientUserId" TEXT,
    "doctorId" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "diagnosisEncrypted" TEXT,
    "restDays" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "dateIssued" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "canonicalHash" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "signerKeyId" TEXT NOT NULL,
    "anchored" BOOLEAN NOT NULL DEFAULT false,
    "chainTxHash" TEXT,
    "chainBlock" INTEGER,
    "chainTimestamp" TIMESTAMP(3),
    "status" "MCStatus" NOT NULL DEFAULT 'ACTIVE',
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "amendedFromId" TEXT,
    "amendReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MedicalCertificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShareToken" (
    "id" TEXT NOT NULL,
    "mcId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShareToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationEvent" (
    "id" TEXT NOT NULL,
    "mcId" TEXT,
    "hashQueried" TEXT NOT NULL,
    "result" "VerificationResult" NOT NULL,
    "verifierUserId" TEXT,
    "verifierType" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "country" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FraudAlert" (
    "id" TEXT NOT NULL,
    "type" "FraudAlertType" NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'OPEN',
    "mcId" TEXT,
    "doctorId" TEXT,
    "facilityId" TEXT,
    "userId" TEXT,
    "details" JSONB NOT NULL,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FraudAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "seq" BIGSERIAL NOT NULL,
    "actorId" TEXT,
    "actorRole" "Role",
    "action" "AuditAction" NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "meta" JSONB,
    "prevHash" TEXT NOT NULL,
    "entryHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("seq")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'IN_APP',
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_icHash_key" ON "User"("icHash");

-- CreateIndex
CREATE INDEX "User_role_status_idx" ON "User"("role", "status");

-- CreateIndex
CREATE INDEX "User_facilityId_idx" ON "User"("facilityId");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "ApiKey_ownerUserId_idx" ON "ApiKey"("ownerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Facility_registrationNo_key" ON "Facility"("registrationNo");

-- CreateIndex
CREATE INDEX "Facility_status_state_idx" ON "Facility"("status", "state");

-- CreateIndex
CREATE INDEX "Facility_type_state_idx" ON "Facility"("type", "state");

-- CreateIndex
CREATE UNIQUE INDEX "Doctor_userId_key" ON "Doctor"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Doctor_mmcNumber_key" ON "Doctor"("mmcNumber");

-- CreateIndex
CREATE INDEX "Doctor_facilityId_status_idx" ON "Doctor"("facilityId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MedicalCertificate_mcNumber_key" ON "MedicalCertificate"("mcNumber");

-- CreateIndex
CREATE UNIQUE INDEX "MedicalCertificate_canonicalHash_key" ON "MedicalCertificate"("canonicalHash");

-- CreateIndex
CREATE UNIQUE INDEX "MedicalCertificate_amendedFromId_key" ON "MedicalCertificate"("amendedFromId");

-- CreateIndex
CREATE INDEX "MedicalCertificate_patientIcHash_idx" ON "MedicalCertificate"("patientIcHash");

-- CreateIndex
CREATE INDEX "MedicalCertificate_doctorId_dateIssued_idx" ON "MedicalCertificate"("doctorId", "dateIssued");

-- CreateIndex
CREATE INDEX "MedicalCertificate_facilityId_dateIssued_idx" ON "MedicalCertificate"("facilityId", "dateIssued");

-- CreateIndex
CREATE INDEX "MedicalCertificate_status_idx" ON "MedicalCertificate"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ShareToken_tokenHash_key" ON "ShareToken"("tokenHash");

-- CreateIndex
CREATE INDEX "ShareToken_mcId_idx" ON "ShareToken"("mcId");

-- CreateIndex
CREATE INDEX "VerificationEvent_mcId_idx" ON "VerificationEvent"("mcId");

-- CreateIndex
CREATE INDEX "VerificationEvent_result_createdAt_idx" ON "VerificationEvent"("result", "createdAt");

-- CreateIndex
CREATE INDEX "VerificationEvent_hashQueried_idx" ON "VerificationEvent"("hashQueried");

-- CreateIndex
CREATE INDEX "FraudAlert_status_severity_idx" ON "FraudAlert"("status", "severity");

-- CreateIndex
CREATE INDEX "FraudAlert_type_createdAt_idx" ON "FraudAlert"("type", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AuditLog_entryHash_key" ON "AuditLog"("entryHash");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Doctor" ADD CONSTRAINT "Doctor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Doctor" ADD CONSTRAINT "Doctor_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalCertificate" ADD CONSTRAINT "MedicalCertificate_patientUserId_fkey" FOREIGN KEY ("patientUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalCertificate" ADD CONSTRAINT "MedicalCertificate_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalCertificate" ADD CONSTRAINT "MedicalCertificate_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalCertificate" ADD CONSTRAINT "MedicalCertificate_amendedFromId_fkey" FOREIGN KEY ("amendedFromId") REFERENCES "MedicalCertificate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareToken" ADD CONSTRAINT "ShareToken_mcId_fkey" FOREIGN KEY ("mcId") REFERENCES "MedicalCertificate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationEvent" ADD CONSTRAINT "VerificationEvent_mcId_fkey" FOREIGN KEY ("mcId") REFERENCES "MedicalCertificate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
