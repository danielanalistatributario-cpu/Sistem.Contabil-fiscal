// Apuração Fiscal (Livro de Apuração do ICMS) — agregação por CFOP e
// mecânica do Resumo da Apuração (itens 001-014, no padrão do Registro
// de Apuração do ICMS/SPED). Não duplica dado fiscal: tudo aqui é
// recalculado ao vivo a partir dos itens já persistidos em
// AnaliseFiscalItem/AnaliseFiscalSaidaItem — só os vínculos, os
// lançamentos manuais e o saldo credor anterior são guardados de fato
// (ver AnaliseFiscalApuracaoIcms no schema).

import { prisma } from './db';

export type Direcao = 'entrada' | 'saida';

export type LinhaCfop = {
  cfop: string;
  valorContabil: number;
  baseIcms: number;
  valorIcms: number;
  isento: number;
  baseOutros: number;
};

export type RegistroIcms = {
  linhas: LinhaCfop[];
  totais: Omit<LinhaCfop, 'cfop'>;
};

const SOMA_VAZIA = { valorContabil: 0, baseIcms: 0, valorIcms: 0, isento: 0, baseOutros: 0 };

function somar(a: Omit<LinhaCfop, 'cfop'>, b: Omit<LinhaCfop, 'cfop'>): Omit<LinhaCfop, 'cfop'> {
  return {
    valorContabil: a.valorContabil + b.valorContabil,
    baseIcms: a.baseIcms + b.baseIcms,
    valorIcms: a.valorIcms + b.valorIcms,
    isento: a.isento + b.isento,
    baseOutros: a.baseOutros + b.baseOutros,
  };
}

// Agrupa os itens de uma apuração de Entrada ou Saída por CFOP, somando
// exatamente as colunas do Registro de Apuração do ICMS real (Base de
// Cálculo / Imposto Creditado ou Debitado / Isentas ou Não Tributadas /
// Outras). Só uma linha por CFOP + o total geral — sem totalizadores
// intermediários por UF, a pedido do usuário ("não é preciso ter o
// totalizador das operações internas").
//
// Valores Contábeis não vem pronto do relatório do Protheus (não existe
// essa coluna separada no layout real — ver analise-fiscal-reader.ts).
// A pedido do usuário: na Entrada é calculado como
// Total - Desconto + Frete + Despesa + Seguro; na Saída é direto o valor
// da coluna Total do relatório.
export async function agregarIcmsPorCfop(apuracaoId: string, direcao: Direcao): Promise<RegistroIcms> {
  let linhas: LinhaCfop[];

  if (direcao === 'entrada') {
    const grupos = await prisma.analiseFiscalItem.groupBy({
      by: ['cfop'],
      where: { apuracaoId, cfop: { not: null } },
      _sum: { total: true, desconto: true, frete: true, despesa: true, seguro: true, baseIcms: true, valorIcms: true, isento: true, baseOutros: true },
    });
    linhas = grupos
      .filter((g) => g.cfop)
      .map((g) => ({
        cfop: g.cfop as string,
        valorContabil: (g._sum.total || 0) - (g._sum.desconto || 0) + (g._sum.frete || 0) + (g._sum.despesa || 0) + (g._sum.seguro || 0),
        baseIcms: g._sum.baseIcms || 0,
        valorIcms: g._sum.valorIcms || 0,
        isento: g._sum.isento || 0,
        baseOutros: g._sum.baseOutros || 0,
      }));
  } else {
    const grupos = await prisma.analiseFiscalSaidaItem.groupBy({
      by: ['cfop'],
      where: { apuracaoId, cfop: { not: null } },
      _sum: { total: true, baseIcms: true, valorIcms: true, isento: true, baseOutros: true },
    });
    linhas = grupos
      .filter((g) => g.cfop)
      .map((g) => ({
        cfop: g.cfop as string,
        valorContabil: g._sum.total || 0,
        baseIcms: g._sum.baseIcms || 0,
        valorIcms: g._sum.valorIcms || 0,
        isento: g._sum.isento || 0,
        baseOutros: g._sum.baseOutros || 0,
      }));
  }

  linhas.sort((a, b) => parseInt(a.cfop, 10) - parseInt(b.cfop, 10) || a.cfop.localeCompare(b.cfop));
  const totais = linhas.reduce((acc, l) => somar(acc, l), { ...SOMA_VAZIA });

  return { linhas, totais };
}

