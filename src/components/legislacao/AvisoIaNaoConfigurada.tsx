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

// `comAlternativa`: na tela de análise existe o resumo sem IA, então o
// aviso orienta a usá-lo; na comparação não há alternativa sem IA.
export default function AvisoIaNaoConfigurada({ comAlternativa = false }: { comAlternativa?: boolean }) {
  return (
    <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
      <KeyRound className="text-amber-600 shrink-0 mt-0.5" size={20} />
      <div className="text-sm">
        <p className="font-medium text-amber-800">IA ainda não configurada</p>
        <p className="text-amber-900/80 mt-0.5">
          {comAlternativa ? (
            <>Use <strong>Gerar resumo (sem IA)</strong>: monta o resumo executivo, prazos, checklist, base legal e comunicado a partir das frases do próprio PDF. A análise com IA (texto interpretado e reescrito) fica disponível quando a chave da Anthropic for configurada.</>
          ) : (
            <>A comparação de documentos usa a IA da Anthropic, que precisa de uma chave de API (variável <code className="text-xs bg-white/70 rounded px-1">ANTHROPIC_API_KEY</code> no servidor). O histórico e as análises já salvas continuam disponíveis.</>
          )}
        </p>
      </div>
    </div>
  );
}
