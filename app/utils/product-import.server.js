// Product Import Tracking Utilities

import { prisma } from '../db.server.js';

// Check if a Turn 14 product has already been imported
export async function isProductImported(shop, turn14Sku) {
  try {
    const existingProduct = await prisma.turn14ImportedProduct.findUnique({
      where: {
        shop_turn14Sku: {
          shop,
          turn14Sku
        }
      }
    });
    
    return !!existingProduct;
  } catch (error) {
    console.error('Error checking product import status:', error);
    return false;
  }
}

// Mark a product as imported and track it
export async function markProductAsImported(shop, turn14Product, shopifyProduct, options = {}) {
  try {
    const { priceMarkup = 0 } = options;
    const finalPrice = calculateFinalPrice(turn14Product.price, priceMarkup);
    
    const importedProduct = await prisma.turn14ImportedProduct.create({
      data: {
        shop,
        turn14Sku: turn14Product.id || turn14Product.sku,
        shopifyProductId: shopifyProduct.id.toString(),
        shopifyVariantId: shopifyProduct.variants?.[0]?.id?.toString(),
        turn14Brand: turn14Product.brand_name || turn14Product.brand,
        turn14Category: turn14Product.category,
        originalPrice: parseFloat(turn14Product.price),
        currentPrice: parseFloat(finalPrice),
        priceMarkup: priceMarkup,
        inventoryQuantity: turn14Product.inventory_quantity || 0,
        lastSynced: new Date(),
        syncStatus: "active",
        metaData: JSON.stringify({
          turn14Id: turn14Product.id,
          importedAt: new Date().toISOString(),
          shopifyHandle: shopifyProduct.handle,
          originalData: {
            name: turn14Product.item_name || turn14Product.name,
            description: turn14Product.item_description || turn14Product.description,
            weight: turn14Product.weight,
            dimensions: turn14Product.dimensions
          }
        })
      }
    });
    
    console.log(`Product tracked: Turn14 SKU ${turn14Product.id} -> Shopify ID ${shopifyProduct.id}`);
    return importedProduct;
  } catch (error) {
    console.error('Error marking product as imported:', error);
    return null;
  }
}

// Get import statistics
export async function getImportStats(shop, days = 30) {
  try {
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - days);
    
    const [totalImports, recentImports, statusBreakdown] = await Promise.all([
      prisma.turn14ImportedProduct.count({
        where: { shop }
      }),
      prisma.turn14ImportedProduct.count({
        where: {
          shop,
          createdAt: {
            gte: sinceDate
          }
        }
      }),
      prisma.turn14ImportedProduct.groupBy({
        by: ['syncStatus'],
        where: { shop },
        _count: true
      })
    ]);
    
    const statusCounts = statusBreakdown.reduce((acc, item) => {
      acc[item.syncStatus] = item._count;
      return acc;
    }, {});
    
    const activeProducts = statusCounts.active || 0;
    const errorProducts = statusCounts.error || 0;
    const pausedProducts = statusCounts.paused || 0;
    
    const successRate = totalImports > 0 
      ? Math.round((activeProducts / totalImports) * 100) 
      : 100;
    
    return {
      totalImports,
      recentImports,
      successRate,
      activeProducts,
      errorProducts,
      pausedProducts,
      statusBreakdown: statusCounts
    };
  } catch (error) {
    console.error('Error getting import stats:', error);
    return {
      totalImports: 0,
      recentImports: 0,
      successRate: 0,
      activeProducts: 0,
      errorProducts: 0,
      pausedProducts: 0,
      statusBreakdown: {}
    };
  }
}

// Validate product data before import
export function validateProductForImport(turn14Product) {
  const errors = [];
  
  if (!turn14Product.sku) {
    errors.push('Product SKU is required');
  }
  
  if (!turn14Product.name && !turn14Product.title) {
    errors.push('Product name/title is required');
  }
  
  if (!turn14Product.price || parseFloat(turn14Product.price) <= 0) {
    errors.push('Valid product price is required');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

// Calculate final price with markup
export function calculateFinalPrice(originalPrice, markup = 0) {
  const price = parseFloat(originalPrice) || 0;
  const markupMultiplier = 1 + (markup / 100);
  return (price * markupMultiplier).toFixed(2);
}

// Generate Shopify-compatible product handle
export function generateProductHandle(productName, sku) {
  const baseName = productName || `product-${sku}`;
  return baseName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 100); // Shopify handle max length
}

// Clean and format product description
export function formatProductDescription(description) {
  if (!description) return 'No description available';
  
  // Remove HTML tags and clean up text
  return description
    .replace(/<[^>]*>/g, '')
    .replace(/&[^;]+;/g, ' ')
    .trim()
    .substring(0, 5000); // Reasonable description length
} 