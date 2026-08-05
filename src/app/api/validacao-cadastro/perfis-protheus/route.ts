import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession, logActivity } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';
import { listarPerfisComProdutos } from '@/lib/protheus/perfil-produto';

export async function GET() {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  if (!canAccess(session.currentRole, 'validacaoCadastro')) {
    return NextResponse.json({ error: 'Sem permissão para este módulo.' }, { status: 403 });
  }

  const company = await prisma.company.findUnique({ where: { id: session.currentCompanyId } });
  if (!company?.protheusSufixo) {
    return NextResponse.json(
      { error: 'Configure o sufixo do Protheus desta empresa em Configurações antes de exportar.' },
      { status: 400 }
    );
  }

  let linhas;
  try {
    linhas = await listarPerfisComProdutos(company.protheusSufixo);
  } catch (err) {
    console.error('Falha ao exportar Perfis de Produto do Protheus:', err);
    return NextResponse.json(
      { error: 'Não foi possível consultar os Perfis de Produto no Protheus. Verifique a conexão com o banco.' },
      { status: 502 }
    );
  }

  await logActivity(
    session.id,
    'EXPORTOU_PERFIS_PROTHEUS',
    `${linhas.length} vínculo(s) perfil-produto exportado(s)`,
    session.currentCompanyId
  );

  return NextResponse.json({ linhas });
}
