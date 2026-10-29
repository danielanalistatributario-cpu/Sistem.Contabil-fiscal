'use client';

import { useState } from 'react';
import { BookMarked, Quote } from 'lucide-react';
import type { Fonte, ItemFonte, Marco, Natureza, ItemComparacao } from '@/lib/legislacao/tipos';
import { ROTULO_MARCO } from '@/lib/legislacao/tipos';
import { fmtData } from '@/lib/legislacao/formatar';

// Peças visuais da tela de resultado do Analisador de Legislação.

export function SeloNatureza({ natureza }: { natureza: Natureza }) {
  return natureza === 'expresso' ? (
    <span className="text-[10px] font-semibold uppercase tracking-wide bg-green-50 text-green-700 border border-green-200 rounded px-1.5 py-0.5" title="Está escrito no documento">
      Expresso
    </span>
  ) : (
    <span className="text-[10px] font-semibold uppercase tracking-wide bg-violet-50 text-violet-700 border border-violet-200 rounded px-1.5 py-0.5" title="Leitura técnica / recomendação — não é texto literal da norma">
      Interpretação
    </span>
  );
}

// Referência à página/dispositivo; clicar mostra o trecho do documento.
export function RefFonte({ fonte }: { fonte: Fonte | null | undefined }) {
  const [aberto, setAberto] = useState(false);
  if (!fonte || (!fonte.pagina && !fonte.dispositivo && !fonte.trecho)) return null;
  const rotulo = [fonte.pagina ? `p. ${fonte.pagina}` : '', fonte.dispositivo].filter(Boolean).join(' · ') || 'trecho';
  return (
    <span className="inline">
      <button
        onClick={() => fonte.trecho && setAberto((v) => !v)}
        className={`inline-flex items-center gap-1 text-[11px] font-mono text-brand/80 bg-brand/[0.06] rounded px-1.5 py-0.5 ${fonte.trecho ? 'hover:bg-brand/10 cursor-pointer' : 'cursor-default'}`}
        title={fonte.trecho ? 'Ver trecho do documento' : undefined}
      >
        <BookMarked size={11} /> {rotulo}
      </button>
      {aberto && fonte.trecho && (
        <span className="block mt-1.5 text-xs text-gray-600 bg-gray-50 border-l-2 border-brand/40 rounded-r px-3 py-2 italic">
          <Quote size={11} className="inline mr-1 text-brand/50" />
          {fonte.trecho}
        </span>
      )}
    </span>
  );
}

export function Secao({ titulo, icone, children, vazio }: { titulo: string; icone?: React.ReactNode; children: React.ReactNode; vazio?: boolean }) {
  return (
    <div className="card-surface p-5">
      <h3 className="font-display font-semibold text-gray-800 flex items-center gap-2 mb-3">
        {icone}
        {titulo}
      </h3>
      {vazio ? <p className="text-sm text-gray-400">Nada identificado no documento.</p> : children}
    </div>
  );
}

export function ListaItensFonte({ itens }: { itens: ItemFonte[] }) {
  return (
    <ul className="space-y-2.5">
      {itens.map((i, n) => (
        <li key={n} className="text-sm text-gray-700 leading-relaxed">
          <span className="mr-1.5">{i.descricao}</span>
          <span className="inline-flex flex-wrap gap-1.5 align-middle">
            <SeloNatureza natureza={i.natureza} />
            <RefFonte fonte={i.fonte} />
          </span>
        </li>
      ))}
    </ul>
  );
}

const COR_MARCO: Record<string, string> = {
  publicacao: 'bg-sky-500',
  inicio_vigencia: 'bg-brand',
  periodo_adaptacao: 'bg-teal',
  prazo_adequacao: 'bg-accent',
  obrigatoriedade: 'bg-ruby',
  producao: 'bg-brand-deep',
  homologacao: 'bg-lime',
  encerramento: 'bg-gray-500',
  outro: 'bg-gray-400',
};

export function LinhaDoTempo({ marcos }: { marcos: Marco[] }) {
  const hoje = new Date().toISOString().slice(0, 10);
  const ordenados = [...marcos].sort((a, b) => (a.data || '9999').localeCompare(b.data || '9999'));
  return (
    <ol className="relative border-l-2 border-gray-100 ml-3 space-y-6">
      {ordenados.map((m, i) => {
        const passou = m.data && m.data < hoje;
        return (
          <li key={i} className="ml-6">
            <span className={`absolute -left-[9px] w-4 h-4 rounded-full ring-4 ring-white ${COR_MARCO[m.tipo] ?? 'bg-gray-400'}`} />
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-display font-semibold text-lg text-gray-800">{fmtData(m.data) || m.dataTexto || 'Sem data definida'}</span>
              <span className="text-[11px] uppercase tracking-wider font-semibold text-gray-500">{ROTULO_MARCO[m.tipo] ?? m.tipo}</span>
              {m.data && <span className={`text-[10px] rounded-full px-2 py-0.5 ${passou ? 'bg-gray-100 text-gray-500' : 'bg-amber-100 text-amber-700'}`}>{passou ? 'já passou' : 'a vencer'}</span>}
            </div>
            <p className="text-sm text-gray-700 mt-1">{m.descricao}</p>
            <div className="mt-1 flex flex-wrap gap-2 items-center">
              {m.data && m.dataTexto && <span className="text-xs text-gray-400">&quot;{m.dataTexto}&quot;</span>}
              <RefFonte fonte={m.fonte} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function ListaComparacao({ itens, cor }: { itens: ItemComparacao[]; cor: string }) {
  return (
    <ul className="space-y-3">
      {itens.map((i, n) => (
        <li key={n} className={`border-l-4 ${cor} bg-gray-50/60 rounded-r-lg px-4 py-3`}>
          <p className="text-sm text-gray-800 font-medium">{i.descricao}</p>
          {(i.antes || i.depois) && (
            <div className="grid md:grid-cols-2 gap-2 mt-2 text-xs">
              {i.antes && (
                <div className="bg-red-50/70 rounded px-2.5 py-1.5">
                  <span className="font-semibold text-red-700">Antes (A): </span>
                  <span className="text-gray-700">{i.antes}</span>
                </div>
              )}
              {i.depois && (
                <div className="bg-green-50/70 rounded px-2.5 py-1.5">
                  <span className="font-semibold text-green-700">Depois (B): </span>
                  <span className="text-gray-700">{i.depois}</span>
                </div>
              )}
            </div>
          )}
          <div className="flex flex-wrap gap-1.5 mt-2 items-center">
            <SeloNatureza natureza={i.natureza} />
            {i.paginaA > 0 && <span className="text-[11px] font-mono text-gray-500 bg-white border border-gray-200 rounded px-1.5">A p. {i.paginaA}</span>}
            {i.paginaB > 0 && <span className="text-[11px] font-mono text-gray-500 bg-white border border-gray-200 rounded px-1.5">B p. {i.paginaB}</span>}
          </div>
        </li>
      ))}
    </ul>
  );
}
