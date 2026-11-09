import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';

// Quem não tem acesso ao módulo (ex: perfil CLIENTE) é barrado aqui mesmo
// digitando o endereço — o menu e as rotas /api/sped-fiscal-relatorios/* já checam.
export default async function SpedFiscalRelatoriosLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!canAccess(session?.currentRole ?? null, 'spedFiscalRelatorios')) redirect('/dashboard');
  return <>{children}</>;
}
