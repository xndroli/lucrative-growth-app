// app/utils/sync-log.server.js
import { db } from '../db.server.js';

// Turn 14 Sync Log Management Utilities

export async function createSyncLog(shop, totalProducts = 0) {
  try {
    const syncLog = await db.turn14SyncLog.create({
      data: {
        shop,
        startTime: new Date(),
        endTime: new Date(), // Will be updated when sync completes
        totalProducts,
        successfulSyncs: 0,
        failedSyncs: 0
      }
    });
    
    return syncLog;
  } catch (error) {
    console.error('Failed to create sync log:', error);
    throw new Error('Could not create sync log');
  }
}

export async function updateSyncLog(syncLogId, updates) {
  try {
    const syncLog = await db.turn14SyncLog.update({
      where: { id: syncLogId },
      data: {
        ...updates,
        endTime: new Date()
      }
    });
    
    return syncLog;
  } catch (error) {
    console.error('Failed to update sync log:', error);
    throw new Error('Could not update sync log');
  }
}

export async function addSyncError(syncLogId, sku, errorMessage) {
  try {
    const syncError = await db.turn14SyncError.create({
      data: {
        syncLogId,
        sku,
        errorMessage
      }
    });
    
    // Update the failed sync count
    await db.turn14SyncLog.update({
      where: { id: syncLogId },
      data: {
        failedSyncs: {
          increment: 1
        }
      }
    });
    
    return syncError;
  } catch (error) {
    console.error('Failed to add sync error:', error);
    throw new Error('Could not add sync error');
  }
}

export async function incrementSuccessfulSync(syncLogId) {
  try {
    await db.turn14SyncLog.update({
      where: { id: syncLogId },
      data: {
        successfulSyncs: {
          increment: 1
        }
      }
    });
  } catch (error) {
    console.error('Failed to increment successful sync:', error);
    throw new Error('Could not increment successful sync count');
  }
}

export async function getLatestSyncLogs(shop, limit = 10) {
  try {
    const syncLogs = await db.turn14SyncLog.findMany({
      where: { shop },
      include: {
        syncErrors: {
          orderBy: { createdAt: 'desc' },
          take: 5 // Limit errors per log to avoid huge queries
        }
      },
      orderBy: { startTime: 'desc' },
      take: limit
    });
    
    return syncLogs;
  } catch (error) {
    console.error('Failed to get sync logs:', error);
    throw new Error('Could not retrieve sync logs');
  }
}

export async function getSyncLogById(syncLogId) {
  try {
    const syncLog = await db.turn14SyncLog.findUnique({
      where: { id: syncLogId },
      include: {
        syncErrors: {
          orderBy: { createdAt: 'desc' }
        }
      }
    });
    
    return syncLog;
  } catch (error) {
    console.error('Failed to get sync log:', error);
    throw new Error('Could not retrieve sync log');
  }
}

export async function deleteSyncLog(syncLogId) {
  try {
    // Delete sync errors first (due to foreign key constraint)
    await db.turn14SyncError.deleteMany({
      where: { syncLogId }
    });
    
    // Then delete the sync log
    await db.turn14SyncLog.delete({
      where: { id: syncLogId }
    });
    
    return true;
  } catch (error) {
    console.error('Failed to delete sync log:', error);
    throw new Error('Could not delete sync log');
  }
}

export async function getSyncStats(shop, days = 30) {
  try {
    const since = new Date();
    since.setDate(since.getDate() - days);
    
    const stats = await db.turn14SyncLog.aggregate({
      where: {
        shop,
        startTime: { gte: since }
      },
      _sum: {
        totalProducts: true,
        successfulSyncs: true,
        failedSyncs: true
      },
      _count: {
        id: true
      }
    });
    
    return {
      totalSyncs: stats._count.id || 0,
      totalProducts: stats._sum.totalProducts || 0,
      successfulSyncs: stats._sum.successfulSyncs || 0,
      failedSyncs: stats._sum.failedSyncs || 0,
      successRate: stats._sum.totalProducts > 0 
        ? ((stats._sum.successfulSyncs || 0) / stats._sum.totalProducts * 100).toFixed(2)
        : 0
    };
  } catch (error) {
    console.error('Failed to get sync stats:', error);
    throw new Error('Could not retrieve sync statistics');
  }
}

export async function cleanupOldSyncLogs(shop, daysToKeep = 90) {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    
    // Get old sync log IDs
    const oldSyncLogs = await db.turn14SyncLog.findMany({
      where: {
        shop,
        startTime: { lt: cutoffDate }
      },
      select: { id: true }
    });
    
    const oldSyncLogIds = oldSyncLogs.map(log => log.id);
    
    if (oldSyncLogIds.length > 0) {
      // Delete sync errors first
      await db.turn14SyncError.deleteMany({
        where: { syncLogId: { in: oldSyncLogIds } }
      });
      
      // Then delete sync logs
      const deletedCount = await db.turn14SyncLog.deleteMany({
        where: { id: { in: oldSyncLogIds } }
      });
      
      return deletedCount.count;
    }
    
    return 0;
  } catch (error) {
    console.error('Failed to cleanup old sync logs:', error);
    throw new Error('Could not cleanup old sync logs');
  }
}