import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { dataService, authService, userService } from '../App';
import toast from 'react-hot-toast';
import { useTranslation } from '../hooks/useTranslation';
import './DeliveryFeesPage.css';

export default function DeliveryFeesPage() {
  const { t } = useTranslation();
  const [rules, setRules] = useState([]);
  const [systemParameters, setSystemParameters] = useState({
    maxMinutes: 60,
    orangeThreshold: 20,
    redThreshold: 5,
    pointsOnTime: 10,
    pointsLowTime: 20,
    pointsDeducted: 5,
    taxPerStore: 0
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState(null);
  const [activeTab, setActiveTab] = useState('fees'); // 'fees', 'timer', 'points'
  const navigate = useNavigate();

  useEffect(() => {
    const loadUserRole = async () => {
      const currentUser = authService.getCurrentUser();
      if (!currentUser) {
        navigate('/login');
        return;
      }
      const data = await userService.getUserData(currentUser.uid);
      setCurrentUserRole(data?.role || 'user');
      
      if (data?.role !== 'admin') {
        toast.error(t('accessDeniedAdminOnly'));
        navigate('/');
        return;
      }
      
      loadRules();
      loadSystemParameters();
    };
    
    loadUserRole();
  }, [navigate]);

  const loadRules = async () => {
    setLoading(true);
    const result = await dataService.getDeliveryFeeRules();
    if (result.success) {
      setRules(result.rules.length > 0 ? result.rules : [
        { minDistance: 0, maxDistance: 1, fee: 3 }
      ]);
    } else {
      toast.error(t('failedToLoadRules'));
      setRules([{ minDistance: 0, maxDistance: 1, fee: 3 }]);
    }
    setLoading(false);
  };

  const loadSystemParameters = async () => {
    try {
      const params = await dataService.getSystemParameters();
      setSystemParameters(params);
    } catch (error) {
    }
  };

  const addRule = () => {
    const lastRule = rules[rules.length - 1];
    const newMinDistance = lastRule ? lastRule.maxDistance : 0;
    setRules([...rules, { minDistance: newMinDistance, maxDistance: newMinDistance + 1, fee: 0 }]);
  };

  const removeRule = (index) => {
    if (rules.length <= 1) {
      toast.error(t('atLeastOneRule'));
      return;
    }
    setRules(rules.filter((_, i) => i !== index));
  };

  const updateRule = (index, field, value) => {
    const newRules = [...rules];
    newRules[index][field] = parseFloat(value) || 0;
    setRules(newRules);
  };

  const handleSave = async () => {
    if (activeTab === 'fees') {
      // Validate rules
      for (let i = 0; i < rules.length; i++) {
        const rule = rules[i];
        if (rule.minDistance < 0 || rule.maxDistance <= rule.minDistance) {
          toast.error(`${t('rule')} ${i + 1}: ${t('invalidDistanceRange')}`);
          return;
        }
        if (rule.fee < 0) {
          toast.error(`${t('rule')} ${i + 1}: ${t('feeCannotBeNegative')}`);
          return;
        }
      }

      // Check for overlapping ranges
      for (let i = 0; i < rules.length - 1; i++) {
        if (rules[i].maxDistance !== rules[i + 1].minDistance) {
          toast.error(t('distanceRangesMustBeContinuous'));
          return;
        }
      }

      setSaving(true);
      // Save both rules and tax per store
      const rulesResult = await dataService.saveDeliveryFeeRules(rules);
      const paramsResult = await dataService.saveSystemParameters(systemParameters);
      setSaving(false);

      if (rulesResult.success && paramsResult.success) {
        toast.success(t('rulesSaved'));
      } else {
        toast.error(rulesResult.error || paramsResult.error || t('failedToSaveRules'));
      }
    } else if (activeTab === 'timer' || activeTab === 'points') {
      // Validate parameters
      if (systemParameters.maxMinutes <= 0) {
        toast.error(t('maxMinutesGreaterThanZero'));
        return;
      }
      if (systemParameters.orangeThreshold < 0 || systemParameters.orangeThreshold > 100) {
        toast.error(t('orangeThresholdRange'));
        return;
      }
      if (systemParameters.redThreshold < 0 || systemParameters.redThreshold > 100) {
        toast.error(t('redThresholdRange'));
        return;
      }
      if (systemParameters.redThreshold >= systemParameters.orangeThreshold) {
        toast.error(t('redThresholdLessThanOrange'));
        return;
      }

      setSaving(true);
      const result = await dataService.saveSystemParameters(systemParameters);
      setSaving(false);

      if (result.success) {
        toast.success(t('parametersSaved'));
      } else {
        toast.error(result.error || t('failedToSaveParameters'));
      }
    }
  };

  const updateParameter = (field, value) => {
    setSystemParameters(prev => ({
      ...prev,
      [field]: parseFloat(value) || 0
    }));
  };

  if (loading || currentUserRole !== 'admin') {
    return (
      <div className="delivery-fees-loading">
        <div>{t('loading')}...</div>
      </div>
    );
  }

  return (
    <div className="delivery-fees-container">
      <div className="delivery-fees-header">
        <button className="back-button" onClick={() => navigate('/')} title="Go back">
          ← {t('back')}
        </button>
        <h1>{t('systemParameters')}</h1>
      </div>

      <div className="parameters-tabs">
        <button
          className={`tab-button ${activeTab === 'fees' ? 'active' : ''}`}
          onClick={() => setActiveTab('fees')}
        >
          💰 {t('deliveryFeeRules')}
        </button>
        <button
          className={`tab-button ${activeTab === 'timer' ? 'active' : ''}`}
          onClick={() => setActiveTab('timer')}
        >
          ⏱️ {t('timerSettings')}
        </button>
        <button
          className={`tab-button ${activeTab === 'points' ? 'active' : ''}`}
          onClick={() => setActiveTab('points')}
        >
          ⭐ {t('pointsSettings')}
        </button>
      </div>

      <div className="delivery-fees-content">
        {activeTab === 'fees' && (
          <>
            <div className="delivery-fees-info">
              <p>{t('configureDeliveryFees')}</p>
              <p>{t('rulesCheckedInOrder')}</p>
            </div>

            <div className="parameters-section" style={{ marginBottom: '20px' }}>
              <div className="parameter-field">
                <label>{t('taxPerStore')}</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={systemParameters.taxPerStore || 0}
                  onChange={(e) => updateParameter('taxPerStore', e.target.value)}
                />
                <p className="parameter-description">{t('taxPerStoreDescription')}</p>
              </div>
            </div>

        <div className="rules-list">
          {rules.map((rule, index) => (
            <div key={index} className="rule-card">
              <div className="rule-header">
                <h3>{t('rule')} {index + 1}</h3>
                {rules.length > 1 && (
                  <button
                    className="remove-rule-button"
                    onClick={() => removeRule(index)}
                    type="button"
                  >
                    ✕
                  </button>
                )}
              </div>
              <div className="rule-fields">
                <div className="rule-field">
                  <label>{t('minDistance')}</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={rule.minDistance}
                    onChange={(e) => updateRule(index, 'minDistance', e.target.value)}
                    disabled={index === 0}
                  />
                </div>
                <div className="rule-field">
                  <label>{t('maxDistance')}</label>
                  <input
                    type="number"
                    step="0.1"
                    min={rule.minDistance + 0.1}
                    value={rule.maxDistance}
                    onChange={(e) => updateRule(index, 'maxDistance', e.target.value)}
                  />
                </div>
                <div className="rule-field">
                  <label>{t('fee')}</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={rule.fee}
                    onChange={(e) => updateRule(index, 'fee', e.target.value)}
                  />
                </div>
              </div>
              <div className="rule-description">
                {index === 0 ? (
                  <span>{t('under')} {rule.maxDistance} km: {rule.fee} DT</span>
                ) : index === rules.length - 1 ? (
                  <span>{t('over')} {rule.minDistance} km: {rule.fee} DT</span>
                ) : (
                  <span>{rule.minDistance} km - {rule.maxDistance} km: {rule.fee} DT</span>
                )}
              </div>
            </div>
          ))}
        </div>

            <div className="delivery-fees-actions">
              <button className="add-rule-button" onClick={addRule} type="button">
                + {t('addRule')}
              </button>
              <button
                className="save-button"
                onClick={handleSave}
                disabled={saving}
                type="button"
              >
                {saving ? t('saving') + '...' : t('saveRules')}
              </button>
            </div>
          </>
        )}

        {activeTab === 'timer' && (
          <>
            <div className="delivery-fees-info">
              <p>{t('configureTimerSettings')}</p>
            </div>
            <div className="parameters-section">
              <div className="parameter-field">
                <label>{t('maxMinutes')}</label>
                <input
                  type="number"
                  min="1"
                  value={systemParameters.maxMinutes}
                  onChange={(e) => updateParameter('maxMinutes', e.target.value)}
                />
                <p className="parameter-description">{t('maxMinutesDescription')}</p>
              </div>
              <div className="parameter-field">
                <label>{t('orangeThreshold')}</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={systemParameters.orangeThreshold}
                  onChange={(e) => updateParameter('orangeThreshold', e.target.value)}
                />
                <p className="parameter-description">{t('orangeThresholdDescription')}</p>
              </div>
              <div className="parameter-field">
                <label>{t('redThreshold')}</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={systemParameters.redThreshold}
                  onChange={(e) => updateParameter('redThreshold', e.target.value)}
                />
                <p className="parameter-description">{t('redThresholdDescription')}</p>
              </div>
            </div>
            <div className="delivery-fees-actions">
              <button
                className="save-button"
                onClick={handleSave}
                disabled={saving}
                type="button"
              >
                {saving ? t('saving') + '...' : t('saveTimerSettings')}
              </button>
            </div>
          </>
        )}

        {activeTab === 'points' && (
          <>
            <div className="delivery-fees-info">
              <p>{t('configurePointsSystem')}</p>
            </div>
            <div className="parameters-section">
              <div className="parameter-field">
                <label>{t('pointsOnTimeLabel')}</label>
                <input
                  type="number"
                  min="0"
                  value={systemParameters.pointsOnTime}
                  onChange={(e) => updateParameter('pointsOnTime', e.target.value)}
                />
                <p className="parameter-description">{t('pointsOnTimeDescription')}</p>
              </div>
              <div className="parameter-field">
                <label>{t('pointsLowTimeLabel')}</label>
                <input
                  type="number"
                  min="0"
                  value={systemParameters.pointsLowTime}
                  onChange={(e) => updateParameter('pointsLowTime', e.target.value)}
                />
                <p className="parameter-description">{t('pointsLowTimeDescription')}</p>
              </div>
              <div className="parameter-field">
                <label>{t('pointsDeductedLabel')}</label>
                <input
                  type="number"
                  min="0"
                  value={systemParameters.pointsDeducted}
                  onChange={(e) => updateParameter('pointsDeducted', e.target.value)}
                />
                <p className="parameter-description">{t('pointsDeductedDescription')}</p>
              </div>
            </div>
            <div className="delivery-fees-actions">
              <button
                className="save-button"
                onClick={handleSave}
                disabled={saving}
                type="button"
              >
                {saving ? t('saving') + '...' : t('savePointsSystem')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

