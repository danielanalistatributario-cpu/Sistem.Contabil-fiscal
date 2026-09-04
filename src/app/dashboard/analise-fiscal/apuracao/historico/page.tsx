'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

type ApuracaoResumo = {
  id: string;
  periodo: string | null;
  createdAt: string;
  entradaApuracaoId: string | null;
  saidaApuracaoId: string | null;
  resumo: {
    saldoDevedor: number;
    impostoARecolher: number;
    saldoCredorTransportar: number;
  } | null;
};

function fmt(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function HistoricoApuracaoFiscalPage() {
  const [apuracoes, setApuracoes] = useState<ApuracaoResumo[]>([]);
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/analise-fiscal/apuracao');
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
    if (!confirm('Excluir esta Apuração Fiscal? Esta ação não pode ser desfeita.')) return;
    await fetch(`/api/analise-fiscal/apuracao/${id}`, { method: 'DELETE' });
    carregar();
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/analise-fiscal/apuracao" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand transition-colors mb-2 w-fit">
          <ArrowLeft size={15} />
          Apuração Fiscal
        </Link>
        <h1 className="text-2xl font-display font-semibold text-brand">Histórico — Apuração Fiscal</h1>
        <p className="text-gray-500 text-sm mt-1">Consulte apurações do ICMS geradas anteriormente.</p>
      </div>

      <div className="card-surface p-5">
        {loading && <p className="text-sm text-gray-400">Carregando...</p>}
        {!loading && apuracoes.length === 0 && (
          <div className="text-center py-10 text-gray-400">
            <p className="text-2xl mb-2">🗂</p>
            <p className="text-sm">
              Nenhuma apuração gerada ainda. Gere uma em{' '}
              <Link href="/dashboard/analise-fiscal/apuracao" className="text-brand underline">Apuração Fiscal</Link>.
            </p>
          </div>
        )}
        <div className="space-y-3">
          {apuracoes.map((a) => (
            <div key={a.id} className="flex items-center justify-between border border-gray-100 rounded-lg px-4 py-3">
              <div>
                <h4 className="font-medium text-sm text-gray-800">
                  {a.periodo || 'Sem período informado'}
                  {!a.entradaApuracaoId && (
                    <span className="ml-2 text-[10px] bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">sem Entradas</span>
                  )}
                  {!a.saidaApuracaoId && (
                    <span className="ml-2 text-[10px] bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">sem Saídas</span>
                  )}
                  {a.resumo && a.resumo.impostoARecolher > 0 && (
                    <span className="ml-2 text-[10px] bg-ruby/10 text-ruby rounded-full px-2 py-0.5">
                      A recolher: R$ {fmt(a.resumo.impostoARecolher)}
                    </span>
                  )}
                  {a.resumo && a.resumo.saldoCredorTransportar > 0 && (
                    <span className="ml-2 text-[10px] bg-teal/10 text-teal rounded-full px-2 py-0.5">
                      Saldo credor: R$ {fmt(a.resumo.saldoCredorTransportar)}
                    </span>
                  )}
                </h4>
                <p className="text-xs text-gray-400 font-mono mt-1">
                  gerada em {new Date(a.createdAt).toLocaleString('pt-BR')}
                </p>
              </div>
              <div className="flex gap-2">
                <Link
                  href={`/dashboard/analise-fiscal/apuracao?apuracaoId=${a.id}`}
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
