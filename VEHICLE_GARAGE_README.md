# Vehicle Garage System

A comprehensive customer vehicle management system for Turn 14 Distribution Shopify apps that allows customers to save their vehicles and get personalized product recommendations.

## 🚗 Features

### Core Functionality
- **Multi-Vehicle Garage**: Customers can save up to 5 vehicles per garage
- **Vehicle Management**: Add, edit, remove, and set primary vehicles
- **Smart Vehicle Selection**: Cascading dropdowns for Year → Make → Model → Submodel
- **Personalized Shopping**: Products filtered by vehicle compatibility
- **Maintenance Reminders**: Automated service reminders based on time/mileage
- **Price Alerts**: Notifications when compatible products go on sale
- **Purchase History**: Track vehicle-specific purchases and recommendations

### Advanced Features
- **Turn 14 Integration**: Seamless integration with Turn 14 vehicle database
- **Compatibility Engine**: Real-time product compatibility checking
- **Customer Analytics**: Track garage usage and conversion metrics
- **Mobile Responsive**: Optimized for all device sizes
- **Accessibility**: Full keyboard navigation and screen reader support

## 📁 System Architecture

### Database Models

#### Core Models
- `CustomerVehicleGarage` - Customer garage container
- `CustomerVehicle` - Individual vehicle records
- `VehicleMaintenanceReminder` - Service reminders
- `VehiclePriceAlert` - Price monitoring
- `VehiclePurchaseHistory` - Purchase tracking
- `VehicleGarageAnalytics` - Usage analytics

#### Integration Models
- `Turn14VehicleDatabase` - Turn 14 vehicle data
- `Turn14VehicleCompatibility` - Product compatibility data
- `Turn14ImportedProduct` - Synced products with compatibility

### Services

#### VehicleGarageService
Main service class handling all garage operations:
```javascript
const garageService = new VehicleGarageService(shop);

// Garage Management
await garageService.getOrCreateGarage(customerId);
await garageService.getGarageWithDetails(customerId);

// Vehicle Management
await garageService.addVehicle(customerId, vehicleData);
await garageService.updateVehicle(customerId, vehicleId, updateData);
await garageService.removeVehicle(customerId, vehicleId);

// Product Compatibility
await garageService.getCompatibleProducts(vehicleId, options);
await garageService.checkProductCompatibility(vehicleId, turn14Sku);

// Maintenance & Alerts
await garageService.getUpcomingReminders(customerId);
await garageService.createPriceAlert(customerId, vehicleId, alertData);
```

## 🛠️ Implementation Guide

### 1. Database Setup

The database schema has been automatically updated with the Vehicle Garage models. Run the migration:

```bash
npx prisma db push
```

### 2. Admin Interface

The admin interface is available at `/app/garage` and includes:

- **Overview Tab**: Garage statistics and quick vehicle overview
- **My Vehicles Tab**: Full vehicle management with add/edit/remove
- **Maintenance Tab**: Service reminders and completion tracking
- **Price Alerts Tab**: Product price monitoring setup

### 3. Customer Widget Integration

#### Basic Implementation

Add the Vehicle Garage widget to your Shopify theme:

```html
<!-- In your theme's product or collection template -->
<div id="vehicle-garage-widget"></div>

<script type="module">
  import { VehicleGarageWidget } from '/apps/turn14-garage/widget.js';
  
  // Initialize the widget
  const widget = new VehicleGarageWidget({
    customerId: '{{ customer.id }}',
    shopDomain: '{{ shop.domain }}',
    apiEndpoint: '/api',
    onVehicleSelect: (vehicle) => {
      console.log('Selected vehicle:', vehicle);
      // Update product compatibility badges
      updateProductCompatibility(vehicle);
    }
  });
  
  // Mount the widget
  widget.mount('#vehicle-garage-widget');
</script>
```

#### Advanced Integration

For product pages with compatibility checking:

```html
<!-- Product page integration -->
<div id="vehicle-garage-compact"></div>
<div id="compatibility-info"></div>

<script type="module">
  import { 
    VehicleGarageWidget, 
    CompatibilityBadge,
    useProductCompatibility 
  } from '/apps/turn14-garage/widget.js';
  
  const widget = new VehicleGarageWidget({
    customerId: '{{ customer.id }}',
    shopDomain: '{{ shop.domain }}',
    compact: true,
    onVehicleSelect: async (vehicle) => {
      if (vehicle) {
        // Check compatibility for current product
        const compatibility = await checkProductCompatibility(
          vehicle.id, 
          '{{ product.metafields.turn14.sku }}'
        );
        
        // Show compatibility badge
        showCompatibilityBadge(compatibility);
      }
    }
  });
  
  widget.mount('#vehicle-garage-compact');
</script>
```

### 4. API Endpoints

#### Customer-Facing APIs (No Auth Required)

```javascript
// Get customer garage
GET /api/garage/{customerId}?shop={shop}

// Add vehicle
POST /api/garage/{customerId}
{
  "shop": "shop-domain.myshopify.com",
  "actionType": "addVehicle",
  "year": 2020,
  "make": "Ford",
  "model": "F-150",
  "submodel": "SuperCrew",
  "nickname": "My Truck"
}

// Vehicle data endpoints
GET /api/vehicles/makes?year=2020&shop={shop}
GET /api/vehicles/models?year=2020&make=Ford&shop={shop}
GET /api/vehicles/submodels?year=2020&make=Ford&model=F-150&shop={shop}
```

#### Admin APIs (Auth Required)

```javascript
// Admin garage management
GET /app/api/vehicles/makes?year=2020
GET /app/api/vehicles/{vehicleId}/products?category=performance
```

## 🎨 Customization

### Widget Styling

The widget uses CSS custom properties for easy theming:

