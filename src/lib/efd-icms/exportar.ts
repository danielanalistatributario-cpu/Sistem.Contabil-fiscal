import type { ApuracaoE110, LinhaResumo, ResumoMensal, TotaisResumo } from './tipos';
import type { ConsolidadoAno } from './consolidar';
import type { LinhaDoc, TotaisDocs } from './documentos';
import { MODELO_DOC, ROTULOS_E110, SITUACAO_DOC, brl, fmtCnpj, fmtDataBr, rotuloMes, rotuloMesCurto } from './rotulos';

// Exportações (Excel e PDF), tudo no navegador. Cabeçalho com razão social,
// CNPJ, IE, período e identificação do relatório; paginação e totais no PDF;
// filtros, congelamento do cabeçalho e linha de totais (SUBTOTAL, que acompanha
// os filtros) no Excel.

export type MetaRelatorio = {
  empresa: { nome: string; cnpj: string; ie: string; uf: string };
  periodo: string; // "Janeiro/2016" ou "Exercício 2016 (12 meses)"
  titulo: string;
};

function baixar(dados: BlobPart, nome: string, tipo: string) {
  const url = URL.createObjectURL(new Blob([dados], { type: tipo }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
const nomeSeguro = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '_').slice(0, 90);

// ---------------------------------------------------------------------
// Excel
// ---------------------------------------------------------------------

type ExcelJSType = typeof import('exceljs');
type Sheet = import('exceljs').Worksheet;
type Wb = import('exceljs').Workbook;

const FMT_VALOR = '#,##0.00;[Red]-#,##0.00';
const VERDE = 'FF00753A';

async function novoWorkbook(): Promise<{ wb: Wb; ExcelJS: ExcelJSType }> {
  const ExcelJS = (await import('exceljs')) as unknown as ExcelJSType;
  const wb = new (ExcelJS as unknown as { Workbook: new () => Wb }).Workbook();
  wb.creator = 'Portal Fiscal e Contábil';
  wb.created = new Date();
  return { wb, ExcelJS };
}

function cabecalhoPlanilha(ws: Sheet, meta: MetaRelatorio, colunas: number): number {
  const linhas = [
    [meta.titulo],
    [`${meta.empresa.nome} — CNPJ ${fmtCnpj(meta.empresa.cnpj)} — IE ${meta.empresa.ie} — UF ${meta.empresa.uf}`],
    [`Período: ${meta.periodo}   ·   Gerado em ${new Date().toLocaleString('pt-BR')}`],
  ];
  linhas.forEach((l, i) => {
    const r = ws.getRow(i + 1);
    r.getCell(1).value = l[0];
    r.getCell(1).font = { bold: i === 0, size: i === 0 ? 13 : 10, color: { argb: i === 0 ? VERDE : 'FF444444' } };
    if (colunas > 1) ws.mergeCells(i + 1, 1, i + 1, Math.min(colunas, 12));
  });
  return 5; // linha do cabeçalho da tabela
}

type ColExcel = { titulo: string; largura: number; tipo?: 'valor' | 'texto' | 'data' | 'inteiro'; total?: boolean; valor: (l: any) => string | number | null };

function tabelaExcel<T>(ws: Sheet, meta: MetaRelatorio, colunas: ColExcel[], linhas: T[], totalRotulo = 'TOTAL') {
  const linhaCab = cabecalhoPlanilha(ws, meta, colunas.length);
  const cab = ws.getRow(linhaCab);
  colunas.forEach((c, i) => {
    const cell = cab.getCell(i + 1);
    cell.value = c.titulo;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    ws.getColumn(i + 1).width = c.largura;
  });
  cab.height = 30;
  linhas.forEach((l, idx) => {
    const row = ws.getRow(linhaCab + 1 + idx);
    colunas.forEach((c, i) => {
      const v = c.valor(l);
      const cell = row.getCell(i + 1);
      cell.value = v as never;
      if (c.tipo === 'valor' && typeof v === 'number') cell.numFmt = FMT_VALOR;
    });
  });
  const ultima = linhaCab + linhas.length;
  if (linhas.length > 0) {
    ws.autoFilter = { from: { row: linhaCab, column: 1 }, to: { row: ultima, column: colunas.length } };
    const tot = ws.getRow(ultima + 1);
    tot.getCell(1).value = totalRotulo;
    colunas.forEach((c, i) => {
      if (!c.total) return;
      const letra = ws.getColumn(i + 1).letter;
      const cell = tot.getCell(i + 1);
      cell.value = { formula: `SUBTOTAL(109,${letra}${linhaCab + 1}:${letra}${ultima})` } as never;
      cell.numFmt = c.tipo === 'inteiro' ? '#,##0' : FMT_VALOR;
    });
    tot.font = { bold: true };
    tot.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F3EC' } };
      cell.border = { top: { style: 'medium' } };
    });
  }
  ws.views = [{ state: 'frozen', ySplit: linhaCab }];
}

