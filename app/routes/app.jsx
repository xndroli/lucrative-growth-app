import { json } from "@remix-run/node";
import { Link, Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
// import { NavMenu, Frame, Navigation } from "@shopify/polaris";
// import { HomeIcon, SyncIcon, PackageIcon } from "@shopify/polaris-icons";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }) => {
  await authenticate.admin(request);

  return json({ 
    apiKey: process.env.SHOPIFY_API_KEY,
    shop: new URL(request.url).searchParams.get("shop")
  });
};

export default function App() {
  const { apiKey } = useLoaderData();
  const { shop } = useLoaderData();

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <NavMenu>
        <Link to="/app" rel="home">
          Dashboard
        </Link>
        <Link to="/app/turn14-config">Turn 14 Configuration</Link>
        <Link to="/app/brands">Brand Selection</Link>
        <Link to="/app/products">Browse Products</Link>
        <Link to="/app/sync">Sync Management</Link>
        <Link to="/app/inventory">Inventory Management</Link>
        <Link to="/app/ymm">YMM Compatibility</Link>
        <Link to="/app/garage">Vehicle Garage</Link>
        <Link to="/app/turn14-sync">Sync Logs</Link>
      </NavMenu>
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs Remix to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
