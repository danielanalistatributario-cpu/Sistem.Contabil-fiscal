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
//    sem nenhuma outra pista em comum além do total do dia fechar) — status
//    PRÓPRIO (`FECHAMENTO_TOTAL_DIA`), NÃO conta como conciliado de verdade
//    (ver nota abaixo); (d) por competência (mesmo valor, data próxima) —
//    roda só depois dos agrupamentos fortes porque, sozinho, "mesmo valor"
//    pode achar o par errado em outro dia quando há muitos lançamentos de
//    valor parecido (ex: vários PIX de clientes diferentes), o que já
//    "roubou" um item de um fechamento de dia em um caso real; (e) busca por
//    soma de subconjunto (meet-in-the-middle, com teto de segurança) para o
//    que sobrar, dentro de uma janela de dias; (f) divergência de valor —
//    quando sobra exatamente 1 lançamento de cada lado na mesma data, com
//    valores diferentes, é bem mais provável que seja o mesmo lançamento com
//    erro de valor de um dos dois lados do que dois lançamentos
//    independentes sem nenhuma relação.
// 3. Lançamentos que sobraram sem par são classificados e, no caso do
//    extrato, têm a natureza provável sugerida por palavra-chave no
//    histórico (tarifa, PIX, TED, IOF, juros, etc.).
//
// Sobre `FECHAMENTO_TOTAL_DIA` (achado real, 22/09/2026): testado contra um
// mês real do Safra, 92% de tudo que o motor chamava de "conciliado" vinha
// do fechamento (c) — grupos de dezenas a mais de cem itens de cada lado,
// sem nenhuma evidência além do total do dia bater. Isso significa que o
// total pode fechar por coincidência (duas divergências pequenas se
// cancelando) escondendo lançamentos sem par de verdade — caso real
// confirmado: um "ORDEM DE CREDITO" de R$ 54,00 sem contrapartida no Razão
// ficou "escondido" dentro de um grupo de 138 lançamentos do Razão x 92 do
// Extrato que fechava no total. Por isso esse tipo de fechamento tem status
// PRÓPRIO, separado de `CONCILIADO`/`CONCILIADO_GRUPO` (que continuam só
// pra pareamento com evidência de verdade: valor exato, Documento em comum,
// ou soma de subconjunto dentro da janela) — não entra em
// `totais.totalConciliados`, fica num contador à parte pra revisão manual.

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

export type StatusItem =
  | 'CONCILIADO'
  | 'CONCILIADO_GRUPO'
  | 'DIF_COMPETENCIA'
  | 'APLICACAO_AUTOMATICA'
  | 'FECHAMENTO_TOTAL_DIA'
  | 'DIVERGENCIA_VALOR'
  | 'PENDENTE';

