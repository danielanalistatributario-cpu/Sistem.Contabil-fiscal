import type { CampoLayout, Gravidade, MarcoCronograma, NormaExtraida, RegraNorma } from './tipos';
import { interpretarRegra } from './interpretarRegra';

// Lê o texto de uma Nota Técnica (página a página, como sai de
// extrairTextoPdf) e monta a base de regras. Puro — roda no navegador e
// nos scripts de teste. Calibrado com NT 2026.008 (regras e layout).
//
// O que sai daqui vem do próprio documento: layout (tabela "ID, Campo,
// Ele, Pai, Tipo, Ocor., Tam."), regras de validação (ID da regra, modelo,
// texto, rejeição, mensagem) e o "Histórico de Alterações / Cronograma"
// (datas de homologação/produção e quais regras foram incluídas,
// alteradas ou removidas). Tudo que não for reconhecido vira aviso.

type Linha = { t: string; p: number };

const ID_CAMPO = '[A-Z]{1,3}\\d{1,3}[a-z]?(?:\\.\\d+)?';

function isoDeBr(d: string, m: string, a: string): string | null {
  const dd = parseInt(d, 10), mm = parseInt(m, 10), aa = parseInt(a, 10);
  if (!(dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12 && aa >= 2000)) return null;
  return `${aa}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

function datasDoTexto(texto: string): string[] {
  const out: string[] = [];
  const re = /(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto))) {
    const iso = isoDeBr(m[1], m[2], m[3]);
    if (iso) out.push(iso);
  }
  return out;
}

function montarLinhas(paginas: string[]): Linha[] {
  const bruto: Linha[][] = paginas.map((txt, i) =>
    txt
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((t) => ({ t, p: i + 1 }))
  );
  // cabeçalho/rodapé repetido em boa parte das páginas
  const contagem = new Map<string, number>();
  for (const ls of bruto) for (const t of new Set(ls.map((l) => l.t))) contagem.set(t, (contagem.get(t) ?? 0) + 1);
  const limite = paginas.length >= 4 ? Math.max(3, paginas.length * 0.5) : Infinity;
  const out: Linha[] = [];
  for (const ls of bruto) {
    for (const l of ls) {
      if (contagem.get(l.t)! >= limite && l.t.length < 120) continue;
      if (/^P[áa]gina\s*\d+\s*\/\s*\d+$/i.test(l.t)) continue;
      if (/^NT\s*\d{4}\.\d{3}$/i.test(l.t)) continue;
      if (/^Nota Fiscal Eletr[ôo]nica/i.test(l.t) || /^NF-e\s*\/\s*NFC-e\s*[–-]/i.test(l.t)) continue;
      if (/^Campo\s+Modelo\s+Regra de Valida/i.test(l.t)) continue;
      if (/^#\s*ID\s+Campo\s+Descri/i.test(l.t)) continue;
      out.push(l);
    }
  }
  return out;
}

// ---------------------------------------------------------------------
// Cronograma
// ---------------------------------------------------------------------

function lerCronograma(linhas: Linha[]): MarcoCronograma[] {
  const ini = linhas.findIndex((l) => /^Hist[óo]rico de Altera[çc][õo]es/i.test(l.t) && !/\.{4,}/.test(l.t));
  if (ini < 0) return [];
  let fim = linhas.length;
  for (let i = ini + 1; i < linhas.length; i++) {
    if (/^\d+\.\s+[A-ZÀ-Ú]/.test(linhas[i].t) && !/\.{4,}/.test(linhas[i].t)) {
      fim = i;
      break;
    }
  }
  const bloco = linhas.slice(ini + 1, fim).map((l) => l.t);

  const linhasMarco: string[][] = [];
  for (const t of bloco) {
    if (/^(Vers[ãa]o|Homologa[çc][ãa]o|Implanta[çc][ãa]o|Produ[çc][ãa]o)\b/i.test(t) && !/^\d/.test(t)) continue; // cabeçalho da tabela
    if (/^\d+\.\d+\s*[-–]/.test(t)) linhasMarco.push([t]);
    else if (linhasMarco.length) linhasMarco[linhasMarco.length - 1].push(t);
  }

  const marcos: MarcoCronograma[] = [];
  for (const ls of linhasMarco) {
    const texto = ls.join(' ');
    const versao = /^(\d+\.\d+)/.exec(texto)![1];
    const ids = (rotulo: RegExp) => {
      const m = rotulo.exec(texto);
      if (!m) return [] as string[];
      const trecho = texto.slice(m.index + m[0].length).split(/\.\s|\.$|;\s*-|\s-\s/)[0];
      return trecho.match(new RegExp(`${ID_CAMPO}\\s*-\\s*\\d+`, 'g'))?.map((s) => s.replace(/\s+/g, '')) ?? [];
    };
    const datas = datasDoTexto(texto);
    // descrições "- ..." (sem as listas de regras)
    const resumo = ls
      .join(' ')
      .split(/\s-\s(?=[A-ZÀ-Ú])/)
      .map((s) => s.replace(/^\d+\.\d+\s*[-–]\s*/, '').replace(/\d{1,2}\s*\/\s*\d{1,2}\s*\/\s*\d{4}/g, '').trim())
      .filter((s) => s && !/^d+.d+$/.test(s) && !/^Regras? de valida/i.test(s));
    marcos.push({
      versao,
      resumo,
      regrasIncluidas: ids(/Regras? de valida[çc][ãa]o inclu[ií]das?\s*:/i),
      regrasAlteradas: ids(/Regras? de valida[çc][ãa]o alteradas?\s*:/i),
      regrasRemovidas: ids(/Regras? de valida[çc][ãa]o removidas?\s*:/i),
      homologacao: datas.length >= 2 ? datas[datas.length - 2] : null,
      producao: datas.length >= 1 ? datas[datas.length - 1] : null,
    });
  }
  return marcos;
}

// ---------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------

const INICIO_CAMPO = new RegExp(`^(\\d+[a-z]?(?:\\.\\d+)?)\\s+(${ID_CAMPO})\\s+(\\S+)\\s+(.*)$`);
const INICIO_REGRA = new RegExp(`^(${ID_CAMPO}-\\d+)\\s+((?:\\d{2}(?:\\/\\d{2})*))\\s*(.*)$`);

function lerLayout(linhas: Linha[]): CampoLayout[] {
  const campos: CampoLayout[] = [];
  let atual: { seq: string; id: string; tag: string; resto: string[]; p: number } | null = null;

  const fechar = () => {
    if (!atual) return;
    const texto = atual.resto.join(' ').replace(/\s+/g, ' ');
    // Ele  Pai  [Tipo]  Ocor.  [Tam.]  — a descrição vem antes, a observação depois
    const m = new RegExp(`\\b(E|G|CG|A|CE)\\s+(${ID_CAMPO})\\s+(?:(N|C|D)\\s+)?(\\d+)\\s*-\\s*(\\d+|N)(?:\\s+(\\d+(?:v\\d+(?:-\\d+)?)?(?:-\\d+)?))?`).exec(texto);
    if (m) {
      const grupo = m[1] === 'G' || m[1] === 'CG';
      campos.push({
        seq: atual.seq,
        id: atual.id,
        tag: atual.tag,
        descricao: texto.slice(0, m.index).trim(),
        ele: m[1],
        pai: m[2],
        tipo: m[3] ?? null,
        ocorMin: parseInt(m[4], 10),
        ocorMax: m[5] === 'N' ? null : parseInt(m[5], 10),
        tamanho: m[6] ?? null,
        observacao: texto.slice(m.index + m[0].length).trim() || null,
        grupo,
        pagina: atual.p,
      });
    }
    atual = null;
  };

  for (const l of linhas) {
    if (/^Grupo\s+[A-Z]{1,3}\./.test(l.t) || /^\d+\.\s+[A-ZÀ-Ú]/.test(l.t) || INICIO_REGRA.test(l.t)) {
      fechar();
      continue;
    }
    const m = INICIO_CAMPO.exec(l.t);
    if (m && !/^\d+\.\d+\s*-/.test(l.t)) {
      fechar();
      atual = { seq: m[1], id: m[2], tag: m[3], resto: [m[4]], p: l.p };
    } else if (atual) atual.resto.push(l.t);
  }
  fechar();
  return campos;
}

// ---------------------------------------------------------------------
// Regras de validação
// ---------------------------------------------------------------------

function gravidadeDe(aplicacao: string | null, rejeicao: string | null): Gravidade {
  if (rejeicao && /obrig/i.test(aplicacao ?? 'obrig')) return 'CRITICO';
  if (rejeicao) return 'ALTO';
  return 'MEDIO';
}

function lerRegras(linhas: Linha[], marcos: MarcoCronograma[], modelosNorma: string[]): RegraNorma[] {
  const regras: RegraNorma[] = [];
  let cur: { chave: string; modelos: string[]; corpo: string[]; p: number; aplic: string | null; rej: string | null; msg: string[]; corpoTardio: boolean } | null = null;

  const fechar = () => {
    if (!cur) return;
    const corpo = cur.corpo.filter(Boolean);
    const mensagem = cur.msg.join(' ').replace(/^Rejei[çc][ãa]o:\s*/i, '').replace(/\s+/g, ' ').trim() || null;
    const idxObs = corpo.findIndex((l) => /^(Observa[çc][ãa]o|Nota)\b/i.test(l));
    const obs = idxObs >= 0 ? corpo.slice(idxObs) : [];
    const textoObs = corpo.join(' ');

    const campoId = cur.chave.split('-')[0];
    let situacao: RegraNorma['situacao'] = 'ATIVA';
    if (/Regra removida/i.test(textoObs) || marcos.some((m) => m.regrasRemovidas.includes(cur!.chave))) situacao = 'REMOVIDA';
    else if (/Implementa[çc][ãa]o futura/i.test(textoObs)) situacao = 'FUTURA';

    // vigência: datas na própria regra > marco do cronograma que a cita > primeiro marco
    const noTexto = {
      homolog: /Implanta[çc][ãa]o em homologa[çc][ãa]o em\s*(\d{1,2}\s*\/\s*\d{1,2}\s*\/\s*\d{4})/i.exec(textoObs),
      prod: /Implanta[çc][ãa]o em produ[çc][ãa]o em\s*(\d{1,2}\s*\/\s*\d{1,2}\s*\/\s*\d{4})/i.exec(textoObs),
    };
    const marco =
      marcos.find((m) => [...m.regrasIncluidas, ...m.regrasAlteradas].includes(cur!.chave)) ?? marcos[0] ?? null;
    const homologacaoEm = noTexto.homolog ? datasDoTexto(noTexto.homolog[1])[0] ?? null : marco?.homologacao ?? null;
    const producaoEm = noTexto.prod ? datasDoTexto(noTexto.prod[1])[0] ?? null : marco?.producao ?? null;
    if (situacao === 'FUTURA' && (noTexto.homolog || noTexto.prod)) situacao = 'ATIVA';

    const interp = interpretarRegra(corpo, mensagem);
    regras.push({
      chave: cur.chave,
      campoId,
      modelos: cur.modelos.length ? cur.modelos : modelosNorma,
      texto: (idxObs >= 0 ? corpo.slice(0, idxObs) : corpo).join('\n'),
      observacoes: obs,
      aplicacao: cur.aplic,
      rejeicao: cur.rej,
      mensagem,
      pagina: cur.p,
      situacao,
      homologacaoEm,
      producaoEm,
      gravidade: gravidadeDe(cur.aplic, cur.rej),
      exec: interp.exec,
      descricaoExecutavel: interp.descricao,
      motivoNaoExecutavel: interp.motivo,
      habilitada: true,
    });
    cur = null;
  };

  for (const l of linhas) {
    const inicio = INICIO_REGRA.exec(l.t);
    if (inicio) {
      fechar();
      cur = {
        chave: inicio[1].replace(/\s+/g, ''),
        modelos: inicio[2].split('/'),
        corpo: inicio[3] ? [inicio[3]] : [],
        p: l.p,
        aplic: null,
        rej: null,
        msg: [],
        corpoTardio: false,
      };
      continue;
    }
    if (!cur) continue;
    if (/^Grupo\s+[A-Z]{1,3}\./.test(l.t) || /^\d+\.\s+[A-ZÀ-Ú]/.test(l.t)) {
      fechar();
      continue;
    }
    const obrig = /^(Obrig\.|Facult\.|Alerta|Obrigat[óo]ria)\s+(\d{3,4})\s*(.*)$/i.exec(l.t);
    if (obrig && cur.rej === null) {
      cur.aplic = obrig[1];
      cur.rej = obrig[2];
      cur.msg.push(obrig[3]);
      continue;
    }
    // Em regras que atravessam a página, a linha "Obrig. NNNN Rejeição" vem NO
    // MEIO do texto da regra (a tabela do PDF quebra depois dela): o que
    // parece lista de cálculo/exceção/observação continua sendo a regra.
    if (cur.rej !== null && !cur.corpoTardio && /^((s*[+−-]s*)|Exce[çc]|Observa[çc]|Nota)/i.test(l.t)) cur.corpoTardio = true;
    if (cur.rej !== null && !cur.corpoTardio) cur.msg.push(l.t);
    else cur.corpo.push(l.t);
  }
  fechar();
  return regras;
}

// ---------------------------------------------------------------------

function detectarDocumentos(texto: string): { documentos: string[]; modelos: string[] } {
  const docs: string[] = [];
  const modelos: string[] = [];
  if (/NF-?e/i.test(texto) && /Modelo\s*55|NF-?e\s*\(?modelo\s*55|55\s*e\s*65|NF-e\s*\/\s*NFC-e/i.test(texto)) {
    docs.push('NF-e');
    modelos.push('55');
  }
  if (/NFC-?e/i.test(texto) && /65/.test(texto)) {
    docs.push('NFC-e');
    modelos.push('65');
  }
  if (docs.length === 0 && /NF-?e/i.test(texto)) {
    docs.push('NF-e');
    modelos.push('55');
  }
  return { documentos: docs, modelos };
}

export function extrairNorma(paginas: string[]): NormaExtraida {
  const avisos: string[] = [];
  const linhas = montarLinhas(paginas);
  const inicio = paginas.slice(0, 3).join('\n');

  const num = /Nota T[ée]cnica\s*(?:n[ºo.]*\s*)?(\d{4})\s*\.\s*(\d{3})/i.exec(inicio);
  const ver = /Vers[ãa]o\s*(\d+\s*\.\s*\d+)/i.exec(inicio);
  const numero = num ? `NT ${num[1]}.${num[2]}` : '';
  const versao = ver ? ver[1].replace(/\s+/g, '') : '';
  if (!numero) avisos.push('Não foi possível identificar o número da Nota Técnica na capa — preencha manualmente.');
  if (!versao) avisos.push('Não foi possível identificar a versão da Nota Técnica na capa — preencha manualmente.');

  const capa = (paginas[0] ?? '').split('\n').map((s) => s.trim()).filter(Boolean);
  const idxNt = capa.findIndex((l) => /^Nota T[ée]cnica/i.test(l));
  const titulo = (idxNt > 0 ? capa.slice(0, idxNt) : capa.slice(0, 2)).join(' ').replace(/\s+/g, ' ').trim();

  const { documentos, modelos } = detectarDocumentos(paginas.slice(0, 6).join('\n'));
  const marcos = lerCronograma(linhas);
  if (marcos.length === 0) avisos.push('Tabela "Histórico de Alterações / Cronograma" não encontrada — sem datas de vigência.');
  const campos = lerLayout(linhas);
  if (campos.length === 0) avisos.push('Nenhuma tabela de layout (campos) encontrada neste documento.');
  const regras = lerRegras(linhas, marcos, modelos);
  if (regras.length === 0) avisos.push('Nenhuma regra de validação encontrada neste documento.');

  const principal = marcos.find((m) => m.versao === versao) ?? marcos[0] ?? null;
  return {
    tipo: 'NT',
    numero,
    versao,
    titulo,
    documentos,
    modelos,
    homologacaoEm: principal?.homologacao ?? null,
    producaoEm: principal?.producao ?? null,
    marcos,
    campos,
    regras,
    avisos,
  };
}
