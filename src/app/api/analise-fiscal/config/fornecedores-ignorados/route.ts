import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession, logActivity } from '@/lib/auth';
import { canAccessAnaliseFiscalConfig } from '@/lib/permissions';
import { resolverEmpresaGrupoId } from '@/lib/analise-fiscal-config-db';
import { extrairCodigoFornecedor } from '@/lib/analise-fiscal-tes-registry';

export async function GET() {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  if (!canAccessAnaliseFiscalConfig(session.currentRole, session.currentAnaliseFiscalConfigExtra)) {
    return NextResponse.json({ error: 'Sem permissão para este módulo.' }, { status: 403 });
  }

  const fornecedores = await prisma.analiseFiscalFornecedorIgnorado.findMany({
    where: { companyId: session.currentCompanyId, empresaGrupoId: session.currentEmpresaGrupoId },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ fornecedores });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  if (!canAccessAnaliseFiscalConfig(session.currentRole, session.currentAnaliseFiscalConfigExtra)) {
    return NextResponse.json({ error: 'Sem permissão para este módulo.' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const codigoFornecedorInformado = String(body?.codigoFornecedor || '').trim();
  const nome = body?.nome ? String(body.nome).trim() : null;
  const motivo = body?.motivo ? String(body.motivo).trim() : 'Simples Nacional';

  if (!codigoFornecedorInformado) {
    return NextResponse.json({ error: 'Código do fornecedor é obrigatório.' }, { status: 400 });
  }
  // Aceita tanto o código puro ("499082-01") quanto colar a célula inteira
  // do relatório ("499082-01 FABIO...") — extrai igual ao que a apuração
  // faz na hora de comparar, pra não cadastrar um código que nunca vai bater.
  const codigoFornecedor = extrairCodigoFornecedor(codigoFornecedorInformado) || codigoFornecedorInformado;

  const { empresaGrupoId, erro } = await resolverEmpresaGrupoId(
    session.currentCompanyId,
    session.currentEmpresaGrupoId,
    true,
    'Selecione a filial no topo da tela para gerenciar os fornecedores ignorados.'
  );
  if (erro) {
    return NextResponse.json({ error: erro }, { status: 400 });
  }

  const existente = await prisma.analiseFiscalFornecedorIgnorado.findFirst({
    where: { companyId: session.currentCompanyId, empresaGrupoId, codigoFornecedor },
  });
  if (existente) {
    return NextResponse.json({ error: 'Este fornecedor já está cadastrado para esta empresa.' }, { status: 400 });
  }

  const registro = await prisma.analiseFiscalFornecedorIgnorado.create({
    data: { companyId: session.currentCompanyId, empresaGrupoId, codigoFornecedor, nome, motivo },
  });

  await logActivity(
    session.id,
    'CADASTROU_FORNECEDOR_IGNORADO_ANALISE_FISCAL',
    `${codigoFornecedor}${nome ? ' — ' + nome : ''} (${motivo})`,
    session.currentCompanyId
  );

  return NextResponse.json({ fornecedor: registro });
}
