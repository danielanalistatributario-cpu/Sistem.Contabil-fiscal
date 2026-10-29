'use client';

import { useRef, useState } from 'react';
import { FileUp, FileText, X } from 'lucide-react';

// Área de "arraste o PDF aqui" usada na análise e na comparação.
export default function SeletorPdf({ rotulo, arquivo, onArquivo, desabilitado }: { rotulo: string; arquivo: File | null; onArquivo: (f: File | null) => void; desabilitado?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [arrastando, setArrastando] = useState(false);

  function escolher(f: File | undefined) {
    if (!f) return;
    if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') {
      alert('Envie um arquivo PDF.');
      return;
    }
    onArquivo(f);
  }

  if (arquivo) {
    return (
      <div className="flex items-center gap-3 border border-brand/20 bg-brand/[0.04] rounded-xl px-4 py-3">
        <FileText className="text-brand shrink-0" size={22} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-800 truncate">{arquivo.name}</p>
          <p className="text-xs text-gray-400">{(arquivo.size / 1024 / 1024).toFixed(2)} MB</p>
        </div>
        {!desabilitado && (
          <button onClick={() => onArquivo(null)} className="text-gray-400 hover:text-red-600" title="Remover">
            <X size={18} />
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      onClick={() => !desabilitado && input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setArrastando(true);
      }}
      onDragLeave={() => setArrastando(false)}
      onDrop={(e) => {
        e.preventDefault();
        setArrastando(false);
        escolher(e.dataTransfer.files[0]);
      }}
      className={`cursor-pointer border-2 border-dashed rounded-xl px-6 py-8 text-center transition-colors ${arrastando ? 'border-accent bg-accent/5' : 'border-gray-200 hover:border-brand/40 hover:bg-brand/[0.02]'}`}
    >
      <FileUp className="mx-auto text-brand/70" size={30} />
      <p className="text-sm font-medium text-gray-700 mt-2">{rotulo}</p>
      <p className="text-xs text-gray-400 mt-1">Arraste o PDF aqui ou clique para escolher</p>
      <input ref={input} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => escolher(e.target.files?.[0])} />
    </div>
  );
}
