import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession, logActivity } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';
import type { Role } from '@/lib/permissions';

export async function PATCH(req: NextRequest, { params }: { params: { membershipId: string } }) {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  if (!canAccess(session.currentRole, 'users')) {
    return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);

  const membership = await prisma.membership.findUnique({ where: { id: params.membershipId } });
  if (!membership || membership.companyId !== session.currentCompanyId) {
    return NextResponse.json({ error: 'Registro não encontrado.' }, { status: 404 });
  }

  // 'role' e 'analiseFiscalConfigExtra' são independentes — a tela de
  // Usuários manda um ou outro por chamada (select de perfil vs
  // checkbox de acesso extra), nunca os dois juntos.
  if (body?.role !== undefined) {
    const role = body.role as Role;
    const validRoles: Role[] = ['ADMINISTRADOR', 'GESTOR', 'ANALISTA', 'USUARIO', 'CLIENTE'];
    if (!validRoles.includes(role)) {
      return NextResponse.json({ error: 'Perfil inválido.' }, { status: 400 });
    }
    const updated = await prisma.membership.update({ where: { id: params.membershipId }, data: { role } });
    await logActivity(session.id, 'ALTEROU_PERFIL_USUARIO', `${membership.userId} -> ${role}`, session.currentCompanyId);
    return NextResponse.json({ membership: updated });
  }

  if (body?.analiseFiscalConfigExtra !== undefined) {
    const analiseFiscalConfigExtra = !!body.analiseFiscalConfigExtra;
    const updated = await prisma.membership.update({ where: { id: params.membershipId }, data: { analiseFiscalConfigExtra } });
    await logActivity(
      session.id,
      'ALTEROU_ACESSO_EXTRA_ANALISE_FISCAL_CONFIG',
      `${membership.userId} -> ${analiseFiscalConfigExtra ? 'liberado' : 'removido'}`,
      session.currentCompanyId
    );
    return NextResponse.json({ membership: updated });
  }

  return NextResponse.json({ error: 'Nenhum campo válido informado.' }, { status: 400 });
}

export async function DELETE(_req: NextRequest, { params }: { params: { membershipId: string } }) {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  if (!canAccess(session.currentRole, 'users')) {
    return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 });
  }

  const membership = await prisma.membership.findUnique({ where: { id: params.membershipId } });
  if (!membership || membership.companyId !== session.currentCompanyId) {
    return NextResponse.json({ error: 'Registro não encontrado.' }, { status: 404 });
  }

  await prisma.membership.delete({ where: { id: params.membershipId } });
  await logActivity(session.id, 'REMOVEU_ACESSO_USUARIO', membership.userId, session.currentCompanyId);

  return NextResponse.json({ ok: true });
}
