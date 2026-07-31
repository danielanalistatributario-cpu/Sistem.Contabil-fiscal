'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function ResetSenhaPage() {
  return (
    <Suspense fallback={null}>
      <ResetSenhaForm />
    </Suspense>
  );
}

function ResetSenhaForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch('/api/auth/reset-confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, newPassword }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Não foi possível redefinir a senha.');
      return;
    }
    setOk(true);
    setTimeout(() => router.push('/login'), 1500);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand to-brand-deep px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-glow p-8 animate-fade-in-up">
        <h1 className="text-xl font-display font-semibold text-brand mb-4">Redefinir senha</h1>
        {!token && <p className="text-sm text-ruby">Link inválido — token não encontrado.</p>}
        {token && !ok && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Nova senha</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={6}
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-all"
                required
              />
            </div>
            {error && <p className="text-sm text-ruby bg-ruby/5 border border-ruby/20 rounded-lg px-3 py-2">{error}</p>}
            <button type="submit" className="w-full bg-brand text-white rounded-xl py-2.5 font-medium text-sm hover:bg-[#00602F] transition-all shadow-card">
              Salvar nova senha
            </button>
          </form>
        )}
        {ok && <p className="text-sm text-brand-light">Senha redefinida com sucesso! Redirecionando para o login...</p>}
      </div>
    </div>
  );
}
