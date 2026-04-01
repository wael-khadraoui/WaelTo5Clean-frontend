import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Map, { Marker, Source, Layer } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { authService, dataService, userService } from '../App';
import { useTranslation } from '../hooks/useTranslation';
import { mapboxConfig } from '../config/mapboxConfig';
import MapboxConfigMissing from '../components/MapboxConfigMissing.jsx';
import { getRoute } from '../utils/mapboxDirections';
import toast from 'react-hot-toast';
import './MapPage.css';

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
  const speedKmh = 35; // motorcycle
  const hours = distanceKm / speedKmh;
  const minutes = Math.round(hours * 60);
  if (minutes < 1) return '< 1 min';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
};

// Generate a curved arc line between two points to avoid overlaps
// Uses a variation seed to create different curve directions for different missions
const generateArcLine = (pointA, pointB, variationSeed = 0) => {
  const lat1 = pointA.latitude;
  const lon1 = pointA.longitude;
  const lat2 = pointB.latitude;
  const lon2 = pointB.longitude;

  // Calculate midpoint
  const midLat = (lat1 + lat2) / 2;
  const midLon = (lon1 + lon2) / 2;

  // Calculate bearing (direction) of the line
  const dLon = toRadians(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRadians(lat2));
  const x =
    Math.cos(toRadians(lat1)) * Math.sin(toRadians(lat2)) -
    Math.sin(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.cos(dLon);
  const bearing = Math.atan2(y, x);

  // Calculate perpendicular offset (90 degrees from bearing)
  // Use variationSeed to alternate curve direction (up/down)
  const direction = (variationSeed % 2 === 0 ? 1 : -1);
  const perpBearing = bearing + (Math.PI / 2) * direction;

  // Calculate distance between points to determine arc height
  const distance = calculateDistanceKm(pointA, pointB) || 0;
  // Base arc height scales with distance, with some variation
  const baseArcHeight = Math.min(0.001 * (1 + distance * 0.15), 0.008);
  const dynamicArcHeight = baseArcHeight * (0.7 + (variationSeed % 3) * 0.2);

  // Offset the midpoint perpendicular to the line
  const offsetLat = midLat + Math.cos(perpBearing) * dynamicArcHeight;
  const offsetLon = midLon + Math.sin(perpBearing) * dynamicArcHeight;

  // Generate curve points (quadratic bezier approximation)
  const numPoints = Math.max(15, Math.floor(distance * 25)); // More points for longer distances
  const coordinates = [];

  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    // Quadratic bezier curve: (1-t)²P₀ + 2(1-t)tP₁ + t²P₂
    const lat =
      (1 - t) * (1 - t) * lat1 +
      2 * (1 - t) * t * offsetLat +
      t * t * lat2;
    const lon =
      (1 - t) * (1 - t) * lon1 +
      2 * (1 - t) * t * offsetLon +
      t * t * lon2;
    coordinates.push([lon, lat]);
  }

  return coordinates;
};

const defaultCenter = {
  latitude: 37.269584420315546,
  longitude: 9.874240390070584,
};

