import { useEffect } from "react";
import { json } from "@remix-run/node";
import { useFetcher, useLoaderData, Link } from "@remix-run/react";
import {
  Page,
  Layout,
  Text,
  Card,
  Button,
  BlockStack,
  Box,
  List,
  InlineStack,
  Badge,
  Banner,
  EmptyState,
  Icon
} from "@shopify/polaris";
import { 
  CheckCircleIcon, 
  AlertCircleIcon, 
  SettingsIcon,
  ProductIcon,
  SyncIcon,
  CarIcon
} from "@shopify/polaris-icons";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { getTurn14Config } from "../services/turn14-api.server";
import { getLatestSyncLogs, getSyncStats } from "~/utils/sync-log.server";
import { getImportStats } from "../utils/product-import.server.js";
import { SyncScheduleManager } from "../services/sync-engine.server.js";
import { YMMService } from "../services/ymm-service.server.js";
import { VehicleGarageService } from "../services/vehicle-garage.server.js";

export const loader = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);

  try {
    // Try to get Turn 14 configuration
    let turn14Status = {
      isConfigured: false,
      isActive: false,
      selectedBrandsCount: 0,
      environment: null,
      lastValidated: null
    };

    try {
      const config = await getTurn14Config(session.shop);
      turn14Status = {
        isConfigured: true,
        isActive: config.isActive,
        selectedBrandsCount: config.selectedBrands?.length || 0,
        environment: config.environment,
        lastValidated: config.lastValidated
      };
    } catch (error) {
      // Configuration doesn't exist or is invalid
    }

    // Get sync statistics if configured
    let syncStats = null;
    let inventoryStats = null;
    let syncSchedules = [];
    let ymmStats = null;
    let garageStats = null;
    
    if (turn14Status.isActive) {
      try {
        syncStats = await getSyncStats(session.shop, 7); // Last 7 days
        inventoryStats = await getImportStats(session.shop, 30); // Last 30 days
        syncSchedules = await SyncScheduleManager.getActiveSchedules(session.shop);
        
        const ymmService = new YMMService(session.shop);
        ymmStats = await ymmService.getYMMStats();
        
        const garageService = new VehicleGarageService(session.shop);
        garageStats = await garageService.getGarageStats();
      } catch (error) {
        console.error('Error fetching dashboard stats:', error);
      }
    }

    return json({
      turn14Status,
      syncStats,
      inventoryStats,
      syncSchedules,
      ymmStats,
      garageStats,
      shop: session.shop
    });
  } catch (error) {
    console.error('Dashboard loader error:', error);
    return json({
      turn14Status: {
        isConfigured: false,
        isActive: false,
        selectedBrandsCount: 0,
        environment: null,
        lastValidated: null
      },
      syncStats: null,
      shop: session.shop,
      error: error.message
    });
  }
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const color = ["Red", "Orange", "Yellow", "Green"][
    Math.floor(Math.random() * 4)
  ];
  const response = await admin.graphql(
    `#graphql
      mutation populateProduct($product: ProductCreateInput!) {
        productCreate(product: $product) {
          product {
            id
            title
            handle
            status
            variants(first: 10) {
              edges {
                node {
                  id
                  price
                  barcode
                  createdAt
                }
              }
            }
          }
        }
      }`,
    {
      variables: {
        product: {
          title: `${color} Snowboard`,
        },
      },
    },
  );
  const responseJson = await response.json();
  const product = responseJson.data.productCreate.product;
  const variantId = product.variants.edges[0].node.id;
  const variantResponse = await admin.graphql(
    `#graphql
    mutation shopifyRemixTemplateUpdateVariant($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        productVariants {
          id
          price
          barcode
          createdAt
        }
      }
    }`,
    {
      variables: {
        productId: product.id,
        variants: [{ id: variantId, price: "100.00" }],
      },
    },
  );
  const variantResponseJson = await variantResponse.json();

  return json({
    product: responseJson.data.productCreate.product,
    variant: variantResponseJson.data.productVariantsBulkUpdate.productVariants,
  });
};

