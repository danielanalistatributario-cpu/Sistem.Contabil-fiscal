// Ponte entre o SPED Fiscal (EFD ICMS/IPI) e a "Apuração Fiscal" do módulo Análise e Apuração
// Fiscal: transforma o resumo mensal do SPED nas mesmas estruturas que a tela e o PDF da
// Apuração já usam (tabela por CFOP de Entradas/Saídas e lançamentos do Resumo 001–014).
//
// Sem dependência de banco nem de navegador — roda no servidor (tela/PDF) e no cliente (conferência).
// Nada é estimado: tudo vem dos registros C190/D190 (por CFOP), E110 e E111 do arquivo.

import type { AjusteApuracao, LinhaResumo, ResumoMensal } from './tipos';

export type LinhaCfopSped = { cfop: string; valorContabil: number; baseIcms: number; valorIcms: number; isento: number; baseOutros: number };
export type RegistroSped = { linhas: LinhaCfopSped[]; totais: Omit<LinhaCfopSped, 'cfop'> };

export type CategoriaLancSped = 'OUTROS_DEBITOS' | 'ESTORNO_CREDITOS' | 'OUTROS_CREDITOS' | 'ESTORNO_DEBITOS' | 'DEDUCOES';
export type LancamentoSped = { categoria: CategoriaLancSped; descricao: string; valor: number; ordem: number };

