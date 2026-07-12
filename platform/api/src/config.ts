import 'dotenv/config';

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

const isProd = process.env.NODE_ENV === 'production';

export const config = {
  isProd,
  port: Number(process.env.PORT ?? 3005),
  publicWebUrl: process.env.PUBLIC_WEB_URL ?? 'http://localhost:3000',
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim()),

  // JWT
  jwtSecret: required('JWT_SECRET', isProd ? undefined : 'dev-only-jwt-secret-change-me'),
  accessTokenTtl: '15m',
  refreshTokenTtlDays: 30,

  // AES-256-GCM data-encryption key (hex, 32 bytes). In production this is
  // delivered by AWS KMS / Secrets Manager, never a raw env literal.
  dataEncryptionKey: required(
    'DATA_ENCRYPTION_KEY',
    isProd ? undefined : '6f1d0e9b2c4a5d7e8f0a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60'
  ),
  // HMAC key for searchable digests of IC numbers
  searchHmacKey: required(
    'SEARCH_HMAC_KEY',
    isProd ? undefined : 'dev-only-hmac-key-change-me'
  ),

  // Blockchain anchoring — same live contract as the existing prototype
  chain: {
    enabled: (process.env.CHAIN_ENABLED ?? 'false') === 'true',
    rpcUrl: process.env.CHAIN_RPC_URL ?? 'https://ethereum-sepolia-rpc.publicnode.com',
    contractAddress:
      process.env.CHAIN_CONTRACT_ADDRESS ?? '0x52748C170EE85FF4f15E677b909f5c154F83e2CD',
    issuerPrivateKey: process.env.CHAIN_ISSUER_PRIVATE_KEY ?? '',
    explorerTxBase: process.env.CHAIN_EXPLORER_TX_BASE ?? 'https://sepolia.etherscan.io/tx/',
  },

  // Fraud-engine thresholds
  fraud: {
    maxMCsPerDoctorPerDay: Number(process.env.FRAUD_MAX_MC_PER_DOCTOR_PER_DAY ?? 60),
    volumeCriticalMultiplier: 3, // 3× the max ⇒ CRITICAL alert
  },

  rateLimit: {
    windowMs: 15 * 60 * 1000,
    maxGeneral: 300,
    maxAuth: 20,
    maxVerify: 120,
  },
} as const;
