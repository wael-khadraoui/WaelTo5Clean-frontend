import React from 'react';
import { useTranslation } from '../hooks/useTranslation';
import './LocationPermissionPrompt.css';

export default function LocationPermissionPrompt({ onDismiss }) {
  const { t } = useTranslation();
  return (
    <div className="location-permission-overlay">
      <div className="location-permission-modal">
        <div className="location-permission-icon">📍</div>
        <h2>{t('locationPermissionRequired')}</h2>
        <p>
          {t('locationPermissionDescription')}
        </p>
        <div className="location-permission-actions">
          <button 
            className="location-btn secondary" 
            onClick={() => window.location.reload()}
          >
            {t('refreshPage')}
          </button>
          {onDismiss && (
            <button className="location-btn link" onClick={onDismiss}>
              {t('continueWithoutLocation')}
            </button>
          )}
        </div>
        <div className="location-permission-instructions">
          <p><strong>{t('howToEnable')}:</strong></p>
          <ol>
            <li>{t('locationStep1')}</li>
            <li>{t('locationStep2')}</li>
            <li>{t('locationStep3')}</li>
            <li>{t('locationStep4')}</li>
          </ol>
        </div>
      </div>
    </div>
  );
}

