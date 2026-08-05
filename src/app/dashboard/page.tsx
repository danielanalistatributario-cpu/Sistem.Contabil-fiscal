import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { ROLE_LABELS } from '@/lib/permissions';
import Link from 'next/link';
import EmpresaSwitchCard from '@/components/EmpresaSwitchCard';
import {
  FileSpreadsheet, Calculator, Percent, BookOpenCheck, ArrowUpRight, FileUp,
  LogIn, KeyRound, Building2, UserPlus, ShieldCheck, RefreshCw, Trash2, Settings2, Sparkles,
  PackageSearch,
} from 'lucide-react';

export default async function DashboardHome() {
  const session = await getSession();
  if (!session || !session.currentCompanyId) return null;

  const companyId = session.currentCompanyId;

  const [ultimaApuracao, ultimaApuracaoDifal, ultimaConciliacao, spedFiles, atividades] = await Promise.all([
    prisma.icmsApuracao.findFirst({ where: { companyId }, orderBy: { processedAt: 'desc' } }),
    prisma.difalApuracao.findFirst({ where: { companyId }, orderBy: { processedAt: 'desc' } }),
    prisma.conciliacaoApuracao.findFirst({ where: { companyId }, orderBy: { processedAt: 'desc' } }),
    prisma.spedFile.count({ where: { companyId } }),
    prisma.activityLog.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' }, take: 7, include: { user: true } }),
  ]);

  const cards = [
    {
      label: 'ICMS Antecipado Pendente',
      value: `R$ ${(ultimaApuracao?.valorPendente || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      sub: ultimaApuracao ? `${ultimaApuracao.qtdPendentes} nota(s) · ${ultimaApuracao.periodo}` : 'nenhuma apuração ainda',
      icon: Calculator,
      color: 'accent',
    },
    {
      label: 'DIFAL a Recolher',
      value: `R$ ${(ultimaApuracaoDifal?.valorTotalDifal || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      sub: ultimaApuracaoDifal ? `${ultimaApuracaoDifal.totalItens} item(ns) · ${ultimaApuracaoDifal.periodo}` : 'nenhuma apuração ainda',
      icon: Percent,
      color: 'teal',
    },
    {
      label: 'Conciliação Contábil',
      value: ultimaConciliacao ? `${ultimaConciliacao.contasDivergentes} divergência(s)` : '—',
      sub: ultimaConciliacao ? `${ultimaConciliacao.periodo}` : 'nenhuma conciliação ainda',
      icon: BookOpenCheck,
      color: 'pink',
    },
    {
      label: 'Arquivos SPED Importados',
      value: String(spedFiles),
      sub: 'total acumulado',
      icon: FileSpreadsheet,
      color: 'lime',
    },
  ];

  const colorMap: Record<string, { bg: string; text: string }> = {
    accent: { bg: 'bg-accent/10', text: 'text-accent' },
    teal: { bg: 'bg-teal/10', text: 'text-teal' },
    pink: { bg: 'bg-pink/10', text: 'text-pink' },
    lime: { bg: 'bg-lime/10', text: 'text-lime' },
    ruby: { bg: 'bg-ruby/10', text: 'text-ruby' },
  };

  const quickActions = [
    { href: '/dashboard/sped', label: 'Importar SPED Fiscal', icon: FileUp, color: 'lime' },
    { href: '/dashboard/icms', label: 'Apurar ICMS Antecipado', icon: Calculator, color: 'accent' },
    { href: '/dashboard/difal', label: 'Calcular DIFAL', icon: Percent, color: 'teal' },
    { href: '/dashboard/conciliacao', label: 'Nova Conciliação', icon: BookOpenCheck, color: 'pink' },
    { href: '/dashboard/validacao-cadastro/exportar-perfis', label: 'Exportar Perfis do Protheus', icon: PackageSearch, color: 'ruby' },
  ];

  const companyName = session.memberships.find((m) => m.companyId === companyId)?.companyName;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Hero de boas-vindas */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand to-brand-deep px-7 py-8 sm:px-9 sm:py-10 text-white">
        <div className="brand-arcs" />
        <div className="relative z-10">
          <div className="inline-flex items-center gap-1.5 bg-white/10 border border-white/15 rounded-full px-3 py-1 text-[11px] font-medium mb-4">
            <Sparkles size={12} className="text-accent" />
            Portal Fiscal e Contábil
          </div>
          <h1 className="font-display text-3xl sm:text-4xl font-semibold">Olá, {session.name.split(' ')[0]} 👋</h1>
          <p className="text-white/70 text-sm mt-2">
            {session.currentRole ? ROLE_LABELS[session.currentRole] : ''} em <span className="text-white/90 font-medium">{companyName}</span>
          </p>
        </div>
      </div>

      {/* Cards de indicadores */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 stagger">
        {cards.map((c) => {
          const Icon = c.icon;
          const colors = colorMap[c.color];
          return (
            <div key={c.label} className="card-surface p-5 hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-200">
              <div className={`w-10 h-10 rounded-xl ${colors.bg} flex items-center justify-center mb-3`}>
                <Icon size={18} className={colors.text} strokeWidth={2} />
              </div>
              <p className="text-[11px] text-gray-400 uppercase tracking-wide font-medium">{c.label}</p>
              <p className="text-2xl font-mono font-semibold text-gray-800 mt-1">{c.value}</p>
              <p className="text-xs text-gray-400 mt-1">{c.sub}</p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Atalhos rápidos */}
        <div className="lg:col-span-2 card-surface p-5">
          <h2 className="font-display font-semibold text-brand mb-4 text-sm">Atalhos rápidos</h2>
          <div className="grid grid-cols-2 gap-3">
            <EmpresaSwitchCard memberships={session.memberships} currentCompanyId={companyId} />
            {quickActions.map((a) => {
              const Icon = a.icon;
              const colors = colorMap[a.color];
              return (
                <Link
                  key={a.href}
                  href={a.href}
                  className="group flex flex-col gap-2.5 p-3.5 rounded-xl border border-gray-100 hover:border-transparent hover:shadow-card transition-all duration-200"
                >
                  <div className={`w-9 h-9 rounded-lg ${colors.bg} flex items-center justify-center`}>
                    <Icon size={16} className={colors.text} />
                  </div>
                  <span className="text-xs font-medium text-gray-700 leading-tight">{a.label}</span>
                  <ArrowUpRight size={13} className="text-gray-300 group-hover:text-gray-500 transition-colors ml-auto -mt-6" />
                </Link>
              );
            })}
          </div>
        </div>

        {/* Atividade recente — timeline */}
        <div className="lg:col-span-3 card-surface p-5">
          <h2 className="font-display font-semibold text-brand mb-4 text-sm">Atividade recente</h2>
          {atividades.length === 0 && <p className="text-sm text-gray-400">Nenhuma atividade registrada ainda.</p>}
          <ul className="relative">
            {atividades.map((a, idx) => {
              const meta = actionMeta(a.action);
              const Icon = meta.icon;
              return (
                <li key={a.id} className="relative pl-9 pb-4 last:pb-0">
                  {idx < atividades.length - 1 && <span className="absolute left-[13px] top-6 bottom-0 w-px bg-gray-100" />}
                  <span className={`absolute left-0 top-0.5 w-7 h-7 rounded-full ${meta.bg} flex items-center justify-center`}>
                    <Icon size={13} className={meta.text} />
                  </span>
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm text-gray-600">
                      <strong className="text-gray-800 font-medium">{a.user.name}</strong> {formatAction(a.action)}
                      {a.details ? <span className="text-gray-400"> · {a.details}</span> : ''}
                    </p>
                    <span className="text-[11px] text-gray-400 whitespace-nowrap font-mono shrink-0">
                      {new Date(a.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}

function actionMeta(action: string): { icon: typeof LogIn; bg: string; text: string } {
  if (action === 'LOGIN') return { icon: LogIn, bg: 'bg-brand/10', text: 'text-brand' };
  if (action === 'ALTEROU_SENHA') return { icon: KeyRound, bg: 'bg-gray-100', text: 'text-gray-500' };
  if (action === 'TROCOU_EMPRESA') return { icon: Building2, bg: 'bg-gray-100', text: 'text-gray-500' };
  if (action.startsWith('ADICIONOU_USUARIO')) return { icon: UserPlus, bg: 'bg-lime/10', text: 'text-lime' };
  if (action.startsWith('ALTEROU_PERFIL') || action.startsWith('REMOVEU_ACESSO')) return { icon: ShieldCheck, bg: 'bg-gray-100', text: 'text-gray-500' };
  if (action.startsWith('EXCLUIU')) return { icon: Trash2, bg: 'bg-ruby/10', text: 'text-ruby' };
  if (action.startsWith('ATUALIZOU_CONFIG')) return { icon: Settings2, bg: 'bg-gray-100', text: 'text-gray-500' };
  if (action.startsWith('PROCESSOU') || action.startsWith('IMPORTOU') || action.startsWith('GEROU')) return { icon: RefreshCw, bg: 'bg-accent/10', text: 'text-accent' };
  return { icon: FileUp, bg: 'bg-gray-100', text: 'text-gray-500' };
}

function formatAction(action: string) {
  const map: Record<string, string> = {
    LOGIN: 'entrou no portal',
    ALTEROU_SENHA: 'alterou a senha',
    TROCOU_EMPRESA: 'trocou de empresa ativa',
    IMPORTOU_SPED_FISCAL: 'importou um arquivo SPED Fiscal',
    GEROU_RELATORIO_NFE_SPED: 'gerou o relatório NF-e no layout do modelo',
    PROCESSOU_APURACAO_ICMS: 'processou uma apuração de ICMS Antecipado',
    EXCLUIU_APURACAO_ICMS: 'excluiu uma apuração de ICMS Antecipado',
    PROCESSOU_APURACAO_DIFAL: 'processou uma apuração de DIFAL',
    EXCLUIU_APURACAO_DIFAL: 'excluiu uma apuração de DIFAL',
    ATUALIZOU_CONFIG_FISCAL: 'atualizou a configuração fiscal da empresa',
    PROCESSOU_CONCILIACAO: 'processou uma conciliação contábil',
    EXCLUIU_CONCILIACAO: 'excluiu uma conciliação contábil',
    PROCESSOU_CONCILIACAO_BANCARIA: 'processou uma conciliação bancária',
    EXCLUIU_CONCILIACAO_BANCARIA: 'excluiu uma conciliação bancária',
    PROCESSOU_AUDITORIA_RTC: 'processou uma auditoria RTC (IBS/CBS)',
    EXCLUIU_AUDITORIA_RTC: 'excluiu uma auditoria RTC',
    EXPORTOU_PERFIS_PROTHEUS: 'exportou os Perfis de Produto do Protheus',
    ADICIONOU_USUARIO: 'adicionou um usuário',
    ALTEROU_PERFIL_USUARIO: 'alterou o perfil de um usuário',
    REMOVEU_ACESSO_USUARIO: 'removeu o acesso de um usuário',
  };
  return map[action] || action.toLowerCase();
}
