import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession, logActivity } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';

// Limpeza em lote de apurações antigas de Análise de Entradas — pedido do
// usuário depois do banco (Neon, limite 512MB) ter recusado uma gravação
// real por falta de espaço (AnaliseFiscalItem sozinha já passava de 90MB).
// GET faz só a prévia (contagem/linhas), sem apagar nada; DELETE executa de
// fato. Cascade do schema (onDelete: Cascade em AnaliseFiscalItem/
// AnaliseFiscalDivergencia) cuida dos filhos; AnaliseFiscalApuracaoIcms que
// referenciar uma apuração apagada perde o vínculo (onDelete: SetNull),
// não é bloqueada.
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
    prisma.analiseFiscalApuracao.count({ where }),
    prisma.analiseFiscalApuracao.aggregate({ where, _sum: { totalLinhas: true } }),
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
  const { count } = await prisma.analiseFiscalApuracao.deleteMany({ where });

  await logActivity(session.id, 'LIMPOU_APURACOES_ANTIGAS_ENTRADA', `${count} apuração(ões) excluída(s)`, session.currentCompanyId);

  return NextResponse.json({ excluidas: count });
}
