import { json } from "@remix-run/node";
import { useLoaderData, useActionData, useFetcher, useNavigation } from "@remix-run/react";
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
  ProgressBar,
  EmptyState,
  Spinner
} from "@shopify/polaris";
import { useState, useCallback, useEffect } from "react";
import { ClockIcon, RefreshIcon, SettingsIcon, AlertTriangleIcon } from "@shopify/polaris-icons";

import { authenticate } from "../shopify.server.js";
import { prisma } from "../db.server.js";
import { SyncEngine, SyncScheduleManager } from "../services/sync-engine.server.js";

export const loader = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;

  // Get sync schedules
  const schedules = await SyncScheduleManager.getActiveSchedules(shop);

  // Get recent sync jobs
  const recentJobs = await prisma.turn14SyncJob.findMany({
    where: { shop },
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: {
      schedule: true
    }
  });

  // Get imported products summary
  const importedProductsStats = await prisma.turn14ImportedProduct.groupBy({
    by: ['syncStatus'],
    where: { shop },
    _count: true
  });

  const productStats = {
    total: 0,
    active: 0,
    error: 0,
    paused: 0
  };

  importedProductsStats.forEach(stat => {
    productStats.total += stat._count;
    productStats[stat.syncStatus] = stat._count;
  });

  // Get Turn14 config
  const turn14Config = await prisma.turn14Config.findUnique({
    where: { shop }
  });

  return json({
    schedules,
    recentJobs,
    productStats,
    isConfigured: !!turn14Config?.apiKey
  });
};

