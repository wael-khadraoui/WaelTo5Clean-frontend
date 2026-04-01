import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authService } from '../App';
import toast from 'react-hot-toast';
import { useTranslation } from '../hooks/useTranslation';
import './LoginPage.css';

export default function LoginPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    
    if (!email || !password) {
      toast.error(t('pleaseFillAllFields'));
      return;
    }

    setLoading(true);
    const result = await authService.signIn(email, password);
    setLoading(false);

    if (result.success) {
      toast.success(t('loginSuccessful'));
      navigate('/');
    } else {
      toast.error(result.error || t('loginFailed'));
    }
  };

  return (
      <div className="login-container">
      <div className="login-card">
        <h1 className="login-title">{t('deliveryApp')}</h1>
        <p className="login-subtitle">{t('signInToContinue')}</p>

        <form onSubmit={handleLogin} className="login-form">
          <div className="form-group">
            <label htmlFor="email">{t('email')}</label>
            <input
              id="email"
              type="email"
              placeholder={t('enterEmail')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">{t('password')}</label>
            <input
              id="password"
              type="password"
              placeholder={t('enterPassword')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            className="login-button"
            disabled={loading}
          >
            {loading ? t('signingIn') : t('signIn')}
          </button>

          <p className="login-link">
            {t('dontHaveAccount')}{' '}
            <Link to="/signup">{t('signUp')}</Link>
          </p>
        </form>
      </div>
    </div>
  );
}

