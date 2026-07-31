import { normalize } from './icms-rules';

export type CampoDef = { key: string; label: string; required: boolean; keywords: string[] };

export const CAMPOS_ENTRADA: CampoDef[] = [
  { key: 'doc_fiscal', label: 'Nº da nota fiscal', required: true, keywords: ['doc. fiscal', 'doc fiscal', 'nota fiscal', 'número da nota', 'numero da nota', 'nf-e', 'nfe', 'número nf', 'numero nf', 'doc.fiscal'] },
  { key: 'produto', label: 'Produto', required: false, keywords: ['produto', 'descri'] },
  { key: 'ncm', label: 'NCM', required: false, keywords: ['ncm'] },
  { key: 'fornecedor', label: 'Fornecedor', required: false, keywords: ['fornecedor', 'razao social', 'razão social'] },
  { key: 'cnpj', label: 'CNPJ', required: false, keywords: ['cnpj'] },
  { key: 'uf_origem', label: 'UF de origem da mercadoria', required: true, keywords: ['uf de origem', 'uf origem', 'uf', 'estado'] },
  { key: 'filial', label: 'Filial', required: false, keywords: ['filial', 'empresa', 'loja'] },
  { key: 'tes', label: 'TES', required: true, keywords: ['tes'] },
  { key: 'origem_produto', label: 'Origem do produto', required: false, keywords: ['origem do produto', 'origem da mercadoria', 'origem merc', 'cod. origem', 'codigo origem', 'origem'] },
  { key: 'chave_nfe', label: 'Chave NF-e', required: false, keywords: ['chave'] },
  { key: 'data', label: 'Data de entrada/emissão', required: false, keywords: ['data emiss', 'data entrada', 'dt emiss', 'data'] },
  { key: 'valor_total', label: 'Valor Total da Nota Fiscal', required: true, keywords: ['valor total da nota', 'vlr total', 'valor total', 'valor da nota'] },
  { key: 'despesas', label: 'Valor das despesas', required: false, keywords: ['valor das despesas', 'despesa/seguro', 'despesas', 'despesa'] },
];

export const CAMPOS_PAGAS: CampoDef[] = [
  { key: 'doc_fiscal', label: 'Nº da nota fiscal (NF-e)', required: true, keywords: ['nº nf-e', 'n° nf-e', 'nf-e', 'nfe', 'nota fiscal', 'numero nf', 'número nf'] },
  { key: 'valor', label: 'Valor pago (DAE)', required: true, keywords: ['valor da dae', 'valor dae', 'valor pago', 'valor'] },
  { key: 'data_pagamento', label: 'Data do pagamento', required: false, keywords: ['data pagamento', 'data pgto', 'dt pagamento'] },
  { key: 'tributo', label: 'Tributo', required: false, keywords: ['tributo'] },
  { key: 'competencia', label: 'Competência', required: false, keywords: ['competência', 'competencia'] },
];

export type Mapping = { headerRowIdx: number; columns: Record<string, number> };

export function findHeaderRow(aoa: unknown[][], fields: CampoDef[]): number {
  let bestRow = -1;
  let bestHits = 0;
  const scanRows = Math.min(aoa.length, 15);
  for (let r = 0; r < scanRows; r++) {
    const row = aoa[r] || [];
    let hits = 0;
    row.forEach((cell) => {
      const c = normalize(cell);
      if (!c) return;
      fields.forEach((f) => {
        if (f.keywords.some((k) => c.includes(k))) hits++;
      });
    });
    if (hits > bestHits) {
      bestHits = hits;
      bestRow = r;
    }
  }
  return bestHits >= 1 ? bestRow : -1;
}

export function autoMap(aoa: unknown[][], headerRowIdx: number, fields: CampoDef[]): Mapping {
  const header = (aoa[headerRowIdx] || []).map((h) => normalize(h));
  const columns: Record<string, number> = {};
  const taken = new Set<number>();
  fields.forEach((f) => {
    let colIdx = -1;
    for (const k of f.keywords) {
      for (let i = 0; i < header.length; i++) {
        if (taken.has(i)) continue;
        if (header[i] && header[i].includes(k)) {
          colIdx = i;
          break;
        }
      }
      if (colIdx >= 0) break;
    }
    if (colIdx >= 0) taken.add(colIdx);
    columns[f.key] = colIdx;
  });
  return { headerRowIdx, columns };
}

export function guessBestSheet(sheetNames: string[], getAoa: (name: string) => unknown[][], fields: CampoDef[]): string {
  let best = sheetNames[0];
  let bestScore = -1;
  sheetNames.forEach((name) => {
    const aoa = getAoa(name);
    const hdrRow = findHeaderRow(aoa, fields);
    let score = aoa.length;
    if (hdrRow >= 0) score += 1000;
    if (score > bestScore) {
      bestScore = score;
      best = name;
    }
  });
  return best;
}

// Extrai os objetos mapeados (uma linha da planilha -> um objeto com as chaves dos campos).
export function extractRows(aoa: unknown[][], mapping: Mapping, fields: CampoDef[]): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  for (let r = mapping.headerRowIdx + 1; r < aoa.length; r++) {
    const row = aoa[r];
    if (!row) continue;
    const obj: Record<string, unknown> = {};
    let hasAny = false;
    fields.forEach((f) => {
      const idx = mapping.columns[f.key];
      const val = idx >= 0 ? row[idx] : null;
      obj[f.key] = val;
      if (val !== null && val !== undefined && val !== '') hasAny = true;
    });
    if (hasAny) rows.push(obj);
  }
  return rows;
}