// Total de ICMS (creditado ou debitado, conforme a direção) de uma
// apuração — mesmo número da linha TOTAIS de agregarIcmsPorCfop, exposto
// direto pra alimentar os itens 001/005 do Resumo sem precisar montar a
// tabela inteira.
export async function somaIcms(apuracaoId: string, direcao: Direcao): Promise<number> {
  const resultado = direcao === 'entrada'
    ? await prisma.analiseFiscalItem.aggregate({ where: { apuracaoId }, _sum: { valorIcms: true } })
    : await prisma.analiseFiscalSaidaItem.aggregate({ where: { apuracaoId }, _sum: { valorIcms: true } });
  return resultado._sum.valorIcms || 0;
}

export type CategoriaLancamento = 'OUTROS_DEBITOS' | 'ESTORNO_CREDITOS' | 'OUTROS_CREDITOS' | 'ESTORNO_DEBITOS' | 'DEDUCOES';

export type LancamentoManual = {
  id?: string;
  categoria: CategoriaLancamento;
  descricao: string;
  valor: number;
  ordem: number;
};

export type ResumoApuracaoIcms = {
  // Débito do imposto
  porSaidasComDebito: number; // 001
  outrosDebitos: number; // 002
  estornoCreditos: number; // 003
  subTotalDebito: number; // 004
  // Crédito do imposto
  porEntradasComCredito: number; // 005
  outrosCreditos: number; // 006
  estornoDebitos: number; // 007
  subTotalCredito: number; // 008
  saldoCredorAnterior: number; // 009
  totalCredito: number; // 010
  // Apuração do saldo
  saldoDevedor: number; // 011
  deducoes: number; // 012
  impostoARecolher: number; // 013
  saldoCredorTransportar: number; // 014
};

function somaCategoria(lancamentos: LancamentoManual[], categoria: CategoriaLancamento): number {
  return lancamentos.filter((l) => l.categoria === categoria).reduce((acc, l) => acc + l.valor, 0);
}

// Mecânica do Resumo da Apuração do Imposto (itens 001-014), validada à
// mão contra um Registro de Apuração do ICMS real (bateu exatamente:
// 004=457.956,91, 010=929.333,39, 014=471.376,48 para os mesmos valores
// de entrada).
export function calcularResumoApuracao(params: {
  porSaidasComDebito: number;
  porEntradasComCredito: number;
  lancamentos: LancamentoManual[];
  saldoCredorAnterior: number;
}): ResumoApuracaoIcms {
  const { porSaidasComDebito, porEntradasComCredito, lancamentos, saldoCredorAnterior } = params;

  const outrosDebitos = somaCategoria(lancamentos, 'OUTROS_DEBITOS');
  const estornoCreditos = somaCategoria(lancamentos, 'ESTORNO_CREDITOS');
  const subTotalDebito = porSaidasComDebito + outrosDebitos + estornoCreditos;

  const outrosCreditos = somaCategoria(lancamentos, 'OUTROS_CREDITOS');
  const estornoDebitos = somaCategoria(lancamentos, 'ESTORNO_DEBITOS');
  const subTotalCredito = porEntradasComCredito + outrosCreditos + estornoDebitos;
  const totalCredito = subTotalCredito + saldoCredorAnterior;

  const deducoes = somaCategoria(lancamentos, 'DEDUCOES');

  let saldoDevedor = 0;
  let impostoARecolher = 0;
  let saldoCredorTransportar = 0;

  if (subTotalDebito > totalCredito) {
    saldoDevedor = subTotalDebito - totalCredito;
    impostoARecolher = Math.max(saldoDevedor - deducoes, 0);
  } else {
    saldoCredorTransportar = totalCredito - subTotalDebito;
  }

  return {
    porSaidasComDebito,
    outrosDebitos,
    estornoCreditos,
    subTotalDebito,
    porEntradasComCredito,
    outrosCreditos,
    estornoDebitos,
    subTotalCredito,
    saldoCredorAnterior,
    totalCredito,
    saldoDevedor,
    deducoes,
    impostoARecolher,
    saldoCredorTransportar,
  };
}

