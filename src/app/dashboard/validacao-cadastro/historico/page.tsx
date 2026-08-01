'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

type ApuracaoResumo = {
  id: string;
  periodo: string | null;
  totalItens: number;
  totalOk: number;
  totalDivergente: number;
  totalSemPerfil: number;
  totalDuplicado: number;
  processedAt: string;
};

export default function HistoricoValidacaoCadastroPage() {
  const [apuracoes, setApuracoes] = useState<ApuracaoResumo[]>([]);
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/validacao-cadastro/apuracoes');
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
    if (!confirm('Excluir esta validação de cadastro? Esta ação não pode ser desfeita.')) return;
    await fetch(`/api/validacao-cadastro/apuracoes/${id}`, { method: 'DELETE' });
    carregar();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-semibold text-brand">Histórico — Validação de Cadastro de Produtos</h1>
        <p className="text-gray-500 text-sm mt-1">Consulte validações de cadastro de produtos realizadas anteriormente.</p>
      </div>

      <div className="card-surface p-5">
        {loading && <p className="text-sm text-gray-400">Carregando...</p>}
        {!loading && apuracoes.length === 0 && (
          <div className="text-center py-10 text-gray-400">
            <p className="text-2xl mb-2">🗂</p>
            <p className="text-sm">
              Nenhuma validação salva ainda. Processe um cadastro em{' '}
              <Link href="/dashboard/validacao-cadastro" className="text-brand underline">Validação de Cadastro de Produtos</Link>.
            </p>
          </div>
        )}
        <div className="space-y-3">
          {apuracoes.map((a) => (
            <div key={a.id} className="flex items-center justify-between border border-gray-100 rounded-lg px-4 py-3">
              <div>
                <h4 className="font-medium text-sm text-gray-800">
                  {a.periodo || 'Sem período informado'}
                  {(a.totalDivergente > 0 || a.totalDuplicado > 0) && (
                    <span className="ml-2 text-[10px] bg-red-100 text-red-700 rounded-full px-2 py-0.5">
                      {a.totalDivergente + a.totalDuplicado} alerta(s)
                    </span>
                  )}
                </h4>
                <p className="text-xs text-gray-400 font-mono mt-1">
                  {new Date(a.processedAt).toLocaleString('pt-BR')} · {a.totalItens} produto(s) · {a.totalOk} OK ·{' '}
                  {a.totalDivergente} divergente(s) · {a.totalSemPerfil} sem perfil · {a.totalDuplicado} duplicado(s)
                </p>
              </div>
              <div className="flex gap-2">
                <Link
                  href={`/dashboard/validacao-cadastro?apuracaoId=${a.id}`}
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
