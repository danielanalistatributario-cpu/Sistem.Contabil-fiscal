// Motor de Conciliação Bancária: compara o Razão da conta Banco com o
// Extrato Bancário do mesmo período, reproduzindo o processo real de um
// contador no fechamento — sem IA, só regras determinísticas e explicáveis.
//
// Etapas (nesta ordem):
// 0. (Opcional) Reconhecimento de aplicação financeira automática (ex:
//    resgate/aplicação diária de um fundo tipo CONTAMAX) — lançamentos do
//    Razão que normalmente não aparecem detalhados no extrato bancário.
// 1. Comparação da movimentação diária (total de entrada e de saída de cada
//    dia, Razão x Extrato) — não usa o saldo corrente dia a dia, porque esse
//    saldo é cumulativo: um único lançamento pendente faz todos os dias
//    seguintes parecerem divergentes mesmo estando corretos. Comparando só
//    o total movimentado no próprio dia, o problema não se propaga.
// 2. Pareamento de lançamentos, nesta ordem — da pista mais forte/específica
//    pra mais fraca/genérica, de propósito: (a) exato (mesma data e mesmo
//    valor); (b) por código de "Documento" do banco, quando a fonte tiver
//    essa coluna; (c) fechamento do dia inteiro — quando o total de todos os
//    lançamentos não pareados do dia (mesma direção: só entrada ou só saída)
//    bate exato dos dois lados, agrupa tudo de uma vez, sem limite de itens
//    (ex: dezenas de PIX recebidos batendo com dezenas de baixas de título,
//    sem nenhuma outra pista em comum além do total do dia fechar); (d) por
//    competência (mesmo valor, data próxima) — roda só depois dos
//    agrupamentos fortes porque, sozinho, "mesmo valor" pode achar o par
//    errado em outro dia quando há muitos lançamentos de valor parecido
//    (ex: vários PIX de clientes diferentes), o que já "roubou" um item de
//    um fechamento de dia em um caso real; (e) busca por soma de subconjunto
//    (meet-in-the-middle, com teto de segurança) para o que sobrar, dentro
//    de uma janela de dias.
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
  entradaRazao: number;
  saidaRazao: number;
  entradaExtrato: number;
  saidaExtrato: number;
  diferencaEntrada: number;
  diferencaSaida: number;
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

function fmtDataCurta(d: Date): string {
  return d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
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
//
// Exige o candidato dentro da janela de dias da data média do lote — sem
// isso, "mesma soma" sozinho pode casar por coincidência com um lançamento
// de outro dia bem distante (confirmado num caso real: um lote de Documento
// de dois PIX em 17/07 somando R$ 629,96 "roubou" um lançamento do Razão de
// 01/07 com o mesmo valor, 16 dias antes).
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
    const dataMediaMs = itens.reduce((s, i) => s + (i.data?.getTime() ?? 0), 0) / itens.length;
    const dataMedia = new Date(dataMediaMs);
    const candidatos = (porValor.get(somaCents) ?? []).filter(
      (c) => !c.matched && (!c.data || diffDias(dataMedia, c.data) <= JANELA_DIAS_COMPETENCIA)
    );
    if (candidatos.length === 0) continue;
    candidatos.sort((a, b) => Math.abs((a.data?.getTime() ?? 0) - dataMediaMs) - Math.abs((b.data?.getTime() ?? 0) - dataMediaMs));
    achados.push({ alvo: candidatos[0], grupo: itens });
  }
  return achados;
}

// Máximo de itens "resíduo" que podem ser excluídos de um lado para o
// fechamento do dia bater — cobre casos como um rendimento isolado do
// extrato sem contrapartida no Razão, sem precisar reconhecer cada padrão
// de ruído por palavra-chave.
const MAX_RESIDUO_FECHAMENTO_DIA = 3;

// Busca um subconjunto de até `maxTamanho` itens cuja soma (em centavos)
// bate exata com o alvo — usado para achar o "resíduo" que, uma vez
// excluído, faz o fechamento do dia bater. Busca por força bruta: seguro
// aqui porque os baldes de um único dia costumam ter poucas dezenas de
// itens, bem longe do necessário para justificar meet-in-the-middle.
function encontrarResiduo(itens: PoolItem[], alvoCents: number, maxTamanho: number): PoolItem[] | null {
  const n = itens.length;
  function tentar(inicio: number, atuais: PoolItem[], soma: number): PoolItem[] | null {
    if (atuais.length > 0 && soma === alvoCents) return atuais;
    if (atuais.length >= maxTamanho) return null;
    for (let i = inicio; i < n; i++) {
      const achou = tentar(i + 1, [...atuais, itens[i]], soma + Math.round(itens[i].valor * 100));
      if (achou) return achou;
    }
    return null;
  }
  return tentar(0, [], 0);
}

