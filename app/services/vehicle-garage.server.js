import { db } from "../db.server.js";
import { logger } from "../utils/logger.server.js";

/**
 * Vehicle Garage Service
 * Handles customer vehicle management, maintenance reminders, price alerts, and analytics
 */
export class VehicleGarageService {
  constructor(shop) {
    this.shop = shop;
  }

  // ==================== GARAGE MANAGEMENT ====================

  /**
   * Get or create a customer's vehicle garage
   */
  async getOrCreateGarage(customerId, customerEmail = null) {
    try {
      let garage = await db.customerVehicleGarage.findUnique({
        where: {
          shop_customerId: {
            shop: this.shop,
            customerId: customerId
          }
        },
        include: {
          vehicles: {
            orderBy: [
              { isPrimary: 'desc' },
              { createdAt: 'desc' }
            ]
          }
        }
      });

      if (!garage) {
        garage = await db.customerVehicleGarage.create({
          data: {
            shop: this.shop,
            customerId: customerId,
            customerEmail: customerEmail,
            name: "My Vehicles"
          },
          include: {
            vehicles: true
          }
        });

        logger.info(`Created new vehicle garage for customer ${customerId}`, {
          shop: this.shop,
          customerId,
          garageId: garage.id
        });
      }

      return garage;
    } catch (error) {
      logger.error('Error getting/creating vehicle garage:', error);
      throw error;
    }
  }

  /**
   * Get garage with full vehicle details and related data
   */
  async getGarageWithDetails(customerId) {
    try {
      const garage = await db.customerVehicleGarage.findUnique({
        where: {
          shop_customerId: {
            shop: this.shop,
            customerId: customerId
          }
        },
        include: {
          vehicles: {
            include: {
              maintenanceReminders: {
                where: { isActive: true },
                orderBy: { nextDue: 'asc' }
              },
              priceAlerts: {
                where: { isActive: true },
                orderBy: { createdAt: 'desc' }
              },
              purchaseHistory: {
                orderBy: { purchaseDate: 'desc' },
                take: 10
              }
            },
            orderBy: [
              { isPrimary: 'desc' },
              { createdAt: 'desc' }
            ]
          }
        }
      });

      return garage;
    } catch (error) {
      logger.error('Error getting garage details:', error);
      throw error;
    }
  }

  // ==================== VEHICLE MANAGEMENT ====================

  /**
   * Add a vehicle to customer's garage
   */
  async addVehicle(customerId, vehicleData) {
    try {
      const garage = await this.getOrCreateGarage(customerId);
      
      // Check vehicle limit
      if (garage.vehicles.length >= garage.maxVehicles) {
        throw new Error(`Vehicle limit reached. Maximum ${garage.maxVehicles} vehicles allowed.`);
      }

      // If this is the first vehicle, make it primary
      const isPrimary = garage.vehicles.length === 0 || vehicleData.isPrimary;

      // If setting as primary, unset other primary vehicles
      if (isPrimary) {
        await db.customerVehicle.updateMany({
          where: {
            shop: this.shop,
            garageId: garage.id,
            isPrimary: true
          },
          data: { isPrimary: false }
        });
      }

      // Get Turn 14 vehicle data if available
      const turn14Vehicle = await this.findTurn14Vehicle(
        vehicleData.year,
        vehicleData.make,
        vehicleData.model,
        vehicleData.submodel
      );

      const vehicle = await db.customerVehicle.create({
        data: {
          shop: this.shop,
          garageId: garage.id,
          year: vehicleData.year,
          make: vehicleData.make,
          model: vehicleData.model,
          submodel: vehicleData.submodel,
          engine: vehicleData.engine,
          engineSize: vehicleData.engineSize,
          fuelType: vehicleData.fuelType,
          transmission: vehicleData.transmission,
          driveType: vehicleData.driveType,
          bodyStyle: vehicleData.bodyStyle,
          nickname: vehicleData.nickname,
          color: vehicleData.color,
          mileage: vehicleData.mileage,
          vin: vehicleData.vin,
          licensePlate: vehicleData.licensePlate,
          turn14VehicleId: turn14Vehicle?.turn14VehicleId,
          turn14MmyId: turn14Vehicle?.turn14MmyId,
          isPrimary: isPrimary
        }
      });

      // Create default maintenance reminders
      await this.createDefaultMaintenanceReminders(vehicle.id);

      logger.info(`Added vehicle to garage`, {
        shop: this.shop,
        customerId,
        vehicleId: vehicle.id,
        vehicle: `${vehicle.year} ${vehicle.make} ${vehicle.model}`
      });

      return vehicle;
    } catch (error) {
      logger.error('Error adding vehicle:', error);
      throw error;
    }
  }

