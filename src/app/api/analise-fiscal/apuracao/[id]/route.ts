import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession, logActivity } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';
import {
  agregarIcmsPorCfop,
  somaIcms,
  calcularResumoApuracao,
  type CategoriaLancamento,
  type LancamentoManual,
} from '@/lib/analise-fiscal-icms-apuracao';

async function carregarApuracao(id: string, companyId: string) {
  const apuracao = await prisma.analiseFiscalApuracaoIcms.findUnique({
    where: { id },
    include: {
      lancamentos: { orderBy: [{ categoria: 'asc' }, { ordem: 'asc' }] },
      entradaApuracao: { select: { id: true, periodo: true, fileName: true, processedAt: true, totalLinhas: true } },
      saidaApuracao: { select: { id: true, periodo: true, fileName: true, processedAt: true, totalLinhas: true } },
      company: { select: { name: true, cnpj: true, inscricaoEstadual: true } },
    },
  });
  if (!apuracao || apuracao.companyId !== companyId) return null;
  return apuracao;
}

async function montarDetalhe(apuracao: NonNullable<Awaited<ReturnType<typeof carregarApuracao>>>) {
  const [registroEntradas, registroSaidas, porEntradasComCredito, porSaidasComDebito] = await Promise.all([
    apuracao.entradaApuracaoId ? agregarIcmsPorCfop(apuracao.entradaApuracaoId, 'entrada') : null,
    apuracao.saidaApuracaoId ? agregarIcmsPorCfop(apuracao.saidaApuracaoId, 'saida') : null,
    apuracao.entradaApuracaoId ? somaIcms(apuracao.entradaApuracaoId, 'entrada') : 0,
    apuracao.saidaApuracaoId ? somaIcms(apuracao.saidaApuracaoId, 'saida') : 0,
  ]);

  const lancamentos: LancamentoManual[] = apuracao.lancamentos.map((l) => ({
    id: l.id,
    categoria: l.categoria as CategoriaLancamento,
    descricao: l.descricao,
    valor: l.valor,
    ordem: l.ordem,
  }));

  const resumo = calcularResumoApuracao({
    porSaidasComDebito,
    porEntradasComCredito,
    lancamentos,
    saldoCredorAnterior: apuracao.saldoCredorAnterior,
  });

  return {
    id: apuracao.id,
    periodo: apuracao.periodo,
    saldoCredorAnterior: apuracao.saldoCredorAnterior,
    createdAt: apuracao.createdAt,
    updatedAt: apuracao.updatedAt,
    company: apuracao.company,
    entradaApuracao: apuracao.entradaApuracao,
    saidaApuracao: apuracao.saidaApuracao,
    registroEntradas,
    registroSaidas,
    lancamentos,
    resumo,
  };
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  if (!canAccess(session.currentRole, 'analiseFiscal')) {
    return NextResponse.json({ error: 'Sem permissão para este módulo.' }, { status: 403 });
  }

  const apuracao = await carregarApuracao(params.id, session.currentCompanyId);
  if (!apuracao) return NextResponse.json({ error: 'Apuração não encontrada.' }, { status: 404 });

  return NextResponse.json(await montarDetalhe(apuracao));
}