// Fase C2 do agrupamento — fechamento do dia inteiro por direção. Quando o
// total de TODOS os lançamentos ainda não pareados de um dia — só as
// entradas, ou só as saídas — bate exato dos dois lados, agrupa tudo de uma
// vez, sem limite de itens. É seguro mesmo sem nenhuma outra pista em comum
// (nem Documento, nem valor individual) porque a evidência é o total do dia
// inteiro fechando exato — o mesmo raciocínio que um contador faz na mão ao
// conferir "todos os PIX recebidos hoje somam o mesmo tanto que todas as
// baixas de título lançadas hoje", mesmo que a quantidade de lançamentos
// não bata dos dois lados.
//
// Quando o total não bate na primeira tentativa, tenta achar um pequeno
// resíduo (até MAX_RESIDUO_FECHAMENTO_DIA itens) do lado que está "sobrando"
// cuja exclusão zera a diferença — ex: um rendimento de aplicação isolado no
// extrato, sem contrapartida no Razão, que sozinho impediria o dia inteiro
// de fechar mesmo com todo o resto batendo certinho. O resíduo excluído
// continua como pendente individual, pra revisão manual.
function agruparPorDiaEDirecao(razaoPool: PoolItem[], extratoPool: PoolItem[]): { grupoRazao: PoolItem[]; grupoExtrato: PoolItem[] }[] {
  type Baldes = { razaoEntrada: PoolItem[]; razaoSaida: PoolItem[]; extratoEntrada: PoolItem[]; extratoSaida: PoolItem[] };
  const porDia = new Map<string, Baldes>();
  const balde = (chave: string): Baldes => {
    let b = porDia.get(chave);
    if (!b) {
      b = { razaoEntrada: [], razaoSaida: [], extratoEntrada: [], extratoSaida: [] };
      porDia.set(chave, b);
    }
    return b;
  };
  for (const r of razaoPool) {
    if (r.matched || !r.data) continue;
    const b = balde(r.data.toISOString().slice(0, 10));
    (r.valor > 0 ? b.razaoEntrada : b.razaoSaida).push(r);
  }
  for (const e of extratoPool) {
    if (e.matched || !e.data) continue;
    const b = balde(e.data.toISOString().slice(0, 10));
    (e.valor > 0 ? b.extratoEntrada : b.extratoSaida).push(e);
  }

  const achados: { grupoRazao: PoolItem[]; grupoExtrato: PoolItem[] }[] = [];
  for (const b of porDia.values()) {
    for (const [gr, ge] of [
      [b.razaoEntrada, b.extratoEntrada],
      [b.razaoSaida, b.extratoSaida],
    ] as const) {
      // exige pelo menos 2 de cada lado — pareamento simples de 1:1 já teria
      // sido resolvido nos passos A/B antes de chegar aqui.
      if (gr.length < 2 || ge.length < 2) continue;
      const somaR = gr.reduce((s, i) => s + Math.round(i.valor * 100), 0);
      const somaE = ge.reduce((s, i) => s + Math.round(i.valor * 100), 0);
      if (somaR === somaE) {
        achados.push({ grupoRazao: gr, grupoExtrato: ge });
        continue;
      }

      // não bateu de primeira: tenta achar um resíduo pequeno do lado que
      // está sobrando (o de maior soma) cuja exclusão zera a diferença.
      const diferenca = somaE - somaR;
      const ladoComExcesso = diferenca > 0 ? ge : gr;
      const residuo = encontrarResiduo(ladoComExcesso, Math.abs(diferenca), MAX_RESIDUO_FECHAMENTO_DIA);
      if (!residuo) continue;
      const residuoSet = new Set(residuo);
      const grFinal = diferenca > 0 ? gr : gr.filter((i) => !residuoSet.has(i));
      const geFinal = diferenca > 0 ? ge.filter((i) => !residuoSet.has(i)) : ge;
      if (grFinal.length >= 2 && geFinal.length >= 2) {
        achados.push({ grupoRazao: grFinal, grupoExtrato: geFinal });
      }
    }
  }
  return achados;
}

