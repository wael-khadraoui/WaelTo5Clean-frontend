import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authService } from '../App';
import toast from 'react-hot-toast';
import { useTranslation } from '../hooks/useTranslation';
import './SignUpPage.css';

export default function SignUpPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSignUp = async (e) => {
    e.preventDefault();
    
    if (!email || !password || !confirmPassword) {
      toast.error(t('pleaseFillAllFields'));
      return;
    }

    if (password.length < 8) {
      toast.error(t('passwordMinLength'));
      return;
    }

    if (password !== confirmPassword) {
      toast.error(t('passwordsDoNotMatch'));
      return;
    }

    setLoading(true);
    const result = await authService.signUp(email, password, {
      name: name || email.split('@')[0],
    });
    setLoading(false);

    if (result.success) {
      toast.success(t('accountCreated'));
      navigate('/login');
    } else {
      toast.error(
        result.code === 'REGISTRATION_DISABLED'
          ? t('registrationDisabled')
          : result.error || t('signUpFailed')
      );
    }
  };

  return (
    <div className="signup-container">
      <div className="signup-card">
        <h1 className="signup-title">{t('deliveryApp')}</h1>
        <p className="signup-subtitle">{t('createYourAccount')}</p>

        <form onSubmit={handleSignUp} className="signup-form">
          <div className="form-group">
            <label htmlFor="name">{t('fullNameOptional')}</label>
            <input
              id="name"
              type="text"
              placeholder={t('enterFullName')}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

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
              placeholder={t('enterPasswordMin')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">{t('confirmPassword')}</label>
            <input
              id="confirmPassword"
              type="password"
              placeholder={t('confirmYourPassword')}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>

          <button
            type="submit"
            className="signup-button"
            disabled={loading}
          >
            {loading ? t('creatingAccount') : t('signUp')}
          </button>

          <p className="signup-link">
            {t('alreadyHaveAccount')}{' '}
            <Link to="/login">{t('signIn')}</Link>
          </p>
        </form>
      </div>
    </div>
  );
}

