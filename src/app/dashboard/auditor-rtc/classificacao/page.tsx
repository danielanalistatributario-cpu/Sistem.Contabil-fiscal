'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Search, FileDown, FileText } from 'lucide-react';
import * as XLSX from 'xlsx';

type Cclasstrib = {
  codigo: string;
  cstCodigo: string;
  descricao: string;
  tipoAliquota: string | null;
  percentualReducao: number | null;
  fundamentoLegal: string | null;
  fonte: string;
  observacao: string | null;
  cst: { codigo: string; descricao: string; fonte: string };
};

type NcmClassificacao = {
  id: string;
  ncm: string;
  descricaoNcm: string | null;
  cclasstribCodigo: string;
  anexo: string | null;
  fundamentoLegal: string | null;
  fonte: string;
  observacao: string | null;
  cclasstrib: Cclasstrib;
};

type Resultado = {
  ncmPesquisado: string | null;
  descricaoPesquisada: string | null;
  resultadosNcm: NcmClassificacao[];
  resultadosCclasstrib: Cclasstrib[];
  avisoPadrao: Cclasstrib | null;
};

function fmtReducao(v: number | null): string {
  if (v === null || v === undefined) return '—';
  return `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
}

export default function ClassificacaoTributariaPage() {
  const [descricao, setDescricao] = useState('');
  const [ncm, setNcm] = useState('');
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  async function handlePesquisar(e: React.FormEvent) {
    e.preventDefault();
    if (!descricao.trim() && !ncm.trim()) {
      setErro('Informe a descrição do produto ou o NCM.');
      return;
    }
    setErro(null);
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (descricao.trim()) params.set('descricao', descricao.trim());
      if (ncm.trim()) params.set('ncm', ncm.trim());
      const res = await fetch(`/api/auditor-rtc/classificacao/pesquisar?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        setErro(data.error || 'Falha ao pesquisar.');
        setResultado(null);
        return;
      }
      setResultado(data);
    } catch {
      setErro('Falha ao pesquisar.');
    } finally {
      setLoading(false);
    }
  }

  function exportarExcel() {
    if (!resultado) return;
    const wb = XLSX.utils.book_new();
    const rows = resultado.resultadosNcm.map((r) => ({
      NCM: r.ncm,
      'Descrição do Produto': r.descricaoNcm || '',
      cClassTrib: r.cclasstribCodigo,
      CST: r.cclasstrib.cstCodigo,
      Anexo: r.anexo || '',
      'Descrição do Tratamento': r.cclasstrib.descricao,
      'Tipo de Alíquota': r.cclasstrib.tipoAliquota || '',
      'Redução (%)': r.cclasstrib.percentualReducao != null ? r.cclasstrib.percentualReducao * 100 : '',
      'Fundamento Legal': r.fundamentoLegal || r.cclasstrib.fundamentoLegal || '',
      Fonte: r.fonte,
      Observação: r.observacao || '',
    }));
    if (resultado.avisoPadrao && rows.length === 0) {
      rows.push({
        NCM: resultado.ncmPesquisado || '',
        'Descrição do Produto': '(não encontrado em Anexo — tratamento padrão)',
        cClassTrib: resultado.avisoPadrao.codigo,
        CST: resultado.avisoPadrao.cstCodigo,
        Anexo: '',
        'Descrição do Tratamento': resultado.avisoPadrao.descricao,
        'Tipo de Alíquota': resultado.avisoPadrao.tipoAliquota || '',
        'Redução (%)': '',
        'Fundamento Legal': resultado.avisoPadrao.fundamentoLegal || '',
        Fonte: resultado.avisoPadrao.fonte,
        Observação: '',
      });
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Classificação por NCM');

    if (resultado.resultadosCclasstrib.length > 0) {
      const rowsC = resultado.resultadosCclasstrib.map((c) => ({
        cClassTrib: c.codigo,
        CST: c.cstCodigo,
        Descrição: c.descricao,
        'Tipo de Alíquota': c.tipoAliquota || '',
        'Redução (%)': c.percentualReducao != null ? c.percentualReducao * 100 : '',
        'Fundamento Legal': c.fundamentoLegal || '',
        Fonte: c.fonte,
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rowsC), 'Regimes (por descrição)');
    }

    XLSX.writeFile(wb, `Classificacao_Tributaria_${resultado.ncmPesquisado || 'pesquisa'}.xlsx`);
  }

  function exportarPdf() {
    const params = new URLSearchParams();
    if (descricao.trim()) params.set('descricao', descricao.trim());
    if (ncm.trim()) params.set('ncm', ncm.trim());
    window.open(`/api/auditor-rtc/classificacao/pdf?${params.toString()}`, '_blank');
  }

  const temResultado = !!resultado;
  const nadaEncontrado = resultado && resultado.resultadosNcm.length === 0 && resultado.resultadosCclasstrib.length === 0 && !resultado.avisoPadrao;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/auditor-rtc" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand transition-colors mb-2 w-fit">
          <ArrowLeft size={15} />
          Auditor RTC
        </Link>
        <h1 className="text-2xl font-display font-semibold text-brand">Pesquisa de Classificação Tributária do Produto</h1>
        <p className="text-gray-500 text-sm mt-1 max-w-3xl">
          Consulte o enquadramento de um produto na Reforma Tributária (IBS/CBS) por NCM ou descrição — cClassTrib, CST,
          Anexo, tratamento, redução e fundamento legal, sempre com a fonte oficial pra conferência. Quando o NCM não
          está em nenhum Anexo de tratamento diferenciado, o sistema diz isso explicitamente em vez de deixar em branco
          — não inventa enquadramento.
        </p>
      </div>

      <form onSubmit={handlePesquisar} className="card-surface p-5">
        <h2 className="font-semibold text-brand text-sm mb-3 flex items-center gap-1.5">
          <Search size={15} />
          Pesquisar Produto
        </h2>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[240px]">
            <label className="block text-xs text-gray-500 mb-1">Descrição</label>
            <input
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="ex: arroz, leite, banana..."
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-full"
            />
          </div>
          <div className="w-40">
            <label className="block text-xs text-gray-500 mb-1">NCM</label>
            <input
              value={ncm}
              onChange={(e) => setNcm(e.target.value)}
              placeholder="ex: 1006"
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-full font-mono"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="bg-brand text-white rounded-xl px-5 py-2.5 text-sm font-medium shadow-card hover:shadow-card-hover transition-all disabled:opacity-50"
          >
            {loading ? 'Pesquisando...' : 'Pesquisar'}
          </button>
        </div>
        {erro && <p className="text-sm text-red-600 mt-3">{erro}</p>}
      </form>

      {temResultado && (
        <>
          <div className="flex justify-end gap-2">
            <button onClick={exportarExcel} className="flex items-center gap-1.5 bg-accent text-white rounded-lg px-3 py-1.5 text-sm font-medium">
              <FileDown size={15} />
              Exportar Excel
            </button>
            <button onClick={exportarPdf} className="flex items-center gap-1.5 border border-gray-300 rounded-lg px-3 py-1.5 text-sm font-medium">
              <FileText size={15} />
              Exportar PDF
            </button>
          </div>

          {resultado!.resultadosNcm.length > 0 && (
            <div className="card-surface p-5">
              <h2 className="font-display font-semibold text-brand mb-3">Enquadramento por NCM</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-brand text-white text-left">
                      <th className="px-3 py-2">NCM</th>
                      <th className="px-3 py-2">Produto (fonte)</th>
                      <th className="px-3 py-2">cClassTrib</th>
                      <th className="px-3 py-2">CST</th>
                      <th className="px-3 py-2">Anexo</th>
                      <th className="px-3 py-2">Tratamento</th>
                      <th className="px-3 py-2">Redução</th>
                      <th className="px-3 py-2">Fundamento legal</th>
                      <th className="px-3 py-2">Fonte</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultado!.resultadosNcm.map((r) => (
                      <tr key={r.id} className="border-b border-gray-50">
                        <td className="px-3 py-1.5 font-mono">{r.ncm}</td>
                        <td className="px-3 py-1.5 max-w-[200px]">{r.descricaoNcm || '—'}</td>
                        <td className="px-3 py-1.5 font-mono">{r.cclasstribCodigo}</td>
                        <td className="px-3 py-1.5 font-mono">{r.cclasstrib.cstCodigo}</td>
                        <td className="px-3 py-1.5">{r.anexo || '—'}</td>
                        <td className="px-3 py-1.5 max-w-[260px]">{r.cclasstrib.descricao}</td>
                        <td className="px-3 py-1.5">{fmtReducao(r.cclasstrib.percentualReducao)}</td>
                        <td className="px-3 py-1.5 max-w-[200px] text-gray-500">{r.fundamentoLegal || r.cclasstrib.fundamentoLegal || '—'}</td>
                        <td className="px-3 py-1.5">
                          <a href={r.fonte} target="_blank" rel="noopener noreferrer" className="text-brand underline">
                            fonte
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {resultado!.ncmPesquisado && resultado!.resultadosNcm.length === 0 && resultado!.avisoPadrao && (
            <div className="card-surface p-5 border border-amber-200 bg-amber-50">
              <p className="text-sm text-amber-800">
                <strong>NCM {resultado!.ncmPesquisado}</strong> não foi encontrado em nenhum Anexo de tratamento
                diferenciado da Reforma Tributária — aplica-se o tratamento <strong>padrão</strong>:
              </p>
              <dl className="grid grid-cols-[140px_1fr] gap-1.5 text-xs mt-3">
                <dt className="text-amber-700">cClassTrib</dt><dd className="font-mono">{resultado!.avisoPadrao.codigo}</dd>
                <dt className="text-amber-700">CST</dt><dd className="font-mono">{resultado!.avisoPadrao.cstCodigo}</dd>
                <dt className="text-amber-700">Tratamento</dt><dd>{resultado!.avisoPadrao.descricao}</dd>
                <dt className="text-amber-700">Fonte</dt>
                <dd><a href={resultado!.avisoPadrao.fonte} target="_blank" rel="noopener noreferrer" className="text-brand underline">{resultado!.avisoPadrao.fonte}</a></dd>
              </dl>
              <p className="text-[11px] text-amber-700 mt-2">
                Isso não descarta outros regimes que não dependem de NCM (Simples Nacional, monofásico, etc.) — confira
                a situação tributária da empresa separadamente.
              </p>
            </div>
          )}

          {resultado!.resultadosCclasstrib.length > 0 && (
            <div className="card-surface p-5">
              <h2 className="font-display font-semibold text-brand mb-1">Regimes/tratamentos encontrados pela descrição</h2>
              <p className="text-xs text-gray-500 mb-3">Sem NCM específico vinculado — o texto do tratamento bateu com a descrição pesquisada.</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-brand text-white text-left">
                      <th className="px-3 py-2">cClassTrib</th>
                      <th className="px-3 py-2">CST</th>
                      <th className="px-3 py-2">Descrição</th>
                      <th className="px-3 py-2">Redução</th>
                      <th className="px-3 py-2">Fundamento legal</th>
                      <th className="px-3 py-2">Fonte</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultado!.resultadosCclasstrib.map((c) => (
                      <tr key={c.codigo} className="border-b border-gray-50">
                        <td className="px-3 py-1.5 font-mono">{c.codigo}</td>
                        <td className="px-3 py-1.5 font-mono">{c.cstCodigo}</td>
                        <td className="px-3 py-1.5 max-w-[320px]">{c.descricao}</td>
                        <td className="px-3 py-1.5">{fmtReducao(c.percentualReducao)}</td>
                        <td className="px-3 py-1.5 max-w-[200px] text-gray-500">{c.fundamentoLegal || '—'}</td>
                        <td className="px-3 py-1.5">
                          <a href={c.fonte} target="_blank" rel="noopener noreferrer" className="text-brand underline">fonte</a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {nadaEncontrado && (
            <div className="card-surface p-8 text-center text-gray-400 text-sm">
              Nenhum resultado encontrado pra esses critérios. Tente um NCM mais genérico (menos dígitos) ou outra palavra da descrição.
            </div>
          )}
        </>
      )}
    </div>
  );
}
