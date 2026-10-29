'use client';

import { forwardRef } from 'react';
import { CalendarClock, Users, ListChecks, Settings2, AlertTriangle, BookOpen, Sparkles } from 'lucide-react';
import type { Comunicado, Marco } from '@/lib/legislacao/tipos';
import type { Assinatura } from '@/lib/legislacao/formatar';
import type { ModeloVisual } from '@/lib/legislacao/modelos';
import { ModeloLinhaDoTempo, ModeloAlerta, ModeloExecutivo, ModeloMosaico } from './ModelosComunicado';

// Comunicado visual de uma página (infográfico corporativo) gerado a
// partir da análise. Largura fixa de 1080px — o formato que melhor
// sobrevive à compressão do WhatsApp/Teams — e altura conforme o
// conteúdo. Estilos inline (e não só Tailwind) porque o html-to-image
// clona o nó pra gerar o PNG e precisa de tudo resolvido no próprio
// elemento.

const C = {
  verde: '#00753A',
  verdeEscuro: '#00401F',
  verdeClaro: '#E8F3EC',
  laranja: '#F6921E',
  laranjaEscuro: '#B45F06',
  laranjaClaro: '#FFF4E6',
  tinta: '#1F2A24',
  cinza: '#5B6660',
  fundo: '#F4F7F5',
  linha: '#DCE6E0',
};

const fonteTitulo = 'var(--font-display), "Space Grotesk", system-ui, sans-serif';
const fonteTexto = 'var(--font-sans), Inter, system-ui, sans-serif';

