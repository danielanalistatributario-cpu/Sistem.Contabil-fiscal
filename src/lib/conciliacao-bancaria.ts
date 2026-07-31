// Motor de Conciliação Bancária: compara o Razão da conta Banco com o
// Extrato Bancário do mesmo período, reproduzindo o processo real de um
// contador no fechamento — sem IA, só regras determinísticas e explicáveis.
//
// Etapas (nesta ordem):
// 1. Comparação de saldo dia a dia (o primeiro ponto que o contador confere).
// 2. Pareamento de lançamentos: exato (mesma data e valor), por competência
//    (mesmo valor, data próxima), e por agrupamento (um lançamento de um
//    lado corresponde à soma de vários do outro lado — ex: uma venda de
//    R$100 registrada como um lançamento no Razão mas recebida em duas
//    parcelas de R$50 no extrato).
// 3. Lançamentos que sobraram sem par são classificados e, no caso do
//    extrato, têm a natureza provável sugerida por palavra-chave no
//    histórico (tarifa, PIX, TED, IOF, juros, etc.).

export const TOLERANCIA_VALOR = 0.01;
const JANELA_DIAS_COMPETENCIA = 3; // diferença de datas aceitável para "mesma competência"
const TAMANHO_MAX_GRUPO = 4; // máximo de itens somados ao procurar um agrupamento N:1

export type LancamentoConta = {
  data: Date | null;
  historico: string;
  valor: number; // positivo = entrada (aumenta o saldo), negativo = saída
  saldo: number | null; // saldo corrente após o lançamento, se disponível na fonte
};

export type StatusItem = 'CONCILIADO' | 'CONCILIADO_GRUPO' | 'DIF_COMPETENCIA' | 'PENDENTE';

export type ItemConciliado = {
  origem: 'RAZAO' | 'EXTRATO';
  data: Date | null;
  historico: string;
  valor: number;
  status: StatusItem;
  grupoRef: string | null;
  duplicadoSuspeito: boolean;
  observacao: string | null;
};

export type DiaComparado = {
  data: Date;
  saldoRazao: number | null;
  saldoExtrato: number | null;
  diferenca: number | null;
};

export type ResultadoConciliacaoBancaria = {
  saldoInicial: number;
  saldoFinalRazao: number;
  saldoFinalExtrato: number;
  diferencaSaldoFinal: number;
  dias: DiaComparado[];
  itens: ItemConciliado[];
  totais: {
    totalRazao: number;
    totalExtrato: number;
    totalConciliados: number;
    totalPendentes: number;
    valorPendenteRazao: number;
    valorPendenteExtrato: number;
  };
};

// Dicionário de palavras-chave para sugerir a natureza provável de um
// lançamento do extrato ainda não contabilizado.
const CATEGORIAS_EXTRATO: { categoria: string; palavras: string[] }[] = [
  { categoria: 'Tarifa bancária', palavras: ['tarifa', 'taxa banc', 'manutencao de conta', 'cesta de servicos'] },
  { categoria: 'Encargo financeiro (juros/IOF)', palavras: ['juros', 'iof', 'encargo', 'multa'] },
  { categoria: 'Rendimento de aplicação financeira', palavras: ['rendimento', 'aplicacao', 'contamax', 'resgate'] },
  { categoria: 'Pagamento de salário/folha', palavras: ['salario', 'folha', 'pagsal', 'ferias', 'decimo terceiro'] },
  { categoria: 'PIX/TED/transferência recebida', palavras: ['pix recebido', 'ted recebida', 'dep dinheiro', 'dep cheque', 'deposito'] },
  { categoria: 'PIX/TED/transferência enviada', palavras: ['pix enviado', 'ted enviada', 'transf valor', 'transferencia entre contas'] },
  { categoria: 'Pagamento a fornecedor / título', palavras: ['pagamento de titulo', 'pagamento a fornecedor', 'boleto'] },
];

function sugerirCategoria(historico: string): string | null {
  const h = historico.toLowerCase();
  for (const { categoria, palavras } of CATEGORIAS_EXTRATO) {
    if (palavras.some((p) => h.includes(p))) return categoria;
  }
  return null;
}

function diffDias(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24);
}

type PoolItem = {
  idx: number;
  data: Date | null;
  historico: string;
  valor: number;
  matched: boolean;
};

function marcarDuplicados(pool: PoolItem[]): Set<number> {
  const contagem: Record<string, number[]> = {};
  pool.forEach((item) => {
    if (!item.data) return;
    const chave = `${item.data.toISOString().slice(0, 10)}|${item.valor.toFixed(2)}`;
    if (!contagem[chave]) contagem[chave] = [];
    contagem[chave].push(item.idx);
  });
  const duplicados = new Set<number>();
  Object.values(contagem).forEach((idxs) => {
    if (idxs.length > 1) idxs.forEach((i) => duplicados.add(i));
  });
  return duplicados;
}

