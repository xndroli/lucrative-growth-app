// Turn 14 Sync Logs and Management Page

// app/routes/turn14-sync.jsx
import { json } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import { getLatestSyncLogs, getSyncStats } from "~/utils/sync-log.server";
import { getTurn14Config } from "~/services/turn14-api.server";
import { 
    Page, 
    Card, 
    DataTable,
    Text,
    Banner,
    Layout,
    Button,
    InlineStack,
    BlockStack,
    Badge,
    Box
} from "@shopify/polaris";

export async function loader({ request }) {
    const { session } = await authenticate.admin(request);
    
    try {
        // Check if Turn 14 is configured
        let config = null;
        let isConfigured = false;
        
        try {
            config = await getTurn14Config(session.shop);
            isConfigured = config && config.isActive;
        } catch (error) {
            // Config doesn't exist, that's fine
            isConfigured = false;
        }
        
        // Get sync logs for this shop
        const syncLogs = await getLatestSyncLogs(session.shop, 20);
        
        // Get sync statistics
        const syncStats = await getSyncStats(session.shop, 30);
        
        return json({
            syncLogs,
            syncStats,
            lastSync: syncLogs[0]?.endTime || null,
            isConfigured,
            config: config ? {
                environment: config.environment,
                lastValidated: config.lastValidated,
                dealerCode: config.dealerCode
            } : null
        });
    } catch (error) {
        console.error('Error loading sync data:', error);
        return json({
            syncLogs: [],
            syncStats: {
                totalSyncs: 0,
                totalProducts: 0,
                successfulSyncs: 0,
                failedSyncs: 0,
                successRate: 0
            },
            lastSync: null,
            isConfigured: false,
            config: null,
            error: error.message
        });
    }
}

