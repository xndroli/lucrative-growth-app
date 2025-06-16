import { useState, useCallback } from "react";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useFetcher, useNavigation } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  FormLayout,
  TextField,
  Select,
  Button,
  Banner,
  Text,
  Divider,
  Box,
  InlineStack,
  BlockStack,
  Badge,
  DataTable
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { 
  getTurn14Config, 
  saveTurn14Config, 
  validateTurn14Credentials,
  fetchAccountInfo 
} from "../services/turn14-api.server";

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  
  try {
    const config = await getTurn14Config(session.shop);
    return json({
      config: {
        ...config,
        // Don't send sensitive data to the frontend
        apiKey: config.apiKey ? '••••••••••••' + config.apiKey.slice(-4) : '',
        apiSecret: config.apiSecret ? '••••••••••••' + config.apiSecret.slice(-4) : ''
      },
      hasConfig: true
    });
  } catch (error) {
    return json({
      config: {
        environment: 'production',
        isActive: false,
        dealerCode: '',
        selectedBrands: [],
        syncSettings: {}
      },
      hasConfig: false
    });
  }
}

export async function action({ request }) {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const action = formData.get('_action');

  try {
    switch (action) {
      case 'save_config': {
        const apiKey = formData.get('apiKey');
        const apiSecret = formData.get('apiSecret');
        const environment = formData.get('environment');
        const dealerCode = formData.get('dealerCode');

        if (!apiKey) {
          return json({ 
            error: 'API Key is required',
            success: false 
          }, { status: 400 });
        }

        const config = await saveTurn14Config(session.shop, {
          apiKey,
          apiSecret,
          environment,
          dealerCode,
          isActive: false // Will be activated after validation
        });

        return json({
          success: true,
          message: 'Configuration saved. Please test your credentials.',
          config
        });
      }

      case 'test_credentials': {
        const existingConfig = await getTurn14Config(session.shop);
        
        const validation = await validateTurn14Credentials(
          session.shop,
          existingConfig.apiKey,
          existingConfig.apiSecret,
          existingConfig.environment
        );

        if (validation.isValid) {
          return json({
            success: true,
            message: 'Credentials validated successfully!',
            validation
          });
        } else {
          return json({
            error: validation.error,
            success: false,
            validation
          }, { status: 400 });
        }
      }

      case 'fetch_account': {
        const accountInfo = await fetchAccountInfo(session.shop);
        return json({
          success: true,
          accountInfo
        });
      }

      default:
        return json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    return json({ 
      error: error.message,
      success: false 
    }, { status: 500 });
  }
}

export default function Turn14Config() {
  const { config, hasConfig } = useLoaderData();
  const fetcher = useFetcher();
  const navigation = useNavigation();

  const [formData, setFormData] = useState({
    apiKey: '',
    apiSecret: '',
    environment: config.environment || 'production',
    dealerCode: config.dealerCode || ''
  });

  const isLoading = navigation.state === 'submitting' || fetcher.state === 'submitting';
  const isTestingCredentials = fetcher.formData?.get('_action') === 'test_credentials';
  const isSavingConfig = fetcher.formData?.get('_action') === 'save_config';

  const handleInputChange = useCallback((field) => (value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleSaveConfig = useCallback(() => {
    const data = new FormData();
    data.append('_action', 'save_config');
    data.append('apiKey', formData.apiKey);
    data.append('apiSecret', formData.apiSecret);
    data.append('environment', formData.environment);
    data.append('dealerCode', formData.dealerCode);
    fetcher.submit(data, { method: 'post' });
  }, [formData, fetcher]);

  const handleTestCredentials = useCallback(() => {
    const data = new FormData();
    data.append('_action', 'test_credentials');
    fetcher.submit(data, { method: 'post' });
  }, [fetcher]);

  const handleFetchAccount = useCallback(() => {
    const data = new FormData();
    data.append('_action', 'fetch_account');
    fetcher.submit(data, { method: 'post' });
  }, [fetcher]);

  return (
    <Page
      title="Turn 14 API Configuration"
      subtitle="Configure your Turn 14 Distribution API credentials and settings"
    >
      <Layout>
        <Layout.Section>
          {/* Status Banner */}
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

          {/* Configuration Status */}
          <Card sectioned>
            <BlockStack gap="400">
              <Text variant="headingMd">Configuration Status</Text>
              
              <InlineStack gap="300" align="start">
                <Badge status={config.isActive ? "success" : "critical"}>
                  {config.isActive ? "Active" : "Inactive"}
                </Badge>
                <Badge status={hasConfig ? "info" : "attention"}>
                  {hasConfig ? "Configured" : "Not Configured"}
                </Badge>
                {config.environment && (
                  <Badge status={config.environment === 'production' ? "success" : "warning"}>
                    {config.environment.charAt(0).toUpperCase() + config.environment.slice(1)}
                  </Badge>
                )}
              </InlineStack>

              {config.lastValidated && (
                <Text variant="bodyMd" color="subdued">
                  Last validated: {new Date(config.lastValidated).toLocaleString()}
                </Text>
              )}

              {config.validationError && (
                <Banner status="critical" title="Validation Error">
                  <p>{config.validationError}</p>
                </Banner>
              )}
            </BlockStack>
          </Card>

          {/* API Configuration Form */}
          <Card sectioned>
            <BlockStack gap="400">
              <Text variant="headingMd">API Credentials</Text>
              
              <FormLayout>
                <TextField
                  label="API Key"
                  value={formData.apiKey}
                  onChange={handleInputChange('apiKey')}
                  placeholder={hasConfig ? config.apiKey : "Enter your Turn 14 API Key"}
                  type="password"
                  autoComplete="off"
                  helpText="Your Turn 14 Distribution API Key"
                />

                <TextField
                  label="API Secret (Optional)"
                  value={formData.apiSecret}
                  onChange={handleInputChange('apiSecret')}
                  placeholder={hasConfig ? config.apiSecret : "Enter your Turn 14 API Secret"}
                  type="password"
                  autoComplete="off"
                  helpText="Your Turn 14 Distribution API Secret (if required)"
                />

                <Select
                  label="Environment"
                  options={[
                    { label: 'Production', value: 'production' },
                    { label: 'Sandbox', value: 'sandbox' }
                  ]}
                  value={formData.environment}
                  onChange={handleInputChange('environment')}
                  helpText="Select the API environment"
                />

                <TextField
                  label="Dealer Code (Optional)"
                  value={formData.dealerCode}
                  onChange={handleInputChange('dealerCode')}
                  placeholder="Your Turn 14 Dealer Code"
                  helpText="Your Turn 14 Dealer Code if applicable"
                />
              </FormLayout>

              <InlineStack gap="300">
                <Button
                  primary
                  onClick={handleSaveConfig}
                  loading={isSavingConfig}
                  disabled={!formData.apiKey || isLoading}
                >
                  Save Configuration
                </Button>

                {hasConfig && (
                  <Button
                    onClick={handleTestCredentials}
                    loading={isTestingCredentials}
                    disabled={isLoading}
                  >
                    Test Credentials
                  </Button>
                )}
              </InlineStack>
            </BlockStack>
          </Card>

          {/* Account Information */}
          {config.isActive && (
            <Card sectioned>
              <BlockStack gap="400">
                <InlineStack gap="300" align="space-between">
                  <Text variant="headingMd">Account Information</Text>
                  <Button
                    onClick={handleFetchAccount}
                    loading={fetcher.formData?.get('_action') === 'fetch_account'}
                    disabled={isLoading}
                  >
                    Refresh Account Info
                  </Button>
                </InlineStack>

                {fetcher.data?.accountInfo && (
                  <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                    <BlockStack gap="200">
                      <Text variant="bodyMd">
                        <strong>Account Name:</strong> {fetcher.data.accountInfo.name || 'N/A'}
                      </Text>
                      <Text variant="bodyMd">
                        <strong>Account Type:</strong> {fetcher.data.accountInfo.type || 'N/A'}
                      </Text>
                      <Text variant="bodyMd">
                        <strong>Status:</strong> {fetcher.data.accountInfo.status || 'N/A'}
                      </Text>
                      {fetcher.data.accountInfo.credit_limit && (
                        <Text variant="bodyMd">
                          <strong>Credit Limit:</strong> ${fetcher.data.accountInfo.credit_limit}
                        </Text>
                      )}
                    </BlockStack>
                  </Box>
                )}
              </BlockStack>
            </Card>
          )}

          {/* Setup Instructions */}
          {!hasConfig && (
            <Card sectioned>
              <BlockStack gap="400">
                <Text variant="headingMd">Getting Started</Text>
                <Text variant="bodyMd">
                  To use the Turn 14 Distribution API integration, you'll need:
                </Text>
                <Box as="ol" paddingInlineStart="600">
                  <Box as="li" paddingBlockEnd="200">
                    <Text variant="bodyMd">A Turn 14 Distribution dealer account</Text>
                  </Box>
                  <Box as="li" paddingBlockEnd="200">
                    <Text variant="bodyMd">API credentials from Turn 14 Distribution</Text>
                  </Box>
                  <Box as="li" paddingBlockEnd="200">
                    <Text variant="bodyMd">Approval to use their API services</Text>
                  </Box>
                </Box>
                <Text variant="bodyMd">
                  Contact your Turn 14 Distribution sales representative to obtain API access.
                </Text>
              </BlockStack>
            </Card>
          )}
        </Layout.Section>
      </Layout>
    </Page>
  );
} 