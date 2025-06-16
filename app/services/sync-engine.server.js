import { prisma } from "../db.server.js";
import { Turn14ApiService } from "./turn14-api.server.js";
import { getShopifyAdminApi } from "../utils/shopify.server.js";
import { logger } from "../utils/logger.server.js";

export class SyncEngine {
  constructor(shop, sessionToken) {
    this.shop = shop;
    this.sessionToken = sessionToken;
    this.turn14Api = new Turn14ApiService();
    this.shopifyAdmin = getShopifyAdminApi(sessionToken);
  }

  /**
   * Run a sync job based on type
   */
  async runSync(syncType, scheduleId = null, settings = {}) {
    const syncJob = await this.createSyncJob(syncType, scheduleId);
    
    try {
      await this.updateSyncJob(syncJob.id, { 
        status: "running", 
        startTime: new Date() 
      });

      let results;
      switch (syncType) {
        case "inventory":
          results = await this.syncInventory(settings);
          break;
        case "pricing":
          results = await this.syncPricing(settings);
          break;
        case "products":
          results = await this.syncNewProducts(settings);
          break;
        case "full":
          results = await this.fullSync(settings);
          break;
        default:
          throw new Error(`Unknown sync type: ${syncType}`);
      }

      await this.updateSyncJob(syncJob.id, {
        status: "completed",
        endTime: new Date(),
        ...results,
        results: JSON.stringify(results)
      });

      return { success: true, jobId: syncJob.id, results };
    } catch (error) {
      await this.updateSyncJob(syncJob.id, {
        status: "failed",
        endTime: new Date(),
        errorMessage: error.message
      });

      logger.error("Sync job failed", { 
        shop: this.shop, 
        syncType, 
        error: error.message 
      });
      
      throw error;
    }
  }

  /**
   * Sync inventory levels for imported products
   */
  async syncInventory(settings = {}) {
    const config = await this.getTurn14Config();
    await this.turn14Api.authenticate(config.apiKey, config.apiSecret, config.environment);

    const importedProducts = await prisma.turn14ImportedProduct.findMany({
      where: {
        shop: this.shop,
        syncStatus: "active"
      }
    });

    let totalItems = importedProducts.length;
    let processedItems = 0;
    let successItems = 0;
    let failedItems = 0;
    const errors = [];

    for (const product of importedProducts) {
      try {
        // Get current inventory from Turn 14
        const inventoryData = await this.turn14Api.getItemInventory(product.turn14Sku);
        
        if (inventoryData && inventoryData.items && inventoryData.items.length > 0) {
          const inventory = inventoryData.items[0];
          const newQuantity = inventory.inventory_quantity || 0;

          // Update Shopify inventory if different
          if (newQuantity !== product.inventoryQuantity) {
            await this.updateShopifyInventory(
              product.shopifyProductId,
              product.shopifyVariantId,
              newQuantity
            );

            // Update our tracking record
            await prisma.turn14ImportedProduct.update({
              where: { id: product.id },
              data: {
                inventoryQuantity: newQuantity,
                lastSynced: new Date(),
                syncStatus: "active"
              }
            });
          }
        }

        successItems++;
      } catch (error) {
        failedItems++;
        errors.push({
          sku: product.turn14Sku,
          error: error.message
        });

        // Update product with error status
        await prisma.turn14ImportedProduct.update({
          where: { id: product.id },
          data: {
            syncStatus: "error",
            syncErrors: JSON.stringify([{
              timestamp: new Date().toISOString(),
              message: error.message
            }])
          }
        });
      }

      processedItems++;
    }

    return {
      totalItems,
      processedItems,
      successItems,
      failedItems,
      errors
    };
  }

  /**
   * Sync pricing for imported products
   */
  async syncPricing(settings = {}) {
    const config = await this.getTurn14Config();
    await this.turn14Api.authenticate(config.apiKey, config.apiSecret, config.environment);

    const importedProducts = await prisma.turn14ImportedProduct.findMany({
      where: {
        shop: this.shop,
        syncStatus: "active"
      }
    });

    let totalItems = importedProducts.length;
    let processedItems = 0;
    let successItems = 0;
    let failedItems = 0;
    const errors = [];

    for (const product of importedProducts) {
      try {
        // Get current pricing from Turn 14
        const pricingData = await this.turn14Api.getItemPricing(product.turn14Sku);
        
        if (pricingData && pricingData.items && pricingData.items.length > 0) {
          const pricing = pricingData.items[0];
          const newPrice = pricing.price || product.originalPrice;

          // Calculate price with markup
          const finalPrice = newPrice * (1 + (product.priceMarkup / 100));

          // Update Shopify pricing if different
          if (newPrice !== product.originalPrice || finalPrice !== product.currentPrice) {
            await this.updateShopifyPricing(
              product.shopifyProductId,
              product.shopifyVariantId,
              finalPrice
            );

            // Update our tracking record
            await prisma.turn14ImportedProduct.update({
              where: { id: product.id },
              data: {
                originalPrice: newPrice,
                currentPrice: finalPrice,
                lastSynced: new Date(),
                syncStatus: "active"
              }
            });
          }
        }

        successItems++;
      } catch (error) {
        failedItems++;
        errors.push({
          sku: product.turn14Sku,
          error: error.message
        });

        await prisma.turn14ImportedProduct.update({
          where: { id: product.id },
          data: {
            syncStatus: "error",
            syncErrors: JSON.stringify([{
              timestamp: new Date().toISOString(),
              message: error.message
            }])
          }
        });
      }

      processedItems++;
    }

    return {
      totalItems,
      processedItems,
      successItems,
      failedItems,
      errors
    };
  }

