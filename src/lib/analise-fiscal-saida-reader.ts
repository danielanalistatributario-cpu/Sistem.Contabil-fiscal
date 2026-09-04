// Leitura tolerante do Relatório Fiscal de Saídas (Excel/CSV) — mesmo
// padrão de detecção de cabeçalho por palavra-chave de
// analise-fiscal-reader.ts. O layout real do Protheus é IDÊNTICO ao de
// Entradas (mesma aba "NF-e de Entrada e Saída", mesmas 44 colunas — só a
// coluna "Movto" muda entre E/S, mas o relatório de saídas já vem
// filtrado), por isso reaproveita o mesmo tipo de linha
// (LinhaEntradaImportada) em vez de duplicar ~20 campos — só o rótulo
// "fornecedor" passa a significar "cliente" neste contexto.

import type { LinhaEntradaImportada } from './analise-fiscal-reader';
import { parseValorNumerico } from './analise-fiscal-reader';

function normalizar(v: unknown): string {
  return (v === null || v === undefined ? '' : String(v))
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[.()]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function extrairCodigo(v: string): string {
  const m = v.match(/^\s*(\d+)/);
  return m ? m[1] : v.trim();
}

function parseTextoCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return String(v);
  return String(v).trim();
}

type CampoDef = { key: string; keywords: string[]; required: boolean };

function findHeaderRow(aoa: unknown[][], campos: CampoDef[]): number {
  let bestRow = -1;
  let bestHits = 0;
  for (let r = 0; r < Math.min(aoa.length, 20); r++) {
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
  return bestHits >= 3 ? bestRow : -1;
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
        if (header[i] === k) { idx = i; break; }
      }
      if (idx >= 0) break;
    }
    if (idx < 0) {
      for (const k of f.keywords) {
        for (let i = 0; i < header.length; i++) {
          if (usados.has(i)) continue;
          if (header[i].includes(k)) { idx = i; break; }
        }
        if (idx >= 0) break;
      }
    }
    if (idx >= 0) usados.add(idx);
    map[f.key] = idx;
  });
  return map;
}

// Mesmos campos do leitor de Entradas — "fornecedor" aqui é lido da mesma
// coluna "Fornec./Cliente", só significa "cliente" na prática de Saídas.
const CAMPOS_ANALISE_FISCAL_SAIDA: CampoDef[] = [
  { key: 'tes', keywords: ['tes'], required: true },
  { key: 'chaveNf', keywords: ['chave nf', 'chave da nf', 'chave de acesso', 'chave nfe'], required: true },
  { key: 'numeroNf', keywords: ['numero da nota fiscal', 'numero nf', 'nº nf', 'num nf', 'nota fiscal', 'n.fiscal'], required: true },
  { key: 'produtoDescricao', keywords: ['descricao do produto', 'descricao produto', 'desc produto', 'descricao', 'produto'], required: true },
  { key: 'produtoCodigo', keywords: ['codigo do produto', 'cod produto', 'cod produto'], required: false },
  { key: 'tipo', keywords: ['tipo'], required: false },
  { key: 'ncm', keywords: ['ncm'], required: false },
  { key: 'cfop', keywords: ['cfop'], required: true },
  { key: 'uf', keywords: ['uf'], required: true },
  { key: 'fornecedor', keywords: ['fornec./cliente', 'fornec/cliente', 'fornecedor/cliente', 'cliente', 'fornecedor'], required: true },
  { key: 'cnpjCpf', keywords: ['cnpj/cpf', 'cnpj / cpf', 'cnpj', 'cpf'], required: true },
  { key: 'total', keywords: ['total'], required: true },
  { key: 'desconto', keywords: ['desconto'], required: false },
  { key: 'frete', keywords: ['frete'], required: false },
  { key: 'despesa', keywords: ['despesa'], required: false },
  { key: 'seguro', keywords: ['seguro'], required: false },
  { key: 'valorContabil', keywords: ['valor contabil', 'vl contabil', 'vlr contabil'], required: false },
  { key: 'baseIcms', keywords: ['base de calculo do icms', 'base calculo icms', 'base icms', 'bc icms'], required: false },
  { key: 'valorIcms', keywords: ['valor do icms', 'valor icms', 'vl icms', 'vlr icms'], required: false },
  { key: 'aliquotaIcms', keywords: ['aliquota do icms', 'aliquota icms', 'aliq icms', '% icms'], required: false },
  { key: 'isento', keywords: ['isento'], required: false },
  { key: 'baseOutros', keywords: ['base outros', 'outras bases', 'base outra'], required: false },
  { key: 'basePis', keywords: ['base do pis', 'base pis', 'bc pis'], required: false },
  { key: 'valorPis', keywords: ['valor do pis', 'valor pis', 'vl pis'], required: false },
  { key: 'aliquotaPis', keywords: ['aliquota do pis', 'aliquota pis', 'aliq pis'], required: false },
  { key: 'baseCofins', keywords: ['base do cofins', 'base cofins', 'bc cofins'], required: false },
  { key: 'valorCofins', keywords: ['valor do cofins', 'valor cofins', 'vl cofins'], required: false },
  { key: 'aliquotaCofins', keywords: ['aliquota do cofins', 'aliquota cofins', 'aliq cofins'], required: false },
  { key: 'origem', keywords: ['origem'], required: false },
];

