import { NextRequest, NextResponse } from 'next/server';
import { getSession, logActivity } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';
import { buildRelatorioNFeRows } from '@/lib/sped-nfe-report';
import { mapearSpedParaItensTributo } from '@/lib/sped-excel-tributos';
import { gerarExcelTributos } from '@/lib/analise-fiscal-excel-tributos';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Mesma planilha ICMS/PIS/COFINS da Análise e Apuração Fiscal
// (gerarExcelTributos), aqui alimentada com dado extraído do SPED
// Fiscal em vez de um relatório Protheus — ver mapearSpedParaItensTributo.
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

  const itens = mapearSpedParaItensTributo(rows);
  const buffer = await gerarExcelTributos(itens, 'ICMS-PIS-COFINS');

  await logActivity(
    session.id,
    'GEROU_EXCEL_TRIBUTOS_SPED',
    `${itens.length} linha(s) — ${file.name}`,
    session.currentCompanyId
  );

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="ICMS_PIS_COFINS_SPED_${file.name.replace(/\.[^.]+$/, '')}.xlsx"`,
    },
  });
}