// O que fica guardado na apuração (poucos KB): o resumo mensal + dados da versão do arquivo.
export type OrigemSped = {
  versao: 1;
  resumo: ResumoMensal;
  assinadoEm: string | null; // data/hora da assinatura digital do arquivo (ISO UTC)
  hash: string | null; // início do código da versão no nome do arquivo
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// CST de tributação (2 últimos dígitos): 30 = isenta/não tributada com ST · 40 = isenta · 41 = não tributada.
// Os demais (50 suspensão, 51 diferimento, 60 ST anterior, 90 outras…) caem em "Outras".
const CST_ISENTAS = new Set(['30', '40', '41']);

// Uma linha por CFOP, com as colunas do Livro: Valores Contábeis (VL_OPR), Base de Cálculo,
// ICMS, Isentas/Não tributadas (VL_OPR dos CST 30/40/41) e Outras (VL_OPR − base − isentas).
export function registroPorCfop(linhas: LinhaResumo[]): RegistroSped {
  const mapa = new Map<string, LinhaCfopSped>();
  for (const l of linhas) {
    if (!l.cfop) continue;
    const e = mapa.get(l.cfop) ?? { cfop: l.cfop, valorContabil: 0, baseIcms: 0, valorIcms: 0, isento: 0, baseOutros: 0 };
    const isenta = CST_ISENTAS.has((l.cst || '').slice(-2)) ? l.vlOpr : 0;
    e.valorContabil += l.vlOpr;
    e.baseIcms += l.vlBc;
    e.valorIcms += l.vlIcms;
    e.isento += isenta;
    e.baseOutros += Math.max(0, l.vlOpr - l.vlBc - isenta);
    mapa.set(l.cfop, e);
  }
  const out = [...mapa.values()]
    .map((e) => ({ cfop: e.cfop, valorContabil: r2(e.valorContabil), baseIcms: r2(e.baseIcms), valorIcms: r2(e.valorIcms), isento: r2(e.isento), baseOutros: r2(e.baseOutros) }))
    .sort((a, b) => parseInt(a.cfop, 10) - parseInt(b.cfop, 10) || a.cfop.localeCompare(b.cfop));
  const totais = out.reduce(
    (t, l) => ({ valorContabil: t.valorContabil + l.valorContabil, baseIcms: t.baseIcms + l.baseIcms, valorIcms: t.valorIcms + l.valorIcms, isento: t.isento + l.isento, baseOutros: t.baseOutros + l.baseOutros }),
    { valorContabil: 0, baseIcms: 0, valorIcms: 0, isento: 0, baseOutros: 0 }
  );
  return { linhas: out, totais: { valorContabil: r2(totais.valorContabil), baseIcms: r2(totais.baseIcms), valorIcms: r2(totais.valorIcms), isento: r2(totais.isento), baseOutros: r2(totais.baseOutros) } };
}

const CATEGORIA_PARA_LANC: Record<string, CategoriaLancSped> = {
  'Outros débitos': 'OUTROS_DEBITOS',
  'Estorno de créditos': 'ESTORNO_CREDITOS',
  'Outros créditos': 'OUTROS_CREDITOS',
  'Estorno de débitos': 'ESTORNO_DEBITOS',
  'Deduções do imposto apurado': 'DEDUCOES',
};

function descricaoAjuste(a: AjusteApuracao): string {
  const d = (a.descr || '').trim();
  return d ? `${a.cod} — ${d}` : a.cod;
}

// Lançamentos do Resumo (002/003/006/007/012) a partir dos ajustes E111 do arquivo. O que o E110
// informa a mais do que a soma dos E111 (ajustes por documento — C197/D197) entra numa linha própria,
// para que os totais do Resumo fechem com os campos do E110 sem inventar valor.
export function lancamentosDoSped(resumo: ResumoMensal): LancamentoSped[] {
  const out: LancamentoSped[] = [];
  const ordem: Record<string, number> = {};
  const add = (categoria: CategoriaLancSped, descricao: string, valor: number) => {
    out.push({ categoria, descricao, valor: r2(valor), ordem: ordem[categoria] ?? 0 });
    ordem[categoria] = (ordem[categoria] ?? 0) + 1;
  };
  const e = resumo.apuracao.e110;
  const somaCat: Record<CategoriaLancSped, number> = { OUTROS_DEBITOS: 0, ESTORNO_CREDITOS: 0, OUTROS_CREDITOS: 0, ESTORNO_DEBITOS: 0, DEDUCOES: 0 };
  for (const a of resumo.apuracao.ajustes) {
    const cat = CATEGORIA_PARA_LANC[a.categoria];
    if (!cat) continue; // "Débito especial" não faz parte do Resumo 001–014
    somaCat[cat] += a.valor;
    add(cat, descricaoAjuste(a), a.valor);
  }
  if (e) {
    const restos: [CategoriaLancSped, number, string][] = [
      // campo 3/7 do E110 = ajustes por documento. O leiaute manda o total (campo 4/8) incluí-los, mas há arquivos que
      // informam o total só com os E111 e ainda assim usam os ajustes por documento no saldo — por isso o maior dos dois
      ['OUTROS_DEBITOS', Math.max(e.vlTotAjDebitos - somaCat.OUTROS_DEBITOS, e.vlAjDebitos), 'Ajustes a débito por documento fiscal (C197/D197)'],
      ['OUTROS_CREDITOS', Math.max(e.vlTotAjCreditos - somaCat.OUTROS_CREDITOS, e.vlAjCreditos), 'Ajustes a crédito por documento fiscal (C197/D197)'],
      ['ESTORNO_CREDITOS', e.vlEstornosCred - somaCat.ESTORNO_CREDITOS, 'Estornos de créditos (E110, sem ajuste E111 correspondente)'],
      ['ESTORNO_DEBITOS', e.vlEstornosDeb - somaCat.ESTORNO_DEBITOS, 'Estornos de débitos (E110, sem ajuste E111 correspondente)'],
      ['DEDUCOES', e.vlTotDed - somaCat.DEDUCOES, 'Deduções (E110, sem ajuste E111 correspondente)'],
    ];
    for (const [cat, resto, desc] of restos) if (Math.abs(resto) > 0.009) add(cat, desc, resto);
  }
  return out;
}

export type DadosApuracaoSped = {
  registroEntradas: RegistroSped;
  registroSaidas: RegistroSped;
  // itens 001 e 005 do Resumo: o declarado no E110; sem E110, o ICMS dos registros analíticos
  porSaidasComDebito: number;
  porEntradasComCredito: number;
  saldoCredorAnterior: number;
  temE110: boolean;
};

export function dadosApuracaoSped(origem: OrigemSped): DadosApuracaoSped {
  const r = origem.resumo;
  const registroEntradas = registroPorCfop(r.entradas.linhas);
  const registroSaidas = registroPorCfop(r.saidas.linhas);
  const e = r.apuracao.e110;
  return {
    registroEntradas,
    registroSaidas,
    porSaidasComDebito: e ? e.vlTotDebitos : registroSaidas.totais.valorIcms,
    porEntradasComCredito: e ? e.vlTotCreditos : registroEntradas.totais.valorIcms,
    saldoCredorAnterior: e ? e.vlSldCredorAnt : 0,
    temE110: !!e,
  };
}

export type ItemConferencia = { item: string; calculado: number; declarado: number; ok: boolean };

type ResumoCalculado = { subTotalDebito: number; totalCredito: number; saldoDevedor: number; impostoARecolher: number; saldoCredorTransportar: number };

// Compara o Resumo calculado na tela (001–014, com os lançamentos que estiverem salvos) com o que o
// arquivo declara no E110 — se o usuário editar lançamentos, a diferença aparece aqui.
export function conferirComE110(origem: OrigemSped, calc: ResumoCalculado, porCfop: { saidasIcms: number; entradasIcms: number }): { itens: ItemConferencia[]; avisos: string[] } {
  const e = origem.resumo.apuracao.e110;
  const itens: ItemConferencia[] = [];
  const avisos: string[] = [];
  if (!e) {
    avisos.push('O arquivo não tem a apuração do ICMS (registro E110): os itens 001 e 005 usam o ICMS dos registros analíticos e o saldo anterior fica zerado.');
    return { itens, avisos };
  }
  const ajustado = (item: string, calculado: number, declarado: number) => itens.push({ item, calculado: r2(calculado), declarado: r2(declarado), ok: Math.abs(calculado - declarado) <= 0.009 });
  ajustado('ICMS das saídas por CFOP × débitos do E110 (001)', porCfop.saidasIcms, e.vlTotDebitos);
  ajustado('ICMS das entradas por CFOP × créditos do E110 (005)', porCfop.entradasIcms, e.vlTotCreditos);
  ajustado('Saldo devedor (011) × saldo devedor apurado do E110', calc.saldoDevedor, e.vlSldApurado);
  ajustado('Imposto a recolher (013) × ICMS a recolher do E110', calc.impostoARecolher, e.vlIcmsRecolher);
  ajustado('Saldo credor a transportar (014) × E110', calc.saldoCredorTransportar, e.vlSldCredorTransportar);
  for (const i of itens) if (!i.ok) avisos.push(`${i.item}: calculado ${fmt(i.calculado)}, declarado ${fmt(i.declarado)}.`);
  return { itens, avisos };
}
