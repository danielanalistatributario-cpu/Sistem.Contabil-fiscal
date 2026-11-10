import type { AjusteApuracao, ApuracaoE110, ArquivoEfd, CreditoMes, ResumoMensal } from './tipos';
import { SIT_SEM_VALOR } from './rotulos';

// Demonstrativo "crédito outorgado de 20% × créditos usados na apuração".
//
// Compara, mês a mês, o crédito PRINCIPAL (o que substitui o crédito do combustível:
// créditos de entradas + ajustes E111 "outros créditos", exceto DIFAL) com 20% do débito
// das saídas, e mostra de que é feito o resto (DIFAL, estornos de débito). Tudo vem do
// E110/E111 e dos itens do próprio SPED — nada é estimado. O "parecer" de cada mês é uma
// comparação numérica objetiva; não é conclusão jurídica sobre o regime do contribuinte.

export const PERCENTUAL_OUTORGADO = 0.2;
// "compatível com 20%" = crédito principal entre 19% e 21% do débito (±1 ponto percentual),
// sem nenhum outro crédito no mês. A diferença exata para 20% aparece sempre ao lado.
export const TOLERANCIA_PONTOS = 0.01;
const r2 = (n: number) => Math.round(n * 100) / 100;
const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Combustível = itens de compra de combustível/lubrificante (CFOP 1653 e 2653). É o mesmo
// critério do quadro técnico da empresa; não depende do nome do produto.
export const CFOPS_COMBUSTIVEL = ['1653', '2653'];
export const ehCombustivel = (cfop: string) => CFOPS_COMBUSTIVEL.includes((cfop || '').trim());
export const unidadeLitro = (u: string) => /^l(t|ts|itro|itros)?$/i.test((u || '').trim());

// Códigos de ajuste de SP citados no relatório técnico da empresa (Tabela 5.1.1/SP); servem só
// de informação ao lado do código — a vigência deve ser confirmada na tabela oficial.
export const NATUREZA_CODIGO_SP: Record<string, string> = {
  SP020709: 'Crédito outorgado no transporte (vigente até 30/06/2023)',
  SP020799: 'Outros créditos — preenchido pelo contribuinte',
  SP020710: 'Imposto pago indevidamente por erro de fato',
  SP020718: 'Crédito de DIFAL (uso, consumo ou ativo)',
  SP000207: 'Débito de DIFAL',
  SP000287: 'Saldo devedor do diferencial EC 87/15 transferido para o ICMS normal',
  SP030899: 'Estorno de débito — outras hipóteses',
};

export const CODIGO_OUTORGADO = 'SP020709';
// Ajuste que se apresenta como crédito outorgado: código SP020709 ou "outorgado" na descrição.
export const pareceOutorgado = (a: { cod: string; descr: string }) => a.cod === CODIGO_OUTORGADO || norm(a.descr).includes('outorgad');
// Crédito de DIFAL: código SP020718 ou "DIFAL" na descrição.
export const ehCreditoDifal = (a: { cod: string; descr: string }) => a.cod === 'SP020718' || norm(a.descr).includes('difal');

