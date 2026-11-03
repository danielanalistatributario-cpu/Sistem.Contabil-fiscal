import * as XLSX from 'xlsx';
import type { ResultadoValidacao } from './tipos';
import { ROTULO_GRAVIDADE } from './tipos';

const SITUACAO: Record<string, string> = {
  AUSENTE: 'Ausente',
  INDEVIDO: 'Indevido',
  DIVERGENTE: 'Divergente',
  NAO_EXIGIVEL: 'Alerta — ainda não exigível',
  NAO_VALIDAVEL: 'Não validável automaticamente',
};
const VEREDITO: Record<string, string> = {
  CONFORME: 'De acordo com a NT',
  DIVERGENTE: 'Com divergências',
  SEM_REGRAS_APLICAVEIS: 'Sem regras aplicáveis',
  ERRO: 'Erro de leitura',
};

// Excel da validação: uma aba de resumo (uma linha por XML) e uma aba com
// todas as ocorrências (a coluna "Arquivo" permite filtrar).
export function exportarValidacoesExcel(resultados: ResultadoValidacao[], normaRotulo: string) {
  const resumo = resultados.map((r) => ({
    Arquivo: r.arquivo,
    'Nota Técnica': normaRotulo,
    'Nº NF': r.numero ?? '',
    Série: r.serie ?? '',
    Modelo: r.modelo ?? '',
    Emissão: r.emissao ? r.emissao.split('-').reverse().join('/') : '',
    'Chave de acesso': r.chave ?? '',
    'CNPJ/CPF emitente': r.emitente.doc ?? '',
    'CNPJ/CPF destinatário': r.destinatario.doc ?? '',
    Resultado: VEREDITO[r.veredito] ?? r.veredito,
    'Conformidade (%)': r.conformidade ?? '',
    Conformes: r.contagens.conformes,
    Alertas: r.contagens.alertas,
    Divergências: r.contagens.divergencias,
    'Obrigatórios ausentes': r.contagens.ausentes,
    'Campos indevidos': r.contagens.indevidos,
    'Não validáveis': r.contagens.naoValidaveis,
    Erro: r.erro ?? '',
  }));
  const ocorrencias = resultados.flatMap((r) =>
    r.ocorrencias.map((o) => ({
      Arquivo: r.arquivo,
      'Nº NF': r.numero ?? '',
      Situação: SITUACAO[o.situacao] ?? o.situacao,
      Gravidade: ROTULO_GRAVIDADE[o.gravidade],
      'Item (tag)': o.item,
      'Nº do item': o.nItem ?? '',
      Localização: o.localizacao,
      'Regra da NT': o.regra,
      Referência: o.referencia,
      Rejeição: o.rejeicao ?? '',
      'Valor encontrado': o.valorEncontrado ?? '',
      'Valor esperado': o.valorEsperado ?? '',
      Orientação: o.orientacao,
    }))
  );
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumo), 'Resumo');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ocorrencias.length ? ocorrencias : [{ Aviso: 'Nenhuma ocorrência.' }]), 'Ocorrências');
  XLSX.writeFile(wb, `Validacao_XML_${normaRotulo.replace(/[^\w.-]+/g, '_')}.xlsx`);
}
