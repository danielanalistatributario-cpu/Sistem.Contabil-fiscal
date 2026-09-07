import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession, logActivity } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';

const CHAVE_NF_VALIDAS = ['obrigatoria', 'proibida', 'livre'];
const NATUREZA_OPERACAO_VALIDAS = ['LIVRE', 'ISENTA', 'TRIBUTADA', 'TRANSFERENCIA'];

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  if (!canAccess(session.currentRole, 'analiseFiscalConfig')) {
    return NextResponse.json({ error: 'Sem permissão para este módulo.' }, { status: 403 });
  }

  const tesAtual = await prisma.analiseFiscalTesConfig.findUnique({ where: { id: params.id } });
  if (!tesAtual || tesAtual.companyId !== session.currentCompanyId) {
    return NextResponse.json({ error: 'TES não encontrada.' }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const grupo = body?.grupo !== undefined ? String(body.grupo).trim() : tesAtual.grupo;
  const chaveNf = body?.chaveNf !== undefined ? String(body.chaveNf).trim() : tesAtual.chaveNf;
  const permiteProdutos = body?.permiteProdutos !== undefined ? !!body.permiteProdutos : tesAtual.permiteProdutos;
  const validarCfopUf = body?.validarCfopUf !== undefined ? !!body.validarCfopUf : tesAtual.validarCfopUf;
  const naturezaOperacao = body?.naturezaOperacao !== undefined ? String(body.naturezaOperacao).trim() : tesAtual.naturezaOperacao;

  if (!grupo || !CHAVE_NF_VALIDAS.includes(chaveNf) || !NATUREZA_OPERACAO_VALIDAS.includes(naturezaOperacao)) {
    return NextResponse.json(
      { error: 'Grupo, política de Chave NF (obrigatoria/proibida/livre) e natureza da operação (LIVRE/ISENTA/TRIBUTADA/TRANSFERENCIA) são obrigatórios.' },
      { status: 400 }
    );
  }

  const tes = await prisma.analiseFiscalTesConfig.update({
    where: { id: params.id },
    data: { grupo, chaveNf, permiteProdutos, validarCfopUf, naturezaOperacao },
  });

  await logActivity(session.id, 'EDITOU_TES_ANALISE_FISCAL', `TES ${tes.codigo} — ${grupo}`, session.currentCompanyId);

  return NextResponse.json({ tes });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  if (!canAccess(session.currentRole, 'analiseFiscalConfig')) {
    return NextResponse.json({ error: 'Sem permissão para este módulo.' }, { status: 403 });
  }

  const tesAtual = await prisma.analiseFiscalTesConfig.findUnique({ where: { id: params.id } });
  if (!tesAtual || tesAtual.companyId !== session.currentCompanyId) {
    return NextResponse.json({ error: 'TES não encontrada.' }, { status: 404 });
  }

  await prisma.analiseFiscalTesConfig.delete({ where: { id: params.id } });
  await logActivity(session.id, 'EXCLUIU_TES_ANALISE_FISCAL', `TES ${tesAtual.codigo}`, session.currentCompanyId);

  return NextResponse.json({ ok: true });
}
