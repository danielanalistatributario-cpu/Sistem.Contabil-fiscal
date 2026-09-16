import { NextRequest, NextResponse } from 'next/server';
import { getSession, logActivity } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';

export const runtime = 'nodejs';

// A planilha ICMS/PIS/COFINS roda inteira no navegador agora (leitura +
// mapeamento + montagem do .xlsx com gerarExcelTributos) — mesmo motivo do
// relatorio-nfe/route.ts: arquivo de EFD Contribuições real já passou dos
// ~4,5MB que a Vercel aceita de corpo de requisição. Esta rota só registra
// a atividade.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  if (!canAccess(session.currentRole, 'sped')) {
    return NextResponse.json({ error: 'Sem permissão para este módulo.' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const fileName: string = body?.fileName || 'arquivo';
  const totalLinhas: number = body?.totalLinhas ?? 0;

  await logActivity(
    session.id,
    'GEROU_EXCEL_TRIBUTOS_SPED',
    `${totalLinhas} linha(s) — ${fileName}`,
    session.currentCompanyId
  );

  return NextResponse.json({ ok: true });
}
