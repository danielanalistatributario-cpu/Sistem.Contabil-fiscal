-- CreateTable
CREATE TABLE "SpedFiscalResumo" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT,
    "userName" TEXT,
    "cnpj" TEXT NOT NULL,
    "ie" TEXT NOT NULL,
    "empresaNome" TEXT NOT NULL,
    "uf" TEXT,
    "ym" TEXT NOT NULL,
    "codFin" TEXT,
    "nomeArquivo" TEXT NOT NULL,
    "resumo" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpedFiscalResumo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SpedFiscalResumo_companyId_cnpj_ie_ym_key" ON "SpedFiscalResumo"("companyId", "cnpj", "ie", "ym");

-- CreateIndex
CREATE INDEX "SpedFiscalResumo_companyId_cnpj_ym_idx" ON "SpedFiscalResumo"("companyId", "cnpj", "ym");

-- AddForeignKey
ALTER TABLE "SpedFiscalResumo" ADD CONSTRAINT "SpedFiscalResumo_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
