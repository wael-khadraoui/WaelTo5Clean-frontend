const STORAGE_KEY = 'to5_auth';

export function getApiBase() {
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL != null) {
    return import.meta.env.VITE_API_URL;
  }
  return '';
}

export function getStoredAuth() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setStoredAuth(token, user) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, user }));
  window.dispatchEvent(new Event('to5-auth-change'));
}

export function clearStoredAuth() {
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event('to5-auth-change'));
}

async function parseJsonResponse(res) {
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const msg =
      (data && typeof data === 'object' && data.error) || res.statusText || 'Request failed';
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export async function api(path, options = {}) {
  const base = getApiBase();
  const url = path.startsWith('http') ? path : `${base}${path}`;
  const auth = getStoredAuth();
  const headers = {
    Accept: 'application/json',
    ...options.headers,
  };
  if (options.body && typeof options.body === 'string' && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  if (auth?.token) {
    headers.Authorization = `Bearer ${auth.token}`;
  }
  const res = await fetch(url, { ...options, headers });
  return parseJsonResponse(res);
}
