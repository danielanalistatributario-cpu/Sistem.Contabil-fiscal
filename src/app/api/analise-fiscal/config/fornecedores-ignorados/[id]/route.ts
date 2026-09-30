import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession, logActivity } from '@/lib/auth';
import { canAccessAnaliseFiscalConfig } from '@/lib/permissions';

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  if (!canAccessAnaliseFiscalConfig(session.currentRole, session.currentAnaliseFiscalConfigExtra)) {
    return NextResponse.json({ error: 'Sem permissão para este módulo.' }, { status: 403 });
  }

  const atual = await prisma.analiseFiscalFornecedorIgnorado.findUnique({ where: { id: params.id } });
  if (!atual || atual.companyId !== session.currentCompanyId) {
    return NextResponse.json({ error: 'Fornecedor não encontrado.' }, { status: 404 });
  }

  await prisma.analiseFiscalFornecedorIgnorado.delete({ where: { id: params.id } });
  await logActivity(
    session.id,
    'EXCLUIU_FORNECEDOR_IGNORADO_ANALISE_FISCAL',
    `${atual.codigoFornecedor}${atual.nome ? ' — ' + atual.nome : ''}`,
    session.currentCompanyId
  );

  return NextResponse.json({ ok: true });
}
