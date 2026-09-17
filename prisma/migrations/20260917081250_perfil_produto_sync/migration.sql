-- DropIndex
DROP INDEX "PerfilProdutoItem_perfilId_codigo_key";

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "protheusPerfisUltimaSincronizacao" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "PerfilProdutoItem" ADD COLUMN     "aplicaATodos" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "produtoGrupo" TEXT,
ADD COLUMN     "produtoTipo" TEXT;
