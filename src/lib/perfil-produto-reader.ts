// Leitura da planilha de produtos de um Perfil de Produto (lista de códigos que
// pertencem a esse perfil). Mesmo padrão tolerante de cabeçalho por palavra-chave
// usado em conciliacao-reader.ts, icms-mapping.ts etc.

function normalizar(v: unknown): string {
  return (v === null || v === undefined ? '' : String(v))
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

type CampoDef = { key: string; keywords: string[]; required: boolean };

const CAMPOS_PERFIL_ITEM: CampoDef[] = [
  { key: 'codigo', keywords: ['codigo do produto', 'cod. produto', 'cod produto', 'codigo', 'sku'], required: true },
  { key: 'descricao', keywords: ['descricao', 'descrição', 'produto', 'nome do produto'], required: false },
];

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
  // Planilhas de perfil costumam ter só a coluna de código (às vezes sem
  // descrição), então 1 acerto já é suficiente para identificar o cabeçalho.
  return bestHits >= 1 ? bestRow : -1;
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

export type PerfilProdutoItemImportado = { codigo: string; descricao: string | null };

export function lerPerfilProdutoItens(aoa: unknown[][]): { rows: PerfilProdutoItemImportado[]; erro: string | null } {
  const headerRowIdx = findHeaderRow(aoa, CAMPOS_PERFIL_ITEM);
  if (headerRowIdx < 0) {
    return { rows: [], erro: 'Não foi possível localizar a coluna de Código do produto na planilha.' };
  }
  const colunas = mapearColunas(aoa[headerRowIdx] as unknown[], CAMPOS_PERFIL_ITEM);
  if (colunas['codigo'] < 0) {
    return { rows: [], erro: 'Coluna obrigatória não encontrada: Código do produto.' };
  }

  const rows: PerfilProdutoItemImportado[] = [];
  for (let r = headerRowIdx + 1; r < aoa.length; r++) {
    const row = aoa[r];
    if (!row) continue;
    const codigo = row[colunas['codigo']];
    if (codigo === null || codigo === undefined || String(codigo).trim() === '') continue;
    rows.push({
      codigo: String(codigo).trim(),
      descricao: colunas['descricao'] >= 0 ? String(row[colunas['descricao']] ?? '').trim() || null : null,
    });
  }
  return { rows, erro: null };
}
