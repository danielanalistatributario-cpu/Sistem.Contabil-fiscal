import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import Sidebar from '@/components/Sidebar';
import Topbar from '@/components/Topbar';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');

  return (
    <div className="flex">
      <Sidebar role={session.currentRole} />
      <div className="flex-1 min-h-screen flex flex-col">
        <Topbar
          userName={session.name}
          memberships={session.memberships}
          currentCompanyId={session.currentCompanyId}
          currentRole={session.currentRole}
        />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
