import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { sessaoLegislacao } from '@/lib/legislacao/servidor';

// Assinaturas (nome, cargo, setor) que podem aparecer no rodapé do
// comunicado visual. Sem nenhuma cadastrada, a tela usa ASSINATURA_PADRAO.
export async function GET() {
  const auth = await sessaoLegislacao();
  if ('erro' in auth) return auth.erro;
  const assinaturas = await prisma.legislacaoAssinatura.findMany({
    where: { companyId: auth.session.currentCompanyId },
    orderBy: [{ padrao: 'desc' }, { createdAt: 'asc' }],
  });
  return NextResponse.json({ assinaturas });
}

export async function POST(req: NextRequest) {
  const auth = await sessaoLegislacao();
  if ('erro' in auth) return auth.erro;
  const body = await req.json().catch(() => ({}));
  const nome = String(body.nome || '').trim().slice(0, 80);
  const cargo = String(body.cargo || '').trim().slice(0, 80);
  const setor = String(body.setor || '').trim().slice(0, 80) || null;
  const padrao = body.padrao === true;
  if (!nome || !cargo) return NextResponse.json({ error: 'Informe nome e cargo.' }, { status: 400 });

  const companyId = auth.session.currentCompanyId;
  const assinatura = await prisma.$transaction(async (tx) => {
    if (padrao) await tx.legislacaoAssinatura.updateMany({ where: { companyId }, data: { padrao: false } });
    return tx.legislacaoAssinatura.create({ data: { companyId, nome, cargo, setor, padrao } });
  });
  return NextResponse.json({ assinatura });
}

export async function PATCH(req: NextRequest) {
  const auth = await sessaoLegislacao();
  if ('erro' in auth) return auth.erro;
  const body = await req.json().catch(() => ({}));
  const companyId = auth.session.currentCompanyId;
  const atual = await prisma.legislacaoAssinatura.findFirst({ where: { id: String(body.id || ''), companyId } });
  if (!atual) return NextResponse.json({ error: 'Assinatura não encontrada.' }, { status: 404 });
  await prisma.$transaction([
    prisma.legislacaoAssinatura.updateMany({ where: { companyId }, data: { padrao: false } }),
    prisma.legislacaoAssinatura.update({ where: { id: atual.id }, data: { padrao: true } }),
  ]);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const auth = await sessaoLegislacao();
  if ('erro' in auth) return auth.erro;
  const id = req.nextUrl.searchParams.get('id') || '';
  await prisma.legislacaoAssinatura.deleteMany({ where: { id, companyId: auth.session.currentCompanyId } });
  return NextResponse.json({ ok: true });
}
