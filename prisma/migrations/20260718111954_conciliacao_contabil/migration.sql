-- CreateTable
CREATE TABLE "ConciliacaoApuracao" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "totalContas" INTEGER NOT NULL,
    "contasConciliadas" INTEGER NOT NULL,
    "contasDivergentes" INTEGER NOT NULL,
    "valorTotalDiferenca" REAL NOT NULL,
    "processedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConciliacaoApuracao_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ConciliacaoConta" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "apuracaoId" TEXT NOT NULL,
    "conta" TEXT NOT NULL,
    "descricao" TEXT,
    "saldoInicial" REAL NOT NULL,
    "debitoBalancete" REAL NOT NULL,
    "creditoBalancete" REAL NOT NULL,
    "saldoFinalBalancete" REAL NOT NULL,
    "debitoRazao" REAL NOT NULL,
    "creditoRazao" REAL NOT NULL,
    "saldoCalculado" REAL NOT NULL,
    "diferencaSaldo" REAL NOT NULL,
    "diferencaDebito" REAL NOT NULL,
    "diferencaCredito" REAL NOT NULL,
    "status" TEXT NOT NULL,
    "semMovimentacao" BOOLEAN NOT NULL DEFAULT false,
    "mesesSemMovimentacao" INTEGER NOT NULL DEFAULT 0,
    "observacoes" TEXT,
    CONSTRAINT "ConciliacaoConta_apuracaoId_fkey" FOREIGN KEY ("apuracaoId") REFERENCES "ConciliacaoApuracao" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ConciliacaoLancamento" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contaId" TEXT NOT NULL,
    "data" DATETIME,
    "historico" TEXT,
    "debito" REAL NOT NULL,
    "credito" REAL NOT NULL,
    "tipoAlerta" TEXT NOT NULL,
    CONSTRAINT "ConciliacaoLancamento_contaId_fkey" FOREIGN KEY ("contaId") REFERENCES "ConciliacaoConta" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
