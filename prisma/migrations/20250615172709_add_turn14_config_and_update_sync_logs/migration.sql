/*
  Warnings:

  - Added the required column `shop` to the `Turn14SyncLog` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "Turn14Config" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "apiSecret" TEXT,
    "environment" TEXT NOT NULL DEFAULT 'production',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastValidated" DATETIME,
    "validationError" TEXT,
    "dealerCode" TEXT,
    "selectedBrands" TEXT,
    "syncSettings" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Turn14SyncLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "startTime" DATETIME NOT NULL,
    "endTime" DATETIME NOT NULL,
    "totalProducts" INTEGER NOT NULL,
    "successfulSyncs" INTEGER NOT NULL,
    "failedSyncs" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Turn14SyncLog" ("createdAt", "endTime", "failedSyncs", "id", "startTime", "successfulSyncs", "totalProducts") SELECT "createdAt", "endTime", "failedSyncs", "id", "startTime", "successfulSyncs", "totalProducts" FROM "Turn14SyncLog";
DROP TABLE "Turn14SyncLog";
ALTER TABLE "new_Turn14SyncLog" RENAME TO "Turn14SyncLog";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Turn14Config_shop_key" ON "Turn14Config"("shop");
