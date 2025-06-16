// Enhanced Turn 14 API Service with proper authentication and configuration

// app/services/turn14-api.server.js
import axios from 'axios';
import { db } from '../db.server.js';

// Turn 14 API Base Configuration
const TURN14_API_BASE_URL = 'https://api.turn14.com/v1';
const TURN14_SANDBOX_URL = 'https://sandbox-api.turn14.com/v1';

// Helper functions for JSON field handling (SQLite compatibility)
function serializeJsonField(data) {
  if (!data) return null;
  try {
    return JSON.stringify(data);
  } catch (error) {
    console.error('Failed to serialize JSON field:', error);
    return null;
  }
}

function deserializeJsonField(jsonString) {
  if (!jsonString) return null;
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    console.error('Failed to deserialize JSON field:', error);
    return null;
  }
}

// API Error Classes
export class Turn14APIError extends Error {
  constructor(message, statusCode, response) {
    super(message);
    this.name = 'Turn14APIError';
    this.statusCode = statusCode;
    this.response = response;
  }
}

export class Turn14AuthError extends Turn14APIError {
  constructor(message) {
    super(message, 401);
    this.name = 'Turn14AuthError';
  }
}

export class Turn14ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'Turn14ConfigError';
  }
}

// Get Turn 14 Configuration for a shop
export async function getTurn14Config(shop) {
  try {
    const config = await db.turn14Config.findUnique({
      where: { shop }
    });
    
    if (!config) {
      throw new Turn14ConfigError(`No Turn 14 configuration found for shop: ${shop}`);
    }
    
    if (!config.isActive) {
      throw new Turn14ConfigError(`Turn 14 configuration is disabled for shop: ${shop}`);
    }
    
    // Deserialize JSON fields
    return {
      ...config,
      selectedBrands: deserializeJsonField(config.selectedBrands) || [],
      syncSettings: deserializeJsonField(config.syncSettings) || {}
    };
  } catch (error) {
    if (error instanceof Turn14ConfigError) {
      throw error;
    }
    throw new Turn14ConfigError(`Failed to retrieve Turn 14 configuration: ${error.message}`);
  }
}

// Save or update Turn 14 Configuration
export async function saveTurn14Config(shop, configData) {
  try {
    // Prepare data with serialized JSON fields
    const dataToSave = {
      ...configData,
      selectedBrands: configData.selectedBrands 
        ? serializeJsonField(configData.selectedBrands) 
        : null,
      syncSettings: configData.syncSettings 
        ? serializeJsonField(configData.syncSettings) 
        : null,
      updatedAt: new Date()
    };

    const config = await db.turn14Config.upsert({
      where: { shop },
      update: dataToSave,
      create: {
        shop,
        ...dataToSave
      }
    });
    
    // Return config with deserialized JSON fields
    return {
      ...config,
      selectedBrands: deserializeJsonField(config.selectedBrands) || [],
      syncSettings: deserializeJsonField(config.syncSettings) || {}
    };
  } catch (error) {
    throw new Turn14ConfigError(`Failed to save Turn 14 configuration: ${error.message}`);
  }
}

// Create authenticated axios instance
function createTurn14Client(config) {
  const baseURL = config.environment === 'sandbox' ? TURN14_SANDBOX_URL : TURN14_API_BASE_URL;
  
  const client = axios.create({
    baseURL,
    timeout: 30000,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'Shopify-Turn14-App/1.0'
    }
  });

  // Add authentication interceptor
  client.interceptors.request.use((config) => {
    if (config.apiKey) {
      config.headers.Authorization = `Bearer ${config.apiKey}`;
    }
    return config;
  });

  // Add response interceptor for error handling
  client.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error.response?.status === 401) {
        throw new Turn14AuthError('Invalid Turn 14 API credentials');
      }
      
      const message = error.response?.data?.message || error.message || 'Unknown API error';
      throw new Turn14APIError(
        `Turn 14 API Error: ${message}`,
        error.response?.status || 500,
        error.response?.data
      );
    }
  );

  return client;
}

