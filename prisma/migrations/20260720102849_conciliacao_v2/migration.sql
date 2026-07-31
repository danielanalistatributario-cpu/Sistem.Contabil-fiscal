-- AlterTable
ALTER TABLE "ConciliacaoConta" ADD COLUMN "extratoDiferenca" REAL;
ALTER TABLE "ConciliacaoConta" ADD COLUMN "extratoSaldoFinal" REAL;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ConciliacaoApuracao" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "modoAnalise" TEXT NOT NULL DEFAULT 'BALANCETE',
    "contasAnalisadas" TEXT,
    "totalContas" INTEGER NOT NULL,
    "contasConciliadas" INTEGER NOT NULL,
    "contasDivergentes" INTEGER NOT NULL,
    "valorTotalDiferenca" REAL NOT NULL,
    "processedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConciliacaoApuracao_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ConciliacaoApuracao" ("companyId", "contasConciliadas", "contasDivergentes", "id", "periodo", "processedAt", "totalContas", "valorTotalDiferenca") SELECT "companyId", "contasConciliadas", "contasDivergentes", "id", "periodo", "processedAt", "totalContas", "valorTotalDiferenca" FROM "ConciliacaoApuracao";
DROP TABLE "ConciliacaoApuracao";
ALTER TABLE "new_ConciliacaoApuracao" RENAME TO "ConciliacaoApuracao";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
