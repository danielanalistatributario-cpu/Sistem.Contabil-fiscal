import type { DocEfd, Oper } from './tipos';

// Lista de documentos "no estilo do PVA": uma linha por registro analítico
// (CST × CFOP × alíquota) do documento, com os dados do documento ao lado.
// Os valores do DOCUMENTO (produtos, frete, seguro, despesas, desconto e valor
// total) saem uma vez só por nota — na primeira linha visível — para os totais
// não contarem o mesmo documento duas vezes. Nada é rateado.

export type LinhaDoc = {
  docId: number;
  ym: string;
  oper: Oper;
  sit: string;
  codMod: string;
  serie: string;
  numero: string;
  chave: string;
  dtDoc: string | null;
  dtES: string | null;
  partNome: string;
  partDoc: string;
  partUf: string;
  cfop: string;
  cst: string;
  aliq: number | null;
  vlOpr: number;
  vlBc: number;
  vlIcms: number;
  vlBcSt: number;
  vlIcmsSt: number;
  vlRedBc: number;
  vlIpi: number;
  // do documento — só na primeira linha dele
  primeira: boolean;
  vlMerc: number;
  vlFrt: number;
  vlSeg: number;
  vlOutDa: number;
  vlDesc: number;
  vlDoc: number;
  // produtos (C170) do CST/CFOP/alíquota desta linha, sem repetir — vazio em CT-e
  produtos: string;
};

const LIMITE_CELULA = 30000; // o Excel aceita no máximo 32.767 caracteres por célula

// Junta os nomes dos produtos sem repetir, na ordem em que aparecem na nota.
function juntarProdutos(itens: { descr: string }[]): string {
  const vistos = new Set<string>();
  for (const it of itens) if (it.descr) vistos.add(it.descr);
  const txt = [...vistos].join('; ');
  return txt.length > LIMITE_CELULA ? txt.slice(0, LIMITE_CELULA) + '…' : txt;
}

export function linhasDeDocumentos(docs: DocEfd[], oper: Oper): LinhaDoc[] {
  const out: LinhaDoc[] = [];
  for (const d of docs) {
    if (d.oper !== oper || d.duplicadoDe) continue;
    const base = {
      docId: d.id,
      ym: d.ym,
      oper: d.oper,
      sit: d.sit,
      codMod: d.codMod,
      serie: d.serie,
      numero: d.numero,
      chave: d.chave,
      dtDoc: d.dtDoc,
      dtES: d.dtES,
      partNome: d.partNome,
      partDoc: d.partDoc,
      partUf: d.partUf,
    };
    const doc = { vlMerc: d.vlMerc, vlFrt: d.vlFrt, vlSeg: d.vlSeg, vlOutDa: d.vlOutDa, vlDesc: d.vlDesc, vlDoc: d.vlDoc };
    if (d.linhas.length === 0) {
      out.push({ ...base, cfop: '', cst: '', aliq: null, vlOpr: 0, vlBc: 0, vlIcms: 0, vlBcSt: 0, vlIcmsSt: 0, vlRedBc: 0, vlIpi: 0, primeira: true, ...doc, produtos: juntarProdutos(d.itens) });
      continue;
    }
    // O C190 é o agrupamento dos itens (C170) por CST + CFOP + alíquota: cada item
    // vai para a linha do seu grupo. Item sem linha correspondente (arquivo fora
    // do padrão) vai para a primeira linha, para o produto não sumir.
    const chave = (cst: string, cfop: string, aliq: number) => `${cst}|${cfop}|${Math.round(aliq * 10000)}`;
    const porLinha = d.linhas.map(() => [] as typeof d.itens);
    const indice = new Map<string, number>();
    d.linhas.forEach((l, i) => {
      const k = chave(l.cst, l.cfop, l.aliq);
      if (!indice.has(k)) indice.set(k, i);
    });
    for (const it of d.itens) porLinha[indice.get(chave(it.cst, it.cfop, it.aliq)) ?? 0].push(it);
    d.linhas.forEach((l, i) => out.push({ ...base, cfop: l.cfop, cst: l.cst, aliq: l.aliq, vlOpr: l.vlOpr, vlBc: l.vlBc, vlIcms: l.vlIcms, vlBcSt: l.vlBcSt, vlIcmsSt: l.vlIcmsSt, vlRedBc: l.vlRedBc, vlIpi: l.vlIpi, primeira: i === 0, ...doc, produtos: juntarProdutos(porLinha[i]) }));
  }
  return out;
}

export type FiltroDocs = {
  ym?: string; // AAAAMM ou vazio = todos
  cfop?: string;
  cst?: string;
  sit?: string;
  modelo?: string;
  participante?: string; // parte do nome ou do CNPJ/CPF
  numero?: string;
  produto?: string; // parte do nome do produto
};

const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function filtrarLinhas(linhas: LinhaDoc[], f: FiltroDocs): LinhaDoc[] {
  const part = norm(f.participante ?? '').trim();
  const partDig = (f.participante ?? '').replace(/\D/g, '');
  const numero = (f.numero ?? '').trim();
  const prod = norm(f.produto ?? '').trim();
  const filtradas = linhas.filter((l) => {
    if (f.ym && l.ym !== f.ym) return false;
    if (f.cfop && l.cfop !== f.cfop) return false;
    if (f.cst && l.cst !== f.cst) return false;
    if (f.sit && l.sit !== f.sit) return false;
    if (f.modelo && l.codMod !== f.modelo) return false;
    if (part && !(norm(l.partNome).includes(part) || (partDig.length >= 3 && l.partDoc.replace(/\D/g, '').includes(partDig)))) return false;
    if (numero && !l.numero.replace(/^0+/, '').includes(numero.replace(/^0+/, ''))) return false;
    if (prod && !norm(l.produtos).includes(prod)) return false;
    return true;
  });
  // os valores do documento voltam a aparecer uma vez só (na 1ª linha que sobrou)
  const vistos = new Set<number>();
  return filtradas.map((l) => {
    const primeira = !vistos.has(l.docId);
    vistos.add(l.docId);
    return l.primeira === primeira ? l : { ...l, primeira };
  });
}

export type TotaisDocs = { docs: number; vlOpr: number; vlBc: number; vlIcms: number; vlBcSt: number; vlIcmsSt: number; vlIpi: number; vlMerc: number; vlFrt: number; vlSeg: number; vlOutDa: number; vlDesc: number; vlDoc: number };

export function totaisDeLinhas(linhas: LinhaDoc[]): TotaisDocs {
  const t: TotaisDocs = { docs: 0, vlOpr: 0, vlBc: 0, vlIcms: 0, vlBcSt: 0, vlIcmsSt: 0, vlIpi: 0, vlMerc: 0, vlFrt: 0, vlSeg: 0, vlOutDa: 0, vlDesc: 0, vlDoc: 0 };
  for (const l of linhas) {
    t.vlOpr += l.vlOpr;
    t.vlBc += l.vlBc;
    t.vlIcms += l.vlIcms;
    t.vlBcSt += l.vlBcSt;
    t.vlIcmsSt += l.vlIcmsSt;
    t.vlIpi += l.vlIpi;
    if (l.primeira) {
      t.docs++;
      t.vlMerc += l.vlMerc;
      t.vlFrt += l.vlFrt;
      t.vlSeg += l.vlSeg;
      t.vlOutDa += l.vlOutDa;
      t.vlDesc += l.vlDesc;
      t.vlDoc += l.vlDoc;
    }
  }
  for (const k of Object.keys(t) as (keyof TotaisDocs)[]) if (k !== 'docs') t[k] = Math.round(t[k] * 100) / 100;
  return t;
}
