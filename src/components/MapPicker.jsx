import React, { useState, useEffect, useRef } from 'react';
import Map, { Marker } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useTranslation } from '../hooks/useTranslation';
import { mapboxConfig } from '../config/mapboxConfig';
import { api } from '../api/http.js';
import MapboxConfigMissing from './MapboxConfigMissing.jsx';
import './MapPicker.css';

export default function MapPicker({ 
  initialLocation, 
  onLocationSelect, 
  onClose,
  title
}) {
  const { t } = useTranslation();
  const displayTitle = title || t('selectLocation');
  const [viewState, setViewState] = useState({
    latitude: initialLocation?.latitude || 37.269584420315546,
    longitude: initialLocation?.longitude || 9.874240390070584,
    zoom: 15,
  });
  const [selectedLocation, setSelectedLocation] = useState(initialLocation);
  const [searchAddress, setSearchAddress] = useState('');
  const [selectedAddress, setSelectedAddress] = useState('');
  const [searchSuggestions, setSearchSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const autocompleteInputRef = useRef(null);
  const searchTimeoutRef = useRef(null);

  // Google Places: server proxy at /api/places/search-text (key stays on API, not in the bundle)
  const searchPlaces = async (query) => {
    if (!query || query.trim().length < 2) {
      setSearchSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    setIsSearching(true);

    try {
      let fullAddress = query.trim();
      if (!fullAddress.toLowerCase().includes('bizerte') && !fullAddress.toLowerCase().includes('bizert')) {
        fullAddress = `${fullAddress}, Bizerte, Tunisia`;
      }

      const data = await api('/api/places/search-text', {
        method: 'POST',
        body: JSON.stringify({
          textQuery: fullAddress,
          regionCode: 'TN',
          maxResultCount: 10,
        }),
      });
      
      if (data.places && data.places.length > 0) {
        const suggestions = data.places.map((place, index) => ({
          id: place.id || `place_${index}`,
          name: place.displayName?.text || place.formattedAddress || 'Unknown',
          address: place.formattedAddress || place.displayName?.text || '',
          location: {
            latitude: place.location?.latitude || 0,
            longitude: place.location?.longitude || 0
          }
        }));
        
        if (suggestions.length > 0) {
          setSearchSuggestions(suggestions);
          setShowSuggestions(true);
        } else {
          setSearchSuggestions([]);
          setShowSuggestions(false);
        }
      } else {
        setSearchSuggestions([]);
        setShowSuggestions(false);
      }
    } catch (error) {
      setSearchSuggestions([]);
      setShowSuggestions(false);
    } finally {
      setIsSearching(false);
    }
  };

  // Handle search input changes with debouncing (1 second delay to reduce API calls)
  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchAddress(value);
    
    // Hide suggestions immediately when typing
    setShowSuggestions(false);
    
    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    // If input is cleared, clear suggestions immediately
    if (!value.trim() || value.trim().length < 2) {
      setSearchSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    
    // Debounce search - wait 800ms after user stops typing
    // This reduces API calls while still feeling responsive
    searchTimeoutRef.current = setTimeout(() => {
      if (value.trim().length >= 2) {
        searchPlaces(value.trim());
      }
    }, 800);
  };

  // Handle suggestion selection
  const handleSelectSuggestion = (suggestion) => {
    setSearchAddress(suggestion.address || suggestion.name);
    setSelectedAddress(suggestion.address || suggestion.name);
    setSelectedLocation(suggestion.location);
    setSearchSuggestions([]);
    setShowSuggestions(false);
    
    // Update map view
    setViewState(prev => ({
      ...prev,
      latitude: suggestion.location.latitude,
      longitude: suggestion.location.longitude,
      zoom: 17,
    }));
  };

  useEffect(() => {
    // Get current location if available
    if (navigator.geolocation && !initialLocation) {
      navigator.geolocation.getCurrentPosition((position) => {
        setViewState(prev => ({
          ...prev,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }));
        setSelectedLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      });
    }

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [initialLocation]);

  const handleMapClick = (event) => {
    const { lng, lat } = event.lngLat;
    const location = {
      latitude: lat,
      longitude: lng,
    };
    setSelectedLocation(location);
  };

  const handleConfirm = () => {
    if (selectedLocation) {
      onLocationSelect(selectedLocation);
      onClose();
    }
  };

  return (
    <div className="map-picker-overlay">
      <div className="map-picker-modal">
        <div className="map-picker-header">
          <h2>{displayTitle}</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>
        <div className="map-picker-search">
          <div className="map-picker-search-wrapper">
            <input
              ref={autocompleteInputRef}
              type="text"
              placeholder={t('searchForPlace')}
              value={searchAddress}
              onChange={handleSearchChange}
              onFocus={() => {
                if (searchSuggestions.length > 0) {
                  setShowSuggestions(true);
                }
              }}
              onBlur={() => {
                // Delay hiding suggestions to allow clicking
                setTimeout(() => {
                  setShowSuggestions(false);
                }, 300);
              }}
              className="map-picker-search-input"
            />
            {isSearching && (
              <span className="map-picker-search-loading">🔍</span>
            )}
          </div>
          {showSuggestions && searchSuggestions.length > 0 && (
            <div className="map-picker-suggestions">
              {searchSuggestions.map((suggestion) => (
                <div
                  key={suggestion.id}
                  className="map-picker-suggestion-item"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelectSuggestion(suggestion);
                  }}
                >
                  <div className="map-picker-suggestion-name">{suggestion.name}</div>
                  {suggestion.address && suggestion.address !== suggestion.name && (
                    <div className="map-picker-suggestion-address">{suggestion.address}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="map-picker-instructions">
          <p>{t('searchOrClickMap')}</p>
        </div>
        <div className="map-picker-container">
          {!mapboxConfig.isConfigured ? (
            <MapboxConfigMissing />
          ) : (
            <Map
              {...viewState}
              onMove={evt => setViewState(evt.viewState)}
              onClick={handleMapClick}
              mapboxAccessToken={mapboxConfig.accessToken}
              style={{ width: '100%', height: '100%' }}
              mapStyle={mapboxConfig.styleURL}
            >
              {selectedLocation && (
                <Marker
                  longitude={selectedLocation.longitude}
                  latitude={selectedLocation.latitude}
                  anchor="bottom"
                >
                  <div className="marker-pin-icon">
                    <svg width="24" height="32" viewBox="0 0 24 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 0C5.373 0 0 5.373 0 12C0 18.627 12 32 12 32C12 32 24 18.627 24 12C24 5.373 18.627 0 12 0Z" fill="#667eea"/>
                      <path d="M12 7C9.239 7 7 9.239 7 12C7 14.761 9.239 17 12 17C14.761 17 17 14.761 17 12C17 9.239 14.761 7 12 7Z" fill="white"/>
                    </svg>
                  </div>
                </Marker>
              )}
            </Map>
          )}
        </div>
        {selectedLocation && (
          <div className="map-picker-coords">
            {selectedAddress && (
              <p className="map-picker-address">
                <strong>{t('address')}:</strong> {selectedAddress}
              </p>
            )}
            <p>
              Latitude: {selectedLocation.latitude.toFixed(6)}, 
              Longitude: {selectedLocation.longitude.toFixed(6)}
            </p>
          </div>
        )}
        <div className="map-picker-actions">
          <button className="cancel-button" onClick={onClose}>
            {t('cancel')}
          </button>
          <button 
            className="confirm-button" 
            onClick={handleConfirm}
            disabled={!selectedLocation}
          >
            {t('confirmLocation')}
          </button>
        </div>
      </div>
    </div>
  );
}

