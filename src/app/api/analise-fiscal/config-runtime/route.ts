import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';
import { carregarTesMetadataPorCodigo, carregarCnpjsGrupo, carregarProdutosClassificacao, carregarProdutosClassificacaoPisCofins, carregarProdutosBeneficioAliquota, carregarEmpresasGrupo } from '@/lib/analise-fiscal-config-db';

// Metadados de TES + CNPJs do grupo prontos pro motor de regras — usado
// pelo cálculo que roda no navegador (Saídas, que processa em lotes; ver
// [[analise-apuracao-fiscal-modulo]] na memória do projeto). Diferente de
// /api/analise-fiscal/regras (só ADMINISTRADOR, mostra descrições pra
// consulta), esta rota é liberada pra todo usuário com acesso ao módulo,
// porque qualquer um que roda uma apuração precisa desses dados.
//
// Filial ativa vem da sessão (`session.currentEmpresaGrupoId`, seletor
// "Filial" no Topbar — global, não é mais lido de query param). Quando
// presente, os produtos/TES devolvidos são só os daquela filial e
// `company` já vem com UF/alíquota da filial (substituindo a do tenant
// quando ela tiver essa informação cadastrada); sem filial ativa, devolve
// o cadastro geral e a UF/alíquota padrão do tenant — comportamento de
// antes dessa segregação existir.
export async function GET() {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  if (!canAccess(session.currentRole, 'analiseFiscal')) {
    return NextResponse.json({ error: 'Sem permissão para este módulo.' }, { status: 403 });
  }

  const empresaGrupoId = session.currentEmpresaGrupoId;

  const [cnpjsGrupo, empresasGrupo, tenantCompany, tesMetadataPorCodigo, produtosClassificacao, produtosClassificacaoPisCofins, produtosBeneficioAliquota] = await Promise.all([
    carregarCnpjsGrupo(session.currentCompanyId),
    carregarEmpresasGrupo(session.currentCompanyId),
    prisma.company.findUnique({ where: { id: session.currentCompanyId }, select: { ufDestino: true, aliquotaInterna: true } }),
    carregarTesMetadataPorCodigo(session.currentCompanyId, empresaGrupoId),
    carregarProdutosClassificacao(session.currentCompanyId, empresaGrupoId),
    carregarProdutosClassificacaoPisCofins(session.currentCompanyId, empresaGrupoId),
    carregarProdutosBeneficioAliquota(session.currentCompanyId, empresaGrupoId),
  ]);

  const empresaAtiva = empresaGrupoId ? empresasGrupo.find((e) => e.id === empresaGrupoId) : null;
  const companyBase = tenantCompany || { ufDestino: 'PA', aliquotaInterna: 0.19 };
  const company = empresaAtiva
    ? { ufDestino: empresaAtiva.uf || companyBase.ufDestino, aliquotaInterna: empresaAtiva.aliquotaInterna ?? companyBase.aliquotaInterna }
    : companyBase;

  return NextResponse.json({
    tesMetadataPorCodigo,
    cnpjsGrupo: Array.from(cnpjsGrupo),
    produtosClassificacao: Array.from(produtosClassificacao.entries()),
    produtosClassificacaoPisCofins: Array.from(produtosClassificacaoPisCofins.entries()),
    produtosBeneficioAliquota: Array.from(produtosBeneficioAliquota.entries()),
    empresasGrupo,
    empresaAtivaId: empresaGrupoId,
    company,
  });
}
