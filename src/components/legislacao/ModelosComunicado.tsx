'use client';

import { forwardRef } from 'react';
import { CalendarClock, Users, ListChecks, Settings2, AlertTriangle, BookOpen, Sparkles, Hourglass, CheckSquare, Flag } from 'lucide-react';
import type { Comunicado, Marco } from '@/lib/legislacao/tipos';
import { ROTULO_MARCO } from '@/lib/legislacao/tipos';
import type { Assinatura } from '@/lib/legislacao/formatar';
import { diasAte } from '@/lib/legislacao/modelos';

// Modelos alternativos do comunicado visual (o "Corporativo" está em
// ComunicadoVisual.tsx). Mesmo conteúdo, layout e paleta diferentes.
// Mesmas regras do original: 1080px de largura, altura pelo conteúdo e
// estilos inline (o html-to-image clona o nó pra gerar o PNG).

export type PropsModelo = {
  comunicado: Comunicado;
  assinatura: Assinatura;
  tipoDocumento: string;
  dataGeracao: string;
  marcos?: Marco[];
};

const fonteTitulo = 'var(--font-display), "Space Grotesk", system-ui, sans-serif';
const fonteTexto = 'var(--font-sans), Inter, system-ui, sans-serif';

function fmtIso(iso: string) {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

// Rodapé comum: fonte à esquerda, assinatura à direita, faixa final.
function Rodape({ c, assinatura, dataGeracao, corTexto, corDestaque, corFaixa, corFaixaTexto, fundoClaro = true }: {
  c: Comunicado; assinatura: Assinatura; dataGeracao: string; corTexto: string; corDestaque: string; corFaixa: string; corFaixaTexto: string; fundoClaro?: boolean;
}) {
  return (
    <>
      <div style={{ margin: '28px 56px 0', paddingBottom: 30, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 30 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', maxWidth: 580 }}>
          <BookOpen size={20} color={corDestaque} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: 1.4, color: corDestaque, textTransform: 'uppercase' }}>Fonte</div>
            <div style={{ fontSize: 15.5, color: corTexto, opacity: fundoClaro ? 0.8 : 0.85, lineHeight: 1.4 }}>{c.fonte || '—'}</div>
          </div>
        </div>
        <div style={{ textAlign: 'right', borderLeft: `4px solid ${corDestaque}`, paddingLeft: 16 }}>
          <div style={{ fontFamily: fonteTitulo, fontWeight: 700, fontSize: 21, color: corTexto }}>{assinatura.nome}</div>
          <div style={{ fontSize: 15.5, color: corTexto, opacity: 0.75 }}>{[assinatura.cargo, assinatura.setor].filter(Boolean).join(' · ')}</div>
        </div>
      </div>
      <div style={{ background: corFaixa, color: corFaixaTexto, fontSize: 12.5, padding: '10px 56px', display: 'flex', justifyContent: 'space-between' }}>
        <span>Analista Tributário</span>
        <span>Emitido em {dataGeracao}</span>
      </div>
    </>
  );
}

const lista = (itens: string[]) => itens.filter((s) => s.trim());

// ---------------------------------------------------------------------
// Linha do tempo — azul-petróleo/teal, datas em sequência no topo
// ---------------------------------------------------------------------
export const ModeloLinhaDoTempo = forwardRef<HTMLDivElement, PropsModelo>(function ModeloLinhaDoTempo({ comunicado: c, assinatura, tipoDocumento, dataGeracao, marcos = [] }, ref) {
  const K = { escuro: '#0F2A3D', teal: '#00A69C', tealClaro: '#E0F5F3', fundo: '#F5F8FA', tinta: '#16232E' };
  // Até 5 marcos em volta da data em destaque (NTs longas têm dezenas de
  // datas; as 5 primeiras já passaram e deixariam o destaque de fora).
  const comData = [...marcos].filter((m) => m.data).sort((a, b) => a.data.localeCompare(b.data));
  const iDestaque = Math.max(0, comData.findIndex((m) => fmtIso(m.data) === c.dataDestaque));
  const inicio = Math.max(0, Math.min(iDestaque - 2, comData.length - 5));
  const pontos = comData.slice(inicio, inicio + 5).map((m) => ({ data: fmtIso(m.data), rotulo: ROTULO_MARCO[m.tipo] ?? m.tipo, destaque: fmtIso(m.data) === c.dataDestaque }));
  if (!pontos.length && c.dataDestaque) pontos.push({ data: c.dataDestaque, rotulo: c.dataDestaqueRotulo, destaque: true });
  const coluna = (titulo: string, Icone: typeof Users, itens: string[], marcador: 'ponto' | 'check') =>
    itens.length > 0 && (
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: fonteTitulo, fontWeight: 700, fontSize: 17, letterSpacing: 0.8, color: K.escuro, textTransform: 'uppercase', paddingBottom: 10, borderBottom: `3px solid ${K.teal}`, marginBottom: 14 }}>
          <Icone size={19} color={K.teal} strokeWidth={2.4} /> {titulo}
        </div>
        {itens.map((t, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, fontSize: 16.5, lineHeight: 1.45, marginBottom: 10 }}>
            {marcador === 'check' ? (
              <span style={{ flexShrink: 0, width: 18, height: 18, marginTop: 3, border: `2.5px solid ${K.teal}`, borderRadius: 4 }} />
            ) : (
              <span style={{ flexShrink: 0, width: 7, height: 7, marginTop: 9, borderRadius: '50%', background: K.teal }} />
            )}
            <span>{t}</span>
          </div>
        ))}
      </div>
    );
  return (
    <div ref={ref} style={{ width: 1080, background: K.fundo, fontFamily: fonteTexto, color: K.tinta }}>
      <div style={{ background: K.escuro, color: '#fff', padding: '42px 56px 36px' }}>
        <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: 2, textTransform: 'uppercase', color: K.teal }}>Atualização fiscal{tipoDocumento ? ` · ${tipoDocumento}` : ''}</div>
        <h1 style={{ fontFamily: fonteTitulo, fontWeight: 700, fontSize: 46, lineHeight: 1.1, margin: '14px 0 0' }}>{c.titulo}</h1>
        {c.subtitulo && <p style={{ fontSize: 19.5, lineHeight: 1.45, margin: '14px 0 0', color: 'rgba(255,255,255,0.8)' }}>{c.subtitulo}</p>}
        {/* Linha do tempo */}
        <div style={{ position: 'relative', marginTop: 40, padding: '0 10px' }}>
          <div style={{ position: 'absolute', left: 30, right: 30, top: 21, height: 4, background: 'rgba(255,255,255,0.18)', borderRadius: 2 }} />
          <div style={{ position: 'relative', display: 'flex', justifyContent: pontos.length > 1 ? 'space-between' : 'flex-start' }}>
            {pontos.map((p, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 170 }}>
                <span style={{ width: p.destaque ? 46 : 38, height: p.destaque ? 46 : 38, marginTop: p.destaque ? 0 : 4, borderRadius: '50%', background: p.destaque ? K.teal : K.escuro, border: `4px solid ${p.destaque ? '#fff' : K.teal}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  {p.destaque ? <Flag size={18} color="#fff" /> : <span style={{ width: 10, height: 10, borderRadius: '50%', background: K.teal }} />}
                </span>
                <div style={{ fontFamily: fonteTitulo, fontWeight: 700, fontSize: p.destaque ? 24 : 20, marginTop: 10, color: p.destaque ? K.teal : '#fff' }}>{p.data}</div>
                <div style={{ fontSize: 13.5, textTransform: 'uppercase', letterSpacing: 0.8, color: 'rgba(255,255,255,0.7)', textAlign: 'center', marginTop: 2 }}>{p.rotulo}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={{ padding: '34px 56px 0', display: 'flex', gap: 34 }}>
        {coluna('O que mudou', Sparkles, lista(c.oQueMudou), 'ponto')}
        {coluna('O que fazer', ListChecks, lista(c.oQueFazer), 'check')}
      </div>
      <div style={{ padding: '18px 56px 0', display: 'flex', gap: 34 }}>
        {coluna('Quem é afetado', Users, lista(c.quemEAfetado), 'ponto')}
        {coluna('Impacto no ERP', Settings2, lista(c.impactoErp), 'ponto')}
      </div>
      {lista(c.atencao).length > 0 && (
        <div style={{ margin: '18px 56px 0', background: K.tealClaro, borderLeft: `6px solid ${K.teal}`, borderRadius: 12, padding: '16px 20px', display: 'flex', gap: 14 }}>
          <AlertTriangle size={26} color={K.escuro} style={{ flexShrink: 0 }} />
          <div style={{ fontSize: 16.5, lineHeight: 1.45 }}>
            <strong style={{ color: K.escuro }}>ATENÇÃO: </strong>
            {lista(c.atencao).join(' • ')}
          </div>
        </div>
      )}
      <Rodape c={c} assinatura={assinatura} dataGeracao={dataGeracao} corTexto={K.escuro} corDestaque={K.teal} corFaixa={K.escuro} corFaixaTexto="rgba(255,255,255,0.65)" />
    </div>
  );
});

// ---------------------------------------------------------------------
// Alerta de prazo — vermelho/âmbar, contagem de dias em evidência
// ---------------------------------------------------------------------
export const ModeloAlerta = forwardRef<HTMLDivElement, PropsModelo>(function ModeloAlerta({ comunicado: c, assinatura, tipoDocumento, dataGeracao }, ref) {
  const K = { ruby: '#BE1E2D', rubyEscuro: '#7A0F1A', ambar: '#F6B21E', ambarClaro: '#FFF7E0', fundo: '#FFFBF5', tinta: '#2A1A1C' };
  const dias = diasAte(c.dataDestaque);
  const contagem =
    dias === null ? 'Prazo a definir' : dias > 1 ? `Faltam ${dias} dias` : dias === 1 ? 'Falta 1 dia' : dias === 0 ? 'É hoje' : `Em vigor há ${-dias} dias`;
  return (
    <div ref={ref} style={{ width: 1080, background: K.fundo, fontFamily: fonteTexto, color: K.tinta }}>
      <div style={{ background: `repeating-linear-gradient(135deg, ${K.ambar} 0 22px, ${K.tinta} 22px 44px)`, height: 14 }} />
      <div style={{ background: K.ruby, color: '#fff', padding: '38px 56px 40px', display: 'flex', gap: 34, alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: K.ambar, color: K.tinta, borderRadius: 6, padding: '6px 12px', fontSize: 14, fontWeight: 800, letterSpacing: 1.6, textTransform: 'uppercase' }}>
            <AlertTriangle size={16} strokeWidth={2.6} /> Atenção ao prazo{tipoDocumento ? ` · ${tipoDocumento}` : ''}
          </div>
          <h1 style={{ fontFamily: fonteTitulo, fontWeight: 700, fontSize: 46, lineHeight: 1.1, margin: '18px 0 0' }}>{c.titulo}</h1>
          {c.subtitulo && <p style={{ fontSize: 19, lineHeight: 1.45, margin: '12px 0 0', color: 'rgba(255,255,255,0.88)' }}>{c.subtitulo}</p>}
        </div>
        <div style={{ width: 260, flexShrink: 0, background: '#fff', color: K.tinta, borderRadius: 20, padding: '22px 20px', textAlign: 'center', boxShadow: '0 16px 40px -14px rgba(0,0,0,0.5)' }}>
          <Hourglass size={30} color={K.ruby} style={{ margin: '0 auto' }} />
          <div style={{ fontFamily: fonteTitulo, fontWeight: 800, fontSize: 30, color: K.ruby, marginTop: 8, lineHeight: 1.1 }}>{contagem}</div>
          <div style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: 1, color: '#6B5457', marginTop: 10 }}>{c.dataDestaqueRotulo || 'Data'}</div>
          <div style={{ fontFamily: fonteTitulo, fontWeight: 700, fontSize: 28 }}>{c.dataDestaque}</div>
        </div>
      </div>
      <div style={{ padding: '32px 56px 0' }}>
        <div style={{ background: '#fff', border: `3px solid ${K.ruby}`, borderRadius: 18, padding: '22px 26px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: fonteTitulo, fontWeight: 800, fontSize: 21, color: K.ruby, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 14 }}>
            <CheckSquare size={22} strokeWidth={2.4} /> O que precisamos fazer
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 28px' }}>
            {lista(c.oQueFazer).map((f, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, fontSize: 17.5, lineHeight: 1.4 }}>
                <span style={{ flexShrink: 0, width: 26, height: 26, borderRadius: 7, background: K.ruby, color: '#fff', fontWeight: 800, fontSize: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
                <span>{f}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={{ padding: '22px 56px 0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 22 }}>
        {[
          ['O que mudou', lista(c.oQueMudou)],
          ['Impacto no ERP', lista(c.impactoErp)],
        ].map(([t, itens]) =>
          (itens as string[]).length ? (
            <div key={t as string} style={{ background: K.ambarClaro, borderRadius: 16, padding: '18px 22px' }}>
              <div style={{ fontFamily: fonteTitulo, fontWeight: 700, fontSize: 17, color: K.rubyEscuro, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>{t as string}</div>
              {(itens as string[]).map((x, i) => (
                <div key={i} style={{ fontSize: 16.5, lineHeight: 1.45, marginBottom: 6 }}>▸ {x}</div>
              ))}
            </div>
          ) : null
        )}
      </div>
      {(lista(c.quemEAfetado).length > 0 || lista(c.atencao).length > 0) && (
        <div style={{ padding: '18px 56px 0', fontSize: 16.5, lineHeight: 1.5 }}>
          {lista(c.quemEAfetado).length > 0 && (
            <div>
              <strong style={{ color: K.ruby }}>Afetados: </strong>
              {lista(c.quemEAfetado).join(' · ')}
            </div>
          )}
          {lista(c.atencao).map((a, i) => (
            <div key={i} style={{ marginTop: 6 }}>
              <strong style={{ color: K.ruby }}>⚠ </strong>
              {a}
            </div>
          ))}
        </div>
      )}
      <Rodape c={c} assinatura={assinatura} dataGeracao={dataGeracao} corTexto={K.tinta} corDestaque={K.ruby} corFaixa={K.tinta} corFaixaTexto="rgba(255,255,255,0.65)" />
    </div>
  );
});

// ---------------------------------------------------------------------
// Executivo — branco, tipográfico, seções numeradas
// ---------------------------------------------------------------------
export const ModeloExecutivo = forwardRef<HTMLDivElement, PropsModelo>(function ModeloExecutivo({ comunicado: c, assinatura, tipoDocumento, dataGeracao }, ref) {
  const K = { tinta: '#111827', cinza: '#6B7280', linha: '#E5E7EB', verde: '#00753A' };
  const secoes: [string, string[]][] = [
    ['O que mudou', lista(c.oQueMudou)],
    ['Quem é afetado', lista(c.quemEAfetado)],
    ['O que precisamos fazer', lista(c.oQueFazer)],
    ['Impacto no ERP', lista(c.impactoErp)],
    ['Atenção', lista(c.atencao)],
  ];
  const visiveis = secoes.filter(([, i]) => i.length);
  return (
    <div ref={ref} style={{ width: 1080, background: '#fff', fontFamily: fonteTexto, color: K.tinta }}>
      <div style={{ height: 8, background: K.verde }} />
      <div style={{ padding: '48px 64px 30px', display: 'flex', justifyContent: 'space-between', gap: 40, borderBottom: `1px solid ${K.linha}` }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: 3, textTransform: 'uppercase', color: K.cinza }}>Comunicado{tipoDocumento ? ` — ${tipoDocumento}` : ''}</div>
          <h1 style={{ fontFamily: fonteTitulo, fontWeight: 700, fontSize: 48, lineHeight: 1.08, margin: '14px 0 0', letterSpacing: -0.8 }}>{c.titulo}</h1>
          {c.subtitulo && <p style={{ fontSize: 20, lineHeight: 1.5, margin: '14px 0 0', color: K.cinza }}>{c.subtitulo}</p>}
        </div>
        {c.dataDestaque && (
          <div style={{ flexShrink: 0, textAlign: 'right', borderLeft: `1px solid ${K.linha}`, paddingLeft: 30, alignSelf: 'center' }}>
            <div style={{ fontSize: 13, letterSpacing: 2, textTransform: 'uppercase', color: K.cinza }}>{c.dataDestaqueRotulo || 'Data'}</div>
            <div style={{ fontFamily: fonteTitulo, fontWeight: 700, fontSize: 40, color: K.verde, marginTop: 4 }}>{c.dataDestaque}</div>
          </div>
        )}
      </div>
      <div style={{ padding: '10px 64px 0' }}>
        {visiveis.map(([titulo, itens], n) => (
          <div key={titulo} style={{ display: 'flex', gap: 30, padding: '22px 0', borderBottom: n < visiveis.length - 1 ? `1px solid ${K.linha}` : 'none' }}>
            <div style={{ width: 210, flexShrink: 0 }}>
              <div style={{ fontFamily: fonteTitulo, fontWeight: 700, fontSize: 34, color: titulo === 'Atenção' ? '#B45309' : K.verde, lineHeight: 1 }}>{String(n + 1).padStart(2, '0')}</div>
              <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', marginTop: 8 }}>{titulo}</div>
            </div>
            <div style={{ flex: 1 }}>
              {itens.map((t, i) => (
                <div key={i} style={{ fontSize: 18, lineHeight: 1.5, marginBottom: 6, display: 'flex', gap: 12 }}>
                  <span style={{ color: K.cinza }}>{titulo === 'O que precisamos fazer' ? '☐' : '—'}</span>
                  <span>{t}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <Rodape c={c} assinatura={assinatura} dataGeracao={dataGeracao} corTexto={K.tinta} corDestaque={K.verde} corFaixa="#F3F4F6" corFaixaTexto={K.cinza} />
    </div>
  );
});

// ---------------------------------------------------------------------
// Mosaico — blocos coloridos, estilo infográfico
// ---------------------------------------------------------------------
export const ModeloMosaico = forwardRef<HTMLDivElement, PropsModelo>(function ModeloMosaico({ comunicado: c, assinatura, tipoDocumento, dataGeracao }, ref) {
  const K = { roxo: '#6D28D9', roxoEscuro: '#3B0F86', rosa: '#EC297B', fundo: '#F7F5FD', tinta: '#1E1B2E' };
  const bloco = (titulo: string, Icone: typeof Users, itens: string[], fundo: string, cor: string, largo = false) =>
    itens.length > 0 && (
      <div style={{ gridColumn: largo ? 'span 2' : undefined, background: fundo, color: cor, borderRadius: 22, padding: '22px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <span style={{ width: 38, height: 38, borderRadius: 12, background: 'rgba(255,255,255,0.22)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icone size={20} color={cor} strokeWidth={2.3} />
          </span>
          <span style={{ fontFamily: fonteTitulo, fontWeight: 700, fontSize: 19, letterSpacing: 0.5, textTransform: 'uppercase' }}>{titulo}</span>
        </div>
        {itens.map((t, i) => (
          <div key={i} style={{ fontSize: 17, lineHeight: 1.45, marginBottom: 7, display: 'flex', gap: 8 }}>
            <span style={{ fontWeight: 800 }}>{i + 1}.</span>
            <span>{t}</span>
          </div>
        ))}
      </div>
    );
  return (
    <div ref={ref} style={{ width: 1080, background: K.fundo, fontFamily: fonteTexto, color: K.tinta }}>
      <div style={{ padding: '44px 56px 10px', display: 'flex', gap: 28, alignItems: 'stretch' }}>
        <div style={{ flex: 1, background: `linear-gradient(135deg, ${K.roxo}, ${K.roxoEscuro})`, color: '#fff', borderRadius: 26, padding: '30px 32px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: '#E9D5FF' }}>Resumo da norma{tipoDocumento ? ` · ${tipoDocumento}` : ''}</div>
          <h1 style={{ fontFamily: fonteTitulo, fontWeight: 700, fontSize: 42, lineHeight: 1.1, margin: '12px 0 0' }}>{c.titulo}</h1>
          {c.subtitulo && <p style={{ fontSize: 18, lineHeight: 1.45, margin: '12px 0 0', color: 'rgba(255,255,255,0.85)' }}>{c.subtitulo}</p>}
        </div>
        {c.dataDestaque && (
          <div style={{ width: 250, flexShrink: 0, background: K.rosa, color: '#fff', borderRadius: 26, padding: '26px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <CalendarClock size={30} />
            <div style={{ fontSize: 14, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginTop: 12, opacity: 0.9 }}>{c.dataDestaqueRotulo || 'Data'}</div>
            <div style={{ fontFamily: fonteTitulo, fontWeight: 800, fontSize: c.dataDestaque.length > 10 ? 25 : 31, lineHeight: 1.1, marginTop: 4 }}>{c.dataDestaque}</div>
          </div>
        )}
      </div>
      <div style={{ padding: '18px 56px 0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        {bloco('O que mudou', Sparkles, lista(c.oQueMudou), '#14B8A6', '#fff', true)}
        {bloco('Quem é afetado', Users, lista(c.quemEAfetado), '#FDE68A', '#78350F')}
        {bloco('Impacto no ERP', Settings2, lista(c.impactoErp), '#1E1B2E', '#fff')}
        {bloco('O que precisamos fazer', ListChecks, lista(c.oQueFazer), '#fff', K.tinta, true)}
        {bloco('Atenção', AlertTriangle, lista(c.atencao), '#FCE7F3', '#9D174D', true)}
      </div>
      <Rodape c={c} assinatura={assinatura} dataGeracao={dataGeracao} corTexto={K.tinta} corDestaque={K.roxo} corFaixa={K.roxoEscuro} corFaixaTexto="rgba(255,255,255,0.7)" />
    </div>
  );
});
