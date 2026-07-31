// Regras fiscais do ICMS Antecipado Especial, portadas da ferramenta já
// validada pelo usuário. Mantidas como constantes centralizadas para que
// qualquer ajuste de legislação (TES elegíveis, alíquotas por UF, etc.)
// seja feito em um único lugar.

export const TES_PERMITIDOS = ['102', '107', '108', '109', '129', '222', '225'];
export const TES_ALIQUOTA_IMPORTACAO = ['102', '107', '129']; // sujeitas a 15% quando origem for importada
export const ORIGEM_IMPORTADA = ['1', '2']; // 1-Estrangeira (Imp. Direta) / 2-Estrangeira (Merc. Interno)
export const ALIQUOTA_IMPORTACAO = 0.15;
export const UF_ALIQUOTA_12 = new Set(['MG', 'PR', 'RS', 'RJ', 'SC', 'SP']);
export const UF_ALIQUOTA_7 = new Set([
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS',
  'PB', 'PE', 'PI', 'RN', 'RO', 'RR', 'SE', 'TO',
]);

export function normalize(s: unknown): string {
  if (s === null || s === undefined) return '';
  return String(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

// Extrai o código numérico de campos como TES ou Origem do Produto, mesmo
// quando vêm junto de texto (ex: "1 - Estrangeira Importação Direta").
export function normalizeCode(v: unknown): string {
  if (v === null || v === undefined) return '';
  const m = String(v).match(/\d+/);
  if (!m) return String(v).trim();
  const digits = m[0].replace(/^0+(?=\d)/, '');
  return digits === '' ? '0' : digits;
}

// Extrai a sigla de UF de 2 letras, mesmo quando vem junto do nome do estado.
export function normalizeUF(v: unknown): string {
  if (!v) return '';
  const s = String(v).trim().toUpperCase();
  const m = s.match(/\b[A-Z]{2}\b/);
  return m ? m[0] : s.slice(0, 2);
}

// Chave de comparação de número de nota fiscal (remove zeros à esquerda e não-dígitos).
export function nfKey(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  let digits = String(v).replace(/\D/g, '');
  if (!digits) return null;
  digits = digits.replace(/^0+/, '');
  return digits === '' ? '0' : digits;
}

export type AliquotaResultado = { aliquota: number | null; motivo: string };

// Determina a alíquota aplicável ao item, conforme TES / Origem do produto / UF de origem.
export function determinarAliquota(tes: string, origemProduto: string, uf: string): AliquotaResultado {
  if (TES_ALIQUOTA_IMPORTACAO.includes(tes) && ORIGEM_IMPORTADA.includes(origemProduto)) {
    return { aliquota: ALIQUOTA_IMPORTACAO, motivo: 'importacao' };
  }
  if (UF_ALIQUOTA_12.has(uf)) return { aliquota: 0.12, motivo: 'uf_12' };
  if (UF_ALIQUOTA_7.has(uf)) return { aliquota: 0.07, motivo: 'uf_7' };
  return { aliquota: null, motivo: 'uf_nao_mapeada' };
}

// ---- Tipos de entrada (linhas já mapeadas/extraídas no cliente) ----

export type EntradaItemInput = {
  doc_fiscal: unknown;
  produto?: unknown;
  ncm?: unknown;
  fornecedor?: unknown;
  cnpj?: unknown;
  uf_origem?: unknown;
  filial?: unknown;
  tes?: unknown;
  origem_produto?: unknown;
  chave_nfe?: unknown;
  data?: unknown;
  valor_total?: unknown;
  despesas?: unknown;
};

export type PagasRowInput = {
  doc_fiscal: unknown;
  valor?: unknown;
  data_pagamento?: unknown;
  tributo?: unknown;
  competencia?: unknown;
};

export type NotaApurada = {
  docFiscal: string;
  fornecedor: string;
  cnpj: string;
  uf: string;
  filial: string;
  chaveNfe: string;
  produto: string;
  ncm: string;
  tes: string;
  dataEmissao: Date | null;
  base: number;
  valor: number;
  status: 'PAGO' | 'PENDENTE';
  valorPago: number | null;
  dataPagamento: Date | null;
  divergencia: number | null;
  itensSemAliquota: number;
};

export type ApuracaoTotais = {
  totalNF: number;
  qtdPagas: number;
  qtdPendentes: number;
  valorPago: number;
  valorPendente: number;
  percent: number;
  itensConsiderados: number;
  itensDesconsiderados: number;
  qtdSemAliquota: number;
  divergencias: number;
};

export type ApuracaoResultado = {
  totais: ApuracaoTotais;
  notas: NotaApurada[];
};

function parseDataFlexivel(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

const TOLERANCIA = 0.05;

// Cruza os itens de entrada com os pagamentos SEFA e calcula o ICMS Antecipado
// Especial de cada nota, replicando a lógica já validada na ferramenta original.
export function processarApuracao(
  entradaItems: EntradaItemInput[],
  pagasRows: PagasRowInput[],
  semPagamento: boolean
): ApuracaoResultado {
  type ItemCalculado = {
    _key: string;
    produto: string;
    ncm: string;
    fornecedor: string;
    cnpj: string;
    uf: string;
    filial: string;
    tes: string;
    chave_nfe: string;
    data: Date | null;
    doc_fiscal: string;
    base: number;
    icms: number | null;
  };

  const itensCalculados: ItemCalculado[] = [];
  let tesExcluded = 0;

  for (const obj of entradaItems) {
    const key = nfKey(obj.doc_fiscal);
    if (!key) continue;
    const valorTotal = parseFloat(String(obj.valor_total));
    if (Number.isNaN(valorTotal)) continue;

    const tes = normalizeCode(obj.tes);
    if (!TES_PERMITIDOS.includes(tes)) {
      tesExcluded++;
      continue;
    }

    const despesas = parseFloat(String(obj.despesas ?? '0')) || 0;
    const uf = normalizeUF(obj.uf_origem);
    const origem = normalizeCode(obj.origem_produto);
    const { aliquota } = determinarAliquota(tes, origem, uf);
    const base = valorTotal + despesas;
    const icms = aliquota !== null ? base * aliquota : null;

    itensCalculados.push({
      _key: key,
      produto: obj.produto ? String(obj.produto) : '',
      ncm: obj.ncm ? String(obj.ncm) : '',
      fornecedor: obj.fornecedor ? String(obj.fornecedor) : '',
      cnpj: obj.cnpj ? String(obj.cnpj) : '',
      uf,
      filial: obj.filial ? String(obj.filial) : '',
      tes,
      chave_nfe: obj.chave_nfe ? String(obj.chave_nfe) : '',
      data: parseDataFlexivel(obj.data),
      doc_fiscal: obj.doc_fiscal ? String(obj.doc_fiscal) : '',
      base,
      icms,
    });
  }

  // agrega pagamentos por NF
  const pagasAgg: Record<string, { valor: number; dataPagamento: Date | null }> = {};
  if (!semPagamento) {
    for (const r of pagasRows) {
      const key = nfKey(r.doc_fiscal);
      if (!key) continue;
      const val = parseFloat(String(r.valor));
      if (Number.isNaN(val)) continue;
      if (r.tributo && !normalize(r.tributo).includes('antecipado')) continue;
      if (!pagasAgg[key]) pagasAgg[key] = { valor: 0, dataPagamento: parseDataFlexivel(r.data_pagamento) };
      pagasAgg[key].valor += val;
      const dt = parseDataFlexivel(r.data_pagamento);
      if (dt) pagasAgg[key].dataPagamento = dt;
    }
  }

  // agrega itens de entrada por NF
  type Agg = {
    doc_fiscal: string;
    fornecedor: string;
    cnpj: string;
    filial: string;
    chave_nfe: string;
    data: Date | null;
    produtos: Set<string>;
    ncms: Set<string>;
    ufs: Set<string>;
    tesSet: Set<string>;
    base: number;
    icms: number;
    itens: number;
    itensSemAliquota: number;
  };
  const entradaAgg: Record<string, Agg> = {};

  for (const it of itensCalculados) {
    if (!entradaAgg[it._key]) {
      entradaAgg[it._key] = {
        doc_fiscal: it.doc_fiscal,
        fornecedor: it.fornecedor,
        cnpj: it.cnpj,
        filial: it.filial,
        chave_nfe: it.chave_nfe,
        data: it.data,
        produtos: new Set(),
        ncms: new Set(),
        ufs: new Set(),
        tesSet: new Set(),
        base: 0,
        icms: 0,
        itens: 0,
        itensSemAliquota: 0,
      };
    }
    const e = entradaAgg[it._key];
    e.base += it.base;
    e.itens += 1;
    if (it.produto) e.produtos.add(it.produto);
    if (it.ncm) e.ncms.add(it.ncm);
    if (it.uf) e.ufs.add(it.uf);
    if (it.tes) e.tesSet.add(it.tes);
    if (it.icms === null) e.itensSemAliquota += 1;
    else e.icms += it.icms;
  }

  const notas: NotaApurada[] = [];
  let divergencias = 0;
  let qtdSemAliquota = 0;

  for (const key of Object.keys(entradaAgg)) {
    const e = entradaAgg[key];
    const pago = pagasAgg[key];
    const isPago = !semPagamento && !!pago;

    const divergencia = isPago && Math.abs(pago.valor - e.icms) > TOLERANCIA ? pago.valor - e.icms : null;
    if (divergencia) divergencias++;
    if (e.itensSemAliquota > 0) qtdSemAliquota++;

    notas.push({
      docFiscal: e.doc_fiscal,
      fornecedor: e.fornecedor,
      cnpj: e.cnpj,
      uf: [...e.ufs].join(', '),
      filial: e.filial,
      chaveNfe: e.chave_nfe,
      produto: [...e.produtos].join('; ') || (e.itens > 1 ? `múltiplos itens (${e.itens})` : ''),
      ncm: [...e.ncms].join(', '),
      tes: [...e.tesSet].join(', '),
      dataEmissao: e.data,
      base: e.base,
      valor: e.icms,
      status: isPago ? 'PAGO' : 'PENDENTE',
      valorPago: isPago ? pago.valor : null,
      dataPagamento: isPago ? pago.dataPagamento : null,
      divergencia,
      itensSemAliquota: e.itensSemAliquota,
    });
  }

  notas.sort((a, b) => b.valor - a.valor);

  const pagas = notas.filter((n) => n.status === 'PAGO');
  const pendentes = notas.filter((n) => n.status === 'PENDENTE');
  const valorPago = pagas.reduce((s, n) => s + (n.valorPago ?? n.valor), 0);
  const valorPendente = pendentes.reduce((s, n) => s + n.valor, 0);

  return {
    notas,
    totais: {
      totalNF: notas.length,
      qtdPagas: pagas.length,
      qtdPendentes: pendentes.length,
      valorPago,
      valorPendente,
      percent: notas.length ? (pagas.length / notas.length) * 100 : 0,
      itensConsiderados: itensCalculados.length,
      itensDesconsiderados: tesExcluded,
      qtdSemAliquota,
      divergencias,
    },
  };
}
