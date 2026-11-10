import type { AjusteApuracao, ApuracaoE110, ArquivoEfd, CreditoMes, ResumoMensal } from './tipos';
import { SIT_SEM_VALOR } from './rotulos';

// Demonstrativo "crédito outorgado de 20% × créditos usados na apuração".
//
// Compara, mês a mês, o crédito efetivamente utilizado com 20% do débito das
// saídas e mostra de que o crédito é feito (créditos de entradas, ajustes E111,
// estornos de débito). Tudo vem do E110/E111 e dos itens do próprio SPED —
// nada é estimado. O "parecer" de cada mês é uma comparação numérica objetiva;
// não é conclusão jurídica sobre o regime do contribuinte.

export const PERCENTUAL_OUTORGADO = 0.2;
const r2 = (n: number) => Math.round(n * 100) / 100;
const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export const ehDiesel = (descr: string) => norm(descr).includes('diesel');
export const unidadeLitro = (u: string) => /^l(t|ts|itro|itros)?$/i.test((u || '').trim());

// Ajuste que se apresenta como crédito outorgado: código SP020709 ou "outorgado" na descrição.
export const CODIGO_OUTORGADO = 'SP020709';
export const pareceOutorgado = (a: { cod: string; descr: string }) => a.cod === CODIGO_OUTORGADO || norm(a.descr).includes('outorgad');

// Métricas de diesel de um arquivo (entradas válidas, sem duplicados)
export function metricasDiesel(arq: ArquivoEfd): CreditoMes {
  let docsComDiesel = 0;
  let litros = 0;
  let vlItem = 0;
  let vlBc = 0;
  let vlIcms = 0;
  let itensSemLitros = 0;
  for (const d of arq.docs) {
    if (d.oper !== 'E' || d.duplicadoDe || SIT_SEM_VALOR.has(d.sit)) continue;
    let achou = false;
    for (const it of d.itens) {
      if (!ehDiesel(it.descr)) continue;
      achou = true;
      if (unidadeLitro(it.unid)) litros += it.qtd;
      else itensSemLitros++;
      vlItem += it.vlItem;
      vlBc += it.vlBc;
      vlIcms += it.vlIcms;
    }
    if (achou) docsComDiesel++;
  }
  return { docsComDiesel, litros: Math.round(litros * 1000) / 1000, vlItem: r2(vlItem), vlBc: r2(vlBc), vlIcms: r2(vlIcms), itensSemLitros };
}

export type ParecerMes = 'SEM_CREDITO' | 'COMPATIVEL_20' | 'NORMAL' | 'SEM_APURACAO';
export const ROTULO_PARECER: Record<ParecerMes, string> = {
  SEM_CREDITO: 'Sem crédito no mês',
  COMPATIVEL_20: 'Compatível com crédito de 20%',
  NORMAL: 'Apuração normal',
  SEM_APURACAO: 'Sem apuração (E110)',
};

export type LinhaDemonstrativo = {
  ym: string;
  temE110: boolean;
  debito: number; // débitos pelas saídas (E110)
  creditosEntradas: number; // créditos por entradas (E110)
  ajCreditos: number; // total dos ajustes a crédito (E110)
  estornosDeb: number; // estornos de débitos (E110)
  creditoUtilizado: number; // créditos de entradas + ajustes a crédito + estornos de débito
  pctDebito: number | null; // crédito utilizado ÷ débito
  credito20: number; // 20% do débito
  difCredito20: number; // crédito utilizado − 20% do débito
  outrosDebitos: number;
  estornosCred: number;
  saldoAnterior: number;
  resultado: number; // devedor (+) / credor (−)
  icmsRecolher: number;
  saldoTransportar: number;
  ajustesCredito: AjusteApuracao[];
  ajustesOutros: AjusteApuracao[];
  diesel: CreditoMes | null;
  icmsPorLitro: number | null; // ICMS destacado nas compras de diesel ÷ litros
  creditoPorLitro: number | null; // crédito utilizado ÷ litros de diesel
  difalMovimento: boolean;
  parecer: ParecerMes;
  parecerTexto: string;
  alerta: string | null;
};

