import type { Condicao, RegraExec, Violacao } from './tipos';

// Interpreta o texto de uma "Regra de Validação" de Nota Técnica e, SÓ
// quando o texto bate com um padrão conhecido, devolve a regra executável.
// Qualquer coisa fora disso volta com `exec = null` e o motivo — o sistema
// nunca chuta a lógica de uma regra que não entendeu.
//
// Padrões reconhecidos (formato usado pela Sefaz nas NTs de NF-e):
//   Se <condição>:                    condição = "(tag: X = V)", "(tag: X <> V)",
//   - <consequência>                  "<campo> (id: ..) [não] informado",
//                                     "informado <campo> (id: ..)", combinadas por e/ou
//   consequências (cada uma descreve o estado que a Sefaz REJEITA):
//     "<campo> não informado"                    → obrigatório ausente
//     "<campo|Grupo X> informado indevidamente"  → presença proibida
//     "Modelo igual a NN"                        → com "Se grupo X informado": proibido no modelo NN
//     "<A> difere de <B> * <C>"                  → A deve ser igual a B × C (com tolerância da NT)
//     "<A> difere do somatório do <B> dos itens" → A deve ser igual à soma de B nos itens
//     "... (tag: X <> V)" / "... (tag: X = V)"   → valor de X proibido
//     "<campo> difere de “1” e “4”"              → valor fora da lista proibido

export type Interpretacao = {
  exec: RegraExec | null;
  descricao: string | null;
  motivo: string | null;
};

const NOME = '([A-Za-z][A-Za-z0-9_]*)';
const ID = '[A-Za-z0-9.\\-]+';
const COM_ID = `${NOME}\\s*\\(id:\\s*${ID}\\s*\\)`;

function nao(motivo: string): Interpretacao {
  return { exec: null, descricao: null, motivo };
}

// "(tag: X, id: Y)", "(grupo: X, id: Y)" e "(tag: X)" (sem operador) viram
// "X (id:Y)" — uma forma só pra interpretar.
function normalizar(t: string): string {
  return t
    .replace(/\((?:tag|grupo):\s*([A-Za-z][A-Za-z0-9_]*)\s*(?:,\s*id:\s*([A-Za-z0-9.\-]+))?\s*\)/gi, (_m, nome: string, id?: string) => `${nome} (id:${id ?? '-'})`)
    .replace(/\s+/g, ' ')
    .trim();
}

type Clausula = { pos: number; fim: number; cond: Condicao };

