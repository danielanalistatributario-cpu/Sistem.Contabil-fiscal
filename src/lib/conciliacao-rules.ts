// Regras de Conciliação Contábil — sem IA, só regras determinísticas e
// documentadas.
//
// IMPORTANTE (correção de escopo): quando o Razão importado contém apenas
// uma ou algumas contas, a análise é restrita a essas contas — o Balancete
// serve só de referência para os saldos, não é mais totalmente reprocessado.
// Quando nenhum Razão é importado, o sistema faz uma "análise só de
// Balancete" (contas sem movimento, saldo elevado, saldo antigo, saldo
// invertido quando houver coluna de Natureza).

export const TOLERANCIA_PADRAO = 0.01; // diferença de até 1 centavo é considerada "conciliada"
const FATOR_FORA_DO_PADRAO = 3; // lançamento é "fora do padrão" se for > 3x a média da conta
const FATOR_SALDO_ELEVADO = 3; // conta é "saldo elevado" se for > 3x a média das contas do balancete

export type BalanceteRow = {
  conta: string;
  descricao: string;
  saldoInicial: number;
  debito: number;
  credito: number;
  saldoFinal: number;
  natureza: 'D' | 'C' | null; // opcional — só vem se o Balancete tiver essa coluna
};

export type RazaoRow = {
  conta: string;
  data: Date | null;
  historico: string;
  debito: number;
  credito: number;
};

export type ExtratoRow = {
  data: Date | null;
  historico: string;
  valor: number; // positivo = entrada, negativo = saída
};

export type LancamentoAlerta = {
  data: Date | null;
  historico: string;
  debito: number;
  credito: number;
  tipoAlerta: 'DUPLICADO' | 'SEM_HISTORICO' | 'FORA_DO_PADRAO' | 'OUTRA_CONTA' | 'SEM_EXTRATO';
};

export type ContaConciliada = {
  conta: string;
  descricao: string;
  saldoInicial: number;
  debitoBalancete: number;
  creditoBalancete: number;
  saldoFinalBalancete: number;
  debitoRazao: number;
  creditoRazao: number;
  saldoCalculado: number;
  diferencaSaldo: number;
  diferencaDebito: number;
  diferencaCredito: number;
  status: 'CONCILIADA' | 'PENDENTE';
  semMovimentacao: boolean;
  extratoSaldoFinal: number | null;
  extratoDiferenca: number | null;
  observacoes: string[];
  lancamentosAlerta: LancamentoAlerta[];
};

function chaveLancamento(l: RazaoRow): string {
  const dataStr = l.data ? l.data.toISOString().slice(0, 10) : '';
  return `${dataStr}|${l.historico.trim().toLowerCase()}|${l.debito.toFixed(2)}|${l.credito.toFixed(2)}`;
}

// Dicionário simples de palavras-chave por categoria, usado só para o alerta
// "lançamento aparenta não pertencer a esta conta". É um heurístico por
// palavra-chave (não é IA) — pode gerar falsos positivos, especialmente em
// contas de movimentação livre como Caixa/Bancos, onde é normal passar
// lançamentos de várias naturezas. Por isso só é aplicado quando a própria
// conta tem uma categoria clara pela descrição.
const CATEGORIAS_PALAVRAS_CHAVE: Record<string, string[]> = {
  pessoal: ['salario', 'salário', 'ferias', 'férias', 'fgts', 'decimo terceiro', '13o salario', 'folha de pagamento', 'rescisao', 'rescisão', 'inss funcionario'],
  fornecedores: ['fornecedor', 'compra de mercadoria', 'nota fiscal de compra'],
  clientes: ['cliente', 'venda', 'fatura recebida', 'recebimento de venda'],
  impostos: ['imposto', 'tributo', 'icms', 'pis', 'cofins', 'irpj', 'csll', 'iss', 'darf', 'gnre'],
};

function detectarCategoria(texto: string): string | null {
  const t = texto.toLowerCase();
  for (const [categoria, palavras] of Object.entries(CATEGORIAS_PALAVRAS_CHAVE)) {
    if (palavras.some((p) => t.includes(p))) return categoria;
  }
  return null;
}

