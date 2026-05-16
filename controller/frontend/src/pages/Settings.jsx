import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import api, { apiBaseURL, setApiBaseURL } from '../api/client'

export default function Settings() {
  const { user } = useAuth()
  const [health, setHealth] = useState(null)
  const [notif, setNotif] = useState(() => localStorage.getItem('so_notif') !== '0')
  const [autoRefresh, setAutoRefresh] = useState(() => localStorage.getItem('so_autorefresh') !== '0')
  const [saved, setSaved] = useState(false)
  const [serverURL, setServerURL] = useState(() => {
    const raw = localStorage.getItem('so_api_base') || ''
    return raw
  })

  useEffect(() => {
    api.get('/system/health').then(({ data }) => setHealth(data)).catch(() => {})
  }, [])

  const save = () => {
    localStorage.setItem('so_notif', notif ? '1' : '0')
    localStorage.setItem('so_autorefresh', autoRefresh ? '1' : '0')
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500 text-sm mt-0.5">Manage your account & application preferences</p>
      </div>

      <div className="card p-5">
        <h3 className="text-gray-800 font-semibold mb-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">person</span>
          Account
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Username" value={user?.username} />
          <Field label="Role" value={user?.role} />
          <Field label="Authentication" value="Linux PAM" />
          <Field label="Token Expiry" value="8 hours" />
        </div>
        <div className="mt-4 p-3 bg-blue-50 border border-blue-100 rounded-xl text-sm text-blue-700">
          <span className="material-symbols-outlined text-base align-middle mr-1">info</span>
          To change your password, use <code className="font-mono bg-white px-1.5 py-0.5 rounded">passwd</code> command on the Linux server. Authentication is delegated to the OS.
        </div>
      </div>

      <div className="card p-5">
        <h3 className="text-gray-800 font-semibold mb-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">dns</span>
          API Server
        </h3>
        <p className="text-gray-500 text-xs mb-3">
          Required for the mobile app. Set the full URL (e.g. <code className="font-mono bg-gray-100 px-1.5 py-0.5 rounded">https://secureops.polsri.ac.id</code>) — do not include <code className="font-mono bg-gray-100 px-1.5 py-0.5 rounded">/api</code> at the end.
        </p>
        <div className="flex gap-2">
          <input
            type="url"
            value={serverURL}
            onChange={e => setServerURL(e.target.value)}
            placeholder="https://secureops.example.com"
            className="input flex-1"
          />
          <button onClick={() => setApiBaseURL(serverURL.trim())} className="btn-primary shrink-0">
            <span className="material-symbols-outlined text-lg">save</span>Apply & Reload
          </button>
          {serverURL && (
            <button onClick={() => setApiBaseURL('')} className="btn-secondary shrink-0" title="Reset to default">
              <span className="material-symbols-outlined text-lg">restart_alt</span>
            </button>
          )}
        </div>
        <p className="text-gray-400 text-xs mt-2">
          Current effective: <code className="font-mono text-gray-700">{apiBaseURL || '(none — set server URL)'}</code>
        </p>
      </div>

      <div className="card p-5">
        <h3 className="text-gray-800 font-semibold mb-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">tune</span>
          Preferences
        </h3>
        <div className="space-y-3">
          <Toggle label="Enable browser notifications for new alerts" checked={notif} onChange={setNotif} />
          <Toggle label="Auto-refresh dashboards every 5s" checked={autoRefresh} onChange={setAutoRefresh} />
        </div>
        <div className="mt-5 flex items-center gap-3">
          <button onClick={save} className="btn-primary">
            <span className="material-symbols-outlined text-lg">save</span>Save Preferences
          </button>
          {saved && <span className="text-success text-sm flex items-center gap-1">
            <span className="material-symbols-outlined text-base">check_circle</span>Saved
          </span>}
        </div>
      </div>

      {health?.available && (
        <div className="card p-5">
          <h3 className="text-gray-800 font-semibold mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">dns</span>
            Server
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Hostname"   value={health.hostname} />
            <Field label="System"     value={`${health.system} ${health.release}`} />
            <Field label="Platform"   value={health.platform} mono />
            <Field label="Python"     value={health.python_version} mono />
          </div>
        </div>
      )}

      <div className="card p-5">
        <h3 className="text-gray-800 font-semibold mb-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">info</span>
          About
        </h3>
        <div className="space-y-2 text-sm">
          <p className="text-gray-700"><span className="font-semibold">SecureOps</span> v1.1.0</p>
          <p className="text-gray-500">State Polytechnic of Sriwijaya — Security Audit Dashboard</p>
          <p className="text-gray-400 text-xs">FastAPI · React · SQLite · Linux PAM</p>
        </div>
      </div>
    </div>
  )
}

const Field = ({ label, value, mono }) => (
  <div>
    <p className="text-gray-400 text-xs uppercase tracking-wider font-semibold mb-1">{label}</p>
    <p className={`text-gray-800 font-medium ${mono ? 'font-mono text-xs' : 'text-sm'}`}>{value || '—'}</p>
  </div>
)

const Toggle = ({ label, checked, onChange }) => (
  <label className="flex items-center justify-between gap-3 cursor-pointer py-1">
    <span className="text-gray-700 text-sm flex-1">{label}</span>
    <button
      type="button"
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
      style={{
        width: '44px',
        height: '24px',
        minWidth: '44px',
        maxWidth: '44px',
        flexShrink: 0,
        padding: 0,
        border: 'none',
        position: 'relative',
        borderRadius: '9999px',
        backgroundColor: checked ? '#2563EB' : '#E5E7EB',
        transition: 'background-color 0.15s ease',
        cursor: 'pointer',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: '2px',
          left: checked ? '22px' : '2px',
          width: '20px',
          height: '20px',
          borderRadius: '9999px',
          backgroundColor: '#fff',
          boxShadow: '0 1px 3px rgba(0,0,0,.2)',
          transition: 'left 0.15s ease',
        }}
      />
    </button>
  </label>
)
