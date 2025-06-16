# Production Deployment Guide - Turn 14 Distribution Integration

## Overview

This guide covers the complete deployment process for the Turn 14 Distribution Integration app, from development to production and Shopify App Store submission.

## Pre-Deployment Checklist

### 1. Environment Setup
- [ ] **Production Domain**: Secure production domain (e.g., turn14-distribution-app.com)
- [ ] **SSL Certificate**: Valid SSL certificate installed
- [ ] **DNS Configuration**: Proper DNS records configured
- [ ] **CDN Setup**: Content delivery network for static assets
- [ ] **Monitoring**: Application monitoring and alerting setup

### 2. Database Preparation
- [ ] **Production Database**: PostgreSQL production instance
- [ ] **Database Migrations**: All migrations tested and ready
- [ ] **Backup Strategy**: Automated backup system configured
- [ ] **Connection Pooling**: Database connection pooling setup
- [ ] **Performance Tuning**: Database indexes and optimization

### 3. Environment Variables
```bash
# Production Environment Variables
NODE_ENV=production
DATABASE_URL=postgresql://user:password@host:port/database
SHOPIFY_API_KEY=your_production_api_key
SHOPIFY_API_SECRET=your_production_api_secret
SHOPIFY_SCOPES=write_products,read_products,write_inventory,read_inventory,read_orders,write_orders,read_customers,write_customers,read_analytics,write_price_rules,read_price_rules,write_discounts,read_discounts,write_themes,read_themes,write_script_tags,read_script_tags
SHOPIFY_APP_URL=https://turn14-distribution-app.com
TURN14_API_URL=https://api.turn14distribution.com
TURN14_API_KEY=your_turn14_api_key
TURN14_API_SECRET=your_turn14_api_secret
SESSION_SECRET=your_secure_session_secret
ENCRYPTION_KEY=your_encryption_key
REDIS_URL=redis://your-redis-instance
EMAIL_SERVICE_API_KEY=your_email_service_key
MONITORING_API_KEY=your_monitoring_key
```

## Deployment Platforms

### Option 1: Railway (Recommended for Shopify Apps)

#### 1. Railway Setup
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login to Railway
railway login

# Create new project
railway init

# Link to existing project
railway link
```

#### 2. Railway Configuration
Create `railway.toml`:
```toml
[build]
builder = "nixpacks"
buildCommand = "npm run build"

[deploy]
startCommand = "npm start"
healthcheckPath = "/health"
healthcheckTimeout = 300
restartPolicyType = "on-failure"

[environments.production]
variables = { NODE_ENV = "production" }
```

#### 3. Database Setup on Railway
```bash
# Add PostgreSQL service
railway add postgresql

# Add Redis service
railway add redis

# Deploy
railway up
```

### Option 2: Heroku

#### 1. Heroku Setup
```bash
# Install Heroku CLI
# Create Heroku app
heroku create turn14-distribution-app

# Add PostgreSQL
heroku addons:create heroku-postgresql:standard-0

# Add Redis
heroku addons:create heroku-redis:premium-0

# Set environment variables
heroku config:set NODE_ENV=production
heroku config:set SHOPIFY_API_KEY=your_key
# ... other environment variables
```

#### 2. Heroku Configuration
Create `Procfile`:
```
web: npm start
worker: npm run worker
release: npx prisma migrate deploy
```

### Option 3: AWS/DigitalOcean/Google Cloud

#### 1. Container Deployment
Create `Dockerfile`:
```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build application
RUN npm run build

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start application
CMD ["npm", "start"]
```

#### 2. Docker Compose for Development
Create `docker-compose.yml`:
```yaml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://postgres:password@db:5432/turn14app
      - REDIS_URL=redis://redis:6379
    depends_on:
      - db
      - redis

  db:
    image: postgres:15
    environment:
      POSTGRES_DB: turn14app
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

## Database Migration and Setup

### 1. Production Database Migration
```bash
# Set production database URL
export DATABASE_URL="postgresql://user:password@host:port/database"

# Run migrations
npx prisma migrate deploy

# Generate Prisma client
npx prisma generate

# Seed initial data (if needed)
npx prisma db seed
```

### 2. Database Backup Strategy
```bash
# Create backup script
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
pg_dump $DATABASE_URL > backup_$DATE.sql
aws s3 cp backup_$DATE.sql s3://your-backup-bucket/
```

## Performance Optimization

### 1. Application Optimization
```javascript
// Add compression middleware
import compression from 'compression';
app.use(compression());

// Add caching headers
app.use((req, res, next) => {
  if (req.url.match(/\.(css|js|png|jpg|jpeg|gif|ico|svg)$/)) {
    res.setHeader('Cache-Control', 'public, max-age=31536000');
  }
  next();
});

// Add rate limiting
import rateLimit from 'express-rate-limit';
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);
```

