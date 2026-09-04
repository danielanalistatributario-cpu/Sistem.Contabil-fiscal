import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';
import { carregarTesMetadataPorCodigo, carregarCnpjsGrupo } from '@/lib/analise-fiscal-config-db';

// Metadados de TES + CNPJs do grupo prontos pro motor de regras — usado
// pelo cálculo que roda no navegador (Saídas, que processa em lotes; ver
// [[analise-apuracao-fiscal-modulo]] na memória do projeto). Diferente de
// /api/analise-fiscal/regras (só ADMINISTRADOR, mostra descrições pra
// consulta), esta rota é liberada pra todo usuário com acesso ao módulo,
// porque qualquer um que roda uma apuração precisa desses dados.
export async function GET() {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  if (!canAccess(session.currentRole, 'analiseFiscal')) {
    return NextResponse.json({ error: 'Sem permissão para este módulo.' }, { status: 403 });
  }

  const [tesMetadataPorCodigo, cnpjsGrupo, company] = await Promise.all([
    carregarTesMetadataPorCodigo(session.currentCompanyId),
    carregarCnpjsGrupo(session.currentCompanyId),
    prisma.company.findUnique({ where: { id: session.currentCompanyId }, select: { ufDestino: true, aliquotaInterna: true } }),
  ]);

  return NextResponse.json({
    tesMetadataPorCodigo,
    cnpjsGrupo: Array.from(cnpjsGrupo),
    company: company || { ufDestino: 'PA', aliquotaInterna: 0.19 },
  });
}
