/**
 * Opens Google Maps with the specified destination coordinates (web version)
 * @param {number} latitude - Destination latitude
 * @param {number} longitude - Destination longitude
 * @param {string} label - Optional label for the destination
 */
export const openGoogleMaps = (latitude, longitude, label = '') => {
  const lat = latitude;
  const lon = longitude;
  const destination = label ? `${lat},${lon}(${encodeURIComponent(label)})` : `${lat},${lon}`;
  
  // Open Google Maps in a new tab
  const url = `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
  window.open(url, '_blank');
};

/**
 * Detect if app is running as PWA (Progressive Web App)
 */
const isPWA = () => {
  return window.matchMedia('(display-mode: standalone)').matches ||
         window.navigator.standalone === true ||
         document.referrer.includes('android-app://');
};

/**
 * Detect if device is iOS
 */
const isIOS = () => {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
};

/**
 * Detect if device is Android
 */
const isAndroid = () => {
  return /Android/.test(navigator.userAgent);
};

/** Use https://maps URLs on real desktops — avoid google.navigation: / comgooglemaps: (no handler in desktop browsers). */
const shouldOpenNativeMapsApp = () => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  if (window.matchMedia('(pointer: fine)').matches && window.matchMedia('(hover: hover)').matches) {
    return false;
  }
  try {
    if (navigator.userAgentData && typeof navigator.userAgentData.mobile === 'boolean') {
      if (!navigator.userAgentData.mobile) return false;
      return isIOS() || isAndroid();
    }
  } catch (_) {
    /* ignore */
  }
  return isIOS() || isAndroid();
};

/**
 * Opens Google Maps with route from delivery guy location to delivery location (after pickup reached)
 * @param {Object} mission - Mission object with deliveryLocation or stores array
 * @param {Object} deliveryGuyLocation - Delivery guy's current location {latitude, longitude}
 */
export const openGoogleMapsAfterPickup = (mission, deliveryGuyLocation) => {
  if (!mission || !deliveryGuyLocation) {
    window.alert('Mission or location data not available');
    return;
  }

  const formatCoord = (coord) => {
    const num = typeof coord === 'number' ? coord : parseFloat(coord);
    return isNaN(num) ? null : num.toFixed(6);
  };

  const hasStores = mission.stores && mission.stores.length > 0;
  const hasDelivery = mission.deliveryLocation && 
    formatCoord(mission.deliveryLocation.latitude) && 
    formatCoord(mission.deliveryLocation.longitude);

  if (!hasDelivery) {
    window.alert('No delivery location available for this mission');
    return;
  }

  const deliveryLat = formatCoord(mission.deliveryLocation.latitude);
  const deliveryLon = formatCoord(mission.deliveryLocation.longitude);
  const guyLat = formatCoord(deliveryGuyLocation.latitude);
  const guyLon = formatCoord(deliveryGuyLocation.longitude);
  
  const deliveryStr = `${deliveryLat},${deliveryLon}`;
  const guyStr = `${guyLat},${guyLon}`;

  // For multi-store missions, check which stores have been picked up
  if (hasStores) {
    // Get stores that haven't been picked up yet (check pickedUpFromStores array)
    const pickedUpStores = mission.pickedUpFromStores || [];
    const remainingStores = mission.stores
      .filter((store, index) => !pickedUpStores.includes(index))
      .filter(store => store.location && formatCoord(store.location.latitude))
      .map(store => ({
        ...store,
        location: store.location
      }));

    if (remainingStores.length > 0) {
      // Calculate distance from current location to each remaining store
      const calculateDistance = (pointA, pointB) => {
        if (!pointA || !pointB || !pointA.latitude || !pointB.latitude) return Infinity;
        const R = 6371;
        const dLat = (pointB.latitude - pointA.latitude) * Math.PI / 180;
        const dLon = (pointB.longitude - pointA.longitude) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(pointA.latitude * Math.PI / 180) * Math.cos(pointB.latitude * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
      };

      // Sort remaining stores by distance from current location
      const sortedStores = remainingStores
        .map(store => ({
          ...store,
          distance: calculateDistance(deliveryGuyLocation, store.location)
        }))
        .sort((a, b) => a.distance - b.distance);

      const waypoints = sortedStores.map(store => 
        `${formatCoord(store.location.latitude)},${formatCoord(store.location.longitude)}`
      );
      const waypointsStr = waypoints.join('|');
      const webUrl = `https://www.google.com/maps/dir/?api=1&origin=${guyStr}&waypoints=${waypointsStr}&destination=${deliveryStr}`;
      
      if (shouldOpenNativeMapsApp()) {
        if (isIOS()) {
          let appOpened = false;
          const handleVisibilityChange = () => { if (document.hidden) appOpened = true; };
          document.addEventListener('visibilitychange', handleVisibilityChange);
          
          // iOS: Try to open Google Maps app with waypoints
          const allWaypoints = [guyStr, ...waypoints, deliveryStr];
          const daddr = allWaypoints.slice(1).join('+to:');
          const googleMapsUrl = `comgooglemaps://?saddr=${guyStr}&daddr=${daddr}`;
          
          const link = document.createElement('a');
          link.href = googleMapsUrl;
          link.style.display = 'none';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          
          setTimeout(() => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            // No web fallback - delivery guys must have Google Maps installed
          }, 1000);
        } else if (isAndroid()) {
          // Android: Open native Google Maps app directly (always installed)
          const waypointsStr = waypoints.join('|');
          const googleMapsUrl = `google.navigation:q=${deliveryStr}&waypoints=${guyStr}|${waypointsStr}`;
          
          const link = document.createElement('a');
          link.href = googleMapsUrl;
          link.style.display = 'none';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        } else {
          window.open(webUrl, '_blank');
        }
      } else {
        window.open(webUrl, '_blank');
      }
      return;
    }
  }
  
  // Route: Delivery Guy Location (origin) → Delivery (destination) - no pickup waypoint
  const webUrl = `https://www.google.com/maps/dir/?api=1&origin=${guyStr}&destination=${deliveryStr}`;
  
  if (shouldOpenNativeMapsApp()) {
    if (isIOS()) {
      let appOpened = false;
      const handleVisibilityChange = () => {
        if (document.hidden) {
          appOpened = true;
        }
      };
      document.addEventListener('visibilitychange', handleVisibilityChange);
      
      const googleMapsUrl = `comgooglemaps://?saddr=${guyStr}&daddr=${deliveryStr}`;
      const link = document.createElement('a');
      link.href = googleMapsUrl;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      setTimeout(() => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        // No web fallback - delivery guys must have Google Maps installed
      }, 1000);
    } else if (isAndroid()) {
      // Android: Open native Google Maps app directly (always installed)
      const googleMapsUrl = `google.navigation:q=${deliveryStr}`;
      const link = document.createElement('a');
      link.href = googleMapsUrl;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      window.open(webUrl, '_blank');
    }
  } else {
    window.open(webUrl, '_blank');
  }
};

