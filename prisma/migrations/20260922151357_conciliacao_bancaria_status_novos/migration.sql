-- AlterTable
ALTER TABLE "ConciliacaoBancariaApuracao" ADD COLUMN     "totalDivergenciaValor" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalFechamentoTotalDia" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ConciliacaoBancariaItem" ADD COLUMN     "documento" TEXT;
