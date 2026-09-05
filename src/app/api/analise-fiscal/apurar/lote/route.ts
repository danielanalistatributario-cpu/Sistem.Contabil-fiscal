import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';
import type { ItemApurado } from '@/lib/analise-fiscal-compute';

export const runtime = 'nodejs';
export const maxDuration = 30;

// Etapa 2 do fluxo em lotes: recebe um pedaço (~2000 linhas) dos itens já
// calculados no navegador e persiste via createMany — sem lógica de
// negócio aqui, só gravação. Chamada várias vezes em sequência pelo
// cliente até cobrir o arquivo inteiro.
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
  const itens: ItemApurado[] = Array.isArray(body?.itens) ? body.itens : [];

  if (!apuracaoId || itens.length === 0) {
    return NextResponse.json({ error: 'apuracaoId e itens são obrigatórios.' }, { status: 400 });
  }

  const apuracao = await prisma.analiseFiscalApuracao.findUnique({ where: { id: apuracaoId } });
  if (!apuracao || apuracao.companyId !== session.currentCompanyId) {
    return NextResponse.json({ error: 'Apuração não encontrada.' }, { status: 404 });
  }
  if (apuracao.status !== 'PROCESSANDO') {
    return NextResponse.json({ error: 'Esta apuração já foi finalizada — não é possível enviar mais lotes.' }, { status: 400 });
  }

  const itensData = itens.map((item) => ({
    id: randomUUID(),
    apuracaoId,
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
  }));

  await prisma.analiseFiscalItem.createMany({ data: itensData });

  const divergenciasData = itens.flatMap((item, idx) =>
    item.divergencias.map((d) => ({
      apuracaoId,
      itemId: itensData[idx].id,
      severidade: d.severidade,
      tipo: d.tipo,
      regraEsperada: d.regraEsperada,
      informacaoEncontrada: d.informacaoEncontrada,
      motivo: d.motivo,
      sugestaoCorrecao: d.sugestaoCorrecao || null,
    }))
  );

  if (divergenciasData.length > 0) {
    await prisma.analiseFiscalDivergencia.createMany({ data: divergenciasData });
  }

  return NextResponse.json({ ok: true, itensRecebidos: itensData.length });
}
