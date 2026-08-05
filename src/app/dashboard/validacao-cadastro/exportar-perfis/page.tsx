'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import * as XLSX from 'xlsx';
import { ImportHero } from '@/components/ImportHero';

type LinhaPerfilProduto = {
  perfilCodigo: string;
  produtoCodigo: string;
  produtoDescricao: string | null;
  produtoTipo: string | null;
  produtoGrupo: string | null;
  aplicaATodos: boolean;
};

export default function ExportarPerfisPage() {
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [totalExportado, setTotalExportado] = useState<number | null>(null);

  async function handleExportar() {
    setLoading(true);
    setErro(null);
    setTotalExportado(null);
    try {
      const res = await fetch('/api/validacao-cadastro/perfis-protheus');
      const data = await res.json();
      if (!res.ok) {
        setErro(data.error || 'Falha ao exportar.');
        return;
      }

      const linhas: LinhaPerfilProduto[] = data.linhas;
      const ws = XLSX.utils.json_to_sheet(
        linhas.map((l) => ({
          'Código do Perfil': l.perfilCodigo,
          'Descrição do Perfil': l.perfilCodigo,
          'Código do Produto': l.aplicaATodos ? '' : l.produtoCodigo,
          'Descrição do Produto': l.aplicaATodos ? '' : l.produtoDescricao || '',
          'Tipo do Produto': l.aplicaATodos ? '' : l.produtoTipo || '',
          'Grupo do Produto': l.aplicaATodos ? '' : l.produtoGrupo || '',
          'Aplica a todos os produtos': l.aplicaATodos ? 'Sim' : 'Não',
        }))
      );
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Perfis de Produto');
      XLSX.writeFile(wb, `Perfis_Produto_Protheus_${new Date().toISOString().slice(0, 10)}.xlsx`);
      setTotalExportado(linhas.length);
    } catch (err) {
      setErro('Não foi possível gerar o arquivo.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <ImportHero
        eyebrow="Auditoria de cadastro · Perfis de Produtos"
        titleParts={['Exportar', { text: 'Perfis', accent: true }, 'do Protheus']}
        description="Consulta ao vivo a tabela de Perfis de Produto do Protheus da empresa ativa e gera um Excel com todos os produtos vinculados a cada perfil, pronto para conferências e auditorias."
        badges={['Consulta ao vivo no Protheus', 'Um arquivo por empresa ativa']}
      />

      <Link
        href="/dashboard/validacao-cadastro"
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand transition-colors w-fit"
      >
        <ArrowLeft size={15} />
        Voltar para Validação de Cadastro
      </Link>

      <div className="card-surface p-5 space-y-3 max-w-lg">
        <p className="text-xs text-gray-500">
          A exportação usa a empresa selecionada atualmente no topo da tela. Troque de empresa antes de exportar, se
          necessário.
        </p>
        <button
          onClick={handleExportar}
          disabled={loading}
          className="bg-brand text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {loading ? 'Consultando Protheus...' : 'Exportar Perfis de Produto (Excel)'}
        </button>
        {erro && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{erro}</p>}
        {totalExportado !== null && (
          <p className="text-sm text-green-700">
            {totalExportado} linha(s) exportada(s) com sucesso.
          </p>
        )}
      </div>
    </div>
  );
}
