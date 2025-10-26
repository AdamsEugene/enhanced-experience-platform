-- AlterTable
ALTER TABLE "chatbots" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'active';

-- AlterTable
ALTER TABLE "widget_recommendations" ALTER COLUMN "shortName" DROP DEFAULT;
