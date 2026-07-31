'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { FileSpreadsheet, Calculator, Percent, BookOpenCheck, ArrowRight } from 'lucide-react';

const HIGHLIGHTS = [
  { icon: FileSpreadsheet, label: 'Conversor de SPED Fiscal' },
  { icon: Calculator, label: 'ICMS Antecipado Especial' },
  { icon: Percent, label: 'DIFAL automático' },
  { icon: BookOpenCheck, label: 'Conciliação Contábil' },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('admin@portalfiscal.com');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetMsg, setResetMsg] = useState<string | null>(null);
  const [resetLink, setResetLink] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => (res.ok ? router.replace('/dashboard') : null))
      .catch(() => null);
  }, [router]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || 'Falha ao entrar.');
      return;
    }
    router.push('/dashboard');
    router.refresh();
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setResetMsg(null);
    setResetLink(null);
    const res = await fetch('/api/auth/reset-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: resetEmail }),
    });
    const data = await res.json();
    setResetMsg('Se o e-mail existir em nossa base, um link de redefinição foi gerado abaixo.');
    if (data.resetLink) setResetLink(data.resetLink);
  }

  return (
    <div className="min-h-screen flex bg-[#f6f8f7]">
      {/* Painel de marca — some em telas pequenas */}
      <div className="hidden lg:flex lg:w-[46%] relative overflow-hidden bg-gradient-to-br from-brand to-brand-deep text-white flex-col justify-between p-12">
        <div className="brand-arcs" />
        <div className="relative z-10">
          <Image src="/logo-fortfruit.png" alt="Fort Fruit" width={170} height={58} className="w-40 h-auto bg-white rounded-xl p-3" />
        </div>
        <div className="relative z-10 max-w-sm">
          <h2 className="font-display text-3xl font-semibold leading-tight">
            Gestão fiscal e contábil, do jeito Fort Fruit.
          </h2>
          <p className="text-white/70 text-sm mt-4">
            Uma plataforma única para automatizar as rotinas da equipe — do SPED à conciliação, com precisão e agilidade.
          </p>
          <div className="mt-8 space-y-3">
            {HIGHLIGHTS.map((h) => {
              const Icon = h.icon;
              return (
                <div key={h.label} className="flex items-center gap-3 text-sm text-white/85">
                  <span className="w-8 h-8 rounded-lg bg-white/10 border border-white/15 flex items-center justify-center shrink-0">
                    <Icon size={15} />
                  </span>
                  {h.label}
                </div>
              );
            })}
          </div>
        </div>
        <p className="relative z-10 text-[11px] text-white/40 italic font-display">Bem pra gente</p>
      </div>

      {/* Painel de login */}
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm animate-fade-in-up">
          <div className="lg:hidden mb-8 text-center">
            <Image src="/logo-fortfruit.png" alt="Fort Fruit" width={200} height={68} className="mx-auto h-auto w-44" priority />
            <p className="text-xs text-brand/70 italic mt-1 font-display">Bem pra gente</p>
          </div>

          <h1 className="font-display text-2xl font-semibold text-gray-800 mb-1">
            {showReset ? 'Redefinir senha' : 'Bem-vindo de volta'}
          </h1>
          <p className="text-sm text-gray-500 mb-7">
            {showReset ? 'Informe seu e-mail para gerar um link de redefinição.' : 'Acesse o Portal Fiscal e Contábil'}
          </p>

          {!showReset ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">E-mail ou usuário</label>
                <input
                  type="text"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-all"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Senha</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-all"
                  required
                />
              </div>
              {error && <p className="text-sm text-ruby bg-ruby/5 border border-ruby/20 rounded-lg px-3 py-2">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-brand text-white rounded-xl py-2.5 font-medium text-sm hover:bg-[#00602F] transition-all disabled:opacity-60 flex items-center justify-center gap-2 shadow-card hover:shadow-card-hover"
              >
                {loading ? 'Entrando...' : 'Entrar'}
                {!loading && <ArrowRight size={15} />}
              </button>
              <button
                type="button"
                onClick={() => setShowReset(true)}
                className="w-full text-sm text-accent hover:underline mt-1"
              >
                Esqueci minha senha
              </button>
              <div className="pt-5 mt-2 border-t border-gray-100 text-xs text-gray-400 space-y-0.5">
                <p className="font-medium text-gray-500">Usuários de demonstração:</p>
                <p className="font-mono">admin@portalfiscal.com / admin123 (Administrador)</p>
                <p className="font-mono">analista@portalfiscal.com / analista123 (Analista)</p>
              </div>
            </form>
          ) : (
            <form onSubmit={handleReset} className="space-y-4">
              <input
                type="email"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                placeholder="seu@email.com"
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-all"
                required
              />
              <button type="submit" className="w-full bg-accent text-white rounded-xl py-2.5 font-medium text-sm hover:opacity-90 transition shadow-card">
                Gerar link de redefinição
              </button>
              {resetMsg && <p className="text-sm text-gray-600">{resetMsg}</p>}
              {resetLink && (
                <a href={resetLink} className="block text-sm text-brand underline break-all">
                  {resetLink}
                </a>
              )}
              <button
                type="button"
                onClick={() => setShowReset(false)}
                className="w-full text-sm text-gray-500 hover:underline"
              >
                Voltar para o login
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
