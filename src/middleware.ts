import { NextRequest, NextResponse } from 'next/server';

const TOKEN_COOKIE = 'portal_token';

// Importante: este middleware só verifica se o cookie de sessão *existe*, não
// se ele é válido (a validação completa do JWT acontece no servidor, em
// getSession()). Por isso, o middleware NUNCA deve redirecionar a página de
// login para o dashboard só por o cookie existir — se o cookie estiver
// inválido/expirado, o dashboard manda de volta para /login, e isso criaria
// um loop infinito de redirecionamentos entre as duas páginas.
export function middleware(req: NextRequest) {
  const token = req.cookies.get(TOKEN_COOKIE)?.value;
  const { pathname } = req.nextUrl;

  if (pathname.startsWith('/dashboard') && !token) {
    const loginUrl = new URL('/login', req.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/login'],
};