  /**
   * Update vehicle information
   */
  async updateVehicle(customerId, vehicleId, updateData) {
    try {
      // Verify ownership
      const vehicle = await db.customerVehicle.findFirst({
        where: {
          id: vehicleId,
          shop: this.shop,
          garage: {
            customerId: customerId
          }
        }
      });

      if (!vehicle) {
        throw new Error('Vehicle not found or access denied');
      }

      // Handle primary vehicle logic
      if (updateData.isPrimary) {
        await db.customerVehicle.updateMany({
          where: {
            shop: this.shop,
            garageId: vehicle.garageId,
            isPrimary: true,
            id: { not: vehicleId }
          },
          data: { isPrimary: false }
        });
      }

      const updatedVehicle = await db.customerVehicle.update({
        where: { id: vehicleId },
        data: updateData
      });

      return updatedVehicle;
    } catch (error) {
      logger.error('Error updating vehicle:', error);
      throw error;
    }
  }

  /**
   * Remove vehicle from garage
   */
  async removeVehicle(customerId, vehicleId) {
    try {
      const vehicle = await db.customerVehicle.findFirst({
        where: {
          id: vehicleId,
          shop: this.shop,
          garage: {
            customerId: customerId
          }
        }
      });

      if (!vehicle) {
        throw new Error('Vehicle not found or access denied');
      }

      await db.customerVehicle.delete({
        where: { id: vehicleId }
      });

      logger.info(`Removed vehicle from garage`, {
        shop: this.shop,
        customerId,
        vehicleId
      });

      return true;
    } catch (error) {
      logger.error('Error removing vehicle:', error);
      throw error;
    }
  }

  // ==================== PRODUCT COMPATIBILITY ====================

  /**
   * Get compatible products for a specific vehicle
   */
  async getCompatibleProducts(vehicleId, options = {}) {
    try {
      const { category, limit = 50, offset = 0 } = options;

      const vehicle = await db.customerVehicle.findUnique({
        where: { id: vehicleId }
      });

      if (!vehicle) {
        throw new Error('Vehicle not found');
      }

      const whereClause = {
        shop: this.shop,
        syncStatus: 'active',
        vehicleCompatibility: {
          some: {
            year: vehicle.year,
            make: vehicle.make,
            model: vehicle.model,
            ...(vehicle.submodel && { submodel: vehicle.submodel })
          }
        }
      };

      if (category) {
        whereClause.turn14Category = category;
      }

      const products = await db.turn14ImportedProduct.findMany({
        where: whereClause,
        include: {
          vehicleCompatibility: {
            where: {
              year: vehicle.year,
              make: vehicle.make,
              model: vehicle.model
            }
          }
        },
        orderBy: { lastSynced: 'desc' },
        take: limit,
        skip: offset
      });

      return products;
    } catch (error) {
      logger.error('Error getting compatible products:', error);
      throw error;
    }
  }

