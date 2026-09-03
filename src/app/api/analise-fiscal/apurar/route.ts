import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import * as XLSX from 'xlsx';
import { prisma } from '@/lib/db';
import { getSession, logActivity } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';
import { lerRelatorioEntradas } from '@/lib/analise-fiscal-reader';
import { apurarEntradas } from '@/lib/analise-fiscal-compute';
import { carregarTesMetadataPorCodigo, carregarCnpjsGrupo } from '@/lib/analise-fiscal-config-db';

export const runtime = 'nodejs';
// Relatórios reais chegam a milhares de linhas — o processamento pode
// passar dos 10s padrão da Vercel para Serverless Functions. Se o plano
// não permitir esse valor, a Vercel aplica o teto do plano automaticamente.
export const maxDuration = 60;

// O arquivo é lido e interpretado aqui no servidor (não mais no navegador)
// porque relatórios reais chegam a ~10 mil linhas — mandar isso como JSON
// já interpretado no corpo da requisição passa dos ~4,5 MB de limite de
// payload da Vercel para Serverless Functions; o .xlsx bruto, bem mais
// compacto, cabe tranquilamente.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  if (!canAccess(session.currentRole, 'analiseFiscal')) {
    return NextResponse.json({ error: 'Sem permissão para este módulo.' }, { status: 403 });
  }

  const formData = await req.formData().catch(() => null);
  const file = formData?.get('file') as File | null;
  const periodo = formData?.get('periodo') ? String(formData.get('periodo')).trim() : null;

  if (!file) {
    return NextResponse.json({ error: 'Envie o Relatório de Entradas (Excel/CSV) a ser analisado.' }, { status: 400 });
  }

  let aoa: unknown[][];
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null }) as unknown[][];
  } catch (err) {
    console.error('Falha ao ler o arquivo da Análise Fiscal:', err);
    return NextResponse.json({ error: 'Não foi possível ler o arquivo. Verifique se é um .xlsx/.csv válido.' }, { status: 400 });
  }

  const leitura = lerRelatorioEntradas(aoa);
  if (leitura.erro) {
    return NextResponse.json({ error: leitura.erro }, { status: 400 });
  }
  const linhas = leitura.rows;
  if (linhas.length === 0) {
    return NextResponse.json({ error: 'Nenhuma linha de dados encontrada no arquivo.' }, { status: 400 });
  }

  const company = await prisma.company.findUnique({ where: { id: session.currentCompanyId } });
  if (!company) {
    return NextResponse.json({ error: 'Empresa não encontrada.' }, { status: 400 });
  }

  const [tesMetadataPorCodigo, cnpjsGrupo] = await Promise.all([
    carregarTesMetadataPorCodigo(session.currentCompanyId),
    carregarCnpjsGrupo(session.currentCompanyId),
  ]);

  const { itens, resumo } = apurarEntradas(
    linhas,
    { ufDestino: company.ufDestino, aliquotaInterna: company.aliquotaInterna },
    { tesMetadataPorCodigo, cnpjsGrupo }
  );

  // Relatórios reais chegam a ~10 mil linhas — um create() com itens
  // aninhados vira uma inserção por linha (lento, alguns segundos a mais
  // do que o necessário e arriscando o tempo-limite da função na Vercel).
  // Geramos os ids aqui mesmo (em vez de deixar o banco gerar e devolver)
  // pra poder usar createMany, bem mais rápido, tanto pros itens quanto
  // pras divergências — sem precisar de uma volta ao banco só pra
  // descobrir o id de cada item antes de linkar as divergências.
  const apuracaoCriada = await prisma.analiseFiscalApuracao.create({
    data: {
      companyId: session.currentCompanyId,
      periodo,
      fileName: file.name || null,
      ...resumo,
      tesNovasEncontradas: resumo.tesNovasEncontradas.join(', ') || null,
    },
    select: { id: true },
  });

  const itensData = itens.map((item) => ({
    id: randomUUID(),
    apuracaoId: apuracaoCriada.id,
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

  if (itensData.length > 0) {
    await prisma.analiseFiscalItem.createMany({ data: itensData });
  }

  const divergenciasData = itens.flatMap((item, idx) =>
    item.divergencias.map((d) => ({
      apuracaoId: apuracaoCriada.id,
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

  // seleciona só os campos que a tela realmente usa (linha, tabela de
  // divergências e exportação Excel) — apurações com muitos milhares de
  // itens senão geram uma resposta pesada desnecessariamente
  const apuracao = await prisma.analiseFiscalApuracao.findUnique({
    where: { id: apuracaoCriada.id },
    include: {
      itens: {
        orderBy: { linha: 'asc' },
        select: {
          id: true,
          linha: true,
          tes: true,
          tesConhecida: true,
          produtoCodigo: true,
          produtoDescricao: true,
          cfop: true,
          uf: true,
          fornecedor: true,
          cnpjCpf: true,
          chaveNf: true,
          numeroNf: true,
          divergencias: true,
        },
      },
    },
  });

  await logActivity(
    session.id,
    'PROCESSOU_ANALISE_FISCAL',
    `${resumo.totalLinhas} linha(s) — ${resumo.totalDivergencias} divergência(s) (${resumo.qtdCritico} crítica(s))`,
    session.currentCompanyId
  );

  return NextResponse.json({ apuracao });
}
