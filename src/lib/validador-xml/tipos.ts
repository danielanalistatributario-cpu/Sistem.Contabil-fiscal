// Tipos do Validador de XML por Nota Técnica (Fase 1).
//
// Princípio do módulo: NADA é inventado. Cada regra guarda o texto original
// da Nota Técnica, a página e o código de rejeição; só vira "executável"
// quando o texto bate com um padrão reconhecido (ver interpretarRegra.ts).
// O resto fica catalogado e aparece no relatório como "não validável
// automaticamente".

export type Gravidade = 'CRITICO' | 'ALTO' | 'MEDIO' | 'BAIXO';

// ---------------------------------------------------------------------
// Regra executável
// ---------------------------------------------------------------------

export type Condicao = {
  // tag do XML; '#modelo' = modelo do documento (55/65)
  tag: string;
  op: '=' | '<>' | 'informado' | 'nao_informado' | 'informado_em_itens';
  valores?: string[];
};

export type Violacao =
  | { tipo: 'AUSENTE'; alvo: string }
  | { tipo: 'PRESENTE'; alvo: string }
  // a própria condição descreve o estado rejeitado (ex: "tpNF <> 0")
  | { tipo: 'COND'; cond: Condicao }
  | { tipo: 'DIFERE_PRODUTO'; alvo: string; a: string; b: string; tolerancia: number }
  | { tipo: 'DIFERE_SOMA_ITENS'; alvo: string; parcela: string; tolerancia: number };

export type RegraExec = {
  logica: 'E' | 'OU';
  condicoes: Condicao[];
  violacao: Violacao;
  // ITEM = avaliada em cada <det> (a mensagem de rejeição traz [nItem]);
  // DOC = avaliada uma vez no documento.
  escopo: 'ITEM' | 'DOC';
};

// ---------------------------------------------------------------------
// Norma extraída do PDF
// ---------------------------------------------------------------------

export type CampoLeiaute = {
  seq: string; // "110.03"
  id: string; // "I11c"
  tag: string; // "vProdLiq" (ou "-x-" para sequência sem tag)
  descricao: string;
  ele: string; // E, G, CG, A...
  pai: string | null; // ID do grupo pai ("I11a")
  tipo: string | null; // N | C | D | null (grupo)
  ocorMin: number | null;
  ocorMax: number | null; // null = ilimitado ("N")
  tamanho: string | null; // "13v2", "11v0-10", "1-60", "2"
  observacao: string | null;
  grupo: boolean;
  pagina: number;
};

export type MarcoCronograma = {
  versao: string;
  resumo: string[];
  regrasIncluidas: string[];
  regrasAlteradas: string[];
  regrasRemovidas: string[];
  homologacao: string | null; // AAAA-MM-DD
  producao: string | null;
};

export type SituacaoRegra = 'ATIVA' | 'FUTURA' | 'REMOVIDA';

export type RegraNorma = {
  chave: string; // "I11c-20"
  campoId: string; // "I11c"
  modelos: string[]; // ["55","65"]
  texto: string; // regra, como está no PDF
  observacoes: string[];
  aplicacao: string | null; // "Obrig."
  rejeicao: string | null; // "1279"
  mensagem: string | null;
  pagina: number;
  situacao: SituacaoRegra;
  homologacaoEm: string | null;
  producaoEm: string | null;
  gravidade: Gravidade;
  exec: RegraExec | null;
  descricaoExecutavel: string | null; // o que o sistema vai conferir, em português
  motivoNaoExecutavel: string | null;
  habilitada: boolean; // liga/desliga do usuário
};

export type NormaExtraida = {
  tipo: 'NT' | 'OUTRA';
  numero: string; // "NT 2026.008"
  versao: string; // "1.00"
  titulo: string;
  documentos: string[]; // ["NF-e","NFC-e"]
  modelos: string[]; // ["55","65"]
  homologacaoEm: string | null;
  producaoEm: string | null;
  marcos: MarcoCronograma[];
  campos: CampoLeiaute[];
  regras: RegraNorma[];
  avisos: string[];
};

// ---------------------------------------------------------------------
// Resultado da validação de um XML
// ---------------------------------------------------------------------

export type SituacaoOcorrencia = 'CONFORME' | 'DIVERGENTE' | 'AUSENTE' | 'INDEVIDO' | 'NAO_EXIGIVEL' | 'NAO_VALIDAVEL';

export type Ocorrencia = {
  item: string; // tag/campo analisado
  nItem: number | null;
  localizacao: string; // caminho da tag no XML
  regra: string; // o que a NT exige
  chaveRegra: string; // "I11c-20"
  referencia: string; // "NT 2026.008 v1.00 — regra I11c-20, p. 7"
  rejeicao: string | null;
  valorEncontrado: string | null;
  valorEsperado: string | null;
  situacao: SituacaoOcorrencia;
  // quando a ocorrência foi rebaixada por vigência: o que seria sem isso
  situacaoSeVigente: 'DIVERGENTE' | 'AUSENTE' | 'INDEVIDO' | null;
  gravidade: Gravidade;
  orientacao: string;
};

export type ContagensValidacao = {
  conformes: number;
  alertas: number;
  divergencias: number;
  ausentes: number;
  indevidos: number;
  naoValidaveis: number;
  regrasNaoAplicaveis: number;
};

export type ResumoRegra = { chave: string; gravidade: Gravidade; avaliadas: number; falhas: number };

export type ResultadoValidacao = {
  arquivo: string;
  erro: string | null;
  chave: string | null;
  numero: string | null;
  serie: string | null;
  modelo: string | null;
  emissao: string | null; // AAAA-MM-DD
  tpAmb: string | null;
  emitente: { doc: string | null; nome: string | null };
  destinatario: { doc: string | null; nome: string | null };
  contagens: ContagensValidacao;
  conformidade: number | null; // 0-100; null = nenhuma regra aplicável
  veredito: 'CONFORME' | 'DIVERGENTE' | 'SEM_REGRAS_APLICAVEIS' | 'ERRO';
  ocorrencias: Ocorrencia[]; // tudo, menos as conformes
  regras: ResumoRegra[];
};

export const PESO_GRAVIDADE: Record<Gravidade, number> = { CRITICO: 10, ALTO: 5, MEDIO: 2, BAIXO: 1 };
export const ROTULO_GRAVIDADE: Record<Gravidade, string> = { CRITICO: 'Crítico', ALTO: 'Alto', MEDIO: 'Médio', BAIXO: 'Baixo' };
