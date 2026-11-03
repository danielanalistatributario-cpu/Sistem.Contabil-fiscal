import type {
  CampoLeiaute,
  Condicao,
  ContagensValidacao,
  Gravidade,
  Ocorrencia,
  RegraExec,
  RegraNorma,
  ResultadoValidacao,
  ResumoRegra,
  SituacaoOcorrencia,
} from './tipos';
import { PESO_GRAVIDADE } from './tipos';
import { acharPrimeiro, acharTodos, caminhoDe, filho, parseXml, textoDe, type NoXml } from './xml';
import { descreverRegraExec } from './interpretarRegra';

// Motor de validação: confere UM xml de NF-e/NFC-e contra as regras
// cadastradas de uma Nota Técnica. Só executa o que foi reconhecido na
// extração (RegraNorma.exec) e as conferências de formato/tamanho/ocorrência
// do leiaute da própria NT. O que não dá pra executar vira
// NAO_VALIDAVEL — nunca é "aprovado" nem "reprovado" por suposição.

export type NormaParaValidar = {
  numero: string;
  versao: string;
  modelos: string[];
  homologacaoEm: string | null;
  producaoEm: string | null;
  campos: CampoLeiaute[];
  regras: RegraNorma[];
};

export type OpcoesValidacao = {
  // true = confere todas as regras como se já estivessem em vigor
  // (útil pra homologar um XML antes da data de produção da NT).
  ignorarVigencia: boolean;
};

const MSG_NAO_VALIDAVEL = 'Não foi possível validar este item automaticamente com base no documento normativo cadastrado.';

// Identificadores de grupo do leiaute da NF-e (MOC) usados só pra montar o
// caminho esperado de uma tag que está faltando.
const GRUPOS_CONHECIDOS: Record<string, { tag: string; pai: string | null }> = {
  A01: { tag: 'infNFe', pai: null },
  B01: { tag: 'ide', pai: 'A01' },
  C01: { tag: 'emit', pai: 'A01' },
  E01: { tag: 'dest', pai: 'A01' },
  H01: { tag: 'det', pai: 'A01' },
  I01: { tag: 'prod', pai: 'H01' },
  M01: { tag: 'imposto', pai: 'H01' },
  N01: { tag: 'ICMS', pai: 'M01' },
  TOTAL: { tag: 'total', pai: 'A01' },
  W01: { tag: 'ICMSTot', pai: 'TOTAL' },
};

function cadeiaDeTags(tag: string, campos: CampoLeiaute[]): string[] {
  const cadeia = [tag];
  const campo = campos.find((c) => c.tag === tag);
  let pai = campo?.pai ?? null;
  for (let guarda = 0; pai && guarda < 12; guarda++) {
    const c = campos.find((x) => x.id === pai);
    if (c) {
      if (c.tag !== '-x-') cadeia.unshift(c.tag);
      pai = c.pai;
      continue;
    }
    const g = GRUPOS_CONHECIDOS[pai];
    if (!g) break;
    cadeia.unshift(g.tag);
    pai = g.pai;
  }
  return cadeia;
}

function caminhoEsperado(tag: string, campos: CampoLeiaute[], det: NoXml | null, prefixoInfNFe: string): string {
  let cadeia = cadeiaDeTags(tag, campos);
  const i = cadeia.indexOf('infNFe');
  cadeia = i >= 0 ? cadeia.slice(i + 1) : cadeia.length === 1 ? ['…', ...cadeia] : cadeia;
  const nItem = det?.attrs.nItem;
  if (det) {
    if (cadeia.includes('det')) cadeia = cadeia.map((t) => (t === 'det' ? `det[${nItem}]` : t));
    else cadeia = [`det[${nItem}]`, ...cadeia];
  }
  return [prefixoInfNFe, ...cadeia].join(' > ');
}

function tagPai(campo: CampoLeiaute, campos: CampoLeiaute[]): string | null {
  const cadeia = cadeiaDeTags(campo.tag, campos);
  return cadeia.length >= 2 ? cadeia[cadeia.length - 2] : null;
}

const informado = (no: NoXml | null): boolean => !!no && (no.filhos.length > 0 || no.texto !== '');

