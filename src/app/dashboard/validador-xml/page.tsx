'use client';

import { useState } from 'react';
import { ImportHero } from '@/components/ImportHero';
import ValidarXml from '@/components/validador-xml/ValidarXml';
import CadastroNorma from '@/components/validador-xml/CadastroNorma';
import HistoricoValidacoes from '@/components/validador-xml/HistoricoValidacoes';

type Aba = 'validar' | 'normas' | 'historico';
const ABAS: { chave: Aba; rotulo: string }[] = [
  { chave: 'validar', rotulo: 'Validar XML' },
  { chave: 'normas', rotulo: 'Notas Técnicas' },
  { chave: 'historico', rotulo: 'Histórico' },
];

export default function ValidadorXmlPage() {
  const [aba, setAba] = useState<Aba>('validar');
  const [normaNova, setNormaNova] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <ImportHero
        eyebrow="Validador de XML"
        titleParts={['O XML está de acordo com a', { text: 'Nota Técnica?', accent: true }]}
        description="Cadastre a NT em PDF e confira os XMLs emitidos: tags ausentes ou indevidas, valores divergentes e cálculos — cada apontamento com a regra e a página da NT."
        badges={['Regras lidas da própria NT', 'Sem regra inventada', 'Vários XMLs de uma vez', 'Histórico e Excel']}
      />

      <div className="flex gap-1 border-b border-gray-200">
        {ABAS.map((a) => (
          <button
            key={a.chave}
            onClick={() => setAba(a.chave)}
            className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${aba === a.chave ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
          >
            {a.rotulo}
          </button>
        ))}
      </div>

      {aba === 'validar' && <ValidarXml key={normaNova ?? 'v'} normaInicial={normaNova} />}
      {aba === 'normas' && (
        <CadastroNorma
          onCadastrada={(id) => {
            setNormaNova(id);
            setAba('validar');
          }}
        />
      )}
      {aba === 'historico' && <HistoricoValidacoes />}
    </div>
  );
}
