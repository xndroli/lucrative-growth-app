import { prisma } from "../db.server.js";
import { SyncEngine, SyncScheduleManager } from "./sync-engine.server.js";
import { logger } from "../utils/logger.server.js";

/**
 * Background Sync Scheduler
 * Handles automated synchronization tasks
 */
export class SyncScheduler {
  constructor() {
    this.isRunning = false;
    this.intervalId = null;
    this.checkInterval = 60000; // Check every minute
  }

  /**
   * Start the scheduler
   */
  start() {
    if (this.isRunning) {
      logger.warn("Sync scheduler is already running");
      return;
    }

    this.isRunning = true;
    this.intervalId = setInterval(() => {
      this.checkAndRunScheduledSyncs();
    }, this.checkInterval);

    logger.info("Sync scheduler started");
  }

  /**
   * Stop the scheduler
   */
  stop() {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    logger.info("Sync scheduler stopped");
  }

  /**
   * Check for and run any scheduled syncs that are due
   */
  async checkAndRunScheduledSyncs() {
    try {
      const dueSchedules = await SyncScheduleManager.getSchedulesDue();
      
      logger.info(`Found ${dueSchedules.length} due sync schedules`);

      for (const schedule of dueSchedules) {
        await this.runScheduledSync(schedule);
      }
    } catch (error) {
      logger.error("Error checking scheduled syncs:", error);
    }
  }

  /**
   * Run a specific scheduled sync
   */
  async runScheduledSync(schedule) {
    try {
      logger.info(`Running scheduled sync: ${schedule.name} (${schedule.syncType})`);

      // Get shop's session data (in a real app, you'd need to store and retrieve this)
      const shopConfig = await prisma.turn14Config.findUnique({
        where: { shop: schedule.shop }
      });

      if (!shopConfig) {
        logger.error(`No Turn14 config found for shop: ${schedule.shop}`);
        return;
      }

      // Create a temporary session object for the sync engine
      // In a production app, you'd need to properly handle session tokens
      const tempSession = {
        shop: schedule.shop,
        accessToken: process.env.SHOPIFY_ACCESS_TOKEN // This would be stored per shop
      };

      const syncEngine = new SyncEngine(schedule.shop, tempSession.accessToken);
      
      // Parse sync settings
      const syncSettings = schedule.syncSettings 
        ? JSON.parse(schedule.syncSettings) 
        : {};

      // Run the sync
      const result = await syncEngine.runSync(
        schedule.syncType, 
        schedule.id, 
        syncSettings
      );

      // Mark the schedule as run
      await SyncScheduleManager.markScheduleRun(schedule.id);

      logger.info(`Scheduled sync completed: ${schedule.name}`, {
        scheduleId: schedule.id,
        syncType: schedule.syncType,
        result: result.results
      });

    } catch (error) {
      logger.error(`Error running scheduled sync: ${schedule.name}`, {
        scheduleId: schedule.id,
        error: error.message
      });

      // Create a failed sync job record
      await prisma.turn14SyncJob.create({
        data: {
          shop: schedule.shop,
          scheduleId: schedule.id,
          syncType: schedule.syncType,
          status: "failed",
          startTime: new Date(),
          endTime: new Date(),
          errorMessage: error.message,
          totalItems: 0,
          processedItems: 0,
          successItems: 0,
          failedItems: 0
        }
      });
    }
  }

