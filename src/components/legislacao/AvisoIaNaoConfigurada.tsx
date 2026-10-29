'use client';

import { useEffect, useState } from 'react';
import { KeyRound } from 'lucide-react';

// null = ainda verificando; assume configurada se a checagem falhar, pra
// não travar a tela por um erro de rede (a rota de análise já trata a
// falta de chave com mensagem própria).
export function useIaConfigurada(): boolean | null {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    fetch('/api/legislacao/status')
      .then((r) => (r.ok ? r.json() : { iaConfigurada: true }))
      .then((d) => setOk(Boolean(d.iaConfigurada)))
      .catch(() => setOk(true));
  }, []);
  return ok;
}

export default function AvisoIaNaoConfigurada() {
  return (
    <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
      <KeyRound className="text-amber-600 shrink-0 mt-0.5" size={20} />
      <div className="text-sm">
        <p className="font-medium text-amber-800">IA ainda não configurada</p>
        <p className="text-amber-900/80 mt-0.5">
          A análise e a comparação de documentos usam a IA da Anthropic, que precisa de uma chave de API (variável <code className="text-xs bg-white/70 rounded px-1">ANTHROPIC_API_KEY</code> no servidor). O histórico e as análises já salvas continuam disponíveis.
        </p>
      </div>
    </div>
  );
}
