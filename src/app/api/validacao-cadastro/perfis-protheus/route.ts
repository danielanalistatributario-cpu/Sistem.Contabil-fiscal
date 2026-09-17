import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession, logActivity } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';
import { listarPerfisComProdutosSincronizados, obterUltimaSincronizacao } from '@/lib/validacao-cadastro-perfil-sync';

// Lê os Perfis de Produto já sincronizados no Postgres (ver
// scripts/sync-perfis-protheus.ts) — o site publicado (Vercel) não
// consegue mais consultar o Protheus ao vivo (IP de rede local).
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

  const linhas = await listarPerfisComProdutosSincronizados(session.currentCompanyId);
  if (linhas.length === 0) {
    return NextResponse.json(
      {
        error:
          'Nenhum dado de Perfil de Produto sincronizado ainda para esta empresa. A sincronização com o Protheus roda periodicamente a partir do escritório — aguarde a próxima rodada ou verifique se o script está sendo executado.',
      },
      { status: 400 }
    );
  }

  const ultimaSincronizacao = await obterUltimaSincronizacao(session.currentCompanyId);

  await logActivity(
    session.id,
    'EXPORTOU_PERFIS_PROTHEUS',
    `${linhas.length} vínculo(s) perfil-produto exportado(s)`,
    session.currentCompanyId
  );

  return NextResponse.json({ linhas, ultimaSincronizacao });
}
