import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession, logActivity } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';
import { processarDifal, type ItemEntrada } from '@/lib/difal-rules';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  if (!canAccess(session.currentRole, 'difal')) {
    return NextResponse.json({ error: 'Sem permissão para este módulo.' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const periodo = String(body?.periodo || '').trim() || '—';
  const itensRaw: (ItemEntrada & { dataEmissao: string | null })[] = Array.isArray(body?.itens) ? body.itens : [];

  if (itensRaw.length === 0) {
    return NextResponse.json({ error: 'Nenhum item recebido para processar.' }, { status: 400 });
  }

  const company = await prisma.company.findUnique({ where: { id: session.currentCompanyId } });
  if (!company) return NextResponse.json({ error: 'Empresa não encontrada.' }, { status: 404 });

  const itens: ItemEntrada[] = itensRaw.map((i) => ({
    ...i,
    dataEmissao: i.dataEmissao ? new Date(i.dataEmissao) : null,
  }));

  const resultado = processarDifal(itens, company.aliquotaInterna);

  if (resultado.length === 0) {
    return NextResponse.json(
      {
        error:
          'Nenhum item com CFOP de DIFAL (2551 - Ativo Imobilizado ou 2556 - Uso e Consumo) foi encontrado no arquivo.',
      },
      { status: 400 }
    );
  }

  const itensComDifal = resultado.filter((i) => !i.inconsistencia).length;
  const itensSemDados = resultado.filter((i) => i.inconsistencia).length;
  const valorTotalDifal = resultado.reduce((s, i) => s + (i.valorDifal || 0), 0);

  const apuracao = await prisma.difalApuracao.create({
    data: {
      companyId: session.currentCompanyId,
      periodo,
      ufDestino: company.ufDestino,
      aliquotaInterna: company.aliquotaInterna,
      totalItens: resultado.length,
      itensComDifal,
      itensSemDados,
      valorTotalDifal,
      itens: {
        create: resultado.map((i) => ({
          docFiscal: i.docFiscal,
          fornecedor: i.fornecedor || null,
          cnpj: i.cnpj || null,
          ufOrigem: i.ufOrigem || null,
          produto: i.produto || null,
          ncm: i.ncm || null,
          cfop: i.cfop || null,
          origemCodigo: i.origemCodigo || null,
          dataEmissao: i.dataEmissao,
          quantidade: i.quantidade,
          valorUnitario: i.valorUnitario,
          frete: i.frete,
          despesaIpi: i.despesaIpi,
          desconto: i.desconto,
          valorTotal: i.valorTotal,
          aliqInterestadual: i.aliqInterestadual,
          valorOrigem: i.valorOrigem,
          baseIcms: i.baseIcms,
          icmsDestino: i.icmsDestino,
          valorDifal: i.valorDifal,
          inconsistencia: i.inconsistencia,
        })),
      },
    },
    include: { itens: true },
  });

  await logActivity(
    session.id,
    'PROCESSOU_APURACAO_DIFAL',
    `Período ${periodo} — ${resultado.length} item(ns), R$ ${valorTotalDifal.toFixed(2)}`,
    session.currentCompanyId
  );

  return NextResponse.json({ apuracao });
}