  /**
   * Sync new products from Turn 14
   */
  async syncNewProducts(settings = {}) {
    const config = await this.getTurn14Config();
    await this.turn14Api.authenticate(config.apiKey, config.apiSecret, config.environment);

    const selectedBrands = config.selectedBrands ? JSON.parse(config.selectedBrands) : [];
    
    if (selectedBrands.length === 0) {
      throw new Error("No brands selected for product sync");
    }

    // Get existing Turn 14 SKUs to avoid duplicates
    const existingProducts = await prisma.turn14ImportedProduct.findMany({
      where: { shop: this.shop },
      select: { turn14Sku: true }
    });
    const existingSKUs = new Set(existingProducts.map(p => p.turn14Sku));

    let totalItems = 0;
    let processedItems = 0;
    let successItems = 0;
    let failedItems = 0;
    const errors = [];

    // Process each selected brand
    for (const brandId of selectedBrands) {
      try {
        const products = await this.turn14Api.getItemsByBrand(brandId, {
          page: 1,
          pageSize: settings.maxNewProducts || 50
        });

        if (products && products.items) {
          totalItems += products.items.length;

          for (const product of products.items) {
            if (existingSKUs.has(product.id)) {
              processedItems++;
              continue; // Skip already imported products
            }

            try {
              // Import new product to Shopify
              const shopifyProduct = await this.importProductToShopify(product, {
                priceMarkup: settings.defaultMarkup || 0,
                status: 'draft'
              });

              // Track the imported product
              await prisma.turn14ImportedProduct.create({
                data: {
                  shop: this.shop,
                  turn14Sku: product.id,
                  shopifyProductId: shopifyProduct.id.toString(),
                  shopifyVariantId: shopifyProduct.variants?.[0]?.id?.toString(),
                  turn14Brand: product.brand_name,
                  turn14Category: product.category,
                  originalPrice: product.price,
                  currentPrice: product.price * (1 + ((settings.defaultMarkup || 0) / 100)),
                  priceMarkup: settings.defaultMarkup || 0,
                  inventoryQuantity: product.inventory_quantity || 0,
                  lastSynced: new Date(),
                  syncStatus: "active",
                  metaData: JSON.stringify({
                    turn14Id: product.id,
                    importedAt: new Date().toISOString()
                  })
                }
              });

              successItems++;
            } catch (error) {
              failedItems++;
              errors.push({
                sku: product.id,
                error: error.message
              });
            }

            processedItems++;
          }
        }
      } catch (error) {
        errors.push({
          brand: brandId,
          error: error.message
        });
      }
    }

    return {
      totalItems,
      processedItems,
      successItems,
      failedItems,
      errors
    };
  }

  /**
   * Full sync - inventory, pricing, and new products
   */
  async fullSync(settings = {}) {
    const inventoryResults = await this.syncInventory(settings);
    const pricingResults = await this.syncPricing(settings);
    const newProductsResults = await this.syncNewProducts(settings);

    return {
      totalItems: inventoryResults.totalItems + pricingResults.totalItems + newProductsResults.totalItems,
      processedItems: inventoryResults.processedItems + pricingResults.processedItems + newProductsResults.processedItems,
      successItems: inventoryResults.successItems + pricingResults.successItems + newProductsResults.successItems,
      failedItems: inventoryResults.failedItems + pricingResults.failedItems + newProductsResults.failedItems,
      inventory: inventoryResults,
      pricing: pricingResults,
      newProducts: newProductsResults
    };
  }

  /**
   * Update Shopify inventory
   */
  async updateShopifyInventory(productId, variantId, quantity) {
    if (!variantId) return;

    // Get inventory item ID
    const variant = await this.shopifyAdmin.rest.ProductVariant.find({
      session: { shop: this.shop, accessToken: this.sessionToken },
      id: variantId
    });

    if (variant && variant.inventory_item_id) {
      // Update inventory level
      await this.shopifyAdmin.rest.InventoryLevel.adjust({
        session: { shop: this.shop, accessToken: this.sessionToken },
        body: {
          inventory_item_id: variant.inventory_item_id,
          available_adjustment: quantity - (variant.inventory_quantity || 0)
        }
      });
    }
  }

