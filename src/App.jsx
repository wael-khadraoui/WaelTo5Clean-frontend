import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { LanguageProvider } from './contexts/LanguageContext';

import { authService } from './services/authService';
import { DataService } from './services/dataService';
import { UserService } from './services/userService';
import LocationPermissionPrompt from './components/LocationPermissionPrompt';
import NotificationPermissionPrompt from './components/NotificationPermissionPrompt';
import { notificationService } from './services/notificationService';

import LoginPage from './pages/LoginPage';
import SignUpPage from './pages/SignUpPage';
import HomePage from './pages/HomePage';
import MapPage from './pages/MapPage';
import MissionsPage from './pages/MissionsPage';
import MissionDetailPage from './pages/MissionDetailPage';
import CreateMissionPage from './pages/CreateMissionPage';
import ProfilePage from './pages/ProfilePage';
import ClientsPage from './pages/ClientsPage';
import RestaurantsPage from './pages/RestaurantsPage';
import DeliveryFeesPage from './pages/DeliveryFeesPage';
import UsersPage from './pages/UsersPage';
import MissionMonitoringPage from './pages/MissionMonitoringPage';

const dataService = new DataService();
const userService = new UserService();

export { authService, dataService, userService };

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState(null);
  const [userDataLoading, setUserDataLoading] = useState(true);
  const [, setLocationPermissionGranted] = useState(false);
  const [showLocationPrompt, setShowLocationPrompt] = useState(false);
  const [showNotificationPrompt, setShowNotificationPrompt] = useState(false);

  const requestLocationImmediately = () => {
    if (!navigator.geolocation) {
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocationPermissionGranted(true);
        setShowLocationPrompt(false);

        const currentUser = authService.getCurrentUser();
        if (currentUser) {
          dataService.updateLocation(currentUser.uid, {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        }
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          setShowLocationPrompt(true);
        } else {
          setShowLocationPrompt(true);
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  };

  useEffect(() => {
    const unsubscribe = authService.onAuthStateChanged(async (authUser) => {
      setUser(authUser);
      setLoading(false);

      if (authUser) {
        setUserDataLoading(true);
        const data = await userService.getUserData(authUser.uid);
        setUserData(data);
        setUserDataLoading(false);

        requestLocationImmediately();

        const userRole = data?.role || 'user';
        if (userRole === 'admin' || userRole === 'delivery_guy' || userRole === 'monitor') {
          notificationService.startListeningForNewMissions(authUser.uid, userRole);
          if (typeof window !== 'undefined' && 'Notification' in window) {
            if (Notification.permission === 'default') {
              setShowNotificationPrompt(true);
            } else {
              setShowNotificationPrompt(false);
            }
          }
        } else {
          setShowNotificationPrompt(false);
        }
      } else {
        setUserData(null);
        setUserDataLoading(false);
        notificationService.stopListening();
        setShowNotificationPrompt(false);
      }
    });

    requestLocationImmediately();

    return () => {
      unsubscribe();
      notificationService.cleanup();
    };
  }, []);

  useEffect(() => {
    if (navigator.permissions) {
      navigator.permissions.query({ name: 'geolocation' }).then((permission) => {
        const handleChange = () => {
          if (permission.state === 'granted') {
            setLocationPermissionGranted(true);
            setShowLocationPrompt(false);
            requestLocationImmediately();
          } else if (permission.state === 'denied') {
            setShowLocationPrompt(true);
          }
        };

        permission.addEventListener('change', handleChange);
        return () => permission.removeEventListener('change', handleChange);
      });
    }
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div>Loading...</div>
      </div>
    );
  }

  const isApproved =
    user &&
    !userDataLoading &&
    userData &&
    (userData.role === 'admin' || userData.role === 'delivery_guy' || userData.role === 'monitor');

  if (user && !loading && !userDataLoading && !isApproved) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          textAlign: 'center',
          padding: '0 16px',
        }}
      >
        <h1>Account Pending Approval</h1>
        <p style={{ maxWidth: 480, marginTop: 12 }}>
          Your account has been created but does not have an active role yet. An administrator must
          assign you a role (for example, delivery guy or admin) before you can access the
          application.
        </p>
        <button
          style={{
            marginTop: 24,
            padding: '10px 20px',
            borderRadius: 8,
            border: 'none',
            backgroundColor: '#007AFF',
            color: '#fff',
            fontSize: 16,
            cursor: 'pointer',
          }}
          type="button"
          onClick={async () => {
            await authService.signOut();
          }}
        >
          Sign Out
        </button>
      </div>
    );
  }

  return (
    <LanguageProvider>
      <Router>
        <Toaster position="top-right" />
        {showLocationPrompt && user && (
          <LocationPermissionPrompt onDismiss={() => setShowLocationPrompt(false)} />
        )}
        {showNotificationPrompt && user && !userDataLoading && (
          <NotificationPermissionPrompt
            onAllow={async () => {
              const result = await notificationService.requestPermission();
              if (result.success) {
                const latestUserData = await userService.getUserData(user.uid);
                const userRole = latestUserData?.role || 'user';
                if (userRole === 'admin' || userRole === 'delivery_guy' || userRole === 'monitor') {
                  notificationService.startListeningForNewMissions(user.uid, userRole);
                }
                setShowNotificationPrompt(false);
              }
            }}
            onDismiss={() => setShowNotificationPrompt(false)}
          />
        )}
        <Routes>
          <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
          <Route path="/signup" element={user ? <Navigate to="/" replace /> : <SignUpPage />} />
          <Route path="/" element={user ? <HomePage /> : <Navigate to="/login" replace />} />
          <Route path="/profile" element={user ? <ProfilePage /> : <Navigate to="/login" replace />} />
          <Route path="/map" element={user ? <MapPage /> : <Navigate to="/login" replace />} />
          <Route path="/missions" element={user ? <MissionsPage /> : <Navigate to="/login" replace />} />
          <Route
            path="/mission/:id"
            element={user ? <MissionDetailPage /> : <Navigate to="/login" replace />}
          />
          <Route
            path="/create-mission"
            element={user ? <CreateMissionPage /> : <Navigate to="/login" replace />}
          />
          <Route path="/clients" element={user ? <ClientsPage /> : <Navigate to="/login" replace />} />
          <Route
            path="/restaurants"
            element={user ? <RestaurantsPage /> : <Navigate to="/login" replace />}
          />
          <Route
            path="/delivery-fees"
            element={user ? <DeliveryFeesPage /> : <Navigate to="/login" replace />}
          />
          <Route path="/users" element={user ? <UsersPage /> : <Navigate to="/login" replace />} />
          <Route
            path="/monitor-missions"
            element={user ? <MissionMonitoringPage /> : <Navigate to="/login" replace />}
          />
        </Routes>
      </Router>
    </LanguageProvider>
  );
}

export default App;
