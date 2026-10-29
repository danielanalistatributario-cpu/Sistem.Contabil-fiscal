import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';

// O Analisador de Legislação é só do ADMINISTRADOR: o item some do menu
// (Sidebar) e as rotas /api/legislacao/* devolvem 403, mas quem digitar o
// endereço direto também precisa ser barrado aqui, antes de a tela abrir.
export default async function LegislacaoLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!canAccess(session?.currentRole ?? null, 'legislacao')) redirect('/dashboard');
  return <>{children}</>;
}
