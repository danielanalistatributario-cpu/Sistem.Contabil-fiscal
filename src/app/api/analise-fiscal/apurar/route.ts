import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession, logActivity } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';
import type { LinhaEntradaImportada } from '@/lib/analise-fiscal-reader';
import { apurarEntradas } from '@/lib/analise-fiscal-compute';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  if (!canAccess(session.currentRole, 'analiseFiscal')) {
    return NextResponse.json({ error: 'Sem permissão para este módulo.' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const periodo = body?.periodo ? String(body.periodo).trim() : null;
  const fileName = body?.fileName ? String(body.fileName).trim() : null;
  const linhas: LinhaEntradaImportada[] = Array.isArray(body?.linhas) ? body.linhas : [];

  if (linhas.length === 0) {
    return NextResponse.json({ error: 'Envie as linhas do Relatório de Entradas a serem analisadas.' }, { status: 400 });
  }

  const company = await prisma.company.findUnique({ where: { id: session.currentCompanyId } });
  if (!company) {
    return NextResponse.json({ error: 'Empresa não encontrada.' }, { status: 400 });
  }

  const { itens, resumo } = apurarEntradas(linhas, {
    ufDestino: company.ufDestino,
    aliquotaInterna: company.aliquotaInterna,
  });

  // Divergencia tem FK própria tanto pro item quanto pra apuração (denormalizado
  // de propósito, pra tela de divergências consultar sem join through item) —
  // como apuracaoId é FK pro avô (não o pai imediato), o nested-create do
  // Prisma não preenche sozinho, então criamos em duas etapas: primeiro
  // apuração+itens, depois as divergências em lote já com os dois IDs.
  const apuracaoCriada = await prisma.analiseFiscalApuracao.create({
    data: {
      companyId: session.currentCompanyId,
      periodo,
      fileName,
      ...resumo,
      tesNovasEncontradas: resumo.tesNovasEncontradas.join(', ') || null,
      itens: {
        create: itens.map((item) => ({
          linha: item.linha.linha,
          tes: item.linha.tes,
          tesConhecida: item.tesConhecida,
          produtoCodigo: item.linha.produtoCodigo || null,
          produtoDescricao: item.linha.produtoDescricao || null,
          cfop: item.linha.cfop || null,
          uf: item.linha.uf || null,
          fornecedor: item.linha.fornecedor || null,
          cnpjCpf: item.linha.cnpjCpf || null,
          chaveNf: item.linha.chaveNf || null,
          numeroNf: item.linha.numeroNf || null,
          total: item.linha.total,
          desconto: item.linha.desconto,
          frete: item.linha.frete,
          despesa: item.linha.despesa,
          seguro: item.linha.seguro,
          valorContabil: item.linha.valorContabil,
          baseIcms: item.linha.baseIcms,
          valorIcms: item.linha.valorIcms,
          aliquotaIcms: item.linha.aliquotaIcms,
          isento: item.linha.isento,
          baseOutros: item.linha.baseOutros,
          basePis: item.linha.basePis,
          valorPis: item.linha.valorPis,
          aliquotaPis: item.linha.aliquotaPis,
          baseCofins: item.linha.baseCofins,
          valorCofins: item.linha.valorCofins,
          aliquotaCofins: item.linha.aliquotaCofins,
        })),
      },
    },
    include: { itens: true },
  });

  const itemIdPorLinha = new Map(apuracaoCriada.itens.map((i) => [i.linha, i.id]));
  const divergenciasData = itens.flatMap((item) => {
    const itemId = itemIdPorLinha.get(item.linha.linha);
    if (!itemId) return [];
    return item.divergencias.map((d) => ({
      apuracaoId: apuracaoCriada.id,
      itemId,
      severidade: d.severidade,
      tipo: d.tipo,
      regraEsperada: d.regraEsperada,
      informacaoEncontrada: d.informacaoEncontrada,
      motivo: d.motivo,
      sugestaoCorrecao: d.sugestaoCorrecao || null,
    }));
  });

  if (divergenciasData.length > 0) {
    await prisma.analiseFiscalDivergencia.createMany({ data: divergenciasData });
  }

  const apuracao = await prisma.analiseFiscalApuracao.findUnique({
    where: { id: apuracaoCriada.id },
    include: { itens: { include: { divergencias: true } } },
  });

  await logActivity(
    session.id,
    'PROCESSOU_ANALISE_FISCAL',
    `${resumo.totalLinhas} linha(s) — ${resumo.totalDivergencias} divergência(s) (${resumo.qtdCritico} crítica(s))`,
    session.currentCompanyId
  );

  return NextResponse.json({ apuracao });
}
