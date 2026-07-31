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

  const apuracao = await prisma.conciliacaoApuracao.findUnique({
    where: { id: params.id },
    include: { contas: { include: { lancamentos: true } } },
  });

  if (!apuracao || apuracao.companyId !== session.currentCompanyId) {
    return NextResponse.json({ error: 'Apuração não encontrada.' }, { status: 404 });
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

  const apuracao = await prisma.conciliacaoApuracao.findUnique({ where: { id: params.id } });
  if (!apuracao || apuracao.companyId !== session.currentCompanyId) {
    return NextResponse.json({ error: 'Apuração não encontrada.' }, { status: 404 });
  }

  await prisma.conciliacaoApuracao.delete({ where: { id: params.id } });
  await logActivity(session.id, 'EXCLUIU_CONCILIACAO', `Período ${apuracao.periodo}`, session.currentCompanyId);

  return NextResponse.json({ ok: true });
}
