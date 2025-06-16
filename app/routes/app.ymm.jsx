import { json } from "@remix-run/node";
import { useLoaderData, useActionData, useFetcher, useSearchParams } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  DataTable,
  Button,
  ButtonGroup,
  Badge,
  Text,
  Banner,
  Modal,
  FormLayout,
  TextField,
  Select,
  Checkbox,
  Stack,
  InlineStack,
  Box,
  Divider,
  Filters,
  ChoiceList,
  EmptyState,
  Tabs,
  Pagination,
  Spinner
} from "@shopify/polaris";
import { useState, useCallback, useEffect } from "react";
import { 
  CarIcon, 
  SearchIcon, 
  RefreshIcon, 
  ProductIcon,
  SettingsIcon
} from "@shopify/polaris-icons";

import { authenticate } from "../shopify.server.js";
import { YMMService } from "../services/ymm-service.server.js";
import { prisma } from "../db.server.js";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  
  // Get tab selection
  const activeTab = url.searchParams.get("tab") || "search";
  
  // Pagination
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = 25;
  const skip = (page - 1) * limit;

  const ymmService = new YMMService(shop);

  try {
    let data = {};

    switch (activeTab) {
      case "search": {
        // Vehicle search filters
        const year = url.searchParams.get("year");
        const make = url.searchParams.get("make");
        const model = url.searchParams.get("model");
        const category = url.searchParams.get("category");
        const brand = url.searchParams.get("brand");

        if (year && make && model) {
          // Search for compatible products
          const compatibleProducts = await ymmService.findCompatibleProducts({
            year: parseInt(year),
            make,
            model,
            category,
            brand,
            limit,
            offset: skip
          });
          
          data.compatibleProducts = compatibleProducts.compatibleProducts;
          data.totalProducts = compatibleProducts.total;
        }

        // Get available filter options
        const [availableYears, availableMakes, availableModels] = await Promise.all([
          ymmService.getAvailableYears(),
          year ? ymmService.getAvailableMakes(parseInt(year)) : [],
          (year && make) ? ymmService.getAvailableModels(parseInt(year), make) : []
        ]);

        data.availableYears = availableYears;
        data.availableMakes = availableMakes;
        data.availableModels = availableModels;
        data.selectedYear = year;
        data.selectedMake = make;
        data.selectedModel = model;
        break;
      }

      case "vehicles": {
        // Vehicle database management
        const searchTerm = url.searchParams.get("search");
        const yearFilter = url.searchParams.get("yearFilter");
        const makeFilter = url.searchParams.get("makeFilter");

        const vehicleResults = await ymmService.searchVehicles({
          year: yearFilter ? parseInt(yearFilter) : undefined,
          make: makeFilter,
          model: searchTerm,
          limit,
          offset: skip
        });

        data.vehicles = vehicleResults.vehicles;
        data.totalVehicles = vehicleResults.total;
        break;
      }

      case "compatibility": {
        // Product compatibility management
        const products = await prisma.turn14ImportedProduct.findMany({
          where: { shop },
          include: {
            vehicleCompatibility: {
              take: 3,
              orderBy: { year: 'desc' }
            }
          },
          take: limit,
          skip,
          orderBy: { createdAt: 'desc' }
        });

        const totalProducts = await prisma.turn14ImportedProduct.count({
          where: { shop }
        });

        data.products = products;
        data.totalProducts = totalProducts;
        break;
      }
    }

    // Get YMM statistics
    const ymmStats = await ymmService.getYMMStats();

    // Calculate pagination info
    const totalCount = data.totalProducts || data.totalVehicles || 0;
    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;

    return json({
      activeTab,
      ymmStats,
      page,
      totalPages,
      hasNextPage,
      hasPreviousPage,
      ...data
    });
  } catch (error) {
    console.error("YMM loader error:", error);
    return json({
      error: error.message,
      activeTab,
      ymmStats: {
        totalVehicles: 0,
        totalCompatibilityRecords: 0,
        productsWithCompatibility: 0,
        totalProducts: 0,
        compatibilityPercentage: 0
      }
    });
  }
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const actionType = formData.get("action");

  const ymmService = new YMMService(shop);

  try {
    switch (actionType) {
      case "syncVehicleDatabase": {
        const result = await ymmService.syncVehicleDatabase();
        return json({ 
          success: true, 
          message: `Vehicle database synced: ${result.created} created, ${result.updated} updated`,
          result 
        });
      }

      case "syncProductCompatibility": {
        const turn14Sku = formData.get("turn14Sku");
        const result = await ymmService.syncProductCompatibility(turn14Sku);
        return json({ 
          success: true, 
          message: `Compatibility synced for ${turn14Sku}: ${result.created} records created`,
          result 
        });
      }

      case "bulkSyncCompatibility": {
        const limit = parseInt(formData.get("limit") || "10");
        const brandFilter = formData.get("brandFilter") || null;
        
        const result = await ymmService.bulkSyncCompatibility({ limit, brandFilter });
        return json({ 
          success: true, 
          message: `Bulk sync completed: ${result.successful}/${result.processed} products synced`,
          result 
        });
      }

      default:
        return json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (error) {
    console.error("YMM action error:", error);
    return json({ error: error.message }, { status: 500 });
  }
};

export default function YMMPage() {
  const { 
    activeTab, 
    ymmStats, 
    error,
    page,
    totalPages,
    hasNextPage,
    hasPreviousPage,
    // Search tab data
    compatibleProducts = [],
    availableYears = [],
    availableMakes = [],
    availableModels = [],
    selectedYear,
    selectedMake,
    selectedModel,
    // Vehicles tab data
    vehicles = [],
    totalVehicles = 0,
    // Compatibility tab data
    products = [],
    totalProducts = 0
  } = useLoaderData();
  
  const actionData = useActionData();
  const fetcher = useFetcher();
  const [searchParams, setSearchParams] = useSearchParams();

  const [selectedVehicle, setSelectedVehicle] = useState({
    year: selectedYear || "",
    make: selectedMake || "",
    model: selectedModel || ""
  });

  const handleTabChange = useCallback((selectedTabIndex) => {
    const tabs = ["search", "vehicles", "compatibility"];
    const newParams = new URLSearchParams(searchParams);
    newParams.set("tab", tabs[selectedTabIndex]);
    newParams.set("page", "1");
    setSearchParams(newParams);
  }, [searchParams, setSearchParams]);

  const handleVehicleSearch = useCallback(() => {
    if (!selectedVehicle.year || !selectedVehicle.make || !selectedVehicle.model) {
      return;
    }

    const newParams = new URLSearchParams(searchParams);
    newParams.set("year", selectedVehicle.year);
    newParams.set("make", selectedVehicle.make);
    newParams.set("model", selectedVehicle.model);
    newParams.set("page", "1");
    setSearchParams(newParams);
  }, [selectedVehicle, searchParams, setSearchParams]);

  const handleSyncVehicleDatabase = useCallback(() => {
    fetcher.submit(
      { action: "syncVehicleDatabase" },
      { method: "post" }
    );
  }, [fetcher]);

  const handleSyncProductCompatibility = useCallback((turn14Sku) => {
    fetcher.submit(
      { action: "syncProductCompatibility", turn14Sku },
      { method: "post" }
    );
  }, [fetcher]);

  const handleBulkSyncCompatibility = useCallback(() => {
    fetcher.submit(
      { 
        action: "bulkSyncCompatibility",
        limit: "20",
        brandFilter: ""
      },
      { method: "post" }
    );
  }, [fetcher]);

  const tabs = [
    {
      id: "search",
      content: "Vehicle Search",
      accessibilityLabel: "Search products by vehicle",
      panelID: "search-panel"
    },
    {
      id: "vehicles",
      content: "Vehicle Database",
      accessibilityLabel: "Manage vehicle database",
      panelID: "vehicles-panel"
    },
    {
      id: "compatibility",
      content: "Product Compatibility",
      accessibilityLabel: "Manage product compatibility",
      panelID: "compatibility-panel"
    }
  ];

  const currentTabIndex = tabs.findIndex(tab => tab.id === activeTab);

  // Compatible products table data
  const compatibleProductRows = compatibleProducts.map((comp) => [
    <Stack spacing="tight">
      <Text variant="bodyMd" fontWeight="semibold">{comp.product.turn14Sku}</Text>
      <Text variant="bodySm" tone="subdued">{comp.product.turn14Brand}</Text>
    </Stack>,
    comp.product.turn14Category || "-",
    `${comp.year} ${comp.make} ${comp.model}${comp.submodel ? ` ${comp.submodel}` : ""}`,
    comp.engine || "-",
    comp.notes || "-",
    <Badge tone={comp.isUniversal ? "info" : "success"}>
      {comp.isUniversal ? "Universal" : "Specific"}
    </Badge>,
    <Button 
      size="micro" 
      onClick={() => handleSyncProductCompatibility(comp.product.turn14Sku)}
      loading={fetcher.state === "submitting"}
    >
      Sync
    </Button>
  ]);

  // Vehicle database table data
  const vehicleRows = vehicles.map((vehicle) => [
    vehicle.year,
    vehicle.make,
    vehicle.model,
    vehicle.submodel || "-",
    vehicle.engine || "-",
    vehicle.bodyStyle || "-",
    new Date(vehicle.lastUpdated).toLocaleDateString()
  ]);

  // Product compatibility table data
  const productRows = products.map((product) => [
    <Stack spacing="tight">
      <Text variant="bodyMd" fontWeight="semibold">{product.turn14Sku}</Text>
      <Text variant="bodySm" tone="subdued">{product.turn14Brand}</Text>
    </Stack>,
    product.turn14Category || "-",
    <Badge tone={product.vehicleCompatibility.length > 0 ? "success" : "warning"}>
      {product.vehicleCompatibility.length} vehicles
    </Badge>,
    product.vehicleCompatibility.length > 0 ? (
      <Stack spacing="extraTight">
        {product.vehicleCompatibility.slice(0, 2).map((comp, idx) => (
          <Text key={idx} variant="bodySm">
            {comp.year} {comp.make} {comp.model}
          </Text>
        ))}
        {product.vehicleCompatibility.length > 2 && (
          <Text variant="bodySm" tone="subdued">
            +{product.vehicleCompatibility.length - 2} more
          </Text>
        )}
      </Stack>
    ) : (
      <Text variant="bodySm" tone="subdued">No compatibility data</Text>
    ),
    <Button 
      size="micro" 
      onClick={() => handleSyncProductCompatibility(product.turn14Sku)}
      loading={fetcher.state === "submitting"}
    >
      Sync Compatibility
    </Button>
  ]);

  return (
    <Page
      title="YMM Vehicle Compatibility"
      subtitle="Manage Year/Make/Model compatibility for automotive parts"
      primaryAction={{
        content: "Sync Vehicle Database",
        onAction: handleSyncVehicleDatabase,
        loading: fetcher.state === "submitting",
        icon: RefreshIcon
      }}
      secondaryActions={[
        {
          content: "Bulk Sync Compatibility",
          onAction: handleBulkSyncCompatibility,
          loading: fetcher.state === "submitting"
        }
      ]}
    >
      <Layout>
        {error && (
          <Layout.Section>
            <Banner status="critical" title="Error">
              <p>{error}</p>
            </Banner>
          </Layout.Section>
        )}

        {actionData?.error && (
          <Layout.Section>
            <Banner status="critical" title="Error">
              <p>{actionData.error}</p>
            </Banner>
          </Layout.Section>
        )}

        {actionData?.success && (
          <Layout.Section>
            <Banner status="success" title="Success">
              <p>{actionData.message}</p>
            </Banner>
          </Layout.Section>
        )}

        {/* YMM Statistics */}
        <Layout.Section>
          <Card>
            <Box padding="400">
              <Text variant="headingMd" as="h2">YMM Statistics</Text>
              <Box paddingBlockStart="300">
                <InlineStack gap="800">
                  <Stack>
                    <Text variant="headingLg" as="p">{ymmStats.totalVehicles.toLocaleString()}</Text>
                    <Text variant="bodyMd" tone="subdued">Total Vehicles</Text>
                  </Stack>
                  <Stack>
                    <Text variant="headingLg" as="p">{ymmStats.totalCompatibilityRecords.toLocaleString()}</Text>
                    <Text variant="bodyMd" tone="subdued">Compatibility Records</Text>
                  </Stack>
                  <Stack>
                    <Text variant="headingLg" as="p">{ymmStats.productsWithCompatibility}</Text>
                    <Text variant="bodyMd" tone="subdued">Products with Compatibility</Text>
                  </Stack>
                  <Stack>
                    <Text variant="headingLg" as="p">{ymmStats.compatibilityPercentage}%</Text>
                    <Text variant="bodyMd" tone="subdued">Coverage Rate</Text>
                  </Stack>
                </InlineStack>
              </Box>
            </Box>
          </Card>
        </Layout.Section>

        {/* Main Content */}
        <Layout.Section>
          <Card>
            <Tabs tabs={tabs} selected={currentTabIndex} onSelect={handleTabChange}>
              <Box padding="400">
                {activeTab === "search" && (
                  <Stack gap="400">
                    <Text variant="headingMd">Find Compatible Products</Text>
                    
                    {/* Vehicle Selection */}
                    <Card sectioned>
                      <FormLayout>
                        <InlineStack gap="300">
                          <Select
                            label="Year"
                            options={[
                              { label: "Select Year", value: "" },
                              ...availableYears.map(year => ({ 
                                label: year.toString(), 
                                value: year.toString() 
                              }))
                            ]}
                            value={selectedVehicle.year}
                            onChange={(value) => {
                              setSelectedVehicle(prev => ({ 
                                ...prev, 
                                year: value, 
                                make: "", 
                                model: "" 
                              }));
                            }}
                          />

                          <Select
                            label="Make"
                            options={[
                              { label: "Select Make", value: "" },
                              ...availableMakes.map(make => ({ 
                                label: make, 
                                value: make 
                              }))
                            ]}
                            value={selectedVehicle.make}
                            onChange={(value) => {
                              setSelectedVehicle(prev => ({ 
                                ...prev, 
                                make: value, 
                                model: "" 
                              }));
                            }}
                            disabled={!selectedVehicle.year}
                          />

                          <Select
                            label="Model"
                            options={[
                              { label: "Select Model", value: "" },
                              ...availableModels.map(model => ({ 
                                label: model, 
                                value: model 
                              }))
                            ]}
                            value={selectedVehicle.model}
                            onChange={(value) => {
                              setSelectedVehicle(prev => ({ ...prev, model: value }));
                            }}
                            disabled={!selectedVehicle.make}
                          />

                          <Button 
                            variant="primary"
                            onClick={handleVehicleSearch}
                            disabled={!selectedVehicle.year || !selectedVehicle.make || !selectedVehicle.model}
                            icon={SearchIcon}
                          >
                            Search Products
                          </Button>
                        </InlineStack>
                      </FormLayout>
                    </Card>

                    {/* Search Results */}
                    {compatibleProducts.length > 0 ? (
                      <>
                        <Text variant="headingSm">
                          Compatible Products for {selectedYear} {selectedMake} {selectedModel}
                        </Text>
                        <DataTable
                          columnContentTypes={['text', 'text', 'text', 'text', 'text', 'text', 'text']}
                          headings={['Product', 'Category', 'Vehicle', 'Engine', 'Notes', 'Type', 'Actions']}
                          rows={compatibleProductRows}
                        />
                      </>
                    ) : selectedYear && selectedMake && selectedModel ? (
                      <EmptyState
                        heading="No compatible products found"
                        image="https://cdn.shopify.com/s/files/1/0757/9955/files/empty-state.svg"
                      >
                        <p>No products found for {selectedYear} {selectedMake} {selectedModel}.</p>
                      </EmptyState>
                    ) : null}
                  </Stack>
                )}

                {activeTab === "vehicles" && (
                  <Stack gap="400">
                    <InlineStack align="space-between">
                      <Text variant="headingMd">Vehicle Database</Text>
                      <Text variant="bodyMd" tone="subdued">
                        {totalVehicles.toLocaleString()} vehicles
                      </Text>
                    </InlineStack>

                    {vehicles.length > 0 ? (
                      <>
                        <DataTable
                          columnContentTypes={['numeric', 'text', 'text', 'text', 'text', 'text', 'text']}
                          headings={['Year', 'Make', 'Model', 'Submodel', 'Engine', 'Body Style', 'Last Updated']}
                          rows={vehicleRows}
                        />

                        <Box padding="400">
                          <Pagination
                            hasPrevious={hasPreviousPage}
                            onPrevious={() => {
                              const newParams = new URLSearchParams(searchParams);
                              newParams.set("page", (page - 1).toString());
                              setSearchParams(newParams);
                            }}
                            hasNext={hasNextPage}
                            onNext={() => {
                              const newParams = new URLSearchParams(searchParams);
                              newParams.set("page", (page + 1).toString());
                              setSearchParams(newParams);
                            }}
                          />
                        </Box>
                      </>
                    ) : (
                      <EmptyState
                        heading="No vehicles in database"
                        image="https://cdn.shopify.com/s/files/1/0757/9955/files/empty-state.svg"
                      >
                        <p>Sync the vehicle database to get started.</p>
                        <Button onClick={handleSyncVehicleDatabase}>
                          Sync Vehicle Database
                        </Button>
                      </EmptyState>
                    )}
                  </Stack>
                )}

                {activeTab === "compatibility" && (
                  <Stack gap="400">
                    <InlineStack align="space-between">
                      <Text variant="headingMd">Product Compatibility</Text>
                      <Text variant="bodyMd" tone="subdued">
                        {totalProducts} products
                      </Text>
                    </InlineStack>

                    {products.length > 0 ? (
                      <>
                        <DataTable
                          columnContentTypes={['text', 'text', 'text', 'text', 'text']}
                          headings={['Product', 'Category', 'Compatibility Status', 'Compatible Vehicles', 'Actions']}
                          rows={productRows}
                        />

                        <Box padding="400">
                          <Pagination
                            hasPrevious={hasPreviousPage}
                            onPrevious={() => {
                              const newParams = new URLSearchParams(searchParams);
                              newParams.set("page", (page - 1).toString());
                              setSearchParams(newParams);
                            }}
                            hasNext={hasNextPage}
                            onNext={() => {
                              const newParams = new URLSearchParams(searchParams);
                              newParams.set("page", (page + 1).toString());
                              setSearchParams(newParams);
                            }}
                          />
                        </Box>
                      </>
                    ) : (
                      <EmptyState
                        heading="No products found"
                        image="https://cdn.shopify.com/s/files/1/0757/9955/files/empty-state.svg"
                      >
                        <p>Import products to manage compatibility.</p>
                        <Button url="/app/products">Import Products</Button>
                      </EmptyState>
                    )}
                  </Stack>
                )}
              </Box>
            </Tabs>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
} 