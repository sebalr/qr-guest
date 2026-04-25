/*
  Warnings:

  - You are about to drop the column `tenant_id` on the `device_event_debug_data` table. All the data in the column will be lost.
  - You are about to drop the column `tenant_id` on the `events` table. All the data in the column will be lost.
  - You are about to drop the column `tenant_id` on the `guests` table. All the data in the column will be lost.
  - You are about to drop the column `role` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `tenant_id` on the `users` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "device_event_debug_data" DROP CONSTRAINT "device_event_debug_data_event_id_fkey";

-- DropForeignKey
ALTER TABLE "device_event_debug_data" DROP CONSTRAINT "device_event_debug_data_tenant_id_fkey";

-- DropForeignKey
ALTER TABLE "device_event_debug_data" DROP CONSTRAINT "device_event_debug_data_user_id_fkey";

-- DropForeignKey
ALTER TABLE "events" DROP CONSTRAINT "events_tenant_id_fkey";

-- DropForeignKey
ALTER TABLE "guests" DROP CONSTRAINT "guests_tenant_id_fkey";

-- DropForeignKey
ALTER TABLE "users" DROP CONSTRAINT "users_tenant_id_fkey";

-- DropIndex
DROP INDEX "device_event_debug_data_tenant_id_idx";

-- AlterTable
ALTER TABLE "device_event_debug_data" DROP COLUMN "tenant_id";

-- AlterTable
ALTER TABLE "events" DROP COLUMN "tenant_id";

-- AlterTable
ALTER TABLE "guests" DROP COLUMN "tenant_id";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "role",
DROP COLUMN "tenant_id";

-- CreateTable
CREATE TABLE "user_tenants" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_tenants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_tenants_user_id_tenant_id_key" ON "user_tenants"("user_id", "tenant_id");

-- AddForeignKey
ALTER TABLE "user_tenants" ADD CONSTRAINT "user_tenants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_tenants" ADD CONSTRAINT "user_tenants_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
