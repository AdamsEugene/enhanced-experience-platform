-- AlterTable
ALTER TABLE "chatbots" ALTER COLUMN "status" SET DEFAULT 'inactive';

-- AlterTable
ALTER TABLE "widget_recommendations" ALTER COLUMN "shortName" SET DATA TYPE VARCHAR(12),
ALTER COLUMN "status" SET DEFAULT 'inactive';
