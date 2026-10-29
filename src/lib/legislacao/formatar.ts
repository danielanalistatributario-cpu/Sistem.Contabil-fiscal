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

export type Assinatura = { nome: string; cargo: string; setor?: string | null };

// Texto pronto pra colar no WhatsApp (negrito com *asteriscos*) ou, com
// `formato: 'email'`, texto simples com títulos em maiúsculas.
export function textoComunicado(c: Comunicado, assinatura: Assinatura, formato: 'whatsapp' | 'email'): string {
  const b = (s: string) => (formato === 'whatsapp' ? `*${s}*` : s.toUpperCase());
  const linhas: string[] = [];
  linhas.push(formato === 'whatsapp' ? `📢 *${c.titulo}*` : c.titulo.toUpperCase());
  if (c.subtitulo) linhas.push(c.subtitulo);
  if (c.dataDestaque) linhas.push('', `${formato === 'whatsapp' ? '📅 ' : ''}${b(c.dataDestaqueRotulo || 'Data importante')}: ${c.dataDestaque}`);
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
