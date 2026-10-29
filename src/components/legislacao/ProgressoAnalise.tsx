'use client';

import { Loader2 } from 'lucide-react';
import type { EtapaEnvio } from '@/lib/legislacao/cliente';

const PASSOS = ['Lendo o documento', 'Identificando alterações e prazos', 'Mapeando impactos fiscais e no ERP', 'Montando checklist e base legal', 'Preparando o comunicado visual'];

export default function ProgressoAnalise({ etapa }: { etapa: EtapaEnvio | null }) {
  if (!etapa) return null;
  let texto = '';
  let detalhe = '';
  if (etapa.etapa === 'extraindo') {
    texto = 'PDF grande — extraindo o texto no navegador';
    detalhe = `Página ${etapa.atual} de ${etapa.total} · ${etapa.arquivo}`;
  } else if (etapa.etapa === 'enviando') {
    texto = 'Enviando o documento';
  } else {
    // Sem saber o total de antemão, o "passo" avança com o texto gerado.
    const passo = etapa.caracteres === 0 ? 0 : Math.min(PASSOS.length - 1, 1 + Math.floor(etapa.caracteres / 6000));
    texto = PASSOS[passo];
    detalhe = `${etapa.segundos}s${etapa.caracteres ? ` · ${(etapa.caracteres / 1000).toFixed(1)} mil caracteres de análise gerados` : ' · a IA está lendo o PDF'}`;
  }
  return (
    <div className="flex items-start gap-3 bg-brand/[0.04] border border-brand/15 rounded-xl px-4 py-3">
      <Loader2 className="animate-spin text-brand shrink-0 mt-0.5" size={20} />
      <div>
        <p className="text-sm font-medium text-brand">{texto}…</p>
        {detalhe && <p className="text-xs text-gray-500 mt-0.5 font-mono">{detalhe}</p>}
        <p className="text-[11px] text-gray-400 mt-1">Documentos longos levam de 1 a 4 minutos. Não feche esta página.</p>
      </div>
    </div>
  );
}
