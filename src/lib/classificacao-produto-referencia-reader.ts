// Leitura da planilha de classificação de referência (ex: estudo de
// reclassificação pra Reforma Tributária IBS/CBS) — diferente do cadastro
// de produtos da empresa (cadastro-produtos-reader.ts): aqui é uma
// referência de qual É o perfil/CST correto pra cada produto, organizada
// em várias abas (uma por perfil), não uma lista única.
//
// Formato esperado (confirmado no arquivo real do usuário,
// "PERFIS DE PRODUTO IBS-CBS - FORTFRUIT.xlsx"): aba "RESUMO" (ignorada,
// só totais) + uma aba por perfil (ex: "P 200014"), cada uma com linha 0 =
// título mesclado (ignorada), linha 1 = cabeçalho, linhas seguintes = dados.
// O nome da aba vira o "perfil correto" de toda linha dela.

import * as XLSX from 'xlsx';
import { normalizarCodigoProdutoImportado } from './analise-fiscal-produtos-import';

function normalizar(v: unknown): string {
  return (v === null || v === undefined ? '' : String(v))
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

type CampoDef = { key: string; keywords: string[]; required: boolean };

const CAMPOS_CLASSIFICACAO_REFERENCIA: CampoDef[] = [
  { key: 'codigo', keywords: ['codigo'], required: true },
  { key: 'descricao', keywords: ['descricao', 'descrição'], required: false },
  { key: 'ncm', keywords: ['ncm'], required: false },
  { key: 'tipo', keywords: ['tipo'], required: false },
  { key: 'grupo', keywords: ['grupo'], required: false },
  { key: 'finalidade', keywords: ['finalidade'], required: false },
  { key: 'cst', keywords: ['cst'], required: false },
  { key: 'cClassTrib', keywords: ['cclasstrib', 'classtrib'], required: false },
  { key: 'reducao', keywords: ['reducao', 'redução'], required: false },
  { key: 'fundamentoLegal', keywords: ['fundamento legal', 'fundamento'], required: false },
  { key: 'confianca', keywords: ['confianca', 'confiança'], required: false },
  { key: 'homologado', keywords: ['homologado'], required: false },
];

function findHeaderRow(aoa: unknown[][], campos: CampoDef[]): number {
  let bestRow = -1;
  let bestHits = 0;
  for (let r = 0; r < Math.min(aoa.length, 5); r++) {
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

function texto(row: unknown[], idx: number): string | null {
  if (idx < 0) return null;
  const v = row[idx];
  const s = String(v ?? '').trim();
  return s || null;
}

export type LinhaClassificacaoReferencia = {
  codigo: string;
  descricao: string | null;
  ncm: string | null;
  tipo: string | null;
  grupo: string | null;
  finalidade: string | null;
  cst: string | null;
  cClassTrib: string | null;
  perfilCorreto: string;
  reducao: string | null;
  fundamentoLegal: string | null;
  confianca: string | null;
  homologado: string | null;
};

const ABA_IGNORADA = 'resumo';

export function lerClassificacaoReferencia(
  workbook: XLSX.WorkBook
): { linhas: LinhaClassificacaoReferencia[]; erro: string | null; abasIgnoradas: string[] } {
  const linhas: LinhaClassificacaoReferencia[] = [];
  const abasIgnoradas: string[] = [];

  for (const nomeAba of workbook.SheetNames) {
    if (normalizar(nomeAba) === ABA_IGNORADA) continue;

    const aoa = XLSX.utils.sheet_to_json(workbook.Sheets[nomeAba], { header: 1, raw: true, defval: null }) as unknown[][];
    const headerRowIdx = findHeaderRow(aoa, CAMPOS_CLASSIFICACAO_REFERENCIA);
    if (headerRowIdx < 0) {
      abasIgnoradas.push(nomeAba);
      continue;
    }
    const colunas = mapearColunas(aoa[headerRowIdx] as unknown[], CAMPOS_CLASSIFICACAO_REFERENCIA);
    if (colunas['codigo'] < 0) {
      abasIgnoradas.push(nomeAba);
      continue;
    }

    const perfilCorreto = nomeAba.trim();
    for (let r = headerRowIdx + 1; r < aoa.length; r++) {
      const row = aoa[r];
      if (!row) continue;
      const codigoBruto = texto(row, colunas['codigo']);
      if (!codigoBruto) continue;
      linhas.push({
        codigo: normalizarCodigoProdutoImportado(codigoBruto),
        descricao: texto(row, colunas['descricao']),
        ncm: texto(row, colunas['ncm']),
        tipo: texto(row, colunas['tipo']),
        grupo: texto(row, colunas['grupo']),
        finalidade: texto(row, colunas['finalidade']),
        cst: texto(row, colunas['cst']),
        cClassTrib: texto(row, colunas['cClassTrib']),
        perfilCorreto,
        reducao: texto(row, colunas['reducao']),
        fundamentoLegal: texto(row, colunas['fundamentoLegal']),
        confianca: texto(row, colunas['confianca']),
        homologado: texto(row, colunas['homologado']),
      });
    }
  }

  if (linhas.length === 0) {
    return {
      linhas: [],
      erro: 'Nenhuma linha de classificação encontrada. Confirme que o arquivo tem uma aba por perfil, com colunas Código e demais campos esperados.',
      abasIgnoradas,
    };
  }

  return { linhas, erro: null, abasIgnoradas };
}