export const action = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const actionType = formData.get("action");

  try {
    switch (actionType) {
      case "createSchedule": {
        const scheduleData = {
          name: formData.get("name"),
          syncType: formData.get("syncType"),
          frequency: formData.get("frequency"),
          syncSettings: formData.get("syncSettings") || "{}"
        };

        const schedule = await SyncScheduleManager.createSchedule(shop, scheduleData);
        return json({ success: true, schedule });
      }

      case "updateSchedule": {
        const scheduleId = formData.get("scheduleId");
        const updates = {
          name: formData.get("name"),
          frequency: formData.get("frequency"),
          isActive: formData.get("isActive") === "true",
          syncSettings: formData.get("syncSettings") || "{}"
        };

        const schedule = await SyncScheduleManager.updateSchedule(scheduleId, updates);
        return json({ success: true, schedule });
      }

      case "runSync": {
        const syncType = formData.get("syncType");
        const settings = JSON.parse(formData.get("settings") || "{}");
        
        const syncEngine = new SyncEngine(shop, session.accessToken);
        const result = await syncEngine.runSync(syncType, null, settings);
        
        return json({ success: true, result });
      }

      case "deleteSchedule": {
        const scheduleId = formData.get("scheduleId");
        
        await prisma.turn14SyncSchedule.delete({
          where: { id: scheduleId }
        });
        
        return json({ success: true });
      }

      default:
        return json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (error) {
    console.error("Sync action error:", error);
    return json({ error: error.message }, { status: 500 });
  }
};

export default function SyncPage() {
  const { schedules, recentJobs, productStats, isConfigured } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const fetcher = useFetcher();

  const [activeModal, setActiveModal] = useState(null);
  const [selectedSchedule, setSelectedSchedule] = useState(null);
  const [scheduleForm, setScheduleForm] = useState({
    name: "",
    syncType: "inventory",
    frequency: "daily",
    maxNewProducts: "50",
    defaultMarkup: "0"
  });

  const isLoading = navigation.state === "submitting" || fetcher.state === "submitting";

  const handleCreateSchedule = useCallback(() => {
    setSelectedSchedule(null);
    setScheduleForm({
      name: "",
      syncType: "inventory",
      frequency: "daily",
      maxNewProducts: "50",
      defaultMarkup: "0"
    });
    setActiveModal("scheduleForm");
  }, []);

  const handleEditSchedule = useCallback((schedule) => {
    setSelectedSchedule(schedule);
    const settings = schedule.syncSettings ? JSON.parse(schedule.syncSettings) : {};
    setScheduleForm({
      name: schedule.name,
      syncType: schedule.syncType,
      frequency: schedule.frequency,
      maxNewProducts: settings.maxNewProducts || "50",
      defaultMarkup: settings.defaultMarkup || "0"
    });
    setActiveModal("scheduleForm");
  }, []);

  const handleRunManualSync = useCallback((syncType) => {
    const settings = {
      maxNewProducts: 50,
      defaultMarkup: 0
    };

    fetcher.submit(
      {
        action: "runSync",
        syncType,
        settings: JSON.stringify(settings)
      },
      { method: "post" }
    );
  }, [fetcher]);

  const handleSaveSchedule = useCallback(() => {
    const syncSettings = {
      maxNewProducts: parseInt(scheduleForm.maxNewProducts),
      defaultMarkup: parseFloat(scheduleForm.defaultMarkup)
    };

    const formData = new FormData();
    formData.append("action", selectedSchedule ? "updateSchedule" : "createSchedule");
    if (selectedSchedule) {
      formData.append("scheduleId", selectedSchedule.id);
    }
    formData.append("name", scheduleForm.name);
    formData.append("syncType", scheduleForm.syncType);
    formData.append("frequency", scheduleForm.frequency);
    formData.append("syncSettings", JSON.stringify(syncSettings));

    fetcher.submit(formData, { method: "post" });
    setActiveModal(null);
  }, [scheduleForm, selectedSchedule, fetcher]);

  const handleDeleteSchedule = useCallback((scheduleId) => {
    if (confirm("Are you sure you want to delete this sync schedule?")) {
      fetcher.submit(
        { action: "deleteSchedule", scheduleId },
        { method: "post" }
      );
    }
  }, [fetcher]);

  // Schedule table data
  const scheduleRows = schedules.map((schedule) => [
    schedule.name,
    <Badge tone={schedule.syncType === 'full' ? 'info' : 'success'}>
      {schedule.syncType.charAt(0).toUpperCase() + schedule.syncType.slice(1)}
    </Badge>,
    schedule.frequency.charAt(0).toUpperCase() + schedule.frequency.slice(1),
    schedule.lastRun ? new Date(schedule.lastRun).toLocaleDateString() : "Never",
    schedule.nextRun ? new Date(schedule.nextRun).toLocaleDateString() : "Manual",
    <Badge tone={schedule.isActive ? 'success' : 'warning'}>
      {schedule.isActive ? 'Active' : 'Paused'}
    </Badge>,
    <ButtonGroup>
      <Button size="micro" onClick={() => handleEditSchedule(schedule)}>
        Edit
      </Button>
      <Button 
        size="micro" 
        variant="primary" 
        tone="critical"
        onClick={() => handleDeleteSchedule(schedule.id)}
      >
        Delete
      </Button>
    </ButtonGroup>
  ]);

  // Recent jobs table data
  const jobRows = recentJobs.map((job) => [
    job.schedule?.name || "Manual Sync",
    <Badge tone={job.syncType === 'full' ? 'info' : 'success'}>
      {job.syncType.charAt(0).toUpperCase() + job.syncType.slice(1)}
    </Badge>,
    <Badge tone={
      job.status === 'completed' ? 'success' : 
      job.status === 'failed' ? 'critical' : 
      job.status === 'running' ? 'info' : 'warning'
    }>
      {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
    </Badge>,
    `${job.successItems}/${job.totalItems}`,
    new Date(job.createdAt).toLocaleString(),
    job.endTime ? `${Math.round((new Date(job.endTime) - new Date(job.startTime)) / 1000)}s` : "-"
  ]);

  if (!isConfigured) {
    return (
      <Page>
        <Layout>
          <Layout.Section>
            <EmptyState
              heading="Turn 14 Configuration Required"
              image="https://cdn.shopify.com/s/files/1/0757/9955/files/empty-state.svg"
            >
              <p>You need to configure your Turn 14 API credentials before setting up sync schedules.</p>
              <Button 
                variant="primary" 
                url="/app/turn14-config"
              >
                Configure Turn 14
              </Button>
            </EmptyState>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  return (
    <Page
      title="Sync Management"
      subtitle="Manage automated synchronization with Turn 14 Distribution"
      primaryAction={{
        content: "Create Schedule",
        onAction: handleCreateSchedule,
        icon: ClockIcon
      }}
      secondaryActions={[
        {
          content: "Run Manual Sync",
          onAction: () => setActiveModal("manualSync"),
          icon: RefreshIcon
        }
      ]}
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
              <p>
                {actionData.result ? "Sync completed successfully" : "Schedule updated successfully"}
              </p>
            </Banner>
          </Layout.Section>
        )}

        {/* Product Statistics */}
        <Layout.Section>
          <Card>
            <Box padding="400">
              <Text variant="headingMd" as="h2">Product Statistics</Text>
              <Box paddingBlockStart="300">
                <InlineStack gap="800">
                  <Stack>
                    <Text variant="headingLg" as="p">{productStats.total}</Text>
                    <Text variant="bodyMd" tone="subdued">Total Products</Text>
                  </Stack>
                  <Stack>
                    <Text variant="headingLg" as="p" tone="success">{productStats.active}</Text>
                    <Text variant="bodyMd" tone="subdued">Active Sync</Text>
                  </Stack>
                  <Stack>
                    <Text variant="headingLg" as="p" tone="critical">{productStats.error}</Text>
                    <Text variant="bodyMd" tone="subdued">Sync Errors</Text>
                  </Stack>
                  <Stack>
                    <Text variant="headingLg" as="p" tone="warning">{productStats.paused}</Text>
                    <Text variant="bodyMd" tone="subdued">Paused</Text>
                  </Stack>
                </InlineStack>
              </Box>
            </Box>
          </Card>
        </Layout.Section>

        {/* Sync Schedules */}
        <Layout.Section>
          <Card>
            <Box padding="400">
              <InlineStack align="space-between">
                <Text variant="headingMd" as="h2">Sync Schedules</Text>
                <Button 
                  size="micro" 
                  onClick={handleCreateSchedule}
                  icon={ClockIcon}
                >
                  Add Schedule
                </Button>
              </InlineStack>
            </Box>
            
            {schedules.length > 0 ? (
              <DataTable
                columnContentTypes={['text', 'text', 'text', 'text', 'text', 'text', 'text']}
                headings={['Name', 'Type', 'Frequency', 'Last Run', 'Next Run', 'Status', 'Actions']}
                rows={scheduleRows}
              />
            ) : (
              <Box padding="400">
                <EmptyState
                  heading="No sync schedules configured"
                  image="https://cdn.shopify.com/s/files/1/0757/9955/files/empty-state.svg"
                >
                  <p>Create your first sync schedule to automate product updates.</p>
                  <Button onClick={handleCreateSchedule}>Create Schedule</Button>
                </EmptyState>
              </Box>
            )}
          </Card>
        </Layout.Section>

        {/* Recent Sync Jobs */}
        <Layout.Section>
          <Card>
            <Box padding="400">
              <Text variant="headingMd" as="h2">Recent Sync Jobs</Text>
            </Box>
            
            {recentJobs.length > 0 ? (
              <DataTable
                columnContentTypes={['text', 'text', 'text', 'text', 'text', 'text']}
                headings={['Schedule', 'Type', 'Status', 'Success Rate', 'Started', 'Duration']}
                rows={jobRows}
              />
            ) : (
              <Box padding="400">
                <EmptyState
                  heading="No sync jobs yet"
                  image="https://cdn.shopify.com/s/files/1/0757/9955/files/empty-state.svg"
                >
                  <p>Your sync job history will appear here.</p>
                </EmptyState>
              </Box>
            )}
          </Card>
        </Layout.Section>
      </Layout>

      {/* Schedule Form Modal */}
      <Modal
        open={activeModal === "scheduleForm"}
        onClose={() => setActiveModal(null)}
        title={selectedSchedule ? "Edit Sync Schedule" : "Create Sync Schedule"}
        primaryAction={{
          content: selectedSchedule ? "Update Schedule" : "Create Schedule",
          onAction: handleSaveSchedule,
          loading: isLoading
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setActiveModal(null)
          }
        ]}
      >
        <Modal.Section>
          <FormLayout>
            <TextField
              label="Schedule Name"
              value={scheduleForm.name}
              onChange={(value) => setScheduleForm(prev => ({ ...prev, name: value }))}
              placeholder="e.g., Daily Inventory Sync"
              autoComplete="off"
            />

            <Select
              label="Sync Type"
              options={[
                { label: "Inventory Only", value: "inventory" },
                { label: "Pricing Only", value: "pricing" },
                { label: "New Products", value: "products" },
                { label: "Full Sync (All)", value: "full" }
              ]}
              value={scheduleForm.syncType}
              onChange={(value) => setScheduleForm(prev => ({ ...prev, syncType: value }))}
            />

            <Select
              label="Frequency"
              options={[
                { label: "Hourly", value: "hourly" },
                { label: "Daily", value: "daily" },
                { label: "Weekly", value: "weekly" },
                { label: "Manual Only", value: "manual" }
              ]}
              value={scheduleForm.frequency}
              onChange={(value) => setScheduleForm(prev => ({ ...prev, frequency: value }))}
            />

            {(scheduleForm.syncType === "products" || scheduleForm.syncType === "full") && (
              <>
                <TextField
                  label="Max New Products Per Sync"
                  type="number"
                  value={scheduleForm.maxNewProducts}
                  onChange={(value) => setScheduleForm(prev => ({ ...prev, maxNewProducts: value }))}
                  min="1"
                  max="500"
                />

                <TextField
                  label="Default Price Markup (%)"
                  type="number"
                  value={scheduleForm.defaultMarkup}
                  onChange={(value) => setScheduleForm(prev => ({ ...prev, defaultMarkup: value }))}
                  min="0"
                  max="100"
                  suffix="%"
                />
              </>
            )}
          </FormLayout>
        </Modal.Section>
      </Modal>

      {/* Manual Sync Modal */}
      <Modal
        open={activeModal === "manualSync"}
        onClose={() => setActiveModal(null)}
        title="Run Manual Sync"
        primaryAction={{
          content: "Cancel",
          onAction: () => setActiveModal(null)
        }}
      >
        <Modal.Section>
          <Stack gap="400">
            <Text variant="bodyMd">
              Choose the type of sync to run immediately:
            </Text>
            
            <ButtonGroup>
              <Button 
                onClick={() => handleRunManualSync("inventory")}
                loading={fetcher.state === "submitting"}
              >
                Sync Inventory
              </Button>
              <Button 
                onClick={() => handleRunManualSync("pricing")}
                loading={fetcher.state === "submitting"}
              >
                Sync Pricing
              </Button>
              <Button 
                onClick={() => handleRunManualSync("products")}
                loading={fetcher.state === "submitting"}
              >
                Import New Products
              </Button>
              <Button 
                variant="primary"
                onClick={() => handleRunManualSync("full")}
                loading={fetcher.state === "submitting"}
              >
                Full Sync
              </Button>
            </ButtonGroup>

            {fetcher.state === "submitting" && (
              <Banner status="info">
                <p>Running sync... This may take a few minutes.</p>
                <ProgressBar progress={undefined} />
              </Banner>
            )}
          </Stack>
        </Modal.Section>
      </Modal>
    </Page>
  );
} 