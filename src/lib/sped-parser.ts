// Parser generico de SPED Fiscal (EFD ICMS/IPI).
// O layout do SPED usa linhas delimitadas por pipe, iniciando e terminando com "|".
// Ex: |0000|014|0|01012024|31012024|EMPRESA LTDA|12345678000199|...|
// O 2o campo de cada linha e o "registro" (ex: 0000, C100, C170). O bloco e a
// primeira letra/numero do registro (ex: registro C100 pertence ao Bloco C).

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
};

export function parseSpedFiscal(conteudo: string): SpedSummary {
  const linhasBrutas = conteudo.split(/\r?\n/).filter((l) => l.trim().length > 0);

  const porBloco: Record<string, number> = {};
  const porRegistro: Record<string, number> = {};
  const linhas: SpedLine[] = [];
  let competencia: string | null = null;
  let nomeEmpresa: string | null = null;

  linhasBrutas.forEach((linha, idx) => {
    const trimmed = linha.trim();
    // remove pipe inicial/final antes de dividir
    const semBordas = trimmed.replace(/^\|/, '').replace(/\|$/, '');
    const campos = semBordas.split('|');
    const registro = campos[0] || 'DESCONHECIDO';
    const bloco = registro.charAt(0) || '?';

    porBloco[bloco] = (porBloco[bloco] || 0) + 1;
    porRegistro[registro] = (porRegistro[registro] || 0) + 1;

    if (registro === '0000') {
      // |0000|COD_VER|COD_FIN|DT_INI|DT_FIN|NOME|...
      const dtIni = campos[3];
      const dtFin = campos[4];
      nomeEmpresa = campos[5] || null;
      if (dtIni && dtFin) competencia = `${dtIni} a ${dtFin}`;
    }

    linhas.push({ registro, bloco, campos: campos.slice(1), linhaOriginal: idx + 1 });
  });

  return {
    totalLinhas: linhasBrutas.length,
    porBloco,
    porRegistro,
    linhas,
    competencia,
    nomeEmpresa,
  };
}

export const BLOCO_DESCRICOES: Record<string, string> = {
  '0': 'Abertura, Identificação e Referências',
  C: 'Documentos Fiscais I (ICMS/IPI) — Mercadorias',
  D: 'Documentos Fiscais II — Serviços (Transporte/Comunicação)',
  E: 'Apuração do ICMS e do IPI',
  G: 'Controle do Crédito de ICMS do Ativo Permanente (CIAP)',
  H: 'Inventário Físico',
  K: 'Controle da Produção e do Estoque',
  '1': 'Outras Informações',
  '9': 'Controle e Encerramento do Arquivo',
};
