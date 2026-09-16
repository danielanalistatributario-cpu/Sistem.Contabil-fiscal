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
};

export type SpedSummary = {
  totalLinhas: number;
  porBloco: Record<string, number>;
  porRegistro: Record<string, number>;
  linhas: SpedLine[];
  competencia: string | null;
  nomeEmpresa: string | null;
  tipoSped: TipoSped;
};

export function parseSpedFiscal(conteudo: string): SpedSummary {
  const linhasBrutas = conteudo.split(/\r?\n/).filter((l) => l.trim().length > 0);

  const porBloco: Record<string, number> = {};
  const porRegistro: Record<string, number> = {};
  const linhas: SpedLine[] = [];
  let camposRegistro0000: string[] | null = null;

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

    linhas.push({ registro, bloco, campos: campos.slice(1), linhaOriginal: idx + 1 });

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
  if (camposRegistro0000) {
    const c = camposRegistro0000;
    const [dtIni, dtFin, nome] = tipoSped === 'contribuicoes' ? [c[5], c[6], c[7]] : [c[3], c[4], c[5]];
    nomeEmpresa = nome || null;
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
    nomeEmpresa,
    tipoSped,
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
