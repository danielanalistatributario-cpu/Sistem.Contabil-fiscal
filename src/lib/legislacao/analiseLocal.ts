import type { ResultadoAnalise, TipoDocumento, Marco, TipoMarco, ItemFonte, Alteracao, Codigo, ItemChecklist, BaseLegal, Fonte, Risco, Providencia } from './tipos';

// Resumo SEM IA do Analisador de Legislação: regras e expressões
// regulares sobre o texto do PDF (extraído página a página no navegador).
// Não "entende" o texto — localiza no próprio documento as frases que
// respondem a cada pergunta (o que mudou, prazos, obrigações, quem é
// afetado, códigos) e monta o mesmo ResultadoAnalise da análise com IA,
// então tela, comunicado visual, PDF e Excel funcionam igual.
//
// Calibrado (29/10/2026) com PDFs reais: NT 2026.010 (DANFE RTC),
// NT 2026.001 (PAA), NT 2026.004 (CNPJ alfanumérico), NT 2025.002 v1.51
// (RTC, 95 páginas) e Ajuste SINIEF 49/25. Duas famílias de documento:
//  - Notas Técnicas: o "o que mudou" e as datas estão na tabela
//    "Histórico de Alterações / Cronograma" (versão, descrição, data de
//    homologação/teste, data de produção) — usa a linha da versão atual;
//  - atos normativos (Ajuste, Convênio, Lei, IN, Decreto...): ementa
//    depois do título, regras por cláusula/artigo, vigência na cláusula
//    final ("entra em vigor...").
// Frases tiradas do documento vão como natureza "expresso" (com página e
// dispositivo); o que é derivado (checklist, providências, riscos
// genéricos, "quem é afetado") vai como "interpretacao".

export const MODELO_LOCAL = 'regras-locais (sem IA)';

type Frase = { texto: string; pagina: number; dispositivo: string; titulo: string };

const MESES: Record<string, number> = {
  janeiro: 1, fevereiro: 2, marco: 3, março: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};
const NOME_MES = '(janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)';

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: number, m: number, a: number) => (d >= 1 && d <= 31 && m >= 1 && m <= 12 ? `${a < 100 ? 2000 + a : a}-${pad(m)}-${pad(d)}` : '');
const hojeIso = () => new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------------
// Texto: limpeza, parágrafos, frases e dispositivo corrente
// ---------------------------------------------------------------------

function limparPaginas(paginas: string[]): string[][] {
  const linhasPorPagina = paginas.map((p) => p.split('\n').map((l) => l.trim()).filter(Boolean));
  // Cabeçalho/rodapé repetido (aparece em boa parte das páginas).
  const contagem = new Map<string, number>();
  for (const ls of linhasPorPagina) for (const l of new Set(ls)) contagem.set(l, (contagem.get(l) ?? 0) + 1);
  const limite = linhasPorPagina.length >= 3 ? Math.max(2, linhasPorPagina.length * 0.4) : Infinity;
  return linhasPorPagina.map((ls) =>
    ls.filter((l) => !(contagem.get(l)! >= limite && l.length < 120) && !/^P[áa]gina\s*\d+\s*(\/|de)\s*\d+$/i.test(l) && !/\.{6,}/.test(l))
  );
}

const INICIO_BLOCO = /^(Cl[áa]usula\s|Art\.?\s*\d|§\s*\d|Par[áa]grafo\s+[úu]nico|[IVXLC]+\s*[-–—]\s|[a-z]\)\s|\d+(\.\d+)*\.?\s+[A-ZÀ-Ú]|Grupo\s|•|-\s|\*)/;

function paragrafos(linhas: string[]): string[] {
  const out: string[] = [];
  let atual = '';
  for (const l of linhas) {
    // Título de seção fica sozinho (senão gruda no texto: "1 Resumo Esta Nota...").
    if (atual && (INICIO_BLOCO.test(l) || /[.:;]$/.test(atual) || ehTitulo(atual))) {
      out.push(atual);
      atual = l;
    } else if (!atual) {
      atual = l;
    } else if (/[a-zà-ú]-$/.test(atual) && /^[a-zà-ú]/.test(l)) {
      atual = atual.slice(0, -1) + l; // hifenização no fim da linha
    } else {
      atual += ' ' + l;
    }
  }
  if (atual) out.push(atual);
  return out;
}

function dividirFrases(p: string): string[] {
  return p
    .split(/(?<=[a-zà-ú0-9)”"]{2}[.;])\s+(?=[A-ZÀ-Ú§“"])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// Título de seção numerada de NT ("4.1. Novo bloco de totais ...").
// "1.00 ..." é linha da tabela de versões, não título.
const RE_TITULO = /^(\d{1,2}(?:\.\d{1,2}){0,3})\.?\s+([A-ZÀ-Ú][^.:;]{2,90})$/;
const RE_TITULO_SOLTO = /^(Introdu[çc][ãa]o|Resumo|Objetivo|Vis[ãa]o Geral|Considera[çc][õo]es( Gerais| Iniciais)?|Conclus[ãa]o|Contexto)$/i;
// Linha de tabela de leiaute ("30 C01 emit Identificação do emitente",
// "F02 CNPJ CNPJ CE F01 C 1-1") também começa com número + maiúscula.
const ehTitulo = (l: string) =>
  RE_TITULO_SOLTO.test(l) ||
  (RE_TITULO.test(l) && !/^\d\.\d{2}\s/.test(l) && !/\d{2}\/\d{2,4}/.test(l) && !/^\d+(\.\d+)*\s+[A-Z]{1,3}\d{1,3}[a-z]?\s/.test(l) && !/\b\d-\d\b|\b[A-Z]{1,2}\d{2}\b/.test(l));

function montarFrases(linhasPorPagina: string[][]): Frase[] {
  const frases: Frase[] = [];
  let clausula = '';
  let sub = '';
  let item = '';
  let titulo = '';
  linhasPorPagina.forEach((linhas, i) => {
    for (const par of paragrafos(linhas)) {
      let m: RegExpMatchArray | null;
      if (ehTitulo(par)) {
        m = par.match(RE_TITULO);
        item = m ? `Item ${m[1]}` : par;
        titulo = m ? m[2].trim() : par;
        clausula = '';
        sub = '';
        continue;
      }
      if ((m = par.match(/^(Cl[áa]usula\s+[a-zà-úA-ZÀ-Ú]+(?:-[A-Z])?)/))) {
        clausula = capitalizar(m[1]);
        sub = '';
      } else if ((m = par.match(/^(Art\.?\s*\d+[º°]?(?:-[A-Z])?)/))) {
        clausula = m[1].replace(/^Art\.?\s*/, 'Art. ');
        sub = '';
      } else if ((m = par.match(/^(§\s*\d+[º°]?|Par[áa]grafo\s+[úu]nico)/))) {
        sub = m[1];
      } else if ((m = par.match(/^(Grupo\s+[A-Z0-9]{1,4})\./))) {
        item = m[1];
      }
      const dispositivo = clausula ? [clausula, sub].filter(Boolean).join(', ') : item;
      for (const texto of dividirFrases(par)) frases.push({ texto, pagina: i + 1, dispositivo, titulo });
    }
  });
  return frases;
}

function capitalizar(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

const capitalizarInicio = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function encurtar(s: string, maxPalavras: number): string {
  const limpo = s
    .replace(/^([IVXLC]+|[a-z]|\d+(\.\d+)*)\s*[-–—).]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
  const palavras = limpo.split(' ');
  const r = palavras.length <= maxPalavras ? limpo : palavras.slice(0, maxPalavras).join(' ').replace(/[,;:]$/, '') + '…';
  return r.charAt(0).toUpperCase() + r.slice(1);
}

const fonteDe = (f: Frase, trecho = true): Fonte => ({ pagina: f.pagina, dispositivo: f.dispositivo, trecho: trecho ? encurtar(f.texto, 40) : '' });

// ---------------------------------------------------------------------
// Datas
// ---------------------------------------------------------------------

type DataAchada = { iso: string; texto: string; indice: number };

function acharDatas(s: string): DataAchada[] {
  const out: DataAchada[] = [];
  const re = new RegExp(
    String.raw`(\d{1,2})[º°]?\s+de\s+${NOME_MES}\s+de\s+(\d{4})|\b(\d{2})[/.](\d{2})[/.](\d{2,4})\b|\b${NOME_MES}\s*(?:de|/)\s*(\d{4})|\b(\d{2})/(\d{4})\b`,
    'gi'
  );
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m[1]) out.push({ iso: iso(+m[1], MESES[m[2].toLowerCase()], +m[3]), texto: m[0], indice: m.index });
    else if (m[4]) out.push({ iso: iso(+m[4], +m[5], +m[6]), texto: m[0], indice: m.index });
    else if (m[7]) out.push({ iso: '', texto: m[0], indice: m.index });
    else if (m[9] && +m[9] >= 1 && +m[9] <= 12) out.push({ iso: '', texto: m[0], indice: m.index });
  }
  return out;
}