  /**
   * Check if a product is compatible with a vehicle
   */
  async checkProductCompatibility(vehicleId, turn14Sku) {
    try {
      const vehicle = await db.customerVehicle.findUnique({
        where: { id: vehicleId }
      });

      if (!vehicle) {
        return { compatible: false, reason: 'Vehicle not found' };
      }

      const compatibility = await db.turn14VehicleCompatibility.findFirst({
        where: {
          shop: this.shop,
          product: {
            turn14Sku: turn14Sku
          },
          year: vehicle.year,
          make: vehicle.make,
          model: vehicle.model,
          ...(vehicle.submodel && { submodel: vehicle.submodel })
        },
        include: {
          product: true
        }
      });

      if (compatibility) {
        return {
          compatible: true,
          compatibility: compatibility,
          notes: compatibility.notes,
          restrictions: compatibility.restrictions
        };
      }

      // Check for universal compatibility
      const universalCompatibility = await db.turn14VehicleCompatibility.findFirst({
        where: {
          shop: this.shop,
          product: {
            turn14Sku: turn14Sku
          },
          isUniversal: true
        },
        include: {
          product: true
        }
      });

      if (universalCompatibility) {
        return {
          compatible: true,
          compatibility: universalCompatibility,
          isUniversal: true,
          notes: universalCompatibility.notes
        };
      }

      return { compatible: false, reason: 'No compatibility data found' };
    } catch (error) {
      logger.error('Error checking product compatibility:', error);
      throw error;
    }
  }

  // ==================== MAINTENANCE REMINDERS ====================

  /**
   * Create default maintenance reminders for a new vehicle
   */
  async createDefaultMaintenanceReminders(vehicleId) {
    const defaultReminders = [
      {
        type: 'oil_change',
        title: 'Oil Change',
        description: 'Regular oil change to keep your engine running smoothly',
        intervalType: 'both',
        intervalMileage: 5000,
        intervalMonths: 6
      },
      {
        type: 'tire_rotation',
        title: 'Tire Rotation',
        description: 'Rotate tires for even wear and extended life',
        intervalType: 'mileage',
        intervalMileage: 7500
      },
      {
        type: 'brake_inspection',
        title: 'Brake Inspection',
        description: 'Check brake pads, rotors, and brake fluid',
        intervalType: 'time',
        intervalMonths: 12
      }
    ];

    for (const reminder of defaultReminders) {
      await db.vehicleMaintenanceReminder.create({
        data: {
          shop: this.shop,
          vehicleId: vehicleId,
          ...reminder
        }
      });
    }
  }

