import type { Alerta, ApuracaoE110, ApuracaoMes, ArquivoEfd, Conferencia, DocEfd, LinhaResumo, Oper, ResumoMensal, TopParticipante, TotaisResumo } from './tipos';
import { SIT_SEM_VALOR, rotuloMes } from './rotulos';
import { metricasCombustivel } from './credito20';

// ---------------------------------------------------------------------
// 1) Escolha dos arquivos que entram (mesma empresa, mesmo exercício, sem
//    mês repetido) e alertas do conjunto
// ---------------------------------------------------------------------

export type Descartado = { arquivo: ArquivoEfd; motivo: string };

export type ConjuntoValidado = {
  usados: ArquivoEfd[]; // ordenados por período
  descartados: Descartado[];
  alertas: Alerta[];
  empresa: { nome: string; cnpj: string; ie: string; uf: string } | null;
  ano: string | null;
  mesesPresentes: string[]; // AAAAMM
  mesesAusentes: string[];
};

const semMascara = (s: string) => (s || '').replace(/\D/g, '');

// Empresa + exercício: cada combinação é uma análise. Quando o usuário carrega
// vários exercícios (ex.: 2016 e 2017) de uma vez, ele escolhe qual analisar.
export type GrupoAnalise = { chave: string; nome: string; cnpj: string; ie: string; ano: string; arquivos: number };

const chaveGrupo = (a: ArquivoEfd) => `${semMascara(a.cabecalho.cnpj)}|${semMascara(a.cabecalho.ie)}|${a.ym.slice(0, 4)}`;

export function listarGrupos(arquivos: ArquivoEfd[]): GrupoAnalise[] {
  const m = new Map<string, GrupoAnalise>();
  for (const a of arquivos) {
    if (a.alertas.some((x) => x.nivel === 'erro') || !a.ym) continue;
    const k = chaveGrupo(a);
    const g = m.get(k) ?? { chave: k, nome: a.cabecalho.nome, cnpj: a.cabecalho.cnpj, ie: a.cabecalho.ie, ano: a.ym.slice(0, 4), arquivos: 0 };
    g.arquivos++;
    m.set(k, g);
  }
  // mais arquivos primeiro; empate → exercício mais antigo
  return [...m.values()].sort((a, b) => b.arquivos - a.arquivos || a.ano.localeCompare(b.ano) || a.nome.localeCompare(b.nome));
}