### 2. Database Optimization
```sql
-- Add indexes for common queries
CREATE INDEX idx_customer_garage_customer_id ON "CustomerVehicleGarage"("customerId");
CREATE INDEX idx_customer_garage_shop_domain ON "CustomerVehicleGarage"("shopDomain");
CREATE INDEX idx_vehicle_garage_id ON "CustomerVehicle"("garageId");
CREATE INDEX idx_maintenance_reminder_garage_id ON "VehicleMaintenanceReminder"("garageId");
CREATE INDEX idx_price_alert_garage_id ON "VehiclePriceAlert"("garageId");
CREATE INDEX idx_purchase_history_garage_id ON "VehiclePurchaseHistory"("garageId");

-- Add composite indexes
CREATE INDEX idx_garage_customer_shop ON "CustomerVehicleGarage"("customerId", "shopDomain");
CREATE INDEX idx_vehicle_year_make_model ON "CustomerVehicle"("year", "make", "model");
```

## Monitoring and Logging

### 1. Application Monitoring
```javascript
// Add health check endpoint
app.get('/health', async (req, res) => {
  try {
    // Check database connection
    await prisma.$queryRaw`SELECT 1`;
    
    // Check Redis connection
    await redis.ping();
    
    // Check Turn 14 API
    const turn14Status = await checkTurn14API();
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: 'connected',
        redis: 'connected',
        turn14: turn14Status ? 'connected' : 'disconnected'
      }
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});
```

### 2. Error Tracking
```javascript
// Add error tracking (e.g., Sentry)
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
});

// Error handling middleware
app.use(Sentry.Handlers.errorHandler());
```

### 3. Logging Setup
```javascript
// Add structured logging
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});
```

## Security Hardening

### 1. Security Headers
```javascript
import helmet from 'helmet';

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.shopify.com"],
      scriptSrc: ["'self'", "https://cdn.shopify.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.turn14distribution.com"]
    }
  }
}));
```

### 2. Input Validation
```javascript
import joi from 'joi';

const validateVehicle = (req, res, next) => {
  const schema = joi.object({
    year: joi.number().integer().min(1900).max(new Date().getFullYear() + 1),
    make: joi.string().max(50).required(),
    model: joi.string().max(100).required(),
    submodel: joi.string().max(100).optional()
  });

  const { error } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }
  next();
};
```

## Testing in Production

### 1. Smoke Tests
```bash
#!/bin/bash
# Production smoke tests

echo "Testing app health..."
curl -f https://turn14-distribution-app.com/health || exit 1

echo "Testing authentication..."
curl -f https://turn14-distribution-app.com/api/auth || exit 1

echo "Testing API endpoints..."
curl -f https://turn14-distribution-app.com/api/vehicles/makes || exit 1

echo "All smoke tests passed!"
```

### 2. Load Testing
```javascript
// Using Artillery for load testing
// artillery.yml
config:
  target: 'https://turn14-distribution-app.com'
  phases:
    - duration: 60
      arrivalRate: 10
    - duration: 120
      arrivalRate: 20
  payload:
    path: "test-data.csv"
    fields:
      - "customerId"
      - "shopDomain"

scenarios:
  - name: "Vehicle Garage Operations"
    weight: 70
    flow:
      - get:
          url: "/api/garage/{{ customerId }}"
      - post:
          url: "/api/garage/{{ customerId }}/vehicles"
          json:
            year: 2020
            make: "Ford"
            model: "F-150"

  - name: "Product Sync"
    weight: 30
    flow:
      - get:
          url: "/api/sync/status"
      - post:
          url: "/api/sync/trigger"
```

## Shopify App Store Configuration

### 1. Partner Dashboard Setup
```bash
# Update shopify.app.toml for production
[build]
automatically_update_urls_on_dev = false
include_config_on_deploy = true

[access_scopes]
scopes = "write_products,read_products,write_inventory,read_inventory,read_orders,write_orders,read_customers,write_customers,read_analytics,write_price_rules,read_price_rules,write_discounts,read_discounts,write_themes,read_themes,write_script_tags,read_script_tags"

[auth]
redirect_urls = [
  "https://turn14-distribution-app.com/api/auth",
  "https://turn14-distribution-app.com/auth/callback"
]

[webhooks]
api_version = "2024-10"

[[webhooks.subscriptions]]
topics = ["app/uninstalled"]
uri = "/webhooks/app/uninstalled"

[[webhooks.subscriptions]]
topics = ["customers/data_request"]
uri = "/webhooks/customers/data_request"

[[webhooks.subscriptions]]
topics = ["customers/redact"]
uri = "/webhooks/customers/redact"

[[webhooks.subscriptions]]
topics = ["shop/redact"]
uri = "/webhooks/shop/redact"

[[webhooks.subscriptions]]
topics = ["orders/create"]
uri = "/webhooks/orders/create"

[[webhooks.subscriptions]]
topics = ["orders/updated"]
uri = "/webhooks/orders/updated"
```

