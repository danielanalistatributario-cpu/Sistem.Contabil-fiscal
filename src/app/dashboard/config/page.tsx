'use client';

import { useState, useEffect, useCallback } from 'react';

export default function ConfigPage() {
  const [ufDestino, setUfDestino] = useState('');
  const [aliquotaInterna, setAliquotaInterna] = useState('');
  const [protheusSufixo, setProtheusSufixo] = useState('');
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/company/config');
    if (res.ok) {
      const data = await res.json();
      setUfDestino(data.ufDestino);
      setAliquotaInterna((data.aliquotaInterna * 100).toString());
      setProtheusSufixo(data.protheusSufixo || '');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setErro(null);
    setSalvando(true);
    const res = await fetch('/api/company/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ufDestino,
        aliquotaInterna: parseFloat(aliquotaInterna) / 100,
        protheusSufixo,
      }),
    });
    const data = await res.json();
    setSalvando(false);
    if (!res.ok) {
      setErro(data.error || 'Falha ao salvar.');
      return;
    }
    setMsg('Configuração salva com sucesso.');
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-semibold text-brand">Configurações Fiscais da Empresa</h1>
        <p className="text-gray-500 text-sm mt-1">
          Define a UF do estabelecimento e a alíquota interna de ICMS, usadas no cálculo do DIFAL (e futuros módulos
          fiscais) para a empresa atualmente selecionada.
        </p>
      </div>

      <div className="card-surface p-5 max-w-md">
        {loading ? (
          <p className="text-sm text-gray-400">Carregando...</p>
        ) : (
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">UF do estabelecimento (destino)</label>
              <input
                value={ufDestino}
                onChange={(e) => setUfDestino(e.target.value.toUpperCase())}
                maxLength={2}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-24"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Alíquota interna de ICMS (%)</label>
              <input
                type="number"
                step="0.01"
                value={aliquotaInterna}
                onChange={(e) => setAliquotaInterna(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-24"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Sufixo da tabela no Protheus (ex: 140)</label>
              <input
                value={protheusSufixo}
                onChange={(e) => setProtheusSufixo(e.target.value.replace(/\D/g, ''))}
                maxLength={4}
                placeholder="140"
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-24"
              />
              <p className="text-[11px] text-gray-400 mt-1">
                Identifica qual tabela do Protheus pertence a esta empresa (ex: F24140). Usado pela Validação de
                Cadastro para consultar só os dados desta empresa.
              </p>
            </div>
            {erro && <p className="text-sm text-red-600">{erro}</p>}
            {msg && <p className="text-sm text-green-700">{msg}</p>}
            <button
              type="submit"
              disabled={salvando}
              className="bg-brand text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {salvando ? 'Salvando...' : 'Salvar'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