export default function Turn14SyncLogsPage() {
    const { 
        syncLogs, 
        syncStats, 
        lastSync, 
        isConfigured, 
        config, 
        error 
    } = useLoaderData();

    if (error) {
        return (
            <Page title="Turn 14 Sync Logs">
                <Banner status="critical" title="Error Loading Sync Data">
                    <p>{error}</p>
                </Banner>
            </Page>
        );
    }

    if (!isConfigured) {
        return (
            <Page title="Turn 14 Sync Logs">
                <Layout>
                    <Layout.Section>
                        <Card sectioned>
                            <BlockStack gap="400">
                                <Text variant="headingMd">Turn 14 API Not Configured</Text>
                                <Text variant="bodyMd">
                                    You need to configure your Turn 14 API credentials before you can sync products.
                                </Text>
                                <InlineStack gap="300">
                                    <Link to="/app/turn14-config">
                                        <Button primary>Configure Turn 14 API</Button>
                                    </Link>
                                </InlineStack>
                            </BlockStack>
                        </Card>
                    </Layout.Section>
                </Layout>
            </Page>
        );
    }

    return (
        <Page 
            title="Turn 14 Sync Logs"
            subtitle={`Sync history and statistics for your Turn 14 integration`}
        >
            <Layout>
                <Layout.Section>
                    {/* Configuration Info Banner */}
                    <Card sectioned>
                        <BlockStack gap="300">
                            <InlineStack gap="300" align="space-between">
                                <Text variant="headingMd">Integration Status</Text>
                                <InlineStack gap="200">
                                    <Badge status="success">Active</Badge>
                                    <Badge status={config?.environment === 'production' ? 'info' : 'warning'}>
                                        {config?.environment || 'Unknown'}
                                    </Badge>
                                </InlineStack>
                            </InlineStack>
                            
                            <InlineStack gap="600">
                                {lastSync && (
                                    <Text variant="bodyMd" color="subdued">
                                        Last sync: {new Date(lastSync).toLocaleString()}
                                    </Text>
                                )}
                                {config?.dealerCode && (
                                    <Text variant="bodyMd" color="subdued">
                                        Dealer Code: {config.dealerCode}
                                    </Text>
                                )}
                                {config?.lastValidated && (
                                    <Text variant="bodyMd" color="subdued">
                                        Last validated: {new Date(config.lastValidated).toLocaleString()}
                                    </Text>
                                )}
                            </InlineStack>
                        </BlockStack>
                    </Card>

                    {/* Sync Statistics */}
                    <Card sectioned>
                        <BlockStack gap="400">
                            <Text variant="headingMd">Sync Statistics (Last 30 Days)</Text>
                            
                            <DataTable
                                columnContentTypes={['text', 'numeric', 'text']}
                                headings={['Metric', 'Count', 'Details']}
                                rows={[
                                    [
                                        'Total Sync Operations',
                                        syncStats.totalSyncs,
                                        `${syncStats.totalSyncs} sync sessions`
                                    ],
                                    [
                                        'Products Processed',
                                        syncStats.totalProducts,
                                        'Total products scanned'
                                    ],
                                    [
                                        'Successful Syncs',
                                        syncStats.successfulSyncs,
                                        `${syncStats.successRate}% success rate`
                                    ],
                                    [
                                        'Failed Syncs',
                                        syncStats.failedSyncs,
                                        syncStats.failedSyncs > 0 ? 'Check error logs below' : 'No failures'
                                    ]
                                ]}
                            />
                        </BlockStack>
                    </Card>

                    {/* Sync Logs */}
                    {syncLogs.length === 0 ? (
                        <Card sectioned>
                            <BlockStack gap="400">
                                <Text variant="headingMd">No Sync History</Text>
                                <Text variant="bodyMd">
                                    No sync operations have been performed yet. Sync operations will appear here once they begin.
                                </Text>
                            </BlockStack>
                        </Card>
                    ) : (
                        syncLogs.map((log, index) => (
                            <Card key={log.id} sectioned>
                                <BlockStack gap="400">
                                    <InlineStack gap="300" align="space-between">
                                        <Text variant="headingMd">
                                            Sync Operation #{syncLogs.length - index}
                                        </Text>
                                        <BlockStack gap="100" align="end">
                                            <Text variant="bodyMd" color="subdued">
                                                {new Date(log.endTime).toLocaleString()}
                                            </Text>
                                            <Text variant="bodySm" color="subdued">
                                                Duration: {Math.round((new Date(log.endTime) - new Date(log.startTime)) / 1000)}s
                                            </Text>
                                        </BlockStack>
                                    </InlineStack>

                                    <DataTable
                                        columnContentTypes={['text', 'numeric', 'text', 'text']}
                                        headings={['Metric', 'Count', 'Percentage', 'Status']}
                                        rows={[
                                            [
                                                'Total Products', 
                                                log.totalProducts, 
                                                '100%', 
                                                'Total Scanned'
                                            ],
                                            [
                                                'Successful Syncs', 
                                                log.successfulSyncs, 
                                                `${log.totalProducts > 0 ? ((log.successfulSyncs / log.totalProducts) * 100).toFixed(2) : 0}%`, 
                                                'Synced Successfully'
                                            ],
                                            [
                                                'Failed Syncs', 
                                                log.failedSyncs, 
                                                `${log.totalProducts > 0 ? ((log.failedSyncs / log.totalProducts) * 100).toFixed(2) : 0}%`, 
                                                log.failedSyncs > 0 ? 'Sync Errors' : 'No Errors'
                                            ]
                                        ]}
                                    />

                                    {log.syncErrors && log.syncErrors.length > 0 && (
                                        <Card.Section title={`Sync Errors (${log.syncErrors.length})`}>
                                            <DataTable
                                                columnContentTypes={['text', 'text', 'text']}
                                                headings={['SKU', 'Error Message', 'Time']}
                                                rows={log.syncErrors.map(error => [
                                                    error.sku || 'N/A',
                                                    error.errorMessage,
                                                    new Date(error.createdAt).toLocaleString()
                                                ])}
                                            />
                                        </Card.Section>
                                    )}
                                </BlockStack>
                            </Card>
                        ))
                    )}
                </Layout.Section>
            </Layout>
        </Page>
    );
}