// Datas que são só citação de outra norma ("Lei nº 5.172, de 25 de outubro de 1966").
function ehCitacaoDeNorma(s: string, d: DataAchada) {
  return /(Lei|Decreto|Ajuste|Conv[êe]nio|Instru[çc][ãa]o|Portaria|Resolu[çc][ãa]o|Emenda|Ato)[^.;]{0,40}n?[ºo°]?\s*[\d./]+\s*,?\s*de\s*$/i.test(s.slice(Math.max(0, d.indice - 70), d.indice));
}

function tipoMarco(s: string): TipoMarco | null {
  const t = s.toLowerCase();
  if (/produ[çc][ãa]o/.test(t)) return 'producao';
  if (/homologa[çc][ãa]o|ambiente de teste|\bteste\b/.test(t)) return 'homologacao';
  if (/entra(r[áa])? em vigor|vig[êe]ncia|produz(indo|ir[áa])? efeitos|efeitos a partir/.test(t)) return 'inicio_vigencia';
  if (/obrigat[óo]ri/.test(t)) return 'obrigatoriedade';
  if (/prazo|at[ée] o dia|at[ée] \d|adequa/.test(t)) return 'prazo_adequacao';
  if (/revoga|encerra|deixa(r[áa])? de|extin/.test(t)) return 'encerramento';
  if (/publica/.test(t)) return 'publicacao';
  return null;
}

// ---------------------------------------------------------------------
// Identificação
// ---------------------------------------------------------------------

type Ident = ResultadoAnalise['identificacao'] & { assuntoCurto: string };

function identificar(nome: string, linhas: string[][], frases: Frase[]): Ident {
  const inicio = linhas.slice(0, 3).flat().join('\n');
  const tudo = frases.map((f) => f.texto).join('\n');
  const r: Ident = { titulo: '', tipoDocumento: 'Outro', numero: '', versao: '', dataDocumento: '', orgao: '', dataPublicacao: '', dataVigencia: '', ementa: '', assuntoCurto: '' };
  let m: RegExpMatchArray | null;

  const dataExtenso = (s: string) => {
    const d = s.match(new RegExp(String.raw`DE\s+(\d{1,2})[º°]?\s+DE\s+${NOME_MES}\s+DE\s+(\d{4})`, 'i'));
    return d ? iso(+d[1], MESES[d[2].toLowerCase()], +d[3]) : '';
  };

  const atos: [RegExp, TipoDocumento, string][] = [
    [/AJUSTE\s+SINIEF\s+N?[ºo°.]*\s*(\d+)\s*(?:\/\s*(\d{2,4}))?[^\n]*/i, 'Ajuste SINIEF', 'CONFAZ / Receita Federal do Brasil'],
    [/CONV[ÊE]NIO\s+ICMS\s+N?[ºo°.]*\s*(\d+)\s*(?:\/\s*(\d{2,4}))?[^\n]*/i, 'Convênio ICMS', 'CONFAZ'],
    [/ATO\s+COTEPE\s*\/\s*ICMS\s+N?[ºo°.]*\s*(\d+)\s*(?:\/\s*(\d{2,4}))?[^\n]*/i, 'Ato COTEPE', 'CONFAZ / COTEPE'],
    [/INSTRU[ÇC][ÃA]O\s+NORMATIVA\s+(?:RFB\s+)?N?[ºo°.]*\s*([\d.]+)[^\n]*/i, 'Instrução Normativa', 'Receita Federal do Brasil'],
    [/LEI\s+COMPLEMENTAR\s+N?[ºo°.]*\s*([\d.]+)[^\n]*/i, 'Lei Complementar', 'Presidência da República'],
    [/DECRETO\s+N?[ºo°.]*\s*([\d.]+)[^\n]*/i, 'Decreto', ''],
    [/\bLEI\s+N?[ºo°.]*\s*([\d.]+)[^\n]*/i, 'Lei', 'Presidência da República'],
    [/PORTARIA\s+[^\n]*?N?[ºo°.]*\s*([\d.]+)[^\n]*/i, 'Portaria', ''],
    [/RESOLU[ÇC][ÃA]O\s+[^\n]*?N?[ºo°.]*\s*([\d.]+)[^\n]*/i, 'Resolução', ''],
    [/SOLU[ÇC][ÃA]O\s+DE\s+CONSULTA\s+[^\n]*?N?[ºo°.]*\s*([\d.]+)[^\n]*/i, 'Solução de Consulta', 'Receita Federal do Brasil'],
  ];

  const nt = inicio.match(/(?:Nota\s+T[ée]cnica|\bNT)\s*(?:Conjunta\s*)?(?:DFe\s*)?(?:n[ºo°.]*\s*)?(\d{4}\.\d{3})/i);
  if (nt) {
    r.tipoDocumento = 'Nota Técnica';
    r.numero = nt[1];
    if ((m = inicio.match(/Vers[ãa]o\s*:?\s*(\d+\.\d{2})/i) || nome.match(/v\s*(\d+[._]\d{2})/i))) r.versao = m[1].replace('_', '.');
    const projeto = inicio.match(/Conhecimento de Transporte|CT-e/i) ? 'CT-e' : inicio.match(/Manifesto|MDF-e/i) ? 'MDF-e' : inicio.match(/NFS-e/i) ? 'NFS-e' : 'NF-e';
    r.orgao = `Projeto ${projeto} (ENCAT / Receita Federal)`;
    // Assunto: "NT 2026.010 – DANFE Reforma Tributária" ou a capa.
    if ((m = inicio.match(/NT\s*\d{4}\.\d{3}(?:-[A-Z]+)?\s*[–-]\s*([^\n]{3,90})/i))) r.assuntoCurto = m[1].trim();
    else {
      const capa = (linhas[0] ?? []).filter((l) => !/Nota Fiscal Eletr|^Projeto$|Nota T[ée]cnica|^Vers[ãa]o|^\d{4}$|^NT\s|^(janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/i.test(l));
      r.assuntoCurto = capa.join(' ').replace(/\s+-\s*$/, '').slice(0, 110);
    }
    if (!r.assuntoCurto) r.assuntoCurto = (linhas[1] ?? []).find((l) => /Reforma|CNPJ|DANFE|Leiaute|Evento/i.test(l)) ?? '';
    r.titulo = `NT ${r.numero}${r.versao ? ` v${r.versao}` : ''}${r.assuntoCurto ? ` — ${r.assuntoCurto}` : ''}`;
  } else {
    for (const [re, tipo, orgao] of atos) {
      if ((m = inicio.match(re))) {
        r.tipoDocumento = tipo;
        r.orgao = orgao;
        r.titulo = m[0].replace(/\s+/g, ' ').trim();
        r.dataDocumento = dataExtenso(m[0]);
        // "AJUSTE SINIEF Nº 49, DE 5 DE DEZEMBRO DE 2025" → 49/25.
        r.numero = m[2] ? `${m[1]}/${m[2].slice(-2)}` : /SINIEF|CONV|COTEPE/i.test(tipo) && r.dataDocumento ? `${m[1]}/${r.dataDocumento.slice(2, 4)}` : m[1];
        break;
      }
    }
    if (!r.titulo) r.titulo = nome.replace(/\.pdf$/i, '').replace(/[_]+/g, ' ');
  }

  if ((m = inicio.match(/Publicad[oa]\s+no\s+D\.?O\.?U\.?\s+de\s+(\d{2})[./](\d{2})[./](\d{2,4})/i))) r.dataPublicacao = iso(+m[1], +m[2], +m[3]);

  // Ementa: "Dispõe sobre...", "Altera...", logo depois do título (só em
  // atos normativos; em NT a 1ª página com "Altera..." é tabela de versão).
  // (?![a-zà-ú]) em vez de \b: o \b do JS trata "ç" como fim de palavra
  // e "Alteração" passaria por "Altera".
  const ementa = r.tipoDocumento === 'Nota Técnica' ? undefined : frases.filter((f) => f.pagina <= 2).slice(0, 40).find((f) => /^(Disp[õo]e|Altera|Institui|Estabelece|Autoriza|Prorroga|Concede|Revoga|Acrescenta|Regulamenta|Define|Introduz|Dispensa|Aprova)(?![a-zà-ú])/.test(f.texto));
  if (ementa) r.ementa = ementa.texto.replace(/\s+/g, ' ');
  else {
    const obj = frases.find((f) => /(Esta|A presente)\s+(Nota T[ée]cnica|NT)|tem (como|por) objetivo|Este documento/i.test(f.texto));
    if (obj) r.ementa = obj.texto;
  }

  // Vigência de atos normativos.
  const vig = frases.find((f) => /entra(r[áa])? em vigor|produzindo efeitos|produz(ir[áa])? efeitos/i.test(f.texto));
  if (vig) {
    const ds = acharDatas(vig.texto).filter((d) => d.iso && !ehCitacaoDeNorma(vig.texto, d));
    if (ds.length) r.dataVigencia = ds[ds.length - 1].iso;
    else if (/na data de sua publica/i.test(vig.texto) && r.dataPublicacao) r.dataVigencia = r.dataPublicacao;
  }
  void tudo;
  return r;
}

// ---------------------------------------------------------------------
// Notas Técnicas: Controle de Versões e Cronograma
// ---------------------------------------------------------------------

type LinhaCronograma = { versao: string; descricao: string; teste: DataAchada | null; producao: DataAchada | null; textoTeste: string; textoProducao: string; pagina: number };

function lerVersoes(linhasPorPagina: string[][]): { versao: string; publicacao: string; descricao: string; pagina: number }[] {
  const out: { versao: string; publicacao: string; descricao: string; pagina: number }[] = [];
  linhasPorPagina.forEach((ls, i) => {
    const ini = ls.findIndex((l) => /^Controle de Vers[õo]es/i.test(l));
    if (ini < 0) return;
    for (let k = ini + 1; k < ls.length && !/Hist[óo]rico de Altera/i.test(ls[k]); k++) {
      const m = ls[k].match(/^(\d+\.\d{2})\s+(\d{2}\/\d{4}|[A-Za-zç]+\/\d{4})\s+(.*)$/);
      if (m) out.push({ versao: m[1], publicacao: m[2], descricao: m[3], pagina: i + 1 });
      else if (out.length && !/^Vers[ãa]o\s/i.test(ls[k])) out[out.length - 1].descricao += ' ' + ls[k];
    }
  });
  return out;
}

function lerCronograma(linhasPorPagina: string[][]): LinhaCronograma[] {
  // Junta as linhas da tabela (pode atravessar páginas) até as notas de
  // rodapé ("* ...") ou o próximo título numerado.
  const blocos: { texto: string; pagina: number }[] = [];
  let dentro = false;
  linhasPorPagina.forEach((ls, i) => {
    for (const l of ls) {
      if (/Hist[óo]rico de Altera[çc][õo]es\s*\/\s*Cronograma/i.test(l)) {
        dentro = true;
        continue;
      }
      if (!dentro) continue;
      if (/^\*|^(\d+\.?\s+[A-ZÀ-Ú][a-zà-ú]|Introdu[çc][ãa]o$|Sum[áa]rio$|Resumo$)/.test(l) && !/^\d\.\d{2}/.test(l)) {
        dentro = false;
        continue;
      }
      if (/^(Vers[ãa]o\s+Hist|Teste$|Implanta[çc][ãa]o$|Produ[çc][ãa]o$)/i.test(l)) continue;
      if (/^\d\.\d{2}\**(\s|$)/.test(l)) blocos.push({ texto: l, pagina: i + 1 });
      else if (blocos.length) blocos[blocos.length - 1].texto += ' ' + l;
    }
  });
  return blocos.map(({ texto, pagina }) => {
    const versao = texto.match(/^(\d\.\d{2})/)![1];
    const corpo = texto.replace(/^\d\.\d{2}\**\s*/, '');
    // Datas da implantação: no fim da linha ("Até 01/09/2026 05/10/2026",
    // "De 07/07/2025 até 28/07/2025* 06/10/2025", "- 01/12/2026").
    const re = /(?:(?:De\s+\d{2}\/\d{2}\/\d{4}\s+)?at[ée]\s+)?\d{2}\/\d{2}\/\d{4}\**|\b\d{2}\/\d{4}\b|Implementa[çc][ãa]o\s+futura|N[ãa]o\s+se\s+aplica|(?<=\s)-(?=\s+\d{2}\/)/gi;
    const tokens: { t: string; i: number }[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(corpo))) tokens.push({ t: m[0], i: m.index });
    const primeiro = tokens.length ? tokens[0].i : corpo.length;
    const descricao = corpo.slice(0, primeiro).trim().replace(/[.;]\s*$/, '');
    const [tTeste, tProd] = tokens.length >= 2 ? [tokens[0].t, tokens[1].t] : tokens.length === 1 ? ['', tokens[0].t] : ['', ''];
    const data = (t: string): DataAchada | null => {
      const d = acharDatas(t).filter((x) => x.iso);
      return d.length ? d[d.length - 1] : null;
    };
    return { versao, descricao, teste: data(tTeste), producao: data(tProd), textoTeste: tTeste === '-' ? '' : tTeste.replace(/\*+$/, ''), textoProducao: tProd.replace(/\*+$/, ''), pagina };
  });
}