export function validarConjunto(arquivos: ArquivoEfd[], grupoEscolhido?: string | null): ConjuntoValidado {
  const alertas: Alerta[] = [];
  const descartados: Descartado[] = [];

  // arquivos que nem são EFD ficam de fora já aqui
  const candidatos = arquivos.filter((a) => {
    if (a.alertas.some((x) => x.nivel === 'erro')) {
      descartados.push({ arquivo: a, motivo: a.alertas.find((x) => x.nivel === 'erro')!.mensagem });
      return false;
    }
    return true;
  });

  // empresa e exercício analisados: o escolhido pelo usuário; senão o grupo com mais arquivos
  const ordenados = [...candidatos].sort((a, b) => a.ym.localeCompare(b.ym) || a.nomeArquivo.localeCompare(b.nomeArquivo));
  const grupos = listarGrupos(ordenados);
  const alvo = grupos.find((g) => g.chave === grupoEscolhido) ?? grupos[0];
  const ref = alvo ? ordenados.find((a) => chaveGrupo(a) === alvo.chave) : undefined;
  if (!ref || !alvo) {
    return { usados: [], descartados, alertas, empresa: null, ano: null, mesesPresentes: [], mesesAusentes: [] };
  }
  const ano = alvo.ano;

  const mesmos: ArquivoEfd[] = [];
  for (const a of ordenados) {
    if (chaveGrupo(a) === alvo.chave) mesmos.push(a);
    else if (semMascara(a.cabecalho.cnpj) !== semMascara(ref.cabecalho.cnpj) || semMascara(a.cabecalho.ie) !== semMascara(ref.cabecalho.ie)) {
      descartados.push({ arquivo: a, motivo: `Outra empresa (${a.cabecalho.nome} — CNPJ ${a.cabecalho.cnpj}, IE ${a.cabecalho.ie}): empresas não são misturadas — escolha qual analisar em "Analisar".` });
    } else {
      descartados.push({ arquivo: a, motivo: `Outro exercício (${a.ym.slice(0, 4)}): a análise atual é de ${ano} — escolha o exercício em "Analisar".` });
    }
  }

  // mês repetido: fica a versão MAIS RECENTE pela data de assinatura digital (é o que define
  // qual retificadora vale); sem data de assinatura, o arquivo substituto (COD_FIN 1); empate → o primeiro
  const porMes = new Map<string, ArquivoEfd[]>();
  for (const a of mesmos) porMes.set(a.ym, [...(porMes.get(a.ym) ?? []), a]);
  const usados: ArquivoEfd[] = [];
  for (const [ym, lista] of porMes) {
    if (lista.length === 1) {
      usados.push(lista[0]);
      continue;
    }
    const classificadas = [...lista].sort(
      (a, b) =>
        (b.assinadoEm ?? '').localeCompare(a.assinadoEm ?? '') ||
        Number(b.cabecalho.codFin === '1') - Number(a.cabecalho.codFin === '1') ||
        a.nomeArquivo.localeCompare(b.nomeArquivo)
    );
    const escolhido = classificadas[0];
    usados.push(escolhido);
    const dataAss = (a: ArquivoEfd) => (a.assinadoEm ? new Date(a.assinadoEm).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'sem data de assinatura');
    const nomeVersao = (a: ArquivoEfd) => (a.versaoNome ? `${a.versaoNome.codFin === '1' ? 'retificadora' : 'original'} ${a.versaoNome.hash.slice(0, 6)}` : a.nomeArquivo);
    const criterio = classificadas.every((x) => x.assinadoEm) ? 'a assinatura mais recente' : 'o arquivo substituto';
    for (const outro of lista) {
      if (outro === escolhido) continue;
      descartados.push({ arquivo: outro, motivo: `Mês repetido (${rotuloMes(ym)}): foi mantida a versão ${nomeVersao(escolhido)} (assinada em ${dataAss(escolhido)}); esta é ${nomeVersao(outro)} (${dataAss(outro)}).` });
    }
    alertas.push({
      nivel: 'aviso',
      codigo: 'MES_REPETIDO',
      mensagem: `${rotuloMes(ym)} foi enviado ${lista.length} vezes — usei a versão ${nomeVersao(escolhido)} (assinada em ${dataAss(escolhido)}, critério: ${criterio}) e descartei as outras.`,
    });
  }
  usados.sort((a, b) => a.ym.localeCompare(b.ym));

  const mesesPresentes = usados.map((a) => a.ym);
  const mesesAusentes: string[] = [];
  if (usados.length > 1) {
    const ult = parseInt(usados[usados.length - 1].ym.slice(4, 6), 10);
    for (let m = 1; m <= Math.max(ult, 1); m++) {
      const ym = `${ano}${String(m).padStart(2, '0')}`;
      if (!mesesPresentes.includes(ym)) mesesAusentes.push(ym);
    }
    if (mesesAusentes.length > 0) {
      alertas.push({ nivel: 'aviso', codigo: 'MESES_AUSENTES', mensagem: `Sem arquivo importado para: ${mesesAusentes.map(rotuloMes).join(', ')}. O consolidado anual NÃO inclui esses meses.` });
    }
  }

  // encadeamento do saldo credor: saldo transportar do mês = anterior do mês seguinte
  for (let i = 1; i < usados.length; i++) {
    const ant = usados[i - 1].apuracao.e110;
    const atu = usados[i].apuracao.e110;
    const consecutivos = Number(usados[i].ym) - Number(usados[i - 1].ym) === 1;
    if (ant && atu && consecutivos && Math.abs(ant.vlSldCredorTransportar - atu.vlSldCredorAnt) > 0.009) {
      alertas.push({
        nivel: 'aviso',
        codigo: 'SALDO_CREDOR_ENCADEAMENTO',
        mensagem: `O saldo credor a transportar de ${rotuloMes(usados[i - 1].ym)} (${fmt(ant.vlSldCredorTransportar)}) não é igual ao saldo credor do período anterior em ${rotuloMes(usados[i].ym)} (${fmt(atu.vlSldCredorAnt)}).`,
      });
    }
  }

  return {
    usados,
    descartados,
    alertas,
    empresa: { nome: ref.cabecalho.nome, cnpj: ref.cabecalho.cnpj, ie: ref.cabecalho.ie, uf: ref.cabecalho.uf },
    ano,
    mesesPresentes,
    mesesAusentes,
  };
}

