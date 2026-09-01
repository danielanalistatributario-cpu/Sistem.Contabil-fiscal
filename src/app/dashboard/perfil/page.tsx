'use client';

import { useState } from 'react';

export default function PerfilPage() {
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setErro(null);

    if (novaSenha.length < 6) {
      setErro('A nova senha deve ter ao menos 6 caracteres.');
      return;
    }
    if (novaSenha !== confirmarSenha) {
      setErro('A confirmação não bate com a nova senha.');
      return;
    }

    setSalvando(true);
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: senhaAtual, newPassword: novaSenha }),
    });
    const data = await res.json();
    setSalvando(false);
    if (!res.ok) {
      setErro(data.error || 'Não foi possível alterar a senha.');
      return;
    }
    setMsg('Senha alterada com sucesso. Use a nova senha no seu próximo login.');
    setSenhaAtual('');
    setNovaSenha('');
    setConfirmarSenha('');
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-semibold text-brand">Minha conta</h1>
        <p className="text-gray-500 text-sm mt-1">Altere a senha usada para acessar o Portal Fiscal e Contábil.</p>
      </div>

      <div className="card-surface p-5 max-w-md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Senha atual</label>
            <input
              type="password"
              value={senhaAtual}
              onChange={(e) => setSenhaAtual(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-full"
              autoComplete="current-password"
              required
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Nova senha</label>
            <input
              type="password"
              value={novaSenha}
              onChange={(e) => setNovaSenha(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-full"
              autoComplete="new-password"
              minLength={6}
              required
            />
            <p className="text-[11px] text-gray-400 mt-1">Mínimo de 6 caracteres.</p>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Confirmar nova senha</label>
            <input
              type="password"
              value={confirmarSenha}
              onChange={(e) => setConfirmarSenha(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-full"
              autoComplete="new-password"
              minLength={6}
              required
            />
          </div>
          {erro && <p className="text-sm text-red-600">{erro}</p>}
          {msg && <p className="text-sm text-green-700">{msg}</p>}
          <button
            type="submit"
            disabled={salvando}
            className="bg-brand text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {salvando ? 'Salvando...' : 'Alterar senha'}
          </button>
        </form>
      </div>
    </div>
  );
}
