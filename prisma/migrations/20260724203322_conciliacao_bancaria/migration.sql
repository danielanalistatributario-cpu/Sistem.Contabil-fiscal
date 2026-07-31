-- CreateTable
CREATE TABLE "ConciliacaoBancariaApuracao" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "contaRazao" TEXT,
    "saldoInicial" REAL NOT NULL,
    "saldoFinalRazao" REAL NOT NULL,
    "saldoFinalExtrato" REAL NOT NULL,
    "diferencaSaldoFinal" REAL NOT NULL,
    "totalRazao" INTEGER NOT NULL,
    "totalExtrato" INTEGER NOT NULL,
    "totalConciliados" INTEGER NOT NULL,
    "totalPendentes" INTEGER NOT NULL,
    "valorPendenteRazao" REAL NOT NULL,
    "valorPendenteExtrato" REAL NOT NULL,
    "processedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConciliacaoBancariaApuracao_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ConciliacaoBancariaDia" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "apuracaoId" TEXT NOT NULL,
    "data" DATETIME NOT NULL,
    "saldoRazao" REAL,
    "saldoExtrato" REAL,
    "diferenca" REAL,
    CONSTRAINT "ConciliacaoBancariaDia_apuracaoId_fkey" FOREIGN KEY ("apuracaoId") REFERENCES "ConciliacaoBancariaApuracao" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ConciliacaoBancariaItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "apuracaoId" TEXT NOT NULL,
    "origem" TEXT NOT NULL,
    "data" DATETIME,
    "historico" TEXT,
    "valor" REAL NOT NULL,
    "status" TEXT NOT NULL,
    "grupoRef" TEXT,
    "duplicadoSuspeito" BOOLEAN NOT NULL DEFAULT false,
    "observacao" TEXT,
    CONSTRAINT "ConciliacaoBancariaItem_apuracaoId_fkey" FOREIGN KEY ("apuracaoId") REFERENCES "ConciliacaoBancariaApuracao" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
