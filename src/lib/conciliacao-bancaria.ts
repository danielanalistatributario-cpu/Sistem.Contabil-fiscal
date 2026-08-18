// Motor de Conciliação Bancária: compara o Razão da conta Banco com o
// Extrato Bancário do mesmo período, reproduzindo o processo real de um
// contador no fechamento — sem IA, só regras determinísticas e explicáveis.
//
// Etapas (nesta ordem):
// 0. (Opcional) Reconhecimento de aplicação financeira automática (ex:
//    resgate/aplicação diária de um fundo tipo CONTAMAX) — lançamentos do
//    Razão que normalmente não aparecem detalhados no extrato bancário.
// 1. Comparação de saldo dia a dia (o primeiro ponto que o contador confere).
// 2. Pareamento de lançamentos: exato (mesma data e valor), por competência
//    (mesmo valor, data próxima), e por agrupamento — um lançamento de um
//    lado corresponde à soma de vários do outro lado. O agrupamento tenta
//    primeiro pelo código de "Documento" do banco (quando a fonte tiver essa
//    coluna — vários lançamentos do mesmo lote/documento somando um
//    lançamento do Razão), e só recorre à busca por soma de subconjunto
//    (meet-in-the-middle, com teto de segurança) quando isso não resolve.
// 3. Lançamentos que sobraram sem par são classificados e, no caso do
//    extrato, têm a natureza provável sugerida por palavra-chave no
//    histórico (tarifa, PIX, TED, IOF, juros, etc.).

import { normalize } from './icms-rules';

export const TOLERANCIA_VALOR = 0.01;
const JANELA_DIAS_COMPETENCIA = 3; // diferença de datas aceitável para "mesma competência"
const CAP_JANELA_GRUPO = 24; // trava de segurança: nunca busca combinação em janelas maiores que isso (evita travamento)

export type LancamentoConta = {
  data: Date | null;
  historico: string;
  valor: number; // positivo = entrada (aumenta o saldo), negativo = saída
  saldo: number | null; // saldo corrente após o lançamento, se disponível na fonte
  documento?: string | null; // código de lote/documento do banco, quando a fonte tiver essa coluna (ex: Santander)
};

export type StatusItem = 'CONCILIADO' | 'CONCILIADO_GRUPO' | 'DIF_COMPETENCIA' | 'APLICACAO_AUTOMATICA' | 'PENDENTE';

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
    totalEntradaRazao: number;
    totalSaidaRazao: number;
    totalEntradaExtrato: number;
    totalSaidaExtrato: number;
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

