'use client';

import { useMemo, useState } from 'react';
import type { Ocorrencia, ResultadoValidacao, SituacaoOcorrencia } from '@/lib/validador-xml/tipos';
import { ROTULO_GRAVIDADE } from '@/lib/validador-xml/tipos';

// Painel de um XML validado: veredito + índice de conformidade, resumo em
// quadros (estilo auditoria) e o detalhe de cada ocorrência.

export const ROTULO_OCORRENCIA: Record<Exclude<SituacaoOcorrencia, 'CONFORME'>, { titulo: string; cor: string; faixa: string }> = {
  AUSENTE: { titulo: '❌ TAG OBRIGATÓRIA AUSENTE', cor: 'text-red-700', faixa: 'border-l-red-500' },
  INDEVIDO: { titulo: '❌ TAG INDEVIDA', cor: 'text-red-700', faixa: 'border-l-red-500' },
  DIVERGENTE: { titulo: '⚠️ DIVERGÊNCIA DE PREENCHIMENTO', cor: 'text-orange-700', faixa: 'border-l-orange-500' },
  NAO_EXIGIVEL: { titulo: '🟡 AINDA NÃO EXIGÍVEL', cor: 'text-amber-700', faixa: 'border-l-amber-400' },
  NAO_VALIDAVEL: { titulo: '⚪ NÃO VALIDÁVEL AUTOMATICAMENTE', cor: 'text-gray-600', faixa: 'border-l-gray-300' },
};

const COR_GRAVIDADE: Record<string, string> = {
  CRITICO: 'bg-red-100 text-red-700',
  ALTO: 'bg-orange-100 text-orange-700',
  MEDIO: 'bg-amber-100 text-amber-700',
  BAIXO: 'bg-gray-100 text-gray-600',
};

// Validações gravadas antes de 03/11/2026 trazem "leiaute" nas referências; o termo usado é "layout".
const termo = (t: string) => t.replace(/leiaute/gi, (m) => (m[0] === 'L' ? 'Layout' : 'layout'));

function fmtDoc(d: string | null) {
  if (!d) return '—';
  const n = d.replace(/\D/g, '');
  if (n.length === 14) return n.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (n.length === 11) return n.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return d;
}
const fmtData = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '—');

function Quadro({ valor, rotulo, cor }: { valor: number; rotulo: string; cor: string }) {
  return (
    <div className={`rounded-lg px-3 py-2 border ${cor}`}>
      <p className="text-[10px] uppercase tracking-wide opacity-80">{rotulo}</p>
      <p className="text-xl font-bold">{valor}</p>
    </div>
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wide text-gray-400">{rotulo}</p>
      <div className="text-xs text-gray-800 break-words">{children}</div>
    </div>
  );
}

function CartaoOcorrencia({ o }: { o: Ocorrencia }) {
  const rot = ROTULO_OCORRENCIA[o.situacao as Exclude<SituacaoOcorrencia, 'CONFORME'>];
  return (
    <div className={`border border-gray-100 border-l-4 ${rot.faixa} rounded-lg p-3 bg-white`}>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className={`text-xs font-semibold ${rot.cor}`}>{rot.titulo}</span>
        <span className={`text-[10px] px-2 py-0.5 rounded-full ${COR_GRAVIDADE[o.gravidade]}`}>{ROTULO_GRAVIDADE[o.gravidade]}</span>
        {o.situacaoSeVigente && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
            seria {o.situacaoSeVigente.toLowerCase()} após a vigência
          </span>
        )}
        {o.rejeicao && <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">rejeição {o.rejeicao}</span>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
        <Campo rotulo="Item (tag/campo)">
          <code>{o.item}</code>
          {o.nItem ? ` — item ${o.nItem}` : ''}
        </Campo>
        <Campo rotulo="Localização">
          <code className="text-[11px]">{o.localizacao}</code>
        </Campo>
        <Campo rotulo="Regra da Nota Técnica">{termo(o.regra)}</Campo>
        <Campo rotulo="Referência">{termo(o.referencia)}</Campo>
        {(o.valorEncontrado !== null || o.valorEsperado !== null) && (
          <>
            <Campo rotulo="Valor encontrado">{o.valorEncontrado ?? '—'}</Campo>
            <Campo rotulo="Valor esperado">{o.valorEsperado ? termo(o.valorEsperado) : '—'}</Campo>
          </>
        )}
      </div>
      <p className="text-xs text-gray-700 mt-2 bg-gray-50 rounded px-2 py-1.5">
        <strong>Orientação:</strong> {termo(o.orientacao)}
      </p>
    </div>
  );
}

const FILTROS: { chave: 'TODAS' | Exclude<SituacaoOcorrencia, 'CONFORME'>; rotulo: string }[] = [
  { chave: 'TODAS', rotulo: 'Todas' },
  { chave: 'AUSENTE', rotulo: 'Ausentes' },
  { chave: 'INDEVIDO', rotulo: 'Indevidos' },
  { chave: 'DIVERGENTE', rotulo: 'Divergências' },
  { chave: 'NAO_EXIGIVEL', rotulo: 'Alertas (não exigíveis)' },
  { chave: 'NAO_VALIDAVEL', rotulo: 'Não validáveis' },
];

