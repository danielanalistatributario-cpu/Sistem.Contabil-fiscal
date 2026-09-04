'use client';

import Link from 'next/link';
import { ArrowLeft, ArrowRight, Inbox } from 'lucide-react';

const HISTORICOS = [
  {
    href: '/dashboard/analise-fiscal/entrada/historico',
    emoji: '📥',
    titulo: 'Histórico de Entradas',
    descricao: 'Análises do Relatório de Entradas já processadas — abra, exporte PDF/Excel ou exclua.',
  },
  {
    href: '/dashboard/analise-fiscal/saida/historico',
    emoji: '📤',
    titulo: 'Histórico de Saídas',
    descricao: 'Análises do Relatório de Saídas já processadas — abra, exporte PDF/Excel ou exclua.',
  },
];

export default function RelatoriosAnaliseFiscalPage() {
  return (
    <div className="space-y-6">
      <Link href="/dashboard/analise-fiscal" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand transition-colors w-fit">
        <ArrowLeft size={15} />
        Análise e Apuração Fiscal
      </Link>

      <div>
        <h1 className="text-2xl font-display font-semibold text-brand">Relatórios / Exportações</h1>
        <p className="text-gray-500 text-sm mt-1">
          Histórico e exportações (PDF/Excel) das análises de Entradas e Saídas já processadas.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {HISTORICOS.map((h) => (
          <Link
            key={h.href}
            href={h.href}
            className="card-surface p-5 flex flex-col gap-2 transition-all hover:shadow-glow hover:-translate-y-0.5 cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <span className="text-2xl">{h.emoji}</span>
              <ArrowRight size={16} className="text-gray-300" />
            </div>
            <h2 className="font-display font-semibold text-brand">{h.titulo}</h2>
            <p className="text-sm text-gray-500">{h.descricao}</p>
          </Link>
        ))}
      </div>

      <div className="card-surface p-4 flex items-start gap-3">
        <Inbox size={18} className="text-gray-400 shrink-0 mt-0.5" />
        <p className="text-xs text-gray-500">
          A exportação de PDF e Excel fica dentro de cada análise (Entrada ou Saída) já processada — abra a análise
          pelo histórico correspondente acima e use os botões "Exportar PDF"/"Exportar Excel".
        </p>
      </div>
    </div>
  );
}
