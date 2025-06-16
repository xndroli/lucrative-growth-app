// Utility functions for sync processing

// app/utils/sync-helpers.server.js
import { prisma } from '~/db.server';
import { fetchTurn14Inventory, transformProductForShopify } from '../services/turn14-api.server';
import { createSyncLog } from './sync-log.server';

export async function performTurn14Sync(session, admin) {
    const turn14ApiKey = process.env.TURN14_API_KEY;
    if (!turn14ApiKey) {
        throw new Error('Turn 14 API Key is not configured');
    }

    const syncStartTime = new Date();
    let totalProducts = 0;
    let successfulSyncs = 0;
    let failedSyncs = 0;
    const syncErrors = [];

    try {
        // Fetch initial inventory
        const inventoryResult = await fetchTurn14Inventory(turn14ApiKey);
        const products = inventoryResult.products;
        totalProducts = products.length;

        // Sync products
        const syncResults = await Promise.all(
        products.map(async (product) => {
            try {
            const shopifyProductData = await transformProductForShopify(product);
            
            const shopifyProduct = await admin.rest.Product.create({
                session,
                product: shopifyProductData
            });

            successfulSyncs++;
            return {
                status: 'success',
                sku: product.sku,
                shopifyProductId: shopifyProduct.id
            };
            } catch (error) {
            failedSyncs++;
            const errorDetail = {
                sku: product.sku,
                errorMessage: error.message,
                errorDetails: {
                originalProduct: product,
                errorStack: error.stack
                }
            };
            syncErrors.push(errorDetail);

            return {
                status: 'error',
                ...errorDetail
            };
            }
        })
        );

        // Create sync log after processing
        await createSyncLog({
        startTime: syncStartTime,
        endTime: new Date(),
        totalProducts,
        successfulSyncs,
        failedSyncs,
        syncErrors
        });

        return {
        success: true,
        totalProducts,
        successfulSyncs,
        failedSyncs,
        syncErrors
        };
    } catch (error) {
        console.error('Complete Sync Process Error:', error);
        
        // Log critical error
        await createSyncLog({
        startTime: syncStartTime,
        endTime: new Date(),
        totalProducts: 0,
        successfulSyncs: 0,
        failedSyncs: totalProducts,
        syncErrors: [{
            errorMessage: error.message,
            errorDetails: {
            criticalError: true,
            errorStack: error.stack
            }
        }]
        });

        throw error;
    }
}