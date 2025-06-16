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
    const model = url.searchParams.get("model");

    if (!year || !make || !model) {
      return json({ error: "Year, make, and model parameters are required" }, { status: 400 });
    }

    const garageService = new VehicleGarageService(session.shop);
    const submodels = await garageService.getVehicleSubmodels(parseInt(year), make, model);

    return json({ submodels, success: true });
  } catch (error) {
    logger.error("Error fetching vehicle submodels:", error);
    return json({ error: error.message, submodels: [] }, { status: 500 });
  }
}; 