import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authService, dataService, userService } from '../App';
import { useLocationTracking } from '../hooks/useLocationTracking';
import toast from 'react-hot-toast';
import { useTranslation } from '../hooks/useTranslation';
import './HomePage.css';

export default function HomePage() {
  const { t } = useTranslation();
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [userDataLoading, setUserDataLoading] = useState(true);
  const [missions, setMissions] = useState([]);
  const [newMissionsCount, setNewMissionsCount] = useState(0);
  const [currentMissionsCount, setCurrentMissionsCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  // Load view mode from localStorage, default to 'admin'
  const [viewMode, setViewMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('homeViewMode');
      return saved || 'admin';
    }
    return 'admin';
  });
  const navigate = useNavigate();

  // Calculate role flags early for use in hooks
  const isAdmin = userData?.role === 'admin';
  const isMonitor = userData?.role === 'monitor';
  const canSwitchMode = isAdmin || isMonitor;

  // Start location tracking when user is logged in (only for delivery guys, or admin/monitor in delivery mode)
  const isTracking = useLocationTracking(
    user && userData && (userData.role === 'delivery_guy' || (canSwitchMode && viewMode === 'delivery'))
  );

  useEffect(() => {
    const currentUser = authService.getCurrentUser();
    setUser(currentUser);

    if (currentUser) {
      loadUserData();
    }
  }, []);

  useEffect(() => {
    if (userData) {
      const currentUser = authService.getCurrentUser();
      if (!currentUser) return;
      
      // Load missions first
      loadMissions();
      
      // Subscribe to real-time updates
      if (userData.role !== 'admin' && userData.role !== 'monitor') {
        // Delivery guys: subscribe to their missions
        const unsubscribe = dataService.subscribeToMissions(
          currentUser.uid,
          (updatedMissions) => {
            setMissions(updatedMissions);
            
            // Calculate new missions (unassigned)
            const newCount = updatedMissions.filter(
              (m) => !m.assignedTo || m.assignedTo === null
            ).filter(
              (m) => m.status !== 'completed' && m.status !== 'cancelled'
            ).length;
            setNewMissionsCount(newCount);
            
            // Calculate current missions (assigned to user, not finished)
            const currentCount = updatedMissions.filter(
              (m) => m.assignedTo === currentUser.uid &&
              ['pending', 'assigned', 'in_progress'].includes(m.status)
            ).length;
            setCurrentMissionsCount(currentCount);
          }
        );
        return unsubscribe;
      } else {
        // Admin/monitor: subscribe to all missions
        const unsubscribe = dataService.subscribeToAllMissions((updatedMissions) => {
          setMissions(updatedMissions);
          // Calculate delivery guy stats if in delivery mode
          if (viewMode === 'delivery') {
            const newCount = updatedMissions.filter(
              (m) => !m.assignedTo || m.assignedTo === null
            ).filter(
              (m) => m.status !== 'completed' && m.status !== 'cancelled'
            ).length;
            setNewMissionsCount(newCount);
            
            const currentCount = updatedMissions.filter(
              (m) => m.assignedTo === currentUser.uid &&
              ['pending', 'assigned', 'in_progress'].includes(m.status)
            ).length;
            setCurrentMissionsCount(currentCount);
          }
        });
        return unsubscribe;
      }
    }
  }, [userData, viewMode]);

  const loadUserData = async () => {
    const currentUser = authService.getCurrentUser();
    if (!currentUser) {
      setUserDataLoading(false);
      return;
    }

    setUserDataLoading(true);
    const data = await userService.getUserData(currentUser.uid);
    setUserData(data);
    setUserDataLoading(false);
  };

  const loadMissions = async () => {
    const currentUser = authService.getCurrentUser();
    if (!currentUser) return;

    try {
      // If admin/monitor, load all missions, otherwise load assigned missions
      if (userData?.role === 'admin' || userData?.role === 'monitor') {
        const allMissions = await dataService.getAllMissions();
        setMissions(allMissions);
        
        // If in delivery mode, calculate delivery guy stats
        if (viewMode === 'delivery') {
          const newCount = allMissions.filter(
            (m) => !m.assignedTo || m.assignedTo === null
          ).filter(
            (m) => m.status !== 'completed' && m.status !== 'cancelled'
          ).length;
          setNewMissionsCount(newCount);
          
          const currentCount = allMissions.filter(
            (m) => m.assignedTo === currentUser.uid &&
            ['pending', 'assigned', 'in_progress'].includes(m.status)
          ).length;
          setCurrentMissionsCount(currentCount);
        }
      } else {
        const userMissions = await dataService.getMissions(currentUser.uid);
        setMissions(userMissions);
        
        // Calculate new missions (unassigned)
        const newCount = userMissions.filter(
          (m) => !m.assignedTo || m.assignedTo === null
        ).filter(
          (m) => m.status !== 'completed' && m.status !== 'cancelled'
        ).length;
        setNewMissionsCount(newCount);
        
        // Calculate current missions (assigned to user, not finished)
        const currentCount = userMissions.filter(
          (m) => m.assignedTo === currentUser.uid &&
          ['pending', 'assigned', 'in_progress'].includes(m.status)
        ).length;
        setCurrentMissionsCount(currentCount);
      }
    } catch (error) {
      toast.error(t('failedToLoadMissions'));
    }
  };

  const handleLogout = async () => {
    if (window.confirm(t('areYouSureLogout'))) {
      await authService.signOut();
      toast.success(t('loggedOut'));
    }
  };

  const displayName = userData?.name || user?.email || '';
  const isDeliveryGuy = userData?.role === 'delivery_guy';
  const showDeliveryView = isDeliveryGuy || (canSwitchMode && viewMode === 'delivery');

  // Calculate stats for admin/monitor
  const totalMissions = missions.length;
  const untakenMissions = missions.filter(m => !m.assignedTo || m.assignedTo === null).length;
  const inProgressMissions = missions.filter(m => m.status === 'in_progress').length;
  const completedMissions = missions.filter(m => m.status === 'completed').length;

  // Show loading state while userData is being fetched
  if (userDataLoading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        fontSize: '18px',
        color: '#666'
      }}>
        {t('loading')}
      </div>
    );
  }

  // Determine dashboard subtitle based on role and view mode
  const getDashboardSubtitle = () => {
    if (canSwitchMode && viewMode === 'delivery') {
      return t('deliveryMode');
    }
    if (isAdmin) return t('adminDashboard');
    if (isMonitor) return t('monitorDashboard');
    return t('deliveryDashboard');
  };

    return (
      <div className="home-container delivery-guy-dashboard">
        <header className="dashboard-header">
          <div className="dashboard-header-content">
            <div>
              <h1 className="dashboard-title">
                {t('welcomeBack')}{displayName ? `, ${displayName}` : '!'}
              </h1>
            <p className="dashboard-subtitle">{getDashboardSubtitle()}</p>
          </div>
          <div className="header-actions">
            {/* Mode Toggle for Admin/Monitor */}
            {canSwitchMode && (
              <div className="mode-toggle">
                <button
                  type="button"
                  className={`mode-toggle-button ${viewMode === 'admin' ? 'active' : ''}`}
                  onClick={() => {
                    setViewMode('admin');
                    localStorage.setItem('homeViewMode', 'admin');
                  }}
                  title={t('adminMode')}
                >
                  <span className="mode-icon">🛡️</span>
                </button>
                <button
                  type="button"
                  className={`mode-toggle-button ${viewMode === 'delivery' ? 'active' : ''}`}
                  onClick={() => {
                    setViewMode('delivery');
                    localStorage.setItem('homeViewMode', 'delivery');
                  }}
                  title={t('deliveryMode')}
                >
                  <span className="mode-icon">🚴</span>
                </button>
            </div>
            )}
            <div className="user-menu">
              <button
                type="button"
                className="user-menu-button"
                onClick={() => setMenuOpen((prev) => !prev)}
              >
                <span className="user-menu-name">
                  {displayName || 'Account'}
                </span>
                <span className="user-menu-chevron">▾</span>
              </button>
              {menuOpen && (
                <div className="user-menu-dropdown">
                  <button
                    type="button"
                    className="user-menu-item"
                    onClick={() => {
                      setMenuOpen(false);
                      navigate('/profile');
                    }}
                  >
                    ✏️ {t('editProfile')}
                  </button>
                  <button
                    type="button"
                    className="user-menu-item user-menu-logout"
                    onClick={() => {
                      setMenuOpen(false);
                      handleLogout();
                    }}
                  >
                    {t('logout')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        </header>

        <div className="dashboard-grid">
        {/* Delivery Guy Cards */}
        {showDeliveryView && (
          <>
          <div 
            className="dashboard-card primary-card"
            onClick={() => navigate('/missions', { state: { initialTab: 'current' } })}
          >
            <div className="card-icon">🚴</div>
            <div className="card-content">
              <div className="card-number">{currentMissionsCount}</div>
              <div className="card-label">{currentMissionsCount !== 1 ? t('currentMissions') : t('currentMission')}</div>
              <div className="card-description">{t('activeDeliveriesInProgress')}</div>
            </div>
            <div className="card-arrow">→</div>
          </div>

          <div 
            className="dashboard-card new-missions-card"
            onClick={() => navigate('/missions', { state: { initialTab: 'new' } })}
          >
            <div className="card-icon">📦</div>
            <div className="card-content">
              <div className="card-number">{newMissionsCount}</div>
              <div className="card-label">{newMissionsCount !== 1 ? t('newMissions') : t('newMission')}</div>
              <div className="card-description">{t('availableToPickUp')}</div>
            </div>
            {newMissionsCount > 0 && <div className="card-badge">{newMissionsCount}</div>}
            <div className="card-arrow">→</div>
          </div>
          </>
        )}

        {/* Admin/Monitor Cards */}
        {canSwitchMode && viewMode === 'admin' && (
          <>
            <div 
              className="dashboard-card admin-card"
              onClick={() => navigate('/create-mission')}
            >
              <div className="card-icon">➕</div>
              <div className="card-content">
                <div className="card-label">{t('createMission')}</div>
                <div className="card-description">{t('addNewDeliveryMission')}</div>
              </div>
              <div className="card-arrow">→</div>
            </div>
          </>
        )}

        {/* Common Cards for All Roles */}
          <div 
            className="dashboard-card map-card"
            onClick={() => navigate('/map')}
          >
            <div className="card-icon">🗺️</div>
            <div className="card-content">
              <div className="card-label">{t('liveMap')}</div>
              <div className="card-description">{t('viewAllMissionsOnMap')}</div>
            </div>
            <div className="card-arrow">→</div>
          </div>

        {/* Admin/Monitor Specific Cards */}
        {canSwitchMode && viewMode === 'admin' && (
          <>
            <div 
              className="dashboard-card admin-card"
              onClick={() => navigate('/monitor-missions')}
            >
              <div className="card-icon">📊</div>
              <div className="card-content">
                <div className="card-label">{t('missionMonitoring')}</div>
                <div className="card-description">{t('monitorAllMissions')}</div>
              </div>
              <div className="card-arrow">→</div>
            </div>

                <div 
                  className="dashboard-card admin-card"
                  onClick={() => navigate('/clients')}
                >
                  <div className="card-icon">👥</div>
                  <div className="card-content">
                    <div className="card-label">{t('clients')}</div>
                    <div className="card-description">{t('manageClientDatabase')}</div>
                  </div>
                  <div className="card-arrow">→</div>
                </div>

                <div 
                  className="dashboard-card admin-card"
                  onClick={() => navigate('/restaurants')}
                >
                  <div className="card-icon">🍽️</div>
                  <div className="card-content">
                    <div className="card-label">{t('restaurants')}</div>
                    <div className="card-description">{t('manageRestaurantDatabase')}</div>
                  </div>
                  <div className="card-arrow">→</div>
                </div>

            {isAdmin && (
              <>
                <div 
                  className="dashboard-card system-params-card"
                  onClick={() => navigate('/delivery-fees')}
                >
                  <div className="card-icon">⚙️</div>
                  <div className="card-content">
                    <div className="card-label">{t('systemParameters')}</div>
                    <div className="card-description">{t('configurePricingSettings')}</div>
                  </div>
                  <div className="card-arrow">→</div>
                </div>

                <div 
                  className="dashboard-card admin-card"
                  onClick={() => navigate('/users')}
                >
                  <div className="card-icon">👤</div>
                  <div className="card-content">
                    <div className="card-label">{t('users')}</div>
                    <div className="card-description">{t('manageUsersRoles')}</div>
                  </div>
                  <div className="card-arrow">→</div>
                </div>
              </>
            )}
          </>
        )}

        {/* Profile Card for All Roles */}
          <div 
            className="dashboard-card profile-card"
            onClick={() => navigate('/profile')}
          >
            <div className="card-icon">👤</div>
            <div className="card-content">
              <div className="card-label">{t('profile')}</div>
              <div className="card-description">{t('editYourInformation')}</div>
            </div>
            <div className="card-arrow">→</div>
          </div>
      </div>
    </div>
  );
}

