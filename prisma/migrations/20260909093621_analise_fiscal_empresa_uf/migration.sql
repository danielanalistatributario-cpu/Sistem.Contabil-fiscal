-- AlterTable
ALTER TABLE "AnaliseFiscalApuracao" ADD COLUMN     "empresaAnalisadaCnpj" TEXT,
ADD COLUMN     "empresaAnalisadaNome" TEXT,
ADD COLUMN     "empresaAnalisadaUf" TEXT;

-- AlterTable
ALTER TABLE "AnaliseFiscalCnpjGrupo" ADD COLUMN     "aliquotaInterna" DOUBLE PRECISION,
ADD COLUMN     "uf" TEXT;

-- AlterTable
ALTER TABLE "AnaliseFiscalSaidaApuracao" ADD COLUMN     "empresaAnalisadaCnpj" TEXT,
ADD COLUMN     "empresaAnalisadaNome" TEXT,
ADD COLUMN     "empresaAnalisadaUf" TEXT;
