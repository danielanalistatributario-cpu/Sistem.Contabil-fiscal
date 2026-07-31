import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('admin123', 10);

  const company = await prisma.company.upsert({
    where: { cnpj: '12345678000199' },
    update: {},
    create: {
      name: 'Empresa Demonstração LTDA',
      cnpj: '12345678000199',
    },
  });

  const secondCompany = await prisma.company.upsert({
    where: { cnpj: '98765432000188' },
    update: {},
    create: {
      name: 'Filial Comércio Sul LTDA',
      cnpj: '98765432000188',
    },
  });

  const admin = await prisma.user.upsert({
    where: { email: 'admin@portalfiscal.com' },
    update: {},
    create: {
      name: 'Administrador do Portal',
      email: 'admin@portalfiscal.com',
      passwordHash,
    },
  });

  const analista = await prisma.user.upsert({
    where: { email: 'analista@portalfiscal.com' },
    update: {},
    create: {
      name: 'Ana Analista',
      email: 'analista@portalfiscal.com',
      passwordHash: await bcrypt.hash('analista123', 10),
    },
  });

  await prisma.membership.upsert({
    where: { userId_companyId: { userId: admin.id, companyId: company.id } },
    update: {},
    create: { userId: admin.id, companyId: company.id, role: 'ADMINISTRADOR' },
  });
  await prisma.membership.upsert({
    where: { userId_companyId: { userId: admin.id, companyId: secondCompany.id } },
    update: {},
    create: { userId: admin.id, companyId: secondCompany.id, role: 'ADMINISTRADOR' },
  });
  await prisma.membership.upsert({
    where: { userId_companyId: { userId: analista.id, companyId: company.id } },
    update: {},
    create: { userId: analista.id, companyId: company.id, role: 'ANALISTA' },
  });

  console.log('Seed concluído:');
  console.log('  Admin: admin@portalfiscal.com / admin123');
  console.log('  Analista: analista@portalfiscal.com / analista123');
  console.log(`  Empresas: ${company.name}, ${secondCompany.name}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
