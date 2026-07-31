import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';

export async function GET() {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  if (!canAccess(session.currentRole, 'conciliacao')) {
    return NextResponse.json({ error: 'Sem permissão para este módulo.' }, { status: 403 });
  }

  const apuracoes = await prisma.conciliacaoApuracao.findMany({
    where: { companyId: session.currentCompanyId },
    orderBy: { processedAt: 'desc' },
    select: {
      id: true,
      periodo: true,
      modoAnalise: true,
      contasAnalisadas: true,
      totalContas: true,
      contasConciliadas: true,
      contasDivergentes: true,
      valorTotalDiferenca: true,
      processedAt: true,
    },
  });

  return NextResponse.json({ apuracoes });
}
