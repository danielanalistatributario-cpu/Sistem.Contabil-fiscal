import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';

export async function GET() {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  if (!canAccess(session.currentRole, 'analiseFiscal')) {
    return NextResponse.json({ error: 'Sem permissão para este módulo.' }, { status: 403 });
  }

  const apuracoes = await prisma.analiseFiscalSaidaApuracao.findMany({
    where: { companyId: session.currentCompanyId },
    orderBy: { processedAt: 'desc' },
    select: {
      id: true,
      periodo: true,
      fileName: true,
      status: true,
      totalLinhas: true,
      totalNotas: true,
      totalDivergencias: true,
      qtdCritico: true,
      qtdAlto: true,
      qtdMedio: true,
      qtdBaixo: true,
      qtdInformativo: true,
      qtdTesNovas: true,
      processedAt: true,
    },
  });

  return NextResponse.json({ apuracoes });
}
