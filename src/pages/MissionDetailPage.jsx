import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { dataService, authService, userService } from '../App';
import toast from 'react-hot-toast';
import { useTranslation } from '../hooks/useTranslation';
import { openGoogleMapsForMission } from '../utils/googleMaps';
import { getCurrentLocation } from '../utils/locationTracking';
import './MissionDetailPage.css';

export default function MissionDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [mission, setMission] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [deliveryGuys, setDeliveryGuys] = useState([]);
  const [userRole, setUserRole] = useState(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [showSkipStoreModal, setShowSkipStoreModal] = useState(false);
  const [skipStoreIndex, setSkipStoreIndex] = useState(null);
  const [skipStoreReason, setSkipStoreReason] = useState('');

  useEffect(() => {
    loadMission();
    loadDeliveryGuys();
    loadUserRole();

    // Subscribe to real-time updates
    const unsubscribe = dataService.subscribeToMission(id, (updatedMission) => {
      setMission(updatedMission);
    });

    return unsubscribe;
  }, [id]);

  const loadUserRole = async () => {
    const currentUser = authService.getCurrentUser();
    if (currentUser) {
      const userData = await userService.getUserData(currentUser.uid);
      setUserRole(userData?.role || null);
    }
  };

  const loadDeliveryGuys = async () => {
    try {
      const guys = await userService.getAllUsers();
      // Include both delivery guys and monitors (monitors can also work on missions)
      const deliveryGuysList = guys.filter(
        (user) =>
          user.role === 'delivery_guy' ||
          user.role === 'monitor' ||
          user.role === 'admin'
      );
      setDeliveryGuys(deliveryGuysList);
    } catch (error) {
    }
  };

  const getDeliveryGuyName = (userId) => {
    if (!userId) return t('unassigned');
    const guy = deliveryGuys.find(g => g.id === userId);
    return guy ? (guy.name || guy.email || t('unknown')) : t('unknown');
  };

  const calculateSubtotal = () => {
    if (!mission) return 0;
    // If mission is canceled, total should be 0
    if (mission.status === 'cancelled') {
      return 0;
    }
    const skippedStoreIndices = mission.skippedStores?.map(s => s.storeIndex) || [];
    
    if (mission.stores && Array.isArray(mission.stores)) {
      return mission.stores.reduce((sum, store, storeIndex) => {
        // Skip stores that are skipped
        if (skippedStoreIndices.includes(storeIndex)) {
          return sum;
        }
        if (store.items && Array.isArray(store.items)) {
          return sum + store.items.reduce((itemSum, item) => {
            return itemSum + (parseFloat(item.price) || 0);
          }, 0);
        }
        return sum;
      }, 0);
    }
    if (mission.items && Array.isArray(mission.items)) {
      return mission.items.reduce((sum, item) => {
        return sum + (parseFloat(item.price) || 0);
      }, 0);
    }
    return 0;
  };

  const calculateTotal = () => {
    if (!mission) return 0;
    // If mission is canceled, total should be 0
    if (mission.status === 'cancelled') {
      return 0;
    }
    const subtotal = calculateSubtotal();
    const deliveryFee = parseFloat(mission.deliveryFee || 0);
    return subtotal + deliveryFee;
  };

  const loadMission = async () => {
    setLoading(true);
    const missionData = await dataService.getMission(id);
    setMission(missionData);
    setLoading(false);
  };

  const applyMissionPatch = (patch) => {
    setMission(prev => (prev ? { ...prev, ...patch } : prev));
  };

  const updateStatus = async (newStatus) => {
    if (!mission || isUpdating) return;
    if (!window.confirm(t('changeMissionStatusTo') + ' ' + newStatus + '?')) {
      return;
    }
    
    setIsUpdating(true);
    
    // If starting mission, capture location and time
    let additionalData = {};
    if (newStatus === 'in_progress' && mission.status !== 'in_progress') {
      const location = await getCurrentLocation();
      if (location) {
        additionalData = {
          startedAt: new Date().toISOString(),
          startedLocation: location,
        };
      } else {
        additionalData = {
          startedAt: new Date().toISOString(),
        };
      }
    }
    
    // If completing mission, capture location and time
    if (newStatus === 'completed') {
      const location = await getCurrentLocation();
      if (location) {
        additionalData = {
          completedAt: new Date().toISOString(),
          completedLocation: location,
        };
      } else {
        additionalData = {
          completedAt: new Date().toISOString(),
        };
      }
    }
    
    const result = await dataService.updateMissionStatus(id, newStatus, additionalData);
    
    setIsUpdating(false);
    if (result.success) {
      applyMissionPatch({ status: newStatus, updatedAt: new Date().toISOString(), ...additionalData });
      if (newStatus === 'completed') {
        toast.success(t('missionCompleted'));
      } else {
        toast.success(t('missionStatusUpdated'));
      }
    } else {
      toast.error(result.error || t('failedToUpdateStatus'));
    }
  };

  const confirmReachedPickup = async () => {
    if (!mission || isUpdating) return;
    if (!window.confirm(t('confirmReachedPickup'))) {
      return;
    }
    
    setIsUpdating(true);
    const location = await getCurrentLocation();
    const additionalData = {
      pickupReachedAt: new Date().toISOString(),
    };
    
    if (location) {
      additionalData.pickupReachedLocation = location;
    }
    
    const result = await dataService.updateMissionStatus(id, mission.status, additionalData);
    setIsUpdating(false);
    if (result.success) {
      applyMissionPatch(additionalData);
      toast.success(t('pickupLocationReached'));
    } else {
      toast.error(result.error || t('failedToConfirmPickup'));
    }
  };

  const pickUpMission = async () => {
    const user = authService.getCurrentUser();
    if (!user) {
      toast.error(t('mustBeLoggedInToPickUp'));
      return;
    }

    if (window.confirm(t('pickUpThisMission'))) {
      setIsUpdating(true);
      const result = await dataService.pickUpMission(id, user.uid);
      setIsUpdating(false);
      if (result.success) {
        toast.success(t('missionPickedUp'));
        applyMissionPatch({
          assignedTo: user.uid,
          status: 'assigned',
          assignedAt: new Date().toISOString(),
        });
      } else {
        toast.error(result.error || t('failedToPickUp'));
      }
    }
  };

  const isUnassigned = !mission?.assignedTo || mission.assignedTo === null;
  const currentUserId = authService.getCurrentUser()?.uid;
  const isAssignedToMe = mission?.assignedTo === currentUserId;
  const isMonitor = userRole === 'monitor';
  const isAdmin = userRole === 'admin';
  const isDeliveryGuy = userRole === 'delivery_guy';
  const homeViewMode =
    typeof window !== 'undefined' ? localStorage.getItem('homeViewMode') || 'admin' : 'admin';
  const canActAsCarrier =
    isDeliveryGuy || ((isAdmin || isMonitor) && homeViewMode === 'delivery');
  const canPickUpUnassigned = isUnassigned && canActAsCarrier;
  const canWorkOnMission = isAssignedToMe;
  // Only admins and monitors can cancel/skip
  const canManageMission = isAdmin || isMonitor;

  const openMap = () => {
    openGoogleMapsForMission(mission);
  };

  const handleCancelMission = async () => {
    if (!cancelReason.trim()) {
      toast.error(t('provideCancelReason'));
      return;
    }

    setIsUpdating(true);
    const result = await dataService.updateMissionStatus(id, 'cancelled', {
      canceledAt: new Date().toISOString(),
      canceledReason: cancelReason.trim(),
      canceledBy: currentUserId,
    });
    setIsUpdating(false);

    if (result.success) {
      toast.success(t('missionCanceled'));
      applyMissionPatch({
        status: 'cancelled',
        canceledAt: new Date().toISOString(),
        canceledReason: cancelReason.trim(),
        canceledBy: currentUserId,
      });
      setShowCancelModal(false);
      setCancelReason('');
    } else {
      toast.error(result.error || t('failedToCancel'));
    }
  };

  const handleSkipStore = async () => {
    if (!skipStoreReason.trim()) {
      toast.error(t('provideSkipReason'));
      return;
    }

    if (skipStoreIndex === null) {
      toast.error(t('noStoreSelected'));
      return;
    }

    setIsUpdating(true);
    const skippedStores = mission.skippedStores || [];
    const newSkippedStore = {
      storeIndex: skipStoreIndex,
      reason: skipStoreReason.trim(),
      skippedAt: new Date().toISOString(),
      skippedBy: currentUserId,
    };
    
    // Check if store is already skipped
    const alreadySkipped = skippedStores.some(s => s.storeIndex === skipStoreIndex);
    if (alreadySkipped) {
      toast.error(t('storeAlreadySkipped'));
      setIsUpdating(false);
      return;
    }

    const result = await dataService.updateMissionStatus(id, mission.status, {
      skippedStores: [...skippedStores, newSkippedStore],
    });
    setIsUpdating(false);

    if (result.success) {
      toast.success(t('storeSkipped'));
      applyMissionPatch({
        skippedStores: [...skippedStores, newSkippedStore],
      });
      setShowSkipStoreModal(false);
      setSkipStoreIndex(null);
      setSkipStoreReason('');
    } else {
      toast.error(result.error || t('failedToSkipStore'));
    }
  };

  const openSkipStoreModal = (storeIndex) => {
    setSkipStoreIndex(storeIndex);
    setShowSkipStoreModal(true);
  };

  if (loading) {
    return (
      <div className="mission-loading">
        <div>{t('loading')} {t('mission')}...</div>
      </div>
    );
  }

  if (!mission) {
    return (
      <div className="mission-error">
        <div>{t('missionNotFound')}</div>
        <button onClick={() => navigate('/missions')}>{t('backToMissions')}</button>
      </div>
    );
  }

  const isCompleted = mission.status === 'completed' || mission.status === 'cancelled';
  const subtotal = calculateSubtotal();
  const deliveryFee = parseFloat(mission.deliveryFee || 0);
  const total = calculateTotal();
  const orderDate = mission.createdAt ? new Date(mission.createdAt) : new Date();

  // Show receipt view for completed missions
  if (isCompleted) {
  return (
      <div className="receipt-container">
        <div className="receipt-paper">
          {/* Receipt Header */}
          <div className="receipt-header">
            <div className="receipt-logo">
              <h1>TO5</h1>
              <p className="receipt-tagline">{t('deliveryService')}</p>
            </div>
            <div className="receipt-order-info">
              <div className="order-number">Order #{mission.id.slice(0, 8).toUpperCase()}</div>
              <div className="order-date">{orderDate.toLocaleDateString('en-US', { 
                weekday: 'short', 
                year: 'numeric', 
                month: 'short', 
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}</div>
              <div className="order-status">
          <span
                  className="status-badge-receipt"
            style={{
              backgroundColor:
                      mission.status === 'completed' ? '#34C759' :
                      mission.status === 'cancelled' ? '#FF3B30' : '#FF9500',
            }}
          >
            {mission.status?.toUpperCase() || 'UNKNOWN'}
          </span>
        </div>
            </div>
          </div>

          <div className="receipt-divider"></div>

          {/* Customer Info */}
          <div className="receipt-section">
            <div className="receipt-section-title">{t('customer')}</div>
            <div className="receipt-info">
              <div className="receipt-info-row">
                <span className="receipt-label">{t('name')}:</span>
                <span className="receipt-value">{mission.clientName || t('nA')}</span>
              </div>
              <div className="receipt-info-row">
                <span className="receipt-label">{t('phone')}:</span>
                <span className="receipt-value">{mission.clientPhone || t('nA')}</span>
              </div>
              <div className="receipt-info-row">
                <span className="receipt-label">{t('address')}:</span>
                <span className="receipt-value address-value">{mission.deliveryAddress || t('nA')}</span>
              </div>
            </div>
          </div>

          <div className="receipt-divider"></div>

          {/* Items */}
          <div className="receipt-section">
            <div className="receipt-section-title">{t('items')}</div>
            
            {mission.stores && mission.stores.length > 0 ? (
              mission.stores.map((store, storeIndex) => {
                const skippedStore = mission.skippedStores?.find(s => s.storeIndex === storeIndex);
                return (
                  <div key={storeIndex} className={`store-section ${skippedStore ? 'store-skipped' : ''}`}>
                    <div className="store-name-header">
                      <span className="store-name">
                        {store.name || `${t('store')} ${storeIndex + 1}`}
                        {skippedStore && <span className="store-skipped-badge"> ({t('skipped')})</span>}
                      </span>
                      {store.phone && (
                        <a href={`tel:${store.phone}`} className="store-phone-link">
                          📞 {store.phone}
                        </a>
                      )}
                    </div>
                    {skippedStore && (
                      <div className="store-skip-reason">
                        <strong>Skip Reason:</strong> {skippedStore.reason}
                      </div>
                    )}
                  {store.items && store.items.length > 0 && (
                    <div className="items-list">
                      {store.items.map((item, itemIndex) => (
                        <div key={itemIndex} className="receipt-item">
                          <div className="item-details">
                            <div className="item-name">{item.name || t('unnamedItem')}</div>
                            {item.description && (
                              <div className="item-description">{item.description}</div>
                            )}
                          </div>
                          <div className="item-price">{parseFloat(item.price || 0).toFixed(2)} TND</div>
                        </div>
                      ))}
                    </div>
                  )}
                  </div>
                );
              })
            ) : mission.items && mission.items.length > 0 ? (
              <div className="items-list">
                {mission.items.map((item, index) => (
                  <div key={index} className="receipt-item">
                    <div className="item-details">
                      <div className="item-name">{item.name || 'Unnamed Item'}</div>
                      {item.description && (
                        <div className="item-description">{item.description}</div>
                      )}
                    </div>
                    <div className="item-price">{parseFloat(item.price || 0).toFixed(2)} TND</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="no-items">{t('noItems')}</div>
            )}
          </div>

          <div className="receipt-divider"></div>

          {/* Totals */}
          <div className="receipt-totals">
            <div className="receipt-total-row">
              <span className="total-label">{t('subtotal')}:</span>
              <span className="total-value">{subtotal.toFixed(2)} TND</span>
            </div>
            {deliveryFee > 0 && (
              <div className="receipt-total-row">
                <span className="total-label">{t('deliveryFee')}:</span>
                <span className="total-value">{deliveryFee.toFixed(2)} TND</span>
              </div>
            )}
            <div className="receipt-total-row receipt-total-final">
              <span className="total-label">{t('total')}:</span>
              <span className="total-value">{total.toFixed(2)} TND</span>
            </div>
          </div>

          <div className="receipt-divider"></div>

          {/* Delivery Info */}
          <div className="receipt-section">
            <div className="receipt-section-title">{t('deliveryInformation')}</div>
            <div className="receipt-info">
              <div className="receipt-info-row">
                <span className="receipt-label">{t('assignedTo')}:</span>
                <span className="receipt-value">{getDeliveryGuyName(mission.assignedTo)}</span>
              </div>
              {mission.assignedAt && (
                <div className="receipt-info-row">
                  <span className="receipt-label">{t('assigned')}:</span>
                  <span className="receipt-value">{new Date(mission.assignedAt).toLocaleString()}</span>
                </div>
              )}
              {mission.startedAt && (
                <div className="receipt-info-row">
                  <span className="receipt-label">{t('started')}:</span>
                  <span className="receipt-value">{new Date(mission.startedAt).toLocaleString()}</span>
                </div>
              )}
              {/* Show individual store pickup times */}
              {mission.stores && mission.stores.length > 0 && mission.pickedUpFromStores && mission.pickedUpFromStores.length > 0 && mission.pickupReachedAt && (
                <>
                  {mission.pickedUpFromStores.map((storeIndex) => {
                    const actualIndex = typeof storeIndex === 'number' ? storeIndex : parseInt(storeIndex);
                    const store = mission.stores[actualIndex];
                    const storeName = store?.name || `Store ${actualIndex + 1}`;
                    return (
                      <div key={actualIndex} className="receipt-info-row">
                        <span className="receipt-label">{t('reached')} {storeName}:</span>
                        <span className="receipt-value">{new Date(mission.pickupReachedAt).toLocaleString()}</span>
                      </div>
                    );
                  })}
                </>
              )}
              {/* Legacy single pickup location */}
              {(!mission.stores || mission.stores.length === 0) && mission.pickupReachedAt && (
                <div className="receipt-info-row">
                  <span className="receipt-label">{t('pickupReached')}:</span>
                  <span className="receipt-value">{new Date(mission.pickupReachedAt).toLocaleString()}</span>
                </div>
              )}
              {mission.completedAt && (
                <div className="receipt-info-row">
                  <span className="receipt-label">{t('completed')}:</span>
                  <span className="receipt-value">{new Date(mission.completedAt).toLocaleString()}</span>
                </div>
              )}
              {mission.canceledAt && (
                <div className="receipt-info-row">
                  <span className="receipt-label">{t('cancelled')}:</span>
                  <span className="receipt-value">{new Date(mission.canceledAt).toLocaleString()}</span>
                </div>
              )}
              {mission.canceledReason && (
                <div className="receipt-info-row receipt-canceled-reason">
                  <span className="receipt-label">{t('cancelReason')}:</span>
                  <span className="receipt-value">{mission.canceledReason}</span>
                </div>
              )}
            </div>
          </div>

          {/* Show skipped stores */}
          {mission.skippedStores && mission.skippedStores.length > 0 && (
            <>
              <div className="receipt-divider"></div>
              <div className="receipt-section">
                <div className="receipt-section-title">{t('skippedStores')}</div>
                <div className="receipt-info">
                  {mission.skippedStores.map((skipped, idx) => {
                    const store = mission.stores && mission.stores[skipped.storeIndex];
                    const storeName = store?.name || `Store ${skipped.storeIndex + 1}`;
                    return (
                      <div key={idx} className="receipt-info-row receipt-skipped-store">
                        <span className="receipt-label">{storeName}:</span>
                        <span className="receipt-value">{skipped.reason}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {mission.notes && (
            <>
              <div className="receipt-divider"></div>
              <div className="receipt-section">
                <div className="receipt-section-title">{t('notes')}</div>
                <div className="receipt-notes">{mission.notes}</div>
              </div>
            </>
          )}

          <div className="receipt-divider"></div>

          {/* Footer */}
          <div className="receipt-footer">
            <p>{t('thankYouForOrder')}</p>
            <p className="receipt-footer-small">{t('orderId')}: {mission.id}</p>
          </div>

          {/* Action Buttons */}
          <div className="receipt-actions">
            <button className="action-button back-button-receipt" onClick={() => {
              const from = location.state?.from;
              if (from === 'monitor-missions') {
                navigate('/monitor-missions');
              } else if (from === 'missions') {
                navigate('/missions');
              } else {
                if (userRole === 'admin' || userRole === 'monitor') {
                  navigate('/monitor-missions');
                } else {
                  navigate('/missions');
                }
              }
            }}>
              ← {t('back')}
            </button>
            <button className="action-button map-button-receipt" onClick={openMap}>
              🗺️ {t('viewOnMap')}
            </button>
            {canManageMission && mission.status !== 'completed' && mission.status !== 'cancelled' && (
              <button
                className="action-button cancel-button-receipt"
                onClick={() => setShowCancelModal(true)}
                disabled={isUpdating}
              >
                ❌ Cancel Mission
              </button>
            )}
          </div>

          {/* Cancel Mission Modal */}
          {showCancelModal && (
            <div className="modal-overlay" onClick={() => setShowCancelModal(false)}>
              <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <h3>{t('cancelMission')}</h3>
                <p>{t('provideCancelReasonForMission')}</p>
                <textarea
                  className="modal-textarea"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder={t('enterCancelReason')}
                  rows={4}
                />
                <div className="modal-actions">
                  <button
                    className="modal-button modal-button-cancel"
                    onClick={() => {
                      setShowCancelModal(false);
                      setCancelReason('');
                    }}
                  >
                    {t('cancel')}
                  </button>
                  <button
                    className="modal-button modal-button-confirm"
                    onClick={handleCancelMission}
                    disabled={isUpdating || !cancelReason.trim()}
                  >
                    {isUpdating ? t('canceling') + '...' : t('confirmCancel')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Skip Store Modal */}
          {showSkipStoreModal && (
            <div className="modal-overlay" onClick={() => {
              setShowSkipStoreModal(false);
              setSkipStoreIndex(null);
              setSkipStoreReason('');
            }}>
              <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <h3>{t('skipStore')}</h3>
                {skipStoreIndex !== null && mission.stores && (
                  <p>{t('skip')} <strong>{mission.stores[skipStoreIndex]?.name || `${t('store')} ${skipStoreIndex + 1}`}</strong>?</p>
                )}
                <p>{t('pleaseProvideReason')}</p>
                <textarea
                  className="modal-textarea"
                  value={skipStoreReason}
                  onChange={(e) => setSkipStoreReason(e.target.value)}
                  placeholder={t('enterSkipReason')}
                  rows={4}
                />
                <div className="modal-actions">
                  <button
                    className="modal-button modal-button-cancel"
                    onClick={() => {
                      setShowSkipStoreModal(false);
                      setSkipStoreIndex(null);
                      setSkipStoreReason('');
                    }}
                  >
                    {t('cancel')}
                  </button>
                  <button
                    className="modal-button modal-button-confirm"
                    onClick={handleSkipStore}
                    disabled={isUpdating || !skipStoreReason.trim()}
                  >
                    {isUpdating ? t('skipping') + '...' : t('confirmSkip')}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Visual detailed view for active missions
  const pickedUpStores = mission.pickedUpFromStores || [];
  
  return (
    <div className="mission-detail-visual">
      <div className="mission-visual-header">
        <button className="back-button-visual" onClick={() => {
          const from = location.state?.from;
          if (from === 'monitor-missions') {
            navigate('/monitor-missions');
          } else if (from === 'missions') {
            navigate('/missions');
          } else {
            if (userRole === 'admin' || userRole === 'monitor') {
            navigate('/monitor-missions');
          } else {
            navigate('/missions');
            }
          }
        }}>
          ← Back
        </button>
        <div className="mission-visual-title">
          <h1>Mission #{mission.id.slice(0, 8).toUpperCase()}</h1>
          <span
            className="status-badge-visual"
            style={{
              backgroundColor:
                mission.status === 'in_progress' ? '#5856D6' :
                mission.status === 'assigned' ? '#007AFF' :
                mission.status === 'cancelled' ? '#FF3B30' : '#FF9500',
            }}
          >
            {mission.status?.toUpperCase() || 'PENDING'}
          </span>
        </div>
      </div>

      <div className="mission-visual-content">
        {/* Mission Status Card */}
        <div className="visual-card">
          <div className="visual-card-header">
            <h2>Mission Status</h2>
          </div>
          <div className="visual-card-body">
            <div className="status-info-grid">
              <div className="status-info-item">
                <div className="status-info-label">Status</div>
                <div className="status-info-value">
                  {mission.assignedTo ? 'Taken' : 'Not Taken'}
                </div>
              </div>
              <div className="status-info-item">
                <div className="status-info-label">Assigned To</div>
                <div className="status-info-value">{getDeliveryGuyName(mission.assignedTo)}</div>
              </div>
              {mission.assignedAt && (
                <div className="status-info-item">
                  <div className="status-info-label">Assigned At</div>
                  <div className="status-info-value time-value">
                    {new Date(mission.assignedAt).toLocaleString()}
                  </div>
                </div>
              )}
              {mission.startedAt && (
                <div className="status-info-item">
                  <div className="status-info-label">Started At</div>
                  <div className="status-info-value time-value">
                    {new Date(mission.startedAt).toLocaleString()}
                  </div>
                </div>
              )}
              {mission.canceledAt && (
                <div className="status-info-item">
                  <div className="status-info-label">Canceled At</div>
                  <div className="status-info-value time-value" style={{ color: '#FF3B30' }}>
                    {new Date(mission.canceledAt).toLocaleString()}
                  </div>
                </div>
              )}
              {mission.canceledReason && (
                <div className="status-info-item full-width">
                  <div className="status-info-label">Cancel Reason</div>
                  <div className="status-info-value" style={{ color: '#FF3B30' }}>
                    {mission.canceledReason}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Show skipped stores info */}
        {mission.skippedStores && mission.skippedStores.length > 0 && (
          <div className="visual-card">
            <div className="visual-card-header">
              <h2>Skipped Stores</h2>
            </div>
            <div className="visual-card-body">
              <div className="skipped-stores-list">
                {mission.skippedStores.map((skipped, idx) => {
                  const store = mission.stores && mission.stores[skipped.storeIndex];
                  const storeName = store?.name || `Store ${skipped.storeIndex + 1}`;
                  return (
                    <div key={idx} className="skipped-store-item">
                      <div className="skipped-store-name">
                        ⏭️ {storeName}
                      </div>
                      <div className="skipped-store-reason">
                        <strong>Reason:</strong> {skipped.reason}
                      </div>
                      {skipped.skippedAt && (
                        <div className="skipped-store-time">
                          Skipped: {new Date(skipped.skippedAt).toLocaleString()}
                        </div>
          )}
        </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Stores Progress */}
        {mission.stores && mission.stores.length > 0 && (
          <div className="visual-card">
            <div className="visual-card-header">
              <h2>Stores Progress</h2>
            </div>
            <div className="visual-card-body">
              <div className="stores-progress-visual">
                {mission.stores.map((store, index) => {
                  const storeIndexToCheck = store.originalIndex !== undefined ? store.originalIndex : index;
                  const isReached = pickedUpStores.includes(storeIndexToCheck);
                  const skippedStore = mission.skippedStores?.find(s => s.storeIndex === index);
                  return (
                    <div key={index} className={`store-progress-card ${isReached ? 'reached' : skippedStore ? 'skipped' : 'pending'}`}>
                      <div className="store-progress-icon">
                        {skippedStore ? '⏭️' : isReached ? '✅' : '⏳'}
                      </div>
                      <div className="store-progress-info">
                        <div className="store-progress-name">
                          Store {index + 1}: {store.name || 'Unnamed Store'}
                          {skippedStore && <span className="store-skipped-label"> (Skipped)</span>}
                </div>
                {store.address && (
                          <div className="store-progress-address">{store.address}</div>
                )}
                        {skippedStore && (
                          <div className="store-skip-reason-visual">
                            <strong>Skip Reason:</strong> {skippedStore.reason}
                          </div>
                        )}
                        {isReached && !skippedStore && (
                          <div className="store-progress-time">Reached</div>
                        )}
                  </div>
                      {canManageMission && !skippedStore && !isReached && mission.status !== 'completed' && mission.status !== 'cancelled' && (
                        <button
                          className="skip-store-button"
                          onClick={() => openSkipStoreModal(index)}
                          title="Skip this store"
                        >
                          ⏭️ Skip
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Timeline */}
        <div className="visual-card">
          <div className="visual-card-header">
            <h2>Timeline</h2>
          </div>
          <div className="visual-card-body">
            <div className="timeline-visual">
              <div className="timeline-item-visual">
                <div className="timeline-dot completed"></div>
                <div className="timeline-content">
                  <div className="timeline-label">Created</div>
                  <div className="timeline-time">
                    {mission.createdAt ? new Date(mission.createdAt).toLocaleString() : 'N/A'}
                  </div>
                </div>
              </div>
              {mission.assignedAt && (
                <div className="timeline-item-visual">
                  <div className="timeline-dot completed"></div>
                  <div className="timeline-content">
                    <div className="timeline-label">Assigned</div>
                    <div className="timeline-time">
                      {new Date(mission.assignedAt).toLocaleString()}
                    </div>
                  </div>
          </div>
        )}
              {mission.startedAt && (
                <div className="timeline-item-visual">
                  <div className="timeline-dot completed"></div>
                  <div className="timeline-content">
                    <div className="timeline-label">Started</div>
                    <div className="timeline-time">
                      {new Date(mission.startedAt).toLocaleString()}
                    </div>
                  </div>
                </div>
              )}
              {mission.pickupReachedAt && (
                <div className="timeline-item-visual">
                  <div className="timeline-dot completed"></div>
                  <div className="timeline-content">
                    <div className="timeline-label">Pickup Reached</div>
                    <div className="timeline-time">
                      {new Date(mission.pickupReachedAt).toLocaleString()}
                    </div>
                  </div>
          </div>
        )}
            </div>
          </div>
        </div>

        {/* Client & Delivery Info */}
        <div className="visual-card">
          <div className="visual-card-header">
            <h2>Client & Delivery Information</h2>
          </div>
          <div className="visual-card-body">
            <div className="info-grid-visual">
              <div className="info-item-visual">
                <div className="info-label-visual">Client Name</div>
                <div className="info-value-visual">{mission.clientName || 'N/A'}</div>
              </div>
              <div className="info-item-visual">
                <div className="info-label-visual">Phone</div>
                <div className="info-value-visual">{mission.clientPhone || 'N/A'}</div>
              </div>
              <div className="info-item-visual full-width">
                <div className="info-label-visual">Delivery Address</div>
                <div className="info-value-visual">{mission.deliveryAddress || 'N/A'}</div>
              </div>
              <div className="info-item-visual">
                <div className="info-label-visual">Total Amount</div>
                <div className="info-value-visual total-amount-visual">{total.toFixed(2)} TND</div>
          </div>
            </div>
          </div>
        </div>

        {/* Items Summary */}
        {mission.stores && mission.stores.length > 0 && (
          <div className="visual-card">
            <div className="visual-card-header">
              <h2>Items Summary</h2>
            </div>
            <div className="visual-card-body">
              {mission.stores.map((store, storeIndex) => (
                <div key={storeIndex} className="store-items-visual">
                  <div className="store-items-header">
                    <span className="store-items-name">{store.name || `Store ${storeIndex + 1}`}</span>
                    {store.phone && (
                      <a href={`tel:${store.phone}`} className="store-phone-visual">
                        📞 {store.phone}
                      </a>
                    )}
                  </div>
                  {store.items && store.items.length > 0 && (
                    <div className="items-list-visual">
                      {store.items.map((item, itemIndex) => (
                        <div key={itemIndex} className="item-row-visual">
                          <div className="item-name-visual">{item.name || 'Unnamed Item'}</div>
                          <div className="item-price-visual">{parseFloat(item.price || 0).toFixed(2)} TND</div>
            </div>
                      ))}
            </div>
          )}
        </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="mission-visual-actions">
        <button className="action-button-visual map-button-visual" onClick={openMap}>
          🗺️ View on Map
        </button>

        {mission.status !== 'completed' && mission.status !== 'cancelled' && (
          <>
            {canPickUpUnassigned && (
              <button
                className="action-button-visual pickup-button-visual"
                onClick={pickUpMission}
                disabled={isUpdating}
              >
                📦 Pick Up Mission
              </button>
            )}

            {canWorkOnMission && ['assigned', 'pending'].includes(mission.status) && (
              <button
                className="action-button-visual start-button-visual"
                onClick={() => updateStatus('in_progress')}
                disabled={isUpdating}
              >
                Start Mission
              </button>
            )}

            {canWorkOnMission && 
              mission.status === 'in_progress' && 
              !mission.pickupReachedAt && (
              <button
                className="action-button-visual arrival-button-visual"
                onClick={confirmReachedPickup}
                disabled={isUpdating}
              >
                ✅ Reached Pickup
              </button>
            )}

            {canWorkOnMission && 
              mission.status === 'in_progress' && 
              mission.pickupReachedAt && (
              <button
                className="action-button-visual complete-button-visual"
                onClick={() => updateStatus('completed')}
                disabled={isUpdating}
              >
                Complete Mission
              </button>
            )}

            {canManageMission && (
              <button
                className="action-button-visual cancel-button-visual"
                onClick={() => setShowCancelModal(true)}
                disabled={isUpdating}
              >
                ❌ Cancel Mission
              </button>
            )}
          </>
        )}
      </div>

      {/* Cancel Mission Modal */}
      {showCancelModal && (
        <div className="modal-overlay" onClick={() => setShowCancelModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Cancel Mission</h3>
            <p>Please provide a reason for canceling this mission:</p>
            <textarea
              className="modal-textarea"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Enter reason for canceling..."
              rows={4}
            />
            <div className="modal-actions">
              <button
                className="modal-button modal-button-cancel"
                onClick={() => {
                  setShowCancelModal(false);
                  setCancelReason('');
                }}
              >
                Cancel
              </button>
              <button
                className="modal-button modal-button-confirm"
                onClick={handleCancelMission}
                disabled={isUpdating || !cancelReason.trim()}
              >
                {isUpdating ? 'Canceling...' : 'Confirm Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Skip Store Modal */}
      {showSkipStoreModal && (
        <div className="modal-overlay" onClick={() => {
          setShowSkipStoreModal(false);
          setSkipStoreIndex(null);
          setSkipStoreReason('');
        }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Skip Store</h3>
            {skipStoreIndex !== null && mission.stores && (
              <p>Skip <strong>{mission.stores[skipStoreIndex]?.name || `Store ${skipStoreIndex + 1}`}</strong>?</p>
            )}
            <p>Please provide a reason:</p>
            <textarea
              className="modal-textarea"
              value={skipStoreReason}
              onChange={(e) => setSkipStoreReason(e.target.value)}
              placeholder="Enter reason for skipping this store..."
              rows={4}
            />
            <div className="modal-actions">
              <button
                className="modal-button modal-button-cancel"
                onClick={() => {
                  setShowSkipStoreModal(false);
                  setSkipStoreIndex(null);
                  setSkipStoreReason('');
                }}
              >
                Cancel
              </button>
              <button
                className="modal-button modal-button-confirm"
                onClick={handleSkipStore}
                disabled={isUpdating || !skipStoreReason.trim()}
              >
                {isUpdating ? 'Skipping...' : 'Confirm Skip'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
