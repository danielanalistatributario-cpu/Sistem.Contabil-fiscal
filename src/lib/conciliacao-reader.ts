import type { BalanceteRow, RazaoRow, ExtratoRow } from './conciliacao-rules';

// Leitura tolerante: procura a linha de cabeçalho nas primeiras linhas do
// arquivo e identifica as colunas por palavras-chave (aceita variações comuns
// de nomenclatura entre diferentes sistemas contábeis).

function normalizar(v: unknown): string {
  return (v === null || v === undefined ? '' : String(v))
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function parseValorNumerico(v: unknown): number {
  if (typeof v === 'number') return v;
  if (!v) return 0;
  let s = String(v).trim();
  s = s.replace(/\s*[DC]$/i, ''); // sufixo devedor/credor (ex: "334.256,10 D")
  if (/,\d{1,2}$/.test(s)) {
    s = s.replace(/\./g, '').replace(',', '.'); // formato BR: milhar com ponto, decimal com vírgula
  }
  const n = parseFloat(s);
  return Number.isNaN(n) ? 0 : n;
}

// anoFallback: alguns extratos (confirmado no Safra) trazem a data só como
// dia/mês, sem ano, porque o ano já está implícito no período declarado no
// cabeçalho do arquivo (ver extrairAnoDoPeriodo). Sem isso, o fallback
// genérico (`new Date(s)`) interpretava "01/07" como um bug real —
// 2001-01-07 — corrompendo ou descartando a maior parte das linhas do
// extrato silenciosamente.
function parseDataCell(v: unknown, anoFallback?: number | null): Date | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (!v) return null;
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    let ano = parseInt(m[3]);
    if (ano < 100) ano += 2000;
    const d = new Date(Date.UTC(ano, parseInt(m[2]) - 1, parseInt(m[1])));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const m2 = s.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (m2) {
    if (!anoFallback) return null; // sem ano de referência disponível — não arrisca data errada
    const d = new Date(Date.UTC(anoFallback, parseInt(m2[2]) - 1, parseInt(m2[1])));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Procura um ano de referência (ex: "Período de 01/07/2026 à 15/07/2026")
// nas primeiras linhas do arquivo, para resolver datas "dia/mês" sem ano
// (ver parseDataCell). Pega a última data completa encontrada (normalmente
// o fim do período) — na prática qualquer uma serve, já que o arquivo
// inteiro costuma cair no mesmo ano.
function extrairAnoDoPeriodo(aoa: unknown[][]): number | null {
  let ano: number | null = null;
  for (let r = 0; r < Math.min(aoa.length, 15); r++) {
    const row = aoa[r] || [];
    for (const cell of row) {
      const s = String(cell ?? '');
      for (const match of s.matchAll(/\d{1,2}\/\d{1,2}\/(\d{4})/g)) {
        ano = parseInt(match[1]);
      }
    }
  }
  return ano;
}

type CampoDef = { key: string; keywords: string[]; required: boolean };

function findHeaderRow(aoa: unknown[][], campos: CampoDef[]): number {
  let bestRow = -1;
  let bestHits = 0;
  for (let r = 0; r < Math.min(aoa.length, 15); r++) {
    const row = aoa[r] || [];
    let hits = 0;
    row.forEach((cell) => {
      const c = normalizar(cell);
      if (!c) return;
      campos.forEach((f) => {
        if (f.keywords.some((k) => c === k || c.includes(k))) hits++;
      });
    });
    if (hits > bestHits) {
      bestHits = hits;
      bestRow = r;
    }
  }
  return bestHits >= 2 ? bestRow : -1;
}

function mapearColunas(headerRow: unknown[], campos: CampoDef[]): Record<string, number> {
  const map: Record<string, number> = {};
  const header = headerRow.map((h) => normalizar(h));
  const usados = new Set<number>();
  campos.forEach((f) => {
    let idx = -1;
    for (const k of f.keywords) {
      // prioriza correspondência exata sobre substring — evita que uma
      // coluna tipo "Tipo do Lançamento" seja confundida com "Lançamento"
      // só porque uma contém o texto da outra.
      for (let i = 0; i < header.length; i++) {
        if (usados.has(i)) continue;
        if (header[i] === k) {
          idx = i;
          break;
        }
      }
      if (idx >= 0) break;
      for (let i = 0; i < header.length; i++) {
        if (usados.has(i)) continue;
        if (header[i].includes(k)) {
          idx = i;
          break;
        }
      }
      if (idx >= 0) break;
    }
    if (idx >= 0) usados.add(idx);
    map[f.key] = idx;
  });
  return map;
}

// ---------------- BALANCETE ----------------

const CAMPOS_BALANCETE: CampoDef[] = [
  { key: 'conta', keywords: ['codigo da conta', 'cod. conta', 'cod conta', 'conta contabil', 'conta'], required: true },
  { key: 'descricao', keywords: ['descricao', 'historico', 'nome da conta'], required: false },
  { key: 'saldoInicial', keywords: ['saldo anterior', 'saldo inicial'], required: true },
  { key: 'debito', keywords: ['debito', 'total debito'], required: true },
  { key: 'credito', keywords: ['credito', 'total credito'], required: true },
  { key: 'saldoFinal', keywords: ['saldo atual', 'saldo final'], required: true },
  { key: 'natureza', keywords: ['natureza', 'tipo de saldo', 'd/c'], required: false },
];

function parseNatureza(v: unknown): 'D' | 'C' | null {
  const s = normalizar(v);
  if (!s) return null;
  if (s === 'd' || s.startsWith('devedor')) return 'D';
  if (s === 'c' || s.startsWith('credor')) return 'C';
  return null;
}

export function lerBalancete(aoa: unknown[][]): { rows: BalanceteRow[]; erro: string | null } {
  const headerRowIdx = findHeaderRow(aoa, CAMPOS_BALANCETE);
  if (headerRowIdx < 0) {
    return {
      rows: [],
      erro: 'Não foi possível localizar o cabeçalho do Balancete. Confirme as colunas: Conta, Saldo Inicial, Débito, Crédito, Saldo Final.',
    };
  }
  const colunas = mapearColunas(aoa[headerRowIdx] as unknown[], CAMPOS_BALANCETE);
  const faltando = CAMPOS_BALANCETE.filter((c) => c.required && colunas[c.key] < 0).map((c) => c.key);
  if (faltando.length > 0) {
    return { rows: [], erro: `Colunas obrigatórias não encontradas no Balancete: ${faltando.join(', ')}.` };
  }

  const rows: BalanceteRow[] = [];
  for (let r = headerRowIdx + 1; r < aoa.length; r++) {
    const row = aoa[r];
    if (!row) continue;
    const conta = row[colunas['conta']];
    if (conta === null || conta === undefined || String(conta).trim() === '') continue;
    rows.push({
      conta: String(conta).trim(),
      descricao: colunas['descricao'] >= 0 ? String(row[colunas['descricao']] ?? '').trim() : '',
      saldoInicial: parseValorNumerico(row[colunas['saldoInicial']]),
      debito: parseValorNumerico(row[colunas['debito']]),
      credito: parseValorNumerico(row[colunas['credito']]),
      saldoFinal: parseValorNumerico(row[colunas['saldoFinal']]),
      natureza: colunas['natureza'] >= 0 ? parseNatureza(row[colunas['natureza']]) : null,
    });
  }
  return { rows, erro: null };
}

// ---------------- RAZÃO ----------------

const CAMPOS_RAZAO: CampoDef[] = [
  { key: 'conta', keywords: ['codigo da conta', 'cod. conta', 'cod conta', 'conta contabil', 'conta'], required: true },
  { key: 'data', keywords: ['data do lancamento', 'data lancamento', 'data'], required: false },
  { key: 'historico', keywords: ['historico', 'descricao do lancamento', 'complemento'], required: false },
  { key: 'debito', keywords: ['valor debito', 'debito'], required: true },
  { key: 'credito', keywords: ['valor credito', 'credito'], required: true },
];

export function lerRazao(aoa: unknown[][]): { rows: RazaoRow[]; erro: string | null } {
  const headerRowIdx = findHeaderRow(aoa, CAMPOS_RAZAO);
  if (headerRowIdx < 0) {
    return {
      rows: [],
      erro: 'Não foi possível localizar o cabeçalho do Razão. Confirme as colunas: Conta, Data, Histórico, Débito, Crédito.',
    };
  }
  const colunas = mapearColunas(aoa[headerRowIdx] as unknown[], CAMPOS_RAZAO);
  const faltando = CAMPOS_RAZAO.filter((c) => c.required && colunas[c.key] < 0).map((c) => c.key);
  if (faltando.length > 0) {
    return { rows: [], erro: `Colunas obrigatórias não encontradas no Razão: ${faltando.join(', ')}.` };
  }

  const rows: RazaoRow[] = [];
  for (let r = headerRowIdx + 1; r < aoa.length; r++) {
    const row = aoa[r];
    if (!row) continue;
    const conta = row[colunas['conta']];
    if (conta === null || conta === undefined || String(conta).trim() === '') continue;
    const debito = parseValorNumerico(row[colunas['debito']]);
    const credito = parseValorNumerico(row[colunas['credito']]);
    if (debito === 0 && credito === 0) continue; // linha sem valor, provavelmente totalizadora/vazia
    rows.push({
      conta: String(conta).trim(),
      data: colunas['data'] >= 0 ? parseDataCell(row[colunas['data']]) : null,
      historico: colunas['historico'] >= 0 ? String(row[colunas['historico']] ?? '').trim() : '',
      debito,
      credito,
    });
  }
  return { rows, erro: null };
}

// ---------------- EXTRATO BANCÁRIO (Excel/CSV) ----------------
// Nesta versão só suporta Excel/CSV com colunas Data, Histórico e Valor
// (ou Débito/Crédito separados). Extrato em formato OFX ainda não é
// suportado — fica como sugestão para uma próxima etapa.

// historico prioriza 'lancamento' sobre 'complemento': no extrato real do
// Safra a descrição do lançamento ("SALDO TOTAL", "APLICACAO CDB
// AUTOMATICO", "PIX RECEBIDO"...) fica numa coluna "Lançamento", enquanto
// "Complemento" é um detalhe secundário quase sempre vazio — com a ordem
// antiga, a correspondência exata batia em "Complemento" primeiro (bate
// exato) e nunca chegava a "Lançamento", deixando historico vazio pra quase
// toda linha. Isso quebrava tanto o reconhecimento de linhas de saldo
// (ehLinhaDeSaldo) quanto a sugestão de categoria — 'complemento' continua
// na lista como fallback para formatos que só tenham essa coluna.
const CAMPOS_EXTRATO: CampoDef[] = [
  { key: 'data', keywords: ['data'], required: true },
  { key: 'historico', keywords: ['historico', 'descricao', 'lancamento', 'complemento'], required: false },
  { key: 'valor', keywords: ['valor'], required: false },
  { key: 'debito', keywords: ['debito', 'saida', 'saída'], required: false },
  { key: 'credito', keywords: ['credito', 'entrada'], required: false },
];

// Alguns extratos (confirmado em exportação real do Santander) guardam
// Débito/Crédito já com o sinal econômico embutido — Débito como entrada
// positiva, Crédito como saída já negativa — em vez da convenção padrão de
// magnitudes positivas (Débito = saída, Crédito = entrada, valor = credito -
// debito). Detecta isso olhando se algum valor bruto de Débito ou Crédito é
// negativo: nesse caso as colunas já vêm assinadas e a soma direta
// (debito + credito) é o valor correto; senão, mantém a convenção padrão.
function temValoresPreAssinados(aoa: unknown[][], headerRowIdx: number, colDebito: number, colCredito: number): boolean {
  for (let r = headerRowIdx + 1; r < aoa.length; r++) {
    const row = aoa[r];
    if (!row) continue;
    if (colDebito >= 0 && parseValorNumerico(row[colDebito]) < 0) return true;
    if (colCredito >= 0 && parseValorNumerico(row[colCredito]) < 0) return true;
  }
  return false;
}

export function lerExtratoBancario(aoa: unknown[][]): { rows: ExtratoRow[]; erro: string | null } {
  const headerRowIdx = findHeaderRow(aoa, CAMPOS_EXTRATO);
  if (headerRowIdx < 0) {
    return {
      rows: [],
      erro: 'Não foi possível localizar o cabeçalho do Extrato Bancário. Confirme as colunas: Data, Histórico, Valor (ou Débito/Crédito).',
    };
  }
  const colunas = mapearColunas(aoa[headerRowIdx] as unknown[], CAMPOS_EXTRATO);
  if (colunas['valor'] < 0 && colunas['debito'] < 0 && colunas['credito'] < 0) {
    return { rows: [], erro: 'O Extrato Bancário precisa ter uma coluna de Valor, ou de Débito/Crédito separados.' };
  }
  const preAssinado = colunas['valor'] < 0 && temValoresPreAssinados(aoa, headerRowIdx, colunas['debito'], colunas['credito']);
  const anoFallback = extrairAnoDoPeriodo(aoa);

  const rows: ExtratoRow[] = [];
  for (let r = headerRowIdx + 1; r < aoa.length; r++) {
    const row = aoa[r];
    if (!row) continue;
    const data = colunas['data'] >= 0 ? parseDataCell(row[colunas['data']], anoFallback) : null;
    let valor = 0;
    if (colunas['valor'] >= 0) {
      valor = parseValorNumerico(row[colunas['valor']]);
    } else {
      const debito = colunas['debito'] >= 0 ? parseValorNumerico(row[colunas['debito']]) : 0;
      const credito = colunas['credito'] >= 0 ? parseValorNumerico(row[colunas['credito']]) : 0;
      valor = preAssinado ? debito + credito : credito - debito; // entrada positiva, saída negativa
    }
    if (!data) continue; // sem data não é um lançamento real — provável linha de total/rodapé da planilha
    rows.push({ data, historico: colunas['historico'] >= 0 ? String(row[colunas['historico']] ?? '').trim() : '', valor });
  }
  return { rows, erro: null };
}

// ---------------- RAZÃO DE UMA CONTA BANCÁRIA (com saldo corrente) ----------------
// Usado na Conciliação Bancária. Aceita opcionalmente uma coluna de saldo
// corrente (ex: "SALDO ATUAL"), usada na comparação de saldo dia a dia.

import type { LancamentoConta } from './conciliacao-bancaria';

const CAMPOS_RAZAO_BANCO: CampoDef[] = [
  { key: 'data', keywords: ['data'], required: true },
  { key: 'historico', keywords: ['historico', 'descricao do lancamento', 'complemento'], required: false },
  { key: 'debito', keywords: ['debito'], required: true },
  { key: 'credito', keywords: ['credito'], required: true },
  { key: 'saldo', keywords: ['saldo atual', 'saldo final', 'saldo'], required: false },
];

// Verifica se a sequência de saldos é consistente com saldo[i-1] + valor[i] == saldo[i]
// (ordem cronológica ascendente). Retorna a contagem de inconsistências.
function contarInconsistencias(linhas: { valor: number; saldo: number | null }[]): number {
  let erros = 0;
  let anterior: number | null = null;
  for (const l of linhas) {
    if (l.saldo === null) continue;
    if (anterior !== null && Math.abs(anterior + l.valor - l.saldo) > 0.01) erros++;
    anterior = l.saldo;
  }
  return erros;
}

export function lerRazaoBancario(aoa: unknown[][]): { rows: LancamentoConta[]; erro: string | null } {
  const headerRowIdx = findHeaderRow(aoa, CAMPOS_RAZAO_BANCO);
  if (headerRowIdx < 0) {
    return { rows: [], erro: 'Não foi possível localizar o cabeçalho do Razão. Confirme as colunas: Data, Histórico, Débito, Crédito.' };
  }
  const colunas = mapearColunas(aoa[headerRowIdx] as unknown[], CAMPOS_RAZAO_BANCO);
  const faltando = CAMPOS_RAZAO_BANCO.filter((c) => c.required && colunas[c.key] < 0).map((c) => c.key);
  if (faltando.length > 0) {
    return { rows: [], erro: `Colunas obrigatórias não encontradas no Razão: ${faltando.join(', ')}.` };
  }

  const brutos: { data: Date | null; historico: string; valor: number; saldo: number | null }[] = [];
  for (let r = headerRowIdx + 1; r < aoa.length; r++) {
    const row = aoa[r];
    if (!row) continue;
    const debito = parseValorNumerico(row[colunas['debito']]);
    const credito = parseValorNumerico(row[colunas['credito']]);
    if (debito === 0 && credito === 0) continue;
    const dataLinha = colunas['data'] >= 0 ? parseDataCell(row[colunas['data']]) : null;
    if (!dataLinha) continue; // sem data não é um lançamento real — provável linha de total/rodapé da planilha
    brutos.push({
      data: dataLinha,
      historico: colunas['historico'] >= 0 ? String(row[colunas['historico']] ?? '').trim() : '',
      valor: debito - credito, // positivo = entrada (debito em conta de Ativo aumenta o saldo)
      saldo: colunas['saldo'] >= 0 ? parseValorNumerico(row[colunas['saldo']]) : null,
    });
  }

  // detecta automaticamente se o arquivo está em ordem ascendente ou descendente
  const errosAsc = contarInconsistencias(brutos);
  const errosDesc = contarInconsistencias([...brutos].reverse());
  const rows = errosDesc < errosAsc ? [...brutos].reverse() : brutos;

  return { rows, erro: null };
}

// ---------------- EXTRATO BANCÁRIO (versão com saldo corrente e auto-detecção de ordem) ----------------

export function lerExtratoBancarioComSaldo(aoa: unknown[][]): { rows: LancamentoConta[]; erro: string | null } {
  const headerRowIdx = findHeaderRow(aoa, CAMPOS_EXTRATO);
  if (headerRowIdx < 0) {
    return { rows: [], erro: 'Não foi possível localizar o cabeçalho do Extrato Bancário. Confirme as colunas: Data, Histórico, Valor (ou Débito/Crédito).' };
  }
  const colunas = mapearColunas(aoa[headerRowIdx] as unknown[], CAMPOS_EXTRATO);
  if (colunas['valor'] < 0 && colunas['debito'] < 0 && colunas['credito'] < 0) {
    return { rows: [], erro: 'O Extrato Bancário precisa ter uma coluna de Valor, ou de Débito/Crédito separados.' };
  }
  const colSaldo = mapearColunas(aoa[headerRowIdx] as unknown[], [{ key: 'saldo', keywords: ['saldo'], required: false }])['saldo'];
  const colDocumento = mapearColunas(aoa[headerRowIdx] as unknown[], [
    { key: 'documento', keywords: ['documento', 'nosso numero', 'nosso número', 'num documento', 'n documento'], required: false },
  ])['documento'];
  const preAssinado = colunas['valor'] < 0 && temValoresPreAssinados(aoa, headerRowIdx, colunas['debito'], colunas['credito']);
  const anoFallback = extrairAnoDoPeriodo(aoa);

  const brutos: { data: Date | null; historico: string; valor: number; saldo: number | null; documento: string | null }[] = [];
  for (let r = headerRowIdx + 1; r < aoa.length; r++) {
    const row = aoa[r];
    if (!row) continue;
    const data = colunas['data'] >= 0 ? parseDataCell(row[colunas['data']], anoFallback) : null;
    let valor = 0;
    if (colunas['valor'] >= 0) {
      valor = parseValorNumerico(row[colunas['valor']]);
    } else {
      const debito = colunas['debito'] >= 0 ? parseValorNumerico(row[colunas['debito']]) : 0;
      const credito = colunas['credito'] >= 0 ? parseValorNumerico(row[colunas['credito']]) : 0;
      valor = preAssinado ? debito + credito : credito - debito;
    }
    if (!data) continue; // sem data não é um lançamento real — provável linha de total/rodapé da planilha
    brutos.push({
      data,
      historico: colunas['historico'] >= 0 ? String(row[colunas['historico']] ?? '').trim() : '',
      valor,
      saldo: colSaldo >= 0 ? parseValorNumerico(row[colSaldo]) : null,
      documento: colDocumento >= 0 ? String(row[colDocumento] ?? '').trim() || null : null,
    });
  }

  // Alguns extratos (confirmado no Safra) não têm coluna de saldo corrente
  // dedicada — o saldo aparece só como linhas informativas periódicas
  // ("SALDO CONTA CORRENTE", "SALDO TOTAL", "SALDO APLIC AUTOMATICA") com o
  // valor do momento na própria coluna de Valor, misturado com os
  // lançamentos normais. Sem isso, toda linha ficava com saldo null e o
  // saldo final do extrato saía sempre 0 — fazendo a conferência de saldo
  // final do período parecer sempre divergente mesmo com tudo conciliado.
  // Reconstrói o saldo corrente usando "SALDO CONTA CORRENTE" (a que
  // corresponde à conta corrente pura, comparável ao saldo do Razão — as
  // outras duas incluem a aplicação automática) como ponto de partida e
  // soma os lançamentos seguintes; linhas de saldo nunca entram como
  // lançamento real (mesmo critério que ehLinhaDeSaldo em
  // conciliacao-bancaria.ts). Assume os `brutos` na ordem cronológica do
  // arquivo, que é como o Safra sempre exporta — roda antes da
  // detecção de ordem asc/desc abaixo.
  if (colSaldo < 0) {
    let saldoCorrente: number | null = null;
    for (const item of brutos) {
      const h = normalizar(item.historico);
      if (h.startsWith('saldo')) {
        // A própria linha "SALDO CONTA CORRENTE" guarda seu `.saldo` também
        // (não só serve de ponto de partida pra somar os lançamentos
        // seguintes) — é o saldo de ABERTURA do dia informado pelo banco,
        // valor de referência independente pra conferir Saldo Inicial +
        // Entradas - Saídas = Saldo Final por dia (ver conciliacao-bancaria.ts).
        // Continua fora do pool de pareamento (ehLinhaDeSaldo já filtra),
        // então marcar `.saldo` aqui não afeta o pareamento.
        if (h.startsWith('saldo conta corrente')) {
          saldoCorrente = item.valor;
          item.saldo = item.valor;
        }
        continue;
      }
      if (saldoCorrente !== null) {
        saldoCorrente += item.valor;
        item.saldo = saldoCorrente;
      }
    }
  }

  const errosAsc = contarInconsistencias(brutos);
  const errosDesc = contarInconsistencias([...brutos].reverse());
  const rows = errosDesc < errosAsc ? [...brutos].reverse() : brutos;

  return { rows, erro: null };
}
