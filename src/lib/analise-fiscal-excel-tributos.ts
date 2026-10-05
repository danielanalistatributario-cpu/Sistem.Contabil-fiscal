// Planilha de conferência ICMS/PIS/COFINS por nota e produto — pedido
// explícito do usuário: relatório de Entradas OU Saídas já processado,
// uma linha por lançamento, com CST PIS/CST COFINS (campos que o
// sistema não lia até esta feature — ver [[analise-apuracao-fiscal-modulo]])
// e filtro automático em todas as colunas. Reaproveitada pelas rotas de
// Entrada e Saída (mesmo formato de linha nos dois).
//
// "Sem inventar informação": todo valor vem direto do que foi lido do
// relatório original — célula/coluna ausente vira "—", nunca um valor
// calculado ou assumido. Alíquotas saem exatamente como gravadas (sem
// tentar normalizar fração×percentual), porque essa planilha é conferência
// bruta, não uma regra de validação.

import ExcelJS from 'exceljs';
import { extrairCodigoProduto } from './analise-fiscal-tes-registry';

export type ItemTributo = {
  numeroNf: string | null;
  produtoDescricao?: string | null;
  // Código/descrição já separados na origem (ex: SPED, onde vêm em
  // campos distintos) — quando presentes, têm prioridade sobre
  // produtoDescricao (formato "código-descrição" do Protheus).
  codigoProduto?: string | null;
  descricaoProduto?: string | null;
  // Só vem preenchido quando a origem traz o dado (ex: SPED, registro 0200)
  // — Análise Fiscal não captura NCM hoje, então sai "—" nesse fluxo, sem
  // inventar valor.
  ncm?: string | null;
  // Entrada/Saída — só vem do SPED (IND_OPER do C100). A coluna só entra na
  // planilha quando algum item traz o dado; nas planilhas da Análise Fiscal
  // (relatório já separado por módulo em Entradas ou Saídas) fica de fora,
  // em vez de virar uma coluna inteira de "—".
  operacao?: string | null;
  tes: string;
  cstPis: string | null;
  aliquotaPis: number | null;
  cstCofins: string | null;
  aliquotaCofins: number | null;
  total: number | null;
  baseIcms: number | null;
  valorIcms: number | null;
  basePis: number | null;
  baseCofins: number | null;
  valorPis: number | null;
  valorCofins: number | null;
};

const NUM_VALOR = '_-* #,##0.00_-;\\-* #,##0.00_-;_-* "-"??_-;_-@_-';
const AUSENTE = '—';

function separarProduto(produtoDescricao: string | null): { codigo: string; descricao: string } {
  const texto = (produtoDescricao || '').trim();
  if (!texto) return { codigo: AUSENTE, descricao: AUSENTE };
  const codigo = extrairCodigoProduto(texto) || AUSENTE;
  const descricao = texto.replace(/^[\d.]+\s*-?\s*/, '').trim() || AUSENTE;
  return { codigo, descricao };
}

function txt(v: string | null | undefined): string {
  const s = (v ?? '').trim();
  return s || AUSENTE;
}

function resolverProduto(item: ItemTributo): { codigo: string; descricao: string } {
  if (item.codigoProduto !== undefined || item.descricaoProduto !== undefined) {
    return { codigo: txt(item.codigoProduto), descricao: txt(item.descricaoProduto) };
  }
  return separarProduto(item.produtoDescricao ?? null);
}

function num(v: number | null | undefined): number | string {
  return v === null || v === undefined ? AUSENTE : v;
}

const COLUNAS: { header: string; width: number; numFmt?: string }[] = [
  { header: 'Nota Fiscal', width: 16 },
  { header: 'Código do Produto', width: 16 },
  { header: 'Descrição do Produto', width: 42 },
  { header: 'N.C.M.', width: 14 },
  { header: 'TES', width: 10 },
  { header: 'CST PIS', width: 30 },
  { header: 'Alíquota PIS', width: 13 },
  { header: 'CST COFINS', width: 30 },
  { header: 'Alíquota COFINS', width: 15 },
  { header: 'Total', width: 15, numFmt: NUM_VALOR },
  { header: 'Base de ICMS', width: 15, numFmt: NUM_VALOR },
  { header: 'Valor do ICMS', width: 15, numFmt: NUM_VALOR },
  { header: 'Base de PIS', width: 15, numFmt: NUM_VALOR },
  { header: 'Base de COFINS', width: 15, numFmt: NUM_VALOR },
  { header: 'Valor do PIS', width: 15, numFmt: NUM_VALOR },
  { header: 'Valor da COFINS', width: 16, numFmt: NUM_VALOR },
];

