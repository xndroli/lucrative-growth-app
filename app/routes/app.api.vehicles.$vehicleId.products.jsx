import { json } from "@remix-run/node";
import { authenticate } from "../../shopify.server";
import { VehicleGarageService } from "../../services/vehicle-garage.server";
import { logger } from "../../utils/logger.server";

export const loader = async ({ request, params }) => {
  try {
    const { session } = await authenticate.admin(request);
    const { vehicleId } = params;
    const url = new URL(request.url);
    
    const category = url.searchParams.get("category");
    const limit = parseInt(url.searchParams.get("limit")) || 50;
    const offset = parseInt(url.searchParams.get("offset")) || 0;

    if (!vehicleId) {
      return json({ error: "Vehicle ID is required" }, { status: 400 });
    }

    const garageService = new VehicleGarageService(session.shop);
    const products = await garageService.getCompatibleProducts(vehicleId, {
      category,
      limit,
      offset
    });

    return json({ products, success: true });
  } catch (error) {
    logger.error("Error fetching compatible products:", error);
    return json({ error: error.message, products: [] }, { status: 500 });
  }
}; 