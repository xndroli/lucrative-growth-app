import { prisma } from "../db.server.js";
import { Turn14ApiService } from "./turn14-api.server.js";
import { logger } from "../utils/logger.server.js";

/**
 * YMM (Year/Make/Model) Service
 * Handles vehicle compatibility for Turn 14 automotive parts
 */
export class YMMService {
  constructor(shop) {
    this.shop = shop;
    this.turn14Api = new Turn14ApiService();
  }

  /**
   * Initialize Turn 14 API with shop credentials
   */
  async initializeApi() {
    const config = await prisma.turn14Config.findUnique({
      where: { shop: this.shop }
    });

    if (!config) {
      throw new Error("Turn 14 configuration not found");
    }

    await this.turn14Api.authenticate(config.apiKey, config.apiSecret, config.environment);
  }

  /**
   * Sync vehicle database from Turn 14
   */
  async syncVehicleDatabase() {
    try {
      await this.initializeApi();
      
      logger.info("Starting vehicle database sync", { shop: this.shop });

      // Get vehicle data from Turn 14 API
      const vehicleData = await this.turn14Api.getVehicles();
      
      if (!vehicleData || !vehicleData.items) {
        throw new Error("No vehicle data received from Turn 14");
      }

      let processed = 0;
      let updated = 0;
      let created = 0;

      for (const vehicle of vehicleData.items) {
        try {
          const vehicleRecord = await prisma.turn14VehicleDatabase.upsert({
            where: {
              year_make_model_submodel: {
                year: vehicle.year,
                make: vehicle.make,
                model: vehicle.model,
                submodel: vehicle.submodel || null
              }
            },
            update: {
              engine: vehicle.engine,
              engineSize: vehicle.engine_size,
              fuelType: vehicle.fuel_type,
              transmission: vehicle.transmission,
              driveType: vehicle.drive_type,
              bodyStyle: vehicle.body_style,
              turn14VehicleId: vehicle.id,
              turn14MmyId: vehicle.mmy_id,
              lastUpdated: new Date(),
              isActive: true
            },
            create: {
              year: vehicle.year,
              make: vehicle.make,
              model: vehicle.model,
              submodel: vehicle.submodel || null,
              engine: vehicle.engine,
              engineSize: vehicle.engine_size,
              fuelType: vehicle.fuel_type,
              transmission: vehicle.transmission,
              driveType: vehicle.drive_type,
              bodyStyle: vehicle.body_style,
              turn14VehicleId: vehicle.id,
              turn14MmyId: vehicle.mmy_id,
              isActive: true
            }
          });

          if (vehicleRecord.lastUpdated.getTime() === vehicleRecord.createdAt.getTime()) {
            created++;
          } else {
            updated++;
          }

          processed++;
        } catch (error) {
          logger.error(`Error processing vehicle: ${vehicle.year} ${vehicle.make} ${vehicle.model}`, {
            error: error.message,
            vehicle
          });
        }
      }

      logger.info("Vehicle database sync completed", {
        shop: this.shop,
        processed,
        created,
        updated
      });

      return { processed, created, updated };
    } catch (error) {
      logger.error("Vehicle database sync failed", {
        shop: this.shop,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get vehicle compatibility for a product
   */
  async getProductCompatibility(productId) {
    try {
      const compatibility = await prisma.turn14VehicleCompatibility.findMany({
        where: {
          shop: this.shop,
          productId
        },
        orderBy: [
          { year: 'desc' },
          { make: 'asc' },
          { model: 'asc' }
        ]
      });

      return compatibility;
    } catch (error) {
      logger.error("Error getting product compatibility", {
        shop: this.shop,
        productId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Sync product compatibility from Turn 14
   */
  async syncProductCompatibility(turn14Sku) {
    try {
      await this.initializeApi();

      // Get the imported product record
      const product = await prisma.turn14ImportedProduct.findUnique({
        where: {
          shop_turn14Sku: {
            shop: this.shop,
            turn14Sku
          }
        }
      });

      if (!product) {
        throw new Error(`Product not found: ${turn14Sku}`);
      }

      // Get compatibility data from Turn 14
      const compatibilityData = await this.turn14Api.getItemCompatibility(turn14Sku);

      if (!compatibilityData || !compatibilityData.items) {
        logger.warn("No compatibility data found for product", {
          shop: this.shop,
          turn14Sku
        });
        return { processed: 0, created: 0, updated: 0 };
      }

      // Clear existing compatibility records
      await prisma.turn14VehicleCompatibility.deleteMany({
        where: {
          shop: this.shop,
          productId: product.id
        }
      });

      let processed = 0;
      let created = 0;

      for (const compatibility of compatibilityData.items) {
        try {
          await prisma.turn14VehicleCompatibility.create({
            data: {
              shop: this.shop,
              productId: product.id,
              year: compatibility.year,
              make: compatibility.make,
              model: compatibility.model,
              submodel: compatibility.submodel || null,
              engine: compatibility.engine,
              engineSize: compatibility.engine_size,
              fuelType: compatibility.fuel_type,
              transmission: compatibility.transmission,
              driveType: compatibility.drive_type,
              bodyStyle: compatibility.body_style,
              turn14VehicleId: compatibility.vehicle_id,
              turn14MmyId: compatibility.mmy_id,
              notes: compatibility.notes,
              restrictions: compatibility.restrictions,
              isUniversal: compatibility.is_universal || false
            }
          });

          created++;
          processed++;
        } catch (error) {
          logger.error("Error creating compatibility record", {
            shop: this.shop,
            turn14Sku,
            compatibility,
            error: error.message
          });
        }
      }

      logger.info("Product compatibility sync completed", {
        shop: this.shop,
        turn14Sku,
        processed,
        created
      });

      return { processed, created, updated: 0 };
    } catch (error) {
      logger.error("Product compatibility sync failed", {
        shop: this.shop,
        turn14Sku,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Search vehicles by year, make, model
   */
  async searchVehicles(filters = {}) {
    try {
      const { year, make, model, limit = 50, offset = 0 } = filters;

      const where = {};
      if (year) where.year = year;
      if (make) where.make = { contains: make, mode: 'insensitive' };
      if (model) where.model = { contains: model, mode: 'insensitive' };

      const vehicles = await prisma.turn14VehicleDatabase.findMany({
        where: {
          ...where,
          isActive: true
        },
        orderBy: [
          { year: 'desc' },
          { make: 'asc' },
          { model: 'asc' }
        ],
        take: limit,
        skip: offset
      });

      const total = await prisma.turn14VehicleDatabase.count({
        where: {
          ...where,
          isActive: true
        }
      });

      return { vehicles, total };
    } catch (error) {
      logger.error("Error searching vehicles", {
        shop: this.shop,
        filters,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Find compatible products for a vehicle
   */
  async findCompatibleProducts(vehicleFilters = {}) {
    try {
      const { year, make, model, submodel, category, brand, limit = 50, offset = 0 } = vehicleFilters;

      const compatibilityWhere = {
        shop: this.shop
      };

      if (year) compatibilityWhere.year = year;
      if (make) compatibilityWhere.make = { contains: make, mode: 'insensitive' };
      if (model) compatibilityWhere.model = { contains: model, mode: 'insensitive' };
      if (submodel) compatibilityWhere.submodel = { contains: submodel, mode: 'insensitive' };

      const productWhere = {
        shop: this.shop,
        syncStatus: 'active'
      };

      if (category) productWhere.turn14Category = { contains: category, mode: 'insensitive' };
      if (brand) productWhere.turn14Brand = { contains: brand, mode: 'insensitive' };

      const compatibleProducts = await prisma.turn14VehicleCompatibility.findMany({
        where: compatibilityWhere,
        include: {
          product: {
            where: productWhere
          }
        },
        take: limit,
        skip: offset,
        orderBy: {
          product: {
            turn14Brand: 'asc'
          }
        }
      });

      // Filter out products that don't match the product criteria
      const filteredProducts = compatibleProducts.filter(comp => comp.product);

      const total = await prisma.turn14VehicleCompatibility.count({
        where: {
          ...compatibilityWhere,
          product: productWhere
        }
      });

      return {
        compatibleProducts: filteredProducts,
        total
      };
    } catch (error) {
      logger.error("Error finding compatible products", {
        shop: this.shop,
        vehicleFilters,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get available years
   */
  async getAvailableYears() {
    try {
      const years = await prisma.turn14VehicleDatabase.findMany({
        where: { isActive: true },
        select: { year: true },
        distinct: ['year'],
        orderBy: { year: 'desc' }
      });

      return years.map(y => y.year);
    } catch (error) {
      logger.error("Error getting available years", {
        shop: this.shop,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get available makes for a year
   */
  async getAvailableMakes(year) {
    try {
      const makes = await prisma.turn14VehicleDatabase.findMany({
        where: {
          year: year,
          isActive: true
        },
        select: { make: true },
        distinct: ['make'],
        orderBy: { make: 'asc' }
      });

      return makes.map(m => m.make);
    } catch (error) {
      logger.error("Error getting available makes", {
        shop: this.shop,
        year,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get available models for a year and make
   */
  async getAvailableModels(year, make) {
    try {
      const models = await prisma.turn14VehicleDatabase.findMany({
        where: {
          year: year,
          make: make,
          isActive: true
        },
        select: { model: true },
        distinct: ['model'],
        orderBy: { model: 'asc' }
      });

      return models.map(m => m.model);
    } catch (error) {
      logger.error("Error getting available models", {
        shop: this.shop,
        year,
        make,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get YMM statistics
   */
  async getYMMStats() {
    try {
      const [totalVehicles, totalCompatibilityRecords, productsWithCompatibility] = await Promise.all([
        prisma.turn14VehicleDatabase.count({
          where: { isActive: true }
        }),
        prisma.turn14VehicleCompatibility.count({
          where: { shop: this.shop }
        }),
        prisma.turn14ImportedProduct.count({
          where: {
            shop: this.shop,
            vehicleCompatibility: {
              some: {}
            }
          }
        })
      ]);

      const totalProducts = await prisma.turn14ImportedProduct.count({
        where: { shop: this.shop }
      });

      const compatibilityPercentage = totalProducts > 0 
        ? Math.round((productsWithCompatibility / totalProducts) * 100)
        : 0;

      return {
        totalVehicles,
        totalCompatibilityRecords,
        productsWithCompatibility,
        totalProducts,
        compatibilityPercentage
      };
    } catch (error) {
      logger.error("Error getting YMM stats", {
        shop: this.shop,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Bulk sync compatibility for all products
   */
  async bulkSyncCompatibility(options = {}) {
    try {
      const { limit = 10, brandFilter = null } = options;

      const where = {
        shop: this.shop,
        syncStatus: 'active'
      };

      if (brandFilter) {
        where.turn14Brand = brandFilter;
      }

      const products = await prisma.turn14ImportedProduct.findMany({
        where,
        take: limit,
        orderBy: { createdAt: 'asc' }
      });

      let processed = 0;
      let successful = 0;
      let failed = 0;
      const errors = [];

      for (const product of products) {
        try {
          await this.syncProductCompatibility(product.turn14Sku);
          successful++;
        } catch (error) {
          failed++;
          errors.push({
            sku: product.turn14Sku,
            error: error.message
          });
        }
        processed++;
      }

      logger.info("Bulk compatibility sync completed", {
        shop: this.shop,
        processed,
        successful,
        failed
      });

      return {
        processed,
        successful,
        failed,
        errors
      };
    } catch (error) {
      logger.error("Bulk compatibility sync failed", {
        shop: this.shop,
        error: error.message
      });
      throw error;
    }
  }
} 