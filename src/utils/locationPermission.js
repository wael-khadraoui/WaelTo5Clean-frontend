// Location permission utility for web

export async function checkLocationPermission() {
  if (!navigator.geolocation) {
    return {
      supported: false,
      granted: false,
      message: 'Geolocation is not supported by your browser'
    };
  }

  // Check permission status (if available)
  if (navigator.permissions) {
    try {
      const permission = await navigator.permissions.query({ name: 'geolocation' });
      return {
        supported: true,
        granted: permission.state === 'granted',
        denied: permission.state === 'denied',
        prompt: permission.state === 'prompt',
        permission
      };
    } catch (error) {
      // Permissions API might not be fully supported, fall back to requesting
    }
  }

  // If permissions API not available, we'll need to request
  return {
    supported: true,
    granted: null, // Unknown, need to request
    prompt: true
  };
}

export async function requestLocationPermission() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          granted: true,
          position
        });
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          resolve({
            granted: false,
            denied: true,
            error: 'Permission denied'
          });
        } else {
          reject(error);
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0
      }
    );
  });
}

export function getLocationSettingsURL() {
  // Browser-specific settings URLs (users need to navigate manually)
  const userAgent = navigator.userAgent.toLowerCase();
  
  if (userAgent.includes('chrome')) {
    return 'chrome://settings/content/location';
  } else if (userAgent.includes('firefox')) {
    return 'about:preferences#privacy';
  } else if (userAgent.includes('safari')) {
    return 'Settings > Safari > Privacy > Location Services';
  } else if (userAgent.includes('edge')) {
    return 'edge://settings/content/location';
  }
  
  return null;
}

