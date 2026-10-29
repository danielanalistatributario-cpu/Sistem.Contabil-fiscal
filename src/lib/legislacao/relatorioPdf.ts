import PDFDocument from 'pdfkit';
import { ROTULO_MARCO, ASSINATURA_PADRAO, type ResultadoAnalise, type ResultadoComparacao, type ItemFonte, type ItemComparacao, type Marco } from '@/lib/legislacao/tipos';
import { fmtData, fmtFonte, ehComparacao, paginasComparacao } from '@/lib/legislacao/formatar';

// Relatório completo da análise em PDF (pdfkit, no servidor).

const MARGEM = 45;
const VERDE = '#00753A';
const LARANJA = '#D97C0C';
const CINZA = '#666666';

// Helvetica do pdfkit só cobre WinAnsi: troca o que estiver fora disso.
function t(s: string | null | undefined): string {
  return String(s ?? '')
    .replace(/[≤]/g, '<=')
    .replace(/[≥]/g, '>=')
    .replace(/[→⇒]/g, '->')
    .replace(/[☐□]/g, '[ ]')
    .replace(/[✓✔]/g, 'v')
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF–—‘’“”•…€]/g, '');
}

export function gerarPdf(meta: { titulo: string; nomeArquivo: string; nomeArquivoB: string | null; createdAt: Date; semIa?: boolean; assinatura: { nome: string; cargo: string; setor: string | null } }, r: ResultadoAnalise | ResultadoComparacao, marcados: number[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: MARGEM, size: 'A4', bufferPages: true, info: { Title: t(meta.titulo) } });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    const largura = doc.page.width - MARGEM * 2;

    const garantirEspaco = (alt: number) => {
      if (doc.y + alt > doc.page.height - MARGEM - 30) doc.addPage();
    };
    const secao = (titulo: string) => {
      garantirEspaco(50);
      doc.moveDown(0.8);
      const y = doc.y;
      doc.rect(MARGEM, y, 4, 14).fill(VERDE);
      doc.fillColor(VERDE).font('Helvetica-Bold').fontSize(12).text(t(titulo), MARGEM + 10, y + 1, { width: largura - 10 });
      doc.moveDown(0.4);
      doc.font('Helvetica').fontSize(9.5).fillColor('#000');
    };
    const paragrafo = (texto: string) => {
      if (!texto) return;
      garantirEspaco(30);
      doc.font('Helvetica').fontSize(9.5).fillColor('#000').text(t(texto), MARGEM, doc.y, { width: largura, align: 'justify' });
      doc.moveDown(0.4);
    };
    const campo = (rotulo: string, valor: string) => {
      if (!valor) return;
      garantirEspaco(16);
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#000').text(`${t(rotulo)}${rotulo.endsWith('?') ? '' : ':'} `, MARGEM, doc.y, { continued: true, width: largura });
      doc.font('Helvetica').text(t(valor));
    };
    const item = (texto: string, detalhe?: string, marcador = '•') => {
      garantirEspaco(26);
      doc.font('Helvetica').fontSize(9.5).fillColor('#000').text(`${marcador} ${t(texto)}`, MARGEM + 6, doc.y, { width: largura - 6 });
      if (detalhe) doc.fontSize(7.5).fillColor(CINZA).text(t(detalhe), MARGEM + 16, doc.y, { width: largura - 16 });
      doc.moveDown(0.25);
    };
    const itensFonte = (titulo: string, itens: ItemFonte[]) => {
      if (!itens?.length) return;
      secao(titulo);
      for (const i of itens) {
        const fonte = fmtFonte(i.fonte);
        item(i.descricao, [i.natureza === 'expresso' ? 'Expresso no documento' : 'Interpretação', fonte].filter(Boolean).join(' · '));
      }
    };
    const itensComparacao = (titulo: string, itens: ItemComparacao[]) => {
      if (!itens?.length) return;
      secao(titulo);
      for (const i of itens) {
        const det = [i.antes ? `Antes: ${i.antes}` : '', i.depois ? `Depois: ${i.depois}` : '', paginasComparacao(i), i.natureza === 'expresso' ? 'Expresso' : 'Interpretação'].filter(Boolean).join(' | ');
        item(i.descricao, det);
      }
    };
    const linhaDoTempo = (titulo: string, marcos: Marco[]) => {
      if (!marcos?.length) return;
      secao(titulo);
      for (const m of marcos) item(`${fmtData(m.data) || m.dataTexto || 'Sem data'} — ${ROTULO_MARCO[m.tipo] ?? m.tipo}: ${m.descricao}`, [m.data && m.dataTexto ? `"${m.dataTexto}"` : '', fmtFonte(m.fonte)].filter(Boolean).join(' · '));
    };

    // Cabeçalho
    doc.rect(0, 0, doc.page.width, 92).fill(VERDE);
    doc.fillColor('#FFFFFF').font('Helvetica').fontSize(8).text(ehComparacao(r) ? 'COMPARAÇÃO DE LEGISLAÇÃO' : 'ANÁLISE DE LEGISLAÇÃO FISCAL E TRIBUTÁRIA', MARGEM, 22, { characterSpacing: 1.2 });
    doc.font('Helvetica-Bold').fontSize(16).text(t(meta.titulo), MARGEM, 36, { width: largura, height: 40, ellipsis: true });
    doc.font('Helvetica').fontSize(8).fillColor('#DDEEDD').text(t(`Arquivo: ${meta.nomeArquivo}${meta.nomeArquivoB ? ` × ${meta.nomeArquivoB}` : ''}  ·  Analisado em ${meta.createdAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`), MARGEM, 76, { width: largura });
    doc.fillColor('#000');
    doc.y = 110;
    doc.font('Helvetica-Oblique').fontSize(8).fillColor(CINZA).text((meta.semIa ? 'Resumo automático SEM IA: frases localizadas e extraídas do próprio documento por regras, não reescritas. ' : 'Análise gerada com apoio de IA a partir do documento enviado. ') + 'Itens marcados como "Interpretação" são leitura técnica, não texto literal da norma — valide com a fonte antes de decidir.', MARGEM, doc.y, { width: largura });

    if (ehComparacao(r)) {
      secao('Documentos comparados');
      campo('Documento A', [r.documentoA.titulo, r.documentoA.numero, r.documentoA.versao && `v${r.documentoA.versao}`, fmtData(r.documentoA.data)].filter(Boolean).join(' · '));
      campo('Documento B', [r.documentoB.titulo, r.documentoB.numero, r.documentoB.versao && `v${r.documentoB.versao}`, fmtData(r.documentoB.data)].filter(Boolean).join(' · '));
      campo('Relação', r.relacao);
      secao('Resumo das diferenças');
      paragrafo(r.resumo);
      itensComparacao('O que foi incluído', r.incluido);
      itensComparacao('O que foi excluído', r.excluido);
      itensComparacao('O que foi alterado', r.alterado);
      linhaDoTempo('Novos prazos', r.novosPrazos);
      itensComparacao('Novas obrigações', r.novasObrigacoes);
      itensComparacao('Alterações fiscais', r.alteracoesFiscais);
      itensComparacao('Impactos no ERP', r.impactosErp);
    } else {
      const id = r.identificacao;
      secao('Identificação do documento');
      campo('Título', id.titulo);
      campo('Tipo', id.tipoDocumento);
      campo('Número', [id.numero, id.versao && `versão ${id.versao}`].filter(Boolean).join(' — '));
      campo('Data', fmtData(id.dataDocumento));
      campo('Órgão', id.orgao);
      campo('Publicação', fmtData(id.dataPublicacao));
      campo('Início da vigência', fmtData(id.dataVigencia));
      campo('Ementa', id.ementa);
      campo('Assunto principal', r.assuntoPrincipal);

      secao('Resumo executivo');
      const re = r.resumoExecutivo;
      campo('O que aconteceu?', re.oQueAconteceu);
      campo('O que mudou?', re.oQueMudou);
      campo('Quando entra em vigor?', re.quandoEntraEmVigor);
      campo('Quem será afetado?', re.quemSeraAfetado);
      campo('O que precisamos fazer?', re.oQuePrecisamosFazer);
      campo('Qual o prazo?', re.qualOPrazo);
      campo('Impacto no sistema/ERP', re.impactoNoErp);

      secao('Resumo técnico');
      for (const p of r.resumoTecnico.split(/\n+/)) paragrafo(p);

      if (r.alteracoes?.length) {
        secao('Principais alterações');
        for (const a of r.alteracoes) item(`${a.titulo}: ${a.descricao}`, [a.natureza === 'expresso' ? 'Expresso no documento' : 'Interpretação', fmtFonte(a.fonte)].filter(Boolean).join(' · '));
      }
      itensFonte('Quem será afetado', r.afetados);
      itensFonte('Obrigações e procedimentos', r.obrigacoes);
      linhaDoTempo('Linha do tempo', r.linhaDoTempo);
      itensFonte('Impactos fiscais e tributários', r.impactos.fiscalTributario);
      itensFonte('Impactos no ERP / sistema', r.impactos.erp);
      itensFonte('Impactos em NF-e / NFC-e / NFS-e / CT-e', r.impactos.documentosFiscais);
      itensFonte('Impactos em SPED e obrigações acessórias', r.impactos.obrigacoesAcessorias);
      if (r.codigos?.length) {
        secao('Códigos fiscais envolvidos');
        for (const c of r.codigos) item(`${c.tipo} ${c.codigo} — ${c.descricao}`, fmtFonte(c.fonte));
      }
      if (r.riscos?.length) {
        secao('Riscos de não cumprimento');
        for (const x of r.riscos) item(`[${x.gravidade.toUpperCase()}] ${x.descricao}`, [x.natureza === 'expresso' ? 'Expresso no documento' : 'Interpretação', fmtFonte(x.fonte)].filter(Boolean).join(' · '));
      }
      if (r.providencias?.length) {
        secao('Providências recomendadas');
        for (const p of r.providencias) item(`[Prioridade ${p.prioridade}] ${p.descricao}`);
      }
    }

    if (r.checklist?.length) {
      secao('Checklist de adequação');
      r.checklist.forEach((c, i) => item(c.acao, [c.area, c.prazo && `Prazo: ${c.prazo}`, fmtFonte(c.fonte)].filter(Boolean).join(' · '), marcados.includes(i) ? '[x]' : '[ ]'));
    }

    if (!ehComparacao(r) && r.baseLegal?.length) {
      secao('Base legal / fonte');
      for (const b of r.baseLegal) {
        item(
          [b.documento, b.numero, fmtData(b.data) || b.data, b.orgao].filter(Boolean).join(' · ') + (b.dispositivo ? ` — ${b.dispositivo}` : ''),
          [b.pagina ? `Página ${b.pagina} do PDF` : '', b.trecho ? `"${b.trecho}"` : ''].filter(Boolean).join(' — ')
        );
      }
    }
    if (r.limitacoes?.length) {
      secao('Limitações da leitura');
      for (const l of r.limitacoes) item(l);
    }

    garantirEspaco(50);
    doc.moveDown(1.5);
    doc.font('Helvetica-Bold').fontSize(10).fillColor(VERDE).text(t(meta.assinatura.nome), MARGEM);
    doc.font('Helvetica').fontSize(9).fillColor(CINZA).text(t([meta.assinatura.cargo, meta.assinatura.setor].filter(Boolean).join(' · ')), MARGEM);

    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      // Sem zerar a margem de baixo, escrever no rodapé cria página nova.
      doc.page.margins.bottom = 0;
      doc.font('Helvetica').fontSize(7).fillColor(LARANJA).text(`Analista Tributário  —  página ${i + 1} de ${range.count}`, MARGEM, doc.page.height - MARGEM + 15, { width: largura, align: 'center', lineBreak: false });
    }
    doc.end();
  });
}
