import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { authService, dataService, userService } from '../App';
import toast from 'react-hot-toast';
import { useTranslation } from '../hooks/useTranslation';
import { openGoogleMapsForMission, openGoogleMapsAfterPickup } from '../utils/googleMaps';
import { getCurrentLocation, getCurrentLocationWithPermission } from '../utils/locationTracking';
import MissionTimer from '../components/MissionTimer';
import './MissionsPage.css';

export default function MissionsPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const [missions, setMissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(
    location.state?.initialTab || 'current'
  ); // 'current' | 'new' | 'finished'
  const [expandedId, setExpandedId] = useState(null);
  const [expandedStores, setExpandedStores] = useState(new Set()); // Track which missions have expanded stores
  const [expandedRestaurants, setExpandedRestaurants] = useState(new Set()); // Track which restaurants are expanded in items menu
  const [updatingId, setUpdatingId] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [distanceDisplayMode, setDistanceDisplayMode] = useState('time'); // 'time' or 'distance', default to 'time'
  const [showOrdersBoard, setShowOrdersBoard] = useState(false);
  const [selectedMissionForOrders, setSelectedMissionForOrders] = useState(null);
  const [userData, setUserData] = useState(null);
  const [systemParameters, setSystemParameters] = useState(null);
  const [sortFilter, setSortFilter] = useState('closest'); // 'closest', 'time', 'newest'
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [priceModalMission, setPriceModalMission] = useState(null);
  const [priceModalStoreIndex, setPriceModalStoreIndex] = useState(null);
  const [priceModalItems, setPriceModalItems] = useState([]); // Array of {itemIndex, name, price}
  const navigate = useNavigate();

  const EARTH_RADIUS_KM = 6371;

  const toRadians = (degrees) => degrees * (Math.PI / 180);

  const calculateDistanceKm = (pointA, pointB) => {
    if (!pointA || !pointB) {
      return null;
    }

    const lat1 = pointA.latitude;
    const lon1 = pointA.longitude;
    const lat2 = pointB.latitude;
    const lon2 = pointB.longitude;

    if (
      [lat1, lon1, lat2, lon2].some(
        (value) => typeof value !== 'number' || Number.isNaN(value)
      )
    ) {
      return null;
    }

    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRadians(lat1)) *
        Math.cos(toRadians(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return EARTH_RADIUS_KM * c;
  };

  const formatDistance = (distanceKm) => {
    if (distanceKm === null || distanceKm === undefined) {
      return '—';
    }
    return distanceKm >= 1
      ? `${distanceKm.toFixed(2)} km`
      : `${Math.max(distanceKm * 1000, 1).toFixed(0)} m`;
  };

  const formatEta = (distanceKm) => {
    if (distanceKm === null || distanceKm === undefined) {
      return '—';
    }
    const speedKmh = 35; // typical urban motorcycle speed
    const hours = distanceKm / speedKmh;
    const minutes = Math.round(hours * 60);
    if (minutes < 1) return '< 1 min';
    if (minutes < 60) return `${minutes} min`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m === 0 ? `${h} h` : `${h} h ${m} min`;
  };

  // Calculate mission total excluding skipped stores and canceled missions
  const calculateMissionTotal = (mission) => {
    if (!mission) return 0;
    // If mission is canceled, total should be 0
    if (mission.status === 'cancelled') {
      return 0;
    }
    
    const skippedStoreIndices = mission.skippedStores?.map(s => s.storeIndex) || [];
    
    // If mission has stores, calculate from stores (excluding skipped)
    if (mission.stores && Array.isArray(mission.stores)) {
      const subtotal = mission.stores.reduce((sum, store, storeIndex) => {
        // Skip stores that are skipped
        if (skippedStoreIndices.includes(storeIndex)) {
          return sum;
        }
        if (store.items && Array.isArray(store.items)) {
          return sum + store.items.reduce((itemSum, item) => {
            return itemSum + (parseFloat(item.price) || 0);
          }, 0);
        }
        return sum;
      }, 0);
      
      const deliveryFee = parseFloat(mission.deliveryFee || 0);
      return subtotal + deliveryFee;
    }
    
    // Fallback to stored totalAmount or itemsTotal (for legacy missions without stores)
      return mission.totalAmount || mission.itemsTotal || 0;
  };

  // Calculate store tax (wait time fee) for a mission
  // NOTE: Currently disabled - keeping function for future use
  const calculateStoreTax = (mission) => {
    // Store tax calculation disabled for now - keeping parameter for future use
    return 0;
  };

  // Calculate items subtotal only (excluding delivery fee and wait time fee)
  const calculateItemsSubtotal = (mission) => {
    if (!mission || mission.status === 'cancelled') return 0;
    
    const skippedStoreIndices = mission.skippedStores?.map(s => s.storeIndex) || [];
    
    // If mission has stores, calculate from stores (excluding skipped)
    if (mission.stores && Array.isArray(mission.stores)) {
      const subtotal = mission.stores.reduce((sum, store, storeIndex) => {
        // Skip stores that are skipped
        if (skippedStoreIndices.includes(storeIndex)) {
          return sum;
        }
        if (store.items && Array.isArray(store.items)) {
          return sum + store.items.reduce((itemSum, item) => {
            return itemSum + (parseFloat(item.price) || 0);
          }, 0);
        }
        return sum;
      }, 0);
      return subtotal;
    }
    
    // Fallback to legacy items or stored itemsTotal
    if (mission.items && Array.isArray(mission.items)) {
      return mission.items.reduce((sum, item) => {
        return sum + (parseFloat(item.price) || 0);
      }, 0);
    }
    
    return mission.itemsTotal || 0;
  };

  const buildRoadmap = ({ total, toPickup, pickupToDelivery, hasUser }) => {
    const lines = [];
    if (hasUser) {
      lines.push('🛵 You');
      lines.push(`  │  ${formatDistance(toPickup)}  (${formatEta(toPickup)})`);
      lines.push('  v');
    }
    lines.push('🍽️ Pickup');
    lines.push(`  │  ${formatDistance(pickupToDelivery)}  (${formatEta(pickupToDelivery)})`);
    lines.push('  v');
    lines.push('🏠 Delivery');
    lines.push('');
    lines.push(`Total: ${formatDistance(total)}  (${formatEta(total)})`);
    return lines.join('\n');
  };

  useEffect(() => {
    loadMissions();
    loadUserPreferences();
    loadSystemParameters();

    const user = authService.getCurrentUser();
    if (user) {
      const unsubscribe = dataService.subscribeToMissions(
        user.uid,
        (updatedMissions) => {
          setMissions(updatedMissions);
        }
      );

      // Get user's current location
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            setUserLocation({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            });
          },
          (error) => {
          },
          {
            enableHighAccuracy: false,
            timeout: 5000,
            maximumAge: 60000, // Accept cached location up to 1 minute old
          }
        );
      }

      return unsubscribe;
    }
  }, []);

  const loadUserPreferences = async () => {
    const user = authService.getCurrentUser();
    if (!user) return;
    
    try {
      const data = await userService.getUserData(user.uid);
      setUserData(data);
      if (data && data.distanceDisplayMode) {
        setDistanceDisplayMode(data.distanceDisplayMode);
      }
    } catch (error) {
    }
  };

  const loadSystemParameters = async () => {
    try {
      const params = await dataService.getSystemParameters();
      setSystemParameters(params);
    } catch (error) {
    }
  };

  const loadMissions = async () => {
    const user = authService.getCurrentUser();
    if (!user) return;

    setLoading(true);
    const userMissions = await dataService.getMissions(user.uid);
    setMissions(userMissions);
    setLoading(false);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending':
        return '#FF9500';
      case 'assigned':
        return '#007AFF';
      case 'in_progress':
        return '#5856D6';
      case 'completed':
        return '#34C759';
      case 'cancelled':
        return '#FF3B30';
      default:
        return '#8E8E93';
    }
  };


  const currentUserId = authService.getCurrentUser()?.uid;

  const isFinished = (mission) =>
    mission.status === 'completed' || mission.status === 'cancelled';

  const isNewMission = (mission) =>
    !isFinished(mission) && (!mission.assignedTo || mission.assignedTo === null);

  const isCurrentMission = (mission) =>
    !isFinished(mission) &&
    mission.assignedTo === currentUserId &&
    ['pending', 'assigned', 'in_progress'].includes(mission.status);

  const filteredMissions = missions.filter((mission) => {
    if (activeTab === 'new') return isNewMission(mission);
    if (activeTab === 'finished')
      return isFinished(mission) && mission.assignedTo === currentUserId;
    // current tab
    return isCurrentMission(mission);
  });

  // Calculate time remaining for a mission
  const getTimeRemaining = (mission) => {
    if (!mission.deadline) return null;
    const deadline = new Date(mission.deadline);
    const now = new Date();
    const diff = deadline - now;
    return diff > 0 ? diff : 0; // Return 0 if deadline passed
  };

  // Sort missions based on selected filter
  const sortedMissions = useMemo(() => {
    const missionsToSort = [...filteredMissions];
    
    if (sortFilter === 'newest') {
      // Sort by creation date (newest first)
      return missionsToSort.sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime; // Newest first
      });
    }
    
    if (sortFilter === 'time') {
      // Sort by time remaining (lowest first)
      return missionsToSort.sort((a, b) => {
        const aTime = getTimeRemaining(a);
        const bTime = getTimeRemaining(b);
        
        // Handle null values (put them at the end)
        if (aTime === null && bTime === null) return 0;
        if (aTime === null) return 1;
        if (bTime === null) return -1;
        
        return aTime - bTime; // Lowest time remaining first
      });
    }
    
    // Default: sort by closest distance (requires user location)
    if (!userLocation) return missionsToSort;
    
    return missionsToSort.sort((a, b) => {
      let distanceA = null;
      let distanceB = null;
      
      if (activeTab === 'new') {
        // New missions: sort by distance to first store or pickup location
        if (a.stores && a.stores.length > 0 && a.stores[0].location) {
          distanceA = calculateDistanceKm(userLocation, a.stores[0].location);
        } else if (a.pickupLocation) {
          distanceA = calculateDistanceKm(userLocation, a.pickupLocation);
        }
        if (b.stores && b.stores.length > 0 && b.stores[0].location) {
          distanceB = calculateDistanceKm(userLocation, b.stores[0].location);
        } else if (b.pickupLocation) {
          distanceB = calculateDistanceKm(userLocation, b.pickupLocation);
        }
      } else if (activeTab === 'current') {
        // Current missions: sort by distance to next location
        // If pickup not reached: use first store or pickup location
        // If pickup reached: use delivery location
        const aPickupReached = a.pickupReachedAt || a.pickupArrivedAt;
        const bPickupReached = b.pickupReachedAt || b.pickupArrivedAt;
        
        if (!aPickupReached) {
          if (a.stores && a.stores.length > 0 && a.stores[0].location) {
            distanceA = calculateDistanceKm(userLocation, a.stores[0].location);
          } else if (a.pickupLocation) {
            distanceA = calculateDistanceKm(userLocation, a.pickupLocation);
          }
        } else if (a.deliveryLocation) {
          distanceA = calculateDistanceKm(userLocation, a.deliveryLocation);
        }
        
        if (!bPickupReached) {
          if (b.stores && b.stores.length > 0 && b.stores[0].location) {
            distanceB = calculateDistanceKm(userLocation, b.stores[0].location);
          } else if (b.pickupLocation) {
            distanceB = calculateDistanceKm(userLocation, b.pickupLocation);
          }
        } else if (b.deliveryLocation) {
          distanceB = calculateDistanceKm(userLocation, b.deliveryLocation);
        }
      }
      
      // Handle null distances (put them at the end)
      if (distanceA === null && distanceB === null) return 0;
      if (distanceA === null) return 1;
      if (distanceB === null) return -1;
      
      return distanceA - distanceB;
    });
  }, [filteredMissions, userLocation, activeTab, sortFilter]);

  // Calculate counts
  const newMissionsCount = missions.filter(isNewMission).length;
  const currentMissionsCount = missions.filter(isCurrentMission).length;

  // Set initial tab from navigation state
  useEffect(() => {
    if (location.state?.initialTab) {
      setActiveTab(location.state.initialTab);
    }
  }, [location.state]);

  // Auto-switch to new missions if current missions is empty (only if no initial tab was set)
  useEffect(() => {
    if (!location.state?.initialTab && activeTab === 'current' && currentMissionsCount === 0 && newMissionsCount > 0) {
      setActiveTab('new');
    }
  }, [currentMissionsCount, newMissionsCount, activeTab, location.state]);

  const applyMissionPatch = (id, patch) => {
    setMissions((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...patch } : m))
    );
  };

  const pickUpMission = async (mission, event) => {
    event?.stopPropagation();
    const user = authService.getCurrentUser();
    if (!user) {
      toast.error('You must be logged in to pick up a mission');
      return;
    }
    if (!window.confirm('Pick up this mission?')) return;

    setUpdatingId(mission.id);
    const result = await dataService.pickUpMission(mission.id, user.uid);
    setUpdatingId(null);
    if (result.success) {
      toast.success('Mission picked up successfully!');
      applyMissionPatch(mission.id, {
        assignedTo: user.uid,
        status: 'assigned',
        assignedAt: new Date().toISOString(),
      });
    } else {
      toast.error(result.error || 'Failed to pick up mission');
    }
  };

  const updateStatus = async (mission, newStatus, event) => {
    event?.stopPropagation();
    if (!window.confirm(`Change mission status to ${newStatus}?`)) {
      return;
    }
    setUpdatingId(mission.id);
    
    // If starting mission, capture location and time
    let additionalData = {};
    if (newStatus === 'in_progress' && mission.status !== 'in_progress') {
      const location = await getCurrentLocation();
      if (location) {
        additionalData = {
          startedAt: new Date().toISOString(),
          startedLocation: location,
        };
      } else {
        additionalData = {
          startedAt: new Date().toISOString(),
        };
      }
    }
    
    // If completing mission, capture location and time
    if (newStatus === 'completed') {
      const location = await getCurrentLocation();
      if (location) {
        additionalData = {
          completedAt: new Date().toISOString(),
          completedLocation: location,
        };
      } else {
        additionalData = {
          completedAt: new Date().toISOString(),
        };
      }
    }
    
    const result = await dataService.updateMissionStatus(
      mission.id,
      newStatus,
      additionalData
    );
    
    setUpdatingId(null);
    if (result.success) {
      if (newStatus === 'completed') {
        toast.success('Mission completed');
      } else {
        toast.success('Mission status updated');
      }
      applyMissionPatch(mission.id, {
        status: newStatus,
        updatedAt: new Date().toISOString(),
        ...additionalData,
      });
    } else {
      toast.error(result.error || 'Failed to update status');
    }
  };

  const confirmReachedPickup = async (mission, event) => {
    event?.stopPropagation();
    
    // Check if this is a multi-store mission
    const hasStores = mission.stores && mission.stores.length > 0;
    let storeIndex = null;
    
    if (hasStores) {
      // Get current location to determine which store is closest
      const location = await getCurrentLocation();
      if (location) {
        // Find the closest store that hasn't been picked up yet and isn't skipped
        const pickedUpStores = mission.pickedUpFromStores || [];
        const skippedStoreIndices = mission.skippedStores?.map(s => s.storeIndex) || [];
        const remainingStores = mission.stores
          .map((store, idx) => ({
            index: idx,
            store,
            distance: calculateDistanceKm(location, store.location)
          }))
          .filter(item => !pickedUpStores.includes(item.index) && !skippedStoreIndices.includes(item.index))
          .sort((a, b) => (a.distance || Infinity) - (b.distance || Infinity));
        
        if (remainingStores.length > 0) {
          storeIndex = remainingStores[0].index;
        }
      }
      
      if (storeIndex === null) {
        toast.error('Could not determine which store you are at. Please try again.');
        return;
      }
      
      const storeName = mission.stores[storeIndex].name || `Store ${storeIndex + 1}`;
      if (!window.confirm(`Confirm that you have reached ${storeName}?`)) {
        return;
      }
      
      // Check if this store has items without prices
      const store = mission.stores[storeIndex];
      const itemsWithoutPrices = store.items
        ? store.items
            .map((item, itemIdx) => ({ item, itemIdx }))
            .filter(({ item }) => item.price === null || item.price === undefined || item.price === '')
        : [];
      
      if (itemsWithoutPrices.length > 0) {
        // Show price setting modal
        setPriceModalItems(
          itemsWithoutPrices.map(({ item, itemIdx }) => ({
            itemIndex: itemIdx,
            name: item.name || `Item ${itemIdx + 1}`,
            price: item.price || ''
          }))
        );
        setPriceModalMission(mission);
        setPriceModalStoreIndex(storeIndex);
        setShowPriceModal(true);
        return; // Don't proceed until prices are set
      }
    } else {
      // Legacy single pickup - check items
      const itemsWithoutPrices = mission.items
        ? mission.items
            .map((item, itemIdx) => ({ item, itemIdx }))
            .filter(({ item }) => item.price === null || item.price === undefined || item.price === '')
        : [];
      
      if (itemsWithoutPrices.length > 0) {
        // Show price setting modal
        setPriceModalItems(
          itemsWithoutPrices.map(({ item, itemIdx }) => ({
            itemIndex: itemIdx,
            name: item.name || `Item ${itemIdx + 1}`,
            price: item.price || ''
          }))
        );
        setPriceModalMission(mission);
        setPriceModalStoreIndex(null); // null means legacy single pickup
        setShowPriceModal(true);
        return; // Don't proceed until prices are set
      }
      
    if (!window.confirm('Confirm that you have reached the pickup location?')) {
      return;
    }
    }
    
    // Proceed with pickup confirmation
    await proceedWithPickupConfirmation(mission, storeIndex);
  };
  
  const proceedWithPickupConfirmation = async (mission, storeIndex) => {
    setUpdatingId(mission.id);
    
    const location = await getCurrentLocation();
    const additionalData = {
      pickupReachedAt: new Date().toISOString(),
    };
    
    // For multi-store missions, track which stores have been picked up
    const hasStores = mission.stores && mission.stores.length > 0;
    if (hasStores && storeIndex !== null) {
      const pickedUpStores = mission.pickedUpFromStores || [];
      if (!pickedUpStores.includes(storeIndex)) {
        additionalData.pickedUpFromStores = [...pickedUpStores, storeIndex];
      }
    }
    
    if (location) {
      additionalData.pickupReachedLocation = location;
    }
    
    const result = await dataService.updateMissionStatus(
      mission.id,
      mission.status,
      additionalData
    );
    setUpdatingId(null);
    if (result.success) {
      toast.success('Pickup location reached confirmed');
      applyMissionPatch(mission.id, additionalData);
    } else {
      toast.error(result.error || 'Failed to confirm pickup arrival');
    }
  };
  
  const handlePriceModalSave = async () => {
    if (!priceModalMission) return;
    
    // Validate all prices are set
    const missingPrices = priceModalItems.filter(item => !item.price || item.price.trim() === '');
    if (missingPrices.length > 0) {
      toast.error('Please set prices for all items');
      return;
    }
    
    setUpdatingId(priceModalMission.id);
    
    // Update mission with prices
    const hasStores = priceModalMission.stores && priceModalMission.stores.length > 0;
    let updatedMission = { ...priceModalMission };
    
    if (hasStores && priceModalStoreIndex !== null) {
      // Multi-store mission
      const updatedStores = [...updatedMission.stores];
      const updatedStore = { ...updatedStores[priceModalStoreIndex] };
      const updatedItems = [...updatedStore.items];
      
      priceModalItems.forEach(({ itemIndex, price }) => {
        updatedItems[itemIndex] = {
          ...updatedItems[itemIndex],
          price: parseFloat(price) || 0
        };
      });
      
      updatedStore.items = updatedItems;
      updatedStores[priceModalStoreIndex] = updatedStore;
      updatedMission.stores = updatedStores;
    } else {
      // Legacy single pickup
      const updatedItems = [...(updatedMission.items || [])];
      
      priceModalItems.forEach(({ itemIndex, price }) => {
        updatedItems[itemIndex] = {
          ...updatedItems[itemIndex],
          price: parseFloat(price) || 0
        };
      });
      
      updatedMission.items = updatedItems;
    }
    
    // Recalculate totals
    const hasStoresForCalc = updatedMission.stores && updatedMission.stores.length > 0;
    let itemsTotal = 0;
    
    if (hasStoresForCalc) {
      const skippedStoreIndices = updatedMission.skippedStores?.map(s => s.storeIndex) || [];
      itemsTotal = updatedMission.stores.reduce((sum, store, storeIdx) => {
        if (skippedStoreIndices.includes(storeIdx)) return sum;
        return sum + (store.items || []).reduce((itemSum, item) => {
          return itemSum + (parseFloat(item.price) || 0);
        }, 0);
      }, 0);
    } else if (updatedMission.items) {
      itemsTotal = updatedMission.items.reduce((sum, item) => {
        return sum + (parseFloat(item.price) || 0);
      }, 0);
    }
    
    const deliveryFee = parseFloat(updatedMission.deliveryFee || 0);
    
    // Store tax calculation disabled for now - keeping parameter for future use
    const totalAmount = itemsTotal + deliveryFee;
    
    updatedMission.itemsTotal = itemsTotal;
    updatedMission.totalAmount = totalAmount;
    
    // Update mission via API (updateMissionStatus)
    // Only include stores or items based on mission type to avoid undefined values
    const updateData = {
      itemsTotal,
      totalAmount
    };
    
    if (hasStores && priceModalStoreIndex !== null) {
      // Multi-store mission - only update stores
      updateData.stores = updatedMission.stores;
    } else {
      // Legacy single pickup - only update items
      updateData.items = updatedMission.items;
    }
    
    const result = await dataService.updateMissionStatus(
      priceModalMission.id,
      priceModalMission.status,
      updateData
    );
    
    setUpdatingId(null);
    
    if (result.success) {
      toast.success('Prices updated successfully');
      // Only include stores or items based on mission type
      const patchData = {
        itemsTotal,
        totalAmount
      };
      if (hasStores && priceModalStoreIndex !== null) {
        patchData.stores = updatedMission.stores;
      } else {
        patchData.items = updatedMission.items;
      }
      applyMissionPatch(priceModalMission.id, patchData);
      
      // Close modal first
      const storeIndexToUse = priceModalStoreIndex;
      setShowPriceModal(false);
      setPriceModalMission(null);
      setPriceModalStoreIndex(null);
      setPriceModalItems([]);
      
      // Wait a moment for state to update, then proceed with pickup confirmation
      // Use the updated mission data
      await proceedWithPickupConfirmation(updatedMission, storeIndexToUse);
    } else {
      toast.error(result.error || 'Failed to update prices');
    }
  };

  if (loading) {
    return (
      <div className="missions-loading">
        <div>Loading missions...</div>
      </div>
    );
  }

  // Check if user is delivery guy OR admin/monitor in delivery mode
  const isDeliveryGuy = userData?.role === 'delivery_guy';
  const isAdmin = userData?.role === 'admin';
  const isMonitor = userData?.role === 'monitor';
  const canSwitchMode = isAdmin || isMonitor;
  
  // Get view mode from localStorage (same as HomePage)
  const viewMode = typeof window !== 'undefined' 
    ? (localStorage.getItem('homeViewMode') || 'admin')
    : 'admin';
  
  // Show delivery guy view if: user is delivery guy OR (admin/monitor in delivery mode)
  const showDeliveryView = isDeliveryGuy || (canSwitchMode && viewMode === 'delivery');

  return (
    <div className={`missions-container ${showDeliveryView ? 'delivery-guy-missions' : ''}`}>
      <header className={`missions-header ${showDeliveryView ? 'modern-header' : ''}`}>
        <div className="missions-header-left">
          <button className="back-button" onClick={() => navigate('/')} title="Go back">
            ← Back
          </button>
          <h1>Missions</h1>
        </div>
        <div className={`missions-tabs ${showDeliveryView ? 'modern-tabs' : ''}`}>
          <button
            type="button"
            className={`missions-tab ${
              activeTab === 'current' ? 'active' : ''
            }`}
            onClick={() => setActiveTab('current')}
          >
            <div className="tab-content">
              <svg className="tab-icon" width="18" height="18" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M8 2C4.68629 2 2 4.68629 2 8C2 11.3137 4.68629 14 8 14C11.3137 14 14 11.3137 14 8C14 4.68629 11.3137 2 8 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M8 5V8M8 11H8.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {currentMissionsCount > 0 && (
                <span className="tab-badge">{currentMissionsCount}</span>
              )}
              <span className="tab-label">{t('currentMissions')}</span>
            </div>
          </button>
          <button
            type="button"
            className={`missions-tab ${activeTab === 'new' ? 'active' : ''}`}
            onClick={() => setActiveTab('new')}
          >
            <div className="tab-content">
              <svg className="tab-icon" width="18" height="18" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M8 2L10 6L14 7L11 10L11.5 14L8 12L4.5 14L5 10L2 7L6 6L8 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {newMissionsCount > 0 && (
                <span className="tab-badge">{newMissionsCount}</span>
              )}
              <span className="tab-label">{t('newMissions')}</span>
            </div>
          </button>
        </div>
        <button
          type="button"
          className={`missions-tab archive-tab ${activeTab === 'finished' ? 'active' : ''}`}
          onClick={() => setActiveTab(activeTab === 'finished' ? 'current' : 'finished')}
          title={activeTab === 'finished' ? t('back') + ' ' + t('to') + ' ' + t('currentMissions').toLowerCase() : t('finishedMissions')}
        >
          <div className="tab-content">
            <svg className="tab-icon" width="18" height="18" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M2 4H14V13C14 13.5523 13.5523 14 13 14H3C2.44772 14 2 13.5523 2 13V4Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M5 2H11V4H5V2Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M6 7L7 8L10 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="tab-label">{activeTab === 'finished' ? t('currentMissions') : t('archive')}</span>
          </div>
        </button>
      </header>
      {(activeTab === 'current' || activeTab === 'new') && (
        <div className="missions-filter-bar">
          <div className="missions-filter">
            <button
              type="button"
              className={`missions-tab filter-tab ${sortFilter === 'closest' ? 'active' : ''}`}
              onClick={() => setSortFilter('closest')}
              title={t('closestToDeliveryGuy')}
            >
              <div className="tab-content">
                <svg className="tab-icon" width="18" height="18" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M8 2C5.79086 2 4 3.79086 4 6C4 8.20914 8 12 8 12C8 12 12 8.20914 12 6C12 3.79086 10.2091 2 8 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M8 7.5C8.82843 7.5 9.5 6.82843 9.5 6C9.5 5.17157 8.82843 4.5 8 4.5C7.17157 4.5 6.5 5.17157 6.5 6C6.5 6.82843 7.17157 7.5 8 7.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span className="tab-label">{t('closest')}</span>
              </div>
            </button>
            <button
              type="button"
              className={`missions-tab filter-tab ${sortFilter === 'time' ? 'active' : ''}`}
              onClick={() => setSortFilter('time')}
              title={t('lowestTimeRemaining')}
            >
              <div className="tab-content">
                <svg className="tab-icon" width="18" height="18" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M8 2C4.68629 2 2 4.68629 2 8C2 11.3137 4.68629 14 8 14C11.3137 14 14 11.3137 14 8C14 4.68629 11.3137 2 8 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M8 5V8L10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span className="tab-label">{t('time')}</span>
              </div>
            </button>
            <button
              type="button"
              className={`missions-tab filter-tab ${sortFilter === 'newest' ? 'active' : ''}`}
              onClick={() => setSortFilter('newest')}
              title={t('newestFirst')}
            >
              <div className="tab-content">
                <svg className="tab-icon" width="18" height="18" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M8 2L10 6L14 7L11 10L11.5 14L8 12L4.5 14L5 10L2 7L6 6L8 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span className="tab-label">{t('newest')}</span>
              </div>
            </button>
          </div>
        </div>
      )}

      <div className="missions-content">
        {sortedMissions.length === 0 ? (
        <div className="empty-state">
          <p>{t('noMissionsInList')}</p>
        </div>
      ) : (
        <div className="missions-grid">
          {sortedMissions.map((mission) => {
            const isExpanded = expandedId === mission.id;
            const isUnassigned =
              !mission.assignedTo || mission.assignedTo === null;
            const isAssignedToMe = mission.assignedTo === currentUserId;

            return (
              <div
                key={mission.id}
                className="mission-card-wrapper"
              >
              <div className="mission-card-tag">
                  {(!mission.assignedTo || mission.assignedTo === null) && (
                    <span className="unassigned-badge">AVAILABLE</span>
                  )}
                  <span
                    className="status-badge"
                    style={{ backgroundColor: getStatusColor(mission.status) }}
                  >
                    {mission.status?.toUpperCase() || 'UNKNOWN'}
                  </span>
                </div>
              <div
                className={`mission-card ${showDeliveryView ? `mission-card-${mission.status || 'pending'}` : ''} ${isUnassigned ? 'mission-card-unassigned' : ''}`}
                id={`mission-card-${mission.id}`}
                onClick={() => {
                  const wasExpanded = expandedId === mission.id;
                  setExpandedId((prev) =>
                    prev === mission.id ? null : mission.id
                  );
                  
                  // Scroll to center the card after a brief delay to allow expansion
                  if (!wasExpanded) {
                    setTimeout(() => {
                      const cardElement = document.getElementById(`mission-card-${mission.id}`);
                      if (cardElement) {
                        const cardRect = cardElement.getBoundingClientRect();
                        const cardTop = cardRect.top + window.scrollY;
                        const cardHeight = cardRect.height;
                        const windowHeight = window.innerHeight;
                        const scrollPosition = cardTop - (windowHeight / 2) + (cardHeight / 2);
                        window.scrollTo({
                          top: scrollPosition,
                          behavior: 'smooth'
                        });
                      }
                    }, 100);
                  }
                }}
              >
                {(() => {
                  // Check if mission has stores (multi-store mode) or legacy pickup location
                  const hasStores = mission.stores && mission.stores.length > 0;
                  const hasLegacyPickup = mission.pickupLocation && mission.deliveryLocation;
                  
                  if (!hasStores && !hasLegacyPickup) {
                    return null;
                  }
                  
                  const isStoresExpanded = expandedStores.has(mission.id);
                  
                  // If stores exist, sort by distance to user (show all stores, including skipped)
                  let sortedStores = [];
                  if (hasStores) {
                    sortedStores = mission.stores
                      .map((store, originalIndex) => ({
                      ...store,
                        originalIndex, // Preserve original index for pickedUpFromStores check
                      distance: userLocation ? calculateDistanceKm(userLocation, store.location) : null
                      }))
                      .sort((a, b) => {
                        // Put skipped stores at the end
                        const skippedA = mission.skippedStores?.some(s => s.storeIndex === a.originalIndex);
                        const skippedB = mission.skippedStores?.some(s => s.storeIndex === b.originalIndex);
                        if (skippedA && !skippedB) return 1;
                        if (!skippedA && skippedB) return -1;
                        // For non-skipped stores, sort by distance
                      if (a.distance === null) return 1;
                      if (b.distance === null) return -1;
                      return a.distance - b.distance;
                    });
                  }
                  
                  // Calculate distances for legacy mode
                  const toPickup = hasLegacyPickup && userLocation ? calculateDistanceKm(userLocation, mission.pickupLocation) : null;
                  const pickupToDelivery = hasLegacyPickup ? calculateDistanceKm(mission.pickupLocation, mission.deliveryLocation) : null;
                  const total = toPickup ? toPickup + pickupToDelivery : pickupToDelivery;
                  
                  // Calculate total distance for stores mode
                  // When collapsed: total from first store through all stores to delivery
                  // When expanded: just from last store to delivery
                  let storesTotalDistance = null;
                  if (hasStores && sortedStores.length > 0 && mission.deliveryLocation) {
                    if (!isStoresExpanded && sortedStores.length > 1) {
                      // Calculate total: distances between stores + distance from last store to delivery
                      let totalDistance = 0;
                      
                      // Add distances between stores
                      for (let i = 0; i < sortedStores.length - 1; i++) {
                        const dist = calculateDistanceKm(sortedStores[i].location, sortedStores[i + 1].location);
                        if (dist !== null) {
                          totalDistance += dist;
                        }
                      }
                      
                      // Add distance from last store to delivery
                      const lastDist = calculateDistanceKm(sortedStores[sortedStores.length - 1].location, mission.deliveryLocation);
                      if (lastDist !== null) {
                        totalDistance += lastDist;
                      }
                      
                      storesTotalDistance = totalDistance;
                    } else {
                      // When expanded, just show distance from last store to delivery
                      const lastStore = sortedStores[sortedStores.length - 1];
                      storesTotalDistance = calculateDistanceKm(lastStore.location, mission.deliveryLocation);
                    }
                  }
                  
                  return (
                    <div className="mission-roadmap">
                      <div className="roadmap-timeline">
                        {userLocation && (toPickup !== null || (hasStores && sortedStores.length > 0 && sortedStores[0].distance !== null)) && (
                          <>
                            <div className="roadmap-timeline-item roadmap-item-with-timer">
                              <div className="roadmap-timeline-icon roadmap-icon-you">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                  <path d="M12 2C8.13 2 5 5.13 5 9C5 14.25 12 22 12 22C12 22 19 14.25 19 9C19 5.13 15.87 2 12 2ZM12 11.5C10.62 11.5 9.5 10.38 9.5 9C9.5 7.62 10.62 6.5 12 6.5C13.38 6.5 14.5 7.62 14.5 9C14.5 10.38 13.38 11.5 12 11.5Z" fill="currentColor"/>
                                </svg>
                                {(() => {
                                  const hasStores = mission.stores && mission.stores.length > 0;
                                  if (hasStores) {
                                    // For multi-store missions, check if all stores are picked up
                                    const pickedUpStores = mission.pickedUpFromStores || [];
                                    const allStoresPickedUp = pickedUpStores.length >= mission.stores.length;
                                    if (!isUnassigned && !allStoresPickedUp) {
                                      return <div className="roadmap-checkmark">✓</div>;
                                    }
                                  } else {
                                    // Legacy single pickup
                                    if (!isUnassigned && !mission.pickupReachedAt) {
                                      return <div className="roadmap-checkmark">✓</div>;
                                    }
                                  }
                                  return null;
                                })()}
                              </div>
                              <div className="roadmap-timeline-content">
                                <div className="roadmap-timeline-title">You</div>
                              </div>
                              {systemParameters && systemParameters.maxMinutes && (
                                <MissionTimer 
                                  mission={mission} 
                                  maxMinutes={systemParameters.maxMinutes}
                                  orangeThreshold={systemParameters.orangeThreshold || 20}
                                  redThreshold={systemParameters.redThreshold || 5}
                                />
                              )}
                            </div>
                            
                            {/* Action Buttons - Always visible under "You" */}
                            <div className="mission-action-buttons-container">
                              {!isFinished(mission) && showDeliveryView && (
                                <>
                                {isUnassigned && (
                                  <button
                                    type="button"
                                    className="mission-action-button-icon pickup"
                                    onClick={(e) => pickUpMission(mission, e)}
                                    disabled={updatingId === mission.id}
                                    title="Pick Up Mission"
                                  >
                                    <div className="action-button-icon">
                                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M7 18C5.9 18 5.01 18.9 5.01 20C5.01 21.1 5.9 22 7 22C8.1 22 9 21.1 9 20C9 18.9 8.1 18 7 18ZM1 2V4H3L6.6 11.59L5.25 14.04C5.09 14.32 5 14.65 5 15C5 16.1 5.9 17 7 17H19V15H7.42C7.28 15 7.17 14.89 7.17 14.75L7.2 14.63L8.1 13H15.55C16.3 13 16.96 12.59 17.3 11.97L20.88 5.48C20.96 5.34 21 5.17 21 5C21 4.45 20.55 4 20 4H5.21L4.27 2H1ZM17 18C15.9 18 15.01 18.9 15.01 20C15.01 21.1 15.9 22 17 22C18.1 22 19 21.1 19 20C19 18.9 18.1 18 17 18Z" fill="currentColor"/>
                                      </svg>
                                    </div>
                                    <div className="action-button-text">Pick Up</div>
                                  </button>
                                )}
                                {isAssignedToMe &&
                                  ['assigned', 'pending'].includes(mission.status) && (
                                    <button
                                      type="button"
                                      className="mission-action-button-icon primary"
                                      onClick={(e) =>
                                        updateStatus(mission, 'in_progress', e)
                                      }
                                      disabled={updatingId === mission.id}
                                      title="Start Mission"
                                    >
                                      <div className="action-button-icon">
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                          <path d="M8 5V19L19 12L8 5Z" fill="currentColor"/>
                                        </svg>
                                      </div>
                                      <div className="action-button-text">Start</div>
                                    </button>
                                  )}
                                {isAssignedToMe &&
                                  mission.status === 'in_progress' && (() => {
                                    const hasStores = mission.stores && mission.stores.length > 0;
                                    const pickedUpStores = mission.pickedUpFromStores || [];
                                    
                                    if (hasStores) {
                                      const skippedStoreIndices = mission.skippedStores?.map(s => s.storeIndex) || [];
                                      const activeStoresCount = mission.stores.length - skippedStoreIndices.length;
                                      const allStoresPickedUp = pickedUpStores.length >= activeStoresCount;
                                      if (allStoresPickedUp) {
                                        return (
                                          <button
                                            type="button"
                                            className="mission-action-button-icon success"
                                            onClick={(e) =>
                                              updateStatus(mission, 'completed', e)
                                            }
                                            disabled={updatingId === mission.id}
                                            title="Complete Mission"
                                          >
                                            <div className="action-button-icon">
                                              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                <path d="M9 16.17L4.83 12L3.41 13.41L9 19L21 7L19.59 5.59L9 16.17Z" fill="currentColor"/>
                                              </svg>
                                            </div>
                                            <div className="action-button-text">Complete</div>
                                          </button>
                                        );
                                      }
                                      
                                      let nextStoreName = 'Store';
                                      if (userLocation) {
                                        const remainingStores = mission.stores
                                          .map((store, idx) => ({
                                            index: idx,
                                            store,
                                            distance: calculateDistanceKm(userLocation, store.location)
                                          }))
                                          .filter(item => !pickedUpStores.includes(item.index) && !skippedStoreIndices.includes(item.index))
                                          .sort((a, b) => (a.distance || Infinity) - (b.distance || Infinity));
                                        
                                        if (remainingStores.length > 0) {
                                          nextStoreName = remainingStores[0].store.name || `Store ${remainingStores[0].index + 1}`;
                                        }
                                      } else {
                                        const nextStoreIndex = mission.stores.findIndex((_, idx) => !pickedUpStores.includes(idx) && !skippedStoreIndices.includes(idx));
                                        if (nextStoreIndex >= 0) {
                                          nextStoreName = mission.stores[nextStoreIndex].name || `Store ${nextStoreIndex + 1}`;
                                        }
                                      }
                                      
                                      return (
                                        <button
                                          type="button"
                                          className="mission-action-button-icon arrival"
                                          onClick={(e) => confirmReachedPickup(mission, e)}
                                          disabled={updatingId === mission.id}
                                          title={`Reached ${nextStoreName}`}
                                        >
                                          <div className="action-button-icon">
                                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                              <path d="M9 16.17L4.83 12L3.41 13.41L9 19L21 7L19.59 5.59L9 16.17Z" fill="currentColor"/>
                                            </svg>
                                          </div>
                                          <div className="action-button-text">
                                            <span>Reached</span>
                                            <span className="action-button-subtext">{nextStoreName}</span>
                                          </div>
                                        </button>
                                      );
                                    } else {
                                      if (mission.pickupReachedAt) {
                                        return (
                                          <button
                                            type="button"
                                            className="mission-action-button-icon success"
                                            onClick={(e) =>
                                              updateStatus(mission, 'completed', e)
                                            }
                                            disabled={updatingId === mission.id}
                                            title="Complete Mission"
                                          >
                                            <div className="action-button-icon">
                                              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                <path d="M9 16.17L4.83 12L3.41 13.41L9 19L21 7L19.59 5.59L9 16.17Z" fill="currentColor"/>
                                              </svg>
                                            </div>
                                            <div className="action-button-text">Complete</div>
                                          </button>
                                        );
                                      }
                                      
                                      return (
                                        <button
                                          type="button"
                                          className="mission-action-button-icon arrival"
                                          onClick={(e) => confirmReachedPickup(mission, e)}
                                          disabled={updatingId === mission.id}
                                          title="Reached Pickup Location"
                                        >
                                          <div className="action-button-icon">
                                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                              <path d="M9 16.17L4.83 12L3.41 13.41L9 19L21 7L19.59 5.59L9 16.17Z" fill="currentColor"/>
                                            </svg>
                                          </div>
                                          <div className="action-button-text">
                                            <span>Reached</span>
                                            <span className="action-button-subtext">Pickup</span>
                                          </div>
                                        </button>
                                      );
                                    }
                                  })()}
                                </>
                              )}
                              
                              {/* View Trajectory Button - Always visible (on the right) */}
                              {(() => {
                                // Check if there are any locations to route to
                                const hasStores = mission.stores && mission.stores.length > 0;
                                const hasPickupLocation = mission.pickupLocation && 
                                  mission.pickupLocation.latitude && 
                                  mission.pickupLocation.longitude;
                                const hasDeliveryLocation = mission.deliveryLocation && 
                                  mission.deliveryLocation.latitude && 
                                  mission.deliveryLocation.longitude;
                                
                                // Enable button if there are stores, pickup location, or delivery location
                                const hasAnyLocation = hasStores || hasPickupLocation || hasDeliveryLocation;
                                
                                // Check if all stores have been picked up and client location is not set
                                let allStoresPickedUp = false;
                                if (hasStores && mission.stores.length > 0) {
                                  const pickedUpStores = mission.pickedUpFromStores || [];
                                  const skippedStoreIndices = mission.skippedStores?.map(s => s.storeIndex) || [];
                                  const totalStores = mission.stores.length;
                                  const pickedUpOrSkippedCount = pickedUpStores.length + skippedStoreIndices.length;
                                  allStoresPickedUp = pickedUpOrSkippedCount >= totalStores;
                                } else if (hasPickupLocation) {
                                  // Legacy single pickup - check if reached
                                  allStoresPickedUp = !!(mission.pickupReachedAt || mission.pickupArrivedAt);
                                }
                                
                                // Disable if all stores are picked up AND client location is not set
                                const shouldDisable = allStoresPickedUp && !hasDeliveryLocation;
                                
                                if (!hasAnyLocation || shouldDisable) {
                                  return (
                                    <button
                                      type="button"
                                      className="mission-action-button-icon route disabled"
                                      disabled
                                      title={shouldDisable ? t('allStoresReachedNoDelivery') : t('noRouteAvailable')}
                                    >
                                      <div className="action-button-icon">
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                          <path d="M12 2C8.13 2 5 5.13 5 9C5 14.25 12 22 12 22C12 22 19 14.25 19 9C19 5.13 15.87 2 12 2ZM12 11.5C10.62 11.5 9.5 10.38 9.5 9C9.5 7.62 10.62 6.5 12 6.5C13.38 6.5 14.5 7.62 14.5 9C14.5 10.38 13.38 11.5 12 11.5Z" fill="currentColor"/>
                                        </svg>
                                      </div>
                                      <div className="action-button-text">{t('route')}</div>
                                    </button>
                                  );
                                }
                                
                                // Use consistent route button color (same as new missions)
                                // Don't change color based on mission state
                                return (
                                  <button
                                    type="button"
                                    className={`mission-action-button-icon route ${hasDeliveryLocation ? 'route-full' : 'route-stores-only'}`}
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      
                                      // Try to get current location first
                                      let location = await getCurrentLocationWithPermission();
                                      
                                      // If that fails, try last known location from the API
                                      if (!location) {
                                        const currentUser = authService.getCurrentUser();
                                        if (currentUser) {
                                          const lastKnownLocation = await dataService.getDeliveryGuyLocation(currentUser.uid);
                                          if (lastKnownLocation) {
                                            location = lastKnownLocation;
                                          }
                                        }
                                      }
                                      
                                      // Show route (to stores only if no delivery location, or full route if delivery location exists)
                                      openGoogleMapsForMission(mission, location);
                                    }}
                                    title={
                                      hasDeliveryLocation 
                                        ? t('viewFullTrajectory')
                                        : t('viewRouteToStores')
                                    }
                                  >
                                    <div className="action-button-icon">
                                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M12 2C8.13 2 5 5.13 5 9C5 14.25 12 22 12 22C12 22 19 14.25 19 9C19 5.13 15.87 2 12 2ZM12 11.5C10.62 11.5 9.5 10.38 9.5 9C9.5 7.62 10.62 6.5 12 6.5C13.38 6.5 14.5 7.62 14.5 9C14.5 10.38 13.38 11.5 12 11.5Z" fill="currentColor"/>
                                      </svg>
                                    </div>
                                    <div className="action-button-text">Route</div>
                                  </button>
                                );
                              })()}
                            </div>
                            <div className="roadmap-timeline-connector">
                              <div className="roadmap-connector-time">
                                {(() => {
                                  if (hasStores && sortedStores.length > 0) {
                                    // Always show distance from "You" to first store
                                    return distanceDisplayMode === 'time' 
                                      ? formatEta(sortedStores[0]?.distance) 
                                      : formatDistance(sortedStores[0]?.distance);
                                  } else {
                                    // Legacy single pickup
                                    return distanceDisplayMode === 'time' 
                                      ? formatEta(toPickup) 
                                      : formatDistance(toPickup);
                                  }
                                })()}
                              </div>
                            </div>
                          </>
                        )}
                        
                        {/* Multi-store mode */}
                        {hasStores && sortedStores.length > 0 && (
                          <>
                            {sortedStores.map((store, storeIndex) => {
                              // Show first store always, or all if expanded
                              if (storeIndex > 0 && !isStoresExpanded) {
                                return null;
                              }
                              
                              const itemCount = store.items ? store.items.length : 0;
                              const pickedUpStores = mission.pickedUpFromStores || [];
                              const storeReached = pickedUpStores.includes(store.originalIndex);
                              const skippedStore = mission.skippedStores?.find(s => s.storeIndex === store.originalIndex);
                              
                              return (
                                <React.Fragment key={storeIndex}>
                                  <div className={`roadmap-timeline-item ${skippedStore ? 'roadmap-item-skipped' : ''}`} onClick={(e) => {
                                    e.stopPropagation();
                                    if (sortedStores.length > 1) {
                                      const newExpanded = new Set(expandedStores);
                                      if (isStoresExpanded) {
                                        newExpanded.delete(mission.id);
                                      } else {
                                        newExpanded.add(mission.id);
                                      }
                                      setExpandedStores(newExpanded);
                                    }
                                  }}>
                                    <div className="roadmap-timeline-icon roadmap-icon-pickup">
                                      {skippedStore ? (
                                        <span style={{ fontSize: '20px' }}>⏭️</span>
                                      ) : (
                                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M7 18C5.9 18 5.01 18.9 5.01 20C5.01 21.1 5.9 22 7 22C8.1 22 9 21.1 9 20C9 18.9 8.1 18 7 18ZM1 2V4H3L6.6 11.59L5.25 14.04C5.09 14.32 5 14.65 5 15C5 16.1 5.9 17 7 17H19V15H7.42C7.28 15 7.17 14.89 7.17 14.75L7.2 14.63L8.1 13H15.55C16.3 13 16.96 12.59 17.3 11.97L20.88 5.48C20.96 5.34 21 5.17 21 5C21 4.45 20.55 4 20 4H5.21L4.27 2H1ZM17 18C15.9 18 15.01 18.9 15.01 20C15.01 21.1 15.9 22 17 22C18.1 22 19 21.1 19 20C19 18.9 18.1 18 17 18Z" fill="currentColor"/>
                                      </svg>
                                      )}
                                      {itemCount > 0 && !skippedStore && (
                                        <span className="store-item-count">x{itemCount}</span>
                                      )}
                                      {storeReached && !mission.deliveredAt && !skippedStore && (
                                  <div className="roadmap-checkmark">✓</div>
                                )}
                              </div>
                              <div className="roadmap-timeline-content">
                                      <div className="roadmap-timeline-title-wrapper">
                                      <div className="roadmap-timeline-title">
                                        {store.name || 'Store'}
                                        {skippedStore && <span style={{ color: '#FF9800', fontSize: '12px', marginLeft: '5px' }}>(Skipped)</span>}
                                      </div>
                                      </div>
                                      {store.address && (
                                        <div className="roadmap-timeline-address">{store.address}</div>
                                      )}
                                      {skippedStore && (
                                        <div style={{ fontSize: '11px', color: '#FF9800', marginTop: '4px' }}>
                                          <strong>Reason:</strong> {skippedStore.reason}
                                        </div>
                                      )}
                              </div>
                            </div>
                                  {storeIndex < sortedStores.length - 1 && (
                                    // Only show connector when expanded, or when it's not the first store
                                    (!isStoresExpanded && storeIndex === 0 && sortedStores.length > 1) ? null : (
                                      <div className="roadmap-timeline-connector">
                                        <div className="roadmap-connector-time">
                                          {distanceDisplayMode === 'time' 
                                            ? formatEta(calculateDistanceKm(store.location, sortedStores[storeIndex + 1].location))
                                            : formatDistance(calculateDistanceKm(store.location, sortedStores[storeIndex + 1].location))}
                                        </div>
                                      </div>
                                    )
                                  )}
                                </React.Fragment>
                              );
                            })}
                            
                            {sortedStores.length > 1 && !isStoresExpanded && (
                              <div className="roadmap-expand-stores" onClick={(e) => {
                                e.stopPropagation();
                                const newExpanded = new Set(expandedStores);
                                newExpanded.add(mission.id);
                                setExpandedStores(newExpanded);
                              }}>
                                <span>+{sortedStores.length - 1} more store{sortedStores.length - 1 > 1 ? 's' : ''}</span>
                              </div>
                            )}
                            
                            {storesTotalDistance !== null && (
                              <div className="roadmap-timeline-connector roadmap-connector-delivery">
                                <div className="roadmap-connector-dot"></div>
                                <div className="roadmap-connector-time">
                                  {distanceDisplayMode === 'time' ? formatEta(storesTotalDistance) : formatDistance(storesTotalDistance)}
                                </div>
                              </div>
                            )}
                          </>
                        )}
                        
                        {/* Legacy single pickup mode */}
                        {!hasStores && hasLegacyPickup && (
                          <>
                            <div className="roadmap-timeline-item" onClick={(e) => e.stopPropagation()}>
                          <div className="roadmap-timeline-icon roadmap-icon-pickup">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M7 18C5.9 18 5.01 18.9 5.01 20C5.01 21.1 5.9 22 7 22C8.1 22 9 21.1 9 20C9 18.9 8.1 18 7 18ZM1 2V4H3L6.6 11.59L5.25 14.04C5.09 14.32 5 14.65 5 15C5 16.1 5.9 17 7 17H19V15H7.42C7.28 15 7.17 14.89 7.17 14.75L7.2 14.63L8.1 13H15.55C16.3 13 16.96 12.59 17.3 11.97L20.88 5.48C20.96 5.34 21 5.17 21 5C21 4.45 20.55 4 20 4H5.21L4.27 2H1ZM17 18C15.9 18 15.01 18.9 15.01 20C15.01 21.1 15.9 22 17 22C18.1 22 19 21.1 19 20C19 18.9 18.1 18 17 18Z" fill="currentColor"/>
                            </svg>
                            {mission.pickupReachedAt && !mission.deliveredAt && (
                              <div className="roadmap-checkmark">✓</div>
                            )}
                          </div>
                          <div className="roadmap-timeline-content">
                            <div className="roadmap-timeline-title">Pickup</div>
                            {mission.pickupAddress && (
                              <div className="roadmap-timeline-address">{mission.pickupAddress}</div>
                            )}
                          </div>
                        </div>
                        {pickupToDelivery !== null && (
                          <div className="roadmap-timeline-connector roadmap-connector-delivery">
                            <div className="roadmap-connector-dot"></div>
                            <div className="roadmap-connector-time">
                              {distanceDisplayMode === 'time' ? formatEta(pickupToDelivery) : formatDistance(pickupToDelivery)}
                            </div>
                          </div>
                        )}
                          </>
                        )}
                        
                        {/* Delivery location - always shown */}
                        <div className="roadmap-timeline-item" onClick={(e) => e.stopPropagation()}>
                          <div className="roadmap-timeline-icon roadmap-icon-delivery">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M10 20V14H14V20H19V12H22L12 3L2 12H5V20H10Z" fill="currentColor"/>
                            </svg>
                            {mission.deliveredAt && (
                              <div className="roadmap-checkmark">✓</div>
                            )}
                          </div>
                          <div className="roadmap-timeline-content roadmap-delivery-content">
                            <div className="roadmap-timeline-title">{mission.clientName || 'Delivery'}</div>
                            {mission.deliveryAddress && (
                              <div className="roadmap-timeline-address roadmap-address-delivery">{mission.deliveryAddress}</div>
                            )}
                          </div>
                          {mission.clientPhone && (
                            <a
                              href={`tel:${mission.clientPhone}`}
                              className="roadmap-call-button"
                              onClick={(e) => e.stopPropagation()}
                              title="Call Client"
                            >
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M3 5C3 3.89543 3.89543 3 5 3H8.27924C8.70967 3 9.09181 3.27543 9.22792 3.68377L10.7257 8.17721C10.8831 8.64932 10.6694 9.16531 10.2243 9.38787L7.96701 10.5165C9.06925 12.9612 11.0388 14.9308 13.4835 16.033L14.6121 13.7757C14.8347 13.3306 15.3507 13.1169 15.8228 13.2743L20.3162 14.7721C20.7246 14.9082 21 15.2903 21 15.7208V19C21 20.1046 20.1046 21 19 21H18C9.71573 21 3 14.2843 3 6V5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}
                
                {/* Order Summary - Always visible */}
                <div className="mission-order-summary">
                  <div className="order-summary-row">
                    <span className="order-summary-label">Total:</span>
                    <span className="order-summary-value">
                      {calculateMissionTotal(mission).toFixed(2)} DT
                    </span>
                  </div>
                  {mission.deliveryFee !== undefined && mission.deliveryFee > 0 && (
                    <div className="order-summary-row">
                      <span className="order-summary-label">Delivery:</span>
                      <span className="order-summary-value">
                        {mission.deliveryFee.toFixed(2)} DT
                      </span>
                    </div>
                  )}
                </div>

                {isExpanded && (
                <div className="mission-expanded">
                  {/* Detailed Orders View */}
                  {(activeTab === 'new' || activeTab === 'current') && (
                    <div className="mission-orders-detail">
                      <div className="orders-detail-header">
                        <h3>{t('orderDetails')}</h3>
                        <span className="order-mission-id-header">#{mission.id.slice(0, 8)}</span>
                      </div>
                      <div className="orders-detail-content">
                        {(() => {
                          // Check if mission has stores (new system) or items (old system)
                          const hasStores = mission.stores && mission.stores.length > 0;
                          const missionItems = mission.items || [];
                          const totalAmount = calculateMissionTotal(mission);
                          
                          if (hasStores) {
                            // New system: Show restaurants as expandable sections
                            return (
                              <>
                                <div className="order-restaurants-list">
                                  {mission.stores.map((store, storeIndex) => {
                                    const restaurantKey = `${mission.id}-detail-${storeIndex}`;
                                    const isExpanded = expandedRestaurants.has(restaurantKey);
                                    const storeItems = store.items || [];
                                    // Exclude skipped stores from total
                                    const skippedStoreIndices = mission.skippedStores?.map(s => s.storeIndex) || [];
                                    const isSkipped = skippedStoreIndices.includes(storeIndex);
                                    const storeTotal = isSkipped ? 0 : storeItems.reduce((sum, item) => 
                                      sum + (parseFloat(item.price) || 0), 0
                                    );
                                    
                                    return (
                                      <div key={storeIndex} className="order-restaurant-section">
                                        <div 
                                          className="order-restaurant-header"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            const newExpanded = new Set(expandedRestaurants);
                                            if (isExpanded) {
                                              newExpanded.delete(restaurantKey);
                                            } else {
                                              newExpanded.add(restaurantKey);
                                            }
                                            setExpandedRestaurants(newExpanded);
                                          }}
                                        >
                                          <div className="order-restaurant-name">
                                            <span className="restaurant-name-text">
                                              {store.name || `${t('restaurant')} ${storeIndex + 1}`}
                                            </span>
                                            <span className="restaurant-total">
                                              {storeTotal.toFixed(2)} DT
                                            </span>
                                          </div>
                                          <svg 
                                            width="16" 
                                            height="16" 
                                            viewBox="0 0 24 24" 
                                            fill="none"
                                            className={`restaurant-expand-icon ${isExpanded ? 'expanded' : ''}`}
                                          >
                                            <path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                          </svg>
                                        </div>
                                        {isExpanded && (
                                          <div className="order-restaurant-items">
                                            {storeItems.length > 0 ? (
                                              storeItems.map((item, itemIndex) => (
                                                <div key={itemIndex} className="order-item">
                                                  <div className="order-item-row">
                                                    <div className="order-item-name">{item.name || t('unnamedItem')}</div>
                                                    <div className="order-item-price">
                                                      {item.price ? `${parseFloat(item.price).toFixed(2)} DT` : '0.00 DT'}
                                                    </div>
                                                  </div>
                                                  {item.description && (
                                                    <div className="order-item-description">{item.description}</div>
                                                  )}
                                                </div>
                                              ))
                                            ) : (
                                              <div className="order-item">
                                                <div className="order-item-name">{t('noItemsForRestaurant')}</div>
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                                
                                <div className="order-breakdown">
                                  <div className="order-line">
                                    <span>{t('items')}:</span>
                                    <span>{calculateItemsSubtotal(mission).toFixed(2)} DT</span>
                                  </div>
                                  {mission.deliveryFee !== undefined && mission.deliveryFee > 0 && (
                                    <div className="order-line">
                                      <span>{t('delivery')}:</span>
                                      <span>{mission.deliveryFee.toFixed(2)} DT</span>
                                    </div>
                                  )}
                                </div>
                                <div className="order-total">
                                  <strong>Total: {totalAmount.toFixed(2)} DT</strong>
                                </div>
                              </>
                            );
                          } else {
                            // Old system: Show items list
                            return (
                              <>
                                <div className="order-items-list">
                                  {missionItems.length > 0 ? (
                                    missionItems.map((item, index) => (
                                      <div key={index} className="order-item">
                                        <div className="order-item-row">
                                          <div className="order-item-name">{item.name || 'Unnamed Item'}</div>
                                          <div className="order-item-price">
                                            {item.price ? `${parseFloat(item.price).toFixed(2)} DT` : '0.00 DT'}
                                          </div>
                                        </div>
                                        {item.description && (
                                          <div className="order-item-description">{item.description}</div>
                                        )}
                                      </div>
                                    ))
                                  ) : (
                                    <div className="order-item">
                                      <div className="order-item-name">No items listed</div>
                                    </div>
                                  )}
                                </div>
                                
                                <div className="order-breakdown">
                                  <div className="order-line">
                                    <span>{t('items')}:</span>
                                    <span>{calculateItemsSubtotal(mission).toFixed(2)} DT</span>
                                  </div>
                                  {mission.deliveryFee !== undefined && mission.deliveryFee > 0 && (
                                    <div className="order-line">
                                      <span>{t('delivery')}:</span>
                                      <span>{mission.deliveryFee.toFixed(2)} DT</span>
                                    </div>
                                  )}
                                </div>
                                <div className="order-total">
                                  <strong>Total: {totalAmount.toFixed(2)} DT</strong>
                                </div>
                              </>
                            );
                          }
                        })()}
                      </div>
                    </div>
                  )}



                  {mission.createdAt && (
                    <div className="mission-date">
                      {new Date(mission.createdAt).toLocaleString()}
                    </div>
                  )}

                  {/* Show points for completed missions */}
                  {isFinished(mission) && mission.pointsAwarded !== undefined && (
                    <div className={`mission-points ${mission.pointsAwarded >= 0 ? 'points-positive' : 'points-negative'}`}>
                      {mission.pointsAwarded >= 0 ? '+' : ''}{mission.pointsAwarded} points
                    </div>
                  )}
                </div>
              )}
              </div>
              </div>
            );
          })}
        </div>
      )}
      </div>

      {/* Orders Board - Mobile Friendly */}
      {showOrdersBoard && selectedMissionForOrders && (
        <div className="orders-board-overlay" onClick={() => {
          setShowOrdersBoard(false);
          setSelectedMissionForOrders(null);
        }}>
          <div className="orders-board" onClick={(e) => e.stopPropagation()}>
            <div className="orders-board-header">
              <h2>Orders</h2>
              <button
                className="orders-board-close"
                onClick={() => {
                  setShowOrdersBoard(false);
                  setSelectedMissionForOrders(null);
                }}
              >
                ✕
              </button>
            </div>
            <div className="orders-board-content">
              {(() => {
                const mission = selectedMissionForOrders;
                const hasStores = mission.stores && mission.stores.length > 0;
                const missionItems = mission.items || [];
                const totalAmount = calculateMissionTotal(mission);
                
                return (
                  <div className="order-card">
                    <div className="order-card-header">
                      <div className="order-mission-info">
                        <span className="order-mission-id">#{mission.id.slice(0, 8)}</span>
                        <span className="order-client-name">{mission.clientName || 'N/A'}</span>
                      </div>
                      <span
                        className="order-status-badge"
                        style={{ backgroundColor: getStatusColor(mission.status) }}
                      >
                        {mission.status?.toUpperCase() || 'UNKNOWN'}
                      </span>
                    </div>
                    
                    {hasStores ? (
                      // New system: Show restaurants as expandable sections
                      <div className="order-restaurants-list">
                        {mission.stores.map((store, storeIndex) => {
                          const restaurantKey = `board-${mission.id}-${storeIndex}`;
                          const isExpanded = expandedRestaurants.has(restaurantKey);
                          const storeItems = store.items || [];
                          // Exclude skipped stores from total
                          const skippedStoreIndices = mission.skippedStores?.map(s => s.storeIndex) || [];
                          const isSkipped = skippedStoreIndices.includes(storeIndex);
                          const storeTotal = isSkipped ? 0 : storeItems.reduce((sum, item) => 
                            sum + (parseFloat(item.price) || 0), 0
                          );
                          
                          return (
                            <div key={storeIndex} className="order-restaurant-section">
                              <div 
                                className="order-restaurant-header"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const newExpanded = new Set(expandedRestaurants);
                                  if (isExpanded) {
                                    newExpanded.delete(restaurantKey);
                                  } else {
                                    newExpanded.add(restaurantKey);
                                  }
                                  setExpandedRestaurants(newExpanded);
                                }}
                              >
                                <div className="order-restaurant-name">
                                  <span className="restaurant-name-text">
                                    {store.name || `Restaurant ${storeIndex + 1}`}
                                  </span>
                                  <span className="restaurant-total">
                                    {storeTotal.toFixed(2)} DT
                                  </span>
                                </div>
                                <svg 
                                  width="16" 
                                  height="16" 
                                  viewBox="0 0 24 24" 
                                  fill="none"
                                  className={`restaurant-expand-icon ${isExpanded ? 'expanded' : ''}`}
                                >
                                  <path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              </div>
                              {isExpanded && (
                                <div className="order-restaurant-items">
                                  {storeItems.length > 0 ? (
                                    storeItems.map((item, itemIndex) => (
                                      <div key={itemIndex} className="order-item">
                                        <div className="order-item-row">
                                          <div className="order-item-name">{item.name || 'Unnamed Item'}</div>
                                          <div className="order-item-price">
                                            {item.price ? `${parseFloat(item.price).toFixed(2)} DT` : '0.00 DT'}
                                          </div>
                                        </div>
                                        {item.description && (
                                          <div className="order-item-description">{item.description}</div>
                                        )}
                                      </div>
                                    ))
                                  ) : (
                                    <div className="order-item">
                                      <div className="order-item-name">No items for this restaurant</div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      // Old system: Show items list
                    <div className="order-items-list">
                      {missionItems.length > 0 ? (
                        missionItems.map((item, index) => (
                          <div key={index} className="order-item">
                            <div className="order-item-name">{item.name || 'Unnamed Item'}</div>
                            <div className="order-item-price">
                              {item.price ? `${parseFloat(item.price).toFixed(2)} DT` : '0.00 DT'}
                            </div>
                            {item.description && (
                              <div className="order-item-description">{item.description}</div>
                            )}
                          </div>
                        ))
                      ) : (
                        <div className="order-item">
                          <div className="order-item-name">No items listed</div>
                        </div>
                      )}
                    </div>
                    )}
                    
                    <div className="order-breakdown">
                      <div className="order-line">
                        <span>Items:</span>
                        <span>{calculateItemsSubtotal(mission).toFixed(2)} DT</span>
                      </div>
                      {mission.deliveryFee !== undefined && mission.deliveryFee > 0 && mission.status !== 'cancelled' && (
                        <div className="order-line">
                          <span>Delivery:</span>
                          <span>{mission.deliveryFee.toFixed(2)} DT</span>
                        </div>
                      )}
                    </div>
                    <div className="order-total">
                      <strong>{t('total')}: {calculateMissionTotal(mission).toFixed(2)} DT</strong>
                    </div>
                    
                    {mission.clientPhone && (
                      <div className="order-actions">
                        <a
                          href={`tel:${mission.clientPhone}`}
                          className="call-client-button"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M3 5C3 3.89543 3.89543 3 5 3H8.27924C8.70967 3 9.09181 3.27543 9.22792 3.68377L10.7257 8.17721C10.8831 8.64932 10.6694 9.16531 10.2243 9.38787L7.96701 10.5165C9.06925 12.9612 11.0388 14.9308 13.4835 16.033L14.6121 13.7757C14.8347 13.3306 15.3507 13.1169 15.8228 13.2743L20.3162 14.7721C20.7246 14.9082 21 15.2903 21 15.7208V19C21 20.1046 20.1046 21 19 21H18C9.71573 21 3 14.2843 3 6V5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                          {t('callClient')}
                        </a>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
      
      {/* Price Setting Modal */}
      {showPriceModal && priceModalMission && (
        <div className="modal-overlay" onClick={() => setShowPriceModal(false)}>
          <div className="modal-content price-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{t('setItemPrices')}</h3>
              <button
                className="modal-close"
                onClick={() => {
                  setShowPriceModal(false);
                  setPriceModalMission(null);
                  setPriceModalStoreIndex(null);
                  setPriceModalItems([]);
                }}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <p className="price-modal-info">
                {priceModalStoreIndex !== null
                  ? `${t('pleaseSetPricesForItemsFrom')} ${priceModalMission.stores[priceModalStoreIndex].name || `${t('store')} ${priceModalStoreIndex + 1}`}`
                  : t('pleaseSetPricesForItems')}
              </p>
              <div className="price-modal-items">
                {priceModalItems.map((item, idx) => (
                  <div key={idx} className="price-modal-item">
                    <label>{item.name}</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={item.price}
                      onChange={(e) => {
                        const newItems = [...priceModalItems];
                        newItems[idx].price = e.target.value;
                        setPriceModalItems(newItems);
                      }}
                      placeholder="0.00"
                      required
                    />
                    <span>DT</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="modal-button secondary"
                onClick={() => {
                  setShowPriceModal(false);
                  setPriceModalMission(null);
                  setPriceModalStoreIndex(null);
                  setPriceModalItems([]);
                }}
              >
                {t('cancel')}
              </button>
              <button
                className="modal-button primary"
                onClick={handlePriceModalSave}
                disabled={updatingId === priceModalMission?.id}
              >
                {updatingId === priceModalMission?.id ? t('saving') + '...' : t('saveAndConfirmPickup')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

