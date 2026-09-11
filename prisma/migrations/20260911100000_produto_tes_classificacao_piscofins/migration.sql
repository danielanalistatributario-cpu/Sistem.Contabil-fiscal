-- AlterTable
ALTER TABLE "AnaliseFiscalProdutoClassificacao" ADD COLUMN     "classificacaoPisCofins" TEXT;

-- AlterTable
ALTER TABLE "AnaliseFiscalTesConfig" ADD COLUMN     "naturezaOperacaoPisCofins" TEXT NOT NULL DEFAULT 'LIVRE';
