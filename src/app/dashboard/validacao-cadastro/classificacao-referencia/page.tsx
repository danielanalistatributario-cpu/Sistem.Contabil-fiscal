'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import * as XLSX from 'xlsx';
import { ImportHero } from '@/components/ImportHero';
import { lerClassificacaoReferencia } from '@/lib/classificacao-produto-referencia-reader';

function formatarDataHora(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR');
}

export default function ClassificacaoReferenciaPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [totalImportado, setTotalImportado] = useState<number | null>(null);
  const [status, setStatus] = useState<{ total: number; empresaGrupoId: string | null; importadoEm: string | null } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function carregarStatus() {
    const res = await fetch('/api/validacao-cadastro/classificacao-referencia');
    if (res.ok) setStatus(await res.json());
  }

  useEffect(() => {
    carregarStatus();
  }, []);

  async function handleImportar() {
    if (!file) return;
    setLoading(true);
    setErro(null);
    setAviso(null);
    setTotalImportado(null);
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
      const leitura = lerClassificacaoReferencia(wb);
      if (leitura.erro) {
        setErro(leitura.erro);
        return;
      }
      if (leitura.abasIgnoradas.length > 0) {
        setAviso(`Abas ignoradas (sem cabeçalho reconhecido): ${leitura.abasIgnoradas.join(', ')}.`);
      }

      const res = await fetch('/api/validacao-cadastro/classificacao-referencia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linhas: leitura.linhas }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErro(data.error || 'Falha ao importar.');
        return;
      }
      setTotalImportado(data.total);
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
      carregarStatus();
    } catch (err) {
      setErro('Não foi possível ler o arquivo.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <ImportHero
        eyebrow="Auditoria de cadastro · Classificação de referência"
        titleParts={['Importar', { text: 'Classificação', accent: true }, 'Correta']}
        description="Importe uma planilha com o perfil/CST correto de cada produto (ex: estudo de reclassificação para a Reforma Tributária IBS/CBS) — uma aba por perfil, cada uma com os produtos que pertencem a ele. A Validação de Cadastro passa a indicar não só se o produto está sem perfil ou duplicado, mas qual é o perfil correto para cadastrar."
        badges={['Cadastro independente por filial', 'Uma aba por perfil']}
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
          A importação usa a Filial selecionada no topo da tela — é obrigatório ter uma filial selecionada, porque
          esse cadastro é sempre independente por filial. Importar de novo substitui completamente o cadastro
          anterior dessa filial.
        </p>

        {status && (
          <p className="text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
            {status.empresaGrupoId
              ? status.total > 0
                ? `${status.total} produto(s) classificado(s) para esta filial — importado em ${formatarDataHora(status.importadoEm)}.`
                : 'Nenhuma classificação de referência importada ainda para esta filial.'
              : 'Nenhuma filial selecionada no topo da tela.'}
          </p>
        )}

        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="text-sm"
        />
        <div>
          <button
            onClick={handleImportar}
            disabled={!file || loading}
            className="bg-brand text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {loading ? 'Importando...' : 'Importar Classificação de Referência'}
          </button>
        </div>
        {erro && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{erro}</p>}
        {aviso && <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">{aviso}</p>}
        {totalImportado !== null && (
          <p className="text-sm text-green-700">{totalImportado} produto(s) importado(s) com sucesso.</p>
        )}
      </div>
    </div>
  );
}
