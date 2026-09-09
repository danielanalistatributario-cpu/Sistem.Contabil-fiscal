import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';
import { carregarTesMetadataPorCodigo, carregarCnpjsGrupo, carregarProdutosClassificacao, carregarProdutosBeneficioAliquota, carregarEmpresasGrupo } from '@/lib/analise-fiscal-config-db';

// Metadados de TES + CNPJs do grupo prontos pro motor de regras — usado
// pelo cálculo que roda no navegador (Saídas, que processa em lotes; ver
// [[analise-apuracao-fiscal-modulo]] na memória do projeto). Diferente de
// /api/analise-fiscal/regras (só ADMINISTRADOR, mostra descrições pra
// consulta), esta rota é liberada pra todo usuário com acesso ao módulo,
// porque qualquer um que roda uma apuração precisa desses dados.
//
// ?empresaId= (opcional): id de uma linha de AnaliseFiscalCnpjGrupo — a
// "Empresa a ser analisada" já escolhida pelo usuário em Entradas/Saídas.
// Quando presente e válida (pertence ao tenant), os produtos
// classificados devolvidos são só os daquela empresa; sem o parâmetro,
// devolve a lista geral (empresaGrupoId null) — comportamento de antes
// dessa segregação existir.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  if (!canAccess(session.currentRole, 'analiseFiscal')) {
    return NextResponse.json({ error: 'Sem permissão para este módulo.' }, { status: 403 });
  }

  const empresaIdParam = req.nextUrl.searchParams.get('empresaId');

  const [tesMetadataPorCodigo, cnpjsGrupo, empresasGrupo, company] = await Promise.all([
    carregarTesMetadataPorCodigo(session.currentCompanyId),
    carregarCnpjsGrupo(session.currentCompanyId),
    carregarEmpresasGrupo(session.currentCompanyId),
    prisma.company.findUnique({ where: { id: session.currentCompanyId }, select: { ufDestino: true, aliquotaInterna: true } }),
  ]);

  const empresaValida = empresaIdParam && empresasGrupo.some((e) => e.id === empresaIdParam) ? empresaIdParam : null;
  const [produtosClassificacao, produtosBeneficioAliquota] = await Promise.all([
    carregarProdutosClassificacao(session.currentCompanyId, empresaValida),
    carregarProdutosBeneficioAliquota(session.currentCompanyId, empresaValida),
  ]);

  return NextResponse.json({
    tesMetadataPorCodigo,
    cnpjsGrupo: Array.from(cnpjsGrupo),
    produtosClassificacao: Array.from(produtosClassificacao.entries()),
    produtosBeneficioAliquota: Array.from(produtosBeneficioAliquota.entries()),
    empresasGrupo,
    company: company || { ufDestino: 'PA', aliquotaInterna: 0.19 },
  });
}
