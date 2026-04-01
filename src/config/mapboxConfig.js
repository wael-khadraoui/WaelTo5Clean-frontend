function env(name) {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    const v = import.meta.env[name] || import.meta.env[`VITE_${name}`];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

const accessToken = env('MAPBOX_ACCESS_TOKEN') || env('VITE_MAPBOX_ACCESS_TOKEN');
const styleURL = env('MAPBOX_STYLE_URL') || env('VITE_MAPBOX_STYLE_URL');

/** Mapbox GL needs a public token (pk.*) in the browser; restrict it in Mapbox Dashboard (URLs, scopes). */
export const mapboxConfig = {
  accessToken,
  styleURL,
  get isConfigured() {
    return Boolean(String(accessToken || '').trim() && String(styleURL || '').trim());
  },
};
