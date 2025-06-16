import { useState, useCallback, useEffect } from "react";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, useNavigation } from "@remix-run/react";
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
  Checkbox,
  Box,
  Badge,
  Spinner,
  EmptyState,
  Pagination,
  Filters,
  ChoiceList,
  DataTable
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { 
  getTurn14Config, 
  saveTurn14Config, 
  fetchTurn14Brands 
} from "../services/turn14-api.server";

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const search = url.searchParams.get('search') || '';
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = 50;
  
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
        brands: [],
        selectedBrands: [],
        isConfigured: false,
        pagination: { currentPage: 1, totalPages: 0, hasNext: false, hasPrev: false },
        search: ''
      });
    }

    // Fetch brands from Turn 14 API
    const brandsData = await fetchTurn14Brands(session.shop);
    let brands = brandsData.brands || brandsData || [];
    
    // Filter brands by search term
    if (search) {
      brands = brands.filter(brand => 
        brand.name?.toLowerCase().includes(search.toLowerCase()) ||
        brand.displayName?.toLowerCase().includes(search.toLowerCase())
      );
    }

    // Pagination
    const totalPages = Math.ceil(brands.length / limit);
    const startIndex = (page - 1) * limit;
    const paginatedBrands = brands.slice(startIndex, startIndex + limit);

    return json({
      brands: paginatedBrands,
      selectedBrands: config.selectedBrands || [],
      isConfigured: true,
      pagination: {
        currentPage: page,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
        total: brands.length
      },
      search,
      allBrandsCount: brands.length
    });
  } catch (error) {
    console.error('Error loading brands:', error);
    return json({
      brands: [],
      selectedBrands: [],
      isConfigured: false,
      error: error.message,
      pagination: { currentPage: 1, totalPages: 0, hasNext: false, hasPrev: false },
      search: ''
    });
  }
}

