-- AlterTable
ALTER TABLE "ConciliacaoBancariaDia" ADD COLUMN     "consistenteExtrato" BOOLEAN,
ADD COLUMN     "consistenteRazao" BOOLEAN,
ADD COLUMN     "diferencaSaldoFinalDia" DOUBLE PRECISION,
ADD COLUMN     "saldoFinalExtrato" DOUBLE PRECISION,
ADD COLUMN     "saldoFinalRazao" DOUBLE PRECISION,
ADD COLUMN     "saldoInicialExtrato" DOUBLE PRECISION,
ADD COLUMN     "saldoInicialRazao" DOUBLE PRECISION;
