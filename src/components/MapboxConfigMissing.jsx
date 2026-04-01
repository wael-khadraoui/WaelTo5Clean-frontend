import React from 'react';
import { useTranslation } from '../hooks/useTranslation';

/** Shown when VITE_MAPBOX_* were not set at build time (e.g. empty docker/.env). */
export default function MapboxConfigMissing() {
  const { t } = useTranslation();
  return (
    <div
      className="mapbox-config-missing"
      style={{
        padding: '1.5rem',
        background: '#fff3cd',
        border: '1px solid #ffc107',
        borderRadius: 8,
        color: '#856404',
        maxWidth: 520,
      }}
    >
      <strong>{t('mapboxNotConfigured')}</strong>
      <p style={{ margin: '0.75rem 0 0', fontSize: '0.95rem' }}>{t('mapboxNotConfiguredHint')}</p>
    </div>
  );
}