const fmt = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ---------------------------------------------------------------------
// 2) Documentos repetidos entre arquivos (ou dentro do arquivo): contam
//    uma vez só — o repetido recebe `duplicadoDe` e sai dos relatórios.
// ---------------------------------------------------------------------

export function marcarDuplicados(usados: ArquivoEfd[]): { total: number; exemplos: string[] } {
  const vistos = new Map<string, string>();
  let total = 0;
  const exemplos: string[] = [];
  for (const arq of usados) {
    for (const d of arq.docs) {
      d.duplicadoDe = undefined;
      const k = d.chave ? `K|${d.chave}` : `N|${d.reg}|${d.oper}|${d.codMod}|${d.serie}|${d.sub}|${d.numero}|${d.codPart}`;
      const onde = vistos.get(k);
      if (onde) {
        d.duplicadoDe = onde;
        total++;
        if (exemplos.length < 5) exemplos.push(`${d.codMod} ${d.serie}/${d.numero} (${rotuloMes(arq.ym)}, já em ${onde})`);
      } else vistos.set(k, rotuloMes(arq.ym));
    }
  }
  return { total, exemplos };
}

// ---------------------------------------------------------------------
// 3) Resumo mensal (é o que vai pro histórico: poucos KB)
// ---------------------------------------------------------------------

const zeroTotais = (): TotaisResumo => ({ docs: 0, docsValidos: 0, vlDoc: 0, vlOpr: 0, vlBc: 0, vlIcms: 0, vlBcSt: 0, vlIcmsSt: 0, vlIpi: 0 });
const r2 = (n: number) => Math.round(n * 100) / 100;

function resumirOperacao(docs: DocEfd[], oper: Oper): { linhas: LinhaResumo[]; totais: TotaisResumo; top: TopParticipante[] } {
  const mapa = new Map<string, { l: LinhaResumo; ids: Set<number> }>();
  const totais = zeroTotais();
  const part = new Map<string, TopParticipante>();
  for (const d of docs) {
    if (d.oper !== oper || d.duplicadoDe) continue;
    totais.docs++;
    if (SIT_SEM_VALOR.has(d.sit)) continue;
    totais.docsValidos++;
    totais.vlDoc += d.vlDoc;
    for (const ln of d.linhas) {
      const k = `${d.sit}|${ln.cst}|${ln.cfop}|${ln.aliq}`;
      let e = mapa.get(k);
      if (!e) {
        e = { l: { sit: d.sit, cst: ln.cst, cfop: ln.cfop, aliq: ln.aliq, docs: 0, vlOpr: 0, vlBc: 0, vlIcms: 0, vlBcSt: 0, vlIcmsSt: 0, vlRedBc: 0, vlIpi: 0 }, ids: new Set() };
        mapa.set(k, e);
      }
      e.ids.add(d.id);
      e.l.vlOpr += ln.vlOpr;
      e.l.vlBc += ln.vlBc;
      e.l.vlIcms += ln.vlIcms;
      e.l.vlBcSt += ln.vlBcSt;
      e.l.vlIcmsSt += ln.vlIcmsSt;
      e.l.vlRedBc += ln.vlRedBc;
      e.l.vlIpi += ln.vlIpi;
      totais.vlOpr += ln.vlOpr;
      totais.vlBc += ln.vlBc;
      totais.vlIcms += ln.vlIcms;
      totais.vlBcSt += ln.vlBcSt;
      totais.vlIcmsSt += ln.vlIcmsSt;
      totais.vlIpi += ln.vlIpi;
    }
    const chaveP = d.partDoc || d.codPart || '—';
    const p = part.get(chaveP) ?? { nome: d.partNome || chaveP, doc: d.partDoc, docs: 0, valor: 0 };
    p.docs++;
    p.valor += d.vlDoc;
    part.set(chaveP, p);
  }
  const linhas = [...mapa.values()]
    .map(({ l, ids }) => ({ ...l, docs: ids.size, vlOpr: r2(l.vlOpr), vlBc: r2(l.vlBc), vlIcms: r2(l.vlIcms), vlBcSt: r2(l.vlBcSt), vlIcmsSt: r2(l.vlIcmsSt), vlRedBc: r2(l.vlRedBc), vlIpi: r2(l.vlIpi) }))
    .sort((a, b) => a.sit.localeCompare(b.sit) || a.cst.localeCompare(b.cst) || a.cfop.localeCompare(b.cfop) || b.aliq - a.aliq);
  const top = [...part.values()].sort((a, b) => b.valor - a.valor).slice(0, 10).map((p) => ({ ...p, valor: r2(p.valor) }));
  for (const k of Object.keys(totais) as (keyof TotaisResumo)[]) if (k !== 'docs' && k !== 'docsValidos') totais[k] = r2(totais[k]);
  return { linhas, totais, top };
}

