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
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isNaN(n) ? 0 : n;
}

function parseDataCell(v: unknown): Date | null {
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
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
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
      for (let i = 0; i < header.length; i++) {
        if (usados.has(i)) continue;
        if (header[i] === k || header[i].includes(k)) {
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

const CAMPOS_EXTRATO: CampoDef[] = [
  { key: 'data', keywords: ['data'], required: true },
  { key: 'historico', keywords: ['historico', 'descricao', 'complemento'], required: false },
  { key: 'valor', keywords: ['valor'], required: false },
  { key: 'debito', keywords: ['debito', 'saida', 'saída'], required: false },
  { key: 'credito', keywords: ['credito', 'entrada'], required: false },
];

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

  const rows: ExtratoRow[] = [];
  for (let r = headerRowIdx + 1; r < aoa.length; r++) {
    const row = aoa[r];
    if (!row) continue;
    const data = colunas['data'] >= 0 ? parseDataCell(row[colunas['data']]) : null;
    let valor = 0;
    if (colunas['valor'] >= 0) {
      valor = parseValorNumerico(row[colunas['valor']]);
    } else {
      const debito = colunas['debito'] >= 0 ? parseValorNumerico(row[colunas['debito']]) : 0;
      const credito = colunas['credito'] >= 0 ? parseValorNumerico(row[colunas['credito']]) : 0;
      valor = credito - debito; // entrada positiva, saída negativa
    }
    if (valor === 0 && !data) continue;
    rows.push({
      data,
      historico: colunas['historico'] >= 0 ? String(row[colunas['historico']] ?? '').trim() : '',
      valor,
    });
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
    brutos.push({
      data: colunas['data'] >= 0 ? parseDataCell(row[colunas['data']]) : null,
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

  const brutos: { data: Date | null; historico: string; valor: number; saldo: number | null }[] = [];
  for (let r = headerRowIdx + 1; r < aoa.length; r++) {
    const row = aoa[r];
    if (!row) continue;
    const data = colunas['data'] >= 0 ? parseDataCell(row[colunas['data']]) : null;
    let valor = 0;
    if (colunas['valor'] >= 0) {
      valor = parseValorNumerico(row[colunas['valor']]);
    } else {
      const debito = colunas['debito'] >= 0 ? parseValorNumerico(row[colunas['debito']]) : 0;
      const credito = colunas['credito'] >= 0 ? parseValorNumerico(row[colunas['credito']]) : 0;
      valor = credito - debito;
    }
    if (valor === 0 && !data) continue;
    brutos.push({
      data,
      historico: colunas['historico'] >= 0 ? String(row[colunas['historico']] ?? '').trim() : '',
      valor,
      saldo: colSaldo >= 0 ? parseValorNumerico(row[colSaldo]) : null,
    });
  }

  const errosAsc = contarInconsistencias(brutos);
  const errosDesc = contarInconsistencias([...brutos].reverse());
  const rows = errosDesc < errosAsc ? [...brutos].reverse() : brutos;

  return { rows, erro: null };
}
