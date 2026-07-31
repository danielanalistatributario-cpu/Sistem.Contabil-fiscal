import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession, logActivity } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';
import { processarConciliacao, type BalanceteRow, type RazaoRow, type ExtratoRow } from '@/lib/conciliacao-rules';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  if (!canAccess(session.currentRole, 'conciliacao')) {
    return NextResponse.json({ error: 'Sem permissão para este módulo.' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const periodo = String(body?.periodo || '').trim() || '—';
  const balanceteRaw: BalanceteRow[] = Array.isArray(body?.balancete) ? body.balancete : [];
  const razaoRaw: (RazaoRow & { data: string | null })[] = Array.isArray(body?.razao) ? body.razao : [];
  const extratoRaw: (ExtratoRow & { data: string | null })[] | null = Array.isArray(body?.extrato) ? body.extrato : null;

  if (balanceteRaw.length === 0) {
    return NextResponse.json({ error: 'Nenhuma conta recebida do Balancete.' }, { status: 400 });
  }

  const razao: RazaoRow[] = razaoRaw.map((r) => ({ ...r, data: r.data ? new Date(r.data) : null }));
  const extrato: ExtratoRow[] | null = extratoRaw ? extratoRaw.map((e) => ({ ...e, data: e.data ? new Date(e.data) : null })) : null;

  // busca contas que já estavam sem movimentação em apurações anteriores, para o alerta de "saldo antigo parado"
  const apuracaoAnterior = await prisma.conciliacaoApuracao.findFirst({
    where: { companyId: session.currentCompanyId },
    orderBy: { processedAt: 'desc' },
    include: { contas: { where: { semMovimentacao: true }, select: { conta: true, mesesSemMovimentacao: true } } },
  });
  const mesesAnteriores: Record<string, number> = {};
  apuracaoAnterior?.contas.forEach((c) => {
    mesesAnteriores[c.conta] = c.mesesSemMovimentacao;
  });

  const { modo, contasAnalisadas, resultado } = processarConciliacao(balanceteRaw, razao, extrato, mesesAnteriores);

  if (resultado.length === 0) {
    return NextResponse.json({ error: 'Nenhuma conta encontrada para análise.' }, { status: 400 });
  }

  const totalContas = resultado.length;
  const contasConciliadas = resultado.filter((c) => c.status === 'CONCILIADA').length;
  const contasDivergentes = totalContas - contasConciliadas;
  const valorTotalDiferenca = resultado.reduce((s, c) => s + Math.abs(c.diferencaSaldo), 0);

  const apuracao = await prisma.conciliacaoApuracao.create({
    data: {
      companyId: session.currentCompanyId,
      periodo,
      modoAnalise: modo,
      contasAnalisadas: contasAnalisadas.length > 0 ? contasAnalisadas.join(', ') : null,
      totalContas,
      contasConciliadas,
      contasDivergentes,
      valorTotalDiferenca,
      contas: {
        create: resultado.map((c) => ({
          conta: c.conta,
          descricao: c.descricao || null,
          saldoInicial: c.saldoInicial,
          debitoBalancete: c.debitoBalancete,
          creditoBalancete: c.creditoBalancete,
          saldoFinalBalancete: c.saldoFinalBalancete,
          debitoRazao: c.debitoRazao,
          creditoRazao: c.creditoRazao,
          saldoCalculado: c.saldoCalculado,
          diferencaSaldo: c.diferencaSaldo,
          diferencaDebito: c.diferencaDebito,
          diferencaCredito: c.diferencaCredito,
          status: c.status,
          semMovimentacao: c.semMovimentacao,
          mesesSemMovimentacao: c.semMovimentacao ? (mesesAnteriores[c.conta] || 0) + 1 : 0,
          extratoSaldoFinal: c.extratoSaldoFinal,
          extratoDiferenca: c.extratoDiferenca,
          observacoes: c.observacoes.length > 0 ? c.observacoes.join('; ') : null,
          lancamentos: {
            create: c.lancamentosAlerta.map((l) => ({
              data: l.data,
              historico: l.historico || null,
              debito: l.debito,
              credito: l.credito,
              tipoAlerta: l.tipoAlerta,
            })),
          },
        })),
      },
    },
    include: { contas: { include: { lancamentos: true } } },
  });

  await logActivity(
    session.id,
    'PROCESSOU_CONCILIACAO',
    `Período ${periodo} — modo ${modo === 'BALANCETE' ? 'Balancete completo' : `conta(s): ${contasAnalisadas.join(', ')}`}, ${contasDivergentes} divergente(s)`,
    session.currentCompanyId
  );

  return NextResponse.json({ apuracao });
}
