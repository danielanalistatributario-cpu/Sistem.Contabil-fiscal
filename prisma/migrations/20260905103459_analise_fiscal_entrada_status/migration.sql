-- AlterTable
ALTER TABLE "AnaliseFiscalApuracao" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'PROCESSANDO';

-- DataFixup: apurações criadas antes deste campo existir foram sempre
-- concluídas atomicamente numa única requisição (fluxo antigo) — marcar
-- como CONCLUIDA pra não aparecerem como incompletas no histórico.
UPDATE "AnaliseFiscalApuracao" SET "status" = 'CONCLUIDA';