// Recalcula o Resumo (001-014) de uma AnaliseFiscalApuracaoIcms já
// persistida, a partir dos vínculos e lançamentos guardados — usado
// tanto pra exibir uma apuração quanto pra sugerir o saldo credor
// anterior (009) da próxima, encadeando os períodos como no livro real.
export async function montarResumoCompleto(apuracaoIcmsId: string): Promise<ResumoApuracaoIcms | null> {
  const apuracao = await prisma.analiseFiscalApuracaoIcms.findUnique({
    where: { id: apuracaoIcmsId },
    include: { lancamentos: true },
  });
  if (!apuracao) return null;

  const [porSaidasComDebito, porEntradasComCredito] = await Promise.all([
    apuracao.saidaApuracaoId ? somaIcms(apuracao.saidaApuracaoId, 'saida') : Promise.resolve(0),
    apuracao.entradaApuracaoId ? somaIcms(apuracao.entradaApuracaoId, 'entrada') : Promise.resolve(0),
  ]);

  return calcularResumoApuracao({
    porSaidasComDebito,
    porEntradasComCredito,
    lancamentos: apuracao.lancamentos.map((l) => ({
      id: l.id,
      categoria: l.categoria as CategoriaLancamento,
      descricao: l.descricao,
      valor: l.valor,
      ordem: l.ordem,
    })),
    saldoCredorAnterior: apuracao.saldoCredorAnterior,
  });
}

// Sugestão (editável) de saldo credor anterior pra uma nova apuração:
// pega o 014 (saldo credor a transportar) da apuração fiscal mais
// recente da empresa. Sem apuração anterior, começa em 0.
export async function sugerirSaldoCredorAnterior(companyId: string): Promise<number> {
  const anterior = await prisma.analiseFiscalApuracaoIcms.findFirst({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  if (!anterior) return 0;
  const resumo = await montarResumoCompleto(anterior.id);
  return resumo?.saldoCredorTransportar || 0;
}

// Lançamentos padrão de toda apuração nova — os 3 campos pedidos
// explicitamente, prontos pra preencher (valor 0, editável). O usuário
// pode adicionar outras linhas (ex.: "Estorno de Crédito") ou remover
// estas quando não usar.
export const LANCAMENTOS_PADRAO: Omit<LancamentoManual, 'id'>[] = [
  { categoria: 'OUTROS_DEBITOS', descricao: 'Diferença de Imposto Devido', valor: 0, ordem: 0 },
  { categoria: 'OUTROS_CREDITOS', descricao: 'Antecipação Especial do Imposto', valor: 0, ordem: 0 },
  { categoria: 'OUTROS_CREDITOS', descricao: 'Crédito Presumido — Decorrente de Resolução', valor: 0, ordem: 1 },
];

export type CandidatoApuracao = {
  id: string;
  periodo: string | null;
  fileName: string | null;
  processedAt: Date;
  totalLinhas: number;
};

// Busca, pra uma empresa+período, as análises de Entrada e de Saída já
// processadas cujo campo `periodo` bate (case-insensitive, trim) — usado
// pro vínculo automático da Apuração Fiscal. período é texto livre
// digitado em cada análise, então pode haver 0, 1 ou vários candidatos
// de cada lado; quem chama decide o que fazer com cada caso.
export async function buscarCandidatosPeriodo(
  companyId: string,
  periodo: string
): Promise<{ entrada: CandidatoApuracao[]; saida: CandidatoApuracao[] }> {
  const periodoNormalizado = periodo.trim();

  const [entrada, saida] = await Promise.all([
    prisma.analiseFiscalApuracao.findMany({
      where: { companyId, periodo: { equals: periodoNormalizado, mode: 'insensitive' } },
      orderBy: { processedAt: 'desc' },
      select: { id: true, periodo: true, fileName: true, processedAt: true, totalLinhas: true },
    }),
    prisma.analiseFiscalSaidaApuracao.findMany({
      where: { companyId, periodo: { equals: periodoNormalizado, mode: 'insensitive' }, status: 'CONCLUIDA' },
      orderBy: { processedAt: 'desc' },
      select: { id: true, periodo: true, fileName: true, processedAt: true, totalLinhas: true },
    }),
  ]);

  return { entrada, saida };
}
