// Parser generico de SPED Fiscal — suporta os dois leiautes de EFD que
// compartilham os registros de documento/item (C100/C170) e cadastro
// (0150/0200): EFD ICMS/IPI e EFD Contribuições (PIS/COFINS). São
// arquivos/obrigações diferentes, mas usam o mesmo formato de linha
// pipe-delimitado. Ex: |0000|014|0|01012024|31012024|EMPRESA LTDA|...|
// O 2o campo de cada linha e o "registro" (ex: 0000, C100, C170). O bloco e a
// primeira letra/numero do registro (ex: registro C100 pertence ao Bloco C).

export type TipoSped = 'icms_ipi' | 'contribuicoes' | 'desconhecido';

// O registro 0000 (identificação do arquivo/empresa) é o único, dos
// registros usados por este conversor, cujo layout difere entre os dois
// tipos — EFD Contribuições tem 2 campos a mais (TIPO_ESCRIT,
// IND_SIT_ESP/NUM_REC_ANTERIOR) antes de DT_INI, deslocando o resto.
// Confirmado campo a campo contra um arquivo real de cada tipo.
// C100/C170/0150/0200 são idênticos nos dois leiautes (registros de
// Bloco 0/C compartilhados entre todo EFD) — não precisam de tratamento
// especial.
//
// Detecção: E001 (abertura do Bloco E) só existe em EFD ICMS/IPI; M001
// (abertura do Bloco M) só existe em EFD Contribuições — cada um é
// obrigatório em arquivo válido do respectivo tipo.
export function detectarTipoSped(texto: string): TipoSped {
  if (texto.includes('|M001|')) return 'contribuicoes';
  if (texto.includes('|E001|')) return 'icms_ipi';
  return 'desconhecido';
}

export type SpedLine = {
  registro: string;
  bloco: string;
  campos: string[];
  linhaOriginal: number;
  // Entrada/Saída lida do IND_OPER do documento (ver OPERACAO_POR_CABECALHO);
  // '' quando o registro não pertence a um documento que informe isso.
  operacao: 'Entrada' | 'Saída' | '';
  // Situação do documento (COD_SIT), só preenchida no cabeçalho C100 — ver
  // COD_SIT_LABELS. '' nos demais registros (inclusive A100/D100, que têm
  // layout próprio de situação, não tratado aqui — não foi pedido).
  situacaoDocumento: string;
};

// Tabela "Código da Situação do Documento" (COD_SIT, campo 6 do C100) —
// idêntica na EFD ICMS/IPI e na EFD Contribuições (confirmado contra a
// documentação de ambos os leiautes). A partir de 01/2023 (Ajuste SINIEF
// 34/2021 e 38/2021), os códigos 04 (denegado) e 05 (inutilizado)
// deixaram de ser obrigatórios na escrituração — continuam suportados
// aqui pra arquivos de competência anterior ou empresas que ainda
// escrituram assim.
export const COD_SIT_LABELS: Record<string, string> = {
  '00': 'Regular',
  '01': 'Regular (extemporâneo)',
  '02': 'Cancelado',
  '03': 'Cancelado (extemporâneo)',
  '04': 'Denegado',
  '05': 'Inutilizado',
  '06': 'Complementar',
  '07': 'Complementar (extemporâneo)',
  '08': 'Regime Especial/Norma Específica',
};

// Situações que o usuário pediu pra identificar/criticar nas notas de
// Saída — já não representam mais uma operação válida de mercadoria.
const COD_SIT_CRITICOS = new Set(['02', '03', '04', '05']);

export type NotaSaida = {
  linhaOriginal: number;
  modelo: string;
  codSit: string;
  situacao: string;
  serie: string;
  numero: string;
  chave: string;
  dataEmissao: string;
  valor: string;
};

// Registros de cabeçalho de documento que trazem IND_OPER como primeiro
// campo — confirmado contra arquivo real de EFD Contribuições (C100:
// 0=Entrada, 1=Saída; D100: 0=Aquisição, 1=Prestação; A100: 0=Serviço
// contratado, 1=Serviço prestado). Só mapeia o que o próprio arquivo
// informa: registros sem IND_OPER (ex: C400/C490 de ECF, F100 cujo
// IND_OPER é "geradora de crédito/contribuição", não entrada/saída) ficam
// em branco, sem inferir.
const OPERACAO_POR_CABECALHO = new Set(['A100', 'C100', 'D100']);

