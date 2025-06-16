-- CreateTable
CREATE TABLE "Turn14SyncLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "startTime" DATETIME NOT NULL,
    "endTime" DATETIME NOT NULL,
    "totalProducts" INTEGER NOT NULL,
    "successfulSyncs" INTEGER NOT NULL,
    "failedSyncs" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Turn14SyncError" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "syncLogId" TEXT NOT NULL,
    "sku" TEXT,
    "errorMessage" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Turn14SyncError_syncLogId_fkey" FOREIGN KEY ("syncLogId") REFERENCES "Turn14SyncLog" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
