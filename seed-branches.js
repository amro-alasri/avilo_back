/**
 * seed-branches.js
 * تشغيل: node seed-branches.js
 * يقوم بإدخال فروع تجريبية
 */
import { PrismaClient } from './prisma/generated/prisma/client.js';

const prisma = new PrismaClient();

const branches = [
  { name: 'الفرع الرئيسي', manager: 'مدير الفرع', employees: 0, sales: '0.00 ر.س.' },
];

async function main() {
  let created = 0;
  let skipped = 0;

  for (const b of branches) {
    const existing = await prisma.branch.findFirst({ where: { name: b.name } });
    if (!existing) {
      await prisma.branch.create({ data: b });
      created++;
    } else {
      skipped++;
    }
  }

  console.log(`✅ Branches seed complete — Created: ${created} | Skipped: ${skipped}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
