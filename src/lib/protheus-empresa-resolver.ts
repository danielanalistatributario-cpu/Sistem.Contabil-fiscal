// Resolve qual empresaGrupoId (filial) corresponde a um CNPJ lido de um
// arquivo (ex: registro 0000 do SPED) — comparando dígitos, mesmo
// padrão de carregarCnpjsGrupo (analise-fiscal-config-db.ts). Usado por
// telas que não têm seletor de "Filial" próprio (ex: Conversor SPED) e
// não podem depender do seletor global do Topbar, que pode estar numa
// filial diferente da do arquivo importado — ver
// [[sincronizacao-sf3-protheus-numeracao]] na memória do projeto pro
// achado real que motivou isso (01/10/2026).

import { prisma } from './db';

export async function resolverEmpresaGrupoIdPorCnpj(
  companyId: string,
  cnpjDigitos: string,
  fallback: string | null
): Promise<string | null> {
  if (cnpjDigitos.length !== 14) return fallback;

  const [filiais, tenant] = await Promise.all([
    prisma.analiseFiscalCnpjGrupo.findMany({ where: { companyId }, select: { id: true, cnpj: true } }),
    prisma.company.findUnique({ where: { id: companyId }, select: { cnpj: true } }),
  ]);
  const filial = filiais.find((f) => f.cnpj.replace(/\D/g, '') === cnpjDigitos);
  if (filial) return filial.id;
  if (tenant && tenant.cnpj.replace(/\D/g, '') === cnpjDigitos) return null; // cadastro geral do tenant
  return fallback;
}
