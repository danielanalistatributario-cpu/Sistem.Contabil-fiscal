'use client';

import { useState, useEffect, useCallback } from 'react';

type UserRow = { membershipId: string; userId: string; name: string; email: string; role: string };

const ROLES = ['ADMINISTRADOR', 'GESTOR', 'ANALISTA', 'USUARIO', 'CLIENTE'];
const ROLE_LABELS: Record<string, string> = {
  ADMINISTRADOR: 'Administrador',
  GESTOR: 'Gestor',
  ANALISTA: 'Analista',
  USUARIO: 'Usuário',
  CLIENTE: 'Cliente',
};

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('USUARIO');
  const [error, setError] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const res = await fetch('/api/users');
    if (res.ok) {
      const data = await res.json();
      setUsers(data.users);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setTempPassword(null);
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, role }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Erro ao adicionar usuário.');
      return;
    }
    if (data.temporaryPassword) setTempPassword(data.temporaryPassword);
    setName('');
    setEmail('');
    setRole('USUARIO');
    carregar();
  }

  async function handleRoleChange(membershipId: string, newRole: string) {
    await fetch(`/api/users/${membershipId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: newRole }),
    });
    carregar();
  }

  async function handleRemove(membershipId: string) {
    if (!confirm('Remover o acesso deste usuário a esta empresa?')) return;
    await fetch(`/api/users/${membershipId}`, { method: 'DELETE' });
    carregar();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-semibold text-brand">Usuários e Permissões</h1>
        <p className="text-gray-500 text-sm mt-1">
          Gerencie quem tem acesso à empresa atualmente selecionada, e com qual perfil.
        </p>
      </div>

      <form onSubmit={handleAdd} className="card-surface p-5 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Nome</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
            required
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">E-mail</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
            required
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Perfil</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="bg-brand text-white rounded-lg px-4 py-2 text-sm font-medium">
          Adicionar
        </button>
        {error && <p className="text-sm text-red-600 w-full">{error}</p>}
        {tempPassword && (
          <p className="text-sm text-green-700 w-full">
            Usuário criado. Senha temporária: <code className="bg-gray-100 px-1.5 py-0.5 rounded">{tempPassword}</code>{' '}
            (em produção, isso seria enviado por e-mail).
          </p>
        )}
      </form>

      <div className="card-surface p-5">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
              <th className="py-2 pr-3">Nome</th>
              <th className="py-2 pr-3">E-mail</th>
              <th className="py-2 pr-3">Perfil</th>
              <th className="py-2 pr-3"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.membershipId} className="border-b border-gray-50">
                <td className="py-2 pr-3 font-medium">{u.name}</td>
                <td className="py-2 pr-3 text-gray-500">{u.email}</td>
                <td className="py-2 pr-3">
                  <select
                    value={u.role}
                    onChange={(e) => handleRoleChange(u.membershipId, e.target.value)}
                    className="border border-gray-300 rounded-lg px-2 py-1 text-xs"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-2 pr-3">
                  <button onClick={() => handleRemove(u.membershipId)} className="text-xs text-red-500 underline">
                    Remover acesso
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