type Ctx = { raiz: NoXml; det: NoXml | null; mod: string; dets: NoXml[]; prefixo: string };

function achar(ctx: Ctx, tag: string, soEscopo: boolean): NoXml | null {
  if (ctx.det) {
    const r = acharPrimeiro(ctx.det, tag);
    if (r || soEscopo) return r;
  }
  return acharPrimeiro(ctx.raiz, tag);
}

function avaliarCond(c: Condicao, ctx: Ctx): boolean {
  if (c.tag === '#modelo') return (c.valores ?? []).includes(ctx.mod);
  switch (c.op) {
    case 'informado':
      return informado(achar(ctx, c.tag, false));
    case 'nao_informado':
      return !informado(achar(ctx, c.tag, false));
    case 'informado_em_itens':
      return ctx.dets.some((d) => informado(acharPrimeiro(d, c.tag)));
    case '=': {
      const v = textoDe(achar(ctx, c.tag, false));
      return v !== null && (c.valores ?? []).includes(v);
    }
    case '<>': {
      const v = textoDe(achar(ctx, c.tag, false));
      return v === null || !(c.valores ?? []).includes(v);
    }
  }
}

const numeroDe = (no: NoXml | null): number | null => {
  const t = textoDe(no);
  if (t === null) return null;
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

type Instancia =
  | { r: 'OK'; nItem: number | null }
  | { r: 'NAO_APLICA' }
  | { r: 'NAO_CALCULAVEL'; nItem: number | null; motivo: string }
  | {
      r: 'VIOLA';
      nItem: number | null;
      tipo: 'AUSENTE' | 'INDEVIDO' | 'DIVERGENTE';
      item: string;
      localizacao: string;
      valorEncontrado: string | null;
      valorEsperado: string | null;
      orientacao: string;
    };

function avaliarExec(exec: RegraExec, ctx: Ctx, campos: CampoLeiaute[], tolDefault: number): Instancia {
  const nItem = ctx.det ? parseInt(ctx.det.attrs.nItem ?? '', 10) || null : null;
  const ativas = exec.condicoes.map((c) => avaliarCond(c, ctx));
  const condOk = exec.condicoes.length === 0 ? true : exec.logica === 'OU' ? ativas.some(Boolean) : ativas.every(Boolean);
  if (!condOk) return { r: 'NAO_APLICA' };

  const v = exec.violacao;
  switch (v.tipo) {
    case 'AUSENTE': {
      const no = achar(ctx, v.alvo, true);
      if (informado(no)) return { r: 'OK', nItem };
      const esperado = caminhoEsperado(v.alvo, campos, ctx.det, ctx.prefixo);
      return {
        r: 'VIOLA',
        nItem,
        tipo: 'AUSENTE',
        item: v.alvo,
        localizacao: esperado,
        valorEncontrado: 'Não informado',
        valorEsperado: 'Campo informado',
        orientacao: `Incluir a tag <${v.alvo}> em ${esperado}.`,
      };
    }
    case 'PRESENTE': {
      const no = achar(ctx, v.alvo, true);
      if (!informado(no)) return { r: 'OK', nItem };
      return {
        r: 'VIOLA',
        nItem,
        tipo: 'INDEVIDO',
        item: v.alvo,
        localizacao: caminhoDe(no!),
        valorEncontrado: textoDe(no) ?? '(grupo informado)',
        valorEsperado: 'Não informar',
        orientacao: `Remover a tag <${v.alvo}> deste documento, ou revisar as condições que a tornam indevida (${exec.condicoes.map((c) => c.tag + ' ' + c.op + (c.valores ? ' ' + c.valores.join('/') : '')).join('; ') || 'ver regra'}). Verificar a atualização do sistema emissor.`,
      };
    }
    case 'COND': {
      if (!avaliarCond(v.cond, ctx)) return { r: 'OK', nItem };
      const no = achar(ctx, v.cond.tag, false);
      const achado = textoDe(no) ?? 'Não informado';
      return {
        r: 'VIOLA',
        nItem,
        tipo: 'DIVERGENTE',
        item: v.cond.tag,
        localizacao: no ? caminhoDe(no) : caminhoEsperado(v.cond.tag, campos, ctx.det, ctx.prefixo),
        valorEncontrado: achado,
        valorEsperado: v.cond.op === '<>' ? `Um destes: ${(v.cond.valores ?? []).join(', ')}` : `Diferente de: ${(v.cond.valores ?? []).join(', ')}`,
        orientacao: `Ajustar o preenchimento de <${v.cond.tag}> (encontrado: ${achado}) conforme a regra.`,
      };
    }
    case 'DIFERE_PRODUTO': {
      const alvo = achar(ctx, v.alvo, true);
      if (!informado(alvo)) return { r: 'NAO_APLICA' };
      const a = achar(ctx, v.a, true);
      const b = achar(ctx, v.b, true);
      const [na, nb, nv] = [numeroDe(a), numeroDe(b), numeroDe(alvo)];
      if (na === null || nb === null || nv === null) {
        const falta = [!a || na === null ? v.a : null, !b || nb === null ? v.b : null, nv === null ? v.alvo : null].filter(Boolean).join(', ');
        return { r: 'NAO_CALCULAVEL', nItem, motivo: `Não foi possível calcular: ${falta} ausente ou não numérico.` };
      }
      const esperado = na * nb;
      const tol = v.tolerancia ?? tolDefault;
      if (Math.abs(nv - esperado) <= tol + 1e-9) return { r: 'OK', nItem };
      return {
        r: 'VIOLA',
        nItem,
        tipo: 'DIVERGENTE',
        item: v.alvo,
        localizacao: caminhoDe(alvo!),
        valorEncontrado: textoDe(alvo),
        valorEsperado: `${esperado.toFixed(2)} (${v.a} ${na} × ${v.b} ${nb}; tolerância ${tol})`,
        orientacao: `Ajustar <${v.alvo}> para ${esperado.toFixed(2)} ou corrigir <${v.a}>/<${v.b}>.`,
      };
    }
    case 'DIFERE_SOMA_ITENS': {
      const alvo = achar(ctx, v.alvo, true);
      if (!informado(alvo)) return { r: 'NAO_APLICA' };
      const nv = numeroDe(alvo);
      if (nv === null) return { r: 'NAO_CALCULAVEL', nItem, motivo: `Não foi possível calcular: <${v.alvo}> não numérico.` };
      let somaCent = 0;
      for (const d of ctx.dets) {
        const n = numeroDe(acharPrimeiro(d, v.parcela));
        if (n !== null) somaCent += Math.round(n * 100);
      }
      const diff = Math.abs(Math.round(nv * 100) - somaCent) / 100;
      if (diff <= v.tolerancia + 1e-9) return { r: 'OK', nItem };
      return {
        r: 'VIOLA',
        nItem,
        tipo: 'DIVERGENTE',
        item: v.alvo,
        localizacao: caminhoDe(alvo!),
        valorEncontrado: textoDe(alvo),
        valorEsperado: `${(somaCent / 100).toFixed(2)} (soma de ${v.parcela} dos ${ctx.dets.length} itens)`,
        orientacao: `Ajustar <${v.alvo}> para ${(somaCent / 100).toFixed(2)} ou corrigir <${v.parcela}> nos itens.`,
      };
    }
  }
}

// Formato/tamanho do leiaute (Tipo + Tam.) de um valor já lido do XML.
function conferirFormato(c: CampoLeiaute, valor: string): string | null {
  if (!c.tipo || !c.tamanho) return null;
  const t = c.tamanho;
  if (c.tipo === 'N') {
    const dec = /^(\d+)v(\d+)(?:-(\d+))?$/.exec(t);
    if (dec) {
      const inteiros = parseInt(dec[1], 10);
      const dMin = parseInt(dec[2], 10);
      const dMax = dec[3] ? parseInt(dec[3], 10) : dMin;
      const re = dMin === dMax && dMin > 0 ? new RegExp(`^\\d{1,${inteiros}}(\\.\\d{${dMin}})?$`) : new RegExp(`^\\d{1,${inteiros}}(\\.\\d{1,${Math.max(dMax, 1)}})?$`);
      return re.test(valor) ? null : `valor numérico no formato ${t} (até ${inteiros} dígitos inteiros${dMax > 0 ? `, ${dMin === dMax ? dMin : `${dMin} a ${dMax}`} casas decimais` : ''})`;
    }
    const faixa = /^(\d+)-(\d+)$/.exec(t);
    if (faixa) return new RegExp(`^\\d{${faixa[1]},${faixa[2]}}$`).test(valor) ? null : `numérico com ${faixa[1]} a ${faixa[2]} dígitos`;
    if (/^\d+$/.test(t)) return new RegExp(`^\\d{${t}}$`).test(valor) ? null : `numérico com exatamente ${t} dígitos`;
    return null;
  }
  if (c.tipo === 'C') {
    const faixa = /^(\d+)-(\d+)$/.exec(t);
    if (faixa) return valor.length >= +faixa[1] && valor.length <= +faixa[2] ? null : `texto com ${faixa[1]} a ${faixa[2]} caracteres`;
    if (/^\d+$/.test(t)) return valor.length === +t ? null : `texto com exatamente ${t} caracteres`;
  }
  return null;
}

function dataIso(s: string | null): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s ?? '');
  return m ? m[1] : null;
}

