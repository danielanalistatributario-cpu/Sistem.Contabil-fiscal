'use client';

import { extrairTextoPdf, LIMITE_UPLOAD_PDF } from './extrairTextoPdf';

// Envio de PDF(s) pras rotas /api/legislacao/analisar e /comparar, lendo
// a resposta em NDJSON (progresso → concluido/erro).

export type EtapaEnvio =
  | { etapa: 'extraindo'; arquivo: string; atual: number; total: number }
  | { etapa: 'enviando' }
  | { etapa: 'analisando'; caracteres: number; segundos: number };

// Monta os campos de um documento no FormData: o PDF inteiro quando cabe
// no limite de upload; senão, o texto extraído página a página.
export async function anexarDocumento(form: FormData, arquivo: File, prefixo: string, limite: number, onEtapa: (e: EtapaEnvio) => void) {
  form.append(`${prefixo}nome`, arquivo.name);
  if (arquivo.size <= limite) {
    form.append(`${prefixo}arquivo`, arquivo);
    return false;
  }
  const paginas = await extrairTextoPdf(arquivo, (atual, total) => onEtapa({ etapa: 'extraindo', arquivo: arquivo.name, atual, total }));
  form.append(`${prefixo}textoPaginas`, JSON.stringify(paginas));
  return true;
}

export async function enviarAnalise(url: string, form: FormData, onEtapa: (e: EtapaEnvio) => void): Promise<string> {
  onEtapa({ etapa: 'enviando' });
  const inicio = Date.now();
  const res = await fetch(url, { method: 'POST', body: form });
  if (!res.ok || !res.body) {
    const corpo = await res.json().catch(() => null);
    if (res.status === 413) throw new Error('Arquivo grande demais para envio. Tente um PDF menor.');
    throw new Error(corpo?.error || `Falha ao enviar (${res.status}).`);
  }
  const leitor = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let caracteres = 0;
  onEtapa({ etapa: 'analisando', caracteres: 0, segundos: 0 });
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let quebra: number;
    while ((quebra = buffer.indexOf('\n')) >= 0) {
      const linha = buffer.slice(0, quebra).trim();
      buffer = buffer.slice(quebra + 1);
      if (!linha) continue;
      const ev = JSON.parse(linha);
      if (ev.tipo === 'progresso') caracteres = ev.caracteres;
      if (ev.tipo === 'concluido') return ev.id as string;
      if (ev.tipo === 'erro') throw new Error(ev.mensagem);
      onEtapa({ etapa: 'analisando', caracteres, segundos: Math.round((Date.now() - inicio) / 1000) });
    }
  }
  throw new Error('A conexão caiu antes do fim da análise (o servidor pode ter atingido o tempo máximo). Tente de novo ou envie um PDF menor.');
}

export { LIMITE_UPLOAD_PDF };
