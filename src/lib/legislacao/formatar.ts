import type { Comunicado, Fonte, ResultadoAnalise, ResultadoComparacao, ItemComparacao } from './tipos';

// Formatação compartilhada entre tela, PDF, Excel e texto de WhatsApp.

export function fmtData(iso: string | null | undefined): string {
  if (!iso) return '';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

export function fmtFonte(f: Fonte | null | undefined): string {
  if (!f) return '';
  return [f.pagina ? `p. ${f.pagina}` : '', f.dispositivo].filter(Boolean).join(' · ');
}

export function rotuloNatureza(n: string): string {
  return n === 'expresso' ? 'Expresso no documento' : 'Interpretação / recomendação';
}

const MESES_NOME = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

// "12/2025" ou "Dezembro/2025" → "Dezembro de 2025"; data ISO → dd/mm/aaaa.
function dataPublicacaoLegivel(t: string): string {
  const s = (t || '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return fmtData(s);
  let m = s.match(/^(\d{2})\/(\d{4})$/);
  if (m && +m[1] >= 1 && +m[1] <= 12) return `${MESES_NOME[+m[1] - 1]} de ${m[2]}`;
  m = s.match(/^([A-Za-zçÇ]+)\s*[\/ ]\s*(?:de\s+)?(\d{4})$/);
  if (m) return `${m[1][0].toUpperCase()}${m[1].slice(1).toLowerCase()} de ${m[2]}`;
  return s;
}

// Publicação do documento pro comunicado, só com o que o próprio documento
// diz: data de publicação no DOU > mês/ano da capa/controle de versões (NT)
// > data do ato (só então, com esse nome — não é a publicação). Sem dado,
// devolve null e o comunicado não mostra nada (nada é inventado).
export function derivarPublicacao(ident: Partial<ResultadoAnalise['identificacao']> | null | undefined): { rotulo: string; valor: string } | null {
  if (!ident) return null;
  if (ident.dataPublicacao) return { rotulo: 'Publicado no DOU em', valor: fmtData(ident.dataPublicacao) };
  if (ident.publicacaoTexto) return { rotulo: 'Publicada em', valor: dataPublicacaoLegivel(ident.publicacaoTexto) };
  if (ident.tipoDocumento === 'Nota Técnica' && ident.dataDocumento) return { rotulo: 'Publicada em', valor: dataPublicacaoLegivel(ident.dataDocumento) };
  if (ident.dataDocumento && /^\d{4}-\d{2}-\d{2}/.test(ident.dataDocumento)) return { rotulo: 'Data do ato', valor: fmtData(ident.dataDocumento) };
  return null;
}

// O que o comunicado mostra: o que foi gravado/editado nele, senão o
// derivado da identificação da análise.
export function publicacaoDoComunicado(c: Comunicado): { rotulo: string; valor: string } | null {
  const valor = (c.dataPublicacao ?? '').trim();
  return valor ? { rotulo: (c.dataPublicacaoRotulo ?? '').trim() || 'Publicação', valor } : null;
}

export function comunicadoComPublicacao(c: Comunicado, ident: ResultadoAnalise['identificacao'] | null | undefined): Comunicado {
  if (c.dataPublicacao !== undefined) return c; // já gravado (ou editado, mesmo que vazio)
  const p = derivarPublicacao(ident);
  return p ? { ...c, dataPublicacaoRotulo: p.rotulo, dataPublicacao: p.valor } : c;
}

export type Assinatura = { nome: string; cargo: string; setor?: string | null };

// Texto pronto pra colar no WhatsApp (negrito com *asteriscos*) ou, com
// `formato: 'email'`, texto simples com títulos em maiúsculas.
export function textoComunicado(c: Comunicado, assinatura: Assinatura, formato: 'whatsapp' | 'email'): string {
  const b = (s: string) => (formato === 'whatsapp' ? `*${s}*` : s.toUpperCase());
  const linhas: string[] = [];
  linhas.push(formato === 'whatsapp' ? `📢 *${c.titulo}*` : c.titulo.toUpperCase());
  if (c.subtitulo) linhas.push(c.subtitulo);
  if (c.dataDestaque) linhas.push('', `${formato === 'whatsapp' ? '📅 ' : ''}${b(c.dataDestaqueRotulo || 'Data importante')}: ${c.dataDestaque}`);
  const pub = publicacaoDoComunicado(c);
  if (pub) linhas.push(`${formato === 'whatsapp' ? '📰 ' : ''}${b(pub.rotulo)}: ${pub.valor}`);
  const secao = (titulo: string, itens: string[], marcador: string, emoji = '') => {
    if (!itens.length) return;
    linhas.push('', (formato === 'whatsapp' && emoji ? `${emoji} ` : '') + b(titulo));
    for (const i of itens) linhas.push(`${marcador} ${i}`);
  };
  secao('O que mudou?', c.oQueMudou, '•');
  secao('Quem é afetado?', c.quemEAfetado, '•');
  secao('O que precisamos fazer?', c.oQueFazer, formato === 'whatsapp' ? '☐' : '[ ]');
  secao('Impacto no ERP', c.impactoErp, '•');
  secao('Atenção', c.atencao, '•', '⚠️');
  if (c.fonte) linhas.push('', `${b('Fonte')}: ${c.fonte}`);
  linhas.push('', '—', assinatura.nome, [assinatura.cargo, assinatura.setor].filter(Boolean).join(' · '));
  return linhas.join('\n');
}

export function ehComparacao(r: ResultadoAnalise | ResultadoComparacao): r is ResultadoComparacao {
  return 'documentoA' in r;
}

export function fmtItemComparacao(i: ItemComparacao): string {
  const partes = [i.descricao];
  if (i.antes) partes.push(`Antes: ${i.antes}`);
  if (i.depois) partes.push(`Depois: ${i.depois}`);
  return partes.join(' — ');
}

export function paginasComparacao(i: ItemComparacao): string {
  return [i.paginaA ? `A p. ${i.paginaA}` : '', i.paginaB ? `B p. ${i.paginaB}` : ''].filter(Boolean).join(' · ');
}