// Registros filhos herdam a operação do último cabeçalho acima deles — o
// arquivo não repete IND_OPER neles. Lista explícita (não "qualquer
// registro do bloco") pra não herdar em outros tipos de documento do mesmo
// bloco que aparecem depois (ex: C400, C500, D200).
const FILHOS_DO_CABECALHO: Record<string, Set<string>> = {
  A100: new Set(['A110', 'A111', 'A120', 'A170']),
  C100: new Set([
    'C101', 'C105', 'C110', 'C111', 'C112', 'C113', 'C114', 'C115', 'C116', 'C119', 'C120', 'C130', 'C140', 'C141',
    'C160', 'C165', 'C170', 'C171', 'C172', 'C173', 'C174', 'C175', 'C176', 'C177', 'C178', 'C179', 'C190', 'C195', 'C197',
  ]),
  D100: new Set(['D101', 'D105', 'D110', 'D111', 'D120', 'D130', 'D140', 'D150', 'D160', 'D161', 'D162', 'D170', 'D180', 'D190', 'D195', 'D197']),
};

export type SpedSummary = {
  totalLinhas: number;
  porBloco: Record<string, number>;
  porRegistro: Record<string, number>;
  linhas: SpedLine[];
  competencia: string | null;
  nomeEmpresa: string | null;
  // CNPJ (só dígitos) do registro 0000 — usado pra resolver a
  // empresa/filial certa na sincronização automática do Protheus
  // (ver /api/sped/situacao-notas-protheus), em vez de depender do
  // seletor "Filial" do Topbar, que esta tela não tem e pode estar
  // apontando pra uma filial diferente da do arquivo importado (achado
  // real, 01/10/2026: usuário com Matriz selecionada importou o SPED
  // da Passarela — o cruzamento buscava na empresa errada).
  cnpjEmpresa: string | null;
  tipoSped: TipoSped;
  // TODAS as notas de Saída (C100, IND_OPER=1), qualquer COD_SIT — base
  // pra análise de numeração (ver sped-numeracao.ts), que precisa saber
  // quais números EXISTEM no arquivo pra achar os que faltam.
  notasSaida: NotaSaida[];
  // Subconjunto de notasSaida com COD_SIT cancelado, inutilizado ou
  // denegado — pedido explícito do usuário.
  notasSaidaCriticadas: NotaSaida[];
};

