'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, GitCompareArrows } from 'lucide-react';
import SeletorPdf from '@/components/legislacao/SeletorPdf';
import ProgressoAnalise from '@/components/legislacao/ProgressoAnalise';
import AvisoIaNaoConfigurada, { useIaConfigurada } from '@/components/legislacao/AvisoIaNaoConfigurada';
import { anexarDocumento, enviarAnalise, LIMITE_UPLOAD_PDF, type EtapaEnvio } from '@/lib/legislacao/cliente';

export default function CompararLegislacaoPage() {
  const router = useRouter();
  const [a, setA] = useState<File | null>(null);
  const [b, setB] = useState<File | null>(null);
  const [etapa, setEtapa] = useState<EtapaEnvio | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const processando = etapa !== null;
  const iaConfigurada = useIaConfigurada();
  const bloqueado = processando || iaConfigurada === false;

  async function comparar() {
    if (!a || !b) return;
    setErro(null);
    try {
      // Os dois PDFs dividem o mesmo limite de upload por requisição: se a
      // soma não cabe, o maior vai como texto; o menor continua como PDF
      // só se for pequeno (o texto extraído do outro também ocupa espaço).
      const form = new FormData();
      const cabemJuntos = a.size + b.size <= LIMITE_UPLOAD_PDF;
      const menor = a.size <= b.size ? a : b;
      const limite = (f: File) => (cabemJuntos || (f === menor && f.size <= 1.5 * 1024 * 1024) ? Infinity : 0);
      await anexarDocumento(form, a, 'A_', limite(a), setEtapa);
      await anexarDocumento(form, b, 'B_', limite(b), setEtapa);
      const id = await enviarAnalise('/api/legislacao/comparar', form, setEtapa);
      router.push(`/dashboard/legislacao/${id}`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha na comparação.');
      setEtapa(null);
    }
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <Link href="/dashboard/legislacao" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-brand">
        <ArrowLeft size={15} /> Analisador de Legislação
      </Link>
      <div>
        <h1 className="text-2xl font-display font-semibold text-brand flex items-center gap-2">
          <GitCompareArrows size={24} className="text-teal" /> Comparar documentos
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Envie a versão anterior em <strong>A</strong> e a nova em <strong>B</strong> (ou duas normas sobre o mesmo tema). A comparação aponta o que entrou, saiu e mudou, com a página de cada documento.
        </p>
      </div>

      <div className="card-surface p-5 space-y-4">
        {iaConfigurada === false && <AvisoIaNaoConfigurada />}
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Documento A — anterior / referência</p>
            <SeletorPdf rotulo="PDF A" arquivo={a} onArquivo={setA} desabilitado={processando} />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Documento B — novo / comparado</p>
            <SeletorPdf rotulo="PDF B" arquivo={b} onArquivo={setB} desabilitado={processando} />
          </div>
        </div>
        {a && b && a.size + b.size > LIMITE_UPLOAD_PDF && !processando && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Juntos, os PDFs passam de 4 MB: o maior será lido pelo texto extraído aqui no navegador (tabelas e imagens podem perder estrutura).
          </p>
        )}
        <ProgressoAnalise etapa={etapa} />
        {erro && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erro}</p>}
        <button onClick={comparar} disabled={!a || !b || bloqueado} className="bg-accent hover:bg-accent-dark disabled:opacity-40 text-white font-medium text-sm rounded-xl px-6 py-2.5">
          {processando ? 'Comparando…' : 'Comparar documentos'}
        </button>
      </div>
    </div>
  );
}