// Fase C3 do agrupamento — busca por soma de subconjunto quando Documento e
// fechamento do dia não resolveram. Usa meet-in-the-middle sobre centavos
// inteiros (evita deriva de ponto flutuante, e o custo é exponencial só no
// número de candidatos da janela — não no valor em R$). CAP_JANELA_GRUPO
// garante que nunca trava, mesmo em arquivos grandes: acima do teto,
// simplesmente não tenta combinar (os itens ficam como pendentes
// individuais, revisáveis manualmente).
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
  // --- 1. Movimentação diária (total de entrada/saída por dia) ---
  function agruparPorDia(lancamentos: LancamentoConta[]): Map<string, { entrada: number; saida: number }> {
    const mapa = new Map<string, { entrada: number; saida: number }>();
    for (const l of lancamentos) {
      if (!l.data) continue;
      const chave = l.data.toISOString().slice(0, 10);
      const atual = mapa.get(chave) ?? { entrada: 0, saida: 0 };
      if (l.valor > 0) atual.entrada += l.valor;
      else if (l.valor < 0) atual.saida += l.valor;
      mapa.set(chave, atual);
    }
    return mapa;
  }
  // Quando o toggle de aplicação automática está ligado, os lançamentos de
  // resgate/aplicação (ex: CONTAMAX) também saem da comparação diária — do
  // contrário a movimentação diária mostraria a mesma divergência que o
  // reconhecimento automático já resolveu no nível de lançamento.
  const razaoParaMovimento = opcoes?.incluirAplicacaoAutomatica
    ? razao.filter((l) => !detectarAplicacaoAutomatica(l.historico))
    : razao;
  const movRazao = agruparPorDia(razaoParaMovimento);
  const movExtrato = agruparPorDia(extrato);
  const todasDatas = Array.from(new Set([...movRazao.keys(), ...movExtrato.keys()])).sort();
  const dias: DiaComparado[] = todasDatas.map((d) => {
    const r = movRazao.get(d) ?? { entrada: 0, saida: 0 };
    const e = movExtrato.get(d) ?? { entrada: 0, saida: 0 };
    return {
      data: new Date(d),
      entradaRazao: r.entrada,
      saidaRazao: r.saida,
      entradaExtrato: e.entrada,
      saidaExtrato: e.saida,
      diferencaEntrada: r.entrada - e.entrada,
      diferencaSaida: r.saida - e.saida,
    };
  });

  // Saldo final vem direto do último lançamento com saldo informado na fonte
  // (não da agregação dia a dia) — é uma conferência de fechamento de
  // período, independente da comparação diária acima.
  const saldoFinalRazao = [...razao].reverse().find((l) => l.saldo !== null)?.saldo ?? 0;
  const saldoFinalExtrato = [...extrato].reverse().find((l) => l.saldo !== null)?.saldo ?? 0;
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

  // C2: fechamento do dia inteiro por direção (entrada ou saída) — quando o
  // total de tudo que sobrou no dia bate exato dos dois lados, mesmo sem
  // nenhuma outra pista em comum e sem limite de quantidade de itens.
  for (const { grupoRazao, grupoExtrato } of agruparPorDiaEDirecao(razaoPool, extratoPool)) {
    if (grupoRazao.some((g) => g.matched) || grupoExtrato.some((g) => g.matched)) continue;
    grupoContador++;
    const ref = `G${grupoContador}`;
    grupoRazao.forEach((g) => (g.matched = true));
    grupoExtrato.forEach((g) => (g.matched = true));
    const dataStr = grupoRazao[0].data ? fmtDataCurta(grupoRazao[0].data) : '';
    const obs = `Fechamento do dia ${dataStr}: total de ${grupoRazao.length} lançamento(s) do Razão bate exato com o total de ${grupoExtrato.length} lançamento(s) do Extrato.`;
    grupoRazao.forEach((g) => definirItem('RAZAO', g, 'CONCILIADO_GRUPO', ref, obs));
    grupoExtrato.forEach((g) => definirItem('EXTRATO', g, 'CONCILIADO_GRUPO', ref, obs));
  }

  // Passo B — mesma valor, data próxima (diferença de competência). Roda só
  // depois de C1/C2 de propósito: como só exige "mesmo valor" (sem outra
  // pista), com muitos lançamentos de valor parecido/repetido (ex: vários
  // PIX de clientes diferentes) ele pode achar o par errado em outro dia
  // dentro da janela, "roubando" um item que pertencia a um grupo maior do
  // dia certo e impedindo o fechamento do dia de bater — confirmado num
  // caso real (um item de R$ 262,95 casava com outro dia por coincidência
  // de valor e travava o fechamento do dia inteiro).
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

  // C3: por soma de subconjunto (janela de dias, para o que sobrar)
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
