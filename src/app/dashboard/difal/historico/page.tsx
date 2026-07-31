'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

type ApuracaoResumo = {
  id: string;
  periodo: string;
  ufDestino: string;
  aliquotaInterna: number;
  totalItens: number;
  itensComDifal: number;
  itensSemDados: number;
  valorTotalDifal: number;
  processedAt: string;
};

function fmtBRL(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function HistoricoDifalPage() {
  const [apuracoes, setApuracoes] = useState<ApuracaoResumo[]>([]);
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/difal/apuracoes');
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
    if (!confirm('Excluir esta apuração de DIFAL? Esta ação não pode ser desfeita.')) return;
    await fetch(`/api/difal/apuracoes/${id}`, { method: 'DELETE' });
    carregar();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-semibold text-brand">Histórico de Apurações — DIFAL</h1>
        <p className="text-gray-500 text-sm mt-1">Consulte apurações de DIFAL de períodos anteriores.</p>
      </div>

      <div className="card-surface p-5">
        {loading && <p className="text-sm text-gray-400">Carregando...</p>}
        {!loading && apuracoes.length === 0 && (
          <div className="text-center py-10 text-gray-400">
            <p className="text-2xl mb-2">🗂</p>
            <p className="text-sm">
              Nenhuma apuração salva ainda. Processe um período em{' '}
              <Link href="/dashboard/difal" className="text-brand underline">DIFAL — Diferencial de Alíquota</Link>.
            </p>
          </div>
        )}
        <div className="space-y-3">
          {apuracoes.map((a) => (
            <div key={a.id} className="flex items-center justify-between border border-gray-100 rounded-lg px-4 py-3">
              <div>
                <h4 className="font-medium text-sm text-gray-800">
                  Período {a.periodo}
                  {a.itensSemDados > 0 && (
                    <span className="ml-2 text-[10px] bg-red-100 text-red-700 rounded-full px-2 py-0.5">
                      {a.itensSemDados} inconsistência(s)
                    </span>
                  )}
                </h4>
                <p className="text-xs text-gray-400 font-mono mt-1">
                  {new Date(a.processedAt).toLocaleString('pt-BR')} · {a.totalItens} item(ns) · DIFAL total{' '}
                  {fmtBRL(a.valorTotalDifal)}
                </p>
              </div>
              <div className="flex gap-2">
                <Link
                  href={`/dashboard/difal?apuracaoId=${a.id}`}
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