export type ItemConciliado = {
  origem: 'RAZAO' | 'EXTRATO';
  data: Date | null;
  historico: string;
  valor: number;
  documento: string | null;
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
  // Saldo do próprio dia — independente da movimentação (que já não usa
  // saldo acumulado, de propósito). Pedido explícito do usuário: validar
  // Saldo Inicial + Entradas - Saídas = Saldo Final em CADA dia, dos dois
  // lados, e comparar o saldo final do dia entre Razão e Extrato — não só
  // no fim do período. null quando a fonte não tem saldo disponível pra
  // aquele dia (ex: extrato sem coluna/linha de saldo).
  saldoInicialRazao: number | null;
  saldoFinalRazao: number | null;
  saldoInicialExtrato: number | null;
  saldoFinalExtrato: number | null;
  diferencaSaldoFinalDia: number | null; // saldoFinalRazao - saldoFinalExtrato do dia, quando os dois existem
  // Confere Saldo Inicial + Entradas + Saídas (saída já negativa) contra o
  // Saldo Final do próprio dia, de cada lado — detecta lançamento fora da
  // movimentação contada (ex: filtrado por engano) que o saldo já reflete.
  // null quando não há saldoInicial/saldoFinal pra conferir (ex: primeiro
  // dia sem saldo inicial informado).
  consistenteRazao: boolean | null;
  consistenteExtrato: boolean | null;
  // Continuidade entre dias do Extrato: quando a fonte informa um saldo de
  // ABERTURA explícito por dia (ex: linha "SALDO CONTA CORRENTE" do Safra),
  // confere se ele bate com o saldo final calculado do dia anterior —
  // achado real (22/09/2026): pode não bater mesmo com a soma dos
  // lançamentos do próprio dia batendo perfeitamente (ajuste/rendimento do
  // banco não detalhado como lançamento). null quando a fonte não informa
  // abertura explícita por dia (aí o saldo inicial já vem do próprio saldo
  // final do dia anterior, por construção — nada a comparar).
  continuidadeExtrato: boolean | null;
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
    totalFechamentoTotalDia: number;
    totalDivergenciaValor: number;
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

// Algumas exportações de extrato (confirmado no Safra) colocam o valor do
// saldo do dia direto na coluna "Valor" de linhas informativas como "SALDO
// TOTAL", "SALDO APLIC AUTOMATICA", "SALDO CONTA CORRENTE" — não são
// lançamentos reais, só um resumo do dia, com o mesmo formato de uma linha
// de movimentação normal. Fica no array bruto (usado pro saldo final), mas
// não pode entrar no pareamento — senão vira uma pendência gigante e falsa.
function ehLinhaDeSaldo(historico: string): boolean {
  return normalize(historico).startsWith('saldo');
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
      // exige pelo menos 1 de cada lado, mas bloqueia o caso 1:1 puro — esse
      // já teria sido resolvido nos passos A/B antes de chegar aqui. N:1 e
      // 1:N (várias linhas de um lado somando uma única do outro — ex: vários
      // títulos recebidos no Razão batendo com um único lançamento de
      // "boletos recebidos" consolidado no Extrato) são o caso normal desta
      // fase e não podem ser bloqueados.
      if (gr.length === 0 || ge.length === 0) continue;
      if (gr.length === 1 && ge.length === 1) continue;
      const somaR = gr.reduce((s, i) => s + Math.round(i.valor * 100), 0);
      const somaE = ge.reduce((s, i) => s + Math.round(i.valor * 100), 0);
      if (somaR === somaE) {
        achados.push({ grupoRazao: gr, grupoExtrato: ge });
        continue;
      }

      // não bateu de primeira: tenta achar um resíduo pequeno do lado que
      // está sobrando (o de maior soma em módulo) cuja exclusão zera a
      // diferença. Usa módulo pra decidir qual lado tem o excesso (o sinal
      // de somaE - somaR sozinho é enganoso em baldes de saída, onde "sobrar
      // mais" é uma soma mais negativa, não uma diferença positiva) — mas o
      // alvo passado pra encontrarResiduo precisa manter o sinal correto,
      // porque a soma de itens de saída é sempre negativa e nunca bateria
      // contra um alvo em módulo.
      const diferenca = somaE - somaR;
      const excessoNoExtrato = Math.abs(somaE) > Math.abs(somaR);
      const ladoComExcesso = excessoNoExtrato ? ge : gr;
      const alvoResiduo = excessoNoExtrato ? diferenca : -diferenca;
      const residuo = encontrarResiduo(ladoComExcesso, alvoResiduo, MAX_RESIDUO_FECHAMENTO_DIA);
      if (!residuo) continue;
      const residuoSet = new Set(residuo);
      const grFinal = excessoNoExtrato ? gr : gr.filter((i) => !residuoSet.has(i));
      const geFinal = excessoNoExtrato ? ge.filter((i) => !residuoSet.has(i)) : ge;
      if (grFinal.length >= 1 && geFinal.length >= 1) {
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
      if (!l.data || ehLinhaDeSaldo(l.historico)) continue;
      const chave = l.data.toISOString().slice(0, 10);
      const atual = mapa.get(chave) ?? { entrada: 0, saida: 0 };
      if (l.valor > 0) atual.entrada += l.valor;
      else if (l.valor < 0) atual.saida += l.valor;
      mapa.set(chave, atual);
    }
    return mapa;
  }
  // Quando o toggle de aplicação automática está ligado, os lançamentos de
  // resgate/aplicação (ex: CONTAMAX, CDB) também saem da comparação diária —
  // do contrário a movimentação diária mostraria uma divergência que o
  // reconhecimento automático já resolveu no nível de lançamento. Exclui dos
  // dois lados simetricamente: em bancos como Santander o padrão só existe
  // no Razão (o extrato nunca mostra o resgate/aplicação), mas em outros
  // (ex: Safra, CDB automático) o extrato TEM a mesma linha — se só o Razão
  // fosse filtrado, sobraria uma diferença fictícia no dia.
  const razaoParaMovimento = opcoes?.incluirAplicacaoAutomatica
    ? razao.filter((l) => !detectarAplicacaoAutomatica(l.historico))
    : razao;
  const extratoParaMovimento = opcoes?.incluirAplicacaoAutomatica
    ? extrato.filter((l) => !detectarAplicacaoAutomatica(l.historico))
    : extrato;
  const movRazao = agruparPorDia(razaoParaMovimento);
  const movExtrato = agruparPorDia(extratoParaMovimento);
  const todasDatas = Array.from(new Set([...movRazao.keys(), ...movExtrato.keys()])).sort();

  // Último saldo conhecido de cada dia (chave AAAA-MM-DD), na ordem
  // cronológica da fonte — assume `lancamentos` já normalizado pro sentido
  // certo (asc/desc já resolvido pelo leitor). Não usa `ehLinhaDeSaldo` pra
  // filtrar: linhas de saldo informativo do Safra já ficam com `saldo=null`
  // (não fazem parte da movimentação real), então só sobra o saldo real das
  // linhas de lançamento de qualquer forma.
  function ultimoSaldoDoDia(lancamentos: LancamentoConta[]): Map<string, number> {
    const mapa = new Map<string, number>();
    for (const l of lancamentos) {
      if (!l.data || l.saldo === null) continue;
      mapa.set(l.data.toISOString().slice(0, 10), l.saldo);
    }
    return mapa;
  }
  const saldoFinalDiaRazao = ultimoSaldoDoDia(razao);
  const saldoFinalDiaExtrato = ultimoSaldoDoDia(extrato);

  // Saldo de ABERTURA explícito de cada dia, quando a fonte informa (ex:
  // linha "SALDO CONTA CORRENTE" do Safra, que o leitor agora preserva em
  // `.saldo` — ver conciliacao-reader.ts) — pega o PRIMEIRO saldo não-nulo
  // do dia, na ordem cronológica. Só funciona como "abertura de verdade"
  // quando a fonte tem uma linha de saldo dedicada antes dos lançamentos do
  // dia (Safra); pra fontes sem isso (ex: Razão, saldo contínuo sem marcar
  // abertura por dia) o primeiro valor seria só o saldo APÓS o primeiro
  // lançamento, não uma abertura de verdade — por isso só usado pro Extrato.
  function primeiroSaldoDoDia(lancamentos: LancamentoConta[]): Map<string, number> {
    const mapa = new Map<string, number>();
    for (const l of lancamentos) {
      if (!l.data || l.saldo === null) continue;
      const chave = l.data.toISOString().slice(0, 10);
      if (!mapa.has(chave)) mapa.set(chave, l.saldo);
    }
    return mapa;
  }
  const aberturaDiaExtrato = primeiroSaldoDoDia(extrato);

  // Movimentação SEM excluir aplicação automática — usada só pra conferir
  // Saldo Inicial + Entradas + Saídas = Saldo Final. O saldo real da fonte
  // reflete TODOS os lançamentos (inclusive resgate/aplicação automática),
  // então a conferência precisa da movimentação completa — diferente de
  // `movRazao`/`movExtrato` acima, que excluem aplicação automática de
  // propósito só pra comparação de "Dif. Entrada"/"Dif. Saída" (ver nota
  // acima). Usar a versão filtrada aqui gerava falso "inconsistente" todo
  // dia que teve CDB automático — confirmado em teste real (quase todos os
  // dias do mês).
  const movRazaoCompleto = agruparPorDia(razao);
  const movExtratoCompleto = agruparPorDia(extrato);

  // Saldo inicial de cada dia = saldo final do dia anterior — carregado dia
  // a dia (independente pra Razão e Extrato, já que as duas fontes podem
  // estar em bases absolutas diferentes, ver nota em processarConciliacaoBancaria
  // sobre saldoInicialInformado). No primeiro dia com saldo disponível, usa
  // saldoInicialInformado quando o usuário informou; sem isso, deriva do
  // próprio saldo final do dia (torna a checagem desse primeiro dia
  // vazia/sempre batendo — não tem como validar sem um saldo externo — mas
  // os dias seguintes continuam validando de verdade).
  let saldoAnteriorRazao: number | null = saldoInicialInformado;
  let saldoAnteriorExtrato: number | null = saldoInicialInformado;

  const dias: DiaComparado[] = todasDatas.map((d) => {
    const r = movRazao.get(d) ?? { entrada: 0, saida: 0 };
    const e = movExtrato.get(d) ?? { entrada: 0, saida: 0 };

    const finalRazao = saldoFinalDiaRazao.get(d) ?? null;
    const finalExtrato = saldoFinalDiaExtrato.get(d) ?? null;
    const rCompleto = movRazaoCompleto.get(d) ?? { entrada: 0, saida: 0 };
    const eCompleto = movExtratoCompleto.get(d) ?? { entrada: 0, saida: 0 };

    // Razão: sem abertura explícita por dia na fonte — usa o saldo final do
    // dia anterior calculado (continuidade natural de um livro contínuo).
    const iniRazao = saldoAnteriorRazao ?? (finalRazao !== null ? finalRazao - rCompleto.entrada - rCompleto.saida : null);
    // Extrato: prefere a abertura EXPLÍCITA da própria fonte (Safra) quando
    // existir — é o valor de referência independente que torna a checagem
    // de continuidade entre dias significativa (ver `continuidadeExtrato`
    // abaixo); só cai pro saldo final do dia anterior quando a fonte não
    // informa abertura por dia.
    const aberturaExtrato = aberturaDiaExtrato.get(d) ?? null;
    const iniExtrato = aberturaExtrato ?? saldoAnteriorExtrato ?? (finalExtrato !== null ? finalExtrato - eCompleto.entrada - eCompleto.saida : null);

    const consistenteRazao = iniRazao !== null && finalRazao !== null ? Math.abs(iniRazao + rCompleto.entrada + rCompleto.saida - finalRazao) < TOLERANCIA_VALOR : null;
    const consistenteExtrato = iniExtrato !== null && finalExtrato !== null ? Math.abs(iniExtrato + eCompleto.entrada + eCompleto.saida - finalExtrato) < TOLERANCIA_VALOR : null;

    // Continuidade: a abertura informada pelo Extrato bate com o saldo final
    // calculado do dia anterior? Só avalia quando os dois existem (fonte
    // com abertura por dia E já passou pelo menos 1 dia anterior) — achado
    // real (22/09/2026): pode não bater mesmo com o dia fechando certinho
    // sozinho, revelando ajuste/rendimento do banco não detalhado como
    // lançamento entre um dia e outro.
    const continuidadeExtrato =
      aberturaExtrato !== null && saldoAnteriorExtrato !== null ? Math.abs(aberturaExtrato - saldoAnteriorExtrato) < TOLERANCIA_VALOR : null;

    if (finalRazao !== null) saldoAnteriorRazao = finalRazao;
    if (finalExtrato !== null) saldoAnteriorExtrato = finalExtrato;

    return {
      data: new Date(d),
      entradaRazao: r.entrada,
      saidaRazao: r.saida,
      entradaExtrato: e.entrada,
      saidaExtrato: e.saida,
      diferencaEntrada: r.entrada - e.entrada,
      diferencaSaida: r.saida - e.saida,
      continuidadeExtrato,
      saldoInicialRazao: iniRazao,
      saldoFinalRazao: finalRazao,
      saldoInicialExtrato: iniExtrato,
      saldoFinalExtrato: finalExtrato,
      diferencaSaldoFinalDia: finalRazao !== null && finalExtrato !== null ? finalRazao - finalExtrato : null,
      consistenteRazao,
      consistenteExtrato,
    };
  });

  // Saldo final vem direto do último lançamento com saldo informado na fonte
  // (não da agregação dia a dia) — é uma conferência de fechamento de
  // período, independente da comparação diária acima.
  const saldoFinalRazao = [...razao].reverse().find((l) => l.saldo !== null)?.saldo ?? 0;
  const saldoFinalExtrato = [...extrato].reverse().find((l) => l.saldo !== null)?.saldo ?? 0;
  const saldoInicial = saldoInicialInformado ?? 0;

  // --- 2. Pareamento de lançamentos ---
  // Lançamentos com valor zero (ex: "SALDO ANTERIOR", "SALDO TOTAL DISPONÍVEL
  // DIA") ou que sejam linha de saldo informativa (ex: "SALDO TOTAL",
  // "SALDO APLIC AUTOMATICA" do Safra, com valor preenchido mas sem impacto
  // financeiro real) não devem virar pendência — servem só pra rastrear o
  // saldo corrente (usado acima).
  const razaoPool: PoolItem[] = razao
    .map((l, idx) => ({ idx, data: l.data, historico: l.historico, valor: l.valor, documento: l.documento ?? null, matched: false }))
    .filter((l) => l.valor !== 0 && !ehLinhaDeSaldo(l.historico));
  const extratoPool: PoolItem[] = extrato
    .map((l, idx) => ({ idx, data: l.data, historico: l.historico, valor: l.valor, documento: l.documento ?? null, matched: false }))
    .filter((l) => l.valor !== 0 && !ehLinhaDeSaldo(l.historico));

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
      documento: item.documento,
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

  // Passo A0 — reconhecimento de aplicação financeira automática (opcional).
  // Roda depois do Passo A de propósito: em alguns bancos (ex: Santander
  // CONTAMAX) esses lançamentos nunca aparecem no extrato, então precisam do
  // reconhecimento automático — mas em outros (ex: Safra CDB) o extrato TEM
  // a contrapartida exata. Rodar antes do Passo A tirava o lançamento do
  // Razão do jogo cedo demais, deixando a contrapartida do Extrato órfã e
  // caindo como pendente à toa. Só vira "aplicação automática" o que sobrar
  // sem par exato.
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
  // nenhuma outra pista em comum e sem limite de quantidade de itens. Status
  // PRÓPRIO (FECHAMENTO_TOTAL_DIA, não CONCILIADO_GRUPO) — testado contra
  // dado real e confirmado que o total pode bater por coincidência (duas
  // divergências pequenas se cancelando) escondendo lançamento sem par de
  // verdade; ver nota completa no topo do arquivo. Fica separado da
  // contagem de conciliados de verdade, pra revisão manual.
  for (const { grupoRazao, grupoExtrato } of agruparPorDiaEDirecao(razaoPool, extratoPool)) {
    if (grupoRazao.some((g) => g.matched) || grupoExtrato.some((g) => g.matched)) continue;
    grupoContador++;
    const ref = `G${grupoContador}`;
    grupoRazao.forEach((g) => (g.matched = true));
    grupoExtrato.forEach((g) => (g.matched = true));
    const dataStr = grupoRazao[0].data ? fmtDataCurta(grupoRazao[0].data) : '';
    const obs = `Fechamento do dia ${dataStr}: total de ${grupoRazao.length} lançamento(s) do Razão bate exato com o total de ${grupoExtrato.length} lançamento(s) do Extrato — não verificado item a item, revisar.`;
    grupoRazao.forEach((g) => definirItem('RAZAO', g, 'FECHAMENTO_TOTAL_DIA', ref, obs));
    grupoExtrato.forEach((g) => definirItem('EXTRATO', g, 'FECHAMENTO_TOTAL_DIA', ref, obs));
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

  // Passo D0 — par de estorno dentro do próprio Extrato: uma entrada e uma
  // saída do mesmo dia, mesmo valor absoluto, sem nenhuma outra pista.
  // Padrão típico de PIX/transferência enviada que volta no mesmo dia (ex:
  // chave inválida, conta encerrada) — o Extrato registra as duas pernas
  // (saída e depois a entrada de volta), mas como o efeito líquido é zero a
  // empresa nunca chega a contabilizar nada no Razão. Só casa 1 entrada com
  // 1 saída (não um grupo maior) pra não arriscar coincidência de valores.
  {
    const porDiaExtrato = new Map<string, { entrada: PoolItem[]; saida: PoolItem[] }>();
    for (const e of extratoPool) {
      if (e.matched || !e.data) continue;
      const chave = e.data.toISOString().slice(0, 10);
      const b = porDiaExtrato.get(chave) ?? { entrada: [], saida: [] };
      (e.valor > 0 ? b.entrada : b.saida).push(e);
      porDiaExtrato.set(chave, b);
    }
    for (const b of porDiaExtrato.values()) {
      if (b.entrada.length !== 1 || b.saida.length !== 1) continue;
      const ent = b.entrada[0];
      const sai = b.saida[0];
      if (Math.abs(ent.valor + sai.valor) >= TOLERANCIA_VALOR) continue;
      grupoContador++;
      const ref = `G${grupoContador}`;
      ent.matched = true;
      sai.matched = true;
      const obs = `Par de estorno dentro do próprio Extrato (${fmtDataCurta(ent.data!)}): entrada e saída do mesmo valor no mesmo dia, sem nenhuma outra pendência naquele dia — provável PIX/transferência enviada e devolvida. Sem lançamento correspondente no Razão porque não há efeito financeiro líquido.`;
      definirItem('EXTRATO', ent, 'CONCILIADO_GRUPO', ref, obs);
      definirItem('EXTRATO', sai, 'CONCILIADO_GRUPO', ref, obs);
    }
  }

  // Passo E — divergência de valor: quando sobra exatamente 1 lançamento de
  // cada lado na mesma data e mesma direção (os dois entrada, ou os dois
  // saída), mas com valores diferentes, é bem mais provável que seja o
  // mesmo lançamento registrado com um valor errado de um dos dois lados do
  // que dois lançamentos completamente independentes sem nenhuma relação —
  // só roda quando não sobra ambiguidade (exatamente 1 de cada lado no dia),
  // senão prefere deixar como pendente separado a arriscar casar o par
  // errado.
  {
    const porDiaValor = new Map<string, { razao: PoolItem[]; extrato: PoolItem[] }>();
    for (const r of razaoPool) {
      if (r.matched || !r.data) continue;
      const chave = r.data.toISOString().slice(0, 10);
      const b = porDiaValor.get(chave) ?? { razao: [], extrato: [] };
      b.razao.push(r);
      porDiaValor.set(chave, b);
    }
    for (const e of extratoPool) {
      if (e.matched || !e.data) continue;
      const chave = e.data.toISOString().slice(0, 10);
      const b = porDiaValor.get(chave) ?? { razao: [], extrato: [] };
      b.extrato.push(e);
      porDiaValor.set(chave, b);
    }
    for (const b of porDiaValor.values()) {
      if (b.razao.length !== 1 || b.extrato.length !== 1) continue;
      const r = b.razao[0];
      const e = b.extrato[0];
      if (Math.abs(e.valor - r.valor) < TOLERANCIA_VALOR) continue; // valor igual seria Passo A, não deveria chegar aqui
      if ((r.valor > 0) !== (e.valor > 0)) continue; // direções diferentes não é "mesmo lançamento, valor errado"
      grupoContador++;
      const ref = `G${grupoContador}`;
      r.matched = true;
      e.matched = true;
      const obs = `Mesma data (${fmtDataCurta(r.data!)}), valor diferente entre Razão (${r.valor.toFixed(2)}) e Extrato (${e.valor.toFixed(2)}) — provável divergência de valor no mesmo lançamento.`;
      definirItem('RAZAO', r, 'DIVERGENCIA_VALOR', ref, obs);
      definirItem('EXTRATO', e, 'DIVERGENCIA_VALOR', ref, obs);
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
  const totalFechamentoTotalDia = itens.filter((i) => i.status === 'FECHAMENTO_TOTAL_DIA').length;
  const totalDivergenciaValor = itens.filter((i) => i.status === 'DIVERGENCIA_VALOR').length;
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
      totalFechamentoTotalDia,
      totalDivergenciaValor,
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