### 2. App Billing Setup
```javascript
// Add billing configuration
export const BILLING_PLANS = {
  starter: {
    name: 'Starter',
    price: 29.00,
    interval: 'EVERY_30_DAYS',
    features: {
      maxProducts: 1000,
      syncFrequency: 'daily',
      vehicleGarageCustomers: 50,
      support: 'email'
    }
  },
  professional: {
    name: 'Professional',
    price: 99.00,
    interval: 'EVERY_30_DAYS',
    features: {
      maxProducts: 10000,
      syncFrequency: 'hourly',
      vehicleGarageCustomers: 500,
      support: 'priority'
    }
  },
  enterprise: {
    name: 'Enterprise',
    price: 299.00,
    interval: 'EVERY_30_DAYS',
    features: {
      maxProducts: -1, // unlimited
      syncFrequency: 'realtime',
      vehicleGarageCustomers: -1, // unlimited
      support: 'dedicated'
    }
  }
};
```

## Post-Deployment Checklist

### 1. Immediate Post-Deployment
- [ ] **Health Check**: Verify app is responding
- [ ] **Database**: Confirm database connectivity
- [ ] **Authentication**: Test Shopify OAuth flow
- [ ] **Webhooks**: Verify webhook endpoints
- [ ] **API Integration**: Test Turn 14 API connectivity
- [ ] **Error Monitoring**: Confirm error tracking is working

### 2. 24-Hour Monitoring
- [ ] **Performance**: Monitor response times
- [ ] **Error Rate**: Check for any errors
- [ ] **Memory Usage**: Monitor memory consumption
- [ ] **Database Performance**: Check query performance
- [ ] **User Activity**: Monitor user interactions

### 3. Week 1 Monitoring
- [ ] **Feature Usage**: Track feature adoption
- [ ] **Performance Trends**: Analyze performance over time
- [ ] **User Feedback**: Collect and analyze user feedback
- [ ] **Support Tickets**: Monitor support requests
- [ ] **Billing**: Verify billing system is working

## Rollback Plan

### 1. Automated Rollback
```bash
#!/bin/bash
# Rollback script

echo "Starting rollback process..."

# Stop current deployment
docker stop turn14-app

# Restore previous version
docker run -d --name turn14-app-rollback turn14-app:previous

# Restore database if needed
# pg_restore -d $DATABASE_URL backup_previous.sql

echo "Rollback completed"
```

### 2. Manual Rollback Steps
1. **Identify Issue**: Determine the cause of the problem
2. **Stop Traffic**: Redirect traffic to maintenance page
3. **Restore Code**: Deploy previous working version
4. **Restore Database**: Restore database from backup if needed
5. **Verify Functionality**: Test critical features
6. **Resume Traffic**: Remove maintenance page
7. **Post-Mortem**: Analyze what went wrong

## Maintenance and Updates

### 1. Regular Maintenance Tasks
- **Weekly**: Review error logs and performance metrics
- **Monthly**: Update dependencies and security patches
- **Quarterly**: Performance optimization and capacity planning
- **Annually**: Security audit and compliance review

### 2. Update Process
1. **Development**: Implement changes in development environment
2. **Testing**: Comprehensive testing including regression tests
3. **Staging**: Deploy to staging environment for final testing
4. **Production**: Deploy to production during low-traffic hours
5. **Monitoring**: Monitor for issues post-deployment
6. **Rollback**: Be prepared to rollback if issues arise

## Success Metrics

### 1. Technical Metrics
- **Uptime**: Target 99.9% availability
- **Response Time**: < 2 seconds for API calls
- **Error Rate**: < 1% error rate
- **Database Performance**: Query times < 100ms

### 2. Business Metrics
- **App Store Rating**: Maintain 4.5+ stars
- **Installation Rate**: Track daily/weekly installs
- **Conversion Rate**: Trial to paid conversion
- **Customer Satisfaction**: Support ticket resolution time

---

## Final Production Checklist

- [ ] Production environment configured
- [ ] Database migrations completed
- [ ] SSL certificate installed
- [ ] Monitoring and alerting setup
- [ ] Error tracking configured
- [ ] Backup strategy implemented
- [ ] Security hardening completed
- [ ] Performance optimization done
- [ ] Load testing completed
- [ ] Smoke tests passing
- [ ] Rollback plan documented
- [ ] Support team trained
- [ ] Documentation updated

**Ready for App Store Submission!** 🚀 