/*
  Warnings:

  - Added the required column `shortName` to the `widget_recommendations` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable - Add columns with default values first
ALTER TABLE "widget_recommendations" 
ADD COLUMN "shortName" VARCHAR(6) NOT NULL DEFAULT 'WIDGET',
ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active';