// ---------------------------------------------------------------------
// Códigos fiscais
// ---------------------------------------------------------------------

function acharCodigos(frases: Frase[], prioridade: Set<string>): Codigo[] {
  const vistos = new Map<string, Codigo & { peso: number }>();
  const add = (tipo: string, codigo: string, descricao: string, f: Frase, peso: number) => {
    const chave = `${tipo}|${codigo}`;
    if (vistos.has(chave)) return;
    vistos.set(chave, { tipo, codigo, descricao, fonte: fonteDe(f, false), peso: peso + (prioridade.has(codigo) ? 50 : 0) });
  };
  for (const f of frases) {
    const s = f.texto;
    let m: RegExpExecArray | null;
    // CFOP: só números logo depois da palavra "CFOP" (senão pega código de
    // rejeição "Obrig. 1179" e outros números da mesma linha). Sem ponto
    // ("5922") só bem colado no "CFOP".
    for (const c of s.matchAll(/CFOP/gi)) {
      const janela = s.slice(c.index! + 4, c.index! + 130);
      for (const n of janela.matchAll(/\b([1-7])\.(\d{3})\b/g)) add('CFOP', `${n[1]}.${n[2]}`, encurtar(s, 14), f, 100);
      for (const n of janela.slice(0, 25).matchAll(/\b([1-7])(\d{3})\b/g)) add('CFOP', `${n[1]}.${n[2]}`, encurtar(s, 14), f, 100);
    }
    const reCst = /\bCST\s*(?:n?[ºo°]\s*)?(\d{2,3})\b/gi;
    while ((m = reCst.exec(s))) add('CST', m[1], encurtar(s, 14), f, 95);
    const reCsosn = /\bCSOSN\s*(\d{3})\b/gi;
    while ((m = reCsosn.exec(s))) add('CSOSN', m[1], encurtar(s, 14), f, 95);
    if (/cClassTrib|classifica[çc][ãa]o tribut/i.test(s)) {
      const re = /\b(\d{6})\b/g;
      while ((m = re.exec(s))) add('cClassTrib', m[1], encurtar(s, 14), f, 90);
    }
    if (/NCM/i.test(s)) {
      const re = /\b(\d{4}\.\d{2}(?:\.\d{2})?)\b/g;
      while ((m = re.exec(s))) add('NCM', m[1], encurtar(s, 14), f, 85);
    }
    if (/cBenef/i.test(s)) {
      const re = /\b([A-Z]{2}[0-9A-Z]{6})\b/g;
      while ((m = re.exec(s))) if (/\d/.test(m[1])) add('cBenef', m[1], encurtar(s, 14), f, 85);
    }
    // Campo do XML citado como “tag - Descrição” (Ajustes SINIEF).
    const reCampo = /campo\s*[“"]\s*([a-zA-Z][A-Za-z0-9]{2,})\s*-\s*([^”"]{3,80})[”"](?:[^“"]{0,30}(?:c[óo]digo|texto)\s*[“"]([^”"]{1,60})[”"])?/gi;
    while ((m = reCampo.exec(s))) add('Campo/Grupo XML', m[1], m[3] ? `${m[2].trim()} = ${m[3].trim()}` : m[2].trim(), f, 80);
    // Campo com ID do leiaute: "cIndOp, B25d", "vCBS – W56", "(ISUFemit, C22)".
    const reTag = /\b([a-z][a-zA-Z0-9]{2,})\s*(?:,|–|-|\()\s*([A-Z]{1,3}\d{1,3}[a-z]?)\b/g;
    while ((m = reTag.exec(s))) if (/[A-Z]/.test(m[1])) add('Campo/Grupo XML', `${m[1]} (${m[2]})`, encurtar(s, 12), f, 70);
    // Tabela de leiaute de NT: "ID Campo" ("BA02 refNFe", "C02 CNPJ" não — precisa ter minúscula).
    const reIdTag = /\b([A-Z]{1,3}\d{2,3}[a-z]?)\s+((?=[A-Za-z0-9]*[a-z])[a-zA-Z][a-z]*[A-Z][A-Za-z0-9]*)\b/g;
    while ((m = reIdTag.exec(s))) add('Campo/Grupo XML', `${m[2]} (${m[1]})`, encurtar(s, 12), f, 60);
    const reGrupo = /\bgrupo\s+([a-z][A-Za-z0-9]{3,})\b/gi;
    while ((m = reGrupo.exec(s))) if (/[A-Z]/.test(m[1].slice(1))) add('Campo/Grupo XML', m[1], encurtar(s, 12), f, 65);
    const reRegra = /\b((?:\d?[A-Z]{1,3}\d{1,3}[a-z]?)-\d{2,3})\b/g;
    while ((m = reRegra.exec(s))) add('Regra de validação', m[1], encurtar(s, 12), f, 40);
    const reSped = /\bRegistro\s+([A-Z0-9]\d{3})\b/g;
    while ((m = reSped.exec(s))) add('Registro SPED', m[1], encurtar(s, 12), f, 75);
    const reRej = /\bRejei[çc][ãa]o\s*:?\s*(\d{3})\b/gi;
    while ((m = reRej.exec(s))) add('Outro', `Rejeição ${m[1]}`, encurtar(s, 12), f, 60);
    const reEv = /\bEvento\s+(\d{6})\b/g;
    while ((m = reEv.exec(s))) add('Outro', `Evento ${m[1]}`, encurtar(s, 12), f, 55);
  }
  return [...vistos.values()]
    .sort((a, b) => b.peso - a.peso)
    .slice(0, 40)
    .map(({ peso: _p, ...c }) => c);
}

