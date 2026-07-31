'use client';

import { useState, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { ImportHero, ImportTrustNote } from '@/components/ImportHero';

type SpedLine = { registro: string; bloco: string; campos: string[]; linhaOriginal: number };

type UploadResult = {
  spedFileId: string;
  fileName: string;
  competencia: string | null;
  nomeEmpresa: string | null;
  totalLinhas: number;
  porBloco: Record<string, number>;
  porRegistro: Record<string, number>;
  linhas: SpedLine[];
};

const BLOCO_DESCRICOES: Record<string, string> = {
  '0': 'Abertura, Identificação e Referências',
  C: 'Documentos Fiscais I (Mercadorias)',
  D: 'Documentos Fiscais II (Serviços)',
  E: 'Apuração do ICMS e do IPI',
  G: 'Controle do Crédito de ICMS do Ativo Permanente',
  H: 'Inventário Físico',
  K: 'Controle da Produção e do Estoque',
  '1': 'Outras Informações',
  '9': 'Controle e Encerramento do Arquivo',
};

export default function SpedPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [filtroRegistro, setFiltroRegistro] = useState<string>('TODOS');
  const [filtroBloco, setFiltroBloco] = useState<string>('TODOS');
  const [gerandoRelatorioModelo, setGerandoRelatorioModelo] = useState(false);
  const [erroRelatorioModelo, setErroRelatorioModelo] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleGerarRelatorioModelo() {
    if (!file) return;
    setGerandoRelatorioModelo(true);
    setErroRelatorioModelo(null);

    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch('/api/sped/relatorio-nfe', { method: 'POST', body: formData });
    setGerandoRelatorioModelo(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErroRelatorioModelo(data.error || 'Falha ao gerar o relatório.');
      return;
    }

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `NFe_Entrada_Saida_${file.name.replace(/\.[^.]+$/, '')}.xlsx`;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch('/api/sped/upload', { method: 'POST', body: formData });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error || 'Falha ao processar o arquivo.');
      return;
    }
    setResult(data);
  }

  const linhasFiltradas = useMemo(() => {
    if (!result) return [];
    return result.linhas.filter((l) => {
      if (filtroBloco !== 'TODOS' && l.bloco !== filtroBloco) return false;
      if (filtroRegistro !== 'TODOS' && l.registro !== filtroRegistro) return false;
      return true;
    });
  }, [result, filtroBloco, filtroRegistro]);

  function handleExportExcel() {
    if (!result) return;
    const workbook = XLSX.utils.book_new();

    // Uma aba por bloco, com os registros daquele bloco
    const blocos = Array.from(new Set(result.linhas.map((l) => l.bloco))).sort();
    blocos.forEach((bloco) => {
      const linhasBloco = result.linhas.filter((l) => l.bloco === bloco);
      const maxCampos = Math.max(...linhasBloco.map((l) => l.campos.length), 0);
      const rows = linhasBloco.map((l) => {
        const row: Record<string, string | number> = { Linha: l.linhaOriginal, Registro: l.registro };
        for (let i = 0; i < maxCampos; i++) row[`Campo${i + 1}`] = l.campos[i] ?? '';
        return row;
      });
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(workbook, ws, `Bloco ${bloco}`.slice(0, 31));
    });

    // Aba resumo
    const resumoRows = Object.entries(result.porBloco).map(([bloco, qtd]) => ({
      Bloco: bloco,
      Descrição: BLOCO_DESCRICOES[bloco] || 'N/A',
      'Qtd. Registros': qtd,
    }));
    const wsResumo = XLSX.utils.json_to_sheet(resumoRows);
    XLSX.utils.book_append_sheet(workbook, wsResumo, 'Resumo');

    XLSX.writeFile(workbook, `sped-fiscal-${result.fileName.replace(/\.[^.]+$/, '')}.xlsx`);
  }

  const registrosDisponiveis = result
    ? Array.from(new Set(result.linhas.map((l) => l.registro))).sort()
    : [];
  const blocosDisponiveis = result ? Array.from(new Set(result.linhas.map((l) => l.bloco))).sort() : [];

  return (
    <div className="space-y-6">
      {!result && (
        <ImportHero
          eyebrow="EFD ICMS/IPI — Blocos 0, C e E"
          titleParts={['SPED', '→', { text: 'Relatório de Entrada', accent: true }, 'de NF-e']}
          description="Envie o arquivo .txt do SPED Fiscal e receba o resumo por blocos/registros, pronto para exportar em Excel — inclusive no layout exato do seu modelo, cabeçalho (C100), itens (C170), participantes (0150) e produtos (0200) já cruzados, linha por item."
          badges={['Processamento local, sem envio a servidor', 'Layout idêntico ao modelo enviado']}
        />
      )}

      {!result && (
        <div>
          <h1 className="sr-only">Conversor de SPED Fiscal para Excel</h1>
          <form onSubmit={handleUpload}>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`card-surface border-2 border-dashed cursor-pointer text-center px-6 py-14 transition-all duration-200 ${
                dragging ? 'border-brand bg-brand/5' : file ? 'border-lime bg-lime/5' : 'border-gray-200'
              }`}
            >
              <p className="font-display text-lg font-semibold text-gray-800">Arraste o arquivo SPED Fiscal aqui</p>
              <p className="text-sm text-gray-500 mt-1.5">Arquivo texto (.txt) do EFD ICMS/IPI exportado pelo PVA</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="hidden"
              />
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                className="mt-5 bg-brand text-white rounded-xl px-5 py-2.5 text-sm font-medium shadow-card hover:shadow-card-hover transition-all"
              >
                Selecionar arquivo
              </button>
              {file && <p className="mt-4 text-xs font-mono text-brand bg-brand/5 inline-block px-3 py-1 rounded-full">📄 {file.name}</p>}
            </div>
            <div className="flex items-center justify-between mt-4">
              <ImportTrustNote text="O arquivo é lido e convertido inteiramente no seu navegador — nenhum dado fiscal sai da sua máquina." />
              <button
                type="submit"
                disabled={!file || loading}
                className="bg-brand text-white rounded-xl px-5 py-2.5 text-sm font-medium disabled:opacity-40 shadow-card hover:shadow-card-hover transition-all shrink-0 ml-4"
              >
                {loading ? 'Processando...' : 'Importar arquivo'}
              </button>
            </div>
          </form>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {result && (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-display font-semibold text-brand">Conversor de SPED Fiscal para Excel</h1>
              <p className="text-gray-500 text-sm mt-1">Resumo do arquivo importado — filtre, confira e exporte.</p>
            </div>
            <button
              onClick={() => { setResult(null); setFile(null); }}
              className="text-sm text-brand underline whitespace-nowrap"
            >
              + Novo arquivo
            </button>
          </div>

          <div className="card-surface p-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-gray-400 uppercase">Arquivo</p>
              <p className="text-sm font-medium text-gray-800">{result.fileName}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase">Empresa (Reg. 0000)</p>
              <p className="text-sm font-medium text-gray-800">{result.nomeEmpresa || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase">Competência</p>
              <p className="text-sm font-medium text-gray-800">{result.competencia || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase">Total de linhas</p>

              <p className="text-sm font-medium text-gray-800">{result.totalLinhas}</p>
            </div>
          </div>

          <div className="card-surface p-5 border border-accent/30">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-brand">Relatório "NF-e de Entrada e Saída" (layout do modelo)</h2>
                <p className="text-xs text-gray-500 mt-1 max-w-xl">
                  Gera o Excel já organizado por item de nota fiscal (a partir dos registros C100/C170), no
                  layout, colunas e formatação do modelo enviado pela empresa — pronto para análise, sem ajustes
                  manuais.
                </p>
              </div>
              <button
                onClick={handleGerarRelatorioModelo}
                disabled={gerandoRelatorioModelo}
                className="bg-accent text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 whitespace-nowrap"
              >
                {gerandoRelatorioModelo ? 'Gerando...' : 'Gerar relatório (layout do modelo)'}
              </button>
            </div>
            {erroRelatorioModelo && <p className="text-sm text-red-600 mt-3">{erroRelatorioModelo}</p>}
          </div>

          <div className="card-surface p-5">
            <h2 className="font-semibold text-brand mb-3">Resumo por bloco</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {Object.entries(result.porBloco).map(([bloco, qtd]) => (
                <div key={bloco} className="border border-gray-100 rounded-lg p-3">
                  <p className="text-xs text-gray-400">Bloco {bloco}</p>
                  <p className="text-lg font-bold text-gray-800">{qtd}</p>
                  <p className="text-[11px] text-gray-400 leading-tight">{BLOCO_DESCRICOES[bloco] || ''}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="card-surface p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h2 className="font-semibold text-brand">Registros ({linhasFiltradas.length})</h2>
              <div className="flex gap-2">
                <select
                  value={filtroBloco}
                  onChange={(e) => {
                    setFiltroBloco(e.target.value);
                    setFiltroRegistro('TODOS');
                  }}
                  className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                >
                  <option value="TODOS">Todos os blocos</option>
                  {blocosDisponiveis.map((b) => (
                    <option key={b} value={b}>
                      Bloco {b}
                    </option>
                  ))}
                </select>
                <select
                  value={filtroRegistro}
                  onChange={(e) => setFiltroRegistro(e.target.value)}
                  className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                >
                  <option value="TODOS">Todos os registros</option>
                  {registrosDisponiveis
                    .filter((r) => filtroBloco === 'TODOS' || r.startsWith(filtroBloco))
                    .map((r) => (
                      <option key={r} value={r}>
                        {r} ({result.porRegistro[r]})
                      </option>
                    ))}
                </select>
                <button
                  onClick={handleExportExcel}
                  className="bg-accent text-white rounded-lg px-3 py-1.5 text-sm font-medium hover:opacity-90"
                >
                  Exportar para Excel
                </button>
              </div>
            </div>

            <div className="overflow-x-auto max-h-96 overflow-y-auto border border-gray-100 rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-gray-500">Linha</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-500">Registro</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-500">Campos</th>
                  </tr>
                </thead>
                <tbody>
                  {linhasFiltradas.slice(0, 300).map((l) => (
                    <tr key={l.linhaOriginal} className="border-t border-gray-50">
                      <td className="px-3 py-1.5 text-gray-400">{l.linhaOriginal}</td>
                      <td className="px-3 py-1.5 font-medium text-brand">{l.registro}</td>
                      <td className="px-3 py-1.5 text-gray-600 truncate max-w-xl">{l.campos.join(' | ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {linhasFiltradas.length > 300 && (
                <p className="text-xs text-gray-400 text-center py-2">
                  Mostrando as primeiras 300 de {linhasFiltradas.length} linhas — exporte para Excel para ver todas.
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
