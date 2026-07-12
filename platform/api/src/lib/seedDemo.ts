import bcrypt from 'bcryptjs';
import { prisma } from './prisma.js';
import { encryptField, generateDoctorKeyPair, searchDigest } from './crypto.js';

export const DEMO_PASSWORD = 'Emc-Demo-Pass1';

/**
 * Idempotent demo seed: one account per role plus an approved hospital and
 * clinic. Used by `prisma/seed.ts` locally and — when `SEED_DEMO=true` — at
 * server boot on platforms without shell access (e.g. Render free tier).
 */
export async function seedDemo(): Promise<void> {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  const hospital = await prisma.facility.upsert({
    where: { registrationNo: 'KKM-HOSP-SWK-0001' },
    update: {},
    create: {
      type: 'HOSPITAL',
      name: 'Sarawak General Hospital',
      registrationNo: 'KKM-HOSP-SWK-0001',
      state: 'Sarawak',
      district: 'Kuching',
      address: 'Jalan Hospital, 93586 Kuching, Sarawak',
      status: 'APPROVED',
      approvedAt: new Date(),
    },
  });

  const clinic = await prisma.facility.upsert({
    where: { registrationNo: 'KKM-KLINIK-SWK-0042' },
    update: {},
    create: {
      type: 'CLINIC',
      name: 'Klinik Kesihatan Petra Jaya',
      registrationNo: 'KKM-KLINIK-SWK-0042',
      state: 'Sarawak',
      district: 'Kuching',
      address: 'Jalan Semarak, 93050 Petra Jaya, Kuching, Sarawak',
      status: 'APPROVED',
      approvedAt: new Date(),
    },
  });

  const users: Array<{
    email: string;
    role: 'SUPER_ADMIN' | 'STATE_ADMIN' | 'HOSPITAL_ADMIN' | 'CLINIC_ADMIN' | 'EMPLOYER' | 'PATIENT';
    fullName: string;
    facilityId?: string;
    state?: string;
    ic?: string;
  }> = [
    { email: 'kkm.admin@emc.gov.my', role: 'SUPER_ADMIN', fullName: 'KKM National Administrator' },
    { email: 'sarawak.admin@emc.gov.my', role: 'STATE_ADMIN', fullName: 'Sarawak State Health Administrator', state: 'Sarawak' },
    { email: 'sgh.admin@emc.gov.my', role: 'HOSPITAL_ADMIN', fullName: 'SGH Administrator', facilityId: hospital.id, state: 'Sarawak' },
    { email: 'klinik.admin@emc.gov.my', role: 'CLINIC_ADMIN', fullName: 'Klinik Petra Jaya Administrator', facilityId: clinic.id, state: 'Sarawak' },
    { email: 'employer@demo.com.my', role: 'EMPLOYER', fullName: 'Borneo Timber Sdn Bhd (HR)' },
    { email: 'patient@demo.com.my', role: 'PATIENT', fullName: 'Aisyah binti Rahman', ic: '990101-13-5678' },
  ];

  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        email: u.email,
        passwordHash,
        role: u.role,
        fullName: u.fullName,
        facilityId: u.facilityId,
        state: u.state,
        icEncrypted: u.ic ? encryptField(u.ic) : undefined,
        icHash: u.ic ? searchDigest(u.ic) : undefined,
      },
    });
  }

  const doctorEmail = 'dr.tan@sgh.gov.my';
  const existingDoctorUser = await prisma.user.findUnique({ where: { email: doctorEmail } });
  if (!existingDoctorUser) {
    const keys = generateDoctorKeyPair();
    const doctorUser = await prisma.user.create({
      data: {
        email: doctorEmail,
        passwordHash,
        role: 'DOCTOR',
        fullName: 'Dr. Tan Wei Ming',
        facilityId: hospital.id,
        state: 'Sarawak',
        icEncrypted: encryptField('850505-13-1234'),
        icHash: searchDigest('850505-13-1234'),
      },
    });
    await prisma.doctor.create({
      data: {
        userId: doctorUser.id,
        mmcNumber: 'MMC-45678',
        specialty: 'General Medicine',
        facilityId: hospital.id,
        signingPublicKey: keys.publicKeyPem,
        signingKeyEncrypted: keys.privateKeyEncrypted,
      },
    });
  }

  console.log(`[seed] demo data ready (password: ${DEMO_PASSWORD})`);
}