export function lerRelatorioSaidas(aoa: unknown[][]): { rows: LinhaEntradaImportada[]; erro: string | null } {
  const headerRowIdx = findHeaderRow(aoa, CAMPOS_ANALISE_FISCAL_SAIDA);
  if (headerRowIdx < 0) {
    return {
      rows: [],
      erro:
        'Não foi possível localizar o cabeçalho do Relatório de Saídas. Confirme se o arquivo tem colunas como TES, Produto, CFOP, UF, Fornec./Cliente, CNPJ/CPF, Chave NF e Total.',
    };
  }
  const colunas = mapearColunas(aoa[headerRowIdx] as unknown[], CAMPOS_ANALISE_FISCAL_SAIDA);
  const faltando = CAMPOS_ANALISE_FISCAL_SAIDA.filter((c) => c.required && colunas[c.key] < 0).map((c) => c.key);
  if (faltando.length > 0) {
    const LABELS: Record<string, string> = {
      tes: 'TES', chaveNf: 'Chave NF', numeroNf: 'Número da Nota Fiscal', produtoDescricao: 'Produto/Descrição do Produto',
      cfop: 'CFOP', uf: 'UF', fornecedor: 'Fornec./Cliente', cnpjCpf: 'CNPJ/CPF', total: 'Total',
    };
    return {
      rows: [],
      erro: `Colunas obrigatórias não encontradas no Relatório de Saídas: ${faltando.map((k) => LABELS[k] || k).join(', ')}.`,
    };
  }

  const rows: LinhaEntradaImportada[] = [];
  for (let r = headerRowIdx + 1; r < aoa.length; r++) {
    const row = aoa[r];
    if (!row) continue;
    const tes = extrairCodigo(parseTextoCell(row[colunas['tes']]));
    const cfop = extrairCodigo(parseTextoCell(row[colunas['cfop']]));
    if (!tes && !cfop) continue;

    rows.push({
      linha: r + 1,
      tes,
      chaveNf: parseTextoCell(row[colunas['chaveNf']]),
      numeroNf: parseTextoCell(row[colunas['numeroNf']]),
      produtoDescricao: parseTextoCell(row[colunas['produtoDescricao']]),
      produtoCodigo: colunas['produtoCodigo'] >= 0 ? parseTextoCell(row[colunas['produtoCodigo']]) : '',
      tipo: colunas['tipo'] >= 0 ? parseTextoCell(row[colunas['tipo']]) : '',
      ncm: colunas['ncm'] >= 0 ? parseTextoCell(row[colunas['ncm']]) : '',
      cfop,
      uf: parseTextoCell(row[colunas['uf']]).toUpperCase(),
      fornecedor: parseTextoCell(row[colunas['fornecedor']]),
      cnpjCpf: parseTextoCell(row[colunas['cnpjCpf']]),
      total: parseValorNumerico(row[colunas['total']]),
      desconto: colunas['desconto'] >= 0 ? parseValorNumerico(row[colunas['desconto']]) : null,
      frete: colunas['frete'] >= 0 ? parseValorNumerico(row[colunas['frete']]) : null,
      despesa: colunas['despesa'] >= 0 ? parseValorNumerico(row[colunas['despesa']]) : null,
      seguro: colunas['seguro'] >= 0 ? parseValorNumerico(row[colunas['seguro']]) : null,
      valorContabil: colunas['valorContabil'] >= 0 ? parseValorNumerico(row[colunas['valorContabil']]) : null,
      baseIcms: colunas['baseIcms'] >= 0 ? parseValorNumerico(row[colunas['baseIcms']]) : null,
      valorIcms: colunas['valorIcms'] >= 0 ? parseValorNumerico(row[colunas['valorIcms']]) : null,
      aliquotaIcms: colunas['aliquotaIcms'] >= 0 ? parseValorNumerico(row[colunas['aliquotaIcms']]) : null,
      isento: colunas['isento'] >= 0 ? parseValorNumerico(row[colunas['isento']]) : null,
      baseOutros: colunas['baseOutros'] >= 0 ? parseValorNumerico(row[colunas['baseOutros']]) : null,
      basePis: colunas['basePis'] >= 0 ? parseValorNumerico(row[colunas['basePis']]) : null,
      valorPis: colunas['valorPis'] >= 0 ? parseValorNumerico(row[colunas['valorPis']]) : null,
      aliquotaPis: colunas['aliquotaPis'] >= 0 ? parseValorNumerico(row[colunas['aliquotaPis']]) : null,
      baseCofins: colunas['baseCofins'] >= 0 ? parseValorNumerico(row[colunas['baseCofins']]) : null,
      valorCofins: colunas['valorCofins'] >= 0 ? parseValorNumerico(row[colunas['valorCofins']]) : null,
      aliquotaCofins: colunas['aliquotaCofins'] >= 0 ? parseValorNumerico(row[colunas['aliquotaCofins']]) : null,
      origem: colunas['origem'] >= 0 ? parseTextoCell(row[colunas['origem']]) : '',
    });
  }

  return { rows, erro: null };
}