const CATEGORIAS_VALIDAS: CategoriaLancamento[] = ['OUTROS_DEBITOS', 'ESTORNO_CREDITOS', 'OUTROS_CREDITOS', 'ESTORNO_DEBITOS', 'DEDUCOES'];

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  if (!canAccess(session.currentRole, 'analiseFiscal')) {
    return NextResponse.json({ error: 'Sem permissão para este módulo.' }, { status: 403 });
  }

  const existente = await carregarApuracao(params.id, session.currentCompanyId);
  if (!existente) return NextResponse.json({ error: 'Apuração não encontrada.' }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 });

  const data: { saldoCredorAnterior?: number; entradaApuracaoId?: string | null; saidaApuracaoId?: string | null } = {};

  if (body.saldoCredorAnterior !== undefined) {
    const valor = Number(body.saldoCredorAnterior);
    if (Number.isNaN(valor)) return NextResponse.json({ error: 'Saldo credor anterior inválido.' }, { status: 400 });
    data.saldoCredorAnterior = valor;
  }

  if (body.entradaApuracaoId !== undefined) {
    if (body.entradaApuracaoId) {
      const entrada = await prisma.analiseFiscalApuracao.findUnique({ where: { id: body.entradaApuracaoId }, select: { companyId: true } });
      if (!entrada || entrada.companyId !== session.currentCompanyId) {
        return NextResponse.json({ error: 'Análise de Entradas não encontrada.' }, { status: 404 });
      }
    }
    data.entradaApuracaoId = body.entradaApuracaoId || null;
  }

  if (body.saidaApuracaoId !== undefined) {
    if (body.saidaApuracaoId) {
      const saida = await prisma.analiseFiscalSaidaApuracao.findUnique({ where: { id: body.saidaApuracaoId }, select: { companyId: true } });
      if (!saida || saida.companyId !== session.currentCompanyId) {
        return NextResponse.json({ error: 'Análise de Saídas não encontrada.' }, { status: 404 });
      }
    }
    data.saidaApuracaoId = body.saidaApuracaoId || null;
  }

  if (Array.isArray(body.lancamentos)) {
    for (const l of body.lancamentos) {
      if (!CATEGORIAS_VALIDAS.includes(l.categoria)) {
        return NextResponse.json({ error: `Categoria de lançamento inválida: ${l.categoria}` }, { status: 400 });
      }
      if (typeof l.descricao !== 'string' || !l.descricao.trim()) {
        return NextResponse.json({ error: 'Todo lançamento precisa de uma descrição.' }, { status: 400 });
      }
      if (typeof l.valor !== 'number' || Number.isNaN(l.valor)) {
        return NextResponse.json({ error: 'Valor de lançamento inválido.' }, { status: 400 });
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    if (Object.keys(data).length > 0) {
      await tx.analiseFiscalApuracaoIcms.update({ where: { id: params.id }, data });
    }

    if (Array.isArray(body.lancamentos)) {
      // substitui a lista inteira — mais simples que diffar adição/edição/remoção,
      // e o volume de linhas por apuração é pequeno (dezenas, no máximo)
      await tx.analiseFiscalApuracaoIcmsLancamento.deleteMany({ where: { apuracaoId: params.id } });
      if (body.lancamentos.length > 0) {
        await tx.analiseFiscalApuracaoIcmsLancamento.createMany({
          data: body.lancamentos.map((l: { categoria: CategoriaLancamento; descricao: string; valor: number }, idx: number) => ({
            apuracaoId: params.id,
            categoria: l.categoria,
            descricao: l.descricao.trim(),
            valor: l.valor,
            ordem: idx,
          })),
        });
      }
    }
  });

  await logActivity(session.id, 'ATUALIZOU_APURACAO_FISCAL', `Período: ${existente.periodo}`, session.currentCompanyId);

  const atualizada = await carregarApuracao(params.id, session.currentCompanyId);
  if (!atualizada) return NextResponse.json({ error: 'Apuração não encontrada.' }, { status: 404 });
  return NextResponse.json(await montarDetalhe(atualizada));
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  if (!canAccess(session.currentRole, 'analiseFiscal')) {
    return NextResponse.json({ error: 'Sem permissão para este módulo.' }, { status: 403 });
  }

  const apuracao = await prisma.analiseFiscalApuracaoIcms.findUnique({ where: { id: params.id }, select: { companyId: true, periodo: true } });
  if (!apuracao || apuracao.companyId !== session.currentCompanyId) {
    return NextResponse.json({ error: 'Apuração não encontrada.' }, { status: 404 });
  }

  await prisma.analiseFiscalApuracaoIcms.delete({ where: { id: params.id } });
  await logActivity(session.id, 'EXCLUIU_APURACAO_FISCAL', `Período: ${apuracao.periodo}`, session.currentCompanyId);

  return NextResponse.json({ ok: true });
}
