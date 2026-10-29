// Formato do resultado do Analisador de Legislação Fiscal e Tributária.
// É o mesmo JSON que a IA devolve (via structured outputs, ver
// SCHEMA_ANALISE / SCHEMA_COMPARACAO abaixo) e que fica gravado em
// LegislacaoAnalise.resultado — tela, comunicado visual, PDF, Excel e
// texto de WhatsApp saem todos daqui.
//
// Convenção: nenhum campo é opcional/nulo no schema (structured outputs
// limita a quantidade de campos com união de tipos). Texto não
// identificado vem como "" e página não identificada vem como 0.

// Fonte de cada informação — rastreabilidade até a página/trecho do PDF.
export type Fonte = {
  pagina: number; // página do PDF (1 = primeira); 0 = não identificada
  dispositivo: string; // artigo, cláusula, seção, item, regra de validação...
  trecho: string; // trecho literal curto do documento
};

// "expresso" = está escrito no documento; "interpretacao" = leitura/
// recomendação do analista (IA), sem previsão literal.
export type Natureza = 'expresso' | 'interpretacao';

export type ItemFonte = { descricao: string; natureza: Natureza; fonte: Fonte };

export const TIPOS_DOCUMENTO = [
  'Lei Complementar',
  'Lei',
  'Decreto',
  'Instrução Normativa',
  'Ajuste SINIEF',
  'Convênio ICMS',
  'Ato COTEPE',
  'Nota Técnica',
  'Portaria',
  'Resolução',
  'Solução de Consulta',
  'Manual / Leiaute',
  'Outro',
] as const;
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];

export const TIPOS_MARCO = [
  'publicacao',
  'inicio_vigencia',
  'periodo_adaptacao',
  'prazo_adequacao',
  'obrigatoriedade',
  'producao',
  'homologacao',
  'encerramento',
  'outro',
] as const;
export type TipoMarco = (typeof TIPOS_MARCO)[number];

export const ROTULO_MARCO: Record<TipoMarco, string> = {
  publicacao: 'Publicação',
  inicio_vigencia: 'Início da vigência',
  periodo_adaptacao: 'Período de adaptação',
  prazo_adequacao: 'Prazo para adequação',
  obrigatoriedade: 'Obrigatoriedade',
  producao: 'Ambiente de produção',
  homologacao: 'Ambiente de homologação',
  encerramento: 'Encerramento',
  outro: 'Outro marco',
};

export const AREAS_CHECKLIST = ['Fiscal', 'TI / ERP', 'Cadastro', 'Contabilidade', 'Faturamento', 'Compras', 'Gestão', 'Jurídico'] as const;

export const TIPOS_CODIGO = [
  'CST',
  'CSOSN',
  'CFOP',
  'NCM',
  'NBS',
  'cClassTrib',
  'cBenef',
  'TES',
  'Campo/Grupo XML',
  'Regra de validação',
  'Registro SPED',
  'Outro',
] as const;

export type Marco = {
  data: string; // AAAA-MM-DD; "" quando o documento só dá uma referência relativa
  dataTexto: string; // como aparece no documento (ex: "1º de janeiro de 2026", "60 dias após a publicação")
  tipo: TipoMarco;
  descricao: string;
  fonte: Fonte;
};

export type Alteracao = {
  titulo: string;
  descricao: string;
  tipo: 'inclusao' | 'alteracao' | 'revogacao' | 'esclarecimento';
  natureza: Natureza;
  fonte: Fonte;
};

export type Codigo = { tipo: string; codigo: string; descricao: string; fonte: Fonte };

export type Risco = { descricao: string; gravidade: 'alta' | 'media' | 'baixa'; natureza: Natureza; fonte: Fonte };

export type Providencia = { descricao: string; prioridade: 'alta' | 'media' | 'baixa' };

export type ItemChecklist = { acao: string; area: string; prazo: string; fonte: Fonte };

export type BaseLegal = {
  documento: string;
  numero: string;
  data: string;
  orgao: string;
  dispositivo: string;
  pagina: number;
  trecho: string;
};

export type Comunicado = {
  titulo: string;
  subtitulo: string;
  dataDestaqueRotulo: string; // ex: "Vigência a partir de"
  dataDestaque: string; // ex: "01/01/2026"
  oQueMudou: string[];
  quemEAfetado: string[];
  oQueFazer: string[];
  impactoErp: string[];
  atencao: string[];
  fonte: string;
};

