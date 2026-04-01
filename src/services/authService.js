import { api, setStoredAuth, clearStoredAuth, getStoredAuth } from '../api/http.js';

const listeners = new Set();

function notify(user) {
  listeners.forEach((cb) => {
    try {
      cb(user);
    } catch {
      /* ignore */
    }
  });
}

function toAuthUser(apiUser) {
  if (!apiUser) return null;
  return {
    uid: String(apiUser.id),
    email: apiUser.email || '',
    displayName: apiUser.name || '',
  };
}

export const authService = {
  async signIn(email, password) {
    try {
      const data = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setStoredAuth(data.token, data.user);
      notify(this.getCurrentUser());
      return { success: true, user: toAuthUser(data.user) };
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  async signUp(email, password, userData = {}) {
    try {
      await api('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          email,
          password,
          name: userData.name || email.split('@')[0],
        }),
      });
      return { success: true };
    } catch (e) {
      return {
        success: false,
        error: e.message,
        code: e.status === 403 ? 'REGISTRATION_DISABLED' : undefined,
      };
    }
  },

  async signOut() {
    clearStoredAuth();
    notify(null);
    return { success: true };
  },

  getCurrentUser() {
    const a = getStoredAuth();
    return toAuthUser(a?.user);
  },

  onAuthStateChanged(callback) {
    listeners.add(callback);
    callback(this.getCurrentUser());
    const onStorage = () => callback(this.getCurrentUser());
    window.addEventListener('to5-auth-change', onStorage);
    return () => {
      listeners.delete(callback);
      window.removeEventListener('to5-auth-change', onStorage);
    };
  },
};
