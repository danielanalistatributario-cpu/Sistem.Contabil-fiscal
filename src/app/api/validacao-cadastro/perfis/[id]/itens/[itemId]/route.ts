import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; itemId: string } }) {
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

  const item = await prisma.perfilProdutoItem.findUnique({ where: { id: params.itemId } });
  if (!item || item.perfilId !== params.id) {
    return NextResponse.json({ error: 'Item não encontrado.' }, { status: 404 });
  }

  await prisma.perfilProdutoItem.delete({ where: { id: params.itemId } });

  return NextResponse.json({ ok: true });
}
