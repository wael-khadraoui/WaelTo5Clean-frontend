import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { dataService, authService, userService } from '../App';
import toast from 'react-hot-toast';
import { useTranslation } from '../hooks/useTranslation';
import MapPicker from '../components/MapPicker';
import './RestaurantsPage.css';

export default function RestaurantsPage() {
  const { t } = useTranslation();
  const [allRestaurants, setAllRestaurants] = useState([]); // All restaurants from DB
  const [restaurants, setRestaurants] = useState([]); // Filtered and paginated restaurants
  const [loading, setLoading] = useState(true);
  const [editingRestaurant, setEditingRestaurant] = useState(null);
  const [addingNewRestaurant, setAddingNewRestaurant] = useState(false);
  const [newRestaurant, setNewRestaurant] = useState({ name: '', address: '', phone: '', location: null });
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [showJsonImport, setShowJsonImport] = useState(false);
  const [jsonInput, setJsonInput] = useState('');
  const [jsonFormat, setJsonFormat] = useState('array'); // 'array' or 'object'
  const [jsonError, setJsonError] = useState('');
  const [userRole, setUserRole] = useState(null);
  const [deletingAll, setDeletingAll] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [displayedCount, setDisplayedCount] = useState(10); // Number of restaurants to display
  const [selectedRestaurant, setSelectedRestaurant] = useState(null);
  const [restaurantCommands, setRestaurantCommands] = useState([]);
  const [loadingCommands, setLoadingCommands] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selectedDay, setSelectedDay] = useState(null);
  const [viewMode, setViewMode] = useState('calendar'); // 'calendar' or 'range'
  const [deliveryGuys, setDeliveryGuys] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    loadUserRole();
    loadRestaurants();
    loadDeliveryGuys();
  }, []);

  const loadDeliveryGuys = async () => {
    try {
      const guys = await userService.getAllUsers();
      // Filter to only delivery guys
      const deliveryGuysList = guys.filter(user => user.role === 'delivery_guy');
      setDeliveryGuys(deliveryGuysList);
    } catch (error) {
    }
  };

  const getDeliveryGuyName = (userId) => {
    if (!userId) return null;
    const guy = deliveryGuys.find(g => g.id === userId);
    if (!guy) return null;
    return guy.name || guy.email || 'Unknown';
  };

  const loadUserRole = async () => {
    const currentUser = authService.getCurrentUser();
    if (currentUser) {
      const userData = await userService.getUserData(currentUser.uid);
      setUserRole(userData?.role || null);
    }
  };

  const loadRestaurants = async () => {
    setLoading(true);
    const loadedRestaurants = await dataService.getAllRestaurants();
    setAllRestaurants(loadedRestaurants);
    setLoading(false);
  };

  // Filter and paginate restaurants based on search and displayed count
  useEffect(() => {
    let filtered = allRestaurants;

    // Apply search filter
    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase().trim();
      filtered = allRestaurants.filter(restaurant => {
        const nameMatch = restaurant.name?.toLowerCase().includes(searchLower);
        const addressMatch = restaurant.address?.toLowerCase().includes(searchLower);
        const phoneMatch = restaurant.phone?.toLowerCase().includes(searchLower);
        return nameMatch || addressMatch || phoneMatch;
      });
    }

    // Apply pagination
    setRestaurants(filtered.slice(0, displayedCount));
  }, [allRestaurants, searchTerm, displayedCount]);

  // Load more restaurants when scrolling to bottom
  const loadMore = () => {
    if (displayedCount < allRestaurants.length) {
      setDisplayedCount(prev => Math.min(prev + 10, allRestaurants.length));
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
  }, [displayedCount, allRestaurants.length]);

  const handleEdit = (restaurant) => {
    setEditingRestaurant({ ...restaurant });
  };

  const handleCancelEdit = () => {
    setEditingRestaurant(null);
  };

  const handleAddNew = () => {
    setAddingNewRestaurant(true);
    setNewRestaurant({ name: '', address: '', phone: '', location: null });
  };

  const handleCancelAdd = () => {
    setAddingNewRestaurant(false);
    setNewRestaurant({ name: '', address: '', phone: '', location: null });
  };

  const handleSaveNew = async () => {
    if (!newRestaurant.name.trim()) {
      toast.error(t('nameRequired'));
      return;
    }

    if (!newRestaurant.location || !newRestaurant.location.latitude) {
      toast.error(t('selectLocationOnMap'));
      return;
    }

    const result = await dataService.saveRestaurant({
      name: newRestaurant.name.trim(),
      address: newRestaurant.address ? newRestaurant.address.trim() : '',
      phone: newRestaurant.phone ? newRestaurant.phone.trim() : '',
      location: newRestaurant.location
    });

    if (result.success) {
      toast.success(t('restaurantCreated'));
      setAddingNewRestaurant(false);
      setNewRestaurant({ name: '', address: '', location: null });
      loadRestaurants();
    } else {
      toast.error(result.error || t('failedToCreateRestaurant'));
    }
  };

  const handleSave = async () => {
    if (!editingRestaurant.name.trim()) {
      toast.error(t('nameRequired'));
      return;
    }

    if (!editingRestaurant.location || !editingRestaurant.location.latitude) {
      toast.error(t('selectLocationOnMap'));
      return;
    }

    const result = await dataService.updateRestaurant(editingRestaurant.id, {
      name: editingRestaurant.name.trim(),
      address: editingRestaurant.address ? editingRestaurant.address.trim() : '',
      phone: editingRestaurant.phone ? editingRestaurant.phone.trim() : '',
      location: editingRestaurant.location
    });

    if (result.success) {
      toast.success(t('restaurantUpdated'));
      setEditingRestaurant(null);
      loadRestaurants();
    } else {
      toast.error(result.error || t('failedToUpdateRestaurant'));
    }
  };

  const handleDelete = async (restaurantId) => {
    if (!window.confirm('Are you sure you want to delete this restaurant?')) {
      return;
    }

    const result = await dataService.deleteRestaurant(restaurantId);
    if (result.success) {
      toast.success(t('restaurantDeleted'));
      loadRestaurants();
    } else {
      toast.error(result.error || t('failedToDeleteRestaurant'));
    }
  };

  const handleViewCommands = async (restaurant) => {
    setSelectedRestaurant(restaurant);
    setLoadingCommands(true);
    setSelectedDay(null);
    setFromDate('');
    setToDate('');
    setViewMode('calendar');
    setCurrentMonth(new Date());
    try {
      // Pass both restaurant ID and name for matching (ID is primary, name is fallback)
      const missions = await dataService.getMissionsByRestaurant(restaurant.id, restaurant.name);
      setRestaurantCommands(missions);
    } catch (error) {
      toast.error(t('failedToLoadCommands'));
    } finally {
      setLoadingCommands(false);
    }
  };

  const handleCloseCommands = () => {
    setSelectedRestaurant(null);
    setRestaurantCommands([]);
    setSelectedDate(new Date());
    setSelectedDay(null);
    setFromDate('');
    setToDate('');
    setViewMode('calendar');
    setCurrentMonth(new Date());
  };

  // Filter missions by date range (only completed missions with items from selected restaurant)
  const getFilteredMissions = () => {
    if (!selectedRestaurant) return [];
    
    // First filter to only completed missions that have items from the selected restaurant
    let filtered = restaurantCommands.filter(mission => {
      if (mission.status !== 'completed') return false;
      if (!mission.stores || !Array.isArray(mission.stores)) return false;
      
      // Check if mission has items from the selected restaurant
      return mission.stores.some(store => {
        // Match by restaurant ID (preferred)
        if (selectedRestaurant.id && store.restaurantId) {
          return store.restaurantId === selectedRestaurant.id;
        }
        // Fallback to name matching
        if (selectedRestaurant.name && store.name) {
          return store.name.trim().toLowerCase() === selectedRestaurant.name.trim().toLowerCase();
        }
        return false;
      });
    });
    
    if (viewMode === 'range' && fromDate && toDate) {
      const from = new Date(fromDate);
      const to = new Date(toDate);
      to.setHours(23, 59, 59, 999); // Include entire end date
      
      filtered = filtered.filter(mission => {
        if (!mission.createdAt) return false;
        const missionDate = new Date(mission.createdAt);
        return missionDate >= from && missionDate <= to;
      });
    } else if (selectedDay) {
      const dayStart = new Date(selectedDay);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(selectedDay);
      dayEnd.setHours(23, 59, 59, 999);
      
      filtered = filtered.filter(mission => {
        if (!mission.createdAt) return false;
        const missionDate = new Date(mission.createdAt);
        return missionDate >= dayStart && missionDate <= dayEnd;
      });
    }
    
    return filtered;
  };

  const filteredMissions = getFilteredMissions();
  const totalMissions = filteredMissions.length;

  // Calculate total purchase amount for filtered missions (only items from selected restaurant, no delivery fees)
  const calculateTotalPurchase = () => {
    if (!selectedRestaurant) return 0;
    
    return filteredMissions.reduce((total, mission) => {
      if (!mission.stores || !Array.isArray(mission.stores)) return total;
      
      // Find stores that match the selected restaurant
      const matchingStores = mission.stores.filter(store => {
        // Match by restaurant ID (preferred)
        if (selectedRestaurant.id && store.restaurantId) {
          return store.restaurantId === selectedRestaurant.id;
        }
        // Fallback to name matching
        if (selectedRestaurant.name && store.name) {
          return store.name.trim().toLowerCase() === selectedRestaurant.name.trim().toLowerCase();
        }
        return false;
      });
      
      // Calculate total only from items in matching stores
      const missionTotal = matchingStores.reduce((storeSum, store) => {
        if (store.items && Array.isArray(store.items)) {
          return storeSum + store.items.reduce((itemSum, item) => {
            return itemSum + (parseFloat(item.price) || 0);
          }, 0);
        }
        return storeSum;
      }, 0);
      
      return total + missionTotal;
    }, 0);
  };

  const totalPurchase = calculateTotalPurchase();

  // Get missions count per day for calendar (only completed missions with items from selected restaurant)
  const getMissionsByDay = () => {
    const missionsByDay = {};
    if (!selectedRestaurant) return missionsByDay;
    
    restaurantCommands.forEach(mission => {
      // Only count completed missions
      if (mission.status !== 'completed') return;
      
      // Use completedAt if available, otherwise fallback to createdAt
      const dateToUse = mission.completedAt || mission.createdAt;
      if (!dateToUse) return;
      
      // Check if mission has items from the selected restaurant
      if (!mission.stores || !Array.isArray(mission.stores)) return;
      
      const hasMatchingStore = mission.stores.some(store => {
        // Match by restaurant ID (preferred)
        if (selectedRestaurant.id && store.restaurantId) {
          return store.restaurantId === selectedRestaurant.id;
        }
        // Fallback to name matching
        if (selectedRestaurant.name && store.name) {
          return store.name.trim().toLowerCase() === selectedRestaurant.name.trim().toLowerCase();
        }
        return false;
      });
      
      if (!hasMatchingStore) return;
      
      // Use local date instead of UTC to avoid timezone issues
      const date = new Date(dateToUse);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const dateKey = `${year}-${month}-${day}`; // YYYY-MM-DD in local timezone
      missionsByDay[dateKey] = (missionsByDay[dateKey] || 0) + 1;
    });
    return missionsByDay;
  };

  const missionsByDay = getMissionsByDay();

  // Calendar helper functions
  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();
    
    const days = [];
    // Add empty cells for days before the first day of the month
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }
    // Add all days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(year, month, day));
    }
    return days;
  };

  const handlePrevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const handleDayClick = (day) => {
    if (!day) return;
    // Use local date instead of UTC to avoid timezone issues
    const year = day.getFullYear();
    const month = String(day.getMonth() + 1).padStart(2, '0');
    const dayNum = String(day.getDate()).padStart(2, '0');
    const dateKey = `${year}-${month}-${dayNum}`; // YYYY-MM-DD in local timezone
    if (selectedDay === dateKey) {
      setSelectedDay(null); // Deselect if clicking same day
    } else {
      setSelectedDay(dateKey);
      setViewMode('calendar');
    }
  };

  const handleApplyDateRange = () => {
    if (!fromDate || !toDate) {
      toast.error('Please select both from and to dates');
      return;
    }
    if (new Date(fromDate) > new Date(toDate)) {
      toast.error('From date must be before or equal to to date');
      return;
    }
    setViewMode('range');
    setSelectedDay(null);
  };

  const handleClearFilters = () => {
    setFromDate('');
    setToDate('');
    setSelectedDay(null);
    setViewMode('calendar');
  };

  // Group filtered missions by date for display
  const groupCommandsByDate = (commands) => {
    const grouped = {};
    commands.forEach(mission => {
      // Use completedAt if available, otherwise fallback to createdAt
      const dateToUse = mission.completedAt || mission.createdAt;
      if (!dateToUse) return;
      
      // Use local date instead of UTC to avoid timezone issues
      const date = new Date(dateToUse);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const dateKey = `${year}-${month}-${day}`; // YYYY-MM-DD in local timezone
      
      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(mission);
    });
    // Sort commands within each date by time
    Object.keys(grouped).forEach(dateKey => {
      grouped[dateKey].sort((a, b) => {
        const timeA = new Date(a.completedAt || a.createdAt).getTime();
        const timeB = new Date(b.completedAt || b.createdAt).getTime();
        return timeB - timeA; // Newest first
      });
    });
    return grouped;
  };

  const commandsByDate = groupCommandsByDate(filteredMissions);
  const allDates = Object.keys(commandsByDate).sort((a, b) => {
    return new Date(b) - new Date(a); // Newest first
  });

  // Format date for display
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
    }
  };

  // Format time for display
  const formatTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    });
  };

  const handleDeleteAll = async () => {
    if (allRestaurants.length === 0) {
      toast.info(t('noRestaurantsToDelete'));
      return;
    }

    const confirmMessage = `${t('areYouSureDeleteAll')} ${allRestaurants.length} ${t('restaurants')}? ${t('actionCannotBeUndone')}!`;
    if (!window.confirm(confirmMessage)) {
      return;
    }

    // Double confirmation for safety
    if (!window.confirm(t('lastChanceConfirm'))) {
      return;
    }

    setDeletingAll(true);
    let successCount = 0;
    let errorCount = 0;

    try {
      for (const restaurant of allRestaurants) {
        const result = await dataService.deleteRestaurant(restaurant.id);
        if (result.success) {
          successCount++;
        } else {
          errorCount++;
        }
      }

      if (successCount > 0) {
        toast.success(`${t('successfullyDeleted')} ${successCount} ${t('restaurants')}`);
        loadRestaurants();
      }
      if (errorCount > 0) {
        toast.error(`${t('failedToDelete')} ${errorCount} ${t('restaurants')}`);
      }
    } catch (error) {
      toast.error(`${t('errorDeletingRestaurants')}: ${error.message}`);
    } finally {
      setDeletingAll(false);
    }
  };

  const handleLocationSelected = (location) => {
    setEditingRestaurant({ ...editingRestaurant, location });
    setShowLocationPicker(false);
  };

  const handleJsonImport = async () => {
    if (!jsonInput.trim()) {
      setJsonError('Please enter JSON text');
      return;
    }

    try {
      let parsedData;
      try {
        parsedData = JSON.parse(jsonInput);
      } catch (e) {
        setJsonError(`Invalid JSON format: ${e.message}`);
        return;
      }

      let restaurantsToImport = [];
      
      if (jsonFormat === 'array') {
        if (!Array.isArray(parsedData)) {
          setJsonError('JSON must be an array of restaurant objects');
          return;
        }
        restaurantsToImport = parsedData;
      } else {
        // Single object - convert to array
        restaurantsToImport = [parsedData];
      }

      if (restaurantsToImport.length === 0) {
        setJsonError(t('noRestaurantsInJson'));
        return;
      }

      // Validate each restaurant
      const errors = [];
      const validRestaurants = [];

      for (let i = 0; i < restaurantsToImport.length; i++) {
        const restaurant = restaurantsToImport[i];
        const index = i + 1;

        if (!restaurant.name || typeof restaurant.name !== 'string' || !restaurant.name.trim()) {
          errors.push(`${t('restaurant')} ${index}: ${t('missingOrInvalid')} "name" ${t('field')}`);
          continue;
        }

        // Address is optional, but if provided must be a string
        if (restaurant.address !== undefined && restaurant.address !== null && 
            (typeof restaurant.address !== 'string' || (restaurant.address.trim && !restaurant.address.trim()))) {
          errors.push(`${t('restaurant')} ${index}: ${t('invalid')} "address" ${t('field')} (${t('mustBeString')})`);
          continue;
        }

        // Phone is optional, but if provided must be a string
        if (restaurant.phone !== undefined && restaurant.phone !== null && 
            typeof restaurant.phone !== 'string') {
          errors.push(`${t('restaurant')} ${index}: ${t('invalid')} "phone" ${t('field')} (${t('mustBeString')})`);
          continue;
        }

        if (restaurant.latitude === undefined || restaurant.latitude === null) {
          errors.push(`${t('restaurant')} ${index}: ${t('missing')} "latitude" ${t('field')}`);
          continue;
        }

        if (restaurant.longitude === undefined || restaurant.longitude === null) {
          errors.push(`${t('restaurant')} ${index}: ${t('missing')} "longitude" ${t('field')}`);
          continue;
        }

        const lat = parseFloat(restaurant.latitude);
        const lng = parseFloat(restaurant.longitude);

        if (isNaN(lat) || lat < -90 || lat > 90) {
          errors.push(`${t('restaurant')} ${index}: ${t('invalidLatitude')}`);
          continue;
        }

        if (isNaN(lng) || lng < -180 || lng > 180) {
          errors.push(`${t('restaurant')} ${index}: ${t('invalidLongitude')}`);
          continue;
        }

        validRestaurants.push({
          name: restaurant.name.trim(),
          address: restaurant.address ? restaurant.address.trim() : '',
          phone: restaurant.phone ? restaurant.phone.trim() : '',
          location: {
            latitude: lat,
            longitude: lng
          },
          city: restaurant.city || null,
          governorate: restaurant.governorate || null,
          source: restaurant.source || null
        });
      }

      if (errors.length > 0) {
        setJsonError(`${t('validationErrors')}:\n${errors.join('\n')}`);
        return;
      }

      if (validRestaurants.length === 0) {
        setJsonError(t('noValidRestaurantsToImport'));
        return;
      }

      // Import restaurants
      let successCount = 0;
      let errorCount = 0;
      let skippedCount = 0;

      for (const restaurant of validRestaurants) {
        try {
          // Check if restaurant already exists by name
          const existing = allRestaurants.find(r => 
            r.name.toLowerCase() === restaurant.name.toLowerCase()
          );

          if (existing) {
            skippedCount++;
            continue;
          }

          const result = await dataService.saveRestaurant(restaurant);
          if (result.success) {
            successCount++;
          } else {
            errorCount++;
          }
        } catch (e) {
          errorCount++;
        }
      }

      // Show results
      if (successCount > 0) {
        toast.success(`${t('successfullyImported')} ${successCount} ${t('restaurants')}`);
        if (skippedCount > 0) {
          toast.info(`${t('skipped')} ${skippedCount} ${t('duplicates')}`);
        }
        if (errorCount > 0) {
          toast.error(`${t('failedToImport')} ${errorCount} ${t('restaurants')}`);
        }
        loadRestaurants();
        setShowJsonImport(false);
        setJsonInput('');
        setJsonError('');
      } else {
        if (skippedCount > 0) {
          toast.info(`${t('all')} ${skippedCount} ${t('restaurants')} ${t('alreadyExist')}`);
        }
        if (errorCount > 0) {
          toast.error(t('failedToImportAllRestaurants'));
        }
      }
    } catch (e) {
      setJsonError(`Error: ${e.message}`);
    }
  };

  if (loading) {
    return (
      <div className="restaurants-loading">
        <div>{t('loading')} {t('restaurants')}...</div>
      </div>
    );
  }

  return (
    <div className="restaurants-container">
      <div className="restaurants-header">
        <button className="icon-button back-btn" onClick={() => navigate('/')}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
        </button>
        <div className="restaurants-header-title">
          <div className="restaurants-title-row">
            <h1>{t('restaurants')}</h1>
            <span className="restaurants-count">
              {allRestaurants.length}
              {searchTerm && (
                <span className="search-results-count">
                  {' '}({restaurants.length})
                </span>
              )}
            </span>
          </div>
          <div className="restaurants-header-actions">
            {(userRole === 'admin' || userRole === 'monitor') && (
            <button 
                className="icon-button delete-all-btn" 
              onClick={handleDeleteAll}
                disabled={deletingAll || allRestaurants.length === 0}
            >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
                <span>{t('deleteAll')}</span>
            </button>
          )}
            <button className="icon-button import-btn" onClick={() => setShowJsonImport(true)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              <span>{t('importJson')}</span>
          </button>
            <button className="icon-button add-btn" onClick={handleAddNew}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              <span>{t('addRestaurant')}</span>
          </button>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="search-bar-container">
        <input
          type="text"
          className="search-input"
          placeholder={t('search') + ' ' + t('restaurants') + '...'}
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

      {/* JSON Import Modal */}
      {showJsonImport && (
        <div className="json-import-modal">
          <div className="json-import-content">
            <div className="json-import-header">
              <h2>{t('importRestaurantsFromJson')}</h2>
              <button className="close-button" onClick={() => {
                setShowJsonImport(false);
                setJsonInput('');
                setJsonError('');
              }}>✕</button>
            </div>
            
            <div className="json-import-body">
              <div className="form-group">
                <label>{t('jsonFormat')}</label>
                <select value={jsonFormat} onChange={(e) => setJsonFormat(e.target.value)}>
                  <option value="array">{t('arrayOfObjects')}</option>
                  <option value="object">{t('singleObject')}</option>
                </select>
              </div>

              <div className="form-group">
                <label>{t('jsonText')}</label>
                <textarea
                  value={jsonInput}
                  onChange={(e) => {
                    setJsonInput(e.target.value);
                    setJsonError('');
                  }}
                  placeholder={jsonFormat === 'array' 
                    ? '[\n  {\n    "name": "Restaurant 1",\n    "address": "Address 1",\n    "phone": "+216 12 345 678",\n    "latitude": 37.123,\n    "longitude": 9.456\n  },\n  {\n    "name": "Restaurant 2",\n    "address": "Address 2",\n    "phone": "+216 98 765 432",\n    "latitude": 37.789,\n    "longitude": 9.012\n  }\n]'
                    : '{\n  "name": "Restaurant 1",\n  "address": "Address 1",\n  "phone": "+216 12 345 678",\n  "latitude": 37.123,\n  "longitude": 9.456\n}'
                  }
                  rows={10}
                  style={{ fontFamily: 'monospace', fontSize: '12px' }}
                />
              </div>

              {jsonError && (
                <div className="json-error">
                  {jsonError}
                </div>
              )}

              <div className="json-import-actions">
                <button
                  type="button"
                  className="cancel-button"
                  onClick={() => {
                    setShowJsonImport(false);
                    setJsonInput('');
                    setJsonError('');
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="save-button"
                  onClick={handleJsonImport}
                >
                  {t('importRestaurants')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="restaurants-list">
        {addingNewRestaurant && (
          <div className="restaurant-card new-restaurant-card">
            <div className="restaurant-edit-form">
              <h3 style={{ marginBottom: '15px', color: '#667eea' }}>{t('addRestaurant')}</h3>
              <div className="form-group">
                <label>Name *</label>
                <input
                  type="text"
                  value={newRestaurant.name}
                  onChange={(e) =>
                    setNewRestaurant({ ...newRestaurant, name: e.target.value })
                  }
                  placeholder={t('restaurantName')}
                />
              </div>
              <div className="form-group">
                <label>Address</label>
                <input
                  type="text"
                  value={newRestaurant.address}
                  onChange={(e) =>
                    setNewRestaurant({ ...newRestaurant, address: e.target.value })
                  }
                  placeholder={t('restaurantAddress')}
                />
              </div>
              <div className="form-group">
                <label>Phone</label>
                <input
                  type="tel"
                  value={newRestaurant.phone}
                  onChange={(e) =>
                    setNewRestaurant({ ...newRestaurant, phone: e.target.value })
                  }
                  placeholder="Phone number"
                />
              </div>

              <div className="location-section">
                <div className="location-header">
                  <h3>{t('location')}</h3>
                  <button
                    type="button"
                    className="select-location-button"
                    onClick={() => setShowLocationPicker(true)}
                  >
                    📍 {t('selectLocation')}
                  </button>
                </div>
                {newRestaurant.location && (
                  <div className="location-info">
                    {t('location')}: {newRestaurant.location.latitude.toFixed(6)},{' '}
                    {newRestaurant.location.longitude.toFixed(6)}
                  </div>
                )}
              </div>

              <div className="restaurant-form-actions">
                <button
                  type="button"
                  className="save-button"
                  onClick={handleSaveNew}
                >
                  {t('create')} {t('restaurant')}
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

        {restaurants.length === 0 && !addingNewRestaurant ? (
          <div className="empty-state">
            <p>{searchTerm ? t('noResults') : t('noRestaurantsFound')}</p>
          </div>
        ) : (
          <>
            {restaurants.map((restaurant) => (
            <div key={restaurant.id} className="restaurant-card">
              {editingRestaurant?.id === restaurant.id ? (
                <div className="restaurant-edit-form">
                  <div className="form-group">
                    <label>Name</label>
                    <input
                      type="text"
                      value={editingRestaurant.name}
                      onChange={(e) =>
                        setEditingRestaurant({ ...editingRestaurant, name: e.target.value })
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label>Address</label>
                    <input
                      type="text"
                      value={editingRestaurant.address}
                      onChange={(e) =>
                        setEditingRestaurant({ ...editingRestaurant, address: e.target.value })
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label>Phone</label>
                    <input
                      type="tel"
                      value={editingRestaurant.phone || ''}
                      onChange={(e) =>
                        setEditingRestaurant({ ...editingRestaurant, phone: e.target.value })
                      }
                      placeholder="Phone number"
                    />
                  </div>

                  <div className="location-section">
                    <div className="location-header">
                      <h3>{t('location')}</h3>
                      <button
                        type="button"
                        className="select-location-button"
                        onClick={() => setShowLocationPicker(true)}
                      >
                        📍 {t('selectLocation')}
                      </button>
                    </div>
                    {editingRestaurant.location && (
                      <div className="location-info">
                        {t('location')}: {editingRestaurant.location.latitude.toFixed(6)},{' '}
                        {editingRestaurant.location.longitude.toFixed(6)}
                      </div>
                    )}
                  </div>

                  <div className="restaurant-form-actions">
                    <button
                      type="button"
                      className="save-button"
                      onClick={handleSave}
                    >
                      Save
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
                <div className="restaurant-view">
                  <div className="restaurant-info">
                    <h3>{restaurant.name}</h3>
                    {restaurant.address && (
                    <p className="restaurant-address">{restaurant.address}</p>
                    )}
                    {restaurant.phone && (
                      <p className="restaurant-phone">{restaurant.phone}</p>
                    )}
                    {restaurant.location && (
                      <p className="restaurant-location">
                        {restaurant.location.latitude.toFixed(4)}, {restaurant.location.longitude.toFixed(4)}
                      </p>
                    )}
                  </div>
                  <div className="restaurant-actions">
                    {(userRole === 'admin' || userRole === 'monitor') && (
                    <button
                      type="button"
                        className="action-btn commands-btn"
                        onClick={() => handleViewCommands(restaurant)}
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                          <line x1="16" y1="2" x2="16" y2="6"/>
                          <line x1="8" y1="2" x2="8" y2="6"/>
                          <line x1="3" y1="10" x2="21" y2="10"/>
                        </svg>
                        <span>Commands</span>
                      </button>
                    )}
                    <button
                      type="button"
                      className="action-btn edit-btn"
                      onClick={() => handleEdit(restaurant)}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                      </svg>
                      <span>Edit</span>
                    </button>
                    <button
                      type="button"
                      className="action-btn delete-btn"
                      onClick={() => handleDelete(restaurant.id)}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                      </svg>
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
            ))}
            {displayedCount < allRestaurants.length && !searchTerm && (
              <div className="load-more-container">
                <button className="load-more-button" onClick={loadMore}>
                  Load More ({allRestaurants.length - displayedCount} remaining)
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {showLocationPicker && (
        <MapPicker
          initialLocation={addingNewRestaurant 
            ? newRestaurant?.location 
            : editingRestaurant?.location}
          onLocationSelect={(location) => {
            if (addingNewRestaurant) {
              setNewRestaurant({ ...newRestaurant, location });
            } else {
              handleLocationSelected(location);
            }
            setShowLocationPicker(false);
          }}
          onClose={() => {
            setShowLocationPicker(false);
          }}
          title="Select Restaurant Location"
        />
      )}

      {/* Restaurant Commands Modal */}
      {selectedRestaurant && (
        <div className="commands-modal-overlay" onClick={handleCloseCommands}>
          <div className="commands-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="commands-modal-header">
              <h2>📅 {t('commands')} {t('for')} {selectedRestaurant.name}</h2>
              <button className="close-button" onClick={handleCloseCommands}>✕</button>
            </div>
            <div className="commands-modal-body">
              {loadingCommands ? (
                <div className="commands-loading">{t('loading')} {t('commands')}...</div>
              ) : restaurantCommands.length === 0 ? (
                <div className="commands-empty">{t('noCommandsFound')}</div>
              ) : (
                <div className="commands-calendar-container">
                  {/* Summary and Filters */}
                  <div className="commands-controls">
                    <div className="commands-summary">
                      <p><strong>{t('totalCommands')}:</strong> {totalMissions}</p>
                      {(viewMode === 'range' || selectedDay) && (
                        <>
                          <p className="filtered-info">
                            {viewMode === 'range' 
                              ? `${t('showing')}: ${fromDate} ${t('to')} ${toDate}`
                              : `${t('showing')}: ${formatDate(selectedDay)}`
                            }
                          </p>
                          <p className="total-purchase">
                            <strong>{t('totalPurchase')}:</strong> {totalPurchase.toFixed(2)} TND
                          </p>
                        </>
                      )}
                    </div>
                    
                    {/* Date Range Picker */}
                    <div className="date-range-picker">
                      <div className="date-range-inputs">
                        <div className="date-input-group">
                          <label>{t('fromDate')}:</label>
                          <input
                            type="date"
                            value={fromDate}
                            onChange={(e) => setFromDate(e.target.value)}
                            max={toDate || undefined}
                          />
                        </div>
                        <div className="date-input-group">
                          <label>{t('toDate')}:</label>
                          <input
                            type="date"
                            value={toDate}
                            onChange={(e) => setToDate(e.target.value)}
                            min={fromDate || undefined}
                          />
                        </div>
                        <div className="date-range-actions">
                          <button
                            className="apply-range-button"
                            onClick={handleApplyDateRange}
                            disabled={!fromDate || !toDate}
                          >
                            {t('applyRange')}
                          </button>
                          <button
                            className="clear-filters-button"
                            onClick={handleClearFilters}
                          >
                            {t('clear')}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Calendar Grid */}
                  <div className="calendar-section">
                    <div className="calendar-header">
                      <button className="calendar-nav-button" onClick={handlePrevMonth}>
                        ←
                      </button>
                      <h3 className="calendar-month-title">
                        {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                      </h3>
                      <button className="calendar-nav-button" onClick={handleNextMonth}>
                        →
                      </button>
                    </div>
                    <div className="calendar-grid">
                      <div className="calendar-weekdays">
                        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                          <div key={day} className="calendar-weekday">{day}</div>
                        ))}
                      </div>
                      <div className="calendar-days">
                        {getDaysInMonth(currentMonth).map((day, index) => {
                          if (!day) {
                            return <div key={`empty-${index}`} className="calendar-day empty"></div>;
                          }
                          // Use local date instead of UTC to avoid timezone issues
                          const year = day.getFullYear();
                          const month = String(day.getMonth() + 1).padStart(2, '0');
                          const dayNum = String(day.getDate()).padStart(2, '0');
                          const dateKey = `${year}-${month}-${dayNum}`;
                          
                          // Calculate today's date key in local timezone
                          const today = new Date();
                          const todayYear = today.getFullYear();
                          const todayMonth = String(today.getMonth() + 1).padStart(2, '0');
                          const todayDay = String(today.getDate()).padStart(2, '0');
                          const todayKey = `${todayYear}-${todayMonth}-${todayDay}`;
                          
                          const missionCount = missionsByDay[dateKey] || 0;
                          const isSelected = selectedDay === dateKey;
                          const isToday = dateKey === todayKey;
                          
                          return (
                            <div
                              key={dateKey}
                              className={`calendar-day ${missionCount > 0 ? 'has-missions' : ''} ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''}`}
                              onClick={() => handleDayClick(day)}
                            >
                              <div className="calendar-day-number">{day.getDate()}</div>
                              {missionCount > 0 && (
                                <div className="calendar-day-count">{missionCount}</div>
      )}
    </div>
  );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Missions List */}
                  {(selectedDay || viewMode === 'range') && (
                    <div className="commands-missions-list">
                      {filteredMissions.length === 0 ? (
                        <div className="commands-empty-date">
                          No commands found for the selected {selectedDay ? 'day' : 'date range'}
                        </div>
                      ) : (
                        <div className="commands-by-date">
                          {allDates.map(dateKey => (
                            <div key={dateKey} className="commands-date-group">
                              <div className="commands-date-header">
                                <h3>{formatDate(dateKey)}</h3>
                                <span className="commands-count">{commandsByDate[dateKey].length} command{commandsByDate[dateKey].length !== 1 ? 's' : ''}</span>
                              </div>
                              <div className="commands-list">
                                {commandsByDate[dateKey].map(mission => {
                                  // Filter stores to only show items from the selected restaurant
                                  const matchingStores = mission.stores?.filter(store => {
                                    // Match by restaurant ID (preferred)
                                    if (selectedRestaurant.id && store.restaurantId) {
                                      return store.restaurantId === selectedRestaurant.id;
                                    }
                                    // Fallback to name matching
                                    if (selectedRestaurant.name && store.name) {
                                      return store.name.trim().toLowerCase() === selectedRestaurant.name.trim().toLowerCase();
                                    }
                                    return false;
                                  }) || [];

                                  // Calculate total only from items in matching stores (no delivery fees)
                                  const missionTotal = matchingStores.reduce((storeSum, store) => {
                                    if (store.items && Array.isArray(store.items)) {
                                      return storeSum + store.items.reduce((itemSum, item) => {
                                        return itemSum + (parseFloat(item.price) || 0);
                                      }, 0);
                                    }
                                    return storeSum;
                                  }, 0);

                                  const deliveryGuyName = getDeliveryGuyName(mission.assignedTo);

                                  // Only show mission if it has items from this restaurant
                                  if (matchingStores.length === 0 || missionTotal === 0) {
                                    return null;
                                  }

                                  return (
                                    <div key={mission.id} className="command-item">
                                      <div className="command-time">{formatTime(mission.createdAt)}</div>
                                      <div className="command-details">
                                        {deliveryGuyName && (
                                          <div className="command-delivery-guy">
                                            <strong>Delivery Guy:</strong> {deliveryGuyName}
                                          </div>
                                        )}
                                        <div className="command-amount">
                                          <strong>Total:</strong> {missionTotal.toFixed(2)} TND
                                        </div>
                                        {matchingStores.length > 0 && (
                                          <div className="command-items">
                                            <strong>Items Purchased:</strong>
                                            <ul>
                                              {matchingStores.map((store, idx) => (
                                                <li key={idx}>
                                                  {store.items && store.items.map((item, itemIdx) => (
                                                    <div key={itemIdx} className="command-item-row">
                                                      <span className="item-name">{item.name}</span>
                                                      <span className="item-price">{parseFloat(item.price || 0).toFixed(2)} TND</span>
                                                    </div>
                                                  ))}
                                                </li>
                                              ))}
                                            </ul>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Hint when no day selected */}
                  {!selectedDay && viewMode !== 'range' && (
                    <div className="calendar-hint">
                      <p>Click on any day with missions to view details, or use the date range picker above</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