function detectarAlertasLancamentos(lancamentos: RazaoRow[], categoriaConta: string | null): LancamentoAlerta[] {
  const alertas: LancamentoAlerta[] = [];

  const contagem: Record<string, number> = {};
  lancamentos.forEach((l) => {
    contagem[chaveLancamento(l)] = (contagem[chaveLancamento(l)] || 0) + 1;
  });
  const vistos = new Set<string>();
  lancamentos.forEach((l) => {
    const k = chaveLancamento(l);
    if (contagem[k] > 1) {
      if (vistos.has(k)) {
        alertas.push({ data: l.data, historico: l.historico, debito: l.debito, credito: l.credito, tipoAlerta: 'DUPLICADO' });
      } else {
        vistos.add(k);
      }
    }
  });

  lancamentos.forEach((l) => {
    if (!l.historico || l.historico.trim() === '') {
      alertas.push({ data: l.data, historico: l.historico, debito: l.debito, credito: l.credito, tipoAlerta: 'SEM_HISTORICO' });
    }
  });

  const valores = lancamentos.map((l) => Math.max(l.debito, l.credito)).filter((v) => v > 0);
  if (valores.length >= 4) {
    const media = valores.reduce((s, v) => s + v, 0) / valores.length;
    const limite = media * FATOR_FORA_DO_PADRAO;
    lancamentos.forEach((l) => {
      const valor = Math.max(l.debito, l.credito);
      if (valor > limite) {
        alertas.push({ data: l.data, historico: l.historico, debito: l.debito, credito: l.credito, tipoAlerta: 'FORA_DO_PADRAO' });
      }
    });
  }

  // "aparenta não pertencer a esta conta" — só roda se a própria conta tiver
  // uma categoria clara (pela descrição) diferente da categoria do histórico
  if (categoriaConta) {
    lancamentos.forEach((l) => {
      const categoriaLancamento = detectarCategoria(l.historico);
      if (categoriaLancamento && categoriaLancamento !== categoriaConta) {
        alertas.push({ data: l.data, historico: l.historico, debito: l.debito, credito: l.credito, tipoAlerta: 'OUTRA_CONTA' });
      }
    });
  }

  return alertas;
}

