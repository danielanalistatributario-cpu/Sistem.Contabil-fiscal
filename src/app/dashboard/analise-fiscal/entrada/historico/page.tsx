'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

type ApuracaoResumo = {
  id: string;
  periodo: string | null;
  fileName: string | null;
  totalLinhas: number;
  totalNotas: number;
  totalDivergencias: number;
  qtdCritico: number;
  qtdAlto: number;
  qtdMedio: number;
  qtdBaixo: number;
  qtdInformativo: number;
  qtdTesNovas: number;
  processedAt: string;
};

export default function HistoricoAnaliseFiscalEntradaPage() {
  const [apuracoes, setApuracoes] = useState<ApuracaoResumo[]>([]);
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/analise-fiscal/apuracoes');
    if (res.ok) {
      const data = await res.json();
      setApuracoes(data.apuracoes);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function handleDelete(id: string) {
    if (!confirm('Excluir esta análise fiscal? Esta ação não pode ser desfeita.')) return;
    await fetch(`/api/analise-fiscal/apuracoes/${id}`, { method: 'DELETE' });
    carregar();
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/analise-fiscal/entrada" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand transition-colors mb-2 w-fit">
          <ArrowLeft size={15} />
          Análise de Entradas
        </Link>
        <h1 className="text-2xl font-display font-semibold text-brand">Histórico — Análise de Entradas</h1>
        <p className="text-gray-500 text-sm mt-1">Consulte análises do Relatório de Entradas realizadas anteriormente.</p>
      </div>

      <div className="card-surface p-5">
        {loading && <p className="text-sm text-gray-400">Carregando...</p>}
        {!loading && apuracoes.length === 0 && (
          <div className="text-center py-10 text-gray-400">
            <p className="text-2xl mb-2">🗂</p>
            <p className="text-sm">
              Nenhuma análise salva ainda. Processe um relatório em{' '}
              <Link href="/dashboard/analise-fiscal/entrada" className="text-brand underline">Análise de Entradas</Link>.
            </p>
          </div>
        )}
        <div className="space-y-3">
          {apuracoes.map((a) => (
            <div key={a.id} className="flex items-center justify-between border border-gray-100 rounded-lg px-4 py-3">
              <div>
                <h4 className="font-medium text-sm text-gray-800">
                  {a.periodo || a.fileName || 'Sem período informado'}
                  {a.qtdCritico > 0 && (
                    <span className="ml-2 text-[10px] bg-red-100 text-red-700 rounded-full px-2 py-0.5">
                      {a.qtdCritico} crítica(s)
                    </span>
                  )}
                  {a.qtdTesNovas > 0 && (
                    <span className="ml-2 text-[10px] bg-teal/10 text-teal rounded-full px-2 py-0.5">
                      {a.qtdTesNovas} TES nova(s)
                    </span>
                  )}
                </h4>
                <p className="text-xs text-gray-400 font-mono mt-1">
                  {new Date(a.processedAt).toLocaleString('pt-BR')} · {a.totalLinhas} linha(s) · {a.totalNotas} nota(s) ·{' '}
                  {a.totalDivergencias} divergência(s) ({a.qtdCritico} crít. · {a.qtdAlto} alta · {a.qtdMedio} média · {a.qtdBaixo} baixa)
                </p>
              </div>
              <div className="flex gap-2">
                <Link
                  href={`/dashboard/analise-fiscal/entrada?apuracaoId=${a.id}`}
                  className="text-xs border border-gray-300 rounded-lg px-3 py-1.5"
                >
                  Abrir
                </Link>
                <button onClick={() => handleDelete(a.id)} className="text-xs border border-red-200 text-red-600 rounded-lg px-3 py-1.5">
                  Excluir
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
