'use client';

import { useState, useEffect, useRef, Suspense, Fragment } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { History } from 'lucide-react';
import { ImportHero } from '@/components/ImportHero';
import * as XLSX from 'xlsx';
import { lerRelatorioNFe } from '@/lib/nfe-report-reader';

type DifalItemDB = {
  id: string;
  docFiscal: string;
  fornecedor: string | null;
  cnpj: string | null;
  ufOrigem: string | null;
  produto: string | null;
  ncm: string | null;
  cfop: string | null;
  origemCodigo: string | null;
  dataEmissao: string | null;
  quantidade: number | null;
  valorUnitario: number | null;
  frete: number | null;
  despesaIpi: number | null;
  desconto: number | null;
  valorTotal: number;
  aliqInterestadual: number | null;
  valorOrigem: number | null;
  baseIcms: number | null;
  icmsDestino: number | null;
  valorDifal: number | null;
  inconsistencia: string | null;
};

type ApuracaoDB = {
  id: string;
  periodo: string;
  ufDestino: string;
  aliquotaInterna: number;
  totalItens: number;
  itensComDifal: number;
  itensSemDados: number;
  valorTotalDifal: number;
  processedAt: string;
  itens: DifalItemDB[];
};

function fmtBRL(n: number | null | undefined) {
  return (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function fmtDate(v: string | null) {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

export default function DifalPage() {
  return (
    <Suspense fallback={null}>
      <DifalPageInner />
    </Suspense>
  );
}

function DifalPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const apuracaoIdParam = searchParams.get('apuracaoId');

  const [file, setFile] = useState<File | null>(null);
  const [periodo, setPeriodo] = useState('');
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [apuracao, setApuracao] = useState<ApuracaoDB | null>(null);
  const [detalheAberto, setDetalheAberto] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<'TODOS' | 'COM_DIFAL' | 'INCONSISTENCIA'>('TODOS');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!apuracaoIdParam) return;
    (async () => {
      const res = await fetch(`/api/difal/apuracoes/${apuracaoIdParam}`);
      if (res.ok) {
        const data = await res.json();
        setApuracao(data.apuracao);
      }
    })();
  }, [apuracaoIdParam]);

  async function handleProcessar() {
    if (!file) return;
    setErro(null);
    setLoading(true);

    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
      const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
        header: 1,
        raw: true,
        defval: null,
      }) as unknown[][];

      const leitura = lerRelatorioNFe(aoa);
      if (leitura.erro) {
        setErro(leitura.erro);
        setLoading(false);
        return;
      }

      const res = await fetch('/api/difal/apurar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          periodo,
          itens: leitura.itens.map((i) => ({ ...i, dataEmissao: i.dataEmissao ? i.dataEmissao.toISOString() : null })),
        }),
      });
      const data = await res.json();
      setLoading(false);

      if (!res.ok) {
        setErro(data.error || 'Falha ao processar.');
        return;
      }
      setApuracao(data.apuracao);
    } catch (err) {
      setLoading(false);
      setErro('Não foi possível ler o arquivo. Verifique se é um .xlsx válido no layout esperado.');
      console.error(err);
    }
  }

  function handleNovaApuracao() {
    setApuracao(null);
    setFile(null);
    setPeriodo('');
    setErro(null);
    if (inputRef.current) inputRef.current.value = '';
    router.replace('/dashboard/difal');
  }

  function exportarExcel() {
    if (!apuracao) return;

    const itensValidos = apuracao.itens.filter((i) => !i.inconsistencia);
    const cabecalho = [
      'Doc. Fiscal', 'Descricao', 'UF', 'Quant', 'VLR Un', 'FRETE', 'VLR IPI + DESPESA', 'DESCONTO',
      'Vlr Total', 'Aliq. ICMS', 'Vlr Origem', 'BC ICMS', 'Aliq. PA', 'ICMS PA', 'Valor a pagar',
    ];

    const linhas: (string | number)[][] = [];
    let notaAnterior: string | null = null;
    for (const i of itensValidos) {
      const mesmaNota = i.docFiscal === notaAnterior;
      linhas.push([
        mesmaNota ? '' : i.docFiscal,
        i.produto || '',
        i.ufOrigem || '',
        i.quantidade ?? '',
        i.valorUnitario ?? '',
        i.frete || '',
        i.despesaIpi || '',
        i.desconto || '',
        i.valorTotal,
        i.aliqInterestadual !== null ? `${(i.aliqInterestadual * 100).toFixed(0)}%` : '',
        i.valorOrigem ?? 0,
        i.baseIcms ?? 0,
        `${(apuracao.aliquotaInterna * 100).toFixed(0)}%`,
        i.icmsDestino ?? 0,
        i.valorDifal ?? 0,
      ]);
      notaAnterior = i.docFiscal;
    }

    const totalVlrTotal = itensValidos.reduce((s, i) => s + i.valorTotal, 0);
    const totalOrigem = itensValidos.reduce((s, i) => s + (i.valorOrigem || 0), 0);
    const totalBaseIcms = itensValidos.reduce((s, i) => s + (i.baseIcms || 0), 0);
    const totalIcmsDestino = itensValidos.reduce((s, i) => s + (i.icmsDestino || 0), 0);
    const totalDifal = itensValidos.reduce((s, i) => s + (i.valorDifal || 0), 0);
    linhas.push(['TOTAL A PAGAR', '', '', '', '', '', '', '', totalVlrTotal, '', totalOrigem, totalBaseIcms, '', totalIcmsDestino, totalDifal]);

    const tituloInfo = [
      ['Detalhamento de Classificação de Receita'],
      [`Período: ${apuracao.periodo}   Receita: 1141 - Diferencial de Alíquota`],
      [`UF destino: ${apuracao.ufDestino}   Alíquota interna: ${(apuracao.aliquotaInterna * 100).toFixed(0)}%`],
      [],
    ];

    const ws = XLSX.utils.aoa_to_sheet([...tituloInfo, cabecalho, ...linhas]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'DIFAL');

    if (apuracao.itensSemDados > 0) {
      const inconsistentes = apuracao.itens.filter((i) => i.inconsistencia);
      const wsInc = XLSX.utils.json_to_sheet(
        inconsistentes.map((i) => ({
          'Doc. Fiscal': i.docFiscal,
          Descricao: i.produto,
          UF: i.ufOrigem,
          'Vlr Total': i.valorTotal,
          Inconsistência: i.inconsistencia,
        }))
      );
      XLSX.utils.book_append_sheet(wb, wsInc, 'Inconsistências');
    }

    XLSX.writeFile(wb, `DIFAL_${apuracao.periodo.replace('/', '-')}.xlsx`);
  }

  const itensFiltrados = apuracao
    ? apuracao.itens.filter((i) => {
        if (filtro === 'COM_DIFAL') return !i.inconsistencia;
        if (filtro === 'INCONSISTENCIA') return !!i.inconsistencia;
        return true;
      })
    : [];

  // rollup por nota fiscal
  const porNota = apuracao
    ? Object.values(
        apuracao.itens.reduce((acc: Record<string, { docFiscal: string; fornecedor: string; total: number; difal: number; itens: number }>, i) => {
          if (!acc[i.docFiscal]) {
            acc[i.docFiscal] = { docFiscal: i.docFiscal, fornecedor: i.fornecedor || '', total: 0, difal: 0, itens: 0 };
          }
          acc[i.docFiscal].total += i.valorTotal;
          acc[i.docFiscal].difal += i.valorDifal || 0;
          acc[i.docFiscal].itens += 1;
          return acc;
        }, {})
      ).sort((a, b) => b.difal - a.difal)
    : [];

  return (
    <div className="space-y-6">
      {!apuracao ? (
        <ImportHero
          eyebrow="Convênio ICMS 236/2021 · Cálculo por dentro"
          titleParts={['DIFAL', '→', { text: 'Diferencial', accent: true }, 'de Alíquota']}
          description="Envie o relatório de entradas e o sistema identifica sozinho as notas com CFOP de DIFAL (2551 e 2556), calcula pelo método por dentro e separa o que está pronto do que precisa de revisão."
          badges={['CFOP 2551/2556 identificados automaticamente', 'Alíquota 7% / 12% / 4% por origem']}
        />
      ) : (
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-display font-semibold text-brand">DIFAL — Diferencial de Alíquota</h1>
            <p className="text-gray-500 text-sm mt-1">
              Cálculo automático do DIFAL a partir do relatório de entradas (layout "NF-e de Entrada e Saída"), método
              "por dentro" (Convênio ICMS 236/2021).
            </p>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <Link href="/dashboard/difal/historico" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand transition-colors">
              <History size={15} />
              Histórico
            </Link>
            <button onClick={handleNovaApuracao} className="text-sm text-brand underline whitespace-nowrap">
              + Nova apuração
            </button>
          </div>
        </div>
      )}

      {!apuracao && (
        <div className="flex justify-end">
          <Link href="/dashboard/difal/historico" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand transition-colors">
            <History size={15} />
            Ver histórico de apurações
          </Link>
        </div>
      )}

      {erro && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{erro}</p>}

      {!apuracao && (
        <div className="card-surface p-5 space-y-3">
          <p className="text-xs text-gray-500">
            Envie o relatório de entradas no layout "NF-e de Entrada e Saída" (o mesmo gerado pelo Conversor de SPED
            Fiscal, ou exportado diretamente do seu ERP). O sistema identifica automaticamente os itens com CFOP de
            DIFAL (2551 — Ativo Imobilizado, 2556 — Uso e Consumo).
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="text-sm"
            />
            <input
              type="text"
              placeholder="Período, ex: 01/2026"
              value={periodo}
              onChange={(e) => setPeriodo(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-40"
            />
            <button
              onClick={handleProcessar}
              disabled={!file || loading}
              className="bg-brand text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {loading ? 'Processando...' : 'Calcular DIFAL'}
            </button>
          </div>
        </div>
      )}

      {apuracao && (
        <>
          <p className="text-xs text-gray-400">
            Período {apuracao.periodo} · UF destino {apuracao.ufDestino} ({(apuracao.aliquotaInterna * 100).toFixed(0)}%) ·
            processado em {new Date(apuracao.processedAt).toLocaleString('pt-BR')}
          </p>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="card-surface p-4">
              <p className="text-[10px] uppercase tracking-wide text-gray-400">Total de itens</p>
              <p className="text-2xl font-bold text-gray-800 mt-1">{apuracao.totalItens}</p>
            </div>
            <div className="card-surface p-4">
              <p className="text-[10px] uppercase tracking-wide text-gray-400">Itens com DIFAL calculado</p>
              <p className="text-2xl font-display font-semibold text-brand mt-1">{apuracao.itensComDifal}</p>
            </div>
            <div className={`card-surface p-4 ${apuracao.itensSemDados > 0 ? 'border border-ruby/40' : ''}`}>
              <p className="text-[10px] uppercase tracking-wide text-gray-400">Inconsistências</p>
              <p className={`text-2xl font-bold mt-1 ${apuracao.itensSemDados > 0 ? 'text-ruby' : 'text-gray-800'}`}>
                {apuracao.itensSemDados}
              </p>
            </div>
            <div className="card-surface p-4">
              <p className="text-[10px] uppercase tracking-wide text-gray-400">DIFAL total a recolher</p>
              <p className="text-2xl font-bold text-accent mt-1">{fmtBRL(apuracao.valorTotalDifal)}</p>
            </div>
          </div>

          {porNota.length > 0 && (
            <div className="card-surface p-5">
              <h2 className="font-semibold text-brand mb-3">Resumo por nota fiscal</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-gray-400 border-b border-gray-100">
                      <th className="py-1.5 pr-3">Nota</th>
                      <th className="py-1.5 pr-3">Fornecedor</th>
                      <th className="py-1.5 pr-3">Itens</th>
                      <th className="py-1.5 pr-3">Valor Total</th>
                      <th className="py-1.5 pr-3">DIFAL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {porNota.map((n) => (
                      <tr key={n.docFiscal} className="border-b border-gray-50">
                        <td className="py-1.5 pr-3 font-medium">{n.docFiscal}</td>
                        <td className="py-1.5 pr-3">{n.fornecedor}</td>
                        <td className="py-1.5 pr-3">{n.itens}</td>
                        <td className="py-1.5 pr-3 font-mono">{fmtBRL(n.total)}</td>
                        <td className="py-1.5 pr-3 font-mono font-semibold text-accent">{fmtBRL(n.difal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="card-surface p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex gap-2">
                {(['TODOS', 'COM_DIFAL', 'INCONSISTENCIA'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFiltro(f)}
                    className={`text-sm px-3 py-1.5 rounded-lg border ${
                      filtro === f ? 'bg-brand text-white border-brand' : 'border-gray-300 text-gray-600'
                    }`}
                  >
                    {f === 'TODOS' ? 'Todos os itens' : f === 'COM_DIFAL' ? 'Com DIFAL' : 'Inconsistências'}
                  </button>
                ))}
              </div>
              <button onClick={exportarExcel} className="bg-accent text-white rounded-lg px-3 py-1.5 text-sm font-medium">
                Exportar Excel
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[900px]">
                <thead>
                  <tr className="bg-brand text-white text-left">
                    <th className="px-3 py-2">Nota</th>
                    <th className="px-3 py-2">Fornecedor</th>
                    <th className="px-3 py-2">UF</th>
                    <th className="px-3 py-2">Produto</th>
                    <th className="px-3 py-2">CFOP</th>
                    <th className="px-3 py-2">Valor Total</th>
                    <th className="px-3 py-2">DIFAL</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {itensFiltrados.map((i) => (
                    <Fragment key={i.id}>
                      <tr className="border-b border-gray-50">
                        <td className="px-3 py-1.5">{i.docFiscal}</td>
                        <td className="px-3 py-1.5 max-w-[200px] truncate">{i.fornecedor}</td>
                        <td className="px-3 py-1.5">{i.ufOrigem}</td>
                        <td className="px-3 py-1.5 max-w-[220px] truncate">{i.produto}</td>
                        <td className="px-3 py-1.5">{i.cfop}</td>
                        <td className="px-3 py-1.5 font-mono text-right">{fmtBRL(i.valorTotal)}</td>
                        <td className="px-3 py-1.5">
                          {i.inconsistencia ? (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                              {i.inconsistencia}
                            </span>
                          ) : (
                            <span className="font-mono font-semibold text-accent">{fmtBRL(i.valorDifal)}</span>
                          )}
                        </td>
                        <td className="px-3 py-1.5">
                          {!i.inconsistencia && (
                            <button
                              onClick={() => setDetalheAberto(detalheAberto === i.id ? null : i.id)}
                              className="text-xs text-brand underline"
                            >
                              {detalheAberto === i.id ? 'Ocultar' : 'Memória'}
                            </button>
                          )}
                        </td>
                      </tr>
                      {detalheAberto === i.id && (
                        <tr className="bg-gray-50">
                          <td colSpan={8} className="px-3 py-3 text-xs text-gray-600">
                            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                              <div>
                                <p className="text-gray-400">Qtde × Vlr Unit.</p>
                                <p className="font-medium">
                                  {i.quantidade ?? '—'} × {fmtBRL(i.valorUnitario)}
                                </p>
                              </div>
                              <div>
                                <p className="text-gray-400">Desconto / Frete / Despesa</p>
                                <p className="font-medium">
                                  {fmtBRL(i.desconto)} / {fmtBRL(i.frete)} / {fmtBRL(i.despesaIpi)}
                                </p>
                              </div>
                              <div>
                                <p className="text-gray-400">Vlr Total (base ajustada)</p>
                                <p className="font-medium">{fmtBRL(i.valorTotal)}</p>
                              </div>
                              <div>
                                <p className="text-gray-400">Alíq. Interestadual</p>
                                <p className="font-medium">{((i.aliqInterestadual || 0) * 100).toFixed(2)}%</p>
                              </div>
                              <div>
                                <p className="text-gray-400">Vlr Origem</p>
                                <p className="font-medium">{fmtBRL(i.valorOrigem)}</p>
                              </div>
                              <div>
                                <p className="text-gray-400">Base ICMS (por dentro)</p>
                                <p className="font-medium">{fmtBRL(i.baseIcms)}</p>
                              </div>
                              <div>
                                <p className="text-gray-400">ICMS {apuracao.ufDestino} ({(apuracao.aliquotaInterna * 100).toFixed(0)}%)</p>
                                <p className="font-medium">{fmtBRL(i.icmsDestino)}</p>
                              </div>
                            </div>
                            <p className="mt-2 text-gray-400">
                              DIFAL = ICMS {apuracao.ufDestino} − Valor Origem = {fmtBRL(i.icmsDestino)} − {fmtBRL(i.valorOrigem)} ={' '}
                              <strong className="text-accent">{fmtBRL(i.valorDifal)}</strong>
                            </p>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
              {itensFiltrados.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-8">Nenhum item encontrado para este filtro.</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
