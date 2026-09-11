// Ponte entre o registro de TES hardcoded (analise-fiscal-tes-registry.ts)
// e as tabelas editáveis por empresa (AnaliseFiscalTesConfig,
// AnaliseFiscalCnpjGrupo). A lógica de regras profundas (TES_RULES)
// continua fixa no código — só os METADADOS (chaveNf, permiteProdutos,
// rótulo) e a lista de CNPJs do grupo viram dado de banco, por empresa.

import { prisma } from './db';
import { TES_METADATA, type TesMetadata, type ChaveNfPolicy, type NaturezaOperacao, type ClassificacaoProduto } from './analise-fiscal-tes-registry';
import { TES_METADATA_SAIDA_DEFAULT } from './analise-fiscal-saida-tes-registry';

// Códigos de TES de Entrada (0xx-3xx) e Saída (9xx) nunca colidem
// numericamente, então cabem juntos na mesma tabela AnaliseFiscalTesConfig
// — uma TES de saída é só mais uma linha, sem precisar de tabela nova.
function todosOsDefaults(): Record<string, TesMetadata> {
  const mapa: Record<string, TesMetadata> = { ...TES_METADATA };
  for (const meta of TES_METADATA_SAIDA_DEFAULT) {
    for (const codigo of meta.codigos) {
      if (!(codigo in mapa)) mapa[codigo] = meta;
    }
  }
  return mapa;
}

// Garante que os códigos de TES do registro hardcoded (entrada + saída)
// existam na config do escopo pedido (empresa do grupo específica, ou o
// cadastro geral quando empresaGrupoId é null/omitido) — cria só os que
// estiverem faltando NAQUELE escopo, nunca sobrescreve o que o admin já
// customizou pela tela. Roda em toda apuração/carregamento (barato, só
// algumas dezenas de linhas) — assim, quando uma TES nova ganha metadados
// aqui no código (como aconteceu com 211/212), todo escopo (geral e cada
// empresa) recebe o default automaticamente, mesmo quem já tinha sido
// semeado antes.
//
// Cuidado (documentado no schema): Postgres trata NULL como distinto num
// índice único, então `skipDuplicates` sozinho NÃO protege contra
// duplicar código no cadastro geral (empresaGrupoId: null) — por isso,
// só pra esse caso, filtramos os códigos já existentes antes de inserir
// em vez de confiar no skipDuplicates. Pra uma empresa específica
// (empresaGrupoId não-nulo) a constraint funciona normal.
export async function garantirSeedTesConfig(companyId: string, empresaGrupoId?: string | null): Promise<void> {
  const escopo = empresaGrupoId ?? null;
  const defaults = todosOsDefaults();

  let codigosFaltando: string[];
  if (escopo === null) {
    const existentes = await prisma.analiseFiscalTesConfig.findMany({
      where: { companyId, empresaGrupoId: null },
      select: { codigo: true },
    });
    const codigosExistentes = new Set(existentes.map((e) => e.codigo));
    codigosFaltando = Object.keys(defaults).filter((c) => !codigosExistentes.has(c));
  } else {
    codigosFaltando = Object.keys(defaults);
  }

  const dados = codigosFaltando.map((codigo) => {
    const meta = defaults[codigo];
    return {
      companyId,
      empresaGrupoId: escopo,
      codigo,
      grupo: meta.grupo,
      chaveNf: meta.chaveNf,
      permiteProdutos: meta.permiteProdutos,
      validarCfopUf: meta.validarCfopUf !== false,
      naturezaOperacao: meta.naturezaOperacao || 'LIVRE',
      naturezaOperacaoPisCofins: meta.naturezaOperacaoPisCofins || 'LIVRE',
    };
  });

  if (dados.length === 0) return;
  await prisma.analiseFiscalTesConfig.createMany({ data: dados, skipDuplicates: true });
}

// Cadastro de TES 100% independente por empresa do grupo (não é "geral +
// exceções") — mesmo código pode significar coisas diferentes entre
// filiais (ex: TES 904 é "Devolução de compras" numa empresa e "Baixa de
// deterioração" noutra). Sem empresaGrupoId (tenant que nunca cadastrou
// "empresas do grupo"), devolve o cadastro geral, igual ao comportamento
// de antes desta segregação existir.
export async function carregarTesMetadataPorCodigo(
  companyId: string,
  empresaGrupoId?: string | null
): Promise<Record<string, TesMetadata>> {
  const escopo = empresaGrupoId ?? null;
  await garantirSeedTesConfig(companyId, escopo);
  const linhas = await prisma.analiseFiscalTesConfig.findMany({ where: { companyId, empresaGrupoId: escopo } });
  const mapa: Record<string, TesMetadata> = {};
  for (const l of linhas) {
    mapa[l.codigo] = {
      codigos: [l.codigo],
      grupo: l.grupo,
      chaveNf: l.chaveNf as ChaveNfPolicy,
      permiteProdutos: l.permiteProdutos,
      validarCfopUf: l.validarCfopUf,
      naturezaOperacao: l.naturezaOperacao as NaturezaOperacao,
      naturezaOperacaoPisCofins: l.naturezaOperacaoPisCofins as NaturezaOperacao,
    };
  }
  return mapa;
}