const fmt = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n: number) => `${(n * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

export function linhaDemonstrativo(r: ResumoMensal): LinhaDemonstrativo {
  const e: ApuracaoE110 | null = r.apuracao.e110;
  const aj = r.apuracao.ajustes;
  const ajustesCredito = aj.filter((a) => a.categoria === 'Outros créditos');
  const ajustesOutros = aj.filter((a) => a.categoria !== 'Outros créditos');
  const base = {
    ym: r.ym,
    ajustesCredito,
    ajustesOutros,
    diesel: r.credito ?? null,
    difalMovimento: !!r.apuracao.difalMovimento,
  };
  if (!e) {
    return {
      ...base,
      temE110: false,
      debito: 0, creditosEntradas: 0, ajCreditos: 0, estornosDeb: 0, creditoUtilizado: 0, pctDebito: null, credito20: 0, difCredito20: 0,
      outrosDebitos: 0, estornosCred: 0, saldoAnterior: 0, resultado: 0, icmsRecolher: 0, saldoTransportar: 0,
      icmsPorLitro: null, creditoPorLitro: null,
      parecer: 'SEM_APURACAO',
      parecerTexto: 'O arquivo não tem apuração do ICMS (E110).',
      alerta: null,
    };
  }
  const debito = e.vlTotDebitos;
  const creditoUtilizado = r2(e.vlTotCreditos + e.vlTotAjCreditos + e.vlEstornosDeb);
  const credito20 = r2(debito * PERCENTUAL_OUTORGADO);
  const pctDebito = debito > 0 ? creditoUtilizado / debito : null;
  const resultado = r2(e.vlTotDebitos + e.vlTotAjDebitos + e.vlEstornosCred - e.vlTotCreditos - e.vlTotAjCreditos - e.vlEstornosDeb - e.vlSldCredorAnt);
  const dz = base.diesel;
  const icmsPorLitro = dz && dz.litros > 0 ? r2(dz.vlIcms / dz.litros) : null;
  const creditoPorLitro = dz && dz.litros > 0 && creditoUtilizado > 0 ? r2(creditoUtilizado / dz.litros) : null;

  // composição do crédito do mês, em texto
  const partes: string[] = [];
  if (e.vlTotCreditos > 0) partes.push(`créditos de entradas R$ ${fmt(e.vlTotCreditos)}`);
  if (e.vlTotAjCreditos > 0) partes.push(`ajustes a crédito R$ ${fmt(e.vlTotAjCreditos)}${ajustesCredito.length ? ` (${ajustesCredito.map((a) => a.cod).join(', ')})` : ''}`);
  if (e.vlEstornosDeb > 0) partes.push(`estornos de débitos R$ ${fmt(e.vlEstornosDeb)}`);
  const outros: string[] = [];
  if (e.vlEstornosCred > 0) outros.push(`estornos de créditos R$ ${fmt(e.vlEstornosCred)}`);
  if (e.vlTotAjDebitos > 0) outros.push(`ajustes a débito R$ ${fmt(e.vlTotAjDebitos)}`);
  if (base.difalMovimento) outros.push('há movimento de DIFAL (E310)');

  let parecer: ParecerMes;
  let parecerTexto: string;
  const so20 =
    creditoUtilizado > 0 &&
    Math.abs(creditoUtilizado - credito20) <= 0.01 &&
    e.vlTotCreditos === 0 &&
    e.vlEstornosDeb === 0 &&
    ajustesCredito.length >= 1 &&
    !base.difalMovimento;
  if (creditoUtilizado <= 0.004) {
    parecer = 'SEM_CREDITO';
    parecerTexto = `Nenhum crédito no mês${e.vlSldCredorAnt > 0 ? `; o débito foi coberto pelo saldo credor anterior (R$ ${fmt(e.vlSldCredorAnt)})` : ''}.${dz && dz.litros > 0 ? ` No mês houve compra de ${dz.litros.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} litros de diesel, com R$ ${fmt(dz.vlIcms)} de ICMS destacado nos itens de diesel.` : ''}`;
  } else if (so20) {
    parecer = 'COMPATIVEL_20';
    parecerTexto = `Único crédito do mês = ${pct(creditoUtilizado / debito)} do débito (R$ ${fmt(creditoUtilizado)}), lançado por ajuste, sem créditos de entradas nem estornos — comportamento de crédito outorgado de 20%.`;
  } else {
    parecer = 'NORMAL';
    parecerTexto = `Apuração normal: crédito de ${pctDebito === null ? '—' : pct(pctDebito)} do débito (R$ ${fmt(creditoUtilizado)}), composto por ${partes.join('; ')}${outros.length ? `. Também no mês: ${outros.join('; ')}` : ''}. Diferente dos 20% do débito (R$ ${fmt(credito20)}).`;
  }

  // o ajuste se apresenta como "crédito outorgado", mas o valor não é 20% do débito
  let alerta: string | null = null;
  const outorgados = ajustesCredito.filter(pareceOutorgado);
  if (parecer !== 'COMPATIVEL_20' && outorgados.length > 0) {
    const v = outorgados.reduce((s, a) => s + a.valor, 0);
    alerta = `Ajuste ${outorgados.map((a) => a.cod).join(', ')} com código/descrição de crédito outorgado, mas de R$ ${fmt(v)} (${debito > 0 ? pct(v / debito) : '—'} do débito), não ${pct(PERCENTUAL_OUTORGADO)}.`;
  }

  return {
    ...base,
    temE110: true,
    debito,
    creditosEntradas: e.vlTotCreditos,
    ajCreditos: e.vlTotAjCreditos,
    estornosDeb: e.vlEstornosDeb,
    creditoUtilizado,
    pctDebito,
    credito20,
    difCredito20: r2(creditoUtilizado - credito20),
    outrosDebitos: e.vlTotAjDebitos,
    estornosCred: e.vlEstornosCred,
    saldoAnterior: e.vlSldCredorAnt,
    resultado,
    icmsRecolher: e.vlIcmsRecolher,
    saldoTransportar: e.vlSldCredorTransportar,
    icmsPorLitro,
    creditoPorLitro,
    parecer,
    parecerTexto,
    alerta,
  };
}

export type ResumoDemonstrativo = {
  meses: number;
  semCredito: number;
  compativeis20: number;
  normais: number;
  primeiroCompativel20: string | null;
  ultimoNormal: string | null;
  pctMin: number | null;
  pctMax: number | null;
  mesesComAlertaOutorgado: number;
};

export function resumirDemonstrativo(linhas: LinhaDemonstrativo[]): ResumoDemonstrativo {
  const normais = linhas.filter((l) => l.parecer === 'NORMAL');
  const pcts = normais.map((l) => l.pctDebito).filter((p): p is number => p !== null);
  const compat = linhas.filter((l) => l.parecer === 'COMPATIVEL_20');
  return {
    meses: linhas.length,
    semCredito: linhas.filter((l) => l.parecer === 'SEM_CREDITO').length,
    compativeis20: compat.length,
    normais: normais.length,
    primeiroCompativel20: compat[0]?.ym ?? null,
    ultimoNormal: normais.length ? normais[normais.length - 1].ym : null,
    pctMin: pcts.length ? Math.min(...pcts) : null,
    pctMax: pcts.length ? Math.max(...pcts) : null,
    mesesComAlertaOutorgado: linhas.filter((l) => !!l.alerta).length,
  };
}

// ---------------------------------------------------------------------
// Notas de suporte: notas de entrada com número, valor contábil, base,
// ICMS e a descrição dos produtos
// ---------------------------------------------------------------------

export type ModoNotas = 'diesel' | 'credito' | 'todas';

export type NotaSuporte = {
  docId: number;
  ym: string;
  numero: string;
  serie: string;
  codMod: string;
  dtDoc: string | null;
  partNome: string;
  partDoc: string;
  produtos: string;
  vlDoc: number; // valor contábil
  vlBc: number; // soma da base de cálculo dos registros analíticos
  vlIcms: number; // soma do ICMS dos registros analíticos
  litrosDiesel: number;
  icmsDiesel: number; // ICMS dos itens de diesel (C170)
  temDiesel: boolean;
};

export function notasDeSuporte(arquivos: ArquivoEfd[], ym: string | null, modo: ModoNotas): NotaSuporte[] {
  const out: NotaSuporte[] = [];
  for (const a of arquivos) {
    if (ym && a.ym !== ym) continue;
    for (const d of a.docs) {
      if (d.oper !== 'E' || d.duplicadoDe || SIT_SEM_VALOR.has(d.sit)) continue;
      let litros = 0;
      let icmsDiesel = 0;
      let temDiesel = false;
      for (const it of d.itens) {
        if (!ehDiesel(it.descr)) continue;
        temDiesel = true;
        if (unidadeLitro(it.unid)) litros += it.qtd;
        icmsDiesel += it.vlIcms;
      }
      const vlBc = d.linhas.reduce((s, l) => s + l.vlBc, 0);
      const vlIcms = d.linhas.reduce((s, l) => s + l.vlIcms, 0);
      if (modo === 'diesel' && !temDiesel) continue;
      if (modo === 'credito' && vlIcms <= 0) continue;
      const vistos = new Set<string>();
      for (const it of d.itens) if (it.descr) vistos.add(it.descr);
      out.push({
        docId: d.id,
        ym: a.ym,
        numero: d.numero,
        serie: d.serie,
        codMod: d.codMod,
        dtDoc: d.dtDoc,
        partNome: d.partNome,
        partDoc: d.partDoc,
        produtos: [...vistos].join('; '),
        vlDoc: d.vlDoc,
        vlBc: r2(vlBc),
        vlIcms: r2(vlIcms),
        litrosDiesel: Math.round(litros * 1000) / 1000,
        icmsDiesel: r2(icmsDiesel),
        temDiesel,
      });
    }
  }
  return out.sort((x, y) => x.ym.localeCompare(y.ym) || (x.dtDoc ?? '').localeCompare(y.dtDoc ?? '') || x.numero.localeCompare(y.numero));
}

export function totaisNotas(notas: NotaSuporte[]) {
  const t = { notas: notas.length, vlDoc: 0, vlBc: 0, vlIcms: 0, litros: 0, icmsDiesel: 0 };
  for (const n of notas) {
    t.vlDoc += n.vlDoc;
    t.vlBc += n.vlBc;
    t.vlIcms += n.vlIcms;
    t.litros += n.litrosDiesel;
    t.icmsDiesel += n.icmsDiesel;
  }
  return { ...t, vlDoc: r2(t.vlDoc), vlBc: r2(t.vlBc), vlIcms: r2(t.vlIcms), litros: Math.round(t.litros * 1000) / 1000, icmsDiesel: r2(t.icmsDiesel) };
}
