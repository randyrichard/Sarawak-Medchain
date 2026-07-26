import { PrismaClient } from '@prisma/client'
import { env } from '../env.js'

export const prisma = new PrismaClient({
  // Never log query parameters in production — they contain credentials and PII.
  log: env.isProd ? ['warn', 'error'] : ['warn', 'error'],
})
