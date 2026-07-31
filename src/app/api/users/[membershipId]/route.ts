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
  const role = body?.role as Role;
  const validRoles: Role[] = ['ADMINISTRADOR', 'GESTOR', 'ANALISTA', 'USUARIO', 'CLIENTE'];
  if (!validRoles.includes(role)) {
    return NextResponse.json({ error: 'Perfil inválido.' }, { status: 400 });
  }

  const membership = await prisma.membership.findUnique({ where: { id: params.membershipId } });
  if (!membership || membership.companyId !== session.currentCompanyId) {
    return NextResponse.json({ error: 'Registro não encontrado.' }, { status: 404 });
  }

  const updated = await prisma.membership.update({ where: { id: params.membershipId }, data: { role } });
  await logActivity(session.id, 'ALTEROU_PERFIL_USUARIO', `${membership.userId} -> ${role}`, session.currentCompanyId);

  return NextResponse.json({ membership: updated });
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
