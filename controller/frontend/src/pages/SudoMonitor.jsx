import { useEffect, useState } from 'react'
import api from '../api/client'

const AVATAR_COLORS = ['bg-blue-500','bg-emerald-500','bg-violet-500','bg-orange-500','bg-pink-500']

const STATUS_BADGE = { active: 'badge-active', idle: 'badge-idle', locked: 'badge-locked' }

export default function SudoMonitor() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [result, setResult] = useState(null)

  const fetchUsers = () => {
    setLoading(true)
    api.get('/sudo-monitor/users').then(({ data }) => setUsers(data)).finally(() => setLoading(false))
  }

  useEffect(() => { fetchUsers() }, [])

  const runScan = async () => {
    setScanning(true)
    setResult(null)
    try {
      const { data } = await api.post('/sudo-monitor/scan')
      setResult(data)
      fetchUsers()
    } finally {
      setScanning(false)
    }
  }

  const locked = users.filter(u => u.status === 'locked')
  const active  = users.filter(u => u.status === 'active')

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">Sudo Privilege Monitor</h1>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-success-light text-success border border-success-border">
              <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse block" />
              Sudoers: Intact
            </span>
          </div>
          <p className="text-gray-500 text-sm mt-0.5">Monitor users with elevated privileges</p>
        </div>
        <button onClick={runScan} disabled={scanning} className="btn-primary">
          {scanning ? (
            <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Scanning…</>
          ) : (
            <><span className="material-symbols-outlined text-xl">manage_search</span>Scan Sudoers</>
          )}
        </button>
      </div>

      {result && (
        <div className="card p-4 flex items-center gap-3 border-l-4 border-success">
          <span className="material-symbols-outlined text-success text-xl" style={{fontVariationSettings:"'FILL' 1"}}>check_circle</span>
          <p className="text-gray-700 text-sm">{result.issues_found} privileged users found in {result.duration_seconds}s</p>
        </div>
      )}

      {/* Alerts */}
      {locked.length > 0 && (
        <div className="card p-5 border-l-4 border-danger">
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-danger text-xl" style={{fontVariationSettings:"'FILL' 1"}}>gpp_bad</span>
            <p className="text-gray-800 font-semibold">Escalation Alerts ({locked.length})</p>
          </div>
          <div className="space-y-2">
            {locked.map(u => (
              <div key={u.id} className="flex items-center gap-3 p-3 bg-danger-light rounded-xl border border-danger-border">
                <span className="material-symbols-outlined text-danger text-base">warning</span>
                <div>
                  <p className="text-gray-800 text-sm font-medium">
                    {u.username} — <span className="text-danger">Locked Account</span>
                  </p>
                  <p className="text-gray-500 text-xs">{u.failed_attempts} failed attempts · {u.action}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Users',   value: users.length,  icon: 'group',        color: 'text-gray-900', bg: 'bg-blue-50 text-blue-500' },
          { label: 'Active',        value: active.length, icon: 'check_circle', color: 'text-success',  bg: 'bg-success-light text-success' },
          { label: 'Locked',        value: locked.length, icon: 'lock',         color: locked.length > 0 ? 'text-danger' : 'text-gray-900', bg: locked.length > 0 ? 'bg-danger-light text-danger' : 'bg-gray-50 text-gray-400' },
        ].map(({ label, value, icon, color, bg }) => (
          <div key={label} className="stat-card">
            <div className="flex items-center justify-between">
              <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider">{label}</p>
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${bg}`}>
                <span className="material-symbols-outlined text-lg" style={{fontVariationSettings:"'FILL' 1"}}>{icon}</span>
              </div>
            </div>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50">
          <h3 className="text-gray-800 font-semibold">Privileged Users</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                {['User', 'Groups', 'Last Access', 'Failed Attempts', 'Last Action', 'Status'].map(h => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-12">
                  <span className="w-6 h-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin inline-block" />
                </td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-gray-400 text-sm">
                  No sudo users found. Click "Scan Sudoers" to begin.
                </td></tr>
              ) : users.map((u, i) => (
                <tr key={u.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <div className={`avatar ${AVATAR_COLORS[i % AVATAR_COLORS.length]}`}>
                        {u.username?.slice(0,2).toUpperCase()}
                      </div>
                      <span className="text-gray-800 font-medium">{u.username}</span>
                    </div>
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {(u.groups || '').split(',').filter(Boolean).map(g => (
                        <span key={g} className="px-2 py-0.5 rounded-md bg-gray-100 text-gray-600 text-xs font-medium">{g.trim()}</span>
                      ))}
                    </div>
                  </td>
                  <td className="text-gray-500 text-xs whitespace-nowrap">
                    {u.last_access ? new Date(u.last_access).toLocaleString('id-ID') : '—'}
                  </td>
                  <td>
                    <span className={`font-bold text-sm ${u.failed_attempts > 0 ? 'text-danger' : 'text-success'}`}>
                      {u.failed_attempts}
                    </span>
                  </td>
                  <td className="font-mono text-xs text-gray-500 max-w-xs truncate">{u.action || '—'}</td>
                  <td><span className={STATUS_BADGE[u.status] || 'badge'}>{u.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