export function parseSpedFiscal(conteudo: string): SpedSummary {
  const linhasBrutas = conteudo.split(/\r?\n/).filter((l) => l.trim().length > 0);

  const porBloco: Record<string, number> = {};
  const porRegistro: Record<string, number> = {};
  const linhas: SpedLine[] = [];
  const notasSaida: NotaSaida[] = [];
  let camposRegistro0000: string[] | null = null;
  let documentoAtual: { cabecalho: string; operacao: SpedLine['operacao'] } | null = null;

  for (let idx = 0; idx < linhasBrutas.length; idx++) {
    const linha = linhasBrutas[idx];
    const trimmed = linha.trim();
    // remove pipe inicial/final antes de dividir
    const semBordas = trimmed.replace(/^\|/, '').replace(/\|$/, '');
    const campos = semBordas.split('|');
    const registro = campos[0] || 'DESCONHECIDO';
    const bloco = registro.charAt(0) || '?';

    porBloco[bloco] = (porBloco[bloco] || 0) + 1;
    porRegistro[registro] = (porRegistro[registro] || 0) + 1;

    if (registro === '0000') camposRegistro0000 = campos;

    let operacao: SpedLine['operacao'] = '';
    let situacaoDocumento = '';
    if (OPERACAO_POR_CABECALHO.has(registro)) {
      const indOper = campos[1];
      operacao = indOper === '0' ? 'Entrada' : indOper === '1' ? 'Saída' : '';
      documentoAtual = { cabecalho: registro, operacao };

      // COD_SIT só existe no layout do C100 (campo 6) — A100/D100 têm
      // layout próprio de situação, não tratado aqui.
      if (registro === 'C100') {
        const codSit = campos[5] || '';
        situacaoDocumento = COD_SIT_LABELS[codSit] || '';
        if (operacao === 'Saída') {
          notasSaida.push({
            linhaOriginal: idx + 1,
            modelo: campos[4] || '',
            codSit,
            situacao: situacaoDocumento,
            serie: campos[6] || '',
            numero: campos[7] || '',
            chave: campos[8] || '',
            dataEmissao: campos[9] || '',
            valor: campos[11] || '',
          });
        }
      }
    } else if (documentoAtual && FILHOS_DO_CABECALHO[documentoAtual.cabecalho].has(registro)) {
      operacao = documentoAtual.operacao;
    } else {
      documentoAtual = null;
    }

    linhas.push({ registro, bloco, campos: campos.slice(1), linhaOriginal: idx + 1, operacao, situacaoDocumento });

    // 9999 é sempre o registro de encerramento do arquivo digital (último
    // registro válido, em qualquer leiaute de EFD). Alguns arquivos trazem
    // um bloco de assinatura digital (binário) colado depois dele — sem
    // parar aqui, esse lixo binário vira "registros"/"blocos" fantasma no
    // resumo (achado real testando um EFD Contribuições do usuário).
    if (registro === '9999') break;
  }

  const tipoSped: TipoSped = porRegistro['M001'] ? 'contribuicoes' : porRegistro['E001'] ? 'icms_ipi' : 'desconhecido';

  let competencia: string | null = null;
  let nomeEmpresa: string | null = null;
  let cnpjEmpresa: string | null = null;
  if (camposRegistro0000) {
    const c = camposRegistro0000;
    // Mesmo deslocamento de 2 campos do comentário no topo do arquivo —
    // layout: ...|DT_INI|DT_FIN|NOME|CNPJ|CPF|UF|... — CNPJ é sempre o
    // campo logo depois do nome.
    const [dtIni, dtFin, nome, cnpj] = tipoSped === 'contribuicoes' ? [c[5], c[6], c[7], c[8]] : [c[3], c[4], c[5], c[6]];
    nomeEmpresa = nome || null;
    const cnpjDigitos = (cnpj || '').replace(/\D/g, '');
    cnpjEmpresa = cnpjDigitos.length === 14 ? cnpjDigitos : null;
    if (dtIni && dtFin) competencia = `${dtIni} a ${dtFin}`;
  }

  return {
    // linhas.length e não linhasBrutas.length: se o arquivo tiver algo colado
    // depois do 9999 (assinatura digital), esse lixo não deve contar como
    // "linha do SPED" em lugar nenhum do resumo.
    totalLinhas: linhas.length,
    porBloco,
    porRegistro,
    linhas,
    competencia,
    cnpjEmpresa,
    nomeEmpresa,
    tipoSped,
    notasSaida,
    notasSaidaCriticadas: notasSaida.filter((n) => COD_SIT_CRITICOS.has(n.codSit)),
  };
}

export const BLOCO_DESCRICOES: Record<string, string> = {
  '0': 'Abertura, Identificação e Referências',
  A: 'Serviços Tomados (EFD Contribuições)',
  C: 'Documentos Fiscais I — Mercadorias (ICMS/IPI) ou Notas de Entrada/Saída (Contribuições)',
  D: 'Documentos Fiscais II — Serviços (Transporte/Comunicação)',
  E: 'Apuração do ICMS e do IPI',
  F: 'Demais Documentos e Operações (EFD Contribuições)',
  G: 'Controle do Crédito de ICMS do Ativo Permanente (CIAP)',
  H: 'Inventário Físico',
  I: 'Operações do Simples Nacional (EFD Contribuições)',
  K: 'Controle da Produção e do Estoque',
  M: 'Apuração da Contribuição (PIS/COFINS)',
  P: 'Contribuição Previdenciária sobre a Receita',
  '1': 'Outras Informações',
  '9': 'Controle e Encerramento do Arquivo',
};
