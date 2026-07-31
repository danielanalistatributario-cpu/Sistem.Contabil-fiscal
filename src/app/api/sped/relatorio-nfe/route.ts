import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { getSession, logActivity } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';
import { buildRelatorioNFeRows } from '@/lib/sped-nfe-report';

export const runtime = 'nodejs';

const NUM_QTDE = '_-* #,##0.0000_-;\\-* #,##0.0000_-;_-* "-"??_-;_-@_-';
const NUM_UNIT = '_-* #,##0.000000_-;\\-* #,##0.000000_-;_-* "-"??_-;_-@_-';
const NUM_VALOR = '_-* #,##0.00_-;\\-* #,##0.00_-;_-* "-"??_-;_-@_-';

type RelatorioNFeRow = ReturnType<typeof buildRelatorioNFeRows>[number];
type ColunaKey = keyof RelatorioNFeRow | 'tes' | 'bcc' | 'livroFiscal';

// Colunas do relatório "NF-e de Entrada e Saída", na ordem exata do modelo
// fornecido pelo cliente. width vem diretamente do arquivo modelo.
const COLUNAS: { header: string; key: ColunaKey; width: number; numFmt?: string }[] = [
  { header: 'Filial', key: 'filial', width: 7.33 },
  { header: 'Nota Fiscal', key: 'notaFiscal', width: 12.5 },
  { header: 'Serie NF', key: 'serieNF', width: 9.33 },
  { header: 'Modelo', key: 'modelo', width: 7.33 },
  { header: 'Especie', key: 'especie', width: 8.33 },
  { header: 'Item NF', key: 'itemNF', width: 13 },
  { header: 'Tipo NF', key: 'tipoNF', width: 6.83 },
  { header: 'Movto', key: 'movto', width: 4.83 },
  { header: 'Emissao', key: 'emissao', width: 9.66 },
  { header: 'Data', key: 'data', width: 13 },
  { header: 'Cnpj/Cpf', key: 'cnpjCpf', width: 17.16 },
  { header: 'Fornec/Cliente', key: 'fornecCliente', width: 52.83 },
  { header: 'UF da NF', key: 'ufDaNF', width: 7.66 },
  { header: 'Produto', key: 'produto', width: 49 },
  { header: 'Tipo', key: 'tipo', width: 21.16 },
  { header: 'N.C.M.', key: 'ncm', width: 58.66 },
  { header: 'Origem', key: 'origem', width: 54.83 },
  { header: 'Tes', key: 'tes', width: 23 },
  { header: 'Cfop', key: 'cfop', width: 58.66 },
  { header: 'CST ICMS', key: 'cstIcms', width: 44.16 },
  { header: 'CST Pis', key: 'cstPis', width: 54.83 },
  { header: 'CST Cofins', key: 'cstCofins', width: 13 },
  { header: 'BCC', key: 'bcc', width: 55.66 },
  { header: 'Qtde', key: 'qtde', width: 18.33, numFmt: NUM_QTDE },
  { header: 'Unitario', key: 'unitario', width: 13, numFmt: NUM_UNIT },
  { header: 'Total', key: 'total', width: 19.33, numFmt: NUM_VALOR },
  { header: 'Desconto', key: 'desconto', width: 17.33, numFmt: NUM_VALOR },
  { header: 'Frete', key: 'frete', width: 5.16, numFmt: NUM_VALOR },
  { header: 'Despesa', key: 'despesa', width: 7, numFmt: NUM_VALOR },
  { header: 'Seguro', key: 'seguro', width: 6, numFmt: NUM_VALOR },
  { header: 'Livro Fiscal', key: 'livroFiscal', width: 11.66 },
  { header: 'Base ICMS', key: 'baseIcms', width: 18.33, numFmt: NUM_VALOR },
  { header: 'Aliq. ICMS', key: 'aliqIcms', width: 9.83, numFmt: NUM_VALOR },
  { header: 'Valor ICMS', key: 'valorIcms', width: 17.33, numFmt: NUM_VALOR },
  { header: 'Base (Isento)', key: 'baseIsento', width: 18.33, numFmt: NUM_VALOR },
  { header: 'Base (Outros)', key: 'baseOutros', width: 19.33, numFmt: NUM_VALOR },
  { header: 'Base (N. Trib)', key: 'baseNaoTrib', width: 13, numFmt: NUM_VALOR },
  { header: 'Base  Cofins', key: 'baseCofins', width: 13, numFmt: NUM_VALOR },
  { header: 'Aliq. Cofins', key: 'aliqCofins', width: 11.83, numFmt: NUM_VALOR },
  { header: 'Valor Cofins', key: 'valorCofins', width: 18.33, numFmt: NUM_VALOR },
  { header: 'Base  Pis', key: 'basePis', width: 19.33, numFmt: NUM_VALOR },
  { header: 'Aliq. Pis', key: 'aliqPis', width: 8.83, numFmt: NUM_VALOR },
  { header: 'Valor Pis', key: 'valorPis', width: 17.33, numFmt: NUM_VALOR },
  { header: 'Chave NF', key: 'chaveNF', width: 42.16 },
];

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  if (!canAccess(session.currentRole, 'sped')) {
    return NextResponse.json({ error: 'Sem permissão para este módulo.' }, { status: 403 });
  }

  const formData = await req.formData().catch(() => null);
  const file = formData?.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'Nenhum arquivo enviado.' }, { status: 400 });

  const text = await file.text();
  if (!text.trim()) {
    return NextResponse.json({ error: 'Arquivo vazio ou ilegível.' }, { status: 400 });
  }

  const rows = buildRelatorioNFeRows(text);
  if (rows.length === 0) {
    return NextResponse.json(
      { error: 'Nenhum item de nota fiscal (registros C100/C170) foi encontrado no arquivo.' },
      { status: 400 }
    );
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('1-NF-e de Entrada e Saída');

  sheet.columns = COLUNAS.map((c) => ({ width: c.width }));

  // Linha 1: título mesclado, igual ao modelo
  sheet.mergeCells(1, 1, 1, COLUNAS.length);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = 'NF-e de Entrada e Saída';
  titleCell.font = { name: 'Courier New', size: 6, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

  // Linha 2: cabeçalho, igual ao modelo (fundo azul, fonte branca, Courier New 6pt)
  const headerRow = sheet.getRow(2);
  COLUNAS.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = c.header;
    cell.font = { name: 'Courier New', size: 6, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F81BD' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = {
      right: { style: 'thin', color: { argb: 'FFB8CCE4' } },
      bottom: { style: 'thin', color: { argb: 'FFB8CCE4' } },
    };
  });

  // Linhas de dados, com faixas alternadas de cor (banding) iguais ao modelo
  rows.forEach((row, idx) => {
    const excelRow = sheet.getRow(idx + 3);
    const bandFill = idx % 2 === 0 ? 'FFB8CCE4' : 'FFDCE6F1';

    COLUNAS.forEach((c, colIdx) => {
      const cell = excelRow.getCell(colIdx + 1);
      let value: unknown;
      if (c.key === 'tes' || c.key === 'bcc' || c.key === 'livroFiscal') {
        value = ''; // desconsiderados a pedido do cliente
      } else if (c.key === 'emissao' || c.key === 'data') {
        const d = (row as any)[c.key] as Date | null;
        value = d || '';
        if (d) cell.numFmt = 'dd/mm/yyyy';
      } else {
        value = (row as any)[c.key];
      }
      cell.value = value as ExcelJS.CellValue;
      cell.font = { name: 'Courier New', size: 6 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bandFill } };
      if (c.numFmt) cell.numFmt = c.numFmt;
    });
  });

  sheet.views = [{ state: 'frozen', ySplit: 2 }];

  const buffer = await workbook.xlsx.writeBuffer();

  await logActivity(
    session.id,
    'GEROU_RELATORIO_NFE_SPED',
    `${rows.length} linha(s) — ${file.name}`,
    session.currentCompanyId
  );

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="NFe_Entrada_Saida_${file.name.replace(/\.[^.]+$/, '')}.xlsx"`,
    },
  });
}
