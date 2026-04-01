// Utility for calculating routes using Mapbox Directions API

export async function getRoute(coordinates, accessToken, profile = 'driving') {
  if (!coordinates || coordinates.length < 2 || !String(accessToken || '').trim()) {
    return null;
  }

  try {
    // Format coordinates for Mapbox Directions API: [longitude, latitude]
    const coordsString = coordinates
      .map(coord => `${coord[0]},${coord[1]}`)
      .join(';');

    const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${coordsString}?geometries=geojson&overview=full&steps=true&access_token=${accessToken}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Mapbox API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    
    if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
      const route = data.routes[0].geometry.coordinates;
      return route;
    } else {
      return null;
    }
  } catch (error) {
    return null;
  }
}

async function getMatchedRouteFromMapMatching(coordinates, accessToken, profile = 'driving') {
  if (!coordinates || coordinates.length < 2 || !String(accessToken || '').trim()) {
    return null;
  }

  try {
    const coordsString = coordinates.map(coord => `${coord[0]},${coord[1]}`).join(';');
    const url = `https://api.mapbox.com/matching/v5/mapbox/${profile}/${coordsString}?geometries=geojson&tidy=true&steps=false&access_token=${accessToken}`;

    const response = await fetch(url);
    if (!response.ok) {
      const errorText = await response.text();
      return null;
    }

    const data = await response.json();
    if (data.code === 'Ok' && data.matchings && data.matchings.length > 0) {
      const route = data.matchings[0].geometry.coordinates;
      return route;
    }

    return null;
  } catch (error) {
    return null;
  }
}

function downSampleCoordinates(coordinates, maxPoints) {
  if (!coordinates || coordinates.length <= maxPoints) {
    return coordinates;
  }

  const step = Math.ceil(coordinates.length / maxPoints);
  const sampled = [];
  for (let i = 0; i < coordinates.length; i += step) {
    sampled.push(coordinates[i]);
  }
  if (sampled[sampled.length - 1] !== coordinates[coordinates.length - 1]) {
    sampled.push(coordinates[coordinates.length - 1]);
  }
  if (sampled[0] !== coordinates[0]) {
    sampled.unshift(coordinates[0]);
  }
  return sampled.slice(0, maxPoints);
}

// Calculate route for trajectory (multiple waypoints)
// Attempts Map Matching first to snap GPS trace to streets, falls back to Directions
export async function getTrajectoryRoute(trajectory, accessToken, profile = 'driving') {
  if (!trajectory || trajectory.length < 2 || !String(accessToken || '').trim()) {
    return null;
  }

  // Convert trajectory to coordinates format [longitude, latitude]
  const coordinates = trajectory.map((point, index) => {
    // Handle different trajectory point formats
    let lon, lat;
    
    if (point.longitude !== undefined && point.latitude !== undefined) {
      lon = point.longitude;
      lat = point.latitude;
    } else if (point.location && point.location.longitude && point.location.latitude) {
      lon = point.location.longitude;
      lat = point.location.latitude;
    } else {
      return null;
    }
    
    // Validate coordinates
    if (typeof lon !== 'number' || typeof lat !== 'number' || 
        isNaN(lon) || isNaN(lat) ||
        lon < -180 || lon > 180 || lat < -90 || lat > 90) {
      return null;
    }
    
    return [lon, lat];
  }).filter(coord => coord !== null && coord[0] !== null && coord[1] !== null);
  
  if (coordinates.length < 2) {
    return null;
  }

  // First try Map Matching (supports up to 100 points)
  const mapMatchingCoords = downSampleCoordinates(coordinates, 100);
  const matchedRoute = await getMatchedRouteFromMapMatching(mapMatchingCoords, accessToken, profile);
  if (matchedRoute && matchedRoute.length > 0) {
    return matchedRoute;
  }

  // Fallback to Directions API using simplified waypoints (limit 25)
  let waypoints = downSampleCoordinates(coordinates, 25);
  
  // Try to calculate route with all waypoints at once (better for following streets)
  // Mapbox Directions API supports up to 25 waypoints
  if (waypoints.length <= 25 && waypoints.length >= 2) {
    try {
      // Use walking profile for delivery guys - gives better routes for short distances
      const fullRoute = await getRoute(waypoints, accessToken, 'walking');
      
      if (fullRoute && fullRoute.length > 0) {
        return fullRoute;
      }
    } catch (error) {
    }
  }
  
  // Fallback: Calculate routes between consecutive waypoints
  const allRoutePoints = [];
  
  for (let i = 0; i < waypoints.length - 1; i++) {
    const start = waypoints[i];
    const end = waypoints[i + 1];
    
    // Calculate distance between points for logging
    const distance = calculateDistance(start[1], start[0], end[1], end[0]);
    
    // Always calculate route for trajectory paths to follow streets
    // Only skip if points are extremely close (less than 5 meters) to avoid API spam
    if (distance > 0.005) { // 5 meters threshold
      try {
        const segmentRoute = await getRoute([start, end], accessToken, profile);
        
        if (segmentRoute && segmentRoute.length > 0) {
          // Add route points (skip first point if not the first segment to avoid duplicates)
          if (i === 0) {
            allRoutePoints.push(...segmentRoute);
          } else {
            // Skip first point to avoid duplicate connection
            allRoutePoints.push(...segmentRoute.slice(1));
          }
        } else {
          // If route calculation fails, add straight line as fallback
          if (i === 0) {
            allRoutePoints.push(start);
          }
          allRoutePoints.push(end);
        }
      } catch (error) {
        // Fallback: add straight line
        if (i === 0) {
          allRoutePoints.push(start);
        }
        allRoutePoints.push(end);
      }
      
      // Add small delay to avoid rate limiting
      if (i < waypoints.length - 2) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } else {
      // For extremely close points (< 5m), just add the end point
      if (i === 0) {
        allRoutePoints.push(start);
      }
      allRoutePoints.push(end);
    }
  }
  

  return allRoutePoints.length > 0 ? allRoutePoints : null;
}

// Helper function to calculate distance between two coordinates (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the Earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in km
}

