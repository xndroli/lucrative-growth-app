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
  RangeSlider,
  EmptyState,
  Thumbnail,
  Pagination
} from "@shopify/polaris";
import { useState, useCallback, useEffect } from "react";
import { 
  ProductIcon, 
  RefreshIcon, 
  AlertTriangleIcon, 
  CheckIcon,
  EditIcon,
  DeleteIcon
} from "@shopify/polaris-icons";

import { authenticate } from "../shopify.server.js";
import { prisma } from "../db.server.js";
import { SyncEngine } from "../services/sync-engine.server.js";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  
  // Pagination
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = 25;
  const skip = (page - 1) * limit;

  // Filters
  const syncStatus = url.searchParams.get("syncStatus");
  const brand = url.searchParams.get("brand");
  const category = url.searchParams.get("category");
  const search = url.searchParams.get("search");
  const sortBy = url.searchParams.get("sortBy") || "updatedAt";
  const sortOrder = url.searchParams.get("sortOrder") || "desc";

  // Build where clause
  const where = { shop };
  
  if (syncStatus) {
    where.syncStatus = syncStatus;
  }
  
  if (brand) {
    where.turn14Brand = { contains: brand, mode: 'insensitive' };
  }
  
  if (category) {
    where.turn14Category = { contains: category, mode: 'insensitive' };
  }
  
  if (search) {
    where.OR = [
      { turn14Sku: { contains: search, mode: 'insensitive' } },
      { turn14Brand: { contains: search, mode: 'insensitive' } }
    ];
  }

  // Get products with pagination
  const [products, totalCount] = await Promise.all([
    prisma.turn14ImportedProduct.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [sortBy]: sortOrder }
    }),
    prisma.turn14ImportedProduct.count({ where })
  ]);

  // Get filter options
  const [brands, categories, syncStatuses] = await Promise.all([
    prisma.turn14ImportedProduct.findMany({
      where: { shop },
      select: { turn14Brand: true },
      distinct: ['turn14Brand']
    }),
    prisma.turn14ImportedProduct.findMany({
      where: { shop },
      select: { turn14Category: true },
      distinct: ['turn14Category']
    }),
    prisma.turn14ImportedProduct.groupBy({
      by: ['syncStatus'],
      where: { shop },
      _count: true
    })
  ]);

  // Calculate pagination info
  const totalPages = Math.ceil(totalCount / limit);
  const hasNextPage = page < totalPages;
  const hasPreviousPage = page > 1;

  return json({
    products,
    totalCount,
    page,
    totalPages,
    hasNextPage,
    hasPreviousPage,
    brands: brands.map(b => b.turn14Brand).filter(Boolean),
    categories: categories.map(c => c.turn14Category).filter(Boolean),
    syncStatuses: syncStatuses.map(s => ({ 
      value: s.syncStatus, 
      count: s._count 
    }))
  });
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const actionType = formData.get("action");

  try {
    switch (actionType) {
      case "syncSingleProduct": {
        const productId = formData.get("productId");
        const syncEngine = new SyncEngine(shop, session.accessToken);
        
        const product = await prisma.turn14ImportedProduct.findUnique({
          where: { id: productId }
        });
        
        if (!product) {
          throw new Error("Product not found");
        }

        // Sync inventory and pricing for this product
        await syncEngine.syncInventory({ productIds: [productId] });
        await syncEngine.syncPricing({ productIds: [productId] });
        
        return json({ success: true, message: "Product synced successfully" });
      }

      case "updateProduct": {
        const productId = formData.get("productId");
        const priceMarkup = parseFloat(formData.get("priceMarkup") || "0");
        const syncStatus = formData.get("syncStatus");
        
        const updates = {};
        if (priceMarkup !== undefined) updates.priceMarkup = priceMarkup;
        if (syncStatus) updates.syncStatus = syncStatus;
        
        await prisma.turn14ImportedProduct.update({
          where: { id: productId },
          data: updates
        });
        
        return json({ success: true, message: "Product updated successfully" });
      }

      case "bulkUpdateStatus": {
        const productIds = JSON.parse(formData.get("productIds"));
        const syncStatus = formData.get("syncStatus");
        
        await prisma.turn14ImportedProduct.updateMany({
          where: { 
            id: { in: productIds },
            shop 
          },
          data: { syncStatus }
        });
        
        return json({ 
          success: true, 
          message: `Updated ${productIds.length} products` 
        });
      }

      case "bulkDelete": {
        const productIds = JSON.parse(formData.get("productIds"));
        
        await prisma.turn14ImportedProduct.deleteMany({
          where: { 
            id: { in: productIds },
            shop 
          }
        });
        
        return json({ 
          success: true, 
          message: `Deleted ${productIds.length} products` 
        });
      }

      case "deleteProduct": {
        const productId = formData.get("productId");
        
        await prisma.turn14ImportedProduct.delete({
          where: { id: productId }
        });
        
        return json({ success: true, message: "Product deleted successfully" });
      }

      default:
        return json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (error) {
    console.error("Inventory action error:", error);
    return json({ error: error.message }, { status: 500 });
  }
};

export default function InventoryPage() {
  const { 
    products, 
    totalCount, 
    page, 
    totalPages, 
    hasNextPage, 
    hasPreviousPage,
    brands,
    categories,
    syncStatuses
  } = useLoaderData();
  const actionData = useActionData();
  const fetcher = useFetcher();
  const [searchParams, setSearchParams] = useSearchParams();

  const [selectedProducts, setSelectedProducts] = useState([]);
  const [activeModal, setActiveModal] = useState(null);
  const [editingProduct, setEditingProduct] = useState(null);
  
  // Filter states
  const [syncStatusFilter, setSyncStatusFilter] = useState(
    searchParams.get("syncStatus") || null
  );
  const [brandFilter, setBrandFilter] = useState(
    searchParams.get("brand") || null
  );
  const [categoryFilter, setCategoryFilter] = useState(
    searchParams.get("category") || null
  );
  const [searchValue, setSearchValue] = useState(
    searchParams.get("search") || ""
  );

  const handleFiltersQueryChange = useCallback((query) => {
    setSearchValue(query);
    const newParams = new URLSearchParams(searchParams);
    if (query) {
      newParams.set("search", query);
    } else {
      newParams.delete("search");
    }
    newParams.set("page", "1");
    setSearchParams(newParams);
  }, [searchParams, setSearchParams]);

  const handleFilterChange = useCallback((key, value) => {
    const newParams = new URLSearchParams(searchParams);
    if (value && value.length > 0) {
      newParams.set(key, value);
    } else {
      newParams.delete(key);
    }
    newParams.set("page", "1");
    setSearchParams(newParams);

    // Update local state
    switch (key) {
      case "syncStatus":
        setSyncStatusFilter(value || null);
        break;
      case "brand":
        setBrandFilter(value || null);
        break;
      case "category":
        setCategoryFilter(value || null);
        break;
    }
  }, [searchParams, setSearchParams]);

  const handleClearAllFilters = useCallback(() => {
    const newParams = new URLSearchParams();
    newParams.set("page", "1");
    setSearchParams(newParams);
    setSyncStatusFilter(null);
    setBrandFilter(null);
    setCategoryFilter(null);
    setSearchValue("");
  }, [setSearchParams]);

  const handleSyncProduct = useCallback((productId) => {
    fetcher.submit(
      { action: "syncSingleProduct", productId },
      { method: "post" }
    );
  }, [fetcher]);

  const handleEditProduct = useCallback((product) => {
    setEditingProduct(product);
    setActiveModal("editProduct");
  }, []);

  const handleSaveProduct = useCallback(() => {
    if (!editingProduct) return;

    fetcher.submit(
      {
        action: "updateProduct",
        productId: editingProduct.id,
        priceMarkup: editingProduct.priceMarkup,
        syncStatus: editingProduct.syncStatus
      },
      { method: "post" }
    );
    
    setActiveModal(null);
    setEditingProduct(null);
  }, [editingProduct, fetcher]);

  const handleDeleteProduct = useCallback((productId) => {
    if (confirm("Are you sure you want to delete this product tracking?")) {
      fetcher.submit(
        { action: "deleteProduct", productId },
        { method: "post" }
      );
    }
  }, [fetcher]);

  const handleBulkAction = useCallback((action) => {
    if (selectedProducts.length === 0) return;

    if (action === "delete") {
      if (confirm(`Are you sure you want to delete ${selectedProducts.length} products?`)) {
        fetcher.submit(
          {
            action: "bulkDelete",
            productIds: JSON.stringify(selectedProducts)
          },
          { method: "post" }
        );
        setSelectedProducts([]);
      }
    } else {
      // Status updates
      fetcher.submit(
        {
          action: "bulkUpdateStatus",
          productIds: JSON.stringify(selectedProducts),
          syncStatus: action
        },
        { method: "post" }
      );
      setSelectedProducts([]);
    }
  }, [selectedProducts, fetcher]);

  // Filters
  const filters = [
    {
      key: 'syncStatus',
      label: 'Sync Status',
      filter: (
        <ChoiceList
          title="Sync Status"
          choices={[
            { label: 'Active', value: 'active' },
            { label: 'Error', value: 'error' },
            { label: 'Paused', value: 'paused' }
          ]}
          selected={syncStatusFilter ? [syncStatusFilter] : []}
          onChange={(value) => handleFilterChange('syncStatus', value[0])}
        />
      ),
      shortcut: true
    },
    {
      key: 'brand',
      label: 'Brand',
      filter: (
        <ChoiceList
          title="Brand"
          choices={brands.map(brand => ({ label: brand, value: brand }))}
          selected={brandFilter ? [brandFilter] : []}
          onChange={(value) => handleFilterChange('brand', value[0])}
        />
      )
    },
    {
      key: 'category',
      label: 'Category',
      filter: (
        <ChoiceList
          title="Category"
          choices={categories.map(cat => ({ label: cat, value: cat }))}
          selected={categoryFilter ? [categoryFilter] : []}
          onChange={(value) => handleFilterChange('category', value[0])}
        />
      )
    }
  ];

  const appliedFilters = [];
  if (syncStatusFilter) {
    appliedFilters.push({
      key: 'syncStatus',
      label: `Status: ${syncStatusFilter}`,
      onRemove: () => handleFilterChange('syncStatus', null)
    });
  }
  if (brandFilter) {
    appliedFilters.push({
      key: 'brand',
      label: `Brand: ${brandFilter}`,
      onRemove: () => handleFilterChange('brand', null)
    });
  }
  if (categoryFilter) {
    appliedFilters.push({
      key: 'category',
      label: `Category: ${categoryFilter}`,
      onRemove: () => handleFilterChange('category', null)
    });
  }

  // Table data
  const productRows = products.map((product) => [
    <Checkbox
      checked={selectedProducts.includes(product.id)}
      onChange={(checked) => {
        if (checked) {
          setSelectedProducts([...selectedProducts, product.id]);
        } else {
          setSelectedProducts(selectedProducts.filter(id => id !== product.id));
        }
      }}
    />,
    <Stack spacing="tight">
      <Text variant="bodyMd" fontWeight="semibold">{product.turn14Sku}</Text>
      <Text variant="bodySm" tone="subdued">{product.turn14Brand}</Text>
    </Stack>,
    product.turn14Category || "-",
    <Stack spacing="tight">
      <Text variant="bodyMd">${product.currentPrice?.toFixed(2) || "0.00"}</Text>
      <Text variant="bodySm" tone="subdued">
        {product.priceMarkup}% markup
      </Text>
    </Stack>,
    product.inventoryQuantity || 0,
    <Badge tone={
      product.syncStatus === 'active' ? 'success' : 
      product.syncStatus === 'error' ? 'critical' : 'warning'
    }>
      {product.syncStatus.charAt(0).toUpperCase() + product.syncStatus.slice(1)}
    </Badge>,
    product.lastSynced ? new Date(product.lastSynced).toLocaleDateString() : "Never",
    <ButtonGroup>
      <Button 
        size="micro" 
        icon={RefreshIcon}
        onClick={() => handleSyncProduct(product.id)}
        loading={fetcher.state === "submitting"}
        accessibilityLabel="Sync product"
      />
      <Button 
        size="micro" 
        icon={EditIcon}
        onClick={() => handleEditProduct(product)}
        accessibilityLabel="Edit product"
      />
      <Button 
        size="micro" 
        icon={DeleteIcon}
        onClick={() => handleDeleteProduct(product.id)}
        accessibilityLabel="Delete product"
      />
    </ButtonGroup>
  ]);

  const promotedBulkActions = [
    {
      content: 'Activate Sync',
      onAction: () => handleBulkAction('active'),
    },
    {
      content: 'Pause Sync',
      onAction: () => handleBulkAction('paused'),
    },
  ];

  const bulkActions = [
    {
      content: 'Delete Products',
      destructive: true,
      onAction: () => handleBulkAction('delete'),
    },
  ];

  return (
    <Page
      title="Inventory Management"
      subtitle={`${totalCount} imported products`}
      primaryAction={{
        content: "Import Products",
        url: "/app/products"
      }}
    >
      <Layout>
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

        <Layout.Section>
          <Card>
            <Box padding="400">
              <Filters
                queryValue={searchValue}
                filters={filters}
                appliedFilters={appliedFilters}
                onQueryChange={handleFiltersQueryChange}
                onQueryClear={() => handleFiltersQueryChange("")}
                onClearAll={handleClearAllFilters}
                queryPlaceholder="Search by SKU or brand..."
              />
            </Box>

            {products.length > 0 ? (
              <>
                <DataTable
                  columnContentTypes={[
                    'text', 'text', 'text', 'text', 'numeric', 'text', 'text', 'text'
                  ]}
                  headings={[
                    '', 'Product', 'Category', 'Price', 'Inventory', 'Status', 'Last Sync', 'Actions'
                  ]}
                  rows={productRows}
                  promotedBulkActions={promotedBulkActions}
                  bulkActions={bulkActions}
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
              <Box padding="400">
                <EmptyState
                  heading="No imported products found"
                  image="https://cdn.shopify.com/s/files/1/0757/9955/files/empty-state.svg"
                >
                  <p>
                    {appliedFilters.length > 0 || searchValue
                      ? "Try adjusting your filters or search terms."
                      : "Import products from Turn 14 to get started."
                    }
                  </p>
                  <Button variant="primary" url="/app/products">
                    Import Products
                  </Button>
                </EmptyState>
              </Box>
            )}
          </Card>
        </Layout.Section>
      </Layout>

      {/* Edit Product Modal */}
      <Modal
        open={activeModal === "editProduct"}
        onClose={() => setActiveModal(null)}
        title="Edit Product Settings"
        primaryAction={{
          content: "Save Changes",
          onAction: handleSaveProduct,
          loading: fetcher.state === "submitting"
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setActiveModal(null)
          }
        ]}
      >
        <Modal.Section>
          {editingProduct && (
            <FormLayout>
              <Stack spacing="tight">
                <Text variant="headingMd">{editingProduct.turn14Sku}</Text>
                <Text variant="bodyMd" tone="subdued">{editingProduct.turn14Brand}</Text>
              </Stack>

              <TextField
                label="Price Markup (%)"
                type="number"
                value={editingProduct.priceMarkup?.toString() || "0"}
                onChange={(value) => setEditingProduct(prev => ({
                  ...prev,
                  priceMarkup: parseFloat(value) || 0
                }))}
                min="0"
                max="1000"
                suffix="%"
                helpText="Markup percentage applied to Turn 14 price"
              />

              <Select
                label="Sync Status"
                options={[
                  { label: "Active", value: "active" },
                  { label: "Paused", value: "paused" },
                  { label: "Error", value: "error" }
                ]}
                value={editingProduct.syncStatus}
                onChange={(value) => setEditingProduct(prev => ({
                  ...prev,
                  syncStatus: value
                }))}
              />

              <Box>
                <Text variant="bodyMd" fontWeight="semibold">Current Pricing</Text>
                <Stack spacing="tight">
                  <Text variant="bodyMd">
                    Turn 14 Price: ${editingProduct.originalPrice?.toFixed(2) || "0.00"}
                  </Text>
                  <Text variant="bodyMd">
                    Your Price: ${editingProduct.currentPrice?.toFixed(2) || "0.00"}
                  </Text>
                  <Text variant="bodyMd">
                    Inventory: {editingProduct.inventoryQuantity || 0} units
                  </Text>
                </Stack>
              </Box>
            </FormLayout>
          )}
        </Modal.Section>
      </Modal>
    </Page>
  );
} 