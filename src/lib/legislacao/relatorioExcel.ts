import ExcelJS from 'exceljs';
import { ROTULO_MARCO, type ResultadoAnalise, type ResultadoComparacao, type Marco, type ItemComparacao } from '@/lib/legislacao/tipos';
import { fmtData, ehComparacao } from '@/lib/legislacao/formatar';

// Planilha da análise (prazos, alterações, impactos, códigos, base legal e checklist).

const VERDE = 'FF00753A';

function aba(wb: ExcelJS.Workbook, nome: string, colunas: { header: string; key: string; width: number }[], linhas: Record<string, unknown>[]) {
  const ws = wb.addWorksheet(nome);
  ws.columns = colunas;
  const cab = ws.getRow(1);
  cab.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  cab.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE } };
  cab.alignment = { vertical: 'middle' };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  for (const l of linhas) ws.addRow(l);
  ws.eachRow((row, n) => {
    if (n > 1) row.alignment = { vertical: 'top', wrapText: true };
  });
  if (linhas.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: colunas.length } };
  return ws;
}

const natureza = (n: string) => (n === 'expresso' ? 'Expresso' : 'Interpretação');

function abaPrazos(wb: ExcelJS.Workbook, nome: string, marcos: Marco[]) {
  aba(
    wb,
    nome,
    [
      { header: 'Data', key: 'data', width: 12 },
      { header: 'Como está no documento', key: 'dataTexto', width: 28 },
      { header: 'Tipo', key: 'tipo', width: 22 },
      { header: 'Descrição', key: 'descricao', width: 70 },
      { header: 'Página', key: 'pagina', width: 8 },
      { header: 'Dispositivo', key: 'dispositivo', width: 24 },
      { header: 'Trecho', key: 'trecho', width: 60 },
    ],
    marcos.map((m) => ({ data: fmtData(m.data), dataTexto: m.dataTexto, tipo: ROTULO_MARCO[m.tipo] ?? m.tipo, descricao: m.descricao, pagina: m.fonte.pagina || '', dispositivo: m.fonte.dispositivo, trecho: m.fonte.trecho }))
  );
}

function abaComparacao(wb: ExcelJS.Workbook, nome: string, itens: ItemComparacao[]) {
  aba(
    wb,
    nome,
    [
      { header: 'Descrição', key: 'descricao', width: 60 },
      { header: 'Antes (A)', key: 'antes', width: 45 },
      { header: 'Depois (B)', key: 'depois', width: 45 },
      { header: 'Página A', key: 'paginaA', width: 9 },
      { header: 'Página B', key: 'paginaB', width: 9 },
      { header: 'Natureza', key: 'natureza', width: 14 },
    ],
    itens.map((i) => ({ ...i, paginaA: i.paginaA || '', paginaB: i.paginaB || '', natureza: natureza(i.natureza) }))
  );
}