// Validate API credentials
export async function validateTurn14Credentials(shop, apiKey, apiSecret, environment = 'production') {
  try {
    const config = { apiKey, apiSecret, environment };
    const client = createTurn14Client(config);
    
    // Test the credentials with a simple API call
    const response = await client.get('/account', { apiKey });
    
    // Update validation status in database
    await saveTurn14Config(shop, {
      apiKey,
      apiSecret,
      environment,
      lastValidated: new Date(),
      validationError: null,
      isActive: true
    });
    
    return {
      isValid: true,
      accountInfo: response.data,
      message: 'Credentials validated successfully'
    };
  } catch (error) {
    // Save validation error
    await saveTurn14Config(shop, {
      apiKey,
      apiSecret,
      environment,
      lastValidated: new Date(),
      validationError: error.message,
      isActive: false
    });
    
    return {
      isValid: false,
      error: error.message,
      message: 'Credential validation failed'
    };
  }
}

// Fetch account information
export async function fetchAccountInfo(shop) {
  const config = await getTurn14Config(shop);
  const client = createTurn14Client(config);
  
  try {
    const response = await client.get('/account', { apiKey: config.apiKey });
    return response.data;
  } catch (error) {
    throw new Turn14APIError(`Failed to fetch account info: ${error.message}`);
  }
}

// Fetch available brands
export async function fetchTurn14Brands(shop) {
  const config = await getTurn14Config(shop);
  const client = createTurn14Client(config);
  
  try {
    const response = await client.get('/brands', { apiKey: config.apiKey });
    return response.data;
  } catch (error) {
    throw new Turn14APIError(`Failed to fetch brands: ${error.message}`);
  }
}

// Fetch available categories
export async function fetchTurn14Categories(shop) {
  const config = await getTurn14Config(shop);
  const client = createTurn14Client(config);
  
  try {
    const response = await client.get('/categories', { apiKey: config.apiKey });
    return response.data;
  } catch (error) {
    throw new Turn14APIError(`Failed to fetch categories: ${error.message}`);
  }
}

// Fetch inventory with advanced filtering
export async function fetchTurn14Inventory(shop, options = {}) {
  const config = await getTurn14Config(shop);
  const client = createTurn14Client(config);
  
  const {
    page = 1,
    limit = 100,
    brands = [],
    categories = [],
    search = '',
    priceMin = null,
    priceMax = null,
    inStock = null,
    carb = null,
    prop65 = null
  } = options;

  try {
    const params = {
      page,
      limit,
      ...(brands.length && { brands: brands.join(',') }),
      ...(categories.length && { categories: categories.join(',') }),
      ...(search && { search }),
      ...(priceMin && { price_min: priceMin }),
      ...(priceMax && { price_max: priceMax }),
      ...(inStock !== null && { in_stock: inStock }),
      ...(carb !== null && { carb_compliant: carb }),
      ...(prop65 !== null && { prop65_warning: prop65 })
    };

    const response = await client.get('/inventory', { 
      apiKey: config.apiKey,
      params 
    });

    return {
      products: response.data.products || [],
      total: response.data.total || 0,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil((response.data.total || 0) / limit),
        limit,
        hasNextPage: page < Math.ceil((response.data.total || 0) / limit),
        hasPrevPage: page > 1
      }
    };
  } catch (error) {
    throw new Turn14APIError(`Failed to fetch inventory: ${error.message}`);
  }
}

// Fetch product details by SKU
export async function fetchTurn14Product(shop, sku) {
  const config = await getTurn14Config(shop);
  const client = createTurn14Client(config);
  
  try {
    const response = await client.get(`/products/${sku}`, { apiKey: config.apiKey });
    return response.data;
  } catch (error) {
    throw new Turn14APIError(`Failed to fetch product ${sku}: ${error.message}`);
  }
}

// Fetch pricing information
export async function fetchTurn14Pricing(shop, skus = []) {
  const config = await getTurn14Config(shop);
  const client = createTurn14Client(config);
  
  try {
    const response = await client.post('/pricing', {
      skus: Array.isArray(skus) ? skus : [skus]
    }, { apiKey: config.apiKey });
    
    return response.data;
  } catch (error) {
    throw new Turn14APIError(`Failed to fetch pricing: ${error.message}`);
  }
}

