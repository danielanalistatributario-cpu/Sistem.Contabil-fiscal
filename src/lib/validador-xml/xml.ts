// Leitor de XML mínimo e sem dependência — o projeto não tem biblioteca de
// XML e o Node não tem DOMParser. Cobre o que um XML fiscal usa: declaração,
// comentários, CDATA, atributos, entidades, namespaces (o prefixo é
// ignorado: <ds:Signature> vira "Signature"). Não valida DTD nem namespaces.

export type NoXml = {
  nome: string;
  attrs: Record<string, string>;
  filhos: NoXml[];
  texto: string;
  pai: NoXml | null;
};

const ENTIDADES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodificar(s: string): string {
  if (!s.includes('&')) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m, e: string) => {
    if (e[0] === '#') {
      const cod = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(cod) ? String.fromCodePoint(cod) : m;
    }
    return ENTIDADES[e] ?? m;
  });
}

function nomeLocal(n: string): string {
  const i = n.indexOf(':');
  return i >= 0 ? n.slice(i + 1) : n;
}

export function parseXml(origem: string): NoXml {
  const src = origem.replace(/^﻿/, '');
  let i = 0;
  let raiz: NoXml | null = null;
  const pilha: NoXml[] = [];

  while (i < src.length) {
    const lt = src.indexOf('<', i);
    if (lt < 0) break;
    if (lt > i && pilha.length) pilha[pilha.length - 1].texto += decodificar(src.slice(i, lt));

    if (src.startsWith('<!--', lt)) {
      const fim = src.indexOf('-->', lt + 4);
      if (fim < 0) throw new Error('Comentário XML não fechado.');
      i = fim + 3;
    } else if (src.startsWith('<![CDATA[', lt)) {
      const fim = src.indexOf(']]>', lt + 9);
      if (fim < 0) throw new Error('CDATA não fechado.');
      if (pilha.length) pilha[pilha.length - 1].texto += src.slice(lt + 9, fim);
      i = fim + 3;
    } else if (src.startsWith('<?', lt)) {
      const fim = src.indexOf('?>', lt + 2);
      if (fim < 0) throw new Error('Declaração XML não fechada.');
      i = fim + 2;
    } else if (src.startsWith('<!', lt)) {
      const fim = src.indexOf('>', lt + 2);
      if (fim < 0) throw new Error('Declaração XML não fechada.');
      i = fim + 1;
    } else if (src[lt + 1] === '/') {
      const fim = src.indexOf('>', lt + 2);
      if (fim < 0) throw new Error('Tag de fechamento incompleta.');
      const nome = nomeLocal(src.slice(lt + 2, fim).trim());
      const topo = pilha.pop();
      if (!topo || topo.nome !== nome) throw new Error(`Tag </${nome}> sem a abertura correspondente.`);
      topo.texto = topo.texto.trim();
      i = fim + 1;
    } else {
      // abertura: lê até o '>' respeitando aspas dos atributos
      let j = lt + 1;
      let aspas = '';
      while (j < src.length) {
        const c = src[j];
        if (aspas) {
          if (c === aspas) aspas = '';
        } else if (c === '"' || c === "'") aspas = c;
        else if (c === '>') break;
        j++;
      }
      if (j >= src.length) throw new Error('Tag de abertura incompleta.');
      let interno = src.slice(lt + 1, j);
      const autoFecha = interno.endsWith('/');
      if (autoFecha) interno = interno.slice(0, -1);
      const m = /^([^\s/>]+)([\s\S]*)$/.exec(interno.trim());
      if (!m) throw new Error('Tag sem nome.');
      const no: NoXml = { nome: nomeLocal(m[1]), attrs: {}, filhos: [], texto: '', pai: pilha[pilha.length - 1] ?? null };
      const reAttr = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
      let a: RegExpExecArray | null;
      while ((a = reAttr.exec(m[2]))) no.attrs[nomeLocal(a[1])] = decodificar(a[3] ?? a[4] ?? '');
      if (no.pai) no.pai.filhos.push(no);
      else if (!raiz) raiz = no;
      else throw new Error('XML com mais de um elemento raiz.');
      if (!autoFecha) pilha.push(no);
      i = j + 1;
    }
  }

  if (pilha.length) throw new Error(`Tag <${pilha[pilha.length - 1].nome}> não foi fechada.`);
  if (!raiz) throw new Error('Nenhum elemento encontrado — o arquivo não parece ser um XML.');
  return raiz;
}

// Descendentes (sem o próprio nó) com o nome informado, em ordem de documento.
export function acharTodos(no: NoXml, nome: string): NoXml[] {
  const out: NoXml[] = [];
  const visita = (n: NoXml) => {
    for (const f of n.filhos) {
      if (f.nome === nome) out.push(f);
      visita(f);
    }
  };
  visita(no);
  return out;
}

export function acharPrimeiro(no: NoXml, nome: string): NoXml | null {
  for (const f of no.filhos) {
    if (f.nome === nome) return f;
    const r = acharPrimeiro(f, nome);
    if (r) return r;
  }
  return null;
}

// Filho direto.
export function filho(no: NoXml | null, nome: string): NoXml | null {
  return no?.filhos.find((f) => f.nome === nome) ?? null;
}

export function textoDe(no: NoXml | null): string | null {
  return no && no.texto !== '' ? no.texto : null;
}

// "NFe > infNFe > det[2] > prod > vProd" — [n] aparece em <det> (nItem) e
// quando o pai tem irmãos de mesmo nome.
export function caminhoDe(no: NoXml): string {
  const partes: string[] = [];
  for (let n: NoXml | null = no; n; n = n.pai) {
    let rotulo = n.nome;
    if (n.attrs.nItem) rotulo += `[${n.attrs.nItem}]`;
    else if (n.pai) {
      const irmaos = n.pai.filhos.filter((f) => f.nome === n.nome);
      if (irmaos.length > 1) rotulo += `[${irmaos.indexOf(n) + 1}]`;
    }
    partes.unshift(rotulo);
  }
  return partes.join(' > ');
}
