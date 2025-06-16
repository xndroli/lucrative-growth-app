import { json } from "@remix-run/node";
import { VehicleGarageService } from "../services/vehicle-garage.server";
import { logger } from "../utils/logger.server";

// This route handles customer garage operations from the storefront
// It should be accessible without admin authentication for customer use

export const loader = async ({ request, params }) => {
  try {
    const { customerId } = params;
    const url = new URL(request.url);
    const shop = url.searchParams.get("shop");

    if (!customerId || !shop) {
      return json({ error: "Customer ID and shop are required" }, { status: 400 });
    }

    const garageService = new VehicleGarageService(shop);
    const garage = await garageService.getGarageWithDetails(customerId);

    return json({ 
      success: true, 
      garage: garage || { vehicles: [] }
    });
  } catch (error) {
    logger.error("Error loading customer garage:", error);
    return json({ 
      error: "Failed to load garage",
      success: false,
      garage: { vehicles: [] }
    }, { status: 500 });
  }
};

export const action = async ({ request, params }) => {
  try {
    const { customerId } = params;
    const formData = await request.formData();
    const shop = formData.get("shop");
    const actionType = formData.get("actionType");

    if (!customerId || !shop) {
      return json({ error: "Customer ID and shop are required" }, { status: 400 });
    }

    const garageService = new VehicleGarageService(shop);

    switch (actionType) {
      case "addVehicle": {
        const vehicleData = {
          year: parseInt(formData.get("year")),
          make: formData.get("make"),
          model: formData.get("model"),
          submodel: formData.get("submodel") || null,
          nickname: formData.get("nickname") || null,
          isPrimary: formData.get("isPrimary") === "true"
        };

        const vehicle = await garageService.addVehicle(customerId, vehicleData);
        return json({ success: true, vehicle });
      }

      case "removeVehicle": {
        const vehicleId = formData.get("vehicleId");
        await garageService.removeVehicle(customerId, vehicleId);
        return json({ success: true });
      }

      case "updateVehicle": {
        const vehicleId = formData.get("vehicleId");
        const updateData = {
          nickname: formData.get("nickname") || null,
          isPrimary: formData.get("isPrimary") === "true"
        };

        const vehicle = await garageService.updateVehicle(customerId, vehicleId, updateData);
        return json({ success: true, vehicle });
      }

      default:
        return json({ error: "Invalid action type" }, { status: 400 });
    }
  } catch (error) {
    logger.error("Error in customer garage action:", error);
    return json({ error: error.message, success: false }, { status: 500 });
  }
}; 