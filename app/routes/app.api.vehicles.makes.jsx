import { json } from "@remix-run/node";
import { authenticate } from "../../shopify.server";
import { VehicleGarageService } from "../../services/vehicle-garage.server";
import { logger } from "../../utils/logger.server";

export const loader = async ({ request }) => {
  try {
    const { session } = await authenticate.admin(request);
    const url = new URL(request.url);
    const year = url.searchParams.get("year");

    if (!year) {
      return json({ error: "Year parameter is required" }, { status: 400 });
    }

    const garageService = new VehicleGarageService(session.shop);
    const makes = await garageService.getVehicleMakes(parseInt(year));

    return json({ makes, success: true });
  } catch (error) {
    logger.error("Error fetching vehicle makes:", error);
    return json({ error: error.message, makes: [] }, { status: 500 });
  }
}; 