export type ResultadoAnalise = {
  identificacao: {
    titulo: string;
    tipoDocumento: TipoDocumento;
    numero: string;
    versao: string;
    dataDocumento: string; // AAAA-MM-DD
    orgao: string;
    dataPublicacao: string; // AAAA-MM-DD
    dataVigencia: string; // AAAA-MM-DD
    ementa: string;
  };
  assuntoPrincipal: string;
  resumoTecnico: string;
  resumoExecutivo: {
    oQueAconteceu: string;
    oQueMudou: string;
    quandoEntraEmVigor: string;
    quemSeraAfetado: string;
    oQuePrecisamosFazer: string;
    qualOPrazo: string;
    impactoNoErp: string;
  };
  alteracoes: Alteracao[];
  afetados: ItemFonte[];
  obrigacoes: ItemFonte[];
  linhaDoTempo: Marco[];
  impactos: {
    fiscalTributario: ItemFonte[];
    erp: ItemFonte[];
    documentosFiscais: ItemFonte[]; // NF-e, NFC-e, NFS-e, CT-e, MDF-e
    obrigacoesAcessorias: ItemFonte[]; // SPED Fiscal, EFD-Contribuições, EFD-Reinf, DCTFWeb...
  };
  codigos: Codigo[];
  riscos: Risco[];
  providencias: Providencia[];
  checklist: ItemChecklist[];
  baseLegal: BaseLegal[];
  comunicado: Comunicado;
  limitacoes: string[]; // o que a IA não conseguiu ler/confirmar no documento
};

export type ItemComparacao = {
  descricao: string;
  antes: string; // como estava no documento A ("" se não existia)
  depois: string; // como ficou no documento B ("" se foi excluído)
  paginaA: number;
  paginaB: number;
  natureza: Natureza;
};

export type ResultadoComparacao = {
  documentoA: { titulo: string; numero: string; versao: string; data: string };
  documentoB: { titulo: string; numero: string; versao: string; data: string };
  relacao: string; // ex: "B é a versão 1.51 da mesma NT"; "normas diferentes sobre o mesmo tema"
  resumo: string;
  incluido: ItemComparacao[];
  excluido: ItemComparacao[];
  alterado: ItemComparacao[];
  novosPrazos: Marco[];
  novasObrigacoes: ItemComparacao[];
  alteracoesFiscais: ItemComparacao[];
  impactosErp: ItemComparacao[];
  checklist: ItemChecklist[];
  comunicado: Comunicado;
  limitacoes: string[];
};

export type ModoAnalise = 'ANALISE' | 'COMPARACAO';

export const STATUS_ANALISE = ['ANALISADA', 'EM_ADEQUACAO', 'CONCLUIDA', 'ARQUIVADA'] as const;
export type StatusAnalise = (typeof STATUS_ANALISE)[number];
export const ROTULO_STATUS: Record<StatusAnalise, string> = {
  ANALISADA: 'Analisada',
  EM_ADEQUACAO: 'Em adequação',
  CONCLUIDA: 'Adequação concluída',
  ARQUIVADA: 'Arquivada',
};
export const COR_STATUS: Record<StatusAnalise, string> = {
  ANALISADA: 'bg-sky-100 text-sky-700',
  EM_ADEQUACAO: 'bg-amber-100 text-amber-700',
  CONCLUIDA: 'bg-green-100 text-green-700',
  ARQUIVADA: 'bg-gray-100 text-gray-500',
};

export const ASSINATURA_PADRAO = { nome: 'Daniel Contador', cargo: 'Contador e Analista Tributário', setor: '' };

// ---------------------------------------------------------------------
// JSON Schemas (structured outputs). Todo objeto com
// additionalProperties:false e todos os campos em `required`.
// ---------------------------------------------------------------------

type S = Record<string, unknown>;
const str = (description?: string): S => (description ? { type: 'string', description } : { type: 'string' });
const int = (description: string): S => ({ type: 'integer', description });
const arr = (items: S, description?: string): S => (description ? { type: 'array', items, description } : { type: 'array', items });
const en = (values: readonly string[], description?: string): S => ({ type: 'string', enum: [...values], ...(description ? { description } : {}) });
function obj(props: Record<string, S>, description?: string): S {
  return { type: 'object', properties: props, required: Object.keys(props), additionalProperties: false, ...(description ? { description } : {}) };
}

