import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { dataService, authService, userService } from '../App';
import toast from 'react-hot-toast';
import { useTranslation } from '../hooks/useTranslation';
import './MissionMonitoringPage.css';

export default function MissionMonitoringPage() {
  const { t } = useTranslation();
  const [missions, setMissions] = useState([]);
  const [filteredMissions, setFilteredMissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState(null);
  const [deliveryGuys, setDeliveryGuys] = useState([]);
  
  // Filters
  const [statusFilters, setStatusFilters] = useState([]); // Array of selected statuses
  const [deliveryGuyFilter, setDeliveryGuyFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('newest'); // 'newest', 'oldest', 'status'
  const [assigningMissionId, setAssigningMissionId] = useState(null);
  const [selectedDeliveryGuyId, setSelectedDeliveryGuyId] = useState('');
  const [showAssignModal, setShowAssignModal] = useState(false);
  
  const navigate = useNavigate();

  useEffect(() => {
    loadUserRole();
    loadDeliveryGuys();
    loadMissions();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [missions, statusFilters, deliveryGuyFilter, dateFrom, dateTo, searchTerm, sortBy]);

  const loadUserRole = async () => {
    const currentUser = authService.getCurrentUser();
    if (currentUser) {
      const userData = await userService.getUserData(currentUser.uid);
      setUserRole(userData?.role || null);
      
      // Redirect if not admin or monitor
      if (userData?.role !== 'admin' && userData?.role !== 'monitor') {
        navigate('/');
      }
    }
  };

  const loadDeliveryGuys = async () => {
    try {
      const guys = await userService.getAllUsers();
      // Include both delivery guys and monitors (monitors can also work on missions)
      const deliveryGuysList = guys.filter(user => 
        user.role === 'delivery_guy' || user.role === 'monitor'
      );
      setDeliveryGuys(deliveryGuysList);
    } catch (error) {
    }
  };

  const loadMissions = async () => {
    setLoading(true);
    try {
      const allMissions = await dataService.getAllMissions();
      setMissions(allMissions);
    } catch (error) {
      toast.error(t('failedToLoadMissions'));
    } finally {
      setLoading(false);
    }
  };

  // Subscribe to real-time updates
  useEffect(() => {
    const unsubscribe = dataService.subscribeToAllMissions((updatedMissions) => {
      setMissions(updatedMissions);
    });
    return unsubscribe;
  }, []);

  const applyFilters = () => {
    let filtered = [...missions];

    // Status filter (multiple selections)
    if (statusFilters.length > 0) {
      filtered = filtered.filter(m => statusFilters.includes(m.status || 'pending'));
    }

    // Delivery guy filter
    if (deliveryGuyFilter !== 'all') {
      if (deliveryGuyFilter === 'unassigned') {
        filtered = filtered.filter(m => !m.assignedTo || m.assignedTo === null);
      } else {
        filtered = filtered.filter(m => m.assignedTo === deliveryGuyFilter);
      }
    }

    // Date range filter
    if (dateFrom) {
      const from = new Date(dateFrom);
      from.setHours(0, 0, 0, 0);
      filtered = filtered.filter(m => {
        if (!m.createdAt) return false;
        const missionDate = new Date(m.createdAt);
        return missionDate >= from;
      });
    }

    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      filtered = filtered.filter(m => {
        if (!m.createdAt) return false;
        const missionDate = new Date(m.createdAt);
        return missionDate <= to;
      });
    }

    // Search filter (client name, phone, mission ID)
    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase().trim();
      filtered = filtered.filter(m => {
        const clientNameMatch = m.clientName?.toLowerCase().includes(searchLower);
        const clientPhoneMatch = m.clientPhone?.toLowerCase().includes(searchLower);
        const missionIdMatch = m.id?.toLowerCase().includes(searchLower);
        return clientNameMatch || clientPhoneMatch || missionIdMatch;
      });
    }

    // Sort
    filtered.sort((a, b) => {
      if (sortBy === 'newest') {
        const dateA = new Date(a.createdAt || 0);
        const dateB = new Date(b.createdAt || 0);
        return dateB - dateA;
      } else if (sortBy === 'oldest') {
        const dateA = new Date(a.createdAt || 0);
        const dateB = new Date(b.createdAt || 0);
        return dateA - dateB;
      } else if (sortBy === 'status') {
        const statusOrder = { 'pending': 1, 'assigned': 2, 'in_progress': 3, 'completed': 4, 'cancelled': 5 };
        return (statusOrder[a.status] || 99) - (statusOrder[b.status] || 99);
      }
      return 0;
    });

    setFilteredMissions(filtered);
  };

  const getDeliveryGuyName = (userId) => {
    if (!userId) return 'Unassigned';
    const guy = deliveryGuys.find(g => g.id === userId);
    return guy ? (guy.name || guy.email || 'Unknown') : 'Unknown';
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending': return '#FF9500';
      case 'assigned': return '#007AFF';
      case 'in_progress': return '#5856D6';
      case 'completed': return '#34C759';
      case 'cancelled': return '#FF3B30';
      default: return '#8E8E93';
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const calculateTotal = (mission) => {
    if (mission.totalAmount) return mission.totalAmount;
    if (mission.stores && Array.isArray(mission.stores)) {
      return mission.stores.reduce((sum, store) => {
        if (store.items && Array.isArray(store.items)) {
          return sum + store.items.reduce((itemSum, item) => {
            return itemSum + (parseFloat(item.price) || 0);
          }, 0);
        }
        return sum;
      }, 0);
    }
    return 0;
  };

  const clearFilters = () => {
    setStatusFilters([]);
    setDeliveryGuyFilter('all');
    setDateFrom('');
    setDateTo('');
    setSearchTerm('');
    setSortBy('newest');
  };

  const openAssignModal = (missionId) => {
    const mission = missions.find(m => m.id === missionId);
    setAssigningMissionId(missionId);
    // Pre-select current delivery guy if mission is already assigned
    setSelectedDeliveryGuyId(mission?.assignedTo || '');
    setShowAssignModal(true);
  };

  const closeAssignModal = () => {
    setShowAssignModal(false);
    setAssigningMissionId(null);
    setSelectedDeliveryGuyId('');
  };

  const handleAssignMission = async () => {
    if (!assigningMissionId || !selectedDeliveryGuyId) {
      toast.error(t('selectDeliveryGuyToAssign'));
      return;
    }

    setAssigningMissionId(assigningMissionId); // Keep the ID to show loading state
    // Allow reassignment for admins/monitors
    const result = await dataService.assignMission(assigningMissionId, selectedDeliveryGuyId, true);
    
    if (result.success) {
      const mission = missions.find(m => m.id === assigningMissionId);
      const isReassign = mission?.assignedTo && mission.assignedTo !== null;
      toast.success(isReassign ? t('missionReassigned') : t('missionAssigned'));
      closeAssignModal();
      // The real-time subscription will update the missions list
    } else {
      toast.error(result.error || t('failedToAssign'));
      setAssigningMissionId(null);
    }
  };

  const toggleStatusFilter = (status) => {
    setStatusFilters(prev => {
      if (prev.includes(status)) {
        return prev.filter(s => s !== status);
      } else {
        return [...prev, status];
      }
    });
  };

  if (loading) {
    return (
      <div className="monitoring-loading">
        <div>{t('loading')} {t('missions')}...</div>
      </div>
    );
  }

  return (
    <div className="monitoring-container">
      <div className="monitoring-header">
        <button className="back-button" onClick={() => navigate('/')}>
          ← {t('back')}
        </button>
        <h1>{t('missionMonitoring')}</h1>
      </div>

      {/* Filters */}
      <div className="monitoring-filters">
        <div className="filter-group status-filter-group">
          <label>{t('status')} {filteredMissions.length > 0 && `(${filteredMissions.length})`}</label>
          <div className="status-checkboxes">
            {['pending', 'assigned', 'in_progress', 'completed', 'cancelled'].map(status => (
              <label key={status} className="status-checkbox-label">
                <input
                  type="checkbox"
                  checked={statusFilters.includes(status)}
                  onChange={() => toggleStatusFilter(status)}
                />
                <span className="status-checkbox-text">
                  {status === 'in_progress' ? t('inProgress') : status === 'pending' ? t('pending') : status === 'assigned' ? t('assigned') : status === 'completed' ? t('completed') : status === 'cancelled' ? t('cancelled') : status.charAt(0).toUpperCase() + status.slice(1)}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="filter-group">
          <label>{t('deliveryGuy')}</label>
          <select value={deliveryGuyFilter} onChange={(e) => setDeliveryGuyFilter(e.target.value)}>
            <option value="all">{t('all')} {t('deliveryGuy')}s</option>
            <option value="unassigned">{t('unassigned')}</option>
            {deliveryGuys.map(guy => (
              <option key={guy.id} value={guy.id}>
                {guy.name || guy.email || 'Unknown'}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label>{t('dateFrom')}</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>

        <div className="filter-group">
          <label>{t('dateTo')}</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            min={dateFrom || undefined}
          />
        </div>

        <div className="filter-group">
          <label>{t('search')}</label>
          <input
            type="text"
            placeholder={t('search') + '...'}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="filter-group">
          <label>{t('sortBy')}</label>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="newest">{t('newest')} {t('first')}</option>
            <option value="oldest">{t('oldest')} {t('first')}</option>
            <option value="status">{t('byStatus')}</option>
          </select>
        </div>

        <button className="clear-filters-button" onClick={clearFilters}>
          {t('clearFilters')}
        </button>
      </div>

      {/* Missions List */}
      <div className="monitoring-missions">
        {filteredMissions.length === 0 ? (
          <div className="no-missions">
            <p>{t('noMissionsMatchingFilters')}</p>
          </div>
        ) : (
          <div className="missions-table">
            <div className="table-header">
              <div className="table-cell">{t('id')}</div>
              <div className="table-cell">{t('client')}</div>
              <div className="table-cell">{t('phone')}</div>
              <div className="table-cell">{t('deliveryGuy')}</div>
              <div className="table-cell">{t('status')}</div>
              <div className="table-cell">{t('total')}</div>
              <div className="table-cell">{t('created')}</div>
              <div className="table-cell">{t('actions')}</div>
            </div>
            {filteredMissions.map(mission => (
              <div key={mission.id} className="table-row">
                <div className="table-cell" data-label="Mission ID">
                  <span className="mission-id">#{mission.id.slice(0, 8)}</span>
                </div>
                <div className="table-cell" data-label="Client">
                  <span className="mobile-client-name">{mission.clientName || t('nA')}</span>
                </div>
                <div className="table-cell" data-label="Phone">
                  {mission.clientPhone || t('nA')}
                </div>
                <div className="table-cell" data-label="Delivery Guy">
                  <span className="mobile-delivery-guy">
                    {mission.assignedTo ? getDeliveryGuyName(mission.assignedTo) : t('unassigned')}
                  </span>
                </div>
                <div className="table-cell" data-label="Status">
                  <span 
                    className="status-badge" 
                    style={{ backgroundColor: getStatusColor(mission.status) }}
                  >
                    {mission.status || 'pending'}
                  </span>
                </div>
                <div className="table-cell" data-label="Total">
                  <strong>{calculateTotal(mission).toFixed(2)} TND</strong>
                </div>
                <div className="table-cell" data-label="Created">
                  {formatDate(mission.createdAt)}
                </div>
                <div className="table-cell">
                  <div className="action-buttons">
                    {mission.status !== 'completed' && mission.status !== 'cancelled' && (
                      (!mission.assignedTo || mission.assignedTo === null) ? (
                        <button
                          className="assign-button"
                          onClick={() => openAssignModal(mission.id)}
                          disabled={assigningMissionId === mission.id}
                          title={t('assign')}
                        >
                          {assigningMissionId === mission.id ? t('assigning') + '...' : t('assign')}
                        </button>
                      ) : (
                        <button
                          className="reassign-button"
                          onClick={() => openAssignModal(mission.id)}
                          disabled={assigningMissionId === mission.id}
                          title={t('reassign')}
                        >
                          {assigningMissionId === mission.id ? t('reassigning') + '...' : t('reassign')}
                        </button>
                      )
                    )}
                    <button
                      className="view-button"
                      onClick={() => navigate(`/mission/${mission.id}`, { state: { from: 'monitor-missions' } })}
                    >
                      {t('viewDetails')}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Assign Mission Modal */}
      {showAssignModal && (() => {
        const mission = missions.find(m => m.id === assigningMissionId);
        const isReassign = mission?.assignedTo && mission.assignedTo !== null;
        return (
          <div className="modal-overlay" onClick={closeAssignModal}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <h3>{isReassign ? t('reassignMission') : t('assignMission')}</h3>
              <p>{t('selectDeliveryGuyTo')} {isReassign ? t('reassign') : t('assign')} {t('thisMission')}:</p>
            <select
              className="delivery-guy-select"
              value={selectedDeliveryGuyId}
              onChange={(e) => setSelectedDeliveryGuyId(e.target.value)}
            >
              <option value="">-- {t('selectDeliveryGuy')} --</option>
              {deliveryGuys.map(guy => (
                <option key={guy.id} value={guy.id}>
                  {guy.name || guy.email || 'Unknown'}
                </option>
              ))}
            </select>
            <div className="modal-actions">
              <button
                className="modal-button modal-button-cancel"
                onClick={closeAssignModal}
              >
                {t('cancel')}
              </button>
              <button
                className="modal-button modal-button-confirm"
                onClick={handleAssignMission}
                disabled={!selectedDeliveryGuyId || assigningMissionId !== null}
              >
                {assigningMissionId ? (isReassign ? t('reassigning') + '...' : t('assigning') + '...') : (isReassign ? t('reassign') : t('assign'))}
              </button>
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
}

