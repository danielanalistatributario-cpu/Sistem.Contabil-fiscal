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
  // Colunas opcionais que só algumas origens trazem (hoje, o SPED: CNPJ/CPF,
  // Fornecedor/Cliente, UF, CFOP...), indexadas pelo cabeçalho exato de
  // COLUNAS_MESTRE. Só viram coluna quando o usuário as marca.
  extras?: Record<string, string | number | Date | null>;
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

type CelulaValor = ExcelJS.CellValue;
type ColunaDef = {
  header: string;
  width: number;
  numFmt?: string;
  // true = coluna opcional vinda de ItemTributo.extras (fora do padrão)
  extra?: boolean;
  valor: (item: ItemTributo, produto: { codigo: string; descricao: string }) => CelulaValor;
};

const NUM_QTDE = '#,##0.0000';
const NUM_PERC = '0.00';

function extra(header: string, width: number, kind: 'texto' | 'numero' | 'data', numFmt?: string): ColunaDef {
  return {
    header,
    width,
    extra: true,
    numFmt: kind === 'data' ? 'dd/mm/yyyy' : numFmt,
    valor: (item) => {
      const v = item.extras?.[header];
      if (v === null || v === undefined || v === '') return AUSENTE;
      if (kind === 'texto') return String(v);
      return v as CelulaValor;
    },
  };
}

// Lista MESTRA, na ordem em que as colunas saem na planilha. As colunas
// "extra" ficam fora da exportação padrão (só aparecem quando marcadas) —
// assim a planilha que a Análise e Apuração Fiscal gera continua igual.
const COLUNAS_MESTRE: ColunaDef[] = [
  { header: 'Nota Fiscal', width: 16, valor: (i) => txt(i.numeroNf) },
  extra('Série', 8, 'texto'),
  extra('Modelo', 8, 'texto'),
  { header: 'Operação', width: 12, valor: (i) => txt(i.operacao) },
  extra('Emissão', 12, 'data'),
  extra('Data Entrada/Saída', 14, 'data'),
  extra('CNPJ/CPF', 20, 'texto'),
  extra('Fornecedor/Cliente', 40, 'texto'),
  extra('UF', 6, 'texto'),
  extra('Chave NF-e', 48, 'texto'),
  extra('Item', 7, 'texto'),
  extra('CFOP', 8, 'texto'),
  { header: 'Código do Produto', width: 16, valor: (_i, p) => p.codigo },
  { header: 'Descrição do Produto', width: 42, valor: (_i, p) => p.descricao },
  { header: 'N.C.M.', width: 14, valor: (i) => txt(i.ncm) },
  extra('Origem', 8, 'texto'),
  extra('Tipo do Item', 22, 'texto'),
  { header: 'TES', width: 10, valor: (i) => txt(i.tes) },
  extra('CST ICMS', 10, 'texto'),
  { header: 'CST PIS', width: 30, valor: (i) => txt(i.cstPis) },
  { header: 'Alíquota PIS', width: 13, valor: (i) => num(i.aliquotaPis) },
  { header: 'CST COFINS', width: 30, valor: (i) => txt(i.cstCofins) },
  { header: 'Alíquota COFINS', width: 15, valor: (i) => num(i.aliquotaCofins) },
  extra('Quantidade', 13, 'numero', NUM_QTDE),
  extra('Valor Unitário', 15, 'numero', NUM_VALOR),
  extra('Desconto', 13, 'numero', NUM_VALOR),
  extra('Frete', 13, 'numero', NUM_VALOR),
  extra('Despesas', 13, 'numero', NUM_VALOR),
  extra('Seguro', 13, 'numero', NUM_VALOR),
  { header: 'Total', width: 15, numFmt: NUM_VALOR, valor: (i) => num(i.total) },
  { header: 'Base de ICMS', width: 15, numFmt: NUM_VALOR, valor: (i) => num(i.baseIcms) },
  extra('Alíquota ICMS', 13, 'numero', NUM_PERC),
  { header: 'Valor do ICMS', width: 15, numFmt: NUM_VALOR, valor: (i) => num(i.valorIcms) },
  extra('Base ICMS Isento', 15, 'numero', NUM_VALOR),
  extra('Base ICMS Outros', 15, 'numero', NUM_VALOR),
  extra('Base ICMS Não Tributada', 17, 'numero', NUM_VALOR),
  { header: 'Base de PIS', width: 15, numFmt: NUM_VALOR, valor: (i) => num(i.basePis) },
  { header: 'Base de COFINS', width: 15, numFmt: NUM_VALOR, valor: (i) => num(i.baseCofins) },
  { header: 'Valor do PIS', width: 15, numFmt: NUM_VALOR, valor: (i) => num(i.valorPis) },
  { header: 'Valor da COFINS', width: 16, numFmt: NUM_VALOR, valor: (i) => num(i.valorCofins) },
  extra('CNPJ do Estabelecimento', 20, 'texto'),
];

