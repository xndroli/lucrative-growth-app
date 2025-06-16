import { useState, useCallback, useEffect } from "react";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, useNavigation, useSearchParams } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  Button,
  Banner,
  InlineStack,
  BlockStack,
  TextField,
  Select,
  Checkbox,
  Box,
  Badge,
  EmptyState,
  Filters,
  DataTable,
  Thumbnail,
  Modal,
  ButtonGroup,
  RangeSlider,
  ChoiceList,
  Divider
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { 
  getTurn14Config, 
  fetchTurn14Inventory,
  fetchTurn14Product,
  transformProductForShopify
} from "../services/turn14-api.server";

export async function loader({ request }) {
  const { session, admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  
  // Extract filter parameters
  const search = url.searchParams.get('search') || '';
  const page = parseInt(url.searchParams.get('page') || '1');
  const brands = url.searchParams.get('brands')?.split(',').filter(Boolean) || [];
  const categories = url.searchParams.get('categories')?.split(',').filter(Boolean) || [];
  const priceMin = url.searchParams.get('priceMin') ? parseFloat(url.searchParams.get('priceMin')) : null;
  const priceMax = url.searchParams.get('priceMax') ? parseFloat(url.searchParams.get('priceMax')) : null;
  const inStock = url.searchParams.get('inStock') === 'true' ? true : url.searchParams.get('inStock') === 'false' ? false : null;
  const carb = url.searchParams.get('carb') === 'true' ? true : url.searchParams.get('carb') === 'false' ? false : null;
  const prop65 = url.searchParams.get('prop65') === 'true' ? true : url.searchParams.get('prop65') === 'false' ? false : null;
  
  try {
    // Check if Turn 14 is configured
    let config = null;
    let isConfigured = false;
    
    try {
      config = await getTurn14Config(session.shop);
      isConfigured = config && config.isActive;
    } catch (error) {
      isConfigured = false;
    }

    if (!isConfigured) {
      return json({
        products: [],
        pagination: { currentPage: 1, totalPages: 0, hasNext: false, hasPrev: false },
        selectedBrands: [],
        availableCategories: [],
        filters: {},
        isConfigured: false
      });
    }

    // Use selected brands if no specific brands filter is applied
    const effectiveBrands = brands.length > 0 
      ? brands 
      : (config.selectedBrands || []).map(brand => brand.id || brand.name);

    // Fetch products with filters
    const productsData = await fetchTurn14Inventory(session.shop, {
      page,
      limit: 50,
      brands: effectiveBrands,
      categories,
      search,
      priceMin,
      priceMax,
      inStock,
      carb,
      prop65
    });

    // Extract unique categories for filter options
    const availableCategories = [...new Set(
      productsData.products
        .map(product => product.category)
        .filter(Boolean)
    )].sort();

    return json({
      products: productsData.products,
      pagination: productsData.pagination,
      selectedBrands: config.selectedBrands || [],
      availableCategories,
      filters: {
        search,
        brands,
        categories,
        priceMin,
        priceMax,
        inStock,
        carb,
        prop65
      },
      isConfigured: true
    });
  } catch (error) {
    console.error('Error loading products:', error);
    return json({
      products: [],
      pagination: { currentPage: 1, totalPages: 0, hasNext: false, hasPrev: false },
      selectedBrands: [],
      availableCategories: [],
      filters: {},
      isConfigured: false,
      error: error.message
    });
  }
}

export async function action({ request }) {
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const action = formData.get('_action');

  try {
    switch (action) {
      case 'import_product': {
        const sku = formData.get('sku');
        const priceMarkup = parseFloat(formData.get('priceMarkup') || '0');
        
        // Fetch detailed product data
        const turn14Product = await fetchTurn14Product(session.shop, sku);
        
        // Transform for Shopify
        const shopifyProduct = transformProductForShopify(turn14Product, {
          priceMarkup
        });

        // Create product in Shopify
        const response = await admin.graphql(
          `#graphql
            mutation productCreate($product: ProductCreateInput!) {
              productCreate(product: $product) {
                product {
                  id
                  title
                  handle
                  status
                }
                userErrors {
                  field
                  message
                }
              }
            }`,
          {
            variables: {
              product: shopifyProduct
            }
          }
        );

        const responseJson = await response.json();
        
        if (responseJson.data.productCreate.userErrors.length > 0) {
          return json({
            error: responseJson.data.productCreate.userErrors[0].message,
            success: false
          }, { status: 400 });
        }

        return json({
          success: true,
          message: `Product "${turn14Product.name}" imported successfully!`,
          productId: responseJson.data.productCreate.product.id
        });
      }

      case 'bulk_import': {
        const skusJson = formData.get('skus');
        const skus = JSON.parse(skusJson || '[]');
        const priceMarkup = parseFloat(formData.get('priceMarkup') || '0');
        
        let imported = 0;
        let failed = 0;
        const errors = [];

        for (const sku of skus) {
          try {
            // Fetch detailed product data
            const turn14Product = await fetchTurn14Product(session.shop, sku);
            
            // Transform for Shopify
            const shopifyProduct = transformProductForShopify(turn14Product, {
              priceMarkup
            });

            // Create product in Shopify
            const response = await admin.graphql(
              `#graphql
                mutation productCreate($product: ProductCreateInput!) {
                  productCreate(product: $product) {
                    product {
                      id
                      title
                    }
                    userErrors {
                      field
                      message
                    }
                  }
                }`,
              {
                variables: {
                  product: shopifyProduct
                }
              }
            );

            const responseJson = await response.json();
            
            if (responseJson.data.productCreate.userErrors.length > 0) {
              failed++;
              errors.push(`${sku}: ${responseJson.data.productCreate.userErrors[0].message}`);
            } else {
              imported++;
            }
          } catch (error) {
            failed++;
            errors.push(`${sku}: ${error.message}`);
          }
        }

        return json({
          success: true,
          message: `Bulk import completed: ${imported} imported, ${failed} failed`,
          imported,
          failed,
          errors: errors.slice(0, 5) // Show first 5 errors
        });
      }

      default:
        return json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Product action error:', error);
    return json({ 
      error: error.message,
      success: false 
    }, { status: 500 });
  }
}

export default function ProductsPage() {
  const { 
    products, 
    pagination, 
    selectedBrands,
    availableCategories,
    filters, 
    isConfigured, 
    error 
  } = useLoaderData();
  
  const [searchParams, setSearchParams] = useSearchParams();
  const fetcher = useFetcher();
  const navigation = useNavigation();
  
  const [localFilters, setLocalFilters] = useState(filters);
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importModalData, setImportModalData] = useState(null);
  const [priceMarkup, setPriceMarkup] = useState(0);

  const isLoading = navigation.state === 'loading' || fetcher.state === 'submitting';

  // Filter change handlers
  const handleFiltersChange = useCallback((newFilters) => {
    const params = new URLSearchParams();
    
    Object.entries(newFilters).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== '') {
        if (Array.isArray(value) && value.length > 0) {
          params.set(key, value.join(','));
        } else if (!Array.isArray(value)) {
          params.set(key, value.toString());
        }
      }
    });
    
    params.set('page', '1'); // Reset to first page
    setSearchParams(params);
  }, [setSearchParams]);

  const updateFilter = useCallback((key, value) => {
    const newFilters = { ...localFilters, [key]: value };
    setLocalFilters(newFilters);
    handleFiltersChange(newFilters);
  }, [localFilters, handleFiltersChange]);

  const clearFilters = useCallback(() => {
    const clearedFilters = {
      search: '',
      brands: [],
      categories: [],
      priceMin: null,
      priceMax: null,
      inStock: null,
      carb: null,
      prop65: null
    };
    setLocalFilters(clearedFilters);
    handleFiltersChange(clearedFilters);
  }, [handleFiltersChange]);

  // Product selection handlers
  const handleProductToggle = useCallback((sku, isSelected) => {
    setSelectedProducts(prev => 
      isSelected 
        ? [...prev, sku]
        : prev.filter(s => s !== sku)
    );
  }, []);

  const handleSelectAllProducts = useCallback(() => {
    setSelectedProducts(products.map(p => p.sku));
  }, [products]);

  const handleClearSelection = useCallback(() => {
    setSelectedProducts([]);
  }, []);

  // Import handlers
  const handleSingleImport = useCallback((product) => {
    setImportModalData(product);
    setShowImportModal(true);
  }, []);

  const handleBulkImport = useCallback(() => {
    if (selectedProducts.length === 0) return;
    
    const formData = new FormData();
    formData.append('_action', 'bulk_import');
    formData.append('skus', JSON.stringify(selectedProducts));
    formData.append('priceMarkup', priceMarkup.toString());
    fetcher.submit(formData, { method: 'post' });
    setSelectedProducts([]);
  }, [selectedProducts, priceMarkup, fetcher]);

  const handleModalImport = useCallback(() => {
    if (!importModalData) return;
    
    const formData = new FormData();
    formData.append('_action', 'import_product');
    formData.append('sku', importModalData.sku);
    formData.append('priceMarkup', priceMarkup.toString());
    fetcher.submit(formData, { method: 'post' });
    setShowImportModal(false);
    setImportModalData(null);
  }, [importModalData, priceMarkup, fetcher]);

  if (error) {
    return (
      <Page title="Products">
        <Banner status="critical" title="Error Loading Products">
          <p>{error}</p>
        </Banner>
      </Page>
    );
  }

  if (!isConfigured) {
    return (
      <Page title="Products">
        <Layout>
          <Layout.Section>
            <Card sectioned>
              <EmptyState
                heading="Turn 14 API Not Configured"
                action={{
                  content: 'Configure Turn 14 API',
                  url: '/app/turn14-config'
                }}
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>You need to configure your Turn 14 API credentials and select brands before browsing products.</p>
              </EmptyState>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  const appliedFilters = [
    ...(localFilters.search ? [{ key: 'search', label: `Search: ${localFilters.search}` }] : []),
    ...(localFilters.categories?.length ? [{ key: 'categories', label: `Categories: ${localFilters.categories.join(', ')}` }] : []),
    ...(localFilters.inStock !== null ? [{ key: 'inStock', label: `In Stock: ${localFilters.inStock ? 'Yes' : 'No'}` }] : []),
    ...(localFilters.carb !== null ? [{ key: 'carb', label: `CARB Compliant: ${localFilters.carb ? 'Yes' : 'No'}` }] : []),
    ...(localFilters.prop65 !== null ? [{ key: 'prop65', label: `Prop 65 Warning: ${localFilters.prop65 ? 'Yes' : 'No'}` }] : []),
    ...(localFilters.priceMin || localFilters.priceMax ? [{ 
      key: 'price', 
      label: `Price: $${localFilters.priceMin || 0} - $${localFilters.priceMax || '∞'}` 
    }] : [])
  ];

  return (
    <Page
      title="Turn 14 Products"
      subtitle={`Browse and import products from your ${selectedBrands.length} selected brands`}
      secondaryActions={[
        {
          content: 'Manage Brands',
          url: '/app/brands'
        }
      ]}
    >
      <Layout>
        <Layout.Section>
          {/* Success/Error Messages */}
          {fetcher.data?.error && (
            <Banner status="critical" title="Error">
              <p>{fetcher.data.error}</p>
            </Banner>
          )}
          
          {fetcher.data?.success && fetcher.data?.message && (
            <Banner status="success" title="Success">
              <p>{fetcher.data.message}</p>
              {fetcher.data.errors && fetcher.data.errors.length > 0 && (
                <Box paddingBlockStart="200">
                  <Text variant="bodyMd" fontWeight="semibold">Errors:</Text>
                  <Box as="ul" paddingInlineStart="400">
                    {fetcher.data.errors.map((error, index) => (
                      <Box as="li" key={index}>
                        <Text variant="bodySm">{error}</Text>
                      </Box>
                    ))}
                  </Box>
                </Box>
              )}
            </Banner>
          )}

          {/* Filters */}
          <Card>
            <BlockStack gap="400">
              <InlineStack gap="300" align="space-between">
                <Text variant="headingMd">Filters</Text>
                <Button onClick={clearFilters} disabled={appliedFilters.length === 0}>
                  Clear all filters
                </Button>
              </InlineStack>

              <InlineStack gap="300" wrap>
                <Box minWidth="200px">
                  <TextField
                    label="Search products"
                    value={localFilters.search || ''}
                    onChange={(value) => updateFilter('search', value)}
                    placeholder="Search by name or SKU..."
                    clearButton
                    onClearButtonClick={() => updateFilter('search', '')}
                  />
                </Box>

                <Box minWidth="200px">
                  <ChoiceList
                    title="Categories"
                    choices={availableCategories.map(cat => ({ label: cat, value: cat }))}
                    selected={localFilters.categories || []}
                    onChange={(value) => updateFilter('categories', value)}
                    allowMultiple
                  />
                </Box>

                <Box minWidth="150px">
                  <Select
                    label="In Stock"
                    options={[
                      { label: 'All', value: '' },
                      { label: 'In Stock', value: 'true' },
                      { label: 'Out of Stock', value: 'false' }
                    ]}
                    value={localFilters.inStock?.toString() || ''}
                    onChange={(value) => updateFilter('inStock', value === '' ? null : value === 'true')}
                  />
                </Box>

                <Box minWidth="150px">
                  <Select
                    label="CARB Compliant"
                    options={[
                      { label: 'All', value: '' },
                      { label: 'CARB Compliant', value: 'true' },
                      { label: 'Not CARB Compliant', value: 'false' }
                    ]}
                    value={localFilters.carb?.toString() || ''}
                    onChange={(value) => updateFilter('carb', value === '' ? null : value === 'true')}
                  />
                </Box>

                <Box minWidth="150px">
                  <Select
                    label="Prop 65 Warning"
                    options={[
                      { label: 'All', value: '' },
                      { label: 'Has Warning', value: 'true' },
                      { label: 'No Warning', value: 'false' }
                    ]}
                    value={localFilters.prop65?.toString() || ''}
                    onChange={(value) => updateFilter('prop65', value === '' ? null : value === 'true')}
                  />
                </Box>
              </InlineStack>

              <InlineStack gap="300">
                <Box minWidth="150px">
                  <TextField
                    label="Min Price"
                    type="number"
                    value={localFilters.priceMin?.toString() || ''}
                    onChange={(value) => updateFilter('priceMin', value ? parseFloat(value) : null)}
                    prefix="$"
                  />
                </Box>
                <Box minWidth="150px">
                  <TextField
                    label="Max Price"
                    type="number"
                    value={localFilters.priceMax?.toString() || ''}
                    onChange={(value) => updateFilter('priceMax', value ? parseFloat(value) : null)}
                    prefix="$"
                  />
                </Box>
              </InlineStack>

              {appliedFilters.length > 0 && (
                <Box>
                  <Text variant="bodyMd" fontWeight="semibold">Applied filters:</Text>
                  <InlineStack gap="200" wrap>
                    {appliedFilters.map((filter) => (
                      <Badge key={filter.key}>{filter.label}</Badge>
                    ))}
                  </InlineStack>
                </Box>
              )}
            </BlockStack>
          </Card>

          {/* Bulk Actions */}
          {selectedProducts.length > 0 && (
            <Card>
              <InlineStack gap="300" align="space-between">
                <Text variant="headingMd">
                  {selectedProducts.length} product{selectedProducts.length !== 1 ? 's' : ''} selected
                </Text>
                <InlineStack gap="200">
                  <Button onClick={handleClearSelection}>Clear selection</Button>
                  <Button primary onClick={handleBulkImport} loading={fetcher.state === 'submitting'}>
                    Import Selected Products
                  </Button>
                </InlineStack>
              </InlineStack>
            </Card>
          )}

          {/* Products List */}
          {products.length === 0 ? (
            <Card sectioned>
              <EmptyState
                heading="No Products Found"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>
                  {appliedFilters.length > 0 
                    ? "No products match your current filters. Try adjusting your search criteria."
                    : selectedBrands.length === 0
                    ? "No brands selected. Please select brands first."
                    : "No products available from your selected brands."
                  }
                </p>
              </EmptyState>
            </Card>
          ) : (
            <Card>
              <BlockStack gap="0">
                <Box padding="400">
                  <InlineStack gap="300" align="space-between">
                    <Text variant="headingMd">
                      {products.length} products found
                    </Text>
                    <InlineStack gap="200">
                      <Button onClick={handleSelectAllProducts}>Select All</Button>
                      <TextField
                        label="Price Markup %"
                        type="number"
                        value={priceMarkup.toString()}
                        onChange={(value) => setPriceMarkup(parseFloat(value) || 0)}
                        suffix="%"
                        labelHidden
                        placeholder="0"
                      />
                    </InlineStack>
                  </InlineStack>
                </Box>
                
                <Divider />
                
                {products.map((product, index) => {
                  const isSelected = selectedProducts.includes(product.sku);
                  return (
                    <Box 
                      key={product.sku} 
                      padding="400" 
                      borderBlockEndWidth={index < products.length - 1 ? "025" : "0"}
                      borderColor="border"
                    >
                      <InlineStack gap="400" align="start">
                        <Checkbox
                          checked={isSelected}
                          onChange={(checked) => handleProductToggle(product.sku, checked)}
                        />
                        
                        <Thumbnail
                          source={product.images?.[0]?.url || product.images?.[0] || "https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"}
                          alt={product.name}
                          size="medium"
                        />
                        
                        <BlockStack gap="200" align="start">
                          <Text variant="headingSm">{product.name}</Text>
                          <Text variant="bodyMd" color="subdued">
                            SKU: {product.sku} | Brand: {product.manufacturer || product.brand}
                          </Text>
                          {product.description && (
                            <Text variant="bodySm" color="subdued">
                              {product.description.length > 150 
                                ? `${product.description.substring(0, 150)}...` 
                                : product.description
                              }
                            </Text>
                          )}
                          <InlineStack gap="200">
                            <Badge status={product.stock > 0 ? "success" : "critical"}>
                              {product.stock > 0 ? `${product.stock} in stock` : 'Out of stock'}
                            </Badge>
                            {product.carbCompliant && <Badge>CARB Compliant</Badge>}
                            {product.prop65Warning && <Badge status="warning">Prop 65</Badge>}
                            {product.category && <Badge>{product.category}</Badge>}
                          </InlineStack>
                        </BlockStack>
                        
                        <Box minWidth="100px">
                          <BlockStack gap="200" align="end">
                            <Text variant="headingMd">${product.price}</Text>
                            <Button onClick={() => handleSingleImport(product)}>
                              Import Product
                            </Button>
                          </BlockStack>
                        </Box>
                      </InlineStack>
                    </Box>
                  );
                })}
              </BlockStack>
            </Card>
          )}

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <Card sectioned>
              <InlineStack gap="300" align="center">
                <Button
                  disabled={!pagination.hasPrev}
                  url={`/app/products?${new URLSearchParams({
                    ...Object.fromEntries(searchParams),
                    page: (pagination.currentPage - 1).toString()
                  })}`}
                >
                  Previous
                </Button>
                
                <Text variant="bodyMd">
                  Page {pagination.currentPage} of {pagination.totalPages}
                </Text>
                
                <Button
                  disabled={!pagination.hasNext}
                  url={`/app/products?${new URLSearchParams({
                    ...Object.fromEntries(searchParams),
                    page: (pagination.currentPage + 1).toString()
                  })}`}
                >
                  Next
                </Button>
              </InlineStack>
            </Card>
          )}
        </Layout.Section>
      </Layout>

      {/* Import Modal */}
      {showImportModal && importModalData && (
        <Modal
          open={showImportModal}
          onClose={() => setShowImportModal(false)}
          title="Import Product"
          primaryAction={{
            content: 'Import Product',
            onAction: handleModalImport,
            loading: fetcher.state === 'submitting'
          }}
          secondaryActions={[
            {
              content: 'Cancel',
              onAction: () => setShowImportModal(false)
            }
          ]}
        >
          <Modal.Section>
            <BlockStack gap="400">
              <Text variant="headingMd">{importModalData.name}</Text>
              <Text variant="bodyMd">SKU: {importModalData.sku}</Text>
              <Text variant="bodyMd">Original Price: ${importModalData.price}</Text>
              
              <TextField
                label="Price Markup %"
                type="number"
                value={priceMarkup.toString()}
                onChange={(value) => setPriceMarkup(parseFloat(value) || 0)}
                suffix="%"
                helpText={`Final price: $${(parseFloat(importModalData.price) * (1 + priceMarkup / 100)).toFixed(2)}`}
              />
              
              {importModalData.description && (
                <Box>
                  <Text variant="bodyMd" fontWeight="semibold">Description:</Text>
                  <Text variant="bodyMd">{importModalData.description}</Text>
                </Box>
              )}
            </BlockStack>
          </Modal.Section>
        </Modal>
      )}
    </Page>
  );
} 