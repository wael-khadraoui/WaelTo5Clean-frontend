import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { dataService, userService, authService } from '../App';
import toast from 'react-hot-toast';
import { useTranslation } from '../hooks/useTranslation';
import MapPicker from '../components/MapPicker';
import './CreateMissionPage.css';

export default function CreateMissionPage() {
  const { t } = useTranslation();
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryLocation, setDeliveryLocation] = useState({ latitude: 0, longitude: 0 });
  const [stores, setStores] = useState([{ 
    name: '', 
    address: '', 
    location: { latitude: 0, longitude: 0 }, 
    phone: null,
    items: [{ name: '', price: '', description: '' }] 
  }]);
  const [deliveryGuys, setDeliveryGuys] = useState([]);
  const [assignedTo, setAssignedTo] = useState('');
  const [loading, setLoading] = useState(false);
  const [showDeliveryPicker, setShowDeliveryPicker] = useState(false);
  const [showStorePicker, setShowStorePicker] = useState({ storeIndex: null, isOpen: false });
  const [foundClient, setFoundClient] = useState(null);
  const [searchingClient, setSearchingClient] = useState(false);
  const [showLocationSelector, setShowLocationSelector] = useState(false);
  const [selectedClientLocations, setSelectedClientLocations] = useState([]);
  const [autofilledLocation, setAutofilledLocation] = useState(null);
  const [showLocationDropdown, setShowLocationDropdown] = useState(false);
  const [deliveryAddressFocused, setDeliveryAddressFocused] = useState(false);
  const [clientSuggestions, setClientSuggestions] = useState([]);
  const [showNameSuggestions, setShowNameSuggestions] = useState(false);
  const [showPhoneSuggestions, setShowPhoneSuggestions] = useState(false);
  const [nameFocused, setNameFocused] = useState(false);
  const [phoneFocused, setPhoneFocused] = useState(false);
  const nameInputRef = useRef(null);
  const phoneInputRef = useRef(null);
  const [restaurantSuggestions, setRestaurantSuggestions] = useState({});
  const [foundRestaurants, setFoundRestaurants] = useState({});
  const [searchingRestaurants, setSearchingRestaurants] = useState({});
  const [showRestaurantSuggestions, setShowRestaurantSuggestions] = useState({});
  const [restaurantFocused, setRestaurantFocused] = useState({});
  const [systemParameters, setSystemParameters] = useState(null);
  const [deliveryFee, setDeliveryFee] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    loadDeliveryGuys();
    loadSystemParameters();
  }, []);

  const loadSystemParameters = async () => {
    try {
      const params = await dataService.getSystemParameters();
      setSystemParameters(params);
    } catch (error) {
    }
  };

  useEffect(() => {
    const searchClients = async () => {
      if (clientName.trim().length >= 2 || clientPhone.trim().length >= 2) {
        setSearchingClient(true);
        const searchTerm = clientName.trim() || clientPhone.trim();
        const results = await dataService.searchClients(searchTerm);
        
        setClientSuggestions(results);
        
        if (nameFocused && clientName.trim().length >= 2) {
          setShowNameSuggestions(true);
        }
        if (phoneFocused && clientPhone.trim().length >= 2) {
          setShowPhoneSuggestions(true);
        }
        
        const exactMatch = results.find(client => 
          (clientPhone.trim() && client.phone === clientPhone.trim()) || 
          (clientName.trim() && client.name?.toLowerCase() === clientName.trim().toLowerCase())
        );
        
        if (exactMatch) {
          setFoundClient(exactMatch);
        } else {
          setFoundClient(null);
        }
        setSearchingClient(false);
      } else if (!clientName.trim() && !clientPhone.trim()) {
        setFoundClient(null);
        setClientSuggestions([]);
        setShowNameSuggestions(false);
        setShowPhoneSuggestions(false);
        setSearchingClient(false);
      }
    };

    const timeoutId = setTimeout(searchClients, 300);
    return () => clearTimeout(timeoutId);
  }, [clientName, clientPhone, nameFocused, phoneFocused]);

  const loadDeliveryGuys = async () => {
    try {
      const guys = await userService.getAllUsers();
      // Include both delivery guys and monitors (monitors can also work on missions)
      const deliveryGuysList = guys.filter(user => 
        user.role === 'delivery_guy' || user.role === 'monitor'
      );
      setDeliveryGuys(deliveryGuysList);
    } catch (error) {
    }
  };

  const addStore = () => {
    setStores([...stores, { 
      name: '', 
      address: '', 
      location: { latitude: 0, longitude: 0 }, 
      phone: null,
      items: [{ name: '', price: '', description: '' }] 
    }]);
  };

  const removeStore = (index) => {
    setStores(stores.filter((_, i) => i !== index));
  };

  const updateStore = (index, field, value) => {
    const newStores = [...stores];
    newStores[index][field] = value;
    setStores(newStores);
  };

  const addStoreItem = (storeIndex) => {
    const newStores = [...stores];
    newStores[storeIndex].items.push({ name: '', price: '', description: '' });
    setStores(newStores);
  };

  const removeStoreItem = (storeIndex, itemIndex) => {
    const newStores = [...stores];
    newStores[storeIndex].items = newStores[storeIndex].items.filter((_, i) => i !== itemIndex);
    setStores(newStores);
  };

  const updateStoreItem = (storeIndex, itemIndex, field, value) => {
    const newStores = [...stores];
    newStores[storeIndex].items[itemIndex][field] = value;
    setStores(newStores);
  };

  const handleStoreLocationSelect = (storeIndex) => {
    setShowStorePicker({ storeIndex, isOpen: true });
  };

  const onStoreLocationSelected = (storeIndex, location) => {
    const newStores = [...stores];
    newStores[storeIndex].location = location;
    setStores(newStores);
    setShowStorePicker({ storeIndex: null, isOpen: false });
    toast.success(t('locationSelected'));
  };

  const searchRestaurants = async (storeIndex, searchTerm) => {
    if (!searchTerm || searchTerm.trim().length < 2) {
      setRestaurantSuggestions(prev => ({ ...prev, [storeIndex]: [] }));
      setShowRestaurantSuggestions(prev => ({ ...prev, [storeIndex]: false }));
      setFoundRestaurants(prev => ({ ...prev, [storeIndex]: null }));
      return;
    }

    setSearchingRestaurants(prev => ({ ...prev, [storeIndex]: true }));
    const results = await dataService.searchRestaurants(searchTerm);
    setRestaurantSuggestions(prev => ({ ...prev, [storeIndex]: results }));
    
    const exactMatch = results.find(restaurant => 
      restaurant.name?.toLowerCase() === searchTerm.trim().toLowerCase()
    );
    
    if (exactMatch) {
      setFoundRestaurants(prev => ({ ...prev, [storeIndex]: exactMatch }));
    } else {
      setFoundRestaurants(prev => ({ ...prev, [storeIndex]: null }));
    }
    
    setSearchingRestaurants(prev => ({ ...prev, [storeIndex]: false }));
    
    if (restaurantFocused[storeIndex]) {
      setShowRestaurantSuggestions(prev => ({ ...prev, [storeIndex]: true }));
    }
  };

  const handleSelectRestaurantSuggestion = (storeIndex, restaurant) => {
    const newStores = [...stores];
    newStores[storeIndex].name = restaurant.name;
    newStores[storeIndex].address = restaurant.address;
    newStores[storeIndex].phone = restaurant.phone || null;
    if (restaurant.location) {
      newStores[storeIndex].location = restaurant.location;
    }
    setStores(newStores);
    setFoundRestaurants(prev => ({ ...prev, [storeIndex]: restaurant }));
    setShowRestaurantSuggestions(prev => ({ ...prev, [storeIndex]: false }));
    setRestaurantFocused(prev => ({ ...prev, [storeIndex]: false }));
    toast.success(t('restaurantAutofilled'));
  };

  const handleSaveRestaurant = async (storeIndex) => {
    const store = stores[storeIndex];
    if (!store.name || !store.location.latitude) {
      toast.error(t('nameAndLocationRequired'));
      return;
    }

    const restaurantData = {
      name: store.name.trim(),
      address: store.address ? store.address.trim() : '',
      phone: store.phone || null,
      location: store.location
    };

    if (foundRestaurants[storeIndex] && foundRestaurants[storeIndex].id) {
      const result = await dataService.updateRestaurant(
        foundRestaurants[storeIndex].id,
        restaurantData
      );
      if (result.success) {
        toast.success(t('restaurantUpdated'));
        setFoundRestaurants(prev => ({
          ...prev,
          [storeIndex]: { ...foundRestaurants[storeIndex], ...restaurantData }
        }));
      } else {
        toast.error(result.error || t('updateFailed'));
      }
    } else {
      const result = await dataService.saveRestaurant(restaurantData);
      if (result.success) {
        toast.success(t('restaurantSaved'));
        setFoundRestaurants(prev => ({
          ...prev,
          [storeIndex]: { ...restaurantData, id: result.restaurantId }
        }));
      } else {
        toast.error(result.error || t('saveFailed'));
      }
    }
  };

  const handleAutofillRestaurant = (storeIndex, restaurant) => {
    const newStores = [...stores];
    newStores[storeIndex].name = restaurant.name;
    newStores[storeIndex].address = restaurant.address;
    newStores[storeIndex].phone = restaurant.phone || null;
    if (restaurant.location) {
      newStores[storeIndex].location = restaurant.location;
    }
    setStores(newStores);
    setFoundRestaurants(prev => ({ ...prev, [storeIndex]: restaurant }));
    toast.success(t('restaurantAutofilled'));
  };

  const handleDeliveryLocationSelect = () => {
    setShowDeliveryPicker(true);
  };

  const onDeliveryLocationSelected = (location) => {
    setDeliveryLocation(location);
    toast.success(t('locationSelected'));
  };

  const handleAutofillClient = (client) => {
    setClientName(client.name);
    setClientPhone(client.phone);
    setFoundClient(client);
    
    if (client.locations && client.locations.length > 0) {
      const latestLocation = client.locations[client.locations.length - 1];
      setDeliveryAddress(latestLocation.address || '');
      if (latestLocation.location) {
        setDeliveryLocation(latestLocation.location);
      }
      setAutofilledLocation(latestLocation.address || '');
    }
    toast.success(t('clientAutofilled'));
  };

  const handleSelectLocationFromDropdown = (location) => {
    setDeliveryAddress(location.address || '');
    if (location.location) {
      setDeliveryLocation(location.location);
    }
    setAutofilledLocation(location.address || '');
    setShowLocationDropdown(false);
    setDeliveryAddressFocused(false);
    toast.success(t('locationSelected'));
  };

  const handleSelectClientSuggestion = (client) => {
    setClientName(client.name);
    setClientPhone(client.phone);
    setFoundClient(client);
    setShowNameSuggestions(false);
    setShowPhoneSuggestions(false);
    setNameFocused(false);
    setPhoneFocused(false);
    
    if (nameInputRef.current) nameInputRef.current.blur();
    if (phoneInputRef.current) phoneInputRef.current.blur();
    
    if (client.locations && client.locations.length > 0) {
      const latestLocation = client.locations[client.locations.length - 1];
      setDeliveryAddress(latestLocation.address || '');
      if (latestLocation.location) {
        setDeliveryLocation(latestLocation.location);
      }
      setAutofilledLocation(latestLocation.address || '');
    }
    
    toast.success(t('clientAutofilled'));
  };

  const handleSelectClientLocation = (location) => {
    setDeliveryAddress(location.address || '');
    if (location.location) {
      setDeliveryLocation(location.location);
    }
    setAutofilledLocation(location.address || '');
    setShowLocationSelector(false);
    toast.success(t('locationSelected'));
  };

  const handleSaveClient = async () => {
    if (!clientName.trim() || !clientPhone.trim()) {
      toast.error(t('nameAndPhoneRequired'));
      return;
    }

    if (!deliveryAddress.trim() && (!deliveryLocation || !deliveryLocation.latitude)) {
      toast.error(t('addressOrLocationRequired'));
      return;
    }

    const currentAddress = deliveryAddress.trim() || '';
    const newLocation = {
      address: currentAddress,
      location: deliveryLocation.latitude ? deliveryLocation : null
    };

    if (foundClient && foundClient.id) {
      const existingLocations = foundClient.locations || [];
      
      const existingIndex = existingLocations.findIndex(
        loc => loc.address && loc.address.trim().toLowerCase() === currentAddress.toLowerCase()
      );
      
      if (existingIndex >= 0) {
        existingLocations[existingIndex] = newLocation;
      } else {
        existingLocations.push(newLocation);
      }
      
      const result = await dataService.updateClient(foundClient.id, {
        name: clientName.trim(),
        phone: clientPhone.trim(),
        locations: existingLocations
      });
      
      if (result.success) {
        toast.success(t('clientUpdated'));
        const updatedClient = { ...foundClient, locations: existingLocations };
        setFoundClient(updatedClient);
        setAutofilledLocation(currentAddress);
      } else {
        toast.error(result.error || t('updateFailed'));
      }
    } else {
      const clientData = {
        name: clientName.trim(),
        phone: clientPhone.trim(),
        locations: [newLocation]
      };

      const result = await dataService.saveClient(clientData);
      if (result.success) {
        toast.success(t('clientCreated'));
        setFoundClient({ ...clientData, id: result.clientId });
        setAutofilledLocation(currentAddress);
      } else {
        toast.error(result.error || t('saveFailed'));
      }
    }
  };

  const handleAddLocationToClient = async () => {
    if (!foundClient || !foundClient.id) {
      toast.error(t('noClientSelected'));
      return;
    }

    if (!deliveryAddress.trim() && (!deliveryLocation || !deliveryLocation.latitude)) {
      toast.error(t('addressOrLocationRequired'));
      return;
    }

    const currentAddress = deliveryAddress.trim() || '';
    const newLocation = {
      address: currentAddress,
      location: deliveryLocation.latitude ? deliveryLocation : null
    };

    const existingLocations = foundClient.locations || [];
    
    const existingIndex = existingLocations.findIndex(
      loc => loc.address && loc.address.trim().toLowerCase() === currentAddress.toLowerCase()
    );
    
    if (existingIndex >= 0) {
      existingLocations[existingIndex] = newLocation;
    } else {
      existingLocations.push(newLocation);
    }
    
    const result = await dataService.updateClient(foundClient.id, {
      name: clientName.trim(),
      phone: clientPhone.trim(),
      locations: existingLocations
    });
    
    if (result.success) {
      toast.success(t('locationAdded'));
      const updatedClient = { ...foundClient, locations: existingLocations };
      setFoundClient(updatedClient);
      setAutofilledLocation(currentAddress);
    } else {
      toast.error(result.error || t('failedToAddLocation'));
    }
  };

  const isNewLocation = () => {
    if (!foundClient || !foundClient.id || !foundClient.locations || foundClient.locations.length === 0) {
      return false;
    }
    
    const currentAddress = deliveryAddress.trim().toLowerCase();
    return !foundClient.locations.some(
      loc => loc.address && loc.address.trim().toLowerCase() === currentAddress
    );
  };

  const hasClientDataChanged = () => {
    if (!clientName.trim() || !clientPhone.trim()) {
      return false;
    }

    if (!foundClient || !foundClient.id) {
      return true;
    }

    const nameChanged = foundClient.name?.trim().toLowerCase() !== clientName.trim().toLowerCase();
    const phoneChanged = foundClient.phone?.trim() !== clientPhone.trim();
    const addressChanged = isNewLocation();
    
    return nameChanged || phoneChanged || addressChanged;
  };

  const calculateStoresTotal = () => {
    const total = stores.reduce((sum, store) => {
      return sum + (store.items || []).reduce((storeSum, item) => {
        return storeSum + (parseFloat(item.price) || 0);
      }, 0);
    }, 0);
    return Math.round(total * 100) / 100;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!clientName || !clientPhone) {
      toast.error(t('nameAndPhoneRequired'));
      return;
    }

    if (!deliveryAddress.trim() && (!deliveryLocation || !deliveryLocation.latitude)) {
      toast.error(t('addressOrLocationRequired'));
      return;
    }

    if (stores.length === 0) {
      toast.error(t('atLeastOneStore'));
      return;
    }

    for (let i = 0; i < stores.length; i++) {
      const store = stores[i];
      if (!store.name || !store.name.trim()) {
        toast.error(`${t('store')} ${i + 1}: ${t('storeNameRequired')}`);
        return;
      }
      if (!store.location || !store.location.latitude) {
        toast.error(`${t('store')} ${i + 1}: ${t('storeLocationRequired')}`);
        return;
      }
      if (!store.items || store.items.length === 0) {
        toast.error(`${t('store')} ${i + 1}: ${t('atLeastOneItem')}`);
        return;
      }
      if (store.items.some(item => !item.name || !item.name.trim())) {
        toast.error(`${t('store')} ${i + 1}: ${t('allItemsNeedNames')}`);
        return;
      }
    }

    setLoading(true);

    const itemsTotal = stores.reduce((sum, store) => {
      return sum + (store.items || []).reduce((storeSum, item) => {
        return storeSum + (parseFloat(item.price) || 0);
      }, 0);
    }, 0);
    
    const manualDeliveryFee = parseFloat(deliveryFee) || 0;
    const totalAmount = itemsTotal + manualDeliveryFee;

    const missionData = {
      clientName,
      clientPhone,
      clientId: foundClient?.id || null,
      deliveryAddress: deliveryAddress.trim() || '',
      deliveryLocation: deliveryLocation.latitude ? deliveryLocation : null,
      stores: stores.map((store, storeIndex) => {
        const foundRestaurant = foundRestaurants[storeIndex];
        return {
        name: store.name.trim(),
        address: store.address ? store.address.trim() : '',
        location: store.location,
          phone: foundRestaurant?.phone || null,
          restaurantId: foundRestaurant?.id || null,
        items: store.items.map(item => ({
          name: item.name.trim(),
            price: item.price && item.price.trim() ? parseFloat(item.price) : null,
          description: (item.description || '').trim()
        }))
        };
      }),
      itemsTotal: itemsTotal,
      deliveryFee: manualDeliveryFee,
      totalAmount: totalAmount,
      assignedTo: assignedTo || null,
      createdBy: authService.getCurrentUser()?.uid
    };

    const result = await dataService.createMission(missionData);
    setLoading(false);

    if (result.success) {
      toast.success(t('missionCreated'));
      navigate('/missions');
    } else {
      toast.error(result.error || t('creationFailed'));
    }
  };

  return (
    <div className="create-mission-page">
        <div className="create-mission-header">
        <button className="icon-button back-btn" onClick={() => navigate('/')} title="Back">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          </button>
        <h1>{t('createNewMission')}</h1>
        </div>

        <form onSubmit={handleSubmit} className="create-mission-form">
        {/* Client Section */}
        <div className="form-card">
          <div className="card-header">
            <div className="icon-label">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
              <span>{t('client')}</span>
            </div>
          </div>
          
          <div className="input-group">
            <div className="input-wrapper">
              <svg className="input-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
              <input
                     ref={nameInputRef}
                type="text"
                value={clientName}
                     onChange={(e) => {
                       setClientName(e.target.value);
                       if (!e.target.value.trim()) {
                         setFoundClient(null);
                         setShowNameSuggestions(false);
                       }
                     }}
                     onFocus={() => {
                       setNameFocused(true);
                       if (clientName.trim().length >= 2 && clientSuggestions.length > 0) {
                         setShowNameSuggestions(true);
                       }
                     }}
                     onBlur={() => {
                       setTimeout(() => {
                         setNameFocused(false);
                         setShowNameSuggestions(false);
                       }, 200);
                     }}
                placeholder={t('name')}
                required
              />
              {searchingClient && <span className="loading-spinner">⟳</span>}
                </div>
                
                {showNameSuggestions && clientSuggestions.length > 0 && (
              <div className="suggestions-dropdown">
                    {clientSuggestions.map((client) => (
                      <div
                        key={client.id}
                        className="suggestion-item"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleSelectClientSuggestion(client);
                        }}
                      >
                        <div className="suggestion-name">{client.name}</div>
                        <div className="suggestion-phone">{client.phone}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

          <div className="input-group">
            <div className="input-wrapper">
              <svg className="input-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
              </svg>
              <input
                     ref={phoneInputRef}
                type="tel"
                value={clientPhone}
                     onChange={(e) => {
                       setClientPhone(e.target.value);
                       if (!e.target.value.trim()) {
                         setFoundClient(null);
                         setShowPhoneSuggestions(false);
                       }
                     }}
                     onFocus={() => {
                       setPhoneFocused(true);
                       if (clientPhone.trim().length >= 2 && clientSuggestions.length > 0) {
                         setShowPhoneSuggestions(true);
                       }
                     }}
                     onBlur={() => {
                       setTimeout(() => {
                         setPhoneFocused(false);
                         setShowPhoneSuggestions(false);
                       }, 200);
                     }}
                placeholder={t('phone')}
                required
              />
              {searchingClient && <span className="loading-spinner">⟳</span>}
                </div>
                
                 {showPhoneSuggestions && clientSuggestions.length > 0 && (
              <div className="suggestions-dropdown">
                     {clientSuggestions.map((client) => (
                       <div
                         key={client.id}
                         className="suggestion-item"
                         onMouseDown={(e) => {
                           e.preventDefault();
                           handleSelectClientSuggestion(client);
                         }}
                       >
                         <div className="suggestion-name">{client.name}</div>
                         <div className="suggestion-phone">{client.phone}</div>
                       </div>
                     ))}
                   </div>
                 )}
            </div>
            
            {foundClient && foundClient.id && (
            <button type="button" className="action-btn autofill-btn" onClick={() => handleAutofillClient(foundClient)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
              </svg>
              Autofill
            </button>
          )}

          {clientName.trim() && clientPhone.trim() && (!foundClient || !foundClient.id) && (
                <button
                  type="button"
              className="action-btn save-btn" 
              onClick={handleSaveClient}
              disabled={!deliveryAddress.trim() && (!deliveryLocation || !deliveryLocation.latitude)}
                >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                <polyline points="17 21 17 13 7 13 7 21"/>
                <polyline points="7 3 7 8 15 8"/>
              </svg>
              {t('saveClient')}
                </button>
          )}
        </div>

        {/* Delivery Location */}
        <div className="form-card">
          <div className="card-header">
            <div className="icon-label">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                <circle cx="12" cy="10" r="3"/>
              </svg>
              <span>{t('clientLocation')}</span>
            </div>
          </div>

          <div className="input-group">
            <div className="input-wrapper">
              <svg className="input-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                <circle cx="12" cy="10" r="3"/>
              </svg>
              <input
                type="text"
                value={deliveryAddress}
                onChange={(e) => {
                  setDeliveryAddress(e.target.value);
                  if (autofilledLocation && e.target.value.trim() !== autofilledLocation) {
                    setAutofilledLocation(null);
                  }
                  if (e.target.value.trim()) {
                    setShowLocationDropdown(false);
                  }
                }}
                onFocus={() => {
                  setDeliveryAddressFocused(true);
                  if (foundClient && foundClient.id && foundClient.locations && foundClient.locations.length > 0) {
                    setShowLocationDropdown(true);
                  }
                }}
                onBlur={() => {
                  setTimeout(() => {
                    setDeliveryAddressFocused(false);
                    setShowLocationDropdown(false);
                  }, 200);
                }}
                placeholder="Address (optional)"
              />
              {autofilledLocation && deliveryAddress.trim() === autofilledLocation && (
                <span className="autofill-badge">✨</span>
              )}
              {foundClient && foundClient.id && isNewLocation() && (deliveryAddress.trim() || deliveryLocation.latitude) && (
                <button
                  type="button"
                  className="add-location-btn"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleAddLocationToClient();
                  }}
                  title="Add location"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19"/>
                    <line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                </button>
              )}
            </div>
            
            {showLocationDropdown && foundClient && foundClient.id && foundClient.locations && foundClient.locations.length > 0 && (
              <div className="suggestions-dropdown">
                {foundClient.locations.slice().reverse().map((loc, index) => (
                  <div
                    key={foundClient.locations.length - 1 - index}
                    className="suggestion-item"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelectLocationFromDropdown(loc);
                    }}
                  >
                    <div className="suggestion-name">{loc.address || t('noAddress')}</div>
                    {index === 0 && foundClient.locations.length > 1 && (
                      <span className="latest-badge">{t('latest')}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <button type="button" className="action-btn map-btn" onClick={handleDeliveryLocationSelect}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
              <circle cx="12" cy="10" r="3"/>
            </svg>
            {t('selectLocation')}
          </button>
        </div>

        {/* Stores Section */}
        <div className="form-card">
          <div className="card-header">
            <div className="icon-label">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                <polyline points="9 22 9 12 15 12 15 22"/>
              </svg>
              <span>{t('stores')}</span>
            </div>
            <button type="button" className="add-store-button" onClick={addStore}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              <span>{t('addStore')}</span>
            </button>
          </div>

            {stores.map((store, storeIndex) => (
              <div key={storeIndex} className="store-card">
                <div className="store-header">
                <span className="store-number">#{storeIndex + 1}</span>
                  {stores.length > 1 && (
                  <button type="button" className="remove-store-button" onClick={() => removeStore(storeIndex)}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18"/>
                      <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                    <span>{t('remove')}</span>
                    </button>
                  )}
                </div>
                
              <div className="input-group">
                <div className="input-wrapper">
                  <svg className="input-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                  </svg>
              <input
                type="text"
                        value={store.name}
                        onChange={(e) => {
                          updateStore(storeIndex, 'name', e.target.value);
                          const searchValue = e.target.value;
                          setTimeout(() => {
                            searchRestaurants(storeIndex, searchValue);
                          }, 300);
                        }}
                        onFocus={() => {
                          setRestaurantFocused(prev => ({ ...prev, [storeIndex]: true }));
                          if (store.name.trim().length >= 2) {
                            setShowRestaurantSuggestions(prev => ({ ...prev, [storeIndex]: true }));
                          }
                        }}
                        onBlur={() => {
                          setTimeout(() => {
                            setRestaurantFocused(prev => ({ ...prev, [storeIndex]: false }));
                            setShowRestaurantSuggestions(prev => ({ ...prev, [storeIndex]: false }));
                          }, 200);
                        }}
                    placeholder={t('storeName')}
                required
              />
                  {searchingRestaurants[storeIndex] && <span className="loading-spinner">⟳</span>}
            </div>
                    
                    {showRestaurantSuggestions[storeIndex] && restaurantSuggestions[storeIndex]?.length > 0 && (
                  <div className="suggestions-dropdown">
                        {restaurantSuggestions[storeIndex].map((restaurant) => (
                          <div
                            key={restaurant.id}
                            className="suggestion-item"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              handleSelectRestaurantSuggestion(storeIndex, restaurant);
                            }}
                          >
                            <div className="suggestion-name">{restaurant.name}</div>
                        {restaurant.address && <div className="suggestion-phone">{restaurant.address}</div>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  {foundRestaurants[storeIndex] && foundRestaurants[storeIndex].id && (
                <button type="button" className="action-btn autofill-btn" onClick={() => handleAutofillRestaurant(storeIndex, foundRestaurants[storeIndex])}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                  </svg>
                  {t('autofillClient')}
                      </button>
              )}

              <button type="button" className="action-btn map-btn" onClick={() => handleStoreLocationSelect(storeIndex)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                  <circle cx="12" cy="10" r="3"/>
                </svg>
                {store.location.latitude ? t('changeLocation') : t('selectLocation')}
                      </button>
                
              <div className="items-section">
                <div className="items-header">
                  <span>{t('items')}</span>
                </div>
                
                  {store.items.map((item, itemIndex) => (
                  <div key={itemIndex} className="item-card">
                    <div className="item-row">
                        <input
                          type="text"
                          value={item.name}
                          onChange={(e) => updateStoreItem(storeIndex, itemIndex, 'name', e.target.value)}
                        placeholder={t('itemName')}
                          required
                        />
                        <input
                          type="number"
                          step="0.01"
                          value={item.price}
                          onChange={(e) => updateStoreItem(storeIndex, itemIndex, 'price', e.target.value)}
                        onWheel={(e) => e.target.blur()}
                        placeholder={t('itemPrice')}
                        />
                      {store.items.length > 1 && (
                        <button
                          type="button"
                          className="remove-item-button"
                          onClick={() => removeStoreItem(storeIndex, itemIndex)}
                          title="Remove item"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                          </svg>
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      className="item-description"
                      value={item.description}
                      onChange={(e) => updateStoreItem(storeIndex, itemIndex, 'description', e.target.value)}
                      placeholder={t('itemDescription') + ' (' + t('optional') + ')'}
                    />
                    </div>
                  ))}
                
                <button type="button" className="add-item-button" onClick={() => addStoreItem(storeIndex)}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19"/>
                    <line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                  <span>{t('addItem')}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>

        {/* Delivery Fee & Total */}
        <div className="form-card">
          <div className="card-header">
            <div className="icon-label">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="1" x2="12" y2="23"/>
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
              </svg>
              <span>{t('feeAndTotal')}</span>
            </div>
          </div>

          <div className="input-group">
            <div className="input-wrapper">
              <svg className="input-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="1" x2="12" y2="23"/>
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
              </svg>
              <input
                type="number"
                step="0.01"
                min="0"
                value={deliveryFee}
                onChange={(e) => setDeliveryFee(e.target.value)}
                onWheel={(e) => e.target.blur()}
                placeholder={t('deliveryFee')}
                required
              />
            </div>
                </div>
                
          <div className="total-section">
            <div className="total-row">
              <span>{t('items')}:</span>
              <strong>{calculateStoresTotal().toFixed(2)} DT</strong>
                    </div>
            <div className="total-row">
              <span>{t('delivery')}:</span>
              <strong>{parseFloat(deliveryFee || 0).toFixed(2)} DT</strong>
                        </div>
            <div className="total-row total-final">
              <span>{t('total')}:</span>
              <strong>{(calculateStoresTotal() + parseFloat(deliveryFee || 0)).toFixed(2)} DT</strong>
                          </div>
                      </div>
          </div>

        {/* Assignment */}
        {deliveryGuys.length > 0 && (
          <div className="form-card">
            <div className="card-header">
              <div className="icon-label">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
                <span>{t('assign')} ({t('optional')})</span>
            </div>
          </div>

            <div className="input-group">
              <div className="input-wrapper">
                <svg className="input-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                </svg>
              <select
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
              >
                  <option value="">{t('selectDeliveryGuy')}</option>
                {deliveryGuys.map((guy) => (
                  <option key={guy.id} value={guy.id}>
                    {guy.name || guy.email}
                  </option>
                ))}
              </select>
            </div>
          </div>
          </div>
        )}

        {/* Warning */}
        {hasClientDataChanged() && (
          <div className="warning-card">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <span>{foundClient && foundClient.id ? t('newLocationDetected') : t('newClient')}</span>
            <button
              type="button"
              className="action-btn save-btn"
              onClick={async () => {
                if (!deliveryAddress.trim() && (!deliveryLocation || !deliveryLocation.latitude)) {
                  toast.error(t('addressOrLocationRequired'));
                  return;
                }
                const confirmed = window.confirm(
                  foundClient && foundClient.id
                    ? t('saveUpdatedClientInfo')
                    : t('saveNewClient')
                );
                if (confirmed) {
                  await handleSaveClient();
                }
              }}
              disabled={!deliveryAddress.trim() && (!deliveryLocation || !deliveryLocation.latitude)}
            >
              Save
            </button>
          </div>
        )}

        {/* Submit */}
        <div className="form-actions">
          <button type="button" className="action-btn cancel-btn" onClick={() => navigate('/missions')}>
            {t('cancel')}
          </button>
          <button type="submit" className="action-btn submit-btn" disabled={loading}>
            {loading ? t('creating') + '...' : t('createMission')}
            </button>
          </div>
        </form>

      {showDeliveryPicker && (
        <MapPicker
          initialLocation={deliveryLocation}
          onLocationSelect={onDeliveryLocationSelected}
          onClose={() => setShowDeliveryPicker(false)}
          title={t('selectDeliveryLocation')}
        />
      )}

      {showStorePicker.isOpen && showStorePicker.storeIndex !== null && (
        <MapPicker
          initialLocation={stores[showStorePicker.storeIndex]?.location || { latitude: 0, longitude: 0 }}
          onLocationSelect={(location) => onStoreLocationSelected(showStorePicker.storeIndex, location)}
          onClose={() => setShowStorePicker({ storeIndex: null, isOpen: false })}
          title={`${t('selectLocation')} ${t('for')} ${t('store')} ${showStorePicker.storeIndex + 1}`}
        />
      )}
    </div>
  );
}