// Cabeçalhos selecionáveis na exportação (pedido do usuário, 05/10/2026:
// escolher quais colunas exportar, inclusive Fornecedor e CNPJ/CPF).
// "Operação" e as colunas extras só existem na planilha quando a origem as
// traz (SPED) — ver `disponivel` em gerarExcelTributos.
export const COLUNAS_PLANILHA_TRIBUTOS: string[] = COLUNAS_MESTRE.map((c) => c.header);
// Layout original (padrão): tudo menos as colunas extras.
export const COLUNAS_PLANILHA_TRIBUTOS_PADRAO: string[] = COLUNAS_MESTRE.filter((c) => !c.extra).map((c) => c.header);
export const COLUNAS_PLANILHA_TRIBUTOS_EXTRAS: string[] = COLUNAS_MESTRE.filter((c) => c.extra).map((c) => c.header);

// Devolve Uint8Array (não Buffer, API só do Node) porque esta função roda
// tanto em rotas server-side (Análise Fiscal) quanto no navegador (Conversor
// SPED, que processa o arquivo localmente pra não estourar o limite de
// upload da Vercel — ver [[analise-apuracao-fiscal-modulo]]). Confirmado no
// navegador: workbook.xlsx.writeBuffer() já devolve um Uint8Array nesse
// ambiente. NextResponse e Blob aceitam Uint8Array direto, sem conversão.
export async function gerarExcelTributos(itens: ItemTributo[], tituloAba: string, colunasSelecionadas?: string[]): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(tituloAba.slice(0, 31));

  const temOperacao = itens.some((i) => (i.operacao || '').trim());
  const temExtras = itens.some((i) => i.extras && Object.keys(i.extras).length > 0);
  const disponivel = (c: ColunaDef) => (c.header === 'Operação' ? temOperacao : c.extra ? temExtras : true);

  // Sem seleção: layout original (colunas não-extras; Operação só se o
  // SPED a trouxe). Com seleção: o que foi marcado, na ordem da lista
  // mestra, ignorando o que a origem não tem. Seleção que não casa com
  // nenhuma coluna disponível volta ao padrão.
  const selecionadas = colunasSelecionadas ? new Set(colunasSelecionadas) : null;
  let colunas = COLUNAS_MESTRE.filter((c) => disponivel(c) && (selecionadas ? selecionadas.has(c.header) : !c.extra));
  if (colunas.length === 0) colunas = COLUNAS_MESTRE.filter((c) => disponivel(c) && !c.extra);

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
    const produto = resolverProduto(item);
    const row = sheet.getRow(linhaCabecalho + 1 + idx);
    const valores = colunas.map((c) => c.valor(item, produto));
    valores.forEach((v, colIdx) => {
      const cell = row.getCell(colIdx + 1);
      cell.value = v as ExcelJS.CellValue;
      const numFmt = colunas[colIdx].numFmt;
      if (numFmt && (typeof v === 'number' || v instanceof Date)) cell.numFmt = numFmt;
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
