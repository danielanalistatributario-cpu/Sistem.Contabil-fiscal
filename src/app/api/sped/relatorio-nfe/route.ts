import { NextRequest, NextResponse } from 'next/server';
import { getSession, logActivity } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';

export const runtime = 'nodejs';

// A geração do relatório "NF-e de Entrada e Saída" roda inteira no
// navegador agora (leitura + montagem do .xlsx com gerarRelatorioNFeExcel,
// em sped-nfe-excel.ts) — arquivos de EFD Contribuições reais já passaram
// dos ~4,5MB que a Vercel aceita de corpo de requisição, e não dava pra
// enviar nem o arquivo bruto nem o resultado já calculado (mais pesado
// ainda em JSON) pro servidor. Esta rota só registra a atividade.
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
    'GEROU_RELATORIO_NFE_SPED',
    `${totalLinhas} linha(s) — ${fileName}`,
    session.currentCompanyId
  );

  return NextResponse.json({ ok: true });
}