export default function MapPage() {
  const { t } = useTranslation();
  const [viewState, setViewState] = useState({
    latitude: defaultCenter.latitude,
    longitude: defaultCenter.longitude,
    zoom: 15,
  });
  const [mission, setMission] = useState(null);
  const [routeCoordinates, setRouteCoordinates] = useState([]);
  const [routeError, setRouteError] = useState(null);
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const [showMissionInfo, setShowMissionInfo] = useState(false);
  const [isMissionActionLoading, setIsMissionActionLoading] = useState(false);
  const [autoFollow, setAutoFollow] = useState(true);
  const [userRole, setUserRole] = useState(null); // admin, delivery_guy, monitor, user
  const [overviewMissions, setOverviewMissions] = useState([]);
  const [overviewDeliveryGuys, setOverviewDeliveryGuys] = useState([]);
  const [overviewMissionRoutes, setOverviewMissionRoutes] = useState({}); // missionId -> route coordinates
  const [selectedMissionId, setSelectedMissionId] = useState(null); // Selected mission for focus view
  const [isLoadingOverviewRoutes, setIsLoadingOverviewRoutes] = useState(false);
  const [clickedMission, setClickedMission] = useState(null); // Mission clicked on map for popup
  const [clickedMarkerType, setClickedMarkerType] = useState(null); // 'pickup' or 'delivery'
  const [clickedLocation, setClickedLocation] = useState(null); // Location clicked: { lat, lon, type: 'store'|'delivery', missions: [], locationKey: string }
  const [locationRoutes, setLocationRoutes] = useState({}); // locationKey -> routes for all missions at that location
  const [selectedMissionFromLocation, setSelectedMissionFromLocation] = useState(null); // Mission selected from location popup
  const [selectedMissionLocationKey, setSelectedMissionLocationKey] = useState(null); // Store locationKey for selected mission
  const [expandedMissionIdInPopup, setExpandedMissionIdInPopup] = useState(null); // Track which mission is expanded in location popup
  const locationWatchId = useRef(null);
  const lastRouteOriginRef = useRef(null);
  const hasInitializedMap = useRef(false);
  const navigate = useNavigate();
  const locationState = useLocation();
  const [viewMode, setViewMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('homeViewMode') || 'admin';
    }
    return 'admin';
  });

  // Listen for storage changes (when admin switches mode in HomePage)
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === 'homeViewMode') {
        setViewMode(e.newValue || 'admin');
      }
    };
    window.addEventListener('storage', handleStorageChange);
    // Also check periodically in case same-tab changes (localStorage doesn't fire storage event in same tab)
    const interval = setInterval(() => {
      const current = localStorage.getItem('homeViewMode') || 'admin';
      if (current !== viewMode) {
        setViewMode(current);
      }
    }, 500);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, [viewMode]);

  const isAdminOrMonitor = userRole === 'admin' || userRole === 'monitor';
  const isDeliveryMode = isAdminOrMonitor && viewMode === 'delivery';
  // Treat admin/monitor in delivery mode as delivery guy for map view
  const effectiveRole = isDeliveryMode ? 'delivery_guy' : userRole;

  useEffect(() => {
    if (locationState.state?.mission) {
      setMission(locationState.state.mission);
    }
  }, [locationState.state]);

  // Load user role and overview data when we are not focused on a single mission
  useEffect(() => {
    const init = async () => {
      const currentUser = authService.getCurrentUser();
      if (!currentUser) return;

      const data = await userService.getUserData(currentUser.uid);
      const role = data?.role || 'user';
      setUserRole(role);

      // If we came here without a specific mission, show overview map
      if (!locationState.state?.mission) {
        // Check if admin/monitor is in delivery mode
        const currentViewMode = typeof window !== 'undefined' ? (localStorage.getItem('homeViewMode') || 'admin') : 'admin';
        const inDeliveryMode = (role === 'admin' || role === 'monitor') && currentViewMode === 'delivery';
        
        if ((role === 'admin' || role === 'monitor') && !inDeliveryMode) {
          // Admin/monitor in admin mode: show all active delivery guys
          const guys = await dataService.getActiveDeliveryGuys();
          setOverviewDeliveryGuys(guys || []);

          // Center roughly on all active guys if we have them
          const locations = (guys || [])
            .filter(g => g.location)
            .map(g => [g.location.longitude, g.location.latitude]);
          if (locations.length > 0) {
            const avgLng =
              locations.reduce((sum, [lng]) => sum + lng, 0) / locations.length;
            const avgLat =
              locations.reduce((sum, [, lat]) => sum + lat, 0) / locations.length;
            setViewState(prev => ({
              ...prev,
              latitude: avgLat,
              longitude: avgLng,
              zoom: locations.length === 1 ? 14 : 12,
            }));
          }
        } else if (role === 'delivery_guy' || inDeliveryMode) {
          // Delivery guy OR admin/monitor in delivery mode: show only new/current missions (exclude completed/canceled)
          const allMissions = await dataService.getAllMissions();
          const currentUserId = authService.getCurrentUser()?.uid;
          const activeMissions = (allMissions || []).filter(m => {
            // Only show missions that are not completed or canceled
            if (m.status === 'completed' || m.status === 'cancelled') return false;
            // Show unassigned missions or missions assigned to this user (or all if admin in delivery mode)
            if (inDeliveryMode) {
              // In delivery mode, show all active missions (unassigned or assigned to anyone)
              return true;
            }
            return !m.assignedTo || m.assignedTo === currentUserId;
          }).filter(
            m => {
              // Must have stores or delivery location
              const hasStores = m.stores && m.stores.length > 0;
              const hasDelivery = m.deliveryLocation;
              return hasStores || hasDelivery;
            }
          );
          setOverviewMissions(activeMissions);

          // For delivery guys, center on their location first (will be updated when location is available)
          // Don't center on missions - wait for user location
        }
      }
    };

    init();
  }, [locationState.state, viewMode]); // Re-run when viewMode changes

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };
          setUserLocation(coords);
          
          // For delivery guys in overview mode, center on their location (only on first load)
          // This will be handled by a separate effect that watches userRole and userLocation
        },
        (error) => {
          // Use default location if location access fails
          setViewState(prev => ({
            ...prev,
            latitude: defaultCenter.latitude,
            longitude: defaultCenter.longitude,
          }));
        }
      );

      // Watch position (only update userLocation; camera movement is handled by autoFollow effect)
      locationWatchId.current = navigator.geolocation.watchPosition(
        (position) => {
          const coords = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };
          setUserLocation(coords);

          // Push location to API
          const user = authService.getCurrentUser();
          if (user) {
            dataService.updateLocation(user.uid, {
              latitude: coords.latitude,
              longitude: coords.longitude,
            });
          }
        },
        (error) => {
          // If watching fails, ensure we're using default location
          if (error.code === error.PERMISSION_DENIED) {
            setViewState(prev => ({
              ...prev,
              latitude: defaultCenter.latitude,
              longitude: defaultCenter.longitude,
            }));
          }
        },
        {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 0,
        }
      );
    }
    return () => {
      if (locationWatchId.current) {
        navigator.geolocation.clearWatch(locationWatchId.current);
      }
    };
  }, []);

  const loadRoute = useCallback(async () => {
    if (!mission) {
      setRouteCoordinates([]);
      return;
    }

    // Check if client location is set
    const hasDeliveryLocation = mission.deliveryLocation && 
      mission.deliveryLocation.latitude && 
      mission.deliveryLocation.longitude;

    // If no delivery location, show routes only to stores (closest first)
    if (!hasDeliveryLocation) {
      const hasStores = mission.stores && mission.stores.length > 0;
      const hasPickupLocation = mission.pickupLocation && 
        mission.pickupLocation.latitude && 
        mission.pickupLocation.longitude;
      
      if (!hasStores && !hasPickupLocation) {
        setRouteCoordinates([]);
        return;
      }

      // Get all store locations
      const storeLocations = [];
      if (hasStores) {
        mission.stores.forEach((store, index) => {
          // Skip skipped stores
          const skippedStoreIndices = mission.skippedStores?.map(s => s.storeIndex) || [];
          if (!skippedStoreIndices.includes(index) && store.location && 
              store.location.latitude && store.location.longitude) {
            storeLocations.push({
              location: store.location,
              index: index,
            });
          }
        });
      } else if (hasPickupLocation) {
        // Legacy single pickup
        storeLocations.push({
          location: mission.pickupLocation,
          index: 0,
        });
      }

      if (storeLocations.length === 0) {
        setRouteCoordinates([]);
        return;
      }

      // Sort stores by distance from user (if available) or just use order
      let sortedStores = storeLocations;
      if (userLocation) {
        sortedStores = storeLocations
          .map(store => ({
            ...store,
            distance: calculateDistanceKm(userLocation, store.location),
          }))
          .sort((a, b) => (a.distance || Infinity) - (b.distance || Infinity));
      }

      // Build waypoints: user -> stores (closest first)
      const waypoints = [];
      const hasLiveTrajectory = mission.status === 'in_progress' && !!userLocation;
      
      if (hasLiveTrajectory) {
        waypoints.push([userLocation.longitude, userLocation.latitude]);
      }
      
      sortedStores.forEach(store => {
        waypoints.push([store.location.longitude, store.location.latitude]);
      });

      setIsLoadingRoute(true);
      setRouteError(null);

      try {
        const routedPath = await getRoute(waypoints, mapboxConfig.accessToken, 'driving');
        if (routedPath && routedPath.length > 0) {
          setRouteCoordinates(routedPath);
          if (hasLiveTrajectory) {
            lastRouteOriginRef.current = userLocation;
          } else {
            lastRouteOriginRef.current = null;
          }
        } else {
          setRouteCoordinates(waypoints);
          setRouteError('Unable to fetch detailed route, showing straight line.');
        }
      } catch (error) {
        setRouteCoordinates(waypoints);
        setRouteError('Route service failed, showing straight line.');
      } finally {
        setIsLoadingRoute(false);
      }
      return;
    }

    // Original logic: has delivery location
    if (!mission.pickupLocation && !(mission.stores && mission.stores.length > 0)) {
      setRouteCoordinates([]);
      return;
    }

    const hasLiveTrajectory = mission.status === 'in_progress' && !!userLocation;
    
    // Build waypoints for missions with delivery location
    const waypoints = [];
    
    if (hasLiveTrajectory) {
      waypoints.push([userLocation.longitude, userLocation.latitude]);
    }
    
    // Add pickup locations (stores or single pickup)
    // Exclude stores that have already been picked up
    if (mission.stores && mission.stores.length > 0) {
      const skippedStoreIndices = mission.skippedStores?.map(s => s.storeIndex) || [];
      const pickedUpStores = mission.pickedUpFromStores || [];
      mission.stores.forEach((store, index) => {
        // Skip stores that are skipped OR already picked up
        if (!skippedStoreIndices.includes(index) && 
            !pickedUpStores.includes(index) &&
            store.location && 
            store.location.latitude && 
            store.location.longitude) {
          waypoints.push([store.location.longitude, store.location.latitude]);
        }
      });
    } else if (mission.pickupLocation && !mission.pickupReachedAt && !mission.pickupArrivedAt) {
      // Only add pickup location if it hasn't been reached yet
      waypoints.push([mission.pickupLocation.longitude, mission.pickupLocation.latitude]);
    }
    
    // Add delivery location
    waypoints.push([mission.deliveryLocation.longitude, mission.deliveryLocation.latitude]);

    if (hasLiveTrajectory && lastRouteOriginRef.current) {
      const movedKm = calculateDistanceKm(lastRouteOriginRef.current, userLocation);
      if (movedKm !== null && movedKm < 0.03) {
        return;
      }
    }

    setIsLoadingRoute(true);
    setRouteError(null);

    try {
      const routedPath = await getRoute(waypoints, mapboxConfig.accessToken, 'driving');
      if (routedPath && routedPath.length > 0) {
        setRouteCoordinates(routedPath);
        if (hasLiveTrajectory) {
          lastRouteOriginRef.current = userLocation;
        } else {
          lastRouteOriginRef.current = null;
        }
      } else {
        setRouteCoordinates(waypoints);
        setRouteError('Unable to fetch detailed route, showing straight line.');
      }
    } catch (error) {
      setRouteCoordinates(waypoints);
      setRouteError('Route service failed, showing straight line.');
    } finally {
      setIsLoadingRoute(false);
    }
  }, [mission, userLocation]);

  useEffect(() => {
    loadRoute();
  }, [loadRoute]);

  useEffect(() => {
    if (mission?.status !== 'in_progress') {
      lastRouteOriginRef.current = null;
    }
  }, [mission?.status]);

  const distanceMetrics = useMemo(() => {
    if (!mission) {
      return {
        toPickup: null,
        toDelivery: null,
        pickupToDelivery: null,
      };
    }
    return {
      toPickup:
        userLocation && mission.pickupLocation
          ? calculateDistanceKm(userLocation, mission.pickupLocation)
          : null,
      toDelivery:
        userLocation && mission.deliveryLocation
          ? calculateDistanceKm(userLocation, mission.deliveryLocation)
          : null,
      pickupToDelivery:
        mission.pickupLocation && mission.deliveryLocation
          ? calculateDistanceKm(mission.pickupLocation, mission.deliveryLocation)
          : null,
    };
  }, [mission, userLocation]);

  const totalDistanceLeft =
    distanceMetrics.toPickup !== null &&
    distanceMetrics.pickupToDelivery !== null
      ? distanceMetrics.toPickup + distanceMetrics.pickupToDelivery
      : null;

  const missionStatusLabel = mission?.status
    ? mission.status.replace('_', ' ').toUpperCase()
    : 'UNKNOWN';
  const currentUserId = authService.getCurrentUser()?.uid;
  const isAssignedToMe = mission?.assignedTo === currentUserId;
  const canStartMission =
    isAssignedToMe && ['assigned', 'pending'].includes(mission?.status);

  const handleStartMission = async () => {
    if (!mission?.id) return;
    setIsMissionActionLoading(true);
    try {
      const result = await dataService.updateMissionStatus(mission.id, 'in_progress');
      if (result?.success) {
        setMission(prev => prev ? { ...prev, status: 'in_progress' } : prev);
        toast.success('Mission started');
      } else {
        toast.error(result?.error || 'Failed to start mission');
      }
    } catch (error) {
      toast.error('Failed to start mission');
    } finally {
      setIsMissionActionLoading(false);
    }
  };

  useEffect(() => {
    if (
      mission?.status !== 'in_progress' ||
      !userLocation ||
      !autoFollow
    ) {
      return;
    }

    setViewState(prev => ({
      ...prev,
      latitude: userLocation.latitude,
      longitude: userLocation.longitude,
      zoom: Math.max(prev.zoom, 19),
    }));
  }, [mission?.status, userLocation, autoFollow]);

  useEffect(() => {
    if (mission?.status === 'in_progress') {
      setAutoFollow(true);
    }
  }, [mission?.status]);

  // Center map on delivery guy's location when they first open the map (only once)
  useEffect(() => {
    if (effectiveRole === 'delivery_guy' && !mission && userLocation && !hasInitializedMap.current) {
      setViewState(prev => {
        // Only update if we're still at default center
        const isAtDefault = Math.abs(prev.latitude - defaultCenter.latitude) < 0.01 &&
                           Math.abs(prev.longitude - defaultCenter.longitude) < 0.01;
        if (isAtDefault) {
          hasInitializedMap.current = true;
          return {
            ...prev,
            latitude: userLocation.latitude,
            longitude: userLocation.longitude,
            zoom: 14,
          };
        }
        return prev;
      });
    }
  }, [effectiveRole, mission, userLocation]);

  const routeGeoJson = routeCoordinates.length > 0 ? {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: routeCoordinates,
    },
  } : null;

  // Load street routes for overview missions (only once, not constantly updating)
  useEffect(() => {
    if (mission || effectiveRole !== 'delivery_guy' || overviewMissions.length === 0 || !userLocation) {
      return; // Don't clear routes, just don't update
    }

    // Only load routes if we don't have them already for these missions
    const currentUserId = authService.getCurrentUser()?.uid;
    const needsRoutes = overviewMissions.filter(m => {
      const isAssignedToMe = m.assignedTo === currentUserId;
      const isInProgress = isAssignedToMe && m.status === 'in_progress';
      const isAvailable = !m.assignedTo && m.status === 'pending';
      if (!isInProgress && !isAssignedToMe && !isAvailable) return false;
      return !overviewMissionRoutes[m.id]; // Only if route doesn't exist
    });

    if (needsRoutes.length === 0) {
      return; // All routes already loaded
    }

    const loadRoutes = async () => {
      setIsLoadingOverviewRoutes(true);
      const routes = { ...overviewMissionRoutes }; // Start with existing routes

      // Load routes only for missions that need them
      for (const m of needsRoutes) {
        // Build waypoints: user location -> stores (sorted by distance) -> delivery
        const waypoints = [];
        
        // Start from user location (use initial location, not constantly updating)
        waypoints.push([userLocation.longitude, userLocation.latitude]);

        // Add stores (excluding skipped stores)
        if (m.stores && m.stores.length > 0) {
          const skippedStoreIndices = m.skippedStores?.map(s => s.storeIndex) || [];
          const activeStores = m.stores
            .map((store, idx) => ({ store, index: idx }))
            .filter(({ store, index }) => !skippedStoreIndices.includes(index) && store.location)
            .map(({ store, index }) => ({
              ...store,
              originalIndex: index,
              distance: calculateDistanceKm(userLocation, store.location)
            }))
            .sort((a, b) => (a.distance || Infinity) - (b.distance || Infinity));

          // Add stores in order (closest first)
          activeStores.forEach(store => {
            waypoints.push([store.location.longitude, store.location.latitude]);
          });
        } else if (m.pickupLocation) {
          // Legacy single pickup location
          waypoints.push([m.pickupLocation.longitude, m.pickupLocation.latitude]);
        }

        // End at delivery location
        if (m.deliveryLocation) {
          waypoints.push([m.deliveryLocation.longitude, m.deliveryLocation.latitude]);
        }

        if (waypoints.length < 2) continue;

        try {
          const routeCoords = await getRoute(
            waypoints,
            mapboxConfig.accessToken,
            'driving'
          );
          if (routeCoords && routeCoords.length > 0) {
            routes[m.id] = routeCoords;
          }
        } catch (error) {
        }
      }

      setOverviewMissionRoutes(routes);
      setIsLoadingOverviewRoutes(false);
    };

    loadRoutes();
  }, [mission, effectiveRole, overviewMissions]); // Removed userLocation to prevent constant updates

  // Group missions by location (stores and delivery locations) for delivery guys
  // Locations within ~50 meters are considered the same location
  const locationGroups = useMemo(() => {
    if (mission || effectiveRole !== 'delivery_guy' || overviewMissions.length === 0) {
      return { stores: [], deliveries: [] };
    }

    const LOCATION_TOLERANCE_KM = 0.05; // ~50 meters
    const storeGroups = [];
    const deliveryGroups = [];

    // Helper to find or create a location group
    const findOrCreateGroup = (location, type, groups) => {
      for (const group of groups) {
        const distance = calculateDistanceKm(group.location, location);
        if (distance !== null && distance < LOCATION_TOLERANCE_KM) {
          return group;
        }
      }
      // Create new group
      const newGroup = {
        location,
        type,
        missions: [],
        locationKey: `${type}-${location.latitude.toFixed(6)}-${location.longitude.toFixed(6)}`
      };
      groups.push(newGroup);
      return newGroup;
    };

    overviewMissions.forEach(m => {
      // Process stores (excluding skipped)
      if (m.stores && m.stores.length > 0) {
        const skippedStoreIndices = m.skippedStores?.map(s => s.storeIndex) || [];
        m.stores.forEach((store, storeIdx) => {
          if (!skippedStoreIndices.includes(storeIdx) && store.location) {
            const group = findOrCreateGroup(store.location, 'store', storeGroups);
            if (!group.missions.find(mission => mission.mission?.id === m.id || mission.id === m.id)) {
              group.missions.push({ mission: m, storeIndex: storeIdx, store });
            }
          }
        });
      } else if (m.pickupLocation) {
        // Legacy single pickup
        const group = findOrCreateGroup(m.pickupLocation, 'store', storeGroups);
        if (!group.missions.find(mission => mission.mission?.id === m.id || mission.id === m.id)) {
          group.missions.push({ mission: m });
        }
      }

      // Process delivery location
      if (m.deliveryLocation) {
        const group = findOrCreateGroup(m.deliveryLocation, 'delivery', deliveryGroups);
        if (!group.missions.find(mission => mission.mission?.id === m.id || mission.id === m.id)) {
          group.missions.push({ mission: m });
        }
      }
    });

    return { stores: storeGroups, deliveries: deliveryGroups };
  }, [mission, effectiveRole, overviewMissions]);

  // Assign mission numbers (same mission = same number) - calculated separately so markers can use it immediately
  const missionNumbers = useMemo(() => {
    if (mission || effectiveRole !== 'delivery_guy' || overviewMissions.length === 0) {
      return {};
    }

    const missionNumberMap = {};
    let missionCounter = 1;
    overviewMissions.forEach(m => {
      if (!missionNumberMap[m.id]) {
        missionNumberMap[m.id] = missionCounter++;
      }
    });

    return missionNumberMap;
  }, [mission, effectiveRole, overviewMissions]);

  // Generate GeoJSON for overview mission routes
  const overviewMissionLines = useMemo(() => {
    if (mission || effectiveRole !== 'delivery_guy' || Object.keys(overviewMissionRoutes).length === 0) {
      return null;
    }

    const currentUserId = authService.getCurrentUser()?.uid;
    const linesByCategory = {
      available: [],
      assigned: [],
      inProgress: [],
    };

    overviewMissions.forEach(m => {
      if (!overviewMissionRoutes[m.id]) return;

      const isAssignedToMe = m.assignedTo === currentUserId;
      const isInProgress = isAssignedToMe && m.status === 'in_progress';
      const isAvailable = !m.assignedTo && m.status === 'pending';

      let category = null;
      if (isInProgress) category = 'inProgress';
      else if (isAssignedToMe) category = 'assigned';
      else if (isAvailable) category = 'available';

      if (category) {
        linesByCategory[category].push({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: overviewMissionRoutes[m.id],
          },
          properties: { missionId: m.id, missionNumber: missionNumbers[m.id] },
        });
      }
    });

    return {
      available: linesByCategory.available.length > 0 ? {
        type: 'FeatureCollection',
        features: linesByCategory.available,
      } : null,
      assigned: linesByCategory.assigned.length > 0 ? {
        type: 'FeatureCollection',
        features: linesByCategory.assigned,
      } : null,
      inProgress: linesByCategory.inProgress.length > 0 ? {
        type: 'FeatureCollection',
        features: linesByCategory.inProgress,
      } : null,
    };
  }, [mission, userRole, overviewMissions, overviewMissionRoutes, missionNumbers]);

  if (!mapboxConfig.isConfigured) {
    return (
      <div className="map-page">
        <MapboxConfigMissing />
      </div>
    );
  }

  return (
    <div className="map-page">
      <Map
        {...viewState}
        onMove={evt => setViewState(evt.viewState)}
        mapboxAccessToken={mapboxConfig.accessToken}
        style={{ width: '100%', height: '100%' }}
        mapStyle={mapboxConfig.styleURL}
      >
        {/* User location marker (delivery guy) - only when we know location */}
        {effectiveRole === 'delivery_guy' && userLocation && (
          <Marker
            longitude={userLocation.longitude}
            latitude={userLocation.latitude}
            anchor="bottom"
          >
            <div className="marker-icon user-marker" title="You (delivery driver)">
              <span className="marker-emoji">🛵</span>
            </div>
          </Marker>
        )}

        {/* Selected mission markers - show only when a mission is selected */}
        {!mission && effectiveRole === 'delivery_guy' && selectedMissionFromLocation && (() => {
          const m = selectedMissionFromLocation;
          
          return (
            <>
              {/* Store markers for selected mission */}
              {m.stores && m.stores.length > 0 && (() => {
                const skippedStoreIndices = m.skippedStores?.map(s => s.storeIndex) || [];
                return m.stores
                  .map((store, idx) => ({ store, index: idx }))
                  .filter(({ store, index }) => !skippedStoreIndices.includes(index) && store.location)
                  .map(({ store, index }) => (
                    <Marker
                      key={`selected-store-${m.id}-${index}`}
                      longitude={store.location.longitude}
                      latitude={store.location.latitude}
                      anchor="bottom"
                    >
                      <div className="marker-icon location-group-marker mission-available mission-marker-clickable" title={`Store: ${store.name || `Store ${index + 1}`}`}>
                        <span className="marker-emoji">🍽️</span>
                      </div>
                    </Marker>
                  ));
              })()}
              {/* Legacy single pickup marker */}
              {(!m.stores || m.stores.length === 0) && m.pickupLocation && (
                <Marker
                  longitude={m.pickupLocation.longitude}
                  latitude={m.pickupLocation.latitude}
                  anchor="bottom"
                >
                  <div className="marker-icon location-group-marker mission-available mission-marker-clickable" title="Pickup (restaurant)">
                    <span className="marker-emoji">🍽️</span>
                  </div>
                </Marker>
              )}
              {/* Delivery location marker */}
              {m.deliveryLocation && (
                <Marker
                  longitude={m.deliveryLocation.longitude}
                  latitude={m.deliveryLocation.latitude}
                  anchor="bottom"
                >
                  <div className="marker-icon location-group-marker mission-available mission-marker-clickable" title={`Delivery: ${m.clientName || 'Client'}`}>
                    <span className="marker-emoji">🏠</span>
                  </div>
                </Marker>
              )}
            </>
          );
        })()}

        {/* Delivery-guy overview: location-grouped markers - only show when no mission is selected */}
        {!mission && effectiveRole === 'delivery_guy' && !selectedMissionFromLocation && (() => {
          const currentUserId = authService.getCurrentUser()?.uid;
          
          const handleLocationClick = async (locationGroup) => {
            // Filter out completed/canceled missions
            const validMissions = locationGroup.missions.filter(m => {
              const mission = m.mission || m;
              return mission.status !== 'completed' && mission.status !== 'cancelled';
            });
            
            if (validMissions.length === 0) return;
            
            const filteredGroup = { ...locationGroup, missions: validMissions };
            setClickedLocation(filteredGroup);
            
            // Load routes for all missions at this location
            const locationKey = locationGroup.locationKey;
            if (!locationRoutes[locationKey]) {
              setIsLoadingOverviewRoutes(true);
              const routes = {};
              
              for (const missionData of validMissions) {
                const m = missionData.mission || missionData;
                if (overviewMissionRoutes[m.id]) {
                  routes[m.id] = overviewMissionRoutes[m.id];
                  continue;
                }
                
                // Build waypoints for route calculation
                const waypoints = [];
                if (userLocation) {
                  waypoints.push([userLocation.longitude, userLocation.latitude]);
                }
                
                // Add stores (excluding skipped)
                if (m.stores && m.stores.length > 0) {
                  const skippedStoreIndices = m.skippedStores?.map(s => s.storeIndex) || [];
                  const activeStores = m.stores
                    .map((store, idx) => ({ store, index: idx }))
                    .filter(({ store, index }) => !skippedStoreIndices.includes(index) && store.location)
                    .map(({ store, index }) => ({
                      ...store,
                      distance: userLocation ? calculateDistanceKm(userLocation, store.location) : null
                    }))
                    .sort((a, b) => (a.distance || Infinity) - (b.distance || Infinity));
                  
                  activeStores.forEach(store => {
                    waypoints.push([store.location.longitude, store.location.latitude]);
                  });
                } else if (m.pickupLocation) {
                  waypoints.push([m.pickupLocation.longitude, m.pickupLocation.latitude]);
                }
                
                // Add delivery location
                if (m.deliveryLocation) {
                  waypoints.push([m.deliveryLocation.longitude, m.deliveryLocation.latitude]);
                }
                
                if (waypoints.length >= 2) {
                  try {
                    const routeCoords = await getRoute(
                      waypoints,
                      mapboxConfig.accessToken,
                      'driving'
                    );
                    if (routeCoords && routeCoords.length > 0) {
                      routes[m.id] = routeCoords;
                    }
                  } catch (error) {
                  }
                }
              }
              
              setLocationRoutes(prev => ({ ...prev, [locationKey]: routes }));
              setIsLoadingOverviewRoutes(false);
            }
          };
          
          return (
            <>
              {/* Store location markers */}
              {locationGroups.stores.map((group) => {
                // Filter missions to only show valid ones (not completed/canceled, and assigned to user or available)
                const validMissions = group.missions.filter(m => {
                  const mission = m.mission || m;
                  if (mission.status === 'completed' || mission.status === 'cancelled') return false;
                  const isAssignedToMe = mission.assignedTo === currentUserId;
                  const isAvailable = !mission.assignedTo && mission.status === 'pending';
                  return isAssignedToMe || isAvailable;
                });
                
                if (validMissions.length === 0) return null;
                
                const missionCount = validMissions.length;
                // Update group with filtered missions for click handler
                const filteredGroup = { ...group, missions: validMissions };
                // Determine which mission types are present
                const hasInProgress = validMissions.some(m => {
                  const mission = m.mission || m;
                  return mission.assignedTo === currentUserId && mission.status === 'in_progress';
                });
                const hasAssigned = validMissions.some(m => {
                  const mission = m.mission || m;
                  return mission.assignedTo === currentUserId && mission.status !== 'in_progress';
                });
                const hasAvailable = validMissions.some(m => {
                  const mission = m.mission || m;
                  return !mission.assignedTo && mission.status === 'pending';
                });
                
                // Build multi-color gradient if multiple types
                const missionTypes = [];
                if (hasInProgress) missionTypes.push({ type: 'inprogress', color: '#10b981' });
                if (hasAssigned) missionTypes.push({ type: 'assigned', color: '#3b82f6' });
                if (hasAvailable) missionTypes.push({ type: 'available', color: '#f97316' });
                
                const getMultiColorStyle = () => {
                  if (missionTypes.length === 1) {
                    return { background: missionTypes[0].color };
                  } else if (missionTypes.length === 2) {
                    // Split 50/50
                    return {
                      background: `conic-gradient(from 0deg, ${missionTypes[0].color} 0deg 180deg, ${missionTypes[1].color} 180deg 360deg)`
                    };
                  } else if (missionTypes.length === 3) {
                    // Split into thirds
                    return {
                      background: `conic-gradient(from 0deg, ${missionTypes[0].color} 0deg 120deg, ${missionTypes[1].color} 120deg 240deg, ${missionTypes[2].color} 240deg 360deg)`
                    };
                  }
                  return {};
                };
                
                if (missionTypes.length === 0) return null;
                
                return (
                  <Marker
                    key={group.locationKey}
                    longitude={group.location.longitude}
                    latitude={group.location.latitude}
                    anchor="bottom"
                  >
                    <div
                      className="marker-icon location-group-marker mission-marker-clickable"
                      style={getMultiColorStyle()}
                      title={`${missionCount} mission${missionCount > 1 ? 's' : ''} at this store`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleLocationClick(filteredGroup);
                      }}
                    >
                      <span className="marker-emoji">🍽️</span>
                      {missionCount > 1 && (
                        <span className="marker-count-badge">{missionCount}</span>
                      )}
                    </div>
                  </Marker>
                );
              })}
              
              {/* Delivery location markers */}
              {locationGroups.deliveries.map((group) => {
                // Filter missions to only show valid ones (not completed/canceled, and assigned to user or available)
                const validMissions = group.missions.filter(m => {
                  const mission = m.mission || m;
                  if (mission.status === 'completed' || mission.status === 'cancelled') return false;
                  const isAssignedToMe = mission.assignedTo === currentUserId;
                  const isAvailable = !mission.assignedTo && mission.status === 'pending';
                  return isAssignedToMe || isAvailable;
                });
                
                if (validMissions.length === 0) return null;
                
                const missionCount = validMissions.length;
                // Update group with filtered missions for click handler
                const filteredGroup = { ...group, missions: validMissions };
                // Determine which mission types are present
                const hasInProgress = validMissions.some(m => {
                  const mission = m.mission || m;
                  return mission.assignedTo === currentUserId && mission.status === 'in_progress';
                });
                const hasAssigned = validMissions.some(m => {
                  const mission = m.mission || m;
                  return mission.assignedTo === currentUserId && mission.status !== 'in_progress';
                });
                const hasAvailable = validMissions.some(m => {
                  const mission = m.mission || m;
                  return !mission.assignedTo && mission.status === 'pending';
                });
                
                // Build multi-color gradient if multiple types
                const missionTypes = [];
                if (hasInProgress) missionTypes.push({ type: 'inprogress', color: '#10b981' });
                if (hasAssigned) missionTypes.push({ type: 'assigned', color: '#3b82f6' });
                if (hasAvailable) missionTypes.push({ type: 'available', color: '#f97316' });
                
                const getMultiColorStyle = () => {
                  if (missionTypes.length === 1) {
                    return { background: missionTypes[0].color };
                  } else if (missionTypes.length === 2) {
                    // Split 50/50
                    return {
                      background: `conic-gradient(from 0deg, ${missionTypes[0].color} 0deg 180deg, ${missionTypes[1].color} 180deg 360deg)`
                    };
                  } else if (missionTypes.length === 3) {
                    // Split into thirds
                    return {
                      background: `conic-gradient(from 0deg, ${missionTypes[0].color} 0deg 120deg, ${missionTypes[1].color} 120deg 240deg, ${missionTypes[2].color} 240deg 360deg)`
                    };
                  }
                  return {};
                };
                
                if (missionTypes.length === 0) return null;
                
                return (
                  <Marker
                    key={group.locationKey}
                    longitude={group.location.longitude}
                    latitude={group.location.latitude}
                    anchor="bottom"
                  >
                    <div
                      className="marker-icon location-group-marker mission-marker-clickable"
                      style={getMultiColorStyle()}
                      title={`${missionCount} mission${missionCount > 1 ? 's' : ''} at this delivery location`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleLocationClick(filteredGroup);
                      }}
                    >
                      <span className="marker-emoji">🏠</span>
                      {missionCount > 1 && (
                        <span className="marker-count-badge">{missionCount}</span>
                      )}
                    </div>
                  </Marker>
                );
              })}
            </>
          );
        })()}

        {/* Admin overview: active delivery guys */}
        {!mission &&
          !isDeliveryMode &&
          (userRole === 'admin' || userRole === 'monitor') &&
          overviewDeliveryGuys.map(guy => {
            if (!guy.location) return null;
            return (
              <Marker
                key={guy.id}
                longitude={guy.location.longitude}
                latitude={guy.location.latitude}
                anchor="bottom"
              >
                <div
                  className="marker-icon admin-driver-marker"
                  title={guy.name || guy.email || 'Delivery guy'}
                >
                  <span className="marker-emoji">🛵</span>
                </div>
              </Marker>
            );
          })}

        {/* Single-mission markers */}
        {mission?.pickupLocation && (
          <Marker
            longitude={mission.pickupLocation.longitude}
            latitude={mission.pickupLocation.latitude}
            anchor="bottom"
          >
            <div className="marker-icon pickup-marker" title="Pickup (restaurant)">
              <span className="marker-emoji">🍽️</span>
            </div>
          </Marker>
        )}

        {mission?.deliveryLocation && (
          <Marker
            longitude={mission.deliveryLocation.longitude}
            latitude={mission.deliveryLocation.latitude}
            anchor="bottom"
          >
            <div className="marker-icon delivery-marker" title="Delivery (customer)">
              <span className="marker-emoji">🏠</span>
            </div>
          </Marker>
        )}

        {/* Route polyline - only show when viewing a specific mission */}
        {routeGeoJson && mission && (
          <Source id="route" type="geojson" data={routeGeoJson}>
            {/* Outline layer for better visibility */}
            <Layer
              id="route-outline"
              type="line"
              layout={{
                'line-join': 'round',
                'line-cap': 'round',
              }}
              paint={{
                'line-color': '#ffffff',
                'line-width': 10,
                'line-opacity': 0.9,
              }}
            />
            {/* Main route layer */}
            <Layer
              id="route-layer"
              type="line"
              layout={{
                'line-join': 'round',
                'line-cap': 'round',
              }}
              paint={{
                'line-color': '#667eea',
                'line-width': 6,
                'line-opacity': 1,
              }}
            />
          </Source>
        )}

        {/* Routes for selected mission only - don't show if no mission selected */}
        {selectedMissionFromLocation && (() => {
          // Only show route for the selected mission
          // Try to find the route from locationRoutes first, then from overviewMissionRoutes
          let routeCoords = null;
          const locationKey = selectedMissionLocationKey;
          
          if (locationKey && locationRoutes[locationKey] && locationRoutes[locationKey][selectedMissionFromLocation.id]) {
            routeCoords = locationRoutes[locationKey][selectedMissionFromLocation.id];
          } else if (overviewMissionRoutes[selectedMissionFromLocation.id]) {
            routeCoords = overviewMissionRoutes[selectedMissionFromLocation.id];
          }
          
          if (!routeCoords || routeCoords.length === 0) return null;
          
          const routeGeoJson = {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: routeCoords,
            },
            properties: {
              missionId: selectedMissionFromLocation.id,
            },
          };
          return (
            <Source key={`location-route-${selectedMissionFromLocation.id}`} id={`location-route-${selectedMissionFromLocation.id}`} type="geojson" data={routeGeoJson}>
              <Layer
                id={`location-route-outline-${selectedMissionFromLocation.id}`}
                type="line"
                layout={{
                  'line-join': 'round',
                  'line-cap': 'round',
                }}
                paint={{
                  'line-color': '#ffffff',
                  'line-width': 10,
                  'line-opacity': 0.9,
                }}
              />
              <Layer
                id={`location-route-layer-${selectedMissionFromLocation.id}`}
                type="line"
                layout={{
                  'line-join': 'round',
                  'line-cap': 'round',
                }}
                paint={{
                  'line-color': '#FF9500',
                  'line-width': 6,
                  'line-opacity': 1,
                }}
              />
            </Source>
          );
        })()}

        {/* Overview mission lines - REMOVED: No paths should show when no mission is selected */}

        {/* Selected mission route and markers (highlighted) - REMOVED: This was showing paths when no mission was selected */}
        {false && selectedMissionId && !selectedMissionFromLocation && (() => {
          const selectedMission = overviewMissions.find(m => m.id === selectedMissionId);
          if (!selectedMission) return null;
          
          // Check if mission has stores or legacy pickup/delivery
          const hasStores = selectedMission.stores && selectedMission.stores.length > 0;
          const hasLegacyPickup = selectedMission.pickupLocation && selectedMission.deliveryLocation;
          if (!hasStores && !hasLegacyPickup) return null;
          
          // Use the route that includes user location if available
          const routeCoords = overviewMissionRoutes[selectedMissionId];
          if (!routeCoords) return null;

          return (
            <>
              <Source id="selected-mission-route" type="geojson" data={{
                type: 'Feature',
                geometry: {
                  type: 'LineString',
                  coordinates: routeCoords,
                },
              }}>
                {/* Outline layer for better visibility */}
                <Layer
                  id="selected-mission-route-outline"
                  type="line"
                  layout={{
                    'line-join': 'round',
                    'line-cap': 'round',
                  }}
                  paint={{
                    'line-color': '#ffffff',
                    'line-width': 10,
                    'line-opacity': 0.9,
                  }}
                />
                {/* Main route layer */}
                <Layer
                  id="selected-mission-route-layer"
                  type="line"
                  layout={{
                    'line-join': 'round',
                    'line-cap': 'round',
                  }}
                  paint={{
                    'line-color': '#667eea',
                    'line-width': 6,
                    'line-opacity': 1,
                  }}
                />
              </Source>
              {/* Selected mission store markers */}
              {selectedMission.stores && selectedMission.stores.length > 0 && (() => {
                const skippedStoreIndices = selectedMission.skippedStores?.map(s => s.storeIndex) || [];
                const activeStores = selectedMission.stores
                  .map((store, idx) => ({ store, index: idx }))
                  .filter(({ store, index }) => !skippedStoreIndices.includes(index) && store.location);
                const missionNum = missionNumbers[selectedMissionId] || 0;
                
                return activeStores.map(({ store, index }) => (
                  <Marker
                    key={`selected-store-${selectedMissionId}-${index}`}
                    longitude={store.location.longitude}
                    latitude={store.location.latitude}
                    anchor="bottom"
                  >
                    <div className="marker-icon pickup-marker" title={`Store: ${store.name || `Store ${index + 1}`} - Mission #${missionNum}`}>
                      <span className="marker-emoji">🍽️</span>
                      <span className="marker-mission-number">{missionNum}</span>
                    </div>
                  </Marker>
                ));
              })()}
              {/* Legacy single pickup marker */}
              {(!selectedMission.stores || selectedMission.stores.length === 0) && selectedMission.pickupLocation && (
                <Marker
                  key={`selected-pickup-${selectedMissionId}`}
                  longitude={selectedMission.pickupLocation.longitude}
                  latitude={selectedMission.pickupLocation.latitude}
                  anchor="bottom"
                >
                  <div className="marker-icon pickup-marker" title="Pickup (restaurant)">
                    <span className="marker-emoji">🍽️</span>
                  </div>
                </Marker>
              )}
              {/* Selected mission delivery marker */}
              {selectedMission.deliveryLocation && (
                <Marker
                  key={`selected-delivery-${selectedMissionId}`}
                  longitude={selectedMission.deliveryLocation.longitude}
                  latitude={selectedMission.deliveryLocation.latitude}
                  anchor="bottom"
                >
                  <div className="marker-icon delivery-marker" title={`Delivery: ${selectedMission.clientName || 'Client'} - Mission #${missionNumbers[selectedMissionId] || 0}`}>
                    <span className="marker-emoji">🏠</span>
                    <span className="marker-mission-number">{missionNumbers[selectedMissionId] || 0}</span>
                  </div>
                </Marker>
              )}
            </>
          );
        })()}

        {/* Overview mission lines - REMOVED: No paths should show when no mission is selected */}
      </Map>

      <div className="map-floating-controls">
        {effectiveRole === 'delivery_guy' && (
          <>
            <button
              className={`map-circle-button ${autoFollow ? 'active' : ''}`}
              onClick={() => setAutoFollow(prev => !prev)}
              title={autoFollow ? t('autoFollowOn') : t('autoFollowOff')}
            >
              🛵
            </button>
            <button
              className="map-circle-button"
              onClick={() => {
                if (userLocation) {
                  setViewState(prev => ({
                    ...prev,
                    latitude: userLocation.latitude,
                    longitude: userLocation.longitude,
                  }));
                }
              }}
              title={t('centerOnMe')}
            >
              🎯
            </button>
          </>
        )}
        {mission?.pickupLocation && mission?.deliveryLocation && (
          <button
            className="map-circle-button"
            onClick={() => {
              const midLat =
                (mission.pickupLocation.latitude +
                  mission.deliveryLocation.latitude) / 2;
              const midLon =
                (mission.pickupLocation.longitude +
                  mission.deliveryLocation.longitude) / 2;

              const routeKm = calculateDistanceKm(
                mission.pickupLocation,
                mission.deliveryLocation
              );

              // Choose zoom based on aerial distance between pickup and delivery.
              // Intentionally more zoomed OUT so both points and most of the route fit.
              let zoom = 11;
              if (routeKm !== null) {
                if (routeKm < 0.8) zoom = 14;       // very short – still see some context
                else if (routeKm < 2) zoom = 13.5;  // neighborhood (slightly closer)
                else if (routeKm < 5) zoom = 12;    // small city area
                else if (routeKm < 15) zoom = 11;   // across town
                else if (routeKm < 40) zoom = 10;   // across city/region
                else zoom = 9;                      // inter-city
              }

              setAutoFollow(false);
              setViewState(prev => ({
                ...prev,
                latitude: midLat,
                longitude: midLon,
                zoom,
              }));
            }}
            title={t('showPickupAndDelivery')}
          >
            ↔️
          </button>
        )}
      </div>

      <div className="map-controls">
        <button className="map-button back-icon" onClick={() => navigate(-1)}>
          ←
        </button>
        {mission && (
          <span className="map-distance-left">
            <span> {t('totalLeft')}: {formatDistance(totalDistanceLeft)}</span>
            <span className="map-distance-eta">
              {formatEta(totalDistanceLeft)}
            </span>
          </span>
        )}
        {mission && (
          <button
            className={`map-button ${showMissionInfo ? '' : 'primary'}`}
            onClick={() => setShowMissionInfo(prev => !prev)}
          >
            {showMissionInfo ? t('hideMissionInfo') : t('missionInfo')}
          </button>
        )}
        {isLoadingRoute && <span className="map-status">{t('loadingOptimalRoute')}</span>}
        {routeError && !isLoadingRoute && (
          <span className="map-status warning">{routeError}</span>
        )}
      </div>

      {mission && (
        <div className={`mission-info-panel ${showMissionInfo ? 'visible' : ''}`}>
          <div className="mission-info-content">
            <div className="mission-info-header">
              <div>
                <h3>Mission #{mission.id?.slice(0, 6) || '—'}</h3>
                <span className={`status-chip status-${mission?.status || 'unknown'}`}>
                  {missionStatusLabel}
                </span>
              </div>
              <button
                className="mission-info-close"
                onClick={() => setShowMissionInfo(false)}
                aria-label="Close mission info"
              >
                ×
              </button>
            </div>

            <div className="mission-info-section">
              <p className="info-label">{t('client')}</p>
              <p className="info-value">{mission.clientName || t('nA')}</p>
              {mission.clientPhone && (
                <a className="info-call-button" href={`tel:${mission.clientPhone}`}>
                  {t('callClient')} {mission.clientPhone}
                </a>
              )}
            </div>

            <div className="mission-info-section">
              <p className="info-label">Pickup</p>
              <p className="info-value">
                {mission.pickupAddress || t('noAddressProvided')}
              </p>
              <p className="info-coords">
                {mission.pickupLocation
                  ? `${mission.pickupLocation.latitude.toFixed(5)}, ${mission.pickupLocation.longitude.toFixed(5)}`
                  : '—'}
              </p>
            </div>

            <div className="mission-info-section">
              <p className="info-label">Delivery</p>
              <p className="info-value">
                {mission.deliveryAddress || t('noAddressProvided')}
              </p>
              <p className="info-coords">
                {mission.deliveryLocation
                  ? `${mission.deliveryLocation.latitude.toFixed(5)}, ${mission.deliveryLocation.longitude.toFixed(5)}`
                  : '—'}
              </p>
            </div>

            {mission.items && mission.items.length > 0 && (
              <div className="mission-info-section">
                <p className="info-label">{t('orderItems')}</p>
                <ul className="order-items-list">
                  {mission.items.map((item, index) => (
                    <li key={`${item.name}-${index}`}>
                      <div>
                        <strong title={item.name}>{item.name || `${t('item')} ${index + 1}`}</strong>
                        {item.description && <p title={item.description}>{item.description}</p>}
                      </div>
                      <span>{(item.price || 0).toFixed(2)} DT</span>
                    </li>
                  ))}
                </ul>
                <div className="order-total">
                  <span>{t('total')}</span>
                  <strong>{(mission.totalAmount || mission.items.reduce((sum, item) => sum + (item.price || 0), 0)).toFixed(2)} DT</strong>
                </div>
              </div>
            )}

            <div className="distance-metrics">
              <h4>{t('distanceOverview')}</h4>
              <ul>
                <li>
                  <span>{t('fromYou')} → {t('pickup')}</span>
                  <strong>{formatDistance(distanceMetrics.toPickup)}</strong>
                </li>
                <li>
                  <span>{t('pickup')} → {t('delivery')}</span>
                  <strong>{formatDistance(distanceMetrics.pickupToDelivery)}</strong>
                </li>
                <li>
                  <span>{t('you')} → {t('delivery')}</span>
                  <strong>{formatDistance(distanceMetrics.toDelivery)}</strong>
                </li>
              </ul>
            </div>

            {canStartMission && (
              <div className="mission-info-actions">
                <button
                  className="mission-info-action-button"
                  onClick={handleStartMission}
                  disabled={isMissionActionLoading}
                >
                  {isMissionActionLoading ? t('starting') + '…' : t('startMission')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Admin overview: active delivery guys */}
      {!mission && !isDeliveryMode && (userRole === 'admin' || userRole === 'monitor') && (
        <div className="map-legend">
          <div className="legend-row">
            <span className="legend-dot legend-driver" /> {t('activeDeliveryGuy')}
          </div>
        </div>
      )}


      {/* Delivery guy overview: missions legend */}
      {!mission && effectiveRole === 'delivery_guy' && overviewMissions.length > 0 && (
        <div className="map-legend">
          <div className="legend-row">
            <span className="legend-dot legend-mission-available" /> {t('availableMission')}
          </div>
          <div className="legend-row">
            <span className="legend-dot legend-mission-assigned" /> {t('assignedToYou')}
          </div>
          <div className="legend-row">
            <span className="legend-dot legend-mission-inprogress" /> {t('inProgress')}
          </div>
        </div>
      )}

      {/* Location Popup - Shows all missions at clicked location */}
      {!mission && clickedLocation && effectiveRole === 'delivery_guy' && (
        <div className="mission-popup-overlay"                  onClick={() => { 
                   setClickedLocation(null); 
                   setSelectedMissionFromLocation(null);
                   setSelectedMissionLocationKey(null);
                   setExpandedMissionIdInPopup(null);
                 }}>
          <div className="mission-popup location-popup" onClick={(e) => e.stopPropagation()}>
            <div className="mission-popup-header">
              <div>
                <h3>
                  {clickedLocation.type === 'store' ? '🍽️' : '🏠'} 
                  {clickedLocation.type === 'store' ? t('store') : t('delivery')} {t('location')}
                </h3>
                <p style={{ margin: '5px 0 0 0', fontSize: '14px', color: '#666' }}>
                  {clickedLocation.missions.length} {clickedLocation.missions.length > 1 ? t('missions') : t('mission')}
                </p>
              </div>
              <button
                className="mission-popup-close"
                onClick={() => { 
                  setClickedLocation(null); 
                  setSelectedMissionFromLocation(null);
                  setSelectedMissionLocationKey(null);
                  setExpandedMissionIdInPopup(null);
                }}
                aria-label={t('closeLocationDetails')}
              >
                ×
              </button>
            </div>

            <div className="mission-popup-content location-missions-list">
              {clickedLocation.missions
                .filter(missionData => {
                  const m = missionData.mission || missionData;
                  // Filter out completed/canceled missions
                  return m.status !== 'completed' && m.status !== 'cancelled';
                })
                .map((missionData) => {
                const m = missionData.mission || missionData;
                const currentUserId = authService.getCurrentUser()?.uid;
                const isAssignedToMe = m.assignedTo === currentUserId;
                const isInProgress = isAssignedToMe && m.status === 'in_progress';
                const isAvailable = !m.assignedTo && m.status === 'pending';
                
                const getStatusColor = (status) => {
                  if (status === 'completed') return '#34C759';
                  if (status === 'cancelled') return '#FF3B30';
                  if (status === 'in_progress') return '#10b981'; // Green instead of purple
                  if (status === 'assigned') return '#007AFF';
                  return '#FF9500';
                };

                return (
                  <div 
                    key={m.id} 
                    className={`location-mission-card ${selectedMissionFromLocation?.id === m.id ? 'selected' : ''}`}
                    onClick={async (e) => {
                      // If clicking directly on the card (not buttons), close popup and show trajectory
                      if (e.target.closest('.location-mission-actions')) {
                        return; // Let button handlers work
                      }
                      
                      // Capture locationKey before closing popup
                      const locationKey = clickedLocation.locationKey;
                      
                      // Close popup and show trajectory
                      setClickedLocation(null);
                      setSelectedMissionFromLocation(m);
                      setSelectedMissionLocationKey(locationKey);
                      
                      // Load route for this mission
                      if (!locationRoutes[locationKey] || !locationRoutes[locationKey][m.id]) {
                        setIsLoadingOverviewRoutes(true);
                        const routes = locationRoutes[locationKey] || {};
                        
                        // Build waypoints for route calculation
                        const waypoints = [];
                        if (userLocation) {
                          waypoints.push([userLocation.longitude, userLocation.latitude]);
                        }
                        
                        // Add stores (excluding skipped)
                        if (m.stores && m.stores.length > 0) {
                          const skippedStoreIndices = m.skippedStores?.map(s => s.storeIndex) || [];
                          const activeStores = m.stores
                            .map((store, idx) => ({ store, index: idx }))
                            .filter(({ store, index }) => !skippedStoreIndices.includes(index) && store.location)
                            .map(({ store, index }) => ({
                              ...store,
                              distance: userLocation ? calculateDistanceKm(userLocation, store.location) : null
                            }))
                            .sort((a, b) => (a.distance || Infinity) - (b.distance || Infinity));
                          
                          activeStores.forEach(store => {
                            waypoints.push([store.location.longitude, store.location.latitude]);
                          });
                        } else if (m.pickupLocation) {
                          waypoints.push([m.pickupLocation.longitude, m.pickupLocation.latitude]);
                        }
                        
                        // Add delivery location
                        if (m.deliveryLocation) {
                          waypoints.push([m.deliveryLocation.longitude, m.deliveryLocation.latitude]);
                        }
                        
                        if (waypoints.length >= 2) {
                          try {
                            const routeCoords = await getRoute(
                              waypoints,
                              mapboxConfig.accessToken,
                              'driving'
                            );
                            if (routeCoords && routeCoords.length > 0) {
                              routes[m.id] = routeCoords;
                              setLocationRoutes(prev => ({ ...prev, [locationKey]: routes }));
                            }
                          } catch (error) {
                          }
                        }
                        setIsLoadingOverviewRoutes(false);
                      }
                    }}
                  >
                    <div className="location-mission-header">
                      <div>
                        <strong>{t('mission')} #{m.id?.slice(0, 8).toUpperCase()}</strong>
                        <span 
                          className="status-chip" 
                          style={{ backgroundColor: getStatusColor(m.status) }}
                        >
                          {m.status?.replace('_', ' ').toUpperCase() || 'UNKNOWN'}
                        </span>
                      </div>
                    </div>
                    <div className="location-mission-info">
                      <p><strong>{t('client')}:</strong> {m.clientName || t('nA')}</p>
                      {m.clientPhone && (
                        <p><strong>{t('phone')}:</strong> {m.clientPhone}</p>
                      )}
                      {m.deliveryAddress && (
                        <p><strong>{t('delivery')}:</strong> {m.deliveryAddress}</p>
                      )}
                      {missionData.store && (
                        <p><strong>{t('store')}:</strong> {missionData.store.name || t('nA')}</p>
                      )}
                    </div>
                    <div className="location-mission-actions">
                      <button
                        className="mission-popup-action-button"
                        onClick={(e) => {
                          e.stopPropagation();
                          // Toggle expansion instead of navigating
                          setExpandedMissionIdInPopup(prev => prev === m.id ? null : m.id);
                        }}
                      >
                        {expandedMissionIdInPopup === m.id ? t('hideDetails') : t('viewDetails')}
                      </button>
                      {isAvailable && (
                        <button
                          className="mission-popup-action-button primary"
                          onClick={async (e) => {
                            e.stopPropagation();
                            const currentUser = authService.getCurrentUser();
                            if (!currentUser) return;
                            try {
                              const result = await dataService.pickUpMission(m.id, currentUser.uid);
                              if (result?.success) {
                                toast.success('Mission picked up successfully!');
                                setClickedLocation(null);
                                setSelectedMissionFromLocation(null);
                                setSelectedMissionLocationKey(null);
                              } else {
                                toast.error(result?.error || t('failedToPickUp'));
                              }
                            } catch (error) {
                              toast.error('Failed to pick up mission');
                            }
                          }}
                        >
                          {t('pickUp')}
                        </button>
                      )}
                    </div>
                    
                    {/* Expanded mission details */}
                    {expandedMissionIdInPopup === m.id && (
                      <div className="location-mission-expanded">
                        {/* Roadmap/Timeline */}
                        {(() => {
                          const hasStores = m.stores && m.stores.length > 0;
                          const hasLegacyPickup = m.pickupLocation && m.deliveryLocation;
                          
                          if (!hasStores && !hasLegacyPickup) return null;
                          
                          // Sort stores by distance
                          let sortedStores = [];
                          if (hasStores) {
                            const skippedStoreIndices = m.skippedStores?.map(s => s.storeIndex) || [];
                            sortedStores = m.stores
                              .map((store, idx) => ({
                                ...store,
                                index: idx,
                                distance: userLocation ? calculateDistanceKm(userLocation, store.location) : null,
                                isSkipped: skippedStoreIndices.includes(idx)
                              }))
                              .sort((a, b) => {
                                if (a.isSkipped && !b.isSkipped) return 1;
                                if (!a.isSkipped && b.isSkipped) return -1;
                                if (a.distance === null) return 1;
                                if (b.distance === null) return -1;
                                return a.distance - b.distance;
                              });
                          }
                          
                          return (
                            <div className="location-mission-roadmap">
                              <div className="location-roadmap-timeline">
                                {userLocation && (hasStores ? sortedStores.length > 0 : hasLegacyPickup) && (
                                  <>
                                    <div className="location-roadmap-item">
                                      <div className="location-roadmap-icon">🛵</div>
                                      <div className="location-roadmap-content">
                                        <div className="location-roadmap-title">You</div>
                                        {hasStores && sortedStores[0] && (
                                          <div className="location-roadmap-distance">
                                            {formatDistance(sortedStores[0].distance)} ({formatEta(sortedStores[0].distance)})
                                          </div>
                                        )}
                                        {hasLegacyPickup && (
                                          <div className="location-roadmap-distance">
                                            {formatDistance(calculateDistanceKm(userLocation, m.pickupLocation))} ({formatEta(calculateDistanceKm(userLocation, m.pickupLocation))})
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                    <div className="location-roadmap-connector">│</div>
                                  </>
                                )}
                                
                                {/* Stores */}
                                {hasStores && sortedStores.map((store, idx) => {
                                  const pickedUpStores = m.pickedUpFromStores || [];
                                  const isPickedUp = pickedUpStores.includes(store.index);
                                  
                                  return (
                                    <React.Fragment key={idx}>
                                      <div className={`location-roadmap-item ${store.isSkipped ? 'location-roadmap-item-skipped' : ''}`}>
                                        <div className="location-roadmap-icon">
                                          {store.isSkipped ? '⏭️' : isPickedUp ? '✅' : '🍽️'}
                                        </div>
                                        <div className="location-roadmap-content">
                                          <div className="location-roadmap-title">
                                            {store.name || `Store ${store.index + 1}`}
                                            {store.isSkipped && <span className="location-skipped-badge"> (Skipped)</span>}
                                          </div>
                                          {store.address && (
                                            <div className="location-roadmap-address">{store.address}</div>
                                          )}
                                          {store.phone && (
                                            <div className="location-roadmap-phone">📞 {store.phone}</div>
                                          )}
                                          {store.items && store.items.length > 0 && (
                                            <div className="location-roadmap-items">
                                              {store.items.length} {store.items.length > 1 ? t('items') : t('item')}
                                            </div>
                                          )}
                                          {idx < sortedStores.length - 1 && sortedStores[idx + 1] && !sortedStores[idx + 1].isSkipped && (
                                            <div className="location-roadmap-distance">
                                              → {formatDistance(calculateDistanceKm(store.location, sortedStores[idx + 1].location))}
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                      {idx < sortedStores.length - 1 && <div className="location-roadmap-connector">│</div>}
                                    </React.Fragment>
                                  );
                                })}
                                
                                {/* Legacy pickup */}
                                {hasLegacyPickup && (
                                  <>
                                    <div className="location-roadmap-item">
                                      <div className="location-roadmap-icon">
                                        {m.pickupReachedAt ? '✅' : '🍽️'}
                                      </div>
                                      <div className="location-roadmap-content">
                                        <div className="location-roadmap-title">{t('pickup')}</div>
                                        {m.pickupAddress && (
                                          <div className="location-roadmap-address">{m.pickupAddress}</div>
                                        )}
                                        {m.pickupLocation && m.deliveryLocation && (
                                          <div className="location-roadmap-distance">
                                            → {formatDistance(calculateDistanceKm(m.pickupLocation, m.deliveryLocation))} ({formatEta(calculateDistanceKm(m.pickupLocation, m.deliveryLocation))})
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                    <div className="location-roadmap-connector">│</div>
                                  </>
                                )}
                                
                                {/* Delivery */}
                                {m.deliveryLocation && (
                                  <div className="location-roadmap-item">
                                    <div className="location-roadmap-icon">🏠</div>
                                    <div className="location-roadmap-content">
                                      <div className="location-roadmap-title">{t('delivery')}</div>
                                      {m.deliveryAddress && (
                                        <div className="location-roadmap-address">{m.deliveryAddress}</div>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })()}
                        
                        {/* Items */}
                        {(() => {
                          const hasStores = m.stores && m.stores.length > 0;
                          const skippedStoreIndices = m.skippedStores?.map(s => s.storeIndex) || [];
                          
                          if (hasStores) {
                            return (
                              <div className="location-mission-items">
                                <h4>{t('items')}</h4>
                                {m.stores.map((store, storeIdx) => {
                                  if (skippedStoreIndices.includes(storeIdx) || !store.items || store.items.length === 0) return null;
                                  
                                  return (
                                    <div key={storeIdx} className="location-store-items">
                                      <div className="location-store-name">{store.name || `${t('store')} ${storeIdx + 1}`}</div>
                                      <ul className="location-items-list">
                                        {store.items.map((item, itemIdx) => (
                                          <li key={itemIdx}>
                                            <span>{item.name || `${t('item')} ${itemIdx + 1}`}</span>
                                            <span>{(item.price || 0).toFixed(2)} DT</span>
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  );
                                })}
                                {m.deliveryFee && (
                                  <div className="location-delivery-fee">
                                    <span>{t('deliveryFee')}:</span>
                                    <span>{parseFloat(m.deliveryFee).toFixed(2)} DT</span>
                                  </div>
                                )}
                                <div className="location-total">
                                  <span>Total:</span>
                                  <strong>
                                    {(() => {
                                      const subtotal = m.stores.reduce((sum, store, idx) => {
                                        if (skippedStoreIndices.includes(idx)) return sum;
                                        return sum + (store.items || []).reduce((itemSum, item) => itemSum + (parseFloat(item.price) || 0), 0);
                                      }, 0);
                                      const total = subtotal + parseFloat(m.deliveryFee || 0);
                                      return total.toFixed(2);
                                    })()} DT
                                  </strong>
                                </div>
                              </div>
                            );
                          } else if (m.items && m.items.length > 0) {
                            return (
                              <div className="location-mission-items">
                                <h4>{t('items')}</h4>
                                <ul className="location-items-list">
                                  {m.items.map((item, idx) => (
                                    <li key={idx}>
                                      <span>{item.name || `Item ${idx + 1}`}</span>
                                      <span>{(item.price || 0).toFixed(2)} DT</span>
                                    </li>
                                  ))}
                                </ul>
                                {m.deliveryFee && (
                                  <div className="location-delivery-fee">
                                    <span>{t('deliveryFee')}:</span>
                                    <span>{parseFloat(m.deliveryFee).toFixed(2)} DT</span>
                                  </div>
                                )}
                                <div className="location-total">
                                  <span>Total:</span>
                                  <strong>{((m.items.reduce((sum, item) => sum + (parseFloat(item.price) || 0), 0)) + parseFloat(m.deliveryFee || 0)).toFixed(2)} DT</strong>
                                </div>
                              </div>
                            );
                          }
                          return null;
                        })()}
                        
                        {/* Notes */}
                        {m.notes && (
                          <div className="location-mission-notes">
                            <h4>{t('notes')}</h4>
                            <p>{m.notes}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Action buttons when mission is selected from location */}
      {!mission && selectedMissionFromLocation && effectiveRole === 'delivery_guy' && (() => {
        // Build Google Maps URL with waypoints
        const buildGoogleMapsUrl = () => {
          const m = selectedMissionFromLocation;
          if (!m) return null;
          
          const waypoints = [];
          
          // Add stores (excluding skipped)
          if (m.stores && m.stores.length > 0) {
            const skippedStoreIndices = m.skippedStores?.map(s => s.storeIndex) || [];
            const activeStores = m.stores
              .map((store, idx) => ({ store, index: idx }))
              .filter(({ store, index }) => !skippedStoreIndices.includes(index) && store.location)
              .map(({ store, index }) => ({
                ...store,
                distance: userLocation ? calculateDistanceKm(userLocation, store.location) : null
              }))
              .sort((a, b) => (a.distance || Infinity) - (b.distance || Infinity));
            
            activeStores.forEach(store => {
              waypoints.push(`${store.location.latitude},${store.location.longitude}`);
            });
          } else if (m.pickupLocation) {
            waypoints.push(`${m.pickupLocation.latitude},${m.pickupLocation.longitude}`);
          }
          
          // Add delivery location as destination
          if (!m.deliveryLocation) return null;
          
          const destination = `${m.deliveryLocation.latitude},${m.deliveryLocation.longitude}`;
          const waypointsStr = waypoints.length > 0 ? `&waypoints=${waypoints.join('|')}` : '';
          
          return `https://www.google.com/maps/dir/?api=1&destination=${destination}${waypointsStr}`;
        };
        
        const googleMapsUrl = buildGoogleMapsUrl();
        
        return (
          <div className="mission-cancel-button-container">
            {googleMapsUrl && (
              <button
                className="mission-google-maps-button"
                onClick={() => {
                  window.open(googleMapsUrl, '_blank');
                }}
                title={t('openInGoogleMaps')}
              >
                🗺️
              </button>
            )}
            <button
              className="mission-cancel-button"
              onClick={() => {
                setSelectedMissionFromLocation(null);
                setSelectedMissionLocationKey(null);
              }}
              title={t('cancelSelection')}
            >
              ✕
            </button>
          </div>
        );
      })()}

      {/* Legacy Mission Details Popup for Overview Map (keep for backward compatibility) */}
      {!mission && clickedMission && !clickedLocation && (
        <div className="mission-popup-overlay" onClick={() => { setClickedMission(null); setClickedMarkerType(null); }}>
          <div className="mission-popup" onClick={(e) => e.stopPropagation()}>
            <div className="mission-popup-header">
              <div>
                <h3>Mission #{clickedMission.id?.slice(0, 8).toUpperCase() || '—'}</h3>
                <span className={`status-chip status-${clickedMission?.status || 'unknown'}`}>
                  {clickedMission.status?.replace('_', ' ').toUpperCase() || 'UNKNOWN'}
                </span>
              </div>
              <button
                className="mission-popup-close"
                onClick={() => { setClickedMission(null); setClickedMarkerType(null); }}
                aria-label="Close mission details"
              >
                ×
              </button>
            </div>

            <div className="mission-popup-content">
              <div className="mission-popup-section">
                <p className="info-label">{t('client')}</p>
                <p className="info-value">{clickedMission.clientName || 'N/A'}</p>
                {clickedMission.clientPhone && (
                  <a className="info-call-button" href={`tel:${clickedMission.clientPhone}`}>
                    📞 Call {clickedMission.clientPhone}
                  </a>
                )}
              </div>

              <div className="mission-popup-section">
                <p className="info-label">🍽️ {t('pickupLocation')}</p>
                <p className="info-value">
                  {clickedMission.pickupAddress || 'No address provided'}
                </p>
                {clickedMission.pickupLocation && userLocation && (
                  <p className="info-distance">
                    📍 {formatDistance(calculateDistanceKm(userLocation, clickedMission.pickupLocation))} away
                    {formatEta(calculateDistanceKm(userLocation, clickedMission.pickupLocation)) !== '—' && 
                      ` (${formatEta(calculateDistanceKm(userLocation, clickedMission.pickupLocation))})`}
                  </p>
                )}
              </div>

              <div className="mission-popup-section">
                <p className="info-label">🏠 {t('deliveryLocation')}</p>
                <p className="info-value">
                  {clickedMission.deliveryAddress || 'No address provided'}
                </p>
                {clickedMission.deliveryLocation && userLocation && (
                  <p className="info-distance">
                    📍 {formatDistance(calculateDistanceKm(userLocation, clickedMission.deliveryLocation))} away
                    {formatEta(calculateDistanceKm(userLocation, clickedMission.deliveryLocation)) !== '—' && 
                      ` (${formatEta(calculateDistanceKm(userLocation, clickedMission.deliveryLocation))})`}
                  </p>
                )}
              </div>

              {clickedMission.pickupLocation && clickedMission.deliveryLocation && (
                <div className="mission-popup-section">
                  <p className="info-label">{t('routeDistance')}</p>
                  <p className="info-value">
                    {formatDistance(calculateDistanceKm(clickedMission.pickupLocation, clickedMission.deliveryLocation))}
                    {formatEta(calculateDistanceKm(clickedMission.pickupLocation, clickedMission.deliveryLocation)) !== '—' && 
                      ` (${formatEta(calculateDistanceKm(clickedMission.pickupLocation, clickedMission.deliveryLocation))})`}
                  </p>
                </div>
              )}

              {clickedMission.items && clickedMission.items.length > 0 && (
                <div className="mission-popup-section">
                  <p className="info-label">{t('orderItems')}</p>
                  <ul className="order-items-list">
                    {clickedMission.items.map((item, index) => (
                      <li key={`${item.name}-${index}`}>
                        <div>
                          <strong title={item.name}>{item.name || `${t('item')} ${index + 1}`}</strong>
                          {item.description && <p title={item.description}>{item.description}</p>}
                        </div>
                        <span>{(item.price || 0).toFixed(2)} DT</span>
                      </li>
                    ))}
                  </ul>
                  <div className="order-total">
                    <span>{t('total')}</span>
                    <strong>{(clickedMission.totalAmount || clickedMission.items.reduce((sum, item) => sum + (item.price || 0), 0)).toFixed(2)} DT</strong>
                  </div>
                </div>
              )}

              <div className="mission-popup-actions">
                <button
                  className="mission-popup-action-button"
                  onClick={() => {
                    navigate('/map', { state: { mission: clickedMission } });
                  }}
                >
                  🗺️ {t('viewFullMap')}
                </button>
                {!clickedMission.assignedTo && clickedMission.status === 'pending' && (
                  <button
                    className="mission-popup-action-button primary"
                    onClick={async () => {
                      const currentUser = authService.getCurrentUser();
                      if (!currentUser) return;
                      try {
                        const result = await dataService.pickUpMission(clickedMission.id, currentUser.uid);
                        if (result?.success) {
                          toast.success('Mission picked up successfully!');
                          setClickedMission(null);
                          setClickedMarkerType(null);
                        } else {
                          toast.error(result?.error || t('failedToPickUp'));
                        }
                      } catch (error) {
                        toast.error('Failed to pick up mission');
                      }
                    }}
                  >
                    📦 {t('pickUpMission')}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}