import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession, logActivity } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';
import { montarResumoCompleto, sugerirSaldoCredorAnterior, LANCAMENTOS_PADRAO } from '@/lib/analise-fiscal-icms-apuracao';

export async function GET() {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  if (!canAccess(session.currentRole, 'analiseFiscal')) {
    return NextResponse.json({ error: 'Sem permissão para este módulo.' }, { status: 403 });
  }

  const apuracoes = await prisma.analiseFiscalApuracaoIcms.findMany({
    where: { companyId: session.currentCompanyId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      periodo: true,
      createdAt: true,
      entradaApuracaoId: true,
      saidaApuracaoId: true,
    },
  });

  const comSaldo = await Promise.all(
    apuracoes.map(async (a) => {
      const resumo = await montarResumoCompleto(a.id);
      return { ...a, resumo };
    })
  );

  return NextResponse.json({ apuracoes: comSaldo });
}

// Cria uma Apuração Fiscal já com os vínculos resolvidos (o front-end
// chama /candidatos antes pra descobrir/confirmar entradaApuracaoId e
// saidaApuracaoId — aqui só persiste). Semeia os 3 lançamentos padrão
// pedidos pelo usuário e sugere o saldo credor anterior a partir da
// apuração fiscal mais recente da empresa.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  if (!canAccess(session.currentRole, 'analiseFiscal')) {
    return NextResponse.json({ error: 'Sem permissão para este módulo.' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const periodo = String(body?.periodo || '').trim();
  const entradaApuracaoId: string | null = body?.entradaApuracaoId || null;
  const saidaApuracaoId: string | null = body?.saidaApuracaoId || null;

  if (!periodo) {
    return NextResponse.json({ error: 'Informe o período.' }, { status: 400 });
  }
  if (!entradaApuracaoId && !saidaApuracaoId) {
    return NextResponse.json({ error: 'Vincule pelo menos uma análise de Entradas ou de Saídas.' }, { status: 400 });
  }

  if (entradaApuracaoId) {
    const entrada = await prisma.analiseFiscalApuracao.findUnique({ where: { id: entradaApuracaoId }, select: { companyId: true } });
    if (!entrada || entrada.companyId !== session.currentCompanyId) {
      return NextResponse.json({ error: 'Análise de Entradas não encontrada.' }, { status: 404 });
    }
  }
  if (saidaApuracaoId) {
    const saida = await prisma.analiseFiscalSaidaApuracao.findUnique({ where: { id: saidaApuracaoId }, select: { companyId: true } });
    if (!saida || saida.companyId !== session.currentCompanyId) {
      return NextResponse.json({ error: 'Análise de Saídas não encontrada.' }, { status: 404 });
    }
  }

  const saldoCredorAnterior = await sugerirSaldoCredorAnterior(session.currentCompanyId);

  const apuracao = await prisma.analiseFiscalApuracaoIcms.create({
    data: {
      companyId: session.currentCompanyId,
      periodo,
      entradaApuracaoId,
      saidaApuracaoId,
      saldoCredorAnterior,
      lancamentos: { create: LANCAMENTOS_PADRAO },
    },
  });

  await logActivity(session.id, 'CRIOU_APURACAO_FISCAL', `Período: ${periodo}`, session.currentCompanyId);

  return NextResponse.json({ id: apuracao.id });
}