// ---------------------------------------------------------------------
// Seleção de frases por tema
// ---------------------------------------------------------------------

function pontuar(f: Frase, re: RegExp, bonus?: RegExp): number {
  const s = f.texto;
  if (s.length < 35 || s.length > 700) return 0;
  // Linha de tabela de regras de validação ("Obrig. 575 Rejeição: ...") ou
  // de schema ("resNFe_v1.01.xsd C01 resNFe G - - -") não é frase.
  if (/\b(Obrig|Facult)\.?\s*\d{3,4}\b|(\s-){3}|\.xsd\b|Schema XML:/.test(s)) return 0;
  const hits = (s.match(new RegExp(re.source, 'gi')) || []).length;
  if (!hits) return 0;
  // Linhas de tabela de leiaute (muitos tokens curtos) valem pouco.
  const tokensCurtos = s.split(' ').filter((w) => w.length <= 2).length / s.split(' ').length;
  // Linhas de tabela de leiaute de NT ("Campo impresso Tag (XML) — ID", vários IDs W56/UB14).
  const ids = (s.match(/\b[A-Z]{1,3}\d{1,3}[a-z]?\b/g) || []).length;
  const tabela = /Tag \(XML\)|Campo impresso|# ID Campo|Ele Pai Tipo/.test(s) || ids > 2 ? 80 : 0;
  return hits * 10 + (bonus && bonus.test(s) ? 8 : 0) - tokensCurtos * 20 - tabela + (/[a-zà-ú]{4,}/.test(s) ? 2 : 0);
}

function melhores(frases: Frase[], re: RegExp, n: number, bonus?: RegExp, excluir?: Set<string>): Frase[] {
  const vistos = new Set<string>(excluir ?? []);
  return frases
    .map((f, i) => ({ f, i, p: pontuar(f, re, bonus) }))
    .filter((x) => x.p > 4)
    .sort((a, b) => b.p - a.p || a.i - b.i)
    .filter((x) => {
      const k = x.f.texto.slice(0, 80);
      if (vistos.has(k)) return false;
      vistos.add(k);
      return true;
    })
    .slice(0, n)
    .sort((a, b) => a.i - b.i)
    .map((x) => x.f);
}

const RE_ALTERACAO = /fica(m)?\s+(alterad|acrescid|inclu[íi]d|revogad|criad|inserid|exclu[íi]d|institu[íi]d)|passa(m)?\s+a\s+(vigorar|ser|ter|conter|apresentar|exigir)|[ée]\s+(inserid|criad|inclu[íi]d)|altera(m)?\s|acrescenta|revoga|nov[oa]s?\s+(campo|grupo|regra|evento|bloco|tipo|c[óo]digo|leiaute|layout)|cria(r|m)?\s|inclus[ãa]o|exclus[ãa]o|altera[çc][ãa]o|incorpora|passa(m)?\s+a\s+(exibir|constar|contar|apresentar)/;
const RE_OBRIGACAO = /\bdever[áã]o?\b|\bdeve(m)?\b|\bemitir[áã]o?\b|obrigat[óo]ri|fica(m)?\s+obrigad|[ée]\s+vedad|n[ãa]o\s+poder[áã]|\bexigid|\bescriturad/;
const RE_AFETADOS = /contribuinte|emitente|empresa|estabelecimento|optante|fabricante|importador|destinat[áa]rio|remetente|adquirente|transportador|desenvolvedor|fornecedor|substituto/;
const RE_ERP = /schema|leiaute|layout|\bcampo|\btag\b|\bgrupo\s|regra(s)?\s+de\s+valida|web\s*service|evento|XML|sistema|parametriz|DANFE|QR\s*Code|certificado/;
const RE_DOCS = /NF-?e\b|NFC-?e|NFS-?e|CT-?e|MDF-?e|DANFE|DACTE|nota fiscal|documento fiscal|modelo\s+(55|65|57)/;
const RE_ACESSORIAS = /\bEFD\b|\bSPED\b|escritura|DCTF|Reinf|GIA|DeSTDA|apura[çc][ãa]o|declara[çc][ãa]o|bloco\s+[A-Z0-9]\b|registro\s+[A-Z0-9]\d{3}/;
const RE_FISCAL = /al[íi]quota|base de c[áa]lculo|cr[ée]dito|d[ée]bito|estorno|destaque|isen[çc]|redu[çc][ãa]o|substitui[çc][ãa]o tribut|diferimento|benef[íi]cio|\bIBS\b|\bCBS\b|\bICMS\b|\bPIS\b|COFINS|\bIPI\b|imposto seletivo|monof[áa]sic|cashback/;
const RE_RISCO = /rejei[çc]|penalidade|multa|infra[çc]|denega|inidone|autua|irregular|n[ãa]o\s+ser[áã]o?\s+(aceit|autoriz|v[áa]lid)/;

function itensFonte(frases: Frase[], natureza: 'expresso' | 'interpretacao' = 'expresso', palavras = 45): ItemFonte[] {
  return frases.map((f) => ({ descricao: encurtar(f.texto, palavras), natureza, fonte: fonteDe(f) }));
}

