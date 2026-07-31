import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { hashPassword } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const token = body?.token;
  const newPassword = body?.newPassword;

  if (!token || !newPassword || newPassword.length < 6) {
    return NextResponse.json(
      { error: 'Token inválido ou senha deve ter ao menos 6 caracteres.' },
      { status: 400 }
    );
  }

  const resetRecord = await prisma.passwordReset.findUnique({ where: { token } });
  if (!resetRecord || resetRecord.usedAt || resetRecord.expiresAt < new Date()) {
    return NextResponse.json({ error: 'Link de redefinição inválido ou expirado.' }, { status: 400 });
  }

  const passwordHash = await hashPassword(newPassword);

  await prisma.$transaction([
    prisma.user.update({ where: { id: resetRecord.userId }, data: { passwordHash } }),
    prisma.passwordReset.update({ where: { id: resetRecord.id }, data: { usedAt: new Date() } }),
  ]);

  return NextResponse.json({ ok: true });
}