function valoresDe(bruto: string): string[] {
  return bruto
    .split(/\s+ou\s+/i)
    .map((v) => v.replace(/[“”"']/g, '').trim().split(/[\s-]/)[0]) // "5-NFe de Crédito" → "5"
    .filter(Boolean);
}

function extrairClausulas(linha: string): Clausula[] {
  const out: Clausula[] = [];

  // (tag: X = V) / (tag: X <> V) — V pode ser "5 ou 6"
  const reTag = /\(tag:\s*([A-Za-z][A-Za-z0-9_]*)\s*(<>|=)\s*([^)]+?)\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = reTag.exec(linha))) {
    out.push({ pos: m.index, fim: m.index + m[0].length, cond: { tag: m[1], op: m[2] as '=' | '<>', valores: valoresDe(m[3]) } });
  }

  // "<campo> (id: X) [não] informado"
  const reInf1 = new RegExp(`${COM_ID}\\s+(n[ãa]o\\s+)?informad[oa]`, 'gi');
  while ((m = reInf1.exec(linha))) {
    out.push({ pos: m.index, fim: m.index + m[0].length, cond: { tag: m[1], op: m[2] ? 'nao_informado' : 'informado' } });
  }
  // "[não] informado <texto livre> <campo> (id: X)"
  const reInf2 = new RegExp(`(n[ãa]o\\s+)?informad[oa]\\s+(?:[^():]{0,80}?\\s)?${COM_ID}`, 'gi');
  while ((m = reInf2.exec(linha))) {
    if (out.some((c) => m!.index < c.fim && m!.index + m![0].length > c.pos)) continue;
    out.push({ pos: m.index, fim: m.index + m[0].length, cond: { tag: m[2], op: m[1] ? 'nao_informado' : 'informado' } });
  }
  return out.sort((a, b) => a.pos - b.pos);
}

function descreverCond(c: Condicao): string {
  if (c.tag === '#modelo') return `modelo = ${c.valores?.join(' ou ')}`;
  switch (c.op) {
    case '=':
      return `${c.tag} = ${c.valores?.join(' ou ')}`;
    case '<>':
      return `${c.tag} ≠ ${c.valores?.join(' e ≠ ')}`;
    case 'informado':
      return `${c.tag} informado`;
    case 'nao_informado':
      return `${c.tag} não informado`;
    case 'informado_em_itens':
      return `${c.tag} informado em algum item`;
  }
}

function descreverViolacao(v: Violacao): string {
  switch (v.tipo) {
    case 'AUSENTE':
      return `${v.alvo} precisa estar informado`;
    case 'PRESENTE':
      return `${v.alvo} não pode estar informado`;
    case 'COND':
      return `não pode ocorrer ${descreverCond(v.cond)}`;
    case 'DIFERE_PRODUTO':
      return `${v.alvo} deve ser igual a ${v.a} × ${v.b} (tolerância ${String(v.tolerancia).replace('.', ',')})`;
    case 'DIFERE_SOMA_ITENS':
      return `${v.alvo} deve ser igual à soma de ${v.parcela} dos itens`;
  }
}

export function descreverRegraExec(e: RegraExec): string {
  const conds = e.condicoes.map(descreverCond).join(e.logica === 'OU' ? ' OU ' : ' E ');
  const base = descreverViolacao(e.violacao);
  const escopo = e.escopo === 'ITEM' ? ' (conferido em cada item)' : '';
  return (conds ? `Se ${conds}: ` : '') + base + escopo;
}

export function interpretarRegra(linhas: string[], mensagem: string | null): Interpretacao {
  const corpo = linhas.map((l) => l.trim()).filter(Boolean);
  const textoCompleto = corpo.join('\n');

  if (/exce[çc][ãa]o|exce[çc][õo]es/i.test(textoCompleto)) return nao('A regra tem exceções descritas em texto livre.');
  if (/\(\s*[+−-]\s*\)/.test(textoCompleto)) return nao('A regra é um cálculo por somatório de vários campos (ainda não interpretado automaticamente).');

  // separa condição (linhas "Se ...") das consequências (linhas "- ...") e observações
  const condLinhas: string[] = [];
  const conseq: string[] = [];
  const obs: string[] = [];
  let atual: 'cond' | 'conseq' | 'obs' | null = null;
  for (const l of corpo) {
    if (/^(Observa[çc][ãa]o|Nota)\b/i.test(l)) {
      atual = 'obs';
      obs.push(l);
    } else if (/^Se\b/i.test(l)) {
      atual = 'cond';
      condLinhas.push(l);
    } else if (/^-\s/.test(l)) {
      atual = 'conseq';
      conseq.push(l.replace(/^-\s*/, ''));
    } else if (atual === 'cond') condLinhas[condLinhas.length - 1] += ' ' + l;
    else if (atual === 'conseq') conseq[conseq.length - 1] += ' ' + l;
    else if (atual === 'obs') obs[obs.length - 1] += ' ' + l;
    else condLinhas.push(l);
  }

  if (condLinhas.length !== 1) return nao('Condição composta por mais de um "Se" (aninhada) — fora dos padrões reconhecidos.');
  if (conseq.length !== 1) return nao('A regra não tem uma única consequência reconhecível.');

  const linhaCond = normalizar(condLinhas[0].replace(/:\s*$/, ''));
  const semAspas = linhaCond.replace(/[“"][^”"]*[”"]/g, '');

  const clausulas = extrairClausulas(semAspas);
  const emItens = /em um dos itens/i.test(semAspas);

  // conectores entre as cláusulas
  const conectores = new Set<string>();
  for (let i = 0; i < clausulas.length - 1; i++) {
    const entre = semAspas.slice(clausulas[i].fim, clausulas[i + 1].pos);
    if (/\bou\b/i.test(entre)) conectores.add('OU');
    else if (/\be\b/i.test(entre)) conectores.add('E');
  }
  if (conectores.size > 1) return nao('A condição mistura "e" com "ou" — fora dos padrões reconhecidos.');
  const logica: 'E' | 'OU' = conectores.has('OU') ? 'OU' : 'E';

  let condicoes: Condicao[] = clausulas.map((c) => c.cond);
  if (emItens) condicoes = condicoes.map((c) => (c.op === 'informado' ? { ...c, op: 'informado_em_itens' as const } : c));

  const linhaConseq = normalizar(conseq[0]).replace(/\.$/, '').trim();

  let violacao: Violacao | null = null;
  let m: RegExpExecArray | null;

  if ((m = new RegExp(`^(?:Grupo\\s+)?${COM_ID}\\s+n[ãa]o\\s+informad[oa]$`, 'i').exec(linhaConseq))) {
    violacao = { tipo: 'AUSENTE', alvo: m[1] };
  } else if ((m = new RegExp(`^(?:Grupo\\s+)?${COM_ID}\\s+informad[oa]\\s+indevidamente$`, 'i').exec(linhaConseq))) {
    violacao = { tipo: 'PRESENTE', alvo: m[1] };
  } else if ((m = /^Modelo(?:\s+DFe)?\s*(?:=|igual\s+a)\s*(\d{2})\b/i.exec(linhaConseq))) {
    // "Se grupo X informado: - Modelo igual a 65" → X é proibido no modelo 65
    const informado = condicoes.filter((c) => c.op === 'informado');
    if (informado.length !== 1 || condicoes.length !== 1) return nao('"Modelo igual a ..." sem uma condição de campo informado reconhecível.');
    violacao = { tipo: 'PRESENTE', alvo: informado[0].tag };
    condicoes = [{ tag: '#modelo', op: '=', valores: [m[1]] }];
  } else if ((m = new RegExp(`^${COM_ID}\\s+difere\\s+de\\s+${COM_ID}\\s*\\*\\s*${COM_ID}$`, 'i').exec(linhaConseq))) {
    const tol = /toler[âa]ncia\s+de\s+([\d.,]+)/i.exec(obs.join(' '));
    if (!tol) return nao('Cálculo sem tolerância declarada na NT — não aplico tolerância por conta própria.');
    violacao = { tipo: 'DIFERE_PRODUTO', alvo: m[1], a: m[2], b: m[3], tolerancia: parseFloat(tol[1].replace(',', '.')) };
  } else if ((m = new RegExp(`^${COM_ID}\\s+difere\\s+do\\s+somat[óo]rio\\s+d[oe]\\s+${COM_ID}\\s+dos\\s+itens$`, 'i').exec(linhaConseq))) {
    violacao = { tipo: 'DIFERE_SOMA_ITENS', alvo: m[1], parcela: m[2], tolerancia: 0 };
  } else if ((m = new RegExp(`^n[ãa]o\\s+informad[oa]\\b.*?\\b${COM_ID}$`, 'i').exec(linhaConseq))) {
    violacao = { tipo: 'AUSENTE', alvo: m[1] };
  } else if ((m = new RegExp(`^informad[oa]\\b(?:\\s+indevidamente)?.*?\\b${COM_ID}$`, 'i').exec(linhaConseq))) {
    violacao = { tipo: 'PRESENTE', alvo: m[1] };
  } else if ((m = new RegExp(`\\b${COM_ID}\\s+difere\\s+de\\s+((?:[“"][^”"]+[”"][^“"”]*?)+)$`, 'i').exec(linhaConseq))) {
    // "<campo> difere de “1” (texto) e “4” (texto)" → valor fora da lista
    const valores = Array.from(m[2].matchAll(/[“"]([^”"]+)[”"]/g)).map((x) => x[1].trim().split(/[\s-]/)[0]);
    if (valores.length === 0) return nao(`Consequência fora dos padrões reconhecidos: "${linhaConseq}".`);
    violacao = { tipo: 'COND', cond: { tag: m[1], op: '<>', valores } };
  } else {
    // consequência que já traz a própria condição: "... (tag: tpNF <> 0)"
    const cs = extrairClausulas(linhaConseq).filter((c) => c.cond.op === '=' || c.cond.op === '<>');
    if (cs.length === 1) violacao = { tipo: 'COND', cond: cs[0].cond };
  }

  if (!violacao) return nao(`Consequência fora dos padrões reconhecidos: "${linhaConseq}".`);

  // "Se X não informado: - X não informado" é a própria obrigatoriedade
  if (violacao.tipo === 'AUSENTE') {
    const alvo = violacao.alvo;
    condicoes = condicoes.filter((c) => !(c.op === 'nao_informado' && c.tag === alvo));
  }
  // numa regra de "informado X → X difere de ..." a condição de X informado é implícita
  if (violacao.tipo === 'DIFERE_PRODUTO' || violacao.tipo === 'DIFERE_SOMA_ITENS') {
    const alvo = violacao.alvo;
    condicoes = condicoes.filter((c) => !((c.op === 'informado' || c.op === 'informado_em_itens') && c.tag === alvo));
  }

  const semCondicaoReconhecida = clausulas.length === 0 && !(violacao.tipo === 'PRESENTE' && condicoes[0]?.tag === '#modelo');
  if (semCondicaoReconhecida && violacao.tipo !== 'AUSENTE') return nao('Não foi possível identificar a condição da regra.');
  // regra com "Se ..." mas nenhuma condição identificada: não arrisco
  if (clausulas.length === 0 && /^Se\b/i.test(condLinhas[0]) && violacao.tipo === 'AUSENTE') return nao('Não foi possível identificar a condição da regra.');

  const escopo: 'ITEM' | 'DOC' = mensagem && /nItem/i.test(mensagem) ? 'ITEM' : 'DOC';
  const exec: RegraExec = { logica, condicoes, violacao, escopo };
  return { exec, descricao: descreverRegraExec(exec), motivo: null };
}
