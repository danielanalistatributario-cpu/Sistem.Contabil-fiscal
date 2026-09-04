'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

type RegraResumo = { id: string; descricao: string };

type TesRegra = {
  codigo: string;
  grupo: string;
  chaveNf: 'obrigatoria' | 'proibida' | 'livre';
  permiteProdutos: boolean;
  validarCfopUf: boolean;
  regras: RegraResumo[];
};

const CHAVE_NF_LABELS: Record<TesRegra['chaveNf'], string> = {
  obrigatoria: 'Obrigatória',
  proibida: 'Proibida',
  livre: 'Livre',
};

const CHAVE_NF_COLOR: Record<TesRegra['chaveNf'], string> = {
  obrigatoria: 'bg-teal/10 text-teal',
  proibida: 'bg-ruby/10 text-ruby',
  livre: 'bg-gray-100 text-gray-600',
};

export default function RegrasAnaliseFiscalPage() {
  const [regrasGerais, setRegrasGerais] = useState<RegraResumo[]>([]);
  const [tes, setTes] = useState<TesRegra[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/analise-fiscal/regras');
      if (res.ok) {
        const data = await res.json();
        setRegrasGerais(data.regrasGerais);
        setTes(data.tes);
      }
      setLoading(false);
    })();
  }, []);

  const tesFiltradas = useMemo(() => {
    const buscaNorm = busca.trim().toLowerCase();
    if (!buscaNorm) return tes;
    return tes.filter((t) => {
      const alvo = `${t.codigo} ${t.grupo} ${t.regras.map((r) => r.descricao).join(' ')}`.toLowerCase();
      return alvo.includes(buscaNorm);
    });
  }, [tes, busca]);

  const totalComRegraProfunda = tes.filter((t) => t.regras.length > 0).length;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/analise-fiscal" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand transition-colors mb-2 w-fit">
          <ArrowLeft size={15} />
          Voltar
        </Link>
        <h1 className="text-2xl font-display font-semibold text-brand">Regras da Análise Fiscal</h1>
        <p className="text-gray-500 text-sm mt-1">
          Consulta de todas as validações que o sistema aplica hoje — o que roda em toda TES (regras gerais) e o que é
          específico de cada TES. Somente consulta: para mudar o comportamento de uma TES (Chave NF, produtos, CFOP×UF)
          use a tela{' '}
          <Link href="/dashboard/analise-fiscal/config" className="text-brand underline">Configurar TES</Link>.
        </p>
      </div>

      {loading && <p className="text-sm text-gray-400">Carregando...</p>}

      {!loading && (
        <>
          <div className="card-surface p-5 space-y-3">
            <h2 className="font-display font-semibold text-brand">
              Regras gerais <span className="text-xs font-normal text-gray-400">— aplicam a toda TES (com as exceções indicadas em cada uma)</span>
            </h2>
            <ul className="space-y-2">
              {regrasGerais.map((r) => (
                <li key={r.id} className="text-sm text-gray-700 flex gap-2">
                  <span className="text-accent shrink-0">•</span>
                  <span>{r.descricao}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs text-gray-400">
              {tes.length} TES cadastradas · {totalComRegraProfunda} com regra específica além das gerais
            </p>
            <input
              type="text"
              placeholder="Buscar por código, grupo ou palavra-chave..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-72"
            />
          </div>

          <div className="space-y-3">
            {tesFiltradas.map((t) => (
              <div key={t.codigo} className="card-surface p-4">
                <div className="flex flex-wrap items-center gap-3 mb-2">
                  <span className="font-mono font-semibold text-brand text-base">{t.codigo}</span>
                  <span className="text-sm text-gray-700">{t.grupo}</span>
                  <div className="flex flex-wrap gap-1.5 ml-auto">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${CHAVE_NF_COLOR[t.chaveNf]}`}>
                      Chave NF: {CHAVE_NF_LABELS[t.chaveNf]}
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${t.permiteProdutos ? 'bg-gray-100 text-gray-600' : 'bg-ruby/10 text-ruby'}`}>
                      {t.permiteProdutos ? 'Permite produtos' : 'Só serviço'}
                    </span>
                    {!t.validarCfopUf && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                        Não valida CFOP×UF
                      </span>
                    )}
                  </div>
                </div>

                {t.regras.length > 0 ? (
                  <ul className="space-y-1.5 mt-2">
                    {t.regras.map((r) => (
                      <li key={r.id} className="text-xs text-gray-600 flex gap-2">
                        <span className="text-teal shrink-0">•</span>
                        <span>{r.descricao}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-gray-400 mt-1">
                    Sem regra específica — roda só com os metadados acima e as regras gerais.
                  </p>
                )}
              </div>
            ))}
            {tesFiltradas.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-8">Nenhuma TES encontrada para esta busca.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
