/**
 * Development / demo seed — creates one account per role plus an approved
 * hospital and clinic. All passwords: Emc-Demo-Pass1
 *
 * The actual seed logic lives in src/lib/seedDemo.ts so production platforms
 * without shell access can run it at boot via SEED_DEMO=true.
 */
import { prisma } from '../src/lib/prisma.js';
import { seedDemo } from '../src/lib/seedDemo.js';

seedDemo()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
