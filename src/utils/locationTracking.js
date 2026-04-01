/**
 * Get current location (web version)
 * @returns {Promise<{latitude: number, longitude: number} | null>}
 */
export const getCurrentLocation = () => {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      (error) => {
        resolve(null);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  });
};

/**
 * Get current location with permission request (web version)
 * Requests permission if not already granted
 * @returns {Promise<{latitude: number, longitude: number} | null>}
 */
export const getCurrentLocationWithPermission = async () => {
  if (!navigator.geolocation) {
    return null;
  }

  // Check if permission is already granted by trying to get position
  // If permission is denied, we'll get an error and can handle it
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      async (error) => {
        // If permission denied, try to request it (browser will show prompt)
        if (error.code === error.PERMISSION_DENIED) {
          // Note: Browsers don't allow programmatic permission requests
          // The user must grant permission through the browser's permission prompt
          // We'll just return null and let the caller use fallback
          resolve(null);
        } else {
          resolve(null);
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  });
};

