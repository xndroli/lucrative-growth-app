import React, { useState, useEffect, useCallback } from 'react';
import './VehicleGarageWidget.css';

/**
 * Customer-facing Vehicle Garage Widget
 * This component can be embedded in the Shopify storefront
 */
export const VehicleGarageWidget = ({ 
  customerId, 
  shopDomain, 
  apiEndpoint = '/apps/turn14-garage/api',
  onVehicleSelect,
  showCompatibilityBadges = true,
  compact = false 
}) => {
  const [garage, setGarage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [vehicleForm, setVehicleForm] = useState({
    year: '',
    make: '',
    model: '',
    submodel: '',
    nickname: ''
  });
  const [availableMakes, setAvailableMakes] = useState([]);
  const [availableModels, setAvailableModels] = useState([]);
  const [availableSubmodels, setAvailableSubmodels] = useState([]);

  // Load customer's garage
  const loadGarage = useCallback(async () => {
    if (!customerId) return;
    
    try {
      setLoading(true);
      const response = await fetch(`${apiEndpoint}/garage/${customerId}`);
      const data = await response.json();
      
      if (data.success) {
        setGarage(data.garage);
        if (data.garage?.vehicles?.length > 0) {
          const primaryVehicle = data.garage.vehicles.find(v => v.isPrimary) || data.garage.vehicles[0];
          setSelectedVehicle(primaryVehicle);
          onVehicleSelect?.(primaryVehicle);
        }
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to load vehicle garage');
      console.error('Garage loading error:', err);
    } finally {
      setLoading(false);
    }
  }, [customerId, apiEndpoint, onVehicleSelect]);

  // Load vehicle makes for selected year
  const loadMakes = useCallback(async (year) => {
    if (!year) return;
    
    try {
      const response = await fetch(`${apiEndpoint}/vehicles/makes?year=${year}`);
      const data = await response.json();
      setAvailableMakes(data.makes || []);
    } catch (err) {
      console.error('Error loading makes:', err);
    }
  }, [apiEndpoint]);

  // Load vehicle models for selected year/make
  const loadModels = useCallback(async (year, make) => {
    if (!year || !make) return;
    
    try {
      const response = await fetch(`${apiEndpoint}/vehicles/models?year=${year}&make=${make}`);
      const data = await response.json();
      setAvailableModels(data.models || []);
    } catch (err) {
      console.error('Error loading models:', err);
    }
  }, [apiEndpoint]);

  // Load vehicle submodels for selected year/make/model
  const loadSubmodels = useCallback(async (year, make, model) => {
    if (!year || !make || !model) return;
    
    try {
      const response = await fetch(`${apiEndpoint}/vehicles/submodels?year=${year}&make=${make}&model=${model}`);
      const data = await response.json();
      setAvailableSubmodels(data.submodels || []);
    } catch (err) {
      console.error('Error loading submodels:', err);
    }
  }, [apiEndpoint]);

  // Add vehicle to garage
  const addVehicle = async () => {
    try {
      const response = await fetch(`${apiEndpoint}/garage/${customerId}/vehicles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(vehicleForm)
      });
      
      const data = await response.json();
      
      if (data.success) {
        await loadGarage();
        setShowAddVehicle(false);
        resetForm();
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to add vehicle');
      console.error('Add vehicle error:', err);
    }
  };

  // Remove vehicle from garage
  const removeVehicle = async (vehicleId) => {
    if (!confirm('Are you sure you want to remove this vehicle?')) return;
    
    try {
      const response = await fetch(`${apiEndpoint}/garage/${customerId}/vehicles/${vehicleId}`, {
        method: 'DELETE'
      });
      
      const data = await response.json();
      
      if (data.success) {
        await loadGarage();
        if (selectedVehicle?.id === vehicleId) {
          setSelectedVehicle(null);
          onVehicleSelect?.(null);
        }
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to remove vehicle');
      console.error('Remove vehicle error:', err);
    }
  };

  // Select vehicle as primary
  const selectVehicle = (vehicle) => {
    setSelectedVehicle(vehicle);
    onVehicleSelect?.(vehicle);
  };

  // Reset form
  const resetForm = () => {
    setVehicleForm({
      year: '',
      make: '',
      model: '',
      submodel: '',
      nickname: ''
    });
    setAvailableMakes([]);
    setAvailableModels([]);
    setAvailableSubmodels([]);
  };

  // Handle form changes
  const handleFormChange = (field, value) => {
    setVehicleForm(prev => ({ ...prev, [field]: value }));

    if (field === 'year') {
      setVehicleForm(prev => ({ ...prev, make: '', model: '', submodel: '' }));
      setAvailableMakes([]);
      setAvailableModels([]);
      setAvailableSubmodels([]);
      loadMakes(value);
    } else if (field === 'make') {
      setVehicleForm(prev => ({ ...prev, model: '', submodel: '' }));
      setAvailableModels([]);
      setAvailableSubmodels([]);
      loadModels(vehicleForm.year, value);
    } else if (field === 'model') {
      setVehicleForm(prev => ({ ...prev, submodel: '' }));
      setAvailableSubmodels([]);
      loadSubmodels(vehicleForm.year, vehicleForm.make, value);
    }
  };

  // Generate year options (last 30 years)
  const yearOptions = Array.from({ length: 30 }, (_, i) => {
    const year = new Date().getFullYear() - i;
    return year;
  });

  useEffect(() => {
    loadGarage();
  }, [loadGarage]);

  if (loading) {
    return (
      <div className={`vehicle-garage-widget ${compact ? 'compact' : ''}`}>
        <div className="loading">
          <div className="spinner"></div>
          <span>Loading your garage...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`vehicle-garage-widget ${compact ? 'compact' : ''}`}>
        <div className="error">
          <span>⚠️ {error}</span>
          <button onClick={loadGarage} className="retry-btn">Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className={`vehicle-garage-widget ${compact ? 'compact' : ''}`}>
      <div className="garage-header">
        <h3>🚗 My Garage</h3>
        {!compact && (
          <button 
            className="add-vehicle-btn"
            onClick={() => setShowAddVehicle(true)}
          >
            + Add Vehicle
          </button>
        )}
      </div>

      {garage?.vehicles?.length > 0 ? (
        <div className="vehicles-list">
          {garage.vehicles.map(vehicle => (
            <div 
              key={vehicle.id}
              className={`vehicle-card ${selectedVehicle?.id === vehicle.id ? 'selected' : ''}`}
              onClick={() => selectVehicle(vehicle)}
            >
              <div className="vehicle-info">
                <div className="vehicle-name">
                  {vehicle.year} {vehicle.make} {vehicle.model}
                  {vehicle.submodel && ` ${vehicle.submodel}`}
                </div>
                {vehicle.nickname && (
                  <div className="vehicle-nickname">"{vehicle.nickname}"</div>
                )}
                {vehicle.isPrimary && (
                  <span className="primary-badge">Primary</span>
                )}
              </div>
              
              {!compact && (
                <div className="vehicle-actions">
                  <button 
                    className="remove-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeVehicle(vehicle.id);
                    }}
                  >
                    ×
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-garage">
          <div className="empty-icon">🚗</div>
          <p>Your garage is empty</p>
          <button 
            className="add-first-vehicle-btn"
            onClick={() => setShowAddVehicle(true)}
          >
            Add Your First Vehicle
          </button>
        </div>
      )}

      {selectedVehicle && showCompatibilityBadges && (
        <div className="selected-vehicle-info">
          <div className="selected-label">Shopping for:</div>
          <div className="selected-vehicle">
            {selectedVehicle.year} {selectedVehicle.make} {selectedVehicle.model}
            {selectedVehicle.submodel && ` ${selectedVehicle.submodel}`}
          </div>
        </div>
      )}

      {/* Add Vehicle Modal */}
      {showAddVehicle && (
        <div className="modal-overlay" onClick={() => setShowAddVehicle(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h4>Add Vehicle</h4>
              <button 
                className="close-btn"
                onClick={() => setShowAddVehicle(false)}
              >
                ×
              </button>
            </div>
            
            <div className="modal-body">
              <div className="form-group">
                <label>Year</label>
                <select 
                  value={vehicleForm.year}
                  onChange={(e) => handleFormChange('year', e.target.value)}
                >
                  <option value="">Select Year</option>
                  {yearOptions.map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Make</label>
                <select 
                  value={vehicleForm.make}
                  onChange={(e) => handleFormChange('make', e.target.value)}
                  disabled={!vehicleForm.year}
                >
                  <option value="">Select Make</option>
                  {availableMakes.map(make => (
                    <option key={make} value={make}>{make}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Model</label>
                <select 
                  value={vehicleForm.model}
                  onChange={(e) => handleFormChange('model', e.target.value)}
                  disabled={!vehicleForm.make}
                >
                  <option value="">Select Model</option>
                  {availableModels.map(model => (
                    <option key={model} value={model}>{model}</option>
                  ))}
                </select>
              </div>

              {availableSubmodels.length > 0 && (
                <div className="form-group">
                  <label>Submodel (Optional)</label>
                  <select 
                    value={vehicleForm.submodel}
                    onChange={(e) => handleFormChange('submodel', e.target.value)}
                  >
                    <option value="">Select Submodel</option>
                    {availableSubmodels.map(submodel => (
                      <option key={submodel} value={submodel}>{submodel}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="form-group">
                <label>Nickname (Optional)</label>
                <input 
                  type="text"
                  value={vehicleForm.nickname}
                  onChange={(e) => handleFormChange('nickname', e.target.value)}
                  placeholder="e.g., My Truck, Wife's Car"
                />
              </div>
            </div>
            
            <div className="modal-footer">
              <button 
                className="cancel-btn"
                onClick={() => setShowAddVehicle(false)}
              >
                Cancel
              </button>
              <button 
                className="add-btn"
                onClick={addVehicle}
                disabled={!vehicleForm.year || !vehicleForm.make || !vehicleForm.model}
              >
                Add Vehicle
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Compatibility Badge Component
export const CompatibilityBadge = ({ 
  isCompatible, 
  notes, 
  restrictions,
  className = '' 
}) => {
  if (isCompatible === null || isCompatible === undefined) {
    return null;
  }

  return (
    <div className={`compatibility-badge ${isCompatible ? 'compatible' : 'not-compatible'} ${className}`}>
      {isCompatible ? (
        <>
          <span className="badge-icon">✓</span>
          <span className="badge-text">Fits Your Vehicle</span>
        </>
      ) : (
        <>
          <span className="badge-icon">⚠</span>
          <span className="badge-text">Check Compatibility</span>
        </>
      )}
      
      {(notes || restrictions) && (
        <div className="badge-tooltip">
          {notes && <div className="notes">{notes}</div>}
          {restrictions && <div className="restrictions">⚠️ {restrictions}</div>}
        </div>
      )}
    </div>
  );
};

// Product Compatibility Checker Hook
export const useProductCompatibility = (vehicleId, apiEndpoint) => {
  const [compatibility, setCompatibility] = useState({});
  const [loading, setLoading] = useState(false);

  const checkCompatibility = useCallback(async (turn14Sku) => {
    if (!vehicleId || !turn14Sku) return null;

    if (compatibility[turn14Sku]) {
      return compatibility[turn14Sku];
    }

    setLoading(true);
    try {
      const response = await fetch(
        `${apiEndpoint}/vehicles/${vehicleId}/compatibility?sku=${turn14Sku}`
      );
      const data = await response.json();
      
      const result = {
        compatible: data.compatible,
        notes: data.notes,
        restrictions: data.restrictions,
        isUniversal: data.isUniversal
      };

      setCompatibility(prev => ({
        ...prev,
        [turn14Sku]: result
      }));

      return result;
    } catch (error) {
      console.error('Compatibility check error:', error);
      return { compatible: false, error: 'Failed to check compatibility' };
    } finally {
      setLoading(false);
    }
  }, [vehicleId, apiEndpoint, compatibility]);

  return { checkCompatibility, loading };
};

export default VehicleGarageWidget; 