  /**
   * Run a manual sync for a specific shop
   */
  async runManualSync(shop, syncType, settings = {}, sessionToken = null) {
    try {
      logger.info(`Running manual sync for shop: ${shop}`, { syncType, settings });

      const syncEngine = new SyncEngine(shop, sessionToken);
      const result = await syncEngine.runSync(syncType, null, settings);

      logger.info(`Manual sync completed for shop: ${shop}`, {
        syncType,
        result: result.results
      });

      return result;
    } catch (error) {
      logger.error(`Error running manual sync for shop: ${shop}`, {
        syncType,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get sync status for a shop
   */
  async getSyncStatus(shop) {
    try {
      // Get active schedules
      const activeSchedules = await SyncScheduleManager.getActiveSchedules(shop);

      // Get recent sync jobs
      const recentJobs = await prisma.turn14SyncJob.findMany({
        where: { shop },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          schedule: {
            select: {
              name: true,
              syncType: true
            }
          }
        }
      });

      // Get sync statistics
      const syncStats = await this.calculateSyncStats(shop);

      return {
        activeSchedules: activeSchedules.length,
        recentJobs: recentJobs.length,
        lastSync: recentJobs[0]?.createdAt || null,
        stats: syncStats,
        schedules: activeSchedules,
        jobs: recentJobs
      };
    } catch (error) {
      logger.error(`Error getting sync status for shop: ${shop}`, error);
      throw error;
    }
  }

  /**
   * Calculate sync statistics for a shop
   */
  async calculateSyncStats(shop, days = 7) {
    try {
      const since = new Date();
      since.setDate(since.getDate() - days);

      const [totalJobs, successfulJobs, failedJobs] = await Promise.all([
        prisma.turn14SyncJob.count({
          where: {
            shop,
            createdAt: { gte: since }
          }
        }),
        prisma.turn14SyncJob.count({
          where: {
            shop,
            status: 'completed',
            createdAt: { gte: since }
          }
        }),
        prisma.turn14SyncJob.count({
          where: {
            shop,
            status: 'failed',
            createdAt: { gte: since }
          }
        })
      ]);

      const successRate = totalJobs > 0 
        ? Math.round((successfulJobs / totalJobs) * 100) 
        : 100;

      return {
        totalJobs,
        successfulJobs,
        failedJobs,
        successRate,
        period: `${days} days`
      };
    } catch (error) {
      logger.error(`Error calculating sync stats for shop: ${shop}`, error);
      return {
        totalJobs: 0,
        successfulJobs: 0,
        failedJobs: 0,
        successRate: 0,
        period: `${days} days`
      };
    }
  }

  /**
   * Clean up old sync jobs and logs
   */
  async cleanupOldSyncData(retentionDays = 30) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const deletedJobs = await prisma.turn14SyncJob.deleteMany({
        where: {
          createdAt: { lt: cutoffDate }
        }
      });

      const deletedLogs = await prisma.turn14SyncLog.deleteMany({
        where: {
          createdAt: { lt: cutoffDate }
        }
      });

      logger.info(`Cleaned up old sync data`, {
        deletedJobs: deletedJobs.count,
        deletedLogs: deletedLogs.count,
        retentionDays
      });

      return {
        deletedJobs: deletedJobs.count,
        deletedLogs: deletedLogs.count
      };
    } catch (error) {
      logger.error("Error cleaning up old sync data:", error);
      throw error;
    }
  }
}

// Global scheduler instance
let globalScheduler = null;

/**
 * Get or create the global scheduler instance
 */
export function getGlobalScheduler() {
  if (!globalScheduler) {
    globalScheduler = new SyncScheduler();
  }
  return globalScheduler;
}

/**
 * Start the global scheduler
 */
export function startGlobalScheduler() {
  const scheduler = getGlobalScheduler();
  scheduler.start();
  return scheduler;
}

/**
 * Stop the global scheduler
 */
export function stopGlobalScheduler() {
  if (globalScheduler) {
    globalScheduler.stop();
  }
}

/**
 * Utility function to initialize sync scheduler for the app
 */
export function initializeSyncScheduler() {
  // Start the scheduler when the app starts
  const scheduler = startGlobalScheduler();
  
  // Set up cleanup job to run daily
  setInterval(async () => {
    try {
      await scheduler.cleanupOldSyncData(30); // Keep 30 days of data
    } catch (error) {
      logger.error("Error in scheduled cleanup:", error);
    }
  }, 24 * 60 * 60 * 1000); // Every 24 hours

  logger.info("Sync scheduler initialized");
  return scheduler;
}

// Export the scheduler instance for use in routes
export { SyncScheduler }; 