// Métricas do combustível comprado no mês (entradas válidas, sem duplicados)
export function metricasCombustivel(arq: ArquivoEfd): CreditoMes {
  let docsComCombustivel = 0;
  let litros = 0;
  let vlItem = 0;
  let vlBc = 0;
  let vlIcms = 0;
  let itensOutraUnidade = 0;
  for (const d of arq.docs) {
    if (d.oper !== 'E' || d.duplicadoDe || SIT_SEM_VALOR.has(d.sit)) continue;
    let achou = false;
    for (const it of d.itens) {
      if (!ehCombustivel(it.cfop)) continue;
      achou = true;
      if (unidadeLitro(it.unid)) litros += it.qtd;
      else itensOutraUnidade++;
      vlItem += it.vlItem;
      vlBc += it.vlBc;
      vlIcms += it.vlIcms;
    }
    if (achou) docsComCombustivel++;
  }
  return { docsComCombustivel, litros: Math.round(litros * 1000) / 1000, vlItem: r2(vlItem), vlBc: r2(vlBc), vlIcms: r2(vlIcms), itensOutraUnidade };
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
  creditosEntradas: number; // créditos por entradas (E110 campo 6)
  ajustePrincipal: number; // E111 "outros créditos" que não são DIFAL
  creditoPrincipal: number; // créditos de entradas + ajuste principal
  pctPrincipal: number | null; // crédito principal ÷ débito
  credito20: number; // 20% do débito
  difCredito20: number; // crédito principal − 20% do débito
  creditoDifal: number; // E111 de DIFAL + ajustes a crédito por documento (C197)
  estornosDeb: number; // estornos de débitos (E110)
  creditoUtilizado: number; // créditos de entradas + ajustes a crédito (total) + estornos de débito
  pctUtilizado: number | null;
  outrosDebitos: number;
  estornosCred: number;
  saldoAnterior: number;
  resultado: number; // devedor (+) / credor (−)
  icmsRecolher: number;
  saldoTransportar: number;
  ajustesCredito: AjusteApuracao[];
  ajustesOutros: AjusteApuracao[];
  combustivel: CreditoMes | null;
  icmsPorLitro: number | null; // ICMS destacado nas compras de combustível ÷ litros
  creditoPorLitro: number | null; // crédito principal ÷ litros
  creditoTotalPorLitro: number | null; // crédito utilizado ÷ litros
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
  const base = { ym: r.ym, ajustesCredito, ajustesOutros, combustivel: r.credito ?? null, difalMovimento: !!r.apuracao.difalMovimento };
  if (!e) {
    return {
      ...base,
      temE110: false,
      debito: 0, creditosEntradas: 0, ajustePrincipal: 0, creditoPrincipal: 0, pctPrincipal: null, credito20: 0, difCredito20: 0, creditoDifal: 0,
      estornosDeb: 0, creditoUtilizado: 0, pctUtilizado: null, outrosDebitos: 0, estornosCred: 0, saldoAnterior: 0, resultado: 0, icmsRecolher: 0, saldoTransportar: 0,
      icmsPorLitro: null, creditoPorLitro: null, creditoTotalPorLitro: null,
      parecer: 'SEM_APURACAO',
      parecerTexto: 'O arquivo não tem apuração do ICMS (E110).',
      alerta: null,
    };
  }
  const debito = e.vlTotDebitos;
  const ajusteDifal = r2(ajustesCredito.filter(ehCreditoDifal).reduce((s, a) => s + a.valor, 0));
  const ajustePrincipal = r2(ajustesCredito.filter((a) => !ehCreditoDifal(a)).reduce((s, a) => s + a.valor, 0));
  const creditoPrincipal = r2(e.vlTotCreditos + ajustePrincipal);
  // o que sobra do total de ajustes a crédito (campo 8) depois do ajuste principal: DIFAL por E111 e
  // ajustes por documento (C197/D197) — o campo 8 já os inclui
  const creditoDifal = r2(Math.max(0, e.vlTotAjCreditos - ajustePrincipal));
  const creditoUtilizado = r2(e.vlTotCreditos + e.vlTotAjCreditos + e.vlEstornosDeb);
  const credito20 = r2(debito * PERCENTUAL_OUTORGADO);
  const pctPrincipal = debito > 0 ? creditoPrincipal / debito : null;
  const pctUtilizado = debito > 0 ? creditoUtilizado / debito : null;
  const resultado = r2(e.vlTotDebitos + e.vlTotAjDebitos + e.vlEstornosCred - e.vlTotCreditos - e.vlTotAjCreditos - e.vlEstornosDeb - e.vlSldCredorAnt);
  const cb = base.combustivel;
  const icmsPorLitro = cb && cb.litros > 0 ? r2(cb.vlIcms / cb.litros) : null;
  const creditoPorLitro = cb && cb.litros > 0 && creditoPrincipal > 0 ? r2(creditoPrincipal / cb.litros) : null;
  const creditoTotalPorLitro = cb && cb.litros > 0 && creditoUtilizado > 0 ? r2(creditoUtilizado / cb.litros) : null;

  // composição do crédito do mês, em texto
  const partes: string[] = [];
  if (e.vlTotCreditos > 0) partes.push(`créditos de entradas R$ ${fmt(e.vlTotCreditos)}`);
  if (ajustePrincipal > 0) partes.push(`ajuste de crédito R$ ${fmt(ajustePrincipal)} (${ajustesCredito.filter((a) => !ehCreditoDifal(a)).map((a) => a.cod).join(', ')})`);
  if (creditoDifal > 0) partes.push(`crédito de DIFAL R$ ${fmt(creditoDifal)}`);
  if (e.vlEstornosDeb > 0) partes.push(`estornos de débitos R$ ${fmt(e.vlEstornosDeb)}`);
  const outros: string[] = [];
  if (e.vlEstornosCred > 0) outros.push(`estornos de créditos R$ ${fmt(e.vlEstornosCred)}`);
  if (e.vlTotAjDebitos > 0) outros.push(`ajustes a débito R$ ${fmt(e.vlTotAjDebitos)}`);
  if (base.difalMovimento) outros.push('há movimento de DIFAL (E310)');

  let parecer: ParecerMes;
  let parecerTexto: string;
  const soPrincipalPorAjuste =
    ajustePrincipal > 0 && e.vlTotCreditos === 0 && creditoDifal === 0 && e.vlEstornosDeb === 0 && !base.difalMovimento;
  const proximoDe20 = pctPrincipal !== null && Math.abs(pctPrincipal - PERCENTUAL_OUTORGADO) <= TOLERANCIA_PONTOS;
  if (creditoUtilizado <= 0.004) {
    parecer = 'SEM_CREDITO';
    parecerTexto = `Nenhum crédito no mês${e.vlSldCredorAnt > 0 ? `; o débito foi coberto pelo saldo credor anterior (R$ ${fmt(e.vlSldCredorAnt)})` : ''}.${cb && cb.litros > 0 ? ` No mês houve compra de ${cb.litros.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} litros de combustível (CFOP 1653/2653), com R$ ${fmt(cb.vlIcms)} de ICMS destacado nos itens.` : ''}`;
  } else if (soPrincipalPorAjuste && proximoDe20) {
    parecer = 'COMPATIVEL_20';
    const d = r2(creditoPrincipal - credito20);
    parecerTexto = `Único crédito do mês = ${pct(pctPrincipal!)} do débito (R$ ${fmt(creditoPrincipal)}), lançado por ajuste (${ajustesCredito.map((a) => a.cod).join(', ')}), sem créditos de entradas, DIFAL nem estornos — comportamento de crédito outorgado de 20%.${Math.abs(d) > 0.01 ? ` Diferença para 20% exatos: R$ ${fmt(d)}.` : ' Igual a 20% do débito.'}`;
  } else {
    parecer = 'NORMAL';
    parecerTexto = `Apuração normal: crédito principal de ${pctPrincipal === null ? '—' : pct(pctPrincipal)} do débito (R$ ${fmt(creditoPrincipal)}); no total o mês usou R$ ${fmt(creditoUtilizado)} de crédito${partes.length ? `, composto por ${partes.join('; ')}` : ''}${outros.length ? `. Também no mês: ${outros.join('; ')}` : ''}. Os 20% do débito seriam R$ ${fmt(credito20)}.`;
  }

  // o ajuste se apresenta como "crédito outorgado", mas o valor não é ~20% do débito
  let alerta: string | null = null;
  const outorgados = ajustesCredito.filter(pareceOutorgado);
  if (parecer !== 'COMPATIVEL_20' && outorgados.length > 0) {
    const v = outorgados.reduce((s, a) => s + a.valor, 0);
    alerta = `Ajuste ${[...new Set(outorgados.map((a) => a.cod))].join(', ')} com código/descrição de crédito outorgado, mas de R$ ${fmt(v)} (${debito > 0 ? pct(v / debito) : '—'} do débito), não ${pct(PERCENTUAL_OUTORGADO)}.`;
  }

  return {
    ...base,
    temE110: true,
    debito,
    creditosEntradas: e.vlTotCreditos,
    ajustePrincipal,
    creditoPrincipal,
    pctPrincipal,
    credito20,
    difCredito20: r2(creditoPrincipal - credito20),
    creditoDifal: Math.max(creditoDifal, ajusteDifal),
    estornosDeb: e.vlEstornosDeb,
    creditoUtilizado,
    pctUtilizado,
    outrosDebitos: e.vlTotAjDebitos,
    estornosCred: e.vlEstornosCred,
    saldoAnterior: e.vlSldCredorAnt,
    resultado,
    icmsRecolher: e.vlIcmsRecolher,
    saldoTransportar: e.vlSldCredorTransportar,
    icmsPorLitro,
    creditoPorLitro,
    creditoTotalPorLitro,
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
  const pcts = normais.map((l) => l.pctPrincipal).filter((p): p is number => p !== null && p > 0);
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

export type ModoNotas = 'combustivel' | 'credito' | 'todas';

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
  litros: number; // litros de combustível (itens CFOP 1653/2653 em L/LT)
  icmsCombustivel: number; // ICMS dos itens de combustível (C170)
  temCombustivel: boolean;
};

export function notasDeSuporte(arquivos: ArquivoEfd[], ym: string | null, modo: ModoNotas): NotaSuporte[] {
  const out: NotaSuporte[] = [];
  for (const a of arquivos) {
    if (ym && a.ym !== ym) continue;
    for (const d of a.docs) {
      if (d.oper !== 'E' || d.duplicadoDe || SIT_SEM_VALOR.has(d.sit)) continue;
      let litros = 0;
      let icmsComb = 0;
      let temCombustivel = false;
      for (const it of d.itens) {
        if (!ehCombustivel(it.cfop)) continue;
        temCombustivel = true;
        if (unidadeLitro(it.unid)) litros += it.qtd;
        icmsComb += it.vlIcms;
      }
      const vlBc = d.linhas.reduce((s, l) => s + l.vlBc, 0);
      const vlIcms = d.linhas.reduce((s, l) => s + l.vlIcms, 0);
      if (modo === 'combustivel' && !temCombustivel) continue;
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
        litros: Math.round(litros * 1000) / 1000,
        icmsCombustivel: r2(icmsComb),
        temCombustivel,
      });
    }
  }
  return out.sort((x, y) => x.ym.localeCompare(y.ym) || (x.dtDoc ?? '').localeCompare(y.dtDoc ?? '') || x.numero.localeCompare(y.numero));
}

export function totaisNotas(notas: NotaSuporte[]) {
  const t = { notas: notas.length, vlDoc: 0, vlBc: 0, vlIcms: 0, litros: 0, icmsCombustivel: 0 };
  for (const n of notas) {
    t.vlDoc += n.vlDoc;
    t.vlBc += n.vlBc;
    t.vlIcms += n.vlIcms;
    t.litros += n.litros;
    t.icmsCombustivel += n.icmsCombustivel;
  }
  return { ...t, vlDoc: r2(t.vlDoc), vlBc: r2(t.vlBc), vlIcms: r2(t.vlIcms), litros: Math.round(t.litros * 1000) / 1000, icmsCombustivel: r2(t.icmsCombustivel) };
}
