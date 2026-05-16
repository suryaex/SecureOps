import axios from 'axios'

/**
 * Resolve the API base URL.
 *
 * Priority:
 *   1. Build-time:  VITE_API_BASE_URL  (set when building the Android/iOS bundle)
 *   2. Runtime override stored in localStorage (Settings → API server)
 *   3. Capacitor native (Android/iOS): require an explicit URL — abort otherwise
 *   4. Browser: relative '/api' (works with vite proxy AND nginx reverse proxy)
 */
function resolveBaseURL() {
  const envURL     = import.meta.env.VITE_API_BASE_URL
  const overrideURL = (typeof localStorage !== 'undefined')
                      ? localStorage.getItem('so_api_base') : null
  const isCapacitor = typeof window !== 'undefined'
                      && (window.Capacitor?.isNativePlatform?.()
                          || /capacitor:\/\//.test(window.location?.href || ''))

  if (overrideURL) return overrideURL.replace(/\/+$/, '') + '/api'
  if (envURL)      return envURL.replace(/\/+$/, '') + '/api'

  if (isCapacitor) {
    // Native shell with no configured server → return placeholder.
    // The Settings page will prompt the user to set the server URL.
    return null
  }
  return '/api'
}

const baseURL = resolveBaseURL()

const api = axios.create({
  baseURL: baseURL || '/api',
  timeout: 30000,
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  // If we still have no real baseURL on native, fail fast with a clear message
  if (!baseURL) {
    return Promise.reject({
      message: 'No API server configured. Open Settings → Server URL.',
      __noServer: true,
    })
  }
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err?.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      if (typeof window !== 'undefined') window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export const apiBaseURL = baseURL
export const setApiBaseURL = (url) => {
  if (!url) localStorage.removeItem('so_api_base')
  else      localStorage.setItem('so_api_base', url.replace(/\/+$/, ''))
  // Reload to re-init axios instance with the new base URL
  if (typeof window !== 'undefined') window.location.reload()
}

export default api
