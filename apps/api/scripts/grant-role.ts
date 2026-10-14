// Grants a role to an existing user from the server console, e.g. to create
// the first SUPER_ADMIN:  pnpm --filter @uzgo/api user:grant-role +998901234567 SUPER_ADMIN
// The user must have logged in once (OTP). The change is written to the audit log.
import { existsSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { Role } from '../src/generated/prisma/enums.js';
import { normalizePhone } from '../src/auth/phone.js';

if (existsSync('.env') && process.env.NODE_ENV !== 'production') process.loadEnvFile('.env');

const [phoneArg, roleArg] = process.argv.slice(2);
const phone = phoneArg ? normalizePhone(phoneArg) : null;
const role = Object.values(Role).find((r) => r === roleArg);
if (!phone || !role) {
  console.error(`Usage: user:grant-role <phone> <${Object.values(Role).join('|')}>`);
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

try {
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { phone }, select: { id: true } });
    if (!user) throw new Error('No user with this phone. Log in once with OTP first.');
    await tx.userRole.upsert({
      where: { userId_role: { userId: user.id, role } },
      create: { userId: user.id, role },
      update: {},
    });
    await tx.auditEvent.create({
      data: {
        action: 'role.granted',
        entityType: 'User',
        entityId: user.id,
        metadata: { role, via: 'cli' },
      },
    });
  });
  console.log(`[grant-role] ${role} granted`);
} finally {
  await prisma.$disconnect();
}
