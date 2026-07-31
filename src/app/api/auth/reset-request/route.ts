import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { prisma } from '@/lib/db';

// NOTA DE PRODUÇÃO: este MVP não tem serviço de e-mail configurado. Por isso,
// o link de redefinição é retornado diretamente na resposta (e exibido na tela)
// em vez de enviado por e-mail. Antes de ir para produção, integrar um provedor
// de e-mail (ex.: SES, SendGrid, Postmark) e remover o campo `resetLink` da resposta.

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = body?.email?.toLowerCase()?.trim();
  if (!email) return NextResponse.json({ error: 'Informe o e-mail.' }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { email } });

  // Resposta genérica mesmo se o usuário não existir, para não vazar quais e-mails estão cadastrados.
  if (!user) {
    return NextResponse.json({ ok: true, resetLink: null });
  }

  const token = randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60); // 1 hora

  await prisma.passwordReset.create({
    data: { userId: user.id, token, expiresAt },
  });

  const resetLink = `/reset-senha?token=${token}`;
  return NextResponse.json({ ok: true, resetLink });
}
