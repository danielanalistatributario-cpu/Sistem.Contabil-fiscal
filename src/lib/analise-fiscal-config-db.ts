// Ponte entre o registro de TES hardcoded (analise-fiscal-tes-registry.ts)
// e as tabelas editáveis por empresa (AnaliseFiscalTesConfig,
// AnaliseFiscalCnpjGrupo). A lógica de regras profundas (TES_RULES)
// continua fixa no código — só os METADADOS (chaveNf, permiteProdutos,
// rótulo) e a lista de CNPJs do grupo viram dado de banco, por empresa.

import { prisma } from './db';
import { TES_METADATA, type TesMetadata, type ChaveNfPolicy } from './analise-fiscal-tes-registry';

// Garante que os códigos de TES do registro hardcoded existam na config
// da empresa — cria só os que estiverem faltando (skipDuplicates), nunca
// sobrescreve o que o admin já customizou pela tela. Roda em toda
// apuração/carregamento (barato, é só um createMany com poucas dezenas de
// linhas) — assim, quando uma TES nova ganha metadados aqui no código
// (como aconteceu com 211/212), toda empresa recebe o default
// automaticamente, mesmo quem já tinha sido semeada antes.
export async function garantirSeedTesConfig(companyId: string): Promise<void> {
  const codigosJaVistos = new Set<string>();
  const dados = Object.entries(TES_METADATA)
    .filter(([codigo]) => {
      if (codigosJaVistos.has(codigo)) return false;
      codigosJaVistos.add(codigo);
      return true;
    })
    .map(([codigo, meta]) => ({
      companyId,
      codigo,
      grupo: meta.grupo,
      chaveNf: meta.chaveNf,
      permiteProdutos: meta.permiteProdutos,
      validarCfopUf: meta.validarCfopUf !== false,
    }));

  if (dados.length === 0) return;
  await prisma.analiseFiscalTesConfig.createMany({ data: dados, skipDuplicates: true });
}

export async function carregarTesMetadataPorCodigo(companyId: string): Promise<Record<string, TesMetadata>> {
  await garantirSeedTesConfig(companyId);
  const linhas = await prisma.analiseFiscalTesConfig.findMany({ where: { companyId } });
  const mapa: Record<string, TesMetadata> = {};
  for (const l of linhas) {
    mapa[l.codigo] = {
      codigos: [l.codigo],
      grupo: l.grupo,
      chaveNf: l.chaveNf as ChaveNfPolicy,
      permiteProdutos: l.permiteProdutos,
      validarCfopUf: l.validarCfopUf,
    };
  }
  return mapa;
}

export async function carregarCnpjsGrupo(companyId: string): Promise<Set<string>> {
  const linhas = await prisma.analiseFiscalCnpjGrupo.findMany({ where: { companyId } });
  return new Set(linhas.map((l) => l.cnpj.replace(/\D/g, '')));
}
