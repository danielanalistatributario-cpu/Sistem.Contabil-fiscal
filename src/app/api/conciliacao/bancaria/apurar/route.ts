import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession, logActivity } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';
import { processarConciliacaoBancaria, type LancamentoConta } from '@/lib/conciliacao-bancaria';

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
  const contaRazao = body?.contaRazao ? String(body.contaRazao).trim() : null;
  const saldoInicialInformado = body?.saldoInicial !== undefined && body?.saldoInicial !== null ? Number(body.saldoInicial) : null;
  const incluirAplicacaoAutomatica = body?.incluirAplicacaoAutomatica === true;
  const razaoRaw: (LancamentoConta & { data: string | null })[] = Array.isArray(body?.razao) ? body.razao : [];
  const extratoRaw: (LancamentoConta & { data: string | null })[] = Array.isArray(body?.extrato) ? body.extrato : [];

  if (razaoRaw.length === 0 || extratoRaw.length === 0) {
    return NextResponse.json({ error: 'Envie tanto o Razão quanto o Extrato Bancário.' }, { status: 400 });
  }

  const razao: LancamentoConta[] = razaoRaw.map((r) => ({ ...r, data: r.data ? new Date(r.data) : null }));
  const extrato: LancamentoConta[] = extratoRaw.map((e) => ({ ...e, data: e.data ? new Date(e.data) : null }));

  const resultado = processarConciliacaoBancaria(razao, extrato, saldoInicialInformado, { incluirAplicacaoAutomatica });

  const apuracao = await prisma.conciliacaoBancariaApuracao.create({
    data: {
      companyId: session.currentCompanyId,
      periodo,
      contaRazao,
      saldoInicial: resultado.saldoInicial,
      saldoFinalRazao: resultado.saldoFinalRazao,
      saldoFinalExtrato: resultado.saldoFinalExtrato,
      diferencaSaldoFinal: resultado.diferencaSaldoFinal,
      totalRazao: resultado.totais.totalRazao,
      totalExtrato: resultado.totais.totalExtrato,
      totalConciliados: resultado.totais.totalConciliados,
      totalPendentes: resultado.totais.totalPendentes,
      valorPendenteRazao: resultado.totais.valorPendenteRazao,
      valorPendenteExtrato: resultado.totais.valorPendenteExtrato,
      totalEntradaRazao: resultado.totais.totalEntradaRazao,
      totalSaidaRazao: resultado.totais.totalSaidaRazao,
      totalEntradaExtrato: resultado.totais.totalEntradaExtrato,
      totalSaidaExtrato: resultado.totais.totalSaidaExtrato,
      aplicacaoAutomaticaIncluida: incluirAplicacaoAutomatica,
      dias: {
        create: resultado.dias.map((d) => ({
          data: d.data,
          saldoRazao: d.saldoRazao,
          saldoExtrato: d.saldoExtrato,
          diferenca: d.diferenca,
        })),
      },
      itens: {
        create: resultado.itens.map((i) => ({
          origem: i.origem,
          data: i.data,
          historico: i.historico || null,
          valor: i.valor,
          status: i.status,
          grupoRef: i.grupoRef,
          duplicadoSuspeito: i.duplicadoSuspeito,
          observacao: i.observacao,
        })),
      },
    },
    include: { dias: true, itens: true },
  });

  await logActivity(
    session.id,
    'PROCESSOU_CONCILIACAO_BANCARIA',
    `Período ${periodo} — diferença de saldo final: R$ ${resultado.diferencaSaldoFinal.toFixed(2)}, ${resultado.totais.totalPendentes} pendente(s)`,
    session.currentCompanyId
  );

  return NextResponse.json({ apuracao });
}