const NATUREZA = en(['expresso', 'interpretacao'], '"expresso" se está escrito no documento; "interpretacao" se é leitura/conclusão sua.');
const FONTE = obj(
  {
    pagina: int('Página do PDF onde está a informação (1 = primeira página do arquivo). 0 se não for possível identificar.'),
    dispositivo: str('Artigo, cláusula, parágrafo, inciso, seção, item, tabela ou regra de validação. "" se não houver.'),
    trecho: str('Trecho literal curto (até ~200 caracteres) copiado do documento que fundamenta a informação. "" quando for interpretação sem trecho direto.'),
  },
  'De onde no PDF a informação foi tirada.'
);
const ITEM_FONTE = obj({ descricao: str(), natureza: NATUREZA, fonte: FONTE });
const MARCO = obj({
  data: str('Data no formato AAAA-MM-DD. "" se o documento só dá referência relativa ou não informa o dia.'),
  dataTexto: str('A data como aparece no documento (ex: "1º de abril de 2026", "a partir da publicação").'),
  tipo: en(TIPOS_MARCO),
  descricao: str(),
  fonte: FONTE,
});
const CHECKLIST = obj({
  acao: str('Ação concreta e verificável, começando com verbo no infinitivo (ex: "Revisar a parametrização da TES de venda interestadual").'),
  area: en(AREAS_CHECKLIST),
  prazo: str('Prazo da ação (DD/MM/AAAA ou descrição). "" se o documento não define.'),
  fonte: FONTE,
});
const COMUNICADO = obj(
  {
    titulo: str('Título curto e forte, até 8 palavras.'),
    subtitulo: str('Uma frase curta (até 25 palavras) explicando a principal mudança.'),
    dataDestaqueRotulo: str('Rótulo da data em destaque, ex: "Vigência a partir de", "Prazo de adequação", "Obrigatório em produção".'),
    dataDestaque: str('A data mais importante em DD/MM/AAAA (ou "A definir" se o documento não fixa).'),
    oQueMudou: arr(str(), 'De 2 a 4 frases curtas (até 18 palavras cada).'),
    quemEAfetado: arr(str(), 'De 1 a 5 itens curtos (empresas, contribuintes, setores, documentos).'),
    oQueFazer: arr(str(), 'De 3 a 6 ações curtas em forma de checklist (até 12 palavras cada).'),
    impactoErp: arr(str(), 'De 1 a 4 itens curtos sobre o que revisar/parametrizar no sistema.'),
    atencao: arr(str(), 'De 1 a 3 alertas curtos (riscos, pontos que exigem validação).'),
    fonte: str('Identificação curta da fonte, ex: "NT 2025.002 v1.51 — ENCAT/SEFAZ, 05/08/2026".'),
  },
  'Conteúdo do comunicado visual de uma página para gestores. Texto enxuto, sem jargão desnecessário.'
);
const ITEM_COMPARACAO = obj({
  descricao: str(),
  antes: str('Como estava no documento A. "" se não existia.'),
  depois: str('Como ficou no documento B. "" se foi excluído.'),
  paginaA: int('Página no documento A. 0 se não se aplica.'),
  paginaB: int('Página no documento B. 0 se não se aplica.'),
  natureza: NATUREZA,
});

