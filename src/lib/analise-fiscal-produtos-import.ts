// Leitor do Excel de importação em massa de "Produtos com classificação
// tributária" (Configurar TES) — formato bem mais simples que os
// relatórios de Entradas/Saídas (só 3-4 colunas), então usa uma detecção
// de cabeçalho mais leve em vez de reaproveitar analise-fiscal-reader.ts.

export type ClassificacaoProdutoImportado = 'ISENTO' | 'TRIBUTADO';

export type ProdutoImportado = {
  codigoProduto: string;
  descricao: string;
  classificacao: ClassificacaoProdutoImportado;
  observacao: string;
};

export type LinhaIgnorada = { linha: number; motivo: string };

export type ResultadoImportacaoProdutos = {
  produtos: ProdutoImportado[];
  ignoradas: LinhaIgnorada[];
  erro: string | null;
};

function normalizar(v: unknown): string {
  return String(v ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

type CampoChave = 'codigo' | 'descricao' | 'classificacao' | 'observacao';

const KEYWORDS: Record<CampoChave, string[]> = {
  codigo: ['codigo do produto', 'codigo produto', 'cod produto', 'codigo'],
  descricao: ['descricao do produto', 'descricao produto', 'descricao', 'produto'],
  classificacao: ['classificacao tributaria', 'classificacao', 'isento/tributado', 'tributacao', 'tipo tributario'],
  observacao: ['observacao', 'motivo'],
};

function encontrarCabecalho(aoa: unknown[][]): number {
  const limite = Math.min(aoa.length, 10);
  for (let i = 0; i < limite; i++) {
    const linha = (aoa[i] || []).map(normalizar);
    const temCodigo = linha.some((c) => KEYWORDS.codigo.some((k) => c.includes(k)));
    const temDescricao = linha.some((c) => KEYWORDS.descricao.some((k) => c.includes(k)));
    if (temCodigo && temDescricao) return i;
  }
  return -1;
}

// Ordem importa: "codigo"/"classificacao"/"observacao" primeiro, porque
// o keyword genérico de "descricao" ("produto") também bate em cabeçalhos
// como "codigo do produto" — resolvendo os campos mais específicos antes
// e excluindo a coluna já usada evita a descrição "roubar" a coluna do
// código quando o cabeçalho é algo como "Código do Produto" / "Descrição".
function mapearColunas(cabecalho: unknown[]): Partial<Record<CampoChave, number>> {
  const linha = cabecalho.map(normalizar);
  const mapa: Partial<Record<CampoChave, number>> = {};
  const usadas = new Set<number>();
  const ordem: CampoChave[] = ['codigo', 'classificacao', 'observacao', 'descricao'];
  for (const campo of ordem) {
    const idx = linha.findIndex((c, i) => !usadas.has(i) && KEYWORDS[campo].some((k) => c.includes(k)));
    if (idx >= 0) {
      mapa[campo] = idx;
      usadas.add(idx);
    }
  }
  return mapa;
}

// Bug real e recorrente (Excel em locale pt-BR): quando a coluna "Código
// do Produto" está formatada como número em vez de texto, digitar
// "100.049" faz o Excel tratar o "." como separador de milhar — o valor
// armazenado vira o inteiro 100049, perdendo o ponto que separa as duas
// metades do código (convenção "NNN.NNN" usada em todo o sistema, ver
// extrairCodigoProduto em analise-fiscal-tes-registry.ts). Sem o ponto,
// o cruzamento produto×TES nunca encontra o produto no cadastro (silêncio,
// não erro) — confirmado contra dado real duas vezes (Distribuidora
// Fortfruit em 09/09/2026, Fort Fruit Matriz em 11/09/2026, 2336/2391
// produtos afetados, validado contra um relatório real sem nenhum
// conflito). Normaliza na importação pra não repetir o problema: um
// código só de dígitos com exatamente 6 dígitos (3+3 da convenção) ganha
// o ponto de volta antes dos 3 últimos; qualquer outro formato (já tem
// ponto, tem letras, tamanho diferente — ex: séries antigas de 4 dígitos)
// passa direto, sem mexer.
export function normalizarCodigoProdutoImportado(v: string): string {
  const codigo = v.trim();
  if (/^\d{6}$/.test(codigo)) {
    return codigo.slice(0, 3) + '.' + codigo.slice(3);
  }
  return codigo;
}

function interpretarClassificacao(v: unknown): ClassificacaoProdutoImportado | null {
  const texto = normalizar(v);
  if (!texto) return null;
  if (texto.includes('isent')) return 'ISENTO';
  if (texto.includes('tribut')) return 'TRIBUTADO';
  return null;
}

// Lê um Excel/CSV com colunas Código, Descrição e Classificação (Isento/
// Tributado) — detecta o cabeçalho nas primeiras 10 linhas, aceita
// variações de nome de coluna, e ignora (sem travar a importação) linhas
// sem código/descrição ou com classificação que não dá pra interpretar.
export function lerProdutosClassificacao(aoa: unknown[][]): ResultadoImportacaoProdutos {
  const linhaCabecalho = encontrarCabecalho(aoa);
  if (linhaCabecalho < 0) {
    return {
      produtos: [],
      ignoradas: [],
      erro: 'Não foi possível localizar o cabeçalho da planilha. Confirme se há colunas como "Código do Produto", "Descrição" e "Classificação" (Isento/Tributado).',
    };
  }

  const colunas = mapearColunas(aoa[linhaCabecalho] as unknown[]);
  if (colunas.codigo === undefined || colunas.descricao === undefined) {
    return {
      produtos: [],
      ignoradas: [],
      erro: 'Não encontrei as colunas de Código e Descrição do produto. Confirme os cabeçalhos da planilha.',
    };
  }
  if (colunas.classificacao === undefined) {
    return {
      produtos: [],
      ignoradas: [],
      erro: 'Não encontrei a coluna de Classificação (Isento/Tributado). Adicione essa coluna na planilha.',
    };
  }

  const produtos: ProdutoImportado[] = [];
  const ignoradas: LinhaIgnorada[] = [];

  for (let i = linhaCabecalho + 1; i < aoa.length; i++) {
    const row = aoa[i] as unknown[];
    if (!row || row.every((c) => c === null || c === undefined || String(c).trim() === '')) continue;

    const numeroLinha = i + 1;
    const codigoProduto = normalizarCodigoProdutoImportado(String(row[colunas.codigo] ?? '').trim());
    const descricao = String(row[colunas.descricao] ?? '').trim();
    const classificacao = interpretarClassificacao(row[colunas.classificacao]);
    const observacao = colunas.observacao !== undefined ? String(row[colunas.observacao] ?? '').trim() : '';

    if (!codigoProduto || !descricao) {
      ignoradas.push({ linha: numeroLinha, motivo: 'Código ou descrição em branco' });
      continue;
    }
    if (!classificacao) {
      ignoradas.push({ linha: numeroLinha, motivo: `Classificação não reconhecida: "${row[colunas.classificacao]}" (use "Isento" ou "Tributado")` });
      continue;
    }

    produtos.push({ codigoProduto, descricao, classificacao, observacao });
  }

  return { produtos, ignoradas, erro: null };
}
