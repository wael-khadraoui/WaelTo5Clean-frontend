import React from 'react';
import { useTranslation } from '../hooks/useTranslation';
import './NotificationPermissionPrompt.css';

export default function NotificationPermissionPrompt({ onAllow, onDismiss }) {
  const { t } = useTranslation();
  return (
    <div className="notification-permission-overlay">
      <div className="notification-permission-modal">
        <div className="notification-permission-icon">🔔</div>
        <h2>{t('enableNotifications')}</h2>
        <p>
          {t('notificationDescription')}
        </p>
        <div className="notification-permission-actions">
          <button 
            className="notification-btn primary" 
            onClick={onAllow}
          >
            {t('enableNotifications')}
          </button>
          {onDismiss && (
            <button className="notification-btn secondary" onClick={onDismiss}>
              {t('notNow')}
            </button>
          )}
        </div>
        <p className="notification-permission-note">
          {t('canChangeLater')}
        </p>
      </div>
    </div>
  );
}

