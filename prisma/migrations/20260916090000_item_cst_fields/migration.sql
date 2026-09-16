-- AlterTable
ALTER TABLE "AnaliseFiscalItem" ADD COLUMN     "cstCofins" TEXT,
ADD COLUMN     "cstIcms" TEXT,
ADD COLUMN     "cstPis" TEXT;

-- AlterTable
ALTER TABLE "AnaliseFiscalSaidaItem" ADD COLUMN     "cstCofins" TEXT,
ADD COLUMN     "cstIcms" TEXT,
ADD COLUMN     "cstPis" TEXT;
