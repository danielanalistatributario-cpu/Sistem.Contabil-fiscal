import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession, logActivity } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  if (!canAccess(session.currentRole, 'conciliacao')) {
    return NextResponse.json({ error: 'Sem permissão para este módulo.' }, { status: 403 });
  }

  const apuracao = await prisma.conciliacaoBancariaApuracao.findUnique({
    where: { id: params.id },
    include: { dias: { orderBy: { data: 'asc' } }, itens: true },
  });

  if (!apuracao || apuracao.companyId !== session.currentCompanyId) {
    return NextResponse.json({ error: 'Conciliação não encontrada.' }, { status: 404 });
  }

  return NextResponse.json({ apuracao });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  if (!canAccess(session.currentRole, 'conciliacao')) {
    return NextResponse.json({ error: 'Sem permissão para este módulo.' }, { status: 403 });
  }

  const apuracao = await prisma.conciliacaoBancariaApuracao.findUnique({ where: { id: params.id } });
  if (!apuracao || apuracao.companyId !== session.currentCompanyId) {
    return NextResponse.json({ error: 'Conciliação não encontrada.' }, { status: 404 });
  }

  await prisma.conciliacaoBancariaApuracao.delete({ where: { id: params.id } });
  await logActivity(session.id, 'EXCLUIU_CONCILIACAO_BANCARIA', `Período ${apuracao.periodo}`, session.currentCompanyId);

  return NextResponse.json({ ok: true });
}