/**
 * Opens Google Maps with route showing delivery guy location, pickup, and delivery locations
 * @param {Object} mission - Mission object with pickupLocation/deliveryLocation or stores array
 * @param {Object} deliveryGuyLocation - Optional delivery guy's current location {latitude, longitude}
 */
export const openGoogleMapsForMission = (mission, deliveryGuyLocation = null) => {
  if (!mission) {
    window.alert('Mission data not available');
    return;
  }

  const formatCoord = (coord) => {
    const num = typeof coord === 'number' ? coord : parseFloat(coord);
    return isNaN(num) ? null : num.toFixed(6);
  };

  // Check for multi-store missions
  const hasStores = mission.stores && mission.stores.length > 0;
  const hasDelivery = mission.deliveryLocation && 
    formatCoord(mission.deliveryLocation.latitude) && 
    formatCoord(mission.deliveryLocation.longitude);

  // Check for legacy single pickup missions
  const hasPickup = !hasStores && mission.pickupLocation && 
    formatCoord(mission.pickupLocation.latitude) && 
    formatCoord(mission.pickupLocation.longitude);

  if (!hasPickup && !hasStores && !hasDelivery) {
    window.alert('No location data available for this mission');
    return;
  }

  // Handle multi-store missions WITHOUT delivery location (stores only)
  if (hasStores && !hasDelivery) {
    const calculateDistance = (pointA, pointB) => {
      if (!pointA || !pointB || !pointA.latitude || !pointB.latitude) return Infinity;
      const R = 6371; // Earth radius in km
      const dLat = (pointB.latitude - pointA.latitude) * Math.PI / 180;
      const dLon = (pointB.longitude - pointA.longitude) * Math.PI / 180;
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(pointA.latitude * Math.PI / 180) * Math.cos(pointB.latitude * Math.PI / 180) *
                Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      return R * c;
    };

    // Filter and validate stores (exclude already picked up stores)
    const pickedUpStores = mission.pickedUpFromStores || [];
    const skippedStoreIndices = mission.skippedStores?.map(s => s.storeIndex) || [];
    const validStores = mission.stores
      .filter((store, index) => 
        !pickedUpStores.includes(index) &&
        !skippedStoreIndices.includes(index) &&
        store.location && 
        formatCoord(store.location.latitude) && 
        formatCoord(store.location.longitude))
      .map(store => ({
        ...store,
        location: store.location
      }));

    if (validStores.length === 0) {
      window.alert('No valid store locations available');
      return;
    }

    // Sort stores by distance from delivery guy (if available) or just use order
    let sortedStores = validStores;
    if (deliveryGuyLocation && 
        formatCoord(deliveryGuyLocation.latitude) && 
        formatCoord(deliveryGuyLocation.longitude)) {
      sortedStores = validStores
        .map(store => ({
          ...store,
          distance: calculateDistance(deliveryGuyLocation, store.location)
        }))
        .sort((a, b) => a.distance - b.distance);
    }

    // Build waypoints: stores only (closest first)
    const waypoints = sortedStores.map(store => 
      `${formatCoord(store.location.latitude)},${formatCoord(store.location.longitude)}`
    );

    if (deliveryGuyLocation && 
        formatCoord(deliveryGuyLocation.latitude) && 
        formatCoord(deliveryGuyLocation.longitude)) {
      // Route from delivery guy to stores
      const guyLat = formatCoord(deliveryGuyLocation.latitude);
      const guyLon = formatCoord(deliveryGuyLocation.longitude);
      const guyStr = `${guyLat},${guyLon}`;
      const waypointsStr = waypoints.join('|');
      const lastStore = waypoints[waypoints.length - 1];
      const webUrl = `https://www.google.com/maps/dir/?api=1&origin=${guyStr}&waypoints=${waypointsStr}&destination=${lastStore}`;
      
      if (shouldOpenNativeMapsApp()) {
        if (isIOS()) {
          let appOpened = false;
          const handleVisibilityChange = () => { if (document.hidden) appOpened = true; };
          document.addEventListener('visibilitychange', handleVisibilityChange);
          
          const allWaypoints = [guyStr, ...waypoints];
          const daddr = allWaypoints.slice(1).join('+to:');
          const googleMapsUrl = `comgooglemaps://?saddr=${guyStr}&daddr=${daddr}`;
          
          const link = document.createElement('a');
          link.href = googleMapsUrl;
          link.style.display = 'none';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          
          setTimeout(() => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            // No web fallback - delivery guys must have Google Maps installed
          }, 1000);
        } else if (isAndroid()) {
          const googleMapsUrl = `google.navigation:q=${lastStore}&waypoints=${guyStr}|${waypointsStr}`;
          const link = document.createElement('a');
          link.href = googleMapsUrl;
          link.style.display = 'none';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        } else {
          window.open(webUrl, '_blank');
        }
      } else {
        window.open(webUrl, '_blank');
      }
    } else {
      // No delivery guy location - route from first store to last store
      const firstStore = waypoints[0];
      const remainingWaypoints = waypoints.slice(1).join('|');
      const lastStore = waypoints[waypoints.length - 1];
      const webUrl = remainingWaypoints
        ? `https://www.google.com/maps/dir/?api=1&origin=${firstStore}&waypoints=${remainingWaypoints}&destination=${lastStore}`
        : `https://www.google.com/maps/dir/?api=1&origin=${firstStore}&destination=${lastStore}`;
      
      if (shouldOpenNativeMapsApp()) {
        if (isIOS()) {
          let appOpened = false;
          const handleVisibilityChange = () => { if (document.hidden) appOpened = true; };
          document.addEventListener('visibilitychange', handleVisibilityChange);
          
          const googleMapsUrl = `comgooglemaps://?saddr=${firstStore}&daddr=${lastStore}`;
          const link = document.createElement('a');
          link.href = googleMapsUrl;
          link.style.display = 'none';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          
          setTimeout(() => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            // No web fallback - delivery guys must have Google Maps installed
          }, 1000);
        } else if (isAndroid()) {
          const googleMapsUrl = `google.navigation:q=${lastStore}`;
          const link = document.createElement('a');
          link.href = googleMapsUrl;
          link.style.display = 'none';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        } else {
          window.open(webUrl, '_blank');
        }
      } else {
        window.open(webUrl, '_blank');
      }
    }
    return;
  }

  // Handle multi-store missions WITH delivery location
  if (hasStores && hasDelivery) {
    // Calculate distance from delivery guy to each store
    const calculateDistance = (pointA, pointB) => {
      if (!pointA || !pointB || !pointA.latitude || !pointB.latitude) return Infinity;
      const R = 6371; // Earth radius in km
      const dLat = (pointB.latitude - pointA.latitude) * Math.PI / 180;
      const dLon = (pointB.longitude - pointA.longitude) * Math.PI / 180;
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(pointA.latitude * Math.PI / 180) * Math.cos(pointB.latitude * Math.PI / 180) *
                Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      return R * c;
    };

    // Sort stores by distance from delivery guy (or from delivery location if no delivery guy location)
    const referencePoint = deliveryGuyLocation || (mission.deliveryLocation && mission.deliveryLocation.latitude ? mission.deliveryLocation : null);
    if (!referencePoint || !referencePoint.latitude || !referencePoint.longitude) {
      // If no reference point, just use stores in order (this shouldn't happen in hasStores && hasDelivery, but safety check)
      // Exclude already picked up stores
      const pickedUpStores = mission.pickedUpFromStores || [];
      const skippedStoreIndices = mission.skippedStores?.map(s => s.storeIndex) || [];
      const sortedStores = [...mission.stores]
        .filter((store, index) => 
          !pickedUpStores.includes(index) &&
          !skippedStoreIndices.includes(index) &&
          store.location && 
          formatCoord(store.location.latitude));
      
      if (sortedStores.length === 0) {
        window.alert('No valid store locations available');
        return;
      }
      
      // Since we're in hasStores && hasDelivery, delivery location should exist
      if (!mission.deliveryLocation || !formatCoord(mission.deliveryLocation.latitude)) {
        window.alert('Delivery location data is invalid');
        return;
      }
      
      const waypoints = sortedStores.map(store => 
        `${formatCoord(store.location.latitude)},${formatCoord(store.location.longitude)}`
      );
      const deliveryStr = `${formatCoord(mission.deliveryLocation.latitude)},${formatCoord(mission.deliveryLocation.longitude)}`;
      const firstStore = waypoints[0];
      const remainingWaypoints = waypoints.slice(1).join('|');
      const webUrl = remainingWaypoints
        ? `https://www.google.com/maps/dir/?api=1&origin=${firstStore}&waypoints=${remainingWaypoints}&destination=${deliveryStr}`
        : `https://www.google.com/maps/dir/?api=1&origin=${firstStore}&destination=${deliveryStr}`;
      window.open(webUrl, '_blank');
      return;
    }
    
    const sortedStores = [...mission.stores]
      .filter(store => store.location && formatCoord(store.location.latitude))
      .map(store => ({
        ...store,
        distance: calculateDistance(referencePoint, store.location)
      }))
      .sort((a, b) => a.distance - b.distance);

    if (sortedStores.length === 0) {
      window.alert('No valid store locations available');
      return;
    }

    // Build waypoints: delivery guy -> store1 -> store2 -> ... -> delivery
    const waypoints = sortedStores.map(store => 
      `${formatCoord(store.location.latitude)},${formatCoord(store.location.longitude)}`
    );
    const deliveryStr = `${formatCoord(mission.deliveryLocation.latitude)},${formatCoord(mission.deliveryLocation.longitude)}`;

    if (deliveryGuyLocation && formatCoord(deliveryGuyLocation.latitude)) {
      const guyStr = `${formatCoord(deliveryGuyLocation.latitude)},${formatCoord(deliveryGuyLocation.longitude)}`;
      const waypointsStr = waypoints.join('|');
      const webUrl = `https://www.google.com/maps/dir/?api=1&origin=${guyStr}&waypoints=${waypointsStr}&destination=${deliveryStr}`;
      
      if (shouldOpenNativeMapsApp()) {
        if (isIOS()) {
          let appOpened = false;
          const handleVisibilityChange = () => { if (document.hidden) appOpened = true; };
          document.addEventListener('visibilitychange', handleVisibilityChange);
          
          // iOS: Try to open Google Maps app with waypoints
          // Format: comgooglemaps://?saddr=origin&daddr=waypoint1+to:waypoint2+to:destination
          const allWaypoints = [guyStr, ...waypoints, deliveryStr];
          const daddr = allWaypoints.slice(1).join('+to:');
          const googleMapsUrl = `comgooglemaps://?saddr=${guyStr}&daddr=${daddr}`;
          
          const link = document.createElement('a');
          link.href = googleMapsUrl;
          link.style.display = 'none';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          
          setTimeout(() => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            // No web fallback - delivery guys must have Google Maps installed
          }, 1000);
        } else if (isAndroid()) {
          // Android: Open native Google Maps app directly (always installed)
          const waypointsStr = waypoints.join('|');
          const googleMapsUrl = `google.navigation:q=${deliveryStr}&waypoints=${guyStr}|${waypointsStr}`;
          
          const link = document.createElement('a');
          link.href = googleMapsUrl;
          link.style.display = 'none';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        } else {
          window.open(webUrl, '_blank');
        }
      } else {
        // Desktop: Open web version in new tab
        window.open(webUrl, '_blank');
      }
    } else {
      // No delivery guy location - route from first store to last store to delivery
      const firstStore = waypoints[0];
      const remainingWaypoints = waypoints.slice(1).join('|');
      const webUrl = remainingWaypoints
        ? `https://www.google.com/maps/dir/?api=1&origin=${firstStore}&waypoints=${remainingWaypoints}&destination=${deliveryStr}`
        : `https://www.google.com/maps/dir/?api=1&origin=${firstStore}&destination=${deliveryStr}`;
      
      if (shouldOpenNativeMapsApp()) {
        if (isIOS()) {
          let appOpened = false;
          const handleVisibilityChange = () => { if (document.hidden) appOpened = true; };
          document.addEventListener('visibilitychange', handleVisibilityChange);
          
          const googleMapsUrl = `comgooglemaps://?saddr=${firstStore}&daddr=${deliveryStr}`;
          const link = document.createElement('a');
          link.href = googleMapsUrl;
          link.style.display = 'none';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          
          setTimeout(() => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            // No web fallback - delivery guys must have Google Maps installed
          }, 1000);
        } else if (isAndroid()) {
          // Android: Open native Google Maps app directly (always installed)
          const googleMapsUrl = `google.navigation:q=${deliveryStr}`;
          const link = document.createElement('a');
          link.href = googleMapsUrl;
          link.style.display = 'none';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        } else {
          window.open(webUrl, '_blank');
        }
      } else {
        window.open(webUrl, '_blank');
      }
    }
    return;
  }

  // If we have both locations, create a route
  if (hasPickup && hasDelivery) {
    const pickupLat = formatCoord(mission.pickupLocation.latitude);
    const pickupLon = formatCoord(mission.pickupLocation.longitude);
    const deliveryLat = formatCoord(mission.deliveryLocation.latitude);
    const deliveryLon = formatCoord(mission.deliveryLocation.longitude);
    
    const pickupStr = `${pickupLat},${pickupLon}`;
    const deliveryStr = `${deliveryLat},${deliveryLon}`;
    
    // If delivery guy location is available, use it as origin with pickup as waypoint
    if (deliveryGuyLocation && 
        formatCoord(deliveryGuyLocation.latitude) && 
        formatCoord(deliveryGuyLocation.longitude)) {
      const guyLat = formatCoord(deliveryGuyLocation.latitude);
      const guyLon = formatCoord(deliveryGuyLocation.longitude);
      const guyStr = `${guyLat},${guyLon}`;
      
      // For mobile devices, try to open native Google Maps app
      if (shouldOpenNativeMapsApp()) {
        const webUrl = `https://www.google.com/maps/dir/?api=1&origin=${guyStr}&waypoints=${pickupStr}&destination=${deliveryStr}`;
        let appOpened = false;
        
        // Listen for page visibility change (indicates app opened)
        const handleVisibilityChange = () => {
          if (document.hidden) {
            appOpened = true;
          }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        
        // Try to open native app
        if (isIOS()) {
          // iOS: Use Google Maps app URL scheme
          // Note: iOS Google Maps doesn't support waypoints in URL scheme, so we'll use origin and destination
          // The app will calculate the route through the waypoint
          const googleMapsUrl = `comgooglemaps://?saddr=${guyStr}&daddr=${pickupStr}+to:${deliveryStr}`;
          
          // Create and click a hidden link
          const link = document.createElement('a');
          link.href = googleMapsUrl;
          link.style.display = 'none';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          
          // Check after a delay if app opened
          setTimeout(() => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            // No web fallback - delivery guys must have Google Maps installed
          }, 1000);
        } else if (isAndroid()) {
          // Android: Open native Google Maps app directly (always installed)
          const googleMapsUrl = `google.navigation:q=${deliveryStr}&waypoints=${guyStr}|${pickupStr}`;
          
          const link = document.createElement('a');
          link.href = googleMapsUrl;
          link.style.display = 'none';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        } else {
          window.open(webUrl, '_blank');
        }
      } else {
        // Desktop: Use web version in new tab
        const url = `https://www.google.com/maps/dir/?api=1&origin=${guyStr}&waypoints=${pickupStr}&destination=${deliveryStr}`;
        window.open(url, '_blank');
      }
    } else {
      // Fallback: Route from pickup to delivery (if no delivery guy location)
      const webUrl = `https://www.google.com/maps/dir/?api=1&origin=${pickupStr}&destination=${deliveryStr}`;
      
      if (shouldOpenNativeMapsApp()) {
        let appOpened = false;
        
        // Listen for page visibility change
        const handleVisibilityChange = () => {
          if (document.hidden) {
            appOpened = true;
          }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        
        if (isIOS()) {
          const googleMapsUrl = `comgooglemaps://?saddr=${pickupStr}&daddr=${deliveryStr}`;
          const link = document.createElement('a');
          link.href = googleMapsUrl;
          link.style.display = 'none';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          
          setTimeout(() => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            // No web fallback - delivery guys must have Google Maps installed
          }, 1000);
        } else if (isAndroid()) {
          // Android: Open native Google Maps app directly (always installed)
          const googleMapsUrl = `google.navigation:q=${deliveryStr}`;
          const link = document.createElement('a');
          link.href = googleMapsUrl;
          link.style.display = 'none';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        } else {
          window.open(webUrl, '_blank');
        }
      } else {
        window.open(webUrl, '_blank');
      }
    }
  } else if (hasPickup && hasDelivery && pickupReached) {
    // Pickup has been reached, route directly to delivery
    const deliveryLat = formatCoord(mission.deliveryLocation.latitude);
    const deliveryLon = formatCoord(mission.deliveryLocation.longitude);
    const deliveryStr = `${deliveryLat},${deliveryLon}`;
    
    if (deliveryGuyLocation && 
        formatCoord(deliveryGuyLocation.latitude) && 
        formatCoord(deliveryGuyLocation.longitude)) {
      const guyLat = formatCoord(deliveryGuyLocation.latitude);
      const guyLon = formatCoord(deliveryGuyLocation.longitude);
      const guyStr = `${guyLat},${guyLon}`;
      const webUrl = `https://www.google.com/maps/dir/?api=1&origin=${guyStr}&destination=${deliveryStr}`;
      
      if (shouldOpenNativeMapsApp()) {
        if (isIOS()) {
          let appOpened = false;
          const handleVisibilityChange = () => { if (document.hidden) appOpened = true; };
          document.addEventListener('visibilitychange', handleVisibilityChange);
          
          const googleMapsUrl = `comgooglemaps://?saddr=${guyStr}&daddr=${deliveryStr}`;
          const link = document.createElement('a');
          link.href = googleMapsUrl;
          link.style.display = 'none';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          
          setTimeout(() => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            // No web fallback - delivery guys must have Google Maps installed
          }, 1000);
        } else if (isAndroid()) {
          const googleMapsUrl = `google.navigation:q=${deliveryStr}`;
          const link = document.createElement('a');
          link.href = googleMapsUrl;
          link.style.display = 'none';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        } else {
          window.open(webUrl, '_blank');
        }
      } else {
        window.open(webUrl, '_blank');
      }
    } else {
      openGoogleMaps(mission.deliveryLocation.latitude, mission.deliveryLocation.longitude, mission.deliveryAddress || 'Delivery Location');
    }
  } else {
    // Only one location available, use simple navigation
    const location = hasPickup ? mission.pickupLocation : mission.deliveryLocation;
    const label = hasPickup 
      ? (mission.pickupAddress || 'Pickup Location')
      : (mission.deliveryAddress || 'Delivery Location');
    
    if (location && location.latitude && location.longitude) {
    openGoogleMaps(location.latitude, location.longitude, label);
    }
  }
};

