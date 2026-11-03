import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { sessaoValidadorXml } from '@/lib/validador-xml/servidor';
import type { RegraNorma } from '@/lib/validador-xml/tipos';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await sessaoValidadorXml();
  if ('erro' in auth) return auth.erro;
  const norma = await prisma.normaXml.findFirst({ where: { id: params.id, companyId: auth.session.currentCompanyId } });
  if (!norma) return NextResponse.json({ error: 'Norma não encontrada.' }, { status: 404 });
  return NextResponse.json({ norma });
}

// Liga/desliga regras (body.habilitadas = { "I11c-20": false }) ou a norma inteira (body.situacao).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await sessaoValidadorXml();
  if ('erro' in auth) return auth.erro;
  const norma = await prisma.normaXml.findFirst({ where: { id: params.id, companyId: auth.session.currentCompanyId } });
  if (!norma) return NextResponse.json({ error: 'Norma não encontrada.' }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const data: { situacao?: string; regras?: object[] } = {};
  if (body.situacao === 'ATIVA' || body.situacao === 'INATIVA') data.situacao = body.situacao;
  if (body.habilitadas && typeof body.habilitadas === 'object') {
    const mapa = body.habilitadas as Record<string, unknown>;
    data.regras = (norma.regras as unknown as RegraNorma[]).map((r) => (typeof mapa[r.chave] === 'boolean' ? { ...r, habilitada: mapa[r.chave] as boolean } : r)) as object[];
  }
  await prisma.normaXml.update({ where: { id: norma.id }, data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await sessaoValidadorXml();
  if ('erro' in auth) return auth.erro;
  const { count } = await prisma.normaXml.deleteMany({ where: { id: params.id, companyId: auth.session.currentCompanyId } });
  if (count === 0) return NextResponse.json({ error: 'Norma não encontrada.' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