  /**
   * Get upcoming maintenance reminders
   */
  async getUpcomingReminders(customerId, daysAhead = 30) {
    try {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + daysAhead);

      const reminders = await db.vehicleMaintenanceReminder.findMany({
        where: {
          shop: this.shop,
          isActive: true,
          vehicle: {
            garage: {
              customerId: customerId
            }
          },
          nextDue: {
            lte: futureDate
          }
        },
        include: {
          vehicle: true
        },
        orderBy: { nextDue: 'asc' }
      });

      return reminders;
    } catch (error) {
      logger.error('Error getting upcoming reminders:', error);
      throw error;
    }
  }

  /**
   * Complete a maintenance reminder
   */
  async completeMaintenanceReminder(customerId, reminderId, completionData) {
    try {
      const reminder = await db.vehicleMaintenanceReminder.findFirst({
        where: {
          id: reminderId,
          shop: this.shop,
          vehicle: {
            garage: {
              customerId: customerId
            }
          }
        }
      });

      if (!reminder) {
        throw new Error('Maintenance reminder not found');
      }

      const now = new Date();
      let nextDue = null;
      let nextMileage = null;

      // Calculate next due date/mileage
      if (reminder.intervalType === 'time' || reminder.intervalType === 'both') {
        nextDue = new Date(now);
        nextDue.setMonth(nextDue.getMonth() + reminder.intervalMonths);
      }

      if (reminder.intervalType === 'mileage' || reminder.intervalType === 'both') {
        nextMileage = (completionData.currentMileage || 0) + reminder.intervalMileage;
      }

      await db.vehicleMaintenanceReminder.update({
        where: { id: reminderId },
        data: {
          lastCompleted: now,
          lastMileage: completionData.currentMileage,
          nextDue: nextDue,
          nextMileage: nextMileage
        }
      });

      return true;
    } catch (error) {
      logger.error('Error completing maintenance reminder:', error);
      throw error;
    }
  }

  // ==================== PRICE ALERTS ====================

  /**
   * Create a price alert for a product and vehicle
   */
  async createPriceAlert(customerId, vehicleId, alertData) {
    try {
      // Verify vehicle ownership
      const vehicle = await db.customerVehicle.findFirst({
        where: {
          id: vehicleId,
          shop: this.shop,
          garage: {
            customerId: customerId
          }
        }
      });

      if (!vehicle) {
        throw new Error('Vehicle not found or access denied');
      }

      const alert = await db.vehiclePriceAlert.create({
        data: {
          shop: this.shop,
          vehicleId: vehicleId,
          turn14Sku: alertData.turn14Sku,
          productTitle: alertData.productTitle,
          currentPrice: alertData.currentPrice,
          targetPrice: alertData.targetPrice,
          alertType: alertData.alertType || 'price_drop',
          emailNotifications: alertData.emailNotifications !== false
        }
      });

      return alert;
    } catch (error) {
      logger.error('Error creating price alert:', error);
      throw error;
    }
  }

  /**
   * Check and trigger price alerts
   */
  async checkPriceAlerts() {
    try {
      const alerts = await db.vehiclePriceAlert.findMany({
        where: {
          shop: this.shop,
          isActive: true,
          alertTriggered: false
        },
        include: {
          vehicle: {
            include: {
              garage: true
            }
          }
        }
      });

      const triggeredAlerts = [];

      for (const alert of alerts) {
        // Get current product price from Turn14ImportedProduct
        const product = await db.turn14ImportedProduct.findFirst({
          where: {
            shop: this.shop,
            turn14Sku: alert.turn14Sku
          }
        });

        if (!product) continue;

        let shouldTrigger = false;
        
        switch (alert.alertType) {
          case 'price_drop':
            shouldTrigger = product.currentPrice <= alert.targetPrice;
            break;
          case 'back_in_stock':
            shouldTrigger = product.inventoryQuantity > 0;
            break;
        }

        if (shouldTrigger) {
          await db.vehiclePriceAlert.update({
            where: { id: alert.id },
            data: {
              alertTriggered: true,
              triggeredAt: new Date(),
              lastChecked: new Date()
            }
          });

          triggeredAlerts.push({
            alert,
            product,
            customer: alert.vehicle.garage
          });
        } else {
          await db.vehiclePriceAlert.update({
            where: { id: alert.id },
            data: { lastChecked: new Date() }
          });
        }
      }

      return triggeredAlerts;
    } catch (error) {
      logger.error('Error checking price alerts:', error);
      throw error;
    }
  }

  // ==================== PURCHASE HISTORY ====================

  /**
   * Record a purchase for a vehicle
   */
  async recordPurchase(customerId, vehicleId, purchaseData) {
    try {
      const vehicle = await db.customerVehicle.findFirst({
        where: {
          id: vehicleId,
          shop: this.shop,
          garage: {
            customerId: customerId
          }
        }
      });

      if (!vehicle) {
        throw new Error('Vehicle not found or access denied');
      }

      const purchase = await db.vehiclePurchaseHistory.create({
        data: {
          shop: this.shop,
          vehicleId: vehicleId,
          shopifyOrderId: purchaseData.shopifyOrderId,
          shopifyOrderNumber: purchaseData.shopifyOrderNumber,
          turn14Sku: purchaseData.turn14Sku,
          productTitle: purchaseData.productTitle,
          quantity: purchaseData.quantity,
          unitPrice: purchaseData.unitPrice,
          totalPrice: purchaseData.totalPrice,
          purchaseDate: purchaseData.purchaseDate || new Date(),
          category: purchaseData.category,
          subcategory: purchaseData.subcategory
        }
      });

      return purchase;
    } catch (error) {
      logger.error('Error recording purchase:', error);
      throw error;
    }
  }

  // ==================== ANALYTICS ====================

  /**
   * Update garage analytics
   */
  async updateAnalytics() {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const stats = await this.getGarageStats();

      await db.vehicleGarageAnalytics.upsert({
        where: {
          shop_date: {
            shop: this.shop,
            date: today
          }
        },
        update: stats,
        create: {
          shop: this.shop,
          date: today,
          ...stats
        }
      });

      return stats;
    } catch (error) {
      logger.error('Error updating garage analytics:', error);
      throw error;
    }
  }

  /**
   * Get garage statistics
   */
  async getGarageStats() {
    try {
      const [
        totalGarages,
        totalVehicles,
        activeCustomers,
        maintenanceReminders,
        priceAlerts
      ] = await Promise.all([
        db.customerVehicleGarage.count({
          where: { shop: this.shop }
        }),
        db.customerVehicle.count({
          where: { shop: this.shop, isActive: true }
        }),
        db.customerVehicleGarage.count({
          where: {
            shop: this.shop,
            vehicles: {
              some: {}
            }
          }
        }),
        db.vehicleMaintenanceReminder.count({
          where: { shop: this.shop, isActive: true }
        }),
        db.vehiclePriceAlert.count({
          where: { shop: this.shop, isActive: true }
        })
      ]);

      return {
        totalGarages,
        totalVehicles,
        activeCustomers,
        maintenanceReminders,
        priceAlerts
      };
    } catch (error) {
      logger.error('Error getting garage stats:', error);
      throw error;
    }
  }

  // ==================== HELPER METHODS ====================

  /**
   * Find Turn 14 vehicle data
   */
  async findTurn14Vehicle(year, make, model, submodel = null) {
    try {
      const vehicle = await db.turn14VehicleDatabase.findFirst({
        where: {
          year: year,
          make: make,
          model: model,
          ...(submodel && { submodel: submodel })
        }
      });

      return vehicle;
    } catch (error) {
      logger.error('Error finding Turn 14 vehicle:', error);
      return null;
    }
  }

  /**
   * Get vehicle makes for a specific year
   */
  async getVehicleMakes(year) {
    try {
      const makes = await db.turn14VehicleDatabase.findMany({
        where: { year: year },
        select: { make: true },
        distinct: ['make'],
        orderBy: { make: 'asc' }
      });

      return makes.map(item => item.make);
    } catch (error) {
      logger.error('Error getting vehicle makes:', error);
      throw error;
    }
  }

  /**
   * Get vehicle models for a specific year and make
   */
  async getVehicleModels(year, make) {
    try {
      const models = await db.turn14VehicleDatabase.findMany({
        where: { year: year, make: make },
        select: { model: true },
        distinct: ['model'],
        orderBy: { model: 'asc' }
      });

      return models.map(item => item.model);
    } catch (error) {
      logger.error('Error getting vehicle models:', error);
      throw error;
    }
  }

  /**
   * Get vehicle submodels for a specific year, make, and model
   */
  async getVehicleSubmodels(year, make, model) {
    try {
      const submodels = await db.turn14VehicleDatabase.findMany({
        where: { 
          year: year, 
          make: make, 
          model: model,
          submodel: { not: null }
        },
        select: { submodel: true },
        distinct: ['submodel'],
        orderBy: { submodel: 'asc' }
      });

      return submodels.map(item => item.submodel).filter(Boolean);
    } catch (error) {
      logger.error('Error getting vehicle submodels:', error);
      throw error;
    }
  }
} 