import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession, logActivity } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';

// Exclusão em lote por seleção manual (checkbox por linha no Histórico) —
// complementa a limpeza por corte de dias (limpar-antigas/route.ts) pros
// casos em que o usuário quer escolher exatamente quais apurações apagar,
// não só "tudo mais antigo que N dias".
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

  // companyId no where impede excluir apuração de outra empresa mesmo que
  // um id de fora venha manipulado no corpo da requisição.
  const { count } = await prisma.analiseFiscalApuracao.deleteMany({
    where: { id: { in: ids }, companyId: session.currentCompanyId },
  });

  await logActivity(session.id, 'EXCLUIU_ANALISE_FISCAL_LOTE', `${count} apuração(ões) selecionada(s) excluída(s)`, session.currentCompanyId);

  return NextResponse.json({ excluidas: count });
}