export default function ResultadoXml({ r, normaRotulo, ignorouVigencia }: { r: ResultadoValidacao; normaRotulo: string; ignorouVigencia?: boolean }) {
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]['chave']>('TODAS');
  const [todas, setTodas] = useState(false);

  // o que precisa de correção vem primeiro; alertas e itens não validáveis por último
  const visiveis = useMemo(() => {
    const ordem: Record<string, number> = { AUSENTE: 0, INDEVIDO: 1, DIVERGENTE: 2, NAO_EXIGIVEL: 3, NAO_VALIDAVEL: 4 };
    return r.ocorrencias
      .filter((o) => filtro === 'TODAS' || o.situacao === filtro)
      .map((o, i) => ({ o, i }))
      .sort((a, b) => (ordem[a.o.situacao] ?? 9) - (ordem[b.o.situacao] ?? 9) || a.i - b.i)
      .map((x) => x.o);
  }, [r.ocorrencias, filtro]);
  const contagemPor = useMemo(() => {
    const m: Record<string, number> = {};
    for (const o of r.ocorrencias) m[o.situacao] = (m[o.situacao] ?? 0) + 1;
    return m;
  }, [r.ocorrencias]);

  if (r.veredito === 'ERRO') {
    return <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{r.erro}</p>;
  }

  const c = r.contagens;
  const aprovado = r.veredito === 'CONFORME';
  const corVeredito =
    r.veredito === 'CONFORME' ? 'bg-green-50 border-green-200 text-green-800' : r.veredito === 'DIVERGENTE' ? 'bg-red-50 border-red-200 text-red-800' : 'bg-gray-50 border-gray-200 text-gray-700';
  const limite = todas ? visiveis.length : 60;

  return (
    <div className="space-y-4">
      <div className={`rounded-xl border px-4 py-3 ${corVeredito}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-display font-semibold text-base">
              {aprovado ? '🟢 XML de acordo com a Nota Técnica' : r.veredito === 'DIVERGENTE' ? '🔴 XML com divergências em relação à Nota Técnica' : '⚪ Nenhuma regra aplicável a este XML'}
            </p>
            <p className="text-xs opacity-80 mt-0.5">
              {normaRotulo}
              {ignorouVigencia ? ' · conferida como se já estivesse em vigor' : ''}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wide opacity-70">Conformidade</p>
            <p className="text-3xl font-bold leading-none">{r.conformidade === null ? '—' : `${r.conformidade}%`}</p>
          </div>
        </div>
        <p className="text-[11px] opacity-75 mt-2">
          Como é calculada: média, por regra aplicável, da proporção de conferências aprovadas, ponderada pela gravidade (Crítico 10 · Alto 5 · Médio 2 · Baixo 1). Alertas de vigência futura, regras não aplicáveis e itens não validáveis ficam fora do cálculo.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <Quadro valor={c.conformes} rotulo="🟢 Conformes" cor="bg-green-50 border-green-100 text-green-800" />
        <Quadro valor={c.alertas} rotulo="🟡 Alertas" cor="bg-amber-50 border-amber-100 text-amber-800" />
        <Quadro valor={c.divergencias} rotulo="🔴 Divergências" cor="bg-red-50 border-red-100 text-red-800" />
        <Quadro valor={c.ausentes} rotulo="⚫ Obrigatórios ausentes" cor="bg-gray-100 border-gray-200 text-gray-800" />
        <Quadro valor={c.indevidos} rotulo="⚠️ Campos indevidos" cor="bg-orange-50 border-orange-100 text-orange-800" />
        <Quadro valor={c.naoValidaveis} rotulo="⚪ Não validáveis" cor="bg-white border-gray-200 text-gray-600" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-2 border border-gray-100 rounded-lg p-3 bg-gray-50/50">
        <Campo rotulo="NF-e / modelo / série">
          nº {r.numero ?? '—'} · modelo {r.modelo ?? '—'} · série {r.serie ?? '—'}
        </Campo>
        <Campo rotulo="Emissão / ambiente">
          {fmtData(r.emissao)} · {r.tpAmb === '2' ? 'homologação' : r.tpAmb === '1' ? 'produção' : '—'}
        </Campo>
        <Campo rotulo="Chave de acesso">
          <code className="text-[11px]">{r.chave ?? '—'}</code>
        </Campo>
        <Campo rotulo="Emitente">
          {fmtDoc(r.emitente.doc)} {r.emitente.nome ? `— ${r.emitente.nome}` : ''}
        </Campo>
        <Campo rotulo="Destinatário">
          {fmtDoc(r.destinatario.doc)} {r.destinatario.nome ? `— ${r.destinatario.nome}` : ''}
        </Campo>
        <Campo rotulo="Regras sem efeito neste XML">{c.regrasNaoAplicaveis} regra(s) não se aplicaram (condição não atendida)</Campo>
      </div>

      {r.ocorrencias.length === 0 ? (
        <p className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2">Nenhuma ocorrência: todas as regras aplicáveis foram atendidas.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {FILTROS.filter((f) => f.chave === 'TODAS' || contagemPor[f.chave]).map((f) => (
              <button
                key={f.chave}
                onClick={() => {
                  setFiltro(f.chave);
                  setTodas(false);
                }}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                  filtro === f.chave ? 'bg-brand text-white border-brand' : 'bg-white border-gray-300 text-gray-600 hover:border-brand'
                }`}
              >
                {f.rotulo} ({f.chave === 'TODAS' ? r.ocorrencias.length : contagemPor[f.chave]})
              </button>
            ))}
          </div>
          <div className="space-y-2">
            {visiveis.slice(0, limite).map((o, i) => (
              <CartaoOcorrencia key={i} o={o} />
            ))}
          </div>
          {visiveis.length > limite && (
            <button onClick={() => setTodas(true)} className="text-xs text-brand underline">
              Mostrar as {visiveis.length - limite} restantes
            </button>
          )}
        </>
      )}
    </div>
  );
}
