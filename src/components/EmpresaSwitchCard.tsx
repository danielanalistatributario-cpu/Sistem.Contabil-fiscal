'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Building2, ChevronDown } from 'lucide-react';
import type { Role } from '@/lib/permissions';

type Membership = { companyId: string; companyName: string; role: Role };

export default function EmpresaSwitchCard({
  memberships,
  currentCompanyId,
}: {
  memberships: Membership[];
  currentCompanyId: string | null;
}) {
  const router = useRouter();
  const [switching, setSwitching] = useState(false);

  async function handleSwitch(companyId: string) {
    if (companyId === currentCompanyId) return;
    setSwitching(true);
    await fetch('/api/companies/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId }),
    });
    setSwitching(false);
    router.refresh();
  }

  const empresaAtual = memberships.find((m) => m.companyId === currentCompanyId);

  return (
    <div className="group flex flex-col gap-2.5 p-3.5 rounded-xl border border-gray-100 bg-brand/5">
      <div className="w-9 h-9 rounded-lg bg-brand/10 flex items-center justify-center">
        <Building2 size={16} className="text-brand" />
      </div>
      <span className="text-xs font-medium text-gray-700 leading-tight">Empresa ativa</span>
      {memberships.length > 1 ? (
        <div className="relative flex items-center">
          <select
            value={currentCompanyId ?? ''}
            disabled={switching}
            onChange={(e) => handleSwitch(e.target.value)}
            className="appearance-none bg-transparent text-sm font-semibold text-brand focus:outline-none pr-5 cursor-pointer w-full truncate"
          >
            {memberships.map((m) => (
              <option key={m.companyId} value={m.companyId}>
                {m.companyName}
              </option>
            ))}
          </select>
          <ChevronDown size={13} className="text-brand/60 absolute right-0 pointer-events-none" />
        </div>
      ) : (
        <span className="text-sm font-semibold text-brand truncate">{empresaAtual?.companyName}</span>
      )}
    </div>
  );
}
