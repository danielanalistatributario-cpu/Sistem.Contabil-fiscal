import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession, logActivity } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';

// Mesma exclusão em lote por seleção manual de
// src/app/api/analise-fiscal/apuracoes/excluir-selecionadas, lado Saída.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  if (!canAccess(session.currentRole, 'analiseFiscal')) {
    return NextResponse.json({ error: 'Sem permissão para este módulo.' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const ids: string[] = Array.isArray(body?.ids) ? body.ids.filter((id: unknown) => typeof id === 'string') : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: 'Selecione ao menos uma apuração.' }, { status: 400 });
  }

  const { count } = await prisma.analiseFiscalSaidaApuracao.deleteMany({
    where: { id: { in: ids }, companyId: session.currentCompanyId },
  });

  await logActivity(session.id, 'EXCLUIU_ANALISE_FISCAL_SAIDA_LOTE', `${count} apuração(ões) selecionada(s) excluída(s)`, session.currentCompanyId);

  return NextResponse.json({ excluidas: count });
}
