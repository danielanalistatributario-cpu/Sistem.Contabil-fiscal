-- CreateTable
CREATE TABLE "DifalApuracao" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "ufDestino" TEXT NOT NULL,
    "aliquotaInterna" REAL NOT NULL,
    "totalItens" INTEGER NOT NULL,
    "itensComDifal" INTEGER NOT NULL,
    "itensSemDados" INTEGER NOT NULL,
    "valorTotalDifal" REAL NOT NULL,
    "processedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DifalApuracao_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DifalItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "apuracaoId" TEXT NOT NULL,
    "docFiscal" TEXT NOT NULL,
    "fornecedor" TEXT,
    "cnpj" TEXT,
    "ufOrigem" TEXT,
    "produto" TEXT,
    "ncm" TEXT,
    "cfop" TEXT,
    "origemCodigo" TEXT,
    "dataEmissao" DATETIME,
    "valorTotal" REAL NOT NULL,
    "aliqInterestadual" REAL,
    "valorOrigem" REAL,
    "baseIcms" REAL,
    "icmsDestino" REAL,
    "valorDifal" REAL,
    "inconsistencia" TEXT,
    CONSTRAINT "DifalItem_apuracaoId_fkey" FOREIGN KEY ("apuracaoId") REFERENCES "DifalApuracao" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Company" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "ufDestino" TEXT NOT NULL DEFAULT 'PA',
    "aliquotaInterna" REAL NOT NULL DEFAULT 0.19,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Company" ("cnpj", "createdAt", "id", "name") SELECT "cnpj", "createdAt", "id", "name" FROM "Company";
DROP TABLE "Company";
ALTER TABLE "new_Company" RENAME TO "Company";
CREATE UNIQUE INDEX "Company_cnpj_key" ON "Company"("cnpj");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
