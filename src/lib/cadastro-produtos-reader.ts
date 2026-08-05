// Leitura do cadastro de produtos da empresa (arquivo a ser auditado): código,
// descrição e a classificação/perfil atual usada no ERP. Mesmo padrão tolerante
// de cabeçalho por palavra-chave usado em conciliacao-reader.ts.

function normalizar(v: unknown): string {
  return (v === null || v === undefined ? '' : String(v))
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

type CampoDef = { key: string; keywords: string[]; required: boolean };

const CAMPOS_CADASTRO_PRODUTO: CampoDef[] = [
  { key: 'codigo', keywords: ['codigo do produto', 'cod. produto', 'cod produto', 'codigo', 'sku'], required: true },
  { key: 'descricao', keywords: ['descricao', 'descrição', 'nome do produto', 'produto'], required: true },
  { key: 'perfilAtual', keywords: ['perfil de produto', 'perfil do produto', 'perfil', 'classificacao tributaria', 'classificacao', 'grupo tributario', 'grupo'], required: false },
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

export type ItemCadastroImportado = { codigo: string; descricao: string | null; perfilAtual: string | null };

export function lerCadastroProdutos(aoa: unknown[][]): { rows: ItemCadastroImportado[]; erro: string | null } {
  const headerRowIdx = findHeaderRow(aoa, CAMPOS_CADASTRO_PRODUTO);
  if (headerRowIdx < 0) {
    return {
      rows: [],
      erro: 'Não foi possível localizar o cabeçalho do cadastro de produtos. Confirme as colunas: Código, Descrição e Perfil/Classificação.',
    };
  }
  const colunas = mapearColunas(aoa[headerRowIdx] as unknown[], CAMPOS_CADASTRO_PRODUTO);
  const faltando = CAMPOS_CADASTRO_PRODUTO.filter((c) => c.required && colunas[c.key] < 0).map((c) => c.key);
  if (faltando.length > 0) {
    return { rows: [], erro: `Colunas obrigatórias não encontradas no cadastro de produtos: ${faltando.join(', ')}.` };
  }

  const rows: ItemCadastroImportado[] = [];
  for (let r = headerRowIdx + 1; r < aoa.length; r++) {
    const row = aoa[r];
    if (!row) continue;
    const codigo = row[colunas['codigo']];
    if (codigo === null || codigo === undefined || String(codigo).trim() === '') continue;
    rows.push({
      codigo: String(codigo).trim(),
      descricao: String(row[colunas['descricao']] ?? '').trim() || null,
      perfilAtual: String(row[colunas['perfilAtual']] ?? '').trim() || null,
    });
  }
  return { rows, erro: null };
}
