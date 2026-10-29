import { NextResponse } from 'next/server';
import { sessaoLegislacao } from '@/lib/legislacao/servidor';

// Diz à tela se a IA está configurada (ANTHROPIC_API_KEY presente), pra
// travar "Analisar"/"Comparar" com um aviso em vez de deixar o usuário
// enviar o PDF e só receber o erro no fim. Nunca devolve a chave.
export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await sessaoLegislacao();
  if ('erro' in auth) return auth.erro;
  return NextResponse.json({ iaConfigurada: Boolean(process.env.ANTHROPIC_API_KEY) });
}