const COLS_DOCS: ColExcel[] = [
  { titulo: 'Mês', largura: 10, valor: (l: LinhaDoc) => rotuloMesCurto(l.ym) },
  { titulo: 'Data emissão', largura: 12, valor: (l: LinhaDoc) => fmtDataBr(l.dtDoc) },
  { titulo: 'Data entrada/saída', largura: 12, valor: (l: LinhaDoc) => fmtDataBr(l.dtES) },
  { titulo: 'Nº documento', largura: 13, valor: (l: LinhaDoc) => l.numero },
  { titulo: 'Série', largura: 7, valor: (l: LinhaDoc) => l.serie },
  { titulo: 'Modelo', largura: 8, valor: (l: LinhaDoc) => l.codMod },
  { titulo: 'Modelo (descrição)', largura: 18, valor: (l: LinhaDoc) => MODELO_DOC[l.codMod] ?? '' },
  { titulo: 'Situação', largura: 9, valor: (l: LinhaDoc) => l.sit },
  { titulo: 'Participante', largura: 38, valor: (l: LinhaDoc) => l.partNome },
  { titulo: 'CNPJ/CPF', largura: 19, valor: (l: LinhaDoc) => fmtCnpj(l.partDoc) },
  { titulo: 'UF', largura: 5, valor: (l: LinhaDoc) => l.partUf },
  { titulo: 'CFOP', largura: 8, valor: (l: LinhaDoc) => l.cfop },
  { titulo: 'CST ICMS', largura: 9, valor: (l: LinhaDoc) => l.cst },
  { titulo: 'Alíq. ICMS', largura: 9, tipo: 'valor', valor: (l: LinhaDoc) => l.aliq },
  { titulo: 'Valor da operação (CST/CFOP)', largura: 16, tipo: 'valor', total: true, valor: (l: LinhaDoc) => l.vlOpr },
  { titulo: 'Base de cálculo ICMS', largura: 16, tipo: 'valor', total: true, valor: (l: LinhaDoc) => l.vlBc },
  { titulo: 'Valor ICMS', largura: 14, tipo: 'valor', total: true, valor: (l: LinhaDoc) => l.vlIcms },
  { titulo: 'Base ICMS-ST', largura: 14, tipo: 'valor', total: true, valor: (l: LinhaDoc) => l.vlBcSt },
  { titulo: 'Valor ICMS-ST', largura: 14, tipo: 'valor', total: true, valor: (l: LinhaDoc) => l.vlIcmsSt },
  { titulo: 'Redução da base', largura: 14, tipo: 'valor', total: true, valor: (l: LinhaDoc) => l.vlRedBc },
  { titulo: 'IPI', largura: 11, tipo: 'valor', total: true, valor: (l: LinhaDoc) => l.vlIpi },
  { titulo: 'Valor produtos/serviços (doc.)', largura: 16, tipo: 'valor', total: true, valor: (l: LinhaDoc) => (l.primeira ? l.vlMerc : null) },
  { titulo: 'Frete (doc.)', largura: 12, tipo: 'valor', total: true, valor: (l: LinhaDoc) => (l.primeira ? l.vlFrt : null) },
  { titulo: 'Seguro (doc.)', largura: 12, tipo: 'valor', total: true, valor: (l: LinhaDoc) => (l.primeira ? l.vlSeg : null) },
  { titulo: 'Despesas (doc.)', largura: 12, tipo: 'valor', total: true, valor: (l: LinhaDoc) => (l.primeira ? l.vlOutDa : null) },
  { titulo: 'Desconto (doc.)', largura: 12, tipo: 'valor', total: true, valor: (l: LinhaDoc) => (l.primeira ? l.vlDesc : null) },
  { titulo: 'Valor contábil do documento', largura: 16, tipo: 'valor', total: true, valor: (l: LinhaDoc) => (l.primeira ? l.vlDoc : null) },
  { titulo: 'Chave de acesso', largura: 46, valor: (l: LinhaDoc) => l.chave },
];

