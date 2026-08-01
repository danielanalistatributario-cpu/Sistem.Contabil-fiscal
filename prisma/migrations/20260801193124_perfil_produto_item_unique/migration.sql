-- DropIndex
DROP INDEX "PerfilProdutoItem_perfilId_codigo_idx";

-- CreateIndex
CREATE UNIQUE INDEX "PerfilProdutoItem_perfilId_codigo_key" ON "PerfilProdutoItem"("perfilId", "codigo");
