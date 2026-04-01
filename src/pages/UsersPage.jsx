import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { userService, authService } from '../App';
import toast from 'react-hot-toast';
import { useTranslation } from '../hooks/useTranslation';
import './UsersPage.css';

export default function UsersPage() {
  const { t } = useTranslation();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentUserRole, setCurrentUserRole] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    // Load current user role to determine access
    const loadCurrentUserRole = async () => {
      const currentUser = authService.getCurrentUser();
      if (!currentUser) return;
      const data = await userService.getUserData(currentUser.uid);
      setCurrentUserRole(data?.role || 'user');
    };

    loadCurrentUserRole();
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const allUsers = await userService.getAllUsers();
      setUsers(allUsers);
    } catch (error) {
      toast.error(t('failedToLoadUsers'));
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="users-loading">
        <div>{t('loadingUsers')}</div>
      </div>
    );
  }

  if (currentUserRole !== 'admin') {
    return (
      <div className="users-container">
        <div className="users-header">
          <button className="icon-button back-btn" onClick={() => navigate('/')}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
          </button>
          <h1>{t('users')}</h1>
        </div>
        <div className="access-denied">
          <p>{t('accessDenied')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="users-container">
      <div className="users-header">
        <button className="icon-button back-btn" onClick={() => navigate('/')}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
        </button>
        <h1>{t('users')}</h1>
        <div className="users-header-actions">
          <div className="users-stats">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            <span>{users.length}</span>
          </div>
          <button className="icon-button refresh-btn" onClick={loadUsers} title={t('refresh')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
              <path d="M21 3v5h-5"/>
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
              <path d="M8 16H3v5"/>
            </svg>
          </button>
        </div>
      </div>

      <div className="users-content">
        {users.length === 0 ? (
          <div className="empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
            </svg>
            <p>{t('noResults')}</p>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="users-table-container">
              <table className="users-table">
                <thead>
                  <tr>
                    <th>{t('name')}</th>
                    <th>{t('email')}</th>
                    <th>{t('changeRole')}</th>
                    <th>{t('joined')}</th>
                    <th>{t('points')}</th>
                    <th>{t('changeRole')}</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td>{u.name || '—'}</td>
                      <td>{u.email || '—'}</td>
                      <td>
                        <span className={`role-badge role-badge--${u.role || 'user'}`}>
                          {u.role === 'admin' ? t('admin') : u.role === 'delivery_guy' ? t('deliveryGuy') : u.role === 'monitor' ? t('monitor') : t('user')}
                        </span>
                      </td>
                      <td>
                        {u.dateOfJoining
                          ? new Date(u.dateOfJoining).toLocaleDateString()
                          : '—'}
                      </td>
                      <td>{u.points || 0}</td>
                      <td>
                        <select
                          value={u.role || 'user'}
                          onChange={async (e) => {
                            const newRole = e.target.value;
                            if (newRole === u.role) return;
                            const result = await userService.updateUserRole(
                              u.id,
                              newRole
                            );
                            if (result.success) {
                              toast.success(t('roleUpdated'));
                              setUsers((prev) =>
                                prev.map((user) =>
                                  user.id === u.id
                                    ? { ...user, role: newRole }
                                    : user
                                )
                              );
                            } else {
                              toast.error(result.error || t('failedToUpdateRole'));
                            }
                          }}
                          disabled={
                            u.id === authService.getCurrentUser()?.uid ||
                            (u.role === 'admin' && 
                             u.id !== authService.getCurrentUser()?.uid &&
                             currentUserRole === 'admin')
                          }
                          title={
                            u.id === authService.getCurrentUser()?.uid
                              ? t('cannotChangeOwnRole')
                              : u.role === 'admin' && 
                                u.id !== authService.getCurrentUser()?.uid &&
                                currentUserRole === 'admin'
                              ? t('cannotChangeAdminRole')
                              : ''
                          }
                        >
                          <option value="user">{t('user')} ({t('pending')})</option>
                          <option value="delivery_guy">{t('deliveryGuy')}</option>
                          <option value="monitor">{t('monitor')}</option>
                          <option value="admin">{t('admin')}</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="users-cards-container">
              {users.map((u) => (
                <div key={u.id} className="user-card">
                  <div className="user-card-header">
                    <div className="user-info">
                      <div className="user-name">{u.name || t('noName')}</div>
                      <div className="user-email">{u.email || '—'}</div>
                    </div>
                    <span className={`role-badge role-badge--${u.role || 'user'}`}>
                      {u.role === 'admin' ? t('admin') : u.role === 'delivery_guy' ? t('deliveryGuy') : u.role === 'monitor' ? t('monitor') : t('user')}
                    </span>
                  </div>
                  
                  <div className="user-card-details">
                    <div className="user-detail-row">
                      <div className="user-detail-label">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                          <line x1="16" y1="2" x2="16" y2="6"/>
                          <line x1="8" y1="2" x2="8" y2="6"/>
                          <line x1="3" y1="10" x2="21" y2="10"/>
                        </svg>
                        <span>{t('joined')}</span>
                      </div>
                      <div className="user-detail-value">
                        {u.dateOfJoining
                          ? new Date(u.dateOfJoining).toLocaleDateString()
                          : '—'}
                      </div>
                    </div>
                    
                    <div className="user-detail-row">
                      <div className="user-detail-label">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                        </svg>
                        <span>{t('points')}</span>
                      </div>
                      <div className="user-detail-value">{u.points || 0}</div>
                    </div>
                  </div>

                  <div className="user-card-role">
                    <label className="role-select-label">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                        <circle cx="8.5" cy="7" r="4"/>
                        <path d="M20 8v6M23 11h-6"/>
                      </svg>
                      <span>{t('changeRole')}</span>
                    </label>
                    <select
                      value={u.role || 'user'}
                      onChange={async (e) => {
                        const newRole = e.target.value;
                        if (newRole === u.role) return;
                        const result = await userService.updateUserRole(
                          u.id,
                          newRole
                        );
                        if (result.success) {
                          toast.success(t('roleUpdated'));
                          setUsers((prev) =>
                            prev.map((user) =>
                              user.id === u.id
                                ? { ...user, role: newRole }
                                : user
                            )
                          );
                        } else {
                          toast.error(result.error || t('failedToUpdateRole'));
                        }
                      }}
                      disabled={
                        u.id === authService.getCurrentUser()?.uid ||
                        (u.role === 'admin' && 
                         u.id !== authService.getCurrentUser()?.uid &&
                         currentUserRole === 'admin')
                      }
                      title={
                        u.id === authService.getCurrentUser()?.uid
                          ? t('cannotChangeOwnRole')
                          : u.role === 'admin' && 
                            u.id !== authService.getCurrentUser()?.uid &&
                            currentUserRole === 'admin'
                          ? t('cannotChangeAdminRole')
                          : ''
                      }
                    >
                      <option value="user">{t('user')} ({t('pending')})</option>
                      <option value="delivery_guy">{t('deliveryGuy')}</option>
                      <option value="monitor">{t('monitor')}</option>
                      <option value="admin">{t('admin')}</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
