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

  // Facilities across states so national analytics are meaningful
  const moreFacilities = [
    {
      type: 'HOSPITAL' as const,
      name: 'Hospital Queen Elizabeth',
      registrationNo: 'KKM-HOSP-SBH-0003',
      state: 'Sabah',
      district: 'Kota Kinabalu',
      address: 'Karung Berkunci No. 2029, 88586 Kota Kinabalu, Sabah',
    },
    {
      type: 'CLINIC' as const,
      name: 'Klinik Kesihatan Shah Alam Seksyen 7',
      registrationNo: 'KKM-KLINIK-SGR-0118',
      state: 'Selangor',
      district: 'Petaling',
      address: 'Persiaran Kayangan, Seksyen 7, 40000 Shah Alam, Selangor',
    },
    {
      type: 'HOSPITAL' as const,
      name: 'Hospital Pulau Pinang',
      registrationNo: 'KKM-HOSP-PNG-0002',
      state: 'Pulau Pinang',
      district: 'Timur Laut',
      address: 'Jalan Residensi, 10990 George Town, Pulau Pinang',
    },
  ];
  const extraFacilityIds: Record<string, string> = {};
  for (const f of moreFacilities) {
    const created = await prisma.facility.upsert({
      where: { registrationNo: f.registrationNo },
      update: {},
      create: { ...f, status: 'APPROVED', approvedAt: new Date() },
    });
    extraFacilityIds[f.registrationNo] = created.id;
  }

  // Doctors — one per facility, each with their own signing keypair
  const doctors = [
    { email: 'dr.tan@sgh.gov.my', fullName: 'Dr. Tan Wei Ming', mmc: 'MMC-45678', specialty: 'General Medicine', ic: '850505-13-1234', facilityId: hospital.id, state: 'Sarawak' },
    { email: 'dr.aminah@klinikpetrajaya.gov.my', fullName: 'Dr. Aminah binti Yusof', mmc: 'MMC-51203', specialty: 'Family Medicine', ic: '880712-13-5566', facilityId: clinic.id, state: 'Sarawak' },
    { email: 'dr.wong@hqe.gov.my', fullName: 'Dr. Wong Kai Lun', mmc: 'MMC-48891', specialty: 'Internal Medicine', ic: '830220-12-7788', facilityId: extraFacilityIds['KKM-HOSP-SBH-0003'], state: 'Sabah' },
    { email: 'dr.siti@kksa7.gov.my', fullName: 'Dr. Siti Nurhaliza binti Ahmad', mmc: 'MMC-53340', specialty: 'Family Medicine', ic: '900830-10-2244', facilityId: extraFacilityIds['KKM-KLINIK-SGR-0118'], state: 'Selangor' },
    { email: 'dr.raj@hpp.gov.my', fullName: 'Dr. Rajesh Kumar', mmc: 'MMC-46722', specialty: 'Occupational Health', ic: '860115-07-9911', facilityId: extraFacilityIds['KKM-HOSP-PNG-0002'], state: 'Pulau Pinang' },
  ];

  for (const d of doctors) {
    const existing = await prisma.user.findUnique({ where: { email: d.email } });
    if (existing) continue;
    const keys = generateDoctorKeyPair();
    const doctorUser = await prisma.user.create({
      data: {
        email: d.email,
        passwordHash,
        role: 'DOCTOR',
        fullName: d.fullName,
        facilityId: d.facilityId,
        state: d.state,
        icEncrypted: encryptField(d.ic),
        icHash: searchDigest(d.ic),
      },
    });
    await prisma.doctor.create({
      data: {
        userId: doctorUser.id,
        mmcNumber: d.mmc,
        specialty: d.specialty,
        facilityId: d.facilityId,
        signingPublicKey: keys.publicKeyPem,
        signingKeyEncrypted: keys.privateKeyEncrypted,
      },
    });
  }

  console.log(`[seed] demo data ready (password: ${DEMO_PASSWORD})`);
}
