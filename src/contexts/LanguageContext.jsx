import React, { createContext, useContext, useState, useEffect } from 'react';
import { authService, userService } from '../App';

const LanguageContext = createContext();

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};

export const LanguageProvider = ({ children }) => {
  const [language, setLanguage] = useState(() => {
    // Try to get from localStorage first (this ensures immediate load on app start)
    const saved = localStorage.getItem('app_language');
    if (saved && ['en', 'fr', 'tn'].includes(saved)) {
      return saved;
    }
    return 'en'; // Default to English
  });

  // Load language from user profile if logged in (this syncs with server preference)
  useEffect(() => {
    const loadUserLanguage = async () => {
      const currentUser = authService.getCurrentUser();
      if (currentUser) {
        try {
          const userData = await userService.getUserData(currentUser.uid);
          if (userData?.language && ['en', 'fr', 'tn'].includes(userData.language)) {
            // Only update if different from localStorage (to avoid unnecessary re-renders)
            const currentLang = localStorage.getItem('app_language');
            if (userData.language !== currentLang) {
              setLanguage(userData.language);
              localStorage.setItem('app_language', userData.language);
            }
          } else if (!userData?.language) {
            // If user has no language preference, save current localStorage value to profile
            const currentLang = localStorage.getItem('app_language') || 'en';
            if (currentLang && ['en', 'fr', 'tn'].includes(currentLang)) {
              try {
                await userService.updateUserProfile(currentUser.uid, { language: currentLang });
              } catch (error) {
              }
            }
          }
        } catch (error) {
        }
      }
    };
    
    // Load immediately
    loadUserLanguage();
    
    // Also listen to auth state changes to reload language when user logs in
    const unsubscribe = authService.onAuthStateChanged((authUser) => {
      if (authUser) {
        loadUserLanguage();
      }
      // On logout, keep localStorage language - it will persist across sessions
    });
    
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const changeLanguage = async (newLanguage) => {
    if (!['en', 'fr', 'tn'].includes(newLanguage)) {
      return;
    }

    setLanguage(newLanguage);
    localStorage.setItem('app_language', newLanguage);

    // Save to user profile if logged in
    const currentUser = authService.getCurrentUser();
    if (currentUser) {
      try {
        await userService.updateUserProfile(currentUser.uid, { language: newLanguage });
      } catch (error) {
      }
    }
  };

  return (
    <LanguageContext.Provider value={{ language, changeLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
};

