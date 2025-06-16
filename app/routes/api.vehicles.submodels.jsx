import { json } from "@remix-run/node";
import { VehicleGarageService } from "../services/vehicle-garage.server";
import { logger } from "../utils/logger.server";

export const loader = async ({ request }) => {
  try {
    const url = new URL(request.url);
    const year = url.searchParams.get("year");
    const make = url.searchParams.get("make");
    const model = url.searchParams.get("model");
    const shop = url.searchParams.get("shop");

    if (!year || !make || !model || !shop) {
      return json({ error: "Year, make, model, and shop parameters are required" }, { status: 400 });
    }

    const garageService = new VehicleGarageService(shop);
    const submodels = await garageService.getVehicleSubmodels(parseInt(year), make, model);

    return json({ submodels, success: true });
  } catch (error) {
    logger.error("Error fetching vehicle submodels:", error);
    return json({ error: error.message, submodels: [] }, { status: 500 });
  }
}; 