// saldo do E110 recalculado a partir dos campos (positivo = devedor; negativo = credor)
export function saldoDoE110(e: ApuracaoE110): number {
  return r2(e.vlTotDebitos + e.vlTotAjDebitos + e.vlEstornosCred - e.vlTotCreditos - e.vlTotAjCreditos - e.vlEstornosDeb - e.vlSldCredorAnt);
}

export function montarResumoMensal(arq: ArquivoEfd): ResumoMensal {
  const ent = resumirOperacao(arq.docs, 'E');
  const sai = resumirOperacao(arq.docs, 'S');
  const e110 = arq.apuracao.e110;
  const alertas: Alerta[] = [...arq.alertas];

  // documentos cujo valor do documento difere da soma dos registros analíticos
  const docsComDiferencaValor: Conferencia['docsComDiferencaValor'] = [];
  let docsSemAnalitico = 0;
  let duplicadosIgnorados = 0;
  for (const d of arq.docs) {
    if (d.duplicadoDe) {
      duplicadosIgnorados++;
      continue;
    }
    if (SIT_SEM_VALOR.has(d.sit)) continue;
    if (d.linhas.length === 0) {
      docsSemAnalitico++;
      continue;
    }
    const opr = r2(d.linhas.reduce((s, l) => s + l.vlOpr, 0));
    if (Math.abs(opr - d.vlDoc) > 0.009) docsComDiferencaValor.push({ oper: d.oper, numero: `${d.codMod} ${d.serie}/${d.numero}`, vlDoc: d.vlDoc, vlOpr: opr });
  }

  let saldoCalc: number | null = null;
  let saldoDecl: number | null = null;
  if (e110) {
    saldoCalc = saldoDoE110(e110);
    saldoDecl = r2(e110.vlSldApurado - e110.vlSldCredorTransportar);
  }
  const conf: Conferencia = {
    icmsSaidasAnalitico: sai.totais.vlIcms,
    icmsEntradasAnalitico: ent.totais.vlIcms,
    e110Debitos: e110 ? e110.vlTotDebitos : null,
    e110Creditos: e110 ? e110.vlTotCreditos : null,
    difDebitos: e110 ? r2(sai.totais.vlIcms - e110.vlTotDebitos) : null,
    difCreditos: e110 ? r2(ent.totais.vlIcms - e110.vlTotCreditos) : null,
    saldoCalculado: saldoCalc,
    saldoDeclarado: saldoDecl,
    docsComDiferencaValor,
    docsSemAnalitico,
    duplicadosIgnorados,
  };

  if (e110) {
    if (Math.abs(conf.difDebitos!) > 0.009) alertas.push({ nivel: 'aviso', codigo: 'DEBITOS_X_E110', mensagem: `ICMS das saídas nos registros analíticos (${fmt(conf.icmsSaidasAnalitico)}) difere dos débitos da apuração E110 (${fmt(e110.vlTotDebitos)}): diferença de ${fmt(conf.difDebitos!)}.` });
    if (Math.abs(conf.difCreditos!) > 0.009) alertas.push({ nivel: 'aviso', codigo: 'CREDITOS_X_E110', mensagem: `ICMS das entradas nos registros analíticos (${fmt(conf.icmsEntradasAnalitico)}) difere dos créditos da apuração E110 (${fmt(e110.vlTotCreditos)}): diferença de ${fmt(conf.difCreditos!)}.` });
    // saldo: só confere quando não há deduções (elas mudam o "a recolher", não o saldo apurado)
    if (e110.vlTotDed === 0 && Math.abs(saldoCalc! - saldoDecl!) > 0.009) {
      alertas.push({ nivel: 'aviso', codigo: 'SALDO_E110', mensagem: `O saldo recalculado a partir dos campos do E110 (${fmt(saldoCalc!)}) difere do saldo declarado (${fmt(saldoDecl!)}).` });
    }
    // ajustes E111 × campos do E110
    const soma = (cat: string) => r2(arq.apuracao.ajustes.filter((a) => a.categoria === cat).reduce((s, a) => s + a.valor, 0));
    const pares: [string, string, number][] = [
      ['Outros débitos', 'ajustes a débito do imposto', e110.vlTotAjDebitos],
      ['Outros créditos', 'ajustes a crédito do imposto', e110.vlTotAjCreditos],
      ['Estorno de créditos', 'estornos de créditos', e110.vlEstornosCred],
      ['Estorno de débitos', 'estornos de débitos', e110.vlEstornosDeb],
      ['Deduções do imposto apurado', 'deduções', e110.vlTotDed],
    ];
    for (const [cat, rot, campo] of pares) {
      const s = soma(cat);
      if (Math.abs(s - campo) > 0.009 && !(cat === 'Outros débitos' && Math.abs(s + e110.vlAjDebitos - campo) <= 0.009) && !(cat === 'Outros créditos' && Math.abs(s + e110.vlAjCreditos - campo) <= 0.009)) {
        alertas.push({ nivel: 'aviso', codigo: 'AJUSTES_E111', mensagem: `Os lançamentos E111 de "${cat}" somam ${fmt(s)}, mas o E110 informa ${fmt(campo)} de ${rot}.` });
      }
    }
  }
  if (docsComDiferencaValor.length > 0) {
    const tot = r2(docsComDiferencaValor.reduce((s, d) => s + (d.vlOpr - d.vlDoc), 0));
    alertas.push({ nivel: 'aviso', codigo: 'VALOR_DOC_X_ANALITICO', mensagem: `${docsComDiferencaValor.length} documento(s) com valor do documento diferente da soma dos registros analíticos (diferença total de ${fmt(tot)}) — conferir na aba "Conferência".` });
  }
  if (docsSemAnalitico > 0) alertas.push({ nivel: 'aviso', codigo: 'DOC_SEM_ANALITICO', mensagem: `${docsSemAnalitico} documento(s) válido(s) sem registro analítico (C190/D190) — não entram nos valores dos relatórios.` });
  if (duplicadosIgnorados > 0) alertas.push({ nivel: 'info', codigo: 'DUPLICADOS', mensagem: `${duplicadosIgnorados} documento(s) já existente(s) em outro mês foram ignorados para não duplicar.` });

  return {
    versao: 1,
    ym: arq.ym,
    empresa: { nome: arq.cabecalho.nome, cnpj: arq.cabecalho.cnpj, ie: arq.cabecalho.ie, uf: arq.cabecalho.uf, perfil: arq.cabecalho.perfil },
    codVer: arq.cabecalho.codVer,
    codFin: arq.cabecalho.codFin,
    nomeArquivo: arq.nomeArquivo,
    entradas: ent,
    saidas: sai,
    apuracao: arq.apuracao,
    conferencia: conf,
    alertas,
    credito: metricasCombustivel(arq),
  };
}

