'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { lerPerfilProdutoItens } from '@/lib/perfil-produto-reader';

type PerfilResumo = {
  id: string;
  nome: string;
  descricao: string | null;
  createdAt: string;
  _count: { itens: number };
};

type PerfilItem = { id: string; codigo: string; descricao: string | null };

type PerfilDetalhe = {
  id: string;
  nome: string;
  descricao: string | null;
  itens: PerfilItem[];
};

export default function PerfisProdutoPage() {
  const [perfis, setPerfis] = useState<PerfilResumo[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [novoNome, setNovoNome] = useState('');
  const [novaDescricao, setNovaDescricao] = useState('');
  const [criando, setCriando] = useState(false);

  const [perfilAbertoId, setPerfilAbertoId] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<PerfilDetalhe | null>(null);
  const [codigoManual, setCodigoManual] = useState('');
  const [descricaoManual, setDescricaoManual] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importando, setImportando] = useState(false);
  const [importResultado, setImportResultado] = useState<string | null>(null);

  const carregarPerfis = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/validacao-cadastro/perfis');
    if (res.ok) {
      const data = await res.json();
      setPerfis(data.perfis);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    carregarPerfis();
  }, [carregarPerfis]);

  async function carregarDetalhe(id: string) {
    const res = await fetch(`/api/validacao-cadastro/perfis/${id}`);
    if (res.ok) {
      const data = await res.json();
      setDetalhe(data.perfil);
    }
  }

  async function handleCriarPerfil() {
    if (!novoNome.trim()) return;
    setCriando(true);
    setErro(null);
    const res = await fetch('/api/validacao-cadastro/perfis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: novoNome.trim(), descricao: novaDescricao.trim() || null }),
    });
    const data = await res.json();
    setCriando(false);
    if (!res.ok) {
      setErro(data.error || 'Falha ao criar perfil.');
      return;
    }
    setNovoNome('');
    setNovaDescricao('');
    carregarPerfis();
  }

  async function handleExcluirPerfil(id: string, nome: string) {
    if (!confirm(`Excluir o perfil "${nome}" e todos os seus produtos cadastrados? Esta ação não pode ser desfeita.`)) return;
    await fetch(`/api/validacao-cadastro/perfis/${id}`, { method: 'DELETE' });
    if (perfilAbertoId === id) {
      setPerfilAbertoId(null);
      setDetalhe(null);
    }
    carregarPerfis();
  }

  async function togglePerfil(id: string) {
    if (perfilAbertoId === id) {
      setPerfilAbertoId(null);
      setDetalhe(null);
      return;
    }
    setPerfilAbertoId(id);
    setImportResultado(null);
    await carregarDetalhe(id);
  }

  async function handleAdicionarManual() {
    if (!perfilAbertoId || !codigoManual.trim()) return;
    const res = await fetch(`/api/validacao-cadastro/perfis/${perfilAbertoId}/itens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itens: [{ codigo: codigoManual.trim(), descricao: descricaoManual.trim() || null }] }),
    });
    if (res.ok) {
      setCodigoManual('');
      setDescricaoManual('');
      await carregarDetalhe(perfilAbertoId);
      carregarPerfis();
    }
  }

  async function handleImportarPlanilha(file: File) {
    if (!perfilAbertoId) return;
    setImportando(true);
    setImportResultado(null);
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
      const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null }) as unknown[][];
      const leitura = lerPerfilProdutoItens(aoa);
      if (leitura.erro) {
        setImportResultado(leitura.erro);
        setImportando(false);
        return;
      }
      const res = await fetch(`/api/validacao-cadastro/perfis/${perfilAbertoId}/itens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itens: leitura.rows }),
      });
      const data = await res.json();
      setImportando(false);
      if (!res.ok) {
        setImportResultado(data.error || 'Falha ao importar.');
        return;
      }
      setImportResultado(`${data.adicionados} código(s) novo(s) adicionado(s) de ${data.enviados} lido(s) na planilha.`);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await carregarDetalhe(perfilAbertoId);
      carregarPerfis();
    } catch (err) {
      setImportando(false);
      setImportResultado('Não foi possível ler o arquivo. Verifique se é um .xlsx válido.');
      console.error(err);
    }
  }

  async function handleExcluirItem(itemId: string) {
    if (!perfilAbertoId) return;
    await fetch(`/api/validacao-cadastro/perfis/${perfilAbertoId}/itens/${itemId}`, { method: 'DELETE' });
    await carregarDetalhe(perfilAbertoId);
    carregarPerfis();
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/validacao-cadastro" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand transition-colors mb-2 w-fit">
          <ArrowLeft size={15} />
          Voltar para Validação de Cadastro
        </Link>
        <h1 className="text-2xl font-display font-semibold text-brand">Perfis de Produtos</h1>
        <p className="text-gray-500 text-sm mt-1">
          Cadastre os Perfis de Produtos (Isentos, Combustíveis, Revenda etc.) e os códigos que pertencem a cada um —
          esta é a referência usada para auditar o cadastro de produtos da empresa.
        </p>
      </div>

      <div className="card-surface p-5 space-y-3">
        <h2 className="font-semibold text-brand text-sm">Novo perfil</h2>
        {erro && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{erro}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder="Nome do perfil, ex: Produtos Isentos"
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-64"
          />
          <input
            type="text"
            placeholder="Descrição (opcional)"
            value={novaDescricao}
            onChange={(e) => setNovaDescricao(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm flex-1 min-w-[200px]"
          />
          <button
            onClick={handleCriarPerfil}
            disabled={!novoNome.trim() || criando}
            className="bg-brand text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {criando ? 'Criando...' : 'Criar perfil'}
          </button>
        </div>
      </div>

      <div className="card-surface p-5">
        {loading && <p className="text-sm text-gray-400">Carregando...</p>}
        {!loading && perfis.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-8">Nenhum perfil cadastrado ainda. Crie o primeiro acima.</p>
        )}
        <div className="space-y-3">
          {perfis.map((p) => (
            <div key={p.id} className="border border-gray-100 rounded-lg">
              <div className="flex items-center justify-between px-4 py-3">
                <button onClick={() => togglePerfil(p.id)} className="flex items-center gap-2 text-left flex-1">
                  {perfilAbertoId === p.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  <div>
                    <p className="font-medium text-sm text-gray-800">{p.nome}</p>
                    {p.descricao && <p className="text-xs text-gray-400">{p.descricao}</p>}
                  </div>
                </button>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-gray-400 font-mono">{p._count.itens} produto(s)</span>
                  <button
                    onClick={() => handleExcluirPerfil(p.id, p.nome)}
                    className="text-xs border border-red-200 text-red-600 rounded-lg px-3 py-1.5"
                  >
                    Excluir
                  </button>
                </div>
              </div>

              {perfilAbertoId === p.id && detalhe && (
                <div className="border-t border-gray-100 px-4 py-4 space-y-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleImportarPlanilha(f);
                      }}
                      className="text-xs"
                    />
                    {importando && <span className="text-xs text-gray-400">Importando...</span>}
                  </div>
                  {importResultado && <p className="text-xs text-gray-500">{importResultado}</p>}

                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      placeholder="Código do produto"
                      value={codigoManual}
                      onChange={(e) => setCodigoManual(e.target.value)}
                      className="border border-gray-300 rounded-lg px-3 py-1.5 text-xs w-40"
                    />
                    <input
                      type="text"
                      placeholder="Descrição (opcional)"
                      value={descricaoManual}
                      onChange={(e) => setDescricaoManual(e.target.value)}
                      className="border border-gray-300 rounded-lg px-3 py-1.5 text-xs flex-1 min-w-[160px]"
                    />
                    <button
                      onClick={handleAdicionarManual}
                      disabled={!codigoManual.trim()}
                      className="bg-brand text-white rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                    >
                      Adicionar
                    </button>
                  </div>

                  <div className="overflow-x-auto max-h-80 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-gray-400 border-b border-gray-100">
                          <th className="py-1.5 pr-3">Código</th>
                          <th className="py-1.5 pr-3">Descrição</th>
                          <th className="py-1.5 pr-3"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {detalhe.itens.map((item) => (
                          <tr key={item.id} className="border-b border-gray-50">
                            <td className="py-1.5 pr-3 font-mono">{item.codigo}</td>
                            <td className="py-1.5 pr-3">{item.descricao}</td>
                            <td className="py-1.5 pr-3 text-right">
                              <button onClick={() => handleExcluirItem(item.id)} className="text-gray-400 hover:text-ruby">
                                <Trash2 size={13} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {detalhe.itens.length === 0 && (
                      <p className="text-xs text-gray-400 text-center py-6">Nenhum produto cadastrado neste perfil ainda.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