// Fetch real-time inventory levels
export async function fetchTurn14Stock(shop, skus = []) {
  const config = await getTurn14Config(shop);
  const client = createTurn14Client(config);
  
  try {
    const response = await client.post('/inventory/stock', {
      skus: Array.isArray(skus) ? skus : [skus]
    }, { apiKey: config.apiKey });
    
    return response.data;
  } catch (error) {
    throw new Turn14APIError(`Failed to fetch stock levels: ${error.message}`);
  }
}

// Submit order to Turn 14
export async function submitTurn14Order(shop, orderData) {
  const config = await getTurn14Config(shop);
  const client = createTurn14Client(config);
  
  try {
    const response = await client.post('/orders', orderData, { apiKey: config.apiKey });
    return response.data;
  } catch (error) {
    throw new Turn14APIError(`Failed to submit order: ${error.message}`);
  }
}

// Get shipping rates
export async function fetchTurn14ShippingRates(shop, rateRequest) {
  const config = await getTurn14Config(shop);
  const client = createTurn14Client(config);
  
  try {
    const response = await client.post('/shipping/rates', rateRequest, { apiKey: config.apiKey });
    return response.data;
  } catch (error) {
    throw new Turn14APIError(`Failed to fetch shipping rates: ${error.message}`);
  }
}

// Transform Turn 14 product for Shopify
export function transformProductForShopify(turn14Product, config = {}) {
  const {
    priceMarkup = 0,
    defaultWeight = 1,
    defaultWeightUnit = 'lb'
  } = config;

  // Calculate price with markup
  const basePrice = parseFloat(turn14Product.price || 0);
  const finalPrice = priceMarkup > 0 ? basePrice * (1 + priceMarkup / 100) : basePrice;

  // Generate product handle
  const productName = turn14Product.name || turn14Product.title || 'Untitled Product';
  const handle = productName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 100);

  // Clean description
  const cleanDescription = turn14Product.description 
    ? turn14Product.description.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').trim()
    : 'No description available';

  return {
    title: productName,
    handle: handle,
    body_html: cleanDescription,
    vendor: turn14Product.manufacturer || turn14Product.brand || 'Turn 14',
    product_type: turn14Product.category || 'Auto Parts',
    tags: [
      'Turn14',
      turn14Product.manufacturer,
      turn14Product.category,
      ...(turn14Product.carbCompliant ? ['CARB Compliant'] : []),
      ...(turn14Product.prop65Warning ? ['Prop 65 Warning'] : [])
    ].filter(Boolean).join(','),
    status: 'draft', // Import as draft by default
    variants: [{
      price: finalPrice.toFixed(2),
      sku: turn14Product.sku,
      inventory_quantity: turn14Product.stock || 0,
      inventory_management: 'shopify',
      weight: turn14Product.weight || defaultWeight,
      weight_unit: turn14Product.weightUnit || defaultWeightUnit,
      barcode: turn14Product.upc || turn14Product.barcode || null,
      requires_shipping: true
    }],
    images: turn14Product.images ? turn14Product.images.map(img => ({ 
      src: img.url || img,
      alt: productName
    })) : [],
    metafields: [
      {
        namespace: 'turn14',
        key: 'sku',
        value: turn14Product.sku,
        type: 'single_line_text_field'
      },
      {
        namespace: 'turn14',
        key: 'manufacturer',
        value: turn14Product.manufacturer || turn14Product.brand || '',
        type: 'single_line_text_field'
      },
      {
        namespace: 'turn14',
        key: 'original_price',
        value: turn14Product.price.toString(),
        type: 'single_line_text_field'
      },
      {
        namespace: 'turn14',
        key: 'carb_compliant',
        value: turn14Product.carbCompliant ? 'true' : 'false',
        type: 'single_line_text_field'
      },
      {
        namespace: 'turn14',
        key: 'prop65_warning',
        value: turn14Product.prop65Warning ? 'true' : 'false',
        type: 'single_line_text_field'
      },
      ...(turn14Product.fitments ? [{
        namespace: 'turn14',
        key: 'fitments',
        value: JSON.stringify(turn14Product.fitments),
        type: 'json_string'
      }] : [])
    ]
  };
}