  /**
   * Update Shopify pricing
   */
  async updateShopifyPricing(productId, variantId, price) {
    if (!variantId) return;

    await this.shopifyAdmin.rest.ProductVariant.save({
      session: { shop: this.shop, accessToken: this.sessionToken },
      id: variantId,
      price: price.toFixed(2)
    });
  }

  /**
   * Import a Turn 14 product to Shopify
   */
  async importProductToShopify(turn14Product, options = {}) {
    const { priceMarkup = 0, status = 'draft' } = options;

    const finalPrice = turn14Product.price * (1 + (priceMarkup / 100));

    const shopifyProduct = new this.shopifyAdmin.rest.Product({
      session: { shop: this.shop, accessToken: this.sessionToken }
    });

    shopifyProduct.title = turn14Product.item_name;
    shopifyProduct.body_html = turn14Product.item_description || '';
    shopifyProduct.vendor = turn14Product.brand_name;
    shopifyProduct.product_type = turn14Product.category;
    shopifyProduct.status = status;
    shopifyProduct.tags = [
      'Turn14',
      turn14Product.brand_name,
      turn14Product.category
    ].filter(Boolean).join(', ');

    shopifyProduct.variants = [{
      price: finalPrice.toFixed(2),
      sku: turn14Product.id,
      inventory_quantity: turn14Product.inventory_quantity || 0,
      inventory_management: 'shopify'
    }];

    if (turn14Product.images && turn14Product.images.length > 0) {
      shopifyProduct.images = turn14Product.images.map(img => ({
        src: img.url
      }));
    }

    await shopifyProduct.save();
    return shopifyProduct;
  }

  /**
   * Get Turn 14 configuration for the shop
   */
  async getTurn14Config() {
    const config = await prisma.turn14Config.findUnique({
      where: { shop: this.shop }
    });

    if (!config) {
      throw new Error("Turn 14 configuration not found");
    }

    return config;
  }

  /**
   * Create a new sync job record
   */
  async createSyncJob(syncType, scheduleId = null) {
    return await prisma.turn14SyncJob.create({
      data: {
        shop: this.shop,
        scheduleId,
        syncType,
        status: "pending",
        totalItems: 0,
        processedItems: 0,
        successItems: 0,
        failedItems: 0
      }
    });
  }

  /**
   * Update sync job record
   */
  async updateSyncJob(jobId, updates) {
    return await prisma.turn14SyncJob.update({
      where: { id: jobId },
      data: updates
    });
  }
}

/**
 * Utility functions for sync schedules
 */
export class SyncScheduleManager {
  static async getActiveSchedules(shop) {
    return await prisma.turn14SyncSchedule.findMany({
      where: {
        shop,
        isActive: true
      },
      orderBy: { nextRun: 'asc' }
    });
  }

  static async createSchedule(shop, scheduleData) {
    const nextRun = this.calculateNextRun(scheduleData.frequency, scheduleData.schedule);
    
    return await prisma.turn14SyncSchedule.create({
      data: {
        ...scheduleData,
        shop,
        nextRun
      }
    });
  }

  static async updateSchedule(scheduleId, updates) {
    const schedule = await prisma.turn14SyncSchedule.update({
      where: { id: scheduleId },
      data: updates
    });

    // Recalculate next run if frequency changed
    if (updates.frequency || updates.schedule) {
      const nextRun = this.calculateNextRun(schedule.frequency, schedule.schedule);
      await prisma.turn14SyncSchedule.update({
        where: { id: scheduleId },
        data: { nextRun }
      });
    }

    return schedule;
  }

  static async getSchedulesDue() {
    return await prisma.turn14SyncSchedule.findMany({
      where: {
        isActive: true,
        nextRun: {
          lte: new Date()
        }
      }
    });
  }

  static async markScheduleRun(scheduleId) {
    const schedule = await prisma.turn14SyncSchedule.findUnique({
      where: { id: scheduleId }
    });

    if (!schedule) return;

    const now = new Date();
    const nextRun = this.calculateNextRun(schedule.frequency, schedule.schedule);

    await prisma.turn14SyncSchedule.update({
      where: { id: scheduleId },
      data: {
        lastRun: now,
        nextRun
      }
    });
  }

  static calculateNextRun(frequency, cronSchedule = null) {
    const now = new Date();

    if (cronSchedule) {
      // TODO: Implement cron parsing for complex schedules
      // For now, fall back to frequency-based calculation
    }

    switch (frequency) {
      case 'hourly':
        return new Date(now.getTime() + 60 * 60 * 1000);
      case 'daily':
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(2, 0, 0, 0); // 2 AM
        return tomorrow;
      case 'weekly':
        const nextWeek = new Date(now);
        nextWeek.setDate(nextWeek.getDate() + 7);
        nextWeek.setHours(2, 0, 0, 0); // 2 AM
        return nextWeek;
      case 'manual':
      default:
        return null;
    }
  }
} 