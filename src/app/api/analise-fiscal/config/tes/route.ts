import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession, logActivity } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';
import { garantirSeedTesConfig, resolverEmpresaGrupoId } from '@/lib/analise-fiscal-config-db';

const CHAVE_NF_VALIDAS = ['obrigatoria', 'proibida', 'livre'];
const NATUREZA_OPERACAO_VALIDAS = ['LIVRE', 'ISENTA', 'TRIBUTADA', 'TRANSFERENCIA'];

export async function GET() {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  if (!canAccess(session.currentRole, 'analiseFiscalConfig')) {
    return NextResponse.json({ error: 'Sem permissão para este módulo.' }, { status: 403 });
  }

  const empresaGrupoId = session.currentEmpresaGrupoId;

  await garantirSeedTesConfig(session.currentCompanyId, empresaGrupoId);
  const tes = await prisma.analiseFiscalTesConfig.findMany({
    where: { companyId: session.currentCompanyId, empresaGrupoId },
    orderBy: { codigo: 'asc' },
  });

  return NextResponse.json({ tes });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  if (!canAccess(session.currentRole, 'analiseFiscalConfig')) {
    return NextResponse.json({ error: 'Sem permissão para este módulo.' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const codigo = String(body?.codigo || '').trim();
  const grupo = String(body?.grupo || '').trim();
  const chaveNf = String(body?.chaveNf || '').trim();
  const permiteProdutos = !!body?.permiteProdutos;
  const validarCfopUf = body?.validarCfopUf === undefined ? true : !!body.validarCfopUf;
  const naturezaOperacao = body?.naturezaOperacao !== undefined ? String(body.naturezaOperacao).trim() : 'LIVRE';
  const naturezaOperacaoPisCofins = body?.naturezaOperacaoPisCofins !== undefined ? String(body.naturezaOperacaoPisCofins).trim() : 'LIVRE';

  if (
    !codigo ||
    !grupo ||
    !CHAVE_NF_VALIDAS.includes(chaveNf) ||
    !NATUREZA_OPERACAO_VALIDAS.includes(naturezaOperacao) ||
    !NATUREZA_OPERACAO_VALIDAS.includes(naturezaOperacaoPisCofins)
  ) {
    return NextResponse.json(
      { error: 'Código, grupo, política de Chave NF (obrigatoria/proibida/livre) e natureza da operação de ICMS e de PIS/COFINS (LIVRE/ISENTA/TRIBUTADA/TRANSFERENCIA) são obrigatórios.' },
      { status: 400 }
    );
  }

  const { empresaGrupoId, erro } = await resolverEmpresaGrupoId(
    session.currentCompanyId,
    session.currentEmpresaGrupoId,
    true,
    'Selecione a filial no topo da tela para gerenciar as TES.'
  );
  if (erro) {
    return NextResponse.json({ error: erro }, { status: 400 });
  }

  const existente = await prisma.analiseFiscalTesConfig.findFirst({
    where: { companyId: session.currentCompanyId, empresaGrupoId, codigo },
  });
  if (existente) {
    return NextResponse.json({ error: `A TES ${codigo} já está cadastrada.` }, { status: 400 });
  }

  const tes = await prisma.analiseFiscalTesConfig.create({
    data: { companyId: session.currentCompanyId, empresaGrupoId, codigo, grupo, chaveNf, permiteProdutos, validarCfopUf, naturezaOperacao, naturezaOperacaoPisCofins },
  });

  await logActivity(session.id, 'CADASTROU_TES_ANALISE_FISCAL', `TES ${codigo} — ${grupo}`, session.currentCompanyId);

  return NextResponse.json({ tes });
}
