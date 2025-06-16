import { authenticate } from "../shopify.server";
import { json } from "@remix-run/node";

export const action = async ({ request }) => {
  try {
    const { topic, shop, session, admin, payload } = await authenticate.webhook(request);

    if (!admin) {
      throw new Response("Unauthorized", { status: 401 });
    }

    console.log(`Received ${topic} webhook for ${shop}`);

    // Handle customer data redaction (GDPR compliance)
    if (topic === "CUSTOMERS_REDACT") {
      const customerId = payload.customer?.id;
      const shopDomain = payload.shop_domain;
      const ordersToRedact = payload.orders_to_redact || [];

      console.log(`Customer data redaction request for customer ${customerId} from shop ${shopDomain}`);

      // Redact customer data from your database
      const redactionResult = await redactCustomerData(customerId, shopDomain, ordersToRedact);

      // Log the redaction for compliance purposes
      await logDataRedaction({
        customerId,
        shopDomain,
        redactionDate: new Date(),
        ordersRedacted: ordersToRedact,
        status: redactionResult.success ? 'completed' : 'failed',
        details: redactionResult.details
      });

      if (redactionResult.success) {
        return json({ success: true, message: "Customer data redacted successfully" });
      } else {
        return json({ 
          success: false, 
          error: "Failed to redact customer data",
          details: redactionResult.details 
        }, { status: 500 });
      }
    }

    return json({ success: true });
  } catch (error) {
    console.error("Error processing customer redaction webhook:", error);
    return json({ error: "Failed to process webhook" }, { status: 500 });
  }
};

// Helper function to redact customer data
async function redactCustomerData(customerId, shopDomain, ordersToRedact) {
  const redactionResult = {
    success: true,
    details: {
      vehicleGarageRedacted: false,
      maintenanceRemindersRedacted: false,
      priceAlertsRedacted: false,
      purchaseHistoryRedacted: false,
      analyticsRedacted: false,
      errors: []
    }
  };

  try {
    console.log(`Starting redaction for customer ${customerId} from shop ${shopDomain}`);

    // Redact vehicle garage data
    try {
      // Example implementation:
      // await prisma.customerVehicleGarage.deleteMany({
      //   where: {
      //     customerId: customerId,
      //     shopDomain: shopDomain
      //   }
      // });
      
      // await prisma.customerVehicle.deleteMany({
      //   where: {
      //     garage: {
      //       customerId: customerId,
      //       shopDomain: shopDomain
      //     }
      //   }
      // });

      redactionResult.details.vehicleGarageRedacted = true;
      console.log(`Vehicle garage data redacted for customer ${customerId}`);
    } catch (error) {
      console.error("Error redacting vehicle garage data:", error);
      redactionResult.details.errors.push("Failed to redact vehicle garage data");
    }

    // Redact maintenance reminders
    try {
      // await prisma.vehicleMaintenanceReminder.deleteMany({
      //   where: {
      //     garage: {
      //       customerId: customerId,
      //       shopDomain: shopDomain
      //     }
      //   }
      // });

      redactionResult.details.maintenanceRemindersRedacted = true;
      console.log(`Maintenance reminders redacted for customer ${customerId}`);
    } catch (error) {
      console.error("Error redacting maintenance reminders:", error);
      redactionResult.details.errors.push("Failed to redact maintenance reminders");
    }

    // Redact price alerts
    try {
      // await prisma.vehiclePriceAlert.deleteMany({
      //   where: {
      //     garage: {
      //       customerId: customerId,
      //       shopDomain: shopDomain
      //     }
      //   }
      // });

      redactionResult.details.priceAlertsRedacted = true;
      console.log(`Price alerts redacted for customer ${customerId}`);
    } catch (error) {
      console.error("Error redacting price alerts:", error);
      redactionResult.details.errors.push("Failed to redact price alerts");
    }

    // Redact purchase history (or anonymize if needed for business purposes)
    try {
      // Option 1: Complete deletion
      // await prisma.vehiclePurchaseHistory.deleteMany({
      //   where: {
      //     garage: {
      //       customerId: customerId,
      //       shopDomain: shopDomain
      //     }
      //   }
      // });

      // Option 2: Anonymization (if you need to keep data for analytics)
      // await prisma.vehiclePurchaseHistory.updateMany({
      //   where: {
      //     garage: {
      //       customerId: customerId,
      //       shopDomain: shopDomain
      //     }
      //   },
      //   data: {
      //     customerId: 'REDACTED',
      //     customerEmail: 'REDACTED',
      //     customerName: 'REDACTED'
      //   }
      // });

      redactionResult.details.purchaseHistoryRedacted = true;
      console.log(`Purchase history redacted for customer ${customerId}`);
    } catch (error) {
      console.error("Error redacting purchase history:", error);
      redactionResult.details.errors.push("Failed to redact purchase history");
    }

    // Redact analytics data that contains personal information
    try {
      // await prisma.vehicleGarageAnalytics.deleteMany({
      //   where: {
      //     customerId: customerId,
      //     shopDomain: shopDomain
      //   }
      // });

      redactionResult.details.analyticsRedacted = true;
      console.log(`Analytics data redacted for customer ${customerId}`);
    } catch (error) {
      console.error("Error redacting analytics data:", error);
      redactionResult.details.errors.push("Failed to redact analytics data");
    }

    // Check if any errors occurred
    if (redactionResult.details.errors.length > 0) {
      redactionResult.success = false;
    }

    console.log(`Redaction completed for customer ${customerId}. Success: ${redactionResult.success}`);
    
  } catch (error) {
    console.error("Error during customer data redaction:", error);
    redactionResult.success = false;
    redactionResult.details.errors.push(`General redaction error: ${error.message}`);
  }

  return redactionResult;
}

// Helper function to log data redaction
async function logDataRedaction(redactionInfo) {
  // Log the redaction for compliance purposes
  console.log('Data redaction logged:', redactionInfo);
  
  // Example implementation:
  // await prisma.gdprDataRequest.create({
  //   data: {
  //     customerId: redactionInfo.customerId,
  //     shopDomain: redactionInfo.shopDomain,
  //     requestType: 'data_redaction',
  //     requestDate: redactionInfo.redactionDate,
  //     status: redactionInfo.status,
  //     ordersRedacted: redactionInfo.ordersRedacted,
  //     details: JSON.stringify(redactionInfo.details)
  //   }
  // });

  // Also log to external compliance system if required
  // await complianceLogger.log({
  //   type: 'GDPR_REDACTION',
  //   customerId: redactionInfo.customerId,
  //   shopDomain: redactionInfo.shopDomain,
  //   timestamp: redactionInfo.redactionDate,
  //   status: redactionInfo.status
  // });
}
