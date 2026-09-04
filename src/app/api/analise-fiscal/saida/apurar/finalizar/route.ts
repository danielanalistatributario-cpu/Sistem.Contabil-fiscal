import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession, logActivity } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';

// Etapa 3 do fluxo em lotes: marca a apuração como concluída. O resumo já
// foi gravado inteiro na etapa 1 (calculado no navegador antes de
// qualquer lote ser enviado), então aqui não precisa agregar nada — só
// confirma que todos os lotes chegaram.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  if (!canAccess(session.currentRole, 'analiseFiscal')) {
    return NextResponse.json({ error: 'Sem permissão para este módulo.' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const apuracaoId = String(body?.apuracaoId || '');
  if (!apuracaoId) {
    return NextResponse.json({ error: 'apuracaoId é obrigatório.' }, { status: 400 });
  }

  const apuracao = await prisma.analiseFiscalSaidaApuracao.findUnique({ where: { id: apuracaoId } });
  if (!apuracao || apuracao.companyId !== session.currentCompanyId) {
    return NextResponse.json({ error: 'Apuração não encontrada.' }, { status: 404 });
  }

  const itensPersistidos = await prisma.analiseFiscalSaidaItem.count({ where: { apuracaoId } });
  if (itensPersistidos !== apuracao.totalLinhas) {
    return NextResponse.json(
      {
        error: `Nem todos os lotes chegaram (${itensPersistidos} de ${apuracao.totalLinhas} linhas persistidas) — tente novamente antes de finalizar.`,
      },
      { status: 400 }
    );
  }

  await prisma.analiseFiscalSaidaApuracao.update({ where: { id: apuracaoId }, data: { status: 'CONCLUIDA' } });

  await logActivity(
    session.id,
    'PROCESSOU_ANALISE_FISCAL_SAIDA',
    `${apuracao.fileName || apuracao.periodo || apuracaoId} — ${apuracao.totalLinhas} linha(s) — ${apuracao.totalDivergencias} divergência(s) (${apuracao.qtdCritico} crítica(s))`,
    session.currentCompanyId
  );

  return NextResponse.json({ ok: true });
}
