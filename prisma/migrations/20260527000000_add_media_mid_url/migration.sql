-- AlterTable: add midUrl column for 900px WebP mid-size version
ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "midUrl" TEXT;