// "Quem é afetado": rótulos padronizados a partir do que o texto cita,
// com a frase de evidência como fonte (interpretação).
function afetados(frases: Frase[]): ItemFonte[] {
  const regras: [RegExp, string][] = [
    [/NFC-?e|modelo\s+65/i, 'Emitentes de NFC-e (modelo 65)'],
    [/\bNF-?e\b|modelo\s+55/i, 'Emitentes de NF-e (modelo 55)'],
    [/\bCT-?e\b|modelo\s+57/i, 'Emitentes de CT-e (transportadoras)'],
    [/\bMDF-?e\b/i, 'Emitentes de MDF-e'],
    [/\bNFS-?e\b/i, 'Prestadores de serviço emissores de NFS-e'],
    [/combust[íi]ve/i, 'Operações com combustíveis (tributação monofásica)'],
    [/Simples Nacional/i, 'Optantes pelo Simples Nacional'],
    [/substitui[çc][ãa]o tribut|substituto/i, 'Contribuintes sujeitos à substituição tributária'],
    [/Zona Franca|ZFM|\bALC\b|Suframa/i, 'Operações na Zona Franca de Manaus / Áreas de Livre Comércio'],
    [/importa[çc][ãa]o|importador/i, 'Importadores'],
    [/desenvolvedor|software|empresas de tecnologia|\bPAA\b/i, 'Fornecedores de ERP e emissores de documentos fiscais'],
    [/contribuinte/i, 'Contribuintes citados no documento'],
  ];
  const out: ItemFonte[] = [];
  for (const [re, rotulo] of regras) {
    // Temas específicos só contam com várias menções (o DANFE da RTC cita
    // campos de ICMS-ST e monofásico sem ser "sobre" combustíveis).
    const achadas = frases.filter((x) => re.test(x.texto) && x.texto.length > 30);
    const minimo = /combust|substitui|Zona Franca|Importadores/.test(rotulo) ? 4 : 1;
    if (rotulo.startsWith('Contribuintes citados') && out.length >= 2) continue;
    const f = achadas.length >= minimo ? achadas[0] : undefined;
    if (f && !out.some((o) => o.descricao === rotulo)) out.push({ descricao: rotulo, natureza: 'interpretacao', fonte: fonteDe(f) });
    if (out.length >= 6) break;
  }
  return out;
}

// Resolve "Na hipótese prevista no inciso II da cláusula primeira" com o
// texto do inciso (Ajustes SINIEF/Convênios costumam listar as hipóteses
// na cláusula primeira e detalhar uma por cláusula).
function hipoteses(frases: Frase[]): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const f of frases) {
    const m = f.texto.match(/^([IVXLC]+)\s*[-–—]\s*(.+)$/);
    if (m && /^Cl[áa]usula primeira/i.test(f.dispositivo)) mapa.set(m[1], m[2].replace(/[;.]$/, ''));
  }
  return mapa;
}

// ---------------------------------------------------------------------
// Montagem do resultado
// ---------------------------------------------------------------------

// Tira das frases as tabelas "Controle de Versões" e "Histórico de
// Alterações / Cronograma" das NTs — elas são lidas à parte (lerVersoes /
// lerCronograma); deixá-las no texto corrido fazia cada linha antiga da
// tabela virar "alteração" ou "prazo" (NT 2025.002 tem dezenas).
function semTabelasDeVersao(linhasPorPagina: string[][]): string[][] {
  let dentro = false;
  return linhasPorPagina.map((ls) =>
    ls.filter((l) => {
      if (/^Controle de Vers[õo]es|Hist[óo]rico de Altera[çc][õo]es/i.test(l)) dentro = true;
      else if (dentro && /^\*|^(\d+\.?\s+[A-ZÀ-Ú][a-zà-ú]|Introdu[çc][ãa]o$|Sum[áa]rio$|Resumo$)/.test(l) && !/^\d\.\d{2}/.test(l)) dentro = false;
      return !dentro;
    })
  );
}