export const SCHEMA_ANALISE: S = obj({
  identificacao: obj({
    titulo: str('Título/ementa curta do documento como identificado nele.'),
    tipoDocumento: en(TIPOS_DOCUMENTO),
    numero: str('Número do ato, ex: "49/25", "2025.002", "2.229". "" se não houver.'),
    versao: str('Versão, quando houver (ex: "1.51"). "" se não houver.'),
    dataDocumento: str('AAAA-MM-DD ou "".'),
    orgao: str('Órgão responsável (ex: CONFAZ, RFB, ENCAT, SEFAZ-PA, Comitê Gestor do IBS).'),
    dataPublicacao: str('AAAA-MM-DD ou "".'),
    dataVigencia: str('AAAA-MM-DD do início de vigência/efeitos, ou "".'),
    ementa: str('Ementa ou objetivo declarado no documento.'),
  }),
  assuntoPrincipal: str('Uma frase.'),
  resumoTecnico: str('Resumo técnico objetivo, 1 a 3 parágrafos, para o analista fiscal.'),
  resumoExecutivo: obj(
    {
      oQueAconteceu: str(),
      oQueMudou: str(),
      quandoEntraEmVigor: str(),
      quemSeraAfetado: str(),
      oQuePrecisamosFazer: str(),
      qualOPrazo: str(),
      impactoNoErp: str(),
    },
    'Linguagem simples para um gestor, 1 a 3 frases por resposta.'
  ),
  alteracoes: arr(
    obj({ titulo: str(), descricao: str(), tipo: en(['inclusao', 'alteracao', 'revogacao', 'esclarecimento']), natureza: NATUREZA, fonte: FONTE }),
    'Principais alterações (até 15), da mais relevante para a menos.'
  ),
  afetados: arr(ITEM_FONTE, 'Quem será afetado (até 8).'),
  obrigacoes: arr(ITEM_FONTE, 'Obrigações e procedimentos trazidos pelo documento (até 12).'),
  linhaDoTempo: arr(MARCO, 'Todas as datas relevantes do documento, em ordem cronológica.'),
  impactos: obj({
    fiscalTributario: arr(ITEM_FONTE, 'Impactos fiscais e tributários (até 8).'),
    erp: arr(ITEM_FONTE, 'Impactos no ERP/sistema: parametrização, cadastros, regras, leiaute (até 8).'),
    documentosFiscais: arr(ITEM_FONTE, 'Impactos na emissão de NF-e, NFC-e, NFS-e, CT-e, MDF-e (até 8). [] se não houver.'),
    obrigacoesAcessorias: arr(ITEM_FONTE, 'Impactos em SPED Fiscal, EFD-Contribuições, EFD-Reinf, DCTFWeb etc. (até 6). [] se não houver.'),
  }),
  codigos: arr(
    obj({ tipo: en(TIPOS_CODIGO), codigo: str(), descricao: str(), fonte: FONTE }),
    'Códigos fiscais citados no documento (até 40). Só os que aparecem no texto.'
  ),
  riscos: arr(
    obj({ descricao: str(), gravidade: en(['alta', 'media', 'baixa']), natureza: NATUREZA, fonte: FONTE }),
    'Riscos de não cumprimento (até 6).'
  ),
  providencias: arr(obj({ descricao: str(), prioridade: en(['alta', 'media', 'baixa']) }), 'Providências recomendadas para a empresa (até 8). São sempre recomendação sua.'),
  checklist: arr(CHECKLIST, 'Checklist de adequação adaptado a ESTE documento (6 a 15 itens).'),
  baseLegal: arr(
    obj({ documento: str(), numero: str(), data: str(), orgao: str(), dispositivo: str(), pagina: int('Página do PDF. 0 se não identificada.'), trecho: str() }),
    'Dispositivos que fundamentam a análise (até 15), incluindo normas citadas pelo documento quando relevantes.'
  ),
  comunicado: COMUNICADO,
  limitacoes: arr(str(), 'O que não foi possível ler ou confirmar (páginas ilegíveis, anexos ausentes, datas não informadas). [] se nada.'),
});

export const SCHEMA_COMPARACAO: S = obj({
  documentoA: obj({ titulo: str(), numero: str(), versao: str(), data: str('AAAA-MM-DD ou "".') }),
  documentoB: obj({ titulo: str(), numero: str(), versao: str(), data: str('AAAA-MM-DD ou "".') }),
  relacao: str('Relação entre os documentos (ex: "B é a versão seguinte de A", "normas diferentes sobre o mesmo tema").'),
  resumo: str('Resumo das diferenças em 1 a 2 parágrafos.'),
  incluido: arr(ITEM_COMPARACAO, 'O que existe em B e não existia em A (até 15).'),
  excluido: arr(ITEM_COMPARACAO, 'O que existia em A e saiu em B (até 10).'),
  alterado: arr(ITEM_COMPARACAO, 'O que mudou de redação/regra/valor (até 15).'),
  novosPrazos: arr(MARCO, 'Prazos novos ou alterados em B. A fonte.pagina refere-se ao documento B.'),
  novasObrigacoes: arr(ITEM_COMPARACAO, 'Obrigações novas (até 8).'),
  alteracoesFiscais: arr(ITEM_COMPARACAO, 'Alterações de efeito fiscal/tributário (até 8).'),
  impactosErp: arr(ITEM_COMPARACAO, 'Impactos no ERP/sistema (até 8).'),
  checklist: arr(CHECKLIST, 'Checklist do que fazer por causa das diferenças (4 a 12 itens). fonte.pagina refere-se ao documento B.'),
  comunicado: COMUNICADO,
  limitacoes: arr(str()),
});
