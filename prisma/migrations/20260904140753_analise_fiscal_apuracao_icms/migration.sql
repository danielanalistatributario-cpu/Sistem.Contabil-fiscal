-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "inscricaoEstadual" TEXT;

-- CreateTable
CREATE TABLE "AnaliseFiscalApuracaoIcms" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "entradaApuracaoId" TEXT,
    "saidaApuracaoId" TEXT,
    "saldoCredorAnterior" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnaliseFiscalApuracaoIcms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnaliseFiscalApuracaoIcmsLancamento" (
    "id" TEXT NOT NULL,
    "apuracaoId" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AnaliseFiscalApuracaoIcmsLancamento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnaliseFiscalApuracaoIcmsLancamento_apuracaoId_idx" ON "AnaliseFiscalApuracaoIcmsLancamento"("apuracaoId");

-- AddForeignKey
ALTER TABLE "AnaliseFiscalApuracaoIcms" ADD CONSTRAINT "AnaliseFiscalApuracaoIcms_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnaliseFiscalApuracaoIcms" ADD CONSTRAINT "AnaliseFiscalApuracaoIcms_entradaApuracaoId_fkey" FOREIGN KEY ("entradaApuracaoId") REFERENCES "AnaliseFiscalApuracao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnaliseFiscalApuracaoIcms" ADD CONSTRAINT "AnaliseFiscalApuracaoIcms_saidaApuracaoId_fkey" FOREIGN KEY ("saidaApuracaoId") REFERENCES "AnaliseFiscalSaidaApuracao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnaliseFiscalApuracaoIcmsLancamento" ADD CONSTRAINT "AnaliseFiscalApuracaoIcmsLancamento_apuracaoId_fkey" FOREIGN KEY ("apuracaoId") REFERENCES "AnaliseFiscalApuracaoIcms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
