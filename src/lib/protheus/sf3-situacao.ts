import { getProtheusPool } from './db';

// Mesma regex de perfil-produto.ts — o sufixo vira nome de tabela
// (SF3<sufixo>), não pode ser parametrizado como valor.
const SUFIXO_REGEX = /^[0-9]{2,4}$/;

function tabelaSF3(sufixoEmpresa: string): string {
  if (!SUFIXO_REGEX.test(sufixoEmpresa)) {
    throw new Error(`Sufixo de empresa Protheus inválido: "${sufixoEmpresa}".`);
  }
  return `SF3${sufixoEmpresa}`;
}

export type LinhaSf3Protheus = {
  filial: string;
  nfiscal: string;
  serie: string;
  especie: string;
  cStat: string;
  dtCancel: string;
  chave: string;
  dtEmissao: string;
  // true = D_E_L_E_T_='*' (excluído no Protheus). Incluído de propósito
  // (pedido do usuário, 01/10/2026): achado real mostrou ~2-7% dos
  // registros de cancelamento/inutilização/denegação só existindo como
  // excluído, sem nenhuma linha ativa equivalente — o script de
  // sincronização usa esse campo pra só aceitar um excluído quando não
  // existe ativo pra mesma nota (nunca o contrário).
  deletado: boolean;
};

// Padrão de data do Protheus neste campo: "YYYYMMDD" (string, confirmado
// contra dado real) — comparação por string funciona por ser já
// zero-padded/ordenável.
const DATA_REGEX = /^\d{8}$/;

// Lê a tabela SF3 do sufixo informado, a partir de `dataEmissaoMinima`
// (formato YYYYMMDD) — a tabela acumula histórico desde a implantação do
// Protheus (visto dado real de 2018), e pra cruzamento de numeração só
// interessa período recente; sem o filtro, uma sincronização chegou a
// ler 1,5 milhão de linhas e 4,5 minutos só numa empresa. Mistura várias
// filiais (F3_FILIAL) que podem pertencer a empresas diferentes no nosso
// cadastro; quem resolve isso é o script de sincronização, decodificando
// o CNPJ de dentro de F3_CHVNFE (ver scripts/sync-situacao-notas-protheus.ts),
// não esta função. Só traz linhas com F3_CODRSEF preenchido — sem
// retorno da Sefaz registrado, não tem o que cruzar.
export async function listarSituacaoNotasSf3(sufixoEmpresa: string, dataEmissaoMinima: string): Promise<LinhaSf3Protheus[]> {
  const tabela = tabelaSF3(sufixoEmpresa);
  if (!DATA_REGEX.test(dataEmissaoMinima)) {
    throw new Error(`dataEmissaoMinima inválida (esperado YYYYMMDD): "${dataEmissaoMinima}".`);
  }
  const pool = await getProtheusPool();
  const request = pool.request();
  request.input('dataMinima', dataEmissaoMinima);
  const result = await request.query<Omit<LinhaSf3Protheus, 'deletado'> & { deletadoRaw: string }>(`
    SELECT
      RTRIM(F3_FILIAL) AS filial,
      RTRIM(LTRIM(F3_NFISCAL)) AS nfiscal,
      RTRIM(F3_SERIE) AS serie,
      RTRIM(F3_ESPECIE) AS especie,
      RTRIM(F3_CODRSEF) AS cStat,
      RTRIM(F3_DTCANC) AS dtCancel,
      RTRIM(F3_CHVNFE) AS chave,
      RTRIM(F3_EMISSAO) AS dtEmissao,
      D_E_L_E_T_ AS deletadoRaw
    FROM ${tabela} WITH (NOLOCK)
    WHERE RTRIM(F3_CODRSEF) <> '' AND F3_EMISSAO >= @dataMinima
  `);
  return result.recordset.map((r) => ({ ...r, deletado: r.deletadoRaw !== ' ' }));
}
