'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function ApuracaoFiscalPage() {
  return (
    <div className="space-y-6">
      <Link href="/dashboard/analise-fiscal" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand transition-colors w-fit">
        <ArrowLeft size={15} />
        Análise e Apuração Fiscal
      </Link>

      <div>
        <h1 className="text-2xl font-display font-semibold text-brand">Apuração Fiscal</h1>
        <p className="text-gray-500 text-sm mt-1">
          Cruzamento das Análises de Entradas e Saídas já validadas, com os totalizadores da apuração.
        </p>
      </div>

      <div className="card-surface p-8 text-center space-y-2">
        <p className="text-3xl">📊</p>
        <p className="text-sm text-gray-600">Esta seção ainda está em construção.</p>
        <p className="text-xs text-gray-400 max-w-md mx-auto">
          A Apuração Fiscal vai cruzar os dados já validados de{' '}
          <Link href="/dashboard/analise-fiscal/entrada" className="text-brand underline">Análise de Entradas</Link> e{' '}
          <Link href="/dashboard/analise-fiscal/saida" className="text-brand underline">Análise de Saídas</Link> pra
          gerar os totalizadores e cruzamentos da apuração.
        </p>
      </div>
    </div>
  );
}
