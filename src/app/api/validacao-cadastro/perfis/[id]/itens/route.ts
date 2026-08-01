import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession, logActivity } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  if (!canAccess(session.currentRole, 'validacaoCadastro')) {
    return NextResponse.json({ error: 'Sem permissão para este módulo.' }, { status: 403 });
  }

  const perfil = await prisma.perfilProduto.findUnique({ where: { id: params.id } });
  if (!perfil || perfil.companyId !== session.currentCompanyId) {
    return NextResponse.json({ error: 'Perfil não encontrado.' }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const itensRaw: { codigo: string; descricao?: string | null }[] = Array.isArray(body?.itens) ? body.itens : [];
  const itens = itensRaw
    .map((i) => ({ codigo: String(i.codigo || '').trim(), descricao: i.descricao ? String(i.descricao).trim() : null }))
    .filter((i) => i.codigo);

  if (itens.length === 0) {
    return NextResponse.json({ error: 'Nenhum código de produto informado.' }, { status: 400 });
  }

  const resultado = await prisma.perfilProdutoItem.createMany({
    data: itens.map((i) => ({ perfilId: params.id, codigo: i.codigo, descricao: i.descricao })),
    skipDuplicates: true,
  });

  await logActivity(
    session.id,
    'IMPORTOU_ITENS_PERFIL_PRODUTO',
    `${perfil.nome}: ${resultado.count} código(s) adicionado(s) de ${itens.length} enviado(s)`,
    session.currentCompanyId
  );

  const perfilAtualizado = await prisma.perfilProduto.findUnique({
    where: { id: params.id },
    include: { itens: { orderBy: { codigo: 'asc' } } },
  });

  return NextResponse.json({ perfil: perfilAtualizado, adicionados: resultado.count, enviados: itens.length });
}
