import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession, logActivity } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';

// Mesma limpeza em lote de src/app/api/analise-fiscal/apuracoes/limpar-antigas,
// lado Saída — é a tabela que mais pesa no banco (AnaliseFiscalSaidaItem,
// ~301MB de um total de 490MB no limite de 512MB do Neon).
function cutoffDate(diasParam: string | null): Date | null {
  const dias = parseInt(diasParam || '', 10);
  if (!Number.isFinite(dias) || dias <= 0) return null;
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d;
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  if (!canAccess(session.currentRole, 'analiseFiscal')) {
    return NextResponse.json({ error: 'Sem permissão para este módulo.' }, { status: 403 });
  }

  const cutoff = cutoffDate(req.nextUrl.searchParams.get('dias'));
  if (!cutoff) {
    return NextResponse.json({ error: 'Informe um número de dias válido (maior que zero).' }, { status: 400 });
  }

  const where = { companyId: session.currentCompanyId, processedAt: { lt: cutoff } };
  const [total, agregado] = await Promise.all([
    prisma.analiseFiscalSaidaApuracao.count({ where }),
    prisma.analiseFiscalSaidaApuracao.aggregate({ where, _sum: { totalLinhas: true } }),
  ]);

  return NextResponse.json({ total, totalLinhas: agregado._sum.totalLinhas || 0 });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  if (!canAccess(session.currentRole, 'analiseFiscal')) {
    return NextResponse.json({ error: 'Sem permissão para este módulo.' }, { status: 403 });
  }

  const cutoff = cutoffDate(req.nextUrl.searchParams.get('dias'));
  if (!cutoff) {
    return NextResponse.json({ error: 'Informe um número de dias válido (maior que zero).' }, { status: 400 });
  }

  const where = { companyId: session.currentCompanyId, processedAt: { lt: cutoff } };
  const { count } = await prisma.analiseFiscalSaidaApuracao.deleteMany({ where });

  await logActivity(session.id, 'LIMPOU_APURACOES_ANTIGAS_SAIDA', `${count} apuração(ões) excluída(s)`, session.currentCompanyId);

  return NextResponse.json({ excluidas: count });
}