export async function carregarCnpjsGrupo(companyId: string): Promise<Set<string>> {
  const linhas = await prisma.analiseFiscalCnpjGrupo.findMany({ where: { companyId } });
  return new Set(linhas.map((l) => l.cnpj.replace(/\D/g, '')));
}

export type EmpresaGrupo = { id: string; nome: string; cnpj: string; uf: string | null; aliquotaInterna: number | null };

// Valida e resolve empresaId da query/body contra o cadastro de
// "empresas do grupo" (uf preenchida) do tenant. Se o tenant tem pelo
// menos 1 empresa cadastrada, exigir=true faz devolver erro quando não
// vier um id válido — mesma obrigatoriedade já aplicada no seletor
// "Empresa a ser analisada" de Entradas/Saídas. Reaproveitado por
// config/produtos e config/tes (mesma checagem, só muda a mensagem).
export async function resolverEmpresaGrupoId(
  companyId: string,
  empresaIdInformado: string | null,
  exigir: boolean,
  mensagemErro: string = 'Selecione a empresa.'
): Promise<{ empresaGrupoId: string | null; erro: string | null }> {
  const empresasGrupo = await carregarEmpresasGrupo(companyId);
  if (empresasGrupo.length === 0) return { empresaGrupoId: null, erro: null };

  const valida = empresaIdInformado && empresasGrupo.some((e) => e.id === empresaIdInformado);
  if (!valida) {
    if (exigir) return { empresaGrupoId: null, erro: mensagemErro };
    return { empresaGrupoId: null, erro: null };
  }
  return { empresaGrupoId: empresaIdInformado, erro: null };
}

// Empresas/filiais do grupo com UF cadastrada — alimenta o seletor
// "Empresa a ser analisada" da Análise de Entradas/Saídas. Empresas sem
// uf preenchida não aparecem aqui (continuam valendo só pra checagem de
// CNPJ da TES 138, via carregarCnpjsGrupo).
export async function carregarEmpresasGrupo(companyId: string): Promise<EmpresaGrupo[]> {
  const linhas = await prisma.analiseFiscalCnpjGrupo.findMany({
    where: { companyId, uf: { not: null } },
    orderBy: { nome: 'asc' },
  });
  return linhas.map((l) => ({ id: l.id, nome: l.nome, cnpj: l.cnpj, uf: l.uf, aliquotaInterna: l.aliquotaInterna }));
}

// Segregado por empresa do grupo (mesmo produto pode ter classificação
// diferente entre filiais) — sem empresaGrupoId (tenant que nunca
// cadastrou "empresas do grupo", ou nenhuma empresa selecionada ainda),
// devolve a lista "geral" (empresaGrupoId null), igual ao comportamento
// de antes desta segregação existir.
export async function carregarProdutosClassificacao(
  companyId: string,
  empresaGrupoId?: string | null
): Promise<Map<string, ClassificacaoProduto>> {
  const linhas = await prisma.analiseFiscalProdutoClassificacao.findMany({
    where: { companyId, empresaGrupoId: empresaGrupoId ?? null },
  });
  return new Map(linhas.map((l) => [l.codigoProduto, l.classificacao as ClassificacaoProduto]));
}

// Mesma segregação por empresa do grupo, eixo independente de PIS/COFINS
// (ver comentário de `classificacaoPisCofins` no schema) — produto sem
// esse campo preenchido não entra no Map, então não participa do
// cruzamento produto×TES de PIS/COFINS.
export async function carregarProdutosClassificacaoPisCofins(
  companyId: string,
  empresaGrupoId?: string | null
): Promise<Map<string, ClassificacaoProduto>> {
  const linhas = await prisma.analiseFiscalProdutoClassificacao.findMany({
    where: { companyId, empresaGrupoId: empresaGrupoId ?? null, classificacaoPisCofins: { not: null } },
  });
  return new Map(linhas.map((l) => [l.codigoProduto, l.classificacaoPisCofins as ClassificacaoProduto]));
}

// Benefício fiscal de redução de base/alíquota por produto (ex: Convênio
// ICMS do Amapá pra alho/batata) — mesma segregação por empresa do grupo
// que a classificação ISENTO/TRIBUTADO. `interna`/`interestadual` são
// independentes: um produto pode ter só a interna com benefício (caso
// real de alho/batata — a redução de base só vale pra operação interna;
// a interestadual segue a tabela padrão normalmente, por isso fica null).
export async function carregarProdutosBeneficioAliquota(
  companyId: string,
  empresaGrupoId?: string | null
): Promise<Map<string, { interna: number | null; interestadual: number | null }>> {
  const linhas = await prisma.analiseFiscalProdutoClassificacao.findMany({
    where: {
      companyId,
      empresaGrupoId: empresaGrupoId ?? null,
      OR: [{ aliquotaBeneficioInterna: { not: null } }, { aliquotaBeneficioInterestadual: { not: null } }],
    },
  });
  return new Map(
    linhas.map((l) => [l.codigoProduto, { interna: l.aliquotaBeneficioInterna, interestadual: l.aliquotaBeneficioInterestadual }])
  );
}
