import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';

export const runtime = 'nodejs';
export const maxDuration = 60;

const SEVERIDADE_LABEL: Record<string, string> = {
  CRITICO: 'Crítico',
  ALTO: 'Alto',
  MEDIO: 'Médio',
  BAIXO: 'Baixo',
  INFORMATIVO: 'Informativo',
};

// Gerado no servidor (não mais montado no navegador a partir de um array
// já carregado) — arquivos de Saídas reais chegam a dezenas de milhares
// de itens. Só a aba "Divergências" (testado contra dado real: arquivo
// de 64 mil linhas com todos os itens gerava 34 MB e 22s de geração —
// grande demais pra um response de função serverless). Uma aba com TODAS
// as linhas, mesmo sem divergência, fica pra uma exportação dedicada
// futura (provavelmente CSV, mais compacto) se for pedida.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  if (!canAccess(session.currentRole, 'analiseFiscal')) {
    return NextResponse.json({ error: 'Sem permissão para este módulo.' }, { status: 403 });
  }

  const apuracao = await prisma.analiseFiscalSaidaApuracao.findUnique({ where: { id: params.id } });
  if (!apuracao || apuracao.companyId !== session.currentCompanyId) {
    return NextResponse.json({ error: 'Apuração não encontrada.' }, { status: 404 });
  }

  const itensDivergentes = await prisma.analiseFiscalSaidaItem.findMany({
    where: { apuracaoId: params.id, divergencias: { some: {} } },
    orderBy: { linha: 'asc' },
    select: {
      linha: true, numeroNf: true, tes: true, produtoDescricao: true, cliente: true, cnpjCpf: true, cfop: true, uf: true,
      divergencias: { select: { severidade: true, tipo: true, regraEsperada: true, informacaoEncontrada: true, motivo: true, sugestaoCorrecao: true } },
    },
  });

  const wsDivergencias = XLSX.utils.json_to_sheet(
    itensDivergentes.flatMap((item) =>
      item.divergencias.map((d) => ({
        'Linha': item.linha,
        'Nota Fiscal': item.numeroNf || '',
        'TES': item.tes,
        'Produto': item.produtoDescricao || '',
        'Cliente': item.cliente || '',
        'CNPJ/CPF': item.cnpjCpf || '',
        'CFOP': item.cfop || '',
        'UF': item.uf || '',
        'Severidade': SEVERIDADE_LABEL[d.severidade] || d.severidade,
        'Tipo': d.tipo,
        'Regra Esperada': d.regraEsperada,
        'Informação Encontrada': d.informacaoEncontrada,
        'Motivo': d.motivo,
        'Sugestão de Correção': d.sugestaoCorrecao || '',
      }))
    )
  );

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsDivergencias, 'Divergências');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="Analise_Fiscal_Saidas_${(apuracao.periodo || apuracao.id).replace(/[/\\]/g, '-')}.xlsx"`,
    },
  });
}
