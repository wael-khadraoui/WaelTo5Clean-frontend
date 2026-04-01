import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authService, userService } from '../App';
import { useLanguage } from '../contexts/LanguageContext';
import { useTranslation } from '../hooks/useTranslation';
import toast from 'react-hot-toast';
import './ProfilePage.css';

export default function ProfilePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [photoURL, setPhotoURL] = useState('');
  const [email, setEmail] = useState('');
  const [distanceDisplayMode, setDistanceDisplayMode] = useState('time'); // 'time' or 'distance'
  const [points, setPoints] = useState(0);
  const { language, changeLanguage } = useLanguage();
  const { t } = useTranslation();
  const navigate = useNavigate();

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const currentUser = authService.getCurrentUser();
        if (!currentUser) {
          navigate('/login', { replace: true });
          return;
        }

        setEmail(currentUser.email || '');

        const data = await userService.getUserData(currentUser.uid);
        if (data) {
          setName(data.name || '');
          setPhone(data.phone || '');
          setPhotoURL(data.photoURL || '');
          setDistanceDisplayMode(data.distanceDisplayMode || 'time');
          setPoints(data.points || 0);
          // Load language preference
          if (data.language && ['en', 'fr', 'tn'].includes(data.language)) {
            changeLanguage(data.language);
          }
        }
      } catch (error) {
        toast.error(t('failedToLoadProfile'));
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [navigate]);

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      const currentUser = authService.getCurrentUser();
      if (!currentUser) {
        toast.error(t('mustBeLoggedIn'));
        return;
      }

      setSaving(true);

      const result = await userService.updateUserProfile(currentUser.uid, {
        name: name.trim(),
        phone: phone.trim(),
        photoURL: photoURL.trim(),
        distanceDisplayMode: distanceDisplayMode,
        language: language,
      });

      if (!result.success) {
        throw new Error(result.error || 'Unknown error');
      }

      toast.success(t('profileUpdated'));
      navigate('/', { replace: true });
    } catch (error) {
      toast.error(t('failedToSaveProfile'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="profile-container">
        <div style={{ textAlign: 'center', padding: '40px' }}>{t('loading')}...</div>
      </div>
    );
  }

  const firstLetter =
    (name && name.trim().charAt(0).toUpperCase()) ||
    (email && email.charAt(0).toUpperCase()) ||
    '?';

  return (
    <div className="profile-container">
      <header className="profile-header">
        <div className="profile-header-content">
          <div>
            <h1 className="profile-title">{t('yourProfile')}</h1>
            <p className="profile-subtitle">{email}</p>
          </div>
          <button
            className="profile-back-button"
            onClick={() => navigate('/')}
          >
            ← {t('back')}
          </button>
        </div>
      </header>

      <div className="profile-content">
        <div className="profile-card">
          <div className="profile-avatar-section">
            {photoURL ? (
              <img
                src={photoURL}
                alt="Avatar"
                className="profile-avatar"
              />
            ) : (
              <div className="profile-avatar-placeholder">
                {firstLetter}
              </div>
            )}
            <div className="profile-avatar-hint">
              {t('profileImage')}
            </div>
          </div>

          <form onSubmit={handleSave} className="profile-form">
            <div className="profile-form-group">
              <label className="profile-label">{t('email')}</label>
              <input
                type="text"
                value={email}
                disabled
                className="profile-input"
              />
            </div>

            <div className="profile-form-group">
              <label className="profile-label">{t('name')}</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('name')}
                className="profile-input"
              />
            </div>

            <div className="profile-form-group">
              <label className="profile-label">{t('phone')}</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={t('phone')}
                className="profile-input"
              />
            </div>

            <div className="profile-form-group">
              <label className="profile-label">{t('profileImage')}</label>
              <input
                type="url"
                value={photoURL}
                onChange={(e) => setPhotoURL(e.target.value)}
                placeholder="https://example.com/your-photo.jpg"
                className="profile-input"
              />
            </div>

            <div className="profile-form-group">
              <label className="profile-label">{t('distanceDisplay')}</label>
              <div className="profile-radio-group">
                <label className="profile-radio-label">
                  <input
                    type="radio"
                    name="distanceDisplayMode"
                    value="time"
                    checked={distanceDisplayMode === 'time'}
                    onChange={(e) => setDistanceDisplayMode(e.target.value)}
                    className="profile-radio-input"
                  />
                  <span>{t('timeEstimated')}</span>
                </label>
                <label className="profile-radio-label">
                  <input
                    type="radio"
                    name="distanceDisplayMode"
                    value="distance"
                    checked={distanceDisplayMode === 'distance'}
                    onChange={(e) => setDistanceDisplayMode(e.target.value)}
                    className="profile-radio-input"
                  />
                  <span>{t('distanceMeters')}</span>
                </label>
              </div>
            </div>

            <div className="profile-form-group">
              <label className="profile-label">{t('points')}</label>
              <div className="profile-points-display">
                <span className="profile-points-value">⭐ {points}</span>
                <span className="profile-points-description">{t('earnPoints')}</span>
              </div>
            </div>

            <div className="profile-form-group">
              <label className="profile-label">{t('language')}</label>
              <div className="profile-language-selector">
                <button
                  type="button"
                  className={`profile-language-option ${language === 'en' ? 'active' : ''}`}
                  onClick={() => changeLanguage('en')}
                >
                  <span className="language-flag">🇬🇧</span>
                  <span>{t('english')}</span>
                </button>
                <button
                  type="button"
                  className={`profile-language-option ${language === 'fr' ? 'active' : ''}`}
                  onClick={() => changeLanguage('fr')}
                >
                  <span className="language-flag">🇫🇷</span>
                  <span>{t('french')}</span>
                </button>
                <button
                  type="button"
                  className={`profile-language-option ${language === 'tn' ? 'active' : ''}`}
                  onClick={() => changeLanguage('tn')}
                >
                  <span className="language-flag">🇹🇳</span>
                  <span>{t('tunisian')}</span>
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="profile-save-button"
              disabled={saving}
            >
              {saving ? t('saving') : t('saveChanges')}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}