function processarUmaConta(
  conta: string,
  dadosBalancete: BalanceteRow | null,
  lancamentos: RazaoRow[],
  mesesAnteriores: number,
  extrato: ExtratoRow[] | null
): ContaConciliada {
  const debitoRazao = lancamentos.reduce((s, l) => s + l.debito, 0);
  const creditoRazao = lancamentos.reduce((s, l) => s + l.credito, 0);

  const saldoInicial = dadosBalancete?.saldoInicial ?? 0;
  const debitoBalancete = dadosBalancete?.debito ?? 0;
  const creditoBalancete = dadosBalancete?.credito ?? 0;
  const saldoFinalBalancete = dadosBalancete?.saldoFinal ?? saldoInicial + debitoRazao - creditoRazao;

  const saldoCalculado = saldoInicial + debitoRazao - creditoRazao;
  const diferencaSaldo = saldoCalculado - saldoFinalBalancete;
  const diferencaDebito = debitoRazao - debitoBalancete;
  const diferencaCredito = creditoRazao - creditoBalancete;
  const semMovimentacao = debitoRazao === 0 && creditoRazao === 0;
  const mesesSemMovimentacao = semMovimentacao ? mesesAnteriores + 1 : 0;

  const categoriaConta = dadosBalancete ? detectarCategoria(dadosBalancete.descricao) : null;
  const lancamentosAlerta = detectarAlertasLancamentos(lancamentos, categoriaConta);

  const observacoes: string[] = [];
  if (!dadosBalancete) observacoes.push('Conta aparece no Razão mas não consta no Balancete');
  if (Math.abs(diferencaSaldo) > TOLERANCIA_PADRAO) {
    observacoes.push(`Diferença de saldo: ${diferencaSaldo.toFixed(2)} — sugere lançamento(s) pendente(s) de contabilização ou lançado em conta incorreta`);
  }
  if (Math.abs(diferencaDebito) > TOLERANCIA_PADRAO) observacoes.push(`Diferença de débito: ${diferencaDebito.toFixed(2)}`);
  if (Math.abs(diferencaCredito) > TOLERANCIA_PADRAO) observacoes.push(`Diferença de crédito: ${diferencaCredito.toFixed(2)}`);

  const duplicados = lancamentosAlerta.filter((a) => a.tipoAlerta === 'DUPLICADO').length;
  const semHistorico = lancamentosAlerta.filter((a) => a.tipoAlerta === 'SEM_HISTORICO').length;
  const foraDoPadrao = lancamentosAlerta.filter((a) => a.tipoAlerta === 'FORA_DO_PADRAO').length;
  const outraConta = lancamentosAlerta.filter((a) => a.tipoAlerta === 'OUTRA_CONTA').length;
  if (duplicados > 0) observacoes.push(`${duplicados} lançamento(s) possivelmente duplicado(s)`);
  if (semHistorico > 0) observacoes.push(`${semHistorico} lançamento(s) sem histórico`);
  if (foraDoPadrao > 0) observacoes.push(`${foraDoPadrao} lançamento(s) fora do padrão da conta`);
  if (outraConta > 0) observacoes.push(`${outraConta} lançamento(s) parecem pertencer a outra conta — revisar e reclassificar se necessário`);

  // saldo invertido (só quando o Balancete tem coluna de Natureza D/C —
  // assume convenção comum: saldo devedor positivo, saldo credor negativo)
  if (dadosBalancete?.natureza) {
    if (dadosBalancete.natureza === 'D' && saldoFinalBalancete < -TOLERANCIA_PADRAO) {
      observacoes.push('Saldo invertido: conta é devedora por natureza, mas apresenta saldo credor');
    }
    if (dadosBalancete.natureza === 'C' && saldoFinalBalancete > TOLERANCIA_PADRAO) {
      observacoes.push('Saldo invertido: conta é credora por natureza, mas apresenta saldo devedor');
    }
  }

  let extratoSaldoFinal: number | null = null;
  let extratoDiferenca: number | null = null;
  if (extrato) {
    extratoSaldoFinal = extrato.reduce((s, e) => s + e.valor, saldoInicial);
    extratoDiferenca = saldoCalculado - extratoSaldoFinal;
    if (Math.abs(extratoDiferenca) > TOLERANCIA_PADRAO) {
      observacoes.push(`Diferença em relação ao extrato bancário: ${extratoDiferenca.toFixed(2)}`);
    }
    // lançamentos do razão sem correspondência (mesma data + valor) no extrato
    lancamentos.forEach((l) => {
      const valor = l.debito > 0 ? l.debito : -l.credito;
      const temCorrespondencia = extrato.some(
        (e) => e.data && l.data && e.data.toDateString() === l.data.toDateString() && Math.abs(e.valor - valor) < TOLERANCIA_PADRAO
      );
      if (!temCorrespondencia) {
        lancamentosAlerta.push({ data: l.data, historico: l.historico, debito: l.debito, credito: l.credito, tipoAlerta: 'SEM_EXTRATO' });
      }
    });
    const semExtrato = lancamentosAlerta.filter((a) => a.tipoAlerta === 'SEM_EXTRATO').length;
    if (semExtrato > 0) observacoes.push(`${semExtrato} lançamento(s) do Razão sem correspondência encontrada no extrato bancário`);
  }

  const status: 'CONCILIADA' | 'PENDENTE' =
    Math.abs(diferencaSaldo) <= TOLERANCIA_PADRAO &&
    Math.abs(diferencaDebito) <= TOLERANCIA_PADRAO &&
    Math.abs(diferencaCredito) <= TOLERANCIA_PADRAO &&
    !!dadosBalancete
      ? 'CONCILIADA'
      : 'PENDENTE';

  return {
    conta,
    descricao: dadosBalancete?.descricao || '',
    saldoInicial,
    debitoBalancete,
    creditoBalancete,
    saldoFinalBalancete,
    debitoRazao,
    creditoRazao,
    saldoCalculado,
    diferencaSaldo,
    diferencaDebito,
    diferencaCredito,
    status,
    semMovimentacao,
    extratoSaldoFinal,
    extratoDiferenca,
    observacoes,
    lancamentosAlerta,
  };
}

