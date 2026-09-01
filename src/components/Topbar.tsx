'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { Building2, LogOut, ChevronDown, KeyRound } from 'lucide-react';
import { ROLE_LABELS } from '@/lib/permissions';
import type { Role } from '@/lib/permissions';

type Membership = { companyId: string; companyName: string; role: Role };

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase();
}

export default function Topbar({
  userName,
  memberships,
  currentCompanyId,
  currentRole,
}: {
  userName: string;
  memberships: Membership[];
  currentCompanyId: string | null;
  currentRole: Role | null;
}) {
  const router = useRouter();
  const [switching, setSwitching] = useState(false);

  async function handleSwitch(companyId: string) {
    setSwitching(true);
    await fetch('/api/companies/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId }),
    });
    setSwitching(false);
    router.refresh();
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <header className="h-16 bg-white/90 backdrop-blur border-b border-gray-100 flex items-center justify-between px-6 sticky top-0 z-20">
      <div className="flex items-center gap-2.5 bg-gray-50 border border-gray-100 rounded-full pl-3 pr-2 py-1.5">
        <Building2 size={15} className="text-brand" />
        {memberships.length > 1 ? (
          <div className="relative flex items-center">
            <select
              value={currentCompanyId ?? ''}
              disabled={switching}
              onChange={(e) => handleSwitch(e.target.value)}
              className="appearance-none bg-transparent text-sm font-medium text-gray-700 focus:outline-none pr-5 cursor-pointer"
            >
              {memberships.map((m) => (
                <option key={m.companyId} value={m.companyId}>
                  {m.companyName}
                </option>
              ))}
            </select>
            <ChevronDown size={13} className="text-gray-400 absolute right-0 pointer-events-none" />
          </div>
        ) : (
          <span className="text-sm font-medium text-gray-700">{memberships[0]?.companyName}</span>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-accent text-white flex items-center justify-center text-xs font-semibold font-display shrink-0">
          {initials(userName)}
        </div>
        <div className="text-right hidden sm:block">
          <p className="text-sm font-medium text-gray-800 leading-tight">{userName}</p>
          <p className="text-[11px] text-gray-400 leading-tight">{currentRole ? ROLE_LABELS[currentRole] : ''}</p>
        </div>
        <Link
          href="/dashboard/perfil"
          title="Alterar senha"
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand hover:bg-brand/5 rounded-full px-3 py-2 transition-colors"
        >
          <KeyRound size={15} />
          <span className="hidden md:inline">Alterar senha</span>
        </Link>
        <button
          onClick={handleLogout}
          title="Sair"
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-ruby hover:bg-ruby/5 rounded-full px-3 py-2 transition-colors"
        >
          <LogOut size={15} />
          <span className="hidden md:inline">Sair</span>
        </button>
      </div>
    </header>
  );
}
