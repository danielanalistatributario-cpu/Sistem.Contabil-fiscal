-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "ufDestino" TEXT NOT NULL DEFAULT 'PA',
    "aliquotaInterna" DOUBLE PRECISION NOT NULL DEFAULT 0.19,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordReset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordReset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpedFile" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "competencia" TEXT,
    "totalLinhas" INTEGER NOT NULL,
    "blocksJson" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpedFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IcmsApuracao" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "semPagamento" BOOLEAN NOT NULL DEFAULT false,
    "totalNF" INTEGER NOT NULL,
    "qtdPagas" INTEGER NOT NULL,
    "qtdPendentes" INTEGER NOT NULL,
    "valorPago" DOUBLE PRECISION NOT NULL,
    "valorPendente" DOUBLE PRECISION NOT NULL,
    "itensConsiderados" INTEGER NOT NULL,
    "itensDesconsiderados" INTEGER NOT NULL,
    "qtdSemAliquota" INTEGER NOT NULL,
    "divergencias" INTEGER NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IcmsApuracao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IcmsNotaApurada" (
    "id" TEXT NOT NULL,
    "apuracaoId" TEXT NOT NULL,
    "docFiscal" TEXT NOT NULL,
    "fornecedor" TEXT,
    "cnpj" TEXT,
    "uf" TEXT,
    "filial" TEXT,
    "produto" TEXT,
    "ncm" TEXT,
    "tes" TEXT,
    "chaveNfe" TEXT,
    "dataEmissao" TIMESTAMP(3),
    "base" DOUBLE PRECISION NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL,
    "valorPago" DOUBLE PRECISION,
    "dataPagamento" TIMESTAMP(3),
    "divergencia" DOUBLE PRECISION,
    "itensSemAliquota" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "IcmsNotaApurada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DifalApuracao" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "ufDestino" TEXT NOT NULL,
    "aliquotaInterna" DOUBLE PRECISION NOT NULL,
    "totalItens" INTEGER NOT NULL,
    "itensComDifal" INTEGER NOT NULL,
    "itensSemDados" INTEGER NOT NULL,
    "valorTotalDifal" DOUBLE PRECISION NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DifalApuracao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DifalItem" (
    "id" TEXT NOT NULL,
    "apuracaoId" TEXT NOT NULL,
    "docFiscal" TEXT NOT NULL,
    "fornecedor" TEXT,
    "cnpj" TEXT,
    "ufOrigem" TEXT,
    "produto" TEXT,
    "ncm" TEXT,
    "cfop" TEXT,
    "origemCodigo" TEXT,
    "dataEmissao" TIMESTAMP(3),
    "quantidade" DOUBLE PRECISION,
    "valorUnitario" DOUBLE PRECISION,
    "frete" DOUBLE PRECISION,
    "despesaIpi" DOUBLE PRECISION,
    "desconto" DOUBLE PRECISION,
    "valorTotal" DOUBLE PRECISION NOT NULL,
    "aliqInterestadual" DOUBLE PRECISION,
    "valorOrigem" DOUBLE PRECISION,
    "baseIcms" DOUBLE PRECISION,
    "icmsDestino" DOUBLE PRECISION,
    "valorDifal" DOUBLE PRECISION,
    "inconsistencia" TEXT,

    CONSTRAINT "DifalItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConciliacaoApuracao" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "modoAnalise" TEXT NOT NULL DEFAULT 'BALANCETE',
    "contasAnalisadas" TEXT,
    "totalContas" INTEGER NOT NULL,
    "contasConciliadas" INTEGER NOT NULL,
    "contasDivergentes" INTEGER NOT NULL,
    "valorTotalDiferenca" DOUBLE PRECISION NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConciliacaoApuracao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConciliacaoConta" (
    "id" TEXT NOT NULL,
    "apuracaoId" TEXT NOT NULL,
    "conta" TEXT NOT NULL,
    "descricao" TEXT,
    "saldoInicial" DOUBLE PRECISION NOT NULL,
    "debitoBalancete" DOUBLE PRECISION NOT NULL,
    "creditoBalancete" DOUBLE PRECISION NOT NULL,
    "saldoFinalBalancete" DOUBLE PRECISION NOT NULL,
    "debitoRazao" DOUBLE PRECISION NOT NULL,
    "creditoRazao" DOUBLE PRECISION NOT NULL,
    "saldoCalculado" DOUBLE PRECISION NOT NULL,
    "diferencaSaldo" DOUBLE PRECISION NOT NULL,
    "diferencaDebito" DOUBLE PRECISION NOT NULL,
    "diferencaCredito" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL,
    "semMovimentacao" BOOLEAN NOT NULL DEFAULT false,
    "mesesSemMovimentacao" INTEGER NOT NULL DEFAULT 0,
    "extratoSaldoFinal" DOUBLE PRECISION,
    "extratoDiferenca" DOUBLE PRECISION,
    "observacoes" TEXT,

    CONSTRAINT "ConciliacaoConta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConciliacaoLancamento" (
    "id" TEXT NOT NULL,
    "contaId" TEXT NOT NULL,
    "data" TIMESTAMP(3),
    "historico" TEXT,
    "debito" DOUBLE PRECISION NOT NULL,
    "credito" DOUBLE PRECISION NOT NULL,
    "tipoAlerta" TEXT NOT NULL,

    CONSTRAINT "ConciliacaoLancamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT,
    "action" TEXT NOT NULL,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConciliacaoBancariaApuracao" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "contaRazao" TEXT,
    "saldoInicial" DOUBLE PRECISION NOT NULL,
    "saldoFinalRazao" DOUBLE PRECISION NOT NULL,
    "saldoFinalExtrato" DOUBLE PRECISION NOT NULL,
    "diferencaSaldoFinal" DOUBLE PRECISION NOT NULL,
    "totalRazao" INTEGER NOT NULL,
    "totalExtrato" INTEGER NOT NULL,
    "totalConciliados" INTEGER NOT NULL,
    "totalPendentes" INTEGER NOT NULL,
    "valorPendenteRazao" DOUBLE PRECISION NOT NULL,
    "valorPendenteExtrato" DOUBLE PRECISION NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConciliacaoBancariaApuracao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConciliacaoBancariaDia" (
    "id" TEXT NOT NULL,
    "apuracaoId" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "saldoRazao" DOUBLE PRECISION,
    "saldoExtrato" DOUBLE PRECISION,
    "diferenca" DOUBLE PRECISION,

    CONSTRAINT "ConciliacaoBancariaDia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConciliacaoBancariaItem" (
    "id" TEXT NOT NULL,
    "apuracaoId" TEXT NOT NULL,
    "origem" TEXT NOT NULL,
    "data" TIMESTAMP(3),
    "historico" TEXT,
    "valor" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL,
    "grupoRef" TEXT,
    "duplicadoSuspeito" BOOLEAN NOT NULL DEFAULT false,
    "observacao" TEXT,

    CONSTRAINT "ConciliacaoBancariaItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditorRtcApuracao" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "periodo" TEXT,
    "totalNfes" INTEGER NOT NULL,
    "totalItens" INTEGER NOT NULL,
    "canceladas" INTEGER NOT NULL,
    "denegadas" INTEGER NOT NULL,
    "validas" INTEGER NOT NULL,
    "comAlertas" INTEGER NOT NULL,
    "inconsistentes" INTEGER NOT NULL,
    "pctConformidade" DOUBLE PRECISION NOT NULL,
    "semIBS" INTEGER NOT NULL,
    "semCBS" INTEGER NOT NULL,
    "arquivosComErro" INTEGER NOT NULL DEFAULT 0,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditorRtcApuracao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditorRtcNfe" (
    "id" TEXT NOT NULL,
    "apuracaoId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "chave" TEXT,
    "nNF" TEXT,
    "serie" TEXT,
    "dhEmi" TEXT,
    "cnpjEmit" TEXT,
    "xNomeEmit" TEXT,
    "status" TEXT NOT NULL,
    "statusDetail" TEXT,
    "situacao" TEXT NOT NULL,
    "itemCount" INTEGER NOT NULL,
    "itensErro" INTEGER NOT NULL DEFAULT 0,
    "itensAlerta" INTEGER NOT NULL DEFAULT 0,
    "itensSemIBS" INTEGER NOT NULL DEFAULT 0,
    "itensSemCBS" INTEGER NOT NULL DEFAULT 0,
    "observacoes" TEXT,
    "nProt" TEXT,
    "synthetic" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AuditorRtcNfe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditorRtcItem" (
    "id" TEXT NOT NULL,
    "nfeId" TEXT NOT NULL,
    "nItem" TEXT,
    "xProd" TEXT,
    "cProd" TEXT,
    "ncm" TEXT,
    "cfop" TEXT,
    "tes" TEXT,
    "cClassTrib" TEXT,
    "cst" TEXT,
    "groupType" TEXT,
    "qCom" DOUBLE PRECISION,
    "vUnCom" DOUBLE PRECISION,
    "vProd" DOUBLE PRECISION,
    "vDesc" DOUBLE PRECISION,
    "vFrete" DOUBLE PRECISION,
    "vSeg" DOUBLE PRECISION,
    "vOutro" DOUBLE PRECISION,
    "vBC" DOUBLE PRECISION,
    "pIBSUF" DOUBLE PRECISION,
    "vIBSUF" DOUBLE PRECISION,
    "pIBSMun" DOUBLE PRECISION,
    "vIBSMun" DOUBLE PRECISION,
    "pIBSTotal" DOUBLE PRECISION,
    "vIBS" DOUBLE PRECISION,
    "pCBS" DOUBLE PRECISION,
    "vCBS" DOUBLE PRECISION,
    "hasIBS" BOOLEAN NOT NULL DEFAULT false,
    "hasCBS" BOOLEAN NOT NULL DEFAULT false,
    "cstPis" TEXT,
    "pPis" DOUBLE PRECISION,
    "vPis" DOUBLE PRECISION,
    "cstCofins" TEXT,
    "pCofins" DOUBLE PRECISION,
    "vCofins" DOUBLE PRECISION,
    "situacao" TEXT NOT NULL,
    "missingLabel" TEXT,
    "alertLabel" TEXT,

    CONSTRAINT "AuditorRtcItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Company_cnpj_key" ON "Company"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_companyId_key" ON "Membership"("userId", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordReset_token_key" ON "PasswordReset"("token");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordReset" ADD CONSTRAINT "PasswordReset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpedFile" ADD CONSTRAINT "SpedFile_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IcmsApuracao" ADD CONSTRAINT "IcmsApuracao_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IcmsNotaApurada" ADD CONSTRAINT "IcmsNotaApurada_apuracaoId_fkey" FOREIGN KEY ("apuracaoId") REFERENCES "IcmsApuracao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DifalApuracao" ADD CONSTRAINT "DifalApuracao_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DifalItem" ADD CONSTRAINT "DifalItem_apuracaoId_fkey" FOREIGN KEY ("apuracaoId") REFERENCES "DifalApuracao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConciliacaoApuracao" ADD CONSTRAINT "ConciliacaoApuracao_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConciliacaoConta" ADD CONSTRAINT "ConciliacaoConta_apuracaoId_fkey" FOREIGN KEY ("apuracaoId") REFERENCES "ConciliacaoApuracao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConciliacaoLancamento" ADD CONSTRAINT "ConciliacaoLancamento_contaId_fkey" FOREIGN KEY ("contaId") REFERENCES "ConciliacaoConta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConciliacaoBancariaApuracao" ADD CONSTRAINT "ConciliacaoBancariaApuracao_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConciliacaoBancariaDia" ADD CONSTRAINT "ConciliacaoBancariaDia_apuracaoId_fkey" FOREIGN KEY ("apuracaoId") REFERENCES "ConciliacaoBancariaApuracao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConciliacaoBancariaItem" ADD CONSTRAINT "ConciliacaoBancariaItem_apuracaoId_fkey" FOREIGN KEY ("apuracaoId") REFERENCES "ConciliacaoBancariaApuracao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditorRtcApuracao" ADD CONSTRAINT "AuditorRtcApuracao_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditorRtcNfe" ADD CONSTRAINT "AuditorRtcNfe_apuracaoId_fkey" FOREIGN KEY ("apuracaoId") REFERENCES "AuditorRtcApuracao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditorRtcItem" ADD CONSTRAINT "AuditorRtcItem_nfeId_fkey" FOREIGN KEY ("nfeId") REFERENCES "AuditorRtcNfe"("id") ON DELETE CASCADE ON UPDATE CASCADE;