export async function action({ request }) {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const action = formData.get('_action');

  try {
    switch (action) {
      case 'save_brands': {
        const selectedBrandsJson = formData.get('selectedBrands');
        const selectedBrands = JSON.parse(selectedBrandsJson || '[]');

        const config = await getTurn14Config(session.shop);
        await saveTurn14Config(session.shop, {
          ...config,
          selectedBrands
        });

        return json({
          success: true,
          message: `Successfully saved ${selectedBrands.length} selected brands.`
        });
      }

      case 'select_all': {
        const allBrandsJson = formData.get('allBrands');
        const allBrands = JSON.parse(allBrandsJson || '[]');
        const selectedBrands = allBrands.map(brand => ({
          id: brand.id,
          name: brand.name || brand.displayName,
          displayName: brand.displayName || brand.name
        }));

        const config = await getTurn14Config(session.shop);
        await saveTurn14Config(session.shop, {
          ...config,
          selectedBrands
        });

        return json({
          success: true,
          message: `Selected all ${selectedBrands.length} brands.`
        });
      }

      case 'clear_all': {
        const config = await getTurn14Config(session.shop);
        await saveTurn14Config(session.shop, {
          ...config,
          selectedBrands: []
        });

        return json({
          success: true,
          message: 'Cleared all selected brands.'
        });
      }

      default:
        return json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Brand action error:', error);
    return json({ 
      error: error.message,
      success: false 
    }, { status: 500 });
  }
}

export default function BrandSelection() {
  const { 
    brands, 
    selectedBrands, 
    isConfigured, 
    error, 
    pagination, 
    search: initialSearch,
    allBrandsCount 
  } = useLoaderData();
  
  const fetcher = useFetcher();
  const navigation = useNavigation();
  
  const [search, setSearch] = useState(initialSearch || '');
  const [localSelectedBrands, setLocalSelectedBrands] = useState(selectedBrands || []);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const isLoading = navigation.state === 'loading' || fetcher.state === 'submitting';

  // Update local selection when loader data changes
  useEffect(() => {
    setLocalSelectedBrands(selectedBrands || []);
    setHasUnsavedChanges(false);
  }, [selectedBrands]);

  const handleBrandToggle = useCallback((brand, isSelected) => {
    const updatedBrands = isSelected
      ? [...localSelectedBrands, {
          id: brand.id,
          name: brand.name || brand.displayName,
          displayName: brand.displayName || brand.name
        }]
      : localSelectedBrands.filter(b => b.id !== brand.id);
    
    setLocalSelectedBrands(updatedBrands);
    setHasUnsavedChanges(true);
  }, [localSelectedBrands]);

  const handleSaveBrands = useCallback(() => {
    const formData = new FormData();
    formData.append('_action', 'save_brands');
    formData.append('selectedBrands', JSON.stringify(localSelectedBrands));
    fetcher.submit(formData, { method: 'post' });
  }, [localSelectedBrands, fetcher]);

  const handleSelectAll = useCallback(() => {
    const formData = new FormData();
    formData.append('_action', 'select_all');
    formData.append('allBrands', JSON.stringify(brands));
    fetcher.submit(formData, { method: 'post' });
  }, [brands, fetcher]);

  const handleClearAll = useCallback(() => {
    const formData = new FormData();
    formData.append('_action', 'clear_all');
    fetcher.submit(formData, { method: 'post' });
  }, [fetcher]);

  const isSelected = useCallback((brandId) => {
    return localSelectedBrands.some(b => b.id === brandId);
  }, [localSelectedBrands]);

  if (error) {
    return (
      <Page title="Brand Selection">
        <Banner status="critical" title="Error Loading Brands">
          <p>{error}</p>
        </Banner>
      </Page>
    );
  }

  if (!isConfigured) {
    return (
      <Page title="Brand Selection">
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
                <p>You need to configure your Turn 14 API credentials before you can select brands.</p>
              </EmptyState>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  return (
    <Page
      title="Brand Selection"
      subtitle={`Select the brands you want to sync from Turn 14 Distribution`}
      secondaryActions={[
        {
          content: 'Configure API',
          url: '/app/turn14-config'
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
            </Banner>
          )}

          {/* Selection Summary */}
          <Card sectioned>
            <BlockStack gap="400">
              <InlineStack gap="300" align="space-between">
                <Text variant="headingMd">Selected Brands</Text>
                <InlineStack gap="200">
                  <Badge status="info">
                    {localSelectedBrands.length} of {allBrandsCount || brands.length} selected
                  </Badge>
                  {hasUnsavedChanges && (
                    <Badge status="attention">Unsaved Changes</Badge>
                  )}
                </InlineStack>
              </InlineStack>

              <InlineStack gap="300">
                <Button
                  primary
                  onClick={handleSaveBrands}
                  loading={fetcher.state === 'submitting' && fetcher.formData?.get('_action') === 'save_brands'}
                  disabled={!hasUnsavedChanges || isLoading}
                >
                  Save Selected Brands
                </Button>
                <Button
                  onClick={handleSelectAll}
                  loading={fetcher.state === 'submitting' && fetcher.formData?.get('_action') === 'select_all'}
                  disabled={isLoading}
                >
                  Select All on Page
                </Button>
                <Button
                  destructive
                  onClick={handleClearAll}
                  loading={fetcher.state === 'submitting' && fetcher.formData?.get('_action') === 'clear_all'}
                  disabled={isLoading}
                >
                  Clear All
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>

          {/* Search */}
          <Card sectioned>
            <TextField
              label="Search Brands"
              value={search}
              onChange={setSearch}
              placeholder="Search by brand name..."
              clearButton
              onClearButtonClick={() => setSearch('')}
            />
          </Card>

          {/* Brand List */}
          {brands.length === 0 ? (
            <Card sectioned>
              <EmptyState
                heading="No Brands Found"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>
                  {search 
                    ? `No brands found matching "${search}". Try a different search term.`
                    : "No brands available from Turn 14 API."
                  }
                </p>
              </EmptyState>
            </Card>
          ) : (
            <Card>
              <BlockStack gap="0">
                {brands.map((brand, index) => {
                  const brandIsSelected = isSelected(brand.id);
                  return (
                    <Box 
                      key={brand.id} 
                      padding="400" 
                      borderBlockEndWidth={index < brands.length - 1 ? "025" : "0"}
                      borderColor="border"
                    >
                      <InlineStack gap="300" align="space-between">
                        <Checkbox
                          label={
                            <BlockStack gap="100">
                              <Text variant="bodyMd" fontWeight="semibold">
                                {brand.displayName || brand.name}
                              </Text>
                              {brand.description && (
                                <Text variant="bodySm" color="subdued">
                                  {brand.description}
                                </Text>
                              )}
                              {brand.productCount && (
                                <Text variant="bodySm" color="subdued">
                                  {brand.productCount} products available
                                </Text>
                              )}
                            </BlockStack>
                          }
                          checked={brandIsSelected}
                          onChange={(checked) => handleBrandToggle(brand, checked)}
                        />
                        
                        <InlineStack gap="200">
                          {brandIsSelected && <Badge status="success">Selected</Badge>}
                          {brand.featured && <Badge>Featured</Badge>}
                        </InlineStack>
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
                  url={`/app/brands?page=${pagination.currentPage - 1}${search ? `&search=${encodeURIComponent(search)}` : ''}`}
                >
                  Previous
                </Button>
                
                <Text variant="bodyMd">
                  Page {pagination.currentPage} of {pagination.totalPages}
                </Text>
                
                <Button
                  disabled={!pagination.hasNext}
                  url={`/app/brands?page=${pagination.currentPage + 1}${search ? `&search=${encodeURIComponent(search)}` : ''}`}
                >
                  Next
                </Button>
              </InlineStack>
            </Card>
          )}
        </Layout.Section>
      </Layout>
    </Page>
  );
} 