const COLS_RESUMO: ColExcel[] = [
  { titulo: 'Situação', largura: 44, valor: (l: LinhaResumo) => `${l.sit} — ${SITUACAO_DOC[l.sit] ?? ''}` },
  { titulo: 'CST ICMS', largura: 10, valor: (l: LinhaResumo) => l.cst },
  { titulo: 'CFOP', largura: 9, valor: (l: LinhaResumo) => l.cfop },
  { titulo: 'Alíq. ICMS', largura: 10, tipo: 'valor', valor: (l: LinhaResumo) => l.aliq },
  { titulo: 'Documentos', largura: 12, tipo: 'inteiro', valor: (l: LinhaResumo) => l.docs },
  { titulo: 'Valor da operação', largura: 17, tipo: 'valor', total: true, valor: (l: LinhaResumo) => l.vlOpr },
  { titulo: 'Base de cálculo ICMS', largura: 17, tipo: 'valor', total: true, valor: (l: LinhaResumo) => l.vlBc },
  { titulo: 'Valor ICMS', largura: 15, tipo: 'valor', total: true, valor: (l: LinhaResumo) => l.vlIcms },
  { titulo: 'Base ICMS-ST', largura: 15, tipo: 'valor', total: true, valor: (l: LinhaResumo) => l.vlBcSt },
  { titulo: 'Valor ICMS-ST', largura: 15, tipo: 'valor', total: true, valor: (l: LinhaResumo) => l.vlIcmsSt },
  { titulo: 'Redução da base', largura: 15, tipo: 'valor', total: true, valor: (l: LinhaResumo) => l.vlRedBc },
  { titulo: 'IPI', largura: 12, tipo: 'valor', total: true, valor: (l: LinhaResumo) => l.vlIpi },
];

type AbaApuracao = { ym: string; e110: ApuracaoE110 | null }[];

function abaApuracao(ws: Sheet, meta: MetaRelatorio, meses: AbaApuracao, total: ApuracaoE110 | null) {
  const colunas: ColExcel[] = [{ titulo: 'Descrição', largura: 78, valor: (r: { rotulo: string }) => r.rotulo }];
  for (const m of meses) colunas.push({ titulo: meses.length > 1 ? rotuloMesCurto(m.ym) : 'Valor R$', largura: 15, tipo: 'valor', valor: (r: { campo: keyof ApuracaoE110 }) => m.e110?.[r.campo] ?? null });
  if (meses.length > 1 && total) colunas.push({ titulo: 'Exercício', largura: 16, tipo: 'valor', valor: (r: { campo: keyof ApuracaoE110 }) => total[r.campo] });
  const linhas = ROTULOS_E110.map((r) => ({ campo: r.campo as keyof ApuracaoE110, rotulo: r.rotulo }));
  const linhaCab = cabecalhoPlanilha(ws, meta, colunas.length);
  const cab = ws.getRow(linhaCab);
  colunas.forEach((c, i) => {
    const cell = cab.getCell(i + 1);
    cell.value = c.titulo;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE } };
    cell.alignment = { horizontal: 'center' };
    ws.getColumn(i + 1).width = c.largura;
  });
  linhas.forEach((l, idx) => {
    const row = ws.getRow(linhaCab + 1 + idx);
    colunas.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      const v = c.valor(l);
      cell.value = v as never;
      if (typeof v === 'number') cell.numFmt = FMT_VALOR;
      if (idx % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F3F2' } };
    });
  });
  ws.views = [{ state: 'frozen', ySplit: linhaCab, xSplit: 1 }];
  if (meses.length > 1) {
    const r = linhaCab + linhas.length + 2;
    ws.getRow(r).getCell(1).value = 'No exercício: saldo credor do período anterior = o do 1º mês; saldo credor a transportar = o do último mês; demais campos = soma dos meses.';
    ws.getRow(r).getCell(1).font = { italic: true, size: 9, color: { argb: 'FF666666' } };
  }
}