export async function gerarExcel(meta: { nomeArquivo: string; nomeArquivoB: string | null }, r: ResultadoAnalise | ResultadoComparacao, marcados: number[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Portal Fiscal e Contábil';

  if (ehComparacao(r)) {
    aba(wb, 'Resumo', [{ header: 'Campo', key: 'k', width: 24 }, { header: 'Valor', key: 'v', width: 100 }], [
      { k: 'Documento A', v: [meta.nomeArquivo, r.documentoA.titulo, r.documentoA.numero, r.documentoA.versao].filter(Boolean).join(' · ') },
      { k: 'Documento B', v: [meta.nomeArquivoB, r.documentoB.titulo, r.documentoB.numero, r.documentoB.versao].filter(Boolean).join(' · ') },
      { k: 'Relação', v: r.relacao },
      { k: 'Resumo', v: r.resumo },
    ]);
    abaComparacao(wb, 'Incluído', r.incluido);
    abaComparacao(wb, 'Excluído', r.excluido);
    abaComparacao(wb, 'Alterado', r.alterado);
    abaPrazos(wb, 'Novos prazos', r.novosPrazos);
    abaComparacao(wb, 'Novas obrigações', r.novasObrigacoes);
    abaComparacao(wb, 'Alterações fiscais', r.alteracoesFiscais);
    abaComparacao(wb, 'Impactos ERP', r.impactosErp);
  } else {
    const id = r.identificacao;
    const re = r.resumoExecutivo;
    aba(wb, 'Resumo', [{ header: 'Campo', key: 'k', width: 26 }, { header: 'Valor', key: 'v', width: 100 }], [
      { k: 'Título', v: id.titulo },
      { k: 'Tipo', v: id.tipoDocumento },
      { k: 'Número', v: [id.numero, id.versao && `v${id.versao}`].filter(Boolean).join(' ') },
      { k: 'Data', v: fmtData(id.dataDocumento) },
      { k: 'Órgão', v: id.orgao },
      { k: 'Publicação', v: fmtData(id.dataPublicacao) },
      { k: 'Início da vigência', v: fmtData(id.dataVigencia) },
      { k: 'Assunto', v: r.assuntoPrincipal },
      { k: 'O que aconteceu?', v: re.oQueAconteceu },
      { k: 'O que mudou?', v: re.oQueMudou },
      { k: 'Quando entra em vigor?', v: re.quandoEntraEmVigor },
      { k: 'Quem será afetado?', v: re.quemSeraAfetado },
      { k: 'O que precisamos fazer?', v: re.oQuePrecisamosFazer },
      { k: 'Qual o prazo?', v: re.qualOPrazo },
      { k: 'Impacto no ERP', v: re.impactoNoErp },
    ]);
    abaPrazos(wb, 'Prazos', r.linhaDoTempo);
    aba(
      wb,
      'Alterações',
      [
        { header: 'Alteração', key: 'titulo', width: 34 },
        { header: 'Descrição', key: 'descricao', width: 70 },
        { header: 'Tipo', key: 'tipo', width: 14 },
        { header: 'Natureza', key: 'natureza', width: 14 },
        { header: 'Página', key: 'pagina', width: 8 },
        { header: 'Dispositivo', key: 'dispositivo', width: 24 },
        { header: 'Trecho', key: 'trecho', width: 60 },
      ],
      r.alteracoes.map((x) => ({ titulo: x.titulo, descricao: x.descricao, tipo: x.tipo, natureza: natureza(x.natureza), pagina: x.fonte.pagina || '', dispositivo: x.fonte.dispositivo, trecho: x.fonte.trecho }))
    );
    const impactos = [
      ...r.impactos.fiscalTributario.map((i) => ({ ...i, area: 'Fiscal/tributário' })),
      ...r.impactos.erp.map((i) => ({ ...i, area: 'ERP/sistema' })),
      ...r.impactos.documentosFiscais.map((i) => ({ ...i, area: 'Documentos fiscais' })),
      ...r.impactos.obrigacoesAcessorias.map((i) => ({ ...i, area: 'Obrigações acessórias' })),
    ];
    aba(
      wb,
      'Impactos',
      [
        { header: 'Área', key: 'area', width: 20 },
        { header: 'Impacto', key: 'descricao', width: 80 },
        { header: 'Natureza', key: 'natureza', width: 14 },
        { header: 'Página', key: 'pagina', width: 8 },
        { header: 'Dispositivo', key: 'dispositivo', width: 24 },
      ],
      impactos.map((i) => ({ area: i.area, descricao: i.descricao, natureza: natureza(i.natureza), pagina: i.fonte.pagina || '', dispositivo: i.fonte.dispositivo }))
    );
    aba(
      wb,
      'Códigos',
      [
        { header: 'Tipo', key: 'tipo', width: 18 },
        { header: 'Código', key: 'codigo', width: 18 },
        { header: 'Descrição', key: 'descricao', width: 70 },
        { header: 'Página', key: 'pagina', width: 8 },
        { header: 'Dispositivo', key: 'dispositivo', width: 24 },
      ],
      r.codigos.map((c) => ({ tipo: c.tipo, codigo: c.codigo, descricao: c.descricao, pagina: c.fonte.pagina || '', dispositivo: c.fonte.dispositivo }))
    );
    aba(
      wb,
      'Base legal',
      [
        { header: 'Documento', key: 'documento', width: 30 },
        { header: 'Número', key: 'numero', width: 14 },
        { header: 'Data', key: 'data', width: 12 },
        { header: 'Órgão', key: 'orgao', width: 16 },
        { header: 'Dispositivo', key: 'dispositivo', width: 26 },
        { header: 'Página do PDF', key: 'pagina', width: 10 },
        { header: 'Trecho', key: 'trecho', width: 70 },
      ],
      r.baseLegal.map((b) => ({ ...b, data: fmtData(b.data) || b.data, pagina: b.pagina || '' }))
    );
  }

  aba(
    wb,
    'Checklist',
    [
      { header: 'Feito', key: 'feito', width: 8 },
      { header: 'Ação', key: 'acao', width: 70 },
      { header: 'Área', key: 'area', width: 16 },
      { header: 'Prazo', key: 'prazo', width: 18 },
      { header: 'Responsável', key: 'responsavel', width: 20 },
      { header: 'Página', key: 'pagina', width: 8 },
      { header: 'Dispositivo', key: 'dispositivo', width: 24 },
    ],
    r.checklist.map((c, i) => ({ feito: marcados.includes(i) ? 'Sim' : 'Não', acao: c.acao, area: c.area, prazo: c.prazo, responsavel: '', pagina: c.fonte.pagina || '', dispositivo: c.fonte.dispositivo }))
  );

  return Buffer.from(await wb.xlsx.writeBuffer());
}
