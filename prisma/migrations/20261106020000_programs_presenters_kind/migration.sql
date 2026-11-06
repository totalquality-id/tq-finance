-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'TERMIN';

-- AlterTable
ALTER TABLE "Project" DROP COLUMN "presenter",
ADD COLUMN     "fiscalYear" INTEGER,
ADD COLUMN     "presenters" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "ProjectMilestone" ADD COLUMN     "notes" TEXT;

-- CreateTable
CREATE TABLE "Presenter" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Presenter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Presenter_code_key" ON "Presenter"("code");

