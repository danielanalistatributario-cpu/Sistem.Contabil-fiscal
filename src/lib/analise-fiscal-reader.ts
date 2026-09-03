// Leitura tolerante do Relatório Fiscal de Entradas (Excel/CSV) — mesmo
// padrão de detecção de cabeçalho por palavra-chave usado em
// conciliacao-reader.ts e cadastro-produtos-reader.ts.

function normalizar(v: unknown): string {
  return (v === null || v === undefined ? '' : String(v))
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // remove pontuacao de formatacao de cabecalho ("Aliq.", "N.C.M.",
    // "Base (Outros)") e colapsa espacos duplos ("Base  Cofins") -- o
    // Protheus exporta cabecalhos com essas variacoes
    .replace(/[.()]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// TES e CFOP costumam vir do Protheus como "codigo - descricao" numa
// coluna so (ex: "001-COMPRAS", "1933 -AQUISICAO DE SERVICO...") -- extrai
// so o codigo numerico do inicio; se nao achar digito, mantem o texto
// original (fica visivel como "TES nova" em vez de sumir silenciosamente).
function extrairCodigo(v: string): string {
  const m = v.match(/^\s*(\d+)/);
  return m ? m[1] : v.trim();
}

export function parseValorNumerico(v: unknown): number | null {
  if (typeof v === 'number') return v;
  if (!v) return null;
  let s = String(v).trim();
  if (!s) return null;
  s = s.replace(/\s*[DC]$/i, '');
  if (/,\d{1,2}$/.test(s)) {
    s = s.replace(/\./g, '').replace(',', '.');
  }
  const n = parseFloat(s);
  return Number.isNaN(n) ? null : n;
}

function parseTextoCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  // evita notação científica/zeros à esquerda perdidos em chaves de NF e
  // CNPJs que o Excel às vezes converte pra número
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

// A ordem importa: campos com palavras-chave mais específicas (ex:
// "descricao do produto") vêm antes de campos com palavras-chave mais
// genéricas que seriam substring delas (ex: "produto"), pra não roubar a
// coluna errada — mapearColunas marca cada coluna usada como não-reaproveitável.
export const CAMPOS_ANALISE_FISCAL: CampoDef[] = [
  { key: 'tes', keywords: ['tes'], required: true },
  { key: 'chaveNf', keywords: ['chave nf', 'chave da nf', 'chave de acesso', 'chave nfe'], required: true },
  { key: 'numeroNf', keywords: ['numero da nota fiscal', 'numero nf', 'nº nf', 'num nf', 'nota fiscal', 'n.fiscal'], required: true },
  // muitos layouts do Protheus não têm uma coluna de descrição separada —
  // exportam tudo junto numa única coluna "Produto" (ex: "000.003-SV
  // -SERVICO TOMADO - CONSULTORIA"); por isso 'produto' é testado por
  // último aqui, como fallback: se existir uma coluna específica de
  // descrição ela é priorizada, senão a coluna única cai aqui
  { key: 'produtoDescricao', keywords: ['descricao do produto', 'descricao produto', 'desc produto', 'descricao', 'produto'], required: true },
  { key: 'produtoCodigo', keywords: ['codigo do produto', 'cod produto', 'cod produto'], required: false },
  { key: 'tipo', keywords: ['tipo'], required: false },
  { key: 'ncm', keywords: ['ncm'], required: false },
  { key: 'cfop', keywords: ['cfop'], required: true },
  { key: 'uf', keywords: ['uf'], required: true },
  { key: 'fornecedor', keywords: ['fornec./cliente', 'fornec/cliente', 'fornecedor/cliente', 'fornecedor', 'cliente'], required: true },
  { key: 'cnpjCpf', keywords: ['cnpj/cpf', 'cnpj / cpf', 'cnpj', 'cpf'], required: true },
  { key: 'total', keywords: ['total'], required: true },
  { key: 'desconto', keywords: ['desconto'], required: false },
  { key: 'frete', keywords: ['frete'], required: false },
  { key: 'despesa', keywords: ['despesa'], required: false },
  { key: 'seguro', keywords: ['seguro'], required: false },
  // nem todo layout exporta um "Valor Contábil" pronto — quando ausente, a
  // regra que o confere (Total - Desconto + Despesa + Frete + Seguro)
  // simplesmente não roda para aquela linha, sem bloquear a importação
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

export type LinhaEntradaImportada = {
  linha: number;
  tes: string;
  chaveNf: string;
  numeroNf: string;
  produtoDescricao: string;
  produtoCodigo: string;
  tipo: string;
  ncm: string;
  cfop: string;
  uf: string;
  fornecedor: string;
  cnpjCpf: string;
  total: number | null;
  desconto: number | null;
  frete: number | null;
  despesa: number | null;
  seguro: number | null;
  valorContabil: number | null;
  baseIcms: number | null;
  valorIcms: number | null;
  aliquotaIcms: number | null;
  isento: number | null;
  baseOutros: number | null;
  basePis: number | null;
  valorPis: number | null;
  aliquotaPis: number | null;
  baseCofins: number | null;
  valorCofins: number | null;
  aliquotaCofins: number | null;
  origem: string;
};

export function lerRelatorioEntradas(aoa: unknown[][]): { rows: LinhaEntradaImportada[]; erro: string | null } {
  const headerRowIdx = findHeaderRow(aoa, CAMPOS_ANALISE_FISCAL);
  if (headerRowIdx < 0) {
    return {
      rows: [],
      erro:
        'Não foi possível localizar o cabeçalho do Relatório de Entradas. Confirme se o arquivo tem colunas como TES, Produto, CFOP, UF, Fornec./Cliente, CNPJ/CPF, Chave NF e Total.',
    };
  }
  const colunas = mapearColunas(aoa[headerRowIdx] as unknown[], CAMPOS_ANALISE_FISCAL);
  const faltando = CAMPOS_ANALISE_FISCAL.filter((c) => c.required && colunas[c.key] < 0).map((c) => c.key);
  if (faltando.length > 0) {
    const LABELS: Record<string, string> = {
      tes: 'TES', chaveNf: 'Chave NF', numeroNf: 'Número da Nota Fiscal', produtoDescricao: 'Produto/Descrição do Produto',
      cfop: 'CFOP', uf: 'UF', fornecedor: 'Fornec./Cliente', cnpjCpf: 'CNPJ/CPF', total: 'Total',
    };
    return {
      rows: [],
      erro: `Colunas obrigatórias não encontradas no Relatório de Entradas: ${faltando.map((k) => LABELS[k] || k).join(', ')}.`,
    };
  }

  const rows: LinhaEntradaImportada[] = [];
  for (let r = headerRowIdx + 1; r < aoa.length; r++) {
    const row = aoa[r];
    if (!row) continue;
    const tes = extrairCodigo(parseTextoCell(row[colunas['tes']]));
    const cfop = extrairCodigo(parseTextoCell(row[colunas['cfop']]));
    // linha sem TES nem CFOP normalmente é linha em branco/totalizadora
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