// Reconhece lançamentos de resgate/aplicação automática de fundo de
// investimento (ex: CONTAMAX no Santander, mas o padrão é genérico o
// suficiente para outros bancos/fundos) — tipicamente uma movimentação
// interna entre a conta corrente e uma aplicação automática do próprio
// banco, que não aparece detalhada no extrato (só o rendimento diário
// aparece, como um lançamento pequeno separado).
function detectarAplicacaoAutomatica(historico: string): 'RESGATE' | 'APLICACAO' | null {
  const h = normalize(historico);
  if (h.startsWith('resgate') && h.includes('automat')) return 'RESGATE';
  if (h.startsWith('aplicacao')) return 'APLICACAO';
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
  documento: string | null;
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

// Fase C1 do agrupamento — por código de "Documento" do banco (determinístico,
// ~O(n)): vários lançamentos de um lado que compartilham o mesmo Documento
// (ex: um lote de boletos pagos juntos) e cuja soma bate com um lançamento
// ainda não pareado do outro lado. Só é útil quando a fonte tem essa coluna
// (hoje: Extrato); quando não tem, simplesmente não encontra nada e a
// Fase C2 assume sozinha, como já acontecia antes.
function agruparPorDocumento(alvoPool: PoolItem[], docPool: PoolItem[]): { alvo: PoolItem; grupo: PoolItem[] }[] {
  const buckets = new Map<string, PoolItem[]>();
  for (const item of docPool) {
    if (item.matched || !item.documento) continue;
    const lista = buckets.get(item.documento) ?? [];
    lista.push(item);
    buckets.set(item.documento, lista);
  }

  const porValor = new Map<number, PoolItem[]>();
  for (const item of alvoPool) {
    if (item.matched) continue;
    const chave = Math.round(item.valor * 100);
    const lista = porValor.get(chave) ?? [];
    lista.push(item);
    porValor.set(chave, lista);
  }

  const achados: { alvo: PoolItem; grupo: PoolItem[] }[] = [];
  for (const itens of buckets.values()) {
    if (itens.length < 2) continue;
    const somaCents = itens.reduce((s, i) => s + Math.round(i.valor * 100), 0);
    const candidatos = (porValor.get(somaCents) ?? []).filter((c) => !c.matched);
    if (candidatos.length === 0) continue;
    const dataMediaMs = itens.reduce((s, i) => s + (i.data?.getTime() ?? 0), 0) / itens.length;
    candidatos.sort((a, b) => Math.abs((a.data?.getTime() ?? 0) - dataMediaMs) - Math.abs((b.data?.getTime() ?? 0) - dataMediaMs));
    achados.push({ alvo: candidatos[0], grupo: itens });
  }
  return achados;
}

// Fase C2 do agrupamento — busca por soma de subconjunto quando o Documento
// não resolveu. Usa meet-in-the-middle sobre centavos inteiros (evita deriva
// de ponto flutuante, e o custo é exponencial só no número de candidatos da
// janela — não no valor em R$). CAP_JANELA_GRUPO garante que nunca trava,
// mesmo em arquivos grandes: acima do teto, simplesmente não tenta combinar
// (os itens ficam como pendentes individuais, revisáveis manualmente).
function buscarGrupoRapido(candidatos: PoolItem[], alvoData: Date | null, alvoValor: number): PoolItem[] | null {
  const mesmoSinal = (v: number) => (alvoValor >= 0 ? v > 0 : v < 0);
  const janela = candidatos.filter(
    (c) => !c.matched && mesmoSinal(c.valor) && (!alvoData || !c.data || diffDias(alvoData, c.data) <= JANELA_DIAS_COMPETENCIA)
  );
  if (janela.length < 2 || janela.length > CAP_JANELA_GRUPO) return null;

  const alvoCents = Math.round(alvoValor * 100);
  const meio = Math.ceil(janela.length / 2);
  const esq = janela.slice(0, meio);
  const dir = janela.slice(meio);

  // Teto de QUALIDADE (distinto do CAP_JANELA_GRUPO, que é só de performance):
  // quanto maior a janela de candidatos, maior a chance de um subconjunto
  // grande bater por coincidência com o valor alvo (confirmado na prática:
  // sem este teto, um resgate de aplicação de R$ 64.673,29 "casou" com 9
  // lançamentos de extrato completamente não relacionados que somavam o
  // mesmo valor). Mantém o mesmo limite conservador de 4 pernas que o
  // algoritmo original já usava, mas agora combinado com busca eficiente.
  const TAMANHO_MAX_GRUPO_FALLBACK = 4;

  function todasSomas(itens: PoolItem[]): Map<number, { mask: number; bits: number }> {
    const mapa = new Map<number, { mask: number; bits: number }>();
    for (let mask = 1; mask < 1 << itens.length; mask++) {
      let soma = 0;
      let bits = 0;
      for (let i = 0; i < itens.length; i++) {
        if (mask & (1 << i)) {
          soma += Math.round(itens[i].valor * 100);
          bits++;
        }
      }
      if (bits > TAMANHO_MAX_GRUPO_FALLBACK) continue;
      const atual = mapa.get(soma);
      if (!atual || atual.bits > bits) mapa.set(soma, { mask, bits });
    }
    return mapa;
  }
  const toItens = (mask: number, itens: PoolItem[]) => itens.filter((_, i) => mask & (1 << i));

  const somasEsq = todasSomas(esq);
  const somasDir = todasSomas(dir);

  // Entre todas as combinações válidas (dentro do teto de pernas), escolhe a
  // de menor número de itens — resultado determinístico e o mais provável de
  // ser o agrupamento real, não uma coincidência.
  const candidatosValidos: { itens: PoolItem[]; bits: number }[] = [];
  const considerar = (itens: PoolItem[], bits: number) => {
    if (bits >= 2 && bits <= TAMANHO_MAX_GRUPO_FALLBACK) candidatosValidos.push({ itens, bits });
  };

  const soEsq = somasEsq.get(alvoCents);
  if (soEsq) considerar(toItens(soEsq.mask, esq), soEsq.bits);
  const soDir = somasDir.get(alvoCents);
  if (soDir) considerar(toItens(soDir.mask, dir), soDir.bits);
  for (const [somaE, e] of somasEsq) {
    const d = somasDir.get(alvoCents - somaE);
    if (d) considerar([...toItens(e.mask, esq), ...toItens(d.mask, dir)], e.bits + d.bits);
  }

  if (candidatosValidos.length === 0) return null;
  candidatosValidos.sort((a, b) => a.bits - b.bits);
  return candidatosValidos[0].itens;
}

export function processarConciliacaoBancaria(
  razao: LancamentoConta[],
  extrato: LancamentoConta[],
  saldoInicialInformado: number | null,
  opcoes?: { incluirAplicacaoAutomatica?: boolean }
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
  const razaoPool: PoolItem[] = razao.map((l, idx) => ({ idx, data: l.data, historico: l.historico, valor: l.valor, documento: l.documento ?? null, matched: false }));
  const extratoPool: PoolItem[] = extrato.map((l, idx) => ({ idx, data: l.data, historico: l.historico, valor: l.valor, documento: l.documento ?? null, matched: false }));

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

  // Passo A0 — reconhecimento de aplicação financeira automática (opcional)
  if (opcoes?.incluirAplicacaoAutomatica) {
    for (const r of razaoPool) {
      if (r.matched) continue;
      const tipo = detectarAplicacaoAutomatica(r.historico);
      if (!tipo) continue;
      r.matched = true;
      const obs =
        tipo === 'RESGATE'
          ? 'Reconhecido automaticamente como resgate de aplicação financeira automática — movimentação interna que normalmente não aparece detalhada no extrato bancário.'
          : 'Reconhecido automaticamente como aplicação financeira automática — movimentação interna que normalmente não aparece detalhada no extrato bancário.';
      definirItem('RAZAO', r, 'APLICACAO_AUTOMATICA', null, obs);
    }
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

  // Passo C — agrupamento N:1 e 1:N
  // C1: por Documento do Extrato (determinístico) — resolve lotes de
  // pagamento que somam um lançamento do Razão.
  for (const { alvo, grupo } of agruparPorDocumento(razaoPool, extratoPool)) {
    if (alvo.matched || grupo.some((g) => g.matched)) continue;
    grupoContador++;
    const ref = `G${grupoContador}`;
    alvo.matched = true;
    grupo.forEach((g) => (g.matched = true));
    const doc = grupo[0].documento;
    definirItem('RAZAO', alvo, 'CONCILIADO_GRUPO', ref, `Lançamentos do Extrato com o mesmo Documento (${doc}) somam este lançamento do Razão.`);
    grupo.forEach((g) => definirItem('EXTRATO', g, 'CONCILIADO_GRUPO', ref, `Faz parte de um lote (Documento ${doc}) que soma um lançamento do Razão (${ref}).`));
  }

  // C2: por soma de subconjunto (janela de dias, sem Documento ou quando ele não resolveu)
  for (const r of razaoPool) {
    if (r.matched) continue;
    const grupo = buscarGrupoRapido(extratoPool, r.data, r.valor);
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
    const grupo = buscarGrupoRapido(razaoPool, e.data, e.valor);
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

  const totalConciliados = itens.filter(
    (i) => i.status === 'CONCILIADO' || i.status === 'CONCILIADO_GRUPO' || i.status === 'DIF_COMPETENCIA' || i.status === 'APLICACAO_AUTOMATICA'
  ).length;
  const pendentes = itens.filter((i) => i.status === 'PENDENTE');
  const valorPendenteRazao = pendentes.filter((i) => i.origem === 'RAZAO').reduce((s, i) => s + i.valor, 0);
  const valorPendenteExtrato = pendentes.filter((i) => i.origem === 'EXTRATO').reduce((s, i) => s + i.valor, 0);

  const totalEntradaRazao = razao.filter((l) => l.valor > 0).reduce((s, l) => s + l.valor, 0);
  const totalSaidaRazao = razao.filter((l) => l.valor < 0).reduce((s, l) => s + l.valor, 0);
  const totalEntradaExtrato = extrato.filter((l) => l.valor > 0).reduce((s, l) => s + l.valor, 0);
  const totalSaidaExtrato = extrato.filter((l) => l.valor < 0).reduce((s, l) => s + l.valor, 0);

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
      totalEntradaRazao,
      totalSaidaRazao,
      totalEntradaExtrato,
      totalSaidaExtrato,
    },
  };
}