type Acumulador = { avaliadas: number; falhas: number; gravidade: Gravidade };

export function validarXml(norma: NormaParaValidar, arquivo: string, xmlTexto: string, opcoes: OpcoesValidacao): ResultadoValidacao {
  const vazio: ContagensValidacao = { conformes: 0, alertas: 0, divergencias: 0, ausentes: 0, indevidos: 0, naoValidaveis: 0, regrasNaoAplicaveis: 0 };
  const erro = (msg: string): ResultadoValidacao => ({
    arquivo,
    erro: msg,
    chave: null,
    numero: null,
    serie: null,
    modelo: null,
    emissao: null,
    tpAmb: null,
    emitente: { doc: null, nome: null },
    destinatario: { doc: null, nome: null },
    contagens: vazio,
    conformidade: null,
    veredito: 'ERRO',
    ocorrencias: [],
    regras: [],
  });

  let raiz: NoXml;
  try {
    raiz = parseXml(xmlTexto);
  } catch (e) {
    return erro(`XML inválido: ${e instanceof Error ? e.message : 'não foi possível ler o arquivo'}`);
  }
  const infNFe = raiz.nome === 'infNFe' ? raiz : acharPrimeiro(raiz, 'infNFe');
  if (!infNFe) return erro('O arquivo não é uma NF-e/NFC-e (elemento <infNFe> não encontrado).');

  const ide = filho(infNFe, 'ide');
  const emit = filho(infNFe, 'emit');
  const dest = filho(infNFe, 'dest');
  const mod = textoDe(filho(ide, 'mod')) ?? '';
  const tpAmb = textoDe(filho(ide, 'tpAmb'));
  const emissao = dataIso(textoDe(filho(ide, 'dhEmi')) ?? textoDe(filho(ide, 'dEmi')));
  const chaveId = (infNFe.attrs.Id ?? '').replace(/^NFe/, '');
  const chave = chaveId || textoDe(acharPrimeiro(raiz, 'chNFe')) || null;
  const dets = infNFe.filhos.filter((f) => f.nome === 'det');

  const base = {
    arquivo,
    erro: null,
    chave,
    numero: textoDe(filho(ide, 'nNF')),
    serie: textoDe(filho(ide, 'serie')),
    modelo: mod || null,
    emissao,
    tpAmb,
    emitente: { doc: textoDe(filho(emit, 'CNPJ')) ?? textoDe(filho(emit, 'CPF')), nome: textoDe(filho(emit, 'xNome')) },
    destinatario: {
      doc: textoDe(filho(dest, 'CNPJ')) ?? textoDe(filho(dest, 'CPF')) ?? textoDe(filho(dest, 'idEstrangeiro')),
      nome: textoDe(filho(dest, 'xNome')),
    },
  };

  if (norma.modelos.length > 0 && mod && !norma.modelos.includes(mod)) {
    return { ...erro(`Esta norma vale para o(s) modelo(s) ${norma.modelos.join('/')}; o XML é modelo ${mod}.`), ...base, erro: `Esta norma vale para o(s) modelo(s) ${norma.modelos.join('/')}; o XML é modelo ${mod}.`, veredito: 'ERRO' as const };
  }

  const contagens: ContagensValidacao = { ...vazio };
  const ocorrencias: Ocorrencia[] = [];
  const acum = new Map<string, Acumulador>();
  const ctxBase = { raiz: infNFe, mod, dets, prefixo: caminhoDe(infNFe) };
  const ref = (r: RegraNorma) => `${norma.numero} v${norma.versao} — regra ${r.chave}, p. ${r.pagina}`;

  const vigenteEm = (homolog: string | null, prod: string | null): boolean => {
    if (opcoes.ignorarVigencia) return true;
    const inicio = tpAmb === '2' ? homolog ?? prod : prod ?? homolog;
    if (!inicio || !emissao) return true;
    return emissao >= inicio;
  };
  const rotuloInicio = (homolog: string | null, prod: string | null) => {
    const f = (d: string | null) => (d ? d.split('-').reverse().join('/') : null);
    return tpAmb === '2' ? `homologação a partir de ${f(homolog ?? prod)}` : `produção a partir de ${f(prod ?? homolog)}`;
  };

  const registrar = (chaveRegra: string, gravidade: Gravidade, ok: boolean, conta: boolean) => {
    if (!conta) return;
    const a = acum.get(chaveRegra) ?? { avaliadas: 0, falhas: 0, gravidade };
    a.avaliadas++;
    if (!ok) a.falhas++;
    acum.set(chaveRegra, a);
  };

  // ---------------- regras de validação da NT ----------------
  for (const r of norma.regras) {
    if (!r.habilitada || r.situacao === 'REMOVIDA') continue;
    if (r.modelos.length > 0 && mod && !r.modelos.includes(mod)) continue;

    if (!r.exec) {
      contagens.naoValidaveis++;
      ocorrencias.push({
        item: r.campoId,
        nItem: null,
        localizacao: '—',
        regra: r.texto.replace(/\s+/g, ' ').slice(0, 400),
        chaveRegra: r.chave,
        referencia: ref(r),
        rejeicao: r.rejeicao,
        valorEncontrado: null,
        valorEsperado: null,
        situacao: 'NAO_VALIDAVEL',
        situacaoSeVigente: null,
        gravidade: r.gravidade,
        orientacao: `${MSG_NAO_VALIDAVEL}${r.motivoNaoExecutavel ? ` (${r.motivoNaoExecutavel})` : ''} Conferir manualmente na NT.`,
      });
      continue;
    }

    if (r.situacao === 'FUTURA' && !opcoes.ignorarVigencia) {
      contagens.alertas++;
      ocorrencias.push({
        item: r.campoId,
        nItem: null,
        localizacao: '—',
        regra: r.descricaoExecutavel ?? r.texto,
        chaveRegra: r.chave,
        referencia: ref(r),
        rejeicao: r.rejeicao,
        valorEncontrado: null,
        valorEsperado: null,
        situacao: 'NAO_EXIGIVEL',
        situacaoSeVigente: null,
        gravidade: 'BAIXO',
        orientacao: 'Regra de implementação futura, sem data de vigência definida na NT — não conferida. Marque "ignorar vigência" para conferir mesmo assim.',
      });
      continue;
    }

    const vigente = vigenteEm(r.homologacaoEm, r.producaoEm);
    const instancias: Instancia[] = [];
    if (r.exec.escopo === 'ITEM') {
      for (const det of dets) instancias.push(avaliarExec(r.exec, { ...ctxBase, det }, norma.campos, 0));
    } else instancias.push(avaliarExec(r.exec, { ...ctxBase, det: null }, norma.campos, 0));

    if (instancias.every((i) => i.r === 'NAO_APLICA')) {
      contagens.regrasNaoAplicaveis++;
      continue;
    }

    for (const inst of instancias) {
      if (inst.r === 'NAO_APLICA') continue;
      if (inst.r === 'OK') {
        contagens.conformes++;
        registrar(r.chave, r.gravidade, true, true);
        continue;
      }
      if (inst.r === 'NAO_CALCULAVEL') {
        contagens.naoValidaveis++;
        ocorrencias.push({
          item: r.campoId,
          nItem: inst.nItem,
          localizacao: '—',
          regra: r.descricaoExecutavel ?? r.texto,
          chaveRegra: r.chave,
          referencia: ref(r),
          rejeicao: r.rejeicao,
          valorEncontrado: null,
          valorEsperado: null,
          situacao: 'NAO_VALIDAVEL',
          situacaoSeVigente: null,
          gravidade: r.gravidade,
          orientacao: `${MSG_NAO_VALIDAVEL} ${inst.motivo}`,
        });
        continue;
      }
      // violação
      const situacaoReal: SituacaoOcorrencia = inst.tipo === 'AUSENTE' ? 'AUSENTE' : inst.tipo === 'INDEVIDO' ? 'INDEVIDO' : 'DIVERGENTE';
      if (!vigente) {
        contagens.alertas++;
        ocorrencias.push({
          item: inst.item,
          nItem: inst.nItem,
          localizacao: inst.localizacao,
          regra: r.descricaoExecutavel ?? r.texto,
          chaveRegra: r.chave,
          referencia: ref(r),
          rejeicao: r.rejeicao,
          valorEncontrado: inst.valorEncontrado,
          valorEsperado: inst.valorEsperado,
          situacao: 'NAO_EXIGIVEL',
          situacaoSeVigente: inst.tipo,
          gravidade: 'BAIXO',
          orientacao: `Ainda não exigível para este XML (emitido em ${emissao ? emissao.split('-').reverse().join('/') : 'data não informada'}; vigência: ${rotuloInicio(r.homologacaoEm, r.producaoEm)}). Passará a ser ${situacaoReal.toLowerCase()} depois dessa data. ${inst.orientacao}`,
        });
        continue;
      }
      if (inst.tipo === 'AUSENTE') contagens.ausentes++;
      else if (inst.tipo === 'INDEVIDO') contagens.indevidos++;
      else contagens.divergencias++;
      registrar(r.chave, r.gravidade, false, true);
      ocorrencias.push({
        item: inst.item,
        nItem: inst.nItem,
        localizacao: inst.localizacao,
        regra: r.descricaoExecutavel ?? r.texto,
        chaveRegra: r.chave,
        referencia: ref(r),
        rejeicao: r.rejeicao,
        valorEncontrado: inst.valorEncontrado,
        valorEsperado: inst.valorEsperado,
        situacao: situacaoReal,
        situacaoSeVigente: null,
        gravidade: r.gravidade,
        orientacao: `${inst.orientacao}${r.rejeicao ? ` Sem isso a Sefaz rejeita (rejeição ${r.rejeicao}${r.mensagem ? `: ${r.mensagem.replace(/\s*\[nItem:\s*999\]/, '')}` : ''}).` : ''}`,
      });
    }
  }

  // ---------------- leiaute (formato, tamanho, ocorrência) ----------------
  const vigenteLeiaute = vigenteEm(norma.homologacaoEm, norma.producaoEm);
  for (const c of norma.campos) {
    if (c.grupo || c.tag === '-x-' || !c.tipo) continue;
    const paiEsperado = tagPai(c, norma.campos);
    const elementos = acharTodos(infNFe, c.tag).filter((e) => !paiEsperado || e.pai?.nome === paiEsperado);
    const chaveLeiaute = `leiaute:${c.id}`;
    const refLeiaute = `${norma.numero} v${norma.versao} — leiaute item ${c.seq} (${c.id} ${c.tag}), p. ${c.pagina}`;

    for (const el of elementos) {
      const nItemEl = (() => {
        for (let n: NoXml | null = el; n; n = n.pai) if (n.nome === 'det') return parseInt(n.attrs.nItem ?? '', 10) || null;
        return null;
      })();
      const problema = el.texto !== '' ? conferirFormato(c, el.texto) : null;
      if (!problema) {
        contagens.conformes++;
        registrar(chaveLeiaute, 'ALTO', true, true);
        continue;
      }
      const montar = (situacao: SituacaoOcorrencia, orient: string): Ocorrencia => ({
        item: c.tag,
        nItem: nItemEl,
        localizacao: caminhoDe(el),
        regra: `${c.tag} (${c.id}): ${c.descricao} — tipo ${c.tipo}, tamanho ${c.tamanho}`,
        chaveRegra: chaveLeiaute,
        referencia: refLeiaute,
        rejeicao: null,
        valorEncontrado: el.texto,
        valorEsperado: problema,
        situacao,
        situacaoSeVigente: situacao === 'NAO_EXIGIVEL' ? 'DIVERGENTE' : null,
        gravidade: situacao === 'NAO_EXIGIVEL' ? 'BAIXO' : 'ALTO',
        orientacao: orient,
      });
      if (!vigenteLeiaute) {
        contagens.alertas++;
        ocorrencias.push(montar('NAO_EXIGIVEL', `Formato fora do leiaute da NT, mas ela ainda não vale para este XML (${rotuloInicio(norma.homologacaoEm, norma.producaoEm)}). Ajustar o preenchimento de <${c.tag}>.`));
      } else {
        contagens.divergencias++;
        registrar(chaveLeiaute, 'ALTO', false, true);
        ocorrencias.push(montar('DIVERGENTE', `Ajustar o preenchimento de <${c.tag}> ao formato do leiaute: ${problema}.`));
      }
    }

    // ocorrência máxima (ex.: "1-1" → no máximo uma vez por pai)
    if (c.ocorMax !== null) {
      const porPai = new Map<NoXml, NoXml[]>();
      for (const el of elementos) if (el.pai) porPai.set(el.pai, [...(porPai.get(el.pai) ?? []), el]);
      for (const lista of porPai.values()) {
        if (lista.length <= c.ocorMax) continue;
        contagens.divergencias++;
        registrar(chaveLeiaute + ':ocor', 'ALTO', false, vigenteLeiaute);
        ocorrencias.push({
          item: c.tag,
          nItem: null,
          localizacao: caminhoDe(lista[0]),
          regra: `${c.tag} (${c.id}) pode ocorrer no máximo ${c.ocorMax} vez(es) por ${lista[0].pai?.nome}`,
          chaveRegra: chaveLeiaute,
          referencia: refLeiaute,
          rejeicao: null,
          valorEncontrado: `${lista.length} ocorrências`,
          valorEsperado: `No máximo ${c.ocorMax}`,
          situacao: vigenteLeiaute ? 'DIVERGENTE' : 'NAO_EXIGIVEL',
          situacaoSeVigente: vigenteLeiaute ? null : 'DIVERGENTE',
          gravidade: vigenteLeiaute ? 'ALTO' : 'BAIXO',
          orientacao: `Manter apenas ${c.ocorMax} ocorrência(s) de <${c.tag}>.`,
        });
      }
    }
  }

  // ---------------- índice de conformidade ----------------
  // Média ponderada por gravidade da taxa de acerto de cada regra avaliada
  // (regras não aplicáveis, ainda não exigíveis e não validáveis ficam de fora).
  let num = 0;
  let den = 0;
  const regras: ResumoRegra[] = [];
  for (const [chaveRegra, a] of acum) {
    regras.push({ chave: chaveRegra, gravidade: a.gravidade, avaliadas: a.avaliadas, falhas: a.falhas });
    const peso = PESO_GRAVIDADE[a.gravidade];
    num += peso * ((a.avaliadas - a.falhas) / a.avaliadas);
    den += peso;
  }
  const conformidade = den > 0 ? Math.round((100 * num) / den) : null;
  const temFalha = contagens.divergencias + contagens.ausentes + contagens.indevidos > 0;
  const veredito: ResultadoValidacao['veredito'] = temFalha ? 'DIVERGENTE' : den > 0 ? 'CONFORME' : 'SEM_REGRAS_APLICAVEIS';

  return { ...base, contagens, conformidade, veredito, ocorrencias, regras };
}

// Usada pela tela de cadastro pra mostrar o que cada regra faz.
export { descreverRegraExec };