export function analisarSemIa(nomeArquivo: string, paginas: string[]): ResultadoAnalise {
  const linhas = limparPaginas(paginas);
  // Proteção: se o fim da tabela não for reconhecido, o corte comeria o
  // documento — aí fica com o texto inteiro.
  const filtradas = semTabelasDeVersao(linhas);
  const contar = (x: string[][]) => x.reduce((s, ls) => s + ls.join('').length, 0);
  const frases = montarFrases(contar(filtradas) > contar(linhas) * 0.5 ? filtradas : linhas);
  const totalChars = frases.reduce((s, f) => s + f.texto.length, 0);
  const id = identificar(nomeArquivo, linhas, frases);
  const ehNt = id.tipoDocumento === 'Nota Técnica';
  const hoje = hojeIso();
  const limitacoes: string[] = [
    'Resumo gerado automaticamente SEM IA: as frases foram localizadas e extraídas do próprio documento por regras, não reescritas nem interpretadas. Revise antes de divulgar.',
  ];
  if (totalChars < 300) limitacoes.push('O PDF tem pouco ou nenhum texto selecionável (provavelmente escaneado) — o resumo sem IA não consegue ler imagens.');

  const docRef = `${ehNt ? 'NT' : id.tipoDocumento} ${id.numero}${id.versao ? ` v${id.versao}` : ''}`.trim();
  const feminino = /^(Nota|Lei|Instru|Portaria|Resolu|Solu)/.test(id.tipoDocumento);
  const artigo = feminino ? 'a' : 'o';

  // --- Linha do tempo e "o que mudou" ---------------------------------
  const marcos: Marco[] = [];
  const alteracoes: Alteracao[] = [];
  const addMarco = (m: Marco) => {
    // Mesma data e tipo = mesmo marco (ex.: "09.12.25" no cabeçalho e a publicação no DOU).
    if (!marcos.some((x) => x.tipo === m.tipo && (m.data ? x.data === m.data : x.dataTexto === m.dataTexto))) marcos.push(m);
  };
  const versoes = ehNt ? lerVersoes(linhas) : [];
  const cronograma = ehNt ? lerCronograma(linhas) : [];
  const versaoAtual = id.versao || versoes.map((v) => v.versao).sort((a, b) => parseFloat(a) - parseFloat(b)).pop() || cronograma.map((c) => c.versao).sort().pop() || '';
  if (ehNt && !id.versao && versaoAtual) id.versao = versaoAtual;

  if (ehNt) {
    const vAtual = versoes.find((v) => v.versao === versaoAtual);
    if (vAtual && /^Publica[çc][ãa]o da NT\.?$/i.test(vAtual.descricao.trim())) {
      // Versão inicial: "Publicação da NT" não diz o que mudou.
      id.dataDocumento = vAtual.publicacao;
      addMarco({ data: '', dataTexto: vAtual.publicacao, tipo: 'publicacao', descricao: `Publicação da versão ${vAtual.versao}.`, fonte: { pagina: vAtual.pagina, dispositivo: 'Controle de Versões', trecho: `${vAtual.versao} ${vAtual.publicacao} ${vAtual.descricao}` } });
    } else if (vAtual) {
      id.dataDocumento = vAtual.publicacao;
      addMarco({ data: '', dataTexto: vAtual.publicacao, tipo: 'publicacao', descricao: `Publicação da versão ${vAtual.versao}: ${vAtual.descricao}`, fonte: { pagina: vAtual.pagina, dispositivo: 'Controle de Versões', trecho: `${vAtual.versao} ${vAtual.publicacao} ${vAtual.descricao}` } });
      alteracoes.push({ titulo: `Versão ${vAtual.versao}`, descricao: vAtual.descricao, tipo: 'alteracao', natureza: 'expresso', fonte: { pagina: vAtual.pagina, dispositivo: 'Controle de Versões', trecho: `${vAtual.versao} ${vAtual.publicacao} ${vAtual.descricao}` } });
    }
    for (const c of cronograma) {
      const atual = c.versao === versaoAtual;
      const futuro = (c.producao?.iso ?? '') >= hoje || (c.teste?.iso ?? '') >= hoje;
      if (!atual && !futuro) continue;
      const fonte: Fonte = { pagina: c.pagina, dispositivo: 'Histórico de Alterações / Cronograma', trecho: encurtar(`${c.versao} ${c.descricao} ${c.textoTeste} ${c.textoProducao}`, 40) };
      const desc = encurtar(c.descricao, 30);
      if (c.teste) addMarco({ data: c.teste.iso, dataTexto: c.textoTeste, tipo: 'homologacao', descricao: `v${c.versao} em homologação (teste): ${desc}`, fonte });
      if (c.producao) addMarco({ data: c.producao.iso, dataTexto: c.textoProducao, tipo: 'producao', descricao: `v${c.versao} em produção: ${desc}`, fonte });
      if (!c.producao && /futura/i.test(c.textoProducao)) addMarco({ data: '', dataTexto: 'Implementação futura', tipo: 'obrigatoriedade', descricao: `v${c.versao}: ${desc} (data ainda não definida)`, fonte });
      if (atual && !/^Vers[ãa]o inicial\.?$/i.test(c.descricao.trim())) alteracoes.push({ titulo: encurtar(c.descricao, 7).replace(/…$/, ''), descricao: c.descricao, tipo: /cria|inclu|nov[oa]|implanta/i.test(c.descricao) ? 'inclusao' : /revoga|elimina|exclu|desabilit/i.test(c.descricao) ? 'revogacao' : 'alteracao', natureza: 'expresso', fonte });
    }
  }

  // Datas soltas no texto (atos normativos e NTs sem tabela).
  for (const f of frases) {
    if (marcos.length >= 14) break;
    const tipo = tipoMarco(f.texto);
    if (!tipo || (ehNt && cronograma.length && (tipo === 'producao' || tipo === 'homologacao'))) continue;
    for (const d of acharDatas(f.texto)) {
      if (ehCitacaoDeNorma(f.texto, d) || (!d.iso && tipo !== 'publicacao')) continue;
      addMarco({ data: d.iso, dataTexto: d.texto, tipo, descricao: encurtar(f.texto, 30), fonte: fonteDe(f) });
    }
  }
  if (id.dataPublicacao) addMarco({ data: id.dataPublicacao, dataTexto: fmtBr(id.dataPublicacao), tipo: 'publicacao', descricao: 'Publicação no Diário Oficial da União.', fonte: { pagina: 1, dispositivo: '', trecho: '' } });
  if (id.dataVigencia && !marcos.some((m) => m.tipo === 'inicio_vigencia')) addMarco({ data: id.dataVigencia, dataTexto: fmtBr(id.dataVigencia), tipo: 'inicio_vigencia', descricao: 'Início da vigência / produção de efeitos.', fonte: { pagina: 0, dispositivo: '', trecho: '' } });
  marcos.sort((a, b) => (a.data || '9999').localeCompare(b.data || '9999'));

  // Atos normativos: regras por cláusula/artigo.
  const mapaHip = hipoteses(frases);
  if (!ehNt || alteracoes.length < 3) {
    // Sem as linhas das tabelas de versões/cronograma (já tratadas acima)
    // e sem frases de propósito/diretriz.
    const semTabela = frases.filter(
      (f) => !/^\d{1,2}\s/.test(f.texto) && !(/\d{2}\/\d{2,4}/.test(f.texto) && f.texto.length < 140 && !f.dispositivo) && !/^(O objetivo|A proposta|Diretrizes)/.test(f.texto)
    );
    const candidatas = melhores(semTabela, RE_ALTERACAO, 10, /fica|passa a|revoga|acrescenta|inserid|nov[oa]/);
    const tituloDe = (f: Frase) => (f.titulo && !/^(Resumo|Introdu|Vis[ãa]o Geral|Objetivo|Diretrizes)/i.test(f.titulo) ? f.titulo : encurtar(f.texto, 7).replace(/…$/, ''));
    for (const f of candidatas) alteracoes.push({ titulo: tituloDe(f), descricao: encurtar(f.texto, 60), tipo: /revoga/i.test(f.texto) ? 'revogacao' : /acrescid|inclu|cria|nov[oa]|inserid/i.test(f.texto) ? 'inclusao' : 'alteracao', natureza: 'expresso', fonte: fonteDe(f) });
    // Cláusulas "Na hipótese prevista no inciso X da cláusula primeira...".
    for (const f of frases) {
      if (alteracoes.length >= 15) break;
      const m = f.texto.match(/^Cl[áa]usula\s+\S+\s+Na hip[óo]tese prevista no inciso\s+([IVXLC]+)\s+da cl[áa]usula primeira,\s*(.+?)(?:,\s*contendo.*)?$/i);
      if (m && mapaHip.has(m[1])) {
        // Só os incisos da própria cláusula (o parágrafo único trata de outra NF-e).
        const campos = frases.filter((x) => x.dispositivo === f.dispositivo && /campo\s*[“"]/.test(x.texto)).map((x) => {
          const c = x.texto.match(/campo\s*[“"]\s*([a-z][A-Za-z0-9]+)\s*-[^”"]*[”"][^“"]*?(?:c[óo]digo|texto)\s*[“"]([^”"]+)[”"]/);
          return c ? `${c[1]} = ${c[2]}` : '';
        }).filter(Boolean);
        const cfops = (frases.find((x) => x.dispositivo === f.dispositivo && /CFOP/.test(x.texto))?.texto.match(/\b[1-7]\.\d{3}\b/g) ?? []).join(' ou ');
        if (cfops) campos.push(`CFOP ${cfops}`);
        // Título = a hipótese até a 1ª vírgula ("Redução de valores ou
        // quantidades, quando não for possível..." → "Redução de valores ou quantidades").
        const hip = mapaHip.get(m[1])!;
        const antesDaVirgula = hip.split(/[,;]/)[0].trim();
        const tituloHip = capitalizarInicio(antesDaVirgula.split(' ').length >= 3 ? antesDaVirgula : encurtar(hip, 10));
        alteracoes.push({ titulo: tituloHip, descricao: `${encurtar(m[2], 25)}${campos.length ? ` — ${campos.join('; ')}` : ''}`, tipo: 'inclusao', natureza: 'expresso', fonte: fonteDe(f) });
      }
    }
  }

  // NT nova (versão inicial) não "altera" — cria um assunto. O que ela
  // traz está nos títulos das seções ("4 Credenciamento de contribuintes",
  // "5 Série de emissão..."): cada um vira um item, com a 1ª frase da seção.
  // Só na versão inicial: numa revisão (v1.51) o que mudou é só o da versão.
  const versaoInicial = !versaoAtual || /^1\.00$/.test(versaoAtual) || versoes.length <= 1;
  if (ehNt && versaoInicial && alteracoes.length < 4) {
    const secoes = new Map<string, Frase>();
    for (const f of frases) {
      if (!f.titulo || secoes.has(f.titulo) || !/^Item \d{1,2}(\.\d{1,2})?$/.test(f.dispositivo)) continue;
      if (/^(Resumo|Introdu|Vis[ãa]o Geral|Objetivo|Diretrizes|Sum[áa]rio|Controle|Hist[óo]rico|Regras de Valida|Leiaute|Modelos? de refer|Esquema|Fluxo)/i.test(f.titulo)) continue;
      secoes.set(f.titulo, f);
    }
    for (const [titulo, f] of secoes) {
      if (alteracoes.length >= 8) break;
      if (alteracoes.some((a) => a.titulo === titulo)) continue;
      alteracoes.push({ titulo, descricao: encurtar(f.texto, 50), tipo: 'inclusao', natureza: 'expresso', fonte: fonteDe(f) });
    }
  }

  // A mesma mudança pode vir da tabela de versões e do cronograma.
  // Compara título + descrição (as cláusulas de um Ajuste começam iguais,
  // "O contribuinte emitirá NF-e de saída..."). Se uma é o começo da outra
  // ("Alteração de regras de validação" × "...: UB13-30, ..."), fica a mais completa.
  const norm = (a: Alteracao) => `${a.titulo} ${a.descricao}`.toLowerCase().replace(/[^a-zà-ú0-9]+/g, ' ').trim();
  for (let i = alteracoes.length - 1; i >= 0; i--) {
    const ni = norm(alteracoes[i]);
    const ni2 = alteracoes[i].descricao.toLowerCase().replace(/[^a-zà-ú0-9]+/g, ' ').trim();
    const coberta = alteracoes.some((a, j) => {
      if (j === i) return false;
      const nj = a.descricao.toLowerCase().replace(/[^a-zà-ú0-9]+/g, ' ').trim();
      const mesmoTitulo = j < i && a.titulo === alteracoes[i].titulo && !/^Vers[ãa]o\s/.test(a.titulo);
      return mesmoTitulo || (j < i && (norm(a) === ni || nj === ni2)) || (nj.length > ni2.length && nj.startsWith(ni2));
    });
    if (coberta) alteracoes.splice(i, 1);
  }

  const usadas = new Set(alteracoes.map((a) => a.fonte.trecho.slice(0, 80)));
  const obrigacoes = itensFonte(melhores(frases, RE_OBRIGACAO, 10, /dever|obrigat/, usadas));
  const impErp = itensFonte(melhores(frases, RE_ERP, 6, /schema|leiaute|layout|regra de valida|campo/));
  const impDocs = itensFonte(melhores(frases, RE_DOCS, 5, /emiti|emiss|deve/));
  const impAcess = itensFonte(melhores(frases, RE_ACESSORIAS, 4, /escritur|EFD|SPED/));
  const impFiscal = itensFonte(melhores(frases, RE_FISCAL, 6, /al[íi]quota|cr[ée]dito|estorno|destaque/));
  const quem = afetados(frases);

  // --- Códigos --------------------------------------------------------
  const prioridade = new Set<string>();
  for (const c of cronograma.filter((x) => x.versao === versaoAtual)) for (const m of c.descricao.matchAll(/\b(\d?[A-Z]{1,3}\d{1,3}[a-z]?-\d{2,3})\b/g)) prioridade.add(m[1]);
  const codigos = acharCodigos(frases, prioridade);

  // --- Riscos ---------------------------------------------------------
  const riscos: Risco[] = melhores(frases, RE_RISCO, 4).map((f) => ({ descricao: encurtar(f.texto, 40), gravidade: /rejei|denega|multa|penalidade/i.test(f.texto) ? 'alta' : 'media', natureza: 'expresso', fonte: fonteDe(f) }));
  const prod = marcos.filter((m) => (m.tipo === 'producao' || m.tipo === 'inicio_vigencia' || m.tipo === 'obrigatoriedade') && m.data && m.data >= hoje);
  const proximo = prod[0] ?? marcos.find((m) => m.data && m.data >= hoje && m.tipo !== 'publicacao');
  // Sem data futura: a última produção/vigência que já passou ("Em produção desde").
  const vigente = proximo
    ? undefined
    : [...marcos].reverse().find((m) => m.data && (m.tipo === 'producao' || m.tipo === 'inicio_vigencia' || m.tipo === 'obrigatoriedade'));
  // Rejeição só faz sentido quando há validação na SEFAZ (regras/schema),
  // não numa mudança só de impressão (DANFE).
  if (proximo && (codigos.some((c) => c.tipo === 'Regra de validação') || frases.filter((f) => /schema/i.test(f.texto)).length >= 3)) {
    riscos.push({ descricao: `Documentos emitidos fora do novo padrão a partir de ${fmtBr(proximo.data)} podem ser rejeitados pela SEFAZ.`, gravidade: 'alta', natureza: 'interpretacao', fonte: proximo.fonte });
  }

  // --- Checklist e providências (sempre derivados) --------------------
  const checklist: ItemChecklist[] = [];
  const addCheck = (acao: string, area: string, prazo: string, fonte: Fonte) => {
    if (checklist.length < 14 && !checklist.some((c) => c.acao === acao)) checklist.push({ acao, area, prazo, fonte });
  };
  const prazoTxt = proximo ? fmtBr(proximo.data) : '';
  const fonteVazia: Fonte = { pagina: 0, dispositivo: '', trecho: '' };
  const temSchema = frases.find((f) => /schema|leiaute|layout|\bcampo|\bgrupo\s/i.test(f.texto));
  const temRegra = codigos.find((c) => c.tipo === 'Regra de validação');
  const temCampo = codigos.find((c) => c.tipo === 'Campo/Grupo XML');
  const temCfop = codigos.find((c) => c.tipo === 'CFOP');
  const temCst = codigos.find((c) => c.tipo === 'CST' || c.tipo === 'CSOSN');
  const temClass = codigos.find((c) => c.tipo === 'cClassTrib') ?? frases.find((f) => /cClassTrib/.test(f.texto));
  const temNcm = codigos.find((c) => c.tipo === 'NCM');
  const temEvento = frases.find((f) => /\bevento\b/i.test(f.texto));
  const temDanfe = frases.find((f) => /DANFE/.test(f.texto));
  const temEscrit = impAcess[0];
  const temEstorno = frases.find((f) => /estorno/i.test(f.texto));

  addCheck(`Ler ${artigo} ${docRef || 'documento'} e confirmar o que se aplica às operações da empresa`, 'Fiscal', '', fonteVazia);
  if (temSchema) addCheck(`Pedir ao fornecedor do ERP a atualização do leiaute (${docRef})`, 'TI / ERP', prazoTxt, fonteDe(temSchema));
  if (temCampo) addCheck(`Conferir o preenchimento dos campos citados no XML (${codigos.filter((c) => c.tipo === 'Campo/Grupo XML').slice(0, 4).map((c) => c.codigo.split(' ')[0]).join(', ')})`, 'Fiscal', prazoTxt, temCampo.fonte);
  if (temRegra) addCheck(`Testar em homologação as regras de validação alteradas (${codigos.filter((c) => c.tipo === 'Regra de validação').slice(0, 5).map((c) => c.codigo).join(', ')})`, 'TI / ERP', prazoTxt, temRegra.fonte);
  if (temCfop) addCheck(`Revisar TES/regras fiscais com os CFOP citados (${codigos.filter((c) => c.tipo === 'CFOP').map((c) => c.codigo).join(', ')})`, 'Fiscal', '', temCfop.fonte);
  if (temCst) addCheck(`Revisar o CST das operações afetadas (${codigos.filter((c) => c.tipo === 'CST' || c.tipo === 'CSOSN').map((c) => c.codigo).join(', ')})`, 'Fiscal', '', temCst.fonte);
  if (temClass) addCheck('Revisar cClassTrib no cadastro de produtos e nas regras de IBS/CBS', 'Cadastro', '', 'fonte' in temClass ? temClass.fonte : fonteDe(temClass));
  if (temNcm) addCheck('Revisar o NCM dos produtos citados no documento', 'Cadastro', '', temNcm.fonte);
  if (temEstorno) addCheck('Definir o procedimento de estorno do crédito na escrituração', 'Contabilidade', '', fonteDe(temEstorno));
  if (temEvento) addCheck('Verificar se o ERP envia/recebe os eventos citados', 'TI / ERP', prazoTxt, fonteDe(temEvento));
  if (temDanfe) addCheck('Imprimir DANFE de teste e conferir o novo leiaute', 'Faturamento', prazoTxt, fonteDe(temDanfe));
  if (temEscrit) addCheck('Validar reflexos na escrituração (SPED/EFD)', 'Fiscal', '', temEscrit.fonte);
  addCheck('Comunicar os setores envolvidos (fiscal, faturamento, TI)', 'Gestão', '', fonteVazia);
  if (temSchema || temRegra) addCheck('Emitir notas de teste em homologação e validar o XML', 'TI / ERP', marcos.find((m) => m.tipo === 'homologacao' && m.data >= hoje)?.data ? fmtBr(marcos.find((m) => m.tipo === 'homologacao' && m.data >= hoje)!.data) : '', fonteVazia);
  if (proximo) addCheck(`Validar a entrada em produção até ${prazoTxt}`, 'TI / ERP', prazoTxt, proximo.fonte);

  const providencias: Providencia[] = checklist.slice(0, 6).map((c, i) => ({ descricao: c.acao, prioridade: i < 2 ? 'alta' : 'media' }));

  // --- Base legal -----------------------------------------------------
  const baseLegal: BaseLegal[] = [];
  const addBase = (b: BaseLegal) => {
    if (baseLegal.length < 15 && !baseLegal.some((x) => x.documento === b.documento && x.numero === b.numero && x.dispositivo === b.dispositivo)) baseLegal.push(b);
  };
  const docNome = ehNt ? 'Nota Técnica' : id.tipoDocumento;
  const numRef = `${id.numero}${id.versao ? ` v${id.versao}` : ''}`;
  for (const a of alteracoes.slice(0, 8)) addBase({ documento: docNome, numero: numRef, data: id.dataDocumento, orgao: id.orgao, dispositivo: a.fonte.dispositivo, pagina: a.fonte.pagina, trecho: a.fonte.trecho });
  // Normas citadas.
  const reNorma = /\b(Lei Complementar|Lei|Emenda Constitucional|EC|Ajuste SINIEF|Conv[êe]nio ICMS|Instru[çc][ãa]o Normativa(?: RFB)?|Decreto|Nota T[ée]cnica(?: Conjunta)?(?: DFe)?)\s+n?[ºo°.]*\s*([\d.]+\/\d{2,4}|\d{4}\.\d{3}|[\d.]{3,})/g;
  for (const f of frases) {
    for (const m of f.texto.matchAll(reNorma)) {
      const numero = m[2].replace(/\.$/, '');
      if (numero === id.numero) continue;
      addBase({ documento: m[1].replace(/^EC$/, 'Emenda Constitucional'), numero, data: '', orgao: '', dispositivo: '(citada no documento)', pagina: f.pagina, trecho: encurtar(f.texto, 30) });
    }
  }

  // --- Resumos --------------------------------------------------------
  // Uma linha por alteração: o título (seção da NT / hipótese do Ajuste)
  // lê melhor que a frase cortada; nos Ajustes, junta o 1º campo/código.
  const linhaAlteracao = (a: Alteracao, palavras: number) => {
    const tituloProprio = a.titulo && !a.descricao.startsWith(a.titulo.slice(0, 20)) && !/^Vers[ãa]o\s/.test(a.titulo);
    if (!tituloProprio) return encurtar(a.descricao, palavras);
    const detalhe = a.descricao.includes(' — ') ? a.descricao.split(' — ')[1].split('; ').slice(0, 2).join('; ') : '';
    return encurtar(detalhe ? `${a.titulo}: ${detalhe}` : a.titulo, palavras);
  };
  const mudou = alteracoes.slice(0, 3).map((a) => linhaAlteracao(a, 25));
  const vigTexto = proximo
    ? `${rotuloTipo(proximo.tipo)} em ${fmtBr(proximo.data)}`
    : vigente
      ? `${vigente.tipo === 'producao' ? 'Em produção desde' : 'Em vigor desde'} ${fmtBr(vigente.data)}`
      : id.dataVigencia
        ? `Vigência a partir de ${fmtBr(id.dataVigencia)}`
        : 'O documento analisado não traz uma data de vigência identificável.';
  const assunto = id.assuntoCurto || (id.ementa ? encurtar(id.ementa, 18) : '') || docRef;

  const resumoExecutivo = {
    oQueAconteceu: `${feminino ? 'Foi publicada a' : 'Foi publicado o'} ${docRef || 'norma'}${id.orgao ? ` — ${id.orgao}` : ''}${id.ementa ? `: ${encurtar(id.ementa, 35)}` : assunto ? `, sobre ${assunto}` : '.'}`,
    oQueMudou: mudou.length ? mudou.join(' · ') : 'Não foi possível identificar automaticamente as alterações — consulte o documento.',
    quandoEntraEmVigor: vigTexto,
    quemSeraAfetado: quem.length ? quem.map((q) => q.descricao).join('; ') : 'Não identificado automaticamente.',
    oQuePrecisamosFazer: checklist.slice(1, 5).map((c) => c.acao).join('; ') || 'Ver checklist.',
    qualOPrazo: proximo ? `${fmtBr(proximo.data)} (${rotuloTipo(proximo.tipo).toLowerCase()})` : vigente ? `Prazo já vencido: ${fmtBr(vigente.data)} — a regra já está valendo.` : 'Sem prazo identificado no documento.',
    impactoNoErp: impErp.length ? `O documento cita ${[temSchema && 'leiaute/schema', temCampo && 'campos do XML', temRegra && 'regras de validação', temEvento && 'eventos', temDanfe && 'DANFE'].filter(Boolean).join(', ') || 'mudanças de sistema'}: o ERP/emissor precisa ser atualizado e testado.` : 'Nenhum impacto direto de sistema identificado automaticamente.',
  };

  const resumoTecnico = [id.ementa, ...alteracoes.slice(0, 4).map((a) => `• ${encurtar(a.descricao, 40)}`), ...obrigacoes.slice(0, 2).map((o) => `• ${o.descricao}`)].filter(Boolean).join('\n');

  // Comunicado: alertas derivados primeiro; frase literal do documento só
  // uma e curta (tabelas de rejeição viram texto ilegível no card).
  const atencao = [
    ...riscos.filter((r) => r.natureza === 'interpretacao').map((r) => r.descricao),
    ...marcos.filter((m) => m.dataTexto === 'Implementação futura').map((m) => encurtar(m.descricao, 16)),
    ...riscos.filter((r) => r.natureza === 'expresso' && r.gravidade === 'alta').slice(0, 1).map((r) => encurtar(r.descricao, 14)),
  ].slice(0, 3);
  if (!ehNt && !id.dataVigencia) atencao.push('Vigência não localizada no PDF — confirme a data na publicação oficial');
  if (vigente) atencao.unshift(`A regra já está valendo desde ${fmtBr(vigente.data)}: verifique se a empresa já está adequada`);
  if (totalChars < 300) atencao.push('PDF com pouco texto legível — confira o original');

  const dataDestaque = proximo ? fmtBr(proximo.data) : vigente ? fmtBr(vigente.data) : id.dataVigencia ? fmtBr(id.dataVigencia) : 'A definir';
  const comunicado = {
    titulo: // Em ato normativo o assunto vem da ementa, que já é o subtítulo: o título fica só o ato.
      id.assuntoCurto ? encurtar(`${docRef}: ${id.assuntoCurto}`, 12).replace(/…$/, '') : docRef || assunto,
    subtitulo: encurtar((id.ementa || resumoExecutivo.oQueMudou).replace(/^(Esta|A presente)\s+(Nota T[ée]cnica|NT)(\s+[\d.]+)?\s+/i, '').replace(/^Este documento tem como objetivo\s+/i, ''), 25),
    dataDestaqueRotulo: proximo ? `${rotuloTipo(proximo.tipo)} em` : vigente ? (vigente.tipo === 'producao' ? 'Em produção desde' : 'Em vigor desde') : id.dataVigencia ? 'Vigência a partir de' : 'Data de vigência',
    dataDestaque,
    oQueMudou: alteracoes.slice(0, 4).map((a) => linhaAlteracao(a, 18)),
    quemEAfetado: quem.slice(0, 5).map((q) => q.descricao),
    oQueFazer: checklist.slice(1, 7).map((c) => encurtar(c.acao, 15)),
    impactoErp: [temSchema && 'Atualizar leiaute/schema do XML no ERP', temRegra && 'Testar as regras de validação alteradas', temCampo && 'Conferir os novos campos do XML', temEvento && 'Conferir envio dos eventos', temDanfe && 'Atualizar o layout do DANFE'].filter((x): x is string => Boolean(x)).slice(0, 4),
    atencao,
    fonte: [docRef, id.orgao, id.dataDocumento ? fmtBr(id.dataDocumento) : ''].filter(Boolean).join(' — '),
  };

  if (!alteracoes.length) limitacoes.push('Nenhuma alteração foi localizada pelas regras automáticas.');
  if (!marcos.some((m) => m.data)) limitacoes.push('Nenhuma data de vigência/produção foi localizada no texto (o PDF pode estar incompleto).');
  if (!ehNt && !id.dataVigencia) limitacoes.push('Cláusula/artigo de vigência não encontrado no texto do PDF — confira se o arquivo está completo.');

  return {
    identificacao: { titulo: id.titulo, tipoDocumento: id.tipoDocumento, numero: id.numero, versao: id.versao, dataDocumento: id.dataDocumento, orgao: id.orgao, dataPublicacao: id.dataPublicacao, dataVigencia: id.dataVigencia, ementa: id.ementa },
    assuntoPrincipal: assunto,
    resumoTecnico,
    resumoExecutivo,
    alteracoes: alteracoes.slice(0, 15),
    afetados: quem,
    obrigacoes,
    linhaDoTempo: marcos,
    impactos: { fiscalTributario: impFiscal, erp: impErp, documentosFiscais: impDocs, obrigacoesAcessorias: impAcess },
    codigos,
    riscos,
    providencias,
    checklist,
    baseLegal,
    comunicado,
    limitacoes,
  };
}

function fmtBr(isoData: string) {
  const m = isoData.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : isoData;
}

function rotuloTipo(t: TipoMarco): string {
  return {
    publicacao: 'Publicação',
    inicio_vigencia: 'Vigência',
    periodo_adaptacao: 'Adaptação',
    prazo_adequacao: 'Prazo',
    obrigatoriedade: 'Obrigatório',
    producao: 'Produção',
    homologacao: 'Homologação',
    encerramento: 'Encerramento',
    outro: 'Data',
  }[t];
}
