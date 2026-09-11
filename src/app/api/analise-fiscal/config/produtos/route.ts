import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession, logActivity } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';
import { carregarEmpresasGrupo } from '@/lib/analise-fiscal-config-db';

const CLASSIFICACOES_VALIDAS = ['ISENTO', 'TRIBUTADO'];

// Valida e resolve empresaId da query/body contra o cadastro de
// "empresas do grupo" (uf preenchida) do tenant. Se o tenant tem pelo
// menos 1 empresa cadastrada, exigir=true faz devolver erro quando não
// vier um id válido — mesma obrigatoriedade já aplicada no seletor
// "Empresa a ser analisada" de Entradas/Saídas.
async function resolverEmpresaGrupoId(
  companyId: string,
  empresaIdInformado: string | null,
  exigir: boolean
): Promise<{ empresaGrupoId: string | null; erro: string | null }> {
  const empresasGrupo = await carregarEmpresasGrupo(companyId);
  if (empresasGrupo.length === 0) return { empresaGrupoId: null, erro: null };

  const valida = empresaIdInformado && empresasGrupo.some((e) => e.id === empresaIdInformado);
  if (!valida) {
    if (exigir) return { empresaGrupoId: null, erro: 'Selecione a empresa para gerenciar os produtos.' };
    return { empresaGrupoId: null, erro: null };
  }
  return { empresaGrupoId: empresaIdInformado, erro: null };
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  if (!canAccess(session.currentRole, 'analiseFiscalConfig')) {
    return NextResponse.json({ error: 'Sem permissão para este módulo.' }, { status: 403 });
  }

  const empresaIdParam = req.nextUrl.searchParams.get('empresaId');
  const { empresaGrupoId } = await resolverEmpresaGrupoId(session.currentCompanyId, empresaIdParam, false);

  const produtos = await prisma.analiseFiscalProdutoClassificacao.findMany({
    where: { companyId: session.currentCompanyId, empresaGrupoId },
    orderBy: { descricao: 'asc' },
  });

  return NextResponse.json({ produtos });
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
  const codigoProduto = String(body?.codigoProduto || '').trim();
  const descricao = String(body?.descricao || '').trim();
  const classificacao = String(body?.classificacao || '').trim();
  const classificacaoPisCofins = body?.classificacaoPisCofins ? String(body.classificacaoPisCofins).trim() : null;
  const observacao = body?.observacao ? String(body.observacao).trim() : null;
  const aliquotaBeneficioInterna = body?.aliquotaBeneficioInterna ? Number(body.aliquotaBeneficioInterna) : null;
  const aliquotaBeneficioInterestadual = body?.aliquotaBeneficioInterestadual ? Number(body.aliquotaBeneficioInterestadual) : null;

  if (!codigoProduto || !descricao || !CLASSIFICACOES_VALIDAS.includes(classificacao)) {
    return NextResponse.json(
      { error: 'Código do produto, descrição e classificação (ISENTO/TRIBUTADO) são obrigatórios.' },
      { status: 400 }
    );
  }
  if (classificacaoPisCofins !== null && !CLASSIFICACOES_VALIDAS.includes(classificacaoPisCofins)) {
    return NextResponse.json({ error: 'Classificação de PIS/COFINS inválida — informe ISENTO ou TRIBUTADO.' }, { status: 400 });
  }
  for (const [label, valor] of [['interna', aliquotaBeneficioInterna], ['interestadual', aliquotaBeneficioInterestadual]] as const) {
    if (valor !== null && (Number.isNaN(valor) || valor <= 0 || valor >= 1)) {
      return NextResponse.json({ error: `Alíquota de benefício (${label}) inválida — informe um valor entre 0 e 1 (ex: 0.12 para 12%).` }, { status: 400 });
    }
  }

  const { empresaGrupoId, erro } = await resolverEmpresaGrupoId(session.currentCompanyId, body?.empresaGrupoId || null, true);
  if (erro) {
    return NextResponse.json({ error: erro }, { status: 400 });
  }

  const existente = await prisma.analiseFiscalProdutoClassificacao.findFirst({
    where: { companyId: session.currentCompanyId, empresaGrupoId, codigoProduto },
  });
  if (existente) {
    return NextResponse.json({ error: 'Este código de produto já está cadastrado para esta empresa.' }, { status: 400 });
  }

  const produto = await prisma.analiseFiscalProdutoClassificacao.create({
    data: { companyId: session.currentCompanyId, empresaGrupoId, codigoProduto, descricao, classificacao, classificacaoPisCofins, observacao, aliquotaBeneficioInterna, aliquotaBeneficioInterestadual },
  });

  await logActivity(session.id, 'CADASTROU_PRODUTO_CLASSIFICACAO_ANALISE_FISCAL', `${codigoProduto} — ${descricao} (${classificacao})`, session.currentCompanyId);

  return NextResponse.json({ produto });
}
