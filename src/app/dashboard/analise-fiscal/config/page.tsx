'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

type TesRow = {
  id: string;
  codigo: string;
  grupo: string;
  chaveNf: 'obrigatoria' | 'proibida' | 'livre';
  permiteProdutos: boolean;
  validarCfopUf: boolean;
};

type CnpjRow = { id: string; nome: string; cnpj: string };

const CHAVE_NF_OPTIONS: TesRow['chaveNf'][] = ['obrigatoria', 'proibida', 'livre'];
const CHAVE_NF_LABELS: Record<TesRow['chaveNf'], string> = {
  obrigatoria: 'Obrigatória',
  proibida: 'Proibida',
  livre: 'Livre',
};

export default function AnaliseFiscalConfigPage() {
  const [tes, setTes] = useState<TesRow[]>([]);
  const [cnpjs, setCnpjs] = useState<CnpjRow[]>([]);
  const [erroTes, setErroTes] = useState<string | null>(null);
  const [erroCnpj, setErroCnpj] = useState<string | null>(null);

  const [novoCodigo, setNovoCodigo] = useState('');
  const [novoGrupo, setNovoGrupo] = useState('');
  const [novaChaveNf, setNovaChaveNf] = useState<TesRow['chaveNf']>('obrigatoria');
  const [novoPermiteProdutos, setNovoPermiteProdutos] = useState(true);
  const [novoValidarCfopUf, setNovoValidarCfopUf] = useState(true);

  const [novoNomeCnpj, setNovoNomeCnpj] = useState('');
  const [novoCnpj, setNovoCnpj] = useState('');

  const carregarTes = useCallback(async () => {
    const res = await fetch('/api/analise-fiscal/config/tes');
    if (res.ok) {
      const data = await res.json();
      setTes(data.tes);
    }
  }, []);

  const carregarCnpjs = useCallback(async () => {
    const res = await fetch('/api/analise-fiscal/config/cnpjs-grupo');
    if (res.ok) {
      const data = await res.json();
      setCnpjs(data.cnpjs);
    }
  }, []);

  useEffect(() => {
    carregarTes();
    carregarCnpjs();
  }, [carregarTes, carregarCnpjs]);

  async function handleAddTes(e: React.FormEvent) {
    e.preventDefault();
    setErroTes(null);
    const res = await fetch('/api/analise-fiscal/config/tes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        codigo: novoCodigo,
        grupo: novoGrupo,
        chaveNf: novaChaveNf,
        permiteProdutos: novoPermiteProdutos,
        validarCfopUf: novoValidarCfopUf,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setErroTes(data.error || 'Erro ao cadastrar TES.');
      return;
    }
    setNovoCodigo('');
    setNovoGrupo('');
    setNovaChaveNf('obrigatoria');
    setNovoPermiteProdutos(true);
    setNovoValidarCfopUf(true);
    carregarTes();
  }

  async function handleEditTes(id: string, campo: 'grupo' | 'chaveNf' | 'permiteProdutos' | 'validarCfopUf', valor: string | boolean) {
    await fetch(`/api/analise-fiscal/config/tes/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [campo]: valor }),
    });
    carregarTes();
  }

  async function handleRemoveTes(id: string, codigo: string) {
    if (!confirm(`Excluir a TES ${codigo}? Ela voltará a aparecer como "TES nova" na próxima apuração.`)) return;
    await fetch(`/api/analise-fiscal/config/tes/${id}`, { method: 'DELETE' });
    carregarTes();
  }

  async function handleAddCnpj(e: React.FormEvent) {
    e.preventDefault();
    setErroCnpj(null);
    const res = await fetch('/api/analise-fiscal/config/cnpjs-grupo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: novoNomeCnpj, cnpj: novoCnpj }),
    });
    const data = await res.json();
    if (!res.ok) {
      setErroCnpj(data.error || 'Erro ao cadastrar CNPJ.');
      return;
    }
    setNovoNomeCnpj('');
    setNovoCnpj('');
    carregarCnpjs();
  }

  async function handleRemoveCnpj(id: string, nome: string) {
    if (!confirm(`Remover "${nome}" da lista de CNPJs do grupo?`)) return;
    await fetch(`/api/analise-fiscal/config/cnpjs-grupo/${id}`, { method: 'DELETE' });
    carregarCnpjs();
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/analise-fiscal" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand transition-colors mb-2 w-fit">
          <ArrowLeft size={15} />
          Voltar
        </Link>
        <h1 className="text-2xl font-display font-semibold text-brand">Configurar Análise Fiscal</h1>
        <p className="text-gray-500 text-sm mt-1">
          Listas de referência usadas pelo motor de regras — cadastre uma TES nova para que ela pare de aparecer como
          &quot;TES nova&quot; e ganhe as checagens de Chave NF e produto. A lógica de regras profundas (cálculo de
          imposto, alíquota etc.) continua sendo implementada por código, não por aqui — para consultar o que cada
          regra valida, veja{' '}
          <Link href="/dashboard/analise-fiscal/regras" className="text-brand underline">Regras da Análise Fiscal</Link>.
        </p>
      </div>

      <div className="card-surface p-5 space-y-4">
        <h2 className="font-display font-semibold text-brand">TES cadastradas</h2>

        <form onSubmit={handleAddTes} className="flex flex-wrap items-end gap-3 border-b border-gray-100 pb-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Código</label>
            <input
              value={novoCodigo}
              onChange={(e) => setNovoCodigo(e.target.value)}
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-24"
              placeholder="ex: 146"
              required
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Grupo / rótulo</label>
            <input
              value={novoGrupo}
              onChange={(e) => setNovoGrupo(e.target.value)}
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-56"
              placeholder="ex: Serviços retenção IR/CSRF"
              required
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Chave NF</label>
            <select
              value={novaChaveNf}
              onChange={(e) => setNovaChaveNf(e.target.value as TesRow['chaveNf'])}
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
            >
              {CHAVE_NF_OPTIONS.map((c) => (
                <option key={c} value={c}>{CHAVE_NF_LABELS[c]}</option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-1.5 text-xs text-gray-600 pb-2">
            <input type="checkbox" checked={novoPermiteProdutos} onChange={(e) => setNovoPermiteProdutos(e.target.checked)} />
            Permite produtos
          </label>
          <label className="flex items-center gap-1.5 text-xs text-gray-600 pb-2">
            <input type="checkbox" checked={novoValidarCfopUf} onChange={(e) => setNovoValidarCfopUf(e.target.checked)} />
            Valida CFOP×UF
          </label>
          <button type="submit" className="bg-brand text-white rounded-lg px-4 py-2 text-sm font-medium">
            + Cadastrar TES
          </button>
          {erroTes && <p className="text-sm text-red-600 w-full">{erroTes}</p>}
        </form>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                <th className="py-2 pr-3">Código</th>
                <th className="py-2 pr-3">Grupo / rótulo</th>
                <th className="py-2 pr-3">Chave NF</th>
                <th className="py-2 pr-3">Permite produtos</th>
                <th className="py-2 pr-3">Valida CFOP×UF</th>
                <th className="py-2 pr-3"></th>
              </tr>
            </thead>
            <tbody>
              {tes.map((t) => (
                <tr key={t.id} className="border-b border-gray-50">
                  <td className="py-2 pr-3 font-mono">{t.codigo}</td>
                  <td className="py-2 pr-3">
                    <input
                      defaultValue={t.grupo}
                      onBlur={(e) => e.target.value !== t.grupo && handleEditTes(t.id, 'grupo', e.target.value)}
                      className="border border-gray-200 rounded-lg px-2 py-1 text-xs w-56"
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <select
                      value={t.chaveNf}
                      onChange={(e) => handleEditTes(t.id, 'chaveNf', e.target.value)}
                      className="border border-gray-300 rounded-lg px-2 py-1 text-xs"
                    >
                      {CHAVE_NF_OPTIONS.map((c) => (
                        <option key={c} value={c}>{CHAVE_NF_LABELS[c]}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      type="checkbox"
                      checked={t.permiteProdutos}
                      onChange={(e) => handleEditTes(t.id, 'permiteProdutos', e.target.checked)}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      type="checkbox"
                      checked={t.validarCfopUf}
                      onChange={(e) => handleEditTes(t.id, 'validarCfopUf', e.target.checked)}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <button onClick={() => handleRemoveTes(t.id, t.codigo)} className="text-xs text-red-500 underline">
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {tes.length === 0 && <p className="text-sm text-gray-400 text-center py-6">Carregando...</p>}
        </div>
      </div>

      <div className="card-surface p-5 space-y-4">
        <h2 className="font-display font-semibold text-brand">CNPJs do grupo (TES de transferência entre filiais)</h2>
        <p className="text-xs text-gray-500">
          Usado pela regra que valida o fornecedor/remetente da TES 138. Enquanto esta lista estiver vazia, essa
          checagem fica desligada.
        </p>

        <form onSubmit={handleAddCnpj} className="flex flex-wrap items-end gap-3 border-b border-gray-100 pb-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Nome</label>
            <input
              value={novoNomeCnpj}
              onChange={(e) => setNovoNomeCnpj(e.target.value)}
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-56"
              placeholder="ex: Filial Castanhal"
              required
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">CNPJ</label>
            <input
              value={novoCnpj}
              onChange={(e) => setNovoCnpj(e.target.value)}
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-48"
              placeholder="00.000.000/0000-00"
              required
            />
          </div>
          <button type="submit" className="bg-brand text-white rounded-lg px-4 py-2 text-sm font-medium">
            + Adicionar CNPJ
          </button>
          {erroCnpj && <p className="text-sm text-red-600 w-full">{erroCnpj}</p>}
        </form>

        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
              <th className="py-2 pr-3">Nome</th>
              <th className="py-2 pr-3">CNPJ</th>
              <th className="py-2 pr-3"></th>
            </tr>
          </thead>
          <tbody>
            {cnpjs.map((c) => (
              <tr key={c.id} className="border-b border-gray-50">
                <td className="py-2 pr-3">{c.nome}</td>
                <td className="py-2 pr-3 font-mono">{c.cnpj}</td>
                <td className="py-2 pr-3">
                  <button onClick={() => handleRemoveCnpj(c.id, c.nome)} className="text-xs text-red-500 underline">
                    Remover
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {cnpjs.length === 0 && <p className="text-sm text-gray-400 text-center py-6">Nenhum CNPJ cadastrado ainda.</p>}
      </div>
    </div>
  );
}
