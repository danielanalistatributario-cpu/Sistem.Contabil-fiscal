'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, FileSpreadsheet, Calculator, Percent, BookOpenCheck, Landmark, ShieldCheck, PackageSearch, ClipboardCheck, TrendingUp, Users, Settings,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Role } from '@/lib/permissions';
import { canAccess } from '@/lib/permissions';

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  moduleKey: Parameters<typeof canAccess>[1];
  accent: string; // tailwind text color class for the icon when active
};

type NavGroup = { label: string; items: NavItem[] };

const GROUPS: NavGroup[] = [
  {
    label: 'Visão geral',
    items: [{ href: '/dashboard', label: 'Início', icon: LayoutDashboard, moduleKey: 'dashboard', accent: 'text-white' }],
  },
  {
    label: 'Módulos fiscais',
    items: [
      { href: '/dashboard/sped', label: 'Conversor SPED Fiscal', icon: FileSpreadsheet, moduleKey: 'sped', accent: 'text-lime' },
      { href: '/dashboard/icms', label: 'ICMS Antecipado Especial', icon: Calculator, moduleKey: 'icms', accent: 'text-accent' },
      { href: '/dashboard/difal', label: 'DIFAL', icon: Percent, moduleKey: 'difal', accent: 'text-teal' },
      { href: '/dashboard/conciliacao', label: 'Conciliação Contábil', icon: BookOpenCheck, moduleKey: 'conciliacao', accent: 'text-pink' },
      { href: '/dashboard/conciliacao/bancaria', label: 'Conciliação Bancária', icon: Landmark, moduleKey: 'conciliacao', accent: 'text-pink' },
      { href: '/dashboard/auditor-rtc', label: 'Auditor RTC (IBS/CBS)', icon: ShieldCheck, moduleKey: 'auditorRtc', accent: 'text-teal' },
      { href: '/dashboard/validacao-cadastro', label: 'Validação de Cadastro', icon: PackageSearch, moduleKey: 'validacaoCadastro', accent: 'text-ruby' },
      { href: '/dashboard/analise-fiscal', label: 'Análise e Apuração Fiscal', icon: ClipboardCheck, moduleKey: 'analiseFiscal', accent: 'text-accent' },
      { href: '/dashboard/analise-fiscal/saida', label: 'Análise Fiscal — Saídas', icon: TrendingUp, moduleKey: 'analiseFiscal', accent: 'text-accent' },
    ],
  },
  {
    label: 'Administração',
    items: [
      { href: '/dashboard/users', label: 'Usuários e Permissões', icon: Users, moduleKey: 'users', accent: 'text-white' },
      { href: '/dashboard/config', label: 'Configurações Fiscais', icon: Settings, moduleKey: 'companyConfig', accent: 'text-white' },
    ],
  },
];

export default function Sidebar({ role }: { role: Role | null }) {
  const pathname = usePathname();

  return (
    <aside className="w-64 shrink-0 bg-gradient-to-b from-brand to-brand-deep text-white h-screen sticky top-0 flex flex-col relative">
      <div className="px-5 py-5 bg-white">
        <Image src="/logo-fortfruit.png" alt="Fort Fruit" width={180} height={62} className="w-full h-auto" priority />
        <p className="text-[11px] text-brand/70 italic mt-1 text-center font-display">Bem pra gente</p>
      </div>

      <div className="px-5 py-4 border-b border-white/10">
        <h1 className="font-display font-semibold text-sm leading-tight text-white/95">Portal Fiscal e Contábil</h1>
        <p className="text-[11px] text-white/50 mt-0.5">Gestão inteligente, do jeito Fort Fruit</p>
      </div>

      <nav className="flex-1 py-4 overflow-y-auto">
        {GROUPS.map((group) => {
          const visibleItems = group.items.filter((item) => canAccess(role, item.moduleKey));
          if (visibleItems.length === 0) return null;
          return (
            <div key={group.label} className="mb-5">
              <p className="px-5 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/35">{group.label}</p>
              {visibleItems.map((item) => {
                const active = pathname === item.href;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`group relative flex items-center gap-3 mx-2.5 px-3 py-2.5 rounded-xl text-sm transition-all duration-150 ${
                      active ? 'bg-white/12 text-white font-medium shadow-glow' : 'text-white/75 hover:bg-white/[0.07] hover:text-white'
                    }`}
                  >
                    {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-accent" />}
                    <Icon size={17} strokeWidth={2} className={active ? item.accent : 'text-white/60 group-hover:text-white/90'} />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      <div className="px-5 py-4 border-t border-white/10 font-mono space-y-0.5">
        <p className="text-[11px] text-white/35">Fase 0–2 · em evolução</p>
        <p className="text-[10px] text-white/70">Desenvolvido por Daniel Garcia</p>
      </div>
    </aside>
  );
}
