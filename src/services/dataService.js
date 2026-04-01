import { api } from '../api/http.js';

const POLL_MS = 4000;

/** HTTP client for the local REST API (missions, clients, settings, etc.). */
export class DataService {
  subscribeToAllMissions(callback) {
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      try {
        const data = await api('/api/missions');
        callback(data.missions || []);
      } catch {
        callback([]);
      }
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }

  subscribeToMissions(userId, callback) {
    if (!userId) {
      console.error('subscribeToMissions: userId is required');
      return () => {};
    }
    return this.subscribeToAllMissions(callback);
  }

  subscribeToMission(missionId, callback) {
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      try {
        const data = await api(`/api/missions/${missionId}`);
        if (data.mission) callback(data.mission);
      } catch {
        /* ignore */
      }
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }

  subscribeToActiveDeliveryGuys(callback) {
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      try {
        const data = await api('/api/locations/active');
        callback(data.deliveryGuys || []);
      } catch {
        callback([]);
      }
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }

  async getMissions(userId) {
    if (!userId) {
      console.error('getMissions: userId is required');
      return [];
    }
    try {
      const data = await api('/api/missions');
      const list = data.missions || [];
      return list.sort(
        (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
      );
    } catch (e) {
      console.error('Error getting missions:', e);
      return [];
    }
  }

  async getMission(missionId) {
    try {
      const data = await api(`/api/missions/${missionId}`);
      return data.mission || null;
    } catch (e) {
      console.error('Error getting mission:', e);
      return null;
    }
  }

  async updateMissionStatus(missionId, status, additionalData = {}) {
    try {
      await api(`/api/missions/${missionId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status, ...additionalData }),
      });
      return { success: true };
    } catch (e) {
      console.error('Error updating mission:', e);
      return { success: false, error: e.message };
    }
  }

  async updateLocation(userId, location) {
    try {
      await api('/api/locations/me', {
        method: 'POST',
        body: JSON.stringify({
          latitude: location.latitude,
          longitude: location.longitude,
        }),
      });
      return { success: true };
    } catch (e) {
      console.error('Error updating location:', e);
      return { success: false, error: e.message };
    }
  }

  async getDeliveryGuyLocation(userId) {
    try {
      const data = await api(`/api/locations/${userId}`);
      const loc = data.location;
      if (loc?.latitude != null && loc?.longitude != null) {
        return { latitude: loc.latitude, longitude: loc.longitude };
      }
      return null;
    } catch (e) {
      console.error('Error getting delivery guy location:', e);
      return null;
    }
  }

  async getActiveDeliveryGuys() {
    try {
      const data = await api('/api/locations/active');
      return data.deliveryGuys || [];
    } catch (e) {
      console.error('Error getting active delivery guys:', e);
      return [];
    }
  }

  async createMission(missionData) {
    try {
      const data = await api('/api/missions', {
        method: 'POST',
        body: JSON.stringify(missionData),
      });
      return { success: true, missionId: data.missionId || data.mission?.id };
    } catch (e) {
      console.error('Error creating mission:', e);
      return { success: false, error: e.message };
    }
  }

  async getMissionsByClient(clientId) {
    try {
      const all = await this.getAllMissions();
      return all.filter(
        (m) =>
          m.clientId === clientId && m.status === 'completed' && m.completedLocation
      );
    } catch (e) {
      console.error('Error getting missions by client:', e);
      return [];
    }
  }

  async getAllMissions() {
    try {
      const data = await api('/api/missions');
      return data.missions || [];
    } catch (e) {
      console.error('Error getting all missions:', e);
      return [];
    }
  }

  async getMissionsByRestaurant(restaurantId, restaurantName) {
    try {
      const allMissions = await this.getAllMissions();
      return allMissions.filter((mission) => {
        if (!mission.stores || !Array.isArray(mission.stores)) return false;
        return mission.stores.some((store) => {
          if (restaurantId && store.restaurantId) {
            return store.restaurantId === restaurantId;
          }
          if (restaurantName && store.name) {
            return (
              store.name.trim().toLowerCase() === restaurantName.trim().toLowerCase()
            );
          }
          return false;
        });
      });
    } catch (e) {
      console.error('Error getting missions by restaurant:', e);
      return [];
    }
  }

  async assignMission(missionId, deliveryGuyId, allowReassign = false) {
    try {
      await api(`/api/missions/${missionId}/assign`, {
        method: 'POST',
        body: JSON.stringify({ deliveryGuyId, allowReassign }),
      });
      return { success: true };
    } catch (e) {
      console.error('Error assigning mission:', e);
      return { success: false, error: e.message };
    }
  }

  async pickUpMission(missionId, deliveryGuyId) {
    return this.assignMission(missionId, deliveryGuyId, false);
  }

  async deleteMission(missionId) {
    try {
      await api(`/api/missions/${missionId}`, { method: 'DELETE' });
      return { success: true };
    } catch (e) {
      console.error('Error deleting mission:', e);
      return { success: false, error: e.message };
    }
  }

  async saveClient(clientData) {
    try {
      const data = await api('/api/clients', {
        method: 'POST',
        body: JSON.stringify(clientData),
      });
      return {
        success: true,
        clientId: data.clientId,
        isNew: data.isNew,
      };
    } catch (e) {
      console.error('Error saving client:', e);
      return { success: false, error: e.message };
    }
  }

  async searchClients(searchTerm) {
    if (!searchTerm || searchTerm.trim().length < 2) return [];
    try {
      const q = encodeURIComponent(searchTerm.trim());
      const data = await api(`/api/clients?search=${q}`);
      return data.clients || [];
    } catch (e) {
      console.error('Error searching clients:', e);
      return [];
    }
  }

  async getClient(clientId) {
    try {
      const data = await api('/api/clients');
      const list = data.clients || [];
      return list.find((c) => String(c.id) === String(clientId)) || null;
    } catch {
      return null;
    }
  }

  async getAllClients() {
    try {
      const data = await api('/api/clients');
      return data.clients || [];
    } catch (e) {
      console.error('Error getting clients:', e);
      return [];
    }
  }

  async updateClient(clientId, clientData) {
    try {
      await api(`/api/clients/${clientId}`, {
        method: 'PATCH',
        body: JSON.stringify(clientData),
      });
      return { success: true };
    } catch (e) {
      console.error('Error updating client:', e);
      return { success: false, error: e.message };
    }
  }

  async updateClientLocationForAddress(clientId, address, location) {
    try {
      await api(`/api/clients/${clientId}/location`, {
        method: 'PATCH',
        body: JSON.stringify({ address, location }),
      });
      return { success: true };
    } catch (e) {
      console.error('Error updating client location:', e);
      return { success: false, error: e.message };
    }
  }

  async deleteClient(clientId) {
    try {
      await api(`/api/clients/${clientId}`, { method: 'DELETE' });
      return { success: true };
    } catch (e) {
      console.error('Error deleting client:', e);
      return { success: false, error: e.message };
    }
  }

  async saveRestaurant(restaurantData) {
    try {
      const data = await api('/api/restaurants', {
        method: 'POST',
        body: JSON.stringify(restaurantData),
      });
      return { success: true, restaurantId: data.restaurant?.id };
    } catch (e) {
      console.error('Error saving restaurant:', e);
      return { success: false, error: e.message };
    }
  }

  async searchRestaurants(searchTerm) {
    if (!searchTerm || searchTerm.trim().length < 2) return [];
    try {
      const q = encodeURIComponent(searchTerm.trim());
      const data = await api(`/api/restaurants/search?q=${q}`);
      return data.restaurants || [];
    } catch (e) {
      console.error('Error searching restaurants:', e);
      return [];
    }
  }

  async updateRestaurant(restaurantId, restaurantData) {
    try {
      await api(`/api/restaurants/${restaurantId}`, {
        method: 'PATCH',
        body: JSON.stringify(restaurantData),
      });
      return { success: true };
    } catch (e) {
      console.error('Error updating restaurant:', e);
      return { success: false, error: e.message };
    }
  }

  async deleteRestaurant(restaurantId) {
    try {
      await api(`/api/restaurants/${restaurantId}`, { method: 'DELETE' });
      return { success: true };
    } catch (e) {
      console.error('Error deleting restaurant:', e);
      return { success: false, error: e.message };
    }
  }

  async getAllRestaurants() {
    try {
      const data = await api('/api/restaurants');
      return data.restaurants || [];
    } catch (e) {
      console.error('Error getting restaurants:', e);
      return [];
    }
  }

  async getDeliveryFeeRules() {
    try {
      const data = await api('/api/settings/delivery-fees');
      return { success: true, rules: data.rules || [] };
    } catch (e) {
      console.error('Error getting delivery fee rules:', e);
      return { success: false, error: e.message, rules: [] };
    }
  }

  async saveDeliveryFeeRules(rules) {
    try {
      await api('/api/settings/delivery-fees', {
        method: 'PUT',
        body: JSON.stringify({ rules }),
      });
      return { success: true };
    } catch (e) {
      console.error('Error saving delivery fee rules:', e);
      return { success: false, error: e.message };
    }
  }

  async calculateDeliveryFee(distanceKm) {
    try {
      const feeRulesResult = await this.getDeliveryFeeRules();
      if (!feeRulesResult.success || !feeRulesResult.rules || feeRulesResult.rules.length === 0) {
        return 0;
      }
      const rules = feeRulesResult.rules;
      const sortedRules = [...rules].sort(
        (a, b) =>
          (a.maxDistance ?? Number.POSITIVE_INFINITY) -
          (b.maxDistance ?? Number.POSITIVE_INFINITY)
      );
      for (const rule of sortedRules) {
        const minDistance = Number(rule.minDistance) || 0;
        const maxDistance =
          rule.maxDistance == null ? Number.POSITIVE_INFINITY : Number(rule.maxDistance);
        if (distanceKm >= minDistance && distanceKm < maxDistance) {
          return Number(rule.fee) || 0;
        }
      }
      return 0;
    } catch (e) {
      console.error('Error calculating delivery fee:', e);
      return 0;
    }
  }

  async getSystemParameters() {
    try {
      return await api('/api/settings/system-parameters');
    } catch (e) {
      console.error('Error getting system parameters:', e);
      return {
        maxMinutes: 60,
        orangeThreshold: 20,
        redThreshold: 5,
        pointsOnTime: 10,
        pointsLowTime: 20,
        pointsDeducted: 5,
      };
    }
  }

  async saveSystemParameters(parameters) {
    try {
      await api('/api/settings/system-parameters', {
        method: 'PUT',
        body: JSON.stringify(parameters),
      });
      return { success: true };
    } catch (e) {
      console.error('Error saving system parameters:', e);
      return { success: false, error: e.message };
    }
  }

  async updateUserFCMToken(userId, fcmToken) {
    try {
      await api('/api/auth/me', {
        method: 'PATCH',
        body: JSON.stringify({ fcmToken }),
      });
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async getUserFCMToken(userId) {
    try {
      const { user } = await api('/api/auth/me');
      if (user && String(user.id) === String(userId)) return user.fcmToken || null;
      return null;
    } catch {
      return null;
    }
  }
}