// ---------------------------------------------------------------------
// 4) Consolidação anual a partir dos resumos mensais
// ---------------------------------------------------------------------

export type ConsolidadoAno = {
  entradas: { linhas: LinhaResumo[]; totais: TotaisResumo };
  saidas: { linhas: LinhaResumo[]; totais: TotaisResumo };
  apuracao: ApuracaoE110; // fluxos somados; saldo credor anterior = 1º mês; a transportar = último mês
  ajustes: { ym: string; cod: string; descr: string; valor: number; categoria: string }[];
  obrigacoes: { ym: string; cod: string; valor: number; vencimento: string | null; codReceita: string; mesRef: string; txt: string }[];
};

function somarLinhas(lista: LinhaResumo[][]): LinhaResumo[] {
  const mapa = new Map<string, LinhaResumo>();
  for (const linhas of lista)
    for (const l of linhas) {
      const k = `${l.sit}|${l.cst}|${l.cfop}|${l.aliq}`;
      const e = mapa.get(k);
      if (!e) mapa.set(k, { ...l });
      else {
        e.docs += l.docs;
        e.vlOpr += l.vlOpr;
        e.vlBc += l.vlBc;
        e.vlIcms += l.vlIcms;
        e.vlBcSt += l.vlBcSt;
        e.vlIcmsSt += l.vlIcmsSt;
        e.vlRedBc += l.vlRedBc;
        e.vlIpi += l.vlIpi;
      }
    }
  return [...mapa.values()]
    .map((l) => ({ ...l, vlOpr: r2(l.vlOpr), vlBc: r2(l.vlBc), vlIcms: r2(l.vlIcms), vlBcSt: r2(l.vlBcSt), vlIcmsSt: r2(l.vlIcmsSt), vlRedBc: r2(l.vlRedBc), vlIpi: r2(l.vlIpi) }))
    .sort((a, b) => a.sit.localeCompare(b.sit) || a.cst.localeCompare(b.cst) || a.cfop.localeCompare(b.cfop) || b.aliq - a.aliq);
}

