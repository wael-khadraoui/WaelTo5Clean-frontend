import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { dataService } from '../App';
import toast from 'react-hot-toast';
import { useTranslation } from '../hooks/useTranslation';
import MapPicker from '../components/MapPicker';
import Map, { Marker } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { mapboxConfig } from '../config/mapboxConfig';
import MapboxConfigMissing from '../components/MapboxConfigMissing.jsx';
import './ClientsPage.css';

export default function ClientsPage() {
  const { t } = useTranslation();
  const [allClients, setAllClients] = useState([]); // All clients from DB
  const [clients, setClients] = useState([]); // Filtered and paginated clients
  const [loading, setLoading] = useState(true);
  const [editingClient, setEditingClient] = useState(null);
  const [addingNewClient, setAddingNewClient] = useState(false);
  const [newClient, setNewClient] = useState({ name: '', phone: '', locations: [] });
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  /** Map modal only — keep showLocationPicker true for address/save row after picking a point */
  const [mapPickerOpen, setMapPickerOpen] = useState(false);
  const [newLocation, setNewLocation] = useState({ address: '', location: null });
  const [selectedLocationIndex, setSelectedLocationIndex] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [displayedCount, setDisplayedCount] = useState(10); // Number of clients to display
  const [showDeliveryLocationsMap, setShowDeliveryLocationsMap] = useState(false);
  const [selectedClientForMap, setSelectedClientForMap] = useState(null);
  const [deliveryLocations, setDeliveryLocations] = useState([]);
  const [selectedMapLocation, setSelectedMapLocation] = useState(null);
  const [selectedAddressForLocation, setSelectedAddressForLocation] = useState(null);
  const [mapViewState, setMapViewState] = useState({
    latitude: 37.269584420315546,
    longitude: 9.874240390070584,
    zoom: 13,
  });
  const navigate = useNavigate();

  useEffect(() => {
    loadClients();
  }, []);

  const loadClients = async () => {
    setLoading(true);
    const loadedClients = await dataService.getAllClients();
    setAllClients(loadedClients);
    setLoading(false);
  };

  // Filter and paginate clients based on search and displayed count
  useEffect(() => {
    let filtered = allClients;

    // Apply search filter
    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase().trim();
      filtered = allClients.filter(client => {
        const nameMatch = client.name?.toLowerCase().includes(searchLower);
        const phoneMatch = client.phone?.toLowerCase().includes(searchLower);
        // Check addresses in locations array
        const addressMatch = client.locations?.some(loc => 
          loc.address?.toLowerCase().includes(searchLower)
        );
        return nameMatch || phoneMatch || addressMatch;
      });
    }

    // Apply pagination
    setClients(filtered.slice(0, displayedCount));
  }, [allClients, searchTerm, displayedCount]);

  // Load more clients when scrolling to bottom
  const loadMore = () => {
    if (displayedCount < allClients.length) {
      setDisplayedCount(prev => Math.min(prev + 10, allClients.length));
    }
  };

  // Handle scroll to load more
  useEffect(() => {
    const handleScroll = () => {
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 100) {
        loadMore();
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [displayedCount, allClients.length]);

  const handleEdit = (client) => {
    setEditingClient({ ...client });
    setShowLocationPicker(false);
    setMapPickerOpen(false);
    setNewLocation({ address: '', location: null });
    setSelectedLocationIndex(null);
  };

  const handleCancelEdit = () => {
    setEditingClient(null);
    setShowLocationPicker(false);
    setMapPickerOpen(false);
    setNewLocation({ address: '', location: null });
    setSelectedLocationIndex(null);
  };

  const handleAddNew = () => {
    setAddingNewClient(true);
    setNewClient({ name: '', phone: '', locations: [] });
    setShowLocationPicker(false);
    setMapPickerOpen(false);
    setNewLocation({ address: '', location: null });
    setSelectedLocationIndex(null);
  };

  const handleCancelAdd = () => {
    setAddingNewClient(false);
    setNewClient({ name: '', phone: '', locations: [] });
    setShowLocationPicker(false);
    setMapPickerOpen(false);
    setNewLocation({ address: '', location: null });
    setSelectedLocationIndex(null);
  };

  const handleSaveNew = async () => {
    if (!newClient.name.trim() || !newClient.phone.trim()) {
      toast.error(t('nameAndPhoneRequired'));
      return;
    }

    const result = await dataService.saveClient({
      name: newClient.name.trim(),
      phone: newClient.phone.trim(),
      locations: newClient.locations || []
    });

    if (result.success) {
      toast.success(t('clientCreated'));
      setAddingNewClient(false);
      setNewClient({ name: '', phone: '', locations: [] });
      setShowLocationPicker(false);
      setMapPickerOpen(false);
      setNewLocation({ address: '', location: null });
      setSelectedLocationIndex(null);
      loadClients();
    } else {
      toast.error(result.error || t('failedToCreateClient'));
    }
  };

  const handleSave = async () => {
    if (!editingClient.name.trim() || !editingClient.phone.trim()) {
      toast.error(t('nameAndPhoneRequired'));
      return;
    }

    const result = await dataService.updateClient(editingClient.id, {
      name: editingClient.name.trim(),
      phone: editingClient.phone.trim(),
      locations: editingClient.locations || []
    });

    if (result.success) {
      toast.success(t('clientUpdated'));
      setEditingClient(null);
      setShowLocationPicker(false);
      setMapPickerOpen(false);
      setNewLocation({ address: '', location: null });
      setSelectedLocationIndex(null);
      loadClients();
    } else {
      toast.error(result.error || t('failedToUpdateClient'));
    }
  };

  const handleDelete = async (clientId) => {
    if (!window.confirm(t('areYouSureDeleteClient'))) {
      return;
    }

    const result = await dataService.deleteClient(clientId);
    if (result.success) {
      toast.success(t('clientDeleted'));
      loadClients();
    } else {
      toast.error(result.error || t('failedToDeleteClient'));
    }
  };

  const handleViewDeliveryLocations = async (client) => {
    setSelectedClientForMap(client);
    setShowDeliveryLocationsMap(true);
    setSelectedMapLocation(null);
    setSelectedAddressForLocation(null);
    
    // Load completed missions for this client
    const missions = await dataService.getMissionsByClient(client.id);
    
    // Extract delivery locations from completed missions
    const locations = missions
      .filter(m => m.completedLocation && m.deliveryAddress)
      .map(m => ({
        location: m.completedLocation,
        address: m.deliveryAddress,
        completedAt: m.completedAt,
        missionId: m.id
      }))
      .sort((a, b) => {
        // Sort by most recent first
        const dateA = new Date(a.completedAt || 0);
        const dateB = new Date(b.completedAt || 0);
        return dateB - dateA;
      });
    
    setDeliveryLocations(locations);
    
    // Check if client has any location with coordinates
    const hasLocation = client.locations?.some(loc => loc.location && loc.location.latitude);
    
    // Center map on first delivery location, or client's existing location, or default
    if (locations.length > 0) {
      setMapViewState(prev => ({
        ...prev,
        latitude: locations[0].location.latitude,
        longitude: locations[0].location.longitude,
        zoom: 14
      }));
    } else if (hasLocation) {
      const firstLoc = client.locations.find(loc => loc.location && loc.location.latitude);
      if (firstLoc) {
        setMapViewState(prev => ({
          ...prev,
          latitude: firstLoc.location.latitude,
          longitude: firstLoc.location.longitude,
          zoom: 14
        }));
      }
    }
  };

  const handleMapClick = (event) => {
    const { lng, lat } = event.lngLat;
    setSelectedMapLocation({ latitude: lat, longitude: lng });
    // Auto-select the first address if client has addresses, or use delivery address from first mission
    if (!selectedAddressForLocation && selectedClientForMap) {
      if (selectedClientForMap.locations && selectedClientForMap.locations.length > 0) {
        // Use first address from client's locations
        const firstAddress = selectedClientForMap.locations.find(loc => loc.address)?.address;
        if (firstAddress) {
          setSelectedAddressForLocation(firstAddress);
        }
      } else if (deliveryLocations.length > 0) {
        // Use address from most recent delivery
        setSelectedAddressForLocation(deliveryLocations[0].address);
      }
    }
  };

  const handleMarkerClick = (location, address) => {
    setSelectedMapLocation(location);
    setSelectedAddressForLocation(address);
    setMapViewState(prev => ({
      ...prev,
      latitude: location.latitude,
      longitude: location.longitude,
      zoom: 16
    }));
  };

  const handlePickLocation = async () => {
    if (!selectedMapLocation || !selectedClientForMap) {
      toast.error(t('selectLocationOnMap'));
      return;
    }

    // Determine which address to use
    let addressToUse = selectedAddressForLocation;
    
    // If no address selected, try to find one
    if (!addressToUse) {
      // First, try to use address from client's locations (prefer one without location)
      if (selectedClientForMap.locations && selectedClientForMap.locations.length > 0) {
        // Find location without coordinates first
        const locationWithoutCoords = selectedClientForMap.locations.find(
          loc => loc.address && (!loc.location || !loc.location.latitude)
        );
        if (locationWithoutCoords) {
          addressToUse = locationWithoutCoords.address;
        } else {
          // Use first address
          addressToUse = selectedClientForMap.locations.find(loc => loc.address)?.address;
        }
      }
      
      // If still no address, use from most recent delivery
      if (!addressToUse && deliveryLocations.length > 0) {
        addressToUse = deliveryLocations[0].address;
      }
      
      // If still no address, create a default one
      if (!addressToUse) {
        addressToUse = 'Delivery Location';
      }
    }

    const result = await dataService.updateClientLocationForAddress(
      selectedClientForMap.id,
      addressToUse,
      selectedMapLocation
    );

    if (result.success) {
      toast.success(t('clientLocationUpdated'));
      setShowDeliveryLocationsMap(false);
      setSelectedClientForMap(null);
      setDeliveryLocations([]);
      setSelectedMapLocation(null);
      setSelectedAddressForLocation(null);
      loadClients();
    } else {
      toast.error(result.error || t('failedToUpdateClientLocation'));
    }
  };

  const handleAddLocation = () => {
    setSelectedLocationIndex(null);
    setNewLocation({ address: '', location: null });
    setShowLocationPicker(true);
    setMapPickerOpen(true);
  };

  const handleEditLocation = (index) => {
    setSelectedLocationIndex(index);
    setNewLocation({
      address: editingClient.locations[index].address || '',
      location: editingClient.locations[index].location || null
    });
    setShowLocationPicker(false);
    setMapPickerOpen(true);
  };

  const handleRemoveLocation = (index) => {
    const updatedLocations = [...editingClient.locations];
    updatedLocations.splice(index, 1);
    setEditingClient({ ...editingClient, locations: updatedLocations });
  };

  const handleLocationSelected = (location) => {
    setMapPickerOpen(false);
    if (selectedLocationIndex !== null) {
      if (addingNewClient) {
        setNewClient((prev) => {
          const updatedLocations = [...(prev.locations || [])];
          updatedLocations[selectedLocationIndex] = {
            ...updatedLocations[selectedLocationIndex],
            location: location
          };
          return { ...prev, locations: updatedLocations };
        });
      } else {
        const updatedLocations = [...editingClient.locations];
        updatedLocations[selectedLocationIndex] = {
          ...updatedLocations[selectedLocationIndex],
          location: location
        };
        setEditingClient({ ...editingClient, locations: updatedLocations });
      }
      setSelectedLocationIndex(null);
      setNewLocation({ address: '', location: null });
    } else {
      setNewLocation((prev) => ({ ...prev, location }));
    }
  };

  const handleSaveLocation = () => {
    if (!newLocation.address.trim() || !newLocation.location) {
      toast.error(t('enterAddressAndSelectLocation'));
      return;
    }

    if (selectedLocationIndex !== null) {
      // Update existing location
      const updatedLocations = [...editingClient.locations];
      updatedLocations[selectedLocationIndex] = {
        address: newLocation.address.trim(),
        location: newLocation.location
      };
      setEditingClient({ ...editingClient, locations: updatedLocations });
    } else {
      // Add new location
      const updatedLocations = [...(editingClient.locations || []), {
        address: newLocation.address.trim(),
        location: newLocation.location
      }];
      setEditingClient({ ...editingClient, locations: updatedLocations });
    }

    setNewLocation({ address: '', location: null });
    setSelectedLocationIndex(null);
    setShowLocationPicker(false);
    setMapPickerOpen(false);
    toast.success(t('locationSaved'));
  };

  if (loading) {
    return (
      <div className="clients-loading">
        <div>{t('loading')}...</div>
      </div>
    );
  }

  return (
    <div className="clients-container">
      <div className="clients-header">
        <button className="icon-button back-btn" onClick={() => navigate('/')}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
        </button>
        <h1>{t('clients')}</h1>
        <div className="clients-header-actions">
          <div className="clients-stats">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            <span>{allClients.length}</span>
            {searchTerm && (
              <span className="search-results-count">
                ({clients.length})
              </span>
            )}
          </div>
          <button className="icon-button add-btn" onClick={handleAddNew}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            <span>{t('addClient')}</span>
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="search-bar-container">
        <input
          type="text"
          className="search-input"
          placeholder={t('search') + '...'}
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setDisplayedCount(10); // Reset pagination when searching
          }}
        />
        {searchTerm && (
          <button
            className="clear-search-button"
            onClick={() => {
              setSearchTerm('');
              setDisplayedCount(10);
            }}
          >
            ✕
          </button>
        )}
      </div>

      <div className="clients-list">
        {addingNewClient && (
          <div className="client-card new-client-card">
            <div className="client-edit-form">
              <h3 style={{ marginBottom: '15px', color: '#667eea' }}>{t('addClient')}</h3>
              <div className="form-group">
                <label>{t('name')} *</label>
                <input
                  type="text"
                  value={newClient.name}
                  onChange={(e) =>
                    setNewClient({ ...newClient, name: e.target.value })
                  }
                  placeholder={t('clientName')}
                />
              </div>
              <div className="form-group">
                <label>{t('phone')} *</label>
                <input
                  type="tel"
                  value={newClient.phone}
                  onChange={(e) =>
                    setNewClient({ ...newClient, phone: e.target.value })
                  }
                  placeholder={t('phoneNumber')}
                />
              </div>

              <div className="locations-section">
                <div className="locations-header">
                  <h3>{t('locations')} ({newClient.locations?.length || 0})</h3>
                  <button
                    type="button"
                    className="add-location-button"
                    onClick={handleAddLocation}
                  >
                    + {t('addLocation')}
                  </button>
                </div>

                {newClient.locations?.map((loc, index) => (
                  <div key={index} className="location-item">
                    <div className="location-details">
                      <input
                        type="text"
                        value={loc.address || ''}
                        onChange={(e) => {
                          const updatedLocations = [...newClient.locations];
                          updatedLocations[index].address = e.target.value;
                          setNewClient({ ...newClient, locations: updatedLocations });
                        }}
                        placeholder={t('address')}
                      />
                      {loc.location && (
                        <div className="location-coords">
                          {loc.location.latitude.toFixed(6)}, {loc.location.longitude.toFixed(6)}
                        </div>
                      )}
                    </div>
                    <div className="location-actions">
                      <button
                        type="button"
                        className="edit-location-button"
                        onClick={() => {
                          setSelectedLocationIndex(index);
                          setNewLocation({
                            address: newClient.locations[index].address || '',
                            location: newClient.locations[index].location || null
                          });
                          setShowLocationPicker(false);
                          setMapPickerOpen(true);
                        }}
                        title={t('editMap')}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                          <circle cx="12" cy="10" r="3"/>
                        </svg>
                        <span>{t('editMap')}</span>
                      </button>
                      <button
                        type="button"
                        className="remove-location-button"
                        onClick={() => {
                          const updatedLocations = [...newClient.locations];
                          updatedLocations.splice(index, 1);
                          setNewClient({ ...newClient, locations: updatedLocations });
                        }}
                        title={t('remove')}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="18" y1="6" x2="6" y2="18"/>
                          <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}

                {showLocationPicker && selectedLocationIndex === null && (
                  <div className="location-picker-form">
                    <div className="form-group">
                      <label>{t('address')}</label>
                      <input
                        type="text"
                        value={newLocation.address}
                        onChange={(e) =>
                          setNewLocation({ ...newLocation, address: e.target.value })
                        }
                        placeholder={t('address')}
                      />
                    </div>
                    <button
                      type="button"
                      className="select-location-button"
                      onClick={() => setMapPickerOpen(true)}
                    >
                      📍 {t('selectLocation')}
                    </button>
                    {newLocation.location && (
                      <div className="location-info">
                        {t('clientLocation')}: {newLocation.location.latitude.toFixed(6)},{' '}
                        {newLocation.location.longitude.toFixed(6)}
                      </div>
                    )}
                    <div className="location-form-actions">
                      <button
                        type="button"
                        className="save-location-button"
                        onClick={() => {
                          if (!newLocation.address.trim() || !newLocation.location) {
                            toast.error(t('enterAddressAndSelectLocation'));
                            return;
                          }
                          const updatedLocations = [...(newClient.locations || []), {
                            address: newLocation.address.trim(),
                            location: newLocation.location
                          }];
                          setNewClient({ ...newClient, locations: updatedLocations });
                          setNewLocation({ address: '', location: null });
                          setShowLocationPicker(false);
                          setMapPickerOpen(false);
                          toast.success(t('locationSaved'));
                        }}
                      >
                        {t('save')} {t('locations')}
                      </button>
                      <button
                        type="button"
                        className="cancel-location-button"
                        onClick={() => {
                          setShowLocationPicker(false);
                          setMapPickerOpen(false);
                          setNewLocation({ address: '', location: null });
                        }}
                      >
                        {t('cancel')}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="client-form-actions">
                <button
                  type="button"
                  className="save-button"
                  onClick={handleSaveNew}
                >
                  {t('create')} {t('clients')}
                </button>
                <button
                  type="button"
                  className="cancel-button"
                  onClick={handleCancelAdd}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {clients.length === 0 && !addingNewClient ? (
          <div className="empty-state">
            <p>{searchTerm ? t('noResults') : t('noResults')}</p>
          </div>
        ) : (
          <>
            {clients.map((client) => (
            <div key={client.id} className="client-card">
              {editingClient?.id === client.id ? (
                <div className="client-edit-form">
                  <div className="form-group">
                    <label>Name</label>
                    <input
                      type="text"
                      value={editingClient.name}
                      onChange={(e) =>
                        setEditingClient({ ...editingClient, name: e.target.value })
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label>Phone</label>
                    <input
                      type="tel"
                      value={editingClient.phone}
                      onChange={(e) =>
                        setEditingClient({ ...editingClient, phone: e.target.value })
                      }
                    />
                  </div>

                  <div className="locations-section">
                    <div className="locations-header">
                      <h3>Locations ({editingClient.locations?.length || 0})</h3>
                      <button
                        type="button"
                        className="add-location-button"
                        onClick={handleAddLocation}
                      >
                        + {t('addLocation')}
                      </button>
                    </div>

                    {editingClient.locations?.map((loc, index) => (
                      <div key={index} className="location-item">
                        <div className="location-details">
                          <input
                            type="text"
                            value={loc.address || ''}
                            onChange={(e) => {
                              const updatedLocations = [...editingClient.locations];
                              updatedLocations[index].address = e.target.value;
                              setEditingClient({ ...editingClient, locations: updatedLocations });
                            }}
                            placeholder={t('address')}
                          />
                          {loc.location && (
                            <div className="location-coords">
                              {loc.location.latitude.toFixed(6)}, {loc.location.longitude.toFixed(6)}
                            </div>
                          )}
                        </div>
                        <div className="location-actions">
                          <button
                            type="button"
                            className="edit-location-button"
                            onClick={() => handleEditLocation(index)}
                          >
                            📍 Edit Map
                          </button>
                          <button
                            type="button"
                            className="remove-location-button"
                            onClick={() => handleRemoveLocation(index)}
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}

                    {showLocationPicker && selectedLocationIndex === null && (
                      <div className="location-picker-form">
                        <div className="form-group">
                          <label>{t('address')}</label>
                          <input
                            type="text"
                            value={newLocation.address}
                            onChange={(e) =>
                              setNewLocation({ ...newLocation, address: e.target.value })
                            }
                            placeholder={t('address')}
                          />
                        </div>
                        <button
                          type="button"
                          className="select-location-button"
                          onClick={() => setMapPickerOpen(true)}
                        >
                          📍 {t('selectLocation')}
                        </button>
                        {newLocation.location && (
                          <div className="location-info">
                            Location: {newLocation.location.latitude.toFixed(6)},{' '}
                            {newLocation.location.longitude.toFixed(6)}
                          </div>
                        )}
                        <div className="location-form-actions">
                          <button
                            type="button"
                            className="save-location-button"
                            onClick={handleSaveLocation}
                          >
                            {t('save')} {t('locations')}
                          </button>
                          <button
                            type="button"
                            className="cancel-location-button"
                            onClick={() => {
                              setShowLocationPicker(false);
                              setMapPickerOpen(false);
                              setNewLocation({ address: '', location: null });
                              setSelectedLocationIndex(null);
                            }}
                          >
                            {t('cancel')}
                          </button>
                        </div>
                      </div>
                    )}

                  </div>

                  <div className="client-form-actions">
                    <button
                      type="button"
                      className="save-button"
                      onClick={handleSave}
                    >
                      {t('save')}
                    </button>
                    <button
                      type="button"
                      className="cancel-button"
                      onClick={handleCancelEdit}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="client-view">
                  <div className="client-info">
                    <h3>{client.name}</h3>
                    <p className="client-phone">{client.phone}</p>
                    <div className="client-locations">
                      <strong>{t('locations')} ({client.locations?.length || 0})</strong>
                      {client.locations?.map((loc, index) => (
                        <div key={index} className="location-display">
                          <span className="location-address">{loc.address || t('address')}</span>
                          {loc.location && loc.location.latitude ? (
                            <span className="location-coords-small">
                              {loc.location.latitude.toFixed(4)}, {loc.location.longitude.toFixed(4)}
                            </span>
                          ) : (
                            <span className="location-missing-badge">{t('noExactLocation')}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="client-actions">
                    <button
                      type="button"
                      className="action-btn locations-btn"
                      onClick={() => handleViewDeliveryLocations(client)}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                        <circle cx="12" cy="10" r="3"/>
                      </svg>
                      <span>{t('viewLocations')}</span>
                    </button>
                    <button
                      type="button"
                      className="action-btn edit-btn"
                      onClick={() => handleEdit(client)}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                      </svg>
                      <span>{t('edit')}</span>
                    </button>
                    <button
                      type="button"
                      className="action-btn delete-btn"
                      onClick={() => handleDelete(client.id)}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                      </svg>
                      <span>{t('delete')}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
            ))}
            {displayedCount < allClients.length && !searchTerm && (
              <div className="load-more-container">
                <button className="load-more-button" onClick={loadMore}>
                  {t('loadMore')} ({allClients.length - displayedCount} {t('remaining')})
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {mapPickerOpen && (
        <MapPicker
          initialLocation={newLocation.location}
          onLocationSelect={handleLocationSelected}
          onClose={() => {
            setMapPickerOpen(false);
            if (selectedLocationIndex !== null) {
              setSelectedLocationIndex(null);
              setNewLocation({ address: '', location: null });
            }
          }}
          title={t('selectLocation')}
        />
      )}

      {/* Delivery Locations Map Modal */}
      {showDeliveryLocationsMap && selectedClientForMap && (
        <div className="delivery-locations-modal-overlay" onClick={() => setShowDeliveryLocationsMap(false)}>
          <div className="delivery-locations-modal" onClick={(e) => e.stopPropagation()}>
            <div className="delivery-locations-modal-header">
              <h2>{t('deliveryAddress')} {t('locations')} {t('for')} {selectedClientForMap.name}</h2>
              <button
                className="close-button"
                onClick={() => {
                  setShowDeliveryLocationsMap(false);
                  setSelectedClientForMap(null);
                  setDeliveryLocations([]);
                  setSelectedMapLocation(null);
                  setSelectedAddressForLocation(null);
                }}
              >
                ×
              </button>
            </div>
            
            <div className="delivery-locations-content">
              <div className="delivery-locations-map-container">
                <h3>{t('clickOnMapToSelect')}</h3>
                {!mapboxConfig.isConfigured ? (
                  <MapboxConfigMissing />
                ) : (
                <Map
                  {...mapViewState}
                  onMove={evt => setMapViewState(evt.viewState)}
                  onClick={handleMapClick}
                  mapboxAccessToken={mapboxConfig.accessToken}
                  style={{ width: '100%', height: '500px' }}
                  mapStyle={mapboxConfig.styleURL}
                >
                  {/* Markers for all delivery locations - clickable */}
                  {deliveryLocations.map((loc, index) => (
                    <Marker
                      key={index}
                      longitude={loc.location.longitude}
                      latitude={loc.location.latitude}
                      anchor="bottom"
                      onClick={(e) => {
                        e.originalEvent.stopPropagation();
                        handleMarkerClick(loc.location, loc.address);
                      }}
                    >
                      <div 
                        className={`delivery-location-marker clickable ${selectedMapLocation && selectedMapLocation.latitude === loc.location.latitude && selectedMapLocation.longitude === loc.location.longitude ? 'selected' : ''}`}
                        title={`${t('clickToSelect')}: ${loc.address}`}
                      >
                        📍
                      </div>
                    </Marker>
                  ))}
                  
                  {/* Selected location marker (from map click) */}
                  {selectedMapLocation && (
                    <Marker
                      longitude={selectedMapLocation.longitude}
                      latitude={selectedMapLocation.latitude}
                      anchor="bottom"
                    >
                      <div className="selected-location-marker" title={t('selectedLocation')}>✓</div>
                    </Marker>
                  )}
                </Map>
                )}
                
                {selectedMapLocation && (
                  <div className="selected-location-info">
                    <p><strong>{t('selectedLocation')}:</strong> {selectedMapLocation.latitude.toFixed(6)}, {selectedMapLocation.longitude.toFixed(6)}</p>
                    {selectedAddressForLocation && (
                      <p><strong>{t('for')} {t('address')}:</strong> {selectedAddressForLocation}</p>
                    )}
                  </div>
                )}
              </div>
              
              <div className="delivery-locations-actions">
                <button
                  type="button"
                  className="pick-location-button"
                  onClick={handlePickLocation}
                  disabled={!selectedMapLocation}
                >
                  ✓ {t('pickThisLocation')}
                </button>
                <button
                  type="button"
                  className="cancel-button"
                  onClick={() => {
                    setShowDeliveryLocationsMap(false);
                    setSelectedClientForMap(null);
                    setDeliveryLocations([]);
                    setSelectedMapLocation(null);
                    setSelectedAddressForLocation(null);
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

