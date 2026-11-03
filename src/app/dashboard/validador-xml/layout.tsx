import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';

// Quem não tem acesso ao módulo (ex: perfil CLIENTE) é barrado aqui mesmo
// digitando o endereço — o menu e as rotas /api/validador-xml/* já checam.
export default async function ValidadorXmlLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!canAccess(session?.currentRole ?? null, 'validadorXml')) redirect('/dashboard');
  return <>{children}</>;
}
