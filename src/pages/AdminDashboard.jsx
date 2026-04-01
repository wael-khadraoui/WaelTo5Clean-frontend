import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Map, { Marker, Source, Layer } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { dataService, userService, authService } from '../App';
import { useTranslation } from '../hooks/useTranslation';
import { mapboxConfig } from '../config/mapboxConfig';
import MapboxConfigMissing from '../components/MapboxConfigMissing.jsx';
import { getTrajectoryRoute } from '../utils/mapboxDirections';
import toast from 'react-hot-toast';
import './AdminDashboard.css';

export default function AdminDashboard() {
  const { t } = useTranslation();
  const [missions, setMissions] = useState([]);
  const [filteredMissions, setFilteredMissions] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [deliveryGuys, setDeliveryGuys] = useState([]);
  const [activeDeliveryGuys, setActiveDeliveryGuys] = useState([]);
  const [assigningMissionId, setAssigningMissionId] = useState(null);
  const [viewMode, setViewMode] = useState('missions'); // 'missions', 'map', or 'users'
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [trajectoryRoutes, setTrajectoryRoutes] = useState({});
  const [selectedUserId, setSelectedUserId] = useState('all'); // Filter by user
  const [mapViewState, setMapViewState] = useState({
    latitude: 37.269584420315546,
    longitude: 9.874240390070584,
    zoom: 12,
  });
  const [currentUserRole, setCurrentUserRole] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    // Load current user role to determine access (admin vs monitor)
    const loadCurrentUserRole = async () => {
      const currentUser = authService.getCurrentUser();
      if (!currentUser) return;
      const data = await userService.getUserData(currentUser.uid);
      setCurrentUserRole(data?.role || 'user');
    };

    loadCurrentUserRole();

    loadMissions();
    loadDeliveryGuys();
    
    // Subscribe to real-time updates
    const unsubscribeMissions = dataService.subscribeToAllMissions((updatedMissions) => {
      setMissions(updatedMissions);
    });
    
    // Subscribe to active delivery guys
    const unsubscribeDeliveryGuys = dataService.subscribeToActiveDeliveryGuys((guys) => {
      setActiveDeliveryGuys(guys);
      // Calculate routes for trajectories
      calculateTrajectoryRoutes(guys);
    });
    
    // Get initial active delivery guys
    loadActiveDeliveryGuys();
    
    return () => {
      if (unsubscribeMissions) unsubscribeMissions();
      if (unsubscribeDeliveryGuys) unsubscribeDeliveryGuys();
    };
  }, []);

  // Load users only once we know the current user is an admin
  useEffect(() => {
    if (currentUserRole === 'admin') {
      loadUsers();
    }
  }, [currentUserRole]);

  const loadActiveDeliveryGuys = async () => {
    const guys = await dataService.getActiveDeliveryGuys();
    setActiveDeliveryGuys(guys);
    calculateTrajectoryRoutes(guys);
  };

  const calculateTrajectoryRoutes = async (guys) => {
    const routes = {};
    
    // Calculate routes sequentially to avoid rate limiting and ensure proper street paths
    for (const guy of guys) {
      // Include current location as the starting point of the trajectory
      if (guy.location && guy.trajectory && guy.trajectory.length >= 1) {
        try {
          // Combine current location with trajectory, ensuring current location is first
          const fullTrajectory = [
            {
              latitude: guy.location.latitude,
              longitude: guy.location.longitude,
              timestamp: guy.location.timestamp || new Date().toISOString()
            },
            ...guy.trajectory
          ];
          
          // Calculate route following actual streets between trajectory points
          const route = await getTrajectoryRoute(fullTrajectory, mapboxConfig.accessToken);
          if (route && route.length > 0) {
            routes[guy.id] = route;
          } else {
            // Fallback: show trajectory as straight line if route calculation fails
            const fallbackRoute = fullTrajectory.map(pt => [pt.longitude, pt.latitude]);
            routes[guy.id] = fallbackRoute;
          }
        } catch (error) {
          // Fallback: show trajectory as straight line
          if (guy.location && guy.trajectory) {
            const fallbackRoute = [
              [guy.location.longitude, guy.location.latitude],
              ...guy.trajectory.map(pt => [pt.longitude, pt.latitude])
            ];
            routes[guy.id] = fallbackRoute;
          }
        }
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      } else if (guy.location && (!guy.trajectory || guy.trajectory.length === 0)) {
        // If no trajectory yet, just show current location as a single point
        routes[guy.id] = [[guy.location.longitude, guy.location.latitude]];
      }
    }
    
    setTrajectoryRoutes(routes);
  };

  const loadDeliveryGuys = async () => {
    const guys = await userService.getDeliveryGuys();
    setDeliveryGuys(guys);
  };

  const loadUsers = async () => {
    // Guard: only load if we know current user is admin
    if (currentUserRole !== 'admin') return;
    setLoadingUsers(true);
    const allUsers = await userService.getAllUsers();
    setUsers(allUsers);
    setLoadingUsers(false);
  };

  useEffect(() => {
    filterMissions();
  }, [missions, statusFilter, selectedUserId]);

  const loadMissions = async () => {
    setLoading(true);
    const allMissions = await dataService.getAllMissions();
    setMissions(allMissions);
    setLoading(false);
  };

  const filterMissions = () => {
    let filtered = missions;
    
    // Filter by status
    if (statusFilter === 'all') {
      filtered = missions;
    } else if (statusFilter === 'untaken') {
      filtered = missions.filter(m => !m.assignedTo || m.assignedTo === null);
    } else {
      filtered = missions.filter(m => m.status === statusFilter);
    }
    
    // Filter by user
    if (selectedUserId !== 'all') {
      filtered = filtered.filter(m => m.assignedTo === selectedUserId);
    }
    
    setFilteredMissions(filtered);
  };

  const assignMission = async (missionId, deliveryGuyId) => {
    if (!deliveryGuyId) {
      toast.error(t('selectDeliveryGuyToAssign'));
      return;
    }

    setAssigningMissionId(missionId);
    const result = await dataService.assignMission(missionId, deliveryGuyId);
    setAssigningMissionId(null);
    
    if (result.success) {
      toast.success(t('missionAssigned'));
    } else {
      toast.error(result.error || t('failedToAssign'));
    }
  };

  const getDeliveryGuyName = (userId) => {
    const guy = deliveryGuys.find(g => g.id === userId);
    if (!guy) {
      return t('unknown');
    }
    return guy.name || guy.email || 'Unknown';
  };

  const deleteMission = async (missionId) => {
    if (!window.confirm(t('confirmDeleteMission'))) {
      return;
    }

    const result = await dataService.deleteMission(missionId);
    if (result.success) {
      toast.success(t('missionDeleted'));
      setMissions((prev) => prev.filter((m) => m.id !== missionId));
    } else {
      toast.error(result.error || t('failedToDelete'));
    }
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

  useEffect(() => {
    if (viewMode === 'map') {
      if (activeDeliveryGuys.length > 0) {
        const locations = activeDeliveryGuys
          .filter(guy => guy.location)
          .map(guy => [guy.location.longitude, guy.location.latitude]);
        
        if (locations.length > 0) {
          const avgLng = locations.reduce((sum, [lng]) => sum + lng, 0) / locations.length;
          const avgLat = locations.reduce((sum, [, lat]) => sum + lat, 0) / locations.length;
          
          setMapViewState(prev => ({
            ...prev,
            latitude: avgLat,
            longitude: avgLng,
            zoom: locations.length === 1 ? 15 : 12,
          }));
        }
      } else {
        // If no active delivery guys, try to center on active missions
        const activeMissions = missions.filter(m => 
          m.status === 'in_progress' && 
          (m.pickupLocation || m.deliveryLocation)
        );
        
        if (activeMissions.length > 0) {
          const missionLocations = [];
          activeMissions.forEach(mission => {
            if (mission.pickupLocation) {
              missionLocations.push([mission.pickupLocation.longitude, mission.pickupLocation.latitude]);
            }
            if (mission.deliveryLocation) {
              missionLocations.push([mission.deliveryLocation.longitude, mission.deliveryLocation.latitude]);
            }
          });
          
          if (missionLocations.length > 0) {
            const avgLng = missionLocations.reduce((sum, [lng]) => sum + lng, 0) / missionLocations.length;
            const avgLat = missionLocations.reduce((sum, [, lat]) => sum + lat, 0) / missionLocations.length;
            
            setMapViewState(prev => ({
              ...prev,
              latitude: avgLat,
              longitude: avgLng,
              zoom: 12,
            }));
          }
        }
      }
    }
  }, [activeDeliveryGuys, viewMode, missions]);

  const stats = {
    total: missions.length,
    untaken: missions.filter(m => !m.assignedTo || m.assignedTo === null).length,
    inProgress: missions.filter(m => m.status === 'in_progress').length,
    completed: missions.filter(m => m.status === 'completed').length,
  };

  if (loading) {
    return (
      <div className="admin-loading">
        <div>{t('loading')} {t('missions')}...</div>
      </div>
    );
  }

  return (
    <div className="admin-dashboard">
      <header className="admin-header">
        <div className="admin-header-left">
          <button className="back-button" onClick={() => navigate('/')} title="Go back">
            ← {t('back')}
          </button>
          <h1>{t('adminDashboard')}</h1>
        </div>
        <div className="admin-actions">
          <div className="view-toggle">
            <button
              className={`toggle-button ${viewMode === 'missions' ? 'active' : ''}`}
              onClick={() => setViewMode('missions')}
            >
              📋 {t('missions')}
            </button>
            <button
              className={`toggle-button ${viewMode === 'map' ? 'active' : ''}`}
              onClick={() => setViewMode('map')}
            >
              🗺️ {t('map')}
            </button>
            {currentUserRole === 'admin' && (
              <>
                <button
                  className={`toggle-button ${viewMode === 'users' ? 'active' : ''}`}
                  onClick={() => setViewMode('users')}
                >
                  👤 {t('users')}
                </button>
                <button
                  className="toggle-button"
                  onClick={() => navigate('/clients')}
                >
                  👥 {t('clients')}
                </button>
                <button
                  className="toggle-button"
                  onClick={() => navigate('/restaurants')}
                >
                  🍽️ {t('restaurants')}
                </button>
                <button
                  className="create-button"
                  onClick={() => navigate('/delivery-fees')}
                >
                  💰 {t('deliveryFeeRules')}
                </button>
              </>
            )}
          </div>
          <button className="create-button" onClick={() => navigate('/create-mission')}>
            ➕ {t('createMission')}
          </button>
          <button
            className="refresh-button"
            onClick={
              viewMode === 'missions'
                ? loadMissions
                : viewMode === 'map'
                ? loadActiveDeliveryGuys
                : loadUsers
            }
          >
            🔄 {t('refresh')}
          </button>
        </div>
      </header>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-number">{stats.total}</div>
          <div className="stat-label">{t('totalMissions')}</div>
        </div>
        <div className="stat-card untaken">
          <div className="stat-number">{stats.untaken}</div>
          <div className="stat-label">{t('untaken')}</div>
        </div>
        <div className="stat-card in-progress">
          <div className="stat-number">{stats.inProgress}</div>
          <div className="stat-label">{t('inProgress')}</div>
        </div>
        <div className="stat-card completed">
          <div className="stat-number">{stats.completed}</div>
          <div className="stat-label">{t('completed')}</div>
        </div>
      </div>

      {viewMode === 'missions' && (
        <>
          <div className="admin-filters">
            <div className="filter-buttons">
              <button
                className={`filter-button ${statusFilter === 'all' ? 'active' : ''}`}
                onClick={() => setStatusFilter('all')}
              >
                {t('all')}
              </button>
              <button
                className={`filter-button ${statusFilter === 'untaken' ? 'active' : ''}`}
                onClick={() => setStatusFilter('untaken')}
              >
                {t('untaken')}
              </button>
              <button
                className={`filter-button ${statusFilter === 'pending' ? 'active' : ''}`}
                onClick={() => setStatusFilter('pending')}
              >
                {t('pending')}
              </button>
              <button
                className={`filter-button ${statusFilter === 'assigned' ? 'active' : ''}`}
                onClick={() => setStatusFilter('assigned')}
              >
                {t('assigned')}
              </button>
              <button
                className={`filter-button ${statusFilter === 'in_progress' ? 'active' : ''}`}
                onClick={() => setStatusFilter('in_progress')}
              >
                {t('inProgress')}
              </button>
              <button
                className={`filter-button ${statusFilter === 'completed' ? 'active' : ''}`}
                onClick={() => setStatusFilter('completed')}
              >
                {t('completed')}
              </button>
            </div>
            <div className="user-filter">
              <label htmlFor="user-select">{t('filterByUser')}:</label>
              <select
                id="user-select"
                className="user-select"
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
              >
                <option value="all">{t('all')} {t('users')}</option>
                {deliveryGuys.map(guy => (
                  <option key={guy.id} value={guy.id}>
                    {guy.name || guy.email || guy.id}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="missions-table-container">
        {filteredMissions.length === 0 ? (
          <div className="empty-state">
            <p>{t('noMissionsFound')}</p>
          </div>
        ) : (
          (() => {
            const missionsByUser = {};
            filteredMissions.forEach(mission => {
              const userId = mission.assignedTo || 'unassigned';
              if (!missionsByUser[userId]) {
                missionsByUser[userId] = [];
              }
              missionsByUser[userId].push(mission);
            });

            const sortedUserIds = Object.keys(missionsByUser).sort((a, b) => {
              if (a === 'unassigned') return 1;
              if (b === 'unassigned') return -1;
              const nameA = getDeliveryGuyName(a);
              const nameB = getDeliveryGuyName(b);
              return nameA.localeCompare(nameB);
            });

            return sortedUserIds.map(userId => {
              const userMissions = missionsByUser[userId];
              const userName = userId === 'unassigned' ? t('unassigned') : getDeliveryGuyName(userId);
              
              return (
                <div key={userId} className="user-missions-group">
                  <h3 className="user-missions-header">
                    {userName} ({userMissions.length} {userMissions.length === 1 ? t('mission') : t('missions')})
                  </h3>
                  <table className="missions-table missions-table--missions">
                    <thead>
                      <tr>
                        <th>{t('missionId')}</th>
                        <th>{t('client')}</th>
                        <th>{t('status')}</th>
                        <th>{t('timeline')}</th>
                        <th>{t('locations')}</th>
                        <th>{t('created')}</th>
                        <th>{t('actions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {userMissions.map((mission) => (
                        <tr key={mission.id}>
                          <td>#{mission.id.slice(0, 8)}</td>
                          <td>
                            <div>
                              <strong>{mission.clientName || t('nA')}</strong>
                              <br />
                              <small>{mission.clientPhone || t('nA')}</small>
                            </div>
                          </td>
                          <td>
                            <span
                              className="status-badge"
                              style={{ backgroundColor: getStatusColor(mission.status) }}
                            >
                              {mission.status?.toUpperCase() || 'UNKNOWN'}
                            </span>
                          </td>
                          <td>
                            <div className="timeline-info">
                              {mission.startedAt && (
                                <div className="timeline-item">
                                  <strong>{t('started')}:</strong> {new Date(mission.startedAt).toLocaleString()}
                                </div>
                              )}
                              {mission.pickupReachedAt && (
                                <div className="timeline-item">
                                  <strong>{t('reachedPickup')}:</strong> {new Date(mission.pickupReachedAt).toLocaleString()}
                                </div>
                              )}
                              {mission.completedAt && (
                                <div className="timeline-item">
                                  <strong>{t('completed')}:</strong> {new Date(mission.completedAt).toLocaleString()}
                                </div>
                              )}
                            </div>
                          </td>
                          <td>
                            <div className="location-info">
                              {mission.startedLocation && (
                                <div className="location-item">
                                  <strong>{t('start')}:</strong> {mission.startedLocation.latitude.toFixed(4)}, {mission.startedLocation.longitude.toFixed(4)}
                                </div>
                              )}
                              {mission.pickupReachedLocation && (
                                <div className="location-item">
                                  <strong>{t('pickup')}:</strong> {mission.pickupReachedLocation.latitude.toFixed(4)}, {mission.pickupReachedLocation.longitude.toFixed(4)}
                                </div>
                              )}
                              {mission.completedLocation && (
                                <div className="location-item">
                                  <strong>{t('complete')}:</strong> {mission.completedLocation.latitude.toFixed(4)}, {mission.completedLocation.longitude.toFixed(4)}
                                </div>
                              )}
                            </div>
                          </td>
                          <td>
                            {mission.createdAt
                              ? new Date(mission.createdAt).toLocaleDateString()
                              : t('nA')}
                          </td>
                          <td>
                            <div className="action-buttons">
                              <button
                                className="view-button"
                                onClick={() => navigate(`/mission/${mission.id}`)}
                              >
                                {t('view')}
                              </button>
                              {(!mission.assignedTo || mission.assignedTo === null) && (
                                <select
                                  className="assign-select"
                                  value=""
                                  onChange={(e) => {
                                    if (e.target.value) {
                                      assignMission(mission.id, e.target.value);
                                    }
                                  }}
                                  disabled={assigningMissionId === mission.id}
                                >
                                  <option value="">{t('assignTo')}...</option>
                                  {deliveryGuys.map(guy => (
                                    <option key={guy.id} value={guy.id}>
                                      {guy.name} ({guy.email})
                                    </option>
                                  ))}
                                </select>
                              )}
                              <button
                                type="button"
                                className="view-button"
                                style={{ marginLeft: 8, color: '#c00' }}
                                onClick={() => deleteMission(mission.id)}
                              >
                                {t('delete')}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            });
          })()
        )}
      </div>
        </>
      )}

      {viewMode === 'map' && (
        <div className="admin-map-container">
          <div className="map-info">
            <p>{t('activeDeliveryGuys')}: {activeDeliveryGuys.length}</p>
          </div>
          {!mapboxConfig.isConfigured ? (
            <MapboxConfigMissing />
          ) : (
          <Map
            {...mapViewState}
            onMove={evt => setMapViewState(evt.viewState)}
            mapboxAccessToken={mapboxConfig.accessToken}
            style={{ width: '100%', height: '600px', borderRadius: '12px' }}
            mapStyle={mapboxConfig.styleURL}
          >
            {/* Delivery guys markers */}
            {activeDeliveryGuys.map((guy) => {
              if (!guy.location) return null;
              
              return (
                <React.Fragment key={guy.id}>
                  <Marker
                    longitude={guy.location.longitude}
                    latitude={guy.location.latitude}
                    anchor="bottom"
                  >
                    <div className="delivery-guy-marker" title={guy.name}>
                      <div className="marker-pin delivery-pin">🚴</div>
                    </div>
                  </Marker>
                  
                  {/* Trajectory route */}
                  {trajectoryRoutes[guy.id] && (
                    <Source
                      id={`trajectory-${guy.id}`}
                      type="geojson"
                      data={{
                        type: 'Feature',
                        geometry: {
                          type: 'LineString',
                          coordinates: trajectoryRoutes[guy.id],
                        },
                      }}
                    >
                      <Layer
                        id={`trajectory-layer-${guy.id}`}
                        type="line"
                        layout={{
                          'line-join': 'round',
                          'line-cap': 'round',
                        }}
                        paint={{
                          'line-color': '#667eea',
                          'line-width': 3,
                          'line-opacity': 0.6,
                        }}
                      />
                    </Source>
                  )}
                </React.Fragment>
              );
            })}
            
            {/* Mission markers */}
            {missions
              .filter(m => m.status === 'in_progress' && m.pickupLocation && m.deliveryLocation)
              .map((mission) => (
                <React.Fragment key={mission.id}>
                  {mission.pickupLocation && (
                    <Marker
                      longitude={mission.pickupLocation.longitude}
                      latitude={mission.pickupLocation.latitude}
                      anchor="bottom"
                    >
                      <div className="mission-marker pickup" title={t('pickup')}>
                        <div className="marker-pin green">📍</div>
                      </div>
                    </Marker>
                  )}
                  {mission.deliveryLocation && (
                    <Marker
                      longitude={mission.deliveryLocation.longitude}
                      latitude={mission.deliveryLocation.latitude}
                      anchor="bottom"
                    >
                      <div className="mission-marker delivery" title={t('delivery')}>
                        <div className="marker-pin red">📍</div>
                      </div>
                    </Marker>
                  )}
                </React.Fragment>
              ))}
          </Map>
          )}
        </div>
      )}

      {viewMode === 'users' && (
        <div className="missions-table-container">
          {loadingUsers ? (
            <div className="empty-state">
              <p>{t('loading')} {t('users')}...</p>
            </div>
          ) : users.length === 0 ? (
            <div className="empty-state">
              <p>{t('noUsersFound')}</p>
            </div>
          ) : (
            <table className="missions-table missions-table--users">
              <thead>
                <tr>
                  <th>{t('name')}</th>
                  <th>{t('email')}</th>
                  <th>{t('role')}</th>
                  <th>{t('joined')}</th>
                  <th>{t('changeRole')}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.name || '—'}</td>
                    <td>{u.email || '—'}</td>
                    <td>{u.role || 'user'}</td>
                    <td>
                      {u.dateOfJoining
                        ? new Date(u.dateOfJoining).toLocaleDateString()
                        : '—'}
                    </td>
                    <td>
                      <select
                        value={u.role || 'user'}
                        onChange={async (e) => {
                          const newRole = e.target.value;
                          if (newRole === u.role) return;
                          const result = await userService.updateUserRole(
                            u.id,
                            newRole
                          );
                          if (result.success) {
                            toast.success(t('roleUpdated'));
                            setUsers((prev) =>
                              prev.map((user) =>
                                user.id === u.id
                                  ? { ...user, role: newRole }
                                  : user
                              )
                            );
                          } else {
                            toast.error(result.error || t('failedToUpdateRole'));
                          }
                        }}
                      >
                        <option value="user">user (pending)</option>
                        <option value="delivery_guy">delivery_guy</option>
                        <option value="monitor">monitor</option>
                        <option value="admin">admin</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