function abaAjustes(ws: Sheet, meta: MetaRelatorio, ajustes: { ym: string; cod: string; descr: string; valor: number; categoria: string }[], obrigacoes: { ym: string; cod: string; valor: number; vencimento: string | null; codReceita: string; mesRef: string; txt: string }[]) {
  tabelaExcel(
    ws,
    { ...meta, titulo: `${meta.titulo} — Ajustes da apuração (E111)` },
    [
      { titulo: 'Mês', largura: 10, valor: (a: any) => rotuloMesCurto(a.ym) },
      { titulo: 'Código do ajuste', largura: 14, valor: (a: any) => a.cod },
      { titulo: 'Tipo (pelo código)', largura: 28, valor: (a: any) => a.categoria },
      { titulo: 'Descrição complementar', largura: 80, valor: (a: any) => a.descr },
      { titulo: 'Valor do ajuste', largura: 16, tipo: 'valor', total: true, valor: (a: any) => a.valor },
    ],
    ajustes
  );
  const base = ws.rowCount + 3;
  ws.getRow(base).getCell(1).value = 'Obrigações do ICMS a recolher (E116)';
  ws.getRow(base).getCell(1).font = { bold: true, color: { argb: VERDE } };
  const cab = ['Mês', 'Código da obrigação', 'Valor', 'Vencimento', 'Cód. receita', 'Mês de referência', 'Informação complementar'];
  cab.forEach((t, i) => {
    const c = ws.getRow(base + 1).getCell(i + 1);
    c.value = t;
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE } };
  });
  obrigacoes.forEach((o, i) => {
    const r = ws.getRow(base + 2 + i);
    r.getCell(1).value = rotuloMesCurto(o.ym);
    r.getCell(2).value = o.cod;
    r.getCell(3).value = o.valor;
    r.getCell(3).numFmt = FMT_VALOR;
    r.getCell(4).value = fmtDataBr(o.vencimento);
    r.getCell(5).value = o.codReceita;
    r.getCell(6).value = o.mesRef;
    r.getCell(7).value = o.txt;
  });
}