function TituloBloco({ icone: Icone, texto, cor = C.verde }: { icone: typeof Users; texto: string; cor?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
      <span style={{ width: 34, height: 34, borderRadius: 10, background: cor, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icone size={19} color="#fff" strokeWidth={2.2} />
      </span>
      <span style={{ fontFamily: fonteTitulo, fontWeight: 700, fontSize: 19, letterSpacing: 0.6, color: cor, textTransform: 'uppercase' }}>{texto}</span>
    </div>
  );
}

const cartao: React.CSSProperties = { background: '#fff', borderRadius: 18, padding: '22px 24px', border: `1px solid ${C.linha}` };

export type ComunicadoVisualProps = {
  comunicado: Comunicado;
  assinatura: Assinatura;
  tipoDocumento: string;
  dataGeracao: string; // DD/MM/AAAA
};

const ModeloCorporativo = forwardRef<HTMLDivElement, ComunicadoVisualProps>(function ModeloCorporativo({ comunicado: c, assinatura, tipoDocumento, dataGeracao }, ref) {
  return (
    <div ref={ref} style={{ width: 1080, background: C.fundo, fontFamily: fonteTexto, color: C.tinta, boxSizing: 'border-box' }}>
      {/* Cabeçalho */}
      <div style={{ position: 'relative', overflow: 'hidden', background: `linear-gradient(135deg, ${C.verde} 0%, ${C.verdeEscuro} 100%)`, color: '#fff', padding: '46px 56px 50px' }}>
        <div style={{ position: 'absolute', right: -120, top: -160, width: 420, height: 420, borderRadius: '50%', border: '50px solid rgba(255,255,255,0.05)' }} />
        <div style={{ position: 'absolute', right: 120, bottom: -220, width: 360, height: 360, borderRadius: '50%', border: '36px solid rgba(246,146,30,0.10)' }} />
        <div style={{ position: 'relative', display: 'flex', gap: 36, alignItems: 'stretch' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 999, padding: '6px 14px', fontSize: 13, fontWeight: 600, letterSpacing: 1.6, textTransform: 'uppercase' }}>
              <Sparkles size={14} color={C.laranja} />
              Comunicado fiscal{tipoDocumento ? ` · ${tipoDocumento}` : ''}
            </div>
            <h1 style={{ fontFamily: fonteTitulo, fontWeight: 700, fontSize: 50, lineHeight: 1.08, margin: '20px 0 0', letterSpacing: -0.5 }}>{c.titulo}</h1>
            {c.subtitulo && <p style={{ fontSize: 21, lineHeight: 1.45, margin: '16px 0 0', color: 'rgba(255,255,255,0.86)' }}>{c.subtitulo}</p>}
          </div>
          {c.dataDestaque && (
            <div style={{ width: 250, flexShrink: 0, background: C.laranja, borderRadius: 22, padding: '24px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'center', boxShadow: '0 18px 40px -16px rgba(0,0,0,0.45)' }}>
              <CalendarClock size={30} color="#fff" strokeWidth={2} />
              <div style={{ fontSize: 15, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginTop: 12, color: 'rgba(255,255,255,0.92)' }}>{c.dataDestaqueRotulo || 'Data importante'}</div>
              <div style={{ fontFamily: fonteTitulo, fontWeight: 700, fontSize: c.dataDestaque.length > 10 ? 30 : 40, lineHeight: 1.1, marginTop: 6 }}>{c.dataDestaque}</div>
            </div>
          )}
        </div>
      </div>

      {/* Corpo */}
      <div style={{ padding: '34px 56px 10px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {c.oQueMudou.length > 0 && (
            <div style={cartao}>
              <TituloBloco icone={Sparkles} texto="O que mudou?" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {c.oQueMudou.map((m, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <span style={{ flexShrink: 0, width: 28, height: 28, borderRadius: '50%', background: C.verdeClaro, color: C.verde, fontWeight: 700, fontSize: 15, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
                    <span style={{ fontSize: 18, lineHeight: 1.45 }}>{m}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {c.quemEAfetado.length > 0 && (
            <div style={cartao}>
              <TituloBloco icone={Users} texto="Quem é afetado?" />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {c.quemEAfetado.map((q, i) => (
                  <span key={i} style={{ background: C.verdeClaro, color: C.verdeEscuro, borderRadius: 12, padding: '9px 14px', fontSize: 16.5, fontWeight: 500, lineHeight: 1.3 }}>{q}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {c.oQueFazer.length > 0 && (
            <div style={{ ...cartao, borderTop: `5px solid ${C.laranja}` }}>
              <TituloBloco icone={ListChecks} texto="O que precisamos fazer?" cor={C.laranjaEscuro} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {c.oQueFazer.map((f, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <span style={{ flexShrink: 0, width: 22, height: 22, marginTop: 2, borderRadius: 6, border: `2.5px solid ${C.laranja}`, background: '#fff' }} />
                    <span style={{ fontSize: 18, lineHeight: 1.4 }}>{f}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {c.impactoErp.length > 0 && (
            <div style={{ ...cartao, background: C.verdeEscuro, color: '#fff', border: 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <span style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(255,255,255,0.14)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Settings2 size={19} color={C.laranja} strokeWidth={2.2} />
                </span>
                <span style={{ fontFamily: fonteTitulo, fontWeight: 700, fontSize: 19, letterSpacing: 0.6, textTransform: 'uppercase' }}>Impacto no ERP</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {c.impactoErp.map((e, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 17.5, lineHeight: 1.4 }}>
                    <span style={{ flexShrink: 0, width: 8, height: 8, borderRadius: 2, background: C.laranja, marginTop: 9 }} />
                    <span style={{ color: 'rgba(255,255,255,0.92)' }}>{e}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {c.atencao.length > 0 && (
        <div style={{ margin: '14px 56px 0', background: C.laranjaClaro, border: `2px solid ${C.laranja}`, borderRadius: 18, padding: '20px 24px', display: 'flex', gap: 18, alignItems: 'flex-start' }}>
          <AlertTriangle size={34} color={C.laranjaEscuro} strokeWidth={2.2} style={{ flexShrink: 0 }} />
          <div>
            <div style={{ fontFamily: fonteTitulo, fontWeight: 700, fontSize: 19, letterSpacing: 0.6, color: C.laranjaEscuro, textTransform: 'uppercase', marginBottom: 6 }}>Atenção</div>
            {c.atencao.map((a, i) => (
              <div key={i} style={{ fontSize: 17.5, lineHeight: 1.45, color: C.tinta }}>• {a}</div>
            ))}
          </div>
        </div>
      )}

      {/* Rodapé */}
      <div style={{ margin: '28px 56px 0', paddingBottom: 30, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 30 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', maxWidth: 560 }}>
          <BookOpen size={20} color={C.verde} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: 1.4, color: C.verde, textTransform: 'uppercase' }}>Fonte</div>
            <div style={{ fontSize: 15.5, color: C.cinza, lineHeight: 1.4 }}>{c.fonte || '—'}</div>
          </div>
        </div>
        <div style={{ textAlign: 'right', borderLeft: `4px solid ${C.laranja}`, paddingLeft: 16 }}>
          <div style={{ fontFamily: fonteTitulo, fontWeight: 700, fontSize: 21, color: C.verdeEscuro }}>{assinatura.nome}</div>
          <div style={{ fontSize: 15.5, color: C.cinza }}>{[assinatura.cargo, assinatura.setor].filter(Boolean).join(' · ')}</div>
        </div>
      </div>
      <div style={{ display: 'flex', height: 10 }}>
        <div style={{ flex: 4, background: C.verde }} />
        <div style={{ flex: 1, background: C.laranja }} />
      </div>
      <div style={{ background: C.verdeEscuro, color: 'rgba(255,255,255,0.6)', fontSize: 12.5, padding: '10px 56px', display: 'flex', justifyContent: 'space-between' }}>
        <span>Analista Tributário</span>
        <span>Emitido em {dataGeracao}</span>
      </div>
    </div>
  );
});

// Escolhe o layout pelo modelo (ver lib/legislacao/modelos.ts).
const ComunicadoVisual = forwardRef<HTMLDivElement, ComunicadoVisualProps & { modelo?: ModeloVisual; marcos?: Marco[] }>(function ComunicadoVisual({ modelo = 'corporativo', marcos, ...props }, ref) {
  if (modelo === 'linha-do-tempo') return <ModeloLinhaDoTempo ref={ref} {...props} marcos={marcos} />;
  if (modelo === 'alerta') return <ModeloAlerta ref={ref} {...props} />;
  if (modelo === 'executivo') return <ModeloExecutivo ref={ref} {...props} />;
  if (modelo === 'mosaico') return <ModeloMosaico ref={ref} {...props} />;
  return <ModeloCorporativo ref={ref} {...props} />;
});

export default ComunicadoVisual;
