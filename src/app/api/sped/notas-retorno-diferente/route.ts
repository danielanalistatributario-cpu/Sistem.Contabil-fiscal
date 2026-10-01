import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';
import { COD_MOD_LABELS } from '@/lib/sped-numeracao';
import { resolverEmpresaGrupoIdPorCnpj } from '@/lib/protheus-empresa-resolver';

// Pedido explícito do usuário (01/10/2026): relatório direto da coluna
// "Retorno SEFA" (F3_CODRSEF/cStat) da SF3, listando toda nota (NF-e ou
// NFC-e) com código DIFERENTE de 100 (Autorizado) — não só as que
// geraram "não localizada" na Análise de Numeração (ver
// sped-numeracao.ts). Diferente daquela análise, aqui o filtro é por
// DATA de emissão (competência do arquivo SPED, YYYYMMDD — registro
// 0000), não por intervalo de número.
const DATA_REGEX = /^\d{8}$/;

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  if (!canAccess(session.currentRole, 'sped')) {
    return NextResponse.json({ error: 'Sem permissão para este módulo.' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const competenciaInicio = String(body?.competenciaInicio ?? '');
  const competenciaFim = String(body?.competenciaFim ?? '');
  if (!DATA_REGEX.test(competenciaInicio) || !DATA_REGEX.test(competenciaFim)) {
    return NextResponse.json({ error: 'Período da competência (registro 0000) não encontrado no arquivo.' }, { status: 400 });
  }

  // Mesma resolução de empresa/filial por CNPJ que a Análise de
  // Numeração já usa — esta tela não tem seletor de "Filial" próprio.
  const cnpjEmpresaDigitos = String(body?.cnpjEmpresa ?? '').replace(/\D/g, '');
  const empresaGrupoId = await resolverEmpresaGrupoIdPorCnpj(session.currentCompanyId, cnpjEmpresaDigitos, session.currentEmpresaGrupoId);

  const linhas = await prisma.notaFiscalSituacaoProtheus.findMany({
    where: {
      companyId: session.currentCompanyId,
      empresaGrupoId,
      cStat: { not: '100' },
      dataEmissao: { gte: competenciaInicio, lte: competenciaFim },
    },
    orderBy: [{ modelo: 'asc' }, { serie: 'asc' }, { numero: 'asc' }],
  });

  const notas = linhas.map((l) => ({
    modelo: l.modelo,
    modeloLabel: COD_MOD_LABELS[l.modelo] || `Modelo ${l.modelo}`,
    serie: l.serie,
    numero: l.numero,
    cStat: l.cStat,
    chave: l.chave,
    dataEmissao: l.dataEmissao,
    dataCancelamento: l.dataCancelamento,
  }));

  return NextResponse.json({ notas });
}
