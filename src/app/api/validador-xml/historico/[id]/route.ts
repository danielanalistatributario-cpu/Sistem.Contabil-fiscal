import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { sessaoValidadorXml } from '@/lib/validador-xml/servidor';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await sessaoValidadorXml();
  if ('erro' in auth) return auth.erro;
  const validacao = await prisma.validacaoXml.findFirst({ where: { id: params.id, companyId: auth.session.currentCompanyId } });
  if (!validacao) return NextResponse.json({ error: 'Validação não encontrada.' }, { status: 404 });
  return NextResponse.json({ validacao });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await sessaoValidadorXml();
  if ('erro' in auth) return auth.erro;
  const { count } = await prisma.validacaoXml.deleteMany({ where: { id: params.id, companyId: auth.session.currentCompanyId } });
  if (count === 0) return NextResponse.json({ error: 'Validação não encontrada.' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
