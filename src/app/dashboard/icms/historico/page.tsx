'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

type ApuracaoResumo = {
  id: string;
  periodo: string;
  semPagamento: boolean;
  totalNF: number;
  qtdPagas: number;
  qtdPendentes: number;
  valorPago: number;
  valorPendente: number;
  processedAt: string;
};

function fmtBRL(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function HistoricoPage() {
  const [apuracoes, setApuracoes] = useState<ApuracaoResumo[]>([]);
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/icms/apuracoes');
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
    if (!confirm('Excluir esta apuração? Esta ação não pode ser desfeita.')) return;
    await fetch(`/api/icms/apuracoes/${id}`, { method: 'DELETE' });
    carregar();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-semibold text-brand">Histórico de Apurações</h1>
        <p className="text-gray-500 text-sm mt-1">Consulte apurações de períodos anteriores do ICMS Antecipado Especial.</p>
      </div>

      <div className="card-surface p-5">
        {loading && <p className="text-sm text-gray-400">Carregando...</p>}
        {!loading && apuracoes.length === 0 && (
          <div className="text-center py-10 text-gray-400">
            <p className="text-2xl mb-2">🗂</p>
            <p className="text-sm">
              Nenhuma apuração salva ainda. Processe um período em{' '}
              <Link href="/dashboard/icms" className="text-brand underline">Importar dados</Link>.
            </p>
          </div>
        )}
        <div className="space-y-3">
          {apuracoes.map((a) => (
            <div key={a.id} className="flex items-center justify-between border border-gray-100 rounded-lg px-4 py-3">
              <div>
                <h4 className="font-medium text-sm text-gray-800">
                  Período {a.periodo}
                  {a.semPagamento && (
                    <span className="ml-2 text-[10px] bg-gray-100 border border-gray-200 rounded-full px-2 py-0.5 text-gray-500">
                      sem pagamento no mês
                    </span>
                  )}
                </h4>
                <p className="text-xs text-gray-400 font-mono mt-1">
                  {new Date(a.processedAt).toLocaleString('pt-BR')} · {a.totalNF} notas · {a.qtdPendentes} pendente(s) ·{' '}
                  {fmtBRL(a.valorPendente)}
                </p>
              </div>
              <div className="flex gap-2">
                <Link
                  href={`/dashboard/icms?apuracaoId=${a.id}`}
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