function somarTotais(lista: TotaisResumo[]): TotaisResumo {
  const t = zeroTotais();
  for (const x of lista) for (const k of Object.keys(t) as (keyof TotaisResumo)[]) t[k] += x[k];
  for (const k of Object.keys(t) as (keyof TotaisResumo)[]) if (k !== 'docs' && k !== 'docsValidos') t[k] = r2(t[k]);
  return t;
}

export function consolidarAno(resumos: ResumoMensal[]): ConsolidadoAno {
  const ord = [...resumos].sort((a, b) => a.ym.localeCompare(b.ym));
  const ap: ApuracaoE110 = { vlTotDebitos: 0, vlAjDebitos: 0, vlTotAjDebitos: 0, vlEstornosCred: 0, vlTotCreditos: 0, vlAjCreditos: 0, vlTotAjCreditos: 0, vlEstornosDeb: 0, vlSldCredorAnt: 0, vlSldApurado: 0, vlTotDed: 0, vlIcmsRecolher: 0, vlSldCredorTransportar: 0, debEsp: 0 };
  const primeiro = ord.find((r) => r.apuracao.e110)?.apuracao.e110;
  const ultimo = [...ord].reverse().find((r) => r.apuracao.e110)?.apuracao.e110;
  for (const r of ord) {
    const e = r.apuracao.e110;
    if (!e) continue;
    for (const k of Object.keys(ap) as (keyof ApuracaoE110)[]) if (k !== 'vlSldCredorAnt' && k !== 'vlSldCredorTransportar') ap[k] = r2(ap[k] + e[k]);
  }
  ap.vlSldCredorAnt = primeiro?.vlSldCredorAnt ?? 0;
  ap.vlSldCredorTransportar = ultimo?.vlSldCredorTransportar ?? 0;
  return {
    entradas: { linhas: somarLinhas(ord.map((r) => r.entradas.linhas)), totais: somarTotais(ord.map((r) => r.entradas.totais)) },
    saidas: { linhas: somarLinhas(ord.map((r) => r.saidas.linhas)), totais: somarTotais(ord.map((r) => r.saidas.totais)) },
    apuracao: ap,
    ajustes: ord.flatMap((r) => r.apuracao.ajustes.map((a) => ({ ym: r.ym, ...a }))),
    obrigacoes: ord.flatMap((r) => r.apuracao.obrigacoes.map((o) => ({ ym: r.ym, ...o }))),
  };
}

export type { ApuracaoMes };
