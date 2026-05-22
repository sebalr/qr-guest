-- AlterTable
ALTER TABLE "events"
ADD COLUMN "include_description_in_pdf" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "include_image_in_pdf" BOOLEAN NOT NULL DEFAULT false;