// Modo "análise só de Balancete" — sem Razão importado. Verifica: contas sem
// movimentação, saldo elevado (fora do padrão em relação às outras contas do
// balancete), saldo antigo parado (via histórico de apurações anteriores) e
// saldo invertido (quando houver coluna de Natureza).
function processarSoBalancete(balancete: BalanceteRow[], mesesSemMovimentacaoAnteriores: Record<string, number>): ContaConciliada[] {
  const saldosAbsolutos = balancete.map((b) => Math.abs(b.saldoFinal)).filter((v) => v > 0);
  const mediaSaldo = saldosAbsolutos.length > 0 ? saldosAbsolutos.reduce((s, v) => s + v, 0) / saldosAbsolutos.length : 0;
  const limiteSaldoElevado = mediaSaldo * FATOR_SALDO_ELEVADO;

  return balancete
    .map((b) => {
      const semMovimentacao = b.debito === 0 && b.credito === 0;
      const mesesAnteriores = mesesSemMovimentacaoAnteriores[b.conta] || 0;
      const mesesSemMovimentacao = semMovimentacao ? mesesAnteriores + 1 : 0;

      const observacoes: string[] = [];
      if (semMovimentacao && b.saldoFinal !== 0) {
        observacoes.push(
          mesesSemMovimentacao >= 2
            ? `Sem movimentação há ${mesesSemMovimentacao} período(s) seguidos, mas mantém saldo — revisar`
            : 'Sem movimentação neste período, mas mantém saldo'
        );
      }
      if (limiteSaldoElevado > 0 && Math.abs(b.saldoFinal) > limiteSaldoElevado) {
        observacoes.push(`Saldo elevado em relação à média das demais contas do balancete (${mediaSaldo.toFixed(2)})`);
      }
      if (b.natureza === 'D' && b.saldoFinal < -TOLERANCIA_PADRAO) {
        observacoes.push('Saldo invertido: conta é devedora por natureza, mas apresenta saldo credor');
      }
      if (b.natureza === 'C' && b.saldoFinal > TOLERANCIA_PADRAO) {
        observacoes.push('Saldo invertido: conta é credora por natureza, mas apresenta saldo devedor');
      }
      const diferencaInterna = b.saldoInicial + b.debito - b.credito - b.saldoFinal;
      if (Math.abs(diferencaInterna) > TOLERANCIA_PADRAO) {
        observacoes.push(`Saldo final não bate com Saldo Inicial + Débito − Crédito do próprio Balancete (diferença: ${diferencaInterna.toFixed(2)})`);
      }

      return {
        conta: b.conta,
        descricao: b.descricao,
        saldoInicial: b.saldoInicial,
        debitoBalancete: b.debito,
        creditoBalancete: b.credito,
        saldoFinalBalancete: b.saldoFinal,
        debitoRazao: 0,
        creditoRazao: 0,
        saldoCalculado: b.saldoFinal,
        diferencaSaldo: diferencaInterna,
        diferencaDebito: 0,
        diferencaCredito: 0,
        status: observacoes.length === 0 ? 'CONCILIADA' : 'PENDENTE',
        semMovimentacao,
        extratoSaldoFinal: null,
        extratoDiferenca: null,
        observacoes,
        lancamentosAlerta: [],
      } as ContaConciliada;
    })
    .sort((a, b) => b.observacoes.length - a.observacoes.length);
}

export function processarConciliacao(
  balancete: BalanceteRow[],
  razao: RazaoRow[],
  extrato: ExtratoRow[] | null,
  mesesSemMovimentacaoAnteriores: Record<string, number>
): { modo: 'BALANCETE' | 'CONTA_ESPECIFICA'; contasAnalisadas: string[]; resultado: ContaConciliada[] } {
  // Sem Razão importado -> análise só de Balancete, todas as contas
  if (razao.length === 0) {
    return { modo: 'BALANCETE', contasAnalisadas: [], resultado: processarSoBalancete(balancete, mesesSemMovimentacaoAnteriores) };
  }

  // Com Razão importado -> analisa SOMENTE as contas presentes no Razão
  const balancetePorConta: Record<string, BalanceteRow> = {};
  balancete.forEach((b) => {
    balancetePorConta[b.conta] = b;
  });

  const razaoPorConta: Record<string, RazaoRow[]> = {};
  razao.forEach((l) => {
    if (!razaoPorConta[l.conta]) razaoPorConta[l.conta] = [];
    razaoPorConta[l.conta].push(l);
  });

  const contasAnalisadas = Object.keys(razaoPorConta);
  const resultado = contasAnalisadas.map((conta) =>
    processarUmaConta(
      conta,
      balancetePorConta[conta] || null,
      razaoPorConta[conta],
      mesesSemMovimentacaoAnteriores[conta] || 0,
      extrato
    )
  );

  return { modo: 'CONTA_ESPECIFICA', contasAnalisadas, resultado: resultado.sort((a, b) => Math.abs(b.diferencaSaldo) - Math.abs(a.diferencaSaldo)) };
}
