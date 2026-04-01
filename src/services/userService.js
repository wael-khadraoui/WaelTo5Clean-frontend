import { api } from '../api/http.js';

export class UserService {
  async getUserData(userId) {
    try {
      const { user } = await api('/api/auth/me');
      if (user && String(user.id) === String(userId)) return user;
      return null;
    } catch {
      return null;
    }
  }

  async isAdmin(userId) {
    const userData = await this.getUserData(userId);
    return userData?.role === 'admin';
  }

  async updateUserProfile(userId, profileData) {
    try {
      const me = await this.getUserData(userId);
      if (!me || String(me.id) !== String(userId)) {
        return { success: false, error: 'Not authenticated' };
      }
      await api('/api/auth/me', {
        method: 'PATCH',
        body: JSON.stringify(profileData),
      });
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async getAllUsers() {
    try {
      const { users } = await api('/api/users');
      return users || [];
    } catch {
      return [];
    }
  }

  async updateUserRole(userId, newRole) {
    try {
      await api(`/api/users/${userId}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role: newRole }),
      });
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async getDeliveryGuys() {
    try {
      const { users } = await api('/api/users/delivery-guys');
      return users || [];
    } catch {
      return [];
    }
  }
}
