'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowRight, Settings, BookOpenText } from 'lucide-react';
import { canAccess, type Role } from '@/lib/permissions';

type Secao = {
  href: string;
  emoji: string;
  titulo: string;
  descricao: string;
};

const SECOES: Secao[] = [
  {
    href: '/dashboard/analise-fiscal/entrada',
    emoji: '📥',
    titulo: 'Análise de Entradas',
    descricao: 'Audita o Relatório Fiscal de Entradas linha a linha contra o tratamento tributário esperado por TES.',
  },
  {
    href: '/dashboard/analise-fiscal/saida',
    emoji: '📤',
    titulo: 'Análise de Saídas',
    descricao: 'Audita o Relatório Fiscal de Saídas (vendas e transferências) com a mesma lógica de validação por TES.',
  },
  {
    href: '/dashboard/analise-fiscal/apuracao',
    emoji: '📊',
    titulo: 'Apuração Fiscal',
    descricao: 'Cruzamento de Entradas e Saídas validadas, com os totalizadores da apuração. Em construção.',
  },
  {
    href: '/dashboard/analise-fiscal/relatorios',
    emoji: '📋',
    titulo: 'Relatórios / Exportações',
    descricao: 'Histórico e exportações (PDF/Excel) das análises de Entradas e Saídas já processadas.',
  },
];

export default function AnaliseEApuracaoFiscalHubPage() {
  const [role, setRole] = useState<Role | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        setRole(data.user?.currentRole ?? null);
      }
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-display font-semibold text-brand">Análise e Apuração Fiscal</h1>
          <p className="text-gray-500 text-sm mt-1">
            Auditoria fiscal completa: Entradas, Saídas e, em breve, a Apuração Fiscal cruzando os dois lados.
          </p>
        </div>
        {canAccess(role, 'analiseFiscalConfig') && (
          <div className="flex items-center gap-4 shrink-0">
            <Link href="/dashboard/analise-fiscal/regras" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand transition-colors">
              <BookOpenText size={15} />
              Regras da Análise e Apuração Fiscal
            </Link>
            <Link href="/dashboard/analise-fiscal/config" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand transition-colors">
              <Settings size={15} />
              Configurar TES
            </Link>
          </div>
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {SECOES.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="card-surface p-5 flex flex-col gap-2 transition-all hover:shadow-glow hover:-translate-y-0.5 cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <span className="text-2xl">{s.emoji}</span>
              <ArrowRight size={16} className="text-gray-300" />
            </div>
            <h2 className="font-display font-semibold text-brand">{s.titulo}</h2>
            <p className="text-sm text-gray-500">{s.descricao}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
