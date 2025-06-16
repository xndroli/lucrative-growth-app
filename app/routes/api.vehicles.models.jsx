import { json } from "@remix-run/node";
import { VehicleGarageService } from "../services/vehicle-garage.server";
import { logger } from "../utils/logger.server";

export const loader = async ({ request }) => {
  try {
    const url = new URL(request.url);
    const year = url.searchParams.get("year");
    const make = url.searchParams.get("make");
    const shop = url.searchParams.get("shop");

    if (!year || !make || !shop) {
      return json({ error: "Year, make, and shop parameters are required" }, { status: 400 });
    }

    const garageService = new VehicleGarageService(shop);
    const models = await garageService.getVehicleModels(parseInt(year), make);

    return json({ models, success: true });
  } catch (error) {
    logger.error("Error fetching vehicle models:", error);
    return json({ error: error.message, models: [] }, { status: 500 });
  }
}; 