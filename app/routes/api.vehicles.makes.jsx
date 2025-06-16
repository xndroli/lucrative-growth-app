import { json } from "@remix-run/node";
import { VehicleGarageService } from "../services/vehicle-garage.server";
import { logger } from "../utils/logger.server";

export const loader = async ({ request }) => {
  try {
    const url = new URL(request.url);
    const year = url.searchParams.get("year");
    const shop = url.searchParams.get("shop");

    if (!year || !shop) {
      return json({ error: "Year and shop parameters are required" }, { status: 400 });
    }

    const garageService = new VehicleGarageService(shop);
    const makes = await garageService.getVehicleMakes(parseInt(year));

    return json({ makes, success: true });
  } catch (error) {
    logger.error("Error fetching vehicle makes:", error);
    return json({ error: error.message, makes: [] }, { status: 500 });
  }
}; 