export default function Index() {
  const { turn14Status, syncStats, inventoryStats, syncSchedules, ymmStats, garageStats, shop, error } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const isLoading =
    ["loading", "submitting"].includes(fetcher.state) &&
    fetcher.formMethod === "POST";
  const productId = fetcher.data?.product?.id.replace(
    "gid://shopify/Product/",
    "",
  );

  useEffect(() => {
    if (productId) {
      shopify.toast.show("Product created");
    }
  }, [productId, shopify]);
  
  const generateProduct = () => fetcher.submit({}, { method: "POST" });

  return (
    <Page>
      <TitleBar title="Turn 14 Distribution Dashboard" />
      <BlockStack gap="500">
        <Layout>
          <Layout.Section>
            {error && (
              <Banner status="critical" title="Dashboard Error">
                <p>{error}</p>
              </Banner>
            )}

            {/* Turn 14 Integration Status */}
            <Card>
              <BlockStack gap="400">
                <InlineStack gap="300" align="space-between">
                  <BlockStack gap="200">
                    <InlineStack gap="200" align="start">
                      <Icon source={turn14Status.isActive ? CheckCircleIcon : AlertCircleIcon} />
                      <Text variant="headingMd">Turn 14 Integration Status</Text>
                    </InlineStack>
                    <Text variant="bodyMd" color="subdued">
                      Manage your Turn 14 Distribution API integration
                    </Text>
                  </BlockStack>
                  
                  <InlineStack gap="200">
                    <Badge status={turn14Status.isActive ? "success" : "critical"}>
                      {turn14Status.isActive ? "Active" : turn14Status.isConfigured ? "Inactive" : "Not Configured"}
                    </Badge>
                    {turn14Status.environment && (
                      <Badge status={turn14Status.environment === 'production' ? 'info' : 'warning'}>
                        {turn14Status.environment}
                      </Badge>
                    )}
                  </InlineStack>
                </InlineStack>

                {turn14Status.isConfigured ? (
                  <BlockStack gap="300">
                    <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                      <BlockStack gap="200">
                        <InlineStack gap="600">
                          <Text variant="bodyMd">
                            <strong>Selected Brands:</strong> {turn14Status.selectedBrandsCount}
                          </Text>
                          {turn14Status.lastValidated && (
                            <Text variant="bodyMd">
                              <strong>Last Validated:</strong> {new Date(turn14Status.lastValidated).toLocaleDateString()}
                            </Text>
                          )}
                        </InlineStack>
                        
                        {syncStats && (
                          <InlineStack gap="600">
                            <Text variant="bodyMd">
                              <strong>Success Rate (7 days):</strong> {syncStats.successRate}%
                            </Text>
                            <Text variant="bodyMd">
                              <strong>Products Synced:</strong> {syncStats.successfulSyncs}
                            </Text>
                          </InlineStack>
                        )}
                      </BlockStack>
                    </Box>

                    <InlineStack gap="300">
                      <Link to="/app/turn14-config">
                        <Button icon={SettingsIcon}>
                          Manage Configuration
                        </Button>
                      </Link>
                      <Link to="/app/brands">
                        <Button icon={ProductIcon}>
                          Select Brands ({turn14Status.selectedBrandsCount})
                        </Button>
                      </Link>
                      <Link to="/app/products">
                        <Button icon={ProductIcon}>
                          Browse Products
                        </Button>
                      </Link>
                      <Link to="/app/turn14-sync">
                        <Button icon={SyncIcon}>
                          View Sync Logs
                        </Button>
                      </Link>
                      <Link to="/app/sync">
                        <Button icon={SyncIcon}>
                          Sync Management
                        </Button>
                      </Link>
                      <Link to="/app/inventory">
                        <Button icon={ProductIcon}>
                          Inventory Management
                        </Button>
                      </Link>
                      <Link to="/app/ymm">
                        <Button icon={CarIcon}>
                          YMM Compatibility
                        </Button>
                      </Link>
                      <Link to="/app/garage">
                        <Button icon={CarIcon}>
                          Vehicle Garage
                        </Button>
                      </Link>
                    </InlineStack>
                  </BlockStack>
                ) : (
                  <BlockStack gap="300">
                    <Text variant="bodyMd">
                      Get started by configuring your Turn 14 Distribution API credentials.
                    </Text>
                    <InlineStack gap="300">
                      <Link to="/app/turn14-config">
                        <Button primary icon={SettingsIcon}>
                          Configure Turn 14 API
                        </Button>
                      </Link>
                    </InlineStack>
                  </BlockStack>
                )}
              </BlockStack>
            </Card>

            {/* Inventory & Sync Status */}
            {turn14Status.isActive && inventoryStats && (
              <Card>
                <BlockStack gap="400">
                  <Text variant="headingMd">Inventory & Sync Overview</Text>
                  
                  <InlineStack gap="600" wrap={false}>
                    {/* Inventory Stats */}
                    <Box>
                      <BlockStack gap="200">
                        <Text variant="headingSm">Imported Products</Text>
                        <InlineStack gap="400">
                          <BlockStack gap="100">
                            <Text variant="headingLg">{inventoryStats.totalImports}</Text>
                            <Text variant="bodySm" color="subdued">Total Products</Text>
                          </BlockStack>
                          <BlockStack gap="100">
                            <Text variant="headingLg" color="success">{inventoryStats.activeProducts}</Text>
                            <Text variant="bodySm" color="subdued">Active Sync</Text>
                          </BlockStack>
                          <BlockStack gap="100">
                            <Text variant="headingLg" color="critical">{inventoryStats.errorProducts}</Text>
                            <Text variant="bodySm" color="subdued">Sync Errors</Text>
                          </BlockStack>
                        </InlineStack>
                      </BlockStack>
                    </Box>

                    {/* Sync Schedules */}
                    <Box>
                      <BlockStack gap="200">
                        <Text variant="headingSm">Sync Schedules</Text>
                        <InlineStack gap="400">
                          <BlockStack gap="100">
                            <Text variant="headingLg">{syncSchedules.length}</Text>
                            <Text variant="bodySm" color="subdued">Active Schedules</Text>
                          </BlockStack>
                          {syncStats && (
                            <BlockStack gap="100">
                              <Text variant="headingLg">{syncStats.successRate || 0}%</Text>
                              <Text variant="bodySm" color="subdued">Success Rate</Text>
                            </BlockStack>
                          )}
                        </InlineStack>
                      </BlockStack>
                    </Box>

                    {/* YMM Compatibility */}
                    {ymmStats && (
                      <Box>
                        <BlockStack gap="200">
                          <Text variant="headingSm">Vehicle Compatibility</Text>
                          <InlineStack gap="400">
                            <BlockStack gap="100">
                              <Text variant="headingLg">{ymmStats.totalVehicles.toLocaleString()}</Text>
                              <Text variant="bodySm" color="subdued">Total Vehicles</Text>
                            </BlockStack>
                            <BlockStack gap="100">
                              <Text variant="headingLg">{ymmStats.compatibilityPercentage}%</Text>
                              <Text variant="bodySm" color="subdued">Coverage Rate</Text>
                            </BlockStack>
                          </InlineStack>
                        </BlockStack>
                      </Box>
                    )}

                    {/* Vehicle Garage */}
                    {garageStats && (
                      <Box>
                        <BlockStack gap="200">
                          <Text variant="headingSm">Vehicle Garage</Text>
                          <InlineStack gap="400">
                            <BlockStack gap="100">
                              <Text variant="headingLg">{garageStats.totalVehicles}</Text>
                              <Text variant="bodySm" color="subdued">Customer Vehicles</Text>
                            </BlockStack>
                            <BlockStack gap="100">
                              <Text variant="headingLg">{garageStats.activeCustomers}</Text>
                              <Text variant="bodySm" color="subdued">Active Customers</Text>
                            </BlockStack>
                          </InlineStack>
                        </BlockStack>
                      </Box>
                    )}
                  </InlineStack>

                  <InlineStack gap="300">
                    <Link to="/app/sync">
                      <Button>Manage Sync Schedules</Button>
                    </Link>
                    <Link to="/app/inventory">
                      <Button>View All Products</Button>
                    </Link>
                    {ymmStats && (
                      <Link to="/app/ymm">
                        <Button>Manage YMM Compatibility</Button>
                      </Link>
                    )}
                    {garageStats && (
                      <Link to="/app/garage">
                        <Button>Manage Vehicle Garage</Button>
                      </Link>
                    )}
                  </InlineStack>
                </BlockStack>
              </Card>
            )}

            {/* Quick Actions */}
            {turn14Status.isActive && (
              <Card>
                <BlockStack gap="400">
                  <Text variant="headingMd">Quick Actions</Text>
                  
                  <InlineStack gap="300" wrap={false}>
                    <Card sectioned>
                      <BlockStack gap="200">
                        <Text variant="headingSm">Browse Products</Text>
                        <Text variant="bodyMd" color="subdued">
                          Browse and import products from your selected brands
                        </Text>
                        <Link to="/app/products">
                          <Button>Browse Products</Button>
                        </Link>
                      </BlockStack>
                    </Card>
                    
                    <Card sectioned>
                      <BlockStack gap="200">
                        <Text variant="headingSm">Update Pricing</Text>
                        <Text variant="bodyMd" color="subdued">
                          Refresh pricing and inventory levels
                        </Text>
                        <Button>Update Prices</Button>
                      </BlockStack>
                    </Card>
                    
                    <Card sectioned>
                      <BlockStack gap="200">
                        <Text variant="headingSm">Manage Brands</Text>
                        <Text variant="bodyMd" color="subdued">
                          Add or remove brands from your selection
                        </Text>
                        <Link to="/app/brands">
                          <Button>Select Brands</Button>
                        </Link>
                      </BlockStack>
                    </Card>
                  </InlineStack>
                </BlockStack>
              </Card>
            )}

            {/* Original Template Content */}
            <Card>
              <BlockStack gap="500">
                <BlockStack gap="200">
                  <Text variant="headingMd">
                    Shopify App Template
                  </Text>
                  <Text variant="bodyMd" as="p">
                    This is the original template content. You can remove this section once your Turn 14 integration is set up.
                  </Text>
                </BlockStack>
                <BlockStack gap="200">
                  <Text variant="headingSm">
                    Test Product Generation
                  </Text>
                  <Text as="p" variant="bodyMd">
                    Generate a test product to verify your app is working correctly.
                  </Text>
                </BlockStack>
                <InlineStack gap="300">
                  <Button loading={isLoading} onClick={generateProduct}>
                    Generate a product
                  </Button>
                  {fetcher.data?.product && (
                    <Button
                      url={`shopify:admin/products/${productId}`}
                      target="_blank"
                      variant="plain"
                    >
                      View product
                    </Button>
                  )}
                </InlineStack>
                {fetcher.data?.product && (
                  <>
                    <Text variant="headingSm">
                      productCreate mutation result
                    </Text>
                    <Box
                      padding="400"
                      background="bg-surface-active"
                      borderWidth="025"
                      borderRadius="200"
                      borderColor="border"
                      overflowX="scroll"
                    >
                      <pre style={{ margin: 0 }}>
                        <code>
                          {JSON.stringify(fetcher.data.product, null, 2)}
                        </code>
                      </pre>
                    </Box>
                  </>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
