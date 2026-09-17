import { NextResponse } from 'next/server';
import { getSession, logActivity } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';
import {
  listarPerfisComProdutosSincronizados,
  obterUltimaSincronizacao,
  obterSufixoConfigurado,
} from '@/lib/validacao-cadastro-perfil-sync';

// Lê os Perfis de Produto já sincronizados no Postgres (ver
// scripts/sync-perfis-protheus.ts) — o site publicado (Vercel) não
// consegue mais consultar o Protheus ao vivo (IP de rede local). Usa a
// filial ativa do seletor global no Topbar (session.currentEmpresaGrupoId,
// mesmo padrão da Análise Fiscal — ver config-runtime/route.ts); sem
// filial selecionada, cai no sufixo "geral" da Company.
export async function GET() {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  if (!canAccess(session.currentRole, 'validacaoCadastro')) {
    return NextResponse.json({ error: 'Sem permissão para este módulo.' }, { status: 403 });
  }

  const empresaGrupoId = session.currentEmpresaGrupoId;
  const sufixo = await obterSufixoConfigurado(session.currentCompanyId, empresaGrupoId);
  if (!sufixo) {
    return NextResponse.json(
      {
        error: empresaGrupoId
          ? 'Esta filial não tem o sufixo do Protheus configurado — configure em Análise Fiscal → Configurar TES → Empresas do grupo.'
          : 'Configure o sufixo do Protheus desta empresa em Configurações antes de exportar.',
      },
      { status: 400 }
    );
  }

  const linhas = await listarPerfisComProdutosSincronizados(session.currentCompanyId, empresaGrupoId);
  if (linhas.length === 0) {
    return NextResponse.json(
      {
        error:
          'Nenhum dado de Perfil de Produto sincronizado ainda para esta empresa/filial. A sincronização com o Protheus roda periodicamente a partir do escritório — aguarde a próxima rodada ou verifique se o script está sendo executado.',
      },
      { status: 400 }
    );
  }

  const ultimaSincronizacao = await obterUltimaSincronizacao(session.currentCompanyId, empresaGrupoId);

  await logActivity(
    session.id,
    'EXPORTOU_PERFIS_PROTHEUS',
    `${linhas.length} vínculo(s) perfil-produto exportado(s)`,
    session.currentCompanyId
  );

  return NextResponse.json({ linhas, ultimaSincronizacao });
}
