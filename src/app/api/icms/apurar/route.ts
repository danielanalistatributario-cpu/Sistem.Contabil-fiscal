import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession, logActivity } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';
import { processarApuracao, EntradaItemInput, PagasRowInput } from '@/lib/icms-rules';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  if (!canAccess(session.currentRole, 'icms')) {
    return NextResponse.json({ error: 'Sem permissão para este módulo.' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const periodo = String(body?.periodo || '').trim() || '—';
  const semPagamento = !!body?.semPagamento;
  const entradaItems: EntradaItemInput[] = Array.isArray(body?.entradaItems) ? body.entradaItems : [];
  const pagasRows: PagasRowInput[] = Array.isArray(body?.pagasRows) ? body.pagasRows : [];

  if (entradaItems.length === 0) {
    return NextResponse.json({ error: 'Nenhum item de entrada recebido.' }, { status: 400 });
  }
  if (!semPagamento && pagasRows.length === 0) {
    return NextResponse.json(
      { error: 'Nenhuma linha do relatório de pagamentos recebida, e a opção "sem pagamento no mês" não está marcada.' },
      { status: 400 }
    );
  }

  const resultado = processarApuracao(entradaItems, pagasRows, semPagamento);

  if (resultado.notas.length === 0) {
    return NextResponse.json(
      { error: 'Nenhum item com TES elegível (102,107,108,109,129,222,225) foi encontrado. Confira a coluna TES mapeada.' },
      { status: 400 }
    );
  }

  const apuracao = await prisma.icmsApuracao.create({
    data: {
      companyId: session.currentCompanyId,
      periodo,
      semPagamento,
      totalNF: resultado.totais.totalNF,
      qtdPagas: resultado.totais.qtdPagas,
      qtdPendentes: resultado.totais.qtdPendentes,
      valorPago: resultado.totais.valorPago,
      valorPendente: resultado.totais.valorPendente,
      itensConsiderados: resultado.totais.itensConsiderados,
      itensDesconsiderados: resultado.totais.itensDesconsiderados,
      qtdSemAliquota: resultado.totais.qtdSemAliquota,
      divergencias: resultado.totais.divergencias,
      notas: {
        create: resultado.notas.map((n) => ({
          docFiscal: n.docFiscal,
          fornecedor: n.fornecedor || null,
          cnpj: n.cnpj || null,
          uf: n.uf || null,
          filial: n.filial || null,
          produto: n.produto || null,
          ncm: n.ncm || null,
          tes: n.tes || null,
          chaveNfe: n.chaveNfe || null,
          dataEmissao: n.dataEmissao,
          base: n.base,
          valor: n.valor,
          status: n.status,
          valorPago: n.valorPago,
          dataPagamento: n.dataPagamento,
          divergencia: n.divergencia,
          itensSemAliquota: n.itensSemAliquota,
        })),
      },
    },
    include: { notas: true },
  });

  await logActivity(
    session.id,
    'PROCESSOU_APURACAO_ICMS',
    `Período ${periodo} — ${resultado.totais.totalNF} nota(s)`,
    session.currentCompanyId
  );

  return NextResponse.json({ apuracao });
}