export async function excelDocumentos(linhas: LinhaDoc[], meta: MetaRelatorio, nomeBase: string) {
  const { wb } = await novoWorkbook();
  const ws = wb.addWorksheet(meta.titulo.slice(0, 28));
  tabelaExcel(ws, meta, COLS_DOCS, linhas);
  baixar(await wb.xlsx.writeBuffer(), `${nomeSeguro(nomeBase)}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

export async function excelResumo(linhas: LinhaResumo[], meta: MetaRelatorio, nomeBase: string) {
  const { wb } = await novoWorkbook();
  const ws = wb.addWorksheet('Resumo CST x CFOP');
  tabelaExcel(ws, meta, COLS_RESUMO, linhas);
  baixar(await wb.xlsx.writeBuffer(), `${nomeSeguro(nomeBase)}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

export async function excelApuracao(resumos: ResumoMensal[], consolidado: ConsolidadoAno | null, meta: MetaRelatorio, nomeBase: string) {
  const { wb } = await novoWorkbook();
  abaApuracao(wb.addWorksheet('Apuração ICMS'), meta, resumos.map((r) => ({ ym: r.ym, e110: r.apuracao.e110 })), consolidado?.apuracao ?? null);
  const aj = resumos.flatMap((r) => r.apuracao.ajustes.map((a) => ({ ym: r.ym, ...a })));
  const ob = resumos.flatMap((r) => r.apuracao.obrigacoes.map((o) => ({ ym: r.ym, ...o })));
  abaAjustes(wb.addWorksheet('Ajustes e obrigações'), meta, aj, ob);
  baixar(await wb.xlsx.writeBuffer(), `${nomeSeguro(nomeBase)}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

// Excel completo: tudo que está na tela, em abas
export async function excelCompleto(args: { resumos: ResumoMensal[]; consolidado: ConsolidadoAno; entradas: LinhaDoc[] | null; saidas: LinhaDoc[] | null; meta: MetaRelatorio; nomeBase: string }) {
  const { resumos, consolidado, entradas, saidas, meta, nomeBase } = args;
  const { wb } = await novoWorkbook();
  const resumoMeta = (t: string) => ({ ...meta, titulo: t });
  tabelaExcel(wb.addWorksheet('Entradas - resumo'), resumoMeta(`${meta.titulo} — Entradas: resumo por CST/CFOP`), COLS_RESUMO, consolidado.entradas.linhas);
  tabelaExcel(wb.addWorksheet('Saídas - resumo'), resumoMeta(`${meta.titulo} — Saídas: resumo por CST/CFOP`), COLS_RESUMO, consolidado.saidas.linhas);
  abaApuracao(wb.addWorksheet('Apuração ICMS'), meta, resumos.map((r) => ({ ym: r.ym, e110: r.apuracao.e110 })), resumos.length > 1 ? consolidado.apuracao : null);
  abaAjustes(wb.addWorksheet('Ajustes e obrigações'), meta, consolidado.ajustes, consolidado.obrigacoes);
  tabelaExcel(
    wb.addWorksheet('Evolução mensal'),
    resumoMeta(`${meta.titulo} — Evolução mensal`),
    [
      { titulo: 'Mês', largura: 12, valor: (r: ResumoMensal) => rotuloMes(r.ym) },
      { titulo: 'Documentos de entrada', largura: 14, tipo: 'inteiro', total: true, valor: (r: ResumoMensal) => r.entradas.totais.docs },
      { titulo: 'Valor das entradas', largura: 18, tipo: 'valor', total: true, valor: (r: ResumoMensal) => r.entradas.totais.vlOpr },
      { titulo: 'Documentos de saída', largura: 14, tipo: 'inteiro', total: true, valor: (r: ResumoMensal) => r.saidas.totais.docs },
      { titulo: 'Valor das saídas', largura: 18, tipo: 'valor', total: true, valor: (r: ResumoMensal) => r.saidas.totais.vlOpr },
      { titulo: 'Créditos de ICMS (E110)', largura: 18, tipo: 'valor', total: true, valor: (r: ResumoMensal) => r.apuracao.e110?.vlTotCreditos ?? null },
      { titulo: 'Débitos de ICMS (E110)', largura: 18, tipo: 'valor', total: true, valor: (r: ResumoMensal) => r.apuracao.e110?.vlTotDebitos ?? null },
      { titulo: 'ICMS a recolher', largura: 16, tipo: 'valor', total: true, valor: (r: ResumoMensal) => r.apuracao.e110?.vlIcmsRecolher ?? null },
      { titulo: 'Saldo credor a transportar', largura: 18, tipo: 'valor', valor: (r: ResumoMensal) => r.apuracao.e110?.vlSldCredorTransportar ?? null },
    ],
    resumos
  );
  if (entradas) tabelaExcel(wb.addWorksheet('Entradas - documentos'), resumoMeta(`${meta.titulo} — Entradas: documentos`), COLS_DOCS, entradas);
  if (saidas) tabelaExcel(wb.addWorksheet('Saídas - documentos'), resumoMeta(`${meta.titulo} — Saídas: documentos`), COLS_DOCS, saidas);
  baixar(await wb.xlsx.writeBuffer(), `${nomeSeguro(nomeBase)}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

// ---------------------------------------------------------------------
// PDF (jsPDF) — A4 paisagem, cabeçalho em todas as páginas, paginação e totais
// ---------------------------------------------------------------------

type ColPdf = { t: string; w: number; a?: 'l' | 'r' | 'c' };
type TabelaPdf = { titulo?: string; colunas: ColPdf[]; linhas: string[][]; totais?: string[]; fonte?: number };

export async function gerarPdf(meta: MetaRelatorio, tabelas: TabelaPdf[], nomeBase: string, observacoes: string[] = []) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const LARG = 297, ALT = 210, MX = 8, TOPO = 24, RODAPE = 10;
  const util = LARG - MX * 2;
  let y = TOPO;

  const cabecalhoPagina = () => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(0, 117, 58);
    doc.text(meta.titulo, MX, 9);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(60);
    doc.text(`${meta.empresa.nome} — CNPJ ${fmtCnpj(meta.empresa.cnpj)} — Inscrição Estadual ${meta.empresa.ie} — UF ${meta.empresa.uf}`, MX, 14);
    doc.text(`Período: ${meta.periodo}`, MX, 18);
    doc.setDrawColor(0, 117, 58);
    doc.setLineWidth(0.4);
    doc.line(MX, 20, LARG - MX, 20);
    doc.setTextColor(0);
  };
  cabecalhoPagina();

  const cortar = (txt: string, larg: number): string => {
    if (doc.getTextWidth(txt) <= larg) return txt;
    let t = txt;
    while (t.length > 1 && doc.getTextWidth(t + '…') > larg) t = t.slice(0, -1);
    return t + '…';
  };

  for (const tb of tabelas) {
    const fonte = tb.fonte ?? 6.5;
    const somaW = tb.colunas.reduce((s, c) => s + c.w, 0);
    const larguras = tb.colunas.map((c) => (c.w / somaW) * util);
    const alturaLinha = fonte * 0.5 + 1.2;

    const desenharCab = () => {
      doc.setFillColor(0, 117, 58);
      doc.rect(MX, y, util, alturaLinha + 1.4, 'F');
      doc.setTextColor(255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(fonte);
      let x = MX;
      tb.colunas.forEach((c, i) => {
        const t = cortar(c.t, larguras[i] - 1.6);
        const tx = c.a === 'r' ? x + larguras[i] - 0.8 : c.a === 'c' ? x + larguras[i] / 2 : x + 0.8;
        doc.text(t, tx, y + alturaLinha - 0.2, { align: c.a === 'r' ? 'right' : c.a === 'c' ? 'center' : 'left' });
        x += larguras[i];
      });
      doc.setTextColor(0);
      doc.setFont('helvetica', 'normal');
      y += alturaLinha + 1.4;
    };
    const novaPagina = () => {
      doc.addPage();
      cabecalhoPagina();
      y = TOPO;
    };

    if (y + 20 > ALT - RODAPE) novaPagina();
    if (tb.titulo) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(0, 117, 58);
      doc.text(tb.titulo, MX, y + 2);
      doc.setTextColor(0);
      y += 5;
    }
    desenharCab();
    doc.setFontSize(fonte);

    const desenharLinha = (cels: string[], negrito = false, fundo?: [number, number, number]) => {
      if (y + alturaLinha > ALT - RODAPE) {
        novaPagina();
        desenharCab();
        doc.setFontSize(fonte);
      }
      if (fundo) {
        doc.setFillColor(...fundo);
        doc.rect(MX, y - 0.2, util, alturaLinha + 0.2, 'F');
      }
      doc.setFont('helvetica', negrito ? 'bold' : 'normal');
      let x = MX;
      cels.forEach((t, i) => {
        const c = tb.colunas[i];
        const texto = cortar(t ?? '', larguras[i] - 1.6);
        const tx = c.a === 'r' ? x + larguras[i] - 0.8 : c.a === 'c' ? x + larguras[i] / 2 : x + 0.8;
        doc.text(texto, tx, y + alturaLinha - 0.9, { align: c.a === 'r' ? 'right' : c.a === 'c' ? 'center' : 'left' });
        x += larguras[i];
      });
      y += alturaLinha;
    };

    tb.linhas.forEach((l, i) => desenharLinha(l, false, i % 2 === 1 ? [241, 243, 242] : undefined));
    if (tb.linhas.length === 0) desenharLinha(['Nenhum registro.', ...tb.colunas.slice(1).map(() => '')]);
    if (tb.totais) {
      doc.setDrawColor(0);
      doc.setLineWidth(0.3);
      doc.line(MX, y, LARG - MX, y);
      desenharLinha(tb.totais, true, [232, 243, 236]);
    }
    y += 6;
  }

  if (observacoes.length > 0) {
    if (y + 10 > ALT - RODAPE) {
      doc.addPage();
      cabecalhoPagina();
      y = TOPO;
    }
    doc.setFontSize(7);
    doc.setTextColor(90);
    for (const o of observacoes) {
      const partes = doc.splitTextToSize(o, util) as string[];
      for (const p of partes) {
        if (y + 4 > ALT - RODAPE) {
          doc.addPage();
          cabecalhoPagina();
          y = TOPO;
        }
        doc.text(p, MX, y);
        y += 3.4;
      }
    }
    doc.setTextColor(0);
  }

  const paginas = doc.getNumberOfPages();
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setTextColor(110);
    doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')} — Portal Fiscal e Contábil — dados do SPED Fiscal (EFD ICMS/IPI)`, MX, ALT - 4);
    doc.text(`Página ${p} de ${paginas}`, LARG - MX, ALT - 4, { align: 'right' });
  }
  doc.save(`${nomeSeguro(nomeBase)}.pdf`);
}

const v = (n: number | null | undefined) => brl(n);

export function tabelaPdfDocumentos(linhas: LinhaDoc[], t: TotaisDocs): TabelaPdf {
  return {
    fonte: 5.8,
    colunas: [
      { t: 'Mês', w: 8 },
      { t: 'Emissão', w: 11 },
      { t: 'Ent./Saída', w: 11 },
      { t: 'Nº doc.', w: 12 },
      { t: 'Sér.', w: 5 },
      { t: 'Mod.', w: 5 },
      { t: 'Sit.', w: 5 },
      { t: 'Participante', w: 36 },
      { t: 'CNPJ/CPF', w: 20 },
      { t: 'CFOP', w: 7 },
      { t: 'CST', w: 6 },
      { t: 'Alíq.', w: 6, a: 'r' },
      { t: 'Vl. operação', w: 14, a: 'r' },
      { t: 'BC ICMS', w: 14, a: 'r' },
      { t: 'ICMS', w: 12, a: 'r' },
      { t: 'ICMS-ST', w: 11, a: 'r' },
      { t: 'Frete/Desp./Seg.', w: 12, a: 'r' },
      { t: 'Vl. contábil doc.', w: 14, a: 'r' },
    ],
    linhas: linhas.map((l) => [
      rotuloMesCurto(l.ym),
      fmtDataBr(l.dtDoc),
      fmtDataBr(l.dtES),
      l.numero,
      l.serie,
      l.codMod,
      l.sit,
      l.partNome,
      fmtCnpj(l.partDoc),
      l.cfop,
      l.cst,
      l.aliq === null ? '' : brl(l.aliq),
      l.vlOpr ? v(l.vlOpr) : l.cfop ? v(0) : '',
      l.cfop ? v(l.vlBc) : '',
      l.cfop ? v(l.vlIcms) : '',
      l.vlIcmsSt ? v(l.vlIcmsSt) : '',
      l.primeira && l.vlFrt + l.vlOutDa + l.vlSeg ? v(l.vlFrt + l.vlOutDa + l.vlSeg) : '',
      l.primeira ? v(l.vlDoc) : '',
    ]),
    totais: ['TOTAL', '', '', `${t.docs} doc(s)`, '', '', '', '', '', '', '', '', v(t.vlOpr), v(t.vlBc), v(t.vlIcms), v(t.vlIcmsSt), v(t.vlFrt + t.vlOutDa + t.vlSeg), v(t.vlDoc)],
  };
}

export function tabelaPdfResumo(linhas: LinhaResumo[], t: TotaisResumo): TabelaPdf {
  return {
    fonte: 7,
    colunas: [
      { t: 'Situação', w: 40 },
      { t: 'CST', w: 8 },
      { t: 'CFOP', w: 9 },
      { t: 'Alíq. ICMS', w: 10, a: 'r' },
      { t: 'Docs', w: 8, a: 'r' },
      { t: 'Valor da operação', w: 18, a: 'r' },
      { t: 'Base de cálculo ICMS', w: 18, a: 'r' },
      { t: 'Valor ICMS', w: 15, a: 'r' },
      { t: 'Base ICMS-ST', w: 15, a: 'r' },
      { t: 'Valor ICMS-ST', w: 15, a: 'r' },
      { t: 'Red. base', w: 15, a: 'r' },
      { t: 'IPI', w: 12, a: 'r' },
    ],
    linhas: linhas.map((l) => [`${l.sit} — ${SITUACAO_DOC[l.sit] ?? ''}`, l.cst, l.cfop, brl(l.aliq), String(l.docs), v(l.vlOpr), v(l.vlBc), v(l.vlIcms), v(l.vlBcSt), v(l.vlIcmsSt), v(l.vlRedBc), v(l.vlIpi)]),
    totais: ['TOTAL', '', '', '', String(t.docsValidos), v(t.vlOpr), v(t.vlBc), v(t.vlIcms), v(t.vlBcSt), v(t.vlIcmsSt), '', v(t.vlIpi)],
  };
}

const ROTULO_CURTO: Record<string, string> = {
  vlTotDebitos: 'Saídas e prestações com débito do imposto',
  vlAjDebitos: 'Ajustes a débito (decorrentes do documento fiscal)',
  vlTotAjDebitos: 'Total dos ajustes a débito do imposto',
  vlEstornosCred: 'Estornos de créditos',
  vlTotCreditos: 'Créditos por entradas e aquisições',
  vlAjCreditos: 'Ajustes a crédito (decorrentes do documento fiscal)',
  vlTotAjCreditos: 'Total dos ajustes a crédito do imposto',
  vlEstornosDeb: 'Estornos de débitos',
  vlSldCredorAnt: 'Saldo credor do período anterior',
  vlSldApurado: 'Saldo devedor',
  vlTotDed: 'Deduções',
  vlIcmsRecolher: 'ICMS a recolher',
  vlSldCredorTransportar: 'Saldo credor a transportar',
  debEsp: 'Recolhidos ou a recolher, extra-apuração',
};

export function tabelasPdfApuracao(resumos: ResumoMensal[], consolidado: ConsolidadoAno | null): TabelaPdf[] {
  const meses = resumos.map((r) => ({ ym: r.ym, e: r.apuracao.e110 }));
  const anual = meses.length > 1;
  const tabelas: TabelaPdf[] = [];
  const colunas: ColPdf[] = [{ t: 'Descrição', w: anual ? 50 : 120 }, ...meses.map((m) => ({ t: anual ? rotuloMesCurto(m.ym) : 'Valor R$', w: anual ? 14 : 24, a: 'r' as const }))];
  if (anual) colunas.push({ t: 'Exercício', w: 16, a: 'r' });
  tabelas.push({
    titulo: anual ? 'Apuração do ICMS — operações próprias (mês a mês e exercício)' : 'Registros fiscais da apuração do ICMS — operações próprias',
    fonte: anual ? 6 : 8,
    colunas,
    linhas: ROTULOS_E110.map((r) => [
      anual ? ROTULO_CURTO[r.campo] : r.rotulo,
      ...meses.map((m) => (m.e ? v(m.e[r.campo as keyof ApuracaoE110]) : '—')),
      ...(anual && consolidado ? [v(consolidado.apuracao[r.campo as keyof ApuracaoE110])] : []),
    ]),
  });
  const aj = resumos.flatMap((r) => r.apuracao.ajustes.map((a) => ({ ym: r.ym, ...a })));
  if (aj.length > 0)
    tabelas.push({
      titulo: 'Ajustes da apuração (E111)',
      fonte: 7,
      colunas: [{ t: 'Mês', w: 12 }, { t: 'Código', w: 16 }, { t: 'Tipo (pelo código)', w: 32 }, { t: 'Descrição', w: 90 }, { t: 'Valor', w: 18, a: 'r' }],
      linhas: aj.map((a) => [rotuloMesCurto(a.ym), a.cod, a.categoria, a.descr, v(a.valor)]),
    });
  const ob = resumos.flatMap((r) => r.apuracao.obrigacoes.map((o) => ({ ym: r.ym, ...o })));
  if (ob.length > 0)
    tabelas.push({
      titulo: 'Obrigações do ICMS a recolher (E116)',
      fonte: 7,
      colunas: [{ t: 'Mês', w: 12 }, { t: 'Cód. obrigação', w: 16 }, { t: 'Valor', w: 18, a: 'r' }, { t: 'Vencimento', w: 18 }, { t: 'Cód. receita', w: 16 }, { t: 'Mês ref.', w: 14 }, { t: 'Informação complementar', w: 80 }],
      linhas: ob.map((o) => [rotuloMesCurto(o.ym), o.cod, v(o.valor), fmtDataBr(o.vencimento), o.codReceita, o.mesRef, o.txt]),
    });
  return tabelas;
}

export function tabelaPdfEvolucao(resumos: ResumoMensal[]): TabelaPdf {
  const soma = (f: (r: ResumoMensal) => number) => resumos.reduce((s, r) => s + f(r), 0);
  return {
    fonte: 7,
    colunas: [
      { t: 'Mês', w: 16 },
      { t: 'Docs entrada', w: 11, a: 'r' },
      { t: 'Valor das entradas', w: 20, a: 'r' },
      { t: 'Docs saída', w: 11, a: 'r' },
      { t: 'Valor das saídas', w: 20, a: 'r' },
      { t: 'Créditos ICMS', w: 18, a: 'r' },
      { t: 'Débitos ICMS', w: 18, a: 'r' },
      { t: 'ICMS a recolher', w: 18, a: 'r' },
      { t: 'Saldo credor a transportar', w: 20, a: 'r' },
    ],
    linhas: resumos.map((r) => [rotuloMes(r.ym), String(r.entradas.totais.docs), v(r.entradas.totais.vlOpr), String(r.saidas.totais.docs), v(r.saidas.totais.vlOpr), v(r.apuracao.e110?.vlTotCreditos), v(r.apuracao.e110?.vlTotDebitos), v(r.apuracao.e110?.vlIcmsRecolher), v(r.apuracao.e110?.vlSldCredorTransportar)]),
    totais: ['TOTAL', String(soma((r) => r.entradas.totais.docs)), v(soma((r) => r.entradas.totais.vlOpr)), String(soma((r) => r.saidas.totais.docs)), v(soma((r) => r.saidas.totais.vlOpr)), v(soma((r) => r.apuracao.e110?.vlTotCreditos ?? 0)), v(soma((r) => r.apuracao.e110?.vlTotDebitos ?? 0)), v(soma((r) => r.apuracao.e110?.vlIcmsRecolher ?? 0)), ''],
  };
}
