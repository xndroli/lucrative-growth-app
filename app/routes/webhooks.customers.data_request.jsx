import { authenticate } from "../shopify.server";
import { json } from "@remix-run/node";

export const action = async ({ request }) => {
  try {
    const { topic, shop, session, admin, payload } = await authenticate.webhook(request);

    if (!admin) {
      throw new Response("Unauthorized", { status: 401 });
    }

    console.log(`Received ${topic} webhook for ${shop}`);

    // Handle customer data request (GDPR compliance)
    if (topic === "CUSTOMERS_DATA_REQUEST") {
      const customerId = payload.customer?.id;
      const shopDomain = payload.shop_domain;
      const ordersRequested = payload.orders_requested || [];

      console.log(`Customer data request for customer ${customerId} from shop ${shopDomain}`);

      // In a real implementation, you would:
      // 1. Collect all customer data from your database
      // 2. Format it according to GDPR requirements
      // 3. Send it to the customer or make it available for download
      // 4. Log the request for compliance purposes

      // Example data collection (customize based on your data structure)
      const customerData = await collectCustomerData(customerId, shopDomain);
      
      // Send data to customer (implement your preferred method)
      await sendCustomerData(customerData, payload.customer);

      // Log the request
      await logDataRequest({
        customerId,
        shopDomain,
        requestDate: new Date(),
        ordersRequested,
        status: 'completed'
      });

      return json({ success: true });
    }

    return json({ success: true });
  } catch (error) {
    console.error("Error processing customer data request webhook:", error);
    return json({ error: "Failed to process webhook" }, { status: 500 });
  }
};

// Helper function to collect customer data
async function collectCustomerData(customerId, shopDomain) {
  // This is a placeholder - implement based on your actual data structure
  const customerData = {
    customer_id: customerId,
    shop_domain: shopDomain,
    vehicle_garage: [],
    maintenance_reminders: [],
    price_alerts: [],
    purchase_history: [],
    preferences: {},
    created_at: null,
    updated_at: null
  };

  try {
    // Example: Collect vehicle garage data
    // const garageData = await prisma.customerVehicleGarage.findMany({
    //   where: {
    //     customerId: customerId,
    //     shopDomain: shopDomain
    //   },
    //   include: {
    //     vehicles: true,
    //     maintenanceReminders: true,
    //     priceAlerts: true,
    //     purchaseHistory: true
    //   }
    // });

    // customerData.vehicle_garage = garageData;

    console.log(`Collected data for customer ${customerId}`);
  } catch (error) {
    console.error("Error collecting customer data:", error);
  }

  return customerData;
}

// Helper function to send data to customer
async function sendCustomerData(customerData, customer) {
  // This is a placeholder - implement your preferred method
  // Options:
  // 1. Email the data as JSON/CSV attachment
  // 2. Create a secure download link
  // 3. Send via postal mail if required
  // 4. Use a third-party service

  console.log(`Sending data to customer ${customer?.email || 'unknown'}`);
  
  // Example implementation:
  // await emailService.send({
  //   to: customer.email,
  //   subject: 'Your Personal Data Request',
  //   body: 'Please find your personal data attached.',
  //   attachments: [{
  //     filename: 'personal-data.json',
  //     content: JSON.stringify(customerData, null, 2)
  //   }]
  // });
}

// Helper function to log data requests
async function logDataRequest(requestInfo) {
  // Log the request for compliance purposes
  console.log('Data request logged:', requestInfo);
  
  // Example implementation:
  // await prisma.gdprDataRequest.create({
  //   data: {
  //     customerId: requestInfo.customerId,
  //     shopDomain: requestInfo.shopDomain,
  //     requestType: 'data_request',
  //     requestDate: requestInfo.requestDate,
  //     status: requestInfo.status,
  //     ordersRequested: requestInfo.ordersRequested
  //   }
  // });
}
