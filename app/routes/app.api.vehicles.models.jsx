import { json } from "@remix-run/node";
import { authenticate } from "../../shopify.server";
import { VehicleGarageService } from "../../services/vehicle-garage.server";
import { logger } from "../../utils/logger.server";

export const loader = async ({ request }) => {
  try {
    const { session } = await authenticate.admin(request);
    const url = new URL(request.url);
    const year = url.searchParams.get("year");
    const make = url.searchParams.get("make");

    if (!year || !make) {
      return json({ error: "Year and make parameters are required" }, { status: 400 });
    }

    const garageService = new VehicleGarageService(session.shop);
    const models = await garageService.getVehicleModels(parseInt(year), make);

    return json({ models, success: true });
  } catch (error) {
    logger.error("Error fetching vehicle models:", error);
    return json({ error: error.message, models: [] }, { status: 500 });
  }
}; 