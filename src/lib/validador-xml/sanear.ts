import type { CampoLeiaute, MarcoCronograma, RegraNorma, NormaExtraida } from './tipos';

// A norma vem do navegador (o PDF é lido lá) — antes de gravar e antes de
// executar no servidor, mantém só os campos esperados, com tipos e
// tamanhos sob controle.

const txt = (v: unknown, max = 2000): string => String(v ?? '').slice(0, max);
const txtOuNull = (v: unknown, max = 2000): string | null => (v === null || v === undefined || v === '' ? null : txt(v, max));
const iso = (v: unknown): string | null => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const intOuNull = (v: unknown): number | null => (Number.isInteger(v) ? (v as number) : null);

export const MAX_REGRAS = 1500;
export const MAX_CAMPOS = 3000;

const TAG = /^[A-Za-z][A-Za-z0-9_]{0,60}$/;

function saneCondicao(c: unknown) {
  const o = (c ?? {}) as Record<string, unknown>;
  const ops = ['=', '<>', 'informado', 'nao_informado', 'informado_em_itens'];
  if (typeof o.tag !== 'string' || !/^[#A-Za-z][A-Za-z0-9_]{0,60}$/.test(o.tag) || !ops.includes(String(o.op))) return null;
  return {
    tag: o.tag,
    op: o.op as '=' | '<>' | 'informado' | 'nao_informado' | 'informado_em_itens',
    ...(Array.isArray(o.valores) ? { valores: o.valores.slice(0, 20).map((x) => txt(x, 40)) } : {}),
  };
}

function saneExec(e: unknown): RegraNorma['exec'] {
  const o = e as Record<string, unknown> | null;
  if (!o || typeof o !== 'object') return null;
  const v = (o.violacao ?? {}) as Record<string, unknown>;
  const condicoes = (Array.isArray(o.condicoes) ? o.condicoes : []).slice(0, 12).map(saneCondicao);
  if (condicoes.some((c) => c === null)) return null;
  let violacao: NonNullable<RegraNorma['exec']>['violacao'] | null = null;
  const tag = (x: unknown) => (typeof x === 'string' && TAG.test(x) ? x : null);
  switch (v.tipo) {
    case 'AUSENTE':
    case 'PRESENTE':
      if (tag(v.alvo)) violacao = { tipo: v.tipo, alvo: v.alvo as string };
      break;
    case 'COND': {
      const c = saneCondicao(v.cond);
      if (c) violacao = { tipo: 'COND', cond: c };
      break;
    }
    case 'DIFERE_PRODUTO':
      if (tag(v.alvo) && tag(v.a) && tag(v.b) && typeof v.tolerancia === 'number' && v.tolerancia >= 0 && v.tolerancia < 100)
        violacao = { tipo: 'DIFERE_PRODUTO', alvo: v.alvo as string, a: v.a as string, b: v.b as string, tolerancia: v.tolerancia };
      break;
    case 'DIFERE_SOMA_ITENS':
      if (tag(v.alvo) && tag(v.parcela) && typeof v.tolerancia === 'number' && v.tolerancia >= 0 && v.tolerancia < 100)
        violacao = { tipo: 'DIFERE_SOMA_ITENS', alvo: v.alvo as string, parcela: v.parcela as string, tolerancia: v.tolerancia };
      break;
  }
  if (!violacao) return null;
  return {
    logica: o.logica === 'OU' ? 'OU' : 'E',
    condicoes: condicoes as NonNullable<ReturnType<typeof saneCondicao>>[],
    violacao,
    escopo: o.escopo === 'ITEM' ? 'ITEM' : 'DOC',
  };
}

export function saneRegra(r: unknown): RegraNorma | null {
  const o = (r ?? {}) as Record<string, unknown>;
  const chave = txt(o.chave, 40);
  if (!/^[A-Za-z0-9.\-]+$/.test(chave)) return null;
  const grav = ['CRITICO', 'ALTO', 'MEDIO', 'BAIXO'].includes(String(o.gravidade)) ? (o.gravidade as RegraNorma['gravidade']) : 'MEDIO';
  const sit = ['ATIVA', 'FUTURA', 'REMOVIDA'].includes(String(o.situacao)) ? (o.situacao as RegraNorma['situacao']) : 'ATIVA';
  return {
    chave,
    campoId: txt(o.campoId, 20),
    modelos: (Array.isArray(o.modelos) ? o.modelos : []).slice(0, 6).map((m) => txt(m, 4)),
    texto: txt(o.texto, 4000),
    observacoes: (Array.isArray(o.observacoes) ? o.observacoes : []).slice(0, 10).map((x) => txt(x, 600)),
    aplicacao: txtOuNull(o.aplicacao, 20),
    rejeicao: txtOuNull(o.rejeicao, 6),
    mensagem: txtOuNull(o.mensagem, 400),
    pagina: intOuNull(o.pagina) ?? 0,
    situacao: sit,
    homologacaoEm: iso(o.homologacaoEm),
    producaoEm: iso(o.producaoEm),
    gravidade: grav,
    exec: saneExec(o.exec),
    descricaoExecutavel: txtOuNull(o.descricaoExecutavel, 600),
    motivoNaoExecutavel: txtOuNull(o.motivoNaoExecutavel, 400),
    habilitada: o.habilitada !== false,
  };
}

export function saneCampo(c: unknown): CampoLeiaute | null {
  const o = (c ?? {}) as Record<string, unknown>;
  const tag = txt(o.tag, 60);
  if (!tag || !(TAG.test(tag) || tag === '-x-')) return null;
  return {
    seq: txt(o.seq, 20),
    id: txt(o.id, 20),
    tag,
    descricao: txt(o.descricao, 400),
    ele: txt(o.ele, 4),
    pai: txtOuNull(o.pai, 20),
    tipo: ['N', 'C', 'D'].includes(String(o.tipo)) ? (o.tipo as string) : null,
    ocorMin: intOuNull(o.ocorMin),
    ocorMax: intOuNull(o.ocorMax),
    tamanho: typeof o.tamanho === 'string' && /^[\dv-]{1,20}$/.test(o.tamanho) ? o.tamanho : null,
    observacao: txtOuNull(o.observacao, 600),
    grupo: o.grupo === true,
    pagina: intOuNull(o.pagina) ?? 0,
  };
}

function saneMarco(m: unknown): MarcoCronograma {
  const o = (m ?? {}) as Record<string, unknown>;
  const lista = (v: unknown, max = 80) => (Array.isArray(v) ? v.slice(0, max).map((x) => txt(x, 40)) : []);
  return {
    versao: txt(o.versao, 12),
    resumo: (Array.isArray(o.resumo) ? o.resumo : []).slice(0, 20).map((x) => txt(x, 300)),
    regrasIncluidas: lista(o.regrasIncluidas),
    regrasAlteradas: lista(o.regrasAlteradas),
    regrasRemovidas: lista(o.regrasRemovidas),
    homologacao: iso(o.homologacao),
    producao: iso(o.producao),
  };
}

export function saneNorma(n: unknown): NormaExtraida | { erro: string } {
  const o = (n ?? {}) as Record<string, unknown>;
  const numero = txt(o.numero, 40).trim();
  const versao = txt(o.versao, 12).trim();
  if (!numero || !versao) return { erro: 'Informe o número e a versão da Nota Técnica.' };
  if (!Array.isArray(o.regras) || !Array.isArray(o.campos)) return { erro: 'Norma sem regras/campos.' };
  if (o.regras.length > MAX_REGRAS || o.campos.length > MAX_CAMPOS) return { erro: 'Norma grande demais.' };
  const regras = o.regras.map(saneRegra).filter((r): r is RegraNorma => !!r);
  const campos = o.campos.map(saneCampo).filter((c): c is CampoLeiaute => !!c);
  return {
    tipo: o.tipo === 'OUTRA' ? 'OUTRA' : 'NT',
    numero,
    versao,
    titulo: txt(o.titulo, 300),
    documentos: (Array.isArray(o.documentos) ? o.documentos : []).slice(0, 6).map((d) => txt(d, 12)),
    modelos: (Array.isArray(o.modelos) ? o.modelos : []).slice(0, 6).map((m) => txt(m, 4)),
    homologacaoEm: iso(o.homologacaoEm),
    producaoEm: iso(o.producaoEm),
    marcos: (Array.isArray(o.marcos) ? o.marcos : []).slice(0, 30).map(saneMarco),
    campos,
    regras,
    avisos: [],
  };
}
