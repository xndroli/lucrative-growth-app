import { useState, useCallback, useEffect } from "react";
import { json } from "@remix-run/node";
import { useLoaderData, useActionData, useSubmit, useNavigation } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Button,
  Tabs,
  DataTable,
  Badge,
  Text,
  Modal,
  Form,
  FormLayout,
  TextField,
  Select,
  Checkbox,
  Banner,
  EmptyState,
  Spinner,
  ButtonGroup,
  Stack,
  Heading,
  Divider,
  Icon,
  Tooltip
} from "@shopify/polaris";
import {
  PlusIcon,
  EditIcon,
  DeleteIcon,
  CarIcon,
  AlertTriangleIcon,
  CalendarIcon,
  DollarIcon,
  SearchIcon
} from "@shopify/polaris-icons";

import { authenticate } from "../shopify.server";
import { VehicleGarageService } from "../services/vehicle-garage.server";
import { logger } from "../utils/logger.server";

// Mock customer ID for demo - in real implementation, get from Shopify session
const DEMO_CUSTOMER_ID = "demo_customer_123";

export const loader = async ({ request }) => {
  try {
    const { session } = await authenticate.admin(request);
    const garageService = new VehicleGarageService(session.shop);

    // Get garage with full details
    const garage = await garageService.getGarageWithDetails(DEMO_CUSTOMER_ID);
    
    // Get upcoming reminders
    const upcomingReminders = await garageService.getUpcomingReminders(DEMO_CUSTOMER_ID, 30);
    
    // Get garage statistics
    const stats = await garageService.getGarageStats();

    // Get available years for vehicle selection (last 30 years)
    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: 30 }, (_, i) => ({
      label: (currentYear - i).toString(),
      value: (currentYear - i).toString()
    }));

    return json({
      garage,
      upcomingReminders,
      stats,
      years,
      success: true
    });
  } catch (error) {
    logger.error("Error loading garage data:", error);
    return json({ 
      error: error.message,
      garage: null,
      upcomingReminders: [],
      stats: {},
      years: []
    }, { status: 500 });
  }
};

export const action = async ({ request }) => {
  try {
    const { session } = await authenticate.admin(request);
    const garageService = new VehicleGarageService(session.shop);
    
    const formData = await request.formData();
    const actionType = formData.get("actionType");

    switch (actionType) {
      case "addVehicle": {
        const vehicleData = {
          year: parseInt(formData.get("year")),
          make: formData.get("make"),
          model: formData.get("model"),
          submodel: formData.get("submodel") || null,
          nickname: formData.get("nickname") || null,
          color: formData.get("color") || null,
          mileage: formData.get("mileage") ? parseInt(formData.get("mileage")) : null,
          isPrimary: formData.get("isPrimary") === "true"
        };

        const vehicle = await garageService.addVehicle(DEMO_CUSTOMER_ID, vehicleData);
        return json({ success: true, vehicle, message: "Vehicle added successfully!" });
      }

      case "updateVehicle": {
        const vehicleId = formData.get("vehicleId");
        const updateData = {
          nickname: formData.get("nickname") || null,
          color: formData.get("color") || null,
          mileage: formData.get("mileage") ? parseInt(formData.get("mileage")) : null,
          isPrimary: formData.get("isPrimary") === "true"
        };

        const vehicle = await garageService.updateVehicle(DEMO_CUSTOMER_ID, vehicleId, updateData);
        return json({ success: true, vehicle, message: "Vehicle updated successfully!" });
      }

      case "removeVehicle": {
        const vehicleId = formData.get("vehicleId");
        await garageService.removeVehicle(DEMO_CUSTOMER_ID, vehicleId);
        return json({ success: true, message: "Vehicle removed successfully!" });
      }

      case "completeReminder": {
        const reminderId = formData.get("reminderId");
        const currentMileage = formData.get("currentMileage") ? parseInt(formData.get("currentMileage")) : null;
        
        await garageService.completeMaintenanceReminder(DEMO_CUSTOMER_ID, reminderId, { currentMileage });
        return json({ success: true, message: "Maintenance reminder completed!" });
      }

      case "createPriceAlert": {
        const vehicleId = formData.get("vehicleId");
        const alertData = {
          turn14Sku: formData.get("turn14Sku"),
          productTitle: formData.get("productTitle"),
          currentPrice: parseFloat(formData.get("currentPrice")),
          targetPrice: parseFloat(formData.get("targetPrice")),
          alertType: formData.get("alertType") || "price_drop"
        };

        const alert = await garageService.createPriceAlert(DEMO_CUSTOMER_ID, vehicleId, alertData);
        return json({ success: true, alert, message: "Price alert created successfully!" });
      }

      default:
        return json({ error: "Invalid action type" }, { status: 400 });
    }
  } catch (error) {
    logger.error("Error in garage action:", error);
    return json({ error: error.message }, { status: 500 });
  }
};

