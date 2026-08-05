import { getProtheusPool } from './db';
import type { PerfilRef } from '../validacao-cadastro-rules';

// Limite de parâmetros por lote bem abaixo do máximo do SQL Server (2100),
// para deixar folga a outros parâmetros da mesma request.
const TAMANHO_LOTE = 900;

// A F24 é replicada por empresa no Protheus (F24010, F24140, F24170, F24200,
// F24240 — confirmado contra SYS_COMPANY: cada sufixo é uma empresa jurídica
// diferente, não uma filial). O sufixo vira nome de tabela na query, que não
// pode ser parametrizado como valor — por isso essa validação é a barreira
// contra SQL injection, não um simples formato de UI.
const SUFIXO_REGEX = /^[0-9]{2,4}$/;

function tabelaF24(sufixoEmpresa: string): string {
  if (!SUFIXO_REGEX.test(sufixoEmpresa)) {
    throw new Error(`Sufixo de empresa Protheus inválido: "${sufixoEmpresa}".`);
  }
  return `F24${sufixoEmpresa}`;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

type LinhaF24 = { F24_CODIGO: string; CDPROD: string };

export type BuscaPerfisResultado = {
  perfis: PerfilRef[];
  perfisComTodos: string[];
};

// Consulta a tabela F24 da empresa informada (vínculo produto -> Perfil de
// Produto) para o conjunto de códigos importado, e agrupa no mesmo formato
// PerfilRef já usado por compararCadastro (src/lib/validacao-cadastro-rules.ts),
// para não exigir mudança nessa função. Uma linha F24_CDPROD = 'TODOS' indica
// um perfil de aplicação genérica (semântica ainda não confirmada com o
// cliente) — essas linhas são devolvidas à parte, sem entrar automaticamente
// no Set de nenhum perfil.
export async function buscarPerfisPorCodigos(
  codigosBrutos: string[],
  sufixoEmpresa: string
): Promise<BuscaPerfisResultado> {
  const tabela = tabelaF24(sufixoEmpresa);
  const codigos = Array.from(new Set(codigosBrutos.map((c) => c.trim()).filter(Boolean)));
  const pool = await getProtheusPool();

  const perfisMap = new Map<string, Set<string>>();
  const perfisComTodosSet = new Set<string>();

  for (const lote of chunk(codigos, TAMANHO_LOTE)) {
    const request = pool.request();
    const placeholders = lote.map((codigo, idx) => {
      const param = `p${idx}`;
      request.input(param, codigo);
      return `@${param}`;
    });
    const result = await request.query<LinhaF24>(`
      SELECT F24_CODIGO, RTRIM(LTRIM(F24_CDPROD)) AS CDPROD
      FROM ${tabela} WITH (NOLOCK)
      WHERE D_E_L_E_T_ = ' '
        AND RTRIM(LTRIM(F24_CDPROD)) IN (${placeholders.join(', ')})
    `);
    for (const row of result.recordset) {
      const nome = row.F24_CODIGO.trim();
      if (!perfisMap.has(nome)) perfisMap.set(nome, new Set());
      perfisMap.get(nome)!.add(row.CDPROD);
    }
  }

  const todosResult = await pool.request().query<{ F24_CODIGO: string }>(`
    SELECT DISTINCT F24_CODIGO
    FROM ${tabela} WITH (NOLOCK)
    WHERE D_E_L_E_T_ = ' ' AND RTRIM(LTRIM(F24_CDPROD)) = 'TODOS'
  `);
  for (const row of todosResult.recordset) {
    perfisComTodosSet.add(row.F24_CODIGO.trim());
  }

  const perfis: PerfilRef[] = Array.from(perfisMap.entries()).map(([nome, codigosSet]) => ({
    nome,
    codigos: codigosSet,
  }));

  return { perfis, perfisComTodos: Array.from(perfisComTodosSet) };
}

export type LinhaPerfilProduto = {
  perfilCodigo: string;
  produtoCodigo: string;
  produtoDescricao: string | null;
  produtoTipo: string | null;
  produtoGrupo: string | null;
  aplicaATodos: boolean;
};

// Lista todos os vínculos Perfil de Produto x Produto da empresa, cruzando com
// a tabela padrão de produtos (SB1, também replicada por empresa) para trazer
// a descrição. Não existe "Descrição do Perfil" em lugar nenhum do Protheus
// (nem na SX5, tabelas genéricas) — o código do perfil é a única referência.
// Um produto com mais de uma linha ativa na SB1 (mesmo código, cadastros
// divergentes) aparece mais de uma vez de propósito: é uma inconsistência de
// cadastro que vale mostrar, não esconder.
export async function listarPerfisComProdutos(sufixoEmpresa: string): Promise<LinhaPerfilProduto[]> {
  const tabela = tabelaF24(sufixoEmpresa);
  const tabelaSB1 = `SB1${sufixoEmpresa}`;
  const pool = await getProtheusPool();

  const result = await pool.request().query<{
    perfilCodigo: string;
    produtoCodigo: string;
    produtoDescricao: string | null;
    produtoTipo: string | null;
    produtoGrupo: string | null;
  }>(`
    SELECT F.F24_CODIGO AS perfilCodigo,
           RTRIM(LTRIM(F.F24_CDPROD)) AS produtoCodigo,
           B.B1_DESC AS produtoDescricao,
           B.B1_TIPO AS produtoTipo,
           B.B1_GRUPO AS produtoGrupo
    FROM ${tabela} F WITH (NOLOCK)
    LEFT JOIN ${tabelaSB1} B WITH (NOLOCK)
      ON RTRIM(LTRIM(B.B1_COD)) = RTRIM(LTRIM(F.F24_CDPROD)) AND B.D_E_L_E_T_ = ' '
    WHERE F.D_E_L_E_T_ = ' '
  `);
  // Ordenado aqui (não no SQL): um ORDER BY nessas colunas calculadas (RTRIM/LTRIM,
  // sem índice) levou a consulta de ~1.7s para ~37s no teste real contra o Protheus.

  return result.recordset
    .map((r) => ({
      perfilCodigo: r.perfilCodigo.trim(),
      produtoCodigo: r.produtoCodigo,
      produtoDescricao: r.produtoDescricao?.trim() || null,
      produtoTipo: r.produtoTipo?.trim() || null,
      produtoGrupo: r.produtoGrupo?.trim() || null,
      aplicaATodos: r.produtoCodigo === 'TODOS',
    }))
    .sort((a, b) => a.perfilCodigo.localeCompare(b.perfilCodigo) || a.produtoCodigo.localeCompare(b.produtoCodigo));
}

export async function listarPerfisAtivos(sufixoEmpresa: string): Promise<{ codigo: string; qtdItens: number }[]> {
  const tabela = tabelaF24(sufixoEmpresa);
  const pool = await getProtheusPool();
  const result = await pool.request().query<{ F24_CODIGO: string; qtd: number }>(`
    SELECT F24_CODIGO, COUNT(*) AS qtd
    FROM ${tabela} WITH (NOLOCK)
    WHERE D_E_L_E_T_ = ' '
    GROUP BY F24_CODIGO
    ORDER BY F24_CODIGO
  `);
  return result.recordset.map((r: { F24_CODIGO: string; qtd: number }) => ({ codigo: r.F24_CODIGO.trim(), qtdItens: r.qtd }));
}