// YMM (Year/Make/Model) Related Functions

// Fetch vehicle compatibility for a product
export async function fetchTurn14Compatibility(shop, sku) {
  const config = await getTurn14Config(shop);
  const client = createTurn14Client(config);
  
  try {
    const response = await client.get(`/products/${sku}/compatibility`, { apiKey: config.apiKey });
    return response.data;
  } catch (error) {
    throw new Turn14APIError(`Failed to fetch compatibility for ${sku}: ${error.message}`);
  }
}

// Fetch all vehicles from Turn 14 database
export async function fetchTurn14Vehicles(shop, params = {}) {
  const config = await getTurn14Config(shop);
  const client = createTurn14Client(config);
  
  try {
    const queryParams = {
      page: params.page || 1,
      limit: params.limit || 1000,
      ...(params.year && { year: params.year }),
      ...(params.make && { make: params.make }),
      ...(params.model && { model: params.model })
    };

    const response = await client.get('/vehicles', { 
      apiKey: config.apiKey,
      params: queryParams 
    });
    
    return {
      vehicles: response.data.vehicles || [],
      total: response.data.total || 0,
      pagination: {
        currentPage: queryParams.page,
        totalPages: Math.ceil((response.data.total || 0) / queryParams.limit),
        limit: queryParams.limit
      }
    };
  } catch (error) {
    throw new Turn14APIError(`Failed to fetch vehicles: ${error.message}`);
  }
}

// Fetch makes for a specific year
export async function fetchTurn14Makes(shop, year) {
  const config = await getTurn14Config(shop);
  const client = createTurn14Client(config);
  
  try {
    const response = await client.get(`/vehicles/makes`, { 
      apiKey: config.apiKey,
      params: { year }
    });
    return response.data.makes || [];
  } catch (error) {
    throw new Turn14APIError(`Failed to fetch makes for year ${year}: ${error.message}`);
  }
}

// Fetch models for a specific year and make
export async function fetchTurn14Models(shop, year, make) {
  const config = await getTurn14Config(shop);
  const client = createTurn14Client(config);
  
  try {
    const response = await client.get(`/vehicles/models`, { 
      apiKey: config.apiKey,
      params: { year, make }
    });
    return response.data.models || [];
  } catch (error) {
    throw new Turn14APIError(`Failed to fetch models for ${year} ${make}: ${error.message}`);
  }
}

// Search products by vehicle compatibility
export async function searchTurn14ProductsByVehicle(shop, vehicleParams = {}) {
  const config = await getTurn14Config(shop);
  const client = createTurn14Client(config);
  
  try {
    const params = {
      page: vehicleParams.page || 1,
      limit: vehicleParams.limit || 50,
      ...(vehicleParams.year && { year: vehicleParams.year }),
      ...(vehicleParams.make && { make: vehicleParams.make }),
      ...(vehicleParams.model && { model: vehicleParams.model }),
      ...(vehicleParams.submodel && { submodel: vehicleParams.submodel }),
      ...(vehicleParams.category && { category: vehicleParams.category }),
      ...(vehicleParams.brand && { brand: vehicleParams.brand })
    };

    const response = await client.get('/products/search/vehicle', { 
      apiKey: config.apiKey,
      params 
    });

    return {
      products: response.data.products || [],
      total: response.data.total || 0,
      pagination: {
        currentPage: params.page,
        totalPages: Math.ceil((response.data.total || 0) / params.limit),
        limit: params.limit,
        hasNextPage: params.page < Math.ceil((response.data.total || 0) / params.limit),
        hasPrevPage: params.page > 1
      }
    };
  } catch (error) {
    throw new Turn14APIError(`Failed to search products by vehicle: ${error.message}`);
  }
}