```css
.vehicle-garage-widget {
  --primary-color: #008060;
  --border-color: #e1e3e5;
  --text-color: #202223;
  --background-color: #ffffff;
  --border-radius: 8px;
}

/* Custom theme example */
.vehicle-garage-widget.dark-theme {
  --primary-color: #00d4aa;
  --border-color: #404040;
  --text-color: #ffffff;
  --background-color: #1a1a1a;
}
```

### Compatibility Badge Customization

```css
.compatibility-badge.compatible {
  background: var(--success-bg, #d1fae5);
  color: var(--success-text, #065f46);
}

.compatibility-badge.not-compatible {
  background: var(--warning-bg, #fef3c7);
  color: var(--warning-text, #92400e);
}
```

## 📊 Analytics & Reporting

### Dashboard Metrics

The admin dashboard shows:
- Total customer vehicles
- Active garage users
- Maintenance reminders due
- Price alerts triggered
- Conversion rates for garage users

### Custom Analytics

Track additional metrics:

```javascript
// Track garage engagement
await garageService.updateAnalytics();

// Get detailed stats
const stats = await garageService.getGarageStats();
console.log('Garage Statistics:', stats);
```

## 🔧 Maintenance Features

### Automated Reminders

Default maintenance reminders are created for each vehicle:

- **Oil Change**: Every 5,000 miles or 6 months
- **Tire Rotation**: Every 7,500 miles
- **Brake Inspection**: Every 12 months

### Custom Reminders

Add custom maintenance reminders:

```javascript
await db.vehicleMaintenanceReminder.create({
  data: {
    shop: shop,
    vehicleId: vehicleId,
    type: 'custom',
    title: 'Air Filter Replacement',
    description: 'Replace engine air filter',
    intervalType: 'mileage',
    intervalMileage: 15000
  }
});
```

## 💰 Price Alert System

### Automatic Monitoring

Price alerts check for:
- Price drops below target price
- Back in stock notifications
- New compatible products

### Email Integration

Configure email notifications:

```javascript
// Enable email notifications for price alerts
const alert = await garageService.createPriceAlert(customerId, vehicleId, {
  turn14Sku: 'PRODUCT-SKU',
  productTitle: 'Performance Air Filter',
  currentPrice: 49.99,
  targetPrice: 39.99,
  alertType: 'price_drop',
  emailNotifications: true
});
```

## 🚀 Performance Optimization

### Caching Strategy

- Vehicle database queries are cached for 24 hours
- Compatibility checks are cached per product/vehicle pair
- Garage data is cached for 5 minutes

### Database Indexing

Key indexes for performance:
- `CustomerVehicleGarage`: `shop + customerId`
- `CustomerVehicle`: `shop + garageId`, `shop + year + make + model`
- `Turn14VehicleCompatibility`: `shop + productId`, `shop + year + make + model`

## 🔒 Security Considerations

### Customer Data Protection

- Customer vehicle data is isolated by shop
- No cross-shop data access
- Secure API endpoints with proper validation

### Privacy Compliance

- Vehicle data can be exported/deleted per GDPR requirements
- Customer consent tracking for email notifications
- Data retention policies configurable

## 📱 Mobile Experience

### Responsive Design

The widget is fully responsive with:
- Touch-friendly interface
- Optimized modal dialogs
- Swipe gestures for vehicle selection
- Progressive enhancement

### Performance

- Lazy loading of vehicle data
- Optimized API calls
- Minimal JavaScript footprint
- CSS-only animations

## 🧪 Testing

### Unit Tests

Test the garage service:

```javascript
import { VehicleGarageService } from './vehicle-garage.server';

describe('VehicleGarageService', () => {
  test('should create garage for new customer', async () => {
    const service = new VehicleGarageService('test-shop');
    const garage = await service.getOrCreateGarage('customer-123');
    expect(garage.customerId).toBe('customer-123');
  });
});
```

### Integration Tests

Test the complete flow:

```javascript
test('customer can add vehicle and get compatible products', async () => {
  // Add vehicle
  const vehicle = await garageService.addVehicle('customer-123', {
    year: 2020,
    make: 'Ford',
    model: 'F-150'
  });
  
  // Get compatible products
  const products = await garageService.getCompatibleProducts(vehicle.id);
  expect(products.length).toBeGreaterThan(0);
});
```

## 🚀 Deployment

### Production Checklist

- [ ] Database migrations applied
- [ ] Environment variables configured
- [ ] Email service configured for notifications
- [ ] Analytics tracking enabled
- [ ] Performance monitoring setup
- [ ] Error logging configured

### Monitoring

Key metrics to monitor:
- Garage creation rate
- Vehicle addition success rate
- API response times
- Error rates
- Customer engagement metrics

## 📞 Support

### Common Issues

**Widget not loading**: Check API endpoints and customer authentication
**Vehicle data missing**: Verify Turn 14 database sync is running
**Compatibility not working**: Check product YMM data import

### Debug Mode

Enable debug logging:

```javascript
const garageService = new VehicleGarageService(shop, { debug: true });
```

## 🔄 Future Enhancements

### Planned Features

- **AI Recommendations**: Machine learning-based product suggestions
- **Social Features**: Share garage with friends/family
- **Maintenance Tracking**: Photo uploads and service history
- **Integration APIs**: Connect with external maintenance apps
- **Advanced Analytics**: Predictive maintenance recommendations

### API Roadmap

- GraphQL API for advanced queries
- Webhook support for real-time updates
- Bulk operations for fleet management
- Third-party integrations (CarFax, AutoZone, etc.)

---

## 📄 License

This Vehicle Garage system is part of the Turn 14 Distribution Shopify app and follows the same licensing terms.

## 🤝 Contributing

For feature requests or bug reports, please contact the development team or create an issue in the project repository. 