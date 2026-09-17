// Lê os Perfis de Produto já sincronizados no Postgres (PerfilProduto/
// PerfilProdutoItem, populados por scripts/sync-perfis-protheus.ts) — usado
// pelas rotas da Validação de Cadastro em vez de consultar o Protheus ao
// vivo, porque o site publicado (Vercel) não alcança o SQL Server do
// Protheus (IP de rede local do escritório). Mesmos formatos de retorno que
// as funções antigas de src/lib/protheus/perfil-produto.ts, pra não exigir
// mudança nos consumidores além da troca da chamada.
//
// empresaGrupoId segue o mesmo padrão dual-scope já usado em
// carregarProdutosClassificacao (analise-fiscal-config-db.ts): null = sufixo
// "geral" configurado em Company.protheusSufixo (nenhuma filial selecionada
// no seletor do Topbar); id real = sufixo daquela filial específica
// (AnaliseFiscalCnpjGrupo.protheusSufixo).

import { prisma } from './db';
import type { PerfilRef } from './validacao-cadastro-rules';
import type { LinhaPerfilProduto, BuscaPerfisResultado } from './protheus/perfil-produto';

export type { LinhaPerfilProduto, BuscaPerfisResultado };

export async function listarPerfisComProdutosSincronizados(
  companyId: string,
  empresaGrupoId: string | null
): Promise<LinhaPerfilProduto[]> {
  const perfis = await prisma.perfilProduto.findMany({
    where: { companyId, empresaGrupoId },
    include: { itens: true },
  });

  const linhas: LinhaPerfilProduto[] = [];
  for (const perfil of perfis) {
    for (const item of perfil.itens) {
      linhas.push({
        perfilCodigo: perfil.nome,
        produtoCodigo: item.codigo,
        produtoDescricao: item.descricao,
        produtoTipo: item.produtoTipo,
        produtoGrupo: item.produtoGrupo,
        aplicaATodos: item.aplicaATodos,
      });
    }
  }

  return linhas.sort((a, b) => a.perfilCodigo.localeCompare(b.perfilCodigo) || a.produtoCodigo.localeCompare(b.produtoCodigo));
}

export async function buscarPerfisPorCodigosSincronizados(
  codigosBrutos: string[],
  companyId: string,
  empresaGrupoId: string | null
): Promise<BuscaPerfisResultado> {
  const codigos = new Set(codigosBrutos.map((c) => c.trim()).filter(Boolean));

  // Consulta local ao Postgres (não é mais o SQL Server do Protheus) — sem
  // limite de parâmetros por lote, carrega todos os perfis+itens da empresa
  // de uma vez e filtra/agrupa em JS.
  const perfis = await prisma.perfilProduto.findMany({
    where: { companyId, empresaGrupoId },
    include: { itens: true },
  });

  const perfisMap = new Map<string, Set<string>>();
  const perfisComTodosSet = new Set<string>();

  for (const perfil of perfis) {
    for (const item of perfil.itens) {
      if (item.aplicaATodos) {
        perfisComTodosSet.add(perfil.nome);
        continue;
      }
      if (!codigos.has(item.codigo)) continue;
      if (!perfisMap.has(perfil.nome)) perfisMap.set(perfil.nome, new Set());
      perfisMap.get(perfil.nome)!.add(item.codigo);
    }
  }

  const perfisRef: PerfilRef[] = Array.from(perfisMap.entries()).map(([nome, codigosSet]) => ({
    nome,
    codigos: codigosSet,
  }));

  return { perfis: perfisRef, perfisComTodos: Array.from(perfisComTodosSet) };
}

export async function obterUltimaSincronizacao(companyId: string, empresaGrupoId: string | null): Promise<Date | null> {
  if (empresaGrupoId) {
    const filial = await prisma.analiseFiscalCnpjGrupo.findUnique({
      where: { id: empresaGrupoId },
      select: { protheusPerfisUltimaSincronizacao: true },
    });
    return filial?.protheusPerfisUltimaSincronizacao ?? null;
  }
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { protheusPerfisUltimaSincronizacao: true },
  });
  return company?.protheusPerfisUltimaSincronizacao ?? null;
}

// Sufixo configurado (geral, ou da filial ativa) — usado só pra decidir se
// a empresa/filial "está pronta" pra Validação de Cadastro (mesma checagem
// que antes olhava só company.protheusSufixo).
export async function obterSufixoConfigurado(companyId: string, empresaGrupoId: string | null): Promise<string | null> {
  if (empresaGrupoId) {
    const filial = await prisma.analiseFiscalCnpjGrupo.findUnique({
      where: { id: empresaGrupoId },
      select: { protheusSufixo: true },
    });
    return filial?.protheusSufixo ?? null;
  }
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { protheusSufixo: true },
  });
  return company?.protheusSufixo ?? null;
}
