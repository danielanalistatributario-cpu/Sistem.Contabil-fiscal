import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession, verifyPassword, hashPassword, logActivity } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const currentPassword = body?.currentPassword;
  const newPassword = body?.newPassword;

  if (!currentPassword || !newPassword || newPassword.length < 6) {
    return NextResponse.json(
      { error: 'Informe a senha atual e uma nova senha com ao menos 6 caracteres.' },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({ where: { id: session.id } });
  if (!user) return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 });

  const valid = await verifyPassword(currentPassword, user.passwordHash);
  if (!valid) return NextResponse.json({ error: 'Senha atual incorreta.' }, { status: 400 });

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  await logActivity(user.id, 'ALTEROU_SENHA');

  return NextResponse.json({ ok: true });
}