// procura uma combinação de até TAMANHO_MAX_GRUPO itens não pareados, dentro
// da janela de dias, cuja soma bata com o alvo (tolerância de 1 centavo)
function buscarGrupo(candidatos: PoolItem[], alvoData: Date | null, alvoValor: number): PoolItem[] | null {
  const janela = candidatos.filter(
    (c) => !c.matched && (!alvoData || !c.data || diffDias(alvoData, c.data) <= JANELA_DIAS_COMPETENCIA)
  );
  if (janela.length < 2) return null;

  function combinar(inicio: number, atuais: PoolItem[], soma: number): PoolItem[] | null {
    if (atuais.length > 1 && Math.abs(soma - alvoValor) < TOLERANCIA_VALOR) return atuais;
    if (atuais.length >= TAMANHO_MAX_GRUPO) return null;
    for (let i = inicio; i < janela.length; i++) {
      const encontrado = combinar(i + 1, [...atuais, janela[i]], soma + janela[i].valor);
      if (encontrado) return encontrado;
    }
    return null;
  }

  return combinar(0, [], 0);
}

export function processarConciliacaoBancaria(
  razao: LancamentoConta[],
  extrato: LancamentoConta[],
  saldoInicialInformado: number | null
): ResultadoConciliacaoBancaria {
  // --- 1. Saldo dia a dia ---
  const saldoPorDiaRazao = new Map<string, number>();
  razao.forEach((l) => {
    if (l.data && l.saldo !== null) saldoPorDiaRazao.set(l.data.toISOString().slice(0, 10), l.saldo);
  });
  const saldoPorDiaExtrato = new Map<string, number>();
  extrato.forEach((l) => {
    if (l.data && l.saldo !== null) saldoPorDiaExtrato.set(l.data.toISOString().slice(0, 10), l.saldo);
  });
  const todasDatas = Array.from(new Set([...saldoPorDiaRazao.keys(), ...saldoPorDiaExtrato.keys()])).sort();
  const dias: DiaComparado[] = todasDatas.map((d) => {
    const sr = saldoPorDiaRazao.get(d) ?? null;
    const se = saldoPorDiaExtrato.get(d) ?? null;
    return { data: new Date(d), saldoRazao: sr, saldoExtrato: se, diferenca: sr !== null && se !== null ? sr - se : null };
  });

  const saldoFinalRazao = dias.length > 0 ? dias[dias.length - 1].saldoRazao ?? 0 : 0;
  const saldoFinalExtrato = dias.length > 0 ? dias[dias.length - 1].saldoExtrato ?? 0 : 0;
  const saldoInicial = saldoInicialInformado ?? 0;

  // --- 2. Pareamento de lançamentos ---
  const razaoPool: PoolItem[] = razao.map((l, idx) => ({ idx, data: l.data, historico: l.historico, valor: l.valor, matched: false }));
  const extratoPool: PoolItem[] = extrato.map((l, idx) => ({ idx, data: l.data, historico: l.historico, valor: l.valor, matched: false }));

  const duplicadosRazao = marcarDuplicados(razaoPool);
  const duplicadosExtrato = marcarDuplicados(extratoPool);

  const resultadoItens = new Map<string, ItemConciliado>(); // chave: "RAZAO-idx" | "EXTRATO-idx"
  let grupoContador = 0;

  function definirItem(origem: 'RAZAO' | 'EXTRATO', item: PoolItem, status: StatusItem, grupoRef: string | null, observacao: string | null) {
    const duplicadoSuspeito = origem === 'RAZAO' ? duplicadosRazao.has(item.idx) : duplicadosExtrato.has(item.idx);
    resultadoItens.set(`${origem}-${item.idx}`, {
      origem,
      data: item.data,
      historico: item.historico,
      valor: item.valor,
      status,
      grupoRef,
      duplicadoSuspeito,
      observacao,
    });
  }

  // Passo A — pareamento exato (mesma data, mesmo valor)
  for (const r of razaoPool) {
    if (r.matched) continue;
    const par = extratoPool.find((e) => !e.matched && r.data && e.data && diffDias(r.data, e.data) === 0 && Math.abs(e.valor - r.valor) < TOLERANCIA_VALOR);
    if (par) {
      r.matched = true;
      par.matched = true;
      definirItem('RAZAO', r, 'CONCILIADO', null, null);
      definirItem('EXTRATO', par, 'CONCILIADO', null, null);
    }
  }

  // Passo B — mesma valor, data próxima (diferença de competência)
  for (const r of razaoPool) {
    if (r.matched) continue;
    const par = extratoPool.find(
      (e) => !e.matched && r.data && e.data && diffDias(r.data, e.data) > 0 && diffDias(r.data, e.data) <= JANELA_DIAS_COMPETENCIA && Math.abs(e.valor - r.valor) < TOLERANCIA_VALOR
    );
    if (par) {
      r.matched = true;
      par.matched = true;
      const dias_diff = r.data && par.data ? Math.round(diffDias(r.data, par.data)) : 0;
      const obs = `Mesmo valor, com ${dias_diff} dia(s) de diferença entre Razão e Extrato — provável diferença de competência.`;
      definirItem('RAZAO', r, 'DIF_COMPETENCIA', null, obs);
      definirItem('EXTRATO', par, 'DIF_COMPETENCIA', null, obs);
    }
  }

  // Passo C — agrupamento N:1 e 1:N (dentro da janela de dias)
  for (const r of razaoPool) {
    if (r.matched) continue;
    const grupo = buscarGrupo(extratoPool, r.data, r.valor);
    if (grupo) {
      grupoContador++;
      const ref = `G${grupoContador}`;
      r.matched = true;
      grupo.forEach((g) => (g.matched = true));
      const obs = `Lançamento do Razão corresponde à soma de ${grupo.length} lançamento(s) do Extrato.`;
      definirItem('RAZAO', r, 'CONCILIADO_GRUPO', ref, obs);
      grupo.forEach((g) => definirItem('EXTRATO', g, 'CONCILIADO_GRUPO', ref, `Faz parte de um grupo que soma um lançamento do Razão (${ref}).`));
    }
  }
  for (const e of extratoPool) {
    if (e.matched) continue;
    const grupo = buscarGrupo(razaoPool, e.data, e.valor);
    if (grupo) {
      grupoContador++;
      const ref = `G${grupoContador}`;
      e.matched = true;
      grupo.forEach((g) => (g.matched = true));
      const obs = `Lançamento do Extrato corresponde à soma de ${grupo.length} lançamento(s) do Razão.`;
      definirItem('EXTRATO', e, 'CONCILIADO_GRUPO', ref, obs);
      grupo.forEach((g) => definirItem('RAZAO', g, 'CONCILIADO_GRUPO', ref, `Faz parte de um grupo que soma um lançamento do Extrato (${ref}).`));
    }
  }

  // Passo D — sobras: pendentes
  for (const r of razaoPool) {
    if (!r.matched) {
      const dupNote = duplicadosRazao.has(r.idx) ? ' Atenção: pode ser lançamento duplicado (mesma data e valor aparecem mais de uma vez no Razão).' : '';
      definirItem(
        'RAZAO',
        r,
        'PENDENTE',
        null,
        `Contabilizado no Razão, mas não localizado no Extrato — verificar se é cheque não compensado ou lançamento em outra competência.${dupNote}`
      );
    }
  }
  for (const e of extratoPool) {
    if (!e.matched) {
      const categoria = sugerirCategoria(e.historico);
      const dupNote = duplicadosExtrato.has(e.idx) ? ' Atenção: pode ser lançamento duplicado (mesma data e valor aparecem mais de uma vez no Extrato).' : '';
      const sugestao = categoria
        ? `Movimentação bancária provavelmente ainda não contabilizada (${categoria}).`
        : 'Movimentação bancária ainda não localizada no Razão — revisar se já foi contabilizada.';
      definirItem('EXTRATO', e, 'PENDENTE', null, `${sugestao}${dupNote}`);
    }
  }

  const itens = Array.from(resultadoItens.values()).sort((a, b) => (a.data && b.data ? a.data.getTime() - b.data.getTime() : 0));

  const totalConciliados = itens.filter((i) => i.status === 'CONCILIADO' || i.status === 'CONCILIADO_GRUPO' || i.status === 'DIF_COMPETENCIA').length;
  const pendentes = itens.filter((i) => i.status === 'PENDENTE');
  const valorPendenteRazao = pendentes.filter((i) => i.origem === 'RAZAO').reduce((s, i) => s + i.valor, 0);
  const valorPendenteExtrato = pendentes.filter((i) => i.origem === 'EXTRATO').reduce((s, i) => s + i.valor, 0);

  return {
    saldoInicial,
    saldoFinalRazao,
    saldoFinalExtrato,
    diferencaSaldoFinal: saldoFinalRazao - saldoFinalExtrato,
    dias,
    itens,
    totais: {
      totalRazao: razao.length,
      totalExtrato: extrato.length,
      totalConciliados,
      totalPendentes: pendentes.length,
      valorPendenteRazao,
      valorPendenteExtrato,
    },
  };
}
