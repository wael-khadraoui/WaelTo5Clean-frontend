import { useEffect, useRef } from 'react';
import { authService, dataService } from '../App';

export function useLocationTracking(enabled = true) {
  const watchIdRef = useRef(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    if (!navigator.geolocation) {
      return;
    }

    // Start watching position
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const coords = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };

        // Push location to API
        const user = authService.getCurrentUser();
        if (user) {
          dataService.updateLocation(user.uid, coords);
        }
      },
      (error) => {
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 5000, // Accept cached position up to 5 seconds old
      }
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [enabled]);

  return watchIdRef.current !== null;
}

