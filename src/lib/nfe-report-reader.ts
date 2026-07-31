import type { ItemEntrada } from './difal-rules';

// Lê o relatório "NF-e de Entrada e Saída" (mesmo layout do modelo usado no
// conversor de SPED) e extrai os campos necessários para o cálculo do DIFAL.
// Localiza a linha de cabeçalho procurando por "Nota Fiscal", para tolerar a
// linha de título mesclada no topo do arquivo.

const COLUNAS_OBRIGATORIAS = ['Nota Fiscal', 'UF da NF', 'Origem', 'Cfop', 'Total'] as const;

const COLUNAS_OPCIONAIS = ['Emissao', 'Cnpj/Cpf', 'Fornec/Cliente', 'Produto', 'N.C.M.', 'Qtde', 'Unitario', 'Desconto', 'Frete', 'Despesa'] as const;

const COLUNAS_NECESSARIAS = [...COLUNAS_OBRIGATORIAS, ...COLUNAS_OPCIONAIS] as const;

function normalizar(v: unknown): string {
  return (v === null || v === undefined ? '' : String(v)).trim().toLowerCase();
}

function encontrarLinhaCabecalho(aoa: unknown[][]): number {
  for (let r = 0; r < Math.min(aoa.length, 10); r++) {
    const row = aoa[r] || [];
    const hasNotaFiscal = row.some((cell) => normalizar(cell) === 'nota fiscal');
    if (hasNotaFiscal) return r;
  }
  return -1;
}

function mapearColunas(headerRow: unknown[]): Record<string, number> {
  const map: Record<string, number> = {};
  const headerNormalizado = headerRow.map((h) => normalizar(h));
  COLUNAS_NECESSARIAS.forEach((nome) => {
    const idx = headerNormalizado.findIndex((h) => h === normalizar(nome));
    map[nome] = idx;
  });
  return map;
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
  // aceita "dd/mm/aaaa"
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const d = new Date(Date.UTC(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1])));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export type LeituraResultado = {
  itens: ItemEntrada[];
  totalLinhas: number;
  erro: string | null;
};

export function lerRelatorioNFe(aoa: unknown[][]): LeituraResultado {
  const headerRowIdx = encontrarLinhaCabecalho(aoa);
  if (headerRowIdx < 0) {
    return {
      itens: [],
      totalLinhas: 0,
      erro:
        'Não foi possível localizar o cabeçalho do relatório (coluna "Nota Fiscal"). Confirme se o arquivo está no layout "NF-e de Entrada e Saída".',
    };
  }

  const colunas = mapearColunas(aoa[headerRowIdx] as unknown[]);
  const faltando = COLUNAS_OBRIGATORIAS.filter((c) => colunas[c] < 0);
  if (faltando.length > 0) {
    return {
      itens: [],
      totalLinhas: 0,
      erro: `Colunas obrigatórias não encontradas no arquivo: ${faltando.join(', ')}.`,
    };
  }

  // helper: le uma coluna opcional; se nao existir no arquivo (indice -1), retorna undefined
  const col = (row: unknown[], nome: (typeof COLUNAS_NECESSARIAS)[number]) => {
    const idx = colunas[nome];
    return idx >= 0 ? row[idx] : undefined;
  };

  const itens: ItemEntrada[] = [];
  for (let r = headerRowIdx + 1; r < aoa.length; r++) {
    const row = aoa[r];
    if (!row) continue;
    const docFiscal = col(row, 'Nota Fiscal');
    if (docFiscal === null || docFiscal === undefined || String(docFiscal).trim() === '') continue;

    const totalBruto = parseValorNumerico(col(row, 'Total'));
    const desconto = parseValorNumerico(col(row, 'Desconto'));
    const frete = parseValorNumerico(col(row, 'Frete'));
    const despesaIpi = parseValorNumerico(col(row, 'Despesa'));
    // Base ajustada para o DIFAL: valor do item, descontado o desconto e
    // somados frete e despesas/IPI acessórias (quando houver essas colunas).
    const valorTotal = totalBruto - desconto + frete + despesaIpi;

    itens.push({
      docFiscal: String(docFiscal).trim(),
      fornecedor: String(col(row, 'Fornec/Cliente') ?? '').trim(),
      cnpj: String(col(row, 'Cnpj/Cpf') ?? '').trim(),
      ufOrigem: String(col(row, 'UF da NF') ?? '').trim(),
      produto: String(col(row, 'Produto') ?? '').trim(),
      ncm: String(col(row, 'N.C.M.') ?? '').trim(),
      cfop: String(col(row, 'Cfop') ?? '').trim(),
      origem: String(col(row, 'Origem') ?? '').trim(),
      dataEmissao: parseDataCell(col(row, 'Emissao')),
      quantidade: parseValorNumerico(col(row, 'Qtde')),
      valorUnitario: parseValorNumerico(col(row, 'Unitario')),
      frete,
      despesaIpi,
      desconto,
      valorTotal,
    });
  }

  return { itens, totalLinhas: itens.length, erro: null };
}