const COLUNA_OPERACAO = { header: 'Operação', width: 12 };

// Cabeçalhos selecionáveis na exportação (pedido do usuário, 05/10/2026:
// escolher quais colunas da planilha exportar). "Operação" só existe na
// planilha quando a origem a traz (SPED) — ver temOperacao abaixo.
export const COLUNAS_PLANILHA_TRIBUTOS: string[] = [COLUNAS[0].header, COLUNA_OPERACAO.header, ...COLUNAS.slice(1).map((c) => c.header)];

// Devolve Uint8Array (não Buffer, API só do Node) porque esta função roda
// tanto em rotas server-side (Análise Fiscal) quanto no navegador (Conversor
// SPED, que processa o arquivo localmente pra não estourar o limite de
// upload da Vercel — ver [[analise-apuracao-fiscal-modulo]]). Confirmado no
// navegador: workbook.xlsx.writeBuffer() já devolve um Uint8Array nesse
// ambiente. NextResponse e Blob aceitam Uint8Array direto, sem conversão.
export async function gerarExcelTributos(itens: ItemTributo[], tituloAba: string, colunasSelecionadas?: string[]): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(tituloAba.slice(0, 31));

  // Operação entra logo depois de "Nota Fiscal", só se algum item a trouxer.
  const temOperacao = itens.some((i) => (i.operacao || '').trim());
  const todasColunas: { header: string; width: number; numFmt?: string }[] = temOperacao
    ? [COLUNAS[0], COLUNA_OPERACAO, ...COLUNAS.slice(1)]
    : COLUNAS;

  // Subconjunto escolhido pelo usuário (ordem original preservada). Sem
  // seleção, ou seleção que não casa com nenhuma coluna, exporta tudo.
  const selecionadas = colunasSelecionadas ? new Set(colunasSelecionadas) : null;
  let indices = todasColunas.map((_, i) => i).filter((i) => !selecionadas || selecionadas.has(todasColunas[i].header));
  if (indices.length === 0) indices = todasColunas.map((_, i) => i);
  const colunas = indices.map((i) => todasColunas[i]);

  sheet.columns = colunas.map((c) => ({ width: c.width }));

  // O aviso de CST só faz sentido se alguma coluna de CST foi exportada.
  const exportaCst = colunas.some((c) => c.header === 'CST PIS' || c.header === 'CST COFINS');
  const temAlgumCst = !exportaCst || itens.some((i) => (i.cstPis || '').trim() || (i.cstCofins || '').trim());

  let linhaCabecalho = 1;
  if (!temAlgumCst && itens.length > 0) {
    sheet.mergeCells(1, 1, 1, colunas.length);
    const aviso = sheet.getCell(1, 1);
    aviso.value = 'Este relatório de origem não trouxe as colunas CST PIS/CST COFINS — reprocesse com um arquivo que inclua essas colunas do Protheus pra preencher essas informações.';
    aviso.font = { italic: true, color: { argb: 'FF9C6500' } };
    aviso.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEB9C' } };
    aviso.alignment = { vertical: 'middle', wrapText: true };
    sheet.getRow(1).height = 30;
    linhaCabecalho = 2;
  }

  const headerRow = sheet.getRow(linhaCabecalho);
  colunas.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = c.header;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00753A' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  headerRow.height = 20;

  itens.forEach((item, idx) => {
    const { codigo, descricao } = resolverProduto(item);
    const row = sheet.getRow(linhaCabecalho + 1 + idx);
    const todosValores = [
      txt(item.numeroNf),
      ...(temOperacao ? [txt(item.operacao)] : []),
      codigo,
      descricao,
      txt(item.ncm),
      txt(item.tes),
      txt(item.cstPis),
      num(item.aliquotaPis),
      txt(item.cstCofins),
      num(item.aliquotaCofins),
      num(item.total),
      num(item.baseIcms),
      num(item.valorIcms),
      num(item.basePis),
      num(item.baseCofins),
      num(item.valorPis),
      num(item.valorCofins),
    ];
    const valores = indices.map((i) => todosValores[i]);
    valores.forEach((v, colIdx) => {
      const cell = row.getCell(colIdx + 1);
      cell.value = v as ExcelJS.CellValue;
      const numFmt = colunas[colIdx].numFmt;
      if (numFmt && typeof v === 'number') cell.numFmt = numFmt;
    });
  });

  if (itens.length > 0) {
    const ultimaLinha = linhaCabecalho + itens.length;
    sheet.autoFilter = {
      from: { row: linhaCabecalho, column: 1 },
      to: { row: ultimaLinha, column: colunas.length },
    };
  }
  sheet.views = [{ state: 'frozen', ySplit: linhaCabecalho }];

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}