export default function VehicleGarage() {
  const { garage, upcomingReminders, stats, years } = useLoaderData();
  const actionData = useActionData();
  const submit = useSubmit();
  const navigation = useNavigation();

  const [selectedTab, setSelectedTab] = useState(0);
  const [showAddVehicleModal, setShowAddVehicleModal] = useState(false);
  const [showEditVehicleModal, setShowEditVehicleModal] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [vehicleFormData, setVehicleFormData] = useState({
    year: "",
    make: "",
    model: "",
    submodel: "",
    nickname: "",
    color: "",
    mileage: "",
    isPrimary: false
  });
  const [availableMakes, setAvailableMakes] = useState([]);
  const [availableModels, setAvailableModels] = useState([]);
  const [availableSubmodels, setAvailableSubmodels] = useState([]);

  const isLoading = navigation.state === "submitting";

  // Fetch vehicle makes when year changes
  const fetchMakes = useCallback(async (year) => {
    if (!year) return;
    try {
      const response = await fetch(`/app/api/vehicles/makes?year=${year}`);
      const data = await response.json();
      setAvailableMakes(data.makes.map(make => ({ label: make, value: make })));
    } catch (error) {
      console.error("Error fetching makes:", error);
    }
  }, []);

  // Fetch vehicle models when make changes
  const fetchModels = useCallback(async (year, make) => {
    if (!year || !make) return;
    try {
      const response = await fetch(`/app/api/vehicles/models?year=${year}&make=${make}`);
      const data = await response.json();
      setAvailableModels(data.models.map(model => ({ label: model, value: model })));
    } catch (error) {
      console.error("Error fetching models:", error);
    }
  }, []);

  // Fetch vehicle submodels when model changes
  const fetchSubmodels = useCallback(async (year, make, model) => {
    if (!year || !make || !model) return;
    try {
      const response = await fetch(`/app/api/vehicles/submodels?year=${year}&make=${make}&model=${model}`);
      const data = await response.json();
      setAvailableSubmodels(data.submodels.map(submodel => ({ label: submodel, value: submodel })));
    } catch (error) {
      console.error("Error fetching submodels:", error);
    }
  }, []);

  // Handle form field changes
  const handleFormChange = (field, value) => {
    setVehicleFormData(prev => ({ ...prev, [field]: value }));

    // Trigger cascading dropdowns
    if (field === "year") {
      setAvailableMakes([]);
      setAvailableModels([]);
      setAvailableSubmodels([]);
      setVehicleFormData(prev => ({ ...prev, make: "", model: "", submodel: "" }));
      fetchMakes(value);
    } else if (field === "make") {
      setAvailableModels([]);
      setAvailableSubmodels([]);
      setVehicleFormData(prev => ({ ...prev, model: "", submodel: "" }));
      fetchModels(vehicleFormData.year, value);
    } else if (field === "model") {
      setAvailableSubmodels([]);
      setVehicleFormData(prev => ({ ...prev, submodel: "" }));
      fetchSubmodels(vehicleFormData.year, vehicleFormData.make, value);
    }
  };

  // Handle vehicle submission
  const handleVehicleSubmit = () => {
    const formData = new FormData();
    formData.append("actionType", selectedVehicle ? "updateVehicle" : "addVehicle");
    
    if (selectedVehicle) {
      formData.append("vehicleId", selectedVehicle.id);
    }

    Object.entries(vehicleFormData).forEach(([key, value]) => {
      if (value !== "" && value !== null) {
        formData.append(key, value.toString());
      }
    });

    submit(formData, { method: "post" });
    setShowAddVehicleModal(false);
    setShowEditVehicleModal(false);
    resetForm();
  };

  // Reset form
  const resetForm = () => {
    setVehicleFormData({
      year: "",
      make: "",
      model: "",
      submodel: "",
      nickname: "",
      color: "",
      mileage: "",
      isPrimary: false
    });
    setSelectedVehicle(null);
    setAvailableMakes([]);
    setAvailableModels([]);
    setAvailableSubmodels([]);
  };

  // Handle edit vehicle
  const handleEditVehicle = (vehicle) => {
    setSelectedVehicle(vehicle);
    setVehicleFormData({
      year: vehicle.year.toString(),
      make: vehicle.make,
      model: vehicle.model,
      submodel: vehicle.submodel || "",
      nickname: vehicle.nickname || "",
      color: vehicle.color || "",
      mileage: vehicle.mileage?.toString() || "",
      isPrimary: vehicle.isPrimary
    });
    setShowEditVehicleModal(true);
  };

  // Handle remove vehicle
  const handleRemoveVehicle = (vehicleId) => {
    if (confirm("Are you sure you want to remove this vehicle?")) {
      const formData = new FormData();
      formData.append("actionType", "removeVehicle");
      formData.append("vehicleId", vehicleId);
      submit(formData, { method: "post" });
    }
  };

  // Tabs configuration
  const tabs = [
    {
      id: "overview",
      content: "Overview",
      panelID: "overview-panel"
    },
    {
      id: "vehicles",
      content: "My Vehicles",
      panelID: "vehicles-panel"
    },
    {
      id: "maintenance",
      content: "Maintenance",
      panelID: "maintenance-panel"
    },
    {
      id: "alerts",
      content: "Price Alerts",
      panelID: "alerts-panel"
    }
  ];

  // Vehicle table columns
  const vehicleColumns = [
    { title: "Vehicle", dataIndex: "vehicle" },
    { title: "Nickname", dataIndex: "nickname" },
    { title: "Primary", dataIndex: "primary" },
    { title: "Mileage", dataIndex: "mileage" },
    { title: "Actions", dataIndex: "actions" }
  ];

  // Vehicle table data
  const vehicleRows = garage?.vehicles?.map(vehicle => ({
    id: vehicle.id,
    vehicle: `${vehicle.year} ${vehicle.make} ${vehicle.model}${vehicle.submodel ? ` ${vehicle.submodel}` : ''}`,
    nickname: vehicle.nickname || "-",
    primary: vehicle.isPrimary ? <Badge status="success">Primary</Badge> : "-",
    mileage: vehicle.mileage ? `${vehicle.mileage.toLocaleString()} mi` : "-",
    actions: (
      <ButtonGroup>
        <Button size="slim" onClick={() => handleEditVehicle(vehicle)}>
          <Icon source={EditIcon} />
        </Button>
        <Button 
          size="slim" 
          destructive 
          onClick={() => handleRemoveVehicle(vehicle.id)}
        >
          <Icon source={DeleteIcon} />
        </Button>
      </ButtonGroup>
    )
  })) || [];

  // Maintenance reminders table
  const reminderColumns = [
    { title: "Vehicle", dataIndex: "vehicle" },
    { title: "Service", dataIndex: "service" },
    { title: "Due Date", dataIndex: "dueDate" },
    { title: "Status", dataIndex: "status" },
    { title: "Actions", dataIndex: "actions" }
  ];

  const reminderRows = upcomingReminders?.map(reminder => ({
    id: reminder.id,
    vehicle: `${reminder.vehicle.year} ${reminder.vehicle.make} ${reminder.vehicle.model}`,
    service: reminder.title,
    dueDate: reminder.nextDue ? new Date(reminder.nextDue).toLocaleDateString() : "Based on mileage",
    status: reminder.nextDue && new Date(reminder.nextDue) < new Date() ? 
      <Badge status="critical">Overdue</Badge> : 
      <Badge status="attention">Due Soon</Badge>,
    actions: (
      <Button size="slim" onClick={() => {
        const formData = new FormData();
        formData.append("actionType", "completeReminder");
        formData.append("reminderId", reminder.id);
        submit(formData, { method: "post" });
      }}>
        Mark Complete
      </Button>
    )
  })) || [];

  return (
    <Page
      title="Vehicle Garage"
      subtitle="Manage your vehicles, maintenance, and get personalized product recommendations"
      primaryAction={{
        content: "Add Vehicle",
        icon: PlusIcon,
        onAction: () => setShowAddVehicleModal(true)
      }}
    >
      {actionData?.error && (
        <Banner status="critical" title="Error">
          <p>{actionData.error}</p>
        </Banner>
      )}

      {actionData?.success && actionData?.message && (
        <Banner status="success" title="Success">
          <p>{actionData.message}</p>
        </Banner>
      )}

      <Layout>
        <Layout.Section>
          <Card>
            <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab}>
              {/* Overview Tab */}
              {selectedTab === 0 && (
                <div style={{ padding: "20px" }}>
                  <Stack vertical spacing="loose">
                    <Heading>Garage Overview</Heading>
                    
                    <Layout>
                      <Layout.Section oneThird>
                        <Card sectioned>
                          <Stack vertical spacing="tight">
                            <Stack alignment="center">
                              <Icon source={CarIcon} color="base" />
                              <Text variant="headingMd">{garage?.vehicles?.length || 0}</Text>
                            </Stack>
                            <Text variant="bodyMd" color="subdued">Vehicles in Garage</Text>
                          </Stack>
                        </Card>
                      </Layout.Section>
                      
                      <Layout.Section oneThird>
                        <Card sectioned>
                          <Stack vertical spacing="tight">
                            <Stack alignment="center">
                              <Icon source={CalendarIcon} color="base" />
                              <Text variant="headingMd">{upcomingReminders?.length || 0}</Text>
                            </Stack>
                            <Text variant="bodyMd" color="subdued">Upcoming Maintenance</Text>
                          </Stack>
                        </Card>
                      </Layout.Section>
                      
                      <Layout.Section oneThird>
                        <Card sectioned>
                          <Stack vertical spacing="tight">
                            <Stack alignment="center">
                              <Icon source={DollarIcon} color="base" />
                              <Text variant="headingMd">{stats?.priceAlerts || 0}</Text>
                            </Stack>
                            <Text variant="bodyMd" color="subdued">Active Price Alerts</Text>
                          </Stack>
                        </Card>
                      </Layout.Section>
                    </Layout>

                    {garage?.vehicles?.length > 0 && (
                      <>
                        <Divider />
                        <Heading>Your Vehicles</Heading>
                        <Stack vertical spacing="tight">
                          {garage.vehicles.map(vehicle => (
                            <Card key={vehicle.id} sectioned>
                              <Stack alignment="center" distribution="equalSpacing">
                                <Stack vertical spacing="extraTight">
                                  <Text variant="headingMd">
                                    {vehicle.year} {vehicle.make} {vehicle.model}
                                    {vehicle.submodel && ` ${vehicle.submodel}`}
                                  </Text>
                                  {vehicle.nickname && (
                                    <Text variant="bodyMd" color="subdued">"{vehicle.nickname}"</Text>
                                  )}
                                  {vehicle.isPrimary && (
                                    <Badge status="success">Primary Vehicle</Badge>
                                  )}
                                </Stack>
                                <Stack>
                                  {vehicle.mileage && (
                                    <Text variant="bodyMd">{vehicle.mileage.toLocaleString()} miles</Text>
                                  )}
                                  <Button 
                                    size="slim" 
                                    onClick={() => handleEditVehicle(vehicle)}
                                  >
                                    Edit
                                  </Button>
                                </Stack>
                              </Stack>
                            </Card>
                          ))}
                        </Stack>
                      </>
                    )}
                  </Stack>
                </div>
              )}

              {/* Vehicles Tab */}
              {selectedTab === 1 && (
                <div style={{ padding: "20px" }}>
                  <Stack vertical spacing="loose">
                    <Stack alignment="center" distribution="equalSpacing">
                      <Heading>My Vehicles</Heading>
                      <Button 
                        primary 
                        icon={PlusIcon}
                        onClick={() => setShowAddVehicleModal(true)}
                      >
                        Add Vehicle
                      </Button>
                    </Stack>

                    {vehicleRows.length > 0 ? (
                      <DataTable
                        columnContentTypes={['text', 'text', 'text', 'text', 'text']}
                        headings={vehicleColumns.map(col => col.title)}
                        rows={vehicleRows.map(row => [
                          row.vehicle,
                          row.nickname,
                          row.primary,
                          row.mileage,
                          row.actions
                        ])}
                      />
                    ) : (
                      <EmptyState
                        heading="No vehicles in your garage"
                        action={{
                          content: "Add your first vehicle",
                          onAction: () => setShowAddVehicleModal(true)
                        }}
                        image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                      >
                        <p>Add your vehicles to get personalized product recommendations and maintenance reminders.</p>
                      </EmptyState>
                    )}
                  </Stack>
                </div>
              )}

              {/* Maintenance Tab */}
              {selectedTab === 2 && (
                <div style={{ padding: "20px" }}>
                  <Stack vertical spacing="loose">
                    <Heading>Maintenance Reminders</Heading>

                    {reminderRows.length > 0 ? (
                      <DataTable
                        columnContentTypes={['text', 'text', 'text', 'text', 'text']}
                        headings={reminderColumns.map(col => col.title)}
                        rows={reminderRows.map(row => [
                          row.vehicle,
                          row.service,
                          row.dueDate,
                          row.status,
                          row.actions
                        ])}
                      />
                    ) : (
                      <EmptyState
                        heading="No upcoming maintenance"
                        image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                      >
                        <p>Your vehicles are up to date! Maintenance reminders will appear here when services are due.</p>
                      </EmptyState>
                    )}
                  </Stack>
                </div>
              )}

              {/* Price Alerts Tab */}
              {selectedTab === 3 && (
                <div style={{ padding: "20px" }}>
                  <Stack vertical spacing="loose">
                    <Heading>Price Alerts</Heading>
                    <Text variant="bodyMd" color="subdued">
                      Set up price alerts for products compatible with your vehicles. We'll notify you when prices drop or items come back in stock.
                    </Text>
                    
                    <EmptyState
                      heading="No price alerts set up"
                      action={{
                        content: "Browse compatible products",
                        url: "/app/inventory"
                      }}
                      image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                    >
                      <p>Browse products compatible with your vehicles and set up price alerts to get notified of deals.</p>
                    </EmptyState>
                  </Stack>
                </div>
              )}
            </Tabs>
          </Card>
        </Layout.Section>
      </Layout>

      {/* Add Vehicle Modal */}
      <Modal
        open={showAddVehicleModal}
        onClose={() => {
          setShowAddVehicleModal(false);
          resetForm();
        }}
        title="Add Vehicle"
        primaryAction={{
          content: "Add Vehicle",
          onAction: handleVehicleSubmit,
          loading: isLoading,
          disabled: !vehicleFormData.year || !vehicleFormData.make || !vehicleFormData.model
        }}
        secondaryActions={[{
          content: "Cancel",
          onAction: () => {
            setShowAddVehicleModal(false);
            resetForm();
          }
        }]}
      >
        <Modal.Section>
          <FormLayout>
            <Select
              label="Year"
              options={[{ label: "Select year", value: "" }, ...years]}
              value={vehicleFormData.year}
              onChange={(value) => handleFormChange("year", value)}
            />

            <Select
              label="Make"
              options={[{ label: "Select make", value: "" }, ...availableMakes]}
              value={vehicleFormData.make}
              onChange={(value) => handleFormChange("make", value)}
              disabled={!vehicleFormData.year}
            />

            <Select
              label="Model"
              options={[{ label: "Select model", value: "" }, ...availableModels]}
              value={vehicleFormData.model}
              onChange={(value) => handleFormChange("model", value)}
              disabled={!vehicleFormData.make}
            />

            {availableSubmodels.length > 0 && (
              <Select
                label="Submodel (Optional)"
                options={[{ label: "Select submodel", value: "" }, ...availableSubmodels]}
                value={vehicleFormData.submodel}
                onChange={(value) => handleFormChange("submodel", value)}
              />
            )}

            <TextField
              label="Nickname (Optional)"
              value={vehicleFormData.nickname}
              onChange={(value) => handleFormChange("nickname", value)}
              placeholder="e.g., My Truck, Wife's Car"
            />

            <TextField
              label="Color (Optional)"
              value={vehicleFormData.color}
              onChange={(value) => handleFormChange("color", value)}
            />

            <TextField
              label="Current Mileage (Optional)"
              type="number"
              value={vehicleFormData.mileage}
              onChange={(value) => handleFormChange("mileage", value)}
            />

            <Checkbox
              label="Set as primary vehicle"
              checked={vehicleFormData.isPrimary}
              onChange={(checked) => handleFormChange("isPrimary", checked)}
            />
          </FormLayout>
        </Modal.Section>
      </Modal>

      {/* Edit Vehicle Modal */}
      <Modal
        open={showEditVehicleModal}
        onClose={() => {
          setShowEditVehicleModal(false);
          resetForm();
        }}
        title="Edit Vehicle"
        primaryAction={{
          content: "Update Vehicle",
          onAction: handleVehicleSubmit,
          loading: isLoading
        }}
        secondaryActions={[{
          content: "Cancel",
          onAction: () => {
            setShowEditVehicleModal(false);
            resetForm();
          }
        }]}
      >
        <Modal.Section>
          <FormLayout>
            <Text variant="headingMd">
              {selectedVehicle?.year} {selectedVehicle?.make} {selectedVehicle?.model}
              {selectedVehicle?.submodel && ` ${selectedVehicle.submodel}`}
            </Text>

            <TextField
              label="Nickname"
              value={vehicleFormData.nickname}
              onChange={(value) => handleFormChange("nickname", value)}
              placeholder="e.g., My Truck, Wife's Car"
            />

            <TextField
              label="Color"
              value={vehicleFormData.color}
              onChange={(value) => handleFormChange("color", value)}
            />

            <TextField
              label="Current Mileage"
              type="number"
              value={vehicleFormData.mileage}
              onChange={(value) => handleFormChange("mileage", value)}
            />

            <Checkbox
              label="Set as primary vehicle"
              checked={vehicleFormData.isPrimary}
              onChange={(checked) => handleFormChange("isPrimary", checked)}
            />
          </FormLayout>
        </Modal.Section>
      </Modal>
    </Page